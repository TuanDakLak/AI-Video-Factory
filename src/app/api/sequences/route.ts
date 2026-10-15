import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSequenceSchema } from "@/lib/validations";
import { SequenceService } from "@/lib/sequence/sequence-service";
import { requireApiUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const projectId = req.nextUrl.searchParams.get("projectId");
    const sequences = await prisma.sequence.findMany({
      where: { project: { ownerId: user.id }, ...(projectId ? { projectId } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        finalVideo: { select: { id: true, duration: true, thumbnailKey: true } },
        scenes: { select: { id: true, status: true } },
      },
    });
    return NextResponse.json(sequences);
  } catch {
    return NextResponse.json({ error: "Lỗi khi lấy danh sách video nhiều cảnh." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const body = await req.json();
    const parsed = createSequenceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const result = await SequenceService.create(parsed.data, user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    const msg: string = error?.message || "";
    // validation / ownership errors thrown by the service are the caller's fault, not a server failure
    if (/Không tìm thấy|không thuộc/i.test(msg)) return NextResponse.json({ error: msg }, { status: 404 });
    console.error("Create sequence error:", error);
    return NextResponse.json({ error: msg || "Không thể tạo video nhiều cảnh." }, { status: 500 });
  }
}
