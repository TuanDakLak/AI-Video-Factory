import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { cookiesSecure, safeNextPath } from "@/lib/auth/config";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, finishGoogleSignIn, googleEnabled, readTransaction } from "@/lib/auth/google";
import { GoogleAlreadyLinkedError, LinkRequiredError, SignupClosedError, linkGoogleToUser, signInWithGoogle } from "@/lib/auth/users";
import { createSession } from "@/lib/auth/tokens";
import { getSessionUser, sessionMeta, setSessionCookies } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
};

export async function GET(req: NextRequest) {
  const tx = await readTransaction(req.cookies.get(OAUTH_COOKIE)?.value);
  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, req.url), 303);
    // single use: the transaction (state, nonce, PKCE verifier) is consumed whatever the outcome
    res.cookies.set(OAUTH_COOKIE, "", { httpOnly: true, secure: cookiesSecure(), sameSite: "lax", path: OAUTH_COOKIE_PATH, maxAge: 0 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  };
  const fail = (code: string) => go(tx?.linkUserId ? `/settings?google=${code}` : `/login?error=${code}`);

  if (!googleEnabled()) return fail("google_disabled");
  const state = req.nextUrl.searchParams.get("state") || "";
  const code = req.nextUrl.searchParams.get("code") || "";
  // state ties the callback to the browser that started the flow (login CSRF / account-linking CSRF)
  if (!tx || !state || !same(state, tx.state)) return go("/login?error=google_state");
  if (req.nextUrl.searchParams.get("error") || !code) return fail("google_cancelled");

  let profile;
  try {
    profile = await finishGoogleSignIn(code, tx);
  } catch (e: any) {
    console.warn("[auth] Google sign-in rejected:", e?.message);
    return fail("google_failed");
  }

  if (tx.linkUserId) {
    const user = await getSessionUser();
    if (!user || user.id !== tx.linkUserId) return go("/login?error=session_expired");
    try {
      await linkGoogleToUser(user.id, profile);
      return go("/settings?google=linked");
    } catch (e) {
      if (e instanceof GoogleAlreadyLinkedError) return go("/settings?google=taken");
      throw e;
    }
  }

  try {
    const user = await signInWithGoogle(profile);
    if (!user) return go("/login?error=account_disabled");
    const session = await createSession(user.id, sessionMeta(req));
    const res = go(user.created ? "/settings?google=welcome" : safeNextPath(tx.next));
    await setSessionCookies(res, { userId: user.id, role: user.role, ...session });
    return res;
  } catch (e) {
    if (e instanceof LinkRequiredError) return go("/login?error=link_required");
    if (e instanceof SignupClosedError) return go("/login?error=signup_closed");
    console.error("[auth] Google sign-in failed:", e);
    return go("/login?error=google_failed");
  }
}
