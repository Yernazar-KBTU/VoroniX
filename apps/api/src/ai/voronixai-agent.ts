import { config } from "../config.js";
import { pool } from "../db/pool.js";
import type { Conversation } from "../domain/types.js";
import { currentTenant } from "../tenancy/context.js";
import { toTurns } from "./claude-agent.js";
import { loadSnapshot, systemPrompt } from "./context.js";
import type { AgentContext, AgentEngine, AgentReply } from "./engine.js";
import { TOOL_SPECS, runTool, type ToolCallLog } from "./tools.js";

/** VoroniX.ai did not answer: like our own VoroniX AI, there is no silent fallback, a person takes the chat. */
export class VoronixAiDown extends Error {
  constructor(reason: string) {
    super(`VoroniX.ai is down: ${reason}`);
    this.name = "VoronixAiDown";
  }
}

type Event =
  | { status: "tool"; turnId: string; call: { id: string; name: string; input: unknown } }
  | { status: "done"; turnId: string; outcome: string; text: string; model: string | null; usage: { input_tokens: number; output_tokens: number } }
  | { status: "failed"; turnId: string; error: string };

/** Whether VoroniX.ai is set up on this server (address and shared key). */
export const voronixAiAvailable = (): boolean => !!config.VORONIXAI_URL && !!config.VORONIXAI_KEY;

/**
 * VoroniX.ai (github.com/Yernazar-KBTU/VoroniX.ai), the third engine next to
 * VoroniX AI and Claude. It gets this business's prompt, the chat and the CRM
 * tool schemas, runs its own layers (injection guard, PII placeholders, model
 * router, traces) and asks the CRM to run each tool here, so bookings land in
 * this CRM's real calendar.
 */
export class VoronixAiAgent implements AgentEngine {
  readonly name = "voronixai";

  private async call(path: string, body: unknown, signal: AbortSignal): Promise<Event> {
    let res: Response;
    try {
      res = await fetch(`${config.VORONIXAI_URL}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.VORONIXAI_KEY ?? ""}` },
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(config.VORONIXAI_TIMEOUT_MS)]),
      });
    } catch (err) {
      if (signal.aborted) throw err;
      throw new VoronixAiDown((err as Error).message);
    }
    if (!res.ok) throw new VoronixAiDown(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as Event;
  }

  async reply(conv: Conversation, ctx: AgentContext): Promise<AgentReply> {
    if (!voronixAiAvailable()) throw new VoronixAiDown("VORONIXAI_URL and VORONIXAI_KEY are not set");
    const snapshot = await loadSnapshot(pool);
    const system = await systemPrompt(pool, snapshot, conv);
    const messages = (await toTurns(conv)).map((m) => ({ role: m.role, content: m.content as string }));
    const toolCalls: ToolCallLog[] = [];
    ctx.progress("Thinking…");
    let event = await this.call(
      "/v1/crm/turns",
      { conversationId: `${currentTenant()?.id ?? "-"}:${conv.id}`, system, messages, tools: TOOL_SPECS },
      ctx.signal,
    );
    for (let i = 0; event.status === "tool" && i < config.AI_MAX_TOOL_ROUNDS * 4; i++) {
      const { result, log } = await runTool(event.call.name, event.call.input, { conversationId: conv.id, progress: ctx.progress });
      toolCalls.push(log);
      ctx.progress("Writing…");
      event = await this.call(
        "/v1/crm/turns/result",
        { turnId: event.turnId, callId: event.call.id, content: JSON.stringify(result), isError: !log.ok },
        ctx.signal,
      );
    }
    if (event.status === "failed") throw new VoronixAiDown(event.error);
    if (event.status !== "done") throw new Error("VoroniX.ai asked for too many tools in one answer");
    if (event.outcome === "refused") return { text: "", toolCalls: [...toolCalls, { name: "refusal", input: null, ok: false }], usage: event.usage };
    return { text: event.text, toolCalls, usage: event.usage };
  }
}
