import { NextRequest, NextResponse } from "next/server";
import { accessCookieName } from "@/lib/auth/config";
import { verifyAccessToken } from "@/lib/auth/jwt";

/**
 * First gate (Edge runtime, no database): CSRF origin check + access-token signature/expiry.
 * Route handlers and pages re-check the session against the database (getSessionUser), which is the real authority.
 */

const PUBLIC_PAGES = new Set(["/login", "/register"]);
// these endpoints authenticate on their own (login/refresh/logout must work without a valid access token;
// automation uses an API key for unattended callers)
const PUBLIC_API = ["/api/auth/login", "/api/auth/register", "/api/auth/refresh", "/api/auth/logout", "/api/automation/"];

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isCrossSite(req: NextRequest): boolean {
  if (!UNSAFE.has(req.method)) return false;
  if (req.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false; // non-browser clients (curl, schedulers): they carry no ambient cookies
  try {
    return new URL(origin).host !== (req.headers.get("x-forwarded-host") || req.headers.get("host"));
  } catch {
    return true;
  }
}

function securityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && isCrossSite(req)) {
    return NextResponse.json({ error: "Cross-site request blocked.", code: "CSRF" }, { status: 403 });
  }

  if (isApi && PUBLIC_API.some((p) => pathname === p || (p.endsWith("/") && pathname.startsWith(p)))) {
    return securityHeaders(NextResponse.next());
  }

  const claims = await verifyAccessToken(req.cookies.get(accessCookieName())?.value);

  if (PUBLIC_PAGES.has(pathname)) {
    // already signed in: no reason to show the login form
    return claims ? NextResponse.redirect(new URL("/dashboard", req.url)) : securityHeaders(NextResponse.next());
  }

  if (claims) return securityHeaders(NextResponse.next());

  // No valid access token. Navigations and GETs (pages, <video src>, fetch GET) go through the refresh endpoint,
  // which rotates the refresh cookie and comes back (or ends on /login). Mutations get a 401 the client retries after refreshing.
  if (req.method === "GET" || req.method === "HEAD") {
    const target = new URL("/api/auth/refresh", req.url);
    target.searchParams.set("next", pathname + search);
    return NextResponse.redirect(target, 307);
  }
  return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn.", code: "TOKEN_EXPIRED" }, { status: 401 });
}

export const config = {
  // everything except Next internals (there is no public/ folder: no extension-based exclusions that could expose an API path)
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
