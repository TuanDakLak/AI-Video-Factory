import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { TransitionEnum } from "@/lib/validations";
import { SequenceService } from "@/lib/sequence/sequence-service";
import { requireApiUser } from "@/lib/auth/session";
import { ownsGoogleAccount, ownsSequence } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

/** (Re)assemble the final video from the existing scene clips. Runs in the background; the UI polls the status. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const { id } = await params;
    if (!(await ownsSequence(user.id, id))) return NextResponse.json({ error: "Không tìm thấy video nhiều cảnh." }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const transition = TransitionEnum.safeParse(body?.transition);

    const seq = await prisma.sequence.findUnique({
      where: { id },
      include: { scenes: { select: { status: true, videoAsset: { select: { id: true } } } } },
    });
    if (!seq) return NextResponse.json({ error: "Không tìm thấy video nhiều cảnh." }, { status: 404 });
    if (seq.status === "ASSEMBLING") return NextResponse.json({ error: "Video đang được ghép." }, { status: 409 });
    if (seq.scenes.some((s) => !s.videoAsset)) {
      return NextResponse.json({ error: "Chưa đủ clip: cần hoàn tất tất cả các cảnh trước khi ghép." }, { status: 400 });
    }

    void SequenceService.assemble(id, transition.success ? { transition: transition.data } : {}).catch((e) =>
      console.error("[API] assemble error:", e)
    );
    return NextResponse.json({ success: true, message: "Đã bắt đầu ghép video." }, { status: 202 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Không thể ghép video." }, { status: 500 });
  }
}
