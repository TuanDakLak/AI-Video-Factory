import fs from "fs";

/**
 * TikTok Content Posting API (Direct Post, FILE_UPLOAD) + Login Kit v2.
 * Docs (10/2026): developers.tiktok.com/doc/content-posting-api-reference-direct-post, …-media-transfer-guide,
 * …-get-video-status, …-query-creator-info, oauth-user-access-token-management.
 * Unaudited apps can only post privately (SELF_ONLY); public posting needs TikTok's app audit.
 */
export type Http = typeof fetch;

const API = "https://open.tiktokapis.com";
export const TIKTOK_SCOPES = "user.info.basic,video.publish";

export function tiktokEnabled(): boolean {
  return !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
}

export function tiktokRedirectUri(): string {
  return `${(process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")}/api/social/tiktok/callback`;
}

export function tiktokAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    scope: TIKTOK_SCOPES,
    response_type: "code",
    redirect_uri: tiktokRedirectUri(),
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${p}`;
}

export class TikTokError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
  }
  /** worth retrying later (TikTok/network trouble), as opposed to a request or permission problem */
  get transient(): boolean {
    return this.status >= 500 || this.status === 429 || this.code === "rate_limit_exceeded" || this.status === 0;
  }
  get authProblem(): boolean {
    return this.code === "access_token_invalid" || this.code === "scope_not_authorized";
  }
}

async function call<T>(http: Http, path: string, token: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await http(`${API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(30000),
    });
  } catch (e: any) {
    throw new TikTokError(`TikTok network error: ${e?.message || e}`, "network", 0);
  }
  const json: any = await res.json().catch(() => ({}));
  const code = json?.error?.code ?? (res.ok ? "ok" : "http_error");
  if (!res.ok || code !== "ok") throw new TikTokError(`TikTok ${res.status} ${code}: ${json?.error?.message || ""}`.trim(), code, res.status);
  return json.data as T;
}

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  openId: string;
  scope: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
}

async function token(http: Http, form: Record<string, string>): Promise<TikTokTokens> {
  const res = await http(`${API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY!, client_secret: process.env.TIKTOK_CLIENT_SECRET!, ...form }),
    signal: AbortSignal.timeout(20000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new TikTokError(`TikTok token ${res.status}: ${j.error_description || j.error || "no token"}`, j.error || "token_error", res.status);
  const now = Date.now();
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    openId: j.open_id,
    scope: j.scope || "",
    expiresAt: new Date(now + (j.expires_in ?? 86400) * 1000),
    refreshExpiresAt: new Date(now + (j.refresh_expires_in ?? 31536000) * 1000),
  };
}

export const exchangeTikTokCode = (code: string, http: Http = fetch) =>
  token(http, { code, grant_type: "authorization_code", redirect_uri: tiktokRedirectUri() });

/** The returned refresh token may differ from the one sent: always store the new one. */
export const refreshTikTokToken = (refreshToken: string, http: Http = fetch) => token(http, { refresh_token: refreshToken, grant_type: "refresh_token" });

export async function tiktokUserInfo(accessToken: string, http: Http = fetch): Promise<{ openId: string; displayName: string }> {
  const res = await http(`${API}/v2/user/info/?fields=open_id,display_name`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20000) });
  const j: any = await res.json().catch(() => ({}));
  const u = j?.data?.user;
  if (!res.ok || !u?.open_id) throw new TikTokError(`TikTok user info ${res.status}`, j?.error?.code || "user_info", res.status);
  return { openId: u.open_id, displayName: u.display_name || "TikTok" };
}

export interface CreatorInfo {
  creator_username?: string;
  privacy_level_options: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
}

export const tiktokCreatorInfo = (accessToken: string, http: Http = fetch) => call<CreatorInfo>(http, "/v2/post/publish/creator_info/query/", accessToken);

const MB = 1024 * 1024;

/**
 * Media transfer rules: chunks of 5–64 MB; a file under 5 MB is one chunk; total_chunk_count = floor(size / chunk_size)
 * (1..1000); the last chunk absorbs the remainder (up to 128 MB).
 */
export function chunkPlan(size: number, preferred = 10 * MB): { chunkSize: number; total: number; ranges: Array<[number, number]> } {
  if (size <= 0) throw new Error("Empty video file.");
  if (size < 5 * MB) return { chunkSize: size, total: 1, ranges: [[0, size - 1]] };
  const chunkSize = Math.min(64 * MB, Math.max(5 * MB, preferred));
  const total = Math.max(1, Math.floor(size / chunkSize));
  if (total > 1000) throw new Error("Video too large for TikTok upload.");
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < total; i++) ranges.push([i * chunkSize, i === total - 1 ? size - 1 : (i + 1) * chunkSize - 1]);
  if (ranges[total - 1][1] - ranges[total - 1][0] + 1 > 128 * MB) throw new Error("Last chunk exceeds 128 MB.");
  return { chunkSize, total, ranges };
}

export interface TikTokPostInput {
  filePath: string;
  title: string;
  privacy: string;
  isAigc: boolean;
}

/** Init a Direct Post and upload the file. Returns the publish_id to poll. */
export async function tiktokPublish(accessToken: string, input: TikTokPostInput, http: Http = fetch): Promise<string> {
  const size = fs.statSync(input.filePath).size;
  const plan = chunkPlan(size);
  const init = await call<{ publish_id: string; upload_url: string }>(http, "/v2/post/publish/video/init/", accessToken, {
    post_info: {
      title: input.title.slice(0, 2200),
      privacy_level: input.privacy,
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000,
      brand_content_toggle: false,
      brand_organic_toggle: false,
      is_aigc: input.isAigc, // TikTok's "AI-generated" label: required by its policy for AI video
    },
    source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: plan.chunkSize, total_chunk_count: plan.total },
  });
  const fd = fs.openSync(input.filePath, "r");
  try {
    for (const [start, end] of plan.ranges) {
      const buf = Buffer.alloc(end - start + 1);
      fs.readSync(fd, buf, 0, buf.length, start);
      const res = await http(init.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4", "Content-Length": String(buf.length), "Content-Range": `bytes ${start}-${end}/${size}` },
        body: new Uint8Array(buf),
        signal: AbortSignal.timeout(300000),
      });
      if (!res.ok && res.status !== 206) throw new TikTokError(`TikTok chunk upload ${res.status}`, "upload_failed", res.status);
    }
  } finally {
    fs.closeSync(fd);
  }
  return init.publish_id;
}

export interface TikTokStatus {
  status: "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "SEND_TO_USER_INBOX" | "PUBLISH_COMPLETE" | "FAILED";
  fail_reason?: string;
  publicaly_available_post_id?: Array<number | string>; // (sic) TikTok's field name
}

export const tiktokStatus = (accessToken: string, publishId: string, http: Http = fetch) =>
  call<TikTokStatus>(http, "/v2/post/publish/status/fetch/", accessToken, { publish_id: publishId });
