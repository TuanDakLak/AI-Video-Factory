import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { LIBRARY_VIDEO_WHERE } from "@/lib/video-library";
import { ArrowLeft } from "lucide-react";
import ProjectDetailClient from "@/components/projects/ProjectDetailClient";
import { requirePageUser } from "@/lib/auth/session";
import { projectsOf } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageUser();
  const { id } = await params;

  let project = null;
  try {
    project = await prisma.project.findFirst({
      where: { id, ...projectsOf(user.id) },
      include: {
        contents: {
          orderBy: { createdAt: "desc" },
        },
        generations: {
          orderBy: { createdAt: "desc" },
          include: {
            videoAsset: true,
            googleAccount: true,
            content: true,
          },
        },
        videoAssets: {
          where: LIBRARY_VIDEO_WHERE,
          orderBy: { createdAt: "desc" },
          include: { generation: true },
        },
      },
    });
  } catch (error) {
    console.error("Fetch project error:", error);
  }

  if (!project) {
    notFound();
  }

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Tất cả dự án</span>
      </Link>

      <ProjectDetailClient project={project as any} />
    </div>
  );
}
