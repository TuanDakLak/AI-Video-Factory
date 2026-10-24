import { prisma } from "../lib/db";
import { storage } from "../lib/storage";
import { decryptSecret, encryptSecret } from "../lib/publish/crypto";
import { chunkPlan } from "../lib/publish/tiktok";
import { buildCaption, platformProblem, pollPublication, queueAutoPublications, startPublication } from "../lib/publish/publisher";
import { socialSetup, wrongOrigin } from "../lib/publish/oauth";
import { facebookAuthorizeUrl } from "../lib/publish/facebook";

/** Publishing pipeline against mocked TikTok / Facebook APIs (no network, no real accounts). Needs Postgres. */
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`❌ ${msg}`);
  console.log(`✅ ${msg}`);
}

const MB = 1024 * 1024;

type Call = { url: string; method: string; headers: Record<string, string>; body: any };
/** Scripted fake of `fetch`: each handler matches a URL fragment and returns [status, json]. Records every call. */
function fakeHttp(routes: Array<[string, (c: Call) => [number, any]]>) {
  const calls: Call[] = [];
  const http = (async (input: any, init: any = {}) => {
    const url = String(input);
    let body: any = init.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {}
    } else if (body instanceof URLSearchParams) body = Object.fromEntries(body);
    const c: Call = { url, method: init.method || "GET", headers: Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)])), body };
    calls.push(c);
    const route = routes.find(([frag]) => url.includes(frag));
    if (!route) throw new Error(`unexpected request ${url}`);
    const [status, json] = route[1](c);
    return new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { http, calls };
}

async function run() {
  process.env.AUTH_SECRET ||= "test-secret-for-publish-tests-only-0123456789abcdef";
  process.env.TIKTOK_CLIENT_KEY = "ck";
  process.env.TIKTOK_CLIENT_SECRET = "cs";
  const tag = `t${Date.now()}`;
  const users: string[] = [];
  const files: string[] = [];
  try {
    console.log("--- 1. Token encryption ---");
    const sealed = encryptSecret("act.secret-token");
    assert(sealed.startsWith("v1:") && !sealed.includes("secret-token") && decryptSecret(sealed) === "act.secret-token", "token encrypted at rest and decrypts back");
    assert(encryptSecret("x") !== encryptSecret("x"), "random IV: same token never encrypts to the same value");
    const raw = Buffer.from(sealed.slice(3), "base64");
    raw[raw.length - 1] ^= 1;
    let tampered = false;
    try {
      decryptSecret("v1:" + raw.toString("base64"));
    } catch {
      tampered = true;
    }
    assert(tampered, "a modified ciphertext is rejected (authenticated encryption)");

    console.log("\n--- 2. TikTok chunk rules ---");
    const small = chunkPlan(3 * MB);
    assert(small.total === 1 && small.chunkSize === 3 * MB, "< 5 MB: uploaded whole");
    const mid = chunkPlan(25 * MB);
    assert(mid.total === 2 && mid.ranges[0][1] === 10 * MB - 1 && mid.ranges[1][0] === 10 * MB && mid.ranges[1][1] === 25 * MB - 1, "25 MB: floor(size/chunk) chunks, the last absorbs the remainder");
    assert(mid.ranges.reduce((s, [a, b]) => s + (b - a + 1), 0) === 25 * MB, "chunks cover every byte exactly once");

    console.log("\n--- 3. Captions & platform rules ---");
    assert(buildCaption("Hồ Gươm huyền thoại #cotich", ["#cotich", "#vietnam"]) === "Hồ Gươm huyền thoại #cotich\n\n#vietnam", "hashtags appended once");
    assert(platformProblem("FACEBOOK_PAGE", { duration: 95, width: 720, height: 1280 })?.includes("3–90"), "Facebook Reels > 90 s refused before uploading");
    assert(platformProblem("FACEBOOK_PAGE", { duration: 30, width: 720, height: 1280 }) === null, "30 s 720x1280 is a valid Reel");
    assert(platformProblem("TIKTOK", { duration: 90, width: 720, height: 1280 }, 60)?.includes("60s"), "TikTok creator's max duration respected");

    console.log("\n--- 4. TikTok publishing (mocked API) ---");
    const u = await prisma.user.create({ data: { email: `pub-${tag}@test.local`, name: "P", passwordHash: null } });
    users.push(u.id);
    const project = await prisma.project.create({ data: { ownerId: u.id, name: "pub", topic: "t" } });
    const saved = await storage.saveFile(project.id, "test.mp4", Buffer.alloc(6 * MB, 7), "videos");
    files.push(saved.storageKey);
    const video = await prisma.videoAsset.create({ data: { projectId: project.id, filename: "test.mp4", storageKey: saved.storageKey, fileSize: 6 * MB, duration: 30, width: 720, height: 1280 } });
    const tt = await prisma.socialAccount.create({
      data: {
        ownerId: u.id, platform: "TIKTOK", externalId: `open-${tag}`, displayName: "my tiktok",
        accessToken: encryptSecret("old-access"), refreshToken: encryptSecret("old-refresh"),
        tokenExpiresAt: new Date(Date.now() - 1000), // expired: must refresh first
      },
    });
    const pub = await prisma.publication.create({ data: { videoAssetId: video.id, socialAccountId: tt.id, platform: "TIKTOK", caption: "Hồ Gươm #cotich", privacy: "PUBLIC_TO_EVERYONE" } });
    const tiktok = fakeHttp([
      ["/v2/oauth/token/", () => [200, { access_token: "new-access", refresh_token: "new-refresh", open_id: tt.externalId, scope: "user.info.basic,video.publish", expires_in: 86400, refresh_expires_in: 31536000 }]],
      ["/creator_info/query/", () => [200, { data: { privacy_level_options: ["SELF_ONLY"], max_video_post_duration_sec: 600 }, error: { code: "ok" } }]],
      ["/video/init/", () => [200, { data: { publish_id: "pub_123", upload_url: "https://upload.example/tt" }, error: { code: "ok" } }]],
      ["upload.example", () => [201, {}]],
      ["/status/fetch/", () => [200, { data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [7123] }, error: { code: "ok" } }]],
    ]);
    const started = await startPublication(pub.id, tiktok.http);
    const init = tiktok.calls.find((c) => c.url.includes("/video/init/"))!;
    const puts = tiktok.calls.filter((c) => c.method === "PUT");
    assert(tiktok.calls[0].url.includes("/oauth/token/") && tiktok.calls[0].body.grant_type === "refresh_token", "expired TikTok token refreshed before posting");
    const accAfter = await prisma.socialAccount.findUniqueOrThrow({ where: { id: tt.id } });
    assert(decryptSecret(accAfter.accessToken) === "new-access" && decryptSecret(accAfter.refreshToken!) === "new-refresh", "rotated tokens stored encrypted");
    assert(init.headers.authorization === "Bearer new-access", "the fresh token is used");
    assert(init.body.post_info.privacy_level === "SELF_ONLY", "unaudited app: requested PUBLIC falls back to the only allowed option (SELF_ONLY)");
    assert(init.body.post_info.is_aigc === true, "post labelled as AI-generated");
    assert(init.body.source_info.source === "FILE_UPLOAD" && init.body.source_info.video_size === 6 * MB && init.body.source_info.total_chunk_count === 1, "init declares FILE_UPLOAD with the right sizes");
    assert(puts.length === 1 && puts[0].headers["content-range"] === `bytes 0-${6 * MB - 1}/${6 * MB}`, "chunk uploaded with Content-Range");
    assert(started.status === "PROCESSING" && started.remoteId === "pub_123", "publication waits for TikTok processing");
    const published = await pollPublication(pub.id, tiktok.http);
    assert(published.status === "PUBLISHED" && published.remoteUrl?.includes("7123"), "status PUBLISH_COMPLETE -> PUBLISHED with the post id");

    // errors
    const video2 = await prisma.videoAsset.create({ data: { projectId: project.id, filename: "b.mp4", storageKey: saved.storageKey, fileSize: 6 * MB, duration: 30, width: 720, height: 1280 } });
    const p2 = await prisma.publication.create({ data: { videoAssetId: video2.id, socialAccountId: tt.id, platform: "TIKTOK", caption: "x" } });
    const busy = fakeHttp([["/creator_info/query/", () => [503, { error: { code: "internal_error", message: "busy" } }]]]);
    const r2 = await startPublication(p2.id, busy.http);
    assert(r2.status === "QUEUED" && r2.attempts === 1, "TikTok 5xx -> retried later (back to QUEUED)");
    const revoked = fakeHttp([["/creator_info/query/", () => [401, { error: { code: "access_token_invalid", message: "expired" } }]]]);
    const r3 = await startPublication(p2.id, revoked.http);
    assert(r3.status === "FAILED" && (await prisma.socialAccount.findUniqueOrThrow({ where: { id: tt.id } })).status === "EXPIRED", "revoked token -> post FAILED and the account marked for reconnection");
    const r4 = await startPublication(p2.id, revoked.http);
    assert(r4.status === "FAILED" && r4.attempts === 2, "a failed post is not retried automatically");

    console.log("\n--- 5. Facebook Reels (mocked API) ---");
    const fb = await prisma.socialAccount.create({ data: { ownerId: u.id, platform: "FACEBOOK_PAGE", externalId: `page-${tag}`, displayName: "my page", accessToken: encryptSecret("page-token") } });
    const p5 = await prisma.publication.create({ data: { videoAssetId: video.id, socialAccountId: fb.id, platform: "FACEBOOK_PAGE", caption: "Reel caption" } });
    const graph = fakeHttp([
      ["rupload.facebook.com", () => [200, { success: true }]],
      ["/video_reels", (c) => (c.body.upload_phase === "start" ? [200, { video_id: "vid_9", upload_url: "x" }] : [200, { success: true }])],
      ["/vid_9?fields=status", () => [200, { status: { video_status: "ready" } }]],
    ]);
    const s5 = await startPublication(p5.id, graph.http);
    const up = graph.calls.find((c) => c.url.includes("rupload"))!;
    const fin = graph.calls.filter((c) => c.url.includes("/video_reels"))[1];
    assert(up.headers.authorization === "OAuth page-token" && up.headers.offset === "0" && up.headers.file_size === String(6 * MB), "binary uploaded to rupload with the Page token");
    assert(fin.body.upload_phase === "finish" && fin.body.video_state === "PUBLISHED" && fin.body.description === "Reel caption", "finish publishes with the caption");
    assert(s5.status === "PROCESSING" && (await pollPublication(p5.id, graph.http)).status === "PUBLISHED", "Reel published after processing");
    const long = await prisma.videoAsset.create({ data: { projectId: project.id, filename: "long.mp4", storageKey: saved.storageKey, fileSize: 6 * MB, duration: 120, width: 720, height: 1280 } });
    const p6 = await prisma.publication.create({ data: { videoAssetId: long.id, socialAccountId: fb.id, platform: "FACEBOOK_PAGE", caption: "x" } });
    const none = fakeHttp([]);
    const s6 = await startPublication(p6.id, none.http);
    assert(s6.status === "FAILED" && /3–90/.test(s6.errorMessage || "") && none.calls.length === 0, "a 120 s video never reaches Facebook (refused locally)");

    console.log("\n--- 6. Auto-publish queue ---");
    const ch = await prisma.channel.create({ data: { ownerId: u.id, name: "c", autoPublish: true, publishTargets: JSON.stringify([fb.id]), tiktokPrivacy: "SELF_ONLY" } });
    const seq = await prisma.sequence.create({ data: { projectId: project.id, title: "s", brief: "b", styleBible: "", caption: "Chuyện cổ tích", tags: JSON.stringify(["#cotich"]) } });
    const fv = await prisma.videoAsset.create({ data: { projectId: project.id, filename: "f.mp4", storageKey: saved.storageKey, fileSize: 6 * MB, duration: 30, width: 720, height: 1280, sequenceId: seq.id } });
    await prisma.topic.create({ data: { channelId: ch.id, title: "t", normalizedTitle: "t", genre: "short_film", durationSec: 30, status: "READY", sequenceId: seq.id } });
    const q1 = await queueAutoPublications();
    const q2 = await queueAutoPublications();
    const queued = await prisma.publication.findMany({ where: { videoAssetId: fv.id } });
    assert(q1 >= 1 && q2 === 0 && queued.length === 1 && queued[0].caption === "Chuyện cổ tích\n\n#cotich", "finished video queued once per target account, with caption + hashtags");
  } finally {
    for (const k of files) await storage.deleteFile(k);
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }

  console.log("\n--- 7. Connect setup (APP_URL) ---");
  const savedUrl = process.env.APP_URL;
  process.env.APP_URL = "https://demo.ngrok-free.app/";
  const st = socialSetup();
  assert(st.https && st.tiktok.redirectUri === "https://demo.ngrok-free.app/api/social/tiktok/callback" && st.facebook.redirectUri.endsWith("/api/social/facebook/callback"), "redirect URIs shown for setup are built from APP_URL");
  const req = (host: string) => new Request(`http://${host}/api/social/tiktok/start`, { headers: { host } });
  const moved = wrongOrigin(req("localhost:3000"));
  assert(moved?.status === 303 && moved.headers.get("location") === "https://demo.ngrok-free.app/settings?social=origin", "connecting from another address is sent to APP_URL first (cookies live there)");
  assert(wrongOrigin(req("demo.ngrok-free.app")) === null, "connecting from APP_URL proceeds");
  process.env.FACEBOOK_APP_ID = "app";
  const classic = new URL(facebookAuthorizeUrl("s"));
  process.env.FACEBOOK_CONFIG_ID = "cfg123";
  const business = new URL(facebookAuthorizeUrl("s"));
  delete process.env.FACEBOOK_CONFIG_ID;
  assert(classic.searchParams.get("scope")?.includes("pages_manage_posts") && !classic.searchParams.has("config_id"), "Facebook Login: permissions sent as scope");
  assert(business.searchParams.get("config_id") === "cfg123" && !business.searchParams.has("scope"), "Facebook Login for Business: login configuration id instead of scope");
  if (savedUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = savedUrl;

  console.log("\n🎉 ALL PUBLISH TESTS PASSED");
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
