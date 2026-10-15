import React from "react";
import { prisma } from "@/lib/db";
import { LIBRARY_VIDEO_WHERE } from "@/lib/video-library";
import VideoLibraryClient from "@/components/videos/VideoLibraryClient";
import { requirePageUser } from "@/lib/auth/session";
import { videoAssetsOf } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

export default async function VideosPage() {
  const user = await requirePageUser();
  let videos: any[] = [];
  try {
    videos = await prisma.videoAsset.findMany({
      where: { AND: [LIBRARY_VIDEO_WHERE, videoAssetsOf(user.id)] },
      orderBy: { createdAt: "desc" },
      include: {
        project: true,
        generation: {
          include: {
            content: true,
            googleAccount: true,
          },
        },
      },
    });
  } catch (error) {
    console.error("Fetch video library error:", error);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Thư Viện Video</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Video hoàn chỉnh đã tạo từ Google Flow và import vào hệ thống (clip 10s của video nhiều cảnh không được lưu riêng).
        </p>
      </div>

      <VideoLibraryClient initialVideos={videos as any} />
    </div>
  );
}
