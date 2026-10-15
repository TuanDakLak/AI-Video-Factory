import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  ACCESS_TTL_SEC,
  REFRESH_COOKIE_PATH,
  accessCookieName,
  cookiesSecure,
  refreshCookieName,
} from "./config";
import { signAccessToken, verifyAccessToken } from "./jwt";
import { isSessionActive } from "./tokens";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  sessionId: string;
}

/**
 * The signed-in user of this request, or null. Unlike the middleware (signature only), this also checks the database:
 * the user still exists and is enabled, and the session (refresh-token family) was not revoked — so logout,
 * "log out everywhere" and theft detection take effect immediately for every handler. Memoised per request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const claims = await verifyAccessToken(jar.get(accessCookieName())?.value);
  if (!claims) return null;
  const [user, active] = await Promise.all([
    prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true, email: true, name: true, role: true, disabled: true } }),
    isSessionActive(claims.sid),
  ]);
  if (!user || user.disabled || !active) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role, sessionId: claims.sid };
});

/** Server components / pages: the user, or a redirect to the login page. */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export function unauthorized(message = "Bạn cần đăng nhập.") {
  return NextResponse.json({ error: message, code: "UNAUTHENTICATED" }, { status: 401 });
}

/** Not found rather than forbidden: never reveal that another user's resource exists. */
export function notFound(message = "Không tìm thấy.") {
  return NextResponse.json({ error: message }, { status: 404 });
}

/** Route handlers: `const user = await requireApiUser(); if (user instanceof NextResponse) return user;` */
export async function requireApiUser(): Promise<SessionUser | NextResponse> {
  return (await getSessionUser()) ?? unauthorized();
}

export async function setSessionCookies(
  res: NextResponse,
  input: { userId: string; role: "USER" | "ADMIN"; familyId: string; familyExpiresAt: Date; refreshToken?: string }
): Promise<void> {
  const access = await signAccessToken({ sub: input.userId, role: input.role, sid: input.familyId });
  const secure = cookiesSecure();
  res.cookies.set(accessCookieName(), access, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: ACCESS_TTL_SEC });
  if (input.refreshToken) {
    const maxAge = Math.max(0, Math.floor((input.familyExpiresAt.getTime() - Date.now()) / 1000));
    res.cookies.set(refreshCookieName(), input.refreshToken, { httpOnly: true, secure, sameSite: "lax", path: REFRESH_COOKIE_PATH, maxAge });
  }
}

export function clearSessionCookies(res: NextResponse): void {
  const secure = cookiesSecure();
  res.cookies.set(accessCookieName(), "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  res.cookies.set(refreshCookieName(), "", { httpOnly: true, secure, sameSite: "lax", path: REFRESH_COOKIE_PATH, maxAge: 0 });
}

/** Client IP for rate limiting / audit. Only trusts proxy headers when TRUST_PROXY=true. */
export function clientIp(req: NextRequest): string {
  // without a trusted reverse proxy these headers are client-controlled, so they are ignored (rate limits then rely on the email key)
  if (process.env.TRUST_PROXY === "true") {
    const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
    if (fwd) return fwd.slice(0, 64);
  }
  return "direct";
}

export function sessionMeta(req: NextRequest) {
  return { userAgent: req.headers.get("user-agent"), ip: clientIp(req) };
}
