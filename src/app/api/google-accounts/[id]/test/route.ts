import { NextRequest, NextResponse } from "next/server";
import { FlowAutomationService } from "@/lib/automation/FlowAutomationService";
import { requireApiUser } from "@/lib/auth/session";
import { ownsGoogleAccount } from "@/lib/auth/ownership";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const { id } = await params;
    if (!(await ownsGoogleAccount(user.id, id))) return NextResponse.json({ error: "Không tìm thấy tài khoản Google." }, { status: 404 });
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
