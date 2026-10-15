import { NextResponse } from "next/server";
import { clearSessionCookies, requireApiUser } from "@/lib/auth/session";
import { revokeAllSessions } from "@/lib/auth/tokens";

export const dynamic = "force-dynamic";

/** "Log out everywhere": revokes every session of the current user (e.g. after a suspected compromise). */
export async function POST() {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const revoked = await revokeAllSessions(user.id, "logout_all");
  const res = NextResponse.json({ ok: true, revoked });
  clearSessionCookies(res);
  return res;
}
