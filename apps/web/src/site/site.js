// Public pages (landing, Terms, Privacy): the phone menu, the contact
// address from the server, and a shortcut for people who are signed in.
import "./site.css";

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
      a.textContent = "Open VoroniX";
    });
    $$("[data-signin]").forEach((a) => (a.hidden = true));
  })
  .catch(() => {});
