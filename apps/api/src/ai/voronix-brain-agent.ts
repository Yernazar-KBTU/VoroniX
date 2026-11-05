// VoroniX AI answers the chat itself: the CRM sends the client's message to
// POST /v1/reply of VoroniX AI, which reads it, answers, books or cancels
// (the data server turns its bookings into CRM visits) and learns. One AI for
// the whole CRM: what it learns is kept in this database by the data server.
// If it does not answer there is no fallback: VoronixDown stops the chat.
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import type { Conversation } from "../domain/types.js";
import { patchConversation } from "../repositories/conversations.repo.js";
import { bus } from "../realtime/bus.js";
import { requireTenant } from "../tenancy/context.js";
import { dataKey } from "./data-keys.js";
import type { AgentContext, AgentEngine, AgentReply } from "./engine.js";
import { runTool, type ToolCallLog } from "./tools.js";
import { VoronixDown, markVoronix } from "./voronix-ai.js";

export interface BrainReply {
  reply: string;
  lang: string;
  intents: { label: string; score: number }[];
  unsure: boolean;
  actions: { type: string; text: string }[];
  booking: { id: string; service: string; staff: string; start: string } | null;
  cancelled: { id: string } | null;
  handoff: string | null;
  learned: number;
  version: string;
}

export const REPLY_TIMEOUT_MS = 20_000;

export class VoronixBrainAgent implements AgentEngine {
  readonly name = "voronix-ai";

  async reply(conv: Conversation, ctx: AgentContext): Promise<AgentReply> {
    const t = requireTenant();
    const last = Math.max(conv.messages.map((m) => m.from).lastIndexOf("ai"), conv.messages.map((m) => m.from).lastIndexOf("admin"));
    const text = conv.messages
      .slice(last + 1)
      .filter((m) => m.from === "client")
      .map((m) => m.text)
      .join("\n")
      .trim();
    if (!text) return { text: "", toolCalls: [] };
    const body = {
      business: t.id,
      dataKey: await dataKey(t),
      text: (/^\/start\b/.test(text) ? "Здравствуйте" : text).slice(0, 1000),
      client: { id: `c-${conv.external_user_id}`, name: conv.contact ?? "", channel: conv.messenger, handle: conv.external_user_id },
    };
    let r: BrainReply;
    try {
      const res = await fetch(`${config.VORONIX_AI_URL!.replace(/\/+$/, "")}/v1/reply`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(config.VORONIX_AI_KEY ? { authorization: `Bearer ${config.VORONIX_AI_KEY}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(REPLY_TIMEOUT_MS)]),
      });
      if (!res.ok) throw new Error(res.status === 401 ? "the key is wrong (401)" : `it answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
      r = (await res.json()) as BrainReply;
      markVoronix(null);
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      const why = (e as Error).name === "TimeoutError" ? `no answer in ${REPLY_TIMEOUT_MS / 1000} s` : (e as Error).message.replace(/^fetch failed$/, "it cannot be reached");
      markVoronix(why);
      throw new VoronixDown(why);
    }

    const calls: ToolCallLog[] = [];
    const note = (name: string, input: unknown) => calls.push({ name, input, ok: true });
    // The data server made the client card and the visit: show them on this chat.
    if (r.booking || !conv.client_id) {
      const cl = (await pool.query<{ client_id: string }>(`SELECT client_id FROM client_channels WHERE messenger = $1 AND external_user_id = $2`, [conv.messenger, conv.external_user_id])).rows[0];
      const ap = r.booking ? (await pool.query<{ crm_appointment_id: string | null }>(`SELECT crm_appointment_id FROM ai_bookings WHERE id = $1`, [r.booking.id]).catch(() => ({ rows: [] }))).rows[0] : undefined;
      const patch: Partial<Conversation> = {};
      if (cl && cl.client_id !== conv.client_id) patch.client_id = cl.client_id;
      if (ap?.crm_appointment_id) patch.appointment_id = ap.crm_appointment_id;
      if (Object.keys(patch).length) {
        await patchConversation(pool, conv.id, patch);
        bus.changed("conversations");
      }
    }
    if (r.booking) note("create_appointment", { service_code: r.booking.service, master_id: r.booking.staff, start_datetime: r.booking.start.replace("T", " ") });
    if (r.cancelled) note("cancel_or_move_appointment", { booking: r.cancelled.id, action: "cancel" });
    if (r.booking || r.cancelled) bus.changed("appointments");
    if (r.handoff) {
      const { log } = await runTool("handoff_to_human", { reason: r.handoff }, { conversationId: conv.id, progress: ctx.progress });
      calls.push(log);
    }
    const top = r.intents.map((i) => `${i.label} ${Math.round(i.score * 100)}%`).join(", ") || "nothing sure";
    note("voronix_ai", { understood: top, lang: r.lang, unsure: r.unsure, learned: r.learned, version: r.version, actions: r.actions.map((a) => a.text) });
    return { text: r.reply, toolCalls: calls };
  }
}
