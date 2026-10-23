import { TickReport, schedulerTick } from "./topics";
import { channelsNeedingResearch, researchChannel } from "@/lib/research/researcher";

/**
 * Everything the worker does every AUTOMATION_TICK_SEC:
 *  1. research: at most ONE channel per tick (whose inbox is running low and that was not researched in the last 6 h),
 *     so the free LLM quota and GDELT's 1 request / 5 s are respected;
 *  2. inbox + production (auto-approve, sync, start the next video of each channel within its limits).
 */
export interface AutomationReport extends TickReport {
  research?: string;
}

export async function automationTick(now = new Date()): Promise<AutomationReport> {
  let research: string | undefined;
  const due = await channelsNeedingResearch(now);
  if (due.length > 0) {
    const r = await researchChannel(due[0]);
    research = `${due[0].name}: ${r.note}`;
  }
  const report = await schedulerTick(now);
  return { ...report, research };
}
