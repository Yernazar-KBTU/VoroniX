import { pool, type Db } from "../db/pool.js";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { dt, parseDT, pad } from "../lib/time.js";
import { detectLang } from "../ai/offline-nlu.js";
import { pushMessage } from "./conversation.service.js";

/** A reminder kind and how far ahead of the visit it goes out. */
export const REMINDERS = [
  { kind: "24h", minutes: 24 * 60 },
  { kind: "2h", minutes: 2 * 60 },
] as const;
export type ReminderKind = (typeof REMINDERS)[number]["kind"];

interface DueRow {
  appointment_id: string;
  start_datetime: string;
  created_local: string;
  service: string;
  master: string;
  client_name: string;
  conversation_id: string | null;
  last_client_text: string | null;
}

/**
 * Visits that are due for this kind of reminder: Booked or Confirmed, starting
 * within the reminder window, and not reminded of this kind yet. The 24 h
 * reminder is not sent once the 2 h window has started.
 */
async function due(db: Db, kind: ReminderKind, now: Date): Promise<DueRow[]> {
  const idx = REMINDERS.findIndex((r) => r.kind === kind);
  const ahead = REMINDERS[idx].minutes;
  const after = REMINDERS[idx + 1]?.minutes ?? 0;
  const { rows } = await db.query<DueRow>(
    `SELECT a.appointment_id,
            to_char(a.start_at, 'YYYY-MM-DD HH24:MI') AS start_datetime,
            to_char(a.created_at AT TIME ZONE $4, 'YYYY-MM-DD HH24:MI') AS created_local,
            s.name AS service, m.full_name AS master, c.display_name AS client_name,
            cv.conversation_id,
            (SELECT body FROM messages WHERE conversation_id = cv.conversation_id AND sender = 'client'
              ORDER BY message_id DESC LIMIT 1) AS last_client_text
       FROM appointments a
       JOIN services s ON s.service_code = a.service_code
       JOIN masters m ON m.master_id = a.master_id
       JOIN clients c ON c.client_id = a.client_id
       LEFT JOIN LATERAL (
         SELECT conversation_id FROM conversations
          WHERE client_id = a.client_id ORDER BY updated_at DESC LIMIT 1
       ) cv ON TRUE
      WHERE a.status IN ('Booked', 'Confirmed')
        AND a.start_at >  $1::timestamp + make_interval(mins => $2)
        AND a.start_at <= $1::timestamp + make_interval(mins => $3)
        AND NOT EXISTS (SELECT 1 FROM appointment_reminders r WHERE r.appointment_id = a.appointment_id AND r.kind = $5)
      ORDER BY a.start_at`,
    [dt(now), after, ahead, config.TZ, kind],
  );
  return rows;
}

/** The reminder text, in the language the client writes in. */
export function reminderText(kind: ReminderKind, r: Pick<DueRow, "start_datetime" | "service" | "master" | "client_name" | "last_client_text">): string {
  const start = parseDT(r.start_datetime)!;
  const time = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const name = r.client_name.split(" ")[0];
  if (detectLang(r.last_client_text ?? "") === "ru") {
    return kind === "24h"
      ? `${name}, напоминаем: завтра в ${time} у вас ${r.service}, мастер ${r.master}. Если планы изменились, напишите, и мы перенесём запись.`
      : `${name}, ждём вас сегодня в ${time}: ${r.service}, мастер ${r.master}. До встречи!`;
  }
  return kind === "24h"
    ? `Hi ${name}, a reminder: tomorrow at ${time} you have ${r.service} with ${r.master}. If your plans change, reply here and we will move it.`
    : `Hi ${name}, see you today at ${time} for ${r.service} with ${r.master}.`;
}

async function record(db: Db, id: string, kind: ReminderKind, conversationId: string | null, outcome: "sent" | "skipped", note = "") {
  await db.query(
    `INSERT INTO appointment_reminders (appointment_id, kind, conversation_id, outcome, note)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
    [id, kind, conversationId, outcome, note],
  );
}

/**
 * Sends every reminder that is due now. A visit booked after its reminder
 * window opened, or a client with no chat, is recorded as skipped so it is
 * not retried. Returns what was done, for logs and tests.
 */
export async function sendDueReminders(now = new Date(), db: Db = pool): Promise<{ sent: string[]; skipped: string[] }> {
  const out = { sent: [] as string[], skipped: [] as string[] };
  for (const { kind, minutes } of REMINDERS) {
    for (const r of await due(db, kind, now)) {
      const key = `${r.appointment_id}/${kind}`;
      const windowOpened = parseDT(r.start_datetime)!.getTime() - minutes * 60_000;
      if (parseDT(r.created_local)!.getTime() > windowOpened) {
        await record(db, r.appointment_id, kind, r.conversation_id, "skipped", "booked inside the reminder window");
        out.skipped.push(key);
      } else if (!r.conversation_id) {
        await record(db, r.appointment_id, kind, null, "skipped", "client has no chat");
        out.skipped.push(key);
      } else {
        await pushMessage(r.conversation_id, { from: "ai", text: reminderText(kind, r) }, db);
        await record(db, r.appointment_id, kind, r.conversation_id, "sent");
        out.sent.push(key);
      }
    }
  }
  return out;
}

/** Checks for due reminders every minute until stopped. */
export function startReminders(everyMs = 60_000): { stop: () => void } {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await sendDueReminders();
      if (r.sent.length || r.skipped.length) logger.info(r, "visit reminders");
    } catch (err) {
      logger.error({ err }, "visit reminders failed");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), everyMs);
  void tick();
  return { stop: () => clearInterval(timer) };
}
