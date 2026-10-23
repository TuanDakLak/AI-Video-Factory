import { z } from "zod";
import type { Channel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { GENRE_KEYS } from "@/lib/content/genres";

/**
 * Channels (formerly "channel presets"): the fixed identity of a channel (visual style, language, hashtags, format and
 * up to 3 reference images) plus its automation settings (niche, genres, durations, videos/day, review delay, budget).
 * Stored in the Channel table; every accessor is scoped to an owner, so another user's channel behaves like a missing one.
 */
export const PRESET_REF_FOLDER = "references";
export const PRESET_STORAGE_PROJECT = "_presets";

const DURATIONS = [30, 60, 90] as const;

export const presetInputSchema = z.object({
  name: z.string().trim().min(1, "Tên kênh không được trống").max(80),
  styleBible: z.string().max(4000).default(""),
  language: z.string().max(40).default("vi"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("9:16"),
  model: z.string().max(60).default("Veo 3.1 Fast"),
  clipSeconds: z.coerce.number().int().min(4).max(15).default(10),
  continuity: z.enum(["FLOW_AGENT", "INDEPENDENT", "LAST_FRAME"]).default("FLOW_AGENT"),
  transition: z.enum(["CUT", "CROSSFADE"]).default("CUT"),
  hashtags: z.array(z.string().max(60)).max(30).default([]),
  // automation
  automationEnabled: z.boolean().default(false),
  niche: z.string().max(2000).default(""),
  genres: z.array(z.enum(GENRE_KEYS)).max(GENRE_KEYS.length).default([]),
  durations: z.array(z.coerce.number().int().refine((d) => (DURATIONS as readonly number[]).includes(d), "Độ dài phải là 30, 60 hoặc 90 giây")).min(1).max(3).default([30]),
  videosPerDay: z.coerce.number().int().min(0).max(20).default(1),
  reviewHours: z.coerce.number().int().min(0).max(168).default(12),
  dailyCreditBudget: z.coerce.number().int().min(0).max(5000).default(200),
  googleAccountId: z.string().nullable().optional(),
  // publishing
  autoPublish: z.boolean().default(false),
  publishTargets: z.array(z.string()).max(10).default([]),
  tiktokPrivacy: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]).default("SELF_ONLY"),
});
export type PresetInput = z.infer<typeof presetInputSchema>;

export interface ChannelPreset extends Omit<PresetInput, "googleAccountId"> {
  id: string;
  ownerId: string;
  referenceImageKeys: string[];
  googleAccountId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

const arr = <T>(json: string | null | undefined, fallback: T[]): T[] => {
  try {
    const v = JSON.parse(json || "");
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

export function toPreset(c: Channel): ChannelPreset {
  return {
    id: c.id,
    ownerId: c.ownerId,
    name: c.name,
    styleBible: c.styleBible,
    language: c.language,
    aspectRatio: c.aspectRatio as PresetInput["aspectRatio"],
    model: c.model,
    clipSeconds: c.clipSeconds,
    continuity: c.continuity as PresetInput["continuity"],
    transition: c.transition as PresetInput["transition"],
    hashtags: arr<string>(c.hashtags, []),
    referenceImageKeys: arr<string>(c.referenceImageKeys, []),
    automationEnabled: c.automationEnabled,
    niche: c.niche,
    genres: arr<PresetInput["genres"][number]>(c.genres, []),
    durations: arr<number>(c.durations, [30]),
    videosPerDay: c.videosPerDay,
    reviewHours: c.reviewHours,
    dailyCreditBudget: c.dailyCreditBudget,
    googleAccountId: c.googleAccountId,
    projectId: c.projectId,
    autoPublish: c.autoPublish,
    publishTargets: arr<string>(c.publishTargets, []),
    tiktokPrivacy: c.tiktokPrivacy as PresetInput["tiktokPrivacy"],
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function toData(input: Partial<PresetInput> & { referenceImageKeys?: string[] }) {
  const { hashtags, genres, durations, referenceImageKeys, publishTargets, ...rest } = input;
  return {
    ...rest,
    ...(publishTargets !== undefined ? { publishTargets: JSON.stringify([...new Set(publishTargets)]) } : {}),
    ...(hashtags !== undefined ? { hashtags: JSON.stringify(hashtags) } : {}),
    ...(genres !== undefined ? { genres: JSON.stringify(genres) } : {}),
    ...(durations !== undefined ? { durations: JSON.stringify([...new Set(durations)].sort((a, b) => a - b)) } : {}),
    ...(referenceImageKeys !== undefined ? { referenceImageKeys: JSON.stringify(referenceImageKeys) } : {}),
  };
}

/** The preferred Google account and the publish targets must be the owner's. */
async function assertAccount(ownerId: string, googleAccountId: string | null | undefined, publishTargets?: string[]) {
  if (googleAccountId) {
    const ok = await prisma.googleAccount.findFirst({ where: { id: googleAccountId, ownerId }, select: { id: true } });
    if (!ok) throw new Error("Không tìm thấy tài khoản Google đã chọn.");
  }
  if (publishTargets?.length) {
    const n = await prisma.socialAccount.count({ where: { id: { in: [...new Set(publishTargets)] }, ownerId } });
    if (n !== new Set(publishTargets).size) throw new Error("Không tìm thấy tài khoản mạng xã hội đã chọn.");
  }
}

export async function listPresets(ownerId: string): Promise<ChannelPreset[]> {
  const rows = await prisma.channel.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" } });
  return rows.map(toPreset);
}

export async function getPreset(id: string, ownerId: string): Promise<ChannelPreset | null> {
  const c = await prisma.channel.findFirst({ where: { id, ownerId } });
  return c ? toPreset(c) : null;
}

export async function createPreset(input: PresetInput, ownerId: string): Promise<ChannelPreset> {
  await assertAccount(ownerId, input.googleAccountId, input.publishTargets);
  const c = await prisma.channel.create({ data: { ...toData(input), ownerId } as any });
  return toPreset(c);
}

export async function updatePreset(
  id: string,
  ownerId: string,
  patch: Partial<PresetInput> & { referenceImageKeys?: string[]; projectId?: string | null }
): Promise<ChannelPreset | null> {
  const existing = await prisma.channel.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!existing) return null;
  await assertAccount(ownerId, patch.googleAccountId, patch.publishTargets);
  const c = await prisma.channel.update({ where: { id }, data: toData(patch) as any });
  return toPreset(c);
}

export async function deletePreset(id: string, ownerId: string): Promise<ChannelPreset | null> {
  const c = await prisma.channel.findFirst({ where: { id, ownerId } });
  if (!c) return null;
  await prisma.channel.delete({ where: { id } }); // cascades its topics
  return toPreset(c);
}
