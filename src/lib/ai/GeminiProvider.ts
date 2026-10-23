import { GoogleGenerativeAI } from "@google/generative-ai";
import { IAIProvider, ScenePlanInput, ScenePlanOutput } from "./AIProvider";
import {
  AIGenerateContentInput,
  AIGeneratedContentOutput,
  aiGeneratedContentOutputSchema,
} from "@/lib/validations";
import { buildSystemPrompt, buildUserPrompt } from "./prompt-engine";
import { DEFAULT_GEMINI_MODEL } from "./llm";

export class GeminiProvider implements IAIProvider {
  public readonly name = "Google Gemini";
  private cachedKey: string | undefined;
  private cachedClient: GoogleGenerativeAI | null = null;

  // read on every use, not at import: the key can be set after this singleton is created (worker .env loading,
  // key rotation, tests that switch the LLM off)
  private get apiKey(): string | undefined {
    const k = (process.env.GEMINI_API_KEY || "").trim();
    return k || undefined;
  }

  private get client(): GoogleGenerativeAI | null {
    const k = this.apiKey;
    if (!k) return null;
    if (k !== this.cachedKey) {
      this.cachedKey = k;
      this.cachedClient = new GoogleGenerativeAI(k);
    }
    return this.cachedClient;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  public async generateContent(input: AIGenerateContentInput): Promise<AIGeneratedContentOutput> {
    if (!this.client) {
      throw new Error("Gemini API chưa được cấu hình. Vui lòng thêm GEMINI_API_KEY vào biến môi trường.");
    }

    const promptText = buildUserPrompt(input);

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        let rawText = "";

        if (this.apiKey?.startsWith("sk-or-")) {
          // OpenRouter logic
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "http://localhost:3000",
              "X-Title": "AI Content Factory",
            },
            body: JSON.stringify({
              model: "google/gemini-3.5-flash",
              messages: [
                { role: "system", content: buildSystemPrompt() },
                { role: "user", content: promptText }
              ],
              temperature: 0.7,
              max_tokens: 2000,
              response_format: { type: "json_object" }
            }),
          });
          
          if (!res.ok) {
             const errorData = await res.text();
             throw new Error(`OpenRouter Error: ${res.status} - ${errorData}`);
          }
          
          const data = await res.json();
          rawText = data.choices?.[0]?.message?.content || "";
        } else {
          // Native Gemini SDK logic
          const model = this.client!.getGenerativeModel({
            model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.7,
            },
            systemInstruction: buildSystemPrompt(),
          });
          const response = await model.generateContent(promptText);
          rawText = response.response.text();
        }

        if (!rawText) throw new Error("Phản hồi từ AI API rỗng.");

        const jsonText = rawText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(jsonText);
        const validated = aiGeneratedContentOutputSchema.safeParse(parsed);
        if (!validated.success) throw new Error(`Dữ liệu AI trả về không đúng cấu trúc: ${validated.error.message}`);

        return validated.data;
      } catch (err: any) {
        lastError = err;
        if (attempt === 2) break;
      }
    }
    throw new Error(lastError?.message || "Không thể sinh nội dung từ AI sau 2 lần thử.");
  }

  public async planScenes(input: ScenePlanInput): Promise<ScenePlanOutput> {
    if (!this.isConfigured()) throw new Error("API Key chưa được cấu hình.");

    const sysInstruction = `You are a film director and Veo 3.1 prompt engineer.
You turn a brief into a sequence of independent video clips that will be stitched together.
Each clip is generated separately, so clips can NOT see each other: continuity must come from the prompts.

Rules:
1. Return ONLY JSON: {"title": string, "styleBible": string, "scenes": string[], "caption": string, "hashtags": string[]}.
2. "styleBible" (40-90 words, English): fixed description of main character(s) (age, face, hair, clothing, colors), location/world, time of day, lighting, color grade, lens/film look. It is prepended to EVERY scene, so make it concrete and reusable.
3. "scenes" must contain EXACTLY the requested number of items, in story order, forming a clear arc (opening hook -> development -> climax -> resolution).
4. Each scene (30-70 words, English): ONE continuous shot/action that fits the clip length, with camera movement and the specific action. Do not repeat the style bible text; refer to characters consistently ("the young woman in the red coat").
5. No on-screen text, subtitles, logos, or watermarks. Avoid spoken dialogue unless the brief demands it.
6. "title" is a short engaging title in the requested language.
7. "caption" is a catchy social-media caption (max 2 sentences) in the requested language; "hashtags" are 5-8 relevant hashtags without spaces.`;

    const promptText = `Brief / script:\n"""${input.brief}"""\n
Number of scenes: ${input.sceneCount}
Each clip length: about ${input.clipSeconds} seconds
Visual style: ${input.style}
Aspect ratio: ${input.aspectRatio}
Title language: ${input.language === "vi" ? "Vietnamese" : input.language}`;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        let rawText = "";

        if (this.apiKey?.startsWith("sk-or-")) {
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "http://localhost:3000",
              "X-Title": "AI Content Factory",
            },
            body: JSON.stringify({
              model: "google/gemini-3.5-flash",
              messages: [
                { role: "system", content: sysInstruction },
                { role: "user", content: promptText }
              ],
              temperature: 0.7,
              max_tokens: 2000,
              response_format: { type: "json_object" }
            }),
          });
          if (!res.ok) {
             const errorData = await res.text();
             throw new Error(`OpenRouter Error: ${res.status} - ${errorData}`);
          }
          const data = await res.json();
          rawText = data.choices?.[0]?.message?.content || "";
        } else {
          const model = this.client!.getGenerativeModel({
            model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
            generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
            systemInstruction: sysInstruction,
          });
          const response = await model.generateContent(promptText);
          rawText = response.response.text();
        }

        if (!rawText) throw new Error("Phản hồi từ AI API rỗng.");
        const parsed = JSON.parse(rawText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
        const scenes: string[] = Array.isArray(parsed.scenes) ? parsed.scenes.map((x: unknown) => String(x ?? "").trim()).filter(Boolean) : [];
        if (scenes.length !== input.sceneCount) throw new Error(`AI trả về ${scenes.length} cảnh, cần đúng ${input.sceneCount} cảnh.`);
        
        return {
          title: String(parsed.title || "").trim() || "Video nhiều cảnh",
          styleBible: String(parsed.styleBible || "").trim(),
          scenes,
          caption: String(parsed.caption || "").trim() || undefined,
          hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map((h: unknown) => String(h ?? "").trim().replace(/^#?/, "#")).filter((h: string) => h.length > 1).slice(0, 12) : undefined,
        };
      } catch (err: any) {
        lastError = err;
      }
    }
    throw new Error(lastError?.message || "Không thể chia cảnh bằng AI sau 2 lần thử.");
  }
}
