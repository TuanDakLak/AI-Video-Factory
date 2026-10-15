import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Sparkles, Plus, ArrowRight, UserCheck } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { CopyPromptButton } from "@/components/generations/CopyPromptButton";
import { requirePageUser } from "@/lib/auth/session";
import { generationsOf } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

export default async function GenerationsPage() {
  const user = await requirePageUser();
  let generations: any[] = [];
  try {
    generations = await prisma.generation.findMany({
      where: generationsOf(user.id),
      orderBy: { createdAt: "desc" },
      include: {
        project: true,
        content: true,
        googleAccount: true,
        videoAsset: true,
      },
    });
  } catch (error) {
    console.error("Fetch generations error:", error);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Lệnh Tạo Video (Generations)</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Quản lý các video prompt, tài khoản Google Pro dự kiến và trạng thái render trên Google Flow.
          </p>
        </div>
        <Link
          href="/generations/new"
          className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo Prompt Mới</span>
        </Link>
      </div>

      {generations.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">Chưa có lệnh tạo nào</h3>
            <p className="text-xs text-slate-500 mt-1">
              Tạo prompt đầu tiên để bắt đầu quy trình làm video với Google Flow.
            </p>
          </div>
          <Link
            href="/generations/new"
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-4 py-2 rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo Prompt ngay</span>
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-slate-200/90 rounded-3xl shadow-sm overflow-hidden divide-y divide-slate-100">
          {generations.map((gen) => (
            <div
              key={gen.id}
              className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <StatusBadge status={gen.status} />

                  {gen.googleAccount && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md">
                      <UserCheck className="w-3 h-3 text-sky-600" />
                      {gen.googleAccount.name}
                    </span>
                  )}

                  <span className="text-xs text-slate-400">
                    Dự án:{" "}
                    <Link
                      href={`/projects/${gen.project.id}`}
                      className="font-medium text-slate-600 hover:text-emerald-700 hover:underline"
                    >
                      {gen.project.name}
                    </Link>
                  </span>

                  {gen.content && (
                    <>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-500 truncate max-w-[160px]">
                        {gen.content.title}
                      </span>
                    </>
                  )}

                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs text-slate-500">{gen.model}</span>
                  <span className="text-xs text-slate-500">• {gen.aspectRatio}</span>
                  <span className="text-xs text-slate-500">• {gen.duration}</span>
                </div>

                <p className="text-xs font-mono font-medium text-slate-800 line-clamp-2 leading-relaxed">
                  {gen.prompt}
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <CopyPromptButton prompt={gen.prompt} size="sm" />

                <Link
                  href={`/generations/${gen.id}`}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-sm transition-colors"
                >
                  <span>Mở Workflow</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
