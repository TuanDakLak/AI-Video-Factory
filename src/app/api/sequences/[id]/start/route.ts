import { NextRequest, NextResponse } from "next/server";
import { startSequenceSchema } from "@/lib/validations";
import { SequenceService } from "@/lib/sequence/sequence-service";
import { requireApiUser } from "@/lib/auth/session";
import { ownsGoogleAccount, ownsSequence } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

/** Start or resume: queues every scene without a finished clip (or just `sceneIds`). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const { id } = await params;
    if (!(await ownsSequence(user.id, id))) return NextResponse.json({ error: "Không tìm thấy video nhiều cảnh." }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const parsed = startSequenceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const result = await SequenceService.start(id, parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Không thể khởi động." }, { status: 400 });
  }
}
