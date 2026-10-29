import { Router } from "express";
import { pool, tx } from "../db/pool.js";
import { notFound } from "../lib/errors.js";
import { bus } from "../realtime/bus.js";
import * as catalog from "../repositories/catalog.repo.js";
import { getSettings, saveSettings } from "../repositories/settings.repo.js";
import { MasterBody, ServiceBody, ServiceCode, SettingsBody } from "./schemas.js";

export const catalogRouter = Router();

catalogRouter.get("/settings", async (_req, res) => {
  res.json(await getSettings(pool));
});

catalogRouter.put("/settings", async (req, res) => {
  const saved = await saveSettings(pool, SettingsBody.parse(req.body));
  bus.changed("settings");
  res.json(saved);
});

catalogRouter.get("/services", async (_req, res) => {
  res.json(await catalog.listServices(pool));
});

/** Create or update a service by its code. */
catalogRouter.put("/services/:code", async (req, res) => {
  const code = ServiceCode.parse(req.params.code);
  const body = ServiceBody.parse(req.body);
  const existed = await catalog.getService(pool, code);
  const saved = await catalog.upsertService(pool, { id: code, ...body });
  bus.changed("services");
  res.status(existed ? 200 : 201).json(saved);
});

catalogRouter.get("/masters", async (_req, res) => {
  res.json(await catalog.listMasters(pool));
});

catalogRouter.get("/master-services", async (_req, res) => {
  res.json(await catalog.listMasterServices(pool));
});

catalogRouter.post("/masters", async (req, res) => {
  const { service_codes, ...m } = MasterBody.parse(req.body);
  const saved = await tx(async (c) => {
    const row = await catalog.saveMaster(c, m);
    if (service_codes) await catalog.setMasterServices(c, row.id, service_codes);
    return row;
  });
  bus.changed("masters", "master_services");
  res.status(201).json(saved);
});

catalogRouter.put("/masters/:id", async (req, res) => {
  const { service_codes, ...m } = MasterBody.parse(req.body);
  const saved = await tx(async (c) => {
    if (!(await catalog.getMaster(c, req.params.id))) throw notFound("Master");
    const row = await catalog.saveMaster(c, { ...m, id: req.params.id });
    if (service_codes) await catalog.setMasterServices(c, row.id, service_codes);
    return row;
  });
  bus.changed("masters", "master_services");
  res.json(saved);
});
