import { IAIProvider } from "./AIProvider";
import { AIGenerateContentInput, AIGeneratedContentOutput } from "@/lib/validations";

export class MockAIProvider implements IAIProvider {
  public readonly name = "Mock AI (Local Demo)";

  public isConfigured(): boolean {
    return true;
  }

  public async generateContent(input: AIGenerateContentInput): Promise<AIGeneratedContentOutput> {
    const topic = input.topic || "Chủ đề mẫu";
    return {
      title: `Khám Phá: ${topic.slice(0, 40)}`,
      concept: `Video ngắn khai thác góc nhìn điện ảnh và kịch tính về chủ đề "${topic}".`,
      script: `Cảnh 1: Mở đầu ấn tượng với bối cảnh không gian rộng lớn.\nCảnh 2: Điểm nhấn trung tâm xuất hiện với góc quay cận cảnh chi tiết và hiệu ứng ánh sáng nổi bật.`,
      videoPrompt: `Cinematic ${input.style.toLowerCase()} shot of ${topic}, highly detailed 8k resolution, dramatic volumetric lighting, smooth camera movement, photorealistic aesthetic, ${input.aspectRatio} vertical framing`,
      description: `Khám phá chi tiết video độc đáo về ${topic}. Tạo bằng Google Flow.`,
      tags: ["aicontent", "flow", "veo3", "cinematic", "shorts"],
    };
  }
}
