/**
 * Publish-readiness checks for a finished video.
 *
 * IMPORTANT: platform limits change often and public sources disagree (e.g. Shorts 60s vs 180s).
 * They are therefore split into `recommendedMaxSeconds` (warning) and `hardMaxSeconds` (failure) and are
 * kept in ONE table so they can be corrected when the publish step is wired to the official platform docs/APIs.
 * Pure functions: safe to unit test, no I/O.
 */

export interface VideoFacts {
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
  mimeType?: string | null;
}

export interface PlatformSpec {
  id: "youtube_shorts" | "instagram_reels" | "tiktok" | "facebook_reels";
  name: string;
  aspects: Array<"9:16" | "1:1" | "4:5" | "16:9">;
  recommendedMaxSeconds: number;
  hardMaxSeconds: number;
  maxBytes: number;
  minWidth: number;
  minHeight: number;
}

const GB = 1024 * 1024 * 1024;

export const PLATFORM_SPECS: PlatformSpec[] = [
  { id: "youtube_shorts", name: "YouTube Shorts", aspects: ["9:16", "1:1"], recommendedMaxSeconds: 60, hardMaxSeconds: 180, maxBytes: 256 * GB, minWidth: 720, minHeight: 1280 },
  { id: "instagram_reels", name: "Instagram Reels", aspects: ["9:16"], recommendedMaxSeconds: 90, hardMaxSeconds: 900, maxBytes: 4 * GB, minWidth: 720, minHeight: 1280 },
  { id: "tiktok", name: "TikTok", aspects: ["9:16"], recommendedMaxSeconds: 60, hardMaxSeconds: 600, maxBytes: 4 * GB, minWidth: 720, minHeight: 1280 },
  { id: "facebook_reels", name: "Facebook Reels", aspects: ["9:16", "1:1", "4:5"], recommendedMaxSeconds: 60, hardMaxSeconds: 90, maxBytes: 4 * GB, minWidth: 720, minHeight: 1280 },
];

export type CheckLevel = "ok" | "warn" | "fail";

export interface PlatformCheck {
  platform: PlatformSpec["id"];
  name: string;
  level: CheckLevel;
  issues: string[];
}

export function detectAspect(width?: number | null, height?: number | null): PlatformSpec["aspects"][number] | "other" {
  if (!width || !height) return "other";
  const r = width / height;
  const near = (x: number) => Math.abs(r - x) / x < 0.03;
  if (near(9 / 16)) return "9:16";
  if (near(1)) return "1:1";
  if (near(4 / 5)) return "4:5";
  if (near(16 / 9)) return "16:9";
  return "other";
}

export function checkPublishReadiness(v: VideoFacts, specs: PlatformSpec[] = PLATFORM_SPECS): PlatformCheck[] {
  const aspect = detectAspect(v.width, v.height);
  return specs.map((spec) => {
    const fails: string[] = [];
    const warns: string[] = [];

    if (!v.mimeType || !/mp4|quicktime|mov/i.test(v.mimeType)) fails.push("Định dạng không phải MP4/MOV.");
    if (aspect === "other" || !spec.aspects.includes(aspect as any)) {
      fails.push(`Tỉ lệ khung hình ${aspect === "other" ? "không chuẩn" : aspect} không phù hợp (cần ${spec.aspects.join(" hoặc ")}).`);
    }
    if (typeof v.duration === "number") {
      if (v.duration > spec.hardMaxSeconds) fails.push(`Dài ${Math.round(v.duration)}s, vượt giới hạn ${spec.hardMaxSeconds}s.`);
      else if (v.duration > spec.recommendedMaxSeconds) warns.push(`Dài ${Math.round(v.duration)}s, nên ≤ ${spec.recommendedMaxSeconds}s để hiển thị tốt nhất.`);
    } else {
      warns.push("Không đọc được thời lượng video.");
    }
    if (typeof v.fileSize === "number" && v.fileSize > spec.maxBytes) fails.push("Dung lượng file vượt giới hạn.");
    if (v.width && v.height && (Math.min(v.width, v.height) < Math.min(spec.minWidth, spec.minHeight))) {
      warns.push(`Độ phân giải ${v.width}x${v.height} thấp hơn mức khuyến nghị ${spec.minWidth}x${spec.minHeight}.`);
    }

    const level: CheckLevel = fails.length ? "fail" : warns.length ? "warn" : "ok";
    return { platform: spec.id, name: spec.name, level, issues: [...fails, ...warns] };
  });
}
