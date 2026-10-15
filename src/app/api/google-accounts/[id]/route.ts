import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateGoogleAccountSchema } from "@/lib/validations";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const validated = updateGoogleAccountSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.errors[0]?.message || "Dữ liệu không hợp lệ" },
        { status: 400 }
      );
    }

    const updated = await prisma.googleAccount.update({
      where: { id },
      data: validated.data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Không thể cập nhật tài khoản Google." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.googleAccount.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Không thể xóa tài khoản Google." }, { status: 500 });
  }
}
