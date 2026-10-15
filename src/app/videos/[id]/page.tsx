import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ArrowLeft } from "lucide-react";
import VideoDetailViewClient from "@/components/videos/VideoDetailViewClient";
import { requirePageUser } from "@/lib/auth/session";
import { videoAssetsOf } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageUser();
  const { id } = await params;

  let video = null;
  try {
    video = await prisma.videoAsset.findFirst({
      where: { id, ...videoAssetsOf(user.id) },
      include: {
        project: true,
        generation: {
          include: {
            content: true,
            googleAccount: true,
          },
        },
      },
    });
  } catch (error) {
    console.error("Fetch video error:", error);
  }

  if (!video) {
    notFound();
  }

  return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
      <Link
        href="/videos"
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Quay lại Thư viện Video</span>
      </Link>

      <VideoDetailViewClient video={video as any} />
    </div>
  );
}
