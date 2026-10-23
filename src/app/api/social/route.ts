import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { facebookEnabled } from "@/lib/publish/facebook";
import { tiktokEnabled } from "@/lib/publish/tiktok";

export const dynamic = "force-dynamic";

/** The caller's connected social accounts (tokens are never returned) + which platforms are configured. */
export async function GET() {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const accounts = await prisma.socialAccount.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, platform: true, displayName: true, status: true, lastError: true, tokenExpiresAt: true, createdAt: true },
  });
  return NextResponse.json({ accounts, enabled: { tiktok: tiktokEnabled(), facebook: facebookEnabled() } });
}
