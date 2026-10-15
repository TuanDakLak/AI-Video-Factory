import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { LIBRARY_VIDEO_WHERE } from "@/lib/video-library";
import { Plus, FolderKanban, Sparkles, Film, ArrowUpRight } from "lucide-react";
import { ContentTypeBadge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  let projects: any[] = [];
  try {
    projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { generations: true, videoAssets: { where: LIBRARY_VIDEO_WHERE } },
        },
      },
    });
  } catch (error) {
    console.error("Fetch projects error:", error);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Dự Án Video</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Danh sách tất cả các chủ đề, ý tưởng và chiến dịch video đang thực hiện.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo Dự Án Mới</span>
        </Link>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-md mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <FolderKanban className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">Chưa có dự án nào</h3>
            <p className="text-xs text-slate-500 mt-1">
              Bắt đầu bằng việc tạo dự án mới với chủ đề hoặc ý tưởng của bạn.
            </p>
          </div>
          <Link
            href="/projects/new"
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-4 py-2 rounded-xl transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo dự án ngay</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group bg-white rounded-2xl border border-slate-200/90 hover:border-emerald-200 hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <ContentTypeBadge type={project.contentType} />
                  <span className="text-[11px] text-slate-400">
                    {new Date(project.createdAt).toLocaleDateString("vi-VN")}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-slate-800 group-hover:text-emerald-700 transition-colors flex items-center justify-between">
                  <span>{project.name}</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 transition-colors" />
                </h3>
                <p className="text-xs text-slate-500 line-clamp-2 mt-1.5 leading-relaxed">
                  {project.topic}
                </p>
                {project.description && (
                  <p className="text-[11px] text-slate-400 line-clamp-1 mt-1 italic">
                    {project.description}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100 font-medium">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  {project._count.generations} prompt
                </span>
                <span className="flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-emerald-600" />
                  {project._count.videoAssets} video đã import
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
