import { z } from "zod";

export const ContentTypeEnum = z.enum([
  "SHORT_VIDEO",
  "SHORT_FILM",
  "MOVIE",
  "DOCUMENTARY",
  "OTHER",
]);

export const GenerationStatusEnum = z.enum([
  "DRAFT",
  "QUEUED",
  "STARTING_BROWSER",
  "CHECKING_ACCOUNT",
  "OPENING_FLOW",
  "SUBMITTING",
  "GENERATING",
  "DOWNLOADING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "NEEDS_USER_ACTION",
  "CANCELLED",
]);

export const VideoAssetStatusEnum = z.enum([
  "PROCESSING",
  "READY",
  "FAILED",
]);

export const GoogleAccountStatusEnum = z.enum([
  "NOT_CONNECTED",
  "CONNECTING",
  "CONNECTED",
  "EXPIRED",
  "ERROR",
  "DISABLED",
]);

export const AccountLockStatusEnum = z.enum([
  "AVAILABLE",
  "IN_USE",
  "DISABLED",
]);

// 1. Project Schemas
export const createProjectSchema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên dự án").max(120, "Tên dự án quá dài"),
  description: z.string().max(500, "Mô tả không được vượt quá 500 ký tự").optional(),
  contentType: ContentTypeEnum.default("SHORT_VIDEO"),
  topic: z.string().min(1, "Vui lòng nhập chủ đề hoặc ý tưởng"),
});

export const updateProjectSchema = createProjectSchema.partial();

// 2. Content Schemas
export const createContentSchema = z.object({
  projectId: z.string().min(1, "Mã dự án không hợp lệ"),
  title: z.string().min(1, "Vui lòng nhập tiêu đề nội dung"),
  concept: z.string().min(1, "Vui lòng nhập ý tưởng / concept"),
  script: z.string().min(1, "Vui lòng nhập kịch bản phân cảnh"),
  videoPrompt: z.string().min(1, "Vui lòng nhập video prompt"),
  description: z.string().optional(),
  language: z.string().default("vi"),
  style: z.string().default("Cinematic"),
  duration: z.string().default("8s"),
  aspectRatio: z.string().default("9:16"),
  tags: z.array(z.string()).default([]),
});

export const updateContentSchema = createContentSchema.partial().omit({ projectId: true });

// 3. AI Generation Schemas
export const aiGenerateContentInputSchema = z.object({
  topic: z.string().min(3, "Chủ đề cần ít nhất 3 ký tự").max(2000),
  contentType: ContentTypeEnum.default("SHORT_VIDEO"),
  language: z.string().default("vi"),
  style: z.string().default("Cinematic"),
  targetDuration: z.string().default("8s"),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
});

export const aiGeneratedContentOutputSchema = z.object({
  title: z.string().min(1),
  concept: z.string().min(1),
  script: z.string().min(1),
  videoPrompt: z.string().min(1),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
});

// 4. Generation Job Schemas
export const createGenerationSchema = z.object({
  projectId: z.string().min(1, "Mã dự án không hợp lệ"),
  contentId: z.string().optional(),
  googleAccountId: z.string().optional(),
  prompt: z.string().min(1, "Vui lòng nhập video prompt"),
  model: z.string().default("Veo 3.1 Fast"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("9:16"),
  duration: z.enum(["8s", "15s", "30s", "60s"]).default("8s"),
  generationMethod: z.enum(["AUTO", "MANUAL"]).default("AUTO"),
});

// 4b. Sequence (multi-scene long video) Schemas
export const TransitionEnum = z.enum(["CUT", "CROSSFADE"]);
export const ContinuityEnum = z.enum(["FLOW_AGENT", "INDEPENDENT", "LAST_FRAME"]);

export const createSequenceSchema = z
  .object({
    projectId: z.string().min(1, "Mã dự án không hợp lệ"),
    contentId: z.string().optional(),
    title: z.string().max(160).optional(),
    brief: z.string().max(4000).optional(),
    totalDuration: z.coerce.number().int().min(8, "Tổng thời lượng tối thiểu 8 giây").max(300, "Tổng thời lượng tối đa 300 giây"),
    clipSeconds: z.coerce.number().int().min(4).max(15).default(10),
    aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("9:16"),
    model: z.string().default("Veo 3.1 Fast"),
    transition: TransitionEnum.default("CUT"),
    continuity: ContinuityEnum.default("FLOW_AGENT"),
    googleAccountId: z.string().optional(),
    /** Channel preset (see lib/presets.ts): its style, hashtags and reference images are applied to the new video */
    presetId: z.string().optional(),
  })
  .refine((v) => Boolean(v.contentId) || Boolean(v.brief && v.brief.trim()), {
    message: "Chọn một kịch bản có sẵn hoặc nhập ý tưởng (brief) cho video.",
    path: ["brief"],
  });

export const updateSequenceSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  styleBible: z.string().max(4000).optional(),
  transition: TransitionEnum.optional(),
  continuity: ContinuityEnum.optional(),
  caption: z.string().max(4000).optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  googleAccountId: z.string().nullable().optional(),
});

export const startSequenceSchema = z.object({
  googleAccountId: z.string().optional(),
  /** Only (re)run these scenes (generation ids). Omit to run every scene that is not COMPLETED. */
  sceneIds: z.array(z.string()).optional(),
  /**
   * RUN = render (spends credits). DRYRUN = Flow Agent plans the video, tool reads the plan + price and REJECTS it (0 credits).
   * RECOVER = import the clips already present in the sequence's Flow project (0 credits), e.g. after a failed run.
   */
  mode: z.enum(["RUN", "DRYRUN", "RECOVER"]).default("RUN"),
  /** RECOVER only: Flow project URL to read the clips from (defaults to the one stored on the sequence). */
  // opened in the user's signed-in Google browser profile: only Flow project pages are allowed
  flowProjectUrl: z.string().url().regex(/^https:\/\/(flow\.google\.com|labs\.google)(\/[^\s?#]*)?\/project\/[^/?#]+/, "Không phải URL dự án Flow").optional(),
});

export const updateSceneSchema = z.object({
  prompt: z.string().min(1, "Prompt cảnh không được để trống").max(4000),
});

// 5. Google Account Schemas
export const createGoogleAccountSchema = z.object({
  name: z.string().trim().min(1, "Tên tài khoản không được để trống").max(80),
  label: z.string().trim().min(1, "Nhãn tài khoản không được để trống").max(120),
  notes: z.string().max(500).optional(),
});
// profileDir (which browser profile = which Google session) and status are server-controlled, never client input

export const updateGoogleAccountSchema = createGoogleAccountSchema.partial();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateContentInput = z.infer<typeof createContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type AIGenerateContentInput = z.infer<typeof aiGenerateContentInputSchema>;
export type AIGeneratedContentOutput = z.infer<typeof aiGeneratedContentOutputSchema>;
export type CreateGenerationInput = z.infer<typeof createGenerationSchema>;
export type CreateSequenceInput = z.infer<typeof createSequenceSchema>;
export type CreateGoogleAccountInput = z.infer<typeof createGoogleAccountSchema>;
export type UpdateGoogleAccountInput = z.infer<typeof updateGoogleAccountSchema>;

/** Unattended entry point (topic feeds / schedulers). See lib/sequence/automation.ts */
export const automationRequestSchema = z
  .object({
    topic: z.string().trim().min(3).max(2000).optional(),
    topics: z.array(z.string().trim().min(3).max(2000)).max(20).optional(),
    presetId: z.string().optional(),
    projectId: z.string().optional(),
    totalDuration: z.coerce.number().int().min(8).max(300).default(30),
    /** start rendering immediately (default). false = only create the sequence */
    autostart: z.boolean().default(true),
    /** only create the video and run the free dry run (Flow plans + prices it, then the tool rejects): nothing is rendered or charged */
    dryRunOnly: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.topic) || (v.topics && v.topics.length > 0), { message: "Cần topic hoặc topics[]" });

export type AutomationRequest = z.infer<typeof automationRequestSchema>;
