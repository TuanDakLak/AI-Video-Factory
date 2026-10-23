import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { normalizeTitle, produceTopic } from "@/lib/automation/topics";
import { GENRE_KEYS } from "@/lib/content/genres";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function load(userId: string, id: string) {
  return prisma.topic.findFirst({ where: { id, channel: { ownerId: userId } }, include: { channel: true } });
}

const EDITABLE = ["SUGGESTED", "APPROVED", "FAILED", "REJECTED"];

const editSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  angle: z.string().trim().max(1000).nullable().optional(),
  genre: z.enum(GENRE_KEYS).optional(),
  durationSec: z.union([z.literal(30), z.literal(60), z.literal(90)]).optional(),
});

/** Edit a topic that is not being produced. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const topic = await load(user.id, id);
  if (!topic) return NextResponse.json({ error: "Không tìm thấy chủ đề." }, { status: 404 });
  if (!EDITABLE.includes(topic.status)) return NextResponse.json({ error: "Chủ đề đang sản xuất hoặc đã xong, không sửa được." }, { status: 409 });
  const parsed = editSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  const { title, ...rest } = parsed.data;
  const updated = await prisma.topic.update({
    where: { id },
    data: { ...rest, ...(title ? { title, normalizedTitle: normalizeTitle(title) } : {}) },
  });
  return NextResponse.json(updated);
}

const actionSchema = z.object({ action: z.enum(["approve", "reject", "restore", "produce"]) });

/**
 * POST { action }:
 *  approve  — produce when the channel's schedule allows (no waiting for the review delay)
 *  reject   — never produce; kept so research never suggests it again
 *  restore  — back to the inbox with a fresh review delay
 *  produce  — write the script and start the video now (ignores the schedule, not the credit caps)
 */
export async function POST(req: NextRequest, { params }: Params) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const topic = await load(user.id, id);
  if (!topic) return NextResponse.json({ error: "Không tìm thấy chủ đề." }, { status: 404 });
  const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Thao tác không hợp lệ." }, { status: 400 });
  const now = new Date();
  const conflict = (msg: string) => NextResponse.json({ error: msg }, { status: 409 });

  switch (parsed.data.action) {
    case "approve": {
      if (!["SUGGESTED", "REJECTED"].includes(topic.status)) return conflict("Chủ đề không ở trạng thái chờ duyệt.");
      return NextResponse.json(await prisma.topic.update({ where: { id }, data: { status: "APPROVED", approvedAt: now, rejectedAt: null } }));
    }
    case "reject": {
      if (!["SUGGESTED", "APPROVED", "FAILED"].includes(topic.status)) return conflict("Chủ đề đang sản xuất hoặc đã xong.");
      return NextResponse.json(await prisma.topic.update({ where: { id }, data: { status: "REJECTED", rejectedAt: now } }));
    }
    case "restore": {
      if (topic.status !== "REJECTED") return conflict("Chủ đề không nằm trong mục đã xoá.");
      const hours = topic.channel.reviewHours;
      return NextResponse.json(
        await prisma.topic.update({
          where: { id },
          data: { status: "SUGGESTED", rejectedAt: null, approvedAt: null, autoApproveAt: hours > 0 ? new Date(now.getTime() + hours * 3600 * 1000) : null },
        })
      );
    }
    case "produce": {
      if (topic.status === "SUGGESTED") await prisma.topic.update({ where: { id }, data: { status: "APPROVED", approvedAt: now } });
      else if (!["APPROVED", "FAILED"].includes(topic.status)) return conflict("Chủ đề đang sản xuất hoặc đã xong.");
      const t = await produceTopic(id);
      return NextResponse.json(t, { status: t.status === "FAILED" ? 422 : 202 });
    }
  }
}

/** DELETE = reject (soft): the topic is kept so it is never suggested again. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const topic = await load(user.id, id);
  if (!topic) return NextResponse.json({ error: "Không tìm thấy chủ đề." }, { status: 404 });
  if (!["SUGGESTED", "APPROVED", "FAILED", "REJECTED"].includes(topic.status)) return NextResponse.json({ error: "Chủ đề đang sản xuất hoặc đã xong." }, { status: 409 });
  return NextResponse.json(await prisma.topic.update({ where: { id }, data: { status: "REJECTED", rejectedAt: new Date() } }));
}
