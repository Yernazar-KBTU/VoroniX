import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`, "not_found");
export const badRequest = (msg: string) => new HttpError(400, msg, "bad_request");
export const conflict = (msg: string, code = "conflict") => new HttpError(409, msg, code);

type PgError = Error & { code?: string; constraint?: string; detail?: string };

/** Turns PostgreSQL constraint errors into messages a salon admin understands. */
export function fromPg(err: unknown): HttpError | null {
  const e = err as PgError;
  switch (e?.code) {
    case "23P01":
      if (e.constraint === "appointments_no_overlap")
        return conflict("This master already has a visit at this time.", "slot_taken");
      return conflict(e.message);
    case "23505":
      return conflict(`Already exists: ${e.detail ?? e.constraint ?? e.message}`, "duplicate");
    case "23503":
      if (e.constraint?.includes("master_id_service_code"))
        return badRequest("This master does not do this service.");
      return conflict(`Linked record problem: ${e.detail ?? e.message}`, "foreign_key");
    case "23514":
      if (e.constraint === "appointments_result_after_visit")
        return conflict("This visit has not happened yet. Mark it Completed or No-show after it starts.", "visit_not_started");
      return badRequest(`Value is not allowed (${e.constraint ?? "check"}).`);
    case "23502":
      return badRequest(`Missing required value: ${e.message}`);
    case "22007":
    case "22008":
    case "22P02":
      return badRequest(`Bad value: ${e.message}`);
    default:
      return null;
  }
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "validation_failed",
      message: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
      issues: err.issues,
    });
    return;
  }
  const http = err instanceof HttpError ? err : fromPg(err);
  if (http) {
    res.status(http.status).json({ error: http.code, message: http.message });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "bad_json", message: "Request body is not valid JSON" });
    return;
  }
  req.log?.error({ err }, "unhandled error");
  res.status(500).json({ error: "internal", message: "Something went wrong on the server" });
};
