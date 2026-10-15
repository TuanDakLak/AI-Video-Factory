import { NextRequest, NextResponse } from "next/server";
import { FlowAutomationService } from "@/lib/automation/FlowAutomationService";
import { readHealthHistory } from "@/lib/automation/health-store";

export const dynamic = "force-dynamic";

/** Last health reports of the Flow UI (newest first). */
export async function GET() {
  const history = readHealthHistory();
  return NextResponse.json({ latest: history[0] ?? null, history });
}

/** Run a health check now (opens Flow in the account's browser profile, spends no credit). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const report = await FlowAutomationService.healthCheck(typeof body.googleAccountId === "string" ? body.googleAccountId : undefined);
    return NextResponse.json({ report });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Không kiểm tra được." }, { status: 400 });
  }
}
