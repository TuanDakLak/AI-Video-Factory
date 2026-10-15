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
}

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

  const f: string[] = [];
  for (let i = 0; i < n; i++) {
    f.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},format=yuv420p,settb=AVTB[v${i}]`
    );
    if (infos[i].hasAudio) {
      f.push(`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`);
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

/**
 * Extract (approximately) the last frame of a clip as a PNG.
 * Used for "LAST_FRAME" continuity: it becomes the starting frame of the next scene in Flow.
 */
export async function extractLastFrame(clipPath: string, outPng: string): Promise<string> {
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  const info = await probeClip(clipPath);
  // try a few offsets from the end: some encoders have no decodable frame in the very last ms
  const offsets = [0.12, 0.3, 0.6];
  let lastErr: unknown = null;
  for (const off of offsets) {
    try {
      const ss = Math.max(0, info.duration - off).toFixed(3);
      await run(FFMPEG(), ["-y", "-hide_banner", "-loglevel", "error", "-ss", ss, "-i", clipPath, "-frames:v", "1", "-q:v", "2", outPng]);
      if (fs.existsSync(outPng) && fs.statSync(outPng).size > 1024) return outPng;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Không trích được frame cuối của clip: ${(lastErr as any)?.message || "file ảnh rỗng"}`);
}
