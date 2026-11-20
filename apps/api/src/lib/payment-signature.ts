import { createHmac, timingSafeEqual } from "node:crypto";

export type SignatureVerdict = "ok" | "missing" | "stale" | "bad_signature";

/** How far the timestamp may be from our clock. A recorded request older than this is refused. */
export const TOLERANCE_SECONDS = 300;

/** HMAC-SHA256 over "<timestamp>.<raw body>", as hex. The provider signs the same way. */
export function signPayload(secret: string, timestamp: string, raw: Buffer | string): string {
  return createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex");
}

export function verifyPaymentSignature(input: {
  secret: string;
  raw: Buffer | undefined; // the exact bytes that arrived, not re-serialised JSON
  timestamp: string | undefined;
  signature: string | undefined;
  now?: number; // unix seconds, for tests
  toleranceSeconds?: number;
}): SignatureVerdict {
  const { secret, raw, timestamp, signature } = input;
  if (!raw || !timestamp || !signature) return "missing";
  if (!/^\d{10}$/.test(timestamp)) return "bad_signature";

  const expected = Buffer.from(signPayload(secret, timestamp, raw), "hex");
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(expected, given)) return "bad_signature";

  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > (input.toleranceSeconds ?? TOLERANCE_SECONDS)) return "stale";
  return "ok";
}
