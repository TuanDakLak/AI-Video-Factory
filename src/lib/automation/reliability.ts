import { prisma } from "@/lib/db";
import { getGenerationQueue } from "@/lib/queue/generation-queue";
import { SequenceService } from "@/lib/sequence/sequence-service";
import { readHealthHistory } from "./health-store";

/**
 * Self-healing for unattended runs.
 *  - Orphans: a generation marked as running whose BullMQ job no longer exists (worker crash/restart, Redis flush).
 *    Before the prompt reached Flow nothing was spent -> FAILED (safe to re-run); after it -> NEEDS_USER_ACTION (clips may
 *    exist in Flow: recover them for free instead of paying again).
 *  - Stuck locks: a Google account left IN_USE by a worker that died.
 *  - Flow UI health: which account is due for its daily (0-credit) UI check, and whether production must pause.
 */

/** Statuses before the prompt is submitted to Flow (no credit can have been spent). */
export const PRE_SUBMIT = ["QUEUED", "STARTING_BROWSER", "CHECKING_ACCOUNT", "OPENING_FLOW"] as const;
/** Statuses after submission (credits may have been spent, clips may exist in Flow). */
export const POST_SUBMIT = ["SUBMITTING", "GENERATING", "DOWNLOADING", "PROCESSING"] as const;

/** A job that was just enqueued may not be visible yet: ignore rows younger than this. */
const ORPHAN_GRACE_MS = 2 * 60 * 1000;
/** A lock older than this with no active job is stuck (the longest run, a 9-clip batch, stays well under it while active). */
const STUCK_LOCK_MS = 15 * 60 * 1000;

async function liveGenerationIds(): Promise<{ all: Set<string>; active: number }> {
  const jobs = await getGenerationQueue().getJobs(["active", "waiting", "delayed", "prioritized", "paused"]);
  const all = new Set<string>();
  let active = 0;
  for (const j of jobs) {
    if (!j?.data?.generationId) continue;
    all.add(j.data.generationId);
    if (await j.isActive()) active++;
  }
  return { all, active };
}

export interface ReconcileReport {
  failedSafe: number;
  needsRecovery: number;
  unlocked: number;
}

/** onlyIds: restrict to these generations (tests must never touch real rows). */
export async function reconcileOrphans(opts: { workerBusy: boolean; now?: Date; onlyIds?: string[] }): Promise<ReconcileReport> {
  const now = opts.now ?? new Date();
  const report: ReconcileReport = { failedSafe: 0, needsRecovery: 0, unlocked: 0 };
  const live = await liveGenerationIds();

  const running = await prisma.generation.findMany({
    where: {
      status: { in: [...PRE_SUBMIT, ...POST_SUBMIT] },
      updatedAt: { lt: new Date(now.getTime() - ORPHAN_GRACE_MS) },
      ...(opts.onlyIds ? { id: { in: opts.onlyIds } } : {}),
    },
    select: { id: true, status: true },
  });
  for (const g of running) {
    if (live.all.has(g.id)) continue;
    const preSubmit = (PRE_SUBMIT as readonly string[]).includes(g.status);
    const message = preSubmit
      ? "Tác vụ bị mất (worker dừng/khởi động lại) trước khi gửi prompt cho Flow: chưa tốn credit, có thể chạy lại."
      : "Worker dừng giữa chừng sau khi đã gửi prompt cho Flow: credit có thể đã bị trừ. Dùng \"Khôi phục clip từ Flow\" (0 credit) thay vì chạy lại.";
    // only touch the row if nobody changed it meanwhile
    const r = await prisma.generation.updateMany({
      where: { id: g.id, status: g.status },
      data: { status: preSubmit ? "FAILED" : "NEEDS_USER_ACTION", errorMessage: message },
    });
    if (r.count === 0) continue;
    await prisma.generationEvent.create({ data: { generationId: g.id, type: preSubmit ? "FAILED" : "NEEDS_USER_ACTION", message } });
    await SequenceService.onGenerationSettled(g.id).catch(() => {});
    if (preSubmit) report.failedSafe++;
    else report.needsRecovery++;
  }

  // the worker runs one job at a time: when it is idle and no job is active, no account can legitimately be in use
  if (!opts.workerBusy && live.active === 0) {
    const r = await prisma.googleAccount.updateMany({
      where: { lockStatus: "IN_USE", updatedAt: { lt: new Date(now.getTime() - STUCK_LOCK_MS) } },
      data: { lockStatus: "AVAILABLE" },
    });
    report.unlocked = r.count;
  }
  return report;
}

/** On worker start nothing can be running yet: release every lock (the stale-time guard is not needed). */
export async function releaseAllLocks(): Promise<number> {
  const r = await prisma.googleAccount.updateMany({ where: { lockStatus: "IN_USE" }, data: { lockStatus: "AVAILABLE" } });
  return r.count;
}

// ---------------------------------------------------------------- Flow UI health

export const HEALTH_EVERY_HOURS = 24;

function latestReport(accountId: string) {
  return readHealthHistory().find((r) => r.accountId === accountId) ?? null;
}

/** Connected accounts that automated channels may use and whose last UI check is older than a day (or missing). */
export async function accountDueForHealthCheck(now = new Date()): Promise<string | null> {
  const channels = await prisma.channel.findMany({ where: { automationEnabled: true }, select: { ownerId: true, googleAccountId: true } });
  if (channels.length === 0) return null;
  const accounts = await prisma.googleAccount.findMany({
    where: { status: "CONNECTED", lockStatus: "AVAILABLE", ownerId: { in: [...new Set(channels.map((c) => c.ownerId))] } },
    select: { id: true },
  });
  const due = accounts.find((a) => {
    const r = latestReport(a.id);
    return !r || now.getTime() - new Date(r.at).getTime() > HEALTH_EVERY_HOURS * 3600 * 1000;
  });
  return due?.id ?? null;
}

/**
 * True when every account this channel could use failed its most recent Flow UI check: Flow probably changed its UI,
 * so starting a paid render would very likely fail. Production resumes once a later check passes.
 */
export async function flowLooksBroken(channel: { ownerId: string; googleAccountId: string | null }): Promise<boolean> {
  const accounts = await prisma.googleAccount.findMany({
    where: { ownerId: channel.ownerId, status: "CONNECTED", ...(channel.googleAccountId ? { id: channel.googleAccountId } : {}) },
    select: { id: true },
  });
  if (accounts.length === 0) return false;
  return accounts.every((a) => latestReport(a.id)?.ok === false);
}
