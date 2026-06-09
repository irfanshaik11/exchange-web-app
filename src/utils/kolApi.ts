/**
 * KOL Leaderboard API Utilities
 *
 * The wallet-tracker backend owns the canonical, DB-backed implementation
 * (`GET /api/kol-leaderboard` served from `KolLeaderboardRow` and refreshed
 * by the kolscan-poller worker every 30 min). We always call it directly via
 * `NEXT_PUBLIC_WALLET_TRACKER_URL`.
 *
 * If that env var is unset we fall back to same-origin, which hits the Next.js
 * app's self-contained route at the same path — handy for local dev without a
 * running tracker backend.
 */

import { env } from "../env";

// ============================================================
// TYPES
// ============================================================

export type KolTimeframe = "DAILY" | "WEEKLY" | "MONTHLY";

export interface KolTraderEntry {
  rank: number;
  walletAddress: string;
  name: string;
  twitter: string | null;
  telegram: string | null;
  profit: number;
  wins: number;
  losses: number;
  winRate: number;
  timeframe: KolTimeframe;
}

export interface KolLeaderboardResponse {
  entries: KolTraderEntry[];
  total: number;
  timeframe: KolTimeframe;
}

export type KolCacheSource = "redis" | "postgres" | "disabled";

export interface KolCacheMeta {
  hit: boolean;
  source: KolCacheSource;
  cachedAt: number | null; // epoch ms; null if not a Redis hit
}

export interface KolLeaderboardResult {
  data: KolLeaderboardResponse;
  cache: KolCacheMeta;
}

// ============================================================
// HELPERS
// ============================================================

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function getBaseUrl(): string {
  // The wallet-tracker backend owns the canonical /api/kol-leaderboard.
  // NEXT_PUBLIC_* vars are inlined at build time; read process.env on the
  // server and the validated `env` object in the browser.
  const envUrl =
    typeof window === "undefined"
      ? process.env.NEXT_PUBLIC_WALLET_TRACKER_URL || ""
      : env.NEXT_PUBLIC_WALLET_TRACKER_URL || "";

  // No tracker URL configured → same-origin, so local dev against the
  // Next.js fallback route still works.
  if (!envUrl) {
    if (typeof window === "undefined") return "";
    return stripTrailingSlash(window.location.origin);
  }

  if (typeof window === "undefined") return stripTrailingSlash(envUrl);

  try {
    const url = new URL(envUrl);
    // Avoid mixed-content: upgrade http→https when the page is on https.
    if (window.location.protocol === "https:" && url.protocol === "http:") {
      url.protocol = "https:";
    }
    return stripTrailingSlash(url.toString());
  } catch {
    return stripTrailingSlash(window.location.origin);
  }
}

// ============================================================
// API FUNCTIONS
// ============================================================

export async function getKolLeaderboard(
  timeframe: KolTimeframe,
  options: { limit?: number; offset?: number } = {},
): Promise<KolLeaderboardResult> {
  const params = new URLSearchParams({ timeframe });
  if (options.limit) params.set("limit", options.limit.toString());
  if (options.offset) params.set("offset", options.offset.toString());

  const response = await fetch(
    `${getBaseUrl()}/api/kol-leaderboard?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch KOL leaderboard: ${response.status}`);
  }

  const body = (await response.json()) as {
    data: KolLeaderboardResponse;
    cache?: KolCacheMeta;
  };
  return {
    data: body.data,
    cache: body.cache ?? { hit: false, source: "postgres", cachedAt: null },
  };
}
