import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
}
