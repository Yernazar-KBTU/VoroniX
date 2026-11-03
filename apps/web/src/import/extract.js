// Reads uploaded files and pasted text into tables (rows of cells) and plain
// text, in the browser, without libraries: CSV and TSV, Excel .xlsx, Word
// .docx (paragraphs and tables), JSON, HTML, Markdown and text. PDF files and
// photos are kept as base64 for Claude on the server.

/** @typedef {{ name: string, rows: string[][] }} Table */
/** @typedef {{ name: string, text: string }} Text */
/** @typedef {{ name: string, media_type: string, data: string }} Binary */
/** @typedef {{ tables: Table[], texts: Text[], files: Binary[], notes: string[] }} Extracted */

const empty = () => ({ tables: [], texts: [], files: [], notes: [] });
const ext = (name) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] || "").toLowerCase();

/* ---------- zip (xlsx and docx are zip archives) ---------- */

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Lists a zip archive's files; text(name) unpacks one of them as UTF-8. */
export function unzip(buf) {
  const b = new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("not a zip archive");
  const entries = new Map();
  const utf8 = new TextDecoder();
  let p = dv.getUint32(eocd + 16, true);
  for (let n = dv.getUint16(eocd + 10, true); n > 0 && dv.getUint32(p, true) === 0x02014b50; n--) {
    const nameLen = dv.getUint16(p + 28, true);
    entries.set(utf8.decode(b.subarray(p + 46, p + 46 + nameLen)), { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), at: dv.getUint32(p + 42, true) });
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return {
    names: [...entries.keys()],
    async text(name) {
      const e = entries.get(name);
      if (!e) return null;
      const start = e.at + 30 + dv.getUint16(e.at + 26, true) + dv.getUint16(e.at + 28, true);
      const raw = b.subarray(start, start + e.size);
      if (e.method !== 0 && e.method !== 8) throw new Error("unsupported zip compression");
      return utf8.decode(e.method === 0 ? raw : await inflate(raw));
    },
  };
}

/* ---------- XML without a DOM, so the same code runs in tests ---------- */

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const unxml = (s) =>
  String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m)));
const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const runs = (xml) => [...String(xml).replace(/<t\b[^>]*\/>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join("");

/* ---------- Excel .xlsx ---------- */

const pad = (n) => String(n).padStart(2, "0");
function cellNumber(n, kind) {
  if (kind === "time" || kind === "datetime") {
    const mins = Math.round((n - Math.floor(n)) * 1440) % 1440;
    const time = `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
    if (kind === "time") return time;
  }
  if (kind === "date" || kind === "datetime") {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
    const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return kind === "date" ? day : `${day} ${cellNumber(n, "time")}`;
  }
  return Number.isInteger(n) ? String(n) : String(+n.toFixed(6));
}

/** "time", "date", "datetime" or "" for each cell style, from the number format it uses. */
function styleKinds(styles) {
  const custom = new Map([...styles.matchAll(/<numFmt\b[^>]*>/g)].map((m) => [+attr(m[0], "numFmtId"), unxml(attr(m[0], "formatCode") || "")]));
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] || "";
  return [...xfs.matchAll(/<xf\b[^>]*>/g)].map((m) => {
    const id = +(attr(m[0], "numFmtId") || 0);
    if ((id >= 18 && id <= 21) || (id >= 45 && id <= 47)) return "time";
    if (id >= 14 && id <= 17) return "date";
    if (id === 22) return "datetime";
    const code = (custom.get(id) || "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "").toLowerCase();
    const date = /[yd]/.test(code), time = /h|s/.test(code);
    return date && time ? "datetime" : date ? "date" : time ? "time" : "";
  });
}

const colIndex = (ref) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

function sheetRows(xml, shared, kinds) {
  const rows = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], "r");
      const t = attr(c[1], "t");
      const inner = c[2] || "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let val = "";
      if (t === "s") val = shared[+v] ?? "";
      else if (t === "inlineStr") val = runs(inner);
      else if (t === "b") val = v === "1" ? "TRUE" : "FALSE";
      else if (t === "str" || t === "e") val = unxml(v ?? "");
      else if (v !== undefined && v !== "") val = cellNumber(+v, kinds[+(attr(c[1], "s") || 0)]);
      row[ref ? colIndex(ref) : row.length] = val.trim();
    }
    const cells = Array.from(row, (x) => x ?? "");
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

export async function readXlsx(buf, name) {
  const zip = unzip(buf);
  const shared = [...((await zip.text("xl/sharedStrings.xml")) || "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, "")));
  const kinds = styleKinds((await zip.text("xl/styles.xml")) || "");
  const rels = (await zip.text("xl/_rels/workbook.xml.rels")) || "";
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
  const out = empty();
  for (const m of ((await zip.text("xl/workbook.xml")) || "").matchAll(/<sheet\b[^>]*>/g)) {
    if (attr(m[0], "state") && attr(m[0], "state") !== "visible") continue;
    const t = target.get(attr(m[0], "r:id")) || "";
    const xml = await zip.text(t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, ""));
    const rows = xml ? sheetRows(xml, shared, kinds) : [];
    if (rows.length) out.tables.push({ name: `${name} · ${unxml(attr(m[0], "name") || "Sheet")}`, rows });
  }
  return out;
}

/* ---------- Word .docx ---------- */

function paragraphText(p) {
  return [...p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>|<w:cr\/>/g)]
    .map((m) => (m[1] !== undefined ? unxml(m[1]) : m[0].startsWith("<w:tab") ? "\t" : "\n"))
    .join("");
}
/** Word keeps list bullets in its numbering, not in the text, so list paragraphs get a "- " here. */
const isListItem = (p) => /<w:numPr\b|<w:pStyle w:val="[^"]*List/i.test(p) && !/<w:pStyle w:val="(?:heading|title)/i.test(p);
const paragraphs = (xml, lists = false) =>
  [...xml.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)].map((m) => {
    const t = paragraphText(m[1] || "");
    return lists && t.trim() && isListItem(m[1] || "") ? `- ${t.trim()}` : t;
  });

/** Top-level tables and the paragraphs between them, in document order. */
function docxParts(body) {
  const parts = [];
  const tag = /<w:tbl>|<w:tbl\s[^>]*>|<\/w:tbl>/g;
  let depth = 0, start = 0, last = 0, m;
  while ((m = tag.exec(body))) {
    if (m[0] !== "</w:tbl>") {
      if (depth++ === 0) {
        parts.push({ text: body.slice(last, m.index) });
        start = m.index;
      }
    } else if (depth > 0 && --depth === 0) {
      parts.push({ table: body.slice(start, tag.lastIndex) });
      last = tag.lastIndex;
    }
  }
  parts.push({ text: body.slice(last) });
  return parts;
}

export async function readDocx(buf, name) {
  const xml = (await unzip(buf).text("word/document.xml")) || "";
  const out = empty();
  const text = [];
  for (const part of docxParts(/<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] || xml)) {
    if (part.text !== undefined) text.push(...paragraphs(part.text, true));
    else {
      const rows = [...part.table.matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)]
        .map((r) => [...r[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)].map((c) => paragraphs(c[1]).map((x) => x.trim()).filter(Boolean).join(", ")))
        .filter((r) => r.some(Boolean));
      if (rows.length) out.tables.push({ name: `${name} · table ${out.tables.length + 1}`, rows });
    }
  }
  const joined = text.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (joined) out.texts.push({ name, text: joined });
  return out;
}

/* ---------- text, CSV, JSON, HTML ---------- */

/** UTF-8, UTF-16 with a byte order mark, or Windows-1251 (Excel on a Russian Windows). */
export function decodeText(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1251").decode(b);
  }
}

/** RFC 4180 CSV with any one-character delimiter; quoted fields may hold delimiters and new lines. */
export function parseDelimited(text, d) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') field += '"', i++;
      else quoted = false;
    } else if (ch === '"' && !field.trim()) (quoted = true), (field = "");
    else if (ch === d) row.push(field), (field = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += ch;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

const countOutside = (line, d) => {
  let n = 0, q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) n++;
  }
  return n;
};

/** The delimiter of a CSV file: the one that splits most lines into the same number of cells. */
export function sniffDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  let best = null, bestScore = 0;
  for (const d of ["\t", ";", ",", "|"]) {
    const counts = lines.map((l) => countOutside(l, d));
    const freq = new Map();
    for (const c of counts) freq.set(c, (freq.get(c) || 0) + 1);
    const [mode, hits] = [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    if (!mode) continue;
    const score = hits / lines.length + mode / 100;
    if (score > bestScore) (best = d), (bestScore = score);
  }
  return best;
}

const pipeRow = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const isRule = (cells) => cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "");

/**
 * Pasted or plain text: Markdown tables (| a | b |) and tab-separated blocks
 * (copied from Excel, Google Sheets or Word) become tables; the rest stays text.
 */
export function splitText(text, name) {
  const out = empty();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let prose = [];
  const flushProse = () => {
    const t = prose.join("\n").trim();
    if (t) out.texts.push({ name, text: t });
    prose = [];
  };
  for (let i = 0; i < lines.length; ) {
    const pipe = /^\s*\|.*\|\s*$/.test(lines[i]);
    const tab = lines[i].includes("\t") && lines[i].trim();
    if (!pipe && !tab) {
      prose.push(lines[i++]);
      continue;
    }
    let j = i;
    while (j < lines.length && (pipe ? /^\s*\|.*\|\s*$/.test(lines[j]) : lines[j].includes("\t") && lines[j].trim())) j++;
    const block = lines.slice(i, j);
    const rows = pipe ? block.map(pipeRow).filter((r) => !isRule(r)) : parseDelimited(block.join("\n"), "\t");
    if (rows.length >= 2) {
      flushProse();
      out.tables.push({ name: `${name} · table ${out.tables.length + 1}`, rows });
    } else prose.push(...block);
    i = j;
  }
  flushProse();
  return out;
}

function fromJson(value, name) {
  const out = empty();
  const isRows = (v) => Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object" && !Array.isArray(x));
  const table = (list, label) => {
    const keys = [...new Set(list.flatMap((x) => Object.keys(x)))];
    out.tables.push({ name: label, rows: [keys, ...list.map((x) => keys.map((k) => (x[k] == null ? "" : typeof x[k] === "object" ? JSON.stringify(x[k]) : String(x[k]))))] });
  };
  if (isRows(value)) table(value, name);
  else if (value && typeof value === "object") {
    const lines = [];
    for (const [k, v] of Object.entries(value)) {
      if (isRows(v)) table(v, `${name} · ${k}`);
      else if (v != null && typeof v !== "object") lines.push(`${k}: ${v}`);
      else if (v != null) lines.push(`${k}: ${JSON.stringify(v)}`);
    }
    if (lines.length) out.texts.push({ name, text: lines.join("\n") });
  }
  return out;
}

/** HTML (a saved web page, or an export from Excel or Google Sheets): table cells become tab-separated lines. */
export function htmlToText(html) {
  return unxml(
    String(html)
      .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/\s*\n\s*/g, " ")
      .replace(/<\/(td|th)>\s*/gi, "\t")
      .replace(/<br\s*\/?>|<\/(tr|p|div|li|h\d|table)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " "),
  )
    .split("\n")
    .map((l) => l.replace(/\t+$/, "").trim())
    .join("\n");
}

/* ---------- PDF and photos: base64 for Claude ---------- */

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Photos are re-encoded as JPEG no larger than 2000 px, which also turns iPhone HEIC into a format Claude reads. */
async function photo(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  return { name: file.name, media_type: "image/jpeg", data: await toBase64(blob) };
}

/* ---------- entry points ---------- */

const MAX_TEXT = 200000;
const IMAGE = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "bmp", "tif", "tiff"]);
const OLD = { xls: "Excel 97-2003 (.xls): open it and save as .xlsx or CSV", doc: "Word 97-2003 (.doc): open it and save as .docx", ppt: "PowerPoint: save the slides as PDF", pptx: "PowerPoint: save the slides as PDF", numbers: "Numbers: export as Excel or CSV", pages: "Pages: export as Word or PDF", odt: "OpenDocument: save as .docx", ods: "OpenDocument: save as .xlsx", rtf: "RTF: save as .docx or .txt" };

/** One file in, tables, texts and files for Claude out. Never throws: problems become notes. */
export async function extractFile(file) {
  const name = file.name || "file";
  const e = ext(name);
  try {
    if (e === "xlsx" || e === "xlsm") return await readXlsx(await file.arrayBuffer(), name);
    if (e === "docx") return await readDocx(await file.arrayBuffer(), name);
    if (e === "pdf" || file.type === "application/pdf") {
      if (file.size > 10 * 1024 * 1024) return { ...empty(), notes: [`${name}: PDF files up to 10 MB can be read. Split this one.`] };
      return { ...empty(), files: [{ name, media_type: "application/pdf", data: await toBase64(file) }] };
    }
    if (IMAGE.has(e) || file.type.startsWith("image/")) return { ...empty(), files: [await photo(file)] };
    if (OLD[e]) return { ...empty(), notes: [`${name}: ${OLD[e]}, then upload it again.`] };
    if (file.size > 20 * 1024 * 1024) return { ...empty(), notes: [`${name}: files up to 20 MB can be read.`] };
    const text = decodeText(await file.arrayBuffer());
    if (/\u0000/.test(text.slice(0, 2000))) return { ...empty(), notes: [`${name}: this file type cannot be read. Save it as Excel, Word, CSV, PDF or text.`] };
    if (e === "json") {
      try {
        return fromJson(JSON.parse(text), name);
      } catch {
        /* not valid JSON: read it as text */
      }
    }
    if (e === "csv" || e === "tsv") {
      const rows = parseDelimited(text, e === "tsv" ? "\t" : sniffDelimiter(text) || ",");
      return { ...empty(), tables: rows.length ? [{ name, rows }] : [] };
    }
    const plain = e === "html" || e === "htm" || /^\s*<(!doctype html|html)/i.test(text) ? htmlToText(text) : text;
    return splitText(plain.slice(0, MAX_TEXT), name);
  } catch (err) {
    return { ...empty(), notes: [`${name}: could not be read (${err.message || err}).`] };
  }
}

/** Text typed or pasted into the import box. */
export const extractPasted = (text) => splitText(String(text).slice(0, MAX_TEXT), "Pasted text");

/** Everything from several sources in one place. */
export function merge(list) {
  const out = empty();
  for (const x of list) for (const k of Object.keys(out)) out[k].push(...(x[k] || []));
  return out;
}
