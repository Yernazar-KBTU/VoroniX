import type { Db } from "../db/pool.js";
import type { Appointment, ApptStatus } from "../domain/types.js";
import type { BusyInterval } from "../domain/scheduling.js";

const COLS = `appointment_id AS id, client_id, master_id, service_code, start_at AS start_datetime,
  end_at AS end_datetime, status, source, to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at`;

export async function listAppointments(db: Db, f: { from?: string; to?: string; client_id?: string } = {}): Promise<Appointment[]> {
  return (
    await db.query<Appointment>(
      `SELECT ${COLS} FROM appointments
       WHERE ($1::date IS NULL OR start_at >= $1::date)
         AND ($2::date IS NULL OR start_at < $2::date + 1)
         AND ($3::text IS NULL OR client_id = $3)
       ORDER BY start_at, appointment_id`,
      [f.from ?? null, f.to ?? null, f.client_id ?? null],
    )
  ).rows;
}

export async function getAppointment(db: Db, id: string, lock = false): Promise<Appointment | null> {
  return (await db.query<Appointment>(`SELECT ${COLS} FROM appointments WHERE appointment_id = $1 ${lock ? "FOR UPDATE" : ""}`, [id])).rows[0] ?? null;
}

/** Non-cancelled visits that touch the date, for the free-slot search. */
export async function busyOn(db: Db, date: string, masterIds: string[]): Promise<BusyInterval[]> {
  return (
    await db.query<BusyInterval>(
      `SELECT master_id, start_at AS start_datetime, end_at AS end_datetime FROM appointments
       WHERE status <> 'Cancelled' AND master_id = ANY($2::text[])
         AND start_at < $1::date + 1 AND end_at > $1::date`,
      [date, masterIds],
    )
  ).rows;
}

export async function insertAppointment(
  db: Db,
  a: { client_id: string; master_id: string; service_code: string; start: string; duration_min: number; status: ApptStatus; source: string },
): Promise<Appointment> {
  const { rows } = await db.query<Appointment>(
    `INSERT INTO appointments (client_id, master_id, service_code, start_at, end_at, status, source)
     VALUES ($1, $2, $3, $4::timestamp, $4::timestamp + make_interval(mins => $5), $6, $7)
     RETURNING ${COLS}`,
    [a.client_id, a.master_id, a.service_code, a.start, a.duration_min, a.status, a.source],
  );
  return rows[0];
}

export async function updateAppointment(
  db: Db,
  id: string,
  a: { client_id: string; master_id: string; service_code: string; start: string; duration_min: number; status: ApptStatus },
): Promise<Appointment | null> {
  const { rows } = await db.query<Appointment>(
    `UPDATE appointments SET client_id = $2, master_id = $3, service_code = $4, start_at = $5::timestamp,
       end_at = $5::timestamp + make_interval(mins => $6), status = $7
     WHERE appointment_id = $1 RETURNING ${COLS}`,
    [id, a.client_id, a.master_id, a.service_code, a.start, a.duration_min, a.status],
  );
  return rows[0] ?? null;
}

export async function setStatus(db: Db, id: string, status: ApptStatus): Promise<Appointment | null> {
  const { rows } = await db.query<Appointment>(`UPDATE appointments SET status = $2 WHERE appointment_id = $1 RETURNING ${COLS}`, [id, status]);
  return rows[0] ?? null;
}
