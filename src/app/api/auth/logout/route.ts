import { NextRequest, NextResponse } from "next/server";
import { accessCookieName, refreshCookieName } from "@/lib/auth/config";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { hashToken, revokeFamily } from "@/lib/auth/tokens";
import { clearSessionCookies } from "@/lib/auth/session";
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
