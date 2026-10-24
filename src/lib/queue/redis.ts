import IORedis from "ioredis";

// One connection per process, reused by the queue (web app) and the worker. Created on first use, not at import.
const globalForRedis = globalThis as unknown as {
  redisConnection: IORedis | undefined;
};

export function getRedisConnection(): IORedis {
  if (!globalForRedis.redisConnection) {
    const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6389";
    globalForRedis.redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
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
