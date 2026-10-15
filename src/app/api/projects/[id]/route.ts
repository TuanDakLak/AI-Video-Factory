import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json({ error: "Không tìm thấy dự án." }, { status: 404 });
    }

    // Delete project directory in storage
    await storage.deleteProject(id);

    // Delete project in DB (cascade deletes generations & videoAssets)
    await prisma.project.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete project error:", error);
    return NextResponse.json({ error: "Không thể xóa dự án." }, { status: 500 });
  }
}
