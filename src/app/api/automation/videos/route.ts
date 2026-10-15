import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { automationRequestSchema } from "@/lib/validations";
import { runAutomation } from "@/lib/sequence/automation";

export const dynamic = "force-dynamic";

/** Optional shared secret: set AUTOMATION_API_KEY and send it as header x-api-key. */
function unauthorized(req: NextRequest): boolean {
  const key = process.env.AUTOMATION_API_KEY;
  return !!key && req.headers.get("x-api-key") !== key;
}

/**
 * POST { topic | topics[], presetId?, totalDuration?, autostart?, dryRunOnly? }
 * Creates one video per topic from the channel preset and queues it (credit caps / budgets apply). Returns one result per topic.
 */
export async function POST(req: NextRequest) {
  if (unauthorized(req)) return NextResponse.json({ error: "Sai x-api-key." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const parsed = automationRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  try {
    const results = await runAutomation(parsed.data);
    return NextResponse.json({ results }, { status: results.every((r) => r.status === "ERROR") ? 400 : 202 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Không chạy được." }, { status: 400 });
  }
}

/** GET ?limit=20 — status of the latest videos (poll this from your scheduler). */
export async function GET(req: NextRequest) {
  if (unauthorized(req)) return NextResponse.json({ error: "Sai x-api-key." }, { status: 401 });
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "20", 10) || 20));
  const rows = await prisma.sequence.findMany({
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
