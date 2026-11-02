// The server hands out the landing page, the CRM and the legal pages from the
// built web app, and never lets a page swallow an API address.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

const dist = mkdtempSync(path.join(tmpdir(), "vx-web-"));
for (const page of ["index", "app", "terms", "privacy"]) writeFileSync(path.join(dist, `${page}.html`), `<!doctype html><title>${page}</title>`);
mkdirSync(path.join(dist, "assets"));
writeFileSync(path.join(dist, "assets", "app-1234.js"), "export {};");
process.env.WEB_DIST = dist; // read when app.ts loads, so it is imported below
const { createApp } = await import("../../src/app.js");
const { pool } = await import("../../src/db/pool.js");
const app = createApp();

afterAll(async () => {
  rmSync(dist, { recursive: true, force: true });
  await pool.end();
});

const title = (html: string) => /<title>(\w+)<\/title>/.exec(html)?.[1];

describe("web pages", () => {
  it("serves the landing page on /", async () => {
    const r = await request(app).get("/").expect(200).expect("Content-Type", /html/);
    expect(title(r.text)).toBe("index");
    expect(r.headers["cache-control"]).toBe("no-cache");
  });

  it("serves the CRM on /app, whatever comes after it", async () => {
    for (const p of ["/app", "/app/", "/app/settings"]) expect(title((await request(app).get(p).expect(200)).text)).toBe("app");
  });

  it("serves Terms and Privacy on clean addresses", async () => {
    expect(title((await request(app).get("/terms").expect(200)).text)).toBe("terms");
    expect(title((await request(app).get("/privacy").expect(200)).text)).toBe("privacy");
  });

  it("answers unknown addresses with the landing page and a 404", async () => {
    expect(title((await request(app).get("/pricing-old").expect(404)).text)).toBe("index");
  });

  it("caches built files for a year, because their names change with every build", async () => {
    const r = await request(app).get("/assets/app-1234.js").expect(200);
    expect(r.headers["cache-control"]).toContain("immutable");
  });

  it("keeps unknown API addresses as JSON errors", async () => {
    const r = await request(app).get("/api/no-such-thing").expect(404).expect("Content-Type", /json/);
    expect(r.body.error).toBe("not_found");
  });
});
