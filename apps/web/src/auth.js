// Sign-in and sign-up screen. Shown before the CRM loads when there is no
// session; resolves with { user, business } once the person is signed in.

import "./auth.css";
import { api } from "./api.js";
import { logo } from "./logo.js";
import { esc } from "./util.js";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "SGD", "HKD", "JPY", "KRW", "CNY", "TWD", "INR", "IDR", "THB", "PHP", "VND", "MYR", "AED"];

function guessTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
function guessCurrency(tz) {
  const map = { "America/": "USD", "Europe/London": "GBP", "Europe/": "EUR", "Asia/Singapore": "SGD", "Asia/Hong_Kong": "HKD", "Asia/Tokyo": "JPY", "Asia/Seoul": "KRW", "Asia/Shanghai": "CNY", "Asia/Taipei": "TWD", "Asia/Kolkata": "INR", "Asia/Calcutta": "INR", "Asia/Jakarta": "IDR", "Asia/Bangkok": "THB", "Asia/Manila": "PHP", "Asia/Ho_Chi_Minh": "VND", "Asia/Kuala_Lumpur": "MYR", "Asia/Dubai": "AED", "Australia/": "AUD" };
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

const GLASS = `<aside class="auth-glass" aria-label="Example conversation">
  <h3>While you were busy</h3>
  <p class="sub">A client wrote at 11:48 pm.</p>
  <div class="auth-chat">
    <div class="c">hi, can I get a fade tomorrow after 6?</div>
    <div class="a">Hi Sam! Tomorrow Alex is free at 6:30 pm or 7:00 pm. Which works?</div>
    <div class="c">6:30 👍</div>
    <div class="s">Booked · Alex · Tue 6:30 pm</div>
    <div class="a">Done! I'll remind you 2 hours before.</div>
  </div>
  <div class="auth-stats"><div><b>24/7</b><span>always answering</span></div><div><b>2 ×</b><span>reminders per visit</span></div></div>
</aside>`;

function signInForm() {
  return `<form class="auth-card" id="authForm" data-mode="login" novalidate>
  <h2>Welcome back</h2>
  <p class="sub">Sign in to your VoroniX workspace.</p>
  <div class="auth-err" id="authErr" role="alert"></div>
  <div class="auth-f"><label for="a_email">Work email</label><input id="a_email" type="email" autocomplete="email" placeholder="you@yourbusiness.com" required autofocus></div>
  <div class="auth-f"><label for="a_pw">Password</label><div class="auth-pw"><input id="a_pw" type="password" autocomplete="current-password" required><button type="button" data-pw>Show</button></div></div>
  <div class="auth-row"><label><input type="checkbox" id="a_remember" checked> Keep me signed in</label></div>
  <button class="auth-go" type="submit">Sign in</button>
  <p class="auth-switch">New to VoroniX? <a data-mode="register" href="#signup">Create an account</a></p>
</form>`;
}

function signUpForm() {
  const tz = guessTimezone();
  const cur = guessCurrency(tz);
  return `<form class="auth-card" id="authForm" data-mode="register" novalidate>
  <h2>Create your workspace</h2>
  <p class="sub">Set up your business in under a minute.</p>
  <div class="auth-err" id="authErr" role="alert"></div>
  <div class="auth-f"><label for="a_biz">Business name</label><input id="a_biz" autocomplete="organization" placeholder="e.g. Fade Studio" maxlength="80" required autofocus></div>
  <div class="auth-f"><label for="a_name">Your name</label><input id="a_name" autocomplete="name" maxlength="80" required></div>
  <div class="auth-f"><label for="a_email">Work email</label><input id="a_email" type="email" autocomplete="email" placeholder="you@yourbusiness.com" required></div>
  <div class="auth-f"><label for="a_pw">Password</label><div class="auth-pw"><input id="a_pw" type="password" autocomplete="new-password" minlength="8" required><button type="button" data-pw>Show</button></div>
    <div class="auth-meter"><i id="a_meter"></i></div><span class="auth-hint" id="a_pwhint">At least 8 characters.</span></div>
  <div class="auth-2">
    <div class="auth-f"><label for="a_tz">Time zone</label><select id="a_tz">${allTimezones(tz).map((z) => `<option ${z === tz ? "selected" : ""}>${esc(z)}</option>`).join("")}</select></div>
    <div class="auth-f"><label for="a_cur">Currency</label><select id="a_cur">${CURRENCIES.map((c) => `<option ${c === cur ? "selected" : ""}>${c}</option>`).join("")}</select></div>
  </div>
  <button class="auth-go" type="submit">Create account</button>
  <p class="auth-legal">By creating an account you agree to the Terms of Service and the Privacy Policy.</p>
  <p class="auth-switch">Already have an account? <a data-mode="login" href="#signin">Sign in</a></p>
</form>`;
}

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

export function showAuth(startMode = location.hash === "#signup" ? "register" : "login") {
  return new Promise((resolve) => {
    document.getElementById("app").hidden = true;
    const root = document.createElement("div");
    root.className = "auth";
    document.body.appendChild(root);
    document.title = "Sign in · VoroniX";

    const draw = (mode) => {
      root.innerHTML = `${ART}<header class="auth-top">${logo(38)}<a href="mailto:support@voronix.app">Help</a></header>
        <main class="auth-main">${HERO}<div class="auth-pair">${mode === "login" ? signInForm() : signUpForm()}${GLASS}</div></main>
        <footer class="auth-foot"><span>© ${new Date().getFullYear()} VoroniX</span></footer>`;
      root.querySelector("[autofocus]")?.focus();
    };
    draw(startMode);

    root.addEventListener("click", (e) => {
      const sw = e.target.closest("a[data-mode]");
      if (sw) {
        e.preventDefault();
        history.replaceState(null, "", sw.dataset.mode === "register" ? "#signup" : "#signin");
        draw(sw.dataset.mode);
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

    root.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
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

      const login = form.dataset.mode === "login";
      if (!login && !v("a_biz")) return fail("Enter your business name.", "a_biz");
      if (!login && !v("a_name")) return fail("Enter your name.", "a_name");
      if (!/^\S+@\S+\.\S+$/.test(v("a_email"))) return fail("Enter a valid email address.", "a_email");
      const pw = root.querySelector("#a_pw").value;
      if (!pw) return fail("Enter your password.", "a_pw");
      if (!login && pw.length < 8) return fail("Use at least 8 characters for the password.", "a_pw");

      const btn = form.querySelector(".auth-go");
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = login ? "Signing in…" : "Creating your workspace…";
      try {
        const out = login
          ? await api.post("/auth/login", { email: v("a_email"), password: pw, remember: root.querySelector("#a_remember").checked })
          : await api.post("/auth/register", { business_name: v("a_biz"), full_name: v("a_name"), email: v("a_email"), password: pw, timezone: v("a_tz"), currency: v("a_cur") });
        root.remove();
        document.getElementById("app").hidden = false;
        history.replaceState(null, "", location.pathname);
        resolve(out);
      } catch (ex) {
        btn.disabled = false;
        btn.textContent = label;
        fail(ex.status === 0 || !ex.status ? "Cannot reach the server. Check your connection and try again." : ex.message, ex.code === "email_taken" ? "a_email" : null);
      }
    });
  });
}
