import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import fs from "fs";
import { requireApiUser } from "@/lib/auth/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const { id } = await params;
    const isDownload = req.nextUrl.searchParams.get("download") === "true";

    const video = await prisma.videoAsset.findFirst({
      where: { id, project: { ownerId: user.id } },
    });

    if (!video) {
      return new NextResponse("Video not found", { status: 404 });
    }

    const filePath = storage.getFilePath(video.storageKey);
    if (!fs.existsSync(filePath)) {
      return new NextResponse("File missing on server storage", { status: 404 });
    }

    // the stored type came from an upload: only ever serve a video type (never text/html etc. on our origin)
    const contentType = /^video\/[a-z0-9.+-]+$/i.test(video.mimeType || "") ? video.mimeType : "application/octet-stream";
    const stat = await fs.promises.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.get("range");

    if (isDownload) {
      const fileStream = fs.createReadStream(filePath);
      // @ts-ignore
      return new NextResponse(fileStream, {
        headers: {
          "Content-Disposition": `attachment; filename="${encodeURIComponent(video.filename)}"`,
          "Content-Type": contentType,
          "Content-Length": fileSize.toString(),
        },
      });
    }

    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      let start = m && m[1] ? parseInt(m[1], 10) : NaN;
      let end = m && m[2] ? parseInt(m[2], 10) : fileSize - 1;
      if (m && !m[1] && m[2]) {
        start = Math.max(0, fileSize - parseInt(m[2], 10)); // suffix range: the last N bytes
        end = fileSize - 1;
      }
      end = Math.min(end, fileSize - 1);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end) {
        return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${fileSize}` } });
      }
      const chunksize = end - start + 1;
      const stream = fs.createReadStream(filePath, { start, end });

      // @ts-ignore
      return new NextResponse(stream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize.toString(),
          "Content-Type": contentType,
        },
      });
    }

    const stream = fs.createReadStream(filePath);
    // @ts-ignore
    return new NextResponse(stream, {
      headers: {
        "Content-Length": fileSize.toString(),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.error("Stream video error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
