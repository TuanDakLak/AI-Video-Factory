import type { Channel, Topic } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SequenceService } from "@/lib/sequence/sequence-service";
import { CREDITS_SPENT_EVENT, startOfLocalDay } from "@/lib/sequence/credit-guard";
import { notifyWebhook } from "@/lib/automation/notify";
import { toPreset } from "@/lib/presets";
import { GENRE_KEYS, GenreKey } from "@/lib/content/genres";
import { clipCount, scriptToBrief, writeScript } from "@/lib/content/script-writer";
import { AGENT_CREDITS_PER_CLIP } from "@/lib/sequence/agent-prompt";

/**
 * Topic inbox + production scheduler.
 *
 *   SUGGESTED --(autoApproveAt passes / user approves)--> APPROVED --(channel schedule)--> PRODUCING --> READY
 *        \__ user deletes --> REJECTED (kept: never suggested again)                         \--> FAILED
 *
 * The user only reviews: deleting a topic before its review delay ends means it is never produced.
 */

// ---------------------------------------------------------------- duplicates

export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(["la", "va", "cua", "nhung", "cac", "mot", "the", "a", "an", "of", "and", "in", "on", "nhat", "top", "video"]);
function words(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter((w) => w.length > 1 && !STOP.has(w)));
}

/** Jaccard similarity of the meaningful words of two normalized titles. */
export function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (A.size === 0 || B.size === 0) return a === b ? 1 : 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export const DUPLICATE_THRESHOLD = 0.7;

/** Same or near-same topic already in this channel (any status, rejected ones included) in the last 180 days. */
export async function findDuplicate(channelId: string, title: string): Promise<Topic | null> {
  const norm = normalizeTitle(title);
  const since = new Date(Date.now() - 180 * 24 * 3600 * 1000);
  const recent = await prisma.topic.findMany({ where: { channelId, createdAt: { gte: since } } });
  return recent.find((t) => t.normalizedTitle === norm || similarity(t.normalizedTitle, norm) >= DUPLICATE_THRESHOLD) ?? null;
}

// ---------------------------------------------------------------- inbox

const arr = <T>(json: string, fallback: T[]): T[] => {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) && v.length ? v : fallback;
  } catch {
    return fallback;
  }
};

/** Rotate through the channel's genres/durations so consecutive topics vary. */
async function pickDefaults(channel: Channel): Promise<{ genre: GenreKey; durationSec: number }> {
  const genres = arr<GenreKey>(channel.genres, ["short_film"]).filter((g) => (GENRE_KEYS as readonly string[]).includes(g));
  const durations = arr<number>(channel.durations, [30]);
  const n = await prisma.topic.count({ where: { channelId: channel.id } });
  return { genre: genres[n % genres.length] ?? "short_film", durationSec: durations[n % durations.length] ?? 30 };
}

export interface NewTopic {
  title: string;
  angle?: string | null;
  genre?: GenreKey;
  durationSec?: number;
  source?: "MANUAL" | "AI_RESEARCH" | "API";
  sourceUrls?: string[];
  score?: number | null;
  /** manual topics are approved by the person typing them */
  approved?: boolean;
}

export type AddTopicResult = { status: "created"; topic: Topic } | { status: "duplicate"; existing: Topic };

export async function addTopic(channel: Channel, t: NewTopic): Promise<AddTopicResult> {
  const title = t.title.trim().slice(0, 200);
  const dup = await findDuplicate(channel.id, title);
  if (dup) return { status: "duplicate", existing: dup };
  const d = await pickDefaults(channel);
  const now = new Date();
  const approved = !!t.approved;
  const topic = await prisma.topic.create({
    data: {
      channelId: channel.id,
      title,
      normalizedTitle: normalizeTitle(title),
      angle: t.angle?.trim() || null,
      genre: t.genre ?? d.genre,
      durationSec: t.durationSec ?? d.durationSec,
      source: t.source ?? "MANUAL",
      sourceUrls: JSON.stringify((t.sourceUrls ?? []).slice(0, 10)),
      score: t.score ?? null,
      status: approved ? "APPROVED" : "SUGGESTED",
      approvedAt: approved ? now : null,
      autoApproveAt: !approved && channel.reviewHours > 0 ? new Date(now.getTime() + channel.reviewHours * 3600 * 1000) : null,
    },
  });
  return { status: "created", topic };
}

// ---------------------------------------------------------------- production

/** Every channel files its videos under its own project (created on first use). */
async function ensureChannelProject(channel: Channel): Promise<string> {
  if (channel.projectId) {
    const p = await prisma.project.findFirst({ where: { id: channel.projectId, ownerId: channel.ownerId }, select: { id: true } });
    if (p) return p.id;
  }
  const p = await prisma.project.create({
    data: { ownerId: channel.ownerId, name: `Kênh: ${channel.name}`, topic: channel.niche || channel.name, description: "Video do hệ thống tự động tạo cho kênh." },
  });
  await prisma.channel.update({ where: { id: channel.id }, data: { projectId: p.id } });
  return p.id;
}

async function hasConnectedAccount(channel: Channel): Promise<boolean> {
  return !!(await prisma.googleAccount.findFirst({
    where: { ownerId: channel.ownerId, status: "CONNECTED", ...(channel.googleAccountId ? { id: channel.googleAccountId } : {}) },
    select: { id: true },
  }));
}

/** Script (LLM) -> Sequence -> queued for Flow. The topic becomes PRODUCING, or FAILED with the reason. */
export async function produceTopic(topicId: string): Promise<Topic> {
  const topic = await prisma.topic.findUniqueOrThrow({ where: { id: topicId }, include: { channel: true } });
  if (topic.status !== "APPROVED" && topic.status !== "FAILED") throw new Error("Chủ đề này không ở trạng thái chờ sản xuất.");
  const channel = topic.channel;
  const claim = await prisma.topic.updateMany({
    where: { id: topic.id, status: topic.status },
    data: { status: "PRODUCING", startedAt: new Date(), errorMessage: null },
  });
  if (claim.count === 0) throw new Error("Chủ đề đang được xử lý.");

  try {
    const preset = toPreset(channel);
    const script = await writeScript({
      topic: topic.title,
      angle: topic.angle,
      genre: topic.genre,
      durationSec: topic.durationSec,
      clipSeconds: channel.clipSeconds,
      language: channel.language,
      channelName: channel.name,
      niche: channel.niche,
      styleBible: channel.styleBible,
      hashtags: preset.hashtags,
    });
    const projectId = await ensureChannelProject(channel);
    const n = clipCount(topic.durationSec, channel.clipSeconds);
    const { sequence } = await SequenceService.create(
      {
        projectId,
        title: script.title,
        brief: scriptToBrief(script, topic.genre, channel.language),
        totalDuration: n * channel.clipSeconds,
        clipSeconds: channel.clipSeconds,
        aspectRatio: preset.aspectRatio,
        model: channel.model,
        transition: preset.transition,
        continuity: "FLOW_AGENT",
        presetId: channel.id,
        googleAccountId: channel.googleAccountId ?? undefined,
        language: channel.language,
        genre: topic.genre,
      },
      channel.ownerId,
      { caption: script.caption, tags: script.hashtags }
    );
    // a fallback script still produces a video; the note tells the user why it may be less tailored
    await prisma.topic.update({ where: { id: topic.id }, data: { sequenceId: sequence.id, errorMessage: script.warning ? `Lưu ý: ${script.warning}` : null } });
    await SequenceService.start(sequence.id);
    return prisma.topic.findUniqueOrThrow({ where: { id: topic.id } });
  } catch (e: any) {
    const msg = (e?.message || "Không sản xuất được chủ đề.").slice(0, 1000);
    const failed = await prisma.topic.update({ where: { id: topic.id }, data: { status: "FAILED", errorMessage: msg, finishedAt: new Date() } });
    await notifyWebhook("topic.failed", { topicId: topic.id, channelId: channel.id, title: topic.title, error: msg }).catch(() => {});
    return failed;
  }
}

// ---------------------------------------------------------------- scheduler

/** Credits approved today for videos of this channel (ledger: CREDITS_SPENT events). */
export async function channelCreditsToday(channelId: string): Promise<number> {
  const rows = await prisma.generationEvent.findMany({
    where: { type: CREDITS_SPENT_EVENT, createdAt: { gte: startOfLocalDay() }, generation: { sequence: { topic: { channelId } } } },
    select: { message: true },
  });
  return rows.reduce((s, r) => s + (parseFloat(r.message) || 0), 0);
}

/** Topics whose video finished or stopped: reflect it in the inbox. */
async function syncProducing(): Promise<void> {
  const producing = await prisma.topic.findMany({
    where: { status: "PRODUCING", sequenceId: { not: null } },
    include: { sequence: { select: { status: true, errorMessage: true, finalVideo: { select: { id: true } } } } },
  });
  for (const t of producing) {
    const s = t.sequence;
    if (!s) continue;
    if (s.status === "COMPLETED" && s.finalVideo) {
      await prisma.topic.update({ where: { id: t.id }, data: { status: "READY", finishedAt: new Date() } });
      await notifyWebhook("topic.ready", { topicId: t.id, title: t.title, videoAssetId: s.finalVideo.id }).catch(() => {});
    } else if (s.status === "NEEDS_USER_ACTION") {
      await prisma.topic.update({ where: { id: t.id }, data: { status: "FAILED", finishedAt: new Date(), errorMessage: s.errorMessage || "Video cần thao tác thủ công." } });
      await notifyWebhook("topic.failed", { topicId: t.id, title: t.title, error: s.errorMessage }).catch(() => {});
    }
  }
}

export interface TickReport {
  autoApproved: number;
  started: string[];
  skipped: string[];
}

/**
 * One scheduler pass (the worker runs it every minute):
 *  1. SUGGESTED topics whose review delay is over become APPROVED;
 *  2. PRODUCING topics follow their video's status;
 *  3. each automated channel starts at most one video at a time, within videos/day and its daily credit budget.
 */
export async function schedulerTick(now = new Date()): Promise<TickReport> {
  const report: TickReport = { autoApproved: 0, started: [], skipped: [] };
  const due = await prisma.topic.updateMany({
    where: { status: "SUGGESTED", autoApproveAt: { lte: now } },
    data: { status: "APPROVED", approvedAt: now },
  });
  report.autoApproved = due.count;

  await syncProducing();

  const channels = await prisma.channel.findMany({ where: { automationEnabled: true, videosPerDay: { gt: 0 } } });
  for (const ch of channels) {
    const busy = await prisma.topic.count({ where: { channelId: ch.id, status: "PRODUCING" } });
    if (busy > 0) continue; // one video at a time per channel (the Flow worker is serial anyway)
    const today = await prisma.topic.count({ where: { channelId: ch.id, startedAt: { gte: startOfLocalDay(now) }, status: { in: ["PRODUCING", "READY", "FAILED"] } } });
    if (today >= ch.videosPerDay) continue;
    const next = await prisma.topic.findFirst({ where: { channelId: ch.id, status: "APPROVED" }, orderBy: [{ score: { sort: "desc", nulls: "last" } }, { approvedAt: "asc" }] });
    if (!next) continue;
    if (ch.dailyCreditBudget > 0) {
      const estimate = AGENT_CREDITS_PER_CLIP * clipCount(next.durationSec, ch.clipSeconds);
      const spent = await channelCreditsToday(ch.id);
      if (spent + estimate > ch.dailyCreditBudget) {
        report.skipped.push(`${ch.name}: ngân sách hôm nay còn ${Math.max(0, ch.dailyCreditBudget - spent)} credit, video tiếp theo cần ~${estimate}`);
        continue;
      }
    }
    if (!(await hasConnectedAccount(ch))) {
      report.skipped.push(`${ch.name}: chưa có tài khoản Google nào kết nối Flow`);
      continue;
    }
    const t = await produceTopic(next.id);
    (t.status === "PRODUCING" ? report.started : report.skipped).push(`${ch.name}: ${next.title}${t.status === "FAILED" ? ` (${t.errorMessage})` : ""}`);
  }
  return report;
}
