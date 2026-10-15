import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { FileText, Plus, ArrowRight, Sparkles, Film, Copy } from "lucide-react";
import { CopyPromptButton } from "@/components/generations/CopyPromptButton";

export const dynamic = "force-dynamic";

export default async function ContentsPage() {
  let contents: any[] = [];
  try {
    contents = await prisma.content.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        project: true,
        generations: {
          include: { videoAsset: true },
        },
      },
    });
  } catch (error) {
    console.error("Fetch contents error:", error);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Ý Tưởng &amp; Kịch Bản (Contents)</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Quản lý kịch bản phân cảnh, prompt video do bạn hoặc Gemini AI tạo ra.
          </p>
        </div>
        <Link
          href="/contents/new"
          className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-sm transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span>Tạo Kịch Bản Mới (AI / Thủ công)</span>
        </Link>
      </div>

      {contents.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">Chưa có kịch bản nào</h3>
            <p className="text-xs text-slate-500 mt-1">
              Bắt đầu tạo kịch bản đầu tiên với sự trợ giúp của Gemini AI hoặc tự viết thủ công.
            </p>
          </div>
          <Link
            href="/contents/new"
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-4 py-2 rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Soạn kịch bản ngay</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {contents.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-slate-200/90 hover:border-emerald-200 hover:shadow-md rounded-3xl p-6 transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full">
                    {item.style} • {item.aspectRatio}
                  </span>
                  <Link
                    href={`/projects/${item.project.id}`}
                    className="text-xs text-slate-400 hover:text-slate-600 truncate max-w-[180px]"
                  >
                    📁 {item.project.name}
                  </Link>
                </div>

                <h3 className="text-base font-bold text-slate-900 line-clamp-1">{item.title}</h3>
                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{item.concept}</p>

                {/* Prompt Preview Box */}
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-xs font-mono text-slate-700 line-clamp-2 leading-relaxed">
                  {item.videoPrompt}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Film className="w-3.5 h-3.5 text-amber-500" />
                  <span>{item.generations.length} lệnh render</span>
                </div>

                <div className="flex items-center gap-2">
                  <CopyPromptButton prompt={item.videoPrompt} size="sm" />

                  <Link
                    href={`/generations/new?projectId=${item.projectId}&contentId=${item.id}&aspectRatio=${item.aspectRatio}&duration=${item.duration}`}
                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3.5 py-2 rounded-xl shadow-sm transition-colors"
                  >
                    <span>Tạo Video Job</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
