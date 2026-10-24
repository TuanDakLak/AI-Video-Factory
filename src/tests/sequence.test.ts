import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync, spawnSync } from "child_process";
import { createSequenceSchema, updateSequenceSchema, startSequenceSchema, automationTopicsSchema } from "../lib/validations";
import { buildAgentBatchPrompt, buildAgentNudge } from "../lib/sequence/agent-prompt";
import { assertCanSpend, creditLimits } from "../lib/sequence/credit-guard";
import { channelInputSchema } from "../lib/channels";
import { readHealthHistory, saveHealthReport } from "../lib/automation/health-store";
import { notifyWebhook } from "../lib/automation/notify";
import { clipCount } from "../lib/content/script-writer";
import { TARGET_LUFS, assembleClips, probeClip } from "../lib/sequence/assembler";
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
  console.log("=== LONG VIDEO TESTS ===\n");

  console.log("--- 1. Clip math & Flow Agent prompt ---");
  assert(clipCount(30, 10) === 3 && clipCount(90, 10) === 9, "30s / 90s = 3 / 9 clips of 10s");
  assert(clipCount(1, 8) === 1, "never fewer than 1 clip");
  const ap = buildAgentBatchPrompt({ brief: "Quảng cáo serum", style: "warm", totalDuration: 90, clipSeconds: 10, count: 9, aspectRatio: "9:16", hasReferenceImages: true });
  assert(/exactly 9 consecutive 10-second video clips/.test(ap) && ap.includes("90-second vertical 9:16") && ap.includes("Scene 9") && ap.includes("Quảng cáo serum") && ap.includes("attached image"), "Flow Agent batch prompt asks for N clips, one project, shared references");
  assert(/do NOT ask me any clarifying questions/.test(ap) && /Proceed now/.test(buildAgentNudge(5)) && /đúng 5 video/.test(buildAgentNudge(5)), "Agent prompt forbids questions; nudge text available");

  console.log("\n--- 2. Validation ---");
  assert(createSequenceSchema.safeParse({ brief: "idea", totalDuration: 30 }).success && createSequenceSchema.safeParse({ channelId: "c", brief: "idea", totalDuration: 30 }).success, "valid video input passes, channel optional");
  assert(!createSequenceSchema.safeParse({ totalDuration: 30 }).success && !createSequenceSchema.safeParse({ brief: "   ", totalDuration: 30 }).success, "needs a brief");
  assert(!createSequenceSchema.safeParse({ brief: "x", totalDuration: 4 }).success, "total duration < 8s rejected");
  assert(!createSequenceSchema.safeParse({ brief: "x", totalDuration: 400 }).success, "total duration > 300s rejected");
  assert(!createSequenceSchema.safeParse({ brief: "x", totalDuration: 30, clipSeconds: 2 }).success, "clip length < 4s rejected");
  const parsed = createSequenceSchema.parse({ brief: "x", totalDuration: "30" });
  assert(parsed.totalDuration === 30 && parsed.clipSeconds === 10 && parsed.transition === "CUT" && parsed.aspectRatio === "9:16", "defaults + numeric coercion");
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

  console.log("\n--- 3. ffmpeg assembly ---");
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

    // loudness: a whisper-quiet clip and a very loud clip end up at the same level (EBU R128 integrated loudness)
    const lufs = (file: string, start: number, dur: number) => {
      const r = spawnSync(ff, ["-hide_banner", "-nostats", "-ss", String(start), "-t", String(dur), "-i", file, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" });
      const m = /I:\s+(-?[\d.]+) LUFS/.exec(r.stderr.slice(r.stderr.lastIndexOf("Summary")));
      return m ? parseFloat(m[1]) : NaN;
    };
    const quiet = mk("quiet.mp4", ["-f", "lavfi", "-i", "testsrc=duration=4:size=720x1280:rate=30", "-f", "lavfi", "-i", "sine=frequency=300:duration=4,volume=-35dB", "-c:a", "aac", "-shortest"]);
    const loud = mk("loud.mp4", ["-f", "lavfi", "-i", "testsrc=duration=4:size=720x1280:rate=30", "-f", "lavfi", "-i", "sine=frequency=300:duration=4,volume=-6dB", "-c:a", "aac", "-shortest"]);
    const rawGap = Math.abs(lufs(quiet, 0, 4) - lufs(loud, 0, 4));
    const lev = await assembleClips({ inputs: [quiet, loud], outputPath: path.join(dir, "lev.mp4"), transition: "CUT" });
    const q1 = lufs(lev.outputPath, 0.5, 3);
    const l1 = lufs(lev.outputPath, 4.5, 3);
    assert(rawGap > 20 && Math.abs(q1 - l1) < 2, `clips levelled: ${rawGap.toFixed(1)} LU apart before, ${Math.abs(q1 - l1).toFixed(1)} LU after`);
    assert(Math.abs(q1 - TARGET_LUFS) < 2 && Math.abs(l1 - TARGET_LUFS) < 2, `both near ${TARGET_LUFS} LUFS (${q1.toFixed(1)} / ${l1.toFixed(1)})`);
    const raw = await assembleClips({ inputs: [quiet, loud], outputPath: path.join(dir, "raw.mp4"), transition: "CUT", normalizeAudio: false });
    assert(Math.abs(lufs(raw.outputPath, 0.5, 3) - lufs(raw.outputPath, 4.5, 3)) > 20, "normalisation can be switched off (AUDIO_NORMALIZE=false)");

    // A/V sync: a clip whose audio is shorter than its picture must not shift the next clips
    const shortAudio = mk("short-audio.mp4", ["-f", "lavfi", "-i", "testsrc=duration=4:size=720x1280:rate=30", "-f", "lavfi", "-i", "sine=frequency=500:duration=2.5", "-c:a", "aac"]);
    const sync = await assembleClips({ inputs: [shortAudio, loud], outputPath: path.join(dir, "sync.mp4"), transition: "CUT" });
    const streams = JSON.parse(spawnSync(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,duration", "-of", "json", sync.outputPath], { encoding: "utf8" }).stdout).streams;
    const vDur = parseFloat(streams.find((s: any) => s.codec_type === "video").duration);
    const aDur = parseFloat(streams.find((s: any) => s.codec_type === "audio").duration);
    assert(Math.abs(vDur - 8) < 0.2 && Math.abs(aDur - vDur) < 0.1, `audio padded to the picture: video ${vDur.toFixed(2)}s, audio ${aDur.toFixed(2)}s`);

    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log("\n--- 4. Publish readiness ---");
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

  console.log("\n--- 5. Channels, automation API, health store ---");
  const cwd0 = process.cwd();
  const tmpWork = fs.mkdtempSync(path.join(os.tmpdir(), "preset-test-"));
  process.chdir(tmpWork);
  try {
    // channels now live in the database: CRUD + isolation are covered by src/tests/automation.test.ts
    const pr = channelInputSchema.parse({ name: "Kênh Amazon", styleBible: "cinematic jungle", hashtags: ["#amazon"] });
    assert(pr.clipSeconds === 10 && pr.aspectRatio === "9:16" && pr.durations[0] === 30, "channel defaults (10s clips, 9:16, 30s videos)");
    assert(!channelInputSchema.safeParse({ name: "   " }).success, "empty channel name rejected");
    assert(!channelInputSchema.safeParse({ name: "x", durations: [45] }).success, "video length must be 30/60/90s");

    saveHealthReport({ at: "t", accountId: "a", accountName: "n", ok: false, credits: 5, items: [{ name: "login", ok: false, detail: "x" }] });
    assert(readHealthHistory()[0]?.items[0].name === "login", "health report is persisted (newest first)");
  } finally {
    process.chdir(cwd0);
    fs.rmSync(tmpWork, { recursive: true, force: true });
  }
  assert(automationTopicsSchema.safeParse({ channelId: "c", topics: [{ title: "Siêu đại chiến chiến binh châu Á" }] }).success && automationTopicsSchema.parse({ channelId: "c", topics: [{ title: "abc d" }] }).approved === false, "automation API: topics go to the inbox, not approved by default");
  assert(!automationTopicsSchema.safeParse({ channelId: "c", topics: [] }).success && !automationTopicsSchema.safeParse({ topics: [{ title: "abc d" }] }).success, "automation API: needs a channel and at least one topic");
  await notifyWebhook("test.event", {});
  assert(true, "webhook is a silent no-op without AUTOMATION_WEBHOOK_URL");

  console.log("\n🎉 ALL LONG VIDEO TESTS PASSED");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
