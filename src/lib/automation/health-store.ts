import fs from "fs";
import path from "path";

export interface HealthCheckItem {
  name: string;
  ok: boolean;
  detail: string;
}
export interface HealthReport {
  at: string;
  accountId: string;
  accountName: string;
  ok: boolean;
  credits: number | null;
  items: HealthCheckItem[];
  projectUrl?: string | null;
  screenshot?: string | null;
}

const FILE = () => path.resolve(process.cwd(), "data", "flow-health.json");

export function readHealthHistory(): HealthReport[] {
  try {
    const v = JSON.parse(fs.readFileSync(FILE(), "utf8"));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveHealthReport(report: HealthReport, keep = 30): void {
  try {
    const dir = path.dirname(FILE());
    fs.mkdirSync(dir, { recursive: true });
    const history = [report, ...readHealthHistory()].slice(0, keep);
    fs.writeFileSync(FILE(), JSON.stringify(history, null, 2));
  } catch (e) {
    console.warn("[health] cannot save report:", e);
  }
}
