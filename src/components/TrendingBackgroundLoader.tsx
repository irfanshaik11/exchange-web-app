/**
 * Global background data loader — mounts at the app root so every page's
 * data is pre-fetched before the user navigates there.
 *
 * Pattern used throughout:
 *  - Singleton WebSocket hooks (useTrendingWebSocket, useDexScreenerTrending,
 *    usePumpPortalWebSocket) keep one connection alive and fill their
 *    module-level token maps in the background.
 *  - React Query hooks (useQueryNewPairs, etc.) populate the persisted cache
 *    so Trenches renders immediately from cache on first navigation.
 *  - useEffect-based prefetches (portfolio trade history) seed localStorage
 *    so pages skip their loading state on mount.
 */

import { useEffect } from "react";
import useTrendingWebSocket from "~/hooks/useTrendingWebSocket";
import useDexScreenerTrending from "~/hooks/useDexScreenerTrending";
import usePumpPortalWebSocket from "~/hooks/usePumpPortalWebSocket";
import {
  useQueryNewPairs,
  useQueryFinalStretch,
  useQueryMigrated,
  useQueryLaunchpadData,
} from "~/hooks/useQueryTokens";
import { useUser } from "~/components/UserContext";
import { getTradeActivityByUser } from "~/utils/functions";
import {
  prefetchXStocks,
  prefetchNewPairs,
  prefetchPumpLive,
} from "~/utils/discoverPrefetch";

// ─── Trending / Discover tabs ─────────────────────────────────────────────────

function TrendingWsPreloader() {
  // One WS for all timeframes (1m/5m/30m/1h are delivered in a single snapshot).
  useTrendingWebSocket({ timeframe: "1h", enabled: true });
  // REST pre-fetch (instant from Redis) + live delta WS.
  useDexScreenerTrending(true);
  // PumpPortal WS — tokens accumulate while the user is on other tabs.
  usePumpPortalWebSocket({ enabled: true });
  return null;
}

// ─── Trenches (pulse) tab ─────────────────────────────────────────────────────

function TrenchesQueryPreloader() {
  // Calling these hooks here populates the React Query cache (persisted in
  // localStorage as INTERSTATE_CACHE_V1). When pulse.tsx mounts it finds
  // fresh data immediately via placeholderData and skips its loading state.
  useQueryNewPairs(true);
  useQueryFinalStretch(true);
  useQueryMigrated(true);
  useQueryLaunchpadData(true);
  return null;
}

// ─── Portfolio tab ────────────────────────────────────────────────────────────

// Must match the key format in portfolio.tsx: `trade_history_cache_${userId}_${chain}`
const PORTFOLIO_TRADE_CACHE_TTL = 2 * 60 * 1000; // 2 minutes — refresh if older

function PortfolioPreloader() {
  const { user } = useUser();

  useEffect(() => {
    if (!user?.id) return;

    // Prefetch for both chains so switching chains is instant too.
    const chains: Array<{ chain: string; blockchain: string }> = [
      { chain: "sol", blockchain: "solana" },
      { chain: "monad", blockchain: "monad" },
    ];

    for (const { chain, blockchain } of chains) {
      const cacheKey = `trade_history_cache_${user.id}_${chain}`;

      // Skip if cache is still fresh — portfolio.tsx will read this exact key.
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const { timestamp } = JSON.parse(raw);
          if (Date.now() - timestamp < PORTFOLIO_TRADE_CACHE_TTL) continue;
        }
      } catch {}

      // Fetch in background and write using the same { data, timestamp } format
      // that portfolio.tsx reads (line 443: `parsed.data`).
      getTradeActivityByUser(user.id, blockchain)
        .then((data) => {
          if (!Array.isArray(data) || data.length === 0) return;
          try {
            localStorage.setItem(
              cacheKey,
              JSON.stringify({ data, timestamp: Date.now() }),
            );
          } catch {}
        })
        .catch(() => {});
    }
  }, [user?.id]);

  return null;
}

// ─── Discover REST tabs (xStocks, New Pairs, Pump Live) ─────────────────────

function DiscoverRestPreloader() {
  useEffect(() => {
    // Fire all three prefetches in parallel — they write to the same
    // localStorage / sessionStorage keys that discover.tsx reads on mount,
    // so the page skips its loading state entirely.
    prefetchXStocks();
    prefetchNewPairs("sol");
    prefetchNewPairs("monad");
    prefetchPumpLive();
  }, []);

  return null;
}

// ─── Root export ──────────────────────────────────────────────────────────────

export function TrendingBackgroundLoader() {
  return (
    <>
      <TrendingWsPreloader />
      <TrenchesQueryPreloader />
      <PortfolioPreloader />
      <DiscoverRestPreloader />
    </>
  );
}
