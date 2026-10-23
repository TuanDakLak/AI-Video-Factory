import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { authSecret, cookiesSecure } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { encryptSecret } from "./crypto";
import { exchangeTikTokCode, tiktokAuthorizeUrl, tiktokEnabled, tiktokUserInfo, TIKTOK_SCOPES } from "./tiktok";
import { exchangeFacebookCode, facebookAuthorizeUrl, facebookEnabled, facebookPages, FACEBOOK_SCOPES } from "./facebook";

/**
 * "Connect TikTok / Facebook" for the signed-in user. The OAuth `state` is random, bound to the user and the platform,
 * and kept in a short-lived signed cookie, so a callback can't be replayed into another session (login/linking CSRF).
 */
export type SocialPlatform = "tiktok" | "facebook";
const COOKIE = "acf_social";
const PATH = "/api/social";

export function platformEnabled(p: SocialPlatform): boolean {
  return p === "tiktok" ? tiktokEnabled() : facebookEnabled();
}

export async function startConnect(platform: SocialPlatform, userId: string): Promise<NextResponse> {
  const state = randomBytes(32).toString("base64url");
  const cookie = await new SignJWT({ state, userId, platform }).setProtectedHeader({ alg: "HS256" }).setAudience("social-connect").setExpirationTime("10m").sign(authSecret());
  const res = NextResponse.redirect(platform === "tiktok" ? tiktokAuthorizeUrl(state) : facebookAuthorizeUrl(state), 302);
  res.cookies.set(COOKIE, cookie, { httpOnly: true, secure: cookiesSecure(), sameSite: "lax", path: PATH, maxAge: 600 });
  return res;
}

async function readState(req: NextRequest): Promise<{ state: string; userId: string; platform: string } | null> {
  const raw = req.cookies.get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, authSecret(), { algorithms: ["HS256"], audience: "social-connect" });
    return payload as any;
  } catch {
    return null;
  }
}

/** Finishes the OAuth flow and stores the account(s); always redirects to Settings with a result code. */
export async function finishConnect(platform: SocialPlatform, req: NextRequest, userId: string): Promise<NextResponse> {
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/settings?social=${result}`, req.url), 303);
    res.cookies.set(COOKIE, "", { httpOnly: true, secure: cookiesSecure(), sameSite: "lax", path: PATH, maxAge: 0 });
    return res;
  };
  const st = await readState(req);
  const q = req.nextUrl.searchParams;
  if (!st || st.platform !== platform || st.userId !== userId || q.get("state") !== st.state) return back("state");
  if (q.get("error") || !q.get("code")) return back("cancelled");
  try {
    if (platform === "tiktok") {
      const t = await exchangeTikTokCode(q.get("code")!);
      if (!t.scope.split(",").includes("video.publish")) return back("scope");
      const me = await tiktokUserInfo(t.accessToken);
      const data = {
        displayName: me.displayName,
        accessToken: encryptSecret(t.accessToken),
        refreshToken: encryptSecret(t.refreshToken),
        tokenExpiresAt: t.expiresAt,
        refreshExpiresAt: t.refreshExpiresAt,
        scopes: t.scope || TIKTOK_SCOPES,
        status: "CONNECTED",
        lastError: null,
      };
      await prisma.socialAccount.upsert({
        where: { ownerId_platform_externalId: { ownerId: userId, platform: "TIKTOK", externalId: me.openId } },
        create: { ownerId: userId, platform: "TIKTOK", externalId: me.openId, ...data },
        update: data,
      });
      return back("connected");
    }
    const userToken = await exchangeFacebookCode(q.get("code")!);
    const pages = await facebookPages(userToken);
    if (pages.length === 0) return back("no_pages");
    for (const p of pages) {
      const data = { displayName: p.name, accessToken: encryptSecret(p.accessToken), scopes: FACEBOOK_SCOPES, status: "CONNECTED", lastError: null };
      await prisma.socialAccount.upsert({
        where: { ownerId_platform_externalId: { ownerId: userId, platform: "FACEBOOK_PAGE", externalId: p.id } },
        create: { ownerId: userId, platform: "FACEBOOK_PAGE", externalId: p.id, ...data },
        update: data,
      });
    }
    return back("connected");
  } catch (e: any) {
    console.warn(`[social] ${platform} connect failed:`, e?.message);
    return back("failed");
  }
}
