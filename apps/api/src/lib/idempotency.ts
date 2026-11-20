import type { Request } from "express";
import { HttpError } from "./errors.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads the Idempotency-Key header (a UUID the client makes once per button press). */
export function readIdempotencyKey(req: Request): string | undefined {
  const raw = req.get("idempotency-key");
  if (raw === undefined) return undefined;
  if (!UUID.test(raw)) throw new HttpError(400, "Idempotency-Key must be a UUID.", "bad_request");
  return raw.toLowerCase();
}