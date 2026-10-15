import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { requireApiUser } from "@/lib/auth/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const { id } = await params;
    const video = await prisma.videoAsset.findFirst({
      where: { id, project: { ownerId: user.id } },
      include: {
        project: true,
        generation: true,
      },
    });

    if (!video) {
      return NextResponse.json({ error: "Không tìm thấy video." }, { status: 404 });
    }

    return NextResponse.json(video);
  } catch (error) {
    return NextResponse.json({ error: "Lỗi máy chủ." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const { id } = await params;

    const video = await prisma.videoAsset.findFirst({
      where: { id, project: { ownerId: user.id } },
    });

    if (!video) {
      return NextResponse.json({ error: "Không tìm thấy video." }, { status: 404 });
    }

    // Delete physical file from storage
    await storage.deleteFile(video.storageKey);
    if (video.thumbnailKey) {
      await storage.deleteFile(video.thumbnailKey);
    }

    // If linked to generation, update generation status back to NEEDS_USER_ACTION (video must be re-imported)
    if (video.generationId) {
      await prisma.generation.update({
        where: { id: video.generationId },
        data: { status: "NEEDS_USER_ACTION" },
      });
    }

    // Delete DB record
    await prisma.videoAsset.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete video error:", error);
    return NextResponse.json({ error: "Không thể xóa video." }, { status: 500 });
  }
}
