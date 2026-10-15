import { NextRequest, NextResponse } from "next/server";
import { FlowAutomationService } from "@/lib/automation/FlowAutomationService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await FlowAutomationService.launchLoginSession(id);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API GoogleAccount Connect Error]:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Lỗi khi mở phiên kết nối Google" },
      { status: 500 }
    );
  }
}
