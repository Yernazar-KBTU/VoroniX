import { EventEmitter } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../../src/config.js";
import { reportAction, trackActions } from "../../src/lib/voronixai-events.js";

// What the CRM tells VoroniX.ai about people and changes: a fake VoroniX.ai records the reports.
const got: { url: string | undefined; auth: string | undefined; body: Record<string, unknown> }[] = [];
let fake: Server;
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  fake = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      got.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(raw) });
      res.writeHead(202).end("{}");
    });
  });
  await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
  config.VORONIXAI_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  config.VORONIXAI_KEY = "test-crm-key-123456";
});
afterAll(() => {
  config.VORONIXAI_URL = undefined;
  config.VORONIXAI_KEY = undefined;
  fake.close();
});

function change(method: string, path: string, user?: unknown) {
  const res = new EventEmitter() as unknown as Response;
  res.statusCode = 201;
  const req = { method, baseUrl: "/api", route: { path }, params: { id: "abc" }, user, business: { name: "Barberista" } } as unknown as Request;
  let called = false;
  trackActions(req, res, () => {
    called = true;
  });
  (res as unknown as EventEmitter).emit("finish");
  return called;
}

describe("reports to VoroniX.ai", () => {
  it("every change is reported with who, what, which business and the outcome", async () => {
    got.length = 0;
    expect(change("POST", "/clients/:id", { email: "o@b.kz", full_name: "Owner", role: "owner" })).toBe(true);
    await wait();
    expect(got).toHaveLength(1);
    expect(got[0]!.url).toBe("/v1/crm/events");
    expect(got[0]!.auth).toBe("Bearer test-crm-key-123456");
    expect(got[0]!.body).toMatchObject({
      action: "POST /api/clients/:id",
      status: 201,
      actor: { email: "o@b.kz", name: "Owner", role: "owner" },
      business: "Barberista",
      detail: { id: "abc" },
    });
  });

  it("reads are not reported, sign-in routes report themselves, chat traffic is not doubled", async () => {
    got.length = 0;
    change("GET", "/clients");
    change("POST", "/auth/login");
    change("POST", "/channels/:messenger/inbound");
    change("POST", "/channels/:business/:messenger/inbound");
    change("POST", "/channels/:business/whatsapp/meta");
    await wait();
    expect(got).toHaveLength(0);
    change("POST", "/channels/:business/payments/webhook");
    await wait();
    expect(got).toHaveLength(1);
  });

  it("a dead VoroniX.ai never breaks the CRM", async () => {
    const url = config.VORONIXAI_URL;
    config.VORONIXAI_URL = "http://127.0.0.1:1";
    expect(() => reportAction({ action: "auth.login", status: 200 })).not.toThrow();
    expect(change("PUT", "/settings")).toBe(true);
    await wait();
    config.VORONIXAI_URL = url;
  });

  it("without VORONIXAI_URL and VORONIXAI_KEY nothing is sent", async () => {
    const url = config.VORONIXAI_URL;
    config.VORONIXAI_URL = undefined;
    got.length = 0;
    expect(change("POST", "/clients")).toBe(true);
    reportAction({ action: "auth.login", status: 200 });
    await wait();
    expect(got).toHaveLength(0);
    config.VORONIXAI_URL = url;
  });
});
