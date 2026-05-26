/**
 * Thin Redis cache for the KOL leaderboard API.
 *
 * Sits between `/api/kol-leaderboard` and Postgres. The poller writes Neon
 * every ~30s; this layer holds the rendered API payload for a short TTL so
 * concurrent clients within the window share a single Postgres read.
 *
 * Degrades silently: if REDIS_URL is unset, the connection drops, or any
 * command exceeds its short timeout, the cache helpers return null and the
 * caller falls back to Postgres. Redis being down must never break the page.
 */

import Redis from "ioredis";

const COMMAND_TIMEOUT_MS = 500;

let _client: Redis | null = null;
let _disabled = false;
let _loggedDisabled = false;

function logDisabled(reason: string): void {
  if (_loggedDisabled) return;
  _loggedDisabled = true;
  console.warn(`[kolRedisCache] cache disabled — ${reason}`);
}

function getClient(): Redis | null {
  if (_disabled) return null;
  if (_client) return _client;

  const url = process.env.REDIS_URL;
  if (!url) {
    _disabled = true;
    logDisabled("REDIS_URL unset");
    return null;
  }

  try {
    _client = new Redis(url, {
      // Fail fast so a flaky Redis doesn't drag the API request out.
      maxRetriesPerRequest: 1,
      commandTimeout: COMMAND_TIMEOUT_MS,
      // Don't queue commands while disconnected — better to MISS than to
      // block on a backlog when Redis comes back.
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        if (times > 5) return null; // give up reconnecting; cache stays cold
        return Math.min(times * 200, 2_000);
      },
    });

    _client.on("error", (err) => {
      // ioredis fires this on every reconnect attempt while down. Log once
      // at warning level; the retry strategy handles the rest.
      if (!_loggedDisabled) {
        _loggedDisabled = true;
        console.warn(`[kolRedisCache] redis error: ${err.message}`);
      }
    });
    return _client;
  } catch (err) {
    _disabled = true;
    logDisabled(`init failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    const result = await Promise.race([p, timeout]);
    return result as T | null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface CachedEnvelope<T> {
  value: T;
  cachedAt: number;
}

export async function getCached<T>(
  key: string,
): Promise<CachedEnvelope<T> | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const raw = await withTimeout(client.get(key), COMMAND_TIMEOUT_MS);
    if (!raw) return null;
    return JSON.parse(raw) as CachedEnvelope<T>;
  } catch {
    return null;
  }
}

export async function setCached<T>(
  key: string,
  value: T,
  ttlSec: number,
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const envelope: CachedEnvelope<T> = { value, cachedAt: Date.now() };
    await withTimeout(
      client.setex(key, ttlSec, JSON.stringify(envelope)),
      COMMAND_TIMEOUT_MS,
    );
  } catch {
    // Swallow: missing a write just means the next request will be a MISS.
  }
}
