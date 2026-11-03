// The Import window: drop files or paste anything, check what the CRM found,
// then save it all at once. Excel, CSV, Word, JSON and text are read in the
// browser; PDF files and photos go to Claude on the server when it is on.

import { api } from "../api.js";
import { biz, meta, vals } from "../store.js";
import { closeModal, modal } from "../ui.js";
import { $, DOW, esc, money, pill, toast } from "../util.js";
import { addAiDraft, analyzeTable, analyzeText, emptyDraft, finish, toPayload } from "./analyze.js";
import { extractFile, extractPasted, merge } from "./extract.js";

const ACCEPT = ".xlsx,.xlsm,.csv,.tsv,.txt,.md,.json,.docx,.html,.htm,.pdf,image/*";
const SHOWN = 100; // rows listed per section; the rest are imported too
const LABEL = { name: "Business name", type: "Type of business", city: "City", address: "Address", hours: "Opening hours", phone: "Phone", catchphrase: "Brand phrase", languages: "Client languages", tone: "Tone of voice", prepay_percent: "Prepayment, %", prepay_min_price: "Prepayment for services from" };
const SECTIONS = ["settings", "services", "staff", "clients", "knowledge"];

let st = null; // { files: File[], draft, pick: { section: Set }, busy }

const low = (s) => String(s || "").trim().toLowerCase();
const digits = (s) => String(s || "").replace(/\D/g, "").slice(-10);
const days = (list) => (list ? (list.length === 7 ? "Every day" : list.map((d) => DOW[d]).join(" ")) : "");

export function openImport() {
  st = { files: [], draft: null, pick: null, busy: false };
  modal(
    "Import data",
    `<p class="muted small" style="margin:0">Upload your price list, staff schedule, client list, rules or FAQ in any common format, or paste them. The CRM shows what it found, you untick what you do not need, and everything is saved at once. Importing the same file again updates rows instead of duplicating them.</p>
  <div class="imp-drop" id="impDrop"><b>Drop files here</b><span>or</span><label class="btn sm">Choose files<input type="file" id="impFiles" multiple accept="${ACCEPT}" hidden></label>
   <span class="muted small">Excel (.xlsx), CSV, Word (.docx), text, JSON. ${claudeOn() ? "PDF files and photos are read by Claude." : "PDF files and photos need Claude: add a Claude key in Integrations."}</span></div>
  <div id="impList" class="imp-files"></div>
  <div class="f"><label for="impText">Or paste a table or text</label><textarea id="impText" data-fresh="1" style="min-height:110px" placeholder="Copy rows from Excel or Google Sheets, a price list, your team's schedule, rules or answers to common questions, and paste them here."></textarea></div>
  <div id="impOut"></div>`,
    `<span class="muted small" id="impEngine"></span><span style="flex:1"></span><button class="btn" data-close>Close</button><button class="btn ai" id="impRead" type="button">Read data</button><button class="btn create" id="impSave" type="button" hidden>Import</button>`,
    true,
  );
}

const claudeOn = () => String(meta.aiEngine).startsWith("claude");

function listFiles() {
  $("#impList").innerHTML = st.files.map((f, i) => `<span class="imp-file">${esc(f.name)} <small class="muted">${Math.max(1, Math.round(f.size / 1024))} KB</small><button type="button" data-impdrop="${i}" aria-label="Remove ${esc(f.name)}">×</button></span>`).join("");
}

function addFiles(list) {
  for (const f of list) if (!st.files.some((x) => x.name === f.name && x.size === f.size)) st.files.push(f);
  listFiles();
  stale();
}

/** Inputs changed after a reading: hide the old draft so it is not saved by mistake. */
function stale() {
  if (!st.draft) return;
  st.draft = null;
  $("#impOut").innerHTML = "";
  $("#impSave").hidden = true;
  $("#impRead").textContent = "Read data";
}

/* ---------- reading ---------- */

async function read() {
  if (st.busy) return;
  const text = $("#impText").value.trim();
  if (!st.files.length && !text) return toast("Add a file or paste something first");
  st.busy = true;
  const out = $("#impOut");
  out.innerHTML = `<div class="answer">Reading ${st.files.length ? st.files.length + (st.files.length === 1 ? " file" : " files") : "the text"}…</div>`;
  try {
    const ex = merge([...(await Promise.all(st.files.map(extractFile))), ...(text ? [extractPasted(text)] : [])]);
    const d = emptyDraft();
    for (const t of ex.tables) analyzeTable(t, d);
    let engine = "built-in reader";
    const forClaude = ex.files.length || (claudeOn() && ex.texts.length);
    if (forClaude && claudeOn()) {
      out.innerHTML = `<div class="answer">Claude is reading ${ex.files.length ? ex.files.map((f) => esc(f.name)).join(", ") : "the text"}. This can take up to a minute…</div>`;
      try {
        const size = ex.files.reduce((n, f) => n + f.data.length, 0);
        if (size > 28 * 1024 * 1024) throw new Error("the files are larger than 20 MB together, upload them in parts");
        addAiDraft(d, await api.post("/import/ai", { texts: ex.texts, files: ex.files }));
        engine = "Claude";
      } catch (e) {
        d.notes.push(`Claude could not read the files: ${e.message}`);
        for (const t of ex.texts) analyzeText(t.text, t.name, d);
      }
    } else {
      for (const t of ex.texts) analyzeText(t.text, t.name, d);
      for (const f of ex.files) d.notes.push(`${f.name}: PDF files and photos are read by Claude, which is not on for this business. Add a Claude key in Integrations, or upload the data as Excel, Word, CSV or text.`);
    }
    d.notes.push(...ex.notes);
    // Settings that already have this value are not changes.
    for (const [k, v] of Object.entries(d.settings)) if (String(biz()[k] ?? "") === String(v)) delete d.settings[k];
    st.draft = finish(d, vals("services").map((s) => s.name));
    st.pick = Object.fromEntries(SECTIONS.map((k) => [k, new Set(k === "settings" ? Object.keys(d.settings) : d[k].map((x, i) => (x.problem ? -1 : i)).filter((i) => i >= 0))]));
    $("#impEngine").textContent = `Read by ${engine}`;
    show();
  } catch (e) {
    out.innerHTML = `<div class="answer bad">Could not read the data: ${esc(e.message || e)}</div>`;
  } finally {
    st.busy = false;
  }
}

/* ---------- preview ---------- */

const box = (sec, i, on, disabled) => `<input type="checkbox" class="impRow" data-sec="${sec}" value="${esc(i)}" ${on ? "checked" : ""} ${disabled ? "disabled" : ""} aria-label="Import this row">`;
const notes = (x) => [x.problem ? pill(x.problem, "No-show") : "", ...(x.notes || []).map((n) => `<span class="muted small">${esc(n)}</span>`)].filter(Boolean).join("<br>");

function section(sec, title, count, head, rows, total) {
  const selectable = sec === "settings" ? count : st.draft[sec].filter((x) => !x.problem).length;
  const all = selectable > 0 && st.pick[sec].size === selectable;
  return `<section class="imp-sec"><div class="imp-h"><label><input type="checkbox" class="impAll" data-sec="${sec}" ${all ? "checked" : ""} aria-label="Import all ${esc(title)}"> <b>${esc(title)}</b></label><span class="muted small">${st.pick[sec].size} of ${count} selected</span></div>
  <div class="tw"><table class="t"><thead><tr><th></th>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>${total > SHOWN ? `<p class="muted small">Showing ${SHOWN} of ${total}. The rest are imported the same way.</p>` : ""}</section>`;
}

function show() {
  const d = st.draft;
  const svcNames = new Set(vals("services").map((s) => low(s.name)));
  const staffNames = new Set(vals("masters").map((m) => low(m.full_name)));
  const phones = new Set(vals("clients").map((c) => digits(c.phone)).filter(Boolean));
  const was = (yes) => (yes ? " " + pill("updates", "ai") : "");
  const parts = [];
  const S = Object.entries(d.settings);
  if (S.length)
    parts.push(section("settings", "Business setup", S.length, ["Field", "New value", "Now"], S.map(([k, v]) => `<tr><td>${box("settings", k, st.pick.settings.has(k))}</td><td>${esc(LABEL[k] || k)}</td><td><b>${esc(k === "prepay_min_price" ? money(v) : v)}</b></td><td class="muted">${esc(k === "prepay_min_price" ? money(biz()[k]) : biz()[k] ?? "")}</td></tr>`), S.length));
  if (d.services.length)
    parts.push(section("services", "Services", d.services.length, ["Name", "Category", "Duration", "Price", "Notes"], d.services.slice(0, SHOWN).map((s, i) => `<tr><td>${box("services", i, st.pick.services.has(i), s.problem)}</td><td><b>${esc(s.name)}</b>${was(svcNames.has(low(s.name)))}</td><td>${esc(s.category)}</td><td>${s.duration_min} min</td><td>${s.price ? money(s.price) : ""}</td><td class="wrap">${notes(s)}</td></tr>`), d.services.length));
  if (d.staff.length)
    parts.push(section("staff", "Staff", d.staff.length, ["Name", "Specialization", "Days", "Hours", "Services", "Notes"], d.staff.slice(0, SHOWN).map((m, i) => `<tr><td>${box("staff", i, st.pick.staff.has(i))}</td><td><b>${esc(m.full_name)}</b>${was(staffNames.has(low(m.full_name)))}</td><td>${esc(m.specialization)}</td><td>${esc(days(m.days))}</td><td>${m.work_start ? `${m.work_start}–${m.work_end}` : ""}</td><td class="wrap">${m.services.map((x) => `<span class="pill">${esc(x)}</span>`).join(" ")}</td><td class="wrap">${notes(m)}</td></tr>`), d.staff.length));
  if (d.clients.length)
    parts.push(section("clients", "Clients", d.clients.length, ["Name", "Phone", "Notes"], d.clients.slice(0, SHOWN).map((c, i) => `<tr><td>${box("clients", i, st.pick.clients.has(i))}</td><td><b>${esc(c.display_name)}</b>${phones.has(digits(c.phone)) ? " " + pill("already in the CRM", "Cancelled") : ""}</td><td>${esc(c.phone)}</td><td class="small wrap">${esc(c.notes)}</td></tr>`), d.clients.length));
  if (d.knowledge.length)
    parts.push(section("knowledge", "Knowledge for the AI", d.knowledge.length, ["Title", "Category", "Text"], d.knowledge.slice(0, SHOWN).map((k, i) => `<tr><td>${box("knowledge", i, st.pick.knowledge.has(i))}</td><td><b>${esc(k.title)}</b></td><td>${pill(k.category, "ai")}</td><td class="small wrap">${esc(k.content.length > 220 ? k.content.slice(0, 220) + "…" : k.content)}</td></tr>`), d.knowledge.length));
  const unlinked = d.staff.some((m, i) => st.pick.staff.has(i) && !m.services.length);
  const found = parts.length;
  $("#impOut").innerHTML = `${d.notes.length ? `<div class="banner"><div>${d.notes.map((n) => esc(n)).join("<br>")}</div></div>` : ""}
  ${found ? parts.join("") : `<div class="answer">Nothing to import was found. Check that the file has a header row (for example Name, Price, Duration) or paste the data as text.</div>`}
  ${unlinked ? `<label class="switch"><input type="checkbox" id="impLinkAll" ${st.linkAll !== false ? "checked" : ""}> Staff with no services listed do every service (you can change it on the Staff page)</label>` : ""}`;
  const n = count();
  $("#impSave").hidden = !found;
  $("#impSave").disabled = !n;
  $("#impSave").textContent = `Import ${n} ${n === 1 ? "item" : "items"}`;
  $("#impRead").textContent = "Read again";
}

const count = () => SECTIONS.reduce((n, k) => n + st.pick[k].size, 0);

/* ---------- saving ---------- */

async function save() {
  if (st.busy || !st.draft) return;
  st.busy = true;
  $("#impSave").disabled = true;
  try {
    const linkAll = $("#impLinkAll")?.checked ? { existing: vals("services").filter((s) => s.is_active !== false).map((s) => s.name) } : null;
    const r = await api.post("/import", toPayload(st.draft, st.pick, linkAll));
    const both = (label, x) => (x.created + x.updated ? `${label}: ${[x.created && `${x.created} new`, x.updated && `${x.updated} updated`].filter(Boolean).join(", ")}` : "");
    const done = [
      both("services", r.services),
      both("staff", r.staff),
      r.clients.created && `clients: ${r.clients.created} new`,
      r.knowledge.created && `AI knowledge: ${r.knowledge.created} new`,
      r.settings && `business setup: ${r.settings} ${r.settings === 1 ? "field" : "fields"}`,
    ].filter(Boolean);
    const skipped = r.clients.skipped + r.knowledge.skipped;
    closeModal();
    toast(`${done.length ? "Imported " + done.join("; ") : "Nothing new to import"}.${skipped ? ` ${skipped} already in the CRM skipped.` : ""}`);
    st = null;
  } catch (e) {
    toast(e.message);
    $("#impSave").disabled = false;
  } finally {
    if (st) st.busy = false;
  }
}

/* ---------- events ---------- */

document.addEventListener("click", (e) => {
  if (!st) return;
  if (e.target.id === "impRead") return void read();
  if (e.target.id === "impSave") return void save();
  const drop = e.target.closest("[data-impdrop]");
  if (drop) {
    st.files.splice(+drop.dataset.impdrop, 1);
    listFiles();
    stale();
  }
});

document.addEventListener("change", (e) => {
  if (!st) return;
  if (e.target.id === "impFiles") {
    addFiles(e.target.files);
    e.target.value = "";
  } else if (e.target.id === "impLinkAll") st.linkAll = e.target.checked;
  else if (e.target.classList.contains("impRow") || e.target.classList.contains("impAll")) {
    const sec = e.target.dataset.sec;
    const set = st.pick[sec];
    const key = (v) => (sec === "settings" ? v : +v);
    if (e.target.classList.contains("impAll")) {
      set.clear();
      if (e.target.checked) (sec === "settings" ? Object.keys(st.draft.settings) : st.draft[sec].map((x, i) => (x.problem ? -1 : i)).filter((i) => i >= 0)).forEach((k) => set.add(k));
    } else if (e.target.checked) set.add(key(e.target.value));
    else set.delete(key(e.target.value));
    show();
  }
});

document.addEventListener("input", (e) => {
  if (st && e.target.id === "impText") stale();
});

const dropTarget = (e) => Boolean(st && $("#impDrop") && e.target.closest?.(".modal"));
for (const type of ["dragenter", "dragover"])
  document.addEventListener(type, (e) => {
    if (!dropTarget(e) || !e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    $("#impDrop")?.classList.add("over");
  });
document.addEventListener("dragleave", (e) => {
  if (dropTarget(e) && !e.relatedTarget?.closest?.(".modal")) $("#impDrop")?.classList.remove("over");
});
document.addEventListener("drop", (e) => {
  if (!dropTarget(e) || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  $("#impDrop")?.classList.remove("over");
  addFiles(e.dataTransfer.files);
});
