import path from "path";
import fs from "fs";
import { chromium, BrowserContext, Page } from "playwright";
import { prisma } from "../db";
import { FlowSelectors } from "./flow-selectors";
import { videoProcessor } from "../video-processor";
import { storage } from "../storage";
import {
  findPromptBox,
  typePrompt,
  submitPrompt,
  applyOptions,
  startNewAgentSession,
  countApprovalCards,
  readApprovalRequest,
  answerApproval,
  listVideoSources,
  listVideoTileIds,
  listVideoTilePositions,
  countErrorTiles,
  downloadTileVideo,
  downloadFromEditor,
  openTileAndReadPrompt,
  dumpDiagnostics,
  attachFiles,
  DOWNLOAD_HOOK_SCRIPT,
} from "./flow-dom";
import { buildAgentBatchPrompt, buildAgentNudge } from "@/lib/sequence/agent-prompt";
import { assertCanSpend, recordCreditsSpent } from "@/lib/sequence/credit-guard";
import { resolveSceneAttachments } from "../sequence/attachments";
import { HealthCheckItem, HealthReport, saveHealthReport } from "./health-store";
import { makeSolidPng } from "./test-png";

/** A Flow project page, e.g. https://flow.google.com/project/<uuid> */
const PROJECT_PAGE_RE = /\/project\/[^/?#]+/i;

export interface GenerationProgressCallback {
  (step: string, message: string): Promise<void>;
}

export class FlowAutomationService {
  private static getBaseFlowUrl(): string {
    return (
      process.env.FLOW_BASE_URL ||
      "https://labs.google/fx/tools/flow"
    );
  }

  /** Headed by default: Google serves a different/blocked UI to headless browsers. Set FLOW_HEADLESS=true to override. */
  private static isHeadless(): boolean {
    return (process.env.FLOW_HEADLESS || "false").toLowerCase() === "true";
  }

  private static isSignedOutUrl(url: string): boolean {
    return /accounts\.google\.com|\/about(\/|\?|$)|ServiceLogin|signin/i.test(url);
  }

  public static getProfilePath(profileDir: string): string {
    // one folder name, never a path: a profile dir holds a signed-in Google session
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(profileDir)) throw new Error(`Invalid browser profile dir: ${profileDir}`);
    const rootProfileDir =
      process.env.BROWSER_PROFILE_PATH || "./data/browser-profiles";
    const resolvedPath = path.resolve(process.cwd(), rootProfileDir, profileDir);
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }
    return resolvedPath;
  }

  /**
   * Helper to launch a persistent Chromium context with anti-detection flags
   */
  private static async launchContext(
    profileDir: string,
    headless: boolean = false
  ): Promise<BrowserContext> {
    const profilePath = this.getProfilePath(profileDir);

    const context = await chromium.launchPersistentContext(profilePath, {
      headless: headless,
      channel: "chromium",
      viewport: { width: 1280, height: 800 },
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-infobars",
      ],
      ignoreDefaultArgs: ["--enable-automation"],
    });
    // Flow's blob downloads crash the bundled Chromium: capture them in the page instead (see DOWNLOAD_HOOK_SCRIPT)
    await context.addInitScript(DOWNLOAD_HOOK_SCRIPT);

    return context;
  }

  /**
   * Helper to try finding an element using multiple resilient selectors
   */
  private static async findFirstSelector(
    page: Page,
    selectors: string[],
    timeoutMs: number = 5000
  ): Promise<string | null> {
    try {
      if (selectors.length === 0) return null;
      const combinedSelector = selectors.join(", ");
      const el = await page.waitForSelector(combinedSelector, {
        timeout: timeoutMs,
        state: "visible",
      });
      return el ? combinedSelector : null;
    } catch {
      return null;
    }
  }

  /**
   * Reads visible credit balance from current page DOM
   */
  public static async readVisibleCredits(page: Page): Promise<number | null> {
    try {
      const pageText = await page.evaluate(() => document.body.innerText);
      const match = pageText.match(FlowSelectors.credits.balancePattern);
      if (match && match[1]) {
        const numeric = parseInt(match[1].replace(/,/g, ""), 10);
        if (!isNaN(numeric)) {
          return numeric;
        }
      }
    } catch (e) {
      console.warn("[FlowAutomation] Could not read visible credit balance:", e);
    }
    return null;
  }

  /**
   * Step 6 & 7: Connect Google Account
   * Launches a headed browser session for the user to log in manually and complete any 2FA/CAPTCHA.
   */
  public static async launchLoginSession(
    googleAccountId: string
  ): Promise<{ success: boolean; message: string; credits?: number | null }> {
    const account = await prisma.googleAccount.findUnique({
      where: { id: googleAccountId },
    });

    if (!account) {
      throw new Error(`Google account ${googleAccountId} not found.`);
    }

    if (account.lockStatus === "IN_USE") {
      return {
        success: false,
        message: `Tài khoản ${account.name} đang bận xử lý tác vụ khác. Vui lòng thử lại sau.`,
      };
    }

    await prisma.googleAccount.update({
      where: { id: googleAccountId },
      data: { status: "CONNECTING" },
    });

    let context: BrowserContext | null = null;
    try {
      context = await this.launchContext(account.profileDir, false);
      const page = context.pages()[0] || (await context.newPage());

      const flowUrl = this.getBaseFlowUrl();
      console.log(`[FlowAutomation] Opening Google Flow for manual login: ${flowUrl}`);
      await page.goto(flowUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

      // Check if user is already signed in or needs manual login
      console.log("[FlowAutomation] Waiting for user authentication check...");

      // Wait up to 90 seconds for user to sign in if needed
      let isAuthenticated = false;
      const startTime = Date.now();
      const maxWait = 90000;

      while (Date.now() - startTime < maxWait) {
        // Check for avatar or auth indicators
        const avatarSelector = await this.findFirstSelector(
          page,
          FlowSelectors.auth.userAvatar,
          2000
        );
        const signInSelector = await this.findFirstSelector(
          page,
          FlowSelectors.auth.signInButton,
          1000
        );

        if (avatarSelector && !signInSelector) {
          isAuthenticated = true;
          break;
        }

        // Wait 3 seconds before re-checking
        await page.waitForTimeout(3000);
      }

      const credits = await this.readVisibleCredits(page);

      if (isAuthenticated) {
        await prisma.googleAccount.update({
          where: { id: googleAccountId },
          data: {
            status: "CONNECTED",
            lastConnectedAt: new Date(),
            lastCreditCheckAt: new Date(),
            lastKnownFlowCredits: credits ?? account.lastKnownFlowCredits,
          },
        });

        return {
          success: true,
          message: `Tài khoản ${account.name} đã kết nối thành công với Google Flow!`,
          credits,
        };
      } else {
        await prisma.googleAccount.update({
          where: { id: googleAccountId },
          data: { status: "NOT_CONNECTED" },
        });

        return {
          success: false,
          message: "Chưa hoàn tất đăng nhập Google hoặc hết thời gian chờ.",
        };
      }
    } catch (err: any) {
      console.error("[FlowAutomation] Login session error:", err);
      await prisma.googleAccount.update({
        where: { id: googleAccountId },
        data: { status: "ERROR" },
      });
      return {
        success: false,
        message: `Lỗi kết nối: ${err.message}`,
      };
    } finally {
      if (context) {
        await context.close().catch(() => {});
      }
    }
  }

  /**
   * Step 9 & 10: Test Connection
   * Checks whether the persistent profile holds an active Google Flow session without human interaction.
   */
  public static async testConnection(
    googleAccountId: string
  ): Promise<{ status: string; credits: number | null; message: string }> {
    const account = await prisma.googleAccount.findUnique({
      where: { id: googleAccountId },
    });

    if (!account) {
      throw new Error(`Google account ${googleAccountId} not found.`);
    }

    if (account.lockStatus === "IN_USE") {
      return {
        status: account.status,
        credits: account.lastKnownFlowCredits,
        message: `Tài khoản ${account.name} đang bận xử lý tác vụ, không thể test connection lúc này.`,
      };
    }

    let context: BrowserContext | null = null;
    try {
      // Use headless for fast background test
      context = await this.launchContext(account.profileDir, true);
      const page = context.pages()[0] || (await context.newPage());

      await page.goto(this.getBaseFlowUrl(), {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const avatarSelector = await this.findFirstSelector(
        page,
        FlowSelectors.auth.userAvatar,
        8000
      );
      const signInSelector = await this.findFirstSelector(
        page,
        FlowSelectors.auth.signInButton,
        3000
      );

      const credits = await this.readVisibleCredits(page);

      if (avatarSelector && !signInSelector) {
        await prisma.googleAccount.update({
          where: { id: googleAccountId },
          data: {
            status: "CONNECTED",
            lastCreditCheckAt: new Date(),
            lastKnownFlowCredits: credits ?? account.lastKnownFlowCredits,
          },
        });

        return {
          status: "CONNECTED",
          credits: credits ?? account.lastKnownFlowCredits,
          message: "Session Google Flow hoạt động bình thường.",
        };
      } else {
        await prisma.googleAccount.update({
          where: { id: googleAccountId },
          data: {
            status: "EXPIRED",
            lastCreditCheckAt: new Date(),
          },
        });

        return {
          status: "EXPIRED",
          credits: null,
          message: "Session đã hết hạn hoặc chưa đăng nhập. Vui lòng nhấn Reconnect.",
        };
      }
    } catch (err: any) {
      console.error("[FlowAutomation] Test connection error:", err);
      await prisma.googleAccount.update({
        where: { id: googleAccountId },
        data: {
          status: "ERROR",
          lastCreditCheckAt: new Date(),
        },
      });

      return {
        status: "ERROR",
        credits: null,
        message: `Không thể kết nối đến Google Flow: ${err.message}`,
      };
    } finally {
      if (context) {
        await context.close().catch(() => {});
      }
    }
  }

  /** Store a downloaded clip, probe it with ffprobe, make a thumbnail and (re)create the VideoAsset of one generation. */
  public static async saveClipAsset(gen: { id: string; projectId: string; model: string }, mp4Path: string) {
  const originalFilename = `flow_${gen.model.replace(/\s+/g, "_")}_${gen.id.slice(-6)}.mp4`;
  const videoBuffer = fs.readFileSync(mp4Path);

  // Save to main storage
  const { storageKey, absolutePath } = await storage.saveFile(
    gen.projectId,
    originalFilename,
    videoBuffer,
    "videos"
  );

  // Extract metadata
  const metadata = await videoProcessor.extractMetadata(
    absolutePath,
    originalFilename,
    "video/mp4"
  );

  const finalDuration = metadata.duration || 8.0;
  const finalWidth = metadata.width || 1080;
  const finalHeight = metadata.height || 1920;

  // Try generating thumbnail
  const thumbOutputDir = path.join(
    path.resolve(process.cwd(), process.env.STORAGE_PATH || "./storage"),
    "projects",
    gen.projectId,
    "thumbnails"
  );
  const thumbFilename = await videoProcessor.generateThumbnail(absolutePath, thumbOutputDir);
  const thumbnailKey = thumbFilename
    ? `projects/${gen.projectId}/thumbnails/${thumbFilename}`
    : null;

  // A previous attempt (or a manual import) may already own a VideoAsset for this generation
  const previousAsset = await prisma.videoAsset.findUnique({ where: { generationId: gen.id } });
  if (previousAsset) {
    await storage.deleteFile(previousAsset.storageKey);
    if (previousAsset.thumbnailKey) await storage.deleteFile(previousAsset.thumbnailKey);
    await prisma.videoAsset.delete({ where: { id: previousAsset.id } });
  }

  // Create VideoAsset
  const processedAsset = await prisma.videoAsset.create({
    data: {
      projectId: gen.projectId,
      generationId: gen.id,
      filename: originalFilename,
      storageKey,
      mimeType: "video/mp4",
      fileSize: videoBuffer.length,
      duration: finalDuration,
      width: finalWidth,
      height: finalHeight,
      thumbnailKey,
    },
  });

    return processedAsset;
  }

  /**
   * Daily self-check of the Flow UI (spends NO credits): login, credit balance, project page, prompt composer, "+" asset button,
   * Agent settings and "new session" controls. When Flow changes its UI the failing item tells which control moved.
   */
  /** ownerId: restrict to that user's accounts (API callers); omitted only by trusted local callers (CLI, worker). */
  public static async healthCheck(googleAccountId?: string, ownerId?: string): Promise<HealthReport> {
    const owner = ownerId ? { ownerId } : {};
    const account = googleAccountId
      ? await prisma.googleAccount.findFirst({ where: { id: googleAccountId, ...owner } })
      : await prisma.googleAccount.findFirst({ where: { status: "CONNECTED", ...owner }, orderBy: { updatedAt: "desc" } });
    if (!account) throw new Error("Chưa có tài khoản Google nào để kiểm tra.");
    const items: HealthCheckItem[] = [];
    const report: HealthReport = { at: new Date().toISOString(), accountId: account.id, accountName: account.name, ok: false, credits: null, items };
    if (account.lockStatus === "IN_USE") {
      items.push({ name: "account-free", ok: false, detail: `Tài khoản ${account.name} đang bận, bỏ qua lần kiểm tra này.` });
      return report;
    }
    await prisma.googleAccount.update({ where: { id: account.id }, data: { lockStatus: "IN_USE" } });
    let context: BrowserContext | null = null;
    let page: Page | undefined;
    const add = (name: string, ok: boolean, detail = "") => items.push({ name, ok, detail });
    try {
      context = await this.launchContext(account.profileDir, this.isHeadless());
      page = context.pages()[0] || (await context.newPage());
      await page.goto(this.getBaseFlowUrl(), { waitUntil: "domcontentloaded", timeout: 45000 });
      const avatar = await this.findFirstSelector(page, FlowSelectors.auth.userAvatar, 12000);
      const loggedIn = !!avatar && !this.isSignedOutUrl(page.url());
      add("login", loggedIn, loggedIn ? "Đã đăng nhập." : `Chưa đăng nhập (${page.url()}).`);
      if (loggedIn) {
        await page.waitForTimeout(3000);
        report.credits = await this.readVisibleCredits(page);
        add("credits", report.credits !== null, report.credits !== null ? `Số dư: ${report.credits}` : "Không đọc được số dư tín dụng.");
        if (report.credits !== null) {
          await prisma.googleAccount.update({ where: { id: account.id }, data: { lastKnownFlowCredits: report.credits, lastCreditCheckAt: new Date() } });
        }
        // open the newest known project (never creates one, never submits anything)
        const known = await prisma.generation.findFirst({
          where: { googleAccountId: account.id, flowProjectId: { contains: "/project/" } },
          orderBy: { updatedAt: "desc" },
          select: { flowProjectId: true },
        });
        const projectUrl = known?.flowProjectId || null;
        report.projectUrl = projectUrl;
        if (!projectUrl) {
          add("project-page", false, "Chưa có dự án Flow nào đã lưu để kiểm tra giao diện (chạy 1 video rồi kiểm tra lại).");
        } else {
          await page.goto(projectUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
          await page.waitForTimeout(4000);
          const inProject = /\/project\//.test(page.url());
          add("project-page", inProject, inProject ? page.url() : `Không mở được dự án (${page.url()}).`);
          if (inProject) {
            const box = await findPromptBox(page, 15000);
            add("prompt-box", !!box.found, box.found ? "Có ô nhập prompt." : "Không thấy ô nhập prompt.");
            const vis = async (sel: string) => page!.locator(sel).first().isVisible().catch(() => false);
            const plus = await vis('button[aria-label="Thêm thành phần vào ô nhập câu lệnh"], button[aria-label="Add media to prompt"], button[aria-label*="Thêm thành phần"]');
            add("add-button", plus, plus ? 'Nút "+" đính kèm có mặt.' : 'Không thấy nút "+" (đính kèm ảnh).');
            const settings = await vis('button[aria-label="Cài đặt"], button[aria-label="Settings"]');
            add("agent-settings", settings, settings ? 'Nút "Cài đặt" tác nhân có mặt.' : 'Không thấy nút "Cài đặt".');
            const fresh = await vis('button[aria-label="Bắt đầu phiên mới"], button[aria-label="New session"]');
            add("new-session", fresh, fresh ? 'Nút "Bắt đầu phiên mới" có mặt.' : 'Không thấy nút "Bắt đầu phiên mới".');
            const tiles = (await listVideoTilePositions(page)).length;
            add("video-tiles", true, `${tiles} video trong dự án.`);
          }
        }
      }
    } catch (err: any) {
      add("exception", false, err?.message || String(err));
    } finally {
      if (page && items.some((i) => !i.ok)) {
        const dir = path.resolve(process.cwd(), "data", "flow-debug");
        fs.mkdirSync(dir, { recursive: true });
        const shot = path.join(dir, `health-${Date.now()}.png`);
        await page.screenshot({ path: shot }).then(() => (report.screenshot = shot)).catch(() => {});
      }
      await prisma.googleAccount.update({ where: { id: account.id }, data: { lockStatus: "AVAILABLE" } }).catch(() => {});
      if (context) await context.close().catch(() => {});
    }
    report.ok = items.length > 0 && items.every((i) => i.ok || i.name === "project-page" && !report.projectUrl);
    saveHealthReport(report);
    return report;
  }

  /**
   * Attach self-test (spends NO credits, submits nothing): opens the newest known project, attaches a tiny generated PNG to the Agent
   * composer through the real "+" picker and reports whether Flow accepted it. This is how the reference-image path is verified on
   * YOUR machine (npm run flow:attach-test) before relying on it for unattended runs.
   */
  public static async attachSelfTest(googleAccountId?: string): Promise<{ ok: boolean; detail: string; screenshot?: string }> {
    const account = googleAccountId
      ? await prisma.googleAccount.findUnique({ where: { id: googleAccountId } })
      : await prisma.googleAccount.findFirst({ where: { status: "CONNECTED" }, orderBy: { updatedAt: "desc" } });
    if (!account) throw new Error("Chưa có tài khoản Google nào để kiểm tra.");
    if (account.lockStatus === "IN_USE") throw new Error(`Tài khoản ${account.name} đang bận.`);
    const known = await prisma.generation.findFirst({
      where: { googleAccountId: account.id, flowProjectId: { contains: "/project/" } },
      orderBy: { updatedAt: "desc" },
      select: { flowProjectId: true },
    });
    if (!known?.flowProjectId) throw new Error("Chưa có dự án Flow nào đã lưu: chạy 1 video trước rồi kiểm tra lại.");

    await prisma.googleAccount.update({ where: { id: account.id }, data: { lockStatus: "IN_USE" } });
    let context: BrowserContext | null = null;
    let page: Page | undefined;
    const tmp = path.resolve(process.cwd(), "tmp", "attach-selftest");
    fs.mkdirSync(tmp, { recursive: true });
    try {
      const png = path.join(tmp, `selftest_${Date.now()}.png`);
      fs.writeFileSync(png, makeSolidPng(96, 96, [200, 120, 60]));
      context = await this.launchContext(account.profileDir, this.isHeadless());
      page = context.pages()[0] || (await context.newPage());
      await page.goto(known.flowProjectId, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(4000);
      await startNewAgentSession(page);
      const box = await findPromptBox(page, 15000);
      if (!box.found) return { ok: false, detail: "Không thấy ô nhập prompt trong dự án Flow." };
      await attachFiles(page, [png]);
      return { ok: true, detail: "Đính kèm ảnh thành công qua hộp chọn thành phần của Flow (chưa gửi gì, không tốn credit)." };
    } catch (err: any) {
      const dir = path.resolve(process.cwd(), "data", "flow-debug");
      fs.mkdirSync(dir, { recursive: true });
      const shot = path.join(dir, `attach-selftest-${Date.now()}.png`);
      const saved = page ? await page.screenshot({ path: shot }).then(() => shot).catch(() => undefined) : undefined;
      return { ok: false, detail: err?.message || String(err), screenshot: saved };
    } finally {
      await prisma.googleAccount.update({ where: { id: account.id }, data: { lockStatus: "AVAILABLE" } }).catch(() => {});
      if (context) await context.close().catch(() => {});
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {}
    }
  }

  /**
   * Download the clips of a Flow project and match them to scenes (0 credits). Every finished tile is opened in the Flow editor,
   * whose history panel shows the prompt the clip was made from ("Scene 3. ..."), and the ORIGINAL 720p file is downloaded there.
   * Tiles are scanned in grid order (newest first), so when a scene was re-generated the newest clip wins.
   * Unlabelled clips are kept aside and, when their number equals the number of scenes still missing, assigned by elimination
   * in generation order (oldest first). Never throws for a single clip: missing scenes are returned in `missing`.
   */
  private static async collectClipsFromProject(
    page: Page,
    projectUrl: string,
    scenes: number[],
    tempDir: string,
    log: (message: string) => Promise<void>,
    opts: { onlyFirstTiles?: number } = {}
  ): Promise<{ clips: Map<number, { file: string; prompt: string }>; missing: number[] }> {
    const clips = new Map<number, { file: string; prompt: string }>();
    const need = new Set(scenes);
    const backToGrid = async (expected: number) => {
      if (!/\/edit\//.test(page.url()) && PROJECT_PAGE_RE.test(page.url()) && (await listVideoTilePositions(page)).length >= expected) return;
      await page.goto(projectUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      for (let w = 0; w < 15 && (await listVideoTilePositions(page)).length < expected; w++) await page.waitForTimeout(1500);
    };

    await backToGrid(1);
    // thumbnails load progressively: wait until the tile count stops changing (3 equal reads ~2s apart)
    let tileCount = 0;
    for (let w = 0, same = 0; w < 20 && same < 3; w++) {
      const n = (await listVideoTilePositions(page)).length;
      same = n === tileCount && n > 0 ? same + 1 : 0;
      tileCount = n;
      if (same < 3) await page.waitForTimeout(2000);
    }
    if (opts.onlyFirstTiles) tileCount = Math.min(tileCount, opts.onlyFirstTiles);
    await log(`Dự án Flow có ${tileCount} clip cần kiểm tra; đang đối chiếu với ${need.size} cảnh.`);

    const unlabelled: Array<{ position: number; file: string; prompt: string }> = [];
    for (let i = 0; i < tileCount && need.size > 0; i++) {
      await backToGrid(tileCount);
      const r = await openTileAndReadPrompt(page, i);
      if (!r.ok) {
        await log(`Không mở được clip #${i + 1} trong lưới.`);
        continue;
      }
      const known = r.scene !== null && need.has(r.scene);
      if (r.scene !== null && !known) {
        await log(`Bỏ qua clip #${i + 1} (Scene ${r.scene} đã có hoặc không thuộc video này).`);
        continue;
      }
      const label = known ? `cảnh ${r.scene}` : `clip #${i + 1} (chưa rõ cảnh)`;
      const mp4 = path.join(tempDir, known ? `scene_${r.scene}.mp4` : `tile_${i}.mp4`);
      await log(`Đang tải ${label} bản 720p gốc...`);
      let ok = await downloadFromEditor(page, mp4);
      if (!ok) {
        // one retry: reopen the clip (the download menu sometimes closes while the editor is still loading)
        await backToGrid(tileCount);
        ok = (await openTileAndReadPrompt(page, i)).ok && (await downloadFromEditor(page, mp4));
      }
      if (!ok || !fs.existsSync(mp4) || fs.statSync(mp4).size < 50 * 1024) {
        await log(`Không tải được ${label}.`);
        continue;
      }
      if (known) {
        clips.set(r.scene!, { file: mp4, prompt: r.prompt });
        need.delete(r.scene!);
      } else {
        unlabelled.push({ position: i, file: mp4, prompt: r.prompt });
      }
    }

    if (need.size > 0 && unlabelled.length === need.size) {
      // grid is newest first: the highest position is the oldest clip = the earliest missing scene
      const ordered = [...unlabelled].sort((a, b) => b.position - a.position);
      const missingSorted = Array.from(need).sort((a, b) => a - b);
      missingSorted.forEach((k, idx) => clips.set(k, { file: ordered[idx].file, prompt: ordered[idx].prompt }));
      await log(`Flow không ghi nhãn cảnh ${missingSorted.join(", ")}: gán theo thứ tự tạo (loại trừ).`);
      need.clear();
    }
    return { clips, missing: Array.from(need).sort((a, b) => a - b) };
  }

  /**
   * RECOVER: import the clips that already exist in the sequence's Flow project (0 credits). Used after a run that created the clips in
   * Flow but failed before saving them. Each finished tile is opened in the Flow editor, which shows the prompt the clip was made from
   * ("Scene 3: ..."), so the scene of every clip is read from Flow itself instead of guessed from the grid order.
   */
  public static async recoverSequenceClips(
    generationId: string,
    onProgress?: GenerationProgressCallback,
    projectUrlOverride?: string
  ): Promise<{ success: boolean; videoAssetId?: string; error?: string }> {
    const lead = await prisma.generation.findUnique({ where: { id: generationId }, include: { googleAccount: true } });
    if (!lead || !lead.sequenceId) throw new Error("Không tìm thấy cảnh của video nhiều cảnh để khôi phục.");
    if (!lead.googleAccount) throw new Error("Chưa gán tài khoản Google cho tác vụ khôi phục.");
    const account = lead.googleAccount;
    const leadProject = await prisma.project.findUnique({ where: { id: lead.projectId }, select: { ownerId: true } });
    if (!account.ownerId || account.ownerId !== leadProject?.ownerId) throw new Error("Tài khoản Google không thuộc chủ sở hữu của dự án này.");
    if (account.lockStatus === "IN_USE") throw new Error(`Tài khoản ${account.name} đang bận xử lý job khác.`);

    const scenes = await prisma.generation.findMany({
      where: { sequenceId: lead.sequenceId },
      orderBy: { sceneIndex: "asc" },
      select: { id: true, sceneIndex: true, projectId: true, model: true, flowProjectId: true, videoAsset: { select: { id: true } } },
    });
    const PROJECT_RE = /\/project\/[^/?#]+/i;
    const projectUrl =
      projectUrlOverride ||
      lead.flowProjectId ||
      scenes.map((s) => s.flowProjectId).find((u) => !!u && PROJECT_RE.test(u as string)) ||
      "";
    if (!projectUrl || !PROJECT_RE.test(projectUrl)) {
      throw new Error("Chưa biết URL dự án Flow của video này. Dán URL dự án Flow (…/project/…) khi bấm Khôi phục.");
    }

    await prisma.googleAccount.update({ where: { id: account.id }, data: { lockStatus: "IN_USE" } });
    const reportProgress = async (step: string, message: string) => {
      console.log(`[FlowRecover] [${generationId}] [${step}] ${message}`);
      await prisma.generationEvent.create({ data: { generationId, type: step, message } });
      await prisma.generation.update({ where: { id: generationId }, data: { status: step as any } });
      if (onProgress) await onProgress(step, message);
    };

    const tempDir = path.resolve(process.cwd(), "tmp", "generations", `${generationId}-recover`);
    fs.mkdirSync(tempDir, { recursive: true });
    let context: BrowserContext | null = null;
    let activePage: Page | undefined;
    const debugRoot = path.resolve(process.cwd(), "data", "flow-debug");
    try {
      await reportProgress("STARTING_BROWSER", "Khôi phục clip: mở trình duyệt Flow (không tốn credit).");
      context = await this.launchContext(account.profileDir, this.isHeadless());
      const page = context.pages()[0] || (await context.newPage());
      activePage = page;

      const need = new Map<number, { id: string; projectId: string; model: string }>();
      for (const s of scenes) {
        if (!s.videoAsset) need.set((s.sceneIndex ?? 0) + 1, { id: s.id, projectId: s.projectId, model: s.model });
      }
      if (need.size === 0) {
        await prisma.generation.update({ where: { id: generationId }, data: { status: "COMPLETED", completedAt: new Date() } });
        return { success: true };
      }

      await page.goto(projectUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(4000);
      if (this.isSignedOutUrl(page.url())) throw new Error("Phiên đăng nhập Google đã hết hạn. Vui lòng kết nối lại tài khoản.");
      if (!PROJECT_RE.test(page.url())) throw new Error(`Không mở được dự án Flow ${projectUrl} (đang ở ${page.url()}).`);

      let tileCount = 0;
      for (let w = 0; w < 15 && tileCount === 0; w++) {
        tileCount = (await listVideoTilePositions(page)).length;
        if (tileCount === 0) await page.waitForTimeout(2000);
      }
      if (tileCount === 0) throw new Error("Dự án Flow này chưa có video nào hoàn tất để khôi phục.");

      const { clips } = await this.collectClipsFromProject(page, projectUrl, Array.from(need.keys()), tempDir, (m) => reportProgress("DOWNLOADING", m));
      const found: number[] = [];
      for (const [k, clip] of Array.from(clips.entries()).sort((a, b) => a[0] - b[0])) {
        const target = need.get(k)!;
        await this.saveClipAsset(target, clip.file);
        await prisma.generation.update({
          where: { id: target.id },
          data: { prompt: clip.prompt || undefined, flowProjectId: projectUrl, status: "COMPLETED", completedAt: new Date(), errorMessage: null },
        });
        if (target.id !== generationId) {
          await prisma.generationEvent.create({ data: { generationId: target.id, type: "COMPLETED", message: "Clip khôi phục từ dự án Flow và đã được lưu." } }).catch(() => {});
        }
        need.delete(k);
        found.push(k);
      }

      if (need.size > 0) {
        const missingList = Array.from(need.keys()).sort((a, b) => a - b).join(", ");
        const msg = `Đã khôi phục ${found.length} clip (cảnh ${found.sort((a, b) => a - b).join(", ") || "—"}); chưa tìm thấy cảnh ${missingList} trong dự án Flow. Kiểm tra clip còn thiếu trên Flow hoặc Import thủ công.`;
        if (need.has((lead.sceneIndex ?? 0) + 1)) {
          await prisma.generation.update({ where: { id: generationId }, data: { status: "NEEDS_USER_ACTION", errorMessage: msg } });
        }
        await prisma.sequence.update({ where: { id: lead.sequenceId }, data: { status: "NEEDS_USER_ACTION", errorMessage: msg } }).catch(() => {});
        await prisma.generationEvent.create({ data: { generationId, type: "NEEDS_USER_ACTION", message: msg } }).catch(() => {});
        return { success: false, error: msg };
      }

      await reportProgress("COMPLETED", `Đã khôi phục đủ ${found.length} clip từ dự án Flow (0 credit).`);
      return { success: true };
    } catch (err: any) {
      console.error(`[FlowRecover] ${generationId}:`, err);
      await dumpDiagnostics(activePage, debugRoot, `${generationId}-recover`).catch(() => null);
      const msg = err.message || "Khôi phục clip thất bại.";
      await prisma.generation.update({ where: { id: generationId }, data: { status: "NEEDS_USER_ACTION", errorMessage: msg } }).catch(() => {});
      await prisma.generationEvent.create({ data: { generationId, type: "NEEDS_USER_ACTION", message: `Lỗi khôi phục: ${msg}` } }).catch(() => {});
      return { success: false, error: msg };
    } finally {
      await prisma.googleAccount.update({ where: { id: account.id }, data: { lockStatus: "AVAILABLE" } }).catch(() => {});
      if (context) await context.close().catch(() => {});
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }

  /**
   * Step 11 & 12: Execute Video Generation via Google Flow
   */
  public static async executeGeneration(
    generationId: string,
    onProgress?: GenerationProgressCallback,
    opts: { mode?: "RUN" | "DRYRUN" } = {}
  ): Promise<{ success: boolean; videoAssetId?: string; error?: string }> {
    // DRYRUN: let the Flow Agent plan the video, read its plan + price, then REJECT it. Nothing is rendered, 0 credits.
    const dryRun = opts.mode === "DRYRUN";
    const generation = await prisma.generation.findUnique({
      where: { id: generationId },
      include: { googleAccount: true, project: true, sequence: true },
    });

    if (!generation) {
      throw new Error(`Generation ${generationId} not found.`);
    }

    if (!generation.googleAccount) {
      throw new Error(`Generation ${generationId} has no assigned Google Account.`);
    }

    // --- IDEMPOTENCY & CRASH RECOVERY CHECK ---
    // If the job is already past SUBMITTING, it means a previous worker might have crashed
    // after spending Google Flow credits. We should NOT blindly retry and spend credits again.
    const unsafeStatuses = ["SUBMITTING", "GENERATING", "DOWNLOADING", "PROCESSING", "NEEDS_USER_ACTION"];
    if (unsafeStatuses.includes(generation.status)) {
      await prisma.generation.update({
        where: { id: generationId },
        data: { status: "NEEDS_USER_ACTION" },
      });
      await prisma.generationEvent.create({
        data: {
          generationId,
          type: "NEEDS_USER_ACTION",
          message: "Phát hiện crash trong quá trình sinh video trước đó. Đã dừng tác vụ để tránh trừ credits lần 2. Bạn hãy kiểm tra lại trên Google Flow.",
        },
      });
      throw new Error("Ngừng xử lý vì task đã được thực thi một phần trước khi bị gián đoạn (Idempotency Protection).");
    }

    const account = generation.googleAccount;
    // tenant isolation, last line of defence: never run one user's job with another user's Google session / credits
    if (!account.ownerId || account.ownerId !== generation.project.ownerId) {
      throw new Error("Tài khoản Google không thuộc chủ sở hữu của dự án này.");
    }

    // Concurrency / Account Lock check
    if (account.lockStatus === "IN_USE") {
      throw new Error(`Tài khoản ${account.name} đang bận xử lý job khác.`);
    }

    // Acquire lock
    await prisma.googleAccount.update({
      where: { id: account.id },
      data: { lockStatus: "IN_USE" },
    });

    const reportProgress = async (step: string, message: string) => {
      console.log(`[FlowAutomation] [${generationId}] [${step}] ${message}`);
      await prisma.generationEvent.create({
        data: {
          generationId,
          type: step,
          message,
        },
      });
      await prisma.generation.update({
        where: { id: generationId },
        data: { status: step as any },
      });
      if (onProgress) {
        await onProgress(step, message);
      }
    };

    // FLOW_AGENT: the lead scene (index 0) runs ONE Flow Agent batch that makes every clip of the sequence in one project
    const seq = generation.sequence;
    const isBatch = !!seq && seq.continuity === "FLOW_AGENT" && (generation.sceneIndex ?? 0) === 0;
    const batchScenes = isBatch
      ? await prisma.generation.findMany({
          where: { sequenceId: seq!.id },
          orderBy: { sceneIndex: "asc" },
          select: { id: true, sceneIndex: true, projectId: true, model: true, prompt: true },
        })
      : [];
    const expectedVideos = isBatch ? batchScenes.length : 1;

    let context: BrowserContext | null = null;
    let activePage: Page | undefined;
    // creditsCommitted: the prompt was accepted by Flow, so credits may be spent even if a later step fails.
    // flowRejected: Flow itself reported the generation as failed (policy etc.), so credits are normally not charged.
    let creditsCommitted = false;
    let flowRejected = false;
    const debugRoot = path.resolve(process.cwd(), "data", "flow-debug");
    const tempDir = path.resolve(process.cwd(), "tmp", "generations", generationId);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      await reportProgress("STARTING_BROWSER", "Khởi động persistent browser context cho tài khoản Google.");
      context = await this.launchContext(account.profileDir, this.isHeadless());
      const page = context.pages()[0] || (await context.newPage());
      activePage = page;

      await reportProgress("CHECKING_ACCOUNT", `Kiểm tra phiên đăng nhập của ${account.name}.`);
      await page.goto(this.getBaseFlowUrl(), {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });

      // Verify authenticated session
      const avatarSelector = await this.findFirstSelector(
        page,
        FlowSelectors.auth.userAvatar,
        10000
      );
      if (!avatarSelector || this.isSignedOutUrl(page.url())) {
        throw new Error("Phiên đăng nhập Google đã hết hạn. Vui lòng kết nối lại tài khoản.");
      }

      await reportProgress("OPENING_FLOW", "Đang tải giao diện tạo video Google Flow...");
      await page.waitForTimeout(3000);

      // --- DISMISS WELCOME SCREENS & POPUPS ---
      for (let i = 0; i < 3; i++) {
        const dismissed = await page
          .getByRole("button", { name: /^(start creating|got it|i agree|accept|continue|tiếp tục|đã hiểu|đồng ý)$/i })
          .first()
          .click({ timeout: 1500 })
          .then(() => true)
          .catch(() => false);
        if (!dismissed) break;
        await page.waitForTimeout(1500);
      }

      // Read credits
      const visibleCredits = await this.readVisibleCredits(page);
      if (visibleCredits !== null) {
        await prisma.googleAccount.update({
          where: { id: account.id },
          data: { lastKnownFlowCredits: visibleCredits, lastCreditCheckAt: new Date() },
        });
      }

      // --- CREDIT SAFETY CHECK: balance + per-video cap + daily budget (a dry run spends nothing) ---
      if (!dryRun) {
        await assertCanSpend(generation.flowCreditEstimate || 20, { googleAccountId: account.id, balance: visibleCredits });
      }

      // Scenes of one sequence share ONE Flow project (clips stay together, easy to join/extend in Flow).
      // A real project URL looks like https://flow.google.com/project/<uuid>; the dashboard URL must never be saved as a project.
      const PROJECT_URL_RE = /\/project\/[^/?#]+/i;
      const isProjectUrl = (u: string) => PROJECT_URL_RE.test(u) && !this.isSignedOutUrl(u);
      let reusedProject = false;
      let sharedProjectMissing = false;
      if (generation.sequenceId) {
        const siblings = await prisma.generation.findMany({
          where: { sequenceId: generation.sequenceId, flowProjectId: { not: null } },
          orderBy: { sceneIndex: "asc" },
          select: { flowProjectId: true },
        });
        const candidates = Array.from(
          new Set(
            siblings
              .map((s) => s.flowProjectId as string)
              .filter((u) => /^https:\/\/(labs\.google|flow\.google)(\.com)?\//.test(u) && PROJECT_URL_RE.test(u))
          )
        );
        for (const known of candidates) {
          await reportProgress("OPENING_FLOW", "Mở lại dự án Flow của video nhiều cảnh...");
          await page.goto(known, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
          await page.waitForTimeout(3000);
          reusedProject = isProjectUrl(page.url());
          await prisma.generationEvent.create({
            data: {
              generationId,
              type: "OPENING_FLOW",
              message: reusedProject
                ? `Dùng lại dự án Flow chung của video nhiều cảnh: ${page.url()}`
                : `Không mở lại được dự án Flow ${known} (đang ở ${page.url()}).`,
            },
          });
          if (reusedProject) break;
        }
        if (!reusedProject && (generation.sceneIndex ?? 0) > 0) sharedProjectMissing = true;
      }

      // --- BYPASS DASHBOARD (NEW PROJECT) ---
      await reportProgress("OPENING_FLOW", "Kiểm tra Dashboard Google Flow...");
      if (!reusedProject && !isProjectUrl(page.url())) {
        if (sharedProjectMissing) {
          await prisma.generationEvent.create({
            data: { generationId, type: "OPENING_FLOW", message: "Chưa có URL dự án Flow của các cảnh trước - tạo dự án mới (clip có thể nằm ở project khác)." },
          });
        }
        const newProject = page
          .getByRole("button", { name: /dự án mới|new project/i })
          .first();
        const fallback = page.getByText(/dự án mới|new project/i).last();
        const target = (await newProject.isVisible().catch(() => false)) ? newProject : fallback;
        if (await target.isVisible().catch(() => false)) {
          await reportProgress("OPENING_FLOW", "Đang mở Editor (Tạo dự án mới)...");
          await target.click({ timeout: 5000 });
          await page.waitForURL((url) => isProjectUrl(url.href), { timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(3000); // let the editor hydrate
        }
      }

      // Save the project URL ONLY when it is a real project URL (not the dashboard)
      if (isProjectUrl(page.url())) {
        await prisma.generation.update({ where: { id: generationId }, data: { flowProjectId: page.url() } }).catch(() => {});
        if (!reusedProject) {
          await prisma.generationEvent.create({ data: { generationId, type: "OPENING_FLOW", message: `Dự án Flow: ${page.url()}` } }).catch(() => {});
        }
      } else if (generation.sequenceId) {
        await prisma.generationEvent.create({
          data: { generationId, type: "OPENING_FLOW", message: `Không xác định được URL dự án Flow (đang ở ${page.url()}) - các cảnh sau sẽ không dùng chung project được.` },
        }).catch(() => {});
      }

      await reportProgress("SUBMITTING", "Đang điền prompt và tùy chọn Veo vào Google Flow...");

      // Fresh Agent chat: plans / approval cards of earlier scenes in this shared project must not interfere
      if (await startNewAgentSession(page)) {
        await prisma.generationEvent.create({ data: { generationId, type: "SUBMITTING", message: "Đã mở phiên Flow Agent mới." } }).catch(() => {});
      }

      // Locate the prompt composer (chat box "Bạn muốn tạo gì?"), never the project-title field
      const promptBox = await findPromptBox(page, 20000);
      if (!promptBox.found) {
        throw new Error("Không tìm thấy ô nhập prompt trên giao diện Google Flow hiện tại.");
      }

      // Continuity images (Ingredients / last frame of the previous scene). Resolved BEFORE any credit is spent;
      // any failure here aborts the job so the user can switch mode instead of paying for a clip that lost its anchor.
      const attachments = await resolveSceneAttachments(generationId, tempDir);
      if (attachments.files.length > 0) {
        await prisma.generationEvent.create({ data: { generationId, type: "SUBMITTING", message: attachments.note } });
        await attachFiles(page, attachments.files);
        // attaching may re-render the composer: locate it again
        const again = await findPromptBox(page, 10000);
        if (!again.found) throw new Error("Không tìm thấy ô nhập prompt sau khi đính kèm ảnh.");
      }

      const promptText = isBatch
        ? buildAgentBatchPrompt({
            brief: seq!.brief,
            style: seq!.styleBible,
            totalDuration: seq!.totalDuration,
            clipSeconds: seq!.clipSeconds,
            count: expectedVideos,
            aspectRatio: seq!.aspectRatio,
            hasReferenceImages: attachments.files.length > 0,
          })
        : generation.prompt;
      if (isBatch) {
        await prisma.generationEvent.create({
          data: { generationId, type: "SUBMITTING", message: `Flow Agent sẽ tự chia cảnh: yêu cầu ${expectedVideos} clip × ${seq!.clipSeconds}s trong cùng một project.` },
        });
      }

      await typePrompt(page, promptText);

      // Best-effort Veo options (aspect ratio / model); never fatal
      const optionNotes = await applyOptions(page, {
        aspectRatio: generation.aspectRatio,
        model: generation.model,
      });
      for (const note of optionNotes) {
        await prisma.generationEvent.create({ data: { generationId, type: "SUBMITTING", message: note } });
      }
      // Options popup may have taken focus / re-rendered: make sure prompt is still there
      await findPromptBox(page, 5000);
      await typePrompt(page, promptText);

      // Remember videos that already exist so we only accept the NEW result
      const baselineVideos = new Set(await listVideoSources(page));
      const baselineTiles = new Set(await listVideoTileIds(page));
      const baselineErrors = await countErrorTiles(page);
      let newTileId: string | null = null;
      let batchTileIds: string[] = [];
      // batch: when every requested clip is either finished or failed, wait this long for the Agent to offer a re-generation
      let settledSince = 0;
      const retryGraceMs = 120000;

      let approvalBaseline = await countApprovalCards(page);
      const submitted = await submitPrompt(page, promptText);
      creditsCommitted = !dryRun; // submitting to the Agent is free: credits are only spent when a plan is approved
      console.log(`[FlowAutomation] [${generationId}] Prompt submitted via ${submitted.method}`);
      await reportProgress("GENERATING", "Google Flow đang xử lý và sinh video bằng Veo (sử dụng credit thật của account)...");

      // Wait for generation completion
      let videoElementFound = false;
      let videoSrc: string | null = null;
      let approved = false;
      let approvals = 0;
      const genStartTime = Date.now();
      // Idle detection: if the page stops changing for a while with no approval card / new tile, the Agent probably asked a question
      let lastPageSig = "";
      let lastChangeAt = Date.now();
      let nudges = 0;
      const maxNudges = parseInt(process.env.FLOW_AGENT_MAX_NUDGES || "", 10) >= 0 ? parseInt(process.env.FLOW_AGENT_MAX_NUDGES!, 10) : 2;
      const idleMs = (parseInt(process.env.FLOW_AGENT_IDLE_SEC || "", 10) || 50) * 1000;
      // Veo Quality can take several minutes: default 8 min, override with FLOW_GENERATION_TIMEOUT_SEC
      const maxGenWait = dryRun ? 240000 : ((parseInt(process.env.FLOW_GENERATION_TIMEOUT_SEC || "", 10) || 480) + (isBatch ? 180 * expectedVideos : 0)) * 1000;
      let spentInRun = 0;

      while (Date.now() - genStartTime < maxGenWait) {
        // Flow Agent asks "Bạn có muốn tôi bắt đầu tạo N video này với chi phí là X tín dụng không?" (Phê duyệt / Luôn phê duyệt / Từ chối).
        // Approve ONLY a plan of exactly 1 video whose price is within budget; otherwise reject (no credits spent) and fail.
        if ((process.env.FLOW_AUTO_APPROVE !== "false" || dryRun) && approvals < 3) {
          const req = await readApprovalRequest(page, approvalBaseline);
          if (req.found && dryRun) {
            await answerApproval(page, false); // reject: nothing is charged
            const planOk = req.videos === expectedVideos;
            const summary = `Kiểm tra thử ${planOk ? "OK" : "KHÔNG khớp"}: Flow Agent đề xuất ${req.videos ?? "?"} video / ${req.credits ?? "?"} tín dụng (cần ${expectedVideos} video). Đã từ chối, không tốn credit.`;
            await prisma.generation.update({ where: { id: generationId }, data: { status: "DRAFT", errorMessage: null } });
            await prisma.generationEvent.create({ data: { generationId, type: "DRYRUN", message: summary } }).catch(() => {});
            if (seq) await prisma.sequence.update({ where: { id: seq.id }, data: { errorMessage: `ℹ️ ${summary}` } }).catch(() => {});
            return { success: true };
          }
          if (req.found) {
            const isRetry = approvals > 0;
            // 1st card = the plan (must be exactly N videos). Later cards = the Agent offering to RE-CREATE clips that Flow reported as failed
            // ("Không thành công"): accept only if it asks for no more videos than are still missing.
            const doneNow = isBatch ? (await listVideoTileIds(page)).filter((id) => !baselineTiles.has(id)).length : 0;
            const remaining = isBatch ? Math.max(0, expectedVideos - doneNow) : expectedVideos;
            const cap = isBatch ? Math.max(isRetry ? 0 : generation.flowCreditEstimate || 0, 25 * (isRetry ? remaining : expectedVideos)) : Math.max(generation.flowCreditEstimate || 0, 30);
            const available = visibleCredits ?? Infinity;
            const countOk = isRetry ? req.videos !== null && req.videos >= 1 && req.videos <= remaining : req.videos === expectedVideos;
            let okPlan = countOk && req.credits !== null && req.credits <= cap && req.credits <= available;
            let limitMsg = "";
            if (okPlan) {
              try {
                await assertCanSpend(req.credits as number, { googleAccountId: account.id, alreadySpentInRun: spentInRun, balance: visibleCredits });
              } catch (e: any) {
                okPlan = false;
                limitMsg = ` ${e.message}`;
              }
            }
            await prisma.generationEvent.create({
              data: { generationId, type: "GENERATING", message: `Flow Agent xin duyệt${isRetry ? " lần " + (approvals + 1) + " (tạo lại clip lỗi)" : ""}: "${req.text}" → ${okPlan ? "tự động Phê duyệt" : `TỪ CHỐI (cần ${isRetry ? "≤ " + remaining : expectedVideos} video, tối đa ${cap} tín dụng)`}.` },
            }).catch(() => {});
            if (okPlan) {
              const clicked = await answerApproval(page, true);
              if (clicked) {
                approved = true;
                approvals++;
                spentInRun += req.credits || 0;
                await recordCreditsSpent(generationId, req.credits || 0).catch(() => {});
                approvalBaseline = req.count; // the next card (if any) is a NEW one
                await reportProgress("GENERATING", `Đã bấm Phê duyệt${isRetry ? " (tạo lại clip lỗi)" : ""} (${req.credits} tín dụng).`);
              }
              await page.waitForTimeout(2000);
            } else {
              await answerApproval(page, false);
              flowRejected = !isRetry; // a rejected retry means the first plan was already paid
              throw new Error(`Flow Agent đề xuất kế hoạch không như mong đợi và đã bị từ chối để tránh mất credit: "${req.text}" (cần ${isRetry ? "tối đa " + remaining : "đúng " + expectedVideos} video, tối đa ${cap} tín dụng).${limitMsg}`);
            }
          }
        }

        // Agent asked a clarifying question / went quiet before the plan: answer once or twice, then give up (nothing is charged before approval)
        if (!approved && nudges < maxNudges) {
          const sig = await page.evaluate<string>(`(() => { const t = document.body.innerText || ''; return t.length + ':' + (t.match(/\\d+%/g) || []).join(','); })()`).catch(() => "");
          if (sig !== lastPageSig) {
            lastPageSig = sig;
            lastChangeAt = Date.now();
          } else if (Date.now() - lastChangeAt > idleMs && (await countApprovalCards(page)) <= approvalBaseline) {
            nudges++;
            const nudge = buildAgentNudge(expectedVideos);
            await prisma.generationEvent.create({
              data: { generationId, type: "GENERATING", message: `Flow Agent dừng lại mà chưa đề xuất kế hoạch (có thể đang hỏi lại ý tưởng): tự động trả lời "tự quyết định và tiến hành" (lần ${nudges}/${maxNudges}).` },
            }).catch(() => {});
            try {
              const box = await findPromptBox(page, 8000);
              if (box.found) {
                await typePrompt(page, nudge);
                await submitPrompt(page, nudge);
              }
            } catch (e: any) {
              console.warn(`[FlowAutomation] [${generationId}] nudge failed: ${e?.message}`);
            }
            lastChangeAt = Date.now();
            lastPageSig = "";
          }
        }

        // New Flow UI: the finished clip is a new video tile in the grid (video is drawn on a canvas, no <video> element)
        const freshTiles = (await listVideoTileIds(page)).filter((id) => !baselineTiles.has(id));
        if (isBatch) {
          if (freshTiles.length >= expectedVideos) {
            batchTileIds = freshTiles;
            videoElementFound = true;
            break;
          }
          // Some clips failed ("Không thành công"): the Agent usually offers to re-create them (handled above as a retry approval).
          // If it does not within the grace period, stop waiting and collect what exists instead of sitting until the timeout.
          const failedNow = Math.max(0, (await countErrorTiles(page)) - baselineErrors);
          if (approved && freshTiles.length > 0 && freshTiles.length + failedNow >= expectedVideos) {
            if (!settledSince) {
              settledSince = Date.now();
              await prisma.generationEvent.create({
                data: { generationId, type: "GENERATING", message: `Flow xong ${freshTiles.length}/${expectedVideos} clip, ${failedNow} clip báo "Không thành công"; chờ Agent đề nghị tạo lại.` },
              }).catch(() => {});
            } else if (Date.now() - settledSince > retryGraceMs) {
              batchTileIds = freshTiles;
              videoElementFound = true;
              break;
            }
          } else {
            settledSince = 0;
          }
          // batch mode ends only on finished tiles: the single-clip signals below (video source / download button) are not reliable here
          await page.waitForTimeout(4000);
          continue;
        } else if (freshTiles[0]) {
          newTileId = freshTiles[0];
          videoElementFound = true;
          break;
        }

        // A NEW video (not present before submit) means the render finished
        const current = await listVideoSources(page);
        const fresh = current.find((src) => src.length > 5 && !baselineVideos.has(src));
        if (fresh) {
          videoSrc = fresh;
          videoElementFound = true;
          break;
        }

        // Download button only counts when the project had no video before submitting
        if (baselineVideos.size === 0) {
          const downloadButton = await page.$(FlowSelectors.generationStatus.downloadButtons.join(", "));
          if (downloadButton && (await downloadButton.isVisible().catch(() => false))) {
            videoElementFound = true;
            break;
          }
        }

        // Check for error alert (ignore empty toasts)
        const errorAlert = await page.$(FlowSelectors.generationStatus.errorMessage.join(", "));
        if (errorAlert) {
          const errorText = ((await errorAlert.innerText().catch(() => "")) || "").trim();
          if (errorText && !/hãy thử lại|try again/i.test(errorText) && /fail|error|lỗi|thất bại|violation|vi phạm|unable|không thể/i.test(errorText)) {
            flowRejected = true;
            throw new Error(`Google Flow sinh video thất bại: ${errorText.slice(0, 300)}`);
          }
        }

        await page.waitForTimeout(4000);
      }

      if (!videoElementFound && isBatch && approved) {
        // timed out with only part of the clips: still collect what Flow finished (credits were already spent on them)
        batchTileIds = (await listVideoTileIds(page)).filter((id) => !baselineTiles.has(id));
        videoElementFound = batchTileIds.length > 0;
      }
      if (!videoElementFound) {
        throw new Error("Hết thời gian chờ Google Flow sinh video hoặc Flow yêu cầu thao tác người dùng.");
      }

      await reportProgress("DOWNLOADING", "Video đã sinh xong. Đang tải tệp MP4 về hệ thống...");

      const downloadedMp4Path = path.join(tempDir, `veo_${Date.now()}.mp4`);

      // Try downloading via browser download trigger or direct authenticated stream
      let downloaded = false;
      if (isBatch) {
        // Which clip is which scene is read from Flow itself: each clip's editor shows its "Scene k" prompt (the Agent's chat
        // labels proved unreliable). Every clip of the batch lives in this ONE project.
        const projectUrl = page.url();
        await prisma.generationEvent.create({
          data: { generationId, type: "GENERATING", message: `Flow Agent đã tạo ${batchTileIds.length}/${expectedVideos} clip trong cùng project; đang tải về và xác định cảnh.` },
        }).catch(() => {});
        const { clips, missing } = await this.collectClipsFromProject(
          page,
          projectUrl,
          batchScenes.map((b) => (b.sceneIndex ?? 0) + 1),
          tempDir,
          (m) => reportProgress("DOWNLOADING", m)
        );
        // save every clip we have (also when some are missing: a later RECOVER then only needs the missing ones)
        for (const b of batchScenes) {
          const clip = clips.get((b.sceneIndex ?? 0) + 1);
          if (!clip) continue;
          await prisma.generation.update({ where: { id: b.id }, data: { prompt: clip.prompt || b.prompt, flowProjectId: projectUrl } });
          if (b.id === generationId) {
            fs.renameSync(clip.file, downloadedMp4Path);
            downloaded = true;
            continue;
          }
          await this.saveClipAsset(b, clip.file);
          await prisma.generation.update({ where: { id: b.id }, data: { status: "COMPLETED", completedAt: new Date(), errorMessage: null } });
          await prisma.generationEvent.create({ data: { generationId: b.id, type: "COMPLETED", message: "Clip do Flow Agent tạo trong batch và đã được lưu." } }).catch(() => {});
        }
        if (missing.length > 0) {
          if (downloaded) await this.saveClipAsset(generation, downloadedMp4Path).catch(() => {});
          throw new Error(
            `Thiếu clip cảnh ${missing.join(", ")} (Flow chỉ tạo xong ${clips.size}/${expectedVideos} clip; các clip khác đã được lưu). Mở project Flow ${projectUrl} để tạo lại cảnh thiếu, rồi bấm "Khôi phục clip từ Flow" (0 credit).`
          );
        }
      }
      if (!isBatch && newTileId) {
        downloaded = await downloadTileVideo(page, newTileId, downloadedMp4Path);
        await prisma.generationEvent.create({
          data: { generationId, type: "DOWNLOADING", message: downloaded ? "Đã tải bản 720p gốc từ Flow." : "Tải từ ô video thất bại - thử cách dự phòng." },
        }).catch(() => {});
      }
      const downloadButtonSelector = downloaded
        ? null
        : await this.findFirstSelector(page, FlowSelectors.generationStatus.downloadButtons, 4000);

      if (!downloaded && downloadButtonSelector) {
        try {
          const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 15000 }),
            page.click(downloadButtonSelector),
          ]);
          await download.saveAs(downloadedMp4Path);
          downloaded = true;
        } catch (e) {
          console.warn("[FlowAutomation] Download event fallback:", e);
        }
      }

      // Fallback: fetch the <video> source directly. http(s) goes through the browser context (shares cookies,
      // no huge CDP payload); blob: URLs are read inside the page and returned as one base64 string.
      if (!downloaded && videoSrc) {
        try {
          if (/^https?:/i.test(videoSrc)) {
            const resp = await context.request.get(videoSrc, { timeout: 120000 });
            if (resp.ok()) {
              fs.writeFileSync(downloadedMp4Path, await resp.body());
              downloaded = true;
            }
          }
          if (!downloaded) {
            const b64 = await page.evaluate<string>(
              `(async () => { const r = await fetch(${JSON.stringify(videoSrc)}); const b = await r.blob();
                 return await new Promise((res, rej) => { const fr = new FileReader();
                   fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b); }); })()`
            );
            if (b64 && b64.length > 0) {
              fs.writeFileSync(downloadedMp4Path, Buffer.from(b64, "base64"));
              downloaded = true;
            }
          }
        } catch (e) {
          console.warn("[FlowAutomation] Direct source download failed:", e);
        }
      }

      if (downloaded && fs.existsSync(downloadedMp4Path) && fs.statSync(downloadedMp4Path).size < 50 * 1024) {
        downloaded = false; // an error page or empty stream, not a video
      }

      if (!downloaded || !fs.existsSync(downloadedMp4Path)) {
        throw new Error("Không thể tải file video từ Google Flow về máy cục bộ.");
      }

      await reportProgress("PROCESSING", "Xác thực tệp, đọc thông số FFprobe và tạo VideoAsset.");

      const processedAsset = await this.saveClipAsset(generation, downloadedMp4Path);

      // Link VideoAsset to Generation
      await prisma.generation.update({
        where: { id: generationId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      await reportProgress("COMPLETED", "Video đã hoàn tất và được lưu vào Thư Viện Video!");

      // Update remaining credits if read
      const finalCredits = await this.readVisibleCredits(page);
      if (finalCredits !== null) {
        await prisma.googleAccount.update({
          where: { id: account.id },
          data: { lastKnownFlowCredits: finalCredits, lastCreditCheckAt: new Date() },
        });
      }

      return {
        success: true,
        videoAssetId: processedAsset.id,
      };
    } catch (err: any) {
      console.error(`[FlowAutomation] Error executing generation ${generationId}:`, err);

      // Persist screenshot + HTML + element inventory OUTSIDE tmp (tmp is wiped in finally)
      const debugDir = await dumpDiagnostics(activePage, debugRoot, generationId);
      if (debugDir) {
        console.error(`[FlowAutomation] Diagnostics saved to ${debugDir}`);
        await prisma.generationEvent
          .create({ data: { generationId, type: "DIAGNOSTICS", message: `Đã lưu ảnh chụp + DOM để debug tại: ${debugDir}` } })
          .catch(() => {});
      }

      // After the prompt was accepted, credits may be spent and the clip may exist in Flow: do NOT mark it as a plain
      // FAILED (which invites a blind retry = double charge). Ask the user to check Flow / import manually instead.
      const needsUser = creditsCommitted && !flowRejected;
      const baseMessage = err.message || "Quá trình tự động sinh video thất bại.";
      const finalMessage = needsUser
        ? `${baseMessage} Prompt đã được gửi nên credits có thể đã bị trừ: hãy mở Google Flow (dự án mới nhất), tải video về và dùng Import thủ công thay vì chạy lại.`
        : baseMessage;

      await prisma.generation.update({
        where: { id: generationId },
        data: {
          status: needsUser ? "NEEDS_USER_ACTION" : "FAILED",
          errorMessage: finalMessage,
        },
      });

      await prisma.generationEvent.create({
        data: {
          generationId,
          type: needsUser ? "NEEDS_USER_ACTION" : "FAILED",
          message: `Lỗi: ${finalMessage}`,
        },
      });

      return {
        success: false,
        error: finalMessage,
      };
    } finally {
      // Release Account Lock
      await prisma.googleAccount.update({
        where: { id: account.id },
        data: { lockStatus: "AVAILABLE" },
      }).catch(() => {});

      if (context) {
        await context.close().catch(() => {});
      }

      // Cleanup temp directory
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch {}
    }
  }
}
