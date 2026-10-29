import { randomBytes } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { badRequest, notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { bus, type BusEvent } from "../realtime/bus.js";
import { deleteIntegration, getIntegration, listIntegrations, saveIntegration, type IntegrationRow } from "../repositories/integrations.repo.js";
import { resetEngine } from "../ai/runner.js";
import { startTelegram } from "../channels/telegram.js";
import { PROVIDERS, type Provider } from "./catalog.js";

/**
 * Connections to outside services. Each provider has its own check: Telegram
 * and Claude validate the token against the real API and start working at
 * once; WhatsApp and Instagram get an inbound webhook with its own secret;
 * Google Calendar gets a private iCal feed; the outgoing webhook posts CRM
 * events to any URL (Make, Zapier, n8n, 1C).
 */

type Check = { ok: boolean; detail: string };

/** Network calls, swapped out in tests. */
export const deps = {
  async checkTelegram(token: string): Promise<Check> {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!r) return { ok: false, detail: "Could not reach api.telegram.org. Check the server's internet access." };
    const body = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: { username?: string }; description?: string };
    return body.ok ? { ok: true, detail: `Bot @${body.result?.username} is answering clients` } : { ok: false, detail: body.description ?? `Telegram answered ${r.status}` };
  },
  async checkClaude(key: string): Promise<Check> {
    try {
      await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 10_000 }).models.list({ limit: 1 });
      return { ok: true, detail: `Claude (${config.AI_MODEL}) writes the replies` };
    } catch (e) {
      return { ok: false, detail: e instanceof Anthropic.AuthenticationError ? "The API key was not accepted" : (e as Error).message.slice(0, 200) };
    }
  },
  async post(url: string, body: unknown, secret: string): Promise<Check> {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-voronix-secret": secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok ? { ok: true, detail: `Delivered, ${url} answered ${r.status}` } : { ok: false, detail: `${url} answered ${r.status}` };
  },
  startTelegram,
};

let telegram: { stop: () => Promise<void> } | null = null;
const envClaudeKey = config.ANTHROPIC_API_KEY;

async function setTelegram(token: string | null) {
  await telegram?.stop().catch(() => {});
  telegram = token ? deps.startTelegram(token) : null;
}

function setClaudeKey(key: string | undefined) {
  config.ANTHROPIC_API_KEY = key;
  resetEngine();
}

const newSecret = () => randomBytes(18).toString("base64url");
const mask = (s: string | null) => (s ? `••••${s.slice(-4)}` : "");

export interface IntegrationView extends Provider {
  enabled: boolean;
  status: "off" | "connected" | "error";
  status_detail: string;
  settings: Record<string, string>;
  secret_hint: string;
  /** Secrets we generated for the other side to send back (webhook header, calendar token). Tokens the owner typed in are never shown. */
  shared_secret: string;
  checked_at: string | null;
  /** Connected through an environment variable, not from this page. */
  from_env: boolean;
}

/** Every provider with its state. Secrets are never returned in full. */
export async function listView(): Promise<IntegrationView[]> {
  const rows = new Map((await listIntegrations(pool)).map((r) => [r.provider, r]));
  return PROVIDERS.map((p) => {
    const r = rows.get(p.id);
    const env = !r && ((p.id === "telegram" && !!config.TELEGRAM_BOT_TOKEN) || (p.id === "claude" && !!config.ANTHROPIC_API_KEY));
    return {
      ...p,
      enabled: r?.enabled ?? env,
      status: r?.status ?? (env ? "connected" : "off"),
      status_detail: r?.status_detail ?? (env ? "Connected through the server environment" : ""),
      settings: r?.settings ?? {},
      secret_hint: mask(r?.secret ?? null),
      shared_secret: r?.enabled && !p.fields.some((f) => f.secret) ? (r.secret ?? "") : "",
      checked_at: r?.checked_at ?? null,
      from_env: env,
    };
  });
}

const view = async (id: string) => (await listView()).find((v) => v.id === id)!;

function provider(id: string): Provider {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw notFound("Integration");
  return p;
}

/** Saves the fields from the card, checks them and switches the service on. */
export async function connect(id: string, input: { secret?: string; settings?: Record<string, string> }): Promise<IntegrationView> {
  const p = provider(id);
  const old = await getIntegration(pool, id);
  const settings: Record<string, string> = {};
  for (const f of p.fields.filter((f) => !f.secret)) {
    const v = (input.settings?.[f.key] ?? old?.settings[f.key] ?? "").trim();
    if (f.required && !v) throw badRequest(`${f.label} is required`);
    if (v) settings[f.key] = v.slice(0, 300);
  }
  const secretField = p.fields.find((f) => f.secret);
  const secret = input.secret?.trim() || old?.secret || (secretField ? null : newSecret());
  if (secretField?.required && !secret) throw badRequest(`${secretField.label} is required`);

  const check = await run(p, settings, secret);
  await saveIntegration(pool, { provider: id, enabled: check.ok, settings, secret, status: check.ok ? "connected" : "error", status_detail: check.detail });
  if (id === "telegram") await setTelegram(check.ok ? secret : (config.TELEGRAM_BOT_TOKEN ?? null));
  if (id === "claude") setClaudeKey(check.ok ? secret! : envClaudeKey);
  logger.info({ provider: id, ok: check.ok }, "integration connected");
  return view(id);
}

/** Runs the provider's check again with the saved settings. */
export async function test(id: string): Promise<IntegrationView> {
  const p = provider(id);
  const row = await getIntegration(pool, id);
  if (!row) throw badRequest("Connect the service first");
  const check = await run(p, row.settings, row.secret);
  await saveIntegration(pool, { ...row, status: check.ok ? "connected" : "error", status_detail: check.detail });
  return view(id);
}

export async function disconnect(id: string): Promise<IntegrationView> {
  provider(id);
  await deleteIntegration(pool, id);
  if (id === "telegram") await setTelegram(config.TELEGRAM_BOT_TOKEN ?? null);
  if (id === "claude") setClaudeKey(envClaudeKey);
  return view(id);
}

async function run(p: Provider, settings: Record<string, string>, secret: string | null): Promise<Check> {
  try {
    switch (p.id) {
      case "telegram":
        return await deps.checkTelegram(secret!);
      case "claude":
        return await deps.checkClaude(secret!);
      case "whatsapp":
      case "instagram":
        return { ok: true, detail: `Waiting for messages at /api/channels/${p.id}/inbound` };
      case "google_calendar":
        return { ok: true, detail: "Calendar feed is ready. Add it in Google Calendar by URL." };
      case "kaspi":
        return { ok: true, detail: "Saved. Payment buttons stay in test mode until the Kaspi Pay contract is active." };
      case "webhook":
        if (!/^https?:\/\//.test(settings.url ?? "")) return { ok: false, detail: "The URL must start with https://" };
        return await deps.post(settings.url, { event: "test", at: new Date().toISOString(), data: { message: "VoroniX webhook works" } }, secret!);
    }
    return { ok: false, detail: "Unknown provider" };
  } catch (e) {
    return { ok: false, detail: (e as Error).message.slice(0, 200) };
  }
}


/** Secret the inbound webhook of a messenger expects in x-channel-secret, if it was connected here. */
export async function channelSecret(messenger: string): Promise<string | null> {
  const row = await getIntegration(pool, messenger.toLowerCase());
  return row?.enabled ? row.secret : null;
}

/** Feed token for the calendar URL. */
export async function calendarToken(): Promise<string | null> {
  const row = await getIntegration(pool, "google_calendar");
  return row?.enabled ? row.secret : null;
}

/** Starts what was connected before the restart and forwards CRM events to the outgoing webhook. */
export async function bootIntegrations(): Promise<void> {
  const rows = await listIntegrations(pool).catch(() => [] as IntegrationRow[]);
  const tg = rows.find((r) => r.provider === "telegram" && r.enabled);
  const tgToken = tg?.secret ?? config.TELEGRAM_BOT_TOKEN ?? null;
  if (tgToken) await setTelegram(tgToken);
  const cl = rows.find((r) => r.provider === "claude" && r.enabled);
  if (cl?.secret) setClaudeKey(cl.secret);
  bus.on("event", forwardDomainEvent);
}

export async function stopIntegrations(): Promise<void> {
  bus.off("event", forwardDomainEvent);
  await setTelegram(null);
}

async function forwardDomainEvent(e: BusEvent) {
  if (e.type !== "domain") return;
  const row = await getIntegration(pool, "webhook").catch(() => null);
  if (!row?.enabled || !row.settings.url) return;
  const wanted = (row.settings.events ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (wanted.length && !wanted.includes(e.name)) return;
  deps.post(row.settings.url, { event: e.name, at: new Date().toISOString(), data: e.data }, row.secret ?? "").catch((err) => logger.warn({ err }, "webhook delivery failed"));
}
