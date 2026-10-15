import path from "path";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { extractLastFrame } from "./assembler";

export type AttachmentMode = "NONE" | "INGREDIENTS" | "FIRST_FRAME";

export interface SceneAttachments {
  mode: AttachmentMode;
  /** Absolute paths of the images to attach in Flow before typing the prompt */
  files: string[];
  /** Human readable explanation for the generation event log */
  note: string;
}

export function parseKeys(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Decide which images Flow should receive for a scene:
 *  - scene 0 / INDEPENDENT: the sequence's reference images (Flow "Ingredients": product / character photos)
 *  - LAST_FRAME + scene > 0: the last frame of the previous scene's clip (Flow "Frames to Video" start frame)
 * Throws (before any credit is spent) when a required previous clip or file is missing.
 */
export async function resolveSceneAttachments(generationId: string, workDir: string): Promise<SceneAttachments> {
  const gen = await prisma.generation.findUnique({
    where: { id: generationId },
    include: { sequence: true },
  });
  if (!gen?.sequence) return { mode: "NONE", files: [], note: "Không thuộc video nhiều cảnh." };

  const seq = gen.sequence;
  const index = gen.sceneIndex ?? 0;

  if (seq.continuity === "LAST_FRAME" && index > 0) {
    const prev = await prisma.generation.findFirst({
      where: { sequenceId: seq.id, sceneIndex: index - 1 },
      include: { videoAsset: true },
    });
    if (!prev?.videoAsset || !storage.fileExists(prev.videoAsset.storageKey)) {
      throw new Error(
        `Chế độ nối frame cuối cần clip của cảnh ${index} đã hoàn tất trước. Hãy chạy cảnh ${index} xong rồi mới chạy cảnh ${index + 1} (hoặc đổi sang chế độ "Cảnh độc lập").`
      );
    }
    const png = await extractLastFrame(storage.getFilePath(prev.videoAsset.storageKey), path.join(workDir, `scene${index}_start.png`));
    return { mode: "FIRST_FRAME", files: [png], note: `Dùng frame cuối của cảnh ${index} làm khung hình đầu (Frames to Video).` };
  }

  const refs = parseKeys(seq.referenceImageKeys)
    .slice(0, 3)
    .filter((k) => storage.fileExists(k))
    .map((k) => storage.getFilePath(k));
  if (refs.length > 0) {
    return { mode: "INGREDIENTS", files: refs, note: `Đính kèm ${refs.length} ảnh tham chiếu (Ingredients to Video).` };
  }
  return { mode: "NONE", files: [], note: "Không có ảnh đính kèm." };
}
