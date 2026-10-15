import { NextRequest, NextResponse } from "next/server";
import { SequenceService } from "@/lib/sequence/sequence-service";

export const dynamic = "force-dynamic";

/** Re-plan a clip-less sequence as per-clip Veo API generations (8s each) and start it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const r = await SequenceService.switchToApi(id, { autostart: body.autostart !== false });
    return NextResponse.json({ success: true, ...r, message: `Đã chuyển sang Veo API: ${r.sceneCount} clip, ~${r.estimateUsd} USD.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Không thể chuyển sang Veo API." }, { status: 400 });
  }
}
