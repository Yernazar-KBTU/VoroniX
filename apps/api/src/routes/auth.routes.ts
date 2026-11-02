import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import * as auth from "../auth/auth.service.js";
import { getBusiness } from "../auth/auth.repo.js";

export const authRouter = Router();

const email = z.string().trim().max(254).email("enter a valid email");
const password = z.string().min(8, "use at least 8 characters").max(200);

const RegisterBody = z.object({
  business_name: z.string().trim().min(1, "enter your business name").max(80),
  full_name: z.string().trim().min(1, "enter your name").max(80),
  email,
  password,
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  timezone: z.string().max(64).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "unknown time zone").default("UTC"),
  currency: z.string().regex(/^[A-Z]{3}$/).default("USD"),
});
const LoginBody = z.object({ email, password: z.string().min(1).max(200), remember: z.boolean().default(true) });

const token = (cookie: string | undefined) => auth.readCookie(cookie, auth.COOKIE);

authRouter.post("/auth/register", async (req, res) => {
  const out = await auth.register(res, RegisterBody.parse(req.body), req.get("user-agent") ?? "");
  res.status(201).json(out);
});

authRouter.post("/auth/login", async (req, res) => {
  res.json(await auth.login(res, LoginBody.parse(req.body), req.ip ?? "", req.get("user-agent") ?? ""));
});

authRouter.post("/auth/logout", async (req, res) => {
  await auth.logout(res, token(req.headers.cookie));
  res.status(204).end();
});

authRouter.get("/auth/me", async (req, res) => {
  const user = await auth.currentUser(token(req.headers.cookie));
  if (!user) {
    res.status(401).json({ error: "unauthorized", message: "Please sign in." });
    return;
  }
  res.json({ user, business: await getBusiness(pool, user.business_id) });
});
