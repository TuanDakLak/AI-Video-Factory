import { AIGenerateContentInput, AIGeneratedContentOutput } from "@/lib/validations";

export interface ScenePlanInput {
  brief: string; // idea / script text the video is based on
  sceneCount: number;
  clipSeconds: number;
  style: string;
  aspectRatio: string;
  language: string;
}

export interface ScenePlanOutput {
  title: string;
  /** Shared look, character, wardrobe, location, lighting, grade — repeated in every scene for visual consistency */
  styleBible: string;
  /** Exactly `sceneCount` English Veo prompts, in story order */
  scenes: string[];
  /** Short social caption for the finished video, in the requested language */
  caption?: string;
  hashtags?: string[];
}

export interface IAIProvider {
  readonly name: string;
  isConfigured(): boolean;
  generateContent(input: AIGenerateContentInput): Promise<AIGeneratedContentOutput>;
  /** Optional: split a brief into N consistent scene prompts. Falls back to a deterministic splitter when absent. */
  planScenes?(input: ScenePlanInput): Promise<ScenePlanOutput>;
}
