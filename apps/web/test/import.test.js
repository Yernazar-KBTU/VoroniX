// Import: files and pasted text in, a draft of CRM rows out. Runs in Node with
// the same Web APIs the browser has (TextDecoder, DecompressionStream, Blob).
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { analyze, findPhone, matchServices, parseDays, parseDuration, parseHours, parsePrice, parseTime, toPayload } from "../src/import/analyze.js";
import { decodeText, extractFile, extractPasted, parseDelimited, sniffDelimiter } from "../src/import/extract.js";

/** A minimal zip archive (deflate), enough for the .xlsx and .docx readers. */
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text), comp = deflateRawSync(data), nm = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nm.length, 26);
    parts.push(local, nm, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nm.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nm);
    offset += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
const file = (name, bytes) => ({ name, type: "", size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) });

const SAMPLE = `Business: Glow Beauty Studio, beauty salon.
Address: 245 Park Avenue, New York, NY 10167.
Opening hours: Mon-Sat 10:00-20:00, Sun closed.
Phone: +1 212 555 0148.
Slogan: Beauty that fits your schedule.

Services:
- Women's haircut, 60 min, $65
- Men's haircut, 45 min, $40
- Hair coloring, 120 min, $140
- Manicure, 45 min, $35
- Gel manicure, 60 min, $50
- Pedicure, 60 min, $55
- Brow shaping, 30 min, $25

Rules:
- Prepayment 30% for services from $100.
- Late more than 15 minutes: the visit is moved.
- Cancel at least 24 hours before the visit.
Promotion: 15% off manicure on weekdays before 13:00 until the end of November.

| Сотрудник | Должность | Дни | Часы | Услуги |
|---|---|---|---|---|
| Emma Clark | Senior stylist | Mon-Fri | 10:00-18:00 | стрижки, окрашивание |
| Lucas Reed | Barber | Tue-Sat | 12:00-20:00 | мужская стрижка |
| Mia Torres | Nail artist | Mon, Wed, Fri, Sat | 10:00-19:00 | маникюр, педикюр |
| Sofia Kim | Brow and nail master | Thu-Sat | 11:00-20:00 | брови, маникюр |`;

describe("values in cells and lines", () => {
  it("reads prices in many notations", () => {
    expect(parsePrice("5 000 ₸")?.value).toBe(5000);
    expect(parsePrice("$1,500")?.value).toBe(1500);
    expect(parsePrice("45.00")?.value).toBe(45);
    expect(parsePrice("от 4000 тг")?.value).toBe(4000);
    expect(parsePrice("5000-7000")).toMatchObject({ value: 5000, note: expect.stringContaining("range") });
    expect(parsePrice("60 min, $65", true)?.value).toBe(65);
    expect(parsePrice("Стрижка ........ 5000", true)?.value).toBe(5000);
    expect(parsePrice("Open since 2015", true)).toBeNull();
    expect(parsePrice("15% off", true)).toBeNull();
  });

  it("reads durations", () => {
    expect(parseDuration("60 min")).toBe(60);
    expect(parseDuration("1 ч 30 мин")).toBe(90);
    expect(parseDuration("1.5 h")).toBe(90);
    expect(parseDuration("1h30")).toBe(90);
    expect(parseDuration("полтора часа")).toBe(90);
    expect(parseDuration("45", true)).toBe(45);
    expect(parseDuration("2", true)).toBe(120);
    expect(parseDuration("1:15", true)).toBe(75);
    expect(parseDuration("45")).toBeNull();
  });

  it("reads working hours and times", () => {
    expect(parseHours("10:00-19:00")).toEqual({ start: "10:00", end: "19:00" });
    expect(parseHours("10-19")).toEqual({ start: "10:00", end: "19:00" });
    expect(parseHours("9am - 6pm")).toEqual({ start: "09:00", end: "18:00" });
    expect(parseHours("с 10 до 7")).toEqual({ start: "10:00", end: "19:00" });
    expect(parseHours("2026-11-03", true)).toBeNull();
    expect(parseTime("0.75")).toBe("18:00");
    expect(parseTime("9:30 pm")).toBe("21:30");
  });

  it("reads working days in English, Russian and Kazakh", () => {
    expect(parseDays("Mon-Fri")?.days).toEqual([1, 2, 3, 4, 5]);
    expect(parseDays("пн, ср, пт")?.days).toEqual([1, 3, 5]);
    expect(parseDays("Tue to Sat")?.days).toEqual([2, 3, 4, 5, 6]);
    expect(parseDays("Сб-Пн")?.days).toEqual([0, 1, 6]);
    expect(parseDays("ежедневно")?.days).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(parseDays("every day except Monday")?.days).toEqual([0, 2, 3, 4, 5, 6]);
    expect(parseDays("Mon-Sat 10:00-20:00, Sun closed")?.days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseDays("дүйсенбі, жұма")?.days).toEqual([1, 5]);
    expect(parseDays("сотрудник")).toBeNull();
  });

  it("finds phone numbers but not times or prices", () => {
    expect(findPhone("Алия +7 777 111 22 33")?.text).toBe("+7 777 111 22 33");
    expect(findPhone("10:00-19:00")).toBeNull();
    expect(findPhone("5 000 000 ₸")).toBeNull();
  });

  it("matches staff services by meaning across languages", () => {
    const names = ["Women's haircut", "Men's haircut", "Hair coloring", "Manicure", "Gel manicure", "Brow shaping"];
    expect(matchServices("мужская стрижка", names)).toEqual(["Men's haircut"]);
    expect(matchServices("стрижки", names)).toEqual(["Women's haircut", "Men's haircut"]);
    expect(matchServices("маникюр", names)).toEqual(["Manicure", "Gel manicure"]);
    expect(matchServices("все", names)).toEqual(names);
    expect(matchServices("massage", names)).toEqual([]);
  });
});

describe("reading files", () => {
  it("splits pasted text into prose and a Markdown table", () => {
    const ex = extractPasted(SAMPLE);
    expect(ex.texts).toHaveLength(1);
    expect(ex.tables).toHaveLength(1);
    expect(ex.tables[0].rows[0]).toEqual(["Сотрудник", "Должность", "Дни", "Часы", "Услуги"]);
    expect(ex.tables[0].rows).toHaveLength(5);
  });

  it("reads rows copied from Excel or Google Sheets (tab-separated)", () => {
    const ex = extractPasted("Name\tPrice\nHaircut\t40\nBeard\t15");
    expect(ex.tables[0].rows).toEqual([["Name", "Price"], ["Haircut", "40"], ["Beard", "15"]]);
  });

  it("parses CSV with quotes and finds the delimiter", () => {
    expect(parseDelimited('a,"b, c",d\n1,"say ""hi""",3', ",")).toEqual([["a", "b, c", "d"], ["1", 'say "hi"', "3"]]);
    expect(sniffDelimiter("Имя;Телефон\nАлия;+7 777 111 22 33")).toBe(";");
  });

  it("decodes UTF-8, UTF-16 and Windows-1251 text", () => {
    expect(decodeText(new TextEncoder().encode("﻿Привет"))).toBe("Привет");
    expect(decodeText(Uint8Array.from([0xff, 0xfe, 0x1f, 0x04, 0x40, 0x04]))).toBe("Пр");
    expect(decodeText(Uint8Array.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]))).toBe("Привет");
  });

  it("reads every visible sheet of an Excel file, with shared strings and time cells", async () => {
    const xlsx = zip({
      "xl/workbook.xml": '<workbook><sheets><sheet name="Staff" sheetId="1" r:id="rId1"/><sheet name="Old" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
      "xl/sharedStrings.xml": "<sst><si><t>Name</t></si><si><t>Start</t></si><si><t>End</t></si><si><r><t>Aida </t></r><r><t>Sultan</t></r></si></sst>",
      "xl/styles.xml": '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="h:mm"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>',
      "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" s="1"><v>0.416666666666667</v></c><c r="C2" s="1"><v>0.791666666666667</v></c></row></sheetData></worksheet>',
      "xl/worksheets/sheet2.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>hidden</t></is></c></row></sheetData></worksheet>',
    });
    const ex = await extractFile(file("team.xlsx", xlsx));
    expect(ex.tables).toEqual([{ name: "team.xlsx · Staff", rows: [["Name", "Start", "End"], ["Aida Sultan", "10:00", "19:00"]] }]);
  });

  it("reads Word paragraphs and tables in order", async () => {
    const p = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
    const cell = (t) => `<w:tc>${p(t)}</w:tc>`;
    const docx = zip({
      "word/document.xml": `<w:document><w:body>${p("Адрес: Алматы, Абая 10")}<w:tbl><w:tr>${cell("Мастер")}${cell("График")}</w:tr><w:tr>${cell("Ербол")}${cell("Пн-Пт 10:00-19:00")}</w:tr></w:tbl>${p("Парковка бесплатная &amp; рядом")}</w:body></w:document>`,
    });
    const ex = await extractFile(file("info.docx", docx));
    expect(ex.texts[0].text).toBe("Адрес: Алматы, Абая 10\nПарковка бесплатная & рядом");
    expect(ex.tables[0].rows).toEqual([["Мастер", "График"], ["Ербол", "Пн-Пт 10:00-19:00"]]);
  });

  it("turns JSON lists into tables", async () => {
    const json = new TextEncoder().encode(JSON.stringify({ city: "Bangkok", services: [{ name: "Thai massage", minutes: 60, price: 900 }] }));
    const ex = await extractFile(file("data.json", json));
    expect(ex.tables[0]).toEqual({ name: "data.json · services", rows: [["name", "minutes", "price"], ["Thai massage", "60", "900"]] });
    expect(ex.texts[0].text).toBe("city: Bangkok");
  });

  it("asks for a newer format instead of reading old binary files", async () => {
    const ex = await extractFile(file("prices.xls", Buffer.from([0xd0, 0xcf, 0x11, 0xe0])));
    expect(ex.notes[0]).toContain("save as .xlsx");
  });
});

describe("recognising CRM data", () => {
  it("reads a business description, a price list, rules and a staff table in one paste", () => {
    const d = analyze(extractPasted(SAMPLE));
    expect(d.settings).toEqual({
      name: "Glow Beauty Studio",
      type: "Beauty salon",
      address: "245 Park Avenue, New York, NY 10167",
      hours: "Mon-Sat 10:00-20:00, Sun closed",
      phone: "+1 212 555 0148",
      catchphrase: "Beauty that fits your schedule",
      prepay_percent: 30,
      prepay_min_price: 100,
    });
    expect(d.services.map((s) => [s.name, s.duration_min, s.price])).toEqual([
      ["Women's haircut", 60, 65],
      ["Men's haircut", 45, 40],
      ["Hair coloring", 120, 140],
      ["Manicure", 45, 35],
      ["Gel manicure", 60, 50],
      ["Pedicure", 60, 55],
      ["Brow shaping", 30, 25],
    ]);
    expect(d.staff.map((m) => [m.full_name, m.specialization, m.days, m.work_start, m.work_end, m.services])).toEqual([
      ["Emma Clark", "Senior stylist", [1, 2, 3, 4, 5], "10:00", "18:00", ["Women's haircut", "Men's haircut", "Hair coloring"]],
      ["Lucas Reed", "Barber", [2, 3, 4, 5, 6], "12:00", "20:00", ["Men's haircut"]],
      ["Mia Torres", "Nail artist", [1, 3, 5, 6], "10:00", "19:00", ["Manicure", "Gel manicure", "Pedicure"]],
      ["Sofia Kim", "Brow and nail master", [4, 5, 6], "11:00", "20:00", ["Brow shaping", "Manicure", "Gel manicure"]],
    ]);
    expect(d.knowledge.map((k) => [k.title, k.category])).toEqual([
      ["Rules", "Rules"],
      ["Promotion", "Promotions"],
    ]);
    expect(d.knowledge[0].content).toContain("Cancel at least 24 hours before the visit.");
  });

  it("reads a Russian price list with sections, dots and dashes", () => {
    const d = analyze(extractPasted("УСЛУГИ\nСтрижка мужская ........ 5 000 ₸\nСтрижка + борода \u2014 7500 тг, 1 ч 15 мин\nДетская стрижка - от 4000 тг"));
    expect(d.services.map((s) => [s.name, s.duration_min, s.price, s.notes])).toEqual([
      ["Стрижка мужская", 60, 5000, ["no duration, set to 60 min"]],
      ["Стрижка + борода", 75, 7500, []],
      ["Детская стрижка", 60, 4000, ["no duration, set to 60 min"]],
    ]);
  });

  it("reads a schedule with one column per weekday", () => {
    const d = analyze(extractPasted("Мастер\tПн\tВт\tСр\tЧт\tПт\tСб\tВс\nАсель\t10-19\t10-19\tвыходной\t10-19\t10-19\t11-17\t-"));
    expect(d.staff[0]).toMatchObject({ full_name: "Асель", days: [1, 2, 4, 5, 6], work_start: "10:00", work_end: "19:00" });
  });

  it("reads client lists, puts extra columns into notes and drops duplicate phones", () => {
    const d = analyze(extractPasted("Имя\tТелефон\tEmail\nАружан\t8 701 123 45 67\ta@x.kz\nТимур\t+7 (707) 555-12-34\t\nАружан К.\t87011234567\t"));
    expect(d.clients.map((c) => [c.display_name, c.phone, c.notes])).toEqual([
      ["Аружан", "8 701 123 45 67", "Email: a@x.kz"],
      ["Тимур", "+7 (707) 555-12-34", ""],
    ]);
  });

  it("guesses the columns of a table without a header row", () => {
    const d = analyze(extractPasted("Haircut\t45\t$40\nBeard trim\t20 min\t$15\nHot towel shave\t30\t25"));
    expect(d.services.map((s) => [s.name, s.duration_min, s.price])).toEqual([
      ["Haircut", 45, 40],
      ["Beard trim", 20, 15],
      ["Hot towel shave", 30, 25],
    ]);
  });

  it("flags rows that cannot be saved and leaves them out of the payload", () => {
    const d = analyze(extractPasted("Service\tPrice\tDuration\nHaircut\t40\t45\nConsultation\tfree\t15"));
    expect(d.services[1]).toMatchObject({ name: "Consultation", problem: "no price" });
    const body = toPayload(d);
    expect(body.services).toEqual([{ name: "Haircut", category: "", duration_min: 45, price_kzt: 40 }]);
  });

  it("builds the import body from the ticked rows, linking staff without services to all of them", () => {
    const d = analyze(extractPasted("Name\tDays\tHours\nNok\tdaily\t10am-8pm\n\nName\tPrice\tMinutes\nThai massage\t900\t60"));
    const pick = { settings: new Set(), services: new Set([0]), staff: new Set([0]), clients: new Set(), knowledge: new Set() };
    expect(toPayload(d, pick, { existing: ["Foot massage"] })).toEqual({
      settings: {},
      services: [{ name: "Thai massage", category: "", duration_min: 60, price_kzt: 900 }],
      staff: [{ full_name: "Nok", specialization: "", work_start: "10:00", work_end: "20:00", days: [0, 1, 2, 3, 4, 5, 6], services: ["Thai massage", "Foot massage"] }],
      clients: [],
      knowledge: [],
    });
  });
});
