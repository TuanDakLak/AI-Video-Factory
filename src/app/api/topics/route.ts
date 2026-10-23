import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { addTopic } from "@/lib/automation/topics";
import { GENRE_KEYS } from "@/lib/content/genres";

export const dynamic = "force-dynamic";

const STATUSES = ["SUGGESTED", "APPROVED", "PRODUCING", "READY", "FAILED", "REJECTED"] as const;

/** GET ?channelId=&status= — the caller's topics (owner scoped through the channel). */
export async function GET(req: NextRequest) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const channelId = req.nextUrl.searchParams.get("channelId") || undefined;
  const status = req.nextUrl.searchParams.get("status");
  const topics = await prisma.topic.findMany({
    where: {
      channel: { ownerId: user.id },
      ...(channelId ? { channelId } : {}),
      ...(status && (STATUSES as readonly string[]).includes(status) ? { status: status as (typeof STATUSES)[number] } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
    include: {
      channel: { select: { id: true, name: true } },
      sequence: { select: { id: true, status: true, finalVideo: { select: { id: true, duration: true } } } },
    },
  });
  return NextResponse.json(topics);
}

const createSchema = z.object({
  channelId: z.string().min(1),
  title: z.string().trim().min(3, "Chủ đề quá ngắn").max(200),
  angle: z.string().trim().max(1000).optional(),
  genre: z.enum(GENRE_KEYS).optional(),
  durationSec: z.union([z.literal(30), z.literal(60), z.literal(90)]).optional(),
});

/** Manual topic: the person typing it has approved it already. */
export async function POST(req: NextRequest) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  const channel = await prisma.channel.findFirst({ where: { id: parsed.data.channelId, ownerId: user.id } });
  if (!channel) return NextResponse.json({ error: "Không tìm thấy kênh." }, { status: 404 });
  const r = await addTopic(channel, { ...parsed.data, source: "MANUAL", approved: true });
  if (r.status === "duplicate") {
    return NextResponse.json({ error: `Trùng với chủ đề đã có: "${r.existing.title}" (${r.existing.status}).`, existingId: r.existing.id }, { status: 409 });
  }
  return NextResponse.json(r.topic, { status: 201 });
}
