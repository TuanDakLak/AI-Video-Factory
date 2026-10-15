import { prisma } from "@/lib/db";

/**
 * Credit safety net for Google Flow (credits = real money).
 *  - FLOW_MAX_CREDITS_PER_VIDEO : hard cap for ONE render (all approvals of a run together). Default 300. 0 = no cap.
 *  - FLOW_DAILY_CREDIT_BUDGET   : hard cap per Google account for everything approved since local midnight. Default 0 = no cap.
 * Every approved spend is written to the generation's event log as type CREDITS_SPENT (message = the number), which is the ledger
 * the daily budget is computed from.
 */
export const CREDITS_SPENT_EVENT = "CREDITS_SPENT";
/** Balance older than this is not trusted by the pre-flight check (the worker re-reads the real balance anyway). */
const BALANCE_MAX_AGE_MS = 12 * 3600 * 1000;

function envInt(name: string, fallback: number): number {
  const v = parseInt(process.env[name] || "", 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function creditLimits() {
  return {
    maxPerVideo: envInt("FLOW_MAX_CREDITS_PER_VIDEO", 300),
    dailyBudget: envInt("FLOW_DAILY_CREDIT_BUDGET", 0),
  };
}

export function startOfLocalDay(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Credits approved today; per Google account when given (each user's accounts have their own budget). */
export async function creditsSpentToday(googleAccountId?: string | null): Promise<number> {
  const rows = await prisma.generationEvent.findMany({
    where: {
      type: CREDITS_SPENT_EVENT,
      createdAt: { gte: startOfLocalDay() },
      ...(googleAccountId ? { generation: { googleAccountId } } : {}),
    },
    select: { message: true },
  });
  return rows.reduce((sum, r) => sum + (parseFloat(r.message) || 0), 0);
}

export async function recordCreditsSpent(generationId: string, credits: number): Promise<void> {
  await prisma.generationEvent.create({ data: { generationId, type: CREDITS_SPENT_EVENT, message: String(credits) } });
}

/**
 * Throw a user-facing Error when spending `estimate` credits would break a limit.
 * `balance`: a fresh balance read from Flow (worker) — when omitted the account's last known balance is used if recent.
 * `alreadySpentInRun`: credits of the same render already approved (retries), counted against the per-video cap.
 */
export async function assertCanSpend(
  estimate: number,
  opts: { googleAccountId?: string | null; balance?: number | null; alreadySpentInRun?: number } = {}
): Promise<void> {
  const { maxPerVideo, dailyBudget } = creditLimits();
  const run = opts.alreadySpentInRun ?? 0;
  if (maxPerVideo > 0 && run + estimate > maxPerVideo) {
    throw new Error(
      `Chi phí dự kiến ${run + estimate} tín dụng vượt trần mỗi video (${maxPerVideo}). Giảm số cảnh hoặc tăng FLOW_MAX_CREDITS_PER_VIDEO trong .env.`
    );
  }
  if (dailyBudget > 0) {
    const spent = await creditsSpentToday(opts.googleAccountId);
    if (spent + estimate > dailyBudget) {
      throw new Error(
        `Vượt ngân sách credit trong ngày: đã dùng ${spent}, cần thêm ${estimate}, trần ${dailyBudget} (FLOW_DAILY_CREDIT_BUDGET).`
      );
    }
  }
  let balance = opts.balance ?? null;
  if (balance === null && opts.googleAccountId) {
    const acc = await prisma.googleAccount.findUnique({
      where: { id: opts.googleAccountId },
      select: { lastKnownFlowCredits: true, lastCreditCheckAt: true },
    });
    if (acc?.lastKnownFlowCredits != null && acc.lastCreditCheckAt && Date.now() - acc.lastCreditCheckAt.getTime() < BALANCE_MAX_AGE_MS) {
      balance = acc.lastKnownFlowCredits;
    }
  }
  if (balance !== null && balance < estimate) {
    throw new Error(`Không đủ credit Flow: còn ${balance}, cần khoảng ${estimate}. Nạp thêm hoặc giảm số cảnh.`);
  }
}
