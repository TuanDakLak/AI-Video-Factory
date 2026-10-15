import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../lib/queue/redis";
import { GENERATION_QUEUE_NAME, GenerationJobData } from "../lib/queue/generation-queue";
import { FlowAutomationService } from "../lib/automation/FlowAutomationService";
import { prisma } from "../lib/db";
import { SequenceService } from "../lib/sequence/sequence-service";
import { VeoApiService } from "../lib/automation/veo-api";
import { notifyWebhook } from "../lib/automation/notify";

console.log("==================================================");
console.log("🚀 Google Flow Automation Worker (Phase 3)");
console.log("Max Concurrent Jobs: 1");
console.log(`Listening on Queue: ${GENERATION_QUEUE_NAME}`);
console.log("==================================================");

const redisConn = getRedisConnection();
let healthRunning = false;
let jobsRunning = 0;

export const flowWorker = new Worker<GenerationJobData>(
  GENERATION_QUEUE_NAME,
  async (job: Job<GenerationJobData>) => {
    const { generationId, googleAccountId, prompt, model } = job.data;
    const mode = job.data.mode || "RUN";
    // a daily health check holds the account for ~1 minute: wait for it instead of failing with "account busy"
    for (let i = 0; i < 60 && healthRunning; i++) await new Promise((r) => setTimeout(r, 3000));
    jobsRunning++;
    try {
    
    console.log(`\n[Worker] Picking Job ${job.id} | Generation: ${generationId} | Account: ${googleAccountId}`);
    console.log(`[Worker] Model: ${model}`);
    console.log(`[Worker] Prompt: "${prompt.slice(0, 60)}..."`);

    // Check generation existence in DB
    const gen = await prisma.generation.findUnique({
      where: { id: generationId },
      include: { googleAccount: true },
    });

    if (!gen) {
      throw new Error(`Generation ${generationId} not found in database.`);
    }

    // A scene of a multi-scene sequence: if the sequence was paused (an earlier scene failed), don't spend credits.
    if (gen.sequenceId && mode === "RUN") {
      const seq = await prisma.sequence.findUnique({ where: { id: gen.sequenceId }, select: { status: true } });
      if (seq && seq.status !== "RUNNING") {
        await prisma.generation.update({ where: { id: generationId }, data: { status: "DRAFT" } });
        await prisma.generationEvent.create({
          data: { generationId, type: "DRAFT", message: "Đã bỏ qua vì video nhiều cảnh đang tạm dừng (có cảnh trước đó bị lỗi). Bấm Tiếp tục để chạy lại." },
        });
        console.log(`[Worker] Skipped ${generationId}: sequence ${gen.sequenceId} is ${seq.status}`);
        return { success: true, skipped: true };
      }
    }

    // Execute flow automation
    let result: { success: boolean; videoAssetId?: string; error?: string };
    try {
      const progress = async (step: string, msg: string) => {
        job.updateProgress({ step, msg });
      };
      result =
        mode === "RECOVER"
          ? await FlowAutomationService.recoverSequenceClips(generationId, progress, job.data.flowProjectUrl)
          : gen.provider === "VEO_API"
            ? await VeoApiService.executeGeneration(generationId, progress)
            : await FlowAutomationService.executeGeneration(generationId, progress, { mode });
    } catch (err: any) {
      // executeGeneration threw before it could record a failure (e.g. account busy / idempotency guard)
      const current = await prisma.generation.findUnique({ where: { id: generationId }, select: { status: true } });
      if (current && current.status === "QUEUED") {
        await prisma.generation.update({ where: { id: generationId }, data: { status: "FAILED", errorMessage: err.message } });
        await prisma.generationEvent.create({ data: { generationId, type: "FAILED", message: `Lỗi: ${err.message}` } });
      }
      await SequenceService.onGenerationSettled(generationId).catch((e) => console.error("[Worker] sequence hook error:", e));
      throw err;
    }

    // Sequence hook: pause on failure, auto-assemble the final video when every scene has a clip
    await SequenceService.onGenerationSettled(generationId).catch((e) =>
      console.error("[Worker] sequence hook error:", e)
    );

    if (!result.success) {
      await notifyWebhook("generation.failed", { generationId, error: result.error });
      throw new Error(result.error || "Video generation failed in Google Flow.");
    }

    console.log(`[Worker] Job ${job.id} COMPLETED successfully! VideoAsset: ${result.videoAssetId}\n`);
    return result;
    } finally {
      jobsRunning--;
    }
  },
  {
    connection: redisConn as any,
    concurrency: 1, // Concurrency control: 1 job at a time to safely isolate browser sessions
  }
);

flowWorker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} has completed.`);
});

flowWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed with error:`, err.message);
});

// Optional daily self-check of the Flow UI (no credits). FLOW_HEALTHCHECK_HOURS=24 enables it; skipped while a job is running.
const healthHours = parseFloat(process.env.FLOW_HEALTHCHECK_HOURS || "0");
if (healthHours > 0) {
  setInterval(async () => {
    try {
      if (jobsRunning > 0 || healthRunning) return;
      healthRunning = true;
      const r = await FlowAutomationService.healthCheck().finally(() => {
        healthRunning = false;
      });
      console.log(`[Health] ${r.ok ? "OK" : "FAILED"}: ${r.items.filter((i) => !i.ok).map((i) => i.name).join(", ") || "all checks passed"}`);
      if (!r.ok) await notifyWebhook("flow.health.failed", { accountName: r.accountName, failed: r.items.filter((i) => !i.ok) });
    } catch (e: any) {
      console.error("[Health] check error:", e.message);
    }
  }, healthHours * 3600 * 1000);
  console.log(`[Health] Flow UI self-check every ${healthHours}h`);
}

// Graceful shutdown
const handleShutdown = async () => {
  console.log("\n[Worker] Shutting down gracefully...");
  await flowWorker.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);
