import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../src/db/pool.js";
import { parseDT } from "../../src/lib/time.js";
import { reminderText, sendDueReminders } from "../../src/services/reminder.service.js";
import { freshDb, quietWednesday } from "./helpers.js";

const at = (s: string, minutesBefore: number) => new Date(parseDT(s)!.getTime() - minutesBefore * 60_000);

async function book(start: string, createdDaysAgo: number): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO appointments (client_id, master_id, service_code, start_at, end_at, status, source, created_at)
     VALUES ('CL-0001', 'MS-01', 'HC-01', $1::timestamp, $1::timestamp + interval '60 minutes', 'Booked', 'Telegram',
             now() - make_interval(days => $2))
     RETURNING appointment_id AS id`,
    [start, createdDaysAgo],
  );
  return rows[0].id;
}

const remindersOf = async (id: string) =>
  (await pool.query(`SELECT kind, outcome FROM appointment_reminders WHERE appointment_id = $1 ORDER BY kind`, [id])).rows;

describe("visit reminders", () => {
  let start: string;
  let id: string;

  beforeAll(async () => {
    await freshDb();
    start = `${quietWednesday()} 12:00`;
    id = await book(start, 10);
  });
  afterAll(() => pool.end());

  it("sends the 24 h reminder into the client's chat once", async () => {
    const first = await sendDueReminders(at(start, 23 * 60));
    expect(first.sent).toContain(`${id}/24h`);
    const again = await sendDueReminders(at(start, 22 * 60));
    expect(again.sent).not.toContain(`${id}/24h`);
    const { rows } = await pool.query(`SELECT body FROM messages WHERE conversation_id = 'CV-0001' AND sender = 'ai' ORDER BY message_id DESC LIMIT 1`);
    expect(rows[0].body).toContain("12:00");
  });

  it("sends the 2 h reminder in the last two hours", async () => {
    const r = await sendDueReminders(at(start, 90));
    expect(r.sent).toContain(`${id}/2h`);
    expect(await remindersOf(id)).toEqual([
      { kind: "24h", outcome: "sent" },
      { kind: "2h", outcome: "sent" },
    ]);
  });

  it("skips reminders for cancelled visits", async () => {
    const other = await book(`${quietWednesday()} 15:00`, 10);
    await pool.query(`UPDATE appointments SET status = 'Cancelled' WHERE appointment_id = $1`, [other]);
    const r = await sendDueReminders(at(`${quietWednesday()} 15:00`, 60));
    expect([...r.sent, ...r.skipped].some((k) => k.startsWith(other))).toBe(false);
  });

  it("does not remind about a visit booked inside the window", async () => {
    const late = await book(`${quietWednesday()} 18:00`, 0);
    // The test clock is weeks before the visit, so "booked now" is inside no window; move the booking time instead.
    await pool.query(`UPDATE appointments SET created_at = ($1::timestamp - interval '1 hour') AT TIME ZONE 'Asia/Almaty' WHERE appointment_id = $2`, [`${quietWednesday()} 18:00`, late]);
    const r = await sendDueReminders(at(`${quietWednesday()} 18:00`, 30));
    expect(r.skipped).toContain(`${late}/2h`);
    expect(r.sent).not.toContain(`${late}/2h`);
  });

  it("writes in the client's language", () => {
    const base = { start_datetime: "2026-11-04 12:00", service: "Haircut", master: "Timur B.", client_name: "Arman T." };
    expect(reminderText("24h", { ...base, last_client_text: "можно завтра?" })).toMatch(/^Arman, напоминаем: завтра в 12:00/);
    expect(reminderText("2h", { ...base, last_client_text: "hi, tomorrow?" })).toMatch(/^Hi Arman, see you today at 12:00/);
  });
});
