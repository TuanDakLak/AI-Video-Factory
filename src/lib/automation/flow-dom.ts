/**
 * DOM helpers for Google Flow's Editor.
 *
 * Google Flow's UI changes often and uses generated class names, so instead of
 * a fixed list of CSS selectors we locate elements by *role + position*:
 *
 *  - Prompt box  = the visible editable element that looks like the chat
 *                  composer ("Bạn muốn tạo gì?"), NOT the project-title field
 *                  in the top bar (that was the cause of the old failure:
 *                  the prompt was typed into the title and no Send button
 *                  ever became enabled).
 *  - Send button = the right-most button inside the composer container
 *                  (the arrow icon).
 *
 * The page scripts are plain strings on purpose: tsx/esbuild may inject
 * helpers (e.g. __name) into function bodies which do not exist in the page.
 */
import fs from "fs";
import path from "path";
import type { Page } from "playwright";

export const PROMPT_MARK = "data-flow-prompt";
export const SUBMIT_MARK = "data-flow-submit";

export const promptLocator = (page: Page) => page.locator(`[${PROMPT_MARK}="1"]`).first();
export const submitLocator = (page: Page) => page.locator(`[${SUBMIT_MARK}="1"]`).first();

const FIND_PROMPT_SCRIPT = `(() => {
  const MARK = '${PROMPT_MARK}';
  document.querySelectorAll('[' + MARK + ']').forEach(e => e.removeAttribute(MARK));
  const vh = window.innerHeight, vw = window.innerWidth;
  const hint = /tạo gì|muốn tạo|what do you want|what would you like|what do you|describe|prompt|mô tả|nhập|create/i;
  const bad  = /title|tiêu đề|tên dự án|project name|search|tìm kiếm|rename|đổi tên/i;
  const sel = 'textarea, input[type="text"], input:not([type]), [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
  let best = null, bestScore = -1e9;
  const report = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 12) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none') continue;
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
    if (el.disabled || el.readOnly) continue;
    const attrs = ['placeholder','aria-label','data-placeholder','aria-placeholder','title','name','id']
      .map(a => el.getAttribute(a)).filter(Boolean).join(' ');
    let ctx = attrs, p = el;
    for (let i = 0; i < 4 && p.parentElement; i++) {
      p = p.parentElement;
      const t = p.innerText || '';
      if (t.length < 200) ctx += ' ' + t;
    }
    let score = 0;
    if (hint.test(attrs)) score += 100; else if (hint.test(ctx)) score += 60;
    score += (r.top / vh) * 40;
    if (r.top < 90) score -= 120;
    if (bad.test(attrs)) score -= 200;
    if (el.closest('header, nav, [role="search"], [role="banner"]')) score -= 150;
    report.push({ tag: el.tagName, attrs: attrs.slice(0, 80), top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), score: Math.round(score) });
    if (score > bestScore) { bestScore = score; best = el; }
  }
  if (best) best.setAttribute(MARK, '1');
  return { found: !!best, score: bestScore, report };
})()`;

const FIND_SUBMIT_SCRIPT = `(() => {
  const MARK = '${SUBMIT_MARK}', PMARK = '${PROMPT_MARK}';
  document.querySelectorAll('[' + MARK + ']').forEach(e => e.removeAttribute(MARK));
  const input = document.querySelector('[' + PMARK + '="1"]');
  if (!input) return { found: false, reason: 'no-prompt' };
  const vh = window.innerHeight, vw = window.innerWidth;
  const ir = input.getBoundingClientRect();
  const isVisible = (el) => {
    const r = el.getBoundingClientRect(), st = getComputedStyle(el);
    return r.width > 8 && r.height > 8 && st.visibility !== 'hidden' && st.display !== 'none';
  };
  const btnSel = 'button, [role="button"]';
  // climb until we reach a container holding the composer's buttons
  let box = input, btns = [];
  for (let i = 0; i < 8 && box.parentElement; i++) {
    box = box.parentElement;
    btns = Array.from(box.querySelectorAll(btnSel)).filter(isVisible);
    if (btns.length >= 2 && box.getBoundingClientRect().height < vh * 0.6) break;
  }
  const send = /send|gửi|generate|tạo|create|submit|arrow_forward|arrow_upward|run/i;
  const notSend = /add|thêm|attach|đính kèm|upload|tải lên|settings|cài đặt|tune|tùy chỉnh|option|mic|ghi âm|template|mẫu|close|đóng|clear|xóa/i;
  let best = null, bestScore = -1e9;
  const report = [];
  for (const b of btns) {
    const r = b.getBoundingClientRect();
    const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.innerText || '')).trim();
    let score = 0;
    if (send.test(label)) score += 100;
    if (notSend.test(label) && !send.test(label)) score -= 100;
    score += (r.left / vw) * 50;
    if (r.top >= ir.top - 15) score += 20;
    if (r.top < ir.top - 120) score -= 80;
    const disabled = !!b.disabled || b.getAttribute('aria-disabled') === 'true';
    report.push({ label: label.slice(0, 40), left: Math.round(r.left), top: Math.round(r.top), disabled, score: Math.round(score) });
    if (score > bestScore) { bestScore = score; best = b; }
  }
  if (!best) return { found: false, reason: 'no-buttons', report };
  best.setAttribute(MARK, '1');
  const disabled = !!best.disabled || best.getAttribute('aria-disabled') === 'true';
  return { found: true, disabled, score: bestScore, report };
})()`;

const READ_PROMPT_SCRIPT = `(() => {
  const el = document.querySelector('[${PROMPT_MARK}="1"]');
  if (!el) return null;
  return (el.value !== undefined ? el.value : el.innerText) || '';
})()`;

const DUMP_SCRIPT = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const info = (el) => { const r = el.getBoundingClientRect(); return {
    tag: el.tagName, role: el.getAttribute('role'), aria: el.getAttribute('aria-label'),
    placeholder: el.getAttribute('placeholder') || el.getAttribute('data-placeholder'),
    text: (el.innerText || '').trim().slice(0, 60), disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
    cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 80),
    x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  return {
    url: location.href,
    viewport: [innerWidth, innerHeight],
    editable: Array.from(document.querySelectorAll('textarea, input, [contenteditable], [role="textbox"]')).filter(vis).map(info),
    buttons: Array.from(document.querySelectorAll('button, [role="button"]')).filter(vis).map(info),
  };
})()`;

const COUNT_MEDIA_SCRIPT = `(() => {
  let n = 0;
  document.querySelectorAll('img, canvas, video').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 8 && r.height > 8) n++;
  });
  return n;
})()`;

const FIND_ADD_BUTTON_SCRIPT = `(() => {
  const MARK = 'data-flow-add';
  document.querySelectorAll('[' + MARK + ']').forEach(e => e.removeAttribute(MARK));
  const input = document.querySelector('[${PROMPT_MARK}="1"]');
  if (!input) return { found: false };
  const vh = window.innerHeight;
  const ir = input.getBoundingClientRect();
  let box = input, btns = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 8 && r.height > 8; };
  for (let i = 0; i < 8 && box.parentElement; i++) {
    box = box.parentElement;
    btns = Array.from(box.querySelectorAll('button, [role="button"]')).filter(vis);
    if (btns.length >= 2 && box.getBoundingClientRect().height < vh * 0.6) break;
  }
  const add = /add|thêm|attach|đính kèm|upload|tải lên|\\+|add_circle|image|ảnh|media/i;
  const notAdd = /send|gửi|generate|tune|settings|cài đặt|mic|close|đóng/i;
  let best = null, bestScore = -1e9;
  for (const b of btns) {
    const r = b.getBoundingClientRect();
    const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.innerText || '')).trim();
    let score = 0;
    if (add.test(label)) score += 100;
    if (notAdd.test(label) && !add.test(label)) score -= 100;
    score -= (r.left / window.innerWidth) * 40;   // the "+" is left-most in the composer
    if (r.top >= ir.top - 15) score += 20;
    if (score > bestScore) { bestScore = score; best = b; }
  }
  if (!best) return { found: false };
  best.setAttribute(MARK, '1');
  return { found: true, score: bestScore };
})()`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Find the prompt composer and tag it with data-flow-prompt. Retries while the editor loads. */
export async function findPromptBox(page: Page, timeoutMs = 20000): Promise<{ found: boolean; report?: any[] }> {
  const start = Date.now();
  let last: any = { found: false };
  while (Date.now() - start < timeoutMs) {
    last = await page.evaluate(FIND_PROMPT_SCRIPT).catch(() => ({ found: false }));
    // score must beat the "title field in the top bar" case
    if (last.found && last.score > -20) return last;
    await sleep(1000);
  }
  return { found: false, report: last.report };
}

/** Type the prompt and verify the box really contains it (fill -> insertText -> typing fallbacks). */
export async function typePrompt(page: Page, text: string): Promise<void> {
  const box = promptLocator(page);
  await closeOverlays(page);
  await box.click({ timeout: 8000 });
  const expected = norm(text).slice(0, 40);
  const has = async () => norm((await page.evaluate<string | null>(READ_PROMPT_SCRIPT).catch(() => "")) || "").includes(expected);
  const clear = async () => {
    await page.keyboard.press("Control+A").catch(() => {});
    await page.keyboard.press("Backspace").catch(() => {});
  };

  if (await has()) return; // already typed (e.g. second call after options popup)
  try { await box.fill(text, { timeout: 5000 }); } catch {}
  if (await has()) return;

  await box.click();
  await clear();
  await page.keyboard.insertText(text);
  if (await has()) return;

  await box.click();
  await clear();
  await page.keyboard.type(text, { delay: 8 });
  if (!(await has())) {
    throw new Error("Đã tìm thấy ô prompt nhưng không nhập được nội dung vào đó.");
  }
}

/**
 * Locate the Send/Generate button for the composer, wait until it is enabled
 * and click it. Falls back to pressing Enter. Resolves true when the page
 * accepted the prompt (composer cleared).
 */
export async function submitPrompt(page: Page, prompt: string): Promise<{ method: string }> {
  const expected = norm(prompt).slice(0, 40);
  const accepted = async () => {
    const cur = norm((await page.evaluate<string | null>(READ_PROMPT_SCRIPT).catch(() => "")) || "");
    return !cur.includes(expected);
  };

  // 1. Click the detected send button once it becomes enabled (up to ~10s).
  const start = Date.now();
  let info: any = { found: false };
  while (Date.now() - start < 10000) {
    info = await page.evaluate(FIND_SUBMIT_SCRIPT).catch(() => ({ found: false }));
    if (info.found && !info.disabled) break;
    await sleep(500);
  }
  if (info.found && !info.disabled) {
    await submitLocator(page).click({ timeout: 5000 }).catch(() => {});
    for (let i = 0; i < 10; i++) {
      if (await accepted()) return { method: "button" };
      await sleep(500);
    }
  }

  // 2. Fallback: Enter key in the composer.
  await promptLocator(page).click().catch(() => {});
  await page.keyboard.press("Enter");
  for (let i = 0; i < 10; i++) {
    if (await accepted()) return { method: "enter" };
    await sleep(500);
  }

  throw new Error(
    info.found
      ? "Không gửi được prompt: nút Generate/Send vẫn bị vô hiệu hoặc không phản hồi."
      : "Không tìm thấy nút Generate/Send cạnh ô prompt trên giao diện Google Flow."
  );
}

// ---- Finished videos (real DOM, Oct 2026) ------------------------------------------------------------
// Flow renders videos on a <canvas> (no <video> element). A finished clip is a <flow-video-tile> in the project grid whose
// thumbnail <img alt="Hình thu nhỏ của video đã tạo"> points to flow-content.google/image/<mediaId>. Clicking it opens
// /project/<id>/edit/<clipId> with a download button ("Tải nội dung nghe nhìn xuống") -> menu: 270p GIF / 720p original / 1080p / 4K upscaled.
// Tile id = last path segment of the thumbnail URL (flow-content.google/image/<uuid> for fresh tiles, flow.google.com/asb/<token> for old ones).
const TILE_ID_JS = `(src) => { try { const u = new URL(src); return u.pathname.split('/').filter(Boolean).pop() || ''; } catch (e) { return ''; } }`;
const LIST_TILES_SCRIPT = `(() => {
  const idOf = ${TILE_ID_JS};
  const ids = new Set();
  document.querySelectorAll('flow-video-tile img').forEach((i) => {
    const id = idOf(i.currentSrc || i.src || '');
    if (id) ids.add(id);
  });
  return Array.from(ids);
})()`;

/** Clips Flow reported as failed ("Không thành công / Rất tiếc, không tạo được video này"): <flow-error-tile> in the grid. */
export async function countErrorTiles(page: Page): Promise<number> {
  return page.evaluate<number>(`document.querySelectorAll('flow-error-tile').length`).catch(() => 0);
}

export async function listVideoTileIds(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(LIST_TILES_SCRIPT).catch(() => []);
}

/** Ids of all finished tiles in DOM order, NOT de-duplicated (index = position among tiles that have a thumbnail). */
export async function listVideoTilePositions(page: Page): Promise<string[]> {
  return page
    .evaluate<string[]>(`(() => {
      const idOf = ${TILE_ID_JS};
      const out = [];
      document.querySelectorAll('flow-video-tile').forEach((t) => {
        const i = t.querySelector('img');
        if (i) out.push(idOf(i.currentSrc || i.src || ''));
      });
      return out;
    })()`)
    .catch(() => []);
}

/**
 * Installed on every page (context.addInitScript). Flow saves a clip by creating a blob: URL and clicking an <a download>.
 * Letting Chromium handle that download crashes the bundled Playwright Chromium (exit 0xC0000005, observed Oct 2026), so while
 * window.__flowCaptureDl is true the click is swallowed and the blob is kept so it can be read from the page instead.
 */
export const DOWNLOAD_HOOK_SCRIPT = `(() => {
  if (window.__flowDlHook) return;
  window.__flowDlHook = true;
  const blobs = new Map();
  window.__flowBlobs = blobs;
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (obj) => { const u = orig(obj); try { if (obj instanceof Blob) { blobs.set(u, obj); if (blobs.size > 20) blobs.delete(blobs.keys().next().value); } } catch (e) {} return u; };
  const grab = (a) => {
    if (!window.__flowCaptureDl || !a || !a.hasAttribute || !a.hasAttribute('download') || !/^blob:/.test(a.href || '')) return false;
    window.__flowLastDl = { href: a.href, name: a.getAttribute('download') || '' };
    return true;
  };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (grab(this)) return; return click.call(this); };
  window.addEventListener('click', (e) => { const a = e.target && e.target.closest ? e.target.closest('a[download]') : null; if (grab(a)) { e.preventDefault(); e.stopPropagation(); } }, true);
})()`;

/** Read a captured blob from the page in base64 chunks (keeps each CDP message small) and write it to `savePath`. */
async function saveCapturedBlob(page: Page, href: string, savePath: string): Promise<boolean> {
  const size = await page.evaluate<number>(`(window.__flowBlobs && window.__flowBlobs.get(${JSON.stringify(href)}) || { size: -1 }).size`);
  if (!(size > 0)) return false;
  const CHUNK = 4 * 1024 * 1024;
  const fd = fs.openSync(savePath, "w");
  try {
    for (let off = 0; off < size; off += CHUNK) {
      const b64 = await page.evaluate<string>(`(async () => {
        const b = window.__flowBlobs.get(${JSON.stringify(href)}).slice(${off}, ${off + CHUNK});
        const buf = new Uint8Array(await b.arrayBuffer());
        let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        return btoa(s);
      })()`);
      fs.writeSync(fd, Buffer.from(b64, "base64"));
    }
  } finally {
    fs.closeSync(fd);
  }
  return fs.statSync(savePath).size === size;
}

/** On /project/<id>/edit/<clip>: download the ORIGINAL 720p file via the download menu. */
export async function downloadFromEditor(page: Page, savePath: string): Promise<boolean> {
  try {
    const dl = page.locator('button:text-is("download"), button[aria-label="Tải nội dung nghe nhìn xuống"], button[aria-label="Download"], button[aria-label="Download media"]').first();
    await dl.waitFor({ state: "visible", timeout: 15000 });
    await dl.click({ timeout: 4000 });
    const item = page.getByRole("menuitem", { name: /720p|kích thước gốc|original size/i }).first();
    await item.waitFor({ state: "visible", timeout: 8000 });

    const hooked = await page.evaluate<boolean>(`!!window.__flowDlHook`).catch(() => false);
    if (hooked) {
      await page.evaluate(`window.__flowLastDl = null; window.__flowCaptureDl = true;`);
      try {
        await item.click({ timeout: 4000 });
        let href = "";
        for (let i = 0; i < 240 && !href; i++) {
          href = await page.evaluate<string>(`(window.__flowLastDl && window.__flowLastDl.href) || ''`);
          if (!href) await sleep(500);
        }
        if (!href) throw new Error("Flow không tạo file tải về sau 120s.");
        return await saveCapturedBlob(page, href, savePath);
      } finally {
        await page.evaluate(`window.__flowCaptureDl = false;`).catch(() => {});
      }
    }

    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), item.click({ timeout: 4000 })]);
    await download.saveAs(savePath);
    return true;
  } catch (e: any) {
    console.warn("[flow-dom] downloadFromEditor failed:", e?.message || e);
    return false;
  }
}

/**
 * Open the n-th finished tile (grid order) and return the editor page's prompt text. The editor (/project/<id>/edit/<clip>) shows the
 * prompt the clip was made from, e.g. "Scene 3: Vertical 9:16 ...", which is the most reliable way to know WHICH scene a clip is.
 */
export async function openTileAndReadPrompt(page: Page, position: number): Promise<{ ok: boolean; prompt: string; scene: number | null; editUrl: string }> {
  const tile = page.locator("flow-video-tile:has(img) .container").nth(position);
  await tile.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
  if (!(await tile.isVisible().catch(() => false))) return { ok: false, prompt: "", scene: null, editUrl: "" };
  await tile.click({ timeout: 5000 }).catch(() => {});
  await page.waitForURL(/\/edit\//, { timeout: 15000 }).catch(() => {});
  if (!/\/edit\//.test(page.url())) return { ok: false, prompt: "", scene: null, editUrl: "" };
  await sleep(1500);
  const read = async () => {
    const text = (await page.evaluate<string>(`(document.body.innerText || '')`).catch(() => "")) || "";
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const sceneLine = lines.find((l) => SCENE_LINE_RE.test(l));
    return sceneLine || lines.filter((l) => l.length > 60).sort((a, b) => b.length - a.length)[0] || "";
  };
  let prompt = await read();
  // Oct 2026 editor (timeline UI): the clip's prompt is only shown in the "Hiện nhật ký" (history) side panel
  if (!SCENE_LINE_RE.test(prompt) && (await openEditorHistory(page))) prompt = await read();
  const m = SCENE_LINE_RE.exec(prompt);
  return { ok: true, prompt, scene: m ? parseInt(m[1], 10) : null, editUrl: page.url() };
}

/** "Scene 3: ...", "Scene 3. Continuity from Scene 2 ...", "Cảnh 3 - ..." */
const SCENE_LINE_RE = /^(?:scene|cảnh)\s*(\d+)\b/i;

/** Open the editor's history panel (button "Hiện nhật ký" / "Show history"), which shows the clip's prompt. No-op if already open. */
export async function openEditorHistory(page: Page): Promise<boolean> {
  const btn = page.locator('button:has-text("Hiện nhật ký"), button:has-text("Show history")').first();
  if (!(await btn.isVisible().catch(() => false))) return false;
  await btn.click({ timeout: 4000 }).catch(() => {});
  await sleep(1500);
  return true;
}

// ---- Flow Agent settings / approval (real DOM observed Oct 2026) ------------------------------------
// Composer "tune" button (aria "Cài đặt") opens the "Cài đặt tác nhân" VIEW (replaces the chat) with:
//  - "Xác nhận trước khi tạo": Luôn luôn / Không bao giờ   - image defaults (ratio, x1-x4, model)
//  - "Chế độ mặc định của tính năng tạo video": ratio toggles (16:9, 9:16), outputs x1..x4, model menu   - [Lưu]
const VIDEO_SETTINGS_SCRIPT = (ratio: string, outputs: number) => `((ratio, outputs) => {
  const label = Array.from(document.querySelectorAll('.settings-section-label')).find((e) => /tạo video|video generation|video mode/i.test(e.textContent || ''));
  if (!label) return { ok: false, why: 'no-video-section' };
  const all = Array.from(document.querySelectorAll('*'));
  const start = all.indexOf(label);
  const radios = [];
  for (let i = start + 1; i < all.length; i++) {
    const el = all[i];
    if (el.tagName === 'BUTTON' && /video-mo/.test(String(el.className))) break;   // video model menu ends the section
    if (el.tagName === 'BUTTON' && el.getAttribute('role') === 'radio') radios.push(el);
  }
  const text = (el) => (el.innerText || '').replace(/\\s+/g, '');
  const checked = (el) => el.getAttribute('aria-checked') === 'true' || /checked/.test(String(el.parentElement && el.parentElement.className));
  const done = [];
  for (const [want, name] of [[ratio.replace(/\\s/g, ''), 'ratio'], ['x' + outputs, 'outputs']]) {
    const el = radios.find((r) => text(r).endsWith(want));
    if (!el) { done.push(name + ':missing'); continue; }
    if (!checked(el)) el.click();
    done.push(name + ':' + want);
  }
  return { ok: true, done, count: radios.length };
})(${JSON.stringify(ratio)}, ${outputs})`;

/**
 * Best-effort: set the Agent's default VIDEO mode (aspect ratio, 1 output = 1x credits) and save.
 * Never throws; returns human-readable notes. Always leaves the chat view (composer) visible again.
 */
export async function applyOptions(page: Page, opts: { aspectRatio?: string; model?: string }): Promise<string[]> {
  const notes: string[] = [];
  try {
    // the composer's "tune" button; NOT the top-bar gear, which has the same aria-label and opens the project view menu
    const tune = page
      .locator('button.agent-action-button:has(mat-icon:text-is("tune")), flow-creative-agent-prompt-box button:has(mat-icon:text-is("tune"))')
      .first();
    if (!(await tune.isVisible().catch(() => false))) {
      notes.push("Không thấy nút Cài đặt của Flow Agent - dùng cài đặt mặc định của Flow.");
      return notes;
    }
    await tune.click({ timeout: 4000 });
    await sleep(1200);
    const ratio = opts.aspectRatio === "16:9" ? "16:9" : "9:16";
    const r = (await page.evaluate<any>(VIDEO_SETTINGS_SCRIPT(ratio, 1)).catch(() => null)) as any;
    if (r?.ok) {
      notes.push(`Cài đặt video của Flow Agent: ${r.done.join(", ")}.`);
      await sleep(400);
      const save = page.locator("button.settings-save-button").first();
      if (await save.isVisible().catch(() => false)) {
        await save.click({ timeout: 3000 }).catch(() => {});
        await sleep(800);
      }
    } else {
      notes.push(`Không chỉnh được cài đặt video (${r?.why || "không rõ"}) - giữ mặc định của Flow.`);
    }
    // still inside the settings view? go back to the chat
    const back = page.locator('button:has(mat-icon:text("arrow_back")), button[aria-label="Quay lại"]').first();
    if (await page.locator("button.settings-save-button").first().isVisible().catch(() => false)) {
      if (await back.isVisible().catch(() => false)) await back.click({ timeout: 3000 }).catch(() => {});
      else await page.keyboard.press("Escape").catch(() => {});
      await sleep(600);
    }
  } catch (e: any) {
    notes.push(`Bỏ qua tuỳ chọn Veo (${e.message}).`);
  }
  await closeOverlays(page);
  return notes;
}

/** Close any open Angular CDK menu/popup (its transparent backdrop swallows every click on the page). */
export async function closeOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const open = await page.locator(".cdk-overlay-backdrop-showing").count().catch(() => 0);
    if (!open) return;
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(400);
  }
}

/** Start a fresh Agent chat session so earlier plans/approval cards of the shared project never interfere. Best-effort. */
export async function startNewAgentSession(page: Page): Promise<boolean> {
  const btn = page.locator('button[aria-label="Bắt đầu phiên mới"], button[aria-label="New session"]').first();
  if (!(await btn.isVisible().catch(() => false))) return false;
  await btn.click({ timeout: 3000 }).catch(() => {});
  await sleep(1200);
  return true;
}

export interface ApprovalRequest {
  found: boolean;
  count: number;
  text: string;
  videos: number | null;
  credits: number | null;
}

const APPROVAL_SCRIPT = (baseline: number) => `((baseline) => {
  const MA = 'data-flow-approve', MR = 'data-flow-reject';
  document.querySelectorAll('[' + MA + '],[' + MR + ']').forEach((e) => { e.removeAttribute(MA); e.removeAttribute(MR); });
  const radios = Array.from(document.querySelectorAll('[role="radio"]'));
  const ok = radios.filter((r) => /^(phê duyệt|approve)$/i.test((r.getAttribute('aria-label') || '').trim()));
  if (ok.length <= baseline) return { found: false, count: ok.length, text: '', videos: null, credits: null };
  const approve = ok[ok.length - 1];
  const group = approve.parentElement;
  const reject = Array.from((group && group.querySelectorAll('[role="radio"]')) || []).find((r) => /^(từ chối|reject|decline|deny)$/i.test((r.getAttribute('aria-label') || '').trim()));
  // the card text: climb until the question ("... tín dụng / credits") is inside
  let card = approve, text = '';
  for (let i = 0; i < 8 && card.parentElement; i++) {
    card = card.parentElement;
    text = (card.innerText || '');
    if (/tín dụng|credits?/i.test(text)) break;
  }
  approve.setAttribute(MA, '1');
  if (reject) reject.setAttribute(MR, '1');
  const q = text.split(/\\n/).find((l) => /tín dụng|credits?/i.test(l)) || text;
  const credits = (q.match(/(\\d+(?:[.,]\\d+)?)\\s*(?:tín dụng|credits?)/i) || [])[1];
  const videos = (q.match(/(\\d+)\\s*(?:video|clip)/i) || [])[1];
  return { found: true, count: ok.length, text: q.trim().slice(0, 300), videos: videos ? parseInt(videos, 10) : null, credits: credits ? parseFloat(credits.replace(',', '.')) : null };
})(${baseline})`;

/** Number of approval cards already in the chat (so only a NEW one is acted on). */
export async function countApprovalCards(page: Page): Promise<number> {
  const r = (await page.evaluate<any>(APPROVAL_SCRIPT(1e9)).catch(() => null)) as any;
  return r?.count ?? 0;
}

/** Look for a NEW approval card ("Bạn có muốn tôi bắt đầu tạo N video này với chi phí là X tín dụng không?"). */
export async function readApprovalRequest(page: Page, baseline: number): Promise<ApprovalRequest> {
  const r = (await page.evaluate<any>(APPROVAL_SCRIPT(baseline)).catch(() => null)) as any;
  return r || { found: false, count: baseline, text: "", videos: null, credits: null };
}

/** Click "Phê duyệt" (once) or "Từ chối" on the card tagged by readApprovalRequest. Never uses "Luôn phê duyệt". */
export async function answerApproval(page: Page, approve: boolean): Promise<boolean> {
  const loc = page.locator(approve ? '[data-flow-approve="1"]' : '[data-flow-reject="1"]').first();
  if (!(await loc.isVisible().catch(() => false))) return false;
  await loc.click({ timeout: 4000 }).catch(() => {});
  return true;
}

/** Save screenshot + HTML + element inventory so selectors can be fixed from real data. */
export async function dumpDiagnostics(page: Page | undefined, rootDir: string, label: string): Promise<string | null> {
  if (!page) return null;
  try {
    const dir = path.join(rootDir, `${label}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, "screenshot.png") }).catch(() => {});
    const html = await page.content().catch(() => "");
    if (html) fs.writeFileSync(path.join(dir, "page.html"), html);
    const inv = await page.evaluate(DUMP_SCRIPT).catch(() => null);
    if (inv) fs.writeFileSync(path.join(dir, "elements.json"), JSON.stringify(inv, null, 2));
    return dir;
  } catch {
    return null;
  }
}

// ---- Attach images (real Flow DOM, observed Oct 2026) -------------------------------------------------
// The composer "+" (aria "Thêm thành phần vào ô nhập câu lệnh") opens an asset PICKER panel: left list of categories
// (Tất cả / Hình ảnh / Video / ... / Tệp tải lên), a search box "Tìm kiếm thành phần", a tile grid and, bottom-left,
// a button "upload  Tải nội dung nghe nhìn lên" that opens the native file chooser. Picking a tile attaches it to the prompt.

const PICKER_STATE_SCRIPT = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 8 && r.height > 8; };
  const search = Array.from(document.querySelectorAll('input')).find((i) => vis(i) &&
    /thành phần|asset|ingredient|component|search for/i.test((i.getAttribute('placeholder') || '') + ' ' + (i.getAttribute('aria-label') || '')) &&
    !/^(editable-text-input)$/.test(i.className || ''));
  if (!search) return { open: false, tiles: [] };
  const sr = search.getBoundingClientRect();
  // panel = nearest ancestor that is big and also contains the upload button
  let panel = search;
  for (let i = 0; i < 12 && panel.parentElement; i++) {
    panel = panel.parentElement;
    const pr = panel.getBoundingClientRect();
    if (pr.height > 250 && pr.width > 350 && Array.from(panel.querySelectorAll('button')).some((b) => /upload|tải nội dung|tải lên/i.test(b.innerText || ''))) break;
  }
  const tiles = Array.from(panel.querySelectorAll('img, video, canvas')).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width >= 40 && r.height >= 40 && r.top > sr.bottom - 4;
  }).map((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), t: Math.round(r.top), l: Math.round(r.left) }; })
    .sort((a, b) => (a.t - b.t) || (a.l - b.l));
  return { open: true, tiles };
})()`;

const COMPOSER_MEDIA_SCRIPT = `(() => {
  const input = document.querySelector('[${PROMPT_MARK}="1"]');
  if (!input) return -1;
  const vh = window.innerHeight;
  let box = input;
  for (let i = 0; i < 8 && box.parentElement; i++) {
    box = box.parentElement;
    if (box.getBoundingClientRect().height > vh * 0.45) break;
  }
  const pr = input.getBoundingClientRect();
  let n = 0;
  box.querySelectorAll('img, video, canvas').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width >= 16 && r.height >= 16 && r.top >= pr.top - 200 && r.bottom <= pr.bottom + 80 && r.top > vh * 0.5) n++;
  });
  return n;
})()`;

const UPLOAD_BTN_SELECTOR =
  'button:has-text("Tải nội dung nghe nhìn lên"), button:has-text("Upload media"), button:has-text("Upload image"), button:has-text("Tải ảnh lên"), .sidebar-upload-btn';

type PickerState = { open: boolean; tiles: { x: number; y: number }[] };
const pickerState = async (page: Page): Promise<PickerState> =>
  (await page.evaluate<PickerState>(PICKER_STATE_SCRIPT).catch(() => ({ open: false, tiles: [] }))) as PickerState;

async function openPicker(page: Page): Promise<boolean> {
  if ((await pickerState(page)).open) return true;
  const add = await page.evaluate<{ found: boolean }>(FIND_ADD_BUTTON_SCRIPT).catch(() => ({ found: false }));
  if (!add.found) return false;
  await page.locator('[data-flow-add="1"]').first().click({ timeout: 4000 }).catch(() => {});
  for (let i = 0; i < 12; i++) {
    await sleep(400);
    if ((await pickerState(page)).open) return true;
  }
  return false;
}

/**
 * Attach image files to the Flow composer (reference images / start frame), one by one:
 * open the picker with "+", press "Tải nội dung nghe nhìn lên", hand the file to the native chooser, wait for the new tile
 * and pick it. Verifies that the composer really holds the thumbnails and THROWS otherwise, so the caller stops BEFORE
 * submitting (no credits spent on a clip that lost its continuity image).
 */
export async function attachFiles(page: Page, files: string[]): Promise<void> {
  if (files.length === 0) return;
  for (const f of files) {
    if (!fs.existsSync(f)) throw new Error(`Thiếu file ảnh để đính kèm: ${f}`);
  }
  const composerBefore = await page.evaluate<number>(COMPOSER_MEDIA_SCRIPT).catch(() => -1);

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    if (!(await openPicker(page))) {
      throw new Error("Không mở được bảng chọn thành phần (nút + trong ô nhập) của Google Flow - giao diện có thể đã đổi.");
    }
    const tilesBefore = (await pickerState(page)).tiles.length;

    const payload = {
      name: path.basename(file),
      mime: /\.jpe?g$/i.test(file) ? "image/jpeg" : /\.webp$/i.test(file) ? "image/webp" : "image/png",
      b64: fs.readFileSync(file).toString("base64"),
    };
    // Hooks: (a) serve our file if Flow uses showOpenFilePicker (Playwright can't intercept that API), (b) count dynamic <input>.click()
    await page.evaluate(`((p) => {
      const bin = atob(p.b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      window.__flPayload = new File([u8], p.name, { type: p.mime });
      window.__fl = window.__fl || { sfp: 0, inputClicks: 0, ids: 0 };
      if (!window.__flHooked) {
        window.__flHooked = true;
        const origClick = HTMLInputElement.prototype.click;
        HTMLInputElement.prototype.click = function () { if (this.type === 'file') window.__fl.inputClicks++; return origClick.apply(this, arguments); };
        window.showOpenFilePicker = async () => {
          window.__fl.sfp++;
          const f = window.__flPayload;
          return [{ kind: 'file', name: f.name, getFile: async () => f, queryPermission: async () => 'granted', requestPermission: async () => 'granted', isSameEntry: async () => false }];
        };
      }
    })(${JSON.stringify(payload)})`);

    const waitNewTile = async (ms: number): Promise<PickerState | null> => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        await sleep(500);
        const st = await pickerState(page);
        if (!st.open || st.tiles.length > tilesBefore) return st;
      }
      return null;
    };

    let state: PickerState | null = null;
    const tried: string[] = [];

    // A) the picker's upload button -> native chooser
    const uploadBtn = page.locator(UPLOAD_BTN_SELECTOR).first();
    if (await uploadBtn.isVisible().catch(() => false)) {
      const chooser = page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null);
      const clickErr = await uploadBtn.click({ timeout: 4000 }).then(() => "", (e: any) => String(e?.message || e).split("\n")[0]);
      if (clickErr) tried.push(`click lỗi: ${clickErr}`);
      const c = await chooser;
      if (c) {
        tried.push("filechooser");
        await c.setFiles(file);
        state = await waitNewTile(30000);
      } else {
        const hooks = (await page.evaluate(`JSON.stringify(window.__fl || {})`).catch(() => "{}")) as string;
        tried.push(`không có filechooser (hooks ${hooks})`);
        // B) Flow used showOpenFilePicker / a detached input: our hook already served the file
        state = await waitNewTile(12000);
      }
    } else {
      tried.push("không thấy nút upload");
    }

    // C) drag & drop the file onto the project canvas (Flow: "thả nội dung nghe nhìn")
    if (!state) {
      tried.push("drag&drop");
      await page.evaluate(`(() => {
        const f = window.__flPayload;
        const dt = new DataTransfer(); dt.items.add(f);
        const targets = [document.elementFromPoint(window.innerWidth * 0.45, window.innerHeight * 0.45), document.querySelector('[class*="grid"]'), document.body].filter(Boolean);
        for (const t of targets) for (const type of ['dragenter', 'dragover', 'drop']) {
          t.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        }
      })()`).catch(() => {});
      state = await waitNewTile(15000);
    }

    if (!state) {
      throw new Error(
        "Không mở được hộp chọn file để đính kèm ảnh vào Google Flow. Đã thử: " + tried.join(" → ") + ". Xem data/flow-debug để chỉnh tiếp."
      );
    }
    if (state.open) {
      await sleep(1500); // let the thumbnail finish rendering
      const first = (await pickerState(page)).tiles[0] || state.tiles[0];
      await page.mouse.click(first.x, first.y);
      await sleep(1200);
      if ((await pickerState(page)).open) {
        await page.keyboard.press("Escape").catch(() => {});
        await sleep(600);
      }
    }
  }

  // verify: composer now holds the thumbnails
  await sleep(800);
  const composerAfter = await page.evaluate<number>(COMPOSER_MEDIA_SCRIPT).catch(() => -1);
  if (composerBefore >= 0 && composerAfter >= 0 && composerAfter < composerBefore + files.length) {
    throw new Error(
      `Đã upload ảnh nhưng không thấy ${files.length} ảnh được gắn vào ô nhập prompt (thấy ${composerAfter - composerBefore}). Kiểm tra data/flow-debug để chỉnh lại bước chọn tile.`
    );
  }
}
