import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { firstTime, parseWhatsAppPayload, verifyMetaSignature } from "../../src/lib/meta-whatsapp.js";

const sign = (body: string, secret: string) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

const payload = {
  entry: [{ changes: [{ value: {
    contacts: [{ wa_id: "77011234567", profile: { name: "Dias" } }],
    messages: [{ id: "wamid.1", from: "77011234567", type: "text", text: { body: "Сколько стоит борода?" } }],
  } }] }],
};

describe("verifyMetaSignature", () => {
  const body = JSON.stringify(payload);
  it("accepts a correct signature", () => {
    expect(verifyMetaSignature(Buffer.from(body), sign(body, "s3cret"), "s3cret")).toBe(true);
  });
  it("rejects a wrong secret", () => {
    expect(verifyMetaSignature(Buffer.from(body), sign(body, "other"), "s3cret")).toBe(false);
  });
  it("rejects a changed body", () => {
    expect(verifyMetaSignature(Buffer.from(body + " "), sign(body, "s3cret"), "s3cret")).toBe(false);
  });
  it("rejects a missing header", () => {
    expect(verifyMetaSignature(Buffer.from(body), undefined, "s3cret")).toBe(false);
  });
});

describe("parseWhatsAppPayload", () => {
  it("reads a text message", () => {
    expect(parseWhatsAppPayload(payload)).toEqual([{ id: "wamid.1", from: "77011234567", name: "Dias", text: "Сколько стоит борода?" }]);
  });
  it("ignores garbage", () => {
    expect(parseWhatsAppPayload({})).toEqual([]);
    expect(parseWhatsAppPayload(null)).toEqual([]);
  });
});

describe("firstTime", () => {
  it("lets a message id through once", () => {
    expect(firstTime("wamid.dup")).toBe(true);
    expect(firstTime("wamid.dup")).toBe(false);
  });
});