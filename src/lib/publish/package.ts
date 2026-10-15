import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { checkPublishReadiness, PlatformCheck } from "./readiness";

export interface PublishPackage {
  videoAssetId: string;
  projectId: string;
  /** Where the publish step should read the file from */
  storageKey: string;
  absolutePath: string;
  fileExists: boolean;
  mimeType: string;
  fileSize: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  title: string;
  caption: string;
  tags: string[];
  origin: { type: "SEQUENCE" | "GENERATION" | "MANUAL"; id: string | null };
  checks: PlatformCheck[];
  /** true when at least one platform has no blocking issue */
  publishable: boolean;
}

function parseTags(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.map((t) => String(t)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Single contract between the "make video" phase and the "publish to social" phase:
 * final file + title/caption/tags + per-platform readiness.
 */
export async function getPublishPackage(videoAssetId: string): Promise<PublishPackage | null> {
  const asset = await prisma.videoAsset.findUnique({
    where: { id: videoAssetId },
    include: {
      sequence: true,
      generation: { include: { content: true } },
    },
  });
  if (!asset) return null;

  let title = asset.filename.replace(/\.[^.]+$/, "");
  let caption = "";
  let tags: string[] = [];
  let origin: PublishPackage["origin"] = { type: "MANUAL", id: null };

  if (asset.sequence) {
    title = asset.sequence.title;
    caption = asset.sequence.caption || "";
    tags = parseTags(asset.sequence.tags);
    origin = { type: "SEQUENCE", id: asset.sequence.id };
  } else if (asset.generation) {
    const content = asset.generation.content;
    title = content?.title || title;
    caption = content?.description || "";
    tags = parseTags(content?.tags);
    origin = { type: "GENERATION", id: asset.generation.id };
  }

  const checks = checkPublishReadiness({
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    fileSize: asset.fileSize,
    mimeType: asset.mimeType,
  });

  return {
    videoAssetId: asset.id,
    projectId: asset.projectId,
    storageKey: asset.storageKey,
    absolutePath: storage.getFilePath(asset.storageKey),
    fileExists: storage.fileExists(asset.storageKey),
    mimeType: asset.mimeType,
    fileSize: asset.fileSize,
    duration: asset.duration ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    title,
    caption,
    tags,
    origin,
    checks,
    publishable: checks.some((c) => c.level !== "fail"),
  };
}
