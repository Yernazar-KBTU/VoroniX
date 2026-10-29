// Local salon time helpers. The process runs with TZ set to the salon zone,
// so Date's local getters return salon time.

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** "YYYY-MM-DD HH:MM" */
export const dt = (d: Date) => `${ymd(d)} ${hm(d)}`;

/** Parses "YYYY-MM-DD HH:MM" or "YYYY-MM-DDTHH:MM" as local time. */
export function parseDT(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)/.exec(s ?? "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}

export function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const addMinutes = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);

/** "HH:MM" -> minutes since midnight */
export const toMin = (t: string) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
};
export const fromMin = (n: number) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;

/** Normalises "2026-10-30T14:00" / "2026-10-30 14:00:00" to "2026-10-30 14:00". */
export const normDT = (s: string) => String(s).replace("T", " ").slice(0, 16);
