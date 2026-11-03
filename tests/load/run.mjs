// Load test against a running server with the demo business: npm run db:seed,
// npm start, then npm run test:load. Signs in as the demo owner, so the CRM
// routes answer as they do for a real user. Writes reports/load-test.json.
import autocannon from "autocannon";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DURATION = Number(process.env.DURATION ?? 10);
const EMAIL = process.env.DEMO_EMAIL ?? "demo@voronix.dev";
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";

async function call(path, { method = "GET", body, cookie } = {}) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r;
}

// Sign in, then make sure the demo business has a WhatsApp webhook to send messages to.
const login = await call("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const business = (await (await call("/api/auth/me", { cookie })).json()).business.id;
let wa = (await (await call("/api/integrations", { cookie })).json()).find((i) => i.id === "whatsapp");
if (!wa?.shared_secret) wa = await (await call("/api/integrations/whatsapp", { method: "PUT", cookie, body: { settings: { phone: "+7 700 000 0000" } } })).json();

const scenarios = [
  { name: "GET /api/health", path: "/api/health", connections: 50 },
  { name: "GET /api/services", path: "/api/services", connections: 50 },
  { name: "GET /api/appointments (240+ rows)", path: "/api/appointments", connections: 50 },
  { name: "GET /api/appointments/free-slots", path: `/api/appointments/free-slots?service_code=HC-01&date=${nextWednesday()}`, connections: 50 },
  { name: "GET /api/analytics/no-shows (Task 9 view)", path: "/api/analytics/no-shows", connections: 50 },
  { name: "GET /api/bootstrap (all tables)", path: "/api/bootstrap", connections: 20 },
  {
    name: "POST /api/channels/:business/whatsapp/inbound (AI reply)",
    connections: 20,
    // Each request is a new messenger user, so every message starts a chat and an AI run.
    setupClient: (client) =>
      client.setBody(JSON.stringify({ external_user_id: `load_${Math.random().toString(36).slice(2)}`, name: "load", text: "Сколько стоит стрижка завтра после 6?" })),
    method: "POST",
    path: `/api/channels/${business}/whatsapp/inbound`,
    headers: { "x-channel-secret": wa.shared_secret },
  },
];

function nextWednesday() {
  const d = new Date(Date.now() + 21 * 864e5);
  while (d.getDay() !== 3) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const results = [];
for (const s of scenarios) {
  const r = await autocannon({
    url: BASE + s.path,
    method: s.method ?? "GET",
    headers: { "content-type": "application/json", cookie, ...(s.headers ?? {}) },
    connections: s.connections,
    duration: DURATION,
    setupClient: s.setupClient,
  });
  const row = {
    scenario: s.name,
    connections: s.connections,
    requests: r.requests.total,
    rps: Math.round(r.requests.average),
    p50_ms: r.latency.p50,
    p97_5_ms: r.latency.p97_5,
    p99_ms: r.latency.p99,
    errors: r.errors + r.non2xx,
  };
  results.push(row);
  console.log(row);
}
await mkdir(new URL("../../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../../reports/load-test.json", import.meta.url), JSON.stringify({ base: BASE, duration_s: DURATION, at: new Date().toISOString(), results }, null, 2));
console.table(results);
