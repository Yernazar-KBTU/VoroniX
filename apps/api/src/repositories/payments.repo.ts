import type { Db } from "../db/pool.js";
import type { Payment } from "../domain/types.js";

const COLS = `payment_id AS id, appointment_id, amount_kzt, kind, method, status,
  to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at, COALESCE(to_char(paid_at, 'YYYY-MM-DD HH24:MI'), '') AS paid_at`;

export async function listPayments(db: Db): Promise<Payment[]> {
  return (await db.query<Payment>(`SELECT ${COLS} FROM payments ORDER BY created_at DESC, payment_id DESC`)).rows;
}

export async function getPayment(db: Db, id: string, lock = false): Promise<Payment | null> {
  return (await db.query<Payment>(`SELECT ${COLS} FROM payments WHERE payment_id = $1 ${lock ? "FOR UPDATE" : ""}`, [id])).rows[0] ?? null;
}

export async function insertPayment(
  db: Db,
  p: { appointment_id: string; amount_kzt: number; kind: Payment["kind"]; method: string; status: Payment["status"] },
): Promise<Payment> {
  const { rows } = await db.query<Payment>(
    `INSERT INTO payments (appointment_id, amount_kzt, kind, method, status, paid_at)
     VALUES ($1, $2, $3, $4, $5::text, CASE WHEN $5::text = 'Pending' THEN NULL ELSE now() END) RETURNING ${COLS}`,
    [p.appointment_id, p.amount_kzt, p.kind, p.method, p.status],
  );
  return rows[0];
}

export async function setPaymentStatus(db: Db, id: string, status: Payment["status"], method?: string): Promise<Payment | null> {
  const { rows } = await db.query<Payment>(
    `UPDATE payments SET status = $2::text, method = COALESCE($3, method),
       paid_at = CASE WHEN $2::text = 'Paid' THEN now() ELSE paid_at END
     WHERE payment_id = $1 RETURNING ${COLS}`,
    [id, status, method ?? null],
  );
  return rows[0] ?? null;
}
