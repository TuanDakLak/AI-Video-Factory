import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import NewSequenceForm from "@/components/sequences/NewSequenceForm";
import { requirePageUser } from "@/lib/auth/session";
import { googleAccountsOf } from "@/lib/auth/ownership";
import { listChannels } from "@/lib/channels";

export const dynamic = "force-dynamic";

export default async function NewSequencePage({ searchParams }: { searchParams: Promise<{ channelId?: string }> }) {
  const user = await requirePageUser();
  const { channelId } = await searchParams;

  let channels: Awaited<ReturnType<typeof listChannels>> = [];
  let googleAccounts: Array<{ id: string; name: string; status: string; lastKnownFlowCredits: number | null }> = [];
  try {
    [channels, googleAccounts] = await Promise.all([
      listChannels(user.id),
      prisma.googleAccount.findMany({
        where: googleAccountsOf(user.id),
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, status: true, lastKnownFlowCredits: true },
      }),
    ]);
  } catch (error) {
    console.error("Fetch data for video form error:", error);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto w-full space-y-6">
      <Link href="/sequences" className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Quay lại</span>
      </Link>
      <NewSequenceForm
        channels={channels.map((c) => ({
          id: c.id,
          name: c.name,
          aspectRatio: c.aspectRatio,
          model: c.model,
          clipSeconds: c.clipSeconds,
          transition: c.transition,
          refCount: c.referenceImageKeys.length,
          googleAccountId: c.googleAccountId,
        }))}
        googleAccounts={googleAccounts}
        initialChannelId={channelId}
      />
    </div>
  );
}
