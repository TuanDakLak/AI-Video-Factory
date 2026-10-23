/**
 * Loads `.env` for plain Node entry points (worker, scripts). Next.js does this itself; the worker used to get its
 * variables only as a side effect of Prisma loading them on first connect, so anything read earlier (or in code that
 * never touches the database, like the LLM script writer) silently ran without them. Variables already set in the
 * environment win. Import this FIRST.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // no .env (CI, production with real environment variables): nothing to load
}

export {};
