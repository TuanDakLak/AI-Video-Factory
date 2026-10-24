import { z } from "zod";

// ---------------------------------------------------------------- videos (sequences)

export const TransitionEnum = z.enum(["CUT", "CROSSFADE"]);

/**
 * A long video made by hand. Flow's Agent splits the brief into ~10 s clips in ONE Flow project; the clips are then joined.
 * With a channel, the channel's style, language, hashtags and reference images are applied and the video is filed under it.
 */
export const createSequenceSchema = z.object({
  channelId: z.string().optional(),
  title: z.string().max(160).optional(),
  brief: z.string().trim().min(1, "Nhập ý tưởng hoặc kịch bản cho video.").max(12000), // a full 9-scene script can be long
  totalDuration: z.coerce.number().int().min(8, "Tổng thời lượng tối thiểu 8 giây").max(300, "Tổng thời lượng tối đa 300 giây"),
  clipSeconds: z.coerce.number().int().min(4).max(15).default(10),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("9:16"),
  model: z.string().default("Veo 3.1 Fast"),
  transition: TransitionEnum.default("CUT"),
  googleAccountId: z.string().optional(),
  /** spoken language (ISO code); defaults to the channel's, else "vi" */
  language: z.string().max(10).optional(),
  /** genre template key (lib/content/genres.ts) */
  genre: z.string().max(40).optional(),
});
export type CreateSequenceInput = z.infer<typeof createSequenceSchema>;

export const updateSequenceSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  styleBible: z.string().max(4000).optional(),
  transition: TransitionEnum.optional(),
  caption: z.string().max(4000).optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  googleAccountId: z.string().nullable().optional(),
});

export const startSequenceSchema = z.object({
  googleAccountId: z.string().optional(),
  /** Explicitly re-run the batch even though some clips already exist (spends credits for the whole batch). */
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

// ---------------------------------------------------------------- Google (Flow) accounts

export const createGoogleAccountSchema = z.object({
  name: z.string().trim().min(1, "Tên tài khoản không được để trống").max(80),
  label: z.string().trim().min(1, "Nhãn tài khoản không được để trống").max(120),
  /** the Google login of this Flow account: pre-filled on the sign-in page when connecting */
  email: z.string().trim().toLowerCase().email("Email Google không hợp lệ").max(254).optional(),
  notes: z.string().max(500).optional(),
});
// profileDir (which browser profile = which Google session) and status are server-controlled, never client input

export const updateGoogleAccountSchema = createGoogleAccountSchema.partial();

// ---------------------------------------------------------------- unattended API

/** POST /api/automation/topics: an external scheduler adds topics to a channel's inbox. */
export const automationTopicsSchema = z.object({
  channelId: z.string().min(1),
  topics: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(200),
        angle: z.string().trim().max(1000).optional(),
        durationSec: z.union([z.literal(30), z.literal(60), z.literal(90)]).optional(),
      })
    )
    .min(1)
    .max(20),
  /** true: produce without waiting for the channel's review delay */
  approved: z.boolean().default(false),
});
