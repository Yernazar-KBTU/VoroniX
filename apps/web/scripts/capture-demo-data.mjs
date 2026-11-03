// Saves what the web app reads from a running VoroniX server into
// src/demo/demo-data.json, the data of the browser-only demo (npm run build:demo).
// Signs in as the demo owner, reloads the demo barbershop, and also signs up a
// new empty business for the "Create an account" path.
//
//   node scripts/capture-demo-data.mjs            # server at http://localhost:3000
//   BASE=http://localhost:3077/api node scripts/capture-demo-data.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const B = process.env.BASE ?? "http://localhost:3000/api";
const out = process.argv[2] ?? fileURLToPath(new URL("../src/demo/demo-data.json", import.meta.url));

async function call(method, path, body, cookie) {
  const r = await fetch(B + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 200)}`);
  const set = r.headers.getSetCookie?.() ?? [];
  return { json: text ? JSON.parse(text) : null, cookie: set.map((c) => c.split(";")[0]).join("; ") };
}

/** This month and the three before it, in the business's time zone, for the no-show report. */
function months(tz) {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(new Date()).split("-").map(Number);
  return [0, -1, -2, -3].map((o) => {
    const d = new Date(Date.UTC(y, m - 1 + o, 1));
    return [o, `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`];
  });
}

async function snapshot(cookie) {
  const me = (await call("GET", "/auth/me", null, cookie)).json;
  const snap = {
    me,
    bootstrap: (await call("GET", "/bootstrap", null, cookie)).json,
    integrations: (await call("GET", "/integrations", null, cookie)).json,
    ai: (await call("GET", "/analytics/ai", null, cookie)).json,
    noShows: {},
  };
  for (const [o, m] of months(me.business?.timezone ?? "UTC")) snap.noShows[o] = (await call("GET", `/analytics/no-shows?month=${m}`, null, cookie)).json;
  return snap;
}

const demo = await call("POST", "/auth/login", { email: process.env.DEMO_EMAIL ?? "demo@voronix.dev", password: process.env.DEMO_PASSWORD ?? "demo-password", remember: true });
await call("POST", "/admin/reset-demo", {}, demo.cookie);
const fresh = await call("POST", "/auth/register", {
  business_name: "Glow Nails NYC",
  business_type: "Nail studio",
  full_name: "Ana Lopez",
  email: `owner${Date.now()}@glow.example`,
  password: "demo-password-123",
  timezone: "America/New_York",
  currency: "USD",
});
const data = { capturedOn: new Date().toISOString(), config: (await call("GET", "/auth/config")).json, demo: await snapshot(demo.cookie), fresh: await snapshot(fresh.cookie) };
writeFileSync(out, JSON.stringify(data));
console.log(`Saved ${out} (${Math.round(JSON.stringify(data).length / 1024)} KB)`);
