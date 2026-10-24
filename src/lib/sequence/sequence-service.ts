import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { enqueueGenerationById } from "@/lib/queue/enqueue-generation";
import { assertCanSpend } from "./credit-guard";
import { ensureChannelProject, ensureManualProject, getChannel } from "@/lib/channels";
import { notifyWebhook } from "@/lib/automation/notify";
import { CreateSequenceInput } from "@/lib/validations";
import { clipCount } from "@/lib/content/script-writer";
import { assembleClips, Transition } from "./assembler";
import { parseKeys } from "./attachments";
import { AGENT_CREDITS_PER_CLIP } from "./agent-prompt";

/** Generation statuses that mean "a worker owns this scene right now" */
const IN_FLIGHT = ["QUEUED", "STARTING_BROWSER", "CHECKING_ACCOUNT", "OPENING_FLOW", "SUBMITTING", "GENERATING", "DOWNLOADING", "PROCESSING"];

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "video";

export class SequenceService {
  /**
   * Create a Sequence + one DRAFT Generation per ~10 s clip. Does NOT start rendering. Flow's own Agent splits the brief into
   * scenes at render time (the lead scene runs one batch for every clip), so no LLM call happens here.
   * With channelId the channel's style, language, hashtags and reference images apply and the video is filed under the channel;
   * without one it goes to the owner's "Video tự tạo" folder. The channel and Google account must belong to ownerId.
   */
  static async create(
    input: CreateSequenceInput,
    ownerId: string,
    /** publishing metadata already written (e.g. by the script writer for an automated topic) */
    meta: { caption?: string; tags?: string[] } = {}
  ) {
    const channel = input.channelId ? await getChannel(input.channelId, ownerId) : null;
    if (input.channelId && !channel) throw new Error("Không tìm thấy kênh đã chọn.");
    if (input.googleAccountId && !(await prisma.googleAccount.findFirst({ where: { id: input.googleAccountId, ownerId }, select: { id: true } }))) {
      throw new Error("Không tìm thấy tài khoản Google đã chọn.");
    }
    const projectId = channel ? await ensureChannelProject(channel) : await ensureManualProject(ownerId);
    const googleAccountId = input.googleAccountId || channel?.googleAccountId || null;
    const total = clipCount(input.totalDuration, input.clipSeconds);

    const sequence = await prisma.$transaction(async (tx) => {
      const seq = await tx.sequence.create({
        data: {
          projectId,
          googleAccountId,
          title: input.title?.trim() || input.brief.split("\n")[0].slice(0, 80) || "Video",
          brief: input.brief,
          styleBible: channel?.styleBible ?? "",
          model: input.model,
          aspectRatio: input.aspectRatio,
          clipSeconds: input.clipSeconds,
          totalDuration: input.totalDuration,
          transition: input.transition,
          continuity: "FLOW_AGENT",
          language: input.language || channel?.language || "vi",
          genre: input.genre ?? null,
          caption: meta.caption || null,
          tags: JSON.stringify([...new Set([...(meta.tags ?? []), ...(channel?.hashtags ?? [])])]),
          status: "PLANNED",
        },
      });
      for (let i = 0; i < total; i++) {
        await tx.generation.create({
          data: {
            projectId,
            googleAccountId,
            sequenceId: seq.id,
            sceneIndex: i,
            // replaced by the prompt Flow's Agent actually used once the clip is downloaded
            prompt: `Cảnh ${i + 1}: Flow Agent sẽ tự lập prompt khi chạy.`,
            // the lead scene runs the whole Flow Agent batch: budget for all clips
            ...(i === 0 ? { flowCreditEstimate: AGENT_CREDITS_PER_CLIP * total } : {}),
            model: input.model,
            aspectRatio: input.aspectRatio,
            duration: `${input.clipSeconds}s`,
            status: "DRAFT",
            provider: "GOOGLE_FLOW",
            generationMethod: "AUTO",
          },
        });
      }
      return seq;
    });

    // channel reference images: COPY the files (deleting a video must never delete the channel's images)
    if (channel && channel.referenceImageKeys.length > 0) {
      const keys: string[] = [];
      for (const k of channel.referenceImageKeys.slice(0, 3)) {
        if (!storage.fileExists(k)) continue;
        const saved = await storage.saveFile(projectId, path.basename(k).replace(/^\d+_/, ""), await storage.readFile(k), "references");
        keys.push(saved.storageKey);
      }
      if (keys.length > 0) await prisma.sequence.update({ where: { id: sequence.id }, data: { referenceImageKeys: JSON.stringify(keys) } });
    }

    return { sequence, sceneCount: total };
  }

  /** Queue the Flow Agent batch (lead scene), a free dry run, or a free clip recovery. Safe to call again after a failure. */
  static async start(
    sequenceId: string,
    opts: { googleAccountId?: string; sceneIds?: string[]; mode?: "RUN" | "DRYRUN" | "RECOVER"; flowProjectUrl?: string } = {}
  ) {
    const seq = await prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: {
        scenes: { orderBy: { sceneIndex: "asc" }, include: { videoAsset: true } },
        finalVideo: { select: { id: true } },
        project: { select: { ownerId: true } },
      },
    });
    if (!seq) throw new Error("Không tìm thấy video nhiều cảnh này.");
    // the Google account (= whose credits and whose Google session) always belongs to the owner of the video, whoever calls
    const owner = seq.project.ownerId;
    if (!owner) throw new Error("Video chưa có chủ sở hữu.");
    if (seq.status === "ASSEMBLING") throw new Error("Video đang được ghép, vui lòng chờ xong.");
    // clips are deleted once the long video exists: a COMPLETED scene of a finished video is done, never re-rendered implicitly
    const hasClip = (s: (typeof seq.scenes)[number]) => !!s.videoAsset || (!!seq.finalVideo && s.status === "COMPLETED");

    if (seq.continuity !== "FLOW_AGENT") throw new Error("Video này được tạo bằng chế độ cũ (từng cảnh riêng): chỉ còn hỗ trợ Import thủ công từng cảnh.");
    let accountId: string | null | undefined = opts.googleAccountId || seq.googleAccountId;
    if (accountId && !(await prisma.googleAccount.findFirst({ where: { id: accountId, ownerId: owner }, select: { id: true } }))) {
      if (opts.googleAccountId) throw new Error("Không tìm thấy tài khoản Google đã chọn.");
      accountId = null; // stale/foreign account stored on the sequence: pick one of the owner's
    }
    if (!accountId) {
      const acc = await prisma.googleAccount.findFirst({
        where: { ownerId: owner, status: "CONNECTED", lockStatus: "AVAILABLE" },
        // spread usage: the account with the most Flow credits left first (unknown balance last)
        orderBy: [{ lastKnownFlowCredits: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
      });
      if (!acc) throw new Error("Không có tài khoản Google nào đang CONNECTED. Vui lòng kết nối tại Cài Đặt.");
      accountId = acc.id;
    }

    const mode = opts.mode || "RUN";
    if (mode !== "RUN") {
      if (seq.scenes.some((s) => IN_FLIGHT.includes(s.status))) return { enqueued: 0, skipped: seq.scenes.length, message: "Flow Agent đang chạy." };
      const lead = seq.scenes.find((s) => (s.sceneIndex ?? 0) === 0) ?? seq.scenes[0];
      if (!lead) throw new Error("Video chưa có cảnh nào.");
      if (mode === "DRYRUN") {
        if (seq.scenes.some(hasClip)) throw new Error("Video đã có clip: không cần chạy thử.");
        if (seq.scenes.some((s) => s.status === "NEEDS_USER_ACTION")) {
          throw new Error("Lần chạy trước có thể đã tốn credit: dùng 'Khôi phục clip từ Flow' thay vì chạy thử.");
        }
        await enqueueGenerationById(lead.id, accountId, { mode: "DRYRUN" });
        return { enqueued: 1, skipped: seq.scenes.length - 1, message: "Đã xếp hàng chạy thử: Flow Agent lập kế hoạch, tool đọc giá rồi từ chối (0 credit)." };
      }
      // RECOVER
      await prisma.sequence.update({ where: { id: sequenceId }, data: { status: "RUNNING", errorMessage: null, googleAccountId: accountId } });
      await enqueueGenerationById(lead.id, accountId, { mode: "RECOVER", flowProjectUrl: opts.flowProjectUrl });
      return { enqueued: 1, skipped: seq.scenes.length - 1, message: "Đã xếp hàng khôi phục clip từ dự án Flow (0 credit)." };
    }

    // One batch job (lead = scene 0) makes every clip. Re-running after a PARTIAL result would pay for the clips again.
    const explicit = !!opts.sceneIds?.length;
    const done = seq.scenes.filter(hasClip).length;
    if (seq.scenes.some((s) => IN_FLIGHT.includes(s.status))) return { enqueued: 0, skipped: seq.scenes.length, message: "Flow Agent đang chạy." };
    if (done === seq.scenes.length) return { enqueued: 0, skipped: seq.scenes.length, message: "Tất cả cảnh đã có clip." };
    if (done > 0 && !explicit) {
      throw new Error(
        `Flow Agent đã tạo ${done}/${seq.scenes.length} clip. Chạy lại sẽ tốn credits cho cả bộ: hãy bấm "Khôi phục clip từ Flow" (0 credit), hoặc mở project Flow, tải clip còn thiếu và Import thủ công vào từng cảnh.`
      );
    }
    const targets = seq.scenes.filter((s) => (s.sceneIndex ?? 0) === 0);
    const skipped = seq.scenes.length - targets.length;
    if (targets.length === 0) throw new Error("Video chưa có cảnh nào.");

    // Credit guard BEFORE anything is queued: per-video cap, daily budget and (recent) account balance
    await assertCanSpend(targets[0].flowCreditEstimate || AGENT_CREDITS_PER_CLIP * seq.scenes.length, { googleAccountId: accountId });

    await prisma.sequence.update({
      where: { id: sequenceId },
      data: { status: "RUNNING", errorMessage: null, googleAccountId: accountId },
    });

    let enqueued = 0;
    for (const scene of targets) {
      try {
        // Re-rendering a finished scene: drop the old clip first (VideoAsset.generationId is unique)
        if (scene.videoAsset) {
          await storage.deleteFile(scene.videoAsset.storageKey);
          if (scene.videoAsset.thumbnailKey) await storage.deleteFile(scene.videoAsset.thumbnailKey);
          await prisma.videoAsset.delete({ where: { id: scene.videoAsset.id } });
        }
        await enqueueGenerationById(scene.id, accountId);
        enqueued++;
      } catch (err: any) {
        await prisma.sequence.update({
          where: { id: sequenceId },
          data: { status: "NEEDS_USER_ACTION", errorMessage: `Không thể xếp hàng cảnh ${(scene.sceneIndex ?? 0) + 1}: ${err.message}` },
        });
        throw err;
      }
    }
    return { enqueued, skipped, message: "Đã xếp hàng: Flow Agent sẽ tạo toàn bộ clip trong một project." };
  }

  /**
   * Called by the worker (and manual import) whenever a scene generation settles.
   * Failure -> pause the sequence; last missing clip -> assemble automatically.
   */
  static async onGenerationSettled(generationId: string): Promise<void> {
    const gen = await prisma.generation.findUnique({ where: { id: generationId } });
    if (!gen?.sequenceId) return;
    const seqId = gen.sequenceId;

    if (gen.status === "FAILED" || gen.status === "NEEDS_USER_ACTION") {
      await notifyWebhook("sequence.needs_attention", { sequenceId: seqId, scene: (gen.sceneIndex ?? 0) + 1, error: gen.errorMessage });
      await prisma.sequence.updateMany({
        where: { id: seqId, status: { in: ["RUNNING", "PLANNED"] } },
        data: {
          status: "NEEDS_USER_ACTION",
          errorMessage: `Cảnh ${(gen.sceneIndex ?? 0) + 1} thất bại: ${gen.errorMessage || "cần thao tác thủ công"}. Các cảnh còn lại đã tạm dừng.`,
        },
      });
      return;
    }
    if (gen.status !== "COMPLETED") return;

    const scenes = await prisma.generation.findMany({
      where: { sequenceId: seqId },
      include: { videoAsset: { select: { id: true } } },
    });
    const ready = scenes.every((s) => s.status === "COMPLETED" && s.videoAsset);
    if (ready) {
      await this.assemble(seqId);
    }
  }

  /** Stitch all scene clips into the final video. Re-runnable (replaces the previous final). */
  static async assemble(sequenceId: string, opts: { transition?: Transition } = {}) {
    // atomic claim so two completions can't assemble twice
    const claim = await prisma.sequence.updateMany({
      where: { id: sequenceId, status: { in: ["PLANNED", "RUNNING", "NEEDS_USER_ACTION", "COMPLETED"] } },
      data: { status: "ASSEMBLING", errorMessage: null, ...(opts.transition ? { transition: opts.transition } : {}) },
    });
    if (claim.count === 0) return { skipped: true as const };

    const tmpDir = path.resolve(process.cwd(), "tmp", "sequences", sequenceId);
    try {
      const seq = await prisma.sequence.findUnique({
        where: { id: sequenceId },
        include: {
          scenes: { orderBy: { sceneIndex: "asc" }, include: { videoAsset: true } },
          finalVideo: true,
        },
      });
      if (!seq) throw new Error("Không tìm thấy video nhiều cảnh.");

      const missing = seq.scenes.filter((s) => !s.videoAsset || !storage.fileExists(s.videoAsset.storageKey));
      if (missing.length > 0) {
        const hint = seq.finalVideo
          ? ` Clip đã được xoá sau lần ghép trước (chỉ giữ video dài): bấm "Khôi phục clip từ Flow" (0 credit) rồi ghép lại.`
          : "";
        throw new Error(`Thiếu clip của cảnh: ${missing.map((m) => (m.sceneIndex ?? 0) + 1).join(", ")}.${hint}`);
      }

      const inputs = seq.scenes.map((s) => storage.getFilePath(s.videoAsset!.storageKey));
      fs.mkdirSync(tmpDir, { recursive: true });
      const out = await assembleClips({
        inputs,
        outputPath: path.join(tmpDir, "final.mp4"),
        transition: (opts.transition || seq.transition) as Transition,
      });

      const buffer = fs.readFileSync(out.outputPath);
      const filename = `${slug(seq.title)}_final.mp4`;
      const saved = await storage.saveFile(seq.projectId, filename, buffer, "videos");

      const { videoProcessor } = await import("@/lib/video-processor");
      const thumbDir = path.join(path.dirname(path.dirname(saved.absolutePath)), "thumbnails");
      const thumbFile = await videoProcessor.generateThumbnail(saved.absolutePath, thumbDir);
      const thumbnailKey = thumbFile ? `projects/${seq.projectId}/thumbnails/${thumbFile}` : null;

      // replace previous final (if re-assembled)
      if (seq.finalVideo) {
        await storage.deleteFile(seq.finalVideo.storageKey);
        if (seq.finalVideo.thumbnailKey) await storage.deleteFile(seq.finalVideo.thumbnailKey);
        await prisma.videoAsset.delete({ where: { id: seq.finalVideo.id } });
      }

      await prisma.videoAsset.create({
        data: {
          projectId: seq.projectId,
          sequenceId: seq.id,
          filename,
          storageKey: saved.storageKey,
          mimeType: "video/mp4",
          fileSize: buffer.length,
          duration: out.duration,
          width: out.width,
          height: out.height,
          thumbnailKey,
          source: "SEQUENCE",
          providerMetadata: JSON.stringify({
            sceneCount: seq.scenes.length,
            transition: opts.transition || seq.transition,
            sceneAssetIds: seq.scenes.map((s) => s.videoAsset!.id),
          }),
        },
      });

      await prisma.sequence.update({
        where: { id: sequenceId },
        data: { status: "COMPLETED", errorMessage: null, ...(opts.transition ? { transition: opts.transition } : {}) },
      });
      // Only the long video is kept: the 10s clips are intermediates (they stay in the Flow project and can be re-imported for free)
      if (process.env.KEEP_SEQUENCE_CLIPS !== "true") await this.purgeSceneClips(sequenceId).catch((e) => console.error(`[Sequence] purge clips ${sequenceId}:`, e));
      await notifyWebhook("video.completed", { sequenceId, title: seq.title, duration: out.duration, scenes: seq.scenes.length });
      return { skipped: false as const, duration: out.duration };
    } catch (err: any) {
      console.error(`[Sequence] Assemble failed for ${sequenceId}:`, err);
      await prisma.sequence.update({
        where: { id: sequenceId },
        data: { status: "NEEDS_USER_ACTION", errorMessage: `Ghép video thất bại: ${err.message}` },
      });
      throw err;
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }

  /**
   * Delete the scene clips (files + VideoAsset rows) of an assembled sequence, keeping only its final video. Scene rows keep their
   * prompt and Flow project URL, so the clips can be re-imported at 0 credits ("Khôi phục clip từ Flow") if a re-assembly is needed.
   */
  static async purgeSceneClips(sequenceId: string): Promise<number> {
    const seq = await prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: { finalVideo: { select: { id: true } }, scenes: { include: { videoAsset: true } } },
    });
    if (!seq?.finalVideo || seq.status !== "COMPLETED") return 0; // never drop clips before a final video exists
    let removed = 0;
    for (const s of seq.scenes) {
      const a = s.videoAsset;
      if (!a) continue;
      await storage.deleteFile(a.storageKey);
      if (a.thumbnailKey) await storage.deleteFile(a.thumbnailKey);
      await prisma.videoAsset.delete({ where: { id: a.id } }).catch(() => {});
      removed++;
    }
    return removed;
  }

  /** Delete the sequence, its scenes, the final video and the clips (files included). */
  static async remove(sequenceId: string) {
    const seq = await prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: { scenes: { include: { videoAsset: true } }, finalVideo: true },
    });
    if (!seq) return false;
    if (seq.status === "ASSEMBLING" || seq.scenes.some((s) => IN_FLIGHT.includes(s.status))) {
      throw new Error("Video đang được xử lý, không thể xoá lúc này.");
    }
    for (const key of parseKeys(seq.referenceImageKeys)) {
      await storage.deleteFile(key);
    }
    const assets = [...seq.scenes.map((s) => s.videoAsset), seq.finalVideo].filter(Boolean) as any[];
    for (const a of assets) {
      await storage.deleteFile(a.storageKey);
      if (a.thumbnailKey) await storage.deleteFile(a.thumbnailKey);
      await prisma.videoAsset.delete({ where: { id: a.id } }).catch(() => {});
    }
    await prisma.sequence.delete({ where: { id: sequenceId } });
    return true;
  }
}
