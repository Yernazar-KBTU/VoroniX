import type { RequestHandler } from "express";
import { config } from "../config.js";
import { logger } from "./logger.js";

/**
 * Reports what happens in the CRM (sign-ups, sign-ins, bookings, payments, edits) to VoroniX.ai,
 * so its console shows every action next to the assistant's answers, not only chats.
 * Fire and forget: a slow or dead VoroniX.ai never slows the CRM down or fails a request.
 * No passwords, tokens or message texts are sent, only who did what and the outcome.
 */
export interface ActionReport {
  /** "auth.account_created" or "POST /api/clients". */
  action: string;
  status: number;
  ms?: number;
  actor?: { email?: string | null; name?: string | null; role?: string | null };
  business?: string | null;
  detail?: Record<string, string>;
}

export const actionReportingOn = (): boolean => !!config.VORONIXAI_URL && !!config.VORONIXAI_KEY;

export function reportAction(report: ActionReport): void {
  if (!actionReportingOn()) return;
  fetch(`${config.VORONIXAI_URL}/v1/crm/events`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.VORONIXAI_KEY ?? ""}` },
    body: JSON.stringify(report),
    signal: AbortSignal.timeout(3_000),
  })
    .then((res) => {
      if (!res.ok) logger.debug({ status: res.status }, "VoroniX.ai did not accept the action report");
    })
    .catch((err: unknown) => {
      logger.debug({ err: (err as Error).message }, "VoroniX.ai action report failed");
    });
}

const CHANGES = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Sign-in routes report themselves (they know the person); chat traffic is already tracked as answers. */
const SKIP = [/^\/api\/auth\//, /^\/api\/channels\/(?:[^/]+\/)?(?:[^/]+\/inbound|whatsapp\/meta)$/];

/** Every change made through the API becomes one report: who, what, which business, how it ended. */
export const trackActions: RequestHandler = (req, res, next) => {
  if (!actionReportingOn() || !CHANGES.has(req.method)) return next();
  const started = Date.now();
  res.on("finish", () => {
    const route: unknown = req.route?.path;
    if (typeof route !== "string") return;
    const path = `${req.baseUrl}${route}`;
    if (SKIP.some((re) => re.test(path))) return;
    const detail: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.params).slice(0, 4)) if (typeof value === "string") detail[key] = value.slice(0, 40);
    reportAction({
      action: `${req.method} ${path}`,
      status: res.statusCode,
      ms: Date.now() - started,
      actor: req.user ? { email: req.user.email, name: req.user.full_name, role: req.user.role } : {},
      business: req.business?.name ?? null,
      detail,
    });
  });
  next();
};
