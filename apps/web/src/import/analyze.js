// Recognises CRM data in tables and text: services with prices and durations,
// staff with working days and hours, clients, business settings, and
// everything else as knowledge for the AI. Works offline in the browser and in
// the demo. Claude on the server reads PDF files and photos into the same draft.

export const emptyDraft = () => ({ settings: {}, services: [], staff: [], clients: [], knowledge: [], notes: [] });

/* ---------- small text helpers ---------- */

const clean = (s) => String(s ?? "").replace(/[    ​]/g, " ").replace(/\s+/g, " ").trim();
const low = (s) => clean(s).toLowerCase().replace(/ё/g, "е");
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const cut = (s, n) => clean(s).slice(0, n).trim();
const strip = (s) => clean(s).replace(/^[\s\-*•·–\u2014>]+|^\d{1,2}[.)]\s+/, "").replace(/[\s,;:.|–\u2014-]+$/, "").trim();
/** Matches the words in `x` only as whole words, also in Cyrillic. */
const word = (x) => `(?<![\\p{L}\\p{N}])(?:${x})(?![\\p{L}])`;
/** A unit right after a number: "60min", "1 ч". */
const unit = (x) => `(?:${x})(?![\\p{L}])`;

/* ---------- prices ---------- */

const CUR_SYM = "[$€£₸₽¥₩₹฿₱]";
const CUR_WORDS = "usd|eur|gbp|kzt|rub|uzs|kgs|aed|sgd|myr|idr|thb|php|inr|krw|jpy|cny|rs|rp|rm|тг|тенге|руб|рублей|рубля|сом|сум|долл\\p{L}*|dollars?|euros?";
const CUR = new RegExp(`${CUR_SYM}|${word(CUR_WORDS)}`, "iu");
const NUM = String.raw`\d{1,3}(?:[ .,'’]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;

/** "5 000" → 5000, "1,500" → 1500, "45.00" → 45, "12.345,67" → 12346 */
export function toNumber(raw) {
  const s = String(raw).replace(/[\s'’]/g, "");
  const m = /^(\d+(?:[.,]\d{3})*)(?:[.,](\d{1,2}))?$/.exec(s);
  return m ? Math.round(+`${m[1].replace(/[.,]/g, "")}.${m[2] || "0"}`) : NaN;
}

/**
 * A price in a cell or a line. In a price column any number counts; in free
 * text (strict) the number needs a currency next to it, or must end a line
 * after dots or a dash ("Haircut ..... 5000").
 */
export function parsePrice(text, strict = false) {
  const s = clean(text);
  const nums = [...s.matchAll(new RegExp(NUM, "g"))];
  for (const m of nums) {
    const before = s.slice(Math.max(0, m.index - 6), m.index);
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 10);
    if (/^\s*(%|:\d|[.,]\d)/.test(after) || new RegExp(`^\\s*${unit("h|hr|hrs|hours?|ч|час\\p{L}*|m|min|mins|minutes?|м|мин\\p{L}*")}`, "iu").test(after)) continue;
    const near = CUR.test(before.slice(-3)) || new RegExp(`^\\s*(?:${CUR_SYM}|${unit(CUR_WORDS)})`, "iu").test(after);
    const leader = strict && /(?:\.{2,}|…|[-–\u2014:=|])\s*(?:от|from)?\s*$/iu.test(s.slice(0, m.index)) && !s.slice(m.index + m[0].length).trim();
    if (strict && !near && !leader) continue;
    const value = toNumber(m[0]);
    if (!(value > 0)) continue;
    const range = new RegExp(`^\\s*(?:${CUR_SYM}|${unit(CUR_WORDS)})?\\s*[-–\u2014]\\s*(?:${CUR_SYM})?\\s*\\d`, "iu").test(after);
    return { value, text: m[0], note: range ? "price is a range, the lowest is used" : "" };
  }
  return null;
}

/* ---------- durations ---------- */

const HOUR_UNIT = "h|hr|hrs|hours?|ч|час|часа|часов|сағ|сағат";
const MIN_UNIT = "m|min|mins|minutes?|м|мин|минут|минуты|минута|мин\\.";

/** Minutes: "60 min", "1 h 30 min", "1.5 h", "1h30", "полтора часа"; in a duration column also "90", "1:30" and "1" (hours). */
export function parseDuration(text, loose = false, inHours = false) {
  const s = low(text).replace(/(\d),(\d)/g, "$1.$2");
  if (!s) return null;
  if (/полтора час|1,5 час|one and a half hour/.test(s)) return 90;
  if (/(?<![\p{L}])(полчаса|half an hour)/u.test(s)) return 30;
  const h = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit(HOUR_UNIT)}\\.?\\s*(\\d{1,2}(?!\\s*${unit(HOUR_UNIT)}))?`, "iu").exec(s);
  const m = new RegExp(`(\\d+)\\s*${unit(MIN_UNIT)}`, "iu").exec(h ? s.slice(h.index + h[0].length) : s);
  if (h || m) return Math.round((h ? +h[1] * 60 + (+h[2] || 0) : 0) + (m ? +m[1] : 0)) || null;
  if (!loose) return null;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (hm) return +hm[1] * 60 + +hm[2];
  const n = parseFloat((/\d+(?:\.\d+)?/.exec(s) || [])[0]);
  if (!(n > 0)) return null;
  return Math.round(inHours || n <= 6 ? n * 60 : n);
}

/* ---------- times, hours and days ---------- */

const pad = (n) => String(n).padStart(2, "0");
const fmt = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
const TIME = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?`;
const TO = String.raw`\s*(?:-|–|\u2014|to|till|until|до|по)\s*`;
const RANGE = new RegExp(`(?:^|[^\\d:.,])${TIME}${TO}${TIME}(?![\\d:])`, "i");
const FROM_TO = new RegExp(`(?:^|[^\\p{L}])(?:с|from)\\s+${TIME}\\s+(?:до|to|till|until)\\s+${TIME}`, "iu");

function minutes(h, m, ap) {
  let hour = +h;
  if (ap) {
    const pm = /^p/i.test(ap);
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  }
  return hour * 60 + +(m || 0);
}

/** Working hours "10:00-19:00", "10-19", "9am-6pm", "с 10 до 19". Free text (strict) needs minutes, am/pm or "с ... до". */
export function parseHours(text, strict = false) {
  const s = low(text);
  const f = FROM_TO.exec(s);
  const r = f || RANGE.exec(s);
  if (!r) return null;
  const [, h1, m1, a1, h2, m2, a2] = r;
  if (strict && !f && !m1 && !m2 && !a1 && !a2) return null;
  if (+m1 > 59 || +m2 > 59 || +h1 > 24 || +h2 > 24) return null;
  const start = minutes(h1, m1, a1 || (a2 && +h1 <= +h2 && +h2 !== 12 ? a2 : ""));
  let end = minutes(h2, m2, a2);
  if (end <= start && !a2 && +h2 < 12) end += 720;
  if (start >= end || end > 1440) return null;
  return { start: fmt(start), end: fmt(end) };
}

/** One time of day: "10:00", "9 am", "18.30", or an Excel fraction of a day "0.75". */
export function parseTime(text) {
  const s = low(text);
  if (/^0?\.\d+$/.test(s)) return fmt(Math.round(+s * 1440) % 1440);
  const m = new RegExp(`^${TIME}$`, "i").exec(s);
  if (!m || +m[1] > 24 || +(m[2] || 0) > 59) return null;
  const v = minutes(m[1], m[2], m[3]);
  return v <= 1440 ? fmt(v) : null;
}

const DAY_PREFIX = [
  [0, /^(sun|sunday|sundays|вс|вск|воскр\p{L}*|жс|жексенбі)$/u],
  [1, /^(mon|monday|mondays|пн|пон|понед\p{L}*|дс|дүйсенбі)$/u],
  [2, /^(tue|tues|tuesday|tuesdays|вт|вто|вторн\p{L}*|сс|сейсенбі)$/u],
  [3, /^(wed|weds|wednesday|wednesdays|ср|сре|сред[аыу]|средам|сәрсенбі)$/u],
  [4, /^(thu|thur|thurs|thursday|thursdays|чт|чет|четв\p{L}*|бс|бейсенбі)$/u],
  [5, /^(fri|friday|fridays|пт|пят|пятн\p{L}*|жм|жұма)$/u],
  [6, /^(sat|saturday|saturdays|сб|суб|суббот\p{L}*|сенбі)$/u],
];
const SHORT_EN = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 };
const ALL = [0, 1, 2, 3, 4, 5, 6];

function dayOf(token, short) {
  for (const [d, re] of DAY_PREFIX) if (re.test(token)) return d;
  return short && token in SHORT_EN ? SHORT_EN[token] : null;
}

/**
 * Working days as numbers (0 Sunday … 6 Saturday): "Mon-Fri", "пн, ср, пт",
 * "Tue to Sat", "daily", "будни", "every day except Monday", "Mon-Sat, Sun closed".
 */
export function parseDays(text, strict = false) {
  const s = low(text);
  if (!s) return null;
  let base = null, note = "";
  if (/(ежедневн|каждый день|без выходных|everyday|every day|daily|7 days|7\/7|24\/7|all week|все дни|күн сайын)/u.test(s)) base = ALL;
  else if (/(будн|weekdays|5\/2|рабочие дни)/u.test(s)) base = [1, 2, 3, 4, 5];
  else if (/(^|\D)2\/2(\D|$)/.test(s)) (base = ALL), (note = "2/2 shifts: set to every day, adjust on the Staff page");
  else if (/(weekends?|по выходным)/u.test(s)) base = [0, 6];
  const tokens = s.match(/[\p{L}]+|[-–\u2014/,;]|\d+/gu) || [];
  const short = !strict && tokens.length <= 7;
  const pos = new Set(), neg = new Set();
  let negating = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^(кроме|except|без|not|but|excluding|выходной|выходные|выходн\p{L}*|off|closed)$/u.test(t) && dayOf(tokens[i + 1] ?? "", short) !== null) {
      negating = true;
      continue;
    }
    const d = dayOf(t, short);
    if (d === null) {
      if (!/^[-–\u2014/,;]$|^(и|and|по|to|till|until|до|с|from|&)$/u.test(t)) negating = false;
      continue;
    }
    let group = [d];
    if (/^([-–\u2014]|to|по|till|until|до)$/u.test(tokens[i + 1] ?? "") && dayOf(tokens[i + 2] ?? "", short) !== null) {
      const end = dayOf(tokens[i + 2], short);
      group = [];
      for (let x = d; ; x = (x + 1) % 7) {
        group.push(x);
        if (x === end) break;
      }
      i += 2;
    }
    const off = negating || /^(closed|off|выходн\p{L}*|не|закрыт\p{L}*)$/u.test(tokens[i + 1] ?? "");
    for (const x of group) (off ? neg : pos).add(x);
  }
  if (!pos.size && !base && !neg.size) return null;
  const days = (pos.size ? [...new Set([...(base || []), ...pos])] : base || ALL).filter((x) => !neg.has(x)).sort();
  return days.length ? { days, note } : null;
}

/* ---------- phones ---------- */

export function findPhone(text) {
  for (const m of String(text).matchAll(/(?:\+|00)?\d[\d\s().-]{5,}\d/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15 || /\d[.:]\d\d(?!\d)/.test(m[0].replace(/\s/g, "")) && digits.length < 9) continue;
    if (CUR.test(String(text).slice(Math.max(0, m.index - 2), m.index)) || CUR.test(String(text).slice(m.index + m[0].length, m.index + m[0].length + 4))) continue;
    return { text: m[0].trim(), index: m.index };
  }
  return null;
}

/* ---------- linking staff to services by meaning, in English, Russian and Kazakh ---------- */

const CONCEPTS = [
  ["haircut", /^(haircuts?|cuts?|trim|стрижк\p{L}*|стриж\p{L}*|подстри\p{L}*|шаш)$/u],
  ["men", /^(men|mens|man|male|gents?|мужск\p{L}*|муж|ер)$/u],
  ["women", /^(women|womens|woman|female|lady|ladies|женск\p{L}*|жен|әйел)$/u],
  ["kids", /^(kids?|child|children|childrens|boys?|girls?|детск\p{L}*|дет\p{L}*|ребен\p{L}*|бала)$/u],
  ["color", /^(colou?rs?|colou?ring|dye|dyeing|tint\p{L}*|окраш\p{L}*|покраск\p{L}*|тонир\p{L}*|колор\p{L}*|бояу)$/u],
  ["highlights", /^(highlights?|balayage|мелир\p{L}*|балаяж)$/u],
  ["styling", /^(styl\p{L}*|blow ?dry|blowout|укладк\p{L}*|уклад\p{L}*|прическ\p{L}*)$/u],
  ["beard", /^(beards?|бород\p{L}*|сақал)$/u],
  ["shave", /^(shav\p{L}*|брить\p{L}*|бритье|бритьё)$/u],
  ["manicure", /^(manicures?|маникюр\p{L}*)$/u],
  ["pedicure", /^(pedicures?|педикюр\p{L}*)$/u],
  ["nails", /^(nails?|ногт\p{L}*|тырнақ)$/u],
  ["gel", /^(gel|gels|shellac|гел\p{L}*|шеллак)$/u],
  ["brow", /^(brows?|eyebrows?|бров\p{L}*|қас)$/u],
  ["lash", /^(lash\p{L}*|eyelash\p{L}*|ресниц\p{L}*|кірпік)$/u],
  ["massage", /^(massag\p{L}*|массаж\p{L}*|уқалау)$/u],
  ["facial", /^(facials?|face|лиц\p{L}*|чистк\p{L}*)$/u],
  ["wax", /^(wax\p{L}*|depil\p{L}*|воск\p{L}*|депил\p{L}*|шугар\p{L}*|sugaring)$/u],
  ["makeup", /^(makeup|make|макияж\p{L}*|мейк\p{L}*)$/u],
  ["hair", /^(hair|волос\p{L}*|шаш)$/u],
];
const STOP = /^(и|and|с|со|with|for|на|по|of|the|a|an|все|all|любые|any|услуги|services?|&|\+)$/u;

function concepts(text) {
  return low(text)
    .replace(/['’`]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t && !STOP.test(t))
    .map((t) => CONCEPTS.find(([, re]) => re.test(t))?.[0] ?? t.slice(0, 5));
}

/** Which of the services a phrase like "мужская стрижка" or "nails" means. */
export function matchServices(phrase, names) {
  const p = low(phrase);
  if (!p) return [];
  if (/^(все|всё|all|any|любые|everything|все услуги|all services)$/u.test(p)) return [...names];
  const exact = names.find((n) => low(n) === p);
  if (exact) return [exact];
  const want = concepts(p);
  if (!want.length) return [];
  return names.filter((n) => {
    const have = concepts(n);
    return want.every((w) => have.includes(w));
  });
}
const splitList = (s) => clean(s).split(/\s*(?:[,;/\n•]|\s(?:и|and|&)\s)\s*/u).map(strip).filter(Boolean);

/* ---------- rows into draft items, with the reasons a row cannot be saved ---------- */

const RULE_WORDS = /(акци|скидк|промо|бонус|подар|кэшбэк|promo|discount|sale|offer|предоплат|аванс|депозит|prepay|deposit|правил|нельзя|обязательн|опоздан|отмен|перенос|штраф|запрещ|must|rule|policy|late|cancel|%)/iu;

export function pushService(d, raw) {
  const name = cut(strip(raw.name), 50);
  if (!name) return;
  const item = { name, category: cut(raw.category || "", 30), duration_min: 0, price: 0, staff: raw.staff || [], code: /^[A-Z]{2}-\d{2}$/.test(raw.code || "") ? raw.code : undefined, source: raw.source, notes: [], problem: "" };
  const price = typeof raw.price === "number" ? { value: Math.round(raw.price), note: "" } : parsePrice(raw.price ?? "", false);
  if (price && price.value > 0) {
    item.price = price.value;
    if (price.note) item.notes.push(price.note);
  } else item.problem = "no price";
  let dur = typeof raw.duration === "number" ? raw.duration : parseDuration(raw.duration ?? "", true, raw.inHours);
  if (!(dur > 0)) {
    dur = 60;
    item.notes.push("no duration, set to 60 min");
  } else if (dur < 15 || dur > 240) {
    item.notes.push(`${dur} min is outside 15 to 240, saved as ${dur < 15 ? 15 : 240}`);
    dur = dur < 15 ? 15 : 240;
  }
  item.duration_min = Math.round(dur);
  const i = d.services.findIndex((s) => low(s.name) === low(name));
  if (i >= 0) d.services[i] = { ...item, staff: [...new Set([...d.services[i].staff, ...item.staff])] };
  else d.services.push(item);
}

export function pushStaff(d, raw) {
  const full_name = cut(strip(raw.full_name), 60);
  if (!full_name || /\d{3}/.test(full_name)) return;
  const item = { full_name, specialization: cut(raw.specialization || "", 40), days: raw.days, work_start: raw.work_start, work_end: raw.work_end, phrases: raw.phrases || [], services: [], source: raw.source, notes: [...(raw.notes || [])], problem: "" };
  if (item.work_start && item.work_end && item.work_end <= item.work_start) {
    item.notes.push(`${item.work_start}-${item.work_end} is not a day shift, hours left unchanged`);
    item.work_start = item.work_end = undefined;
  }
  if (!item.work_start || !item.work_end) {
    item.work_start = item.work_end = undefined;
    item.notes.push("no hours given");
  }
  if (!item.days?.length) {
    item.days = undefined;
    item.notes.push("no working days given");
  }
  const i = d.staff.findIndex((s) => low(s.full_name) === low(full_name));
  if (i >= 0) {
    const old = d.staff[i];
    d.staff[i] = { ...old, ...Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined && v !== "")), phrases: [...old.phrases, ...item.phrases], notes: item.notes.length < old.notes.length ? item.notes : old.notes };
  } else d.staff.push(item);
}

export function pushClient(d, raw) {
  const phone = clean(raw.phone);
  const display_name = cut(strip(raw.display_name) || phone, 50);
  if (!display_name) return;
  d.clients.push({ display_name, phone, notes: cut(raw.notes || "", 2000), source: raw.source, notes_list: [], problem: "" });
}

/* ---------- tables ---------- */

/** Header words, matched from the start of a word so that "дни" is not found inside "сотрудник". */
const stems = (x) => new RegExp(`(?<![\\p{L}])(?:${x})`, "u");
const HEAD = [
  ["code", /^(code|service code|sku|id|код|код услуги|артикул)$/u],
  ["phone", stems("phone|mobile|telephone|whatsapp|cell|телефон|мобил|сотов|ватсап|номер(?![\\p{L}])|tel(?![\\p{L}])|тел(?![\\p{L}])")],
  ["email", stems("e-?mail|почта")],
  ["notes", stems("note|comment|remark|примечан|коммент|заметк|ескерту")],
  ["price", stems("price|cost|amount|fee|rate|tariff|цен[аы]|стоимост|сумм[аы]|прайс|тариф|баға")],
  ["duration", stems("duration|length|minutes|mins?(?![\\p{L}])|длительн|продолжительн|время процедуры|минут|мин(?![\\p{L}])|ұзақтығы")],
  ["days", stems("days|working days|work days|weekdays|дни(?![\\p{L}])|день недели|күндер")],
  ["start", /^(start|from|starts|start time|begin|начало|с|от|начало работы|басталуы)$/u],
  ["end", /^(end|to|until|ends|end time|finish|конец|до|окончание|конец работы|аяқталуы)$/u],
  ["hours", stems("hours|schedule|shift|working time|work time|time(?![\\p{L}])|час[ыа]?(?![\\p{L}])|время|график|смен[аы]|расписан|режим|уақыт")],
  ["name", /^(name|full name|first name|title|item|название|наименование|имя|фио|ф\.?и\.?о\.?|аты|аты-жөні|аты жөні|имя фамилия|фамилия имя|фамилия)$/u],
  ["role", stems("position|role|job|specializ|specialis(?:ation|ty)|specialty|speciality|должност|специализ|роль|професси|лауазым|мамандығы")],
  ["category", stems("category|group|section|type|kind|категор|групп|раздел|тип(?![\\p{L}])|вид(?![\\p{L}])|направлен|санат")],
  ["staffName", stems("employee|staff|master|stylist|barber|specialist|worker|team|doctor|trainer|сотрудник|мастер|специалист|работник|персонал|исполнитель|врач|тренер|қызметкер|шебер")],
  ["clientName", stems("client|customer|guest|patient|клиент|гост[ьи]|покупател|пациент|тұтынушы")],
  ["serviceName", stems("service|procedure|treatment|услуг|процедур|қызмет")],
];

const headField = (h) => {
  const t = low(h).replace(/[()[\]:*#№]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const day = parseDays(t);
  if (day && day.days.length === 1 && t.split(" ").length <= 2 && dayOf(t.split(" ")[0], true) !== null) return `day${day.days[0]}`;
  return HEAD.find(([, re]) => re.test(t))?.[0] ?? null;
};

const share = (cells, fn) => {
  const filled = cells.filter(Boolean);
  return filled.length ? filled.filter(fn).length / filled.length : 0;
};
const OFF_CELL = /^(|-|–|\u2014|x|х|off|выходной|вых|нет|no|0|closed|day off|демалыс)$/iu;

function classify(rows) {
  let hi = -1;
  for (let i = 0; i < Math.min(5, rows.length - 1); i++) {
    const known = rows[i].filter((c) => !/\d/.test(c) && headField(c)).length;
    const numbers = rows[i].filter((c) => /\d/.test(c)).length;
    if (known >= 1 && known >= numbers && rows[i].filter(Boolean).length >= 2) {
      hi = i;
      break;
    }
  }
  const head = hi >= 0 ? rows[hi] : [];
  const data = rows.slice(hi + 1);
  const width = Math.max(...rows.map((r) => r.length));
  const col = (j) => data.map((r) => clean(r[j]));
  const F = {};
  for (let j = 0; j < width; j++) {
    let f = headField(head[j] || "");
    const cells = col(j);
    if (f === "hours" && share(cells, (c) => parseHours(c)) < 0.5 && share(cells, (c) => parseDuration(c, true)) >= 0.5 && !share(cells, (c) => parseDays(c, true))) f = "duration";
    if (f === "duration" && share(cells, (c) => parseHours(c)) >= 0.5) f = "hours";
    if (f === "start" && share(cells, (c) => parseTime(c)) < 0.5) f = f && share(cells, (c) => parseHours(c)) >= 0.5 ? "hours" : null;
    if (!f && cells.some(Boolean)) {
      // No header: guess the column from what is in it.
      if (share(cells, (c) => parseHours(c)) >= 0.6) f = "hours";
      else if (share(cells, (c) => parseDays(c)) >= 0.6) f = "days";
      else if (share(cells, (c) => findPhone(c)) >= 0.6) f = "phone";
      else if (share(cells, (c) => parsePrice(c, true)) >= 0.6) f = "price";
      else if (share(cells, (c) => parseDuration(c)) >= 0.6) f = "duration";
      else if (share(cells, (c) => /^\d[\d\s.,]*$/.test(c) || parseDuration(c)) >= 0.8) f = share(cells, (c) => (parseDuration(c) ?? toNumber(c)) <= 240) >= 0.8 ? "duration" : "price";
      else if (share(cells, (c) => /\p{L}/u.test(c)) >= 0.6) f = "text";
    }
    if (f === "text") (F.texts ??= []).push(j);
    else if (f && F[f] === undefined) F[f] = j;
  }
  // A plain "name" or a text column becomes the name of whatever the table holds.
  const days = Object.keys(F).filter((k) => /^day\d$/.test(k));
  const staffy = ["hours", "days", "start", "end", "role"].some((k) => F[k] !== undefined) || days.length >= 2;
  let kind = null;
  if (F.price !== undefined && !(staffy && F.hours !== undefined)) kind = "services";
  else if (staffy || (F.staffName !== undefined && F.clientName === undefined && F.phone === undefined)) kind = "staff";
  else if (F.phone !== undefined || F.clientName !== undefined) kind = "clients";
  else if (F.duration !== undefined && (F.name !== undefined || F.serviceName !== undefined || F.texts)) kind = "services";
  return { kind, F, days, head, data, hi };
}

/** One table into services, staff or clients; anything else is kept as knowledge. */
export function analyzeTable(table, d) {
  const rows = table.rows.filter((r) => r.some((c) => clean(c)));
  if (rows.length < 1) return;
  const { kind, F, days, head, data } = classify(rows);
  const at = (r, k) => (F[k] === undefined ? "" : clean(r[F[k]]));
  const firstText = (r) => (F.texts || []).map((j) => clean(r[j])).find(Boolean) || "";
  const source = table.name;
  if (kind === "services") {
    const inHours = /(\(h\)|hours|час)/iu.test(low(head[F.duration] || ""));
    let category = "";
    for (const r of data) {
      const name = at(r, "name") || at(r, "serviceName") || firstText(r);
      const others = r.filter((c, j) => clean(c) && j !== F.name && j !== F.serviceName && j !== (F.texts || [])[0]);
      if (name && !others.length && !parsePrice(name)) {
        category = name; // a row with only a title starts a section of the price list
        continue;
      }
      if (!name) continue;
      pushService(d, { name, code: at(r, "code").toUpperCase(), category: at(r, "category") || category, price: at(r, "price"), duration: at(r, "duration"), inHours, staff: splitList(at(r, "staffName")), source });
    }
    return;
  }
  if (kind === "staff") {
    for (const r of data) {
      const full_name = at(r, F.name !== undefined ? "name" : "staffName") || firstText(r);
      if (!full_name) continue;
      const notes = [];
      let found = null, hours = null;
      if (days.length) {
        const on = [];
        let start = null, end = null;
        for (const k of days) {
          const cell = clean(r[F[k]]);
          if (OFF_CELL.test(cell)) continue;
          on.push(+k.slice(3));
          const h = parseHours(cell);
          if (h) (start = !start || h.start < start ? h.start : start), (end = !end || h.end > end ? h.end : end);
        }
        found = { days: on.sort(), note: "" };
        const s = parseTime(at(r, "start")), e = parseTime(at(r, "end"));
        if (s && e) (start = s), (end = e);
        if (start) hours = { start, end };
        const differ = new Set(days.map((k) => clean(r[F[k]])).filter((c) => !OFF_CELL.test(c))).size > 1;
        if (differ && hours) notes.push(`hours differ by day, saved as ${start}-${end}`);
      } else {
        found = parseDays(at(r, "days")) || parseDays(at(r, "hours"));
        hours = parseHours(at(r, "hours")) || parseHours(at(r, "days"));
        if (!hours && F.start !== undefined) {
          const s = parseTime(at(r, "start")), e = parseTime(at(r, "end"));
          if (s && e) hours = { start: s, end: e };
        }
      }
      if (found?.note) notes.push(found.note);
      pushStaff(d, { full_name, specialization: at(r, "role"), days: found?.days, work_start: hours?.start, work_end: hours?.end, phrases: splitList(at(r, "serviceName")), notes, source });
    }
    return;
  }
  if (kind === "clients") {
    const used = new Set(["name", "clientName", "phone", "notes"].map((k) => F[k]));
    if (F.name === undefined && F.clientName === undefined && F.texts) used.add(F.texts[0]);
    for (const r of data) {
      const extra = head.length ? r.map((c, j) => (!used.has(j) && clean(c) ? `${clean(head[j]) || "Info"}: ${clean(c)}` : "")).filter(Boolean) : [];
      pushClient(d, { display_name: at(r, "name") || at(r, "clientName") || firstText(r), phone: at(r, "phone"), notes: [at(r, "notes"), ...extra].filter(Boolean).join("; "), source });
    }
    return;
  }
  // Not a list the CRM has a table for: two columns are read as "key: value" lines, anything else is kept for the AI.
  if (Math.max(...rows.map((r) => r.filter((c) => clean(c)).length)) <= 2) analyzeText(rows.map((r) => r.filter((c) => clean(c)).join(": ")).join("\n"), source, d);
  else d.knowledge.push({ title: cut(source.replace(/\.[a-z0-9]+(?= ·|$)/i, ""), 120), category: "Uploaded", content: rows.map((r) => r.map(clean).join(" | ")).join("\n").slice(0, 60000), source });
}

/* ---------- free text ---------- */

const SETTING_RULES = [
  ["name", "business(?: name)?|company(?: name)?|brand|salon name|studio name|название(?: компании| салона| бизнеса| студии)?|компания|бренд|наименование"],
  ["type", "business type|type of business|type|тип(?: бизнеса)?|вид деятельности|сфера"],
  ["city", "city|town|город|қала"],
  ["address", "address|location|адрес|наш адрес|новый адрес|мы находимся(?: по адресу)?|мекенжай|мекен-жай"],
  ["hours", "opening hours|business hours|working hours|work hours|hours|open|we are open|we're open|часы работы|режим работы|график работы|время работы|работаем|мы работаем|жұмыс уақыты"],
  ["phone", "phone(?: number)?|tel|telephone|mobile|whatsapp|call us(?: at)?|contact phone|телефон|тел|номер телефона|звоните|контактный телефон|контакты|ватсап"],
  ["catchphrase", "slogan|tagline|catchphrase|motto|our slogan|слоган|девиз|наш слоган|наш девиз|ұран"],
  ["languages", "languages?|we speak|языки(?: общения)?|язык общения|тілдер"],
  ["tone", "tone(?: of voice)?|тон(?: общения)?|стиль общения"],
].map(([k, keys]) => [k, new RegExp(`^(?:${keys})(?![\\p{L}])\\.?\\s*${k === "address" || k === "hours" || k === "catchphrase" ? "[:：\u2014–-]?" : "[:：\u2014–-]"}\\s*(.+)$`, "iu")]);
const MAX = { name: 80, type: 60, city: 60, address: 160, hours: 120, phone: 40, catchphrase: 200, languages: 120, tone: 2000 };

function settingLine(line, d) {
  for (const [k, re] of SETTING_RULES) {
    const m = re.exec(line);
    if (!m) continue;
    let v = clean(m[1]);
    if (k === "hours" && !/\d/.test(v)) continue;
    if (k === "phone") {
      const p = findPhone(v);
      if (!p) continue;
      v = p.text;
    }
    if (k !== "tone") v = v.replace(/[.;]+$/, "").replace(/^[«"“']+|[»"”']+$/g, "").trim();
    if (!v) continue;
    if (k === "name" && /,/.test(v)) {
      const [name, ...rest] = v.split(",");
      const type = clean(rest.join(","));
      if (type && type.length <= 60 && !/\d/.test(type)) d.settings.type = cap(type);
      v = clean(name);
    }
    d.settings[k] = v.slice(0, MAX[k]);
    return true;
  }
  return false;
}

/** "Prepayment 30% for services from $100" → prepay_percent 30, prepay_min_price 100. The sentence also stays as a rule for the AI. */
function prepayLine(line, d) {
  if (!/(prepay|pre-pay|deposit|advance payment|предоплат|аванс|депозит)/iu.test(line)) return;
  const pct = /(\d{1,3})\s*%/.exec(line);
  if (!pct || +pct[1] > 100) return;
  d.settings.prepay_percent = +pct[1];
  const from = new RegExp(`(?:from|over|above|starting at|of|от|свыше|дороже|больше)\\s*(?:${CUR_SYM})?\\s*(${NUM})`, "iu").exec(line.slice(pct.index + pct[0].length)) || new RegExp(`(?:from|over|above|от|свыше)\\s*(?:${CUR_SYM})?\\s*(${NUM})`, "iu").exec(line);
  d.settings.prepay_min_price = from ? toNumber(from[1]) : 0;
}

const SECTION = [
  ["services", /(services|service list|price ?list|prices|menu|услуги|прайс|цены|стоимость|меню|қызметтер)/u],
  ["staff", /(staff|team|employees|masters|specialists|сотрудники|мастера|команда|персонал|специалисты|қызметкерлер)/u],
  ["clients", /(clients|customers|client list|клиенты|база клиентов|покупатели)/u],
];
const KB_CATEGORY = [
  [/(rule|policy|правил|услови|ереже)/iu, "Rules"],
  [/(promo|offer|sale|discount|акци|скидк|бонус|жеңілдік)/iu, "Promotions"],
  [/(faq|question|q&a|вопрос|сұрақ)/iu, "FAQ"],
  [/(price|cost|цен|стоимост|прайс)/iu, "Prices"],
  [/(contact|контакт|байланыс)/iu, "Contacts"],
];
const TEXT_CATEGORY = [
  [/(акци|скидк|промо|бонус|подар|бесплатн|кэшбэк|promo|discount|sale|offer|% off)/iu, "Promotions"],
  [/(правил|нельзя|обязательн|опоздан|отмен|перенос|штраф|запрещ|предоплат|prepay|deposit|must|rule|policy|late|cancel)/iu, "Rules"],
  [/(₸|тенге|\bтг\b|цен|стоит|прайс|price|\$)/iu, "Prices"],
  [/\?/, "FAQ"],
];
const categoryOf = (title, content) => KB_CATEGORY.find(([re]) => re.test(title))?.[1] ?? TEXT_CATEGORY.find(([re]) => re.test(content))?.[1] ?? "General";

function serviceLine(line, category, d, source) {
  if (RULE_WORDS.test(line)) return false;
  const price = parsePrice(line, true);
  if (!price) return false;
  let rest = line
    .replace(price.text, " ")
    .replace(new RegExp(`${CUR_SYM}|${word(CUR_WORDS)}`, "giu"), " ")
    .replace(new RegExp(word("от|from|starting at|starts at|цена|price|стоимость|cost"), "giu"), " ");
  const durText = new RegExp(`(\\d+(?:[.,]\\d+)?\\s*${unit(HOUR_UNIT)}\\.?(?:\\s*\\d+\\s*${unit(MIN_UNIT)}\\.?)?|\\d+\\s*${unit(MIN_UNIT)}\\.?|полтора часа|полчаса|half an hour)`, "iu").exec(rest);
  if (durText) rest = rest.replace(durText[0], " ");
  const name = strip(rest.replace(/\.{2,}|…/g, " ").replace(/\s[-–\u2014|:=]\s|,\s|\s\/\s/g, " , ").split(" , ").map(strip).filter(Boolean).join(", "));
  if (!/\p{L}{2}/u.test(name) || name.length > 50 || name.split(" ").length > 8) return false;
  pushService(d, { name, category, price: price.value, duration: durText ? parseDuration(durText[0]) : null, source });
  if (price.note) d.services.at(-1).notes.push(price.note);
  return true;
}

const NAME = /^([\p{Lu}][\p{L}'’.-]*(?:\s+[\p{Lu}][\p{L}'’.-]*){0,3})(?=\s*(?:[,;:|(\u2014–-]|$))/u;

function staffLine(line, inSection, d, source) {
  const hours = parseHours(line, true);
  if (!hours && !inSection) return false;
  const m = NAME.exec(line);
  if (!m || parseDays(m[1]) || /^(opening|open|hours|часы|график|режим|we|our|наш|мы)$/iu.test(m[1].split(" ")[0])) return false;
  const rest = line.slice(m[0].length);
  const days = parseDays(rest, true);
  if (!inSection && !days) return false;
  const svc = /(?:services?|услуги|делает|does)\s*[:\u2014–-]\s*(.+)$/iu.exec(rest);
  const role = (svc ? rest.slice(0, svc.index) : rest)
    .split(/[,;|()]/)
    .map(strip)
    .find((s) => s && /\p{L}{3}/u.test(s) && !parseDays(s, true) && !parseHours(s) && !/\d/.test(s));
  pushStaff(d, { full_name: m[1], specialization: role || "", days: days?.days, work_start: hours?.start, work_end: hours?.end, phrases: svc ? splitList(svc[1]) : [], notes: days?.note ? [days.note] : [], source });
  return true;
}

function clientLine(line, inSection, d, source) {
  const p = findPhone(line);
  if (!p || /(phone|tel|телефон|тел\.|звоните|whatsapp|call|номер)/iu.test(line)) return false;
  const parts = (line.slice(0, p.index) + " | " + line.slice(p.index + p.text.length)).split(/\s*[|,;\u2014–]\s*|\s-\s/).map(strip).filter(Boolean);
  const [name, ...notes] = parts;
  if (!name || /\d/.test(name) || name.split(" ").length > 4 || (!inSection && notes.length)) return false;
  pushClient(d, { display_name: name, phone: p.text, notes: notes.join("; "), source });
  return true;
}

/** Free text: settings, price-list lines, staff lines, client lines; the rest becomes knowledge entries by section and paragraph. */
export function analyzeText(text, source, d) {
  let section = null; // { title, kind }
  let entry = null; // knowledge entry being written
  const flush = () => {
    if (entry && entry.lines.length) {
      const content = entry.lines.join("\n").slice(0, 60000);
      const title = entry.title || cut(content.split(/\s+/).slice(0, 7).join(" ").replace(/[,.:;!?]+$/, ""), 120);
      d.knowledge.push({ title: cut(title, 120), category: categoryOf(entry.title || "", content), content, source });
    }
    entry = null;
  };
  const add = (line, standalone) => {
    if (section && section.kind === null) {
      entry ??= { title: section.title, lines: [] };
      entry.lines.push(line);
      return;
    }
    if (standalone) {
      flush();
      entry = { title: "", lines: [line] };
      return flush();
    }
    entry ??= { title: "", lines: [] };
    entry.lines.push(line);
  };
  let first = true;
  for (const raw of String(text).replace(/\r\n?/g, "\n").split("\n")) {
    const line = clean(raw);
    const title = first && line && line.length <= 40 && !/[\d.,:;!?]/.test(line) && line.split(" ").length <= 5;
    if (line) first = false;
    if (!line) {
      if (!section || section.kind !== null) flush();
      continue;
    }
    const bullet = /^([-*•·–\u2014>]|\d{1,2}[.)])\s+/.test(line);
    const body = strip(line);
    const heading = (title ? line : null) || /^#{1,6}\s+(.+)$/.exec(line)?.[1] || (/^([^:：]{2,40})[:：]\s*$/.exec(line) || [])[1] || (line.length <= 40 && !/\d/.test(line) && line === line.toUpperCase() && /\p{Lu}{3}/u.test(line) ? line : null);
    if (heading && !bullet) {
      flush();
      const title = strip(heading.replace(/[*_]/g, ""));
      section = { title: /^\p{Lu}{2,4}$/u.test(title) ? title : cap(title.toLowerCase() === title || title === title.toUpperCase() ? title.toLowerCase() : title), kind: SECTION.find(([, re]) => re.test(low(title)))?.[0] ?? null };
      continue;
    }
    if (settingLine(body, d)) continue;
    prepayLine(body, d);
    const kind = section?.kind;
    if (kind !== "clients" && staffLine(body, kind === "staff", d, source)) continue;
    if (kind !== "staff" && kind !== "clients" && serviceLine(body, kind === "services" || !section ? "" : section.title, d, source)) continue;
    if (kind !== "staff" && kind !== "services" && clientLine(body, kind === "clients", d, source)) continue;
    const kv = /^([\p{L}][\p{L}\s'’&/-]{1,30})[:：]\s+(.+)$/u.exec(body);
    // "Promotion: ..." right after a bulleted "Rules:" list starts its own entry.
    if (kv && !bullet && section && section.kind === null && section.bullets) section = null;
    if (kv && (!section || section.kind !== null) && kv[1].split(/\s+/).length <= 4) {
      flush();
      d.knowledge.push({ title: cap(clean(kv[1])), category: categoryOf(kv[1], kv[2]), content: clean(line.slice(line.indexOf(kv[2].slice(0, 8)))), source });
      continue;
    }
    if (section && bullet) section.bullets = true;
    add(bullet ? line.replace(/^([-*•·–\u2014>]|\d{1,2}[.)])\s+/, "") : line, (bullet && !section) || (section && section.kind !== null));
  }
  flush();
}

/* ---------- the whole draft ---------- */

/**
 * Everything extracted from the files, as a draft for the preview. Staff
 * "services" phrases are matched to service names from this import and the
 * services the business already has.
 */
export function analyze(ex, existingServiceNames = []) {
  const d = emptyDraft();
  for (const t of ex.tables || []) analyzeTable(t, d);
  for (const t of ex.texts || []) analyzeText(t.text, t.name, d);
  d.notes.push(...(ex.notes || []));
  return finish(d, existingServiceNames);
}

/** Adds Claude's reading of PDF files, photos and text to a draft. */
export function addAiDraft(d, ai, source = "Claude") {
  for (const [k, v] of Object.entries(ai.settings || {})) {
    if (!v || !(k in MAX || k.startsWith("prepay"))) continue;
    if (k.startsWith("prepay")) {
      const n = toNumber(String(v).replace(/[^\d.,]/g, ""));
      if (n >= 0 && !(k === "prepay_percent" && n > 100)) d.settings[k] = n;
    } else d.settings[k] = clean(v).slice(0, MAX[k]);
  }
  for (const s of ai.services || []) pushService(d, { name: s.name, category: s.category, price: s.price > 0 ? s.price : "", duration: s.duration_min > 0 ? s.duration_min : null, source });
  for (const m of ai.staff || [])
    pushStaff(d, { full_name: m.full_name, specialization: m.specialization, days: (m.days || []).filter((x) => x >= 0 && x <= 6), work_start: parseTime(m.work_start) || undefined, work_end: parseTime(m.work_end) || undefined, phrases: m.services || [], source });
  for (const c of ai.clients || []) pushClient(d, { display_name: c.display_name, phone: c.phone, notes: c.notes, source });
  for (const k of ai.knowledge || []) if (clean(k.title) && clean(k.content)) d.knowledge.push({ title: cut(k.title, 120), category: cut(k.category || "General", 40), content: String(k.content).slice(0, 60000), source });
  return d;
}

export function finish(d, existingServiceNames = []) {
  const names = [...new Set([...d.services.map((s) => s.name), ...existingServiceNames])];
  for (const m of d.staff) {
    const found = new Set(m.services);
    for (const p of m.phrases) {
      const hit = matchServices(p, names);
      if (hit.length) hit.forEach((x) => found.add(x));
      else if (!m.notes.includes(`no service matches “${p}”`)) m.notes.push(`no service matches “${p}”`);
    }
    m.services = [...found];
  }
  // A price list can say who does each service: link them from that side too.
  for (const s of d.services)
    for (const who of s.staff || []) {
      const m = d.staff.find((x) => low(x.full_name) === low(who) || low(x.full_name).split(" ")[0] === low(who));
      if (m && !m.services.includes(s.name)) m.services.push(s.name);
      else if (!m) {
        pushStaff(d, { full_name: who, source: s.source });
        const added = d.staff.at(-1);
        if (added && low(added.full_name) === low(who)) added.services = [s.name];
      }
    }
  const seen = new Set();
  d.clients = d.clients.filter((c) => {
    const k = c.phone ? c.phone.replace(/\D/g, "").slice(-10) : low(c.display_name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return d;
}

/** The body for POST /api/import from the rows the owner left ticked. */
export function toPayload(d, pick, linkAll) {
  const on = (sec, i) => !pick || pick[sec]?.has(i);
  const services = d.services.filter((s, i) => !s.problem && on("services", i));
  const allNames = [...new Set([...services.map((s) => s.name), ...(linkAll?.existing || [])])];
  return {
    settings: Object.fromEntries(Object.entries(d.settings).filter(([k]) => on("settings", k))),
    services: services.map(({ name, category, duration_min, price, code }) => ({ name, category, duration_min, price_kzt: price, ...(code ? { code } : {}) })),
    staff: d.staff
      .filter((m, i) => !m.problem && on("staff", i))
      .map((m) => ({
        full_name: m.full_name,
        specialization: m.specialization,
        ...(m.work_start ? { work_start: m.work_start, work_end: m.work_end } : {}),
        ...(m.days ? { days: m.days } : {}),
        services: m.services.length || !linkAll ? m.services : allNames,
      })),
    clients: d.clients.filter((c, i) => on("clients", i)).map(({ display_name, phone, notes }) => ({ display_name, ...(phone ? { phone } : {}), ...(notes ? { notes } : {}) })),
    knowledge: d.knowledge.filter((k, i) => on("knowledge", i)).map(({ title, category, content }) => ({ title, category, content })),
  };
}
