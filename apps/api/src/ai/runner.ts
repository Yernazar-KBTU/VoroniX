import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { logger } from "../lib/logger.js";
import { bus } from "../realtime/bus.js";
import { patchConversation } from "../repositories/conversations.repo.js";
import { currentTenant } from "../tenancy/context.js";
import { getOrThrow, pushMessage } from "../services/conversation.service.js";
import { ClaudeAgent } from "./claude-agent.js";
import type { AgentEngine } from "./engine.js";
import { OfflineAgent } from "./offline-agent.js";
import { VoronixDown } from "./voronix-ai.js";

export function createEngine(apiKey = config.ANTHROPIC_API_KEY): AgentEngine {
  const useClaude = config.AI_ENGINE === "claude" || (config.AI_ENGINE === "auto" && !!apiKey);
  return useClaude ? new ClaudeAgent({ apiKey }) : new OfflineAgent();
}

/** Engine on the platform's own key, used by every business that did not connect its own Claude key. */
let platform: AgentEngine = createEngine();
/** Businesses that connected their own Anthropic key on the Integrations page. */
const ownKey = new Map<string, AgentEngine>();
const ownKeyText = new Map<string, string>();
let override: AgentEngine | null = null;

/** The engine that answers for the business of the current request. */
export const getEngine = (): AgentEngine => override ?? ownKey.get(currentTenant()?.id ?? "") ?? platform;
/** Uses this business's own Claude key, or the platform engine again when key is null. */
export function setBusinessKey(tenantId: string, key: string | null): void {
  if (key) {
    ownKey.set(tenantId, createEngine(key));
    ownKeyText.set(tenantId, key);
  } else {
    ownKey.delete(tenantId);
    ownKeyText.delete(tenantId);
  }
}
/** Anthropic key for one-off calls (Ask, Teach) of the current business. */
export const claudeKey = (): string | undefined => ownKeyText.get(currentTenant()?.id ?? "") ?? config.ANTHROPIC_API_KEY;
/** Picks the platform engine again, after the environment changed. */
export const resetEngine = () => {
  platform = createEngine();
};
/** Tests swap in a fake or a specific engine for every business. */
export const setEngine = (e: AgentEngine | null) => {
  override = e;
};

// Conversation ids like CV-0001 repeat in every business, so runs are keyed by business and chat.
const running = new Map<string, AbortController>();
const again = new Set<string>();
const status = new Map<string, string>();
const keyOf = (convId: string) => `${currentTenant()?.id ?? "-"}:${convId}`;

export const aiStatus = (convId: string) => status.get(keyOf(convId)) ?? null;

function setStatus(convId: string, s: string | null) {
  if (s) status.set(keyOf(convId), s);
  else status.delete(keyOf(convId));
  bus.publish({ type: "ai", conversation_id: convId, status: s });
}

/**
 * Asks the AI to answer one chat. One run per chat at a time: a message that
 * arrives during a run queues exactly one more run, so two quick client
 * messages still get an answer to both.
 */
export async function replyTo(convId: string): Promise<void> {
  const key = keyOf(convId);
  if (running.has(key)) {
    again.add(key);
    return;
  }
  const engine = getEngine();
  const ctl = new AbortController();
  running.set(key, ctl);
  setStatus(convId, "Thinking…");
  const started = performance.now();
  let outcome: "replied" | "handoff" | "error" | "cancelled" = "replied";
  let error: string | null = null;
  let toolCalls: unknown[] = [];
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  try {
    const conv = await getOrThrow(convId);
    const res = await engine.reply(conv, { signal: ctl.signal, progress: (s) => setStatus(convId, s) });
    toolCalls = res.toolCalls;
    usage = res.usage;
    if (ctl.signal.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    if (res.text) await pushMessage(convId, { from: "ai", text: res.text });
    if (res.toolCalls.some((t) => t.name === "handoff_to_human" && t.ok)) outcome = "handoff";
    const after = await getOrThrow(convId);
    if (after.stage === "New") {
      await patchConversation(pool, convId, { stage: "In dialog" });
      bus.changed("conversations");
    }
  } catch (err) {
    const e = err as Error;
    if (e.name === "AbortError" || ctl.signal.aborted) {
      outcome = "cancelled";
      again.delete(key);
    } else {
      outcome = "error";
      error = e.message;
      logger.error({ err: e, convId }, "AI reply failed");
      await pushMessage(convId, { from: "system", text: `AI could not answer: ${e.message}` }).catch(() => {});
      // Our AI is down: no automatic answer, a person takes the chat and sees why.
      if (e instanceof VoronixDown) {
        await patchConversation(pool, convId, { needs_human: true }).catch(() => {});
        bus.changed("conversations");
      }
    }
  } finally {
    const latency = Math.round(performance.now() - started);
    running.delete(key);
    setStatus(convId, null);
    await pool
      .query(
        `INSERT INTO ai_runs (conversation_id, engine, latency_ms, tool_calls, input_tokens, output_tokens, outcome, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [convId, engine.name, latency, JSON.stringify(toolCalls), usage?.input_tokens ?? null, usage?.output_tokens ?? null, outcome, error],
      )
      .catch((e) => logger.warn({ err: e }, "could not log ai run"));
    if (again.has(key)) {
      again.delete(key);
      const c = await getOrThrow(convId).catch(() => null);
      if (c?.ai_enabled) void replyTo(convId);
    }
  }
}

export function stop(convId: string): boolean {
  const ctl = running.get(keyOf(convId));
  if (!ctl) return false;
  again.delete(keyOf(convId));
  ctl.abort();
  return true;
}

/** Resolves when no AI run is in progress. Used by tests and graceful shutdown. */
export async function idle(timeoutMs = 15_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while ((running.size || again.size) && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
}
