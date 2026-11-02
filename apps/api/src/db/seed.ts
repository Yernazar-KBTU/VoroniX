import path from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { addDays, dt, pad, toMin, wallClock, ymd } from "../lib/time.js";
import { migrate } from "./migrate.js";
import { pool, tx } from "./pool.js";
import { withTenant, type Tenant } from "../tenancy/context.js";
import { openBusiness } from "../tenancy/tenants.js";

/**
 * Demo barbershop "Barberista": 8 services, 4 barbers, 30 clients,
 * about 300 visits from 45 days ago to 10 days ahead, payments, 4 chats and a
 * knowledge base. Data is generated relative to `today` with a fixed random
 * seed, so every run gives the same picture. Replaces the data of the current
 * business only.
 */
export async function seedDemo(db: pg.Pool = pool, today = wallClock()): Promise<Record<string, number>> {
  const day0 = new Date(today);
  day0.setHours(0, 0, 0, 0);
  let r = 7;
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;

  const services: [string, string, number, number, string][] = [
    ["HC-01", "Мужская стрижка", 60, 7000, "Haircut"],
    ["HC-02", "Стрижка машинкой", 30, 4000, "Haircut"],
    ["KD-03", "Детская стрижка", 45, 5000, "Haircut"],
    ["BD-04", "Оформление бороды", 45, 5000, "Beard"],
    ["CB-05", "Стрижка и борода", 90, 11000, "Combo"],
    ["SH-06", "Королевское бритьё", 45, 6000, "Shave"],
    ["VP-07", "VIP-ритуал", 150, 22000, "Combo"],
    ["CM-08", "Камуфляж седины", 30, 5000, "Colour"],
  ];
  const duration = Object.fromEntries(services.map((s) => [s[0], s[2]]));
  const price = Object.fromEntries(services.map((s) => [s[0], s[3]]));
  const masters: [string, string, string, string, string, number[]][] = [
    ["MS-01", "Тимур Б.", "Старший барбер", "10:00", "21:00", [1, 2, 3, 4, 5, 6]],
    ["MS-02", "Арман К.", "Барбер", "10:00", "21:00", [1, 2, 3, 4, 5, 6]],
    ["MS-03", "Данияр С.", "Барбер", "12:00", "21:00", [0, 2, 3, 4, 5, 6]],
    ["MS-04", "Ержан М.", "Мастер бритья", "10:00", "19:00", [1, 2, 3, 4, 5]],
  ];
  const links: [string, string, string][] = [
    ["MS-01", "HC-01", "Senior"], ["MS-01", "BD-04", "Senior"], ["MS-01", "CB-05", "Senior"], ["MS-01", "VP-07", "Senior"], ["MS-01", "CM-08", "Senior"],
    ["MS-02", "HC-01", "Senior"], ["MS-02", "HC-02", "Senior"], ["MS-02", "KD-03", "Senior"], ["MS-02", "CB-05", "Junior"],
    ["MS-03", "HC-01", "Junior"], ["MS-03", "HC-02", "Senior"], ["MS-03", "BD-04", "Senior"], ["MS-03", "KD-03", "Junior"],
    ["MS-04", "SH-06", "Senior"], ["MS-04", "BD-04", "Senior"], ["MS-04", "VP-07", "Junior"],
  ];
  const names = ["Арман Т.", "Бекзат Т.", "Сауле М.", "Аслан Н.", "Данияр Ж.", "Ерлан С.", "Камал Б.", "Марат О.", "Нурлан А.", "Азамат Т.", "Галым Е.", "Жандос У.", "Даулет К.", "Темирлан Р.", "Айнур С.", "Мирас Д.", "Ерлан Б.", "Алибек И.", "Санжар Л.", "Руслан П.", "Айдос Ф.", "Тимур Ж.", "Батыр В.", "Асет Г.", "Бауыржан М.", "Жан Ю.", "Ислам Т.", "Диас Р.", "Кайрат С.", "Мади Н."];
  const MSG = ["WhatsApp", "Telegram", "Instagram"] as const;

  const clients = names.map((n, i) => ({
    id: `CL-${pad4(i + 1)}`,
    name: n,
    phone: i % 5 === 3 ? null : `+7 70${i % 9} 000 ${String(1000 + i * 37).slice(-4)}`,
    created: dt(addDays(day0, -60 + i)),
    notes: i === 2 ? "Приводит сына Алихана (7 лет). Стричь только ножницами, машинки боится." : "",
  }));
  const channels: [string, string, string][] = [];
  clients.forEach((c, i) => {
    const m = MSG[i % 3];
    channels.push([c.id, m, `${m.slice(0, 2).toLowerCase()}_${5000 + i * 13}`]);
    if (i % 6 === 0) {
      const m2 = MSG[(i + 1) % 3];
      channels.push([c.id, m2, `${m2.slice(0, 2).toLowerCase()}_${7000 + i * 11}`]);
    }
  });

  // Visits. busy[master+date] keeps generated visits from overlapping, the
  // same rule the database enforces with its exclusion constraint.
  type Appt = { id: string; client: string; master: string; service: string; start: string; status: string; source: string; created: string };
  const appts: Appt[] = [];
  const busy: Record<string, [number, number][]> = {};
  let apSeq = 1000;
  const reserve = (day: Date, master: string, t: number, dur: number) => {
    const key = master + ymd(day);
    busy[key] ??= [];
    if (busy[key].some(([b, e]) => t < e && t + dur > b)) return false;
    busy[key].push([t, t + dur]);
    return true;
  };

  // The visit from the paid demo chat: VIP ritual next Friday at 18:00.
  const friday = addDays(day0, ((5 - day0.getDay() + 7) % 7) || 7);
  reserve(friday, "MS-01", 18 * 60, 150);
  const armanVisit: Appt = { id: `AP-${++apSeq}`, client: "CL-0001", master: "MS-01", service: "VP-07", start: `${ymd(friday)} 18:00`, status: "Confirmed", source: "Telegram", created: dt(today) };
  appts.push(armanVisit);

  const noShowRate: Record<string, number> = { "VP-07": 0.25, "CB-05": 0.1, "HC-01": 0.06, "HC-02": 0.05, "KD-03": 0.12, "BD-04": 0.05, "SH-06": 0.08, "CM-08": 0.05 };
  const book = (day: Date, master: string, code: string, status: string, source: string) => {
    const m = masters.find((x) => x[0] === master)!;
    if (!m[5].includes(day.getDay())) return null;
    const dur = duration[code];
    for (let k = 0; k < 8; k++) {
      const t = toMin(m[3]) + Math.floor(rnd() * ((toMin(m[4]) - dur - toMin(m[3])) / 30 + 1)) * 30;
      if (!reserve(day, master, t, dur)) continue;
      const a: Appt = {
        id: `AP-${++apSeq}`,
        client: `CL-${pad4(2 + Math.floor(rnd() * 29))}`, // CL-0001 only has the visit from the demo chat
        master,
        service: code,
        start: `${ymd(day)} ${pad(Math.floor(t / 60))}:${pad(t % 60)}`,
        status,
        source,
        created: dt(new Date(Math.min(addDays(day, -3).getTime() + 10 * 3600_000, today.getTime() - 3600_000))),
      };
      appts.push(a);
      return a;
    }
    return null;
  };

  type Pay = { id: string; appt: string; amount: number; kind: string; method: string; status: string; created: string; paid: string | null };
  const pays: Pay[] = [];
  let pmSeq = 0;
  const pay = (p: Omit<Pay, "id">) => pays.push({ id: `PM-${String(++pmSeq).padStart(5, "0")}`, ...p });
  pay({ appt: armanVisit.id, amount: 6600, kind: "prepayment", method: "Kaspi QR", status: "Paid", created: dt(today), paid: dt(today) });

  for (let d = -45; d <= 10; d++) {
    const day = addDays(day0, d);
    const n = d <= 0 ? 6 : 3;
    for (let j = 0; j < n; j++) {
      const [master, code] = links[Math.floor(rnd() * links.length)];
      let status: string;
      if (d < 0) {
        const x = rnd();
        status = x < noShowRate[code] ? "No-show" : x > 0.96 ? "Cancelled" : "Completed";
        if (d >= -2 && j === 0) status = "Booked"; // not closed yet: shows up in "Needs attention"
      } else status = rnd() < 0.5 ? "Confirmed" : "Booked";
      const source = ["WhatsApp", "Telegram", "Instagram", "Admin"][Math.floor(rnd() * 4)];
      const a = book(day, master, code, status, source);
      if (!a) continue;
      if (status === "Completed") {
        const method = ["Kaspi QR", "Card", "Cash"][Math.floor(rnd() * 3)];
        pay({ appt: a.id, amount: price[code], kind: "full", method, status: "Paid", created: a.start, paid: a.start });
      }
      if (d >= 0 && status === "Confirmed" && price[code] >= 20000)
        pay({ appt: a.id, amount: Math.round(price[code] * 0.3), kind: "prepayment", method: "Kaspi QR", status: "Paid", created: a.created, paid: a.created });
    }
  }

  // TIMESTAMPTZ values are real instants, not wall-clock readings.
  const realNow = Date.now();
  const ago = (min: number) => new Date(realNow - min * 60_000).toISOString();
  const fri = `${ymd(friday).slice(8)}.${ymd(friday).slice(5, 7)}`;
  const conversations = [
    {
      id: "CV-0001", messenger: "Telegram", ext: "te_5000", contact: "Арман Т.", client: "CL-0001", appt: armanVisit.id, stage: "Paid", ai: true, human: false,
      msgs: [
        ["client", "Салем! хочу на вип-комплекс в эту пятницу, сколько стоит?", 200],
        ["ai", "Здравствуйте, Арман! VIP-ритуал: стрижка, борода, королевское бритьё и уход за лицом. Стоит 22 000 ₸, длится около 2,5 часов. На какое время в пятницу удобно?", 199],
        ["client", "после 6 вечера можно?", 195],
        ["ai", `В пятницу ${fri} к Тимуру Б. свободно 18:00 и 18:30. Какое время выбрать?`, 194],
        ["client", "18:00", 190],
        ["system", `AI booked VIP-ритуал with Тимур Б. on ${armanVisit.start} (${armanVisit.id}).`, 189],
        ["ai", "Записали вас на пятницу в 18:00 к Тимуру Б. Для VIP-ритуала нужна предоплата 30%: 6 600 ₸, кнопка оплаты ниже.", 189],
        ["pay", "Payment for VIP-ритуал", 189, "PM-00001"],
        ["system", "Payment received: 6 600 ₸ (Kaspi QR). Booking confirmed.", 182],
        ["ai", "Оплата получена, спасибо! Ждём вас в пятницу в 18:00. Напомним за день до визита. Barberista — стиль без компромиссов 💈", 181],
      ],
    },
    {
      id: "CV-0002", messenger: "Instagram", ext: "in_8841", contact: "guest_ig_8841", client: null, appt: null, stage: "In dialog", ai: false, human: true,
      msgs: [
        ["client", "вчера стригся у вас, фейд с одной стороны неровный. это нормально вообще??", 60],
        ["ai", "Очень жаль, что так вышло. Передаю ваш вопрос администратору: он свяжется с вами в течение 15 минут и предложит бесплатную коррекцию.", 59],
        ["system", "AI handed the chat to a human: complaint about quality.", 59],
      ],
    },
    {
      id: "CV-0003", messenger: "WhatsApp", ext: "wh_5026", contact: "Сауле М.", client: "CL-0003", appt: null, stage: "In dialog", ai: true, human: false,
      msgs: [
        ["client", "добрый день, а детей стрижете? сыну 7 лет, хочу на субботу", 22],
        ["ai", "Добрый день, Сауле! Да, детская стрижка стоит 5 000 ₸ и длится 45 минут, детей стрижёт Арман К. Подобрать время на субботу?", 21],
      ],
    },
    {
      id: "CV-0004", messenger: "Instagram", ext: "in_9120", contact: "aidos.fit", client: null, appt: null, stage: "New", ai: true, human: false,
      msgs: [["client", "здарова, можно сегодня вечером бороду оформить? и сколько это", 3]],
    },
  ] as const;

  const kb: [string, string, string][] = [
    ["О барбершопе", "Общее", "Barberista, ул. Панфилова 98 (демо-адрес). Работаем каждый день 10:00–21:00. Парковка у входа на 4 машины. Оплата: Kaspi QR, карта, наличные. Без записи примем, если барбер свободен, но вечером лучше записаться."],
    ["Правило предоплаты", "Правила", "Для услуг от 20 000 ₸ (VIP-ритуал) нужна предоплата 30% по ссылке. Запись подтверждается после предоплаты. Правило введено после отчёта по неявкам за октябрь: у VIP-ритуала было 25% неявок."],
    ["Отмена и опоздание", "Правила", "Отменить или перенести визит можно бесплатно за 3 часа. Предоплата возвращается, если отмена больше чем за 24 часа. Если клиент опаздывает больше чем на 15 минут, барбер может сократить услугу или перенести её."],
    ["Доплаты", "Цены", "Длинные волосы (ниже ушей) к мужской стрижке: +2 000 ₸. Борода длиннее 5 см: +1 000 ₸ к оформлению бороды. Камуфляж седины можно добавить к любой стрижке за 5 000 ₸."],
    ["Акции", "Цены", "Каждая 6-я стрижка бесплатно (карта лояльности в CRM). Папа и сын: скидка 15% на детскую стрижку, если записаться вместе с мужской стрижкой. День рождения: скидка 10% на одну услугу в течение 7 дней, нужно показать удостоверение. Другие скидки обещать нельзя."],
    ["Частые вопросы", "FAQ", "Детей стрижём с 4 лет. Работаем на косметике Reuzel и Layrite, горячее полотенце к каждому бритью. Кофе, чай и PlayStation бесплатно, пока вы ждёте. Фейд лучше освежать раз в 2–3 недели."],
  ];

  await tx(async (c) => {
    await c.query(`TRUNCATE ai_runs, messages, conversations, payments, appointments, master_accounts, master_services, masters,
      client_channels, clients, services, knowledge_entries, business_settings RESTART IDENTITY CASCADE`);
    await c.query(
      `INSERT INTO business_settings (id, name, business_type, city, address, hours, phone, tone, languages, prepay_percent, prepay_min_price_kzt, autopilot, catchphrase)
       VALUES (1, 'Barberista', 'Barbershop', 'Almaty', 'ул. Панфилова 98 (демо-адрес)', 'ежедневно 10:00–21:00',
               '+7 700 000 0000 (demo)', 'Дружелюбно и по делу, как хороший барбер. Обращаться на «вы». Не больше одного эмодзи.', 'Russian, Kazakh, English', 30, 20000, TRUE, 'Barberista — стиль без компромиссов 💈')`,
    );
    await insertMany(c, "services (service_code, name, duration_min, price_kzt, category)", services);
    await insertMany(c, "masters (master_id, full_name, specialization, work_start, work_end, work_days)", masters);
    await insertMany(c, "master_services (master_id, service_code, skill_level, since_date)", links.map((l) => [...l, "2025-03-01"]));
    await insertMany(c, "master_accounts (master_id, login, password_hash)", masters.map((m) => [m[0], ["timur", "arman", "daniyar", "yerzhan"][masters.indexOf(m)], "$2b$12$demo.hash.not.a.real.password"]));
    await insertMany(c, "clients (client_id, display_name, phone, created_at, notes)", clients.map((x) => [x.id, x.name, x.phone, x.created, x.notes]));
    await insertMany(c, "client_channels (client_id, messenger, external_user_id)", channels);
    await insertMany(
      c,
      "appointments (appointment_id, client_id, master_id, service_code, start_at, end_at, status, source, created_at)",
      appts.map((a) => {
        const end = new Date(new Date(a.start.replace(" ", "T")).getTime() + duration[a.service] * 60_000);
        return [a.id, a.client, a.master, a.service, a.start, dt(end), a.status, a.source, a.created];
      }),
    );
    await insertMany(c, "payments (payment_id, appointment_id, amount_kzt, kind, method, status, created_at, paid_at)", pays.map((p) => [p.id, p.appt, p.amount, p.kind, p.method, p.status, p.created, p.paid]));
    for (const cv of conversations) {
      await c.query(
        `INSERT INTO conversations (conversation_id, messenger, external_user_id, contact_name, client_id, appointment_id, stage, ai_enabled, needs_human, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [cv.id, cv.messenger, cv.ext, cv.contact, cv.client, cv.appt, cv.stage, cv.ai, cv.human, ago(cv.msgs[0][2] as number), ago(cv.msgs[cv.msgs.length - 1][2] as number)],
      );
      await insertMany(c, "messages (conversation_id, sender, body, created_at, payment_id)", cv.msgs.map((m) => [cv.id, m[0], m[1], ago(m[2] as number), (m as readonly unknown[])[3] ?? null]));
    }
    await insertMany(c, "knowledge_entries (title, category, content, updated_at)", kb.map((k, i) => [...k, ago(60 * 24 * (6 - i))]));
    // Keep generated ids ahead of the seeded ones.
    await c.query(`SELECT setval('clients_seq', 30), setval('client_channels_seq', (SELECT COUNT(*) FROM client_channels)),
      setval('masters_seq', 4), setval('appointments_seq', $1), setval('payments_seq', $2), setval('conversations_seq', 4)`, [apSeq, pmSeq]);
  }, db);

  const counts: Record<string, number> = {};
  for (const t of ["services", "masters", "master_services", "clients", "client_channels", "appointments", "payments", "conversations", "messages", "knowledge_entries"])
    counts[t] = Number((await db.query(`SELECT COUNT(*) AS n FROM ${t}`)).rows[0].n);
  return counts;
}

const pad4 = (n: number) => String(n).padStart(4, "0");

async function insertMany(c: pg.PoolClient, target: string, rows: readonly (readonly unknown[])[]) {
  if (!rows.length) return;
  const width = rows[0].length;
  const values = rows.map((_, i) => `(${Array.from({ length: width }, (_, j) => `$${i * width + j + 1}`).join(", ")})`).join(", ");
  await c.query(`INSERT INTO ${target} VALUES ${values}`, rows.flat());
}

/** The demo business: an Almaty barbershop priced in tenge. */
export const DEMO_BUSINESS = { name: "Barberista", type: "Barbershop", country: "KZ", timezone: "Asia/Almaty", currency: "KZT", languages: "Russian, Kazakh, English" };

/** Adds the demo business with its own schema (no users) and fills it with demo data. */
export async function createDemoBusiness(db: pg.Pool = pool): Promise<{ tenant: Tenant; counts: Record<string, number> }> {
  const { tenant } = await tx((c) => openBusiness(c, DEMO_BUSINESS), db);
  const counts = await withTenant(tenant, () => seedDemo(db));
  return { tenant, counts };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  // npm run db:seed: a demo business with an owner you can sign in as.
  const email = process.env.DEMO_EMAIL ?? "demo@voronix.dev";
  const password = process.env.DEMO_PASSWORD ?? "demo-password";
  (async () => {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_RESET !== "true") throw new Error("Refusing to add demo data in production. Set ALLOW_DEMO_RESET=true if you really mean it.");
    await migrate(pool, console.log);
    const { createAccount } = await import("../auth/auth.service.js");
    const existing = await pool.query<{ business_id: string }>(`SELECT business_id FROM public.users WHERE email = $1`, [email]);
    let businessId = existing.rows[0]?.business_id;
    if (!businessId) businessId = (await createAccount({ ...DEMO_BUSINESS, business_name: DEMO_BUSINESS.name, business_type: DEMO_BUSINESS.type, full_name: "Demo Owner", email, password })).business.id;
    const { findTenant } = await import("../tenancy/tenants.js");
    const tenant = (await findTenant(businessId))!;
    const counts = await withTenant(tenant, () => seedDemo(pool));
    console.log("demo data loaded:", counts);
    console.log(`sign in as ${email} / ${password}`);
  })()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
