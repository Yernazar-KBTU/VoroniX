// Formatting and small DOM helpers shared by every page.
import { t } from "./i18n.js";

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
  el.textContent = t(text);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

// Line glyphs in each messenger's colour; drawn on a 24 grid.
export const GLYPH = {
  Telegram: '<path d="M20.5 4.5 3.5 11.2l5.6 2 2 5.8 3.1-3.6 4.6 3.4z"/><path d="m9.1 13.2 7.6-5.4"/>',
  WhatsApp: '<path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z"/><path d="M9 8.6c.2 3.4 2.9 6.1 6.3 6.3l.9-1.7-1.8-.9-.9.9a5 5 0 0 1-2.8-2.8l.9-.9-.9-1.8z"/>',
  Instagram: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><path d="M16.6 7.4h.01"/>',
};
const MSG_ICON = { Telegram: 1, WhatsApp: 1, Instagram: 1 };
export const msIcon = (m) =>
  `<span class="ms ${esc(m)}" title="${esc(m)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[m] || '<circle cx="12" cy="12" r="8"/>'}</svg></span>`;
export const isMessenger = (m) => m in MSG_ICON;
export const pill = (s, cls) => `<span class="pill ${esc(cls || s)}">${esc(s)}</span>`;
export const opt = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(l)}</option>`).join("");
export const head = (title, sub, actions = "") => `<h1>${esc(title)}</h1>${actions}${sub ? `<span class="sub">${sub}</span>` : ""}`;
