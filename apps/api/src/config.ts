import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default("postgresql://crm:crm@localhost:5432/crm"),
  // Salon local time. Visit times in the database are stored in this zone.
  TZ: z.string().default("Asia/Almaty"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  // AI. Without a key the deterministic offline agent answers instead of Claude.
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_ENGINE: z.enum(["auto", "claude", "offline"]).default("auto"),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  AI_MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(20).default(8),

  // Channels
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  CHANNEL_WEBHOOK_SECRET: z.string().optional(),

  // Optional HTTP basic auth for the admin UI and API
  BASIC_AUTH_USER: z.string().optional(),
  BASIC_AUTH_PASSWORD: z.string().optional(),

  // Allows POST /api/admin/reset-demo. Off in production by default.
  ALLOW_DEMO_RESET: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  ALLOW_DEMO_RESET: parsed.data.ALLOW_DEMO_RESET ?? parsed.data.NODE_ENV !== "production",
};
process.env.TZ = config.TZ;

export type Config = typeof config;
