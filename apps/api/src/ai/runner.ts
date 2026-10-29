import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { logger } from "../lib/logger.js";
import { bus } from "../realtime/bus.js";
import { patchConversation } from "../repositories/conversations.repo.js";
import { getOrThrow, pushMessage } from "../services/conversation.service.js";
import { ClaudeAgent } from "./claude-agent.js";
import type { AgentEngine } from "./engine.js";
import { OfflineAgent } from "./offline-agent.js";

export function createEngine(): AgentEngine {
  const useClaude = config.AI_ENGINE === "claude" || (config.AI_ENGINE === "auto" && !!config.ANTHROPIC_API_KEY);
  return useClaude ? new ClaudeAgent() : new OfflineAgent();
}

let engine: AgentEngine = createEngine();
export const getEngine = () => engine;
/** Picks the engine again, after the Claude key was connected or removed. */
export const resetEngine = () => {
  engine = createEngine();
};
/** Tests swap in a fake or a specific engine. */
export const setEngine = (e: AgentEngine) => {
  engine = e;
};

const running = new Map<string, AbortController>();
const again = new Set<string>();
const status = new Map<string, string>();

export const aiStatus = (convId: string) => status.get(convId) ?? null;

function setStatus(convId: string, s: string | null) {
  if (s) status.set(convId, s);
  else status.delete(convId);
  bus.publish({ type: "ai", conversation_id: convId, status: s });
}

/**
 * Asks the AI to answer one chat. One run per chat at a time: a message that
 * arrives during a run queues exactly one more run, so two quick client
 * messages still get an answer to both.
 */
export async function replyTo(convId: string): Promise<void> {
  if (running.has(convId)) {
    again.add(convId);
    return;
  }
  const ctl = new AbortController();
  running.set(convId, ctl);
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
      again.delete(convId);
    } else {
      outcome = "error";
      error = e.message;
      logger.error({ err: e, convId }, "AI reply failed");
      await pushMessage(convId, { from: "system", text: `AI could not answer: ${e.message}` }).catch(() => {});
    }
  } finally {
    const latency = Math.round(performance.now() - started);
    running.delete(convId);
    setStatus(convId, null);
    await pool
      .query(
        `INSERT INTO ai_runs (conversation_id, engine, latency_ms, tool_calls, input_tokens, output_tokens, outcome, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [convId, engine.name, latency, JSON.stringify(toolCalls), usage?.input_tokens ?? null, usage?.output_tokens ?? null, outcome, error],
      )
      .catch((e) => logger.warn({ err: e }, "could not log ai run"));
    if (again.has(convId)) {
      again.delete(convId);
      const c = await getOrThrow(convId).catch(() => null);
      if (c?.ai_enabled) void replyTo(convId);
    }
  }
}

export function stop(convId: string): boolean {
  const ctl = running.get(convId);
  if (!ctl) return false;
  again.delete(convId);
  ctl.abort();
  return true;
}

/** Resolves when no AI run is in progress. Used by tests and graceful shutdown. */
export async function idle(timeoutMs = 15_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while ((running.size || again.size) && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
}
