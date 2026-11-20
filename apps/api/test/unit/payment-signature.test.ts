import { describe, expect, it } from "vitest";
import { signPayload, verifyPaymentSignature } from "../../src/lib/payment-signature.js";

const secret = "test-secret-not-real";
const now = 1_800_000_000;
const ts = String(now);
const body = Buffer.from(JSON.stringify({ event_id: "evt_00000001", type: "payment.succeeded", payment_id: "PM-00001", amount_kzt: 6600 }));

describe("payment webhook signature", () => {
  it("accepts a correct signature", () => {
    const signature = signPayload(secret, ts, body);
    expect(verifyPaymentSignature({ secret, raw: body, timestamp: ts, signature, now })).toBe("ok");
  });

  it("refuses a body that was changed after signing (for example another amount)", () => {
    const signature = signPayload(secret, ts, body);
    const forged = Buffer.from(body.toString().replace("6600", "1"));
    expect(verifyPaymentSignature({ secret, raw: forged, timestamp: ts, signature, now })).toBe("bad_signature");
  });

  it("refuses a signature made with another secret", () => {
    const signature = signPayload("another-secret", ts, body);
    expect(verifyPaymentSignature({ secret, raw: body, timestamp: ts, signature, now })).toBe("bad_signature");
  });

  it("refuses a recorded request that is replayed later", () => {
    const signature = signPayload(secret, ts, body);
    expect(verifyPaymentSignature({ secret, raw: body, timestamp: ts, signature, now: now + 301 })).toBe("stale");
    expect(verifyPaymentSignature({ secret, raw: body, timestamp: ts, signature, now: now + 299 })).toBe("ok");
  });

  it("refuses requests without signature headers or with a garbage signature", () => {
    expect(verifyPaymentSignature({ secret, raw: body, timestamp: undefined, signature: undefined, now })).toBe("missing");
    expect(verifyPaymentSignature({ secret, raw: body, timestamp: ts, signature: "zz", now })).toBe("bad_signature");
  });
});
