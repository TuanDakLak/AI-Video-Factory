import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import fs from "fs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const isDownload = req.nextUrl.searchParams.get("download") === "true";

    const video = await prisma.videoAsset.findUnique({
      where: { id },
    });

    if (!video) {
      return new NextResponse("Video not found", { status: 404 });
    }

    const filePath = storage.getFilePath(video.storageKey);
    if (!fs.existsSync(filePath)) {
      return new NextResponse("File missing on server storage", { status: 404 });
    }

    const stat = await fs.promises.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.get("range");

    if (isDownload) {
      const fileStream = fs.createReadStream(filePath);
      // @ts-ignore
      return new NextResponse(fileStream, {
        headers: {
          "Content-Disposition": `attachment; filename="${encodeURIComponent(video.filename)}"`,
          "Content-Type": video.mimeType || "video/mp4",
          "Content-Length": fileSize.toString(),
        },
      });
    }

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const stream = fs.createReadStream(filePath, { start, end });

      // @ts-ignore
      return new NextResponse(stream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize.toString(),
          "Content-Type": video.mimeType || "video/mp4",
        },
      });
    }

    const stream = fs.createReadStream(filePath);
    // @ts-ignore
    return new NextResponse(stream, {
      headers: {
        "Content-Length": fileSize.toString(),
        "Content-Type": video.mimeType || "video/mp4",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.error("Stream video error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
