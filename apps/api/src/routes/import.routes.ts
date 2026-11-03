import express, { Router } from "express";
import { ReadBody, readWithClaude } from "../ai/import-ai.js";
import { ImportBody, applyImport } from "../services/import.service.js";

export const importRouter = Router();

/** Saves the rows the owner checked in the import preview, all in one transaction. */
importRouter.post("/import", express.json({ limit: "5mb" }), async (req, res) => {
  res.json(await applyImport(ImportBody.parse(req.body)));
});

/** PDF files, photos and free text read by Claude into a draft for the preview. Saves nothing. */
importRouter.post("/import/ai", express.json({ limit: "30mb" }), async (req, res) => {
  res.json(await readWithClaude(ReadBody.parse(req.body)));
});
