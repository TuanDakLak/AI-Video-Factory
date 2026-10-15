import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ArrowLeft } from "lucide-react";
import GenerationDetailClient from "@/components/generations/GenerationDetailClient";

export const dynamic = "force-dynamic";

export default async function GenerationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let generation = null;
  try {
    generation = await prisma.generation.findUnique({
      where: { id },
      include: {
        project: true,
        content: true,
        googleAccount: true,
        videoAsset: true,
        events: { orderBy: { createdAt: "asc" } },
      },
    });
  } catch (error) {
    console.error("Fetch generation error:", error);
  }

  if (!generation) {
    notFound();
  }

  return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
      <Link
        href={`/projects/${generation.projectId}`}
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Quay lại dự án: {generation.project.name}</span>
      </Link>

      <GenerationDetailClient generation={generation as any} />
    </div>
  );
}
