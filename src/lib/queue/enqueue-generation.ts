import { prisma } from "@/lib/db";
import { enqueueGenerationJob } from "./generation-queue";

/**
 * Put one existing Generation into the Flow automation queue.
 * Same behaviour as POST /api/generations/[id]/start-auto, reusable from server code (sequences).
 * Throws an Error with a user-facing message when it cannot be queued.
 */
export async function enqueueGenerationById(
  generationId: string,
  googleAccountId?: string | null,
  opts: { mode?: "RUN" | "DRYRUN" | "RECOVER"; flowProjectUrl?: string } = {}
): Promise<{ accountName: string }> {
  const generation = await prisma.generation.findUnique({ where: { id: generationId } });
  if (!generation) throw new Error("Không tìm thấy generation job này.");

  // Veo API generations need no Google account / browser
  const isApi = generation.provider === "VEO_API";
  const accountId = googleAccountId || generation.googleAccountId || null;
  let accountName = "Veo API";
  if (!isApi) {
    if (!accountId) throw new Error("Chưa chọn tài khoản Google cho tác vụ này.");
    const account = await prisma.googleAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new Error("Tài khoản Google đã chọn không tồn tại.");
    if (account.status !== "CONNECTED") {
      throw new Error(`Tài khoản ${account.name} chưa kết nối Google Flow (${account.status}). Vào Cài Đặt để kết nối trước.`);
    }
    accountName = account.name;
  }

  const idempotencyKey = `flow_gen_${generationId}_${Date.now()}`;

  await prisma.generation.update({
    where: { id: generationId },
    data: {
      ...(accountId ? { googleAccountId: accountId } : {}),
      status: "QUEUED",
      generationMethod: "AUTO",
      idempotencyKey,
      errorMessage: null,
    },
  });

  // keep the credit ledger (CREDITS_SPENT) so the daily budget stays correct across re-runs
  await prisma.generationEvent.deleteMany({ where: { generationId, type: { not: "CREDITS_SPENT" } } });
  await prisma.generationEvent.create({
    data: {
      generationId,
      type: "QUEUED",
      message: `Đã đưa tác vụ vào hàng đợi xử lý (${accountName}).`,
    },
  });

  await enqueueGenerationJob({
    generationId,
    projectId: generation.projectId,
    googleAccountId: accountId || "",
    prompt: generation.prompt,
    model: generation.model,
    aspectRatio: generation.aspectRatio,
    duration: generation.duration,
    idempotencyKey,
    enqueuedAt: new Date().toISOString(),
    mode: opts.mode || "RUN",
    ...(opts.flowProjectUrl ? { flowProjectUrl: opts.flowProjectUrl } : {}),
  });

  return { accountName };
}
