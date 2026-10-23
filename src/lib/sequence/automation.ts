import { prisma } from "@/lib/db";
import { getPreset } from "@/lib/presets";
import { SequenceService } from "./sequence-service";
import { AutomationRequest } from "@/lib/validations";

/**
 * Unattended entry point for topic feeds (hot trends, schedulers, n8n/Make...). One call per topic:
 *   create sequence (channel preset) -> optional free dry run -> start (credit guards apply) -> auto-assemble -> webhook.
 */
export type { AutomationRequest };

const AUTO_PROJECT_NAME = "Tự động (Automation)";

async function ensureProject(ownerId: string, projectId?: string): Promise<string> {
  if (projectId) {
    const p = await prisma.project.findFirst({ where: { id: projectId, ownerId }, select: { id: true } });
    if (!p) throw new Error("Không tìm thấy dự án.");
    return p.id;
  }
  const existing = await prisma.project.findFirst({ where: { name: AUTO_PROJECT_NAME, ownerId }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.project.create({ data: { ownerId, name: AUTO_PROJECT_NAME, description: "Video tạo tự động từ danh sách chủ đề.", topic: "Automation" } });
  return created.id;
}

export interface AutomationResult {
  topic: string;
  sequenceId?: string;
  status: "STARTED" | "CREATED" | "DRYRUN_QUEUED" | "ERROR";
  message: string;
}

/** ownerId: every project, preset and Google account used belongs to this user. */
export async function runAutomation(req: AutomationRequest, ownerId: string): Promise<AutomationResult[]> {
  const topics = [...(req.topics ?? []), ...(req.topic ? [req.topic] : [])];
  const preset = req.presetId ? await getPreset(req.presetId, ownerId) : null;
  if (req.presetId && !preset) throw new Error("Không tìm thấy preset kênh.");
  const projectId = await ensureProject(ownerId, req.projectId);
  const out: AutomationResult[] = [];
  for (const topic of topics) {
    try {
      const created = await SequenceService.create({
        projectId,
        brief: topic,
        title: topic.slice(0, 120),
        totalDuration: req.totalDuration,
        clipSeconds: preset?.clipSeconds ?? 10,
        aspectRatio: preset?.aspectRatio ?? "9:16",
        model: preset?.model ?? "Veo 3.1 Fast",
        transition: preset?.transition ?? "CUT",
        continuity: preset?.continuity ?? "FLOW_AGENT",
        presetId: preset?.id,
      }, ownerId);
      const id = created.sequence.id;
      if (req.dryRunOnly) {
        const r = await SequenceService.start(id, { mode: "DRYRUN" });
        out.push({ topic, sequenceId: id, status: "DRYRUN_QUEUED", message: r.message });
      } else if (req.autostart) {
        const r = await SequenceService.start(id);
        out.push({ topic, sequenceId: id, status: "STARTED", message: r.message });
      } else {
        out.push({ topic, sequenceId: id, status: "CREATED", message: "Đã tạo, chưa chạy." });
      }
    } catch (e: any) {
      out.push({ topic, status: "ERROR", message: e.message || "Lỗi không xác định" });
    }
  }
  return out;
}
