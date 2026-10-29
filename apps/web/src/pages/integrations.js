import { api } from "../api.js";
import { render } from "../ui.js";
import { $, esc, fmtAt, head, toast } from "../util.js";

// Integrations: one card per outside service, a side panel to connect it.
// The list comes from GET /api/integrations; tokens the owner types are
// sent once and only their last four characters ever come back.

const LOGO = {
  telegram: ["#2aa3e0", '<path d="M21 4 3 11l6 2 2 6 3-4 5 4z" fill="#fff"/>'],
  whatsapp: ["#25b860", '<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M9 8c0 4 3 7 7 7l1-2-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z" fill="#fff"/>'],
  instagram: ["#d6338a", '<rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16.3" cy="7.7" r="1" fill="#fff"/>'],
  claude: ["#d97757", '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'],
  kaspi: ["#f14635", '<rect x="5" y="7" width="14" height="10" rx="2" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M5 11h14" stroke="#fff" stroke-width="1.8"/>'],
  google_calendar: ["#4285f4", '<rect x="4" y="5" width="16" height="15" rx="2" fill="#fff"/><path d="M4 9h16" stroke="#4285f4" stroke-width="2"/><text x="12" y="18" text-anchor="middle" font-size="7" font-weight="700" fill="#4285f4" font-family="Arial">31</text>'],
  webhook: ["#6a5cff", '<circle cx="7" cy="16" r="2.4" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="17" cy="16" r="2.4" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="7" r="2.4" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M11 9.2 8 14M13 9.2l3 4.8M9.4 16h5.2" stroke="#fff" stroke-width="1.8"/>'],
};
const logo = (id) => `<span class="ilogo" style="background:${LOGO[id][0]}"><svg viewBox="0 0 24 24">${LOGO[id][1]}</svg></span>`;
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
      const ph = f.secret && p.secret_hint ? `Saved ${p.secret_hint}. Paste a new one to replace it` : (f.placeholder ?? "");
      return `<div class="f"><label for="if_${f.key}">${esc(f.label)}${f.required ? "" : ' <span class="muted">(optional)</span>'}</label><input class="inp" id="if_${f.key}" data-fresh="1" ${f.secret ? 'type="password" autocomplete="off"' : ""} value="${esc(val)}" placeholder="${esc(ph)}"></div>`;
    })
    .join("");
  let extra = "";
  if ((p.id === "whatsapp" || p.id === "instagram") && conn)
    extra = copyRow("Incoming webhook", addr(`/channels/${p.id}/inbound`)) + copyRow("Header x-channel-secret", p.shared_secret);
  if (p.id === "google_calendar" && conn) extra = copyRow("Calendar address", addr(`/integrations/calendar.ics?token=${p.shared_secret}`));
  if (p.id === "webhook" && conn) extra = copyRow("Header x-voronix-secret", p.shared_secret);
  if (p.id === "telegram" && conn) extra = `<p class="small muted" style="margin:0">Replies from the AI and from administrators in Chats go back to the client in Telegram.</p>`;
  return `<section class="panel ipanel"><div class="ph">${logo(p.id)}<div style="min-width:0"><h3>${esc(p.name)}</h3><span class="muted small">${esc(p.group)}</span></div><span class="grow"></span>${statusPill(p.status)}</div>
  <div class="pad" style="display:flex;flex-direction:column;gap:12px">
   <p style="margin:0">${esc(p.description)}</p>
   ${p.status_detail ? `<div class="answer ${p.status === "error" ? "bad" : ""}">${esc(p.status_detail)}${fmtAt(p.checked_at) ? `<span class="muted small"> · checked ${fmtAt(p.checked_at)}</span>` : ""}</div>` : ""}
   ${p.from_env ? `<p class="small muted" style="margin:0">Set on the server through an environment variable. Connecting here overrides it.</p>` : ""}
   <form id="intForm" data-int="${p.id}" style="display:flex;flex-direction:column;gap:10px">${fields}
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn create" type="submit" ${st.busy ? "disabled" : ""}>${st.busy ? "Checking…" : conn ? "Save and check" : "Connect"}</button>
    ${conn && !p.from_env ? `<button class="btn" type="button" data-inttest="${p.id}" ${st.busy ? "disabled" : ""}>Test</button><button class="btn danger" type="button" data-intoff="${p.id}">Disconnect</button>` : ""}</div>
   </form>
   ${extra}
   <h4 class="muted small" style="margin:4px 0 0">How to connect</h4>
   <ol class="small muted" style="margin:0;padding-left:18px">${p.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
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
       (g) => `<div><h4 class="muted small" style="margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em">${esc(g)}</h4><div class="igrid">${st.list
         .filter((p) => p.group === g)
         .map(
           (p) => `<button class="icard ${p.id === st.sel ? "on" : ""}" data-intsel="${p.id}">${logo(p.id)}<span class="ibody"><b>${esc(p.name)}</b><span class="muted small">${esc(p.description)}</span></span>${statusPill(p.status)}</button>`,
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
    toast(v.status === "connected" ? `${v.name}: connected` : v.status === "off" ? `${v.name}: disconnected` : `${v.name}: ${v.status_detail}`);
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
