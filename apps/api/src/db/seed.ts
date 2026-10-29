import path from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { addDays, dt, pad, toMin, ymd } from "../lib/time.js";
import { migrate } from "./migrate.js";
import { pool, tx } from "./pool.js";

/**
 * Demo salon "Lumière Beauty Studio": 7 services, 4 masters, 30 clients,
 * about 300 visits from 45 days ago to 10 days ahead, payments, 4 chats and a
 * knowledge base. Data is generated relative to `today` with a fixed random
 * seed, so every run gives the same picture.
 */
export async function seedDemo(db: pg.Pool = pool, today = new Date()): Promise<Record<string, number>> {
  const day0 = new Date(today);
  day0.setHours(0, 0, 0, 0);
  let r = 7;
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;

  const services: [string, string, number, number, string][] = [
    ["HC-01", "Женская стрижка", 60, 8000, "Hair"],
    ["HC-02", "Мужская стрижка", 45, 5000, "Hair"],
    ["CO-03", "Окрашивание волос", 150, 25000, "Hair"],
    ["MN-02", "Маникюр с гель-лаком", 90, 10000, "Nails"],
    ["PD-04", "Педикюр", 90, 12000, "Nails"],
    ["BR-05", "Коррекция и тонирование бровей", 30, 4000, "Brows"],
    ["ST-06", "Вечерняя укладка", 60, 9000, "Hair"],
  ];
  const duration = Object.fromEntries(services.map((s) => [s[0], s[2]]));
  const price = Object.fromEntries(services.map((s) => [s[0], s[3]]));
  const masters: [string, string, string, string, string, number[]][] = [
    ["MS-01", "Айгерим С.", "Стилист-парикмахер", "09:00", "20:00", [1, 2, 3, 4, 5, 6]],
    ["MS-02", "Дана К.", "Мастер маникюра", "10:00", "20:00", [1, 2, 3, 4, 5, 6]],
    ["MS-03", "Тимур Б.", "Барбер", "09:00", "19:00", [2, 3, 4, 5, 6]],
    ["MS-04", "Мадина А.", "Бровист, стилист", "10:00", "19:00", [1, 2, 3, 4, 5]],
  ];
  const links: [string, string, string][] = [
    ["MS-01", "HC-01", "Senior"], ["MS-01", "CO-03", "Senior"], ["MS-01", "ST-06", "Senior"],
    ["MS-02", "MN-02", "Senior"], ["MS-02", "PD-04", "Senior"],
    ["MS-03", "HC-02", "Senior"], ["MS-03", "HC-01", "Junior"],
    ["MS-04", "BR-05", "Senior"], ["MS-04", "ST-06", "Junior"],
  ];
  const names = ["Алия К.", "Бекзат Т.", "Сауле М.", "Асель Н.", "Динара Ж.", "Ерлан С.", "Камила Б.", "Мадина О.", "Нурлан А.", "Аружан Т.", "Гульнара Е.", "Зарина У.", "Даулет К.", "Тогжан Р.", "Айнур С.", "Меруерт Д.", "Ерлан Б.", "Акмарал И.", "Сабина Л.", "Раушан П.", "Айдана Ф.", "Тимур Ж.", "Лаура В.", "Асем Г.", "Бота М.", "Жанна Ю.", "Инкар Т.", "Диас Р.", "Карина С.", "Малика Н."];
  const MSG = ["WhatsApp", "Telegram", "Instagram"] as const;

  const clients = names.map((n, i) => ({
    id: `CL-${pad4(i + 1)}`,
    name: n,
    phone: i % 5 === 3 ? null : `+7 70${i % 9} 000 ${String(1000 + i * 37).slice(-4)}`,
    created: dt(addDays(day0, -60 + i)),
    notes: i === 2 ? "Предпочитает Айгерим. Чувствительная кожа головы." : "",
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

  // The visit from the paid demo chat: hair colouring next Friday at 14:00.
  const friday = addDays(day0, ((5 - day0.getDay() + 7) % 7) || 7);
  reserve(friday, "MS-01", 14 * 60, 150);
  const aliyaVisit: Appt = { id: `AP-${++apSeq}`, client: "CL-0001", master: "MS-01", service: "CO-03", start: `${ymd(friday)} 14:00`, status: "Confirmed", source: "Telegram", created: dt(today) };
  appts.push(aliyaVisit);

  const noShowRate: Record<string, number> = { "CO-03": 0.25, "MN-02": 0.1, "HC-01": 0.05, "HC-02": 0.06, "PD-04": 0.08, "BR-05": 0.04, "ST-06": 0.1 };
  const book = (day: Date, master: string, code: string, status: string, source: string) => {
    const m = masters.find((x) => x[0] === master)!;
    if (!m[5].includes(day.getDay())) return null;
    const dur = duration[code];
    for (let k = 0; k < 8; k++) {
      const t = toMin(m[3]) + Math.floor(rnd() * ((toMin(m[4]) - dur - toMin(m[3])) / 30 + 1)) * 30;
      if (!reserve(day, master, t, dur)) continue;
      const a: Appt = {
        id: `AP-${++apSeq}`,
        client: `CL-${pad4(1 + Math.floor(rnd() * 30))}`,
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
  pay({ appt: aliyaVisit.id, amount: 7500, kind: "prepayment", method: "Kaspi QR", status: "Paid", created: dt(today), paid: dt(today) });

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

  const ago = (min: number) => new Date(today.getTime() - min * 60_000).toISOString();
  const fri = `${ymd(friday).slice(8)}.${ymd(friday).slice(5, 7)}`;
  const conversations = [
    {
      id: "CV-0001", messenger: "Telegram", ext: "te_5000", contact: "Алия К.", client: "CL-0001", appt: aliyaVisit.id, stage: "Paid", ai: true, human: false,
      msgs: [
        ["client", "Здравствуйте! хочу покраситься на этой неделе, сколько стоит?", 200],
        ["ai", "Здравствуйте, Алия! Окрашивание волос стоит 25 000 ₸, процедура длится около 2,5 часов. Для длинных волос ниже плеч доплата 5 000 ₸. На какой день вам удобно?", 199],
        ["client", "в пятницу после обеда можно?", 195],
        ["ai", `В пятницу ${fri} к мастеру Айгерим С. свободно 14:00 и 16:30. Какое время выбрать?`, 194],
        ["client", "14:00", 190],
        ["system", `AI booked Окрашивание волос with Айгерим С. on ${aliyaVisit.start} (${aliyaVisit.id}).`, 189],
        ["ai", "Записала вас на пятницу в 14:00 к Айгерим С. Для окрашивания нужна предоплата 30%: 7 500 ₸, кнопка оплаты ниже.", 189],
        ["pay", "Payment for Окрашивание волос", 189, "PM-00001"],
        ["system", "Payment received: 7 500 ₸ (Kaspi QR). Booking confirmed.", 182],
        ["ai", "Оплата получена, спасибо! Ждём вас в пятницу в 14:00. Напомним за день до визита.", 181],
      ],
    },
    {
      id: "CV-0002", messenger: "Instagram", ext: "in_8841", contact: "guest_ig_8841", client: null, appt: null, stage: "In dialog", ai: false, human: true,
      msgs: [
        ["client", "мне вчера сделали маникюр и уже скол на двух ногтях. это нормально вообще??", 60],
        ["ai", "Очень жаль, что так получилось. Я передаю ваш вопрос администратору, он свяжется с вами в течение 15 минут и предложит бесплатную коррекцию.", 59],
        ["system", "AI handed the chat to a human: complaint about quality.", 59],
      ],
    },
    {
      id: "CV-0003", messenger: "WhatsApp", ext: "wh_5026", contact: "Сауле М.", client: "CL-0003", appt: null, stage: "In dialog", ai: true, human: false,
      msgs: [
        ["client", "добрый день, а у вас есть мужская стрижка? для мужа хочу записать на субботу", 22],
        ["ai", "Добрый день, Сауле! Да, мужская стрижка стоит 5 000 ₸ и длится 45 минут, её делает барбер Тимур Б. Подобрать время на субботу?", 21],
      ],
    },
    {
      id: "CV-0004", messenger: "Instagram", ext: "in_9120", contact: "aigul.style", client: null, appt: null, stage: "New", ai: true, human: false,
      msgs: [["client", "здравствуйте а можно к вам завтра после работы на брови? и сколько это", 3]],
    },
  ] as const;

  const kb: [string, string, string][] = [
    ["О салоне", "Общее", "Lumière Beauty Studio, пр. Абая 10, 2 этаж (демо-адрес). Вход со двора, бесплатная парковка на 6 машин. Работаем пн–сб 09:00–20:00, воскресенье выходной. Оплата: Kaspi QR, карта, наличные."],
    ["Правило предоплаты", "Правила", "Для услуг от 20 000 ₸ (окрашивание волос) нужна предоплата 30% по ссылке. Запись подтверждается после предоплаты. Правило введено после отчёта по неявкам за октябрь: у окрашивания было 25% неявок."],
    ["Отмена и опоздание", "Правила", "Отменить или перенести визит можно бесплатно за 24 часа. Предоплата возвращается, если отмена больше чем за 24 часа. Если клиент опаздывает больше чем на 15 минут, мастер может сократить услугу или перенести её."],
    ["Окрашивание по длине волос", "Цены", "Базовая цена 25 000 ₸ для волос до плеч. Волосы ниже плеч: +5 000 ₸. Очень длинные волосы (ниже пояса): +10 000 ₸, итоговую цену подтверждает мастер. Перед первым окрашиванием рекомендуем бесплатный тест на аллергию за 48 часов."],
    ["Акции", "Цены", "День рождения: скидка 10% на одну услугу в течение 7 дней от дня рождения, нужно показать удостоверение. Первый визит из Instagram: бесплатное тонирование бровей к любой стрижке. Другие скидки обещать нельзя."],
    ["Частые вопросы", "FAQ", "Детские стрижки с 5 лет, цена как у мужской стрижки. Гель-лак держится 2–3 недели; если ноготь сколется в течение 5 дней, коррекция бесплатно. Работаем на косметике Wella и Kapous. Кофе и чай бесплатно, пока вы ждёте."],
  ];

  await tx(async (c) => {
    await c.query(`TRUNCATE ai_runs, messages, conversations, payments, appointments, master_accounts, master_services, masters,
      client_channels, clients, services, knowledge_entries, business_settings RESTART IDENTITY CASCADE`);
    await c.query(
      `INSERT INTO business_settings (id, name, business_type, city, address, hours, phone, tone, languages, prepay_percent, prepay_min_price_kzt, autopilot)
       VALUES (1, 'Lumière Beauty Studio', 'Beauty salon', 'Almaty', 'пр. Абая 10, 2 этаж (демо-адрес)', 'пн–сб 09:00–20:00, воскресенье выходной',
               '+7 700 000 0000 (demo)', 'Тепло, коротко и вежливо. Обращаться на «вы». Не больше одного эмодзи.', 'Russian, Kazakh, English', 30, 20000, TRUE)`,
    );
    await insertMany(c, "services (service_code, name, duration_min, price_kzt, category)", services);
    await insertMany(c, "masters (master_id, full_name, specialization, work_start, work_end, work_days)", masters);
    await insertMany(c, "master_services (master_id, service_code, skill_level, since_date)", links.map((l) => [...l, "2025-03-01"]));
    await insertMany(c, "master_accounts (master_id, login, password_hash)", masters.map((m) => [m[0], ["aigerim", "dana", "timur", "madina"][masters.indexOf(m)], "$2b$12$demo.hash.not.a.real.password"]));
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

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate(pool, console.log)
    .then(() => seedDemo(pool))
    .then((counts) => console.log("demo data loaded:", counts))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
