/**
 * Genre templates: how a topic becomes a video of a given kind. Used by the script writer (LLM) to structure the
 * clips, and as a fallback structure when no LLM is available. Each clip is ~10 s, so a 30 s video has 3 beats,
 * 60 s has 6, 90 s has 9: `beats(n)` stretches/compresses the dramatic structure to n clips.
 */
export const GENRE_KEYS = ["short_film", "comedy", "documentary", "top_list", "storytelling", "product_ad", "relaxing"] as const;
export type GenreKey = (typeof GENRE_KEYS)[number];

export type VoiceMode = "dialogue" | "voiceover" | "none";

export interface GenreTemplate {
  key: GenreKey;
  label: string;
  description: string;
  /** what people speak: characters' lines, a narrator, or nothing (music/ambience only) */
  voice: VoiceMode;
  /** the dramatic structure, in order; stretched or compressed to the number of clips */
  structure: string[];
  /** extra instructions for the script writer */
  guidance: string;
  /** visual defaults when the channel defines none */
  look: string;
  captionStyle: string;
}

export const GENRES: Record<GenreKey, GenreTemplate> = {
  short_film: {
    key: "short_film",
    label: "Phim ngắn",
    description: "Câu chuyện có nhân vật, xung đột và cái kết bất ngờ hoặc cảm động.",
    voice: "dialogue",
    structure: [
      "hook: a striking image or line that raises a question in the first 2 seconds",
      "setup: who the protagonist is and what they want",
      "inciting incident: something disrupts their world",
      "rising tension: obstacles, stakes get higher",
      "midpoint twist: new information changes everything",
      "crisis: the hardest moment, all seems lost",
      "climax: the decisive action",
      "resolution: the emotional payoff",
      "final image: a memorable closing shot that echoes the opening",
    ],
    guidance:
      "Write a real micro-story with ONE protagonist (give them a name, age, look, wardrobe) and at most two other characters. Short, natural spoken lines (max ~12 words per clip, it must fit in 10 seconds). Show, don't tell. Every clip must move the story forward; end with a twist or an emotional payoff.",
    look: "cinematic 35mm film look, shallow depth of field, motivated lighting, consistent color grade",
    captionStyle: "a one-line emotional teaser that does not spoil the ending, plus a question to the viewer",
  },
  comedy: {
    key: "comedy",
    label: "Giải trí / Hài",
    description: "Tình huống hài, bất ngờ, dễ chia sẻ.",
    voice: "dialogue",
    structure: [
      "hook: an absurd or relatable situation shown immediately",
      "setup: the normal expectation",
      "escalation: things get sillier",
      "escalation: bigger and more absurd",
      "punchline: the unexpected reversal",
      "tag: a final extra gag",
    ],
    guidance:
      "Relatable everyday situations, exaggerated reactions, clear visual gags that work even without sound. Timing matters: one beat per clip, the punchline lands in the last clips. Keep it kind: no insults, no stereotypes about groups of people.",
    look: "bright, colorful, sitcom-style lighting, expressive faces, medium shots",
    captionStyle: "short, playful, with an emoji and a 'tag a friend who…' call to action",
  },
  documentary: {
    key: "documentary",
    label: "Tài liệu / Kiến thức",
    description: "Giải thích một sự thật, hiện tượng, lịch sử, thiên nhiên.",
    voice: "voiceover",
    structure: [
      "hook: a surprising fact or question stated over a powerful visual",
      "context: what we are looking at",
      "the key fact, shown visually",
      "how or why it works",
      "a surprising detail most people don't know",
      "the bigger picture / consequence",
      "a memorable closing line",
    ],
    guidance:
      "A narrator explains; visuals illustrate each sentence literally. Facts must be accurate and widely accepted: no invented numbers, no medical/financial advice. One idea per clip, about 20 spoken words max per clip.",
    look: "nature/history documentary style, high detail, natural light, slow deliberate camera moves",
    captionStyle: "the most surprising fact as the first line, then 'Bạn đã biết chưa?'",
  },
  top_list: {
    key: "top_list",
    label: "Top / Danh sách",
    description: "Top N thứ nhất, lạ nhất, đáng thử nhất…",
    voice: "voiceover",
    structure: [
      "hook: announce the list and why it matters",
      "item (count down)",
      "item (count down)",
      "item (count down)",
      "item (count down)",
      "number 1: the most impressive item",
      "outro: a quick recap or question to the viewer",
    ],
    guidance:
      "Count down so number 1 comes last. Each clip = one item, introduced by its number and name in the narration. Items must be real and verifiable.",
    look: "punchy, high-contrast, dynamic camera, each item in its own setting",
    captionStyle: "'Top N …' as the title line, ask viewers which one surprised them most",
  },
  storytelling: {
    key: "storytelling",
    label: "Kể chuyện",
    description: "Truyện cổ tích, truyền thuyết, giai thoại, chuyện có thật được kể lại.",
    voice: "voiceover",
    structure: [
      "hook: 'Ngày xửa ngày xưa…' style opening with an intriguing image",
      "the setting and the main character",
      "the problem",
      "the attempt",
      "the turn of events",
      "the outcome",
      "the moral or the legacy",
    ],
    guidance:
      "A warm storyteller narrates in the target language; visuals act out the story. Keep the same characters and costumes in every clip. End with a short moral or a fascinating fact about the story.",
    look: "painterly cinematic, warm lantern light, rich costumes and period-accurate settings",
    captionStyle: "the story's title and a one-line hook, ask viewers if they knew this story",
  },
  product_ad: {
    key: "product_ad",
    label: "Quảng cáo sản phẩm",
    description: "Giới thiệu sản phẩm/dịch vụ, nêu vấn đề → giải pháp → kêu gọi hành động.",
    voice: "voiceover",
    structure: [
      "hook: the problem the viewer recognises",
      "the product appears as the solution, hero shot",
      "key benefit in use",
      "second benefit / detail close-up",
      "social proof or result",
      "call to action with the product on screen",
    ],
    guidance:
      "The product must look exactly like the reference images in every clip. Benefits must be truthful: no fake claims, no fake reviews, no competitor bashing. End with a clear call to action.",
    look: "premium commercial lighting, clean backgrounds, macro detail shots, smooth gimbal moves",
    captionStyle: "benefit-led first line, then a clear call to action",
  },
  relaxing: {
    key: "relaxing",
    label: "Thư giãn / Cảnh đẹp",
    description: "Cảnh thiên nhiên, thành phố, ASMR hình ảnh, không lời.",
    voice: "none",
    structure: [
      "establishing wide shot of the place",
      "slow detail shot",
      "a gentle movement through the scene",
      "light changes (sunrise, rain, lanterns…)",
      "close detail with texture and sound",
      "a calm final wide shot",
    ],
    guidance:
      "No speech at all: natural ambient sound only (wind, rain, water, birds, city hum). Very slow, smooth camera moves, no cuts within a clip. Every clip continues the same place and time of day progression.",
    look: "ultra-detailed, soft natural light, gentle slow motion, calm color palette",
    captionStyle: "a calm one-liner describing the place and the mood",
  },
};

export function genreOf(key: string | null | undefined): GenreTemplate {
  return GENRES[(key as GenreKey) in GENRES ? (key as GenreKey) : "short_film"];
}

/** Picks n beats from the structure, keeping the first (hook) and the last, spreading the middle evenly. */
export function beats(genre: GenreTemplate, n: number): string[] {
  const s = genre.structure;
  if (n <= 0) return [];
  if (n === 1) return [s[0]];
  if (n >= s.length) {
    // more clips than beats: repeat middle beats as "continued"
    const out = [s[0]];
    for (let i = 1; i < n - 1; i++) {
      const src = 1 + Math.floor(((i - 1) * (s.length - 2)) / Math.max(1, n - 2));
      out.push(src < s.length - 1 ? s[src] : s[s.length - 2]);
    }
    out.push(s[s.length - 1]);
    return out;
  }
  const out = [s[0]];
  for (let i = 1; i < n - 1; i++) out.push(s[Math.round((i * (s.length - 1)) / (n - 1))]);
  out.push(s[s.length - 1]);
  return out;
}
