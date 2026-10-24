import fs from "fs";
import type { Http } from "./tiktok";

/**
 * Facebook Page Reels (Graph API, docs: developers.facebook.com/docs/video-api/guides/reels-publishing):
 * start an upload session -> upload the binary to rupload.facebook.com -> finish with video_state=PUBLISHED.
 * Needs a Page access token (pages_show_list, pages_read_engagement, pages_manage_posts). Reels: 3–90 s, 9:16, >= 540x960.
 * Page tokens obtained from a long-lived user token do not expire.
 */
const version = () => process.env.GRAPH_API_VERSION || "v26.0";
const graph = (path: string) => `https://graph.facebook.com/${version()}${path}`;
export const FACEBOOK_SCOPES = "pages_show_list,pages_read_engagement,pages_manage_posts";

export function facebookEnabled(): boolean {
  return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

export function facebookRedirectUri(): string {
  return `${(process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")}/api/social/facebook/callback`;
}

/**
 * Classic Facebook Login takes the permissions as `scope`. Apps that got "Facebook Login for Business" (the default for
 * Business apps) ignore `scope` and need the id of a login configuration (User access token + the same permissions).
 */
export function facebookAuthorizeUrl(state: string): string {
  const configId = process.env.FACEBOOK_CONFIG_ID?.trim();
  const p = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID!,
    redirect_uri: facebookRedirectUri(),
    state,
    response_type: "code",
    ...(configId ? { config_id: configId } : { scope: FACEBOOK_SCOPES }),
  });
  return `https://www.facebook.com/${version()}/dialog/oauth?${p}`;
}

export class FacebookError extends Error {
  constructor(message: string, readonly code: number, readonly status: number) {
    super(message);
  }
  get transient(): boolean {
    return this.status >= 500 || this.status === 0 || this.code === 1 || this.code === 2 || this.code === 4 || this.code === 17 || this.code === 32 || this.code === 613;
  }
  /** expired/revoked token or a lost permission */
  get authProblem(): boolean {
    return this.code === 190 || this.code === 200 || this.code === 10;
  }
}

async function json(http: Http, url: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await http(url, { ...init, signal: AbortSignal.timeout(init?.method === "POST" && init.body instanceof Uint8Array ? 300000 : 30000) });
  } catch (e: any) {
    throw new FacebookError(`Facebook network error: ${e?.message || e}`, 0, 0);
  }
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || j?.error) throw new FacebookError(`Facebook ${res.status}: ${j?.error?.message || "request failed"}`, j?.error?.code ?? 0, res.status);
  return j;
}

export async function exchangeFacebookCode(code: string, http: Http = fetch): Promise<string> {
  const q = new URLSearchParams({ client_id: process.env.FACEBOOK_APP_ID!, client_secret: process.env.FACEBOOK_APP_SECRET!, redirect_uri: facebookRedirectUri(), code });
  const short = await json(http, graph(`/oauth/access_token?${q}`));
  // long-lived user token -> the Page tokens derived from it never expire
  const q2 = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: process.env.FACEBOOK_APP_ID!, client_secret: process.env.FACEBOOK_APP_SECRET!, fb_exchange_token: short.access_token });
  const long = await json(http, graph(`/oauth/access_token?${q2}`));
  return long.access_token;
}

export interface FacebookPage {
  id: string;
  name: string;
  accessToken: string;
}

/** Pages the user can post to (CREATE_CONTENT task), with their Page tokens. */
export async function facebookPages(userToken: string, http: Http = fetch): Promise<FacebookPage[]> {
  const j = await json(http, graph(`/me/accounts?fields=id,name,access_token,tasks&limit=100&access_token=${encodeURIComponent(userToken)}`));
  return (j.data || [])
    .filter((p: any) => !p.tasks || p.tasks.includes("CREATE_CONTENT"))
    .map((p: any) => ({ id: p.id, name: p.name, accessToken: p.access_token }));
}

/** Upload + publish a Reel. Returns the video id to poll. */
export async function facebookPublishReel(pageId: string, pageToken: string, filePath: string, description: string, http: Http = fetch): Promise<string> {
  const start = await json(http, graph(`/${pageId}/video_reels`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upload_phase: "start", access_token: pageToken }),
  });
  const videoId: string = start.video_id;
  const data = fs.readFileSync(filePath);
  const up = await json(http, `https://rupload.facebook.com/video-upload/${version()}/${videoId}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${pageToken}`, offset: "0", file_size: String(data.length) },
    body: new Uint8Array(data),
  });
  if (!up.success) throw new FacebookError("Facebook upload did not succeed", 0, 500);
  const fin = await json(http, graph(`/${pageId}/video_reels`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: pageToken, video_id: videoId, upload_phase: "finish", video_state: "PUBLISHED", description: description.slice(0, 2200) }),
  });
  if (!fin.success) throw new FacebookError("Facebook publish did not succeed", 0, 500);
  return videoId;
}

export interface ReelStatus {
  video_status?: string; // "ready" when done, "error" on failure
  uploading_phase?: { status?: string };
  processing_phase?: { status?: string; error?: { message?: string } };
  publishing_phase?: { status?: string; publish_status?: string; error?: { message?: string } };
}

export async function facebookReelStatus(videoId: string, pageToken: string, http: Http = fetch): Promise<ReelStatus> {
  const j = await json(http, graph(`/${videoId}?fields=status&access_token=${encodeURIComponent(pageToken)}`));
  return j.status || {};
}
