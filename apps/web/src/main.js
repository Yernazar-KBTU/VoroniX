// Entry point: sign in, load the business's data once, then stay in sync with
// the server over SSE.

import "./styles.css";
import "./modals.js";
import { api, subscribe } from "./api.js";
import { showAuth } from "./auth.js";
import { logoMark } from "./logo.js";
import { aiBusy, loadAll, meta, reload } from "./store.js";
import { canSee, initChrome, render, renderTyping, scheduleRender, ui } from "./ui.js";
import { $, esc, setBusinessPlace } from "./util.js";

const SIGN_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/></svg>';

/** Who answers clients right now, and whether the live connection is up. */
function setStatus() {
  $("#modeChip").hidden = meta.online;
  const claude = String(meta.aiEngine).startsWith("claude"); // "claude:<model>" or "offline-rules"
  $("#aiState .led").classList.toggle("off", !claude);
  $("#aiText").textContent = claude ? "AI replies: Claude" : "AI replies: basic rules";
  $("#aiState").title = claude
    ? "Claude writes the replies to your clients."
    : "Claude is not available on this server, so simple built-in rules answer clients. Add a Claude key in Integrations.";
}

/** The signed-in person at the bottom of the sidebar, with sign out. */
function setAccount(me) {
  meta.user = me.user;
  meta.business = me.business;
  setBusinessPlace(me.business?.timezone, me.business?.currency);
  $("#sideLogo").innerHTML = logoMark(34);
  const name = (me.user.full_name || me.user.email).trim();
  $("#acct").innerHTML = `<span class="avatar" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</span><span class="who"><b>${esc(name)}</b><small>${esc(me.user.email)}</small></span><button class="out" type="button" id="signOut" title="Sign out" aria-label="Sign out">${SIGN_OUT}</button>`;
  $("#signOut").addEventListener("click", async () => {
    await api.post("/auth/logout").catch(() => {});
    history.replaceState(null, "", "/app#signin");
    location.reload();
  });
}

async function signedIn() {
  // A password reset link always opens the reset form, even in a browser that is signed in.
  if (location.hash.startsWith("#reset=")) return showAuth();
  try {
    return await api.get("/auth/me");
  } catch (e) {
    if (e.status === 401) return showAuth();
    throw e;
  }
}

let dropped = false;

async function boot() {
  let me;
  try {
    me = await signedIn();
  } catch (e) {
    document.body.innerHTML = `<div class="empty"><b>Cannot reach the server</b>${esc(e.message)}</div>`;
    return;
  }
  setAccount(me);
  initChrome();
  try {
    await loadAll();
  } catch (e) {
    $("#view").innerHTML = `<div class="empty"><b>Cannot reach the server</b>${esc(e.message)}. Please try again in a minute.</div>`;
    return;
  }
  const h = location.hash.slice(1);
  if (canSee(h)) ui.route = h;
  else if (h) history.replaceState(null, "", location.pathname);
  render();

  subscribe(
    async (e) => {
      if (e.type === "changed") {
        await reload(e.resources);
        scheduleRender();
      } else if (e.type === "ai") {
        if (e.status) aiBusy[e.conversation_id] = e.status;
        else delete aiBusy[e.conversation_id];
        renderTyping();
      }
    },
    async (online) => {
      // After a dropped connection we may have missed events: refresh once.
      const reconnected = online && dropped;
      dropped = !online;
      meta.online = online;
      setStatus();
      if (reconnected) {
        await loadAll();
        scheduleRender();
      }
    },
  );
  meta.online = true; // until the event stream says otherwise
  setStatus();
}

boot();
