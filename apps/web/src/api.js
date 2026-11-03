// Thin client for the CRM REST API. Every call returns parsed JSON or throws
// an Error whose message is the server's human-readable explanation.

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    const err = new Error("Cannot reach the server");
    err.status = 0;
    throw err;
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  // A session that expired while the CRM was open: back to the sign-in screen.
  if (res.status === 401 && !path.startsWith("/auth/")) {
    location.reload();
    return new Promise(() => {});
  }
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.error;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request("GET", p),
  post: (p, b = {}) => request("POST", p, b),
  put: (p, b) => request("PUT", p, b),
  patch: (p, b) => request("PATCH", p, b),
  del: (p) => request("DELETE", p),
};

/** Server-Sent Events from /api/events, reconnecting automatically. */
export function subscribe(onEvent, onState) {
  const es = new EventSource("/api/events");
  es.onopen = () => onState?.(true);
  es.onerror = () => onState?.(false);
  es.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data));
    } catch {
      /* ignore malformed event */
    }
  };
  return () => es.close();
}
