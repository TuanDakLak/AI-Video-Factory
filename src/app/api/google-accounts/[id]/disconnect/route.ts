import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
