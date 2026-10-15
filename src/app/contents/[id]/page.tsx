import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ArrowLeft } from "lucide-react";
import ContentEditor from "@/components/contents/ContentEditor";
import { requirePageUser } from "@/lib/auth/session";
import { contentsOf, projectsOf } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

export default async function EditContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageUser();
  const { id } = await params;

  let content = null;
  let projects: any[] = [];
  try {
    const [c, p] = await Promise.all([
      prisma.content.findFirst({
        where: { id, ...contentsOf(user.id) },
      }),
      prisma.project.findMany({
        where: projectsOf(user.id),
        select: { id: true, name: true, topic: true, contentType: true },
      }),
    ]);
    content = c;
    projects = p;
  } catch (error) {
    console.error("Fetch content error:", error);
  }

  if (!content) {
    notFound();
  }

  return (
    <div className="p-8 max-w-4xl mx-auto w-full space-y-6">
      <Link
        href={`/projects/${content.projectId}`}
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Quay lại dự án</span>
      </Link>

      <ContentEditor
        projects={projects}
        initialData={{
          ...content,
          tags: content.tags,
        }}
      />
    </div>
  );
}
