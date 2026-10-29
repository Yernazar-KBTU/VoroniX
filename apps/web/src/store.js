// Client-side copy of the CRM data. The server is the source of truth: after
// any change it sends a "changed" event and the store re-fetches that table.

import { api } from "./api.js";
import { parseDT, toast } from "./util.js";

export const COLS = ["settings", "services", "masters", "master_services", "clients", "client_channels", "appointments", "payments", "conversations", "knowledge"];
const ENDPOINT = {
  settings: "/settings",
  services: "/services",
  masters: "/masters",
  master_services: "/master-services",
  clients: "/clients",
  client_channels: "/client-channels",
  appointments: "/appointments",
  payments: "/payments",
  conversations: "/conversations",
  knowledge: "/knowledge",
};

/** S[table][id] = row */
export const S = Object.fromEntries(COLS.map((c) => [c, {}]));
export const meta = { aiEngine: "", loaded: false, online: false };
/** conversation id -> "Thinking…" etc. while the AI works */
export const aiBusy = {};

const byId = (rows) => Object.fromEntries(rows.map(({ id, ...rest }) => [id, rest]));

function put(col, data) {
  S[col] = col === "settings" ? { business: data } : byId(data);
}

export async function loadAll() {
  const b = await api.get("/bootstrap");
  for (const c of COLS) put(c, b[c]);
  meta.aiEngine = b.ai_engine;
  meta.loaded = true;
}

export async function reload(cols) {
  await Promise.all(cols.filter((c) => ENDPOINT[c]).map(async (c) => put(c, await api.get(ENDPOINT[c]))));
}

/** Runs an API call, shows a toast on success or with the server's reason on failure. */
export async function act(promise, ok) {
  try {
    const r = await promise;
    if (ok) toast(ok);
    return r;
  } catch (e) {
    toast(e.message || String(e));
    throw e;
  }
}

export const vals = (col) => Object.entries(S[col]).map(([id, v]) => ({ id, ...v }));
export const biz = () => S.settings.business || {};
export const svc = (code) => S.services[code];
export const mst = (id) => S.masters[id];
export const cli = (id) => S.clients[id];
export const mastersFor = (code) =>
  vals("master_services")
    .filter((x) => x.service_code === code)
    .map((x) => x.master_id)
    .filter((id) => mst(id) && mst(id).is_active !== false);
export const servicesOf = (mid) => vals("master_services").filter((x) => x.master_id === mid).map((x) => x.service_code);
export const active = (a) => a.status !== "Cancelled";
export const apptEnd = (a) => parseDT(a.end_datetime) || new Date(parseDT(a.start_datetime).getTime() + ((svc(a.service_code) || {}).duration_min || 60) * 60000);
export function prepayFor(code) {
  const b = biz();
  const s = svc(code);
  if (!s) return 0;
  return s.price_kzt >= (+b.prepay_min_price || Infinity) ? Math.round((s.price_kzt * (+b.prepay_percent || 0)) / 100) : 0;
}
export const revenueOf = (list) => list.filter((a) => a.status === "Completed").reduce((s, a) => s + ((svc(a.service_code) || {}).price_kzt || 0), 0);
export const convClientAppts = (conv) =>
  conv.client_id ? vals("appointments").filter((a) => a.client_id === conv.client_id).sort((a, b) => (a.start_datetime < b.start_datetime ? -1 : 1)) : [];
