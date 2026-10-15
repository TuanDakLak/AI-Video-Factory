import { NextRequest, NextResponse } from "next/server";
import { aiProvider } from "@/lib/ai";
import { aiGenerateContentInputSchema } from "@/lib/validations";
import { requireApiUser } from "@/lib/auth/session";
import { hit } from "@/lib/auth/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;
    // every call is billed to the server's Gemini key
    const rl = await hit(`ai:${user.id}`, 30, 3600);
    if (!rl.allowed) return NextResponse.json({ error: "Đã vượt giới hạn 30 lần tạo/giờ." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
    const body = await req.json();
    const validated = aiGenerateContentInputSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.errors[0]?.message || "Dữ liệu yêu cầu không hợp lệ" },
        { status: 400 }
      );
    }

    if (!aiProvider.isConfigured()) {
      return NextResponse.json(
        {
          error: "Gemini API chưa được cấu hình (Chế độ thủ công). Vui lòng thêm GEMINI_API_KEY vào .env để sử dụng tính năng tạo tự động.",
          notConfigured: true,
        },
        { status: 400 }
      );
    }

    const content = await aiProvider.generateContent(validated.data);
    return NextResponse.json({ success: true, data: content });
  } catch (error: any) {
    console.error("AI Generation route error:", error);
    return NextResponse.json(
      { error: error?.message || "Đã xảy ra lỗi khi gọi Gemini API." },
      { status: 500 }
    );
  }
}
