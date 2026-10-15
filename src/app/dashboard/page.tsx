import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { LIBRARY_VIDEO_WHERE } from "@/lib/video-library";
import { FolderKanban, FileText, Layers, Film, Plus, ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { VideoItem } from "@/components/videos/VideoCard";
import DashboardVideoList from "@/components/dashboard/DashboardVideoList";
import { requirePageUser } from "@/lib/auth/session";
import { contentsOf, projectsOf, sequencesOf, videoAssetsOf } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();
  let projectCount = 0;
  let contentCount = 0;
  let sequenceCount = 0;
  let videoCount = 0;
  let recentSequences: any[] = [];
  let recentVideos: VideoItem[] = [];

  try {
    const [pCount, cCount, sCount, vCount, sRecent, vRecent] = await Promise.all([
      prisma.project.count({ where: projectsOf(user.id) }),
      prisma.content.count({ where: contentsOf(user.id) }),
      prisma.sequence.count({ where: sequencesOf(user.id) }),
      prisma.videoAsset.count({ where: { AND: [LIBRARY_VIDEO_WHERE, videoAssetsOf(user.id)] } }),
      prisma.sequence.findMany({
        where: sequencesOf(user.id),
        take: 4,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          totalDuration: true,
          aspectRatio: true,
          project: { select: { name: true } },
          finalVideo: { select: { duration: true } },
        },
      }),
      prisma.videoAsset.findMany({
        where: { AND: [LIBRARY_VIDEO_WHERE, videoAssetsOf(user.id)] },
        take: 4,
        orderBy: { createdAt: "desc" },
        include: {
          project: true,
          generation: { include: { content: true, googleAccount: true } },
        },
      }),
    ]);
    projectCount = pCount;
    contentCount = cCount;
    sequenceCount = sCount;
    videoCount = vCount;
    recentSequences = sRecent;
    recentVideos = vRecent as any;
  } catch (error) {
    console.error("Dashboard DB fetch error:", error);
  }

  const stats = [
    { label: "Dự án", value: projectCount, icon: FolderKanban, tone: "bg-blue-50 text-blue-600" },
    { label: "Kịch bản", value: contentCount, icon: FileText, tone: "bg-emerald-50 text-emerald-600" },
    { label: "Video nhiều cảnh", value: sequenceCount, icon: Layers, tone: "bg-amber-50 text-amber-600" },
    { label: "Thư viện video", value: videoCount, icon: Film, tone: "bg-purple-50 text-purple-600" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Bảng điều khiển</h2>
          <p className="text-sm text-slate-500 mt-0.5">Tạo video dài từ các clip Google Flow và quản lý thư viện.</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/sequences/new"
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-4 py-2.5 rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo video</span>
          </Link>
          <Link
            href="/projects/new"
            className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs px-4 py-2.5 rounded-xl shadow-sm transition-all"
          >
            <FolderKanban className="w-4 h-4" />
            <span>Tạo dự án</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone}`}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-500" />
            <span>Video đang làm gần đây</span>
          </h3>
          <Link href="/sequences" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
            <span>Xem tất cả</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentSequences.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-500">Chưa có video nào.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentSequences.map((s) => (
              <Link
                key={s.id}
                href={`/sequences/${s.id}`}
                className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm space-y-2 hover:border-emerald-300 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={s.status} />
                  <span className="text-[11px] text-slate-400">
                    {s.aspectRatio} • {s.finalVideo?.duration ? `${Math.round(s.finalVideo.duration)}s` : `${s.totalDuration}s`}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-800 line-clamp-2">{s.title}</p>
                <p className="text-xs text-slate-400 truncate">📁 {s.project.name}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Film className="w-4 h-4 text-emerald-600" />
            <span>Video mới nhất</span>
          </h3>
          <Link href="/videos" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
            <span>Mở thư viện</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentVideos.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-500">Chưa có video nào trong thư viện.</div>
        ) : (
          <DashboardVideoList initialVideos={recentVideos} />
        )}
      </div>
    </div>
  );
}
