import { api } from "../api.js";
import { act, biz, vals } from "../store.js";
import { render } from "../ui.js";
import { $, esc, fmtAt, head, pill, toast } from "../util.js";

const KB_LIMIT = 14000;
let kbCat = "All";

export const knowledge = {
  head: () =>
    head(
      "AI knowledge base",
      "Everything you add here becomes part of what the AI knows about your business. Update it any time.",
      `<button class="btn create" data-act="newKb">+ Add entry</button><label class="btn ghost" style="cursor:pointer">Upload file<input type="file" id="kbFile" data-fresh="1" accept=".txt,.md,.csv,.json,text/plain" multiple hidden></label>`,
    ),
  body() {
    const K = vals("knowledge").sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    const cats = ["All", ...new Set(K.map((k) => k.category || "General"))];
    const shown = kbCat === "All" ? K : K.filter((k) => (k.category || "General") === kbCat);
    const size = K.reduce((s, k) => s + k.title.length + k.content.length + 20, 0);
    return `<div class="grid kbwrap">
  <section class="panel"><div class="ph"><div class="seg">${cats.map((c) => `<button data-kbcat="${esc(c)}" class="${kbCat === c ? "on" : ""}">${esc(c)}</button>`).join("")}</div><span class="grow"></span><span class="muted small">${K.length} entries · ${size.toLocaleString()} characters${size > KB_LIMIT ? ' · <span class="pill warn">only the first 14 000 are sent to the AI</span>' : ""}</span></div>
   <div class="pad"><div class="kbgrid">${shown.map((k) => `<div class="kbc" data-kb="${k.id}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(k.title)}</b>${pill(k.category || "General", "ai")}</div><p>${esc(k.content)}</p><span class="muted small">Updated ${fmtAt(k.updated_at)}</span></div>`).join("") || `<div class="empty"><b>Teach the AI about your business</b>Add prices, rules, promotions and answers to common questions, or upload a .txt or .csv file.</div>`}</div></div></section>
  <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
  <section class="panel"><div class="ph"><h3>Teach the AI</h3><span class="pill ai">AI</span></div><div class="pad" style="display:flex;flex-direction:column;gap:10px">
   <p class="muted small" style="margin:0">Paste anything about your business: a promotion, discounts, rules, your slogan, FAQ. The AI sorts it into entries and settings, you check them, and they are saved to the database.</p>
   <textarea class="inp" id="teachT" style="min-height:120px" aria-label="Notes about your business" placeholder="For example: 15% off on weekdays before 2 pm until the end of the month. If a client is more than 15 minutes late, the visit moves to the next free time. Our slogan: Look sharp, feel great."></textarea>
   <div style="display:flex;gap:8px"><button class="btn ai" id="teachGo" type="button">Organise with AI</button></div>
   <div id="teachOut"></div>
  </div></section>
  <section class="panel"><div class="ph"><h3>Test the AI</h3><span class="pill ai">AI</span></div><div class="pad" style="display:flex;flex-direction:column;gap:10px">
   <p class="muted small" style="margin:0">Ask the way a client would. The AI answers only from the services table and this knowledge base.</p>
   <form id="kbAsk" style="display:flex;gap:8px"><input class="inp" id="kbQ" aria-label="Question" placeholder="e.g. How long does a first visit take, and how much is it?"><button class="btn ai" type="submit">Ask</button></form>
   <div class="answer" id="kbA"><span class="muted">The answer appears here.</span></div>
   <h4 class="muted small" style="margin:6px 0 0">How the AI uses this</h4>
   <ol class="small muted" style="margin:0;padding-left:18px"><li>The backend reads services, staff, free slots and these entries from the database.</li><li>It sends them to the AI together with the client's message.</li><li>The AI writes the reply and calls CRM actions (book, payment link, hand over to a human). It never touches the database directly.</li></ol>
  </div></section></div></div>`;
  },
  after() {
    teachView();
    const f = $("#kbFile");
    f?.addEventListener("change", async () => {
      for (const file of f.files) {
        if (file.size > 200000) {
          toast(`${file.name} is larger than 200 KB. Split it into smaller files.`);
          continue;
        }
        const text = await file.text();
        await act(api.post("/knowledge", { title: file.name.replace(/\.[^.]+$/, ""), category: "Uploaded", content: text.slice(0, 60000) })).catch(() => {});
      }
      toast("Added to the knowledge base");
    });
  },
};

document.addEventListener("click", (e) => {
  const c = e.target.closest("[data-kbcat]");
  if (c) {
    kbCat = c.dataset.kbcat;
    render();
  }
});

document.addEventListener("submit", async (e) => {
  if (e.target.id !== "kbAsk") return;
  e.preventDefault();
  const q = $("#kbQ").value.trim();
  const out = $("#kbA");
  if (!q) return;
  out.textContent = "Thinking…";
  try {
    const r = await api.post("/ai/ask", { question: q });
    out.innerHTML = `${esc(r.answer)}${r.source ? `<div class="muted small" style="margin-top:6px">Source: ${esc(r.source)} · ${esc(r.engine)}</div>` : ""}`;
  } catch (err) {
    out.textContent = "The AI could not answer: " + err.message;
  }
});

/* Teach the AI: free text -> draft (POST /ai/teach) -> owner picks -> saved through the normal API. */
const SETTING_LABELS = { name: "Business name", address: "Address", hours: "Opening hours", phone: "Phone", tone: "Tone of voice", catchphrase: "Brand phrase", languages: "Client languages" };
let draft = null;

function teachView() {
  const o = $("#teachOut");
  if (!o) return;
  if (!draft) return void (o.innerHTML = "");
  const E = draft.entries;
  const St = Object.entries(draft.settings);
  if (!E.length && !St.length) return void (o.innerHTML = `<div class="answer muted">Nothing to save was found in this text.</div>`);
  o.innerHTML = `<div class="answer" style="display:flex;flex-direction:column;gap:8px">${E.map((e, i) => `<label class="switch" style="align-items:flex-start"><input type="checkbox" class="teachE" value="${i}" checked><span><b>${esc(e.title)}</b> ${pill(e.category || "General", "ai")}<br><span class="small">${esc(e.content)}</span></span></label>`).join("")}${St.map(([k, v]) => `<label class="switch" style="align-items:flex-start"><input type="checkbox" class="teachS" value="${k}" checked><span><b>Business setup · ${esc(SETTING_LABELS[k] || k)}</b><br><span class="small">${esc(v)}</span></span></label>`).join("")}<div style="display:flex;gap:8px"><button class="btn" id="teachCancel" type="button">Discard</button><span class="grow"></span><button class="btn create" id="teachSave" type="button">Save ${E.length + St.length} to the database</button></div><span class="muted small">Organised by ${esc(draft.engine)}</span></div>`;
}

document.addEventListener("click", async (e) => {
  if (e.target.id === "teachCancel") {
    draft = null;
    return teachView();
  }
  if (e.target.id === "teachSave" && draft) {
    const entries = [...document.querySelectorAll(".teachE:checked")].map((x) => draft.entries[+x.value]);
    const keys = [...document.querySelectorAll(".teachS:checked")].map((x) => x.value);
    try {
      for (const en of entries) await api.post("/knowledge", en);
      if (keys.length) await api.put("/settings", { ...biz(), ...Object.fromEntries(keys.map((k) => [k, draft.settings[k]])) });
      toast(`Saved ${entries.length + keys.length}. The AI uses it from the next message.`);
      draft = null;
      $("#teachT").value = "";
      teachView();
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (e.target.id !== "teachGo") return;
  const text = $("#teachT").value.trim();
  if (!text) return toast("Paste some text about your business first");
  $("#teachOut").innerHTML = `<div class="answer">Organising…</div>`;
  try {
    draft = await api.post("/ai/teach", { text });
    teachView();
  } catch (err) {
    $("#teachOut").innerHTML = `<div class="answer">Could not organise the text: ${esc(err.message)}</div>`;
  }
});
