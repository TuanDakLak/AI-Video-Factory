import { prisma } from "../lib/db";
import { SequenceService } from "../lib/sequence/sequence-service";

/**
 * Delete the 10s scene clips of every COMPLETED multi-scene video that already has its final long video.
 * Dry run by default (lists what would go); pass --apply to delete. Usage: tsx src/scripts/purge-sequence-clips.ts [--apply]
 */
async function run() {
  const apply = process.argv.includes("--apply");
  const seqs = await prisma.sequence.findMany({
    where: { status: "COMPLETED", finalVideo: { isNot: null } },
    include: { finalVideo: { select: { filename: true } }, scenes: { include: { videoAsset: { select: { filename: true, fileSize: true } } } } },
  });
  let total = 0;
  for (const s of seqs) {
    const clips = s.scenes.map((g) => g.videoAsset).filter(Boolean) as { filename: string; fileSize: number }[];
    if (clips.length === 0) continue;
    const mb = clips.reduce((n, c) => n + c.fileSize, 0) / 1024 / 1024;
    console.log(`${s.title} -> giữ ${s.finalVideo!.filename}; ${apply ? "xoá" : "sẽ xoá"} ${clips.length} clip (${mb.toFixed(1)} MB)`);
    if (apply) total += await SequenceService.purgeSceneClips(s.id);
  }
  console.log(apply ? `Đã xoá ${total} clip.` : "Chạy thử: chưa xoá gì. Thêm --apply để xoá.");
}
run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
