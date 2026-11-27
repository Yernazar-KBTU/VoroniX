// Analytics, database explorer with the SQL console, and business setup.

import { api } from "../api.js";
import { S, act, active, biz, meta, revenueOf, vals } from "../store.js";
import { render } from "../ui.js";
import { $, businessCurrency, count, esc, head, money, msIcon, isMessenger, nowLocal, ymd } from "../util.js";

let anMonth = null; // the business's current month, set on first use
let noShows = null;
let aiStats = null;
async function loadAnalytics() {
  anMonth ??= ymd(nowLocal()).slice(0, 7);
  [noShows, aiStats] = await Promise.all([api.get(`/analytics/no-shows?month=${anMonth}`), api.get("/analytics/ai")]);
  render();
}

export const analytics = {
  head: () => (anMonth ??= ymd(nowLocal()).slice(0, 7)) && head("Analytics", "", `<input type="month" class="inp" id="anMonth" data-fresh="1" value="${anMonth}" style="width:auto" aria-label="Month">`),
  body() {
    if (!noShows) {
      loadAnalytics().catch(() => {});
      return `<div class="panel pad muted">Loading…</div>`;
    }
    const A = vals("appointments").filter((a) => a.start_datetime.startsWith(anMonth));
    const ch = {};
    A.filter(active).forEach((a) => (ch[a.source || "Admin"] = (ch[a.source || "Admin"] || 0) + 1));
    const chMax = Math.max(1, ...Object.values(ch));
    const top = noShows[0];
    return `<div class="grid g2">
  <section class="panel tw"><div class="ph"><h3>No-shows by service</h3><span class="grow"></span><span class="muted small">Finished visits in the month</span></div>
   <table class="t" data-testid="noshow-table"><thead><tr><th>Service</th><th>Finished visits</th><th>No-shows</th><th>No-show %</th><th style="text-align:right">Lost revenue</th></tr></thead><tbody>${
     noShows.map((r) => `<tr><td><b>${esc(r.service)}</b></td><td>${r.finished_visits}</td><td>${r.no_shows}</td><td><div style="display:flex;gap:8px;align-items:center"><span style="width:44px">${r.no_show_pct}%</span><div class="hbar" style="flex:1"><i style="width:${Math.min(100, r.no_show_pct * 2)}%"></i></div></div></td><td style="text-align:right">${money(r.lost_revenue_kzt)}</td></tr>`).join("") ||
     `<tr><td colspan="5"><div class="empty"><b>No finished visits this month</b></div></td></tr>`
   }</tbody></table>
   ${top && top.no_show_pct >= 15 ? `<div class="pad"><div class="banner"><b>Decision:</b> ${esc(top.service)} has ${top.no_show_pct}% no-shows and lost ${money(top.lost_revenue_kzt)}. Keep the ${biz().prepay_percent}% prepayment for services from ${money(biz().prepay_min_price)} (Business setup).</div></div>` : ""}</section>
  <section class="panel"><div class="ph"><h3>Bookings by channel</h3></div><div class="pad" style="display:flex;flex-direction:column;gap:10px">${
    Object.entries(ch).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div><div style="display:flex;justify-content:space-between"><span>${isMessenger(k) ? msIcon(k) + " " : ""}${esc(k)}</span><b>${v}</b></div><div class="hbar"><i style="width:${(100 * v) / chMax}%;background:var(--accent)"></i></div></div>`).join("") || '<div class="muted">No bookings</div>'
  }
   <div class="muted small">Revenue this month: <b>${money(revenueOf(A))}</b> from ${count(A.filter((a) => a.status === "Completed").length, "completed visit")}.</div></div></section>
  <section class="panel tw" style="grid-column:1/-1"><div class="ph"><h3>AI reply time</h3><span class="grow"></span><span class="muted small">Goal: a reply within 5 seconds</span></div>
   <table class="t"><thead><tr><th>Engine</th><th>Replies</th><th>Average</th><th>p50</th><th>p95</th><th>Max</th><th>Within 5 s</th><th>Handed to human</th><th>Errors</th></tr></thead><tbody>${
     (aiStats || []).map((r) => `<tr><td class="code">${esc(r.engine)}</td><td>${r.runs}</td><td>${r.avg_ms} ms</td><td>${r.p50_ms} ms</td><td>${r.p95_ms} ms</td><td>${r.max_ms} ms</td><td>${r.within_5s_pct}%</td><td>${r.handoffs}</td><td>${r.errors}</td></tr>`).join("") || `<tr><td colspan="9" class="muted">No AI replies yet</td></tr>`
   }</tbody></table></section></div>`;
  },
  after() {
    const m = $("#anMonth");
    m?.addEventListener("change", () => {
      if (m.value) {
        anMonth = m.value;
        noShows = null;
        render();
      }
    });
  },
};

/* database explorer */
const SCHEMA = [
  ["clients", "client_id", [], ["display_name", "phone", "created_at", "notes"]],
  ["client_channels", "channel_id", [["client_id", "clients"]], ["messenger", "external_user_id"]],
  ["services", "service_code", [], ["name", "duration_min", "price_kzt", "category", "is_active"]],
  ["masters", "master_id", [], ["full_name", "specialization", "work_start", "work_end", "days", "is_active"]],
  ["master_services", "(master_id, service_code)", [["master_id", "masters"], ["service_code", "services"]], ["skill_level", "since_date"]],
  ["appointments", "appointment_id", [["client_id", "clients"], ["master_id, service_code", "master_services"]], ["start_datetime", "end_datetime", "status", "source"]],
  ["payments", "payment_id", [["appointment_id", "appointments"]], ["amount_kzt", "kind", "method", "status", "created_at", "paid_at"]],
  ["conversations", "conversation_id", [["client_id", "clients"], ["appointment_id", "appointments"]], ["messenger", "contact", "stage", "ai_enabled", "needs_human"]],
  ["knowledge", "entry_id", [], ["title", "category", "content", "updated_at"]],
];
const PRESETS = [
  `SELECT service, finished_visits, no_shows, no_show_pct, lost_revenue_kzt
FROM v_no_show_by_service
WHERE month = date_trunc('month', now())::date
ORDER BY no_show_pct DESC;`,
  `SELECT c.client_id, c.display_name, COUNT(*) AS visits, SUM(s.price_kzt) AS spent_kzt
FROM appointments a
JOIN clients c  ON c.client_id = a.client_id
JOIN services s ON s.service_code = a.service_code
WHERE a.status = 'Completed'
GROUP BY c.client_id, c.display_name
ORDER BY spent_kzt DESC
LIMIT 10;`,
  `SELECT to_char(a.start_at, 'HH24:MI') AS time, m.full_name AS master, c.display_name AS client, s.name AS service, a.status
FROM appointments a
JOIN masters m  ON m.master_id = a.master_id
JOIN clients c  ON c.client_id = a.client_id
JOIN services s ON s.service_code = a.service_code
WHERE a.start_at::date = CURRENT_DATE
ORDER BY a.start_at;`,
  `-- one master can never have two visits at the same time (should return 0 rows)
SELECT a.appointment_id, b.appointment_id AS overlaps_with, a.master_id, a.start_at
FROM appointments a
JOIN appointments b ON a.master_id = b.master_id AND a.appointment_id < b.appointment_id
 AND tsrange(a.start_at, a.end_at) && tsrange(b.start_at, b.end_at)
WHERE a.status <> 'Cancelled' AND b.status <> 'Cancelled';`,
];
let dbTable = "appointments";
let sqlText = PRESETS[0];
let sqlOut = "";

export const database = {
  head: () => head("Database", "The PostgreSQL tables behind every screen, with a read-only SQL console.", ""),
  body() {
    const t = SCHEMA.find((x) => x[0] === dbTable);
    const rows = vals(t[0]).slice(0, 60);
    const cols = [...t[2].flatMap((f) => f[0].split(", ")), ...t[3]];
    return `<div class="grid dbwrap">
  <section class="panel pad"><div class="tbl-list">${SCHEMA.map(([n]) => `<button data-dbt="${n}" class="${n === dbTable ? "on" : ""}"><span class="code">${n}</span><span class="muted small">${Object.keys(S[n]).length}</span></button>`).join("")}</div></section>
  <div class="grid" style="min-width:0">
  <section class="panel"><div class="ph"><h3 class="code">${t[0]}</h3><span class="grow"></span><span class="small"><span class="key pk">PK</span>${esc(t[1])} ${t[2].map((f) => `<span class="key fk">FK</span>${f[0]} → ${f[1]}`).join(" ")}</span></div>
   <div class="tw" style="max-height:340px;overflow:auto"><table class="t"><thead><tr><th><span class="key pk">PK</span>id</th>${cols.map((c) => `<th>${t[2].some((f) => f[0].split(", ").includes(c)) ? '<span class="key fk">FK</span>' : ""}${c}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr><td class="code">${esc(r.id)}</td>${cols.map((c) => `<td class="ell" style="max-width:220px">${esc(Array.isArray(r[c]) ? r[c].join(",") : r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
   <div class="ph" style="border-top:1px solid var(--line);border-bottom:0"><span class="muted small">Showing ${rows.length} of ${Object.keys(S[t[0]]).length} rows</span></div></section>
  <section class="panel"><div class="ph"><h3>SQL console</h3><span class="grow"></span><span class="muted small">PostgreSQL · read-only role · 3 s timeout</span></div><div class="pad" style="display:flex;flex-direction:column;gap:10px">
   <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-sqlp="0">No-shows by service</button><button class="btn sm" data-sqlp="1">Top clients by spend</button><button class="btn sm" data-sqlp="2">Today's schedule</button><button class="btn sm" data-sqlp="3">Double-booking check</button></div>
   <textarea class="sql" id="sqlBox" spellcheck="false" aria-label="SQL query">${esc(sqlText)}</textarea>
   <div><button class="btn primary" data-runsql>Run query</button></div><div class="tw" id="sqlOut">${sqlOut}</div></div></section></div></div>`;
  },
};

async function runSQL() {
  sqlText = $("#sqlBox").value;
  const out = $("#sqlOut");
  out.innerHTML = '<span class="muted">Running…</span>';
  try {
    const r = await api.post("/sql", { query: sqlText });
    sqlOut = r.columns.length
      ? `<table class="t"><thead><tr>${r.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${r.rows.slice(0, 200).map((v) => `<tr>${v.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table><div class="muted small" style="padding:6px 0">${r.row_count} rows · ${r.ms} ms</div>`
      : `<span class="muted">Query ran in ${r.ms} ms. No rows returned.</span>`;
  } catch (err) {
    sqlOut = `<div class="banner" style="background:var(--red-soft)">${esc(err.message)}</div>`;
  }
  out.innerHTML = sqlOut;
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-dbt]");
  if (t) {
    dbTable = t.dataset.dbt;
    return render();
  }
  const p = e.target.closest("[data-sqlp]");
  if (p) {
    sqlText = PRESETS[+p.dataset.sqlp];
    $("#sqlBox").value = sqlText;
    return;
  }
  if (e.target.closest("[data-runsql]")) runSQL();
});

/* business setup */
export const business = {
  head: () => head("Business setup", "Make the CRM fit your business. The AI reads all of this.", ""),
  body() {
    const b = biz();
    return `<form class="panel" id="bizForm"><div class="ph"><h3>Business profile</h3></div><div class="pad" style="display:flex;flex-direction:column;gap:14px">
  <div class="frow"><div class="f"><label for="b_name">Business name</label><input id="b_name" value="${esc(b.name)}"></div><div class="f"><label for="b_type">Type of business</label><input id="b_type" value="${esc(b.type)}" placeholder="Barbershop, beauty salon, dental clinic…"></div><div class="f"><label for="b_city">City</label><input id="b_city" value="${esc(b.city)}"></div></div>
  <div class="frow"><div class="f"><label for="b_address">Address</label><input id="b_address" value="${esc(b.address)}"></div><div class="f"><label for="b_hours">Opening hours</label><input id="b_hours" value="${esc(b.hours)}"></div><div class="f"><label for="b_phone">Phone</label><input id="b_phone" value="${esc(b.phone)}"></div></div>
  <div class="frow"><div class="f"><label for="b_staff">What you call staff</label><input id="b_staff" value="${esc(b.staff_label)}" placeholder="Master, Doctor, Trainer"></div><div class="f"><label for="b_svc">What you call services</label><input id="b_svc" value="${esc(b.service_label)}" placeholder="Service, Procedure, Class"></div><div class="f"><label for="b_lang">Client languages</label><input id="b_lang" value="${esc(b.languages)}"></div></div>
 </div><div class="ph" style="border-top:1px solid var(--line)"><h3>AI administrator</h3><span class="pill ai">AI</span></div><div class="pad" style="display:flex;flex-direction:column;gap:14px">
  <div class="f"><label for="b_engine">Who answers the chats</label><select id="b_engine">
   <option value="voronix" ${b.ai_engine !== "claude" && b.ai_engine !== "voronixai" ? "selected" : ""}>VoroniX AI (our own)</option>
   <option value="claude" ${b.ai_engine === "claude" ? "selected" : ""} ${meta.claude_available ? "" : "disabled"}>Claude${meta.claude_available ? "" : " (connect an Anthropic key in Integrations first)"}</option>
   <option value="voronixai" ${b.ai_engine === "voronixai" ? "selected" : ""} ${meta.voronixai_available ? "" : "disabled"}>VoroniX.ai (guard, PII masking, model router)${meta.voronixai_available ? "" : " (set VORONIXAI_URL on the server first)"}</option>
  </select></div>
  <div class="f"><label for="b_tone">Tone of voice</label><textarea id="b_tone">${esc(b.tone)}</textarea></div>
  <div class="f"><label for="b_catch">Brand phrase (the AI uses it in greetings and confirmations)</label><input id="b_catch" value="${esc(b.catchphrase || "")}" placeholder="e.g. Красота начинается с заботы ✨"></div>
  <div class="frow"><div class="f"><label for="b_pp">Prepayment, % of price</label><input id="b_pp" type="number" min="0" max="100" value="${esc(b.prepay_percent)}"></div><div class="f"><label for="b_ppmin">Prepayment needed from price, ${esc(businessCurrency())}</label><input id="b_ppmin" type="number" min="0" value="${esc(b.prepay_min_price)}"></div></div>
  <label class="switch"><input type="checkbox" id="b_auto" ${b.autopilot !== false ? "checked" : ""}> New chats start with AI autopilot on</label>
 </div><div class="mf" style="border-top:1px solid var(--line)">${meta.features?.demo_reset ? `<button class="btn danger" type="button" data-act="resetDemo">Reset demo data…</button>` : ""}<span style="flex:1"></span><button class="btn create" type="submit">Save</button></div></form>`;
  },
};

document.addEventListener("submit", (e) => {
  if (e.target.id !== "bizForm") return;
  e.preventDefault();
  const v = (id) => document.getElementById(id).value;
  act(
    api.put("/settings", {
      name: v("b_name"), type: v("b_type"), city: v("b_city"), address: v("b_address"), hours: v("b_hours"), phone: v("b_phone"),
      staff_label: v("b_staff"), service_label: v("b_svc"), languages: v("b_lang"), tone: v("b_tone"), catchphrase: v("b_catch"),
      prepay_percent: +v("b_pp") || 0, prepay_min_price: +v("b_ppmin") || 0, autopilot: document.getElementById("b_auto").checked,
      ai_engine: v("b_engine"),
    }),
    "Saved. The AI uses the new settings from the next message.",
  ).catch(() => {});
});
