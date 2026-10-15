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

export function listPresets(): ChannelPreset[] {
  return readAll();
}

export function getPreset(id: string): ChannelPreset | null {
  return readAll().find((p) => p.id === id) ?? null;
}

export function createPreset(input: PresetInput): ChannelPreset {
  const now = new Date().toISOString();
  const preset: ChannelPreset = { ...input, id: randomUUID(), referenceImageKeys: [], createdAt: now, updatedAt: now };
  writeAll([preset, ...readAll()]);
  return preset;
}

export function updatePreset(id: string, patch: Partial<PresetInput> & { referenceImageKeys?: string[] }): ChannelPreset | null {
  const list = readAll();
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, id, updatedAt: new Date().toISOString() };
  writeAll(list);
  return list[i];
}

export function deletePreset(id: string): ChannelPreset | null {
  const list = readAll();
  const found = list.find((p) => p.id === id) ?? null;
  if (found) writeAll(list.filter((p) => p.id !== id));
  return found;
}
