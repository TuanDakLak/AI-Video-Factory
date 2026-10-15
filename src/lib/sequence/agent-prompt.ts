/**
 * FLOW_AGENT mode: ONE prompt describes the whole video and Flow's own Agent splits it into scenes
 * (reference images once, N clips in the same project). No external AI / API key is used for planning.
 * Verified on the real Flow UI (Oct 2026): the Agent answers "tạo N video này với chi phí là X tín dụng" and writes
 * "Scene k: ..." prompts that reuse the reference images.
 */
export interface AgentBatchPromptInput {
  brief: string;
  style?: string | null;
  totalDuration: number;
  clipSeconds: number;
  count: number;
  aspectRatio: string;
  hasReferenceImages?: boolean;
  language?: string | null;
}

/** Credits Flow charged per clip in observed runs: 12 (no reference) / 15 (with reference images). */
export const AGENT_CREDITS_PER_CLIP = 15;

/** Appended to every Agent prompt: the Agent otherwise tends to answer a short idea with a question ("which clash?") and make nothing. */
export const AGENT_NO_QUESTIONS_RULE =
  "AUTONOMOUS MODE: do NOT ask me any clarifying questions and do not offer choices. Decide every creative detail yourself (characters, setting, story, camera, music) — if the brief is short or vague, invent a concrete, vivid story. Go straight to the plan and the approval request.";

/** Follow-up sent when the Agent went idle without a plan / approval card (usually because it asked a question instead). */
export function buildAgentNudge(count: number): string {
  return `Không cần hỏi thêm. Hãy tự chọn mọi chi tiết sáng tạo (nhân vật, bối cảnh, cốt truyện, phong cách) và tiến hành ngay: tạo ảnh tham chiếu nếu cần rồi đề xuất tạo đúng ${count} video để tôi phê duyệt. (Proceed now without asking any question; choose everything yourself.)`;
}

export function buildAgentBatchPrompt(i: AgentBatchPromptInput): string {
  const orientation = i.aspectRatio === "16:9" ? "horizontal 16:9" : i.aspectRatio === "9:16" ? "vertical 9:16" : i.aspectRatio;
  const lines: string[] = [
    `Plan and create a ${i.count * i.clipSeconds}-second ${orientation} video as exactly ${i.count} consecutive ${i.clipSeconds}-second video clips (one video per scene, scene 1 to scene ${i.count}, in this order) in this project.`,
    `Use the same main character(s), product and setting in every clip: create the reference images once and reuse them in every scene. Keep ONE consistent visual style, and make each clip continue naturally from the end of the previous clip (same location, lighting and continuity of action) so the clips can be joined into one long video. Label the prompts "Scene 1" ... "Scene ${i.count}". Do not create any extra videos.`,
  ];
  lines.push(AGENT_NO_QUESTIONS_RULE);
  if (i.hasReferenceImages) lines.push("The attached image(s) are the exact product / character references: keep them identical in every scene.");
  if (i.language) lines.push(`Any spoken words or on-screen text should be in ${i.language}.`);
  lines.push("", "Brief:", i.brief.trim());
  if (i.style && i.style.trim()) lines.push("", "Visual style notes:", i.style.trim());
  return lines.join("\n");
}
