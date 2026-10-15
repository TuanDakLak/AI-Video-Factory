import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createGoogleAccountSchema } from "@/lib/validations";

export async function GET() {
  try {
    const accounts = await prisma.googleAccount.findMany({
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
        name: validated.data.name,
        label: validated.data.label,
        status: validated.data.status,
        notes: validated.data.notes || null,
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    console.error("Create Google account error:", error);
    return NextResponse.json({ error: "Không thể thêm tài khoản Google." }, { status: 500 });
  }
}
