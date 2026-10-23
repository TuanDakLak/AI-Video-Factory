import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Disconnect: deletes the stored (encrypted) tokens and the account's publication history; also unlinks it from channels. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const acc = await prisma.socialAccount.findFirst({ where: { id, ownerId: user.id } });
  if (!acc) return NextResponse.json({ error: "Không tìm thấy tài khoản." }, { status: 404 });
  if (await prisma.publication.count({ where: { socialAccountId: id, status: "UPLOADING" } })) {
    return NextResponse.json({ error: "Đang tải video lên tài khoản này, thử lại sau ít phút." }, { status: 409 });
  }
  await prisma.socialAccount.delete({ where: { id } });
  const channels = await prisma.channel.findMany({ where: { ownerId: user.id }, select: { id: true, publishTargets: true } });
  for (const c of channels) {
    const targets: string[] = JSON.parse(c.publishTargets || "[]");
    if (targets.includes(id)) await prisma.channel.update({ where: { id: c.id }, data: { publishTargets: JSON.stringify(targets.filter((t) => t !== id)) } });
  }
  return NextResponse.json({ success: true });
}
