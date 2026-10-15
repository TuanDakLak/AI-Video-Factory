import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateSceneSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

const LOCKED = ["QUEUED", "STARTING_BROWSER", "CHECKING_ACCOUNT", "OPENING_FLOW", "SUBMITTING", "GENERATING", "DOWNLOADING", "PROCESSING"];

/** Edit the prompt of one scene (only while it is not being rendered). A completed scene is reset so it can be re-rendered. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; sceneId: string }> }) {
  try {
    const { id, sceneId } = await params;
    const parsed = updateSceneSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const scene = await prisma.generation.findFirst({ where: { id: sceneId, sequenceId: id } });
    if (!scene) return NextResponse.json({ error: "Không tìm thấy cảnh." }, { status: 404 });
    if (LOCKED.includes(scene.status)) {
      return NextResponse.json({ error: "Cảnh đang được xử lý, không thể sửa prompt lúc này." }, { status: 409 });
    }
    const updated = await prisma.generation.update({
      where: { id: sceneId },
      data: { prompt: parsed.data.prompt.trim() },
      select: { id: true, prompt: true, status: true },
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Không thể cập nhật cảnh." }, { status: 500 });
  }
}
