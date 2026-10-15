import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createGenerationSchema } from "@/lib/validations";
import { requireApiUser } from "@/lib/auth/session";
import { ownsContent, ownsGeneration, ownsGoogleAccount } from "@/lib/auth/ownership";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const projectId = req.nextUrl.searchParams.get("projectId");
    const generations = await prisma.generation.findMany({
      where: { project: { ownerId: user.id }, ...(projectId ? { projectId } : {}) },
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
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
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
    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: user.id },
    });

    if (!project) {
      return NextResponse.json({ error: "Không tìm thấy dự án tương ứng." }, { status: 404 });
    }
    if (contentId && !(await ownsContent(user.id, contentId))) {
      return NextResponse.json({ error: "Không tìm thấy kịch bản." }, { status: 404 });
    }
    if (googleAccountId && !(await ownsGoogleAccount(user.id, googleAccountId))) {
      return NextResponse.json({ error: "Không tìm thấy tài khoản Google." }, { status: 404 });
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
