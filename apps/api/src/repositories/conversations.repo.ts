import type { Db } from "../db/pool.js";
import type { ChatMessage, Conversation, Messenger, Stage } from "../domain/types.js";

const COLS = `c.conversation_id AS id, c.messenger, c.external_user_id, c.contact_name AS contact, c.client_id,
  c.appointment_id, c.stage, c.ai_enabled, c.needs_human, to_char(c.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MSOF') AS updated_at`;

// Last 200 messages of each chat, oldest first, as a JSON array.
const MESSAGES = `COALESCE((
  SELECT json_agg(json_build_object('id', x.message_id, 'from', x.sender, 'text', x.body, 'payment_id', x.payment_id,
         'at', to_char(x.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MSOF')) ORDER BY x.message_id)
  FROM (SELECT * FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY m.message_id DESC LIMIT 200) x
), '[]'::json) AS messages`;

export async function listConversations(db: Db): Promise<Conversation[]> {
  return (await db.query<Conversation>(`SELECT ${COLS}, ${MESSAGES} FROM conversations c ORDER BY c.updated_at DESC`)).rows;
}

export async function getConversation(db: Db, id: string): Promise<Conversation | null> {
  return (await db.query<Conversation>(`SELECT ${COLS}, ${MESSAGES} FROM conversations c WHERE c.conversation_id = $1`, [id])).rows[0] ?? null;
}

export async function findConversation(db: Db, messenger: Messenger, externalUserId: string): Promise<Conversation | null> {
  return (
    (await db.query<Conversation>(`SELECT ${COLS}, ${MESSAGES} FROM conversations c WHERE c.messenger = $1 AND c.external_user_id = $2`, [messenger, externalUserId]))
      .rows[0] ?? null
  );
}

export async function createConversation(
  db: Db,
  c: { messenger: Messenger; external_user_id: string; contact: string; client_id?: string | null; ai_enabled: boolean },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO conversations (messenger, external_user_id, contact_name, client_id, ai_enabled)
     VALUES ($1, $2, $3, $4, $5) RETURNING conversation_id AS id`,
    [c.messenger, c.external_user_id, c.contact.slice(0, 60), c.client_id ?? null, c.ai_enabled],
  );
  return rows[0].id;
}

export type ConversationPatch = Partial<{
  stage: Stage;
  ai_enabled: boolean;
  needs_human: boolean;
  client_id: string | null;
  appointment_id: string | null;
  contact: string;
}>;

const PATCH_COLUMNS: Record<keyof ConversationPatch, string> = {
  stage: "stage",
  ai_enabled: "ai_enabled",
  needs_human: "needs_human",
  client_id: "client_id",
  appointment_id: "appointment_id",
  contact: "contact_name",
};

export async function patchConversation(db: Db, id: string, p: ConversationPatch): Promise<boolean> {
  const keys = (Object.keys(p) as (keyof ConversationPatch)[]).filter((k) => p[k] !== undefined && k in PATCH_COLUMNS);
  const sets = keys.map((k, i) => `${PATCH_COLUMNS[k]} = $${i + 2}`);
  sets.push("updated_at = now()");
  const { rowCount } = await db.query(`UPDATE conversations SET ${sets.join(", ")} WHERE conversation_id = $1`, [id, ...keys.map((k) => p[k])]);
  return (rowCount ?? 0) > 0;
}

export async function deleteConversation(db: Db, id: string): Promise<boolean> {
  const { rowCount } = await db.query(`DELETE FROM conversations WHERE conversation_id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function addMessage(db: Db, conversationId: string, m: { from: ChatMessage["from"]; text: string; payment_id?: string | null }): Promise<ChatMessage> {
  const { rows } = await db.query<ChatMessage>(
    `WITH ins AS (
       INSERT INTO messages (conversation_id, sender, body, payment_id) VALUES ($1, $2, $3, $4)
       RETURNING message_id, sender, body, payment_id, created_at
     ), touch AS (
       UPDATE conversations SET updated_at = now() WHERE conversation_id = $1
     )
     SELECT message_id AS id, sender AS "from", body AS text, payment_id,
            to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MSOF') AS at FROM ins`,
    [conversationId, m.from, m.text, m.payment_id ?? null],
  );
  return rows[0];
}
