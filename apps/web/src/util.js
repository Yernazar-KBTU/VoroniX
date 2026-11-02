// Formatting and small DOM helpers shared by every page.

export const $ = (s) => document.querySelector(s);
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dt = (d) => `${ymd(d)} ${hm(d)}`;
export const parseDT = (s) => {
  const m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)/.exec(s || "");
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : null;
};
export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
/** Time zone and currency of the signed-in business; set once after sign-in. */
const place = { tz: "UTC", currency: "USD" };
let moneyFmt = null;
export function setBusinessPlace(tz, currency) {
  place.tz = tz || "UTC";
  place.currency = currency || "USD";
  moneyFmt = null;
  clockFmt = null;
}
export const businessCurrency = () => place.currency;
export const businessZone = () => place.tz;

/** "25 000 ₸", "$45", "€30": whole units of the business currency. */
export function money(n) {
  const v = Math.round(+n || 0);
  if (place.currency === "KZT") return v.toLocaleString("ru-RU").replace(/\s/g, " ") + " ₸";
  moneyFmt ??= new Intl.NumberFormat("en-US", { style: "currency", currency: place.currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return moneyFmt.format(v);
}

let clockFmt = null;
/**
 * Now on the business's clock, as a Date whose local getters read that wall
 * time. Visit times are wall-clock strings in the business time zone, so
 * "today" and the red now-line follow the business, not the browser.
 */
export function nowLocal() {
  clockFmt ??= new Intl.DateTimeFormat("en-US", { timeZone: place.tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(clockFmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}
export const toMin = (t) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
};
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "1 visit", "3 visits" */
export const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
export const fmtAt = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return ymd(d) === ymd(new Date()) ? hm(d) : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${hm(d)}`; // message times: the reader's own clock
};

let toastTimer;
export function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

const MSG_ICON = { Telegram: "T", WhatsApp: "W", Instagram: "I" };
export const msIcon = (m) => `<span class="ms ${esc(m)}" title="${esc(m)}">${MSG_ICON[m] || "?"}</span>`;
export const isMessenger = (m) => m in MSG_ICON;
export const pill = (s, cls) => `<span class="pill ${esc(cls || s)}">${esc(s)}</span>`;
export const opt = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(l)}</option>`).join("");
export const head = (title, sub, actions = "") => `<h1>${esc(title)}</h1>${actions}${sub ? `<span class="sub">${sub}</span>` : ""}`;
