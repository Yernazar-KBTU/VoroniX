import type { RequestHandler } from "express";
import { config } from "../config.js";
import { HttpError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { can, type Permission } from "./rbac-policy.js";

export function requirePermission(...anyOf: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!config.AUTH_REQUIRED || !req.user) return next();
    if (anyOf.some((p) => can(req.user!.role, p))) return next();
    logger.warn({ user: req.user.id, role: req.user.role, needs: anyOf, method: req.method, path: req.path }, "access denied by role");
    next(new HttpError(403, "Your role is not allowed to do this.", "forbidden"));
  };
}
