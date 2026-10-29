// Small rule-based language understanding for the offline agent.
// Pure functions, so they are covered by unit tests.

import { addDays, pad, ymd } from "../lib/time.js";
import type { Service } from "../domain/types.js";

export type Lang = "ru" | "en";

export const detectLang = (text: string): Lang => (/[а-яёәғқңөұүһі]/i.test(text) ? "ru" : "en");

const norm = (s: string) => ` ${s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}:.\/+ ]+/gu, " ").replace(/\s+/g, " ")} `;

// Word groups. A service matches a group when its English name contains the
// key; the client's text matches when it contains one of the stems.
const GROUPS: Record<string, string[]> = {
  haircut: ["стриж", "подстри", "постри", "haircut", "hair cut", "трим"],
  "men's": ["мужск", "муж ", "мужу", "мужа", "барбер", "парн", " men", " man ", "barber"],
  kids: ["детск", "ребен", "сын", "дочк", "kid", "child", "son "],
  clipper: ["машинк", "под ноль", "clipper", "buzz"],
  beard: ["бород", "усы", "beard"],
  shave: ["брить", "бритье", "побри", "shave"],
  vip: ["вип", "vip", "ритуал"],
  camouflage: ["камуфл", "седин", "grey", "gray"],
  "women's": ["женск", "women", "woman"],
  colouring: ["окраш", "покрас", "краск", "цвет", "колор", "colour", "color", "dye"],
  manicure: ["маникюр", "ногт", "ноготоч", "гель лак", "гельлак", "manicure", "nails"],
  pedicure: ["педикюр", "pedicure"],
  brow: ["бров", "brow"],
  styling: ["уклад", "причес", "вечерн", "styling", "updo"],
};

/** Best matching active service for the text, or null. */
export function matchService(text: string, services: Service[]): Service | null {
  const t = norm(text);
  let best: { s: Service; score: number } | null = null;
  for (const s of services.filter((x) => x.is_active)) {
    const name = s.name.toLowerCase();
    let score = 0;
    for (const [key, stems] of Object.entries(GROUPS)) {
      const inName = (key === "men's" ? /(^|\s)men's/.test(name) : name.includes(key)) || stems.some((st) => st.trim().length > 3 && /[а-я]/.test(st) && name.includes(st.trim()));
      if (inName && stems.some((st) => t.includes(st))) score += 1;
    }
    if (t.includes(` ${name} `)) score += 2;
    if (score > 0 && (!best || score > best.score)) best = { s, score };
  }
  return best?.s ?? null;
}

const WEEKDAYS: [RegExp, number][] = [
  [/воскресень|sunday/, 0],
  [/понедельник|monday/, 1],
  [/вторник|tuesday/, 2],
  [/сред[уаы]|wednesday/, 3],
  [/четверг|thursday/, 4],
  [/пятниц|friday/, 5],
  [/суббот|saturday/, 6],
];

/** "завтра", "в пятницу", "30.10", "today" ... -> "YYYY-MM-DD", or null. */
export function parseDay(text: string, now: Date): string | null {
  const t = norm(text);
  if (/послезавтра|day after tomorrow/.test(t)) return ymd(addDays(now, 2));
  if (/завтра|tomorrow/.test(t)) return ymd(addDays(now, 1));
  if (/сегодня|today|tonight/.test(t)) return ymd(now);
  const dm = /(?:^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s)/.exec(t);
  if (dm) {
    const d = +dm[1];
    const m = +dm[2];
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      let y = now.getFullYear();
      const candidate = new Date(y, m - 1, d);
      if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) y += 1;
      return `${y}-${pad(m)}-${pad(d)}`;
    }
  }
  if (/выходн|weekend/.test(t)) return nextWeekday(now, 6);
  for (const [re, dow] of WEEKDAYS) if (re.test(t)) return nextWeekday(now, dow);
  return null;
}

function nextWeekday(now: Date, dow: number): string {
  const diff = (dow - now.getDay() + 7) % 7;
  return ymd(addDays(now, diff));
}

export interface TimePref {
  exact?: string; // "HH:MM"
  from?: number; // minutes since midnight
  to?: number;
}

/** Time of day the client wants: exact time or a window. */
export function parseTime(text: string): TimePref | null {
  const t = norm(text);
  const exact = /(?:^|\s)(\d{1,2})[:.](\d{2})(?=\s)/.exec(t);
  if (exact && +exact[1] <= 23 && +exact[2] < 60 && !/\d[./]\d{1,2}[./]/.test(t)) return { exact: `${pad(+exact[1])}:${exact[2]}` };
  const after = /после\s+(\d{1,2})|after\s+(\d{1,2})/.exec(t);
  if (after) {
    let h = +(after[1] ?? after[2]);
    if (h < 9) h += 12;
    return { from: h * 60 };
  }
  const at = /(?:^|\s)(?:в|к|на|at)\s+(\d{1,2})(?:\s?(?:часов|часа|час|ч|pm|am)(?=\s))?(?=\s)/.exec(t);
  if (at && !/(?:^|\s)(?:в|на)\s+\d{1,2}\s+(?:числ|октяб|ноябр|декабр)/.test(t)) {
    let h = +at[1];
    if (h >= 1 && h <= 8) h += 12;
    if (h >= 9 && h <= 21) return { exact: `${pad(h)}:00` };
  }
  if (/после работы|вечер|evening|after work/.test(t)) return { from: 17 * 60 };
  if (/после обеда|днем|днём|afternoon/.test(t)) return { from: 13 * 60, to: 17 * 60 };
  if (/утр|morning/.test(t)) return { to: 12 * 60 };
  return null;
}

export function parsePhone(text: string): string | null {
  const m = /(\+?[78][\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2})/.exec(text);
  return m ? m[1] : null;
}

const NOT_NAMES = new Set(["да", "нет", "ок", "окей", "хорошо", "спасибо", "давайте", "yes", "no", "ok", "okay", "thanks", "здравствуйте", "привет", "hello", "hi"]);

/** Client's name: "меня зовут Алия", "я Алия", "my name is Aliya", or a bare name when we just asked for it. */
export function parseName(text: string, expectingName: boolean): string | null {
  const explicit = /(?:меня зовут|зовут меня|my name is|i am|i'm|это)\s+([\p{L}-]{2,20}(?:\s+[\p{L}-]{2,20})?)/iu.exec(text);
  if (explicit) return cap(explicit[1]);
  const ya = /^\s*я\s+([\p{L}-]{2,20})\s*[.!]?\s*$/iu.exec(text);
  if (ya) return cap(ya[1]);
  if (expectingName) {
    const words = text.replace(parsePhone(text) ?? "", " ").trim().replace(/[.,!]+$/g, "").split(/\s+/).filter(Boolean);
    if (words.length >= 1 && words.length <= 3 && words.every((w) => /^[\p{L}-]{2,20}$/u.test(w)) && !NOT_NAMES.has(words[0].toLowerCase())) return words.map(cap).join(" ");
  }
  return null;
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

export const isComplaint = (t: string) =>
  /(жалоб|ужас|скол(?!ьк)|сколол|отвратит|верните деньги|возврат|недовол|испортил|аллерги|ожог|refund|complain|terrible|awful)/i.test(t);
export const isGreeting = (t: string) => /(здравств|привет|добр(ый|ое|ого) (день|утро|вечер)|сәлем|салем|hello|\bhi\b|good (morning|evening|afternoon))/i.test(t);
export const asksPrice = (t: string) => /(сколько|цен|стоим|прайс|price|how much|cost)/i.test(t);
export const asksAddress = (t: string) => /(адрес|где вы|как добраться|находитесь|парков|address|where are you|location)/i.test(t);
export const asksHours = (t: string) => /(до скольки|во сколько открыва|график|часы работы|режим работы|работаете|opening hours|open until)/i.test(t);
export const wantsCancel = (t: string) => /(отмен|не смогу прийти|не приду|cancel)/i.test(t);
export const saysYes = (t: string) => /^(да|ага|давайте|подходит|хорошо|ок|окей|отлично|супер|yes|ok|okay|sure|sounds good|perfect)(?=$|[\s,.!)])/i.test(t.trim());
export const ordinal = (t: string): number | null => {
  const s = t.toLowerCase();
  if (/перв|first|1-?й/.test(s)) return 0;
  if (/втор|second|2-?й/.test(s)) return 1;
  if (/трет|third|3-?й/.test(s)) return 2;
  return null;
};
