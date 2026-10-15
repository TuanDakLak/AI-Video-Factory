import { NextRequest, NextResponse } from "next/server";
import { refreshCookieName, safeNextPath } from "@/lib/auth/config";
import { rotateRefreshToken } from "@/lib/auth/tokens";
import { clearSessionCookies, sessionMeta, setSessionCookies } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

async function refresh(req: NextRequest) {
  return rotateRefreshToken(req.cookies.get(refreshCookieName())?.value, sessionMeta(req));
}

/** fetch() callers: 200 with fresh cookies, or 401. */
export async function POST(req: NextRequest) {
  const r = await refresh(req);
  if (!r.ok) {
    const res = NextResponse.json({ error: "Phiên đăng nhập đã hết hạn.", code: r.reason === "reuse_detected" ? "SESSION_REVOKED" : "UNAUTHENTICATED" }, { status: 401 });
    clearSessionCookies(res);
    return res;
  }
  const res = NextResponse.json({ ok: true });
  await setSessionCookies(res, { userId: r.userId, role: r.role, familyId: r.familyId, familyExpiresAt: r.familyExpiresAt, refreshToken: r.refreshToken });
  return res;
}

/**
 * Navigation / media requests whose access token expired are redirected here by the middleware (?next=<path>):
 * rotate, then go back. Only same-site relative targets are accepted.
 */
export async function GET(req: NextRequest) {
  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const r = await refresh(req);
  if (!r.ok) {
    const res = next.startsWith("/api/")
      ? NextResponse.json({ error: "Phiên đăng nhập đã hết hạn.", code: "UNAUTHENTICATED" }, { status: 401 })
      : NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, req.url), 303);
    clearSessionCookies(res);
    return res;
  }
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.headers.set("Cache-Control", "no-store");
  await setSessionCookies(res, { userId: r.userId, role: r.role, familyId: r.familyId, familyExpiresAt: r.familyExpiresAt, refreshToken: r.refreshToken });
  return res;
}
