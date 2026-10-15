import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { enqueueGenerationById } from "@/lib/queue/enqueue-generation";
import { assertCanSpend } from "./credit-guard";
import { getPreset } from "@/lib/presets";
import { VEO_API_PROVIDER, assertApiBudget, estimateApiUsd, veoSettings } from "@/lib/automation/veo-config";
import { notifyWebhook } from "@/lib/automation/notify";
import { CreateSequenceInput } from "@/lib/validations";
import { composeScenePrompt, planScenes, sceneCountFor } from "./scene-planner";
import { assembleClips, Transition } from "./assembler";
import { parseKeys } from "./attachments";
import { AGENT_CREDITS_PER_CLIP } from "./agent-prompt";

/** Generation statuses that mean "a worker owns this scene right now" */
const IN_FLIGHT = ["QUEUED", "STARTING_BROWSER", "CHECKING_ACCOUNT", "OPENING_FLOW", "SUBMITTING", "GENERATING", "DOWNLOADING", "PROCESSING"];

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "video";

function safeTags(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.map((t) => String(t)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export class SequenceService {
  /**
   * Plan scenes with AI (or fallback) and create Sequence + one DRAFT Generation per scene. Does NOT start rendering.
   * ownerId: the project, content, preset and Google account must all belong to this user.
   */
  static async create(input: CreateSequenceInput, ownerId: string) {
    const project = await prisma.project.findFirst({ where: { id: input.projectId, ownerId } });
    if (!project) throw new Error("Không tìm thấy dự án tương ứng.");
    if (input.googleAccountId && !(await prisma.googleAccount.findFirst({ where: { id: input.googleAccountId, ownerId }, select: { id: true } }))) {
      throw new Error("Không tìm thấy tài khoản Google đã chọn.");
    }

    const content = input.contentId
      ? await prisma.content.findUnique({ where: { id: input.contentId } })
      : null;
    if (input.contentId && (!content || content.projectId !== input.projectId)) {
      throw new Error("Kịch bản đã chọn không thuộc dự án này.");
    }

    const preset = input.presetId ? getPreset(input.presetId, ownerId) : null;
    if (input.presetId && !preset) throw new Error("Không tìm thấy preset kênh đã chọn.");

    const brief =
      (input.brief && input.brief.trim()) ||
      [content?.concept, content?.script].filter(Boolean).join("\n\n") ||
      project.topic;

    // FLOW_AGENT: Flow's own Agent splits the brief into scenes at render time -> no external AI call here.
    const flowAgent = input.continuity === "FLOW_AGENT";
    const plan: Awaited<ReturnType<typeof planScenes>> = flowAgent
      ? {
          title: input.title || content?.title || project.name || "Video nhiều cảnh",
          styleBible: [preset?.styleBible, content?.style, content?.videoPrompt].filter(Boolean).join("\n"),
          scenes: Array.from({ length: sceneCountFor(input.totalDuration, input.clipSeconds) }, (_, i) => `Cảnh ${i + 1}: Flow Agent sẽ tự lập prompt khi chạy.`),
          usedAI: false,
        }
      : await planScenes({
          brief,
          totalDuration: input.totalDuration,
          clipSeconds: input.clipSeconds,
          style: [preset?.styleBible, content?.style].filter(Boolean).join(". ") || undefined,
          aspectRatio: input.aspectRatio,
          language: content?.language || preset?.language,
          basePrompt: content?.videoPrompt,
          fallbackTitle: input.title || content?.title,
        });

    const total = plan.scenes.length;
    const sequence = await prisma.$transaction(async (tx) => {
      const seq = await tx.sequence.create({
        data: {
          projectId: input.projectId,
          contentId: content?.id ?? null,
          googleAccountId: input.googleAccountId || null,
          title: input.title || plan.title,
          brief,
          styleBible: plan.styleBible,
          model: input.model,
          aspectRatio: input.aspectRatio,
          clipSeconds: input.clipSeconds,
          totalDuration: input.totalDuration,
          transition: input.transition,
          continuity: input.continuity,
          caption: plan.caption || content?.description || null,
          tags: JSON.stringify(
            [...new Set([...(plan.hashtags && plan.hashtags.length > 0 ? plan.hashtags : safeTags(content?.tags)), ...(preset?.hashtags ?? [])])]
          ),
          status: "PLANNED",
        },
      });
      for (let i = 0; i < total; i++) {
        await tx.generation.create({
          data: {
            projectId: input.projectId,
            contentId: content?.id ?? null,
            googleAccountId: input.googleAccountId || null,
            sequenceId: seq.id,
            sceneIndex: i,
            prompt: flowAgent ? plan.scenes[i] : composeScenePrompt(plan.styleBible, plan.scenes[i], i, total, input.clipSeconds),
            // the lead scene runs the whole Flow Agent batch: budget for all clips
            ...(flowAgent && i === 0 ? { flowCreditEstimate: AGENT_CREDITS_PER_CLIP * total } : {}),
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

    // channel reference images: COPY the files (deleting a video must never delete the preset's images)
    if (preset && preset.referenceImageKeys.length > 0) {
      const keys: string[] = [];
      for (const k of preset.referenceImageKeys.slice(0, 3)) {
        if (!storage.fileExists(k)) continue;
        const saved = await storage.saveFile(input.projectId, path.basename(k).replace(/^\d+_/, ""), await storage.readFile(k), "references");
        keys.push(saved.storageKey);
      }
      if (keys.length > 0) await prisma.sequence.update({ where: { id: sequence.id }, data: { referenceImageKeys: JSON.stringify(keys) } });
    }

    return { sequence, sceneCount: total, usedAI: plan.usedAI, warning: plan.warning };
  }

  /** Queue every scene that still needs a clip (or only `sceneIds`). Safe to call again to resume after a failure. */
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

    const apiOnly = seq.scenes.length > 0 && seq.scenes.every((s) => s.provider === VEO_API_PROVIDER);
    let accountId: string | null | undefined = opts.googleAccountId || seq.googleAccountId;
    if (accountId && !(await prisma.googleAccount.findFirst({ where: { id: accountId, ownerId: owner }, select: { id: true } }))) {
      if (opts.googleAccountId) throw new Error("Không tìm thấy tài khoản Google đã chọn.");
      accountId = null; // stale/foreign account stored on the sequence: pick one of the owner's
    }
    if (!accountId && !apiOnly) {
      const acc = await prisma.googleAccount.findFirst({ where: { ownerId: owner, status: "CONNECTED", lockStatus: "AVAILABLE" } });
      if (!acc) throw new Error("Không có tài khoản Google nào đang CONNECTED. Vui lòng kết nối tại Cài Đặt.");
      accountId = acc.id;
    }

    const mode = opts.mode || "RUN";
    if (mode !== "RUN") {
      if (mode === "RECOVER" && seq.continuity !== "FLOW_AGENT") throw new Error("Khôi phục tự động chỉ dùng cho video do Flow tự chia cảnh (các chế độ khác: Import thủ công từng cảnh).");
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

    const explicit = opts.sceneIds && opts.sceneIds.length > 0 ? new Set(opts.sceneIds) : null;
    let targets = seq.scenes.filter((s) => {
      if (explicit && !explicit.has(s.id)) return false;
      if (IN_FLIGHT.includes(s.status)) return false;
      if (s.status === "COMPLETED" && hasClip(s) && !explicit) return false;
      // NEEDS_USER_ACTION may already have spent credits: only retry when explicitly asked
      if (s.status === "NEEDS_USER_ACTION" && !explicit) return false;
      return true;
    });
    if (seq.continuity === "FLOW_AGENT") {
      // One batch job (lead = scene 0) makes every clip. Re-running after a PARTIAL result would pay for the clips again.
      const done = seq.scenes.filter(hasClip).length;
      if (seq.scenes.some((s) => IN_FLIGHT.includes(s.status))) return { enqueued: 0, skipped: seq.scenes.length, message: "Flow Agent đang chạy." };
      if (done === seq.scenes.length) return { enqueued: 0, skipped: seq.scenes.length, message: "Tất cả cảnh đã có clip." };
      if (done > 0 && !explicit) {
        throw new Error(
          `Flow Agent đã tạo ${done}/${seq.scenes.length} clip. Chạy lại sẽ tốn credits cho cả bộ: hãy mở project Flow, tải clip còn thiếu và Import thủ công vào từng cảnh (hoặc xoá clip cũ rồi chạy lại nếu muốn làm lại từ đầu).`
        );
      }
      targets = seq.scenes.filter((s) => (s.sceneIndex ?? 0) === 0);
    }
    const skipped = seq.scenes.filter((s) => !targets.includes(s)).length;

    if (targets.length === 0) {
      return { enqueued: 0, skipped, message: "Không có cảnh nào cần chạy." };
    }

    // Credit guard BEFORE anything is queued: per-video cap, daily budget and (recent) account balance
    const estimate =
      seq.continuity === "FLOW_AGENT"
        ? targets[0].flowCreditEstimate || AGENT_CREDITS_PER_CLIP * seq.scenes.length
        : targets.reduce((sum, t) => sum + (t.flowCreditEstimate || AGENT_CREDITS_PER_CLIP), 0);
    if (apiOnly) await assertApiBudget(estimateApiUsd(targets.length));
    else await assertCanSpend(estimate, { googleAccountId: accountId });

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
    return { enqueued, skipped, message: `Đã xếp hàng ${enqueued} cảnh.` };
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
      // A Flow failure BEFORE anything was approved (status FAILED, never NEEDS_USER_ACTION) cost no credit: optionally rerun via the Veo API
      if (gen.status === "FAILED" && gen.provider !== VEO_API_PROVIDER && process.env.VIDEO_FALLBACK_TO_API === "true") {
        const siblings = await prisma.generation.findMany({ where: { sequenceId: seqId }, include: { videoAsset: { select: { id: true } } } });
        const safe = siblings.every((s) => !s.videoAsset && s.status !== "NEEDS_USER_ACTION" && !IN_FLIGHT.includes(s.status));
        const spent = safe
          ? await prisma.generationEvent.count({ where: { generationId: { in: siblings.map((s) => s.id) }, type: "CREDITS_SPENT" } })
          : 1;
        if (safe && spent === 0 && veoSettings().apiKey) {
          try {
            await this.switchToApi(seqId, { autostart: true });
            await notifyWebhook("sequence.fallback_to_api", { sequenceId: seqId, reason: gen.errorMessage });
            return;
          } catch (e: any) {
            console.error(`[Sequence] API fallback failed for ${seqId}:`, e.message);
          }
        }
      }
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

  /**
   * Re-plan a sequence that has NO clips yet as plain per-clip Veo API generations (8s each) and optionally start it.
   * Used as the fallback when Google Flow's UI fails or runs out of credits. Scene 0 is kept so its credit ledger survives.
   */
  static async switchToApi(sequenceId: string, opts: { autostart?: boolean } = {}) {
    const s = veoSettings();
    if (!s.apiKey) throw new Error("Chưa cấu hình GEMINI_API_KEY (hoặc VEO_API_KEY) cho Veo API.");
    const seq = await prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: { scenes: { orderBy: { sceneIndex: "asc" }, include: { videoAsset: { select: { id: true } } } } },
    });
    if (!seq) throw new Error("Không tìm thấy video nhiều cảnh.");
    if (seq.aspectRatio !== "9:16" && seq.aspectRatio !== "16:9") throw new Error("Veo API chỉ hỗ trợ 9:16 và 16:9.");
    if (seq.scenes.some((x) => x.videoAsset)) throw new Error("Video đã có clip từ Flow: dùng Khôi phục / Import thay vì chuyển sang Veo API.");
    if (seq.scenes.some((x) => IN_FLIGHT.includes(x.status))) throw new Error("Video đang chạy, chờ xong rồi mới chuyển.");

    const clipSeconds = s.clipSeconds;
    const n = sceneCountFor(seq.totalDuration, clipSeconds);
    await assertApiBudget(estimateApiUsd(n));
    const plan = await planScenes({ brief: seq.brief, totalDuration: seq.totalDuration, clipSeconds, style: seq.styleBible || undefined, aspectRatio: seq.aspectRatio });

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < n; i++) {
        const data = {
          prompt: composeScenePrompt(plan.styleBible, plan.scenes[i] ?? plan.scenes[plan.scenes.length - 1], i, n, clipSeconds),
          provider: VEO_API_PROVIDER,
          model: s.model,
          duration: `${clipSeconds}s`,
          status: "DRAFT" as const,
          errorMessage: null,
        };
        const existing = seq.scenes[i];
        if (existing) await tx.generation.update({ where: { id: existing.id }, data });
        else {
          await tx.generation.create({
            data: { ...data, projectId: seq.projectId, contentId: seq.contentId, sequenceId: seq.id, sceneIndex: i, aspectRatio: seq.aspectRatio, generationMethod: "AUTO" },
          });
        }
      }
      const surplus = seq.scenes.slice(n).map((x) => x.id);
      if (surplus.length > 0) await tx.generation.deleteMany({ where: { id: { in: surplus } } });
      await tx.sequence.update({
        where: { id: seq.id },
        data: { continuity: "INDEPENDENT", clipSeconds, styleBible: plan.styleBible, status: "PLANNED", errorMessage: `ℹ️ Đã chuyển sang Veo API (${n} clip × ${clipSeconds}s, ~${estimateApiUsd(n)} USD).` },
      });
    });
    if (opts.autostart) await this.start(seq.id);
    return { sceneCount: n, estimateUsd: estimateApiUsd(n) };
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

  static sceneCountFor = sceneCountFor;
}
