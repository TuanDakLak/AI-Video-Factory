import { NextRequest, NextResponse } from "next/server";
import { deletePreset, getPreset, presetInputSchema, updatePreset } from "@/lib/presets";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getPreset(id);
  return p ? NextResponse.json(p) : NextResponse.json({ error: "Không tìm thấy preset." }, { status: 404 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = presetInputSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  const p = updatePreset(id, parsed.data);
  return p ? NextResponse.json(p) : NextResponse.json({ error: "Không tìm thấy preset." }, { status: 404 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = deletePreset(id);
  if (!p) return NextResponse.json({ error: "Không tìm thấy preset." }, { status: 404 });
  for (const k of p.referenceImageKeys) await storage.deleteFile(k);
  return NextResponse.json({ success: true });
}
