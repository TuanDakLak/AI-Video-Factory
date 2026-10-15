import { prisma } from "../lib/db";
import { FlowAutomationService } from "../lib/automation/FlowAutomationService";
import { SequenceService } from "../lib/sequence/sequence-service";

/**
 * Import the clips of a sequence that already exist in its Flow project (0 credits), then assemble the final video.
 * Usage: tsx src/scripts/recover-sequence.ts <sequenceId> [flowProjectUrl]
 */
async function run() {
  const [sequenceId, projectUrl] = process.argv.slice(2);
  if (!sequenceId) throw new Error("Usage: tsx src/scripts/recover-sequence.ts <sequenceId> [flowProjectUrl]");
  const lead = await prisma.generation.findFirst({ where: { sequenceId, sceneIndex: 0 } });
  if (!lead) throw new Error("Sequence has no scene 1.");
  const r = await FlowAutomationService.recoverSequenceClips(lead.id, undefined, projectUrl);
  console.log("recover:", r);
  if (r.success) {
    await SequenceService.onGenerationSettled(lead.id);
    const seq = await prisma.sequence.findUnique({ where: { id: sequenceId }, include: { finalVideo: true } });
    console.log("sequence:", seq?.status, seq?.errorMessage || "", seq?.finalVideo ? `final=${seq.finalVideo.storageKey} ${seq.finalVideo.duration}s` : "no final video");
  }
}
run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
