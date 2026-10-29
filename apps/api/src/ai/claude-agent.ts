import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import type { Conversation } from "../domain/types.js";
import { money } from "../domain/pricing.js";
import { getPayment } from "../repositories/payments.repo.js";
import { loadSnapshot, systemPrompt } from "./context.js";
import type { AgentContext, AgentEngine, AgentReply } from "./engine.js";
import { TOOL_SPECS, runTool, type ToolCallLog } from "./tools.js";

type Msg = Anthropic.Beta.Messages.BetaMessageParam;

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Turns the stored chat into Messages API turns. Client and CRM notes are
 * "user" turns, AI and human admin replies are "assistant" turns.
 * Consecutive turns of the same role are merged, and the list always ends
 * with a user turn.
 */
export async function toTurns(conv: Conversation): Promise<Msg[]> {
  const raw: { role: "user" | "assistant"; text: string }[] = [];
  for (const m of conv.messages) {
    if (m.from === "client") raw.push({ role: "user", text: `Client: ${m.text}` });
    else if (m.from === "ai") raw.push({ role: "assistant", text: m.text });
    else if (m.from === "admin") raw.push({ role: "assistant", text: `[Human administrator wrote]: ${m.text}` });
    else if (m.from === "system") raw.push({ role: "user", text: `[CRM note]: ${m.text}` });
    else if (m.from === "pay" && m.payment_id) {
      const p = await getPayment(pool, m.payment_id);
      raw.push({ role: "assistant", text: `[Payment button sent: ${p ? money(p.amount_kzt) : ""}, status ${p?.status ?? "?"}]` });
    }
  }
  const out: Msg[] = [];
  for (const r of raw) {
    const last = out[out.length - 1];
    if (last && last.role === r.role) last.content = `${last.content as string}\n\n${r.text}`;
    else out.push({ role: r.role, content: r.text });
  }
  if (!out.length || out[0].role !== "user") out.unshift({ role: "user", content: "[CRM note]: a client opened the chat." });
  if (out[out.length - 1].role !== "user") out.push({ role: "user", content: "[CRM note]: continue the conversation if a reply is needed." });
  return out;
}

/** Claude with CRM tools, using a manual tool loop over the Messages API. */
export class ClaudeAgent implements AgentEngine {
  readonly name: string;
  private client: Pick<Anthropic, "beta">;

  constructor(opts: { client?: Pick<Anthropic, "beta">; model?: string } = {}) {
    this.client = opts.client ?? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 });
    this.name = `claude:${opts.model ?? config.AI_MODEL}`;
  }

  async reply(conv: Conversation, ctx: AgentContext): Promise<AgentReply> {
    const snapshot = await loadSnapshot(pool);
    const system = await systemPrompt(pool, snapshot, conv);
    const messages = await toTurns(conv);
    const toolCalls: ToolCallLog[] = [];
    const usage = { input_tokens: 0, output_tokens: 0 };
    const tools = TOOL_SPECS.map((t) => ({ ...t, strict: true }));

    for (let round = 0; round < config.AI_MAX_TOOL_ROUNDS; round++) {
      ctx.progress(round === 0 ? "Thinking…" : "Writing…");
      const res = await this.client.beta.messages.create(
        {
          model: this.name.slice("claude:".length),
          max_tokens: 16_000,
          system,
          messages,
          tools,
          output_config: { effort: config.AI_EFFORT },
          betas: [FALLBACK_BETA],
          fallbacks: "default",
        },
        { signal: ctx.signal },
      );
      usage.input_tokens += res.usage.input_tokens;
      usage.output_tokens += res.usage.output_tokens;
      const text = res.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

      if (res.stop_reason === "refusal") {
        return { text: "", toolCalls: [...toolCalls, { name: "refusal", input: res.stop_details ?? null, ok: false }], usage };
      }
      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      if (res.stop_reason !== "tool_use") return { text, toolCalls, usage };

      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        const { result, log } = await runTool(block.name, block.input, { conversationId: conv.id, progress: ctx.progress });
        toolCalls.push(log);
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result), is_error: !log.ok });
      }
      messages.push({ role: "user", content: results });
    }
    throw new Error(`AI did not finish within ${config.AI_MAX_TOOL_ROUNDS} tool rounds`);
  }
}
