import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateGoogleAccountSchema } from "@/lib/validations";
import { requireApiUser } from "@/lib/auth/session";
import { ownsGoogleAccount } from "@/lib/auth/ownership";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const { id } = await params;
    if (!(await ownsGoogleAccount(user.id, id))) return NextResponse.json({ error: "Không tìm thấy tài khoản Google." }, { status: 404 });
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
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const { id } = await params;
    if (!(await ownsGoogleAccount(user.id, id))) return NextResponse.json({ error: "Không tìm thấy tài khoản Google." }, { status: 404 });
    const account = await prisma.googleAccount.findUnique({ where: { id }, select: { lockStatus: true } });
    if (account?.lockStatus === "IN_USE") return NextResponse.json({ error: "Tài khoản đang chạy một tác vụ, thử lại sau." }, { status: 409 });
    await prisma.googleAccount.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Không thể xóa tài khoản Google." }, { status: 500 });
  }
}
