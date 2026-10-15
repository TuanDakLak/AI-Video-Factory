import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { automationRequestSchema } from "@/lib/validations";
import { runAutomation } from "@/lib/sequence/automation";
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
 * POST { topic | topics[], presetId?, totalDuration?, autostart?, dryRunOnly? }
 * Creates one video per topic from the channel preset and queues it (credit caps / budgets apply). Returns one result per topic.
 */
export async function POST(req: NextRequest) {
  const who = await caller(req);
  if (who instanceof NextResponse) return who;
  const rl = await hit(`automation:${who.id}`, 60, 3600);
  if (!rl.allowed) return NextResponse.json({ error: "Đã vượt giới hạn gọi API tự động." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const body = await req.json().catch(() => ({}));
  const parsed = automationRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  try {
    const results = await runAutomation(parsed.data, who.id);
    return NextResponse.json({ results }, { status: results.every((r) => r.status === "ERROR") ? 400 : 202 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Không chạy được." }, { status: 400 });
  }
}

/** GET ?limit=20 — status of the caller's latest videos (poll this from your scheduler). */
export async function GET(req: NextRequest) {
  const who = await caller(req);
  if (who instanceof NextResponse) return who;
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "20", 10) || 20));
  const rows = await prisma.sequence.findMany({
    where: { project: { ownerId: who.id } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, title: true, status: true, errorMessage: true, totalDuration: true, createdAt: true, continuity: true,
      finalVideo: { select: { id: true, duration: true } },
      scenes: { select: { status: true, videoAsset: { select: { id: true } } } },
    },
  });
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id, title: r.title, status: r.status, message: r.errorMessage, mode: r.continuity,
      clips: `${r.scenes.filter((s) => s.videoAsset).length}/${r.scenes.length}`,
      finalVideoId: r.finalVideo?.id ?? null, duration: r.finalVideo?.duration ?? null, createdAt: r.createdAt,
    }))
  );
}
