import { pool, tx, type Db } from "../db/pool.js";
import type { ChatMessage, Conversation, Messenger } from "../domain/types.js";
import { notFound } from "../lib/errors.js";
import { bus } from "../realtime/bus.js";
import * as clients from "../repositories/clients.repo.js";
import * as convs from "../repositories/conversations.repo.js";
import { getSettings } from "../repositories/settings.repo.js";

/** Adds a message to a chat and tells listeners (web UI, messenger adapters). */
export async function pushMessage(convId: string, m: { from: ChatMessage["from"]; text: string; payment_id?: string | null }, db: Db = pool): Promise<ChatMessage> {
  const msg = await convs.addMessage(db, convId, m);
  bus.changed("conversations");
  if (m.from === "ai" || m.from === "admin") {
    const conv = await convs.getConversation(db, convId);
    if (conv) bus.publish({ type: "message", conversation_id: convId, from: m.from, text: m.text, messenger: conv.messenger, external_user_id: conv.external_user_id });
  }
  return msg;
}

export async function getOrThrow(id: string, db: Db = pool): Promise<Conversation> {
  const c = await convs.getConversation(db, id);
  if (!c) throw notFound("Conversation");
  return c;
}

/**
 * A message arrived from a messenger. Finds the chat for this messenger
 * account or opens a new one, linking it to a known client card when the
 * account is already in client_channels.
 */
export async function receiveInbound(input: { messenger: Messenger; external_user_id: string; name: string; text: string }, db = pool): Promise<{ conversation: Conversation; created: boolean }> {
  const { id, created } = await tx(async (c) => {
    const existing = await convs.findConversation(c, input.messenger, input.external_user_id);
    if (existing) return { id: existing.id, created: false };
    const channel = await clients.findChannel(c, input.messenger, input.external_user_id);
    const biz = await getSettings(c);
    const newId = await convs.createConversation(c, {
      messenger: input.messenger,
      external_user_id: input.external_user_id,
      contact: input.name || `guest_${input.external_user_id}`,
      client_id: channel?.client_id ?? null,
      ai_enabled: biz.autopilot,
    });
    return { id: newId, created: true };
  }, db);
  await pushMessage(id, { from: "client", text: input.text }, db);
  const conv = await getOrThrow(id, db);
  if (conv.stage === "New" && conv.messages.length > 1) await convs.patchConversation(db, id, { stage: "In dialog" });
  return { conversation: await getOrThrow(id, db), created };
}

/**
 * Finds or creates the client card for a chat and links both. Matching order:
 * this messenger account, then the phone number, then a new card.
 */
export async function linkClient(convId: string, name: string, phone?: string, db = pool): Promise<{ client_id: string; is_new: boolean }> {
  const result = await tx(async (c) => {
    const conv = await convs.getConversation(c, convId);
    if (!conv) throw notFound("Conversation");
    if (conv.client_id) return { client_id: conv.client_id, is_new: false };
    let clientId = (await clients.findChannel(c, conv.messenger, conv.external_user_id))?.client_id ?? null;
    if (!clientId && phone) clientId = (await clients.findClientByPhone(c, phone))?.id ?? null;
    const isNew = !clientId;
    if (!clientId) clientId = (await clients.createClient(c, { display_name: name, phone })).id;
    await clients.addChannel(c, clientId, conv.messenger, conv.external_user_id);
    await convs.patchConversation(c, convId, { client_id: clientId, contact: isNew ? name : conv.contact });
    await convs.addMessage(c, convId, {
      from: "system",
      text: isNew ? `AI created client card ${clientId} (${name}).` : `AI linked this chat to existing client ${clientId}.`,
    });
    return { client_id: clientId, is_new: isNew };
  }, db);
  bus.changed("clients", "client_channels", "conversations");
  return result;
}
