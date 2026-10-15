import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { parseKeys } from "@/lib/sequence/attachments";
import { requireApiUser } from "@/lib/auth/session";
import { ownsGoogleAccount, ownsSequence } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

const MAX_REFS = 3;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

/** Upload reference images (product / character photos). Attached to scenes in Flow as "Ingredients". */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const { id } = await params;
    if (!(await ownsSequence(user.id, id))) return NextResponse.json({ error: "Không tìm thấy video nhiều cảnh." }, { status: 404 });
    const seq = await prisma.sequence.findUnique({ where: { id } });
    if (!seq) return NextResponse.json({ error: "Không tìm thấy video nhiều cảnh." }, { status: 404 });

    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => typeof f !== "string");
    if (files.length === 0) return NextResponse.json({ error: "Chưa chọn ảnh nào." }, { status: 400 });

    const keys = parseKeys(seq.referenceImageKeys);
    if (keys.length + files.length > MAX_REFS) {
      return NextResponse.json({ error: `Tối đa ${MAX_REFS} ảnh tham chiếu cho mỗi video.` }, { status: 400 });
    }
    for (const f of files) {
      if (!ALLOWED.includes(f.type)) return NextResponse.json({ error: "Chỉ nhận ảnh PNG, JPG hoặc WEBP." }, { status: 400 });
      if (f.size > MAX_BYTES) return NextResponse.json({ error: "Mỗi ảnh tối đa 8MB." }, { status: 400 });
    }

    for (const f of files) {
      const buf = Buffer.from(await f.arrayBuffer());
      const saved = await storage.saveFile(seq.projectId, f.name || "reference.png", buf, "references");
      keys.push(saved.storageKey);
    }
    await prisma.sequence.update({ where: { id }, data: { referenceImageKeys: JSON.stringify(keys) } });
    return NextResponse.json({ success: true, count: keys.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Không thể tải ảnh lên." }, { status: 500 });
  }
}
