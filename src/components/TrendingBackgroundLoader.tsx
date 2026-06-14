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

import { useEffect, useRef } from "react";
import useTrendingWebSocket, {
  type TrendingTimeframe,
} from "~/hooks/useTrendingWebSocket";
import {
  preloadTrendingImages,
  prefetchSparklines,
} from "~/utils/trendingPreload";
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

// Background warm cadence. Trending WS pushes arrive every few seconds and
// `tokens` gets a new identity on each, so both passes are throttled:
//  - images every 10s (per-URL dedup makes repeats free, the throttle just
//    avoids re-walking the top-50 on every push)
//  - sparklines every 60s (these fire real OHLC fetches on cache misses;
//    combined with the 5-min sparkline cache TTL this keeps background
//    traffic to a few small same-origin requests per minute)
const IMAGE_PRELOAD_INTERVAL_MS = 10 * 1000;
const SPARKLINE_PREFETCH_INTERVAL_MS = 60 * 1000;

// Timeframe board the user will land on when they open /discover — mirrors
// discover.tsx's selectedTimeframe initializer (saved Top tab defaults to
// 30m; Trending/Gainers default to 1h). Re-read on every prefetch cycle so a
// mid-session tab switch warms the board they'll actually return to.
function getLandingTimeframe(): TrendingTimeframe {
  if (typeof window !== "undefined") {
    try {
      if (localStorage.getItem("discover_tab_v4") === "top") return "30m";
    } catch {}
  }
  return "1h";
}

// Per-board warm size. Trending boards are curated to ~50 tokens, so 60
// covers the WHOLE board — important because Gainers/Top re-sort the same
// board (by % change / composite), so any row can be above the fold.
const BOARD_WARM_LIMIT = 60;

function TrendingWsPreloader() {
  // One WS delivers all timeframes in a single snapshot; the hook's
  // `timeframe` only selects which slice it returns. Subscribing to all four
  // boards here lets us warm every board the Trending/Gainers/Top tabs can
  // show (they all render this same feed, just different windows/sorts).
  const { tokens: tokens1m } = useTrendingWebSocket({
    timeframe: "1m",
    enabled: true,
  });
  const { tokens: tokens5m } = useTrendingWebSocket({
    timeframe: "5m",
    enabled: true,
  });
  const { tokens: tokens30m } = useTrendingWebSocket({
    timeframe: "30m",
    enabled: true,
  });
  const { tokens: tokens1h } = useTrendingWebSocket({
    timeframe: "1h",
    enabled: true,
  });
  // REST pre-fetch (instant from Redis) + live delta WS. Also warmed below —
  // the DEX Screener tab renders the same TokenAvatar + MiniSparkline rows.
  const { tokens: dexScreenerTokens } = useDexScreenerTrending(true);
  // PumpPortal WS — tokens accumulate while the user is on other tabs.
  usePumpPortalWebSocket({ enabled: true });

  // Warm avatars + sparkline OHLC for every trending-family board in the
  // background, the same way Pulse pre-warms its images: by the time the
  // user opens /discover (Trending / Gainers / Top / DEX Screener),
  // TokenAvatar's retained-image fast-path and MiniSparkline's cache check
  // both hit, so rows paint complete on the first frame instead of trickling
  // in from per-row fetches (the "diagonal placeholder line" state).
  const lastImagePreloadRef = useRef(0);
  const lastSparklinePrefetchRef = useRef(0);
  useEffect(() => {
    const boards: Array<{
      tf: TrendingTimeframe;
      tokens: typeof tokens1h;
    }> = [
      { tf: "1m", tokens: tokens1m },
      { tf: "5m", tokens: tokens5m },
      { tf: "30m", tokens: tokens30m },
      { tf: "1h", tokens: tokens1h },
    ];
    if (
      boards.every((b) => b.tokens.length === 0) &&
      dexScreenerTokens.length === 0
    )
      return;

    const now = Date.now();
    if (now - lastImagePreloadRef.current >= IMAGE_PRELOAD_INTERVAL_MS) {
      lastImagePreloadRef.current = now;
      for (const board of boards) {
        preloadTrendingImages(board.tokens, { limit: BOARD_WARM_LIMIT });
      }
      preloadTrendingImages(dexScreenerTokens, { limit: BOARD_WARM_LIMIT });
    }

    if (
      now - lastSparklinePrefetchRef.current >=
      SPARKLINE_PREFETCH_INTERVAL_MS
    ) {
      lastSparklinePrefetchRef.current = now;
      // Sequential sweep, landing board first, so the board the user will
      // actually see warms before the rest. prefetchSparklines caps its own
      // concurrency (4) and skips cached / in-flight / known-empty keys, so
      // a full cold sweep is a bounded stream of small same-origin requests
      // and steady-state cycles are nearly all cache hits.
      const landingTf = getLandingTimeframe();
      const ordered = [
        ...boards.filter((b) => b.tf === landingTf),
        ...boards.filter((b) => b.tf !== landingTf),
      ];
      void (async () => {
        for (const board of ordered) {
          await prefetchSparklines(board.tokens, board.tf, {
            limit: BOARD_WARM_LIMIT,
          }).catch(() => {});
        }
        // DEX Screener rows render with the same timeframe pills; warm the
        // landing window for them too (primary endpoint only — un-indexed
        // mints negative-cache and fall to the row's own fallback chain).
        await prefetchSparklines(dexScreenerTokens, landingTf, {
          limit: BOARD_WARM_LIMIT,
        }).catch(() => {});
      })();
    }
  }, [tokens1m, tokens5m, tokens30m, tokens1h, dexScreenerTokens]);

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
