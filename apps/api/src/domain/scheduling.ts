import { DOW, addDays, fromMin, parseDate, toMin, ymd } from "../lib/time.js";
import type { Master, Service } from "./types.js";

export const SLOT_STEP_MIN = 30;

export interface BusyInterval {
  master_id: string;
  start_datetime: string; // "YYYY-MM-DD HH:MM"
  end_datetime: string;
}

export interface SlotsForMaster {
  master_id: string;
  master: string;
  times: string[];
}

export interface FreeSlotsResult {
  service: string;
  duration_min: number;
  date: string;
  weekday: string;
  slots: SlotsForMaster[];
}

/**
 * Free start times for one service on one date, per master.
 * Pure function: the caller passes the masters who do the service and the
 * busy intervals of that date, so it is easy to test.
 */
export function freeSlots(args: {
  service: Service;
  date: string;
  masters: Master[];
  busy: BusyInterval[];
  now: Date;
  step?: number;
}): FreeSlotsResult {
  const { service, date, masters, busy, now } = args;
  const step = args.step ?? SLOT_STEP_MIN;
  const day = parseDate(date);
  if (!day) throw new Error("date must be YYYY-MM-DD");
  const dur = service.duration_min;
  const slots: SlotsForMaster[] = [];

  for (const m of masters) {
    if (!m.is_active || !m.days.includes(day.getDay())) continue;
    const taken = busy
      .filter((b) => b.master_id === m.id && b.start_datetime.startsWith(date))
      .map((b) => [toMin(b.start_datetime.slice(11)), spanEnd(b, date)] as const);
    const times: string[] = [];
    for (let t = toMin(m.work_start); t + dur <= toMin(m.work_end); t += step) {
      const startsAt = new Date(day.getTime() + t * 60_000);
      if (startsAt <= now) continue;
      if (taken.some(([b, e]) => t < e && t + dur > b)) continue;
      times.push(fromMin(t));
    }
    if (times.length) slots.push({ master_id: m.id, master: m.full_name, times });
  }
  return { service: service.name, duration_min: dur, date, weekday: DOW[day.getDay()], slots };
}

// A visit that runs past midnight blocks the rest of the day.
function spanEnd(b: BusyInterval, date: string) {
  return b.end_datetime.startsWith(date) ? toMin(b.end_datetime.slice(11)) : 24 * 60;
}

/** True when the start time is one of the free times for that master. */
export function isSlotFree(result: FreeSlotsResult, masterId: string, time: string): boolean {
  return result.slots.some((s) => s.master_id === masterId && s.times.includes(time));
}

/** Dates to scan when the asked day is full: the next `days` days. */
export function nextDates(date: string, days: number): string[] {
  const d = parseDate(date);
  if (!d) return [];
  return Array.from({ length: days }, (_, i) => ymd(addDays(d, i + 1)));
}
