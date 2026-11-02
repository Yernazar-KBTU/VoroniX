// Sales funnel (kanban) and calendar.

import { api } from "../api.js";
import { S, act, active, cli, svc, vals } from "../store.js";
import { render } from "../ui.js";
import { $, DOW, addDays, esc, head, money, msIcon, nowLocal, pad, parseDT, toMin, ymd } from "../util.js";
import { STAGES } from "./inbox.js";

export const pipeline = {
  head: () => head("Sales funnel", "Every chat is a deal. The AI moves cards when it books and when the client pays. Drag to move by hand.", `<button class="btn create" data-act="newConv">+ New chat</button>`),
  body() {
    const C = vals("conversations");
    return `<div class="board">${STAGES.map(([s, col]) => {
      const items = C.filter((c) => (c.stage || "New") === s);
      const sum = items.reduce((t, c) => {
        const a = S.appointments[c.appointment_id];
        return t + (a ? svc(a.service_code)?.price_kzt || 0 : 0);
      }, 0);
      return `<div class="col" data-drop="${s}" style="--c:${col}"><div class="hd"><span>${s} · ${items.length}</span><span class="muted small">${sum ? money(sum) : ""}</span></div><div class="bd">${
        items
          .map((c) => {
            const a = S.appointments[c.appointment_id];
            const lastText = ((c.messages || []).filter((m) => m.text && m.from !== "system").slice(-1)[0] || {}).text || "";
            return `<div class="card" draggable="true" data-drag="${c.id}" data-openconv="${c.id}"><div style="display:flex;gap:6px;align-items:center">${msIcon(c.messenger)}<b class="ell">${esc(c.contact)}</b></div>${a ? `<div class="small">${esc(svc(a.service_code)?.name)} · ${a.start_datetime}</div>` : ""}<div class="muted small ell">${esc(lastText)}</div><div style="display:flex;gap:6px">${c.needs_human ? '<span class="pill human">Human</span>' : c.ai_enabled ? '<span class="pill ai">AI</span>' : ""}</div></div>`;
          })
          .join("") || '<div class="muted small" style="padding:8px">Empty</div>'
      }</div></div>`;
    }).join("")}</div>`;
  },
};

document.addEventListener("dragstart", (e) => {
  const d = e.target.closest?.("[data-drag]");
  if (d) e.dataTransfer.setData("text/plain", d.dataset.drag);
});
document.addEventListener("dragover", (e) => {
  const c = e.target.closest?.("[data-drop]");
  if (c) {
    e.preventDefault();
    c.classList.add("over");
  }
});
document.addEventListener("dragleave", (e) => e.target.closest?.("[data-drop]")?.classList.remove("over"));
document.addEventListener("drop", (e) => {
  const c = e.target.closest?.("[data-drop]");
  if (!c) return;
  e.preventDefault();
  const id = e.dataTransfer.getData("text/plain");
  if (S.conversations[id]) act(api.patch(`/conversations/${id}`, { stage: c.dataset.drop })).catch(() => {});
});

let calDay = null; // the business's today, set on first render
export const calendar = {
  head: () =>
    (calDay ??= ymd(nowLocal())) &&
    head(
      "Calendar",
      "",
      `<button class="btn create" data-act="newAppt">+ New booking</button><div class="tabs"><button data-cal="-1" aria-label="Previous day">←</button><button data-cal="0" class="${calDay === ymd(nowLocal()) ? "on" : ""}">Today</button><button data-cal="1" aria-label="Next day">→</button></div><input type="date" class="inp" id="calPick" data-fresh="1" value="${calDay}" style="width:auto" aria-label="Day">`,
    ),
  body() {
    const M = vals("masters").filter((m) => m.is_active !== false);
    const day = parseDT(calDay + " 00:00");
    const start = 9 * 60, end = 20 * 60, rows = (end - start) / 30, RH = 28, HH = 48;
    const A = vals("appointments").filter((a) => a.start_datetime.startsWith(calDay));
    let html = `<div class="cal" style="grid-template-columns:56px repeat(${M.length},minmax(150px,1fr))"><div class="hh"></div>${M.map((m) => `<div class="hh">${esc(m.full_name)}<div class="muted small">${esc(m.specialization)} · ${(m.days || []).includes(day.getDay()) ? m.work_start + "–" + m.work_end : "day off"}</div></div>`).join("")}`;
    for (let r = 0; r < rows; r++) {
      const t = start + r * 30;
      html += `<div class="tm">${r % 2 === 0 ? pad((t / 60) | 0) + ":00" : ""}</div>` + M.map((m) => `<div class="cell ${r % 2 ? "half" : ""}" data-newat="${m.id}|${calDay} ${pad((t / 60) | 0)}:${pad(t % 60)}"></div>`).join("");
    }
    html += `</div>`;
    const evs = A.map((a) => {
      const ci = M.findIndex((m) => m.id === a.master_id);
      if (ci < 0) return "";
      const st = toMin(a.start_datetime.slice(11));
      const dur = svc(a.service_code)?.duration_min || 60;
      const top = HH + ((st - start) / 30) * RH;
      const h = Math.max(RH - 2, (dur / 30) * RH - 3);
      return `<div class="ev ${a.status}" data-appt="${a.id}" style="top:${top}px;height:${h}px;left:calc(56px + (100% - 56px) * ${ci}/${M.length} + 3px);width:calc((100% - 56px)/${M.length} - 6px)"><b>${a.start_datetime.slice(11)}</b> ${esc(cli(a.client_id)?.display_name || a.client_id)}<br><span class="muted">${esc(svc(a.service_code)?.name || "")}</span></div>`;
    }).join("");
    const now = nowLocal();
    let nl = "";
    if (calDay === ymd(now)) {
      const mm = now.getHours() * 60 + now.getMinutes();
      if (mm >= start && mm <= end) nl = `<div class="nowline" style="top:${HH + ((mm - start) / 30) * RH}px"></div>`;
    }
    return `<div class="panel tw"><div style="position:relative;min-width:${56 + M.length * 150}px">${html}${evs}${nl}</div></div><p class="muted small" style="color:var(--chrome-dim)">${DOW[day.getDay()]} ${calDay} · ${A.filter(active).length} bookings. Click an empty cell to book, click a booking to change it.</p>`;
  },
  after() {
    const p = $("#calPick");
    p?.addEventListener("change", () => {
      if (p.value) {
        calDay = p.value;
        render();
      }
    });
  },
};

document.addEventListener("click", (e) => {
  const c = e.target.closest("[data-cal]");
  if (!c) return;
  const v = +c.dataset.cal;
  calDay = v === 0 ? ymd(nowLocal()) : ymd(addDays(parseDT(calDay + " 00:00"), v));
  render();
});
