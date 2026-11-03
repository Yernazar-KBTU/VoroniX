// Table pages: clients, services, staff, payments.

import { S, biz, cli, mastersFor, mst, prepayFor, revenueOf, servicesOf, svc, vals, active } from "../store.js";
import { render, ui } from "../ui.js";
import { DOW, esc, head, money, msIcon, nowLocal, pill, ymd } from "../util.js";

export const clients = {
  head: () => head("Clients", "", `<button class="btn ghost" data-act="import">Import</button><button class="btn create" data-act="newClient">+ Add client</button>`),
  body() {
    const A = vals("appointments");
    let L = vals("clients").map((c) => {
      const ap = A.filter((a) => a.client_id === c.id);
      const done = ap.filter((a) => a.status === "Completed");
      return {
        ...c,
        visits: done.length,
        ns: ap.filter((a) => a.status === "No-show").length,
        last: done.map((a) => a.start_datetime).sort().slice(-1)[0] || "",
        spent: revenueOf(ap),
        ch: vals("client_channels").filter((x) => x.client_id === c.id),
      };
    });
    if (ui.gq) L = L.filter((c) => `${c.display_name} ${c.phone} ${c.id}`.toLowerCase().includes(ui.gq));
    L.sort((a, b) => b.spent - a.spent);
    return `<div class="panel tw">${ui.gq ? `<div class="ph"><span>Search: <b>${esc(ui.gq)}</b> · ${L.length} found</span></div>` : ""}<table class="t"><thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Messengers</th><th>Visits</th><th>No-shows</th><th>Last visit</th><th style="text-align:right">Spent</th></tr></thead><tbody>
  ${L.map((c) => `<tr class="click" data-client="${c.id}"><td class="code">${c.id}</td><td><b>${esc(c.display_name)}</b></td><td>${esc(c.phone || "")}</td><td>${c.ch.map((x) => msIcon(x.messenger)).join(" ")}</td><td>${c.visits}</td><td>${c.ns ? `<span class="pill No-show">${c.ns}</span>` : "0"}</td><td>${esc(c.last.slice(0, 10) || "Never")}</td><td style="text-align:right">${money(c.spent)}</td></tr>`).join("") || `<tr><td colspan="8"><div class="empty"><b>No clients found</b>Clients are created by the AI from chats, or with “Add client”.</div></td></tr>`}</tbody></table></div>`;
  },
};

export const services = {
  head: () => head(biz().service_label ? biz().service_label + "s" : "Services", "The AI can only offer what is in this list, at these prices.", `<button class="btn ghost" data-act="import">Import</button><button class="btn create" data-act="newService">+ Add service</button>`),
  body: () =>
    `<div class="panel tw"><table class="t"><thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Duration</th><th style="text-align:right">Price</th><th>Prepayment</th><th>Who does it</th><th>Status</th></tr></thead><tbody>${vals("services")
      .map((s) => `<tr class="click" data-service="${s.id}"><td class="code">${s.id}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.category || "")}</td><td>${s.duration_min} min</td><td style="text-align:right">${money(s.price_kzt)}</td><td>${prepayFor(s.id) ? money(prepayFor(s.id)) : "None"}</td><td>${mastersFor(s.id).map((m) => esc(mst(m).full_name)).join(", ") || '<span class="pill warn">nobody</span>'}</td><td>${s.is_active === false ? pill("Hidden", "Cancelled") : pill("Active", "Completed")}</td></tr>`)
      .join("")}</tbody></table></div>`,
};

export const staff = {
  head: () => head((biz().staff_label || "Master") + "s", "", `<button class="btn ghost" data-act="import">Import</button><button class="btn create" data-act="newMaster">+ Add ${esc((biz().staff_label || "master").toLowerCase())}</button>`),
  body() {
    const today = ymd(nowLocal());
    return `<div class="panel tw"><table class="t"><thead><tr><th>ID</th><th>Name</th><th>Specialization</th><th>Services (master_services)</th><th>Working days</th><th>Hours</th><th>Today</th></tr></thead><tbody>${vals("masters")
      .map((m) => {
        const n = vals("appointments").filter((a) => a.master_id === m.id && a.start_datetime.startsWith(today) && active(a)).length;
        return `<tr class="click" data-master="${m.id}"><td class="code">${m.id}</td><td><b>${esc(m.full_name)}</b>${m.is_active === false ? " " + pill("Inactive", "Cancelled") : ""}</td><td>${esc(m.specialization)}</td><td>${servicesOf(m.id).map((c) => `<span class="pill">${esc(svc(c)?.name || c)}</span>`).join(" ")}</td><td>${(m.days || []).map((d) => DOW[d]).join(" ")}</td><td>${m.work_start}–${m.work_end}</td><td>${n} visits</td></tr>`;
      })
      .join("")}</tbody></table></div>`;
  },
};

let payFilter = "All";
export const payments = {
  head: () => head("Payments", "", `<div class="tabs">${["All", "Pending", "Paid", "Refunded"].map((f) => `<button data-payf="${f}" class="${payFilter === f ? "on" : ""}">${f}</button>`).join("")}</div>`),
  body() {
    let P = vals("payments").sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    if (payFilter !== "All") P = P.filter((p) => p.status === payFilter);
    const tot = P.filter((p) => p.status === "Paid").reduce((s, p) => s + p.amount_kzt, 0);
    return `<div class="panel tw"><div class="ph"><h3>${P.length} payments</h3><span class="grow"></span><span>Paid total: <b>${money(tot)}</b></span></div><table class="t"><thead><tr><th>ID</th><th>Created</th><th>Client</th><th>Service</th><th>Type</th><th>Method</th><th style="text-align:right">Amount</th><th>Status</th><th></th></tr></thead><tbody>${
      P.slice(0, 300)
        .map((p) => {
          const a = S.appointments[p.appointment_id] || {};
          return `<tr><td class="code">${p.id}</td><td>${esc(p.created_at)}</td><td>${esc(cli(a.client_id)?.display_name || "")}</td><td>${esc(svc(a.service_code)?.name || "")}</td><td>${esc(p.kind)}</td><td>${esc(p.method)}</td><td style="text-align:right">${money(p.amount_kzt)}</td><td>${pill(p.status)}</td><td>${p.status === "Pending" ? `<button class="btn sm" data-markpaid="${p.id}">Mark paid</button>` : p.status === "Paid" ? `<button class="btn sm danger" data-refund="${p.id}">Refund</button>` : ""}</td></tr>`;
        })
        .join("") || `<tr><td colspan="9"><div class="empty"><b>No payments here</b>Payment links sent by the AI appear as Pending.</div></td></tr>`
    }</tbody></table></div>`;
  },
};

document.addEventListener("click", (e) => {
  const f = e.target.closest("[data-payf]");
  if (f) {
    payFilter = f.dataset.payf;
    render();
  }
});
