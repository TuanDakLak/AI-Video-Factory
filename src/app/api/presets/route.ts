import { NextRequest, NextResponse } from "next/server";
import { createPreset, listPresets, presetInputSchema } from "@/lib/presets";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listPresets());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = presetInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  return NextResponse.json(createPreset(parsed.data), { status: 201 });
}
