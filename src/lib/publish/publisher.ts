import type { Publication, SocialAccount } from "@prisma/client";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { notifyWebhook } from "@/lib/automation/notify";
import { decryptSecret, encryptSecret } from "./crypto";
import { Http, TikTokError, refreshTikTokToken, tiktokCreatorInfo, tiktokPublish, tiktokStatus } from "./tiktok";
import { FacebookError, facebookPublishReel, facebookReelStatus } from "./facebook";

/**
 * Publishing pipeline: READY topic of an auto-publish channel -> one Publication per target account -> upload ->
 * poll until the platform confirms. One upload per tick (uploads are large, platforms rate-limit), polls are cheap.
 */
export const MAX_ATTEMPTS = 3;
const POLL_TIMEOUT_MS = 2 * 3600 * 1000;

const arr = <T>(json: string, fallback: T[] = []): T[] => {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

/** Caption + hashtags not already in it (the platforms detect hashtags in the text). */
export function buildCaption(caption: string | null | undefined, tags: string[]): string {
  const text = (caption || "").trim();
  const missing = tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).filter((t) => !text.toLowerCase().includes(t.toLowerCase()));
  return [text, missing.join(" ")].filter(Boolean).join("\n\n").slice(0, 2200);
}

/** Platform rules checked before spending an upload. */
export function platformProblem(platform: string, v: { duration: number | null; width: number | null; height: number | null }, maxDurationSec?: number): string | null {
  const d = v.duration ?? 0;
  if (platform === "FACEBOOK_PAGE") {
    if (d < 3 || d > 90) return `Facebook Reels chỉ nhận video 3–90 giây (video này ${d.toFixed(1)}s).`;
    if (v.width && v.height && Math.abs(v.width / v.height - 9 / 16) > 0.02) return "Facebook Reels cần video dọc 9:16.";
    if (v.width && v.height && (v.width < 540 || v.height < 960)) return "Facebook Reels cần độ phân giải tối thiểu 540x960.";
  }
  if (platform === "TIKTOK" && maxDurationSec && d > maxDurationSec) return `Tài khoản TikTok này chỉ đăng được video tối đa ${maxDurationSec}s.`;
  return null;
}

/** Valid access token for the account, refreshing TikTok's 24 h token when it is about to expire. */
export async function accessTokenFor(acc: SocialAccount, http: Http = fetch): Promise<string> {
  if (acc.platform === "TIKTOK" && acc.refreshToken && (!acc.tokenExpiresAt || acc.tokenExpiresAt.getTime() - Date.now() < 10 * 60 * 1000)) {
    const t = await refreshTikTokToken(decryptSecret(acc.refreshToken), http);
    await prisma.socialAccount.update({
      where: { id: acc.id },
      data: {
        accessToken: encryptSecret(t.accessToken),
        refreshToken: encryptSecret(t.refreshToken), // TikTok may rotate it
        tokenExpiresAt: t.expiresAt,
        refreshExpiresAt: t.refreshExpiresAt,
        status: "CONNECTED",
        lastError: null,
      },
    });
    return t.accessToken;
  }
  return decryptSecret(acc.accessToken);
}

async function fail(pub: Publication, acc: SocialAccount, e: any): Promise<void> {
  const msg = String(e?.message || e).slice(0, 1000);
  const transient = e instanceof TikTokError || e instanceof FacebookError ? e.transient : false;
  const auth = e instanceof TikTokError || e instanceof FacebookError ? e.authProblem : false;
  if (auth) {
    await prisma.socialAccount.update({ where: { id: acc.id }, data: { status: "EXPIRED", lastError: msg } });
  }
  const retry = transient && pub.attempts < MAX_ATTEMPTS;
  await prisma.publication.update({ where: { id: pub.id }, data: { status: retry ? "QUEUED" : "FAILED", errorMessage: msg } });
  if (!retry) await notifyWebhook("publication.failed", { publicationId: pub.id, platform: pub.platform, account: acc.displayName, error: msg }).catch(() => {});
}

/** Upload one queued publication. */
export async function startPublication(pubId: string, http: Http = fetch): Promise<Publication> {
  const claim = await prisma.publication.updateMany({ where: { id: pubId, status: "QUEUED" }, data: { status: "UPLOADING", attempts: { increment: 1 } } });
  const pub = await prisma.publication.findUniqueOrThrow({ where: { id: pubId }, include: { socialAccount: true, videoAsset: true } });
  if (claim.count === 0) return pub;
  const acc = pub.socialAccount;
  try {
    if (acc.status !== "CONNECTED") throw new Error(`Tài khoản ${acc.displayName} cần kết nối lại (${acc.status}).`);
    const file = storage.getFilePath(pub.videoAsset.storageKey);
    if (!storage.fileExists(pub.videoAsset.storageKey)) throw new Error("File video không còn trên máy chủ.");
    const token = await accessTokenFor(acc, http);
    let remoteId: string;
    if (pub.platform === "TIKTOK") {
      const info = await tiktokCreatorInfo(token, http);
      const problem = platformProblem("TIKTOK", pub.videoAsset, info.max_video_post_duration_sec);
      if (problem) throw new Error(problem);
      const options = info.privacy_level_options ?? [];
      const wanted = pub.privacy || "SELF_ONLY";
      // must be one of the creator's options; unaudited apps only get private posting
      const privacy = options.includes(wanted) ? wanted : options.includes("SELF_ONLY") ? "SELF_ONLY" : options[0];
      if (!privacy) throw new Error("TikTok không trả về chế độ riêng tư nào cho tài khoản này.");
      remoteId = await tiktokPublish(token, { filePath: file, title: pub.caption, privacy, isAigc: true }, http);
    } else {
      const problem = platformProblem("FACEBOOK_PAGE", pub.videoAsset);
      if (problem) throw new Error(problem);
      remoteId = await facebookPublishReel(acc.externalId, token, file, pub.caption, http);
    }
    return prisma.publication.update({ where: { id: pub.id }, data: { status: "PROCESSING", remoteId, errorMessage: null } });
  } catch (e) {
    await fail(pub, acc, e);
    return prisma.publication.findUniqueOrThrow({ where: { id: pub.id } });
  }
}

/** Ask the platform whether an uploaded post went live. */
export async function pollPublication(pubId: string, http: Http = fetch): Promise<Publication> {
  const pub = await prisma.publication.findUniqueOrThrow({ where: { id: pubId }, include: { socialAccount: true } });
  if (pub.status !== "PROCESSING" || !pub.remoteId) return pub;
  const acc = pub.socialAccount;
  const done = (data: Partial<Publication>) => prisma.publication.update({ where: { id: pub.id }, data });
  try {
    const token = await accessTokenFor(acc, http);
    if (pub.platform === "TIKTOK") {
      const s = await tiktokStatus(token, pub.remoteId, http);
      if (s.status === "PUBLISH_COMPLETE") {
        const postId = s.publicaly_available_post_id?.[0];
        await notifyWebhook("publication.published", { publicationId: pub.id, platform: "TIKTOK", account: acc.displayName }).catch(() => {});
        return done({ status: "PUBLISHED", publishedAt: new Date(), remoteUrl: postId ? `https://www.tiktok.com/@/video/${postId}` : null });
      }
      if (s.status === "FAILED") return done({ status: "FAILED", errorMessage: `TikTok từ chối: ${s.fail_reason || "không rõ lý do"}` });
    } else {
      const s = await facebookReelStatus(pub.remoteId, token, http);
      if (s.video_status === "ready" || s.publishing_phase?.status === "complete") {
        await notifyWebhook("publication.published", { publicationId: pub.id, platform: "FACEBOOK_PAGE", account: acc.displayName }).catch(() => {});
        return done({ status: "PUBLISHED", publishedAt: new Date(), remoteUrl: `https://www.facebook.com/reel/${pub.remoteId}` });
      }
      if (s.video_status === "error" || s.processing_phase?.status === "error" || s.publishing_phase?.status === "error") {
        return done({ status: "FAILED", errorMessage: `Facebook từ chối: ${s.processing_phase?.error?.message || s.publishing_phase?.error?.message || "lỗi xử lý video"}` });
      }
    }
    if (Date.now() - pub.updatedAt.getTime() > POLL_TIMEOUT_MS) return done({ status: "FAILED", errorMessage: "Nền tảng không xác nhận bài đăng sau 2 giờ." });
    return pub;
  } catch (e: any) {
    if (e instanceof TikTokError || e instanceof FacebookError) {
      if (e.authProblem) await prisma.socialAccount.update({ where: { id: acc.id }, data: { status: "EXPIRED", lastError: e.message } });
      if (e.transient) return pub; // poll again next tick
    }
    return done({ status: "FAILED", errorMessage: String(e?.message || e).slice(0, 1000) });
  }
}

/** Create publications for finished videos of auto-publish channels (idempotent: one per video × account). */
export async function queueAutoPublications(): Promise<number> {
  const channels = await prisma.channel.findMany({ where: { autoPublish: true, NOT: { publishTargets: "[]" } } });
  let n = 0;
  for (const ch of channels) {
    const targets = await prisma.socialAccount.findMany({ where: { id: { in: arr<string>(ch.publishTargets) }, ownerId: ch.ownerId } });
    if (!targets.length) continue;
    const ready = await prisma.topic.findMany({
      where: { channelId: ch.id, status: "READY", sequence: { finalVideo: { isNot: null } } },
      include: { sequence: { include: { finalVideo: { select: { id: true, publications: { select: { socialAccountId: true } } } } } } },
    });
    for (const t of ready) {
      const v = t.sequence?.finalVideo;
      if (!v) continue;
      const caption = buildCaption(t.sequence!.caption, arr<string>(t.sequence!.tags));
      for (const acc of targets) {
        if (v.publications.some((p) => p.socialAccountId === acc.id)) continue;
        await prisma.publication
          .create({ data: { videoAssetId: v.id, socialAccountId: acc.id, platform: acc.platform, caption, privacy: acc.platform === "TIKTOK" ? ch.tiktokPrivacy : null } })
          .then(() => n++)
          .catch(() => {}); // unique (video, account): already queued by a concurrent tick
      }
    }
  }
  return n;
}

export interface PublishReport {
  queued: number;
  started: string[];
  polled: number;
}

/** One pass: queue new auto-publications, upload ONE, poll up to 10 in-flight posts. */
export async function publishTick(http: Http = fetch): Promise<PublishReport> {
  const queued = await queueAutoPublications();
  const started: string[] = [];
  const next = await prisma.publication.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, include: { socialAccount: true } });
  if (next) {
    const p = await startPublication(next.id, http);
    started.push(`${next.platform} ${next.socialAccount.displayName}: ${p.status}${p.errorMessage ? ` (${p.errorMessage})` : ""}`);
  }
  const inflight = await prisma.publication.findMany({ where: { status: "PROCESSING" }, orderBy: { updatedAt: "asc" }, take: 10, select: { id: true } });
  for (const p of inflight) await pollPublication(p.id, http);
  return { queued, started, polled: inflight.length };
}
