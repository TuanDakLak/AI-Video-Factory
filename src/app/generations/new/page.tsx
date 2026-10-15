import React from "react";
import { prisma } from "@/lib/db";
import NewGenerationForm from "@/components/generations/NewGenerationForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewGenerationPage({
  searchParams,
}: {
  searchParams: Promise<{
    projectId?: string;
    contentId?: string;
    aspectRatio?: string;
    duration?: string;
  }>;
}) {
  const { projectId, contentId, aspectRatio, duration } = await searchParams;

  let projects: Array<{ id: string; name: string }> = [];
  let contents: any[] = [];
  let googleAccounts: any[] = [];

  try {
    const [pList, cList, aList] = await Promise.all([
      prisma.project.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true },
      }),
      prisma.content.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          projectId: true,
          title: true,
          videoPrompt: true,
          aspectRatio: true,
          duration: true,
        },
      }),
      prisma.googleAccount.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, label: true, status: true, lockStatus: true, lastKnownFlowCredits: true },
      }),
    ]);

    projects = pList;
    contents = cList;
    googleAccounts = aList;
  } catch (error) {
    console.error("Fetch data for generation form error:", error);
  }

  return (
    <div className="p-8 max-w-3xl mx-auto w-full space-y-6">
      <Link
        href={projectId ? `/projects/${projectId}` : "/generations"}
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Quay lại {projectId ? "dự án" : "danh sách"}</span>
      </Link>

      <NewGenerationForm
        projects={projects}
        contents={contents}
        googleAccounts={googleAccounts}
        initialProjectId={projectId}
        initialContentId={contentId}
        initialAspectRatio={aspectRatio}
        initialDuration={duration}
      />
    </div>
  );
}
