import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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
    const account = await prisma.googleAccount.update({
      where: { id },
      data: {
        status: "NOT_CONNECTED",
        lockStatus: "AVAILABLE",
        lastKnownFlowCredits: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Đã ngắt kết nối tài khoản ${account.name}`,
    });
  } catch (error: any) {
    console.error("[API GoogleAccount Disconnect Error]:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Lỗi khi ngắt kết nối" },
      { status: 500 }
    );
  }
}
