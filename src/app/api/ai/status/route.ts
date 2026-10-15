import { NextResponse } from "next/server";
import { aiProvider } from "@/lib/ai";
import { requireApiUser } from "@/lib/auth/session";

export async function GET() {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({
    isConfigured: aiProvider.isConfigured(),
    provider: aiProvider.name,
  });
}
