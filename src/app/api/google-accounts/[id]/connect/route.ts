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
