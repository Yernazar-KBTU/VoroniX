import { describe, expect, it } from "vitest";
import { freeSlots, isSlotFree, nextDates } from "../../src/domain/scheduling.js";
import type { Master, Service } from "../../src/domain/types.js";

const colouring: Service = { id: "CO-03", name: "Окрашивание волос", category: "Hair", duration_min: 150, price_kzt: 25000, is_active: true };
const aigerim: Master = { id: "MS-01", full_name: "Айгерим С.", specialization: "", work_start: "09:00", work_end: "20:00", days: [1, 2, 3, 4, 5, 6], is_active: true };
const dana: Master = { ...aigerim, id: "MS-02", full_name: "Дана К.", work_start: "10:00", work_end: "20:00", days: [2, 3, 4, 5, 6] };
// Friday 2026-10-30, asked on Thursday evening.
const now = new Date(2026, 9, 29, 19, 0);

describe("freeSlots", () => {
  it("offers every 30 minutes inside working hours so the visit ends before closing", () => {
    const r = freeSlots({ service: colouring, date: "2026-10-30", masters: [aigerim], busy: [], now });
    const times = r.slots[0].times;
    expect(times[0]).toBe("09:00");
    expect(times.at(-1)).toBe("17:30"); // 17:30 + 150 min = 20:00
    expect(times).toHaveLength(18);
    expect(r.weekday).toBe("Fri");
  });

  it("skips a time that would overlap an existing visit", () => {
    const busy = [{ master_id: "MS-01", start_datetime: "2026-10-30 12:00", end_datetime: "2026-10-30 13:00" }];
    const r = freeSlots({ service: colouring, date: "2026-10-30", masters: [aigerim], busy, now });
    // 09:30 + 150 = 12:00 touches but does not overlap; 10:00 would overlap.
    expect(r.slots[0].times).toContain("09:30");
    expect(r.slots[0].times).not.toContain("10:00");
    expect(r.slots[0].times).not.toContain("12:30");
    expect(r.slots[0].times).toContain("13:00");
  });

  it("ignores busy time of other masters", () => {
    const busy = [{ master_id: "MS-02", start_datetime: "2026-10-30 09:00", end_datetime: "2026-10-30 20:00" }];
    const r = freeSlots({ service: colouring, date: "2026-10-30", masters: [aigerim, dana], busy, now });
    expect(r.slots.map((s) => s.master_id)).toEqual(["MS-01"]);
  });

  it("returns no slots on a day off or for an inactive master", () => {
    const sunday = freeSlots({ service: colouring, date: "2026-11-01", masters: [aigerim], busy: [], now });
    expect(sunday.slots).toEqual([]);
    const off = freeSlots({ service: colouring, date: "2026-10-30", masters: [{ ...aigerim, is_active: false }], busy: [], now });
    expect(off.slots).toEqual([]);
  });

  it("never offers a time in the past", () => {
    const afternoon = new Date(2026, 9, 29, 15, 0);
    const today = freeSlots({ service: { ...colouring, duration_min: 60 }, date: "2026-10-29", masters: [aigerim], busy: [], now: afternoon });
    expect(today.slots[0].times[0]).toBe("15:30"); // 15:00 is "now", not after it
    const evening = freeSlots({ service: { ...colouring, duration_min: 60 }, date: "2026-10-29", masters: [aigerim], busy: [], now });
    expect(evening.slots).toEqual([]); // 19:00 + 60 min is the closing time
  });

  it("treats a visit that runs past midnight as blocking the rest of the day", () => {
    const busy = [{ master_id: "MS-01", start_datetime: "2026-10-30 18:00", end_datetime: "2026-10-31 01:00" }];
    const r = freeSlots({ service: { ...colouring, duration_min: 60 }, date: "2026-10-30", masters: [aigerim], busy, now });
    expect(r.slots[0].times.at(-1)).toBe("17:00");
  });

  it("rejects a malformed date", () => {
    expect(() => freeSlots({ service: colouring, date: "30.10.2026", masters: [aigerim], busy: [], now })).toThrow(/YYYY-MM-DD/);
  });
});

describe("isSlotFree / nextDates", () => {
  it("checks a single master and time", () => {
    const r = freeSlots({ service: colouring, date: "2026-10-30", masters: [aigerim], busy: [], now });
    expect(isSlotFree(r, "MS-01", "14:00")).toBe(true);
    expect(isSlotFree(r, "MS-01", "18:00")).toBe(false);
    expect(isSlotFree(r, "MS-02", "14:00")).toBe(false);
  });

  it("lists the following days across a month boundary", () => {
    expect(nextDates("2026-10-30", 3)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(nextDates("bad", 3)).toEqual([]);
  });
});
