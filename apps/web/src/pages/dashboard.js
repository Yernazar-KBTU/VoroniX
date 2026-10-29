import { S, active, apptEnd, cli, mst, revenueOf, svc, vals } from "../store.js";
import { DOW, addDays, esc, head, money, msIcon, parseDT, pill, ymd } from "../util.js";

export const dashboard = {
  head: () => head("Dashboard", "", `<button class="btn create" data-act="newAppt">+ New booking</button>`),
  body() {
    const now = new Date();
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
    const next = tod.find((a) => parseDT(a.start_datetime) > now);
    return `<div class="grid" style="gap:14px">
  <div class="grid g4">
    <div class="kpi b" data-testid="kpi-today"><span class="k">Visits today</span><span class="v">${tod.length}</span><span class="s">${next ? "Next at " + next.start_datetime.slice(11) + " · " + esc(cli(next.client_id)?.display_name || "") : "No more visits today"}</span></div>
    <div class="kpi g"><span class="k">Revenue this month</span><span class="v">${money(revenueOf(monthA))}</span><span class="s">${monthA.filter((a) => a.status === "Completed").length} completed visits</span></div>
    <div class="kpi vi"><span class="k">Chats closed by AI</span><span class="v">${C.length ? Math.round((100 * aiOnly) / C.length) : 0}%</span><span class="s">${aiOnly} of ${C.length} without a human</span></div>
    <div class="kpi r"><span class="k">No-show rate, 30 days</span><span class="v">${nsr}%</span><span class="s">${noShows} missed of ${last30.length} visits</span></div>
  </div>
  <div class="grid g2">
    <section class="panel"><div class="ph"><h3>Today · ${DOW[now.getDay()]} ${today}</h3><span class="grow"></span><button class="btn sm" data-go="calendar">Open calendar</button></div>
      <div class="list">${
        tod.length
          ? tod.map((a) => `<div class="li click" data-appt="${a.id}" style="cursor:pointer"><span class="time">${a.start_datetime.slice(11)}</span><div class="grow"><div class="ell"><b>${esc(cli(a.client_id)?.display_name || a.client_id)}</b> · ${esc(svc(a.service_code)?.name || a.service_code)}</div><div class="muted small">${esc(mst(a.master_id)?.full_name || "")} · via ${esc(a.source || "")}</div></div>${pill(a.status)}</div>`).join("")
          : `<div class="empty"><b>No visits today</b>New bookings from chats appear here.</div>`
      }</div></section>
    <section class="panel"><div class="ph"><h3>Needs attention</h3></div><div class="list">
      ${human.map((c) => `<div class="li"><span class="pill human">Human</span><div class="grow ell">${msIcon(c.messenger)} ${esc(c.contact)} · ${esc((c.messages || []).slice(-1)[0]?.text || "")}</div><button class="btn sm" data-openconv="${c.id}">Open</button></div>`).join("")}
      ${unpaid.map((p) => { const a = S.appointments[p.appointment_id]; return `<div class="li"><span class="pill Pending">Unpaid</span><div class="grow ell">${money(p.amount_kzt)} · ${esc(a ? cli(a.client_id)?.display_name : "")} · ${esc(a ? a.start_datetime : "")}</div></div>`; }).join("")}
      ${stale.slice(0, 6).map((a) => `<div class="li"><span class="pill warn">Not closed</span><div class="grow"><div class="ell">${esc(cli(a.client_id)?.display_name || "")} · ${esc(svc(a.service_code)?.name || "")}</div><div class="muted small">${a.start_datetime} · still “${a.status}”</div></div><button class="btn sm" data-setst="${a.id}|Completed">Completed</button><button class="btn sm danger" data-setst="${a.id}|No-show">No-show</button></div>`).join("")}
      ${!human.length && !unpaid.length && !stale.length ? `<div class="empty"><b>All clear</b>Chats waiting for a human, unpaid links and visits that were not closed show up here.</div>` : ""}
    </div></section>
  </div>
  <section class="panel"><div class="ph"><h3>Revenue, last 14 days</h3><span class="grow"></span><span class="muted small">Completed visits × service price</span></div>
    <div class="pad"><div class="bars">${days.map((x) => `<div style="height:${Math.round((100 * x.v) / mx)}%" title="${x.d}: ${money(x.v)}"></div>`).join("")}</div>
    <div style="display:flex;justify-content:space-between" class="muted small"><span>${days[0].d}</span><span>max ${money(mx)}</span><span>${days[13].d}</span></div></div></section>
  </div>`;
  },
};
