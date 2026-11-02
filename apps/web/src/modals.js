// Edit dialogs and every click action that changes data. Each action calls the
// REST API; the server validates, writes to PostgreSQL and broadcasts a
// "changed" event, so the store refreshes itself and the page re-renders.

import { api } from "./api.js";
import { S, act, active, apptEnd, biz, mastersFor, mst, reload, revenueOf, servicesOf, svc, vals } from "./store.js";
import { closeModal, go, modal, render, ui } from "./ui.js";
import { $, DOW, businessCurrency, dt, esc, money, msIcon, nowLocal, opt, parseDT, pill, toast } from "./util.js";

const nextHalfHour = () => {
  const d = nowLocal();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return dt(d);
};
const field = (id) => document.getElementById(id)?.value.trim() ?? "";
const checked = (sel) => [...document.querySelectorAll(sel + ":checked")].map((x) => x.value);
const banner = (el, text) => (el.innerHTML = `<div class="banner">${esc(text)}</div>`);

/* ---------- dialogs ---------- */

function apptModal(id, pre = {}) {
  const a = id ? S.appointments[id] : { status: "Booked", source: "Admin", ...pre };
  const P = id ? vals("payments").filter((p) => p.appointment_id === id) : [];
  modal(
    id ? "Booking " + id : "New booking",
    `<div class="frow"><div class="f"><label for="ap_c">Client</label><select id="ap_c">${opt(vals("clients").sort((x, y) => x.display_name.localeCompare(y.display_name)).map((c) => [c.id, c.display_name + " · " + c.id]), a.client_id)}</select></div>
   <div class="f"><label for="ap_s">Service</label><select id="ap_s">${opt(vals("services").filter((s) => s.is_active !== false).map((s) => [s.id, s.name + " · " + money(s.price_kzt)]), a.service_code)}</select></div></div>
   <div class="frow"><div class="f"><label for="ap_m">${esc(biz().staff_label || "Master")}</label><select id="ap_m">${opt(vals("masters").map((m) => [m.id, m.full_name]), a.master_id)}</select></div>
   <div class="f"><label for="ap_d">Start</label><input id="ap_d" type="datetime-local" step="1800" value="${esc((a.start_datetime || nextHalfHour()).replace(" ", "T"))}"></div>
   <div class="f"><label for="ap_st">Status</label><select id="ap_st">${opt(["Booked", "Confirmed", "Completed", "Cancelled", "No-show"].map((s) => [s, s]), a.status)}</select></div></div>
   <div id="ap_err"></div>
   ${id ? `<div><b>Payments</b> ${P.length ? P.map((p) => `<div class="small">${p.id} · ${money(p.amount_kzt)} · ${esc(p.kind)} ${pill(p.status)}</div>`).join("") : '<span class="muted small">none</span>'}</div><div class="muted small">Source: ${esc(a.source || "")} · created ${esc(a.created_at || "")}</div>` : ""}`,
    `${id ? `<button class="btn" data-takepay="${id}">Take full payment</button>` : ""}<span style="flex:1"></span><button class="btn" data-close>Close</button><button class="btn create" data-saveappt="${id || ""}">${id ? "Save" : "Book"}</button>`,
  );
}

async function saveAppt(id) {
  const code = field("ap_s"), mid = field("ap_m"), start = field("ap_d").replace("T", " ").slice(0, 16), status = field("ap_st");
  const err = $("#ap_err");
  if (!field("ap_c") || !code || !mid || !start) return banner(err, "Fill in client, service, master and time.");
  // Quick checks in the browser for a friendly message. The database enforces
  // the same rules (composite FK and exclusion constraint) for every client.
  if (!mastersFor(code).includes(mid)) return banner(err, `${mst(mid).full_name} does not do ${svc(code).name}. Pick: ${mastersFor(code).map((m) => mst(m).full_name).join(", ")}.`);
  const s = parseDT(start), end = new Date(s.getTime() + svc(code).duration_min * 60000);
  const clash = status !== "Cancelled" && vals("appointments").find((a) => a.id !== id && a.master_id === mid && active(a) && s < apptEnd(a) && end > parseDT(a.start_datetime));
  if (clash) return banner(err, `This time overlaps booking ${clash.id} (${clash.start_datetime}). One master cannot have two visits at once.`);
  const body = { client_id: field("ap_c"), service_code: code, master_id: mid, start_datetime: start, status };
  try {
    const r = id ? await api.put(`/appointments/${id}`, body) : await api.post("/appointments", body);
    closeModal();
    toast(id ? "Booking saved" : "Booked " + r.id);
  } catch (e) {
    banner(err, e.message);
  }
}

function clientModal(id) {
  const c = id ? S.clients[id] : { display_name: "", phone: "", notes: "" };
  const A = id ? vals("appointments").filter((a) => a.client_id === id).sort((a, b) => b.start_datetime.localeCompare(a.start_datetime)) : [];
  modal(
    id ? c.display_name : "New client",
    `<div class="frow"><div class="f"><label for="cl_n">Name</label><input id="cl_n" value="${esc(c.display_name)}"></div><div class="f"><label for="cl_p">Phone</label><input id="cl_p" value="${esc(c.phone)}"></div></div>
   <div class="f"><label for="cl_no">Notes (the AI sees them)</label><textarea id="cl_no">${esc(c.notes)}</textarea></div><div id="cl_err"></div>
   ${id ? `<div><b>Messengers</b><div class="small">${vals("client_channels").filter((x) => x.client_id === id).map((x) => `${msIcon(x.messenger)} <span class="code">${esc(x.external_user_id)}</span>`).join(" &nbsp; ") || "none"}</div></div>
   <div class="tw"><table class="t"><thead><tr><th>Date</th><th>Service</th><th>Master</th><th>Status</th></tr></thead><tbody>${A.slice(0, 20).map((a) => `<tr class="click" data-appt="${a.id}"><td>${a.start_datetime}</td><td>${esc(svc(a.service_code)?.name)}</td><td>${esc(mst(a.master_id)?.full_name)}</td><td>${pill(a.status)}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">No visits yet</td></tr>'}</tbody></table></div><div class="muted small">Spent ${money(revenueOf(A))} · ${A.filter((a) => a.status === "No-show").length} no-shows</div>` : ""}`,
    `${id ? `<button class="btn" data-bookfor="${id}">Book a visit</button>` : ""}<span style="flex:1"></span><button class="btn" data-close>Close</button><button class="btn create" data-saveclient="${id || ""}">Save</button>`,
    true,
  );
}

function serviceModal(id) {
  const s = id ? S.services[id] : { name: "", duration_min: 60, price_kzt: 0, category: "", is_active: true };
  modal(
    id ? s.name : "New service",
    `<div class="frow">${id ? "" : `<div class="f"><label for="sv_id">Code (2 letters-2 digits)</label><input id="sv_id" placeholder="NS-07" maxlength="5"></div>`}<div class="f"><label for="sv_n">Name</label><input id="sv_n" value="${esc(s.name)}"></div><div class="f"><label for="sv_c">Category</label><input id="sv_c" value="${esc(s.category)}"></div></div>
  <div class="frow"><div class="f"><label for="sv_d">Duration, min (15–240)</label><input id="sv_d" type="number" min="15" max="240" step="15" value="${s.duration_min}"></div><div class="f"><label for="sv_p">Price, ${esc(businessCurrency())} (more than 0)</label><input id="sv_p" type="number" min="1" value="${s.price_kzt}"></div></div>
  <label class="switch"><input type="checkbox" id="sv_a" ${s.is_active !== false ? "checked" : ""}> Active (the AI can offer it)</label><div id="sv_err"></div>`,
    `<span style="flex:1"></span><button class="btn" data-close>Close</button><button class="btn create" data-saveservice="${id || ""}">Save</button>`,
  );
}

function masterModal(id) {
  const m = id ? S.masters[id] : { full_name: "", specialization: "", work_start: "09:00", work_end: "20:00", days: [1, 2, 3, 4, 5, 6], is_active: true };
  const mine = id ? servicesOf(id) : [];
  modal(
    id ? m.full_name : "New " + (biz().staff_label || "master").toLowerCase(),
    `<div class="frow"><div class="f"><label for="ms_n">Full name</label><input id="ms_n" value="${esc(m.full_name)}"></div><div class="f"><label for="ms_s">Specialization</label><input id="ms_s" value="${esc(m.specialization)}"></div></div>
  <div class="frow"><div class="f"><label for="ms_ws">Starts</label><input id="ms_ws" type="time" value="${m.work_start}"></div><div class="f"><label for="ms_we">Ends</label><input id="ms_we" type="time" value="${m.work_end}"></div></div>
  <div><b class="small">Working days</b><div class="checks">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" class="ms_day" value="${d}" ${(m.days || []).includes(d) ? "checked" : ""}>${DOW[d]}</label>`).join("")}</div></div>
  <div><b class="small">Services this person does (bridge table master_services)</b><div class="checks">${vals("services").map((s) => `<label><input type="checkbox" class="ms_svc" value="${s.id}" ${mine.includes(s.id) ? "checked" : ""}>${esc(s.name)}</label>`).join("")}</div></div>
  <label class="switch"><input type="checkbox" id="ms_a" ${m.is_active !== false ? "checked" : ""}> Active (deactivate instead of deleting, so old bookings keep their master)</label><div id="ms_err"></div>`,
    `<span style="flex:1"></span><button class="btn" data-close>Close</button><button class="btn create" data-savemaster="${id || ""}">Save</button>`,
  );
}

function kbModal(id) {
  const k = id ? S.knowledge[id] : { title: "", category: "General", content: "" };
  modal(
    id ? k.title : "New knowledge entry",
    `<div class="frow"><div class="f"><label for="kb_t">Title</label><input id="kb_t" value="${esc(k.title)}"></div><div class="f"><label for="kb_c">Category</label><input id="kb_c" value="${esc(k.category)}" list="kbcats"><datalist id="kbcats">${[...new Set(vals("knowledge").map((x) => x.category))].map((c) => `<option value="${esc(c)}">`).join("")}</datalist></div></div>
  <div class="f"><label for="kb_x">Content. Write it the way you would explain it to a new administrator.</label><textarea id="kb_x" style="min-height:220px">${esc(k.content)}</textarea></div>`,
    `${id ? `<button class="btn danger" data-delkb="${id}">Delete</button>` : ""}<span style="flex:1"></span><button class="btn" data-close>Close</button><button class="btn create" data-savekb="${id || ""}">Save</button>`,
    true,
  );
}

function newConvModal() {
  const svcName = vals("services").find((s) => s.is_active !== false)?.name;
  const sample = businessCurrency() === "KZT" ? "добрый вечер подскажите сколько стоит стрижка с бородой и когда можно прийти" : `Hi! How much is ${svcName ? svcName.toLowerCase() : "a visit"} and when can I come in?`;
  modal(
    "New chat",
    `<p class="muted small" style="margin:0">Simulates a client who writes to the business from a messenger. Real messages arrive from the messengers you connect on the Integrations page.</p>
  <div class="frow"><div class="f"><label for="nc_m">Messenger</label><select id="nc_m"><option>Telegram</option><option>WhatsApp</option><option>Instagram</option></select></div><div class="f"><label for="nc_n">Contact name in the messenger</label><input id="nc_n" placeholder="e.g. alex_k"></div></div>
  <div class="f"><label for="nc_t">First message from the client</label><textarea id="nc_t" placeholder="${sample}">${sample}</textarea></div>`,
    `<span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn create" data-createconv>Start chat</button>`,
  );
}

const resetModal = () =>
  modal(
    "Reset demo data?",
    `<p style="margin:0">This replaces every table with the demo barbershop data. Chats, clients and bookings you added will be lost.</p>`,
    `<span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn danger" data-confirmreset>Reset</button>`,
  );

/* ---------- save handlers ---------- */

async function saveClient(id) {
  const body = { display_name: field("cl_n"), phone: field("cl_p"), notes: field("cl_no") };
  if (!body.display_name) return banner($("#cl_err"), "Name is required.");
  try {
    await (id ? api.patch(`/clients/${id}`, body) : api.post("/clients", body));
    closeModal();
    toast("Client saved");
  } catch (e) {
    banner($("#cl_err"), e.message);
  }
}

async function saveService(id) {
  const err = $("#sv_err");
  const code = id || field("sv_id").toUpperCase();
  if (!id) {
    if (!/^[A-Z]{2}-\d{2}$/.test(code)) return banner(err, "Code must look like NS-07.");
    if (S.services[code]) return banner(err, "This code is already used. Primary keys must be unique.");
  }
  const body = { name: field("sv_n"), category: field("sv_c"), duration_min: +field("sv_d"), price_kzt: +field("sv_p"), is_active: $("#sv_a").checked };
  if (!body.name) return banner(err, "Name is required.");
  try {
    await api.put(`/services/${code}`, body);
    closeModal();
    toast("Service saved");
  } catch (e) {
    banner(err, e.message);
  }
}

async function saveMaster(id) {
  const body = {
    full_name: field("ms_n"),
    specialization: field("ms_s"),
    work_start: field("ms_ws"),
    work_end: field("ms_we"),
    days: checked(".ms_day").map(Number),
    is_active: $("#ms_a").checked,
    service_codes: checked(".ms_svc"),
  };
  if (!body.full_name) return banner($("#ms_err"), "Name is required.");
  try {
    await (id ? api.put(`/masters/${id}`, body) : api.post("/masters", body));
    closeModal();
    toast("Saved");
  } catch (e) {
    banner($("#ms_err"), e.message);
  }
}

async function saveKb(id) {
  const body = { title: field("kb_t"), category: field("kb_c") || "General", content: field("kb_x") };
  if (!body.title || !body.content) return toast("Title and content are required");
  await act(id ? api.put(`/knowledge/${id}`, body) : api.post("/knowledge", body), "The AI now knows this");
  closeModal();
}

async function createConv() {
  const body = { messenger: field("nc_m"), contact: field("nc_n") || undefined, text: field("nc_t") || undefined };
  const c = await act(api.post("/conversations", body));
  await reload(["conversations"]); // so the inbox can open the new chat right away
  closeModal();
  ui.curConv = c.id;
  ui.composeAs = "client";
  go("inbox");
}

async function resetDemo() {
  closeModal();
  $("#banner").innerHTML = `<div class="banner"><b>Loading demo data…</b> The server is rebuilding every table.</div>`;
  try {
    await act(api.post("/admin/reset-demo"), "Demo data loaded");
    ui.curConv = null;
  } finally {
    $("#banner").innerHTML = "";
  }
}

/* ---------- one click router for the whole app ---------- */

const ACTIONS = {
  act(v) {
    const open = { newAppt: () => apptModal(null, { start_datetime: nextHalfHour() }), newClient: () => clientModal(null), newService: () => serviceModal(null), newMaster: () => masterModal(null), newKb: () => kbModal(null), newConv: newConvModal, resetDemo: resetModal };
    open[v]?.();
  },
  appt: (id) => apptModal(id),
  client: (id) => clientModal(id),
  service: (id) => serviceModal(id),
  master: (id) => masterModal(id),
  kb: (id) => kbModal(id),
  bookfor: (id) => apptModal(null, { client_id: id, start_datetime: nextHalfHour() }),
  newat(v) {
    const [master_id, start_datetime] = v.split("|");
    apptModal(null, { master_id, start_datetime, service_code: servicesOf(master_id)[0] });
  },
  saveappt: (id) => saveAppt(id || null),
  saveclient: (id) => saveClient(id || null),
  saveservice: (id) => saveService(id || null),
  savemaster: (id) => saveMaster(id || null),
  savekb: (id) => saveKb(id || null),
  async delkb(id) {
    await act(api.del(`/knowledge/${id}`), "Entry deleted");
    closeModal();
  },
  setst(v) {
    const [id, status] = v.split("|");
    return act(api.patch(`/appointments/${id}/status`, { status }), `${id} marked ${status}`);
  },
  conv(id) {
    ui.curConv = id;
    if (ui.route !== "inbox") go("inbox");
    else render();
  },
  openconv: (id) => ACTIONS.conv(id),
  backconv() {
    ui.curConv = null;
    render();
  },
  as(v) {
    ui.composeAs = v;
    render();
  },
  aireply: (id) => act(api.post(`/conversations/${id}/ai-reply`)),
  stopai: (id) => act(api.post(`/conversations/${id}/ai-stop`)),
  pay: (pid) => act(api.post(`/payments/${pid}/pay`, { method: businessCurrency() === "KZT" ? "Kaspi QR" : "Card" }), "Payment received"),
  markpaid: (pid) => act(api.post(`/payments/${pid}/pay`, { method: "Cash" }), "Marked as paid"),
  refund: (pid) => act(api.post(`/payments/${pid}/refund`), "Refund recorded"),
  async takepay(id) {
    await act(api.post(`/appointments/${id}/full-payment`), "Payment recorded");
    closeModal();
  },
  resolve: (id) => act(api.post(`/conversations/${id}/resolve`), "Back to AI autopilot"),
  async delconv(id) {
    await act(api.del(`/conversations/${id}`), "Chat deleted");
    ui.curConv = null;
    render();
  },
  createconv: createConv,
  confirmreset: resetDemo,
};
const SELECTOR = Object.keys(ACTIONS).map((k) => `[data-${k}]`).join(",");

document.addEventListener("click", (e) => {
  const t = e.target.closest(SELECTOR);
  if (!t) return;
  const key = Object.keys(ACTIONS).find((k) => k in t.dataset);
  Promise.resolve(ACTIONS[key](t.dataset[key])).catch(() => {
    /* act() already showed the reason */
  });
});
