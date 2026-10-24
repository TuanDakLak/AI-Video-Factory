import { NextRequest, NextResponse } from "next/server";
import { createChannel, listChannels, channelInputSchema } from "@/lib/channels";
import { requireApiUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(await listChannels(user.id));
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  const parsed = channelInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  try {
    return NextResponse.json(await createChannel(parsed.data, user.id), { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Không tạo được kênh." }, { status: 400 });
  }
}
