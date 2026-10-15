import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { ArrowLeft } from "lucide-react";
import ContentEditor from "@/components/contents/ContentEditor";
import { requirePageUser } from "@/lib/auth/session";
import { projectsOf } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

export default async function NewContentPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const user = await requirePageUser();
  const { projectId } = await searchParams;

  let projects: any[] = [];
  try {
    projects = await prisma.project.findMany({
      where: projectsOf(user.id),
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, topic: true, contentType: true },
    });
  } catch (error) {
    console.error("Fetch projects error:", error);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto w-full space-y-6">
      <Link
        href={projectId ? `/projects/${projectId}` : "/contents"}
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Quay lại {projectId ? "dự án" : "danh sách kịch bản"}</span>
      </Link>

      <ContentEditor projects={projects} initialProjectId={projectId} />
    </div>
  );
}
