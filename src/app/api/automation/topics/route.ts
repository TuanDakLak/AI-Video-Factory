import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { automationTopicsSchema } from "@/lib/validations";
import { addTopic } from "@/lib/automation/topics";
import { getSessionUser } from "@/lib/auth/session";
import { hit } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

const sha = (s: string) => createHash("sha256").update(s).digest();

/**
 * Who is calling: a signed-in user (session cookie), or an unattended scheduler sending `x-api-key: AUTOMATION_API_KEY`,
 * which acts as the user AUTOMATION_OWNER_EMAIL. Without AUTOMATION_API_KEY the endpoint only accepts signed-in users.
 */
async function caller(req: NextRequest): Promise<{ id: string } | NextResponse> {
  const key = req.headers.get("x-api-key");
  if (key) {
    const expected = process.env.AUTOMATION_API_KEY || "";
    const ownerEmail = (process.env.AUTOMATION_OWNER_EMAIL || "").trim().toLowerCase();
    // constant-time comparison of fixed-length digests
    if (expected.length < 24 || !ownerEmail || !timingSafeEqual(sha(key), sha(expected))) {
      return NextResponse.json({ error: "Sai x-api-key." }, { status: 401 });
    }
    const owner = await prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true, disabled: true } });
    if (!owner || owner.disabled) return NextResponse.json({ error: "AUTOMATION_OWNER_EMAIL không phải tài khoản hợp lệ." }, { status: 401 });
    return { id: owner.id };
  }
  const user = await getSessionUser();
  return user ? { id: user.id } : NextResponse.json({ error: "Bạn cần đăng nhập hoặc gửi x-api-key.", code: "UNAUTHENTICATED" }, { status: 401 });
}

/**
 * POST { channelId, topics: [{ title, angle?, durationSec? }], approved? } — add topics to a channel's inbox from an external
 * scheduler / feed. They follow the normal flow: review delay (unless approved), then the channel's daily schedule and budget.
 * Duplicates of any earlier topic (rejected ones included) are skipped.
 */
export async function POST(req: NextRequest) {
  const who = await caller(req);
  if (who instanceof NextResponse) return who;
  const rl = await hit(`automation:${who.id}`, 60, 3600);
  if (!rl.allowed) return NextResponse.json({ error: "Đã vượt giới hạn gọi API tự động." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const parsed = automationTopicsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  const channel = await prisma.channel.findFirst({ where: { id: parsed.data.channelId, ownerId: who.id } });
  if (!channel) return NextResponse.json({ error: "Không tìm thấy kênh." }, { status: 404 });
  const results = [];
  for (const t of parsed.data.topics) {
    const r = await addTopic(channel, { ...t, source: "API", approved: parsed.data.approved });
    results.push(r.status === "created" ? { title: t.title, status: "created", id: r.topic.id } : { title: t.title, status: "duplicate", existing: r.existing.title });
  }
  return NextResponse.json({ results }, { status: results.some((r) => r.status === "created") ? 201 : 200 });
}

/** GET ?channelId=&limit=20 — the caller's latest topics and their video (poll this from your scheduler). */
export async function GET(req: NextRequest) {
  const who = await caller(req);
  if (who instanceof NextResponse) return who;
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "20", 10) || 20));
  const channelId = req.nextUrl.searchParams.get("channelId") || undefined;
  const rows = await prisma.topic.findMany({
    where: { channel: { ownerId: who.id }, ...(channelId ? { channelId } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, title: true, status: true, errorMessage: true, durationSec: true, createdAt: true, channelId: true,
      sequence: { select: { id: true, status: true, finalVideo: { select: { id: true, duration: true } } } },
    },
  });
  return NextResponse.json(
    rows.map((t) => ({
      id: t.id, channelId: t.channelId, title: t.title, status: t.status, message: t.errorMessage, durationSec: t.durationSec,
      videoStatus: t.sequence?.status ?? null, finalVideoId: t.sequence?.finalVideo?.id ?? null, createdAt: t.createdAt,
    }))
  );
}
