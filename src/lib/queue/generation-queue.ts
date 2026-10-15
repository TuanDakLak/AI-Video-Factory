import { Queue, JobsOptions } from "bullmq";
import { getRedisConnection } from "./redis";

export const GENERATION_QUEUE_NAME = "google-flow-generation-queue";

export interface GenerationJobData {
  generationId: string;
  projectId: string;
  googleAccountId: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  duration: string;
  idempotencyKey: string;
  enqueuedAt: string;
  /** RUN (default) | DRYRUN (plan + price only, nothing is approved) | RECOVER (import existing clips from the Flow project) */
  mode?: "RUN" | "DRYRUN" | "RECOVER";
  flowProjectUrl?: string;
}

let generationQueue: Queue<GenerationJobData> | null = null;

export function getGenerationQueue(): Queue<GenerationJobData> {
  if (!generationQueue) {
    const connection = getRedisConnection();
    generationQueue = new Queue<GenerationJobData>(GENERATION_QUEUE_NAME, {
      connection: connection as any,
      defaultJobOptions: {
        attempts: 1, // Do not blindly retry paid/credit-consuming video generation automatically
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }
  return generationQueue;
}

export async function enqueueGenerationJob(
  data: GenerationJobData,
  options?: JobsOptions
) {
  const queue = getGenerationQueue();
  const job = await queue.add(`gen_${data.generationId}`, data, {
    jobId: data.idempotencyKey || `gen_${data.generationId}`,
    ...options,
  });
  return job;
}
