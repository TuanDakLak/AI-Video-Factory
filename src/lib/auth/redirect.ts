/**
 * Post-login / post-refresh redirect target. Shared by the server (refresh route) and the login form so both apply the
 * exact same rule. Prefix checks are not enough: the URL parser deletes tabs/newlines and treats "\" as "/", so
 * "/\t/evil.com" or "/\evil.com" would resolve to another host. The value is therefore resolved against our own
 * origin and accepted only if it stays on it.
 */
const PLACEHOLDER_ORIGIN = "http://same-origin.invalid";

export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || next.length > 2048) return fallback;
  // control characters and backslashes have no business in a path we generated ourselves
  if (/[\u0000-\u001f\u007f\\]/.test(next) || !next.startsWith("/")) return fallback;
  let url: URL;
  try {
    url = new URL(next, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
  const path = url.pathname + url.search + url.hash;
  if (path.startsWith("//") || path.startsWith("/api/auth/")) return fallback;
  return path;
}
