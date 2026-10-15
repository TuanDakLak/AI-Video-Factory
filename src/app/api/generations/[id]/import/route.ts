import { SequenceService } from "@/lib/sequence/sequence-service";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { videoProcessor } from "@/lib/video-processor";
import path from "path";
import { requireApiUser } from "@/lib/auth/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const { id: generationId } = await params;

    const generation = await prisma.generation.findFirst({
      where: { id: generationId, project: { ownerId: user.id } },
      include: { project: true },
    });

    if (!generation) {
      return NextResponse.json({ error: "Không tìm thấy generation." }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const probedDuration = formData.get("duration") ? parseFloat(formData.get("duration") as string) : undefined;
    const probedWidth = formData.get("width") ? parseInt(formData.get("width") as string, 10) : undefined;
    const probedHeight = formData.get("height") ? parseInt(formData.get("height") as string, 10) : undefined;

    if (!file) {
      return NextResponse.json({ error: "Vui lòng đính kèm file video." }, { status: 400 });
    }
    if (!/^video\/(mp4|webm|quicktime)$/i.test(file.type || "")) {
      return NextResponse.json({ error: "Chỉ nhận file video MP4, WEBM hoặc MOV." }, { status: 400 });
    }
    if (file.size > 500 * 1024 * 1024) {
      return NextResponse.json({ error: "File video tối đa 500MB." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 1. Save video file to local storage
    const { storageKey, absolutePath } = await storage.saveFile(
      generation.projectId,
      file.name,
      buffer,
      "videos"
    );

    // 2. Extract metadata via videoProcessor with fallback to probed client values
    const metadata = await videoProcessor.extractMetadata(
      absolutePath,
      file.name,
      file.type || "video/mp4"
    );

    const finalDuration = probedDuration || metadata.duration || 8.0;
    const finalWidth = probedWidth || metadata.width || 1080;
    const finalHeight = probedHeight || metadata.height || 1920;

    // 3. Try generating thumbnail if possible
    const thumbOutputDir = path.join(
      path.resolve(process.cwd(), process.env.STORAGE_PATH || "./storage"),
      "projects",
      generation.projectId,
      "thumbnails"
    );
    const thumbFilename = await videoProcessor.generateThumbnail(absolutePath, thumbOutputDir);
    const thumbnailKey = thumbFilename
      ? `projects/${generation.projectId}/thumbnails/${thumbFilename}`
      : null;

    // 4. Create or Update VideoAsset in Database
    const existingAsset = await prisma.videoAsset.findUnique({
      where: { generationId },
    });

    let videoAsset;
    if (existingAsset) {
      // Delete old file if replaced
      await storage.deleteFile(existingAsset.storageKey);
      if (existingAsset.thumbnailKey) await storage.deleteFile(existingAsset.thumbnailKey);

      videoAsset = await prisma.videoAsset.update({
        where: { id: existingAsset.id },
        data: {
          filename: file.name,
          storageKey,
          mimeType: file.type || "video/mp4",
          fileSize: buffer.length,
          duration: finalDuration,
          width: finalWidth,
          height: finalHeight,
          thumbnailKey,
        },
      });
    } else {
      videoAsset = await prisma.videoAsset.create({
        data: {
          projectId: generation.projectId,
          generationId: generation.id,
          filename: file.name,
          storageKey,
          mimeType: file.type || "video/mp4",
          fileSize: buffer.length,
          duration: finalDuration,
          width: finalWidth,
          height: finalHeight,
          thumbnailKey,
        },
      });
    }

    // 5. Mark Generation as COMPLETED (IMPORTED is not a valid GenerationStatus enum value)
    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // If this scene belongs to a multi-scene sequence, auto-assemble when all clips are in (non-blocking)
    void SequenceService.onGenerationSettled(generationId).catch((e) =>
      console.error("[Import] sequence hook error:", e)
    );

    return NextResponse.json({
      success: true,
      asset: videoAsset,
    });
  } catch (error: any) {
    console.error("Video import error:", error);
    return NextResponse.json(
      { error: "Đã xảy ra lỗi máy chủ trong quá trình lưu trữ video." },
      { status: 500 }
    );
  }
}
