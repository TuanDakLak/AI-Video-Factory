import type { ZodType, ZodTypeDef } from "zod";

/**
 * One JSON-returning LLM call, validated with zod (one corrective retry). Works with:
 *  - an OpenRouter key (GEMINI_API_KEY="sk-or-…"): model LLM_MODEL (default google/gemini-3.5-flash);
 *    `online: true` appends ":online" so OpenRouter grounds the answer with a live web search (used for research);
 *  - a Google AI Studio key: model GEMINI_MODEL (default gemini-2.5-flash, thinking capped at 512 tokens).
 * The key stays on the server; prompts never contain secrets.
 */
export function llmConfigured(): boolean {
  return !!(process.env.GEMINI_API_KEY || "").trim();
}

export interface LlmJsonOptions<T> {
  system: string;
  user: string;
  /** output type T; input may differ (defaults, coercion) */
  schema: ZodType<T, ZodTypeDef, unknown>;
  temperature?: number;
  maxTokens?: number;
  /** OpenRouter only: let the model search the web before answering */
  online?: boolean;
  timeoutMs?: number;
}

function stripFences(raw: string): string {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  // some models add prose around the object: keep the outermost {...} / [...]
  const first = Math.min(...["{", "["].map((c) => (t.indexOf(c) === -1 ? Infinity : t.indexOf(c))));
  const last = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  return first !== Infinity && last > first ? t.slice(first, last + 1) : t;
}

async function complete(system: string, user: string, o: { temperature: number; maxTokens: number; online: boolean; timeoutMs: number }): Promise<string> {
  const key = (process.env.GEMINI_API_KEY || "").trim();
  if (!key) throw new Error("Chưa cấu hình GEMINI_API_KEY.");
  if (key.startsWith("sk-or-")) {
    const model = (process.env.LLM_MODEL || "google/gemini-3.5-flash") + (o.online ? ":online" : "");
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "AI Content Factory",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: o.temperature,
        max_tokens: o.maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(o.timeoutMs),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }
  // Google AI Studio key. The free tier regularly answers 503 "high demand" / 429: retry with backoff, then fall back
  // to the lighter model (also free) before giving up.
  const primary = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const fallback = process.env.GEMINI_FALLBACK_MODEL ?? FALLBACK_GEMINI_MODEL;
  const plan: Array<[string, number]> = [[primary, 0], [primary, 2000], [primary, 6000], ...(fallback && fallback !== primary ? ([[fallback, 1000]] as Array<[string, number]>) : [])];
  let last: Error = new Error("LLM unavailable");
  for (const [model, delay] of plan) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      return await callGemini(key, model, system, user, o);
    } catch (e: any) {
      last = e;
      if (!e.transient) throw e; // bad request, invalid key, safety block: retrying won't help
    }
  }
  throw last;
}

class LlmError extends Error {
  constructor(message: string, readonly transient: boolean) {
    super(message);
  }
}

// REST, not the old SDK (it can't set the thinking budget). gemini-2.0-flash was retired (404) in 2026.
async function callGemini(key: string, model: string, system: string, user: string, o: { temperature: number; maxTokens: number; timeoutMs: number }): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: o.temperature,
        // thinking tokens are billed as output and count against this limit: cap them, the tasks are short
        maxOutputTokens: o.maxTokens + THINKING_BUDGET,
        thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      },
    }),
    signal: AbortSignal.timeout(o.timeoutMs),
    });
  } catch (e: any) {
    throw new LlmError(`LLM network error: ${e?.message || e}`, true);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const transient = res.status === 429 || res.status >= 500;
    throw new LlmError(`LLM ${res.status} (${model}): ${String(data?.error?.message || "").slice(0, 300)}`, transient);
  }
  lastUsage = { model, input: data.usageMetadata?.promptTokenCount ?? 0, output: (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0) };
  const text = (data.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("");
  if (!text) throw new LlmError(`LLM (${model}) returned no text (${data.candidates?.[0]?.finishReason || "unknown reason"})`, false);
  return text;
}

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const FALLBACK_GEMINI_MODEL = "gemini-2.5-flash-lite";
const THINKING_BUDGET = 512;
/** Token usage of the last Gemini call (input / output incl. thinking): used by tests and cost logging. */
export let lastUsage: { model?: string; input: number; output: number } = { input: 0, output: 0 };

export async function llmJson<T>(opts: LlmJsonOptions<T>): Promise<T> {
  const o = { temperature: opts.temperature ?? 0.8, maxTokens: opts.maxTokens ?? 4000, online: !!opts.online, timeoutMs: opts.timeoutMs ?? 90000 };
  let user = opts.user;
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await complete(opts.system, user, o);
    try {
      const parsed = opts.schema.safeParse(JSON.parse(stripFences(raw)));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.errors.slice(0, 5).map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    } catch (e: any) {
      lastError = `invalid JSON (${e.message})`;
    }
    user = `${opts.user}\n\nYour previous answer was rejected: ${lastError}. Return ONLY the corrected JSON object.`;
  }
  throw new Error(`LLM trả về dữ liệu không hợp lệ: ${lastError}`);
}
