import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

const FFMPEG = () => process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = () => process.env.FFPROBE_PATH || "ffprobe";

export type Transition = "CUT" | "CROSSFADE";

export interface AssembleOptions {
  inputs: string[]; // absolute paths, in scene order
  outputPath: string; // absolute path of the final .mp4
  transition: Transition;
  /** Target size. Defaults to the first clip's size (rounded to even numbers). */
  width?: number;
  height?: number;
  fps?: number;
  crossfadeSeconds?: number;
  /** level every clip's audio to TARGET_LUFS (default on; AUDIO_NORMALIZE=false disables) */
  normalizeAudio?: boolean;
}

/** Loudness the platforms normalise to (TikTok / YouTube / Reels play around -14 LUFS). */
export const TARGET_LUFS = -14;

export interface AssembleResult {
  outputPath: string;
  duration: number;
  width: number;
  height: number;
}

interface ClipInfo {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

async function run(bin: string, args: string[]) {
  try {
    return await execFileAsync(bin, args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      throw new Error(
        `Không tìm thấy "${bin}". Hãy cài ffmpeg và thêm vào PATH (hoặc đặt FFMPEG_PATH / FFPROBE_PATH trong .env).`
      );
    }
    const tail = String(err?.stderr || err?.message || "").split("\n").slice(-8).join("\n");
    throw new Error(`ffmpeg lỗi: ${tail}`);
  }
}

export async function probeClip(file: string): Promise<ClipInfo> {
  const { stdout } = await run(FFPROBE(), [
    "-v", "error",
    "-show_entries", "stream=codec_type,width,height,duration:format=duration",
    "-of", "json",
    file,
  ]);
  const data = JSON.parse(stdout || "{}");
  const streams: any[] = data.streams || [];
  const video = streams.find((s) => s.codec_type === "video");
  if (!video) throw new Error(`File không có luồng video: ${path.basename(file)}`);
  const audio = streams.find((s) => s.codec_type === "audio");
  const duration = parseFloat(video.duration || data.format?.duration || "0");
  if (!duration || Number.isNaN(duration)) throw new Error(`Không đọc được thời lượng: ${path.basename(file)}`);
  return { duration, width: Number(video.width), height: Number(video.height), hasAudio: Boolean(audio) };
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Normalise every clip (same size / fps / pixel format / audio layout, silent audio when missing)
 * and join them with hard cuts or short crossfades, in ONE ffmpeg pass.
 */
export async function assembleClips(opts: AssembleOptions): Promise<AssembleResult> {
  const { inputs, outputPath } = opts;
  if (inputs.length === 0) throw new Error("Không có clip nào để ghép.");
  for (const f of inputs) {
    if (!fs.existsSync(f)) throw new Error(`Thiếu file clip: ${f}`);
  }

  const infos = await Promise.all(inputs.map(probeClip));
  const W = even(opts.width ?? infos[0].width);
  const H = even(opts.height ?? infos[0].height);
  const fps = opts.fps ?? 30;
  const n = inputs.length;

  // crossfade needs clips longer than 2x the fade; otherwise fall back to cuts
  let d = opts.crossfadeSeconds ?? 0.5;
  let transition = opts.transition;
  if (n === 1) transition = "CUT";
  if (transition === "CROSSFADE" && infos.some((i) => i.duration < d * 2 + 0.2)) transition = "CUT";

  const normalize = opts.normalizeAudio ?? process.env.AUDIO_NORMALIZE !== "false";
  const f: string[] = [];
  for (let i = 0; i < n; i++) {
    const dur = infos[i].duration.toFixed(3);
    f.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},format=yuv420p,settb=AVTB[v${i}]`
    );
    if (infos[i].hasAudio) {
      const chain = [
        "aresample=48000",
        "aformat=sample_fmts=fltp:channel_layouts=stereo",
        "asetpts=PTS-STARTPTS",
        // Veo clips differ in loudness: bring each to the social-media level (EBU R128, -14 LUFS, true peak -1.5 dBTP)
        ...(normalize ? [`loudnorm=I=${TARGET_LUFS}:TP=-1.5:LRA=11`, "aresample=48000"] : []),
        // audio exactly as long as the picture: a shorter track would shift every following clip out of sync
        `apad=whole_dur=${dur}`,
        `atrim=duration=${dur}`,
        // tiny fades at hard cuts remove the click/pop where two clips meet (inaudible as silence)
        ...(transition === "CUT" && n > 1 ? ["afade=t=in:d=0.03", `afade=t=out:st=${Math.max(0, infos[i].duration - 0.08).toFixed(3)}:d=0.08`] : []),
      ];
      f.push(`[${i}:a]${chain.join(",")}[a${i}]`);
    } else {
      f.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${infos[i].duration.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
    }
  }

  let totalDuration = 0;
  if (transition === "CUT") {
    f.push(`${infos.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${n}:v=1:a=1[vout][aout]`);
    totalDuration = infos.reduce((s, i) => s + i.duration, 0);
  } else {
    let acc = infos[0].duration;
    let vPrev = "v0";
    let aPrev = "a0";
    for (let i = 1; i < n; i++) {
      const offset = (acc - d).toFixed(3);
      const vNext = i === n - 1 ? "vout" : `vx${i}`;
      const aNext = i === n - 1 ? "aout" : `ax${i}`;
      f.push(`[${vPrev}][v${i}]xfade=transition=fade:duration=${d}:offset=${offset}[${vNext}]`);
      f.push(`[${aPrev}][a${i}]acrossfade=d=${d}[${aNext}]`);
      acc = acc + infos[i].duration - d;
      vPrev = vNext;
      aPrev = aNext;
    }
    totalDuration = acc;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
  for (const input of inputs) args.push("-i", input);
  args.push(
    "-filter_complex", f.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    outputPath
  );
  await run(FFMPEG(), args);

  const out = await probeClip(outputPath);
  return { outputPath, duration: out.duration || totalDuration, width: out.width, height: out.height };
}
