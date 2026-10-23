import React, { Suspense } from "react";
import { prisma } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/session";
import TopicsClient from "@/components/topics/TopicsClient";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const user = await requirePageUser();
  const channels = await prisma.channel.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, automationEnabled: true, reviewHours: true, videosPerDay: true, niche: true, lastResearchAt: true, lastResearchNote: true },
  });
  return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Hộp chủ đề</h1>
        <p className="text-xs text-slate-500 mt-1">
          Chủ đề chờ duyệt sẽ tự được sản xuất khi hết thời gian duyệt của kênh. Xoá chủ đề dở là xong: hệ thống không làm và không gợi ý lại nó.
        </p>
      </div>
      <Suspense>
        <TopicsClient channels={channels} />
      </Suspense>
    </div>
  );
}
