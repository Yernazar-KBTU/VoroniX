import { pool } from "../db/pool.js";
import { money, prepaymentFor } from "../domain/pricing.js";
import type { Conversation, Service } from "../domain/types.js";
import { DOW, parseDate, toMin } from "../lib/time.js";
import { nextDates } from "../domain/scheduling.js";
import { loadSnapshot, type CrmSnapshot } from "./context.js";
import type { AgentContext, AgentEngine, AgentReply } from "./engine.js";
import * as nlu from "./offline-nlu.js";
import { runTool, type ToolCallLog } from "./tools.js";

/**
 * Deterministic rule-based administrator. It runs when no Claude API key is
 * configured, so the whole funnel (question -> slots -> booking -> payment)
 * works in demos, automated tests and load tests without a network call.
 * It uses the same CRM tools as the Claude agent.
 */

interface Offer {
  master_id: string;
  master: string;
  date: string;
  time: string;
}

interface DialogState {
  service?: string;
  date?: string;
  pref?: nlu.TimePref;
  offered: Offer[];
  chosen?: Offer;
  awaitingName?: boolean;
  phone?: string;
}

const durRu = (m: number) => (m < 60 ? `${m} минут` : m % 60 === 0 ? `${m / 60} ${m === 60 ? "час" : "часа"}` : `${String(m / 60).replace(".", ",")} часа`);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dot = (s: string) => (s.endsWith(".") ? s : `${s}.`);

const RU_DOW = ["воскресенье", "понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"];

/** " Красота начинается с заботы ✨" when the owner set a brand phrase. */
const sign = (snap: CrmSnapshot) => (snap.biz.catchphrase ? ` ${snap.biz.catchphrase}` : "");

const PROMO = /(акци|скидк|промо|бонус|подар|бесплатн|promo|discount|sale|offer|free|%)/i;

/**
 * A promotion from the knowledge base that names this service, so the client
 * hears about it when asking the price. Only text the owner wrote is used (BR-01).
 */
export function promoFor(service: Pick<Service, "name">, snap: Pick<CrmSnapshot, "knowledge">, before = "", after = ""): string {
  const stems = service.name.toLowerCase().match(/[\p{L}]{4,}/gu)?.map((w) => w.slice(0, 5)) ?? [];
  for (const k of snap.knowledge) {
    if (!PROMO.test(`${k.category} ${k.title}`) && !PROMO.test(k.content)) continue;
    const sentences = k.content.split(/(?<=[.!?])\s+/);
    const hit = sentences.find((s) => PROMO.test(s) && stems.some((st) => s.toLowerCase().includes(st)));
    if (hit) return `${before}${hit.trim()}${after}`;
  }
  return "";
}

export class OfflineAgent implements AgentEngine {
  readonly name = "offline-rules";
  private states = new Map<string, DialogState>();

  reset(conversationId?: string) {
    if (conversationId) this.states.delete(conversationId);
    else this.states.clear();
  }

  async reply(conv: Conversation, ctx: AgentContext): Promise<AgentReply> {
    const snap = await loadSnapshot(pool);
    const st = this.states.get(conv.id) ?? { offered: [] };
    this.states.set(conv.id, st);
    const calls: ToolCallLog[] = [];
    const call = async (name: string, input: unknown) => {
      const { result, log } = await runTool(name, input, { conversationId: conv.id, progress: ctx.progress });
      calls.push(log);
      return result as Record<string, any>;
    };

    // Client messages since the last reply from the business.
    const lastReply = conv.messages.map((m) => m.from).lastIndexOf("ai");
    const lastAdmin = conv.messages.map((m) => m.from).lastIndexOf("admin");
    const since = conv.messages.slice(Math.max(lastReply, lastAdmin) + 1);
    const text = since.filter((m) => m.from === "client").map((m) => m.text).join(" \n ");
    const all = conv.messages.filter((m) => m.from === "client").map((m) => m.text).join(" ");
    const lang = nlu.detectLang(all || "привет");
    const R = (ru: string, en: string) => (lang === "ru" ? ru : en);
    const now = new Date();

    if (!text) {
      const paid = since.some((m) => m.from === "system" && /Payment received/.test(m.text));
      if (paid) return { text: R("Оплата получена, спасибо! Запись подтверждена. Ждём вас, напомним за день до визита.", "Payment received, thank you! Your booking is confirmed. See you soon, we will remind you a day before."), toolCalls: calls };
      return { text: "", toolCalls: calls };
    }

    // 1. Complaints and anything sensitive go to a human.
    if (nlu.isComplaint(text)) {
      await call("handoff_to_human", { reason: "complaint or sensitive request" });
      return { text: R("Очень жаль, что так получилось. Я передаю ваш вопрос администратору, он свяжется с вами в ближайшее время.", "I am very sorry about this. I am passing your message to the administrator, they will contact you shortly."), toolCalls: calls };
    }

    // 2. Cancel an existing booking.
    if (nlu.wantsCancel(text) && conv.appointment_id) {
      await call("cancel_or_move_appointment", { appointment_id: conv.appointment_id, action: "cancel" });
      this.states.delete(conv.id);
      return { text: R("Запись отменила. Если захотите выбрать другое время, просто напишите.", "Your booking is cancelled. Write any time if you want another slot."), toolCalls: calls };
    }

    // 3. Update what we know from this message.
    const svc = nlu.matchService(text, snap.services);
    if (svc && svc.id !== st.service) {
      st.service = svc.id;
      st.offered = [];
      st.chosen = undefined;
    }
    const day = nlu.parseDay(text, now);
    if (day) st.date = day;
    const pref = nlu.parseTime(text);
    if (pref) st.pref = pref;
    const phone = nlu.parsePhone(text);
    if (phone) st.phone = phone;

    // 4. Waiting for the name to finish a booking.
    if (st.chosen && !conv.client_id) {
      const name = nlu.parseName(text, !!st.awaitingName);
      if (!name) {
        st.awaitingName = true;
        return { text: R("Подскажите, пожалуйста, как вас зовут? Это нужно для записи.", "May I have your name for the booking?"), toolCalls: calls };
      }
      await call("link_client", { name, ...(st.phone ? { phone: st.phone } : {}) });
      st.awaitingName = false;
      return this.book(conv.id, st, snap, call, calls, R);
    }

    // 5. Picking one of the offered times.
    if (st.offered.length) {
      // A client who answers a single offer with their name has accepted it.
      const pick = this.pickOffer(text, st, pref) ?? (st.offered.length === 1 && nlu.parseName(text, false) ? st.offered[0] : undefined);
      if (pick) {
        st.chosen = pick;
        if (!conv.client_id) {
          const name = nlu.parseName(text, false);
          if (name) {
            await call("link_client", { name, ...(st.phone ? { phone: st.phone } : {}) });
            return this.book(conv.id, st, snap, call, calls, R);
          }
          st.awaitingName = true;
          return { text: R(`Отлично, ${this.when(pick, lang)} к мастеру ${dot(pick.master)} Как вас зовут?`, `Great, ${this.when(pick, lang)} with ${dot(pick.master)} May I have your name?`), toolCalls: calls };
        }
        return this.book(conv.id, st, snap, call, calls, R);
      }
    }

    // 6. Questions the knowledge base answers.
    const info: string[] = [];
    if (nlu.asksAddress(text)) info.push(R(`Мы находимся по адресу: ${snap.biz.address}.`, `We are at ${snap.biz.address}.`));
    if (nlu.asksHours(text)) info.push(R(`Работаем: ${snap.biz.hours}.`, `Opening hours: ${snap.biz.hours}.`));

    const service = snap.services.find((s) => s.id === st.service);
    if (!service) {
      const greet = nlu.isGreeting(text) ? this.hello(conv, snap, R) : "";
      if (info.length) return { text: greet + info.join(" ") + R(" Подсказать по услугам и свободному времени?", " Can I help you with a service or a free time?"), toolCalls: calls };
      const list = snap.services.filter((s) => s.is_active).slice(0, 5).map((s) => `${s.name.toLowerCase()} (${money(s.price_kzt)})`).join(", ");
      return { text: greet + R(`Подскажите, на какую услугу хотите записаться? Например: ${list}.`, `Which service would you like? For example: ${list}.`), toolCalls: calls };
    }

    // 7. Service known, day unknown: price and duration, then ask for a day.
    if (!st.date) {
      const pp = prepaymentFor(service, snap.biz);
      const extra = pp ? R(` Для этой услуги нужна предоплата ${snap.biz.prepay_percent}%: ${money(pp)}.`, ` This service needs a ${snap.biz.prepay_percent}% prepayment: ${money(pp)}.`) : "";
      const greet = nlu.isGreeting(text) ? this.hello(conv, snap, R) : "";
      return {
        text: greet + info.join(" ") + (info.length ? " " : "") + R(`${service.name} стоит ${money(service.price_kzt)}, длится ${durRu(service.duration_min)}.${extra}${promoFor(service, snap, " ")} На какой день вам удобно?`, `${service.name} costs ${money(service.price_kzt)} and takes about ${service.duration_min} minutes.${extra}${promoFor(service, snap, " ")} Which day suits you?`),
        toolCalls: calls,
      };
    }

    // 8. Service and day known: offer free times (and answer the price if asked).
    const offered = await this.offer(conv.id, st, service, call, calls, R, lang);
    const greet = nlu.isGreeting(text) && conv.messages.filter((m) => m.from === "ai").length === 0 ? this.hello(conv, snap, R) : "";
    let priceLine = "";
    if (nlu.asksPrice(text)) {
      const pp = prepaymentFor(service, snap.biz);
      priceLine = R(`${service.name} стоит ${money(service.price_kzt)}${pp ? `, предоплата ${money(pp)}` : ""}. `, `${service.name} costs ${money(service.price_kzt)}${pp ? `, prepayment ${money(pp)}` : ""}. `) + promoFor(service, snap, "", " ");
    }
    return { ...offered, text: greet + info.join(" ") + (info.length ? " " : "") + priceLine + offered.text };
  }

  /** Greeting; the first reply in a chat also carries the brand phrase. */
  private hello(conv: Conversation, snap: CrmSnapshot, R: (ru: string, en: string) => string): string {
    const first = !conv.messages.some((m) => m.from === "ai");
    const phrase = first && snap.biz.catchphrase ? ` ${snap.biz.catchphrase}` : "";
    return R(`Здравствуйте!${phrase} `, `Hello!${phrase} `);
  }

  private pickOffer(text: string, st: DialogState, pref: nlu.TimePref | null): Offer | undefined {
    if (pref?.exact) {
      const hit = st.offered.find((o) => o.time === pref.exact);
      if (hit) return hit;
    }
    const lower = text.toLowerCase();
    const byMaster = st.offered.find((o) => lower.includes(o.master.split(" ")[0].toLowerCase()) && (!pref?.exact || o.time === pref.exact));
    if (byMaster && (pref?.exact || nlu.saysYes(text))) return byMaster;
    const n = nlu.ordinal(text);
    if (n !== null && st.offered[n]) return st.offered[n];
    if (nlu.saysYes(text) && st.offered.length === 1) return st.offered[0];
    if (nlu.saysYes(text) && !nlu.parseDay(text, new Date())) return st.offered[0];
    return undefined;
  }

  private async offer(convId: string, st: DialogState, service: Service, call: (n: string, i: unknown) => Promise<Record<string, any>>, calls: ToolCallLog[], R: (ru: string, en: string) => string, lang: nlu.Lang): Promise<AgentReply> {
    const res = await call("find_free_slots", { service_code: service.id, date: st.date });
    if (res.error) return { text: R("Не получилось проверить расписание, уточню у администратора.", "I could not check the schedule, I will ask the administrator."), toolCalls: calls };
    const fits = (t: string) => {
      const m = toMin(t);
      if (!st.pref) return true;
      if (st.pref.exact) return Math.abs(m - toMin(st.pref.exact)) <= 90;
      return (st.pref.from === undefined || m >= st.pref.from) && (st.pref.to === undefined || m < st.pref.to);
    };
    const collect = (date: string, slots: { master_id: string; master: string; times: string[] }[], filter: boolean) => {
      const out: Offer[] = [];
      // Round-robin across masters so the client sees choice of people too.
      const lists = slots.map((s) => ({ s, times: s.times.filter((t) => !filter || fits(t)) }));
      for (let i = 0; out.length < 3 && lists.some((l) => l.times.length > i); i++)
        for (const l of lists) if (l.times[i] && out.length < 3) out.push({ master_id: l.s.master_id, master: l.s.master, date, time: l.times[i] });
      return out.sort((a, b) => a.time.localeCompare(b.time));
    };

    let offers = collect(st.date!, res.slots ?? [], true);
    let note = "";
    // The asked time of day is taken: look for the same time of day on the next days first.
    if (!offers.length && st.pref) {
      for (const d of nextDates(st.date!, 6)) {
        const next = await call("find_free_slots", { service_code: service.id, date: d });
        offers = collect(d, next.slots ?? [], true);
        if (offers.length) {
          note = R(`${cap(this.dayWord(st.date!, lang, "на"))} в это время всё занято. `, `That time is taken on ${this.dayWord(st.date!, lang)}. `);
          break;
        }
      }
    }
    if (!offers.length && res.slots?.length) {
      offers = collect(st.date!, res.slots, false);
      note = R("В это время всё занято. ", "That time is taken. ");
    }
    if (!offers.length && res.nearest_available) {
      offers = collect(res.nearest_available.date, res.nearest_available.slots, true);
      if (!offers.length) offers = collect(res.nearest_available.date, res.nearest_available.slots, false);
      note = R(`${cap(this.dayWord(st.date!, lang, "на"))} свободных окон нет. `, `There are no free times on ${this.dayWord(st.date!, lang)}. `);
    }
    if (!offers.length) return { text: R("Ближайшие две недели всё занято, передам ваш запрос администратору.", "We are fully booked for the next two weeks, I will pass your request to the administrator."), toolCalls: calls };
    st.offered = offers;
    st.chosen = undefined;
    const list = offers.map((o) => `${o.time} (${o.master})`).join(", ");
    return { text: note + R(`${cap(this.dayWord(offers[0].date, lang, "на"))} свободно: ${list}. Какое время выбрать?`, `Free on ${this.dayWord(offers[0].date, lang)}: ${list}. Which time works for you?`), toolCalls: calls };
  }

  private async book(convId: string, st: DialogState, snap: CrmSnapshot, call: (n: string, i: unknown) => Promise<Record<string, any>>, calls: ToolCallLog[], R: (ru: string, en: string) => string): Promise<AgentReply> {
    const o = st.chosen!;
    const lang: nlu.Lang = R("ru", "en") as nlu.Lang;
    const res = await call("create_appointment", { service_code: st.service, master_id: o.master_id, start_datetime: `${o.date} ${o.time}` });
    if (res.error) {
      st.chosen = undefined;
      st.date = o.date;
      const service = snap.services.find((s) => s.id === st.service)!;
      const again = await this.offer(convId, st, service, call, calls, R, lang);
      return { ...again, text: R("Это время только что заняли. ", "That time was just taken. ") + again.text };
    }
    this.states.delete(convId);
    if (res.prepayment_required_kzt > 0) {
      await call("create_payment_link", { appointment_id: res.appointment_id, kind: "prepayment" });
      return {
        text: R(
          `Записала вас ${this.when(o, lang)} к мастеру ${dot(o.master)} Для этой услуги нужна предоплата ${money(res.prepayment_required_kzt)}, кнопка оплаты ниже.${sign(snap)}`,
          `You are booked for ${this.when(o, lang)} with ${dot(o.master)} This service needs a prepayment of ${money(res.prepayment_required_kzt)}, the payment button is below.${sign(snap)}`,
        ),
        toolCalls: calls,
      };
    }
    return { text: R(`Готово! Записала вас ${this.when(o, lang)} к мастеру ${dot(o.master)} Ждём вас!${sign(snap)}`, `Done! You are booked for ${this.when(o, lang)} with ${dot(o.master)} See you!${sign(snap)}`), toolCalls: calls };
  }

  /** "пятницу 30.10", with a preposition: "в пятницу 30.10", "во вторник 03.11", "на пятницу 30.10". */
  private dayWord(date: string, lang: nlu.Lang, prep?: "в" | "на") {
    const d = parseDate(date)!;
    const dm = `${date.slice(8)}.${date.slice(5, 7)}`;
    if (lang !== "ru") return `${DOW[d.getDay()]} ${dm}`;
    const word = RU_DOW[d.getDay()];
    const p = prep === "в" && d.getDay() === 2 ? "во" : prep;
    return `${p ? p + " " : ""}${word} ${dm}`;
  }

  private when(o: Offer, lang: nlu.Lang) {
    return lang === "ru" ? `${this.dayWord(o.date, lang, "в")} в ${o.time}` : `${this.dayWord(o.date, lang)} at ${o.time}`;
  }
}
