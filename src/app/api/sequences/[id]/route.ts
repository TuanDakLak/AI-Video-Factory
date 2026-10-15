import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateSequenceSchema } from "@/lib/validations";
import { SequenceService } from "@/lib/sequence/sequence-service";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sequence = await prisma.sequence.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        finalVideo: true,
        scenes: {
          orderBy: { sceneIndex: "asc" },
          include: {
            videoAsset: { select: { id: true, duration: true, thumbnailKey: true, width: true, height: true } },
          },
        },
      },
    });
    if (!sequence) return NextResponse.json({ error: "Không tìm thấy video nhiều cảnh." }, { status: 404 });
    return NextResponse.json(sequence);
  } catch {
    return NextResponse.json({ error: "Lỗi khi lấy thông tin video nhiều cảnh." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = updateSequenceSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const current = await prisma.sequence.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Không tìm thấy video nhiều cảnh." }, { status: 404 });

    const { styleBible, tags, ...rest } = parsed.data;
    const updated = await prisma.sequence.update({
      where: { id },
      data: {
        ...rest,
        ...(styleBible !== undefined ? { styleBible } : {}),
        ...(tags !== undefined ? { tags: JSON.stringify(tags) } : {}),
      },
    });

    // Propagate a changed style bible to scenes that have not been rendered yet
    if (styleBible !== undefined && styleBible.trim() !== current.styleBible.trim() && current.styleBible.trim()) {
      const editable = await prisma.generation.findMany({
        where: { sequenceId: id, status: { in: ["DRAFT", "FAILED", "CANCELLED"] } },
      });
      for (const g of editable) {
        if (g.prompt.startsWith(current.styleBible.trim())) {
          await prisma.generation.update({
            where: { id: g.id },
            data: { prompt: styleBible.trim() + g.prompt.slice(current.styleBible.trim().length) },
          });
        }
      }
    }
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Không thể cập nhật." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ok = await SequenceService.remove(id);
    if (!ok) return NextResponse.json({ error: "Không tìm thấy video nhiều cảnh." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Không thể xoá." }, { status: 400 });
  }
}
