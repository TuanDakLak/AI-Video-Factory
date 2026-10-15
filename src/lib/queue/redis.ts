import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6389";

// Global Redis instance for reuse in serverless/worker environments
const globalForRedis = globalThis as unknown as {
  redisConnection: IORedis | undefined;
};

export function getRedisConnection(): IORedis {
  if (!globalForRedis.redisConnection) {
    globalForRedis.redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });

    globalForRedis.redisConnection.on("error", (err) => {
      console.error("[Redis Connection Error]:", err.message);
    });

    globalForRedis.redisConnection.on("connect", () => {
      console.log("[Redis] Connected successfully to:", redisUrl);
    });
  }

  return globalForRedis.redisConnection;
}

export const redisConnection = getRedisConnection();
