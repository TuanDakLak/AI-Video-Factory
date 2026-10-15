/**
 * Auth settings shared by the Edge middleware and Node route handlers. Keep this file free of Node-only imports.
 *
 * Model (2026 best practice for first-party web apps):
 *  - short-lived access JWT (HS256, pinned alg/iss/aud) in an httpOnly cookie, verified on every request;
 *  - opaque refresh token, stored only as a SHA-256 hash, rotated on every use; all tokens of one login form a "family";
 *    replaying an already-rotated token revokes the whole family (refresh-token theft detection);
 *  - SameSite=Lax cookies + Origin check on state-changing requests (CSRF).
 */
export const AUTH_ISSUER = "ai-content-factory";
export const AUTH_AUDIENCE = "ai-content-factory-web";

export const ACCESS_TTL_SEC = 10 * 60; // access JWT lifetime = worst-case delay before a revocation is seen by the middleware
export const REFRESH_IDLE_SEC = 7 * 24 * 3600; // a refresh token not used for this long dies
export const FAMILY_MAX_SEC = 30 * 24 * 3600; // absolute session lifetime, whatever the activity
export const REUSE_GRACE_SEC = 15; // parallel requests may present the same token right after it was rotated

export function cookiesSecure(): boolean {
  return process.env.NODE_ENV === "production" || process.env.AUTH_COOKIE_SECURE === "true";
}

/** __Secure- prefix: browsers refuse the cookie unless it is Secure, so it can't be planted over plain http. */
export function accessCookieName(): string {
  return cookiesSecure() ? "__Secure-acf_at" : "acf_at";
}
export function refreshCookieName(): string {
  return cookiesSecure() ? "__Secure-acf_rt" : "acf_rt";
}
/** The refresh cookie is only ever sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = "/api/auth";

let cachedSecret: Uint8Array | null = null;
export function authSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const raw = process.env.AUTH_SECRET || "";
  if (raw.length < 32) {
    throw new Error("AUTH_SECRET is missing or shorter than 32 characters. Generate one with: openssl rand -base64 48");
  }
  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

export { safeNextPath } from "./redirect";
