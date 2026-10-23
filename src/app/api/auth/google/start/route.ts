import { NextRequest, NextResponse } from "next/server";
import { cookiesSecure, safeNextPath } from "@/lib/auth/config";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, OAUTH_TTL_SEC, googleEnabled, startGoogleSignIn } from "@/lib/auth/google";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/start?next=/path            -> sign in / sign up with Google
 * GET /api/auth/google/start?mode=link              -> link Google to the signed-in account (Settings)
 */
export async function GET(req: NextRequest) {
  const login = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, req.url), 303);
  if (!googleEnabled()) return login("google_disabled");

  const link = req.nextUrl.searchParams.get("mode") === "link";
  let linkUserId: string | undefined;
  if (link) {
    const user = await getSessionUser();
    if (!user) return login("session_expired");
    linkUserId = user.id;
  }

  const next = link ? "/settings" : safeNextPath(req.nextUrl.searchParams.get("next"));
  const { url, cookie } = await startGoogleSignIn(next, linkUserId);
  const res = NextResponse.redirect(url, 302);
  // SameSite=Lax: Google brings the user back with a top-level GET, which Lax cookies accompany
  res.cookies.set(OAUTH_COOKIE, cookie, { httpOnly: true, secure: cookiesSecure(), sameSite: "lax", path: OAUTH_COOKIE_PATH, maxAge: OAUTH_TTL_SEC });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
