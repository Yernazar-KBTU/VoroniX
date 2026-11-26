// Public pages (landing, Terms, Privacy): the phone menu, the contact
// address from the server, a shortcut for people who are signed in, and on the
// landing page the starfield and the scroll effects.
import "./site.css";
import { initPick } from "./pick.js";
import { initScene } from "./scene.js";
import { startSky } from "./sky.js";
import { initLanguageControl, languageControl, localize, t } from "../i18n.js";

// Content stays visible without scripts; the scroll fade-ins only switch on once this runs.
document.documentElement.classList.add("js");
const languageHost = document.querySelector(".nav-cta");
if (languageHost) {
  languageHost.insertAdjacentHTML("afterbegin", languageControl());
  initLanguageControl(languageHost);
}
localize(document);

// Landing page: the rocket-launch intro plays once per visit. It is dropped for repeat visits, anchors,
// reduced motion and the Skip button; the page itself is already complete underneath.
const root = document.documentElement;
if (root.classList.contains("has-intro")) {
  const end = () => root.classList.remove("has-intro");
  let seen = false;
  try { seen = sessionStorage.getItem("vx-intro") === "1"; } catch { /* storage blocked: play it */ }
  if (seen || matchMedia("(prefers-reduced-motion: reduce)").matches || location.hash.length > 1) end();
  else {
    try { sessionStorage.setItem("vx-intro", "1"); } catch { /* may play again next time */ }
    document.querySelector(".intro-skip")?.addEventListener("click", end);
    document.getElementById("intro")?.addEventListener("animationend", (e) => { if (e.animationName === "vxEnd") end(); });
    setTimeout(end, 7500);
  }
}

const $$ = (s) => document.querySelectorAll(s);

// Older links pointed at the CRM on "/" (/#inbox, /#signin, /#reset=...): it lives on /app now.
const h = location.hash.slice(1);
const CRM_HASH = /^(dashboard|inbox|pipeline|calendar|clients|services|staff|payments|knowledge|analytics|database|integrations|business|signin|signup|forgot)$/;
if (location.pathname === "/" && (CRM_HASH.test(h) || h.startsWith("reset=") || h.startsWith("signin?"))) location.replace(`/app${location.hash}`);

/* phone menu */
const nav = document.querySelector(".nav");
const toggle = document.querySelector(".nav-toggle");
function setMenu(open) {
  if (!nav || !toggle) return;
  nav.classList.toggle("open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}
toggle?.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
$$(".nav-links a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setMenu(false);
});

if (document.body.classList.contains("landing")) {
  startSky(document.getElementById("sky"));
  initScene();
  initPick();
}

$$("[data-year]").forEach((el) => (el.textContent = String(new Date().getFullYear())));

// Unfinished legal text is marked with .todo; the warning disappears once every mark is filled in.
const draft = document.querySelector("[data-draft]");
if (draft) draft.hidden = !document.querySelector(".todo");

/* the support address set on the server (SUPPORT_EMAIL); links stay hidden without one */
fetch("/api/auth/config")
  .then((r) => (r.ok ? r.json() : null))
  .then((cfg) => {
    const email = cfg?.support_email;
    if (!email) return;
    $$("[data-contact]").forEach((a) => {
      a.href = `mailto:${email}`;
      a.hidden = false;
      if (a.dataset.contact === "text") {
        a.textContent = email;
        a.classList.remove("todo");
      }
    });
    if (draft) draft.hidden = !document.querySelector(".todo");
  })
  .catch(() => {});

/* signed in already: the buttons open the workspace instead of the sign-up form */
fetch("/api/auth/me")
  .then((r) => {
    if (!r.ok) return;
    $$("[data-start]").forEach((a) => {
      a.href = "/app";
      (a.querySelector("[data-label]") ?? a).textContent = t("Open VoroniX");
    });
    $$("[data-signin]").forEach((a) => (a.hidden = true));
  })
  .catch(() => {});
