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
  KolLeaderboardResponse,
  KolTimeframe,
  KolTraderEntry,
} from "~/utils/kolApi";

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

  try {
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

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    return res.status(200).json({ data: payload });
  } catch (err) {
    console.error("[GET /api/kol-leaderboard] failed:", err);
    return res.status(500).json({
      error: "Failed to fetch KOL leaderboard",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
