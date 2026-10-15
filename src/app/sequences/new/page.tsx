import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import NewSequenceForm from "@/components/sequences/NewSequenceForm";
import { requirePageUser } from "@/lib/auth/session";
import { contentsOf, googleAccountsOf, projectsOf } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

export default async function NewSequencePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; contentId?: string }>;
}) {
  const user = await requirePageUser();
  const { projectId, contentId } = await searchParams;

  let projects: Array<{ id: string; name: string }> = [];
  let contents: any[] = [];
  let googleAccounts: any[] = [];
  try {
    [projects, contents, googleAccounts] = await Promise.all([
      prisma.project.findMany({ where: projectsOf(user.id), orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
      prisma.content.findMany({
        where: contentsOf(user.id),
        orderBy: { createdAt: "desc" },
        select: { id: true, projectId: true, title: true, aspectRatio: true, duration: true },
      }),
      prisma.googleAccount.findMany({
        where: googleAccountsOf(user.id),
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, status: true, lastKnownFlowCredits: true },
      }),
    ]);
  } catch (error) {
    console.error("Fetch data for sequence form error:", error);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
      <Link
        href={projectId ? `/projects/${projectId}` : "/sequences"}
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Quay lại</span>
      </Link>
      <NewSequenceForm
        projects={projects}
        contents={contents}
        googleAccounts={googleAccounts}
        initialProjectId={projectId}
        initialContentId={contentId}
      />
    </div>
  );
}
