import { z } from "zod";
import type { Channel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { llmConfigured, llmJson } from "@/lib/ai/llm";
import { addTopic } from "@/lib/automation/topics";
import { GENRES, GENRE_KEYS, GenreKey } from "@/lib/content/genres";
import { languageName } from "@/lib/content/script-writer";
import { Signal, collectSignals } from "./sources";

/**
 * Topic research for one channel: free trend signals (Google News, Google Trends, Wikipedia) + the channel's niche ->
 * the LLM proposes topics that fit the channel -> duplicates (incl. topics the user deleted) are dropped -> the rest
 * land in the inbox as SUGGESTED (produced after the review delay unless the user deletes them).
 * Cost: one LLM call per run (~3-5k input tokens), signals are free and cached.
 */

const MAX_SIGNALS = 60;

const proposalSchema = z.object({
  topics: z
    .array(
      z.object({
        title: z.string().min(5).max(140),
        angle: z.string().max(400).default(""),
        genre: z.string(),
        durationSec: z.coerce.number(),
        score: z.coerce.number().min(0).max(1).default(0.5),
        sourceUrls: z.array(z.string()).max(5).default([]),
      })
    )
    .max(15),
});

const arr = <T>(json: string, fallback: T[]): T[] => {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) && v.length ? v : fallback;
  } catch {
    return fallback;
  }
};

/** How many topics the inbox should hold so the schedule never runs dry (3 days of production, at least 3). */
export function inboxTarget(videosPerDay: number): number {
  return Math.max(3, videosPerDay * 3);
}

export async function inboxSize(channelId: string): Promise<number> {
  return prisma.topic.count({ where: { channelId, status: { in: ["SUGGESTED", "APPROVED"] } } });
}

function digest(signals: Signal[]): string {
  return signals
    .slice(0, MAX_SIGNALS)
    .map((s, i) => `${i + 1}. [${s.source}] ${s.title}${s.detail ? ` — ${s.detail.slice(0, 160)}` : ""}${s.url ? ` <${s.url}>` : ""}`)
    .join("\n");
}

export interface ResearchResult {
  created: number;
  duplicates: number;
  invalid: number;
  sources: Record<string, number>;
  note: string;
}

export async function researchChannel(channel: Channel, opts: { count?: number } = {}): Promise<ResearchResult> {
  const fail = async (note: string): Promise<ResearchResult> => {
    await prisma.channel.update({ where: { id: channel.id }, data: { lastResearchAt: new Date(), lastResearchNote: note } });
    return { created: 0, duplicates: 0, invalid: 0, sources: {}, note };
  };
  if (!llmConfigured()) return fail("Chưa cấu hình GEMINI_API_KEY: không thể tự tìm chủ đề.");
  if (!channel.niche.trim()) return fail("Kênh chưa có mô tả ngách: hãy điền \"Ngách / nội dung kênh\" để hệ thống biết tìm chủ đề gì.");

  const count = Math.min(10, Math.max(1, opts.count ?? inboxTarget(channel.videosPerDay) - (await inboxSize(channel.id))));
  const genres = arr<GenreKey>(channel.genres, ["short_film"]).filter((g) => (GENRE_KEYS as readonly string[]).includes(g));
  const durations = arr<number>(channel.durations, [30]);
  const { signals, sources } = await collectSignals(channel.niche, channel.language);

  // what the channel already has (any status, deleted ones included) so the model does not propose them again
  const recent = await prisma.topic.findMany({ where: { channelId: channel.id }, orderBy: { createdAt: "desc" }, take: 80, select: { title: true, status: true } });
  const lang = languageName(channel.language);

  const system = `You are the content strategist of a short-video channel (TikTok / Reels / Shorts) made with AI video (Google Veo).
Propose topics that THIS channel would publish, that a ${lang}-speaking audience would want to watch and share.
Rules:
- Fit the channel's niche first. Use the trend signals only when one genuinely fits the niche (then cite its URL in sourceUrls); otherwise propose strong evergreen ideas for the niche (sourceUrls empty, lower score).
- Titles in ${lang}, concrete and specific (who/what + the hook), max ~90 characters, no clickbait lies.
- "angle": one sentence in ${lang}: what makes this video interesting / the twist / the emotion.
- "genre" must be one of: ${genres.join(", ")}. "durationSec" must be one of: ${durations.join(", ")} (longer only when the story needs it).
- "score" 0..1 = expected appeal for this audience × fit to the niche.
- NEVER propose: anything already in "existing topics" (or a rephrasing of it); real tragedies, disasters, crimes or deaths; politics, elections, religion conflicts; real living people (celebrities, politicians, athletes); medical, financial or legal advice; sexual content; gambling/crypto; brands or copyrighted characters.
- Every topic must be producible as an AI video: visual, with clear characters/places, no need for real footage.
Return ONLY JSON: {"topics":[{"title","angle","genre","durationSec","score","sourceUrls"}]}`;

  const user = [
    `Channel: ${channel.name}`,
    `Niche: ${channel.niche}`,
    `Genres allowed: ${genres.map((g) => `${g} (${GENRES[g].description})`).join("; ")}`,
    `Number of topics to propose: ${count}`,
    `Existing topics (do NOT repeat or rephrase):\n${recent.map((t) => `- ${t.title}${t.status === "REJECTED" ? " (rejected by the owner: avoid similar ideas)" : ""}`).join("\n") || "- (none yet)"}`,
    `Trend signals today:\n${digest(signals) || "(no signals available: propose evergreen topics)"}`,
  ].join("\n\n");

  let proposal: z.infer<typeof proposalSchema>;
  try {
    proposal = await llmJson({ system, user, schema: proposalSchema, temperature: 0.9, maxTokens: 300 + count * 180 });
  } catch (e: any) {
    return fail(`Không gọi được LLM để tìm chủ đề: ${String(e?.message || e).slice(0, 200)}`);
  }

  const knownUrls = new Set(signals.map((s) => s.url).filter(Boolean) as string[]);
  let created = 0;
  let duplicates = 0;
  let invalid = 0;
  for (const p of proposal.topics.slice(0, count)) {
    const genre = (genres as string[]).includes(p.genre) ? (p.genre as GenreKey) : undefined;
    const durationSec = durations.includes(p.durationSec) ? p.durationSec : undefined;
    if (!genre || !durationSec) invalid++;
    const r = await addTopic(channel, {
      title: p.title,
      angle: p.angle,
      genre, // falls back to the channel's rotation when the model picked something not allowed
      durationSec,
      source: "AI_RESEARCH",
      // only keep URLs that really came from the signals (the model must not invent sources)
      sourceUrls: p.sourceUrls.filter((u) => knownUrls.has(u)),
      score: p.score,
    });
    if (r.status === "created") created++;
    else duplicates++;
  }
  const note = `Đã thêm ${created} chủ đề${duplicates ? `, bỏ ${duplicates} trùng` : ""}. Nguồn: tin tức ${sources.news}, Google Trends ${sources.google_trends}, Wikipedia ${sources.wikipedia}.`;
  await prisma.channel.update({ where: { id: channel.id }, data: { lastResearchAt: new Date(), lastResearchNote: note } });
  return { created, duplicates, invalid, sources, note };
}

export const RESEARCH_EVERY_HOURS = 6;

/** Channels whose inbox is running low and that were not researched recently. */
export async function channelsNeedingResearch(now = new Date()): Promise<Channel[]> {
  const cutoff = new Date(now.getTime() - RESEARCH_EVERY_HOURS * 3600 * 1000);
  const channels = await prisma.channel.findMany({
    where: { automationEnabled: true, videosPerDay: { gt: 0 }, NOT: { niche: "" }, OR: [{ lastResearchAt: null }, { lastResearchAt: { lt: cutoff } }] },
  });
  const out: Channel[] = [];
  for (const c of channels) if ((await inboxSize(c.id)) < inboxTarget(c.videosPerDay)) out.push(c);
  return out;
}
