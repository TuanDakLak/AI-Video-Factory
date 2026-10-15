import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateContentSchema } from "@/lib/validations";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const content = await prisma.content.findUnique({
      where: { id },
      include: {
        project: true,
        generations: {
          include: { videoAsset: true },
        },
      },
    });

    if (!content) {
      return NextResponse.json({ error: "Không tìm thấy nội dung." }, { status: 404 });
    }

    return NextResponse.json(content);
  } catch (error) {
    return NextResponse.json({ error: "Lỗi máy chủ." }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const validated = updateContentSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.errors[0]?.message || "Dữ liệu không hợp lệ" },
        { status: 400 }
      );
    }

    const data: any = { ...validated.data };
    if (data.tags && Array.isArray(data.tags)) {
      data.tags = JSON.stringify(data.tags);
    }

    const updated = await prisma.content.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update content error:", error);
    return NextResponse.json({ error: "Không thể cập nhật nội dung." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.content.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Không thể xóa nội dung." }, { status: 500 });
  }
}
