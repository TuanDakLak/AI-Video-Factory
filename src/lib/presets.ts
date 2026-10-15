import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { z } from "zod";

/**
 * Channel presets: the fixed identity of a channel (visual style, language, hashtags, format and up to 3 reference images)
 * so unattended runs (hot-trend topics) always look like the same channel. Stored in data/channel-presets.json (no DB migration).
 */
export const PRESET_REF_FOLDER = "references";
export const PRESET_STORAGE_PROJECT = "_presets";

export const presetInputSchema = z.object({
  name: z.string().trim().min(1, "Tên preset không được trống").max(80),
  styleBible: z.string().max(4000).default(""),
  language: z.string().max(40).default("vi"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("9:16"),
  model: z.string().default("Veo 3.1 Fast"),
  clipSeconds: z.coerce.number().int().min(4).max(15).default(10),
  continuity: z.enum(["FLOW_AGENT", "INDEPENDENT", "LAST_FRAME"]).default("FLOW_AGENT"),
  transition: z.enum(["CUT", "CROSSFADE"]).default("CUT"),
  hashtags: z.array(z.string().max(60)).max(30).default([]),
});
export type PresetInput = z.infer<typeof presetInputSchema>;

export interface ChannelPreset extends PresetInput {
  id: string;
  /** user id; missing only on presets created before auth existed (claimed by the first admin) */
  ownerId?: string;
  referenceImageKeys: string[];
  createdAt: string;
  updatedAt: string;
}

const FILE = () => path.resolve(process.cwd(), "data", "channel-presets.json");

function readAll(): ChannelPreset[] {
  try {
    const v = JSON.parse(fs.readFileSync(FILE(), "utf8"));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeAll(list: ChannelPreset[]): void {
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  const tmp = `${FILE()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, FILE());
}

/** Every accessor is scoped to an owner: a preset of another user behaves exactly like a missing one. */
export function listPresets(ownerId: string): ChannelPreset[] {
  return readAll().filter((p) => p.ownerId === ownerId);
}

export function getPreset(id: string, ownerId: string): ChannelPreset | null {
  return readAll().find((p) => p.id === id && p.ownerId === ownerId) ?? null;
}

export function createPreset(input: PresetInput, ownerId: string): ChannelPreset {
  const now = new Date().toISOString();
  const preset: ChannelPreset = { ...input, id: randomUUID(), ownerId, referenceImageKeys: [], createdAt: now, updatedAt: now };
  writeAll([preset, ...readAll()]);
  return preset;
}

export function updatePreset(id: string, ownerId: string, patch: Partial<PresetInput> & { referenceImageKeys?: string[] }): ChannelPreset | null {
  const list = readAll();
  const i = list.findIndex((p) => p.id === id && p.ownerId === ownerId);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, id, ownerId, updatedAt: new Date().toISOString() };
  writeAll(list);
  return list[i];
}

export function deletePreset(id: string, ownerId: string): ChannelPreset | null {
  const list = readAll();
  const found = list.find((p) => p.id === id && p.ownerId === ownerId) ?? null;
  if (found) writeAll(list.filter((p) => p !== found));
  return found;
}

/** Bootstrap: presets created before auth existed become the first admin's. */
export function claimUnownedPresets(ownerId: string): number {
  const list = readAll();
  let n = 0;
  for (const p of list) if (!p.ownerId) { p.ownerId = ownerId; n++; }
  if (n) writeAll(list);
  return n;
}
