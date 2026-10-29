import { api } from "../api.js";
import { S, act, cli, convClientAppts, mst, svc, vals } from "../store.js";
import { ui } from "../ui.js";
import { $, addDays, esc, fmtAt, head, money, msIcon, parseDT, pill } from "../util.js";

export const STAGES = [["New", "#3fa9f5"], ["In dialog", "#7b4dff"], ["Booked", "#f2a516"], ["Paid", "#4fae33"], ["Visited", "#2fb8a7"], ["Lost", "#9aa1b8"]];

export const inbox = {
  head: () => head("Chats", "Telegram, WhatsApp and Instagram in one place. The AI answers from your database.", `<button class="btn create" data-act="newConv">+ New chat</button>`),
  body() {
    const C = vals("conversations").sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    if (!ui.curConv || !S.conversations[ui.curConv]) ui.curConv = innerWidth > 760 && C[0] ? C[0].id : null;
    const c = ui.curConv ? { id: ui.curConv, ...S.conversations[ui.curConv] } : null;
    const list =
      C.map((x) => {
        const last = (x.messages || []).slice(-1)[0];
        return `<div class="conv ${x.id === ui.curConv ? "on" : ""}" data-conv="${x.id}">${msIcon(x.messenger)}<div class="grow"><div class="nm"><span class="ell">${esc(x.contact)}</span>${x.needs_human ? '<span class="pill human">Human</span>' : ""}</div><div class="last ell">${esc(last ? (last.from === "pay" ? "Payment link" : last.text) : "")}</div><div style="display:flex;gap:6px;margin-top:4px">${pill(x.stage || "New", "ai")}</div></div><span class="muted small">${fmtAt(x.updated_at)}</span></div>`;
      }).join("") || `<div class="empty"><b>No chats yet</b>Press “New chat” to simulate a client writing from a messenger.</div>`;
    let chat = `<div class="chat"><div class="empty" style="margin:auto"><b>Pick a chat</b>Or start a new one and write as the client to see the AI work.</div></div>`;
    let info = "";
    if (c) {
      const msgs = (c.messages || [])
        .map((m) => {
          if (m.from === "pay") {
            const p = S.payments[m.payment_id] || {};
            return `<div class="paycard"><div class="muted small">Payment link · ${esc(p.kind || "")}</div><div class="amt">${money(p.amount_kzt)}</div><div class="small">${esc(m.text)}</div><div style="margin-top:8px;display:flex;gap:8px;align-items:center">${p.status === "Paid" ? pill("Paid") : `<button class="btn primary sm" data-pay="${m.payment_id}">Pay with Kaspi QR (demo)</button>`}<span class="muted small">client side</span></div></div>`;
          }
          const who = { client: esc(c.contact), ai: "AI administrator", admin: "Administrator" }[m.from] || "";
          return `<div class="m ${m.from}">${m.from !== "system" && m.from !== "client" ? `<div class="who">${who}</div>` : ""}${esc(m.text)}${m.from !== "system" ? `<div class="at">${fmtAt(m.at)}</div>` : ""}</div>`;
        })
        .join("");
      chat = `<div class="chat"><div class="chead"><button class="btn sm" data-backconv style="display:none" id="backBtn">←</button>${msIcon(c.messenger)}<div class="grow"><b class="ell">${esc(c.contact)}</b><div class="muted small">${esc(c.messenger)} · ${c.client_id ? esc(c.client_id) : "no client card yet"}</div></div>
      <label class="switch" title="When on, the AI answers every client message"><input type="checkbox" data-aitoggle="${c.id}" ${c.ai_enabled ? "checked" : ""}> AI autopilot</label>
      <button class="btn ai sm" data-aireply="${c.id}">Ask AI to reply</button></div>
      <div class="msgs" id="msgs">${msgs}<div id="typing"></div></div>
      <div class="composer"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><div class="seg"><button data-as="client" class="${ui.composeAs === "client" ? "on" : ""}">Write as client</button><button data-as="admin" class="${ui.composeAs === "admin" ? "on" : ""}">Write as administrator</button></div><span class="muted small">${ui.composeAs === "client" ? "Simulates a message from " + esc(c.messenger) : "Your reply goes to the client"}</span></div>
      <form class="row" id="sendForm"><textarea id="composeText" rows="1" aria-label="Message" placeholder="${ui.composeAs === "client" ? "e.g. здравствуйте а можно завтра после 6 на маникюр?" : "Type a reply"}"></textarea><button class="btn primary" type="submit">Send</button></form></div></div>`;
      const cc = c.client_id ? cli(c.client_id) : null;
      const ap = convClientAppts(c).filter((a) => parseDT(a.start_datetime) >= addDays(new Date(), -1));
      const pays = vals("payments").filter((p) => ap.some((a) => a.id === p.appointment_id));
      info = `<aside class="info"><div><h4>Deal stage</h4><select class="inp" id="stageSel" data-stage="${c.id}" aria-label="Deal stage">${STAGES.map((s) => `<option ${s[0] === c.stage ? "selected" : ""}>${s[0]}</option>`).join("")}</select></div>
      <div><h4>Client card</h4>${cc ? `<div class="kv"><span>ID</span><span class="code">${esc(c.client_id)}</span><span>Name</span><span>${esc(cc.display_name)}</span><span>Phone</span><span>${esc(cc.phone || "—")}</span><span>Notes</span><span>${esc(cc.notes || "—")}</span></div><button class="btn sm" style="margin-top:8px" data-client="${c.client_id}">Open card</button>` : `<div class="muted small">Not linked yet. The AI links or creates the card when the client gives a name.</div>`}</div>
      <div><h4>Visits</h4>${ap.length ? ap.map((a) => `<div style="margin-bottom:6px;cursor:pointer" data-appt="${a.id}"><div>${a.start_datetime} ${pill(a.status)}</div><div class="muted small">${esc(svc(a.service_code)?.name)} · ${esc(mst(a.master_id)?.full_name)}</div></div>`).join("") : '<div class="muted small">None</div>'}</div>
      <div><h4>Payments</h4>${pays.length ? pays.map((p) => `<div class="small">${money(p.amount_kzt)} ${pill(p.status)} <span class="muted">${esc(p.kind)}</span></div>`).join("") : '<div class="muted small">None</div>'}</div>
      <div><h4>What the AI used</h4><div class="muted small">Services, prices and free slots from the database, plus ${Object.keys(S.knowledge).length} knowledge base entries. <a href="#knowledge">Edit what the AI knows</a>.</div></div>
      ${c.needs_human ? `<button class="btn" data-resolve="${c.id}">Mark as handled, return to AI</button>` : ""}
      <button class="btn danger sm" data-delconv="${c.id}">Delete chat</button></aside>`;
    }
    return `<div class="panel inbox ${c ? "open" : ""}"><div class="convs">${list}</div>${chat}${info}</div>`;
  },
  after() {
    const b = $("#backBtn");
    if (b && innerWidth <= 760) b.style.display = "";
    $("#composeText")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        $("#sendForm").requestSubmit();
      }
    });
  },
};

document.addEventListener("submit", async (e) => {
  if (e.target.id !== "sendForm") return;
  e.preventDefault();
  const ta = $("#composeText");
  const text = ta.value.trim();
  if (!text || !ui.curConv) return;
  ta.value = "";
  await act(api.post(`/conversations/${ui.curConv}/messages`, { from: ui.composeAs, text })).catch(() => (ta.value = text));
});

document.addEventListener("change", (e) => {
  const t = e.target.closest("[data-aitoggle]");
  if (t) return void act(api.patch(`/conversations/${t.dataset.aitoggle}`, { ai_enabled: t.checked })).catch(() => {});
  const s = e.target.closest("[data-stage]");
  if (s) act(api.patch(`/conversations/${s.dataset.stage}`, { stage: s.value })).catch(() => {});
});
