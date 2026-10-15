import fs from "fs";
import path from "path";
import { prisma } from "../db";
import { resolveSceneAttachments } from "../sequence/attachments";
import { FlowAutomationService, GenerationProgressCallback } from "./FlowAutomationService";

/**
 * Official Veo API (Gemini API) provider: the fallback when Google Flow's web UI breaks or runs out of credits.
 * Verified against the docs (ai.google.dev/gemini-api/docs/veo, Oct 2026):
 *   POST {base}/models/{model}:predictLongRunning  -> operation { name }
 *   GET  {base}/{operation.name}                    -> { done, response.generateVideoResponse.generatedSamples[0].video.uri }
 *   GET  video.uri with header x-goog-api-key       -> mp4 (kept 2 days)
 * durationSeconds 4|6|8 ("8" is required with reference images), aspectRatio 16:9 | 9:16, resolution 720p default.
 * Billing is per generated second and only for successful videos, so a failed call is always safe to retry.
 */
import { API_SPEND_EVENT, VEO_API_PROVIDER, VEO_BASE, assertApiBudget, estimateApiUsd, veoSettings } from "./veo-config";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(pathOrUrl: string, init: RequestInit & { raw?: boolean } = {}): Promise<any> {
  const { apiKey } = veoSettings();
  const url = /^https?:/.test(pathOrUrl) ? pathOrUrl : `${VEO_BASE}/${pathOrUrl.replace(/^\//, "")}`;
  const res = await fetch(url, {
    ...init,
    headers: { "x-goog-api-key": apiKey, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
    redirect: "follow",
    signal: AbortSignal.timeout(init.raw ? 180000 : 60000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Veo API ${res.status}: ${text.slice(0, 400)}`);
  }
  return init.raw ? res : res.json();
}

const b64 = (file: string) => ({ inlineData: { mimeType: /\.jpe?g$/i.test(file) ? "image/jpeg" : /\.webp$/i.test(file) ? "image/webp" : "image/png", data: fs.readFileSync(file).toString("base64") } });

export class VeoApiService {
  static isConfigured(): boolean {
    return !!veoSettings().apiKey;
  }

  static async executeGeneration(
    generationId: string,
    onProgress?: GenerationProgressCallback
  ): Promise<{ success: boolean; videoAssetId?: string; error?: string }> {
    const gen = await prisma.generation.findUnique({ where: { id: generationId }, include: { sequence: true } });
    if (!gen) throw new Error(`Generation ${generationId} not found.`);
    const s = veoSettings();
    const tempDir = path.resolve(process.cwd(), "tmp", "generations", generationId);
    fs.mkdirSync(tempDir, { recursive: true });
    const report = async (step: string, message: string) => {
      console.log(`[VeoApi] [${generationId}] [${step}] ${message}`);
      await prisma.generationEvent.create({ data: { generationId, type: step, message } });
      await prisma.generation.update({ where: { id: generationId }, data: { status: step as any } });
      if (onProgress) await onProgress(step, message);
    };
    try {
      if (gen.aspectRatio !== "9:16" && gen.aspectRatio !== "16:9") throw new Error(`Veo API chỉ hỗ trợ 9:16 và 16:9 (không có ${gen.aspectRatio}).`);
      const estimate = estimateApiUsd(1);
      await assertApiBudget(estimate);

      await report("SUBMITTING", `Gửi prompt tới Veo API (${s.model}, ${s.clipSeconds}s, ước tính ${estimate} USD, chỉ tính phí khi thành công).`);
      const att = await resolveSceneAttachments(generationId, tempDir);
      const instance: Record<string, unknown> = { prompt: gen.prompt };
      if (att.mode === "FIRST_FRAME" && att.files[0]) instance.image = b64(att.files[0]);
      if (att.mode === "INGREDIENTS" && att.files.length > 0) instance.referenceImages = att.files.slice(0, 3).map((f) => ({ image: b64(f), referenceType: "asset" }));
      if (att.files.length > 0) await prisma.generationEvent.create({ data: { generationId, type: "SUBMITTING", message: att.note } });

      const op = await api(`models/${s.model}:predictLongRunning`, {
        method: "POST",
        body: JSON.stringify({ instances: [instance], parameters: { aspectRatio: gen.aspectRatio, durationSeconds: String(s.clipSeconds), resolution: "720p" } }),
      });
      if (!op?.name) throw new Error(`Veo API không trả về operation: ${JSON.stringify(op).slice(0, 200)}`);
      await prisma.generationEvent.create({ data: { generationId, type: "SUBMITTED", message: `Veo API operation: ${op.name}` } });

      await report("GENERATING", "Veo API đang tạo video...");
      let done: any = null;
      const deadline = Date.now() + 12 * 60 * 1000;
      while (Date.now() < deadline) {
        await sleep(10000);
        const cur = await api(op.name);
        if (cur.done) {
          done = cur;
          break;
        }
      }
      if (!done) throw new Error("Hết thời gian chờ Veo API (12 phút). Không bị tính phí nếu video chưa tạo xong.");
      if (done.error) throw new Error(`Veo API báo lỗi: ${done.error.message || JSON.stringify(done.error).slice(0, 300)}`);
      const resp = done.response?.generateVideoResponse;
      const uri: string | undefined = resp?.generatedSamples?.[0]?.video?.uri;
      if (!uri) {
        const why = (resp?.raiMediaFilteredReasons || []).join("; ") || "không có video trả về (có thể bị bộ lọc an toàn chặn)";
        throw new Error(`Veo API không trả video: ${why}`);
      }

      await report("DOWNLOADING", "Đang tải video từ Veo API...");
      const res = (await api(uri, { raw: true })) as Response;
      const mp4 = path.join(tempDir, `veo_api_${Date.now()}.mp4`);
      fs.writeFileSync(mp4, Buffer.from(await res.arrayBuffer()));
      if (fs.statSync(mp4).size < 50 * 1024) throw new Error("File tải về từ Veo API quá nhỏ, không phải video.");

      await report("PROCESSING", "Lưu video và đọc thông số FFprobe.");
      const asset = await FlowAutomationService.saveClipAsset({ id: gen.id, projectId: gen.projectId, model: `${s.model} (API)` }, mp4);
      await prisma.generation.update({ where: { id: generationId }, data: { status: "COMPLETED", completedAt: new Date(), errorMessage: null, provider: VEO_API_PROVIDER } });
      await prisma.generationEvent.create({ data: { generationId, type: API_SPEND_EVENT, message: String(estimate) } });
      await report("COMPLETED", `Hoàn tất bằng Veo API (~${estimate} USD).`);
      return { success: true, videoAssetId: asset.id };
    } catch (err: any) {
      const msg = err?.message || "Veo API thất bại.";
      console.error(`[VeoApi] ${generationId}:`, err);
      // nothing is billed for a failed generation, so a plain FAILED (safe to retry) is correct
      await prisma.generation.update({ where: { id: generationId }, data: { status: "FAILED", errorMessage: msg } }).catch(() => {});
      await prisma.generationEvent.create({ data: { generationId, type: "FAILED", message: `Lỗi: ${msg}` } }).catch(() => {});
      return { success: false, error: msg };
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }
}
