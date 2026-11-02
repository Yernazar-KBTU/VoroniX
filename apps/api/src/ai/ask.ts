import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { catalogText, knowledgeText, loadSnapshot, type CrmSnapshot } from "./context.js";
import { claudeKey, getEngine } from "./runner.js";

/**
 * "Test the AI" on the knowledge base page: one question, answered only from
 * the services table and the knowledge base.
 */
export async function askKnowledge(question: string): Promise<{ answer: string; engine: string; source?: string }> {
  const snap = await loadSnapshot(pool);
  if (getEngine().name.startsWith("claude")) {
    const client = new Anthropic({ apiKey: claudeKey() });
    const res = await client.beta.messages.create({
      model: config.AI_MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: `You are the AI administrator of ${snap.biz.name}. Answer the client question using ONLY the data below. If the answer is not in the data, say you would hand it to the administrator. Reply in the client's language, 1-4 sentences, no markdown.\n\nSERVICES:\n${catalogText(snap)}\n\nKNOWLEDGE BASE:\n${knowledgeText(snap)}`,
      messages: [{ role: "user", content: question }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return { answer: text || "(no answer)", engine: getEngine().name };
  }
  return offlineAnswer(question, snap);
}

/** Offline mode: returns the knowledge entry that shares the most words with the question. */
export function offlineAnswer(question: string, snap: CrmSnapshot): { answer: string; engine: string; source?: string } {
  const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\d]{4,}/gu)?.map((w) => w.slice(0, 5)) ?? []);
  const q = words(question);
  let best: { title: string; content: string; score: number } | null = null;
  for (const k of snap.knowledge) {
    const kw = words(`${k.title} ${k.content}`);
    let score = 0;
    for (const w of q) if (kw.has(w)) score++;
    if (score > 0 && (!best || score > best.score)) best = { title: k.title, content: k.content, score };
  }
  if (!best) return { answer: "В базе знаний нет ответа на этот вопрос. Я бы передала его администратору.", engine: "offline-rules" };
  return { answer: best.content, engine: "offline-rules", source: best.title };
}
