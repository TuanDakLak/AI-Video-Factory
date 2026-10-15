import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { LIBRARY_VIDEO_WHERE } from "@/lib/video-library";
import { createProjectSchema } from "@/lib/validations";

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { generations: true, videoAssets: { where: LIBRARY_VIDEO_WHERE } } },
      },
    });
    return NextResponse.json(projects);
  } catch (error) {
    return NextResponse.json({ error: "Lỗi khi lấy danh sách dự án." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = createProjectSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.errors[0]?.message || "Dữ liệu không hợp lệ" },
        { status: 400 }
      );
    }

    const { name, description, contentType, topic } = validated.data;

    const project = await prisma.project.create({
      data: {
        name,
        description: description || null,
        contentType: contentType as any,
        topic,
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Create project error:", error);
    return NextResponse.json({ error: "Không thể tạo dự án." }, { status: 500 });
  }
}
