import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSequenceSchema } from "@/lib/validations";
import { SequenceService } from "@/lib/sequence/sequence-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    const sequences = await prisma.sequence.findMany({
      where: projectId ? { projectId } : undefined,
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
    const body = await req.json();
    const parsed = createSequenceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const result = await SequenceService.create(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("Create sequence error:", error);
    return NextResponse.json({ error: error.message || "Không thể tạo video nhiều cảnh." }, { status: 500 });
  }
}
