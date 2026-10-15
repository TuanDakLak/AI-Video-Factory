import { FlowAutomationService } from "../lib/automation/FlowAutomationService";
import { prisma } from "../lib/db";

/** npm run flow:attach-test — verifies on THIS machine that reference images can be attached in Flow (no credits, nothing is submitted). */
(async () => {
  try {
    const r = await FlowAutomationService.attachSelfTest(process.argv[2]);
    console.log(`${r.ok ? "✅" : "❌"} ${r.detail}`);
    if (r.screenshot) console.log(`Ảnh chụp màn hình: ${r.screenshot}`);
    process.exitCode = r.ok ? 0 : 1;
  } catch (e: any) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
