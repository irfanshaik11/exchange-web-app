/**
 * KOL Leaderboard API Utilities
 *
 * Functions for fetching KOL trader leaderboard data from the backend.
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

// ============================================================
// HELPERS
// ============================================================

function getBaseUrl(): string {
  const envUrl = env.NEXT_PUBLIC_BACKEND_URL || "";
  const stripTrailingSlash = (url: string) =>
    url.endsWith("/") ? url.slice(0, -1) : url;

  if (typeof window === "undefined") {
    return stripTrailingSlash(envUrl);
  }

  try {
    const url = new URL(envUrl || window.location.origin);
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
): Promise<KolLeaderboardResponse> {
  const params = new URLSearchParams({ timeframe });
  if (options.limit) params.set("limit", options.limit.toString());
  if (options.offset) params.set("offset", options.offset.toString());

  const response = await fetch(
    `${getBaseUrl()}/api/kol-leaderboard?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch KOL leaderboard: ${response.status}`);
  }

  const data = await response.json();
  return data.data;
}
