import { FlowAutomationService } from "../lib/automation/FlowAutomationService";
import { notifyWebhook } from "../lib/automation/notify";
import { prisma } from "../lib/db";

/** npm run flow:health  — checks the Flow UI without spending credits. Exit code 1 when something is broken (usable from cron / Task Scheduler). */
(async () => {
  try {
    const r = await FlowAutomationService.healthCheck(process.argv[2]);
    console.log(`\nFlow health @ ${r.at} (${r.accountName}) -> ${r.ok ? "OK" : "LỖI"}`);
    for (const i of r.items) console.log(`${i.ok ? "✅" : "❌"} ${i.name}: ${i.detail}`);
    if (!r.ok) await notifyWebhook("flow.health.failed", { accountName: r.accountName, failed: r.items.filter((i) => !i.ok) });
    process.exitCode = r.ok ? 0 : 1;
  } catch (e: any) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
