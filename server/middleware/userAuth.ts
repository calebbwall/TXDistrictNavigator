/**
 * Per-device user authentication.
 *
 * The mobile app does not have a traditional account/login system. Instead, on
 * first launch each device requests a fresh anonymous identity via
 * `POST /api/auth/device`. The server returns a userId (UUID) plus a signed
 * bearer token. The client stores both in expo-secure-store and attaches
 * `Authorization: Bearer <token>` to every subsequent API request.
 *
 * Tokens are HMAC-SHA256 signed: `<userId>.<hex(HMAC(userId, secret))>`. They
 * are stateless (no DB lookup), unforgeable without the server secret, and
 * stable across server restarts as long as the secret is stable.
 *
 * USER_TOKEN_SECRET should be set in production via Replit secrets. If absent,
 * a deterministic fallback is derived from DATABASE_URL so dev tokens survive
 * restarts; a loud warning is logged on startup.
 */
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

let cachedSecret: string | null = null;
function getSecret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.USER_TOKEN_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    cachedSecret = fromEnv;
    return fromEnv;
  }
  // Fail closed in production: a secret derived from DATABASE_URL is forgeable
  // by anyone who learns the connection string, so never allow it for a
  // production deploy. Dev/test may still derive a stable fallback.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[userAuth] USER_TOKEN_SECRET must be set in production. Refusing to start with a derived fallback secret.",
    );
  }
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl) {
    throw new Error(
      "[userAuth] USER_TOKEN_SECRET is not set and DATABASE_URL is empty; cannot derive a fallback token secret.",
    );
  }
  cachedSecret = crypto
    .createHash("sha256")
    .update(`user-token-fallback|${dbUrl}`)
    .digest("hex");
  console.warn(
    "[userAuth] USER_TOKEN_SECRET is not set. Derived a deterministic fallback from DATABASE_URL. " +
      "Set USER_TOKEN_SECRET to a long random value in production secrets.",
  );
  return cachedSecret;
}

function sign(userId: string): string {
  return crypto.createHmac("sha256", getSecret()).update(userId).digest("hex");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export function signUserToken(userId: string): string {
  if (!userId || typeof userId !== "string") {
    throw new Error("signUserToken: userId is required");
  }
  return `${userId}.${sign(userId)}`;
}

export function verifyUserToken(
  token: string | undefined | null,
): string | null {
  if (!token || typeof token !== "string") return null;
  if (token.length > 1024) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const userId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (userId.length > 255) return null;
  if (!/^[0-9a-f]+$/i.test(sig)) return null;
  const expected = sign(userId);
  if (!timingSafeEqualHex(sig, expected)) return null;
  return userId;
}

function extractBearer(req: Request): string | null {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const xToken = req.headers["x-user-token"];
  if (typeof xToken === "string" && xToken.trim()) return xToken.trim();
  return null;
}

/** Strict middleware — 401 if no valid bearer token. Sets req.userId. */
export function requireUser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = extractBearer(req);
  const userId = verifyUserToken(token);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.userId = userId;
  next();
}

/** Initialize the secret at startup so warnings appear up-front. */
export function initUserAuth(): void {
  getSecret();
}
