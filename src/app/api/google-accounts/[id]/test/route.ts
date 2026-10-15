import { NextRequest, NextResponse } from "next/server";
import { FlowAutomationService } from "@/lib/automation/FlowAutomationService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await FlowAutomationService.testConnection(id);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API GoogleAccount Test Error]:", error);
    return NextResponse.json(
      { status: "ERROR", message: error.message || "Lỗi khi kiểm tra kết nối Google Flow" },
      { status: 500 }
    );
  }
}
