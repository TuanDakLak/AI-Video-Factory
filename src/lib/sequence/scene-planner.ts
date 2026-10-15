import { aiProvider } from "@/lib/ai";

export interface PlanScenesParams {
  brief: string;
  totalDuration: number;
  clipSeconds: number;
  style?: string;
  aspectRatio: string;
  language?: string;
  /** Optional ready-made visual prompt (Content.videoPrompt) used as the style anchor in the fallback planner */
  basePrompt?: string;
  fallbackTitle?: string;
}

export interface PlannedSequence {
  title: string;
  styleBible: string;
  /** Raw scene prompts (without the style bible) */
  scenes: string[];
  caption?: string;
  hashtags?: string[];
  usedAI: boolean;
  warning?: string;
}

export function sceneCountFor(totalDuration: number, clipSeconds: number): number {
  return Math.max(1, Math.ceil(totalDuration / Math.max(1, clipSeconds)));
}

/**
 * Final text sent to Flow for one scene. Flow's Agent turns a long/multi-scene prompt into a PLAN (reference images + several
 * videos, e.g. "3 videos for 45 credits"), so every scene is sent as ONE standalone clip with an explicit instruction.
 * (index/total are kept in the signature for callers/tests but deliberately NOT written into the prompt.)
 */
export function composeScenePrompt(styleBible: string, scene: string, _index: number, _total: number, clipSeconds = 8): string {
  const rule = `Generate exactly ONE video of about ${clipSeconds} seconds (a single standalone shot). Do not split it into several scenes, do not create extra videos and do not create separate reference images. Do NOT ask me any clarifying question: decide every creative detail yourself and go straight to the plan / approval request.`;
  const head = styleBible.trim();
  return [rule, head, scene.trim()].filter(Boolean).join("\n\n");
}

/** Split free text into at most `n` meaningful chunks (lines first, then sentences). */
function splitBrief(brief: string, n: number): string[] {
  const lines = brief
    .split(/\r?\n+/)
    .map((l) => l.replace(/^\s*(?:cảnh|scene|shot)\s*\d+\s*[:.\-–)]\s*/i, "").replace(/^\s*[-*•\d.)]+\s+/, "").trim())
    .filter((l) => l.length > 3);
  let parts = lines;
  if (parts.length < n) {
    parts = brief
      .split(/(?<=[.!?。])\s+|\r?\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 3);
  }
  if (parts.length === 0) return [brief.trim()];
  if (parts.length <= n) return parts;
  // merge neighbours so that exactly n chunks remain
  const out: string[] = [];
  const size = parts.length / n;
  for (let i = 0; i < n; i++) {
    out.push(parts.slice(Math.round(i * size), Math.round((i + 1) * size)).join(" "));
  }
  return out;
}

const BEATS = [
  "opening establishing shot that hooks the viewer",
  "the subject is introduced in a close, detailed shot",
  "action develops, camera moves with the subject",
  "tension or curiosity builds with a new angle",
  "the key moment, most dramatic framing",
  "reaction and emotional beat",
  "wide shot revealing the bigger picture",
  "resolution and a memorable closing image",
];

const CAMERAS = [
  "slow push-in",
  "low-angle tracking shot",
  "wide establishing shot",
  "over-the-shoulder close-up",
  "smooth lateral dolly",
  "handheld medium shot",
  "slow crane up",
  "static close-up with shallow depth of field",
];

/** Deterministic planner used when no AI is configured or the AI call fails. */
function fallbackPlan(p: PlanScenesParams, n: number): PlannedSequence {
  const chunks = splitBrief(p.brief, n);
  const enough = chunks.length >= n;
  const scenes: string[] = [];
  for (let i = 0; i < n; i++) {
    const chunk = chunks[Math.min(chunks.length - 1, Math.floor((i * chunks.length) / n))];
    if (enough) {
      scenes.push(`${chunk.replace(/[.\s]+$/, "")}. ${CAMERAS[i % CAMERAS.length]}, single continuous shot.`);
    } else {
      // fewer ideas than scenes: keep the same story beat but vary the story moment and camera so clips are not duplicates
      const beat = BEATS[Math.min(BEATS.length - 1, Math.round((i / Math.max(1, n - 1)) * (BEATS.length - 1)))];
      scenes.push(`${chunk} (${beat}). ${CAMERAS[i % CAMERAS.length]}, single continuous shot.`);
    }
  }
  const anchor = (p.basePrompt || "").trim().slice(0, 500);
  return {
    title: p.fallbackTitle || "Video nhiều cảnh",
    styleBible:
      `${p.style || "Cinematic"} look, same characters, wardrobe, location and lighting in every shot, photorealistic, ${p.aspectRatio} framing, no on-screen text or subtitles.` +
      (anchor ? ` Visual anchor: ${anchor}` : ""),
    scenes,
    usedAI: false,
  };
}

export async function planScenes(p: PlanScenesParams): Promise<PlannedSequence> {
  const n = sceneCountFor(p.totalDuration, p.clipSeconds);

  if (aiProvider.isConfigured() && aiProvider.planScenes) {
    try {
      const out = await aiProvider.planScenes({
        brief: p.brief,
        sceneCount: n,
        clipSeconds: p.clipSeconds,
        style: p.style || "Cinematic",
        aspectRatio: p.aspectRatio,
        language: p.language || "vi",
      });
      return {
        title: p.fallbackTitle || out.title,
        styleBible: out.styleBible,
        scenes: out.scenes,
        caption: out.caption,
        hashtags: out.hashtags,
        usedAI: true,
      };
    } catch (err: any) {
      const plan = fallbackPlan(p, n);
      plan.warning = `AI chia cảnh thất bại (${err.message}). Đã dùng bộ chia cảnh đơn giản, hãy kiểm tra lại prompt từng cảnh.`;
      return plan;
    }
  }

  const plan = fallbackPlan(p, n);
  plan.warning = "Chưa cấu hình GEMINI_API_KEY nên dùng bộ chia cảnh đơn giản. Hãy chỉnh prompt từng cảnh trước khi chạy.";
  return plan;
}
