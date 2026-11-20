import { Router, type Request } from "express";
import { z } from "zod";
import { replyTo } from "../ai/runner.js";
import { pool } from "../db/pool.js";
import { HttpError, notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { verifyPaymentSignature } from "../lib/payment-signature.js";
import * as pays from "../repositories/payments.repo.js";
import * as booking from "../services/booking.service.js";
import { withTenant } from "../tenancy/context.js";
import { findTenant } from "../tenancy/tenants.js";

export const paymentWebhookRouter = Router();

const PaymentEvent = z.object({
  event_id: z.string().min(8).max(100),
  type: z.string().min(1).max(60),
  payment_id: z.string().regex(/^PM-\d+$/),
  amount_kzt: z.number().int().positive(),
});


paymentWebhookRouter.post("/channels/:business/payments/webhook", async (req: Request, res) => {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(404, "Payment webhook is not configured", "not_found");

  const verdict = verifyPaymentSignature({
    secret,
    raw: (req as Request & { rawBody?: Buffer }).rawBody,
    timestamp: req.get("x-voronix-timestamp"),
    signature: req.get("x-voronix-signature"),
  });
  if (verdict !== "ok") {
    logger.warn({ verdict, business: req.params.business }, "payment webhook rejected");
    throw new HttpError(401, "Bad signature", "unauthorized"); // same answer for every reason
  }

  const tenant = await findTenant(String(req.params.business));
  if (!tenant) throw notFound("Business");
  const event = PaymentEvent.parse(req.body);

  const result = await withTenant(tenant, () => handleEvent(event));
  res.status(200).json(result); // 2xx also for duplicates, so the provider stops retrying
});

async function handleEvent(event: z.infer<typeof PaymentEvent>): Promise<{ status: string }> {
  if (event.type !== "payment.succeeded") return { status: "ignored" };

  const payment = await pays.getPayment(pool, event.payment_id, false);
  if (!payment) throw notFound("Payment");
  // A true signature does not prove the amount is right: compare it with our own record.
  if (Number(payment.amount_kzt) !== event.amount_kzt) {
    logger.warn({ payment: event.payment_id }, "payment webhook amount does not match");
    throw new HttpError(422, "Amount does not match the payment", "amount_mismatch");
  }

  // Claim the event id first: the same event arriving twice (or in parallel) is processed once.
  const claim = await pool.query(
    `INSERT INTO payment_events (event_id, event_type, payment_id) VALUES ($1, $2, $3)
     ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
    [event.event_id, event.type, event.payment_id],
  );
  if (!claim.rowCount) return { status: "duplicate" };

  try {
    const { conversations } = await booking.markPaid(event.payment_id, "Payment provider");
    for (const id of conversations) {
      const { rows } = await pool.query<{ ai_enabled: boolean }>(`SELECT ai_enabled FROM conversations WHERE conversation_id = $1`, [id]);
      if (rows[0]?.ai_enabled) void replyTo(id);
    }
    return { status: "processed" };
  } catch (err) {
    // Processing failed: release the claim so the provider's retry can try again.
    await pool.query(`DELETE FROM payment_events WHERE event_id = $1`, [event.event_id]);
    throw err;
  }
}
