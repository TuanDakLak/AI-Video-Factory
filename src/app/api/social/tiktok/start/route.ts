import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { platformEnabled, startConnect } from "@/lib/publish/oauth";

export const dynamic = "force-dynamic";

/** Navigation target of the "Kết nối" button: redirects to the platform's consent screen. */
export async function GET(req: Request) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  if (!platformEnabled("tiktok")) return NextResponse.redirect(new URL("/settings?social=disabled", req.url), 303);
  return startConnect("tiktok", user.id);
}
