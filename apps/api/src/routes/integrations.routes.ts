import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { HttpError } from "../lib/errors.js";
import { bus } from "../realtime/bus.js";
import { calendarToken, connect, disconnect, listView, test } from "../integrations/manager.js";

export const integrationsRouter = Router();

const ConnectBody = z.object({
  secret: z.string().max(500).optional(),
  settings: z.record(z.string(), z.string().max(300)).optional(),
});

integrationsRouter.get("/integrations", async (_req, res) => {
  res.json(await listView());
});

integrationsRouter.put("/integrations/:id", async (req, res) => {
  const v = await connect(req.params.id, ConnectBody.parse(req.body));
  bus.changed("settings");
  res.json(v);
});

integrationsRouter.post("/integrations/:id/test", async (req, res) => {
  res.json(await test(req.params.id));
});

integrationsRouter.delete("/integrations/:id", async (req, res) => {
  const v = await disconnect(req.params.id);
  bus.changed("settings");
  res.json(v);
});

/**
 * Private iCal feed of visits for Google or Apple Calendar. The token in the
 * URL is the only key, so this path skips the admin login.
 */
integrationsRouter.get("/integrations/calendar.ics", async (req, res) => {
  const token = await calendarToken();
  if (!token || req.query.token !== token) throw new HttpError(404, "Calendar feed not found", "not_found");
  const { rows } = await pool.query<{ id: string; start: string; end: string; service: string; master: string; client: string; status: string }>(
    `SELECT a.appointment_id AS id, to_char(a.start_at, 'YYYYMMDD"T"HH24MISS') AS start, to_char(a.end_at, 'YYYYMMDD"T"HH24MISS') AS end,
            s.name AS service, m.full_name AS master, c.display_name AS client, a.status
     FROM appointments a JOIN services s USING (service_code) JOIN masters m USING (master_id) JOIN clients c USING (client_id)
     WHERE a.status <> 'Cancelled' AND a.start_at >= now() - interval '30 days' AND a.start_at < now() + interval '90 days'
     ORDER BY a.start_at`,
  );
  const biz = (await pool.query<{ name: string; address: string }>(`SELECT name, address FROM business_settings WHERE id = 1`)).rows[0];
  const esc = (s: string) => s.replace(/[\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VoroniX//CRM//EN",
    `X-WR-CALNAME:${esc(biz?.name ?? "VoroniX")} visits`,
    "X-WR-TIMEZONE:Asia/Almaty",
    ...rows.flatMap((r) => [
      "BEGIN:VEVENT",
      `UID:${r.id}@voronix`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Almaty:${r.start}`,
      `DTEND;TZID=Asia/Almaty:${r.end}`,
      `SUMMARY:${esc(`${r.service} · ${r.client}`)}`,
      `DESCRIPTION:${esc(`${r.master} · ${r.status} · ${r.id}`)}`,
      ...(biz?.address ? [`LOCATION:${esc(biz.address)}`] : []),
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  res.type("text/calendar; charset=utf-8").send(lines.join("\r\n") + "\r\n");
});
