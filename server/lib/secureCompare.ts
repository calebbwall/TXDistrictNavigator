import crypto from "crypto";

/**
 * Constant-time comparison of a client-supplied secret against the expected
 * value. Accepts raw header values (Express types them as
 * string | string[] | undefined). Hashing both sides first normalizes length
 * so timingSafeEqual can be used without leaking length information.
 */
export function secureCompare(
  provided: string | string[] | undefined,
  expected: string,
): boolean {
  if (typeof provided !== "string" || provided.length === 0) return false;
  if (expected.length === 0) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
