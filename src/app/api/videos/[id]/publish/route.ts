import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { buildCaption } from "@/lib/publish/publisher";

export const dynamic = "force-dynamic";

const schema = z.object({
  socialAccountIds: z.array(z.string()).min(1).max(10),
  caption: z.string().max(2200).optional(),
  tiktokPrivacy: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]).optional(),
  /** post again to accounts this video was already published to (or failed on); the earlier post stays on the platform */
  repost: z.boolean().default(false),
});

/** A finished attempt (published or failed) can be replaced by a new one; an upload in progress never. */
const FINISHED = ["PUBLISHED", "FAILED"];

/** GET — publications of this video. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const pubs = await prisma.publication.findMany({
    where: { videoAssetId: id, videoAsset: { project: { ownerId: user.id } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, socialAccountId: true, platform: true, status: true, remoteUrl: true, errorMessage: true, publishedAt: true, privacy: true, socialAccount: { select: { displayName: true } } },
  });
  return NextResponse.json(pubs);
}

/** POST { socialAccountIds, caption?, tiktokPrivacy?, repost? } — queue this video for publishing (the worker uploads it). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  const video = await prisma.videoAsset.findFirst({ where: { id, project: { ownerId: user.id } }, include: { sequence: true, generation: { include: { content: true } } } });
  if (!video) return NextResponse.json({ error: "Không tìm thấy video." }, { status: 404 });
  const accounts = await prisma.socialAccount.findMany({ where: { id: { in: parsed.data.socialAccountIds }, ownerId: user.id } });
  if (accounts.length !== parsed.data.socialAccountIds.length) return NextResponse.json({ error: "Không tìm thấy tài khoản mạng xã hội." }, { status: 404 });

  const tags: string[] = JSON.parse(video.sequence?.tags || video.generation?.content?.tags || "[]");
  const caption = parsed.data.caption?.trim() || buildCaption(video.sequence?.caption || video.generation?.content?.description || "", tags);
  const created: string[] = [];
  const skipped: string[] = [];
  for (const acc of accounts) {
    if (parsed.data.repost) {
      await prisma.publication.deleteMany({ where: { videoAssetId: id, socialAccountId: acc.id, status: { in: FINISHED } } });
    }
    try {
      await prisma.publication.create({
        data: { videoAssetId: id, socialAccountId: acc.id, platform: acc.platform, caption, privacy: acc.platform === "TIKTOK" ? parsed.data.tiktokPrivacy ?? "SELF_ONLY" : null },
      });
      created.push(acc.displayName);
    } catch {
      skipped.push(acc.displayName); // already published / queued to this account
    }
  }
  return NextResponse.json({ created, skipped }, { status: created.length ? 202 : 409 });
}
