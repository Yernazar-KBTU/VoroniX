import type { Db } from "../db/pool.js";
import type { KnowledgeEntry } from "../domain/types.js";

const COLS = `entry_id AS id, title, category, content, to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MSOF') AS updated_at`;

export async function listKnowledge(db: Db): Promise<KnowledgeEntry[]> {
  return (await db.query<KnowledgeEntry>(`SELECT ${COLS} FROM knowledge_entries ORDER BY updated_at DESC, entry_id`)).rows;
}

export async function createKnowledge(db: Db, k: Omit<KnowledgeEntry, "id" | "updated_at">): Promise<KnowledgeEntry> {
  const { rows } = await db.query<KnowledgeEntry>(
    `INSERT INTO knowledge_entries (title, category, content) VALUES ($1, $2, $3) RETURNING ${COLS}`,
    [k.title, k.category || "General", k.content],
  );
  return rows[0];
}

export async function updateKnowledge(db: Db, id: string, k: Omit<KnowledgeEntry, "id" | "updated_at">): Promise<KnowledgeEntry | null> {
  const { rows } = await db.query<KnowledgeEntry>(
    `UPDATE knowledge_entries SET title = $2, category = $3, content = $4, updated_at = now() WHERE entry_id = $1 RETURNING ${COLS}`,
    [id, k.title, k.category || "General", k.content],
  );
  return rows[0] ?? null;
}

export async function deleteKnowledge(db: Db, id: string): Promise<boolean> {
  const { rowCount } = await db.query(`DELETE FROM knowledge_entries WHERE entry_id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
