import { createClient, type RedisClientType } from "redis";
import { createLogger } from "./logger";

const log = createLogger("redis");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Fail-fast: require REDIS_URL in production to prevent accidental localhost usage.
// Allow fallback to localhost only in non-production environments.
function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (url) return url;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "REDIS_URL environment variable is required in production. " +
        "Set it to your Redis instance URL (e.g., redis://host:port)."
    );
  }

  log.warn("REDIS_URL not set, falling back to localhost (development only)");
  return "redis://localhost:6379";
}

// Parse hostname:port from URL for safe logging (avoids leaking credentials).
function getServerLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || 6379}`;
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const redisUrl = getRedisUrl();
const serverLabel = getServerLabel(redisUrl);

export const redis: RedisClientType = createClient({
  url: redisUrl,
  socket: {
    // Fail fast if Redis doesn't respond within 5 seconds.
    connectTimeout: 5000,
    // Exponential backoff capped at 3s: 100ms, 200ms, 400ms, 800ms, 1600ms, 3000ms, ...
    // Retries indefinitely — production services should survive transient Redis outages.
    reconnectStrategy: (retries) => Math.min(100 * 2 ** retries, 3000),
  },
});

// ---------------------------------------------------------------------------
// Lifecycle logging
// ---------------------------------------------------------------------------

redis.on("connect", () => {
  log.info("Connecting to Redis", { server: serverLabel });
});

redis.on("ready", () => {
  log.info("Redis ready", { server: serverLabel });
});

redis.on("reconnecting", () => {
  log.warn("Redis reconnecting", { server: serverLabel });
});

redis.on("end", () => {
  log.info("Redis connection closed", { server: serverLabel });
});

redis.on("error", (err: Error) => {
  log.error("Redis client error", err, { server: serverLabel });
});

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

// Cache the in-flight connection promise to prevent concurrent connect() calls.
// Multiple simultaneous calls to connectRedis() will share the same promise
// until it resolves or rejects, at which point it is cleared.
let connectionPromise: Promise<void> | null = null;

export async function connectRedis(): Promise<void> {
  // If already connected, return immediately.
  if (redis.isOpen) {
    return;
  }

  // If a connection attempt is in progress, reuse it.
  if (connectionPromise) {
    return connectionPromise;
  }

  // Start a new connection and cache the promise.
  connectionPromise = (async () => {
    try {
      await redis.connect();
    } catch (err) {
      // Clear the cached promise so future retries can attempt again.
      connectionPromise = null;
      throw err;
    }
  })();

  // Clear the cache once the connection is established or fails.
  // On success, the promise resolves to undefined.
  // On failure, the error propagates to the caller after clearing.
  return connectionPromise.finally(() => {
    connectionPromise = null;
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

// Safe to call multiple times — redis.quit() is idempotent once the connection
// is closed. Returns a promise that resolves when the connection is fully closed.
export async function disconnectRedis(): Promise<void> {
  if (!redis.isOpen) {
    return;
  }

  try {
    await redis.quit();
    log.info("Redis disconnected gracefully", { server: serverLabel });
  } catch (err) {
    log.error("Error during Redis disconnect", err, { server: serverLabel });
    // Force close if quit fails (e.g., pending commands).
    redis.disconnect();
    log.warn("Redis force-disconnected", { server: serverLabel });
  }
}
