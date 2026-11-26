import { api } from "../api.js";
import { meta } from "../store.js";
import { render } from "../ui.js";
import { $, GLYPH, esc, fmtAt, head, toast } from "../util.js";
import { t } from "../i18n.js";

// Integrations: one card per outside service, a side panel to connect it.
// The list comes from GET /api/integrations; tokens the owner types are
// sent once and only their last four characters ever come back.

const LOGO = {
  telegram: ["linear-gradient(160deg,#37aee2,#1e96c8)", GLYPH.Telegram],
  whatsapp: ["linear-gradient(160deg,#3ccf6e,#1ea952)", GLYPH.WhatsApp],
  instagram: ["radial-gradient(circle at 28% 108%,#fdd36b 0,#f58a3a 28%,#e1306c 56%,#b0329e 78%,#6a4bd6 100%)", GLYPH.Instagram],
  claude: ["linear-gradient(160deg,#df8a66,#c4633f)", '<path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18"/>'],
  kaspi: ["linear-gradient(160deg,#f5574a,#d92f22)", '<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M3.5 10h17M7 14.5h4"/>'],
  google_calendar: ["linear-gradient(160deg,#5a95f5,#2f6fdf)", '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8.5 3.5v3M15.5 3.5v3"/><path d="M8.5 13h1.5M12 13h1.5M8.5 16.5h1.5M12 16.5h1.5" stroke-width="2.2"/>'],
  webhook: ["linear-gradient(160deg,#7f73ff,#5b4ce0)", '<circle cx="6.5" cy="16.5" r="2.5"/><circle cx="17.5" cy="16.5" r="2.5"/><circle cx="12" cy="6.5" r="2.5"/><path d="m10.8 8.7-3 5.4M13.2 8.7l3 5.4M9 16.5h6"/>'],
};
const logo = (id) => `<span class="ilogo" style="background:${LOGO[id][0]}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LOGO[id][1]}</svg></span>`;
const STATUS = { connected: ["Connected", "Paid"], error: ["Error", "No-show"], off: ["Not connected", "Cancelled"] };
const statusPill = (s) => `<span class="pill ${STATUS[s][1]}">${STATUS[s][0]}</span>`;

const st = { list: null, sel: null, busy: false, loadedAt: 0 };

async function load() {
  try {
    st.list = await api.get("/integrations");
    st.loadedAt = Date.now();
  } catch (e) {
    st.list = [];
    toast(e.message);
  }
  render();
}

const addr = (path) => `${location.origin}/api${path}`;

function details(p) {
  const conn = p.status !== "off";
  const fields = p.fields
    .map((f) => {
      const val = f.secret ? "" : (p.settings[f.key] ?? "");
      const ph = f.secret && p.secret_hint ? `${t("Saved")} ${p.secret_hint}. ${t("Paste a new one to replace it")}` : (f.placeholder ?? "");
      return `<div class="f"><label for="if_${f.key}">${esc(t(f.label))}${f.required ? "" : ` <span class="muted">(${t("optional")})</span>`}</label><input class="inp" id="if_${f.key}" data-fresh="1" ${f.secret ? 'type="password" autocomplete="off"' : ""} value="${esc(val)}" placeholder="${esc(t(ph))}"></div>`;
    })
    .join("");
  let extra = "";
  if ((p.id === "whatsapp" || p.id === "instagram") && conn)
    extra = copyRow("Incoming webhook", addr(`/channels/${meta.business?.id}/${p.id}/inbound`)) + copyRow("Header x-channel-secret", p.shared_secret);
  if (p.id === "google_calendar" && conn) extra = copyRow("Calendar address", addr(`/integrations/${meta.business?.id}/calendar.ics?token=${p.shared_secret}`));
  if (p.id === "webhook" && conn) extra = copyRow("Header x-voronix-secret", p.shared_secret);
  if (p.id === "telegram" && conn) extra = `<p class="small muted" style="margin:0">Replies from the AI and from administrators in Chats go back to the client in Telegram.</p>`;
  return `<section class="panel ipanel"><div class="ph">${logo(p.id)}<div style="min-width:0"><h3>${esc(p.name)}</h3><span class="muted small">${esc(t(p.group))}</span></div><span class="grow"></span>${statusPill(p.status)}</div>
  <div class="pad" style="display:flex;flex-direction:column;gap:12px">
   <p style="margin:0">${esc(t(p.description))}</p>
   ${p.status_detail ? `<div class="answer ${p.status === "error" ? "bad" : ""}">${esc(t(p.status_detail))}${fmtAt(p.checked_at) ? `<span class="muted small"> · ${t("checked")} ${fmtAt(p.checked_at)}</span>` : ""}</div>` : ""}
   ${p.from_env ? `<p class="small muted" style="margin:0">Included in VoroniX. You can connect your own Anthropic key instead if you want the AI usage billed to you.</p>` : ""}
   <form id="intForm" data-int="${p.id}" style="display:flex;flex-direction:column;gap:10px">${fields}
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn create" type="submit" ${st.busy ? "disabled" : ""}>${st.busy ? "Checking…" : conn ? "Save and check" : "Connect"}</button>
    ${conn && !p.from_env ? `<button class="btn" type="button" data-inttest="${p.id}" ${st.busy ? "disabled" : ""}>Test</button><button class="btn danger" type="button" data-intoff="${p.id}">Disconnect</button>` : ""}</div>
   </form>
   ${extra}
   <h4 class="muted small" style="margin:4px 0 0">How to connect</h4>
   <ol class="small muted" style="margin:0;padding-left:18px">${p.steps.map((s) => `<li>${esc(t(s))}</li>`).join("")}</ol>
  </div></section>`;
}

const copyRow = (label, value) =>
  `<div class="f"><label>${esc(label)}</label><div style="display:flex;gap:6px"><input class="inp mono" readonly value="${esc(value)}" style="flex:1;min-width:0"><button class="btn sm" type="button" data-copy="${esc(value)}">Copy</button></div></div>`;

export const integrations = {
  head: () => head("Integrations", "Connect messengers, AI, payments and your calendar. Most take one token and one click."),
  body() {
    if (!st.list) return `<div class="empty"><b>Loading integrations…</b></div>`;
    const sel = st.list.find((p) => p.id === st.sel) ?? st.list[0];
    st.sel = sel?.id;
    const on = st.list.filter((p) => p.status === "connected").length;
    const groups = [...new Set(st.list.map((p) => p.group))];
    return `<div class="grid intwrap">
  <section class="panel"><div class="ph"><h3>Services</h3><span class="grow"></span><span class="muted small">${on} of ${st.list.length} connected</span></div>
   <div class="pad" style="display:flex;flex-direction:column;gap:16px">${groups
     .map(
       (g) => `<div><h4 class="muted small" style="margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em">${esc(t(g))}</h4><div class="igrid">${st.list
         .filter((p) => p.group === g)
         .map(
           (p) => `<button class="icard ${p.id === st.sel ? "on" : ""}" data-intsel="${p.id}">${logo(p.id)}<span class="ibody"><b>${esc(p.name)}</b><span class="muted small">${esc(t(p.description))}</span></span>${statusPill(p.status)}</button>`,
         )
         .join("")}</div></div>`,
     )
     .join("")}</div></section>
  ${sel ? details(sel) : ""}</div>`;
  },
  after() {
    // Fetch on first open and again when the page is older than 30 s.
    if (Date.now() - st.loadedAt > 30_000) {
      st.loadedAt = Date.now();
      void load();
    }
    $("#intForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const p = st.list.find((x) => x.id === e.target.dataset.int);
      const settings = {};
      let secret;
      for (const f of p.fields) {
        const v = $(`#if_${f.key}`).value.trim();
        if (f.secret) secret = v || undefined;
        else settings[f.key] = v;
      }
      await run(() => api.put(`/integrations/${p.id}`, { secret, settings }));
    });
  },
};

async function run(fn) {
  st.busy = true;
  render();
  try {
    const v = await fn();
    st.list = st.list.map((p) => (p.id === v.id ? v : p));
    toast(v.status === "connected" ? `${v.name}: ${t("connected")}` : v.status === "off" ? `${v.name}: ${t("Not connected")}` : `${v.name}: ${t(v.status_detail)}`);
  } catch (e) {
    toast(e.message);
  } finally {
    st.busy = false;
    render();
  }
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-intsel],[data-inttest],[data-intoff],[data-copy]");
  if (!t) return;
  if (t.dataset.intsel) {
    st.sel = t.dataset.intsel;
    render();
    if (matchMedia("(max-width: 900px)").matches) $(".ipanel")?.scrollIntoView({ behavior: "smooth" });
  } else if (t.dataset.inttest) void run(() => api.post(`/integrations/${t.dataset.inttest}/test`));
  else if (t.dataset.intoff) void run(() => api.del(`/integrations/${t.dataset.intoff}`));
  else if (t.dataset.copy !== undefined) {
    navigator.clipboard?.writeText(t.dataset.copy).then(() => toast("Copied"), () => toast("Select the text and copy it"));
  }
});
