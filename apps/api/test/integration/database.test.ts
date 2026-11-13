// Rules the database itself enforces, whatever client writes to it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../src/db/pool.js";
import { demo, freshDb, quietWednesday } from "./helpers.js";

const code = async (sql: string, params: unknown[] = []) => {
  try {
    await pool.query(sql, params);
    return "ok";
  } catch (e) {
    return (e as { code: string; constraint?: string }).code + (((e as { constraint?: string }).constraint && ":" + (e as { constraint?: string }).constraint) || "");
  }
};

const day = quietWednesday();
const insertVisit = (master: string, service: string, start: string, status = "Booked") =>
  code(
    `INSERT INTO appointments (client_id, master_id, service_code, start_at, end_at, status, source)
     SELECT 'CL-0001', $1, $2, $3::timestamp, $3::timestamp + make_interval(mins => duration_min), $4, 'Admin'
     FROM services WHERE service_code = $2`,
    [master, service, `${day} ${start}`, status],
  );

beforeAll(freshDb);
afterAll(() => pool.end());

describe("schema", () => {
  it("applies every migration once, in order: shared ones in public, CRM ones in the business schema", async () => {
    const core = await pool.query("SELECT version FROM public.schema_migrations ORDER BY version");
    expect(core.rows.map((r) => r.version)).toEqual(["001_accounts.sql"]);
    const own = await pool.query("SELECT version FROM tenant_migrations ORDER BY version");
    expect(own.rows.map((r) => r.version)).toEqual(["001_init.sql", "002_reporting.sql", "003_brand.sql", "004_integrations.sql", "005_data_quality.sql", "006_reminders.sql", "007_ai_engine.sql", "008_ai_engine_voronixai.sql"]);
  });

  it("has the 15 CRM tables and 3 reporting views in the business schema, and 4 shared tables in public", async () => {
    const tables = (schema: string) =>
      pool.query(
        `SELECT table_name, table_type FROM information_schema.tables
          WHERE table_schema = $1 AND table_name NOT IN ('schema_migrations', 'tenant_migrations') ORDER BY 1`,
        [schema],
      );
    const own = (await tables(demo.schema)).rows;
    expect(own.filter((r) => r.table_type === "BASE TABLE").map((r) => r.table_name)).toEqual([
      "ai_runs", "appointment_reminders", "appointments", "business_settings", "client_channels", "clients", "conversations", "integrations", "knowledge_entries",
      "master_accounts", "master_services", "masters", "messages", "payments", "services",
    ]);
    expect(own.filter((r) => r.table_type === "VIEW").map((r) => r.table_name)).toEqual(["v_daily_revenue", "v_no_show_by_service", "v_visits_to_close"]);
    expect((await tables("public")).rows.map((r) => r.table_name)).toEqual(["businesses", "password_resets", "sessions", "users"]);
  });

  it("generates readable ids from sequences", async () => {
    const { rows } = await pool.query(
      `INSERT INTO clients (display_name, phone) VALUES ('Тест Тестов', '+7 700 000 0001') RETURNING client_id`,
    );
    expect(rows[0].client_id).toMatch(/^CL-\d{4}$/);
  });
});

describe("double booking (exclusion constraint)", () => {
  it("allows back-to-back visits for one master", async () => {
    expect(await insertVisit("MS-02", "CB-05", "10:00")).toBe("ok"); // 90 min -> 11:30
    expect(await insertVisit("MS-02", "HC-01", "11:30")).toBe("ok");
  });

  it("refuses an overlapping visit for the same master", async () => {
    expect(await insertVisit("MS-02", "HC-01", "11:00")).toBe("23P01:appointments_no_overlap");
  });

  it("lets a cancelled visit free its time", async () => {
    expect(await insertVisit("MS-01", "HC-01", "15:00", "Cancelled")).toBe("ok");
    expect(await insertVisit("MS-01", "HC-01", "15:00")).toBe("ok");
  });

  it("keeps exactly one of two simultaneous bookings for the same slot", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => insertVisit("MS-03", "HC-02", "12:00")));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "23P01:appointments_no_overlap")).toHaveLength(7);
  });
});

describe("referential integrity and checks", () => {
  it("refuses a master who does not do the service (composite FK to master_services)", async () => {
    // Ержан М. (MS-04) is the shave master and does not cut kids.
    expect(await insertVisit("MS-04", "KD-03", "16:00")).toBe("23503:appointments_master_id_service_code_fkey");
  });

  it("refuses a visit for an unknown client", async () => {
    // A day with no visits: at "now" the master may be busy, and the overlap
    // check (23P01) would fire before the foreign key check.
    expect(
      await code(`INSERT INTO appointments (client_id, master_id, service_code, start_at, end_at, status, source)
                  VALUES ('CL-9999', 'MS-01', 'HC-01', '2099-01-05 10:00', '2099-01-05 11:00', 'Booked', 'Admin')`),
    ).toMatch(/^23503/);
  });

  it.each([
    ["price must be positive", `UPDATE services SET price_kzt = 0 WHERE service_code = 'HC-01'`],
    ["duration 15–240 min", `UPDATE services SET duration_min = 300 WHERE service_code = 'HC-01'`],
    ["service code format", `INSERT INTO services (service_code, name, category, duration_min, price_kzt) VALUES ('bad', 'X', '', 60, 1000)`],
    ["status is one of the list", `UPDATE appointments SET status = 'Maybe' WHERE appointment_id = 'AP-1001'`],
    ["paid payment needs paid_at", `UPDATE payments SET status = 'Paid', paid_at = NULL WHERE payment_id = 'PM-00001'`],
    ["chat stage is one of the funnel", `UPDATE conversations SET stage = 'Won' WHERE conversation_id = 'CV-0001'`],
  ])("CHECK: %s", async (_name, sql) => {
    expect(await code(sql)).toMatch(/^23514/);
  });

  it("keeps one chat per messenger user", async () => {
    const { rows } = await pool.query("SELECT messenger, external_user_id FROM conversations LIMIT 1");
    expect(
      await code(`INSERT INTO conversations (messenger, external_user_id, contact_name) VALUES ($1, $2, 'dup')`, [rows[0].messenger, rows[0].external_user_id]),
    ).toMatch(/^23505/);
  });

  it("does not delete a service that has visits (ON DELETE RESTRICT)", async () => {
    expect(await code(`DELETE FROM services WHERE service_code = 'VP-07'`)).toMatch(/^23503/);
  });
});

describe("data quality problems from Task 7", () => {
  it("P6: refuses Completed or No-show for a visit that has not started", async () => {
    expect(await insertVisit("MS-01", "HC-01", "11:00", "Completed")).toBe("23514:appointments_result_after_visit");
    expect(await insertVisit("MS-01", "HC-01", "11:00", "No-show")).toBe("23514:appointments_result_after_visit");
  });

  it("P5: lists past visits that are still Booked or Confirmed", async () => {
    // 07:00 is before opening, so this visit never overlaps a demo booking of the same master.
    await pool.query(
      `INSERT INTO appointments (client_id, master_id, service_code, start_at, end_at, status, source)
       VALUES ('CL-0001', 'MS-02', 'HC-02', date_trunc('day', LOCALTIMESTAMP) - interval '30 days' + interval '7 hours',
               date_trunc('day', LOCALTIMESTAMP) - interval '30 days' + interval '7 hours 30 minutes', 'Booked', 'Admin')`,
    );
    const { rows } = await pool.query(`SELECT status, hours_overdue FROM v_visits_to_close ORDER BY start_at LIMIT 1`);
    expect(rows[0].status).toBe("Booked");
    expect(rows[0].hours_overdue).toBeGreaterThan(24 * 29);
  });
});

describe("Task 9 query", () => {
  it("v_no_show_by_service matches a direct count", async () => {
    const view = await pool.query(
      `SELECT service_code, finished_visits::int, no_shows::int FROM v_no_show_by_service WHERE month = (SELECT date_trunc('month', max(start_at))::date FROM appointments WHERE status IN ('Completed','No-show') AND start_at < date_trunc('month', now())) ORDER BY service_code`,
    );
    const direct = await pool.query(
      `SELECT service_code, COUNT(*)::int AS finished_visits, COUNT(*) FILTER (WHERE status = 'No-show')::int AS no_shows
       FROM appointments WHERE status IN ('Completed','No-show') AND date_trunc('month', start_at) = (SELECT date_trunc('month', max(start_at)) FROM appointments WHERE status IN ('Completed','No-show') AND start_at < date_trunc('month', now()))
       GROUP BY service_code ORDER BY service_code`,
    );
    expect(view.rows).toEqual(direct.rows);
    expect(view.rows.length).toBeGreaterThan(3);
  });
});
