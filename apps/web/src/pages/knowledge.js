import { api } from "../api.js";
import { act, vals } from "../store.js";
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
   <div class="pad"><div class="kbgrid">${shown.map((k) => `<div class="kbc" data-kb="${k.id}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(k.title)}</b>${pill(k.category || "General", "ai")}</div><p>${esc(k.content)}</p><span class="muted small">Updated ${fmtAt(k.updated_at)}</span></div>`).join("") || `<div class="empty"><b>Teach the AI about your business</b>Add prices by hair length, rules, promotions, FAQ, or upload a .txt / .csv file.</div>`}</div></div></section>
  <section class="panel"><div class="ph"><h3>Test the AI</h3><span class="pill ai">AI</span></div><div class="pad" style="display:flex;flex-direction:column;gap:10px">
   <p class="muted small" style="margin:0">Ask the way a client would. The AI answers only from the services table and this knowledge base.</p>
   <form id="kbAsk" style="display:flex;gap:8px"><input class="inp" id="kbQ" aria-label="Question" placeholder="e.g. у меня волосы до пояса, сколько будет покраска?"><button class="btn ai" type="submit">Ask</button></form>
   <div class="answer" id="kbA"><span class="muted">The answer appears here.</span></div>
   <h4 class="muted small" style="margin:6px 0 0">How the AI uses this</h4>
   <ol class="small muted" style="margin:0;padding-left:18px"><li>The backend reads services, staff, free slots and these entries from the database.</li><li>It sends them to the AI together with the client's message.</li><li>The AI writes the reply and calls CRM actions (book, payment link, hand over to a human). It never touches the database directly.</li></ol>
  </div></section></div>`;
  },
  after() {
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
