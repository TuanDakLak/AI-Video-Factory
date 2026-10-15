import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createGoogleAccountSchema } from "@/lib/validations";
import { requireApiUser } from "@/lib/auth/session";
import { randomBytes } from "crypto";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const accounts = await prisma.googleAccount.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { generations: true } },
      },
    });
    return NextResponse.json(accounts);
  } catch (error) {
    return NextResponse.json({ error: "Lỗi khi lấy danh sách tài khoản Google." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    const body = await req.json();
    const validated = createGoogleAccountSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.errors[0]?.message || "Dữ liệu không hợp lệ" },
        { status: 400 }
      );
    }

    const account = await prisma.googleAccount.create({
      data: {
        ownerId: user.id,
        // each account gets its own browser profile (= its own Google session); the name is never user-controlled
        profileDir: `u-${user.id.slice(-8)}-${randomBytes(6).toString("hex")}`,
        name: validated.data.name,
        label: validated.data.label,
        status: "NOT_CONNECTED",
        notes: validated.data.notes || null,
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    console.error("Create Google account error:", error);
    return NextResponse.json({ error: "Không thể thêm tài khoản Google." }, { status: 500 });
  }
}
