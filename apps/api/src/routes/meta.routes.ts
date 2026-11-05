import { Router, type Request } from "express";
import { replyTo } from "../ai/runner.js";
import { HttpError, notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { firstTime, parseWhatsAppPayload, verifyMetaSignature } from "../lib/meta-whatsapp.js";
import { safeEqual } from "../lib/safe-equal.js";
import { receiveInbound } from "../services/conversation.service.js";
import { withTenant } from "../tenancy/context.js";
import { findTenant } from "../tenancy/tenants.js";

export const metaRouter = Router();

/** Step 1: when the address is saved in the Meta dashboard, Meta asks for it with GET and expects hub.challenge back. */
metaRouter.get("/channels/:business/whatsapp/meta", (req, res) => {
  const expected = process.env.META_VERIFY_TOKEN;
  const token = req.query["hub.verify_token"];
  if (req.query["hub.mode"] === "subscribe" && expected && typeof token === "string" && safeEqual(token, expected)) {
    res.status(200).type("text/plain").send(String(req.query["hub.challenge"] ?? ""));
    return;
  }
  throw new HttpError(403, "Verification failed", "forbidden");
});

/** Step 2: every message arrives with POST, signed with the App Secret. */
metaRouter.post("/channels/:business/whatsapp/meta", async (req: Request, res) => {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) throw new HttpError(404, "Meta webhook is not configured", "not_found");
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!verifyMetaSignature(raw, req.get("x-hub-signature-256"), appSecret)) throw new HttpError(401, "Bad signature", "unauthorized");
  const tenant = await findTenant(String(req.params.business));
  if (!tenant) throw notFound("Business");

  res.sendStatus(200); // answer Meta at once, otherwise it retries
  try {
    const messages = parseWhatsAppPayload(req.body).filter((m) => firstTime(m.id));
    await withTenant(tenant, async () => {
      for (const m of messages) {
        const { conversation } = await receiveInbound({ messenger: "WhatsApp", external_user_id: `wa_${m.from}`, name: m.name, text: m.text });
        if (conversation.ai_enabled) void replyTo(conversation.id);
      }
    });
  } catch (err) {
    logger.error({ err, business: tenant.id }, "whatsapp inbound failed");
  }
});