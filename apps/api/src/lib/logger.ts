import { pino } from "pino";
import { config } from "../config.js";

export const logger = pino({
  level: config.NODE_ENV === "test" ? "silent" : config.LOG_LEVEL,
  // Never write sign-in cookies or channel secrets to the logs, even if a
  // serializer below is changed later.
  redact: { paths: ["req.headers.cookie", "req.headers.authorization", 'req.headers["x-channel-secret"]', 'res.headers["set-cookie"]'], censor: "[hidden]" },
  ...(config.NODE_ENV === "development" ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
});

/** Query parameters that carry secrets: the calendar feed token and the Google sign-in code and state. */
const SECRET_PARAMS = /([?&](?:token|code|state|secret)=)[^&#]*/gi;

interface LoggedReq {
  id?: unknown;
  method?: string;
  url?: string;
  remoteAddress?: string;
  headers?: Record<string, unknown>;
}

/**
 * What one request line in the log contains: no headers (they carry the
 * session cookie) and no secret query values. Used by pino-http in app.ts.
 */
export const httpLogSerializers = {
  req: (req: LoggedReq) => ({
    id: req.id,
    method: req.method,
    url: String(req.url ?? "").replace(SECRET_PARAMS, "$1[hidden]"),
    remoteAddress: req.remoteAddress,
    userAgent: req.headers?.["user-agent"],
  }),
  res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
};
