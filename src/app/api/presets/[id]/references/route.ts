import { NextRequest, NextResponse } from "next/server";
import { getPreset, PRESET_REF_FOLDER, PRESET_STORAGE_PROJECT, updatePreset } from "@/lib/presets";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_REFS = 3;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

/** Upload reference images (max 3) of the channel's character / product. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preset = getPreset(id);
  if (!preset) return NextResponse.json({ error: "Không tìm thấy preset." }, { status: 404 });
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => typeof f !== "string");
  if (files.length === 0) return NextResponse.json({ error: "Chưa chọn ảnh nào." }, { status: 400 });
  if (preset.referenceImageKeys.length + files.length > MAX_REFS) return NextResponse.json({ error: `Tối đa ${MAX_REFS} ảnh tham chiếu.` }, { status: 400 });
  for (const f of files) {
    if (!ALLOWED.includes(f.type)) return NextResponse.json({ error: "Chỉ nhận ảnh PNG, JPG hoặc WEBP." }, { status: 400 });
    if (f.size > MAX_BYTES) return NextResponse.json({ error: "Mỗi ảnh tối đa 8MB." }, { status: 400 });
  }
  const keys = [...preset.referenceImageKeys];
  for (const f of files) {
    const saved = await storage.saveFile(PRESET_STORAGE_PROJECT, f.name || "reference.png", Buffer.from(await f.arrayBuffer()), PRESET_REF_FOLDER);
    keys.push(saved.storageKey);
  }
  updatePreset(id, { referenceImageKeys: keys });
  return NextResponse.json({ success: true, count: keys.length });
}

/** DELETE ?index=N removes one reference image. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preset = getPreset(id);
  if (!preset) return NextResponse.json({ error: "Không tìm thấy preset." }, { status: 404 });
  const index = parseInt(req.nextUrl.searchParams.get("index") || "", 10);
  if (!Number.isInteger(index) || index < 0 || index >= preset.referenceImageKeys.length) return NextResponse.json({ error: "Chỉ số ảnh không hợp lệ." }, { status: 400 });
  const keys = [...preset.referenceImageKeys];
  const [removed] = keys.splice(index, 1);
  await storage.deleteFile(removed);
  updatePreset(id, { referenceImageKeys: keys });
  return NextResponse.json({ success: true, count: keys.length });
}
