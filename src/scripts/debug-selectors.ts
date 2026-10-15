import { chromium } from "playwright";
import { FlowSelectors } from "../lib/automation/flow-selectors";
import path from "path";

async function main() {
  const profileDir = path.resolve(process.cwd(), "data/browser-profiles/account-b");
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });
  const page = context.pages()[0] || (await context.newPage());
  
  console.log("Navigating to https://labs.google/fx/tools/flow...");
  await page.goto("https://labs.google/fx/tools/flow", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000); // Let it render
  
  console.log("Attempting to dismiss welcome screens...");
  try {
    const popupSelectors = [
      'button:has-text("Start Creating")', 'a:has-text("Start Creating")',
      'button:has-text("Got it")', 'button:has-text("I agree")', 'button:has-text("Next")'
    ].join(', ');
    const btn = await page.$(popupSelectors);
    if (btn && (await btn.isVisible())) {
      console.log("Found popup! Clicking...");
      await btn.click();
      await page.waitForTimeout(2000);
    }
  } catch (e: any) {}

  console.log("Checking Dashboard bypass...");
  try {
    const newProjectSelectors = [
      'button:has-text("Dự án mới")', 'div:has-text("Dự án mới")',
      'button:has-text("New project")', 'div:has-text("New project")',
      ':text("+ Dự án mới")', ':text("+ New project")'
    ].join(', ');
    const newProjectBtn = await page.$(newProjectSelectors);
    if (newProjectBtn && (await newProjectBtn.isVisible())) {
      console.log("Clicking New Project...");
      await newProjectBtn.click();
      await page.waitForTimeout(4000);
    }
  } catch (e: any) {}

  console.log("Typing prompt...");
  try {
    const promptSelector = FlowSelectors.prompt.inputs.join(', ');
    const pInput = await page.$(promptSelector);
    if (pInput) {
      await pInput.fill("A cinematic video of a cute cat");
      await page.waitForTimeout(1000);
      console.log("Typed prompt!");
    } else {
      console.log("COULD NOT FIND PROMPT BOX!");
    }
  } catch (e: any) {}

  console.log("Checking Generate buttons...");
  for (const s of FlowSelectors.generate.submitButtons) {
    try {
      const el = await page.$(s);
      if (el) {
        console.log(`- ${s}: MATCH (Visible: ${await el.isVisible()})`);
      } else {
        console.log(`- ${s}: NO MATCH`);
      }
    } catch (e: any) {}
  }
  
  const allButtons = await page.$$("button");
  console.log(`Found ${allButtons.length} buttons total.`);
  for (let i = 0; i < Math.min(allButtons.length, 15); i++) {
    const text = await allButtons[i].textContent();
    console.log(`Button ${i}: ${text?.trim()}`);
  }

  await page.screenshot({ path: path.resolve(process.cwd(), "debug-generate.png") });
  console.log("Saved screenshot to debug-generate.png");
  
  await context.close();
}

main().catch(console.error);
