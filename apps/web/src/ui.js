// Rendering loop, navigation rail, modal and the shared UI state.

import { PAGES } from "./pages/index.js";
import { S, aiBusy, biz, vals } from "./store.js";
import { $, esc } from "./util.js";

/** UI state that survives re-renders. */
export const ui = {
  route: "dashboard",
  curConv: null,
  composeAs: "client",
  gq: "",
};

const ICONS = {
  dashboard: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  inbox: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  pipeline: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clients: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-5.6"/>',
  services: '<path d="M6 3l12 18M18 3 6 21"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/>',
  staff: '<circle cx="12" cy="7" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
  payments: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  knowledge: '<path d="M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M8 8h6M8 12h6"/>',
  analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  business:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;
const NAV = [
  ["dashboard", "Dashboard"], ["inbox", "Chats"], ["pipeline", "Sales funnel"], ["calendar", "Calendar"], ["clients", "Clients"], ["sep"],
  ["services", "Services"], ["staff", "Staff"], ["payments", "Payments"], ["sep"],
  ["knowledge", "AI knowledge base"], ["analytics", "Analytics"], ["database", "Database"], ["business", "Business setup"],
];

export function go(r) {
  if (location.hash !== "#" + r) location.hash = r;
  else {
    ui.route = r;
    render();
  }
}

function renderRail() {
  const needs = vals("conversations").filter((c) => c.needs_human || (c.messages || []).slice(-1)[0]?.from === "client").length;
  $("#rail").innerHTML =
    `<button class="menu" id="railToggle" title="Expand menu">${icon("menu")}<span class="lbl">Menu</span></button>` +
    NAV.map(([k, l]) =>
      k === "sep"
        ? '<div class="sep"></div>'
        : `<button data-go="${k}" class="${ui.route === k ? "on" : ""}" title="${l}" aria-label="${l}">${icon(k)}<span class="lbl">${l}</span>${k === "inbox" && needs ? `<span class="badge">${needs}</span>` : ""}</button>`,
    ).join("");
}

let queued = false;
export function scheduleRender() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    render();
  });
}

export function render() {
  $("#bizName").textContent = biz().name || "Volonix";
  renderRail();
  const view = $("#view");
  // Keep typed text, focus and chat scroll position across re-renders.
  const keep = {};
  view.querySelectorAll("input[id]:not([type=checkbox]):not([type=file]):not([type=date]):not([type=month]),textarea[id]").forEach((el) => {
    keep[el.id] = { v: el.value, f: document.activeElement === el, s: el.selectionStart, e: el.selectionEnd };
  });
  const msgsEl = view.querySelector(".msgs");
  const atBottom = !msgsEl || msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 40;
  const prevTop = msgsEl ? msgsEl.scrollTop : 0;
  const p = PAGES[ui.route] || PAGES.dashboard;
  $("#phead").innerHTML = p.head();
  view.innerHTML = p.body();
  for (const [id, k] of Object.entries(keep)) {
    const el = document.getElementById(id);
    if (!el || el.dataset.fresh) continue;
    el.value = k.v;
    if (k.f) {
      el.focus();
      try {
        el.setSelectionRange(k.s, k.e);
      } catch {
        /* not a text input */
      }
    }
  }
  const m2 = view.querySelector(".msgs");
  if (m2) m2.scrollTop = atBottom ? m2.scrollHeight : prevTop;
  p.after?.();
  renderTyping();
}

export function renderTyping() {
  const el = $("#typing");
  if (!el) return;
  const t = ui.curConv && aiBusy[ui.curConv];
  el.innerHTML = t ? `<div class="typing"><span class="dots"><span></span><span></span><span></span></span>${esc(t)}<button class="btn sm" data-stopai="${ui.curConv}">Stop</button></div>` : "";
  if (t) {
    const m = $("#msgs");
    if (m) m.scrollTop = m.scrollHeight;
  }
}

export function modal(title, body, foot, wide) {
  $("#modal").innerHTML = `<div class="scrim" data-scrim><div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="ph"><h3>${esc(title)}</h3><span class="grow"></span><button class="x" data-close aria-label="Close">×</button></div><div class="mb">${body}</div>${foot ? `<div class="mf">${foot}</div>` : ""}</div></div>`;
  const f = $("#modal input:not([type=hidden]),#modal select,#modal textarea");
  f?.focus();
}
export const closeModal = () => ($("#modal").innerHTML = "");

export function initChrome() {
  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-go]");
    if (g) return go(g.dataset.go);
    if (e.target.closest("#railToggle")) {
      $("#app").classList.toggle("wide");
      try {
        localStorage.setItem("crm-wide", $("#app").classList.contains("wide") ? "1" : "");
      } catch {
        /* storage blocked */
      }
    }
    if (e.target.matches("[data-scrim]") || e.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
  try {
    if (localStorage.getItem("crm-wide")) $("#app").classList.add("wide");
  } catch {
    /* storage blocked */
  }
  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (PAGES[h]) {
      ui.route = h;
      render();
    }
  });
  $("#gsearch").addEventListener("input", (e) => {
    ui.gq = e.target.value.trim().toLowerCase();
    if (ui.gq && ui.route !== "clients") go("clients");
    else scheduleRender();
  });
  const tick = () => {
    const n = new Date();
    $("#clock").textContent = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][n.getDay()] + " " + n.toTimeString().slice(0, 5);
  };
  setInterval(tick, 30000);
  tick();
}

export { S };
