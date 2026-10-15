import { prisma } from "../db";

export const VEO_BASE = process.env.VEO_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
export const VEO_API_PROVIDER = "VEO_API";
export const API_SPEND_EVENT = "API_SPEND_USD";

export const veoSettings = () => ({
  apiKey: process.env.VEO_API_KEY || process.env.GEMINI_API_KEY || "",
  model: process.env.VEO_API_MODEL || "veo-3.1-fast-generate-preview",
  usdPerSecond: parseFloat(process.env.VEO_API_USD_PER_SECOND || "") || 0.1,
  maxUsdPerVideo: parseFloat(process.env.VEO_API_MAX_USD_PER_VIDEO || "") || 15,
  dailyUsdBudget: parseFloat(process.env.VEO_API_DAILY_USD_BUDGET || "") || 0,
  clipSeconds: 8,
});

export function estimateApiUsd(clips: number, seconds = veoSettings().clipSeconds): number {
  return Math.round(clips * seconds * veoSettings().usdPerSecond * 100) / 100;
}

export async function apiSpentTodayUsd(): Promise<number> {
  const now = new Date();
  const rows = await prisma.generationEvent.findMany({
    where: { type: API_SPEND_EVENT, createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } },
    select: { message: true },
  });
  return rows.reduce((sum, r) => sum + (parseFloat(r.message) || 0), 0);
}

export async function assertApiBudget(estimateUsd: number): Promise<void> {
  const s = veoSettings();
  if (!s.apiKey) throw new Error("Chưa cấu hình GEMINI_API_KEY (hoặc VEO_API_KEY) cho Veo API.");
  if (estimateUsd > s.maxUsdPerVideo) {
    throw new Error(`Chi phí Veo API dự kiến ${estimateUsd} USD vượt trần ${s.maxUsdPerVideo} USD mỗi video (VEO_API_MAX_USD_PER_VIDEO).`);
  }
  if (s.dailyUsdBudget > 0) {
    const spent = await apiSpentTodayUsd();
    if (spent + estimateUsd > s.dailyUsdBudget) {
      throw new Error(`Vượt ngân sách Veo API trong ngày: đã dùng ${spent.toFixed(2)} USD, cần thêm ${estimateUsd}, trần ${s.dailyUsdBudget} USD.`);
    }
  }
}

