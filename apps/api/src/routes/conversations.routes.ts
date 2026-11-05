import { randomInt } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { channelSecret } from "../integrations/manager.js";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { MESSENGERS, type Messenger } from "../domain/types.js";
import { HttpError, notFound } from "../lib/errors.js";
import { bus } from "../realtime/bus.js";
import * as convs from "../repositories/conversations.repo.js";
import { getSettings } from "../repositories/settings.repo.js";
import { aiStatus, replyTo, stop } from "../ai/runner.js";
import { getOrThrow, pushMessage, receiveInbound } from "../services/conversation.service.js";
import { ConversationCreate, ConversationPatchBody, InboundBody, MessageBody } from "./schemas.js";
import { currentTenant, withTenant } from "../tenancy/context.js";
import { findTenant } from "../tenancy/tenants.js";
import { safeEqual } from "../lib/safe-equal.js";

export const conversationsRouter = Router();

conversationsRouter.get("/conversations", async (_req, res) => {
  res.json(await convs.listConversations(pool));
});

conversationsRouter.get("/conversations/:id", async (req, res) => {
  const c = await getOrThrow(req.params.id);
  res.json({ ...c, ai_status: aiStatus(c.id) });
});

/** Starts a simulated chat from the admin UI (the real ones come from /channels/*). */
conversationsRouter.post("/conversations", async (req, res) => {
  const body = ConversationCreate.parse(req.body);
  const ext = `${body.messenger.slice(0, 2).toLowerCase()}_${randomInt(10_000, 99_999)}`;
  const name = body.contact || `guest_${randomInt(1000, 9999)}`;
  if (!body.text) {
    const biz = await getSettings(pool);
    const id = await convs.createConversation(pool, { messenger: body.messenger, external_user_id: ext, contact: name, ai_enabled: biz.autopilot });
    bus.changed("conversations");
    res.status(201).json(await getOrThrow(id));
    return;
  }
  const { conversation } = await receiveInbound({ messenger: body.messenger, external_user_id: ext, name, text: body.text });
  res.status(201).json(conversation);
  if (conversation.ai_enabled) void replyTo(conversation.id);
});

conversationsRouter.patch("/conversations/:id", async (req, res) => {
  const body = ConversationPatchBody.parse(req.body);
  const patch = { ...body, ...(body.ai_enabled ? { needs_human: false } : {}) };
  if (!(await convs.patchConversation(pool, req.params.id, patch))) throw notFound("Conversation");
  bus.changed("conversations");
  res.json(await getOrThrow(req.params.id));
});

conversationsRouter.delete("/conversations/:id", async (req, res) => {
  stop(req.params.id);
  if (!(await convs.deleteConversation(pool, req.params.id))) throw notFound("Conversation");
  bus.changed("conversations");
  res.status(204).end();
});

/** A message typed in the admin UI, either as the administrator or simulating the client. */
conversationsRouter.post("/conversations/:id/messages", async (req, res) => {
  const body = MessageBody.parse(req.body);
  const conv = await getOrThrow(req.params.id);
  const msg = await pushMessage(conv.id, { from: body.from, text: body.text });
  if (body.from === "client" && conv.stage === "New") await convs.patchConversation(pool, conv.id, { stage: "In dialog" });
  res.status(201).json(msg);
  if (body.from === "client" && conv.ai_enabled) void replyTo(conv.id);
});

conversationsRouter.post("/conversations/:id/ai-reply", async (req, res) => {
  await getOrThrow(req.params.id);
  void replyTo(req.params.id);
  res.status(202).json({ queued: true });
});

conversationsRouter.post("/conversations/:id/ai-stop", async (req, res) => {
  res.json({ stopped: stop(req.params.id) });
});

conversationsRouter.post("/conversations/:id/resolve", async (req, res) => {
  await convs.patchConversation(pool, req.params.id, { needs_human: false, ai_enabled: true });
  await pushMessage(req.params.id, { from: "system", text: "Administrator handled the issue. AI autopilot is back on." });
  res.json(await getOrThrow(req.params.id));
});

async function inbound(req: Request, res: Response, requireSecret: boolean) {
  const messenger = MESSENGERS.find((m) => m.toLowerCase() === String(req.params.messenger).toLowerCase()) as Messenger | undefined;
  if (!messenger) throw notFound("Messenger");
  const secrets = [config.CHANNEL_WEBHOOK_SECRET, await channelSecret(messenger)].filter(Boolean);
  if (requireSecret && !secrets.length) throw new HttpError(404, `${messenger} is not connected for this business`, "not_found");
  const given = req.get("x-channel-secret");
  if (secrets.length && !secrets.some((s) => safeEqual(given, s))) throw new HttpError(401, "Bad channel secret", "unauthorized");
  const body = InboundBody.parse(req.body);
  const { conversation, created } = await receiveInbound({ messenger, ...body });
  res.status(created ? 201 : 200).json({ conversation_id: conversation.id, client_id: conversation.client_id, ai_enabled: conversation.ai_enabled });
  if (conversation.ai_enabled) void replyTo(conversation.id);
}

/**
 * Webhook for messenger providers (WhatsApp Business API, Instagram, or a
 * test client) of one business. The business id is in the address, the
 * x-channel-secret header proves the sender. Telegram uses the bot adapter
 * but lands in the same place.
 */
conversationsRouter.post("/channels/:business/:messenger/inbound", async (req, res) => {
  const tenant = await findTenant(String(req.params.business));
  if (!tenant) throw notFound("Business");
  await withTenant(tenant, () => inbound(req, res, true));
});

/** Address without a business id, from before accounts. Only answers where a default business is set (the test setup). */
conversationsRouter.post("/channels/:messenger/inbound", async (req, res) => {
  if (!currentTenant()) throw notFound("Business");
  await inbound(req, res, false);
});
