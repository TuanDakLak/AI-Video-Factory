import { NextRequest, NextResponse } from "next/server";
import { aiProvider } from "@/lib/ai";
import { aiGenerateContentInputSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
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
