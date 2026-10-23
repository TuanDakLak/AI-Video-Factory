import { getRedisConnection } from "@/lib/queue/redis";

/**
 * Free, key-less trend signals for topic research. Each source fails soft (returns []), is cached for an hour in Redis
 * (shared by every channel with the same language), and has its parser exported for offline tests.
 *  - Google Trends "trending now" RSS: what people search today in a country (+ related news headlines)
 *  - Wikipedia pageviews top: what people read yesterday in a language (evergreen curiosity: history, science, people)
 *  - Google News RSS search: recent news in the channel's language for the niche's key phrases
 * (GDELT was tried first: its keyword search finds nothing for Vietnamese with diacritics and it rate-limits hard.)
 */

export interface Signal {
  source: "google_trends" | "wikipedia" | "news";
  title: string;
  detail?: string; // traffic, views, headline…
  url?: string;
}

const UA = "AIContentFactory/1.0 (topic research; contact: admin@localhost)";

/** language code -> Google Trends / Google News country, Wikipedia project, Google News language */
const LOCALES: Record<string, { geo: string; wiki: string; hl: string }> = {
  vi: { geo: "VN", wiki: "vi", hl: "vi" },
  en: { geo: "US", wiki: "en", hl: "en-US" },
  ja: { geo: "JP", wiki: "ja", hl: "ja" },
  ko: { geo: "KR", wiki: "ko", hl: "ko" },
  zh: { geo: "TW", wiki: "zh", hl: "zh-TW" },
  th: { geo: "TH", wiki: "th", hl: "th" },
  id: { geo: "ID", wiki: "id", hl: "id" },
  es: { geo: "ES", wiki: "es", hl: "es" },
  fr: { geo: "FR", wiki: "fr", hl: "fr" },
};
export const localeOf = (lang: string) => LOCALES[lang] ?? LOCALES.en;

// ------------------------------------------------------------------ cache

function withTimeout<T>(p: Promise<T>, ms = 1500): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

async function cached(key: string, ttlSec: number, load: () => Promise<Signal[]>): Promise<Signal[]> {
  const k = `research:${key}`;
  try {
    const hit = await withTimeout(getRedisConnection().get(k));
    if (hit) return JSON.parse(hit);
  } catch {}
  const fresh = await load().catch(() => [] as Signal[]);
  if (fresh.length) {
    try {
      await withTimeout(getRedisConnection().set(k, JSON.stringify(fresh), "EX", ttlSec));
    } catch {}
  }
  return fresh;
}

// ------------------------------------------------------------------ parsers (pure)

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
const tag = (xml: string, name: string) => {
  // attributes allowed: Google News uses <source url="…">Publisher</source>
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decode(m[1]) : "";
};

export function parseTrendsRss(xml: string): Signal[] {
  const out: Signal[] = [];
  for (const item of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const title = tag(item, "title");
    if (!title) continue;
    const traffic = tag(item, "ht:approx_traffic");
    const news = (item.match(/<ht:news_item>[\s\S]*?<\/ht:news_item>/g) ?? []).slice(0, 2);
    const headlines = news.map((n) => tag(n, "ht:news_item_title")).filter(Boolean);
    out.push({
      source: "google_trends",
      title,
      detail: [traffic && `${traffic} lượt tìm`, ...headlines].filter(Boolean).join(" — "),
      url: news[0] ? tag(news[0], "ht:news_item_url") || undefined : undefined,
    });
  }
  return out;
}

/** Pages that are always on top and say nothing about interest, or that a family-friendly channel must never use. */
const WIKI_SKIP = /^(Trang_Chính|Main_Page|Đặc_biệt:|Special:|Wikipedia:|Tập_tin:|File:|Thể_loại:|Category:|Portal:|Cổng_thông_tin:)|sex|tình_dục|khiêu_dâm|porn/i;

export function parseWikipediaTop(json: unknown, wiki: string, limit = 40): Signal[] {
  const articles = ((json as any)?.items?.[0]?.articles ?? []) as { article: string; views: number }[];
  return articles
    .filter((a) => !WIKI_SKIP.test(a.article))
    .slice(0, limit)
    .map((a) => ({
      source: "wikipedia" as const,
      title: a.article.replace(/_/g, " "),
      detail: `${a.views} lượt đọc`,
      url: `https://${wiki}.wikipedia.org/wiki/${encodeURIComponent(a.article)}`,
    }));
}

/** Spam, gambling, referral codes and adult content never become topic ideas. */
const NEWS_SPAM = /mã giới thiệu|referral|casino|cá cược|nhà cái|xổ số|\bbet\b|binance|crypto|airdrop|khiêu dâm|18\+/i;

/** Google News RSS: "<headline> - <publisher>" items. Drops spam and keeps one headline per publisher per query. */
export function parseGoogleNews(xml: string, limit = 10): Signal[] {
  const out: Signal[] = [];
  const seen = new Set<string>();
  for (const item of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const publisher = tag(item, "source");
    let title = tag(item, "title");
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3));
    if (title.length < 15 || NEWS_SPAM.test(title) || seen.has(publisher)) continue;
    seen.add(publisher);
    out.push({ source: "news", title, detail: publisher || undefined, url: tag(item, "link") || undefined });
    if (out.length >= limit) break;
  }
  return out;
}

/** Niche text -> up to 3 search phrases (comma/semicolon separated parts, 2-5 words each). */
export function nichePhrases(niche: string): string[] {
  return niche
    .split(/[,;\n/]+| và | and /i)
    .map((p) => p.replace(/["()]/g, " ").replace(/\s+/g, " ").trim())
    .map((p) => p.split(" ").slice(0, 5).join(" "))
    .filter((p) => p.length >= 4)
    .slice(0, 3);
}

// ------------------------------------------------------------------ fetchers

export async function googleTrends(lang: string): Promise<Signal[]> {
  const { geo } = localeOf(lang);
  return cached(`trends:${geo}`, 3600, async () => {
    const r = await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    return r.ok ? parseTrendsRss(await r.text()) : [];
  });
}

export async function wikipediaTop(lang: string): Promise<Signal[]> {
  const { wiki } = localeOf(lang);
  const d = new Date(Date.now() - 36 * 3600 * 1000); // yesterday's data is published during the day
  const [y, m, day] = d.toISOString().slice(0, 10).split("-");
  return cached(`wiki:${wiki}:${y}${m}${day}`, 6 * 3600, async () => {
    const r = await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${wiki}.wikipedia/all-access/${y}/${m}/${day}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    return r.ok ? parseWikipediaTop(await r.json(), wiki) : [];
  });
}

/** Recent news (last 7 days) in the channel's language for each niche phrase. */
export async function googleNews(niche: string, lang: string): Promise<Signal[]> {
  const { geo, hl } = localeOf(lang);
  const lists = await Promise.all(
    nichePhrases(niche).map((phrase) =>
      cached(`news:${hl}:${phrase.toLowerCase()}`, 3600, async () => {
        const q = encodeURIComponent(`${phrase} when:7d`);
        const r = await fetch(`https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${geo}&ceid=${geo}:${hl.split("-")[0]}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AIContentFactory/1.0)" },
          signal: AbortSignal.timeout(15000),
        });
        return r.ok ? parseGoogleNews(await r.text()) : [];
      })
    )
  );
  const seen = new Set<string>();
  return lists.flat().filter((s) => !seen.has(s.title) && seen.add(s.title));
}

export async function collectSignals(niche: string, lang: string): Promise<{ signals: Signal[]; sources: Record<string, number> }> {
  const [trends, wiki, news] = await Promise.all([googleTrends(lang), wikipediaTop(lang), googleNews(niche, lang)]);
  // niche news first: it is the most relevant to the channel; then today's searches; then evergreen reading
  return { signals: [...news, ...trends, ...wiki], sources: { google_trends: trends.length, wikipedia: wiki.length, news: news.length } };
}
