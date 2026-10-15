import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueGenerationJob } from "@/lib/queue/generation-queue";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const selectedAccountId = body.googleAccountId;

    const generation = await prisma.generation.findUnique({
      where: { id },
      include: { googleAccount: true },
    });

    if (!generation) {
      return NextResponse.json(
        { error: "Không tìm thấy generation job này." },
        { status: 404 }
      );
    }

    // Determine target Google Account
    let accountId = selectedAccountId || generation.googleAccountId;

    if (!accountId) {
      // Auto pick first available connected account
      const availableAccount = await prisma.googleAccount.findFirst({
        where: {
          status: "CONNECTED",
          lockStatus: "AVAILABLE",
        },
      });

      if (!availableAccount) {
        return NextResponse.json(
          { error: "Không có tài khoản Google nào đang ở trạng thái CONNECTED và sẵn sàng. Vui lòng kết nối tài khoản tại Cài Đặt." },
          { status: 400 }
        );
      }
      accountId = availableAccount.id;
    }

    const account = await prisma.googleAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Tài khoản Google đã chọn không tồn tại." },
        { status: 400 }
      );
    }

    if (account.status !== "CONNECTED") {
      return NextResponse.json(
        { error: `Tài khoản ${account.name} chưa được kết nối Google Flow (${account.status}). Vui lòng vào Cài Đặt để kết nối trước.` },
        { status: 400 }
      );
    }

    // Create idempotency key
    const idempotencyKey = `flow_gen_${id}_${Date.now()}`;

    // Update generation status to QUEUED, clear error message, and link account
    await prisma.generation.update({
      where: { id },
      data: {
        googleAccountId: accountId,
        status: "QUEUED",
        errorMessage: null,
        generationMethod: "AUTO",
        idempotencyKey,
      },
    });

    // Clear old logs so the user sees a fresh timeline
    await prisma.generationEvent.deleteMany({
      where: { generationId: id },
    });

    // Add QUEUED event log
    await prisma.generationEvent.create({
      data: {
        generationId: id,
        type: "QUEUED",
        message: `Đã đưa tác vụ vào hàng đợi xử lý cho tài khoản ${account.name}.`,
      },
    });

    // Enqueue in BullMQ
    await enqueueGenerationJob({
      generationId: id,
      projectId: generation.projectId,
      googleAccountId: accountId,
      prompt: generation.prompt,
      model: generation.model,
      aspectRatio: generation.aspectRatio,
      duration: generation.duration,
      idempotencyKey,
      enqueuedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: `Đã gửi tác vụ vào hàng đợi với ${account.name}`,
    });
  } catch (error: any) {
    console.error("[API Start-Auto Error]:", error);
    return NextResponse.json(
      { error: error.message || "Không thể khởi động quy trình sinh video tự động." },
      { status: 500 }
    );
  }
}
