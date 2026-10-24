import { NextRequest, NextResponse } from "next/server";
import { deleteChannel, getChannel, channelInputSchema, updateChannel } from "@/lib/channels";
import { storage } from "@/lib/storage";
import { requireApiUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const p = await getChannel(id, user.id);
  return p ? NextResponse.json(p) : NextResponse.json({ error: "Không tìm thấy kênh." }, { status: 404 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = channelInputSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  let p;
  try {
    p = await updateChannel(id, user.id, parsed.data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Không cập nhật được kênh." }, { status: 400 });
  }
  return p ? NextResponse.json(p) : NextResponse.json({ error: "Không tìm thấy kênh." }, { status: 404 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const p = await deleteChannel(id, user.id);
  if (!p) return NextResponse.json({ error: "Không tìm thấy kênh." }, { status: 404 });
  for (const k of p.referenceImageKeys) await storage.deleteFile(k);
  return NextResponse.json({ success: true });
}
