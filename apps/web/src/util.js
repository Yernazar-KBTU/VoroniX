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
export const money = (n) => Math.round(+n || 0).toLocaleString("ru-RU").replace(/\s/g, " ") + " ₸";
export const toMin = (t) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
};
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const fmtAt = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return ymd(d) === ymd(new Date()) ? hm(d) : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${hm(d)}`;
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
