import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";

export function parseKeys(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Reference images (product / character photos, max 3) attached to the Flow Agent brief as "Ingredients".
 * Returns absolute file paths plus a note for the generation event log.
 */
export async function sequenceReferenceImages(generationId: string): Promise<{ files: string[]; note: string }> {
  const gen = await prisma.generation.findUnique({ where: { id: generationId }, select: { sequence: { select: { referenceImageKeys: true } } } });
  const files = parseKeys(gen?.sequence?.referenceImageKeys)
    .slice(0, 3)
    .filter((k) => storage.fileExists(k))
    .map((k) => storage.getFilePath(k));
  return { files, note: files.length > 0 ? `Đính kèm ${files.length} ảnh tham chiếu (Ingredients).` : "Không có ảnh đính kèm." };
}
