"use client";

import { useEffect } from "react";

/**
 * Same-origin API calls that fail with 401 because the 10-minute access token expired are retried once after a
 * single shared refresh (rotation must not run in parallel). If the session is gone, go to the login page.
 * GET navigations / <video src> are refreshed by the middleware redirect instead.
 */
export function AuthFetchGuard() {
  useEffect(() => {
    const w = window as typeof window & { __authFetchPatched?: boolean };
    if (w.__authFetchPatched) return;
    w.__authFetchPatched = true;

    const original = window.fetch.bind(window);
    let refreshing: Promise<boolean> | null = null;
    const refreshOnce = () => {
      refreshing ??= original("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
        .then((r) => r.ok)
        .catch(() => false)
        .finally(() => setTimeout(() => (refreshing = null), 0));
      return refreshing;
    };

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      const eligible = url.origin === window.location.origin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/");
      const retryInput = eligible && input instanceof Request ? input.clone() : input; // a Request body can only be read once
      const res = await original(input, init);
      if (!eligible || res.status !== 401) return res;
      if (await refreshOnce()) return original(retryInput, init);
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return res;
    };
  }, []);
  return null;
}
