/**
 * KOL Leaderboard API Utilities
 *
 * The wallet-tracker backend owns the canonical, DB-backed implementation
 * (`/api/kol-leaderboard` served from `KolLeaderboardRow` and refreshed by
 * the kolscan-poller worker every 30 min). The Next.js app also ships a
 * self-contained fallback at the same path that proxies kolscan with an
 * in-memory cache — used until the backend is deployed.
 *
 * To target the backend, set `NEXT_PUBLIC_KOL_LEADERBOARD_USE_BACKEND=true`
 * and ensure `NEXT_PUBLIC_BACKEND_URL` is pointed at the wallet-tracker
 * backend. Default is same-origin (frontend fallback).
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

function useBackend(): boolean {
  // Opt-in flag — keep default same-origin until the backend deploys, then
  // flip via env without touching code.
  return (
    process.env.NEXT_PUBLIC_KOL_LEADERBOARD_USE_BACKEND === "true" ||
    process.env.NEXT_PUBLIC_KOL_LEADERBOARD_USE_BACKEND === "1"
  );
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function getBaseUrl(): string {
  if (useBackend()) {
    const envUrl = env.NEXT_PUBLIC_BACKEND_URL || "";
    if (typeof window === "undefined") return stripTrailingSlash(envUrl);
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

  // Default: same-origin → hits the Next.js route at /api/kol-leaderboard.
  if (typeof window === "undefined") return "";
  return stripTrailingSlash(window.location.origin);
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
