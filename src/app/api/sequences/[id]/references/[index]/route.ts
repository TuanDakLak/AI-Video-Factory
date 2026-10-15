import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { parseKeys } from "@/lib/sequence/attachments";
import { requireApiUser } from "@/lib/auth/session";
import { ownsGoogleAccount, ownsSequence } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

async function load(userId: string, id: string, indexStr: string) {
  if (!(await ownsSequence(userId, id))) return null;
  const seq = await prisma.sequence.findUnique({ where: { id } });
  const index = parseInt(indexStr, 10);
  if (!seq || Number.isNaN(index)) return null;
  const keys = parseKeys(seq.referenceImageKeys);
  if (index < 0 || index >= keys.length) return null;
  return { seq, keys, index };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id, index } = await params;
  const found = await load(user.id, id, index);
  if (!found) return NextResponse.json({ error: "Không tìm thấy ảnh." }, { status: 404 });
  const key = found.keys[found.index];
  if (!storage.fileExists(key)) return NextResponse.json({ error: "File ảnh không còn trên đĩa." }, { status: 404 });
  const buf = await storage.readFile(key);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": MIME[path.extname(key).toLowerCase()] || "application/octet-stream", "Cache-Control": "private, max-age=60" },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id, index } = await params;
  const found = await load(user.id, id, index);
  if (!found) return NextResponse.json({ error: "Không tìm thấy ảnh." }, { status: 404 });
  const [removed] = found.keys.splice(found.index, 1);
  await storage.deleteFile(removed);
  await prisma.sequence.update({ where: { id }, data: { referenceImageKeys: JSON.stringify(found.keys) } });
  return NextResponse.json({ success: true });
}
