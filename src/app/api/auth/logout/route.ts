import { NextRequest, NextResponse } from "next/server";
import { accessCookieName, refreshCookieName } from "@/lib/auth/config";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { hashToken, revokeFamily } from "@/lib/auth/tokens";
import { clearSessionCookies, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Revokes this device's session (its whole refresh-token family). Works even when the access token already expired. */
export async function POST(req: NextRequest) {
  let familyId = (await verifyAccessToken(req.cookies.get(accessCookieName())?.value))?.sid ?? null;
  const raw = req.cookies.get(refreshCookieName())?.value;
  if (!familyId && raw && raw.length <= 200) {
    familyId = (await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) }, select: { familyId: true } }))?.familyId ?? null;
  }
  if (familyId) await revokeFamily(familyId, "logout");
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
}

/**
 * Where a page sends the browser when its session is no longer valid although the access token still verifies
 * (account deleted or disabled, "log out everywhere", stolen-token revocation). Clearing the cookies breaks the
 * /login <-> /dashboard redirect loop the still-valid token would cause. A live session is left untouched, so a
 * cross-site link to this URL can't log anyone out.
 */
export async function GET(req: NextRequest) {
  if (await getSessionUser()) return NextResponse.redirect(new URL("/dashboard", req.url), 303);
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  clearSessionCookies(res);
  return res;
}
