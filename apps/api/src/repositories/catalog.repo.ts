import type { Db } from "../db/pool.js";
import type { Master, MasterService, Service } from "../domain/types.js";

const SERVICE_COLS = `service_code AS id, name, category, duration_min, price_kzt, is_active`;
const masterCols = (t: string) => `${t}master_id AS id, ${t}full_name, ${t}specialization,
  to_char(${t}work_start, 'HH24:MI') AS work_start, to_char(${t}work_end, 'HH24:MI') AS work_end,
  ${t}work_days AS days, ${t}is_active`;
const MASTER_COLS = masterCols("");

export async function listServices(db: Db): Promise<Service[]> {
  return (await db.query<Service>(`SELECT ${SERVICE_COLS} FROM services ORDER BY service_code`)).rows;
}

export async function getService(db: Db, code: string): Promise<Service | null> {
  return (await db.query<Service>(`SELECT ${SERVICE_COLS} FROM services WHERE service_code = $1`, [code])).rows[0] ?? null;
}

export async function upsertService(db: Db, s: Service): Promise<Service> {
  const { rows } = await db.query<Service>(
    `INSERT INTO services (service_code, name, category, duration_min, price_kzt, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (service_code) DO UPDATE SET name = $2, category = $3, duration_min = $4, price_kzt = $5, is_active = $6
     RETURNING ${SERVICE_COLS}`,
    [s.id, s.name, s.category, s.duration_min, s.price_kzt, s.is_active],
  );
  return rows[0];
}

export async function listMasters(db: Db): Promise<Master[]> {
  return (await db.query<Master>(`SELECT ${MASTER_COLS} FROM masters ORDER BY master_id`)).rows;
}

export async function getMaster(db: Db, id: string): Promise<Master | null> {
  return (await db.query<Master>(`SELECT ${MASTER_COLS} FROM masters WHERE master_id = $1`, [id])).rows[0] ?? null;
}

export async function saveMaster(db: Db, m: Omit<Master, "id"> & { id?: string }): Promise<Master> {
  const values = [m.full_name, m.specialization, m.work_start, m.work_end, m.days, m.is_active];
  const { rows } = m.id
    ? await db.query<Master>(
        `UPDATE masters SET full_name = $1, specialization = $2, work_start = $3, work_end = $4, work_days = $5, is_active = $6
         WHERE master_id = $7 RETURNING ${MASTER_COLS}`,
        [...values, m.id],
      )
    : await db.query<Master>(
        `INSERT INTO masters (full_name, specialization, work_start, work_end, work_days, is_active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${MASTER_COLS}`,
        values,
      );
  return rows[0];
}

/** Active rows of the master_services bridge table. */
export async function listMasterServices(db: Db): Promise<MasterService[]> {
  return (
    await db.query<MasterService>(
      `SELECT master_id || '__' || service_code AS id, master_id, service_code, skill_level, since_date
       FROM master_services WHERE is_active ORDER BY master_id, service_code`,
    )
  ).rows;
}

/** Makes the master's active services exactly `codes`. Old pairs are deactivated, not deleted. */
export async function setMasterServices(db: Db, masterId: string, codes: string[]): Promise<void> {
  await db.query(`UPDATE master_services SET is_active = (service_code = ANY($2::text[])) WHERE master_id = $1`, [masterId, codes]);
  await db.query(
    `INSERT INTO master_services (master_id, service_code)
     SELECT $1, unnest($2::text[]) ON CONFLICT (master_id, service_code) DO UPDATE SET is_active = TRUE`,
    [masterId, codes],
  );
}

/** Active masters who do the service. */
export async function mastersForService(db: Db, code: string): Promise<Master[]> {
  return (
    await db.query<Master>(
      `SELECT ${masterCols("m.")} FROM masters m
       JOIN master_services ms ON ms.master_id = m.master_id AND ms.is_active
       WHERE ms.service_code = $1 AND m.is_active ORDER BY m.master_id`,
      [code],
    )
  ).rows;
}
