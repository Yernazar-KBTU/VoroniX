import type { Db } from "../db/pool.js";
import type { BusinessSettings } from "../domain/types.js";

const SELECT = `SELECT name, business_type AS type, city, address, hours, phone, tone, languages,
  staff_label, service_label, prepay_percent, prepay_min_price_kzt AS prepay_min_price, autopilot
  FROM business_settings WHERE id = 1`;

const FALLBACK: BusinessSettings = {
  name: "My business",
  type: "Beauty salon",
  city: "",
  address: "",
  hours: "",
  phone: "",
  tone: "Warm, short and polite.",
  languages: "Russian, Kazakh, English",
  staff_label: "Master",
  service_label: "Service",
  prepay_percent: 30,
  prepay_min_price: 20000,
  autopilot: true,
};

export async function getSettings(db: Db): Promise<BusinessSettings> {
  const { rows } = await db.query<BusinessSettings>(SELECT);
  return rows[0] ?? FALLBACK;
}

export async function saveSettings(db: Db, s: BusinessSettings): Promise<BusinessSettings> {
  await db.query(
    `INSERT INTO business_settings (id, name, business_type, city, address, hours, phone, tone, languages,
       staff_label, service_label, prepay_percent, prepay_min_price_kzt, autopilot, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
     ON CONFLICT (id) DO UPDATE SET name = $1, business_type = $2, city = $3, address = $4, hours = $5,
       phone = $6, tone = $7, languages = $8, staff_label = $9, service_label = $10, prepay_percent = $11,
       prepay_min_price_kzt = $12, autopilot = $13, updated_at = now()`,
    [s.name, s.type, s.city, s.address, s.hours, s.phone, s.tone, s.languages, s.staff_label, s.service_label, s.prepay_percent, s.prepay_min_price, s.autopilot],
  );
  return getSettings(db);
}
