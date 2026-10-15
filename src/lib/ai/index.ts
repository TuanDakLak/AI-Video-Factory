import { IAIProvider } from "./AIProvider";
import { GeminiProvider } from "./GeminiProvider";

export const aiProvider: IAIProvider = new GeminiProvider();
