// Sign-in, sign-up, "forgot password" and "set a new password" screens.
// Shown before the CRM loads when there is no session; resolves with
// { user, business } once the person is signed in.

import "./auth.css";
import { api } from "./api.js";
import { logo } from "./logo.js";
import { esc } from "./util.js";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "SGD", "HKD", "JPY", "KRW", "CNY", "TWD", "INR", "IDR", "THB", "PHP", "VND", "MYR", "AED", "KZT"];
const TYPES = ["Barbershop", "Beauty salon", "Nail studio", "Spa and massage", "Clinic or dental office", "Fitness or yoga studio", "Tutoring or classes", "Other appointment business"];
const ERRORS = {
  google_failed: "Google sign-in did not finish. Please try again.",
  google_cancelled: "Google sign-in was cancelled.",
  google_unverified: "This Google account has no verified email address.",
  google_off: "Google sign-in is not available yet. Use your email instead.",
};

function guessTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
function guessCurrency(tz) {
  const map = { "America/": "USD", "Europe/London": "GBP", "Europe/": "EUR", "Asia/Singapore": "SGD", "Asia/Hong_Kong": "HKD", "Asia/Tokyo": "JPY", "Asia/Seoul": "KRW", "Asia/Shanghai": "CNY", "Asia/Taipei": "TWD", "Asia/Kolkata": "INR", "Asia/Calcutta": "INR", "Asia/Jakarta": "IDR", "Asia/Bangkok": "THB", "Asia/Manila": "PHP", "Asia/Ho_Chi_Minh": "VND", "Asia/Kuala_Lumpur": "MYR", "Asia/Dubai": "AED", "Asia/Almaty": "KZT", "Australia/": "AUD", "Pacific/Auckland": "NZD" };
  const hit = Object.keys(map).find((k) => tz.startsWith(k));
  return hit ? map[hit] : "USD";
}
function allTimezones(current) {
  let list = [];
  try {
    list = Intl.supportedValuesOf("timeZone");
  } catch {
    /* older browser */
  }
  if (!list.includes(current)) list.unshift(current);
  return list;
}

const ART = `<div class="auth-art" aria-hidden="true"><svg viewBox="0 0 1440 600" preserveAspectRatio="none">
  <path d="M0 420 C 240 340, 420 520, 720 430 S 1200 300, 1440 380" fill="none" stroke="#8f84ff" stroke-width="1.5" opacity=".7"/>
  <path d="M0 470 C 260 390, 460 560, 760 470 S 1220 350, 1440 430" fill="none" stroke="#5fd6f0" stroke-width="1.2" opacity=".55"/>
  <path d="M0 520 C 280 450, 500 600, 800 520 S 1240 410, 1440 480" fill="none" stroke="#ffffff" stroke-width="1" opacity=".25"/>
</svg></div>`;

const HERO = `<section class="auth-hero">
  <h1>Your <span>AI front desk</span>, open around the clock.</h1>
  <p>VoroniX answers your clients in messengers, books visits into your calendar and reminds them before they come. You keep working.</p>
  <ul class="auth-points">
    <li><i>💬</i>Replies only from your own prices, staff and rules</li>
    <li><i>📅</i>Books into the real schedule, no double bookings</li>
    <li><i>🔔</i>Reminds clients 24 hours and 2 hours before</li>
  </ul>
</section>`;

/** Example chats for the glass panel, one per kind of business. */
const STORIES = [
  { at: "11:48 pm", msgs: [["c", "hi, can I get a fade tomorrow after 6?"], ["a", "Hi Sam! Tomorrow Alex is free at 6:30 pm or 7:00 pm. Which works?"], ["c", "6:30 👍"], ["s", "Booked · Alex · Tue 6:30 pm"], ["a", "Done! I'll remind you 2 hours before."]] },
  { at: "7:02 am", msgs: [["c", "Hello, anything for a teeth cleaning on Friday morning?"], ["a", "Hi Priya! Dr. Lee can see you Friday at 9:00 or 10:30 am."], ["c", "10:30 please"], ["s", "Booked · Dr. Lee · Fri 10:30 am"], ["a", "All set. You'll get a reminder the day before."]] },
  { at: "10:15 pm", msgs: [["c", "can I book gel nails sat afternoon?"], ["a", "Hi Mia! Saturday: 2:00 pm with Jenny or 3:30 pm with Kate."], ["c", "2pm with Jenny"], ["s", "Booked · Jenny · Sat 2:00 pm"], ["a", "Done! See you Saturday ✨"]] },
];
const story = (i) => {
  const s = STORIES[i % STORIES.length];
  return `<p class="sub">A client wrote at ${s.at}.</p><div class="auth-chat">${s.msgs.map(([k, t]) => `<div class="${k}">${esc(t)}</div>`).join("")}</div>`;
};
const GLASS = `<aside class="auth-glass" aria-label="Example conversation">
  <h3>While you were busy</h3>
  <div id="authStory">${story(0)}</div>
  <div class="auth-stats"><div><b>24/7</b><span>always answering</span></div><div><b>2 ×</b><span>reminders per visit</span></div></div>
</aside>`;

const GOOGLE_G = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

function googleBlock(cfg) {
  if (!cfg.google) return "";
  return `<button type="button" class="auth-google" data-google>${GOOGLE_G}<span>Continue with Google</span></button><div class="auth-or"><span>or</span></div>`;
}

const pwField = (id, label, auto, hint) => `<div class="auth-f"><label for="${id}">${label}</label><div class="auth-pw"><input id="${id}" type="password" autocomplete="${auto}" ${auto === "new-password" ? 'minlength="8"' : ""} required><button type="button" data-pw>Show</button></div>${hint ? `<div class="auth-meter"><i id="a_meter"></i></div><span class="auth-hint" id="a_pwhint">At least 8 characters.</span>` : ""}</div>`;

const FORMS = {
  login: (cfg) => `<form class="auth-card" id="authForm" data-mode="login" novalidate>
  <h2>Welcome back</h2>
  <p class="sub">Sign in to your VoroniX workspace.</p>
  <div class="auth-err" id="authErr" role="alert"></div>
  ${googleBlock(cfg)}
  <div class="auth-f"><label for="a_email">Work email</label><input id="a_email" type="email" autocomplete="email" placeholder="you@yourbusiness.com" required autofocus></div>
  ${pwField("a_pw", "Password", "current-password")}
  <div class="auth-row"><label><input type="checkbox" id="a_remember" checked> Keep me signed in</label><a data-mode="forgot" href="#forgot">Forgot password?</a></div>
  <button class="auth-go" type="submit">Sign in</button>
  <p class="auth-switch">New to VoroniX? <a data-mode="register" href="#signup">Create an account</a></p>
</form>`,

  register: (cfg) => {
    const tz = guessTimezone();
    const cur = guessCurrency(tz);
    return `<form class="auth-card" id="authForm" data-mode="register" novalidate>
  <h2>Create your workspace</h2>
  <p class="sub">Set up your business in under a minute.</p>
  <div class="auth-err" id="authErr" role="alert"></div>
  ${googleBlock(cfg)}
  <div class="auth-f"><label for="a_biz">Business name</label><input id="a_biz" autocomplete="organization" placeholder="e.g. Glow Nails" maxlength="80" required autofocus></div>
  <div class="auth-f"><label for="a_type">Type of business</label><select id="a_type">${TYPES.map((t) => `<option>${esc(t)}</option>`).join("")}</select></div>
  <div class="auth-f"><label for="a_name">Your name</label><input id="a_name" autocomplete="name" maxlength="80" required></div>
  <div class="auth-f"><label for="a_email">Work email</label><input id="a_email" type="email" autocomplete="email" placeholder="you@yourbusiness.com" required></div>
  ${pwField("a_pw", "Password", "new-password", true)}
  <div class="auth-2">
    <div class="auth-f"><label for="a_tz">Time zone</label><select id="a_tz">${allTimezones(tz).map((z) => `<option ${z === tz ? "selected" : ""}>${esc(z)}</option>`).join("")}</select></div>
    <div class="auth-f"><label for="a_cur">Currency</label><select id="a_cur">${CURRENCIES.map((c) => `<option ${c === cur ? "selected" : ""}>${c}</option>`).join("")}</select></div>
  </div>
  <button class="auth-go" type="submit">Create account</button>
  <p class="auth-legal">By creating an account you agree to the <a href="/terms" target="_blank" rel="noopener">Terms of Service</a> and the <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</p>
  <p class="auth-switch">Already have an account? <a data-mode="login" href="#signin">Sign in</a></p>
</form>`;
  },

  forgot: () => `<form class="auth-card" id="authForm" data-mode="forgot" novalidate>
  <h2>Reset your password</h2>
  <p class="sub">Enter the email you signed up with. We will send you a link to set a new password.</p>
  <div class="auth-err" id="authErr" role="alert"></div>
  <div class="auth-f"><label for="a_email">Work email</label><input id="a_email" type="email" autocomplete="email" placeholder="you@yourbusiness.com" required autofocus></div>
  <button class="auth-go" type="submit">Send reset link</button>
  <p class="auth-switch"><a data-mode="login" href="#signin">Back to sign in</a></p>
</form>`,

  sent: (_cfg, email) => `<div class="auth-card" id="authForm">
  <div class="auth-badge" aria-hidden="true">✉️</div>
  <h2>Check your inbox</h2>
  <p class="sub">If an account exists for <b>${esc(email)}</b>, we sent a link to set a new password. It works once, for one hour. Check the spam folder if it does not arrive in a few minutes.</p>
  <button class="auth-go" type="button" data-mode-btn="login">Back to sign in</button>
</div>`,

  reset: () => `<form class="auth-card" id="authForm" data-mode="reset" novalidate>
  <h2>Set a new password</h2>
  <p class="sub">Choose a password you do not use anywhere else. Other devices will be signed out.</p>
  <div class="auth-err" id="authErr" role="alert"></div>
  ${pwField("a_pw", "New password", "new-password", true)}
  ${pwField("a_pw2", "Repeat the password", "new-password")}
  <button class="auth-go" type="submit">Save and sign in</button>
</form>`,

  expired: () => `<div class="auth-card" id="authForm">
  <div class="auth-badge" aria-hidden="true">⏳</div>
  <h2>This link has expired</h2>
  <p class="sub">Reset links work once and for one hour. Ask for a new one and use the newest email.</p>
  <button class="auth-go" type="button" data-mode-btn="forgot">Send a new link</button>
  <p class="auth-switch"><a data-mode="login" href="#signin">Back to sign in</a></p>
</div>`,
};

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

/** Reads where the person wanted to go from the address: #signup, #forgot, #reset=TOKEN, #signin?error=... */
function fromHash() {
  const h = location.hash.slice(1);
  if (h.startsWith("reset=")) return { mode: "reset", token: h.slice(6) };
  if (h === "signup") return { mode: "register" };
  if (h === "forgot") return { mode: "forgot" };
  const err = /error=(\w+)/.exec(h)?.[1];
  return { mode: "login", error: err ? (ERRORS[err] ?? "Sign-in did not finish. Please try again.") : null };
}

const HASH = { login: "#signin", register: "#signup", forgot: "#forgot" };

export function showAuth() {
  return new Promise((resolve) => {
    document.getElementById("app").hidden = true;
    const root = document.createElement("div");
    root.className = "auth";
    document.body.appendChild(root);
    document.title = "Sign in · VoroniX";

    let cfg = { google: false, support_email: null };
    const start = fromHash();
    let token = start.token ?? null;
    let storyIdx = 0;

    const draw = (mode, extra) => {
      const help = cfg.support_email ? `<a href="mailto:${esc(cfg.support_email)}">Help</a>` : "";
      root.innerHTML = `${ART}<header class="auth-top"><a href="/" class="auth-home" aria-label="VoroniX home">${logo(38)}</a>${help}</header>
        <main class="auth-main">${HERO}<div class="auth-pair">${FORMS[mode](cfg, extra)}${GLASS}</div></main>
        <footer class="auth-foot"><span>© ${new Date().getFullYear()} VoroniX</span><a href="/terms">Terms</a><a href="/privacy">Privacy</a>${help}</footer>`;
      root.querySelector("[autofocus]")?.focus();
      storyIdx = 0;
    };
    const switchTo = (mode) => {
      if (HASH[mode]) history.replaceState(null, "", HASH[mode]);
      draw(mode);
    };
    const showError = (msg) => {
      const err = root.querySelector("#authErr");
      if (!err) return;
      err.textContent = msg;
      err.classList.add("on");
    };

    // Draw at once, then add what the server offers (Google, help address) when it answers.
    draw(start.mode === "reset" ? "reset" : start.mode);
    if (start.error) showError(start.error);
    api
      .get("/auth/config")
      .then((c) => {
        cfg = c;
        const typed = Object.fromEntries([...root.querySelectorAll("input[id],select[id]")].map((el) => [el.id, el.type === "checkbox" ? el.checked : el.value]));
        const mode = root.querySelector("#authForm")?.dataset.mode;
        if (!mode) return;
        draw(mode);
        for (const [id, v] of Object.entries(typed)) {
          const el = root.querySelector(`#${id}`);
          if (el) el.type === "checkbox" ? (el.checked = v) : (el.value = v);
        }
        if (start.error) showError(start.error);
      })
      .catch(() => {});
    if (start.mode === "reset")
      api
        .post("/auth/reset/check", { token })
        .then((r) => !r.valid && draw("expired"))
        .catch(() => {});

    const timer = setInterval(() => {
      const el = root.querySelector("#authStory");
      if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      el.innerHTML = story(++storyIdx);
    }, 9000);

    root.addEventListener("click", (e) => {
      const sw = e.target.closest("a[data-mode],[data-mode-btn]");
      if (sw) {
        e.preventDefault();
        switchTo(sw.dataset.mode || sw.dataset.modeBtn);
        return;
      }
      if (e.target.closest("[data-google]")) {
        const tz = root.querySelector("#a_tz")?.value || guessTimezone();
        const currency = root.querySelector("#a_cur")?.value || guessCurrency(tz);
        location.href = `/api/auth/google/start?${new URLSearchParams({ tz, currency })}`;
        return;
      }
      const eye = e.target.closest("[data-pw]");
      if (eye) {
        const input = eye.previousElementSibling;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        eye.textContent = show ? "Hide" : "Show";
      }
    });

    root.addEventListener("input", (e) => {
      if (e.target.id === "a_pw" && root.querySelector("#a_meter")) {
        const s = strength(e.target.value);
        const bar = root.querySelector("#a_meter");
        bar.style.width = `${(s / 5) * 100}%`;
        bar.style.background = s <= 1 ? "#e5484d" : s <= 3 ? "#f5a524" : "#30a46c";
        root.querySelector("#a_pwhint").textContent = e.target.value.length < 8 ? "At least 8 characters." : s <= 2 ? "Okay. Longer is stronger." : "Strong password.";
      }
      e.target.removeAttribute("aria-invalid");
    });

    const done = (out) => {
      clearInterval(timer);
      root.remove();
      document.getElementById("app").hidden = false;
      history.replaceState(null, "", location.pathname);
      resolve(out);
    };

    root.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const mode = form.dataset.mode;
      const v = (id) => (root.querySelector(`#${id}`)?.value ?? "").trim();
      const err = root.querySelector("#authErr");
      const fail = (msg, field) => {
        err.textContent = msg;
        err.classList.add("on");
        if (field) {
          const el = root.querySelector(`#${field}`);
          el?.setAttribute("aria-invalid", "true");
          el?.focus();
        }
      };
      err.classList.remove("on");

      if (mode === "register" && !v("a_biz")) return fail("Enter your business name.", "a_biz");
      if (mode === "register" && !v("a_name")) return fail("Enter your name.", "a_name");
      if (mode !== "reset" && !/^\S+@\S+\.\S+$/.test(v("a_email"))) return fail("Enter a valid email address.", "a_email");
      const pw = root.querySelector("#a_pw")?.value ?? "";
      if (mode === "login" && !pw) return fail("Enter your password.", "a_pw");
      if ((mode === "register" || mode === "reset") && pw.length < 8) return fail("Use at least 8 characters for the password.", "a_pw");
      if (mode === "reset" && pw !== root.querySelector("#a_pw2").value) return fail("The two passwords are different.", "a_pw2");

      const btn = form.querySelector(".auth-go");
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = { login: "Signing in…", register: "Creating your workspace…", forgot: "Sending…", reset: "Saving…" }[mode];
      try {
        if (mode === "login") done(await api.post("/auth/login", { email: v("a_email"), password: pw, remember: root.querySelector("#a_remember").checked }));
        else if (mode === "register")
          done(await api.post("/auth/register", { business_name: v("a_biz"), business_type: v("a_type"), full_name: v("a_name"), email: v("a_email"), password: pw, timezone: v("a_tz"), currency: v("a_cur") }));
        else if (mode === "forgot") {
          await api.post("/auth/forgot", { email: v("a_email") });
          history.replaceState(null, "", "#signin");
          draw("sent", v("a_email"));
        } else {
          await api.post("/auth/reset", { token, password: pw });
          token = null;
          done(await api.get("/auth/me"));
        }
      } catch (ex) {
        btn.disabled = false;
        btn.textContent = label;
        if (ex.code === "reset_link_invalid") return draw("expired");
        fail(ex.status === 0 || !ex.status ? "Cannot reach the server. Check your connection and try again." : ex.message, ex.code === "email_taken" ? "a_email" : null);
      }
    });
  });
}
