// Dashboard: the day at a glance, and a getting-started card while a new
// business is still setting up.

import { api } from "../api.js";
import { S, active, apptEnd, biz, cli, meta, mst, revenueOf, svc, vals } from "../store.js";
import { render } from "../ui.js";
import { DOW, addDays, businessCurrency, count, esc, head, money, msIcon, nowLocal, parseDT, pill, ymd } from "../util.js";

const KI = {
  today: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="m9 14.5 2 2 4-4"/>',
  revenue: '<path d="M4 18V6M4 18h16"/><path d="m7.5 14 3.5-3.5 3 3L19 8.5"/>',
  ai: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l.9-4.4A8 8 0 1 1 20 12z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  noshow: '<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/>',
};
const ki = (n) => `<span class="ki"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${KI[n]}</svg></span>`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ---------- getting started ---------- */

const MESSENGERS = new Set(["telegram", "whatsapp", "instagram"]);
const integ = { list: null, at: 0, busy: false };
async function loadIntegrations() {
  integ.busy = true;
  try {
    integ.list = await api.get("/integrations");
  } catch {
    integ.list ??= [];
  } finally {
    integ.at = Date.now();
    integ.busy = false;
  }
  render();
}

let hiddenNow = false;
const hideKey = () => `vx-getting-started-hidden:${meta.business?.id ?? ""}`;
function isHidden() {
  if (hiddenNow) return true;
  try {
    return localStorage.getItem(hideKey()) === "1";
  } catch {
    return false;
  }
}

function steps() {
  const b = biz();
  const messenger = (integ.list || []).some((i) => MESSENGERS.has(i.id) && i.status === "connected");
  return [
    { done: Boolean(b.address || b.hours || b.city || b.phone), t: "Describe your business", d: "Address, hours and tone of voice. The AI reads all of it.", go: "business" },
    { done: vals("services").length > 0, t: "Add your services", d: "Names, prices and how long each one takes.", go: "services" },
    { done: vals("masters").length > 0, t: "Add your team", d: "Who works when, and which services each person does.", go: "staff" },
    { done: vals("knowledge").length > 0, t: "Teach the AI", d: "Paste your rules and answers to common questions.", go: "knowledge" },
    { done: messenger, t: "Connect a messenger", d: "Telegram with a bot token. WhatsApp and Instagram through a bridge.", go: "integrations" },
    { done: vals("conversations").length > 0, t: "Try a test chat", d: "Write as a client and watch the AI book a visit.", act: "newConv" },
  ];
}

function gettingStarted() {
  if (isHidden()) return "";
  if (!integ.busy && Date.now() - integ.at > 30000) loadIntegrations();
  const list = steps();
  const n = list.filter((s) => s.done).length;
  if (n === list.length) return "";
  const first = (meta.user?.full_name || "").trim().split(/\s+/)[0];
  const title = n === 0 ? `Welcome${first ? ", " + esc(first) : ""}! Let's set up ${esc(biz().name || "your business")}` : `Finish setting up ${esc(biz().name || "your business")}`;
  // The demo is a barbershop in Almaty with prices in tenge, so it only makes sense for a tenge business.
  const demo = meta.features?.demo_reset && businessCurrency() === "KZT";
  return `<section class="onb" aria-label="Getting started">
  <button class="x" type="button" data-onbhide aria-label="Hide getting started">×</button>
  <h2>${title}</h2>
  <p class="lead">${n} of ${list.length} done. The AI answers clients using only what you add here.</p>
  <div class="bar" role="progressbar" aria-label="Setup progress" aria-valuemin="0" aria-valuemax="${list.length}" aria-valuenow="${n}"><i style="width:${Math.round((100 * n) / list.length)}%"></i></div>
  <div class="onb-steps">${list
    .map((s, i) => `<button type="button" class="onb-step ${s.done ? "done" : ""}" ${s.go ? `data-go="${s.go}"` : `data-act="${s.act}"`}><span class="n">${s.done ? "✓" : i + 1}</span><span><b>${s.t}</b><span>${s.d}</span></span></button>`)
    .join("")}</div>
  <div class="onb-foot">Have a price list, a staff schedule or a client list in Excel, Word or PDF? <button class="btn sm" type="button" data-act="import">Import it</button>${demo ? ` Want to look around first? <button class="btn sm" type="button" data-act="resetDemo">Load the demo barbershop</button>` : ""}</div>
</section>`;
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-onbhide]")) return;
  hiddenNow = true;
  try {
    localStorage.setItem(hideKey(), "1");
  } catch {
    /* storage blocked: hidden until the page reloads */
  }
  render();
});

/* ---------- the page ---------- */

function greeting() {
  const h = nowLocal().getHours();
  const part = h >= 5 && h < 12 ? "Good morning" : h >= 12 && h < 18 ? "Good afternoon" : "Good evening";
  const first = (meta.user?.full_name || "").trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

export const dashboard = {
  head() {
    const n = nowLocal();
    return head(greeting(), `${DAYS[n.getDay()]}, ${MONTHS[n.getMonth()]} ${n.getDate()} at ${esc(biz().name || "your business")}`, `<button class="btn create" data-act="newAppt">+ New booking</button>`);
  },
  body() {
    const now = nowLocal();
    const today = ymd(now);
    const A = vals("appointments");
    const tod = A.filter((a) => a.start_datetime.startsWith(today) && active(a)).sort((a, b) => (a.start_datetime < b.start_datetime ? -1 : 1));
    const monthA = A.filter((a) => a.start_datetime.startsWith(today.slice(0, 7)));
    const last30 = A.filter((a) => {
      const d = parseDT(a.start_datetime);
      return d < now && d > addDays(now, -30) && (a.status === "Completed" || a.status === "No-show");
    });
    const noShows = last30.filter((a) => a.status === "No-show").length;
    const nsr = last30.length ? Math.round((100 * noShows) / last30.length) : 0;
    const C = vals("conversations");
    const aiOnly = C.filter((c) => !c.needs_human && (c.messages || []).some((m) => m.from === "ai")).length;
    const stale = A.filter((a) => (a.status === "Booked" || a.status === "Confirmed") && apptEnd(a) < now).sort((a, b) => (a.start_datetime < b.start_datetime ? -1 : 1));
    const human = C.filter((c) => c.needs_human);
    const unpaid = vals("payments").filter((p) => p.status === "Pending");
    const days = [...Array(14)].map((_, i) => {
      const d = ymd(addDays(now, i - 13));
      return { d, v: revenueOf(A.filter((a) => a.start_datetime.startsWith(d))) };
    });
    const mx = Math.max(1, ...days.map((x) => x.v));
    const total14 = days.reduce((s, x) => s + x.v, 0);
    const next = tod.find((a) => parseDT(a.start_datetime) > now);
    return `<div class="grid" style="gap:16px">
  ${gettingStarted()}
  <div class="grid g4">
    <div class="kpi b" data-testid="kpi-today">${ki("today")}<span class="k">Visits today</span><span class="v">${tod.length}</span><span class="s">${next ? "Next at " + next.start_datetime.slice(11) + " · " + esc(cli(next.client_id)?.display_name || "") : "No more visits today"}</span></div>
    <div class="kpi g">${ki("revenue")}<span class="k">Revenue this month</span><span class="v">${money(revenueOf(monthA))}</span><span class="s">${count(monthA.filter((a) => a.status === "Completed").length, "completed visit")}</span></div>
    <div class="kpi vi">${ki("ai")}<span class="k">Chats closed by AI</span><span class="v">${C.length ? Math.round((100 * aiOnly) / C.length) : 0}%</span><span class="s">${aiOnly} of ${C.length} without a human</span></div>
    <div class="kpi r">${ki("noshow")}<span class="k">No-shows, 30 days</span><span class="v">${nsr}%</span><span class="s">${noShows} missed of ${count(last30.length, "visit")}</span></div>
  </div>
  <div class="grid g2">
    <section class="panel"><div class="ph"><h3>Today · ${DOW[now.getDay()]} ${today}</h3><span class="grow"></span><button class="btn sm" data-go="calendar">Open calendar</button></div>
      <div class="list">${
        tod.length
          ? tod.map((a) => `<div class="li click" data-appt="${a.id}" style="cursor:pointer"><span class="time">${a.start_datetime.slice(11)}</span><div class="grow"><div class="ell"><b>${esc(cli(a.client_id)?.display_name || a.client_id)}</b> · ${esc(svc(a.service_code)?.name || a.service_code)}</div><div class="muted small">${esc(mst(a.master_id)?.full_name || "")} · via ${esc(a.source || "")}</div></div>${pill(a.status)}</div>`).join("")
          : `<div class="empty"><b>No visits today</b>Bookings the AI makes in chats appear here.</div>`
      }</div></section>
    <section class="panel"><div class="ph"><h3>Needs attention</h3></div><div class="list">
      ${human.length ? `<div class="lgrp">Waiting for a person</div>` : ""}${human.map((c) => `<div class="li">${msIcon(c.messenger)}<div class="grow"><div class="ell"><b>${esc(c.contact)}</b></div><div class="muted small ell">${esc((c.messages || []).slice(-1)[0]?.text || "")}</div></div><button class="btn sm" data-openconv="${c.id}">Open</button></div>`).join("")}
      ${unpaid.length ? `<div class="lgrp">Unpaid prepayments</div>` : ""}${unpaid.map((p) => { const a = S.appointments[p.appointment_id]; return `<div class="li"><div class="grow"><div class="ell"><b>${esc(a ? cli(a.client_id)?.display_name || "" : "")}</b></div><div class="muted small ell">${esc(a ? a.start_datetime : "")}</div></div><b class="nowrap">${money(p.amount_kzt)}</b></div>`; }).join("")}
      ${stale.length ? `<div class="lgrp">Visits to close</div>` : ""}${stale.slice(0, 6).map((a) => `<div class="li"><div class="grow"><div class="ell"><b>${esc(cli(a.client_id)?.display_name || "")}</b> · ${esc(svc(a.service_code)?.name || "")}</div><div class="muted small ell">${a.start_datetime.slice(0, 10) === ymd(nowLocal()) ? "Today " + a.start_datetime.slice(11) : a.start_datetime} · ${esc(a.status)}</div></div><button class="btn sm" data-setst="${a.id}|Completed">Completed</button><button class="btn sm danger" data-setst="${a.id}|No-show">No-show</button></div>`).join("")}
      ${!human.length && !unpaid.length && !stale.length ? `<div class="empty"><b>All clear</b>Chats waiting for a person, unpaid links and visits that were not closed show up here.</div>` : ""}
    </div></section>
  </div>
  <section class="panel"><div class="ph"><h3>Revenue, last 14 days</h3><span class="grow"></span><span class="muted small">${money(total14)} from completed visits</span></div>
    <div class="pad"><div class="bars">${days.map((x) => `<div style="height:${Math.round((100 * x.v) / mx)}%" title="${x.d}: ${money(x.v)}"></div>`).join("")}</div>
    <div style="display:flex;justify-content:space-between;margin-top:6px" class="muted small"><span>${days[0].d}</span><span>best day ${money(mx === 1 && !total14 ? 0 : mx)}</span><span>${days[13].d}</span></div></div></section>
  </div>`;
  },
};
