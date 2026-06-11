/**
 * Device-anonymous authentication.
 *
 * POST /api/auth/device                — issue a fresh userId + signed token
 * POST /api/admin/issue-token          — admin-only: issue a token for any
 *                                         userId (e.g. legacy "default") so
 *                                         data created prior to this auth
 *                                         system can be reclaimed by a device
 */
import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { signUserToken } from "../middleware/userAuth";
import { secureCompare } from "../lib/secureCompare";

function requireAdminSecret(req: Request, res: Response): boolean {
  const secret = process.env.ADMIN_CRON_SECRET;
  if (!secret) {
    res.status(503).json({
      error: "Admin endpoint disabled: ADMIN_CRON_SECRET not configured",
    });
    return false;
  }
  const provided =
    (req.headers["x-admin-secret"] as string | undefined) ??
    (req.headers["authorization"] as string | undefined)?.replace(
      /^Bearer\s+/i,
      "",
    );
  if (!secureCompare(provided, secret)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function registerAuthRoutes(app: Express): void {
  /**
   * POST /api/auth/device
   * No body required. Returns a fresh anonymous userId and bearer token.
   * The client should store both in secure storage and reuse for all future
   * requests. Calling this again issues a NEW identity (existing data tied to
   * the previous identity becomes inaccessible from this device).
   */
  app.post("/api/auth/device", (_req: Request, res: Response) => {
    try {
      const userId = crypto.randomUUID();
      const token = signUserToken(userId);
      res.status(201).json({ userId, token });
    } catch (err) {
      console.error("[api/auth/device] Error:", err);
      res.status(500).json({ error: "Failed to issue device credentials" });
    }
  });

  /**
   * POST /api/admin/issue-token
   * Body: { userId: string }
   * Returns a signed token for the given userId. Useful for migrating a
   * device onto pre-existing data such as legacy `userId: "default"` rows.
   * Requires ADMIN_CRON_SECRET.
   */
  app.post("/api/admin/issue-token", (req: Request, res: Response) => {
    if (!requireAdminSecret(req, res)) return;
    const { userId } = (req.body ?? {}) as { userId?: string };
    if (!userId || typeof userId !== "string" || userId.length > 255) {
      res
        .status(400)
        .json({ error: "userId (string, <=255 chars) is required" });
      return;
    }
    try {
      const token = signUserToken(userId);
      res.json({ userId, token });
    } catch (err) {
      console.error("[api/admin/issue-token] Error:", err);
      res.status(500).json({ error: "Failed to issue token" });
    }
  });
}
