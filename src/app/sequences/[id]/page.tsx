import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import SequenceDetailClient from "@/components/sequences/SequenceDetailClient";

export const dynamic = "force-dynamic";

export default async function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let sequence: any = null;
  try {
    sequence = await prisma.sequence.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        finalVideo: true,
        scenes: {
          orderBy: { sceneIndex: "asc" },
          include: { videoAsset: { select: { id: true, duration: true, thumbnailKey: true, width: true, height: true } } },
        },
      },
    });
  } catch (error) {
    console.error("Fetch sequence error:", error);
  }
  if (!sequence) notFound();

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
      <Link href="/sequences" className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Quay lại danh sách</span>
      </Link>
      <SequenceDetailClient initial={JSON.parse(JSON.stringify(sequence))} />
    </div>
  );
}
