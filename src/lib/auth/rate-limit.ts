import { getRedisConnection } from "@/lib/queue/redis";

/**
 * Fixed-window counter in Redis (shared by every Next/worker process). Falls back to process memory if Redis is down,
 * so a Redis outage weakens but never disables the limit.
 */
const memory = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

// the shared connection queues commands forever while Redis is down (maxRetriesPerRequest: null): never let a login hang on it
function withTimeout<T>(p: Promise<T>, ms = 1500): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("redis timeout")), ms))]);
}

export async function hit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const k = `rl:${key}`;
  try {
    const redis = getRedisConnection();
    const [[, count], [, ttl]] = (await withTimeout(redis.multi().incr(k).ttl(k).exec())) as [[unknown, number], [unknown, number]];
    if (ttl < 0) await withTimeout(redis.expire(k, windowSec));
    return { allowed: count <= limit, retryAfterSec: Math.max(ttl > 0 ? ttl : windowSec, 1) };
  } catch {
    const now = Date.now();
    const cur = memory.get(k);
    const entry = cur && cur.resetAt > now ? cur : { count: 0, resetAt: now + windowSec * 1000 };
    entry.count++;
    memory.set(k, entry);
    return { allowed: entry.count <= limit, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
}

export async function reset(key: string): Promise<void> {
  memory.delete(`rl:${key}`);
  try {
    await withTimeout(getRedisConnection().del(`rl:${key}`));
  } catch {}
}
