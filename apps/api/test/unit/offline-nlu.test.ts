import { describe, expect, it } from "vitest";
import {
  asksAddress, asksHours, asksPrice, detectLang, isComplaint, isGreeting, matchService, ordinal,
  parseDay, parseName, parsePhone, parseTime, saysYes, wantsCancel,
} from "../../src/ai/offline-nlu.js";
import type { Service } from "../../src/domain/types.js";

const S = (id: string, name: string): Service => ({ id, name, category: "", duration_min: 60, price_kzt: 1000, is_active: true });
const services = [
  S("HC-01", "Женская стрижка"), S("HC-02", "Мужская стрижка"), S("CO-03", "Окрашивание волос"),
  S("MN-02", "Маникюр с гель-лаком"), S("PD-04", "Педикюр"), S("BR-05", "Коррекция и тонирование бровей"), S("ST-06", "Вечерняя укладка"),
];
const thursday = new Date(2026, 9, 29, 15, 0);

describe("language and intent", () => {
  it.each([
    ["здравствуйте", "ru"], ["Сәлем", "ru"], ["hello there", "en"],
  ])("detectLang(%s) = %s", (t, lang) => expect(detectLang(t)).toBe(lang));

  it("recognises greetings, prices, address, hours and cancel requests", () => {
    expect(isGreeting("Добрый вечер!")).toBe(true);
    expect(asksPrice("сколько стоит окрашивание?")).toBe(true);
    expect(asksAddress("где вы находитесь")).toBe(true);
    expect(asksHours("до скольки вы работаете")).toBe(true);
    expect(wantsCancel("хочу отменить запись")).toBe(true);
  });

  it("treats complaints as complaints, but not the word «сколько»", () => {
    expect(isComplaint("у меня скололся гель через день, ужас")).toBe(true);
    expect(isComplaint("сколько стоит маникюр")).toBe(false);
  });

  it("understands yes and ordinal choices", () => {
    expect(saysYes("Да, подходит")).toBe(true);
    expect(saysYes("Дана К.")).toBe(false);
    expect(ordinal("давайте второй вариант")).toBe(1);
    expect(ordinal("ничего")).toBeNull();
  });
});

describe("matchService", () => {
  it.each([
    ["хочу покраситься", "CO-03"],
    ["можно на маникюр завтра?", "MN-02"],
    ["подстричь мужа", "HC-02"],
    ["на брови после работы", "BR-05"],
    ["нужна укладка на свадьбу", "ST-06"],
    ["педикюр", "PD-04"],
    ["how much is a manicure", "MN-02"],
  ])("%s -> %s", (text, code) => expect(matchService(text, services)?.id).toBe(code));

  const barbershop = [
    S("HC-01", "Мужская стрижка"), S("HC-02", "Стрижка машинкой"), S("KD-03", "Детская стрижка"), S("BD-04", "Оформление бороды"),
    S("CB-05", "Стрижка и борода"), S("SH-06", "Королевское бритьё"), S("VP-07", "VIP-ритуал"), S("CM-08", "Камуфляж седины"),
  ];
  it.each([
    ["хочу подстричься", "HC-01"],
    ["под машинку можно?", "HC-02"],
    ["сына подстричь, ему 7", "KD-03"],
    ["бороду оформить", "BD-04"],
    ["стрижка и борода вместе", "CB-05"],
    ["хочу побриться опасной бритвой", "SH-06"],
    ["вип комплекс сколько", "VP-07"],
    ["закрасить седину", "CM-08"],
    ["how much is a beard trim", "BD-04"],
  ])("barbershop: %s -> %s", (text, code) => expect(matchService(text, barbershop)?.id).toBe(code));

  it("ignores hidden services and unrelated text", () => {
    expect(matchService("массаж спины", services)).toBeNull();
    expect(matchService("педикюр", services.map((s) => ({ ...s, is_active: s.id !== "PD-04" })))).toBeNull();
  });
});

describe("parseDay", () => {
  it.each([
    ["сегодня", "2026-10-29"], ["завтра", "2026-10-30"], ["послезавтра", "2026-10-31"],
    ["в пятницу", "2026-10-30"], ["на понедельник", "2026-11-02"], ["tomorrow please", "2026-10-30"],
  ])("%s -> %s", (t, d) => expect(parseDay(t, thursday)).toBe(d));
  it("returns null when no day is mentioned", () => expect(parseDay("сколько стоит", thursday)).toBeNull());
});

describe("parseTime", () => {
  it("reads exact times and hour words", () => {
    expect(parseTime("в 14:30")).toEqual({ exact: "14:30" });
    expect(parseTime("давайте в 3")).toEqual({ exact: "15:00" });
    expect(parseTime("к 11 часам")).toEqual({ exact: "11:00" });
  });
  it("reads time windows", () => {
    expect(parseTime("после 6")).toEqual({ from: 18 * 60 });
    expect(parseTime("после работы")).toEqual({ from: 17 * 60 });
    expect(parseTime("утром")).toEqual({ to: 12 * 60 });
    expect(parseTime("после обеда")).toEqual({ from: 13 * 60, to: 17 * 60 });
  });
  it("does not take a date for a time", () => expect(parseTime("на 30 октября")).toBeNull());
});

describe("contacts", () => {
  it("finds phone numbers in several formats", () => {
    expect(parsePhone("мой номер +7 701 234 56 78")).toBe("+7 701 234 56 78");
    expect(parsePhone("87012345678")).toBe("87012345678");
    expect(parsePhone("без номера")).toBeNull();
  });
  it("finds names", () => {
    expect(parseName("меня зовут алия", false)).toBe("Алия");
    expect(parseName("My name is Dana", false)).toBe("Dana");
    expect(parseName("Гульнара Ахметова", true)).toBe("Гульнара Ахметова");
    expect(parseName("Гульнара", false)).toBeNull();
    expect(parseName("да", true)).toBeNull();
  });
});
