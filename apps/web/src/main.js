// Entry point: load everything once, then keep in sync with the server over SSE.

import "./styles.css";
import "./modals.js";
import { api, subscribe } from "./api.js";
import { showAuth } from "./auth.js";
import { logoMark } from "./logo.js";
import { PAGES } from "./pages/index.js";
import { aiBusy, loadAll, meta, reload, vals } from "./store.js";
import { initChrome, render, renderTyping, scheduleRender, ui } from "./ui.js";
import { $, esc } from "./util.js";

function setChips() {
  const mode = $("#modeChip");
  mode.textContent = meta.online ? "Live database · PostgreSQL" : "Reconnecting…";
  mode.classList.toggle("warn", !meta.online);
  const offline = meta.aiEngine !== "claude";
  $("#aiChip").title = offline ? "Claude API key not set: the built-in rule engine answers clients" : "Replies are written by Claude";
  $("#aiChip").lastChild.textContent = offline ? "AI administrator · offline rules" : "AI administrator · Claude";
}

function showEmptyBanner() {
  $("#banner").innerHTML = vals("services").length
    ? ""
    : `<div class="banner"><b>The database is empty.</b> Load the demo barbershop to try the CRM. <button class="btn sm create" data-act="resetDemo">Load demo data</button></div>`;
}

let dropped = false;

/** The signed-in person in the header, with sign out. */
function setAccount(me) {
  meta.user = me.user;
  meta.business = me.business;
  $(".brand .dot")?.replaceWith(Object.assign(document.createElement("span"), { innerHTML: logoMark(26) }).firstElementChild);
  const chip = document.createElement("button");
  chip.className = "chip account";
  chip.title = `${me.user.email} · ${me.business?.name ?? ""}`;
  chip.innerHTML = `<span class="avatar">${esc((me.user.full_name || me.user.email).trim().charAt(0).toUpperCase())}</span><span>${esc(me.user.full_name)}</span><span class="out">Sign out</span>`;
  chip.addEventListener("click", async () => {
    await api.post("/auth/logout").catch(() => {});
    location.reload();
  });
  $("#clock").after(chip);
}

async function signedIn() {
  try {
    return await api.get("/auth/me");
  } catch (e) {
    if (e.status === 401) return showAuth();
    throw e;
  }
}

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
  const h = location.hash.slice(1);
  if (PAGES[h]) ui.route = h;
  try {
    await loadAll();
  } catch (e) {
    $("#view").innerHTML = `<div class="empty"><b>Cannot reach the API</b>${esc(e.message)}. Start the server with <span class="code">npm run dev</span>.</div>`;
    return;
  }
  render();
  showEmptyBanner();

  subscribe(
    async (e) => {
      if (e.type === "changed") {
        await reload(e.resources);
        showEmptyBanner();
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
      if (!online) dropped = true;
      else dropped = false;
      meta.online = online;
      setChips();
      if (reconnected) {
        await loadAll();
        scheduleRender();
      }
    },
  );
  setChips();
}

boot();
