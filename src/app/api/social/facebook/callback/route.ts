import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { finishConnect } from "@/lib/publish/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  return finishConnect("facebook", req, user.id);
}
