/*
 * Browser-only demo of VoroniX. Loaded before the app in the demo build
 * (`npm run build:demo`), it answers the web app's /api requests from a saved
 * snapshot of a real server (demo-data.json), so the site runs from static
 * hosting. Any email and password sign in to the demo barbershop; "Create an
 * account" opens an empty business with the name you type. Business setup,
 * services, staff, clients, knowledge and imports are kept while the tab is open.
 */
(function () {
  "use strict";

  var realFetch = window.fetch.bind(window);
  var KEY = "vx-demo-session";
  var memory = null;

  function readSession() {
    try {
      var raw = sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : memory;
    } catch (e) {
      return memory;
    }
  }
  function writeSession(s) {
    memory = s;
    try {
      if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
      else sessionStorage.removeItem(KEY);
    } catch (e) {
      /* storage blocked: the session lives until the page closes */
    }
  }

  var OWNER = { email: "yernazar@voronix.app", password: "voronix2026" };
  function ownerSession() {
    var zone = "UTC";
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (e) {
      /* keep UTC */
    }
    var keep = readSession();
    return { kind: "fresh", name: "My Business", type: "Beauty salon", full_name: "Yernazar", email: OWNER.email, tz: zone, cur: "USD", settings: keep && keep.email === OWNER.email ? keep.settings : undefined };
  }

  // The link with #empty opens a new, empty business straight away.
  if (location.hash === "#empty" && !/app\.html$/.test(location.pathname)) {
    writeSession(ownerSession());
    location.replace("app.html");
    return;
  }

  /* ---------- the snapshot, moved to today ---------- */

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }
  var DATE = /^(\d{4})-(\d{2})-(\d{2})((?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?)$/;
  function shiftString(s, days) {
    var m = DATE.exec(s);
    if (!m) return s;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days));
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + m[4];
  }
  function shift(value, days) {
    if (typeof value === "string") return shiftString(value, days);
    if (Array.isArray(value)) return value.map(function (v) { return shift(v, days); });
    if (value && typeof value === "object") {
      var out = {};
      for (var k in value) out[k] = shift(value[k], days);
      return out;
    }
    return value;
  }
  function dayNumber(d) {
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  }

  // Visits, chats and payments keep their place relative to "today".
  var ready = realFetch(new URL("demo-data.json", document.baseURI).href)
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      var days = dayNumber(new Date()) - dayNumber(new Date(data.capturedOn));
      ["demo", "fresh"].forEach(function (k) {
        data[k].bootstrap = shift(data[k].bootstrap, days);
      });
      return data;
    });

  /* ---------- answers ---------- */

  function reply(status, body) {
    return new Response(status === 204 ? null : JSON.stringify(body), { status: status, headers: { "Content-Type": "application/json" } });
  }
  function copy(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function meFor(data, s) {
    var me = copy(data[s.kind].me);
    if (s.kind === "fresh") {
      me.user.full_name = s.full_name || me.user.full_name;
      me.user.email = s.email || me.user.email;
      me.business.name = s.name || me.business.name;
      me.business.timezone = s.tz || me.business.timezone;
      me.business.currency = s.cur || me.business.currency;
    } else if (s.email) {
      me.user.email = s.email;
    }
    if (s.settings && s.settings.name) me.business.name = s.settings.name;
    return me;
  }

  function bootstrapFor(data, s) {
    var b = copy(data[s.kind].bootstrap);
    if (s.kind === "fresh") {
      if (s.name) b.settings.name = b.business.name = s.name;
      if (s.type) b.settings.type = s.type;
      if (s.tz) b.business.timezone = s.tz;
      if (s.cur) b.business.currency = s.cur;
    }
    // Business setup edits live in this browser tab's session.
    if (s.settings) {
      for (var k in s.settings) b.settings[k] = s.settings[k];
      if (s.settings.name) b.business.name = s.settings.name;
    }
    // So do services, staff, clients and knowledge added in the demo.
    var added = s.added || {};
    ["services", "masters", "master_services", "clients", "knowledge"].forEach(function (col) {
      (added[col] || []).forEach(function (row) {
        b[col] = b[col].filter(function (x) { return x.id !== row.id; }).concat([row]);
      });
    });
    return b;
  }

  function upsert(s, col, row) {
    s.added = s.added || {};
    s.added[col] = (s.added[col] || []).filter(function (x) { return x.id !== row.id; }).concat([row]);
  }
  function nextId(data, s, col, prefix, width) {
    var max = 0;
    bootstrapFor(data, s)[col].forEach(function (x) {
      var n = parseInt(String(x.id).replace(/\D/g, ""), 10);
      if (n > max) max = n;
    });
    var n = String(max + 1);
    while (n.length < width) n = "0" + n;
    return prefix + n;
  }

  /* Import without a server: the same matching rules as POST /api/import. */
  var TRANSLIT = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sh", ы: "y", э: "e", ю: "yu", я: "ya", ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i" };
  function codeFor(name, used) {
    var latin = name.toLowerCase().replace(/['’`]/g, "").split("").map(function (ch) { return TRANSLIT[ch] || ch; }).join("").replace(/[^a-z]+/g, " ").trim();
    var words = latin.split(" ").filter(Boolean);
    var p = ((words.length >= 2 ? words[0][0] + words[1][0] : (words[0] || "").slice(0, 2)) + "XX").slice(0, 2).toUpperCase();
    for (var a = -1; a < 26 * 26; a++) {
      var prefix = a < 0 ? p : String.fromCharCode(65 + Math.floor(a / 26), 65 + (a % 26));
      for (var n = 1; n <= 99; n++) {
        var code = prefix + "-" + (n < 10 ? "0" : "") + n;
        if (!used[code]) return code;
      }
    }
    return null;
  }
  var key = function (v) { return String(v || "").trim().toLowerCase().replace(/\s+/g, " "); };
  var digits = function (v) { return String(v || "").replace(/\D/g, "").slice(-10); };

  function importRows(data, s, body) {
    var b = bootstrapFor(data, s);
    var r = { settings: 0, services: { created: 0, updated: 0 }, staff: { created: 0, updated: 0 }, clients: { created: 0, skipped: 0 }, knowledge: { created: 0, skipped: 0 } };
    var touched = {};
    var set = body.settings || {};
    Object.keys(set).forEach(function (k) {
      if (set[k] === "" || set[k] == null) return;
      s.settings = s.settings || {};
      s.settings[k] = set[k];
      r.settings++;
      touched.settings = 1;
    });
    var used = {}, byName = {};
    b.services.forEach(function (x) { used[x.id] = 1; byName[key(x.name)] = x; });
    (body.services || []).forEach(function (x) {
      var found = byName[key(x.name)];
      var id = found ? found.id : x.code && !used[x.code] ? x.code : codeFor(x.name, used);
      used[id] = 1;
      var row = { id: id, name: x.name, category: x.category || (found && found.category) || "", duration_min: x.duration_min, price_kzt: x.price_kzt, is_active: true };
      upsert(s, "services", row);
      byName[key(x.name)] = row;
      r.services[found ? "updated" : "created"]++;
      touched.services = 1;
    });
    var masters = bootstrapFor(data, s).masters;
    (body.staff || []).forEach(function (x) {
      var found = masters.filter(function (m) { return key(m.full_name) === key(x.full_name); })[0];
      var id = found ? found.id : nextId(data, s, "masters", "MS-", 2);
      upsert(s, "masters", { id: id, full_name: x.full_name, specialization: x.specialization || (found && found.specialization) || "", work_start: x.work_start || (found && found.work_start) || "09:00", work_end: x.work_end || (found && found.work_end) || "20:00", days: x.days || (found && found.days) || [1, 2, 3, 4, 5, 6], is_active: true });
      (x.services || []).forEach(function (n) {
        var svc = byName[key(n)];
        if (svc) upsert(s, "master_services", { id: id + "__" + svc.id, master_id: id, service_code: svc.id, skill_level: "Senior", since_date: new Date().toISOString().slice(0, 10) });
      });
      r.staff[found ? "updated" : "created"]++;
      touched.masters = touched.master_services = 1;
    });
    var seen = {}, last = 0;
    var top = function (id) { return parseInt(String(id).replace(/\D/g, ""), 10) || 0; };
    bootstrapFor(data, s).clients.forEach(function (c) {
      seen[c.phone ? digits(c.phone) : "n:" + key(c.display_name)] = 1;
      last = Math.max(last, top(c.id));
    });
    (body.clients || []).forEach(function (x) {
      var k = x.phone ? digits(x.phone) : "n:" + key(x.display_name);
      if (seen[k]) return void r.clients.skipped++;
      seen[k] = 1;
      upsert(s, "clients", { id: "CL-" + String(++last).padStart(4, "0"), display_name: x.display_name, phone: x.phone || "", notes: x.notes || "", created_at: new Date().toISOString().slice(0, 16).replace("T", " ") });
      r.clients.created++;
      touched.clients = 1;
    });
    var known = {}, kb = 0;
    bootstrapFor(data, s).knowledge.forEach(function (k) {
      known[key(k.title) + "\n" + String(k.content).trim()] = 1;
      kb = Math.max(kb, top(k.id));
    });
    (body.knowledge || []).forEach(function (x) {
      var k = key(x.title) + "\n" + String(x.content).trim();
      if (known[k]) return void r.knowledge.skipped++;
      known[k] = 1;
      upsert(s, "knowledge", { id: "KB-" + ++kb, title: x.title, category: x.category || "General", content: x.content, updated_at: new Date().toISOString() });
      r.knowledge.created++;
      touched.knowledge = 1;
    });
    writeSession(s);
    changed(Object.keys(touched));
    return r;
  }

  /* "Teach the AI" without a server: the same patterns as the built-in rule engine. */
  var TEACH_RULES = [
    [/(акци|скидк|промо|бонус|подар|бесплатн|кэшбэк|promo|discount|sale|offer|%)/i, "Promotions"],
    [/(правил|нельзя|обязательн|опоздан|отмен|перенос|штраф|запрещ|must|rule|policy|late|cancel)/i, "Rules"],
    [/(₸|\$|тенге|цен|стоит|прайс|price|min\b)/i, "Prices"],
    [/\?/, "FAQ"],
  ];
  function organise(text) {
    var settings = {};
    var entries = [];
    String(text)
      .replace(/\r/g, "")
      .split(/\n+/)
      .map(function (x) { return x.replace(/^[-•*]\s*/, "").trim(); })
      .filter(Boolean)
      .forEach(function (line) {
        var m;
        if ((m = /^(?:слоган|девиз|slogan|catchphrase|tagline)\s*[:\-]?\s*[«"“]?([^»"”]+?)[»"”]?\.?$/i.exec(line))) return (settings.catchphrase = m[1].trim());
        if ((m = /^(?:часы работы|график работы|режим работы|opening hours|hours)\s*[:\-]?\s*(.+)$/i.exec(line)) && /\d/.test(m[1])) return (settings.hours = m[1].replace(/\.$/, "").trim());
        if ((m = /^(?:адрес|address)\s*[:\-]?\s*(.+)$/i.exec(line))) return (settings.address = m[1].replace(/\.$/, "").trim());
        if ((m = /^(?:телефон|phone)\s*[:\-]?\s*(\+?[\d\s()-]{7,})/i.exec(line))) return (settings.phone = m[1].replace(/\.$/, "").trim());
        if (/:$/.test(line)) return; // a heading such as "Rules:"
        var rule = TEACH_RULES.find(function (r) { return r[0].test(line); });
        var words = line.replace(/[«»"“”]/g, "").split(/\s+/);
        entries.push({ title: words.slice(0, 6).join(" ").replace(/[,.:;!?]+$/, "") + (words.length > 6 ? "…" : ""), category: rule ? rule[1] : "General", content: line });
      });
    return { entries: entries, settings: settings, engine: "offline-rules (demo)" };
  }

  var COLLECTION = {
    "/settings": "settings",
    "/services": "services",
    "/masters": "masters",
    "/master-services": "master_services",
    "/clients": "clients",
    "/client-channels": "client_channels",
    "/appointments": "appointments",
    "/payments": "payments",
    "/conversations": "conversations",
    "/knowledge": "knowledge",
  };

  function noShows(data, s, month) {
    var m = /^(\d{4})-(\d{2})$/.exec(month || "");
    if (!m) return [];
    var now = new Date();
    var offset = (+m[1] * 12 + +m[2] - 1) - (now.getFullYear() * 12 + now.getMonth());
    return copy(data[s.kind].noShows[offset] || []);
  }

  var NOT_SAVED = "This is a demo, so changes are not saved. The full version runs on a server.";

  function route(data, method, path, query, body) {
    var s = readSession();
    if (method === "GET" && path === "/health") return reply(200, { status: "ok", ai_engine: "offline-rules" });
    if (method === "GET" && path === "/auth/config") return reply(200, data.config);
    if (method === "POST" && path === "/auth/login") {
      // The owner's own empty business.
      if (body && String(body.email).toLowerCase() === OWNER.email) {
        if (body.password !== OWNER.password) return reply(401, { error: "invalid", message: "Wrong email or password." });
        writeSession(ownerSession());
        return reply(200, meFor(data, readSession()));
      }
      writeSession({ kind: "demo", email: body && body.email });
      return reply(200, meFor(data, readSession()));
    }
    if (method === "POST" && path === "/auth/register") {
      writeSession({
        kind: "fresh",
        name: body && body.business_name,
        type: body && body.business_type,
        full_name: body && body.full_name,
        email: body && body.email,
        tz: body && body.timezone,
        cur: body && body.currency,
      });
      return reply(200, meFor(data, readSession()));
    }
    if (method === "POST" && path === "/auth/logout") {
      writeSession(null);
      return reply(204);
    }
    if (method === "POST" && path === "/auth/forgot") return reply(200, { ok: true });
    if (path.indexOf("/auth/") === 0 && path !== "/auth/me") return reply(400, { error: "demo", message: "Reset links do not work in the demo. Sign in with any email and password." });
    if (!s) return reply(401, { error: "unauthorized", message: "Please sign in." });

    if (method === "GET") {
      if (path === "/auth/me") return reply(200, meFor(data, s));
      if (path === "/bootstrap") return reply(200, bootstrapFor(data, s));
      if (path === "/integrations") return reply(200, copy(data[s.kind].integrations));
      if (path === "/analytics/ai") return reply(200, copy(data[s.kind].ai));
      if (path === "/analytics/no-shows") return reply(200, noShows(data, s, query.get("month")));
      if (COLLECTION[path]) return reply(200, bootstrapFor(data, s)[COLLECTION[path]]);
      return reply(404, { error: "not_found", message: "Not available in the demo." });
    }
    if (method === "POST" && path === "/ai/teach") return reply(200, organise(body && body.text));
    if (method === "POST" && path === "/import" && body) return reply(200, importRows(data, s, body));
    if (method === "POST" && path === "/import/ai") return reply(400, { error: "ai_off", message: "Claude does not run in the demo, so PDF files and photos cannot be read here. Excel, Word, CSV and text work." });
    if (method === "POST" && path === "/knowledge" && body) {
      var kb = { id: nextId(data, s, "knowledge", "KB-", 1), title: body.title, category: body.category || "General", content: body.content, updated_at: new Date().toISOString() };
      upsert(s, "knowledge", kb);
      writeSession(s);
      changed(["knowledge"]);
      return reply(201, kb);
    }
    var svc = /^\/services\/([^/]+)$/.exec(path);
    if (method === "PUT" && svc && body) {
      var row = { id: decodeURIComponent(svc[1]), name: body.name, category: body.category || "", duration_min: body.duration_min, price_kzt: body.price_kzt, is_active: body.is_active !== false };
      upsert(s, "services", row);
      writeSession(s);
      changed(["services"]);
      return reply(200, row);
    }
    var ms = /^\/masters(?:\/([^/]+))?$/.exec(path);
    if (ms && body && ((method === "POST" && !ms[1]) || (method === "PUT" && ms[1]))) {
      var id = ms[1] ? decodeURIComponent(ms[1]) : nextId(data, s, "masters", "MS-", 2);
      var m = { id: id, full_name: body.full_name, specialization: body.specialization || "", work_start: body.work_start, work_end: body.work_end, days: body.days || [], is_active: body.is_active !== false };
      upsert(s, "masters", m);
      s.added.master_services = (s.added.master_services || []).filter(function (x) { return x.master_id !== id; });
      (body.service_codes || []).forEach(function (code) {
        upsert(s, "master_services", { id: id + "__" + code, master_id: id, service_code: code, skill_level: "Senior", since_date: new Date().toISOString().slice(0, 10) });
      });
      writeSession(s);
      changed(["masters", "master_services"]);
      return reply(method === "POST" ? 201 : 200, m);
    }
    if (method === "PUT" && path === "/settings" && body) {
      s.settings = Object.assign({}, s.settings, body);
      writeSession(s);
      changed(["settings"]);
      return reply(200, bootstrapFor(data, s).settings);
    }
    // "Load the demo barbershop" switches to the barbershop, as on a real server.
    if (method === "POST" && path === "/admin/reset-demo") {
      writeSession({ kind: "demo", email: s.email });
      return reply(200, { ok: true });
    }
    return reply(403, { error: "demo", message: NOT_SAVED });
  }

  window.fetch = function (input, init) {
    var url = new URL(typeof input === "string" ? input : input.url, location.href);
    var at = url.pathname.indexOf("/api/");
    if (url.origin !== location.origin || at === -1) return realFetch(input, init);
    var method = String((init && init.method) || (typeof input !== "string" && input.method) || "GET").toUpperCase();
    var body = null;
    try {
      body = init && typeof init.body === "string" ? JSON.parse(init.body) : null;
    } catch (e) {
      body = null;
    }
    var path = url.pathname.slice(at + 4);
    return ready.then(function (data) {
      return route(data, method, path, url.searchParams, body);
    });
  };

  // Live updates: the demo has no server, so the stream just reports "connected".
  var RealEventSource = window.EventSource;
  var streams = [];
  // Tells the open app what changed, as the server does after a save.
  function changed(resources) {
    setTimeout(function () {
      streams.forEach(function (es) {
        if (es.readyState === 1 && es.onmessage) es.onmessage({ data: JSON.stringify({ type: "changed", resources: resources }) });
      });
    }, 0);
  }
  function DemoEventSource(url, options) {
    if (String(url).indexOf("/api/") === -1 && RealEventSource) return new RealEventSource(url, options);
    var self = this;
    streams.push(this);
    this.url = String(url);
    this.readyState = 0;
    setTimeout(function () {
      self.readyState = 1;
      if (self.onopen) self.onopen({ type: "open" });
    }, 50);
  }
  DemoEventSource.prototype.close = function () {
    this.readyState = 2;
  };
  DemoEventSource.prototype.addEventListener = function () {};
  DemoEventSource.prototype.removeEventListener = function () {};
  window.EventSource = DemoEventSource;

  /* ---------- a small note on every page ---------- */

  function note() {
    try {
      if (sessionStorage.getItem("vx-demo-note-hidden") === "1") return;
    } catch (e) {
      /* show it */
    }
    if (document.getElementById("vx-demo-note")) return;
    var b = document.createElement("button");
    b.id = "vx-demo-note";
    b.type = "button";
    b.title = "Hide";
    b.textContent = "Demo: any email and password sign in. Business setup, services, staff, clients, imports and AI knowledge are kept while this tab is open.  ×";
    b.style.cssText =
      "position:fixed;z-index:2147483000;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom,0px));max-width:calc(100% - 24px);padding:8px 14px;border-radius:999px;border:0;background:#141a46;color:#fff;font:600 12px/1.35 Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(10,14,42,.28);cursor:pointer;white-space:normal;text-align:center";
    b.addEventListener("click", function () {
      b.remove();
      try {
        sessionStorage.setItem("vx-demo-note-hidden", "1");
      } catch (e) {
        /* hidden until the page reloads */
      }
    });
    document.body.appendChild(b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", note);
  else note();
})();
