import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createGenerationSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    const generations = await prisma.generation.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        project: true,
        content: true,
        googleAccount: true,
        videoAsset: true,
      },
    });
    return NextResponse.json(generations);
  } catch (error) {
    return NextResponse.json({ error: "Lỗi khi lấy danh sách generation." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = createGenerationSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.errors[0]?.message || "Dữ liệu không hợp lệ" },
        { status: 400 }
      );
    }

    const { projectId, contentId, googleAccountId, prompt, model, aspectRatio, duration } = validated.data;

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: "Không tìm thấy dự án tương ứng." }, { status: 404 });
    }

    const generation = await prisma.generation.create({
      data: {
        projectId,
        contentId: contentId || null,
        googleAccountId: googleAccountId || null,
        prompt,
        model,
        aspectRatio,
        duration,
        status: "DRAFT",
        provider: "GOOGLE_FLOW",
        generationMethod: validated.data.generationMethod,
      },
    });

    return NextResponse.json(generation, { status: 201 });
  } catch (error) {
    console.error("Create generation error:", error);
    return NextResponse.json({ error: "Không thể tạo generation." }, { status: 500 });
  }
}
