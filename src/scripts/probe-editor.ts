import fs from "fs";
import path from "path";
import { chromium, Page } from "playwright";
import { FlowAutomationService } from "../lib/automation/FlowAutomationService";

/**
 * Debug: open a Flow project, click the n-th finished video tile, then run optional UI steps and save what each step shows
 * (screenshot + visible text + HTML). 0 credits: only opens panels/menus, never generates.
 * Usage: tsx src/scripts/probe-editor.ts <projectUrl> [tileIndex] [step,step,...]
 *   step = css selector to click, or "key:Escape", or "wait:ms"
 */
async function snap(page: Page, out: string, name: string) {
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  fs.writeFileSync(path.join(out, `${name}.txt`), await page.evaluate(() => document.body.innerText));
  fs.writeFileSync(path.join(out, `${name}.html`), await page.content());
}

async function run() {
  const [projectUrl, idx = "0", stepsArg = "", profileDir = "account-b"] = process.argv.slice(2);
  const out = path.resolve(process.cwd(), "data", "flow-debug", `probe-${Date.now()}`);
  fs.mkdirSync(out, { recursive: true });
  const ctx = await chromium.launchPersistentContext(FlowAutomationService.getProfilePath(profileDir), {
    headless: false,
    channel: "chromium",
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(projectUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(6000);
    await snap(page, out, "0-grid");
    if (idx !== "-1") {
      const tiles = page.locator("flow-video-tile:has(img) .container");
      console.log("tiles:", await tiles.count());
      await tiles.nth(parseInt(idx, 10)).click({ timeout: 8000 });
      await page.waitForURL(/\/edit\//, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(4000);
      console.log("url:", page.url());
      await snap(page, out, "1-editor");
    }
    const steps = stepsArg.split(",").map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.startsWith("key:")) await page.keyboard.press(s.slice(4));
      else if (s.startsWith("wait:")) await page.waitForTimeout(parseInt(s.slice(5), 10));
      else await page.locator(s).first().click({ timeout: 8000 }).catch((e) => console.log(`step ${s} failed: ${e.message.split("\n")[0]}`));
      await page.waitForTimeout(2500);
      await snap(page, out, `${i + 2}-step`);
    }
    console.log("saved:", out);
  } finally {
    await ctx.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
