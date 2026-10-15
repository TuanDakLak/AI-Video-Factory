import { NextRequest, NextResponse } from "next/server";
import { getPublishPackage } from "@/lib/publish/package";

export const dynamic = "force-dynamic";

/** Everything the publish step needs for one video: file, title, caption, tags and per-platform readiness. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const pkg = await getPublishPackage(id);
    if (!pkg) return NextResponse.json({ error: "Không tìm thấy video." }, { status: 404 });
    return NextResponse.json(pkg);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Không thể tạo gói đăng bài." }, { status: 500 });
  }
}
