import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { hit } from "@/lib/auth/rate-limit";
import { researchChannel } from "@/lib/research/researcher";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST — research topics for this channel now (free signals + one LLM call). Body: { count?: 1..10 } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const channel = await prisma.channel.findFirst({ where: { id, ownerId: user.id } });
  if (!channel) return NextResponse.json({ error: "Không tìm thấy kênh." }, { status: 404 });
  // each run is one LLM call: keep well inside the free tier
  const rl = await hit(`research:${user.id}`, 10, 3600);
  if (!rl.allowed) return NextResponse.json({ error: "Đã tìm chủ đề nhiều lần trong giờ qua, thử lại sau." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const body = await req.json().catch(() => ({}));
  const count = Number.isInteger(body?.count) ? Math.min(10, Math.max(1, body.count)) : 5;
  const r = await researchChannel(channel, { count });
  return NextResponse.json(r, { status: r.created > 0 || r.duplicates > 0 ? 200 : 422 });
}
