import { pool, tx, type Db } from "../db/pool.js";
import { prepaymentFor, money } from "../domain/pricing.js";
import { freeSlots, isSlotFree, nextDates, type FreeSlotsResult } from "../domain/scheduling.js";
import type { Appointment, ApptStatus, Payment } from "../domain/types.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { normDT } from "../lib/time.js";
import { bus } from "../realtime/bus.js";
import * as appts from "../repositories/appointments.repo.js";
import * as catalog from "../repositories/catalog.repo.js";
import * as convs from "../repositories/conversations.repo.js";
import * as pays from "../repositories/payments.repo.js";
import { getSettings } from "../repositories/settings.repo.js";

export interface SlotSearch extends FreeSlotsResult {
  nearest_available?: { date: string; weekday: string; slots: FreeSlotsResult["slots"] };
}

/** Free times for a service on a date. When the day is full, also returns the nearest day with free times. */
export async function findFreeSlots(db: Db, code: string, date: string, masterId?: string, now = new Date()): Promise<SlotSearch> {
  const service = await catalog.getService(db, code);
  if (!service || !service.is_active) throw badRequest(`Unknown service_code ${code}`);
  let masters = await catalog.mastersForService(db, code);
  if (masterId) masters = masters.filter((m) => m.id === masterId);
  const ids = masters.map((m) => m.id);
  const search = async (d: string) => freeSlots({ service, date: d, masters, busy: await appts.busyOn(db, d, ids), now });

  const result: SlotSearch = await search(date);
  if (!result.slots.length) {
    for (const d of nextDates(date, 14)) {
      const next = await search(d);
      if (next.slots.length) {
        result.nearest_available = { date: d, weekday: next.weekday, slots: next.slots.map((s) => ({ ...s, times: s.times.slice(0, 6) })) };
        break;
      }
    }
  }
  return result;
}

export interface BookingInput {
  client_id: string;
  master_id: string;
  service_code: string;
  start_datetime: string;
  status?: ApptStatus;
  source?: string;
}

/**
 * Creates a visit. With strict=true (bookings from chats) the time must be one
 * of the free slots: inside working hours, in the future, not overlapping.
 * Admin bookings skip the working-hours check but the database still refuses
 * overlaps (exclusion constraint) and wrong master/service pairs (FK).
 */
export async function createBooking(input: BookingInput, opts: { strict: boolean }, db = pool): Promise<Appointment> {
  const start = normDT(input.start_datetime);
  const appt = await tx(async (c) => {
    const service = await catalog.getService(c, input.service_code);
    if (!service) throw badRequest(`Unknown service ${input.service_code}`);
    const masters = await catalog.mastersForService(c, input.service_code);
    if (!masters.some((m) => m.id === input.master_id)) throw badRequest("This master does not do this service.");
    if (opts.strict) {
      const slots = await findFreeSlots(c, input.service_code, start.slice(0, 10), input.master_id);
      if (!isSlotFree(slots, input.master_id, start.slice(11))) throw conflict("This time is not free for this master.", "slot_taken");
    }
    return appts.insertAppointment(c, {
      client_id: input.client_id,
      master_id: input.master_id,
      service_code: input.service_code,
      start,
      duration_min: service.duration_min,
      status: input.status ?? "Booked",
      source: input.source ?? "Admin",
    });
  }, db);
  bus.changed("appointments");
  bus.publish({ type: "domain", name: "appointment.created", data: { ...appt } });
  return appt;
}

export async function updateBooking(id: string, input: BookingInput & { status: ApptStatus }, db = pool): Promise<Appointment> {
  const updated = await tx(async (c) => {
    const current = await appts.getAppointment(c, id, true);
    if (!current) throw notFound("Appointment");
    const service = await catalog.getService(c, input.service_code);
    if (!service) throw badRequest(`Unknown service ${input.service_code}`);
    const row = await appts.updateAppointment(c, id, {
      client_id: input.client_id,
      master_id: input.master_id,
      service_code: input.service_code,
      start: normDT(input.start_datetime),
      duration_min: service.duration_min,
      status: input.status,
    });
    if (input.status === "Completed" && current.status !== "Completed") await markVisited(c, input.client_id);
    return row!;
  }, db);
  bus.changed("appointments", "conversations");
  return updated;
}

export async function changeStatus(id: string, status: ApptStatus, db = pool): Promise<Appointment> {
  const a = await tx(async (c) => {
    const row = await appts.setStatus(c, id, status);
    if (!row) throw notFound("Appointment");
    if (status === "Completed") await markVisited(c, row.client_id);
    return row;
  }, db);
  bus.changed("appointments", "conversations");
  return a;
}

// After a visit the client's open deals move to "Visited".
async function markVisited(c: Db, clientId: string) {
  await c.query(`UPDATE conversations SET stage = 'Visited', updated_at = now() WHERE client_id = $1 AND stage IN ('Paid', 'Booked')`, [clientId]);
}

/** Moves a visit to a new free time, keeping its id. */
export async function moveBooking(id: string, newStart: string, db = pool): Promise<Appointment> {
  const start = normDT(newStart);
  const moved = await tx(async (c) => {
    const a = await appts.getAppointment(c, id, true);
    if (!a) throw notFound("Appointment");
    // Free the old slot inside the transaction so the search does not see it as busy.
    await appts.setStatus(c, id, "Cancelled");
    const slots = await findFreeSlots(c, a.service_code, start.slice(0, 10), a.master_id);
    if (!isSlotFree(slots, a.master_id, start.slice(11))) throw conflict("New time is not free.", "slot_taken");
    const service = (await catalog.getService(c, a.service_code))!;
    return (await appts.updateAppointment(c, id, { ...a, start, duration_min: service.duration_min, status: a.status }))!;
  }, db);
  bus.changed("appointments");
  return moved;
}

/** Payment link for a visit: the prepayment share, or the full price. */
export async function createPaymentLink(appointmentId: string, kind: Payment["kind"], db = pool): Promise<Payment> {
  const p = await tx(async (c) => {
    const a = await appts.getAppointment(c, appointmentId);
    if (!a) throw notFound("Appointment");
    const service = (await catalog.getService(c, a.service_code))!;
    const biz = await getSettings(c);
    const amount = kind === "full" ? service.price_kzt : prepaymentFor(service, biz) || Math.round(service.price_kzt * 0.3);
    return pays.insertPayment(c, { appointment_id: a.id, amount_kzt: amount, kind, method: "Kaspi QR", status: "Pending" });
  }, db);
  bus.changed("payments");
  return p;
}

/**
 * The client paid. One transaction: payment -> Paid, visit -> Confirmed,
 * the chat's deal -> Paid, and a note in the chat. Returns the chats to notify.
 */
export async function markPaid(paymentId: string, method = "Kaspi QR", db = pool): Promise<{ payment: Payment; conversations: string[] }> {
  let fresh = false;
  const result = await tx(async (c) => {
    const p = await pays.getPayment(c, paymentId, true);
    if (!p) throw notFound("Payment");
    if (p.status === "Paid") return { payment: p, conversations: [] as string[] };
    if (p.status === "Refunded") throw conflict("This payment was refunded.");
    const paid = (await pays.setPaymentStatus(c, paymentId, "Paid", method))!;
    fresh = true;
    await c.query(`UPDATE appointments SET status = 'Confirmed' WHERE appointment_id = $1 AND status = 'Booked'`, [p.appointment_id]);
    const { rows } = await c.query<{ id: string }>(
      `UPDATE conversations SET stage = 'Paid', updated_at = now() WHERE appointment_id = $1 RETURNING conversation_id AS id`,
      [p.appointment_id],
    );
    for (const r of rows) await convs.addMessage(c, r.id, { from: "system", text: `Payment received: ${money(paid.amount_kzt)} (${method}). Booking confirmed.` });
    return { payment: paid, conversations: rows.map((r) => r.id) };
  }, db);
  bus.changed("payments", "appointments", "conversations");
  if (fresh) bus.publish({ type: "domain", name: "payment.paid", data: { ...result.payment } });
  return result;
}

export async function refund(paymentId: string, db = pool): Promise<Payment> {
  const p = await pays.setPaymentStatus(db, paymentId, "Refunded");
  if (!p) throw notFound("Payment");
  bus.changed("payments");
  return p;
}

/** Full payment taken at the desk. */
export async function takeFullPayment(appointmentId: string, method = "Card", db = pool): Promise<Payment> {
  const p = await tx(async (c) => {
    const a = await appts.getAppointment(c, appointmentId);
    if (!a) throw notFound("Appointment");
    const service = (await catalog.getService(c, a.service_code))!;
    return pays.insertPayment(c, { appointment_id: a.id, amount_kzt: service.price_kzt, kind: "full", method, status: "Paid" });
  }, db);
  bus.changed("payments");
  return p;
}
