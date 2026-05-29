/**
 * KOL leaderboard read endpoint.
 *
 * Backed by the Postgres `kol_leaderboard` table (see src/utils/kolscanStore.ts).
 * The store auto-bootstraps the table, refreshes from kolscan in the background
 * whenever the rows are older than 30 min, and blocks only on cold start.
 *
 * Explicit refreshes happen via /api/cron/refresh-kol-leaderboard (k8s CronJob,
 * Vercel Cron, or curl) — but the page stays fresh under normal traffic even
 * without an external scheduler.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import {
  getRows,
  type KolscanTimeframeId,
} from "~/utils/kolscanStore";
import type {
  KolCacheMeta,
  KolLeaderboardResponse,
  KolTimeframe,
  KolTraderEntry,
} from "~/utils/kolApi";
import { getCached, setCached } from "~/utils/kolRedisCache";

// Cache the rendered payload for slightly less than the React Query interval
// so concurrent clients within the window share one Postgres read but no
// individual client serves data more than ~20s older than what's in the DB.
const REDIS_TTL_SEC = 20;

const TIMEFRAME_TO_ID: Record<KolTimeframe, KolscanTimeframeId> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 30,
};

function parseTimeframe(value: unknown): KolTimeframe | null {
  if (typeof value !== "string") return null;
  const upper = value.toUpperCase();
  if (upper === "DAILY" || upper === "WEEKLY" || upper === "MONTHLY") {
    return upper;
  }
  return null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const timeframe = parseTimeframe(req.query.timeframe);
  if (!timeframe) {
    return res
      .status(400)
      .json({ error: "Missing or invalid `timeframe` (DAILY|WEEKLY|MONTHLY)" });
  }

  const limit = clamp(Number(req.query.limit ?? 1000) || 1000, 1, 5000);
  const offset = clamp(Number(req.query.offset ?? 0) || 0, 0, 100_000);

  const cacheKey = `kol:lb:${timeframe}:${limit}:${offset}`;

  try {
    // Redis layer — try first, fall back to Postgres on miss / failure / no
    // REDIS_URL. getCached returns null in all failure modes so a flaky cache
    // can't break the page.
    const cached = await getCached<KolLeaderboardResponse>(cacheKey);
    if (cached) {
      const cacheMeta: KolCacheMeta = {
        hit: true,
        source: "redis",
        cachedAt: cached.cachedAt,
      };
      res.setHeader("X-Cache", "HIT");
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=10, stale-while-revalidate=20",
      );
      return res.status(200).json({ data: cached.value, cache: cacheMeta });
    }

    const { rows, total } = await getRows(
      TIMEFRAME_TO_ID[timeframe],
      limit,
      offset,
    );

    const entries: KolTraderEntry[] = rows.map((row) => {
      const wins = Number(row.wins) || 0;
      const losses = Number(row.losses) || 0;
      const denom = wins + losses;
      return {
        rank: Number(row.rank),
        walletAddress: row.wallet_address,
        name: row.name,
        twitter: row.twitter ?? null,
        telegram: row.telegram ?? null,
        profit: Number(row.profit),
        wins,
        losses,
        winRate: denom > 0 ? (wins / denom) * 100 : 0,
        timeframe,
      };
    });

    const payload: KolLeaderboardResponse = {
      entries,
      total,
      timeframe,
    };

    // Fire-and-forget the cache write — a slow Redis must never delay the
    // response, and a failed write just means the next request is another MISS.
    void setCached(cacheKey, payload, REDIS_TTL_SEC);

    const cacheMeta: KolCacheMeta = {
      hit: false,
      source: process.env.REDIS_URL ? "postgres" : "disabled",
      cachedAt: null,
    };

    // Poller writes Neon every 30s; cap edge cache well below that so two
    // consecutive client polls don't get served the same byte-identical
    // payload from a CDN.
    res.setHeader("X-Cache", "MISS");
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=10, stale-while-revalidate=20",
    );
    return res.status(200).json({ data: payload, cache: cacheMeta });
  } catch (err) {
    console.error("[GET /api/kol-leaderboard] failed:", err);
    return res.status(500).json({
      error: "Failed to fetch KOL leaderboard",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
