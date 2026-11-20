import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import * as auth from "../auth/auth.service.js";
import { reportAction, type ActionReport } from "../lib/voronixai-events.js";

export const authRouter = Router();

const email = z.string().trim().max(254).email("enter a valid email");
const password = z.string().min(8, "use at least 8 characters").max(200);
const timezone = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "unknown time zone");
const currency = z.string().regex(/^[A-Z]{3}$/);

const RegisterBody = z.object({
  business_name: z.string().trim().min(1, "enter your business name").max(80),
  business_type: z.string().trim().max(60).optional(),
  full_name: z.string().trim().min(1, "enter your name").max(80),
  email,
  password,
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  timezone: timezone.default("UTC"),
  currency: currency.default("USD"),
});
const LoginBody = z.object({ email, password: z.string().min(1).max(200), remember: z.boolean().default(true) });
const ForgotBody = z.object({ email });
const ResetBody = z.object({ token: z.string().min(20).max(100), password });
const TokenBody = z.object({ token: z.string().min(20).max(100) });

const token = (cookie: string | undefined) => auth.readCookie(cookie, auth.COOKIE);

/** Runs a sign-in step and tells VoroniX.ai how it ended, for success and for failure. Never changes the result. */
async function reported<T>(action: string, who: ActionReport["actor"], business: string | null, run: () => Promise<T>, after?: (out: T) => Partial<ActionReport>): Promise<T> {
  const started = Date.now();
  try {
    const out = await run();
    reportAction({ action, status: 200, ms: Date.now() - started, actor: who, business, ...(after ? after(out) : {}) });
    return out;
  } catch (err) {
    const status = typeof (err as { status?: unknown }).status === "number" ? (err as { status: number }).status : 500;
    reportAction({ action: action === "auth.login" ? "auth.login_failed" : action, status, ms: Date.now() - started, actor: who, business });
    throw err;
  }
}

/** What the sign-in page may offer on this server. */
authRouter.get("/auth/config", (_req, res) => {
  res.json({ google: auth.googleEnabled(), support_email: config.SUPPORT_EMAIL ?? null });
});

authRouter.post("/auth/register", async (req, res) => {
  const body = RegisterBody.parse(req.body);
  await reported("auth.register_requested", { email: body.email, name: body.full_name }, body.business_name, () => auth.register(body, req.ip ?? ""));
  res.status(202).json({ ok: true });
});

authRouter.post("/auth/register/verify", async (req, res) => {
  const body = TokenBody.parse(req.body);
  const out = await reported("auth.account_created", {}, null, () => auth.verifySignup(res, body.token, req.get("user-agent") ?? ""), (o) => ({
    status: 201,
    actor: { email: o.user.email, name: o.user.full_name, role: o.user.role },
    business: o.business.name,
  }));
  res.status(201).json(out);
});

authRouter.post("/auth/login", async (req, res) => {
  const body = LoginBody.parse(req.body);
  res.json(
    await reported("auth.login", { email: body.email }, null, () => auth.login(res, body, req.ip ?? "", req.get("user-agent") ?? ""), (o) => ({
      actor: { email: o.user.email, name: o.user.full_name, role: o.user.role },
      business: o.business?.name ?? null,
    })),
  );
});

authRouter.post("/auth/logout", async (req, res) => {
  const who = await auth.currentSession(token(req.headers.cookie)).catch(() => null);
  await auth.logout(res, token(req.headers.cookie));
  reportAction({ action: "auth.logout", status: 204, actor: who ? { email: who.user.email, name: who.user.full_name, role: who.user.role } : {}, business: who?.business.name ?? null });
  res.status(204).end();
});

authRouter.get("/auth/me", async (req, res) => {
  const found = await auth.currentSession(token(req.headers.cookie));
  if (!found) {
    res.status(401).json({ error: "unauthorized", message: "Please sign in." });
    return;
  }
  res.json(found);
});

/** Always 202, whether or not the address has an account. */
authRouter.post("/auth/forgot", async (req, res) => {
  const { email: forgotEmail } = ForgotBody.parse(req.body);
  await auth.requestReset(forgotEmail, req.ip ?? "");
  reportAction({ action: "auth.password_reset_requested", status: 202, actor: { email: forgotEmail } });
  res.status(202).json({ ok: true });
});

authRouter.post("/auth/reset/check", async (req, res) => {
  res.json({ valid: await auth.resetLinkIsLive(TokenBody.parse(req.body).token) });
});

authRouter.post("/auth/reset", async (req, res) => {
  const body = ResetBody.parse(req.body);
  res.json(await auth.resetPassword(res, body.token, body.password, req.get("user-agent") ?? ""));
});

authRouter.get("/auth/google/start", (req, res) => {
  if (!auth.googleEnabled()) {
    res.redirect(302, "/app#signin?error=google_off");
    return;
  }
  const tz = typeof req.query.tz === "string" ? req.query.tz.slice(0, 64) : undefined;
  const cur = typeof req.query.currency === "string" ? req.query.currency.slice(0, 3) : undefined;
  res.redirect(302, auth.googleStart(res, { timezone: tz, currency: cur }));
});

authRouter.get("/auth/google/callback", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  res.redirect(302, await auth.googleCallback(res, q, req.headers.cookie, req.get("user-agent") ?? ""));
});
