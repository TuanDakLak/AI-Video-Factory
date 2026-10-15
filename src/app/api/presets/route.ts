import { NextRequest, NextResponse } from "next/server";
import { createPreset, listPresets, presetInputSchema } from "@/lib/presets";
import { requireApiUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(listPresets(user.id));
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  const parsed = presetInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  return NextResponse.json(createPreset(parsed.data, user.id), { status: 201 });
}
