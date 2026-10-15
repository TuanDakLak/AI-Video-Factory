import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const events = await prisma.generationEvent.findMany({
      where: { generationId: id },
      orderBy: { createdAt: "asc" },
    });

    const generation = await prisma.generation.findUnique({
      where: { id },
      select: {
        status: true,
        errorMessage: true,
        completedAt: true,
        videoAsset: {
          select: {
            id: true,
            storageKey: true,
            thumbnailKey: true,
          },
        },
      },
    });

    return NextResponse.json({
      generation,
      events,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Không thể lấy danh sách tiến trình thế hệ." },
      { status: 500 }
    );
  }
}
