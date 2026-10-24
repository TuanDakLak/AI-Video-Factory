import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { LIBRARY_VIDEO_WHERE } from "@/lib/video-library";
import { Inbox, Loader2, Film, Send, Coins, Plus, ArrowRight, AlertTriangle, Layers } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { VideoItem } from "@/components/videos/VideoCard";
import DashboardVideoList from "@/components/dashboard/DashboardVideoList";
import { requirePageUser } from "@/lib/auth/session";
import { sequencesOf, videoAssetsOf } from "@/lib/auth/ownership";
import { CREDITS_SPENT_EVENT, startOfLocalDay } from "@/lib/sequence/credit-guard";

export const dynamic = "force-dynamic";

/** Pipeline overview: topics to review -> videos in production -> finished -> published, plus what needs attention. */
export default async function DashboardPage() {
  const user = await requirePageUser();
  const mine = { channel: { ownerId: user.id } };
  let counts = { review: 0, producing: 0, videos: 0, published: 0, credits: 0 };
  let attention: { id: string; title: string; errorMessage: string | null; status: string }[] = [];
  let recentSequences: any[] = [];
  let recentVideos: VideoItem[] = [];

  try {
    const [review, producing, videos, published, spent, stuck, sRecent, vRecent] = await Promise.all([
      prisma.topic.count({ where: { ...mine, status: "SUGGESTED" } }),
      prisma.sequence.count({ where: { ...sequencesOf(user.id), status: { in: ["RUNNING", "ASSEMBLING"] } } }),
      prisma.videoAsset.count({ where: { AND: [LIBRARY_VIDEO_WHERE, videoAssetsOf(user.id)] } }),
      prisma.publication.count({ where: { status: "PUBLISHED", socialAccount: { ownerId: user.id } } }),
      prisma.generationEvent.findMany({
        where: { type: CREDITS_SPENT_EVENT, createdAt: { gte: startOfLocalDay() }, generation: { project: { ownerId: user.id } } },
        select: { message: true },
      }),
      prisma.sequence.findMany({
        where: { ...sequencesOf(user.id), status: "NEEDS_USER_ACTION" },
        take: 5,
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, errorMessage: true, status: true },
      }),
      prisma.sequence.findMany({
        where: sequencesOf(user.id),
        take: 4,
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, status: true, totalDuration: true, aspectRatio: true, finalVideo: { select: { duration: true } } },
      }),
      prisma.videoAsset.findMany({
        where: { AND: [LIBRARY_VIDEO_WHERE, videoAssetsOf(user.id)] },
        take: 4,
        orderBy: { createdAt: "desc" },
        include: { project: true, generation: { include: { googleAccount: true } } },
      }),
    ]);
    counts = { review, producing, videos, published, credits: spent.reduce((s, r) => s + (parseFloat(r.message) || 0), 0) };
    attention = stuck;
    recentSequences = sRecent;
    recentVideos = vRecent as any;
  } catch (error) {
    console.error("Dashboard DB fetch error:", error);
  }

  const stats = [
    { label: "Chủ đề chờ duyệt", value: counts.review, icon: Inbox, tone: "bg-amber-50 text-amber-600", href: "/topics" },
    { label: "Đang sản xuất", value: counts.producing, icon: Loader2, tone: "bg-blue-50 text-blue-600", href: "/sequences" },
    { label: "Video hoàn thành", value: counts.videos, icon: Film, tone: "bg-emerald-50 text-emerald-600", href: "/videos" },
    { label: "Đã đăng", value: counts.published, icon: Send, tone: "bg-violet-50 text-violet-600", href: "/videos" },
    { label: "Credit hôm nay", value: counts.credits, icon: Coins, tone: "bg-slate-100 text-slate-600", href: "/settings" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Bảng điều khiển</h2>
          <p className="text-sm text-slate-500 mt-0.5">Chủ đề → kịch bản → Flow tạo clip → ghép video dài → đăng lên kênh.</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link href="/topics" className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs px-4 py-2.5 rounded-xl shadow-sm">
            <Inbox className="w-4 h-4" />
            <span>Duyệt chủ đề</span>
          </Link>
          <Link href="/sequences/new" className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-4 py-2.5 rounded-xl shadow-sm">
            <Plus className="w-4 h-4" />
            <span>Tạo video thủ công</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map(({ label, value, icon: Icon, tone, href }) => (
          <Link key={label} href={href} className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex items-center justify-between hover:border-emerald-300 transition-colors">
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone}`}>
              <Icon className="w-5 h-5" />
            </div>
          </Link>
        ))}
      </div>

      {attention.length > 0 && (
        <div className="bg-rose-50/60 border border-rose-200 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Cần xử lý ({attention.length})
          </h3>
          <ul className="space-y-2">
            {attention.map((s) => (
              <li key={s.id}>
                <Link href={`/sequences/${s.id}`} className="block text-xs hover:underline">
                  <span className="font-semibold text-slate-800">{s.title}</span>
                  {s.errorMessage && <span className="text-rose-700"> — {s.errorMessage.slice(0, 160)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-500" />
            <span>Video gần đây</span>
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
              <Link key={s.id} href={`/sequences/${s.id}`} className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm space-y-2 hover:border-emerald-300 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={s.status} />
                  <span className="text-[11px] text-slate-400">
                    {s.aspectRatio} • {s.finalVideo?.duration ? `${Math.round(s.finalVideo.duration)}s` : `${s.totalDuration}s`}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-800 line-clamp-2">{s.title}</p>
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
