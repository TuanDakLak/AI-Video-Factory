import React from "react";
import Link from "next/link";
import { Layers, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/ui/Badge";
import { requirePageUser } from "@/lib/auth/session";
import { sequencesOf } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

export default async function SequencesPage() {
  const user = await requirePageUser();
  let sequences: any[] = [];
  try {
    sequences = await prisma.sequence.findMany({
      where: sequencesOf(user.id),
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        scenes: { select: { id: true, status: true } },
        finalVideo: { select: { id: true, duration: true } },
      },
    });
  } catch (error) {
    console.error("Fetch sequences error:", error);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Video nhiều cảnh</h1>
          <p className="text-xs text-slate-500 mt-1">Ghép nhiều clip Flow thành một video hoàn chỉnh.</p>
        </div>
        <Link href="/sequences/new" className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3.5 py-2.5 rounded-xl shadow-sm">
          <Plus className="w-3.5 h-3.5" />
          <span>Tạo video nhiều cảnh</span>
        </Link>
      </div>

      {sequences.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-3xl p-10 text-center text-xs text-slate-500 shadow-sm">
          <Layers className="w-8 h-8 mx-auto text-slate-300 mb-3" />
          Chưa có video nhiều cảnh nào.
        </div>
      ) : (
        <div className="grid gap-3">
          {sequences.map((s) => {
            const done = s.scenes.filter((x: any) => x.status === "COMPLETED").length;
            return (
              <Link key={s.id} href={`/sequences/${s.id}`} className="bg-white border border-slate-200/90 hover:border-emerald-300 rounded-2xl p-5 shadow-sm transition-all flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-slate-900 truncate">{s.title}</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {s.project.name} • {s.aspectRatio} • {done}/{s.scenes.length} cảnh • ~{s.totalDuration}s
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
