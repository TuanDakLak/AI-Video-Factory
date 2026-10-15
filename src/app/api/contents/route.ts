import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createContentSchema } from "@/lib/validations";
import { requireApiUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const projectId = req.nextUrl.searchParams.get("projectId");
    const contents = await prisma.content.findMany({
      where: { project: { ownerId: user.id }, ...(projectId ? { projectId } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        project: true,
        generations: {
          include: { videoAsset: true },
        },
      },
    });
    return NextResponse.json(contents);
  } catch (error) {
    return NextResponse.json({ error: "Lỗi khi tải danh sách content." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const body = await req.json();
    const validated = createContentSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.errors[0]?.message || "Dữ liệu không hợp lệ" },
        { status: 400 }
      );
    }

    const {
      projectId,
      title,
      concept,
      script,
      videoPrompt,
      description,
      language,
      style,
      duration,
      aspectRatio,
      tags,
    } = validated.data;

    // Verify project exists
    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: user.id },
    });
    if (!project) {
      return NextResponse.json({ error: "Không tìm thấy dự án tương ứng." }, { status: 404 });
    }

    const content = await prisma.content.create({
      data: {
        projectId,
        title,
        concept,
        script,
        videoPrompt,
        description: description || null,
        language,
        style,
        duration,
        aspectRatio,
        tags: JSON.stringify(tags),
      },
    });

    return NextResponse.json(content, { status: 201 });
  } catch (error) {
    console.error("Create content error:", error);
    return NextResponse.json({ error: "Không thể lưu Content." }, { status: 500 });
  }
}
