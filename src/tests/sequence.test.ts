import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { createSequenceSchema, updateSequenceSchema, startSequenceSchema, automationRequestSchema } from "../lib/validations";
import { buildAgentBatchPrompt, buildAgentNudge } from "../lib/sequence/agent-prompt";
import { assertCanSpend, creditLimits } from "../lib/sequence/credit-guard";
import { createPreset, deletePreset, getPreset, listPresets, presetInputSchema, updatePreset } from "../lib/presets";
import { assertApiBudget, estimateApiUsd, veoSettings } from "../lib/automation/veo-config";
import { makeSolidPng } from "../lib/automation/test-png";
import { readHealthHistory, saveHealthReport } from "../lib/automation/health-store";
import { notifyWebhook } from "../lib/automation/notify";
import { composeScenePrompt, planScenes, sceneCountFor } from "../lib/sequence/scene-planner";
import { assembleClips, extractLastFrame, probeClip } from "../lib/sequence/assembler";
import { checkPublishReadiness, detectAspect } from "../lib/publish/readiness";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`❌ Test Failed: ${message}`);
  console.log(`✅ Passed: ${message}`);
}

function hasFfmpeg(): boolean {
  try {
    execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync(process.env.FFPROBE_PATH || "ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function run() {
  console.log("=== SEQUENCE (MULTI-SCENE VIDEO) TESTS ===\n");

  console.log("--- 1. Scene math & prompt composition ---");
  assert(sceneCountFor(32, 8) === 4, "32s / 8s clips = 4 scenes");
  assert(sceneCountFor(35, 10) === 4, "35s / 10s clips rounds up to 4 scenes");
  assert(sceneCountFor(1, 8) === 1, "never fewer than 1 scene");
  const ap = buildAgentBatchPrompt({ brief: "Quảng cáo serum", style: "warm", totalDuration: 90, clipSeconds: 10, count: 9, aspectRatio: "9:16", hasReferenceImages: true });
  assert(/exactly 9 consecutive 10-second video clips/.test(ap) && ap.includes("90-second vertical 9:16") && ap.includes("Scene 9") && ap.includes("Quảng cáo serum") && ap.includes("attached image"), "Flow Agent batch prompt asks for N clips, one project, shared references");
  assert(/do NOT ask me any clarifying questions/.test(ap) && /Proceed now/.test(buildAgentNudge(5)) && /đúng 5 video/.test(buildAgentNudge(5)), "Agent prompt forbids questions; nudge text available");
  const composed = composeScenePrompt("STYLE BIBLE", "A fox runs.", 1, 4, 8);
  assert(/^Generate exactly ONE video of about 8 seconds/.test(composed) && composed.includes("STYLE BIBLE") && composed.endsWith("A fox runs."), "composed prompt = ONE-video rule + style bible + scene");
  assert(!/Scene \d+ of \d+/.test(composed), "no multi-scene numbering that would make Flow Agent plan several videos");
  assert(composeScenePrompt("", "Only scene", 0, 1).endsWith("Only scene") && !composeScenePrompt("", "x", 0, 1).includes("\n\n\n"), "empty style bible adds nothing");

  console.log("\n--- 2. Fallback scene planner (no AI key) ---");
  const savedKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  for (const [brief, total, clip] of [
    ["Cảnh 1: mở cửa.\nCảnh 2: pha cà phê.\nCảnh 3: khách vào.\nCảnh 4: mỉm cười.", 32, 8],
    ["Một chú cáo đi trong rừng tuyết. Mặt trời mọc.", 40, 8],
    ["Single idea only", 16, 8],
    [Array.from({ length: 9 }, (_, i) => `Cảnh ${i + 1}: việc ${i + 1}`).join("\n"), 24, 8],
  ] as Array<[string, number, number]>) {
    const plan = await planScenes({ brief, totalDuration: total, clipSeconds: clip, aspectRatio: "9:16" });
    assert(plan.scenes.length === sceneCountFor(total, clip), `planner returns exactly ${sceneCountFor(total, clip)} scenes for ${total}s`);
    assert(plan.scenes.every((s) => s.trim().length > 5 && !s.includes("..")), "every scene has text and no '..' artefacts");
    assert(plan.usedAI === false && Boolean(plan.warning), "fallback is flagged so the UI can warn the user");
  }
  if (savedKey) process.env.GEMINI_API_KEY = savedKey;

  console.log("\n--- 3. Validation ---");
  assert(createSequenceSchema.safeParse({ projectId: "p", brief: "idea", totalDuration: 32 }).success, "valid sequence input passes");
  assert(!createSequenceSchema.safeParse({ projectId: "p", totalDuration: 32 }).success, "needs contentId or brief");
  assert(!createSequenceSchema.safeParse({ projectId: "p", brief: "x", totalDuration: 4 }).success, "total duration < 8s rejected");
  assert(!createSequenceSchema.safeParse({ projectId: "p", brief: "x", totalDuration: 400 }).success, "total duration > 300s rejected");
  assert(!createSequenceSchema.safeParse({ projectId: "p", brief: "x", totalDuration: 32, clipSeconds: 2 }).success, "clip length < 4s rejected");
  const parsed = createSequenceSchema.parse({ projectId: "p", brief: "x", totalDuration: "32" });
  assert(parsed.totalDuration === 32 && parsed.continuity === "FLOW_AGENT" && parsed.clipSeconds === 10 && parsed.transition === "CUT", "defaults + numeric coercion");
  assert(createSequenceSchema.safeParse({ projectId: "p", brief: "x", totalDuration: 32, continuity: "LAST_FRAME" }).success, "LAST_FRAME continuity accepted");
  assert(!createSequenceSchema.safeParse({ projectId: "p", brief: "x", totalDuration: 32, continuity: "MAGIC" }).success, "unknown continuity rejected");
  assert(startSequenceSchema.parse({}).mode === "RUN" && startSequenceSchema.safeParse({ mode: "DRYRUN" }).success && startSequenceSchema.safeParse({ mode: "RECOVER", flowProjectUrl: "https://flow.google.com/project/abc-123" }).success, "start modes: RUN default, DRYRUN, RECOVER with project URL");
  assert(!startSequenceSchema.safeParse({ mode: "RECOVER", flowProjectUrl: "https://flow.google.com/" }).success && !startSequenceSchema.safeParse({ mode: "NUKE" }).success, "RECOVER needs a /project/ URL; unknown mode rejected");
  process.env.FLOW_MAX_CREDITS_PER_VIDEO = "100";
  process.env.FLOW_DAILY_CREDIT_BUDGET = "250";
  const lim = creditLimits();
  assert(lim.maxPerVideo === 100 && lim.dailyBudget === 250, "credit limits read from env");
  let capHit = false;
  try { await assertCanSpend(135); } catch (e: any) { capHit = /trần mỗi video/.test(e.message); }
  assert(capHit, "135 credits > per-video cap 100 is refused (before any DB access)");
  let lowBalance = false;
  process.env.FLOW_MAX_CREDITS_PER_VIDEO = "0";
  process.env.FLOW_DAILY_CREDIT_BUDGET = "0";
  try { await assertCanSpend(45, { balance: 30 }); } catch (e: any) { lowBalance = /Không đủ credit/.test(e.message); }
  assert(lowBalance, "balance 30 < 45 needed is refused");
  await assertCanSpend(45, { balance: 500 });
  assert(true, "enough balance and no caps passes");
  assert(updateSequenceSchema.safeParse({ caption: "hi", tags: ["#a", "#b"] }).success, "caption + tags update accepted");
  assert(!updateSequenceSchema.safeParse({ tags: "not-an-array" }).success, "tags must be an array");
  assert(startSequenceSchema.safeParse({ sceneIds: ["a"] }).success && startSequenceSchema.safeParse({}).success, "start accepts optional sceneIds");

  console.log("\n--- 4. ffmpeg assembly ---");
  if (!hasFfmpeg()) {
    console.log("⚠️  ffmpeg/ffprobe not found in PATH: skipping assembly tests (install ffmpeg or set FFMPEG_PATH/FFPROBE_PATH)");
  } else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seq-test-"));
    const ff = process.env.FFMPEG_PATH || "ffmpeg";
    const mk = (name: string, args: string[]) => {
      const out = path.join(dir, name);
      execFileSync(ff, ["-y", "-loglevel", "error", ...args, "-pix_fmt", "yuv420p", out]);
      return out;
    };
    const a = mk("a.mp4", ["-f", "lavfi", "-i", "testsrc=duration=4:size=720x1280:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:a", "aac"]);
    const b = mk("b.mp4", ["-f", "lavfi", "-i", "testsrc2=duration=3:size=1080x1920:rate=30"]); // no audio, different size
    const c = mk("c.mp4", ["-f", "lavfi", "-i", "smptebars=duration=5:size=640x360:rate=25", "-f", "lavfi", "-i", "sine=frequency=880:duration=5", "-c:a", "aac"]);

    const cut = await assembleClips({ inputs: [a, b, c], outputPath: path.join(dir, "cut.mp4"), transition: "CUT" });
    assert(Math.abs(cut.duration - 12) < 0.3, `CUT total ≈ 12s (got ${cut.duration.toFixed(2)})`);
    assert(cut.width === 720 && cut.height === 1280, "mixed sizes normalised to the first clip (720x1280)");
    assert((await probeClip(cut.outputPath)).hasAudio, "output has audio even when a clip had none");

    const xf = await assembleClips({ inputs: [a, b, c], outputPath: path.join(dir, "xf.mp4"), transition: "CROSSFADE" });
    assert(Math.abs(xf.duration - 11) < 0.3, `CROSSFADE total ≈ 11s (got ${xf.duration.toFixed(2)})`);

    const one = await assembleClips({ inputs: [a], outputPath: path.join(dir, "one.mp4"), transition: "CROSSFADE" });
    assert(Math.abs(one.duration - 4) < 0.3, "single clip passes through");

    let threw = false;
    try { await assembleClips({ inputs: [path.join(dir, "missing.mp4")], outputPath: path.join(dir, "x.mp4"), transition: "CUT" }); } catch { threw = true; }
    assert(threw, "missing clip throws a clear error");

    const png = await extractLastFrame(a, path.join(dir, "last.png"));
    assert(fs.existsSync(png) && fs.statSync(png).size > 1024, "last frame extracted as a non-empty PNG");

    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log("\n--- 5. Publish readiness ---");
  assert(detectAspect(720, 1280) === "9:16" && detectAspect(1080, 1080) === "1:1" && detectAspect(1920, 1080) === "16:9", "aspect detection");
  const good = checkPublishReadiness({ duration: 32, width: 1080, height: 1920, fileSize: 20e6, mimeType: "video/mp4" });
  assert(good.every((c) => c.level === "ok"), "32s 1080x1920 mp4 is OK everywhere");
  const landscape = checkPublishReadiness({ duration: 30, width: 1920, height: 1080, fileSize: 20e6, mimeType: "video/mp4" });
  assert(landscape.every((c) => c.level === "fail"), "16:9 landscape is not publishable as vertical short");
  const long = checkPublishReadiness({ duration: 100, width: 1080, height: 1920, fileSize: 20e6, mimeType: "video/mp4" });
  assert(long.find((c) => c.platform === "youtube_shorts")!.level === "warn", "100s: Shorts warns (over 60s recommended)");
  assert(long.find((c) => c.platform === "facebook_reels")!.level === "fail", "100s: Facebook Reels fails (over 90s)");
  const low = checkPublishReadiness({ duration: 20, width: 480, height: 854, fileSize: 5e6, mimeType: "video/mp4" });
  assert(low.every((c) => c.level === "warn"), "low resolution only warns");
  assert(checkPublishReadiness({ duration: 20, width: 1080, height: 1920, fileSize: 5e6, mimeType: "video/webm" }).every((c) => c.level === "fail"), "non-MP4 container fails");

  console.log("\n--- 6. Presets, automation, Veo API budget, health store ---");
  const cwd0 = process.cwd();
  const tmpWork = fs.mkdtempSync(path.join(os.tmpdir(), "preset-test-"));
  process.chdir(tmpWork);
  try {
    assert(listPresets("user-a").length === 0, "no presets in a fresh data dir");
    const pr = createPreset(presetInputSchema.parse({ name: "Kênh Amazon", styleBible: "cinematic jungle", hashtags: ["#amazon"] }), "user-a");
    assert(pr.clipSeconds === 10 && pr.continuity === "FLOW_AGENT" && pr.aspectRatio === "9:16", "preset defaults (10s clips, Flow Agent, 9:16)");
    assert(getPreset(pr.id, "user-a")?.name === "Kênh Amazon", "preset can be read back");
    assert(getPreset(pr.id, "user-b") === null && listPresets("user-b").length === 0, "another user cannot see the preset");
    assert(updatePreset(pr.id, "user-b", { clipSeconds: 8 }) === null && deletePreset(pr.id, "user-b") === null, "another user cannot update/delete it");
    assert(updatePreset(pr.id, "user-a", { clipSeconds: 8 })?.clipSeconds === 8, "preset can be updated");
    assert(!presetInputSchema.safeParse({ name: "   " }).success, "empty preset name rejected");
    assert(deletePreset(pr.id, "user-a") !== null && listPresets("user-a").length === 0, "preset can be deleted");

    saveHealthReport({ at: "t", accountId: "a", accountName: "n", ok: false, credits: 5, items: [{ name: "login", ok: false, detail: "x" }] });
    assert(readHealthHistory()[0]?.items[0].name === "login", "health report is persisted (newest first)");
  } finally {
    process.chdir(cwd0);
    fs.rmSync(tmpWork, { recursive: true, force: true });
  }
  assert(automationRequestSchema.safeParse({ topic: "Siêu đại chiến chiến binh châu Á" }).success && automationRequestSchema.parse({ topic: "abc d" }).autostart === true, "automation: one topic, autostart by default");
  assert(automationRequestSchema.safeParse({ topics: ["chủ đề một", "chủ đề hai"], totalDuration: 30 }).success && !automationRequestSchema.safeParse({}).success, "automation: topics[] accepted, empty rejected");
  process.env.VEO_API_USD_PER_SECOND = "0.10";
  assert(estimateApiUsd(12) === 9.6, "Veo API: 12 clips × 8s × 0.10 = 9.60 USD");
  delete process.env.GEMINI_API_KEY; delete process.env.VEO_API_KEY;
  let noKey = false;
  try { await assertApiBudget(1); } catch (e: any) { noKey = /GEMINI_API_KEY/.test(e.message); }
  assert(noKey, "Veo API refuses without an API key");
  process.env.VEO_API_KEY = "k"; process.env.VEO_API_MAX_USD_PER_VIDEO = "5";
  let capApi = false;
  try { await assertApiBudget(9.6); } catch (e: any) { capApi = /vượt trần/.test(e.message); }
  assert(capApi && veoSettings().maxUsdPerVideo === 5, "Veo API per-video USD cap enforced");
  const png = makeSolidPng(8, 8, [1, 2, 3]);
  assert(png.subarray(1, 4).toString() === "PNG" && png.length > 40, "test PNG generator output looks like a PNG");
  await notifyWebhook("test.event", {});
  assert(true, "webhook is a silent no-op without AUTOMATION_WEBHOOK_URL");

  console.log("\n🎉 ALL SEQUENCE TESTS PASSED");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
