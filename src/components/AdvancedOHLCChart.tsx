import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback } from "react";
import { subscribe as subscribePendingTradeMarkers } from "../utils/pendingTradeMarkers";
import {
  KOL_ADDRESS_MAP,
  MAYHEM_WALLET_ADDRESSES,
  MAYHEM_MARK_COLOR_NAMED,
  MAYHEM_MARK_COLOR_HEX,
  MAYHEM_MARK_IMAGE_URL,
} from "../utils/kolLookup";
import * as ohlcPrefetchManager from "../utils/ohlcPrefetchManager";


// Re-export types from BackendOHLCChart for consistency
export type BackendInterval =
  | "1s"
  | "5s"
  | "15s"
  | "30s"
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d"
  | "7d";
export type BackendTimeRange =
  | "1h"
  | "4h"
  | "24h"
  | "7d"
  | "30d"
  | "90d"
  | "180d"
  | "365d";

export interface BackendOHLCData {
  unix_time: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v_usd: number;
}

export interface AdvancedOHLCChartProps {
  mint?: string;
  pairAddress?: string;
  interval?: BackendInterval;
  timeframe?: BackendTimeRange;
  optimize?: boolean;
  height?: string;
  width?: string;
  className?: string;
  baseRefreshMs?: number;
  onDataUpdate?: (data: BackendOHLCData[]) => void;
  preloadedData?: BackendOHLCData[];
  tradeData?: any[]; // Trade data for dev buy markers
  creatorAddress?: string | null; // Creator/dev wallet address
  userWalletAddress?: string | null; // Logged-in user's wallet address for "My Trade" markers
  tokenSymbol?: string | null;
  tokenName?: string | null;
  tokenDecimals?: number | null;
  network?: "solana" | "monad" | "hyperliquid"; // Network type (defaults to 'solana' for backward compatibility)
  priceLines?: {
    avgEntryPriceUsd?: number | null;
    avgExitPriceUsd?: number | null;
  };
  limitOrders?: Array<{
    id: string;
    type: "Buy" | "Sell";
    targetMC: number;
  }>;
  onChartMetrics?: (metrics: {
    lastPriceUsd?: number;
    lastMarketCapUsd?: number;
    maxMarketCapUsd?: number;
  }) => void;
  tokenAgeSec?: number;
  circulatingSupply?: number;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
const MONAD_BACKEND_URL = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL!;
const VALID_INTERVALS: BackendInterval[] = [
  "1s",
  "5s",
  "15s",
  "30s",
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
  "7d",
];
const DEFAULT_SUPPLY = 1_000_000_000; // Fallback when circulatingSupply prop is not provided
const CHART_DEBUG = false; // Set to true only when debugging chart issues

// Map our intervals to TradingView resolution format
const INTERVAL_TO_RESOLUTION: Record<BackendInterval, string> = {
  "1s": "1S",
  "5s": "5S",
  "15s": "15S",
  "30s": "30S",
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "4h": "240",
  "1d": "1D",
  "7d": "1W",
};

// For Monad: When user selects 1s, show 1-minute candles but update in real-time
// This gives proper candle bodies while maintaining real-time updates
const MONAD_DISPLAY_RESOLUTION: Record<BackendInterval, string> = {
  "1s": "1", // Show 1-minute candles, update every second
  "5s": "1", // Show 1-minute candles
  "15s": "1", // Show 1-minute candles
  "30s": "1", // Show 1-minute candles
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "4h": "240",
  "1d": "1D",
  "7d": "1W",
};

// Map display resolution to the interval to fetch from backend
const MONAD_FETCH_INTERVAL: Record<BackendInterval, BackendInterval> = {
  "1s": "1m", // Fetch 1-minute data for display
  "5s": "1m",
  "15s": "1m",
  "30s": "1m",
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "7d": "7d",
};

// Reverse map: TradingView resolution -> our interval format
const RESOLUTION_TO_INTERVAL: Record<string, BackendInterval> = {
  "1S": "1s",
  "5S": "5s",
  "15S": "15s",
  "30S": "30s",
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "240": "4h",
  "1D": "1d",
  "1W": "7d",
};

// Maps TV resolution → how much historical data to fetch (initial visible window)
const RESOLUTION_TO_TIMEFRAME: Record<string, BackendTimeRange | "auto"> = {
  "1S": "auto",    // use prop-based timeframe (default 1s live view)
  "5": "24h",      // 5min candles → fetch 1 day
  "30": "7d",      // 30min candles → fetch 7 days
  "240": "180d",   // 4h candles → fetch 180 days (covers both 30D and 180D buttons)
};

const formatUsdCompact = (value: number): string => {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;

  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const formatPriceUsd = (value: number): string => {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  let digits = 4;
  if (abs >= 1) digits = 2;
  if (abs < 1) digits = 4;
  if (abs < 0.1) digits = 6;
  if (abs < 0.01) digits = 8;

  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
};

const formatTokenAmount = (
  value: number,
  tokenDecimals?: number | null,
): string => {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  let digits = 2;

  if (abs >= 1_000_000) digits = 0;
  else if (abs >= 1_000) digits = 1;
  else if (abs >= 1) digits = 2;
  else if (abs >= 0.01) digits = 4;
  else digits = 6;

  if (typeof tokenDecimals === "number" && tokenDecimals >= 0) {
    digits = Math.min(digits, Math.max(0, tokenDecimals));
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
};

const formatAxisLabel = (value: number, isMarketCap: boolean): string => {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);

  if (isMarketCap) {
    if (abs >= 1_000_000_000_000)
      return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
    if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  }

  if (abs >= 1) return `$${value.toFixed(2)}`;
  if (abs >= 0.1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
};

const truncateAddress = (address?: string | null): string => {
  if (!address || address.length <= 10) return address || "Unknown";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

// Helper function to calculate window start time for any interval (for aggregating 1s candles)
const getWindowStartTime = (
  unixTime: number,
  interval: BackendInterval,
): number => {
  const seconds = unixTime;

  switch (interval) {
    case "1s":
    case "5s":
    case "15s":
    case "30s":
      // For second intervals, floor to the interval
      const secondInterval =
        interval === "1s"
          ? 1
          : interval === "5s"
            ? 5
            : interval === "15s"
              ? 15
              : 30;
      return Math.floor(seconds / secondInterval) * secondInterval;
    case "1m":
      return Math.floor(seconds / 60) * 60; // Floor to minute
    case "5m":
      return Math.floor(seconds / 300) * 300; // Floor to 5 minutes
    case "15m":
      return Math.floor(seconds / 900) * 900; // Floor to 15 minutes
    case "30m":
      return Math.floor(seconds / 1800) * 1800; // Floor to 30 minutes
    case "1h":
      return Math.floor(seconds / 3600) * 3600; // Floor to hour
    case "4h":
      return Math.floor(seconds / 14400) * 14400; // Floor to 4 hours
    case "1d":
      return Math.floor(seconds / 86400) * 86400; // Floor to day (UTC)
    case "7d":
      return Math.floor(seconds / 604800) * 604800; // Floor to week (UTC)
    default:
      return seconds;
  }
};

// Aggregate fine-grained candles (e.g., 1s) into coarser intervals (e.g., 5m, 30m, 4h)
// Used as client-side fallback when backend pre-aggregated tables lack data (newer tokens)
const aggregateCandlesToInterval = (
  candles: BackendOHLCData[],
  targetInterval: BackendInterval,
): BackendOHLCData[] => {
  if (candles.length === 0) return [];
  const buckets = new Map<number, BackendOHLCData>();
  for (const candle of candles) {
    if (candle.o === 0 && candle.h === 0 && candle.l === 0 && candle.c === 0) continue;
    const windowStart = getWindowStartTime(candle.unix_time, targetInterval);
    const existing = buckets.get(windowStart);
    if (!existing) {
      buckets.set(windowStart, {
        unix_time: windowStart,
        o: candle.o,
        h: candle.h,
        l: candle.l,
        c: candle.c,
        v_usd: candle.v_usd,
      });
    } else {
      existing.h = Math.max(existing.h, candle.h);
      existing.l = Math.min(existing.l, candle.l);
      existing.c = candle.c;
      existing.v_usd += candle.v_usd;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.unix_time - b.unix_time);
};

const mapSecondsToTimeframe = (spanSeconds: number): BackendTimeRange => {
  if (!Number.isFinite(spanSeconds) || spanSeconds <= 0) return "24h";
  if (spanSeconds >= 15552000) return "180d"; // >= 180d
  if (spanSeconds >= 2592000) return "30d"; // >= 30d
  if (spanSeconds >= 604800) return "7d"; // >= 7d
  if (spanSeconds >= 86400) return "24h"; // >= 1d
  if (spanSeconds >= 14400) return "4h"; // >= 4h
  return "1h";
};

const resolveTradeSymbol = (
  tradeSymbol: string | null | undefined,
  tokenSymbol?: string | null,
  tokenName?: string | null,
  mint?: string,
): string => {
  const fromTrade = tradeSymbol?.trim();
  if (fromTrade) return fromTrade;

  const fromSymbol = tokenSymbol?.trim();
  if (fromSymbol) return fromSymbol;

  const fromName = tokenName?.trim();
  if (fromName) return fromName;

  if (mint && mint.length > 10) {
    return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
  }

  return "Token";
};

function waitForVisibleContainer(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    // Fast path: check immediately
    const r = el.getBoundingClientRect();
    const visible =
      r.width > 40 &&
      r.height > 40 &&
      el.isConnected &&
      getComputedStyle(el).display !== "none";
    if (visible) {
      resolve();
      return;
    }

    // Fallback: poll with requestAnimationFrame (but limit iterations)
    let iterations = 0;
    const maxIterations = 10; // Max ~160ms wait time
    const tick = () => {
      iterations++;
      const r = el.getBoundingClientRect();
      const visible =
        r.width > 40 &&
        r.height > 40 &&
        el.isConnected &&
        getComputedStyle(el).display !== "none";
      if (visible || iterations >= maxIterations) {
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

// --- Gap Collapse Types & Helpers (module-level for performance) ---

type GapShift = {
  realTimeMs: number;       // Where the gap starts (real time)
  adjustedTimeMs: number;   // Same point in collapsed time
  cumulativeShiftMs: number; // Total shift accumulated
};

/**
 * Collapse time gaps in sorted bar data (modifies bars in place).
 * Gaps > COLLAPSE_THRESHOLD candles are collapsed; smaller gaps are left
 * for gapFillBars to handle with carry-forward candles.
 */
function collapseTimeGaps(
  bars: { time: number; open: number; high: number; low: number; close: number; volume: number }[],
  resolutionMs: number,
): { shifts: GapShift[]; totalShift: number } {
  const COLLAPSE_THRESHOLD = 1; // Gaps > 1 bar → collapse (no blank spaces)
  const shifts: GapShift[] = [];
  if (bars.length <= 1) return { shifts, totalShift: 0 };

  const originalTimes = bars.map(b => b.time);
  let cumulativeShift = 0;
  const maxGap = resolutionMs * COLLAPSE_THRESHOLD;

  for (let i = 1; i < bars.length; i++) {
    const gap = originalTimes[i] - originalTimes[i - 1];
    if (gap > maxGap) {
      const excess = gap - resolutionMs; // Keep 1 interval of spacing
      cumulativeShift += excess;
      shifts.push({
        realTimeMs: originalTimes[i],
        adjustedTimeMs: originalTimes[i] - cumulativeShift,
        cumulativeShiftMs: cumulativeShift,
      });
    }
    bars[i].time = originalTimes[i] - cumulativeShift;
  }

  return { shifts, totalShift: cumulativeShift };
}

/** Binary search: given an ADJUSTED time (ms), return the real time (ms). */
function adjustedToReal(adjustedMs: number, shifts: GapShift[]): number {
  if (shifts.length === 0) return adjustedMs;
  let lo = 0, hi = shifts.length - 1;
  // Find the last shift where adjustedTimeMs <= adjustedMs
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (shifts[mid].adjustedTimeMs <= adjustedMs) lo = mid;
    else hi = mid - 1;
  }
  if (shifts[lo].adjustedTimeMs > adjustedMs) return adjustedMs; // Before any gap
  return adjustedMs + shifts[lo].cumulativeShiftMs;
}

/** Binary search: given a REAL time (ms), return the adjusted (collapsed) time (ms). */
function realToAdjusted(realMs: number, shifts: GapShift[]): number {
  if (shifts.length === 0) return realMs;
  let lo = 0, hi = shifts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (shifts[mid].realTimeMs <= realMs) lo = mid;
    else hi = mid - 1;
  }
  if (shifts[lo].realTimeMs > realMs) return realMs; // Before any gap
  return realMs - shifts[lo].cumulativeShiftMs;
}

/** Give flat candles (O=H=L=C) a small visible body so they aren't invisible dashes.
 *  Display-only: raw cache data is never mutated. Gap-fill (volume=0) candles are skipped. */
function applyFlatCandleSpread(bar: {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}): typeof bar {
  if (bar.open !== bar.close || bar.high !== bar.low || bar.open !== bar.high) return bar;
  if (bar.volume <= 0) return bar;
  if (bar.close <= 0) return bar;

  const price = bar.close;
  const halfSpread = price * 0.003 / 2; // 0.3% total spread
  return {
    ...bar,
    open: price - halfSpread,
    high: price,
    low: price - halfSpread,
    close: price,
  };
}

/** Clamp "launch candles" where open/low is orders of magnitude below close/high.
 *  This happens on token launch when the first trade goes from bonding curve zero-price
 *  to a real trading price, creating a single candle with ~1000x high/low ratio.
 *  Mutates the array in place. Only checks the first few candles. */
const LAUNCH_SPIKE_RATIO = 100;
const MAX_LAUNCH_CANDLES_CHECK = 10;

function clampLaunchCandles(candles: BackendOHLCData[]): void {
  const limit = Math.min(candles.length, MAX_LAUNCH_CANDLES_CHECK);
  for (let i = 0; i < limit; i++) {
    const c = candles[i];
    if (c.c <= 0) continue;                    // Need valid close to clamp to
    if (c.l <= 0 || c.h / c.l > LAUNCH_SPIKE_RATIO) {
      c.o = c.c;
      c.l = Math.min(c.c, c.h > 0 ? c.h : c.c);
    }
  }
}

export interface AdvancedOHLCChartHandle {
  /**
   * Force an immediate `refreshMarks()` on the underlying TradingView widget,
   * bypassing the 800ms debounce. Used by the trade page to make optimistic
   * buy/sell markers appear sub-150ms after a click.
   */
  refreshMarksNow: () => void;
}

const AdvancedOHLCChart = forwardRef<AdvancedOHLCChartHandle, AdvancedOHLCChartProps>(({
  mint,
  pairAddress,
  interval = "1s",
  timeframe = "24h",
  optimize = false,
  height = "400px",
  width = "100%",
  className = "",
  baseRefreshMs = 30000,
  onDataUpdate,
  preloadedData,
  tradeData = [],
  creatorAddress = null,
  userWalletAddress = null,
  tokenSymbol = null,
  tokenName = null,
  tokenDecimals = null,
  network = "solana", // Default to solana for backward compatibility
  priceLines,
  limitOrders,
  onChartMetrics,
  tokenAgeSec,
  circulatingSupply,
}, ref) => {
  const MARKET_CAP_MULTIPLIER = circulatingSupply && circulatingSupply > 0 ? circulatingSupply : DEFAULT_SUPPLY;

  // DEBUG: Confirm component is rendering with latest code

  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const usdMcButtonRef = useRef<HTMLElement | null>(null);
  const [isLoading, setIsLoading] = useState(
    !preloadedData || preloadedData.length === 0,
  );
  const [error, setError] = useState<string | null>(null);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [candles, setCandles] = useState<BackendOHLCData[]>(
    preloadedData || [],
  );
  const [lastUpdate, setLastUpdate] = useState<Date | null>(
    preloadedData && preloadedData.length > 0 ? new Date() : null,
  );
  const [retryCount, setRetryCount] = useState(0);
  // Note: solanaHttpReady gate removed — WS connects immediately (WS-first architecture)

  const selectedInterval = VALID_INTERVALS.includes(interval) ? interval : "1s";
  const [initialTokenId, setInitialTokenId] = useState<string | null>(
    () => (mint || pairAddress) ?? null,
  );
  const [displayMode, setDisplayMode] = useState<"USD" | "MC">("MC"); // USD/MC toggle for both Monad and Solana
  const displayModeRef = useRef<"USD" | "MC">("MC"); // Ref for fast access in callbacks
  const latestParamsRef = useRef({
    mint,
    pairAddress,
    interval: selectedInterval,
    timeframe,
    optimize,
    network,
  });

  // RACE FIX: Synchronous token identity — guards WS handlers against stale data.
  // Updated during render (not in useEffect) so it reflects the current token
  // BEFORE any effects or WS message handlers execute.
  const activeTokenRef = useRef<string>((mint || pairAddress) ?? "");
  activeTokenRef.current = (mint || pairAddress) ?? "";

  // Keep ref in sync with state
  useEffect(() => {
    displayModeRef.current = displayMode;
    // Reset lastAppliedLinesRef so price lines can be redrawn in the new mode
    // This is important because price values change between USD and MC modes
    lastAppliedLinesRef.current = {};
    // CRITICAL: Clear the in-flight flag to allow new sync calls after mode change
    // Without this, syncPriceLines can get stuck if a previous call is still "in flight"
    syncLinesInFlightRef.current = false;
  }, [displayMode]);

  // Helper function to transform OHLC values based on display mode (USD vs MC)
  // MC = USD price * circulating supply (fetched from /v1/supply, defaults to 1B)
  const transformOHLCValue = useCallback(
    (value: number, mode: "USD" | "MC", supportsMcMode: boolean): number => {
      if (!supportsMcMode || mode === "USD") {
        return value;
      }
      return value * MARKET_CAP_MULTIPLIER;
    },
    [MARKET_CAP_MULTIPLIER],
  );

  // Helper function to transform a bar object based on display mode
  const transformBar = useCallback(
    (
      bar: {
        time: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      },
      mode: "USD" | "MC",
      supportsMcMode: boolean,
    ) => {
      // CRITICAL: If mode is 'USD', return bar UNCHANGED (no multiplication)
      if (!supportsMcMode || mode === "USD") {
        return bar;
      }
      // MC mode only: multiply by circulating supply
      return {
        ...bar,
        open: transformOHLCValue(bar.open, mode, supportsMcMode),
        high: transformOHLCValue(bar.high, mode, supportsMcMode),
        low: transformOHLCValue(bar.low, mode, supportsMcMode),
        close: transformOHLCValue(bar.close, mode, supportsMcMode),
      };
    },
    [transformOHLCValue],
  );

  const computeMaxMarketCapUsd = useCallback((): number | null => {
    if (CHART_DEBUG) console.log("📊 [MAX_MC_COMPUTE] Starting max MC computation...");
    const currentNetwork = latestParamsRef.current.network;
    if (CHART_DEBUG) console.log("📊 [MAX_MC_COMPUTE] Network:", currentNetwork);

    // Both Monad and Solana support max MC calculation (circulating supply from /v1/supply)
    const data = lastGoodCandlesRef.current || [];
    if (CHART_DEBUG) console.log("📊 [MAX_MC_COMPUTE] Candles available:", data.length);

    if (!data.length) {
      if (CHART_DEBUG) console.log("⚠️ [MAX_MC_COMPUTE] No candle data available, returning null");
      return null;
    }

    let maxHigh = 0;
    let maxHighCandle = null;
    for (const candle of data) {
      if (candle?.h && candle.h > maxHigh) {
        maxHigh = candle.h;
        maxHighCandle = candle;
      }
    }

    if (CHART_DEBUG) console.log("📊 [MAX_MC_COMPUTE] Max high found:", {
      maxHigh,
      maxHighUSD: maxHigh,
      candleTime: maxHighCandle
        ? new Date(maxHighCandle.unix_time * 1000).toISOString()
        : null,
      isFinite: Number.isFinite(maxHigh),
      isPositive: maxHigh > 0,
    });

    if (!Number.isFinite(maxHigh) || maxHigh <= 0) {
      if (CHART_DEBUG) console.log("⚠️ [MAX_MC_COMPUTE] Invalid maxHigh, returning null");
      return null;
    }

    const result = maxHigh * MARKET_CAP_MULTIPLIER;
    if (CHART_DEBUG) console.log("✅ [MAX_MC_COMPUTE] Final max MC (USD):", {
      maxHighPriceUSD: maxHigh,
      MARKET_CAP_MULTIPLIER,
      resultMaxMcUSD: result,
      formatted: `$${(result / 1_000_000).toFixed(2)}M`,
    });

    return result;
  }, [MARKET_CAP_MULTIPLIER]);

  // Price line management - always clears and redraws to ensure consistency
  const syncPriceLines = useCallback(
    (maxMarketCapUsdOverride?: number | null) => {
      if (CHART_DEBUG) console.log("🎯 [SYNC_PRICE_LINES] ============= START =============");
      if (CHART_DEBUG) console.log("🎯 [SYNC_PRICE_LINES] Called with maxMarketCapUsdOverride:", maxMarketCapUsdOverride);

      if (syncLinesInFlightRef.current) {
        if (CHART_DEBUG) console.log("⚠️ [SYNC_PRICE_LINES] Already in flight, skipping");
        return;
      }

      syncLinesInFlightRef.current = true;

      const currentNetwork = latestParamsRef.current.network;
      const widget = widgetRef.current;

      if (!widget) {
        if (CHART_DEBUG) console.log("❌ [SYNC_PRICE_LINES] Early exit - no widget");
        syncLinesInFlightRef.current = false;
        return;
      }

      let chart: any = null;
      try {
        chart = widget.activeChart?.() || widget.chart?.();
      } catch (err) {
        if (CHART_DEBUG) console.log("❌ [SYNC_PRICE_LINES] Failed to get chart:", err);
        syncLinesInFlightRef.current = false;
        return;
      }

      if (!chart || typeof chart.createShape !== "function") {
        if (CHART_DEBUG) console.log("❌ [SYNC_PRICE_LINES] Invalid chart or missing createShape");
        syncLinesInFlightRef.current = false;
        return;
      }

      const mode = displayModeRef.current;
      const axisIsMarketCap = mode === "MC";

      // Priority: 1) Override from caller, 2) max of API ref and computed from candles
      // Math.max ensures live candles that set new ATH update the line immediately
      let maxMarketCapUsd: number | null;
      if (typeof maxMarketCapUsdOverride === "number") {
        maxMarketCapUsd = maxMarketCapUsdOverride;
      } else {
        const apiMaxMc = maxMarketCapFromApiRef.current ?? 0;
        const computedMaxMc = computeMaxMarketCapUsd() ?? 0;
        maxMarketCapUsd = Math.max(apiMaxMc, computedMaxMc) || null;
      }

      if (CHART_DEBUG) console.log("🎯 [SYNC_PRICE_LINES] Max MC determination:", {
        hasOverride: typeof maxMarketCapUsdOverride === "number",
        overrideValue: maxMarketCapUsdOverride,
        apiRefValue: maxMarketCapFromApiRef.current,
        finalMaxMarketCapUsd: maxMarketCapUsd,
      });

      const currentPrices = priceLinesRef.current;

      const normalizeUsd = (value: unknown): number | null => {
        const numeric =
          typeof value === "string" ? parseFloat(value) : (value as number);
        const result =
          !Number.isFinite(numeric) || numeric <= 0 ? null : numeric;
        if (CHART_DEBUG) console.log("🔢 [NORMALIZE_USD]", { input: value, result });
        return result;
      };

      const avgEntryUsd = normalizeUsd(currentPrices?.avgEntryPriceUsd ?? null);
      const avgExitUsd = normalizeUsd(currentPrices?.avgExitPriceUsd ?? null);

      const toAxisPrice = (usdPrice?: number | null): number | null => {
        if (usdPrice === null || usdPrice === undefined) return null;
        const result = axisIsMarketCap
          ? usdPrice * MARKET_CAP_MULTIPLIER
          : usdPrice;
        if (CHART_DEBUG) console.log("🔢 [TO_AXIS_PRICE] Conversion:", { input_USD: usdPrice, output_AxisPrice: result });
        return result;
      };

      const entryPrice = toAxisPrice(avgEntryUsd);
      const exitPrice = toAxisPrice(avgExitUsd);

      const maxMcPriceInput = maxMarketCapUsd
        ? maxMarketCapUsd / MARKET_CAP_MULTIPLIER
        : null;
      const maxMcPrice = toAxisPrice(maxMcPriceInput);

      if (CHART_DEBUG) console.log("🎯 [SYNC_PRICE_LINES] Final axis prices:", { entryPrice, exitPrice, maxMcPrice });

      const lastApplied = lastAppliedLinesRef.current;

      const currentLimitOrderHash = (limitOrdersRef.current || [])
        .map(o => `${o.id}:${o.targetMC}`).sort().join("|");

      if (
        lastApplied &&
        lastApplied.entry === entryPrice &&
        lastApplied.exit === exitPrice &&
        lastApplied.maxMc === maxMcPrice &&
        lastApplied.limitOrderHash === currentLimitOrderHash
      ) {
        if (CHART_DEBUG) console.log("⚠️ [SYNC_PRICE_LINES] Lines already applied with same values, skipping");
        syncLinesInFlightRef.current = false;
        return;
      }

      if (CHART_DEBUG) console.log("🎯 [SYNC_PRICE_LINES] Lines need update, proceeding...");

      // STEP 1: Remove existing tracked shapes by ID
      try {
        // Remove tracked shapes by ID
        Object.values(priceLineShapesRef.current).forEach((line: any) => {
          try {
            if (line?.id && typeof line.id === "string") {
              if (CHART_DEBUG) console.log("🗑️ [SYNC_PRICE_LINES] Removing shape:", line.id);
              chart.removeEntity(line.id);
            }
          } catch (e) {
            if (CHART_DEBUG) console.log("⚠️ [SYNC_PRICE_LINES] Failed to remove shape:", line?.id, e);
          }
        });
        priceLineShapesRef.current = {};
      } catch (e) {
        console.warn("⚠️ [SYNC_PRICE_LINES] Error during shape removal:", e);
      }

      // STEP 2: Create fresh lines using createShape
      // textOverride allows showing market cap value even in USD mode (for Max MC line)
      const createLine = async (
        key: string,
        price: number | null,
        label: string,
        color: string,
        textOverride?: string,
        lineStyleOverride?: number, // 0=solid, 1=dotted, 2=dashed (default)
      ) => {
        if (CHART_DEBUG) console.log(`✨ [CREATE_LINE] Creating line "${key}":`, { price, label, color });

        // Validate price is a valid finite number
        if (price === null || !Number.isFinite(price) || price <= 0) {
          if (CHART_DEBUG) console.log(`⚠️ [CREATE_LINE] Skipping "${key}" - invalid price:`, price);
          return;
        }

        try {
          const formattedPrice = formatAxisLabel(price, axisIsMarketCap);
          // Use textOverride if provided (e.g., for Max MC to always show market cap regardless of mode)
          const lineText = textOverride ?? `${label}: ${formattedPrice}`;

          const result = chart.createShape(
            { price },
            {
              shape: "horizontal_line",
              text: lineText,
              lock: true,
              disableSelection: true,
              disableSave: true,
              overrides: {
                linecolor: color,
                textcolor: color,
                linestyle: lineStyleOverride ?? 2,
                linewidth: 2,
                showLabel: true,
                drawPriceLabel: true,
              },
            },
          );

          // Handle both Promise and direct ID returns
          // Use thenable check instead of instanceof Promise (handles cross-realm Promises from iframes)
          const isThenable = (obj: any): obj is Promise<any> =>
            obj && typeof obj.then === "function";

          let shapeId = isThenable(result) ? await result : result;

          // Check if we got a nested Promise/thenable and await again if needed
          if (isThenable(shapeId)) {
            shapeId = await shapeId;
          }

          if (shapeId && typeof shapeId === "string") {
            priceLineShapesRef.current[key] = { id: shapeId };
            if (CHART_DEBUG) console.log(`✅ [CREATE_LINE] "${key}" created with ID:`, shapeId);
          } else {
            if (CHART_DEBUG) console.log(`⚠️ [CREATE_LINE] "${key}" received invalid shape ID:`, shapeId);
          }
        } catch (err) {
          console.error(
            `❌ [CREATE_LINE] Failed to create line "${key}":`,
            err,
          );
        }
      };

      // Create the lines
      (async () => {
        await createLine("avgEntry", entryPrice, "Avg Entry", "#22c55e");
        await createLine("avgExit", exitPrice, "Avg Exit", "#ef4444");

        // For Max MC line, show the value in the format matching the current display mode
        // In MC mode: "Max MC: $5.00M" (market cap with M/B suffix)
        // In USD mode: "Max MC: $0.005" (USD price per token)
        let maxMcLabelText: string | undefined = undefined;
        if (typeof maxMcPrice === "number" && maxMcPrice > 0) {
          if (axisIsMarketCap) {
            // MC mode: show as market cap (the position value IS the market cap)
            maxMcLabelText = `Max MC: ${formatAxisLabel(maxMcPrice, true)}`;
          } else {
            // USD mode: show as USD price (the position value IS the USD price per token)
            maxMcLabelText = `Max MC: ${formatAxisLabel(maxMcPrice, false)}`;
          }
        }
        await createLine(
          "maxMc",
          maxMcPrice,
          "Max MC",
          "#f2994a",
          maxMcLabelText,
        );

        // Create limit order lines (dotted)
        const currentLimitOrders = limitOrdersRef.current || [];
        for (const order of currentLimitOrders) {
          const mcValue = Number(order.targetMC);
          if (!Number.isFinite(mcValue) || mcValue <= 0) continue;

          // MC → USD price per token → axis price
          const orderPriceUsd = mcValue / MARKET_CAP_MULTIPLIER;
          const orderAxisPrice = toAxisPrice(orderPriceUsd);

          const isBuy = order.type === "Buy";
          const color = isBuy ? "#22c55e" : "#ef4444";
          const label = isBuy ? "Limit Buy" : "Limit Sell";
          const formattedTarget = orderAxisPrice ? formatAxisLabel(orderAxisPrice, axisIsMarketCap) : "";

          await createLine(
            `limitOrder_${order.id}`,
            orderAxisPrice,
            label,
            color,
            `${label}: ${formattedTarget}`,
            1, // dotted style
          );
        }

        const limitOrderHash = currentLimitOrders.map(o => `${o.id}:${o.targetMC}`).sort().join("|");
        lastAppliedLinesRef.current = {
          entry: entryPrice,
          exit: exitPrice,
          maxMc: maxMcPrice,
          limitOrderHash,
        };
        if (CHART_DEBUG) console.log("✅ [SYNC_PRICE_LINES] All lines created:", Object.keys(priceLineShapesRef.current));

        syncLinesInFlightRef.current = false;
        if (CHART_DEBUG) console.log("🎯 [SYNC_PRICE_LINES] ============= COMPLETE =============");
      })().catch((err) => {
        console.error("❌ [SYNC_PRICE_LINES] Async line creation failed:", err);
        syncLinesInFlightRef.current = false;
      });
    },
    [computeMaxMarketCapUsd],
  );

  const updateChartMetrics = useCallback(() => {
    if (CHART_DEBUG) console.log("📈 [UPDATE_METRICS] ============= START =============");
    const candles = lastGoodCandlesRef.current;

    if (!candles || candles.length === 0) {
      if (CHART_DEBUG) console.log("⚠️ [UPDATE_METRICS] No candles available, exiting");
      return;
    }

    // Candles are already sorted by unix_time in all insertion code paths
    const latest = candles[candles.length - 1];
    const lastPriceUsd = Number(latest?.c || latest?.o || 0);

    if (!Number.isFinite(lastPriceUsd) || lastPriceUsd <= 0) {
      if (CHART_DEBUG) console.log("⚠️ [UPDATE_METRICS] Invalid last price, exiting");
      return;
    }

    const currentNetwork = latestParamsRef.current.network;
    const isMonad = currentNetwork === "monad";
    // Both Monad and Solana pump.fun tokens have 1B supply, so MC calculations apply to both
    const supportsMcMode = true;

    const apiMaxMc = maxMarketCapFromApiRef.current ?? 0;
    const computedMaxMc = computeMaxMarketCapUsd() ?? 0;
    const maxMarketCapUsd = supportsMcMode
      ? (Math.max(apiMaxMc, computedMaxMc) || null)
      : null;

    const metrics = {
      lastPriceUsd,
      lastMarketCapUsd: supportsMcMode
        ? lastPriceUsd * MARKET_CAP_MULTIPLIER
        : undefined,
      maxMarketCapUsd: supportsMcMode
        ? (maxMarketCapUsd ?? undefined)
        : undefined,
    };

    if (CHART_DEBUG) console.log("📈 [UPDATE_METRICS] Computed metrics:", {
      lastPriceUsd,
      lastMarketCapUsd: metrics.lastMarketCapUsd,
      maxMarketCapUsd: metrics.maxMarketCapUsd,
    });

    lastMetricsRef.current = metrics;

    // CRITICAL FIX: Wrap syncPriceLines in onChartReady to ensure chart is ready before creating shapes
    // This is why Monad works (uses requestPriceLineSync which wraps in onChartReady) but Solana failed
    // (was calling syncPriceLines directly without waiting for chart)
    const widget = widgetRef.current;
    const maxMc = metrics.maxMarketCapUsd ?? null;

    if (widget?.onChartReady) {
      widget.onChartReady(() => {
        syncPriceLines(maxMc);
      });
    } else {
      // Fallback if widget not available yet (should be rare)
      syncPriceLines(maxMc);
    }

    onChartMetrics?.(metrics);

    if (CHART_DEBUG) console.log("📈 [UPDATE_METRICS] ============= COMPLETE =============");
  }, [computeMaxMarketCapUsd, onChartMetrics, syncPriceLines]);

  useEffect(() => {
    if (!initialTokenId && (mint || pairAddress)) {
      setInitialTokenId((mint || pairAddress) ?? null);
    }
  }, [initialTokenId, mint, pairAddress]);

  // Fetch max market cap from full OHLC data for BOTH Monad and Solana tokens
  // This ensures Max MC line is accurate and shows immediately (same pattern for both networks)
  useEffect(() => {
    const currentNetwork = latestParamsRef.current.network;
    const isMonad = currentNetwork === "monad";
    const tokenId = mint || pairAddress;


    if (!tokenId || typeof window === "undefined") {
      maxMarketCapFromApiRef.current = null;
      return;
    }

    const controller = new AbortController();

    const fetchMaxMc = async () => {
      try {
        let url: URL;

        if (isMonad) {
          // Monad: use ohlc-monad endpoint with token_address
          url = new URL(
            "/api/token-service/ohlc-monad",
            window.location.origin,
          );
          url.searchParams.set("token_address", tokenId);
          url.searchParams.set("interval", "1s");
          url.searchParams.set("timeframe", "30d");
          url.searchParams.set("optimize", "true");
        } else {
          // Solana: use Next.js API proxy (avoids CORS issues)
          // The proxy calls Go service at /v1/ohlcv/{mint}
          url = new URL("/api/token-service/ohlc", window.location.origin);
          url.searchParams.set("tokenAddress", tokenId);
          url.searchParams.set("timeframe", "1s");
        }


        const resp = await fetch(url.toString(), {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });


        if (!resp.ok) {
          console.warn(
            "⚠️ [MAX_MC_FETCH] Fetch failed with status:",
            resp.status,
          );
          maxMarketCapFromApiRef.current = null;
          return;
        }

        const data = await resp.json();

        // Handle different response formats:
        // - Monad: { data: { items: [...] } }
        // - Solana API proxy: { success: true, data: { items: [...] } } (transformed from candles)
        // - Solana Go service direct: { success: true, candles: [...] }
        let items: BackendOHLCData[];
        if (data?.candles && Array.isArray(data.candles)) {
          // Direct Go service format - transform candles to our format
          items = data.candles.map((c: any) => ({
            unix_time: c.time || c.unix_time,
            o: c.open ?? c.o,
            h: c.high ?? c.h,
            l: c.low ?? c.l,
            c: c.close ?? c.c,
            v_usd: c.volume ?? c.volume_usd ?? c.v_usd ?? 0,
          }));
        } else if (data?.data?.items && Array.isArray(data.data.items)) {
          // API proxy format (already transformed)
          items = data.data.items;
        } else {
          // Unknown format - log and return empty
          console.warn(
            "⚠️ [MAX_MC_FETCH] Unknown response format:",
            JSON.stringify(data).slice(0, 500),
          );
          items = [];
        }

        let maxHigh = 0;
        let maxHighCandle = null;
        for (const c of items) {
          if (c?.h && c.h > maxHigh) {
            maxHigh = c.h;
            maxHighCandle = c;
          }
        }

        const maxMcUsd = maxHigh > 0 ? maxHigh * MARKET_CAP_MULTIPLIER : null;


        maxMarketCapFromApiRef.current = maxMcUsd;

        // Update cached metrics so price line sync can use the fresh max MC
        if (maxMarketCapFromApiRef.current) {
          lastMetricsRef.current = {
            ...lastMetricsRef.current,
            maxMarketCapUsd: maxMarketCapFromApiRef.current,
          };
        }

        // ✅ CRITICAL: Reset flags before sync (same pattern as toggle)
        // This ensures syncPriceLines actually runs and isn't blocked
        syncLinesInFlightRef.current = false;
        lastAppliedLinesRef.current = {};

        // Use requestPriceLineSync which wraps in onChartReady
        // This ensures price lines are drawn when chart is ready (same pattern for both networks)
        requestPriceLineSync(0);
      } catch (e) {
        if ((e as any)?.name !== "AbortError") {
          console.warn("❌ [MAX_MC_FETCH] Error:", e);
        }
        maxMarketCapFromApiRef.current = null;
      }
    };

    fetchMaxMc();
    return () => {
      controller.abort();
    };
  }, [mint, pairAddress, network]);

  useEffect(() => {
    latestParamsRef.current = {
      mint,
      pairAddress,
      interval: VALID_INTERVALS.includes(interval) ? interval : "1s",
      timeframe,
      optimize,
      network,
    };
  }, [mint, pairAddress, interval, timeframe, optimize, network]);

  // Reset flags on token change (full reset — new WS, new snapshot needed)
  const prevResetTokenRef = useRef<string>((mint || pairAddress) ?? "");
  useEffect(() => {
    const currentToken = (mint || pairAddress) ?? "";
    const tokenChanged = prevResetTokenRef.current !== currentToken;
    prevResetTokenRef.current = currentToken;

    hasRightAlignedRef.current = false;
    wsResetDoneRef.current = false;
    wsLogCountRef.current = 0;
    if (pendingCandleResetRef.current) {
      clearTimeout(pendingCandleResetRef.current);
      pendingCandleResetRef.current = null;
    }
    if (subscribeBarsRecoveryRef.current) {
      clearTimeout(subscribeBarsRecoveryRef.current);
      subscribeBarsRecoveryRef.current = null;
    }
    if (modeToggleTimerRef.current) {
      clearTimeout(modeToggleTimerRef.current);
      modeToggleTimerRef.current = null;
    }
    modeTogglePendingRef.current = false;
    modeToggleCountRef.current = 0;
    if (lazyLoadAbortRef.current) {
      lazyLoadAbortRef.current.abort();
      lazyLoadAbortRef.current = null;
    }
    if (predictivePrefetchAbortRef.current) {
      predictivePrefetchAbortRef.current.abort();
      predictivePrefetchAbortRef.current = null;
    }
    resolutionCallbackMapRef.current.clear();
    // Reset aggregation state for Solana WS (1s candles aggregated client-side)
    if (currentAggregatingIntervalRef.current !== selectedInterval) {
      currentAggregatedCandleRef.current = null;
      oneSecondCandlesRef.current = [];
      currentAggregatingIntervalRef.current = selectedInterval;
    }

    // Only reset these on TOKEN change — resolution changes are handled by
    // TradingView's unsubscribeBars→getBars→subscribeBars lifecycle.
    // Resetting chartPopulatedRef on resolution changes caused live WS candles
    // to be silently dropped because no code path restored it to true.
    if (tokenChanged) {
      wsConnectedRef.current = false;
      preloadedDataAppliedRef.current = false;
      chartPopulatedRef.current = false;
      tvResolutionRef.current = "1S";

      // Widget reuse: clear old token's candle data so getBars waits for new snapshot.
      // Without key={mint}, the component stays mounted — stale data must be purged.
      lastGoodCandlesRef.current = [];
      resolutionCacheRef.current.clear(); // Clear per-resolution cache on token change
      cachedIntervalRef.current = null;
      cachedTimeframeRef.current = null;
      lastCandleHashRef.current = "";
      setCandles([]);
      setIsLoading(true);
      hasInitializedRef.current = false;
      firstLoadRef.current = true;

      // Clear gap-shift state (time gap compression is per-token)
      gapShiftsRef.current = [];
      totalShiftRef.current = 0;

      // Clear price line state for new token
      priceLineShapesRef.current = {};
      if (previewLineShapeIdRef.current) {
        try {
          const w = widgetRef.current;
          const c = w?.activeChart?.() || w?.chart?.();
          if (c) c.removeEntity(previewLineShapeIdRef.current);
        } catch {}
      }
      previewCreationSeqRef.current++;
      previewLineShapeIdRef.current = null;
      lastPriceLinesRef.current = {};
      lastAppliedLinesRef.current = {};
      syncLinesInFlightRef.current = false;
      maxMarketCapFromApiRef.current = null;

      // Wake any pending getBars snapshot wait — it needs to re-wait for new token's data
      if (snapshotResolverRef.current) {
        snapshotResolverRef.current();
        snapshotResolverRef.current = null;
      }

      // Clear aggregation state
      currentAggregatedCandleRef.current = null;
      oneSecondCandlesRef.current = [];
      wsGapBridgedRef.current = false;

      // Null out the TradingView realtime callback to prevent stale WS bars
      // from the old token reaching the chart during the brief transition.
      // setSymbol() → subscribeBars will set a new callback.
      subscribedCallbackRef.current = null;
      activeSubscriberUIDRef.current = null;
    }
  }, [mint, pairAddress, selectedInterval]);

  // Refresh chart when displayMode changes (for USD/MC toggle - both Monad and Solana)
  // FIX: Don't change symbol - just reset chart data to re-render with new transformation
  // This preserves websocket connection and avoids breaking the chart
  useEffect(() => {
    if (CHART_DEBUG) {
    }

    // Both Monad and Solana support MC mode
    if (!hasInitializedRef.current) {
      if (CHART_DEBUG) console.log(
        "🚨 [DISPLAY_MODE_EFFECT] Chart not initialized yet, skipping",
      );
      return;
    }

    const widget = widgetRef.current;
    if (!widget) {
      if (CHART_DEBUG) console.log("🚨 [DISPLAY_MODE_EFFECT] No widget, skipping");
      return;
    }

    // Try to get chart directly first (faster if already ready)
    let chart: any = null;
    try {
      chart = widget.activeChart?.() || widget.chart?.();
    } catch (e) {
      // Chart not ready yet
    }

    const doReset = () => {
      try {
        const activeChart = chart || widget.activeChart?.() || widget.chart?.();
        if (!activeChart) {
          return;
        }

        if (CHART_DEBUG) {
        }

        // Abort any in-flight lazy-load fetch — it would block TradingView's
        // serialized getBars pipeline for the new symbol, preventing subscribeBars
        // from ever being called (same fix as unsubscribeBars).
        if (lazyLoadAbortRef.current) {
          lazyLoadAbortRef.current.abort();
          lazyLoadAbortRef.current = null;
        }

        // Clear any in-flight getBars tracking to prevent deadlock.
        // If a previous getBars is still in-flight when the mode toggle triggers
        // a new one, the new call could be skipped.
        getBarsInFlightRef.current = null;
        getBarsInFlightKeyRef.current = null;

        // CRITICAL FIX: Force TradingView to completely reload data by CHANGING the symbol
        // TradingView caches data by symbol name - using the same symbol won't trigger getBars
        // Solution: Append mode suffix (e.g., "TOKEN|USD" vs "TOKEN|MC") to force data refresh
        const rawSymbol = activeChart.symbol?.() || initialTokenId || "";
        // Strip any existing mode suffix to get base symbol
        const baseSymbol = rawSymbol.split("|")[0];
        // Create new symbol with current mode suffix
        const newMode = displayModeRef.current;
        const toggleId = ++modeToggleCountRef.current;
        const newSymbol = `${baseSymbol}|${newMode}|t${toggleId}`;
        const currentResolution = activeChart.resolution?.() || "1S";

        // Save current subscriber info BEFORE setSymbol triggers unsubscribeBars.
        // If TradingView reuses the subscription (same resolution), subscribeBars
        // won't be called — we need to detect this and restore the callback.
        const preToggleUID = activeSubscriberUIDRef.current;
        const preToggleResolution = tvResolutionRef.current;
        // CRITICAL: Snapshot the map entry NOW, before setSymbol triggers unsubscribeBars.
        // unsubscribeBars deletes the resolution key from resolutionCallbackMapRef
        // (line ~4888), so by the time the setSymbol callback fires the entry is gone.
        // Without this snapshot, restoration always fails → 3s recovery timer fires →
        // subscribedCallbackRef is nulled → all live candles dropped permanently.
        const preToggleMapEntry = preToggleResolution
          ? resolutionCallbackMapRef.current.get(preToggleResolution)
          : resolutionCallbackMapRef.current.get(currentResolution);


        // NOTE: Do NOT clear cachedIntervalRef/cachedTimeframeRef here.
        // Mode toggle only changes the value transformation (USD↔MC), not the raw data.
        // Keeping cache valid forces getBars to use the instant cached-data path
        // (re-transforms with new mode) instead of triggering a slow HTTP re-fetch
        // that creates race conditions during rapid toggles and can leave the chart blank.

        // Mark mode toggle pending — tells unsubscribeBars to skip destructive actions
        modeTogglePendingRef.current = true;

        // Helper: restore previous subscriber so WS candles keep flowing.
        // Called from (a) setSymbol callback and (b) safety timer.
        const restoreSubscriber = (source: string) => {
          if (activeSubscriberUIDRef.current || !preToggleUID || !preToggleMapEntry) return;
          activeSubscriberUIDRef.current = preToggleMapEntry.subscriberUID;
          subscribedCallbackRef.current = (bar: any) => {
            if (activeSubscriberUIDRef.current !== preToggleMapEntry.subscriberUID) return;
            const shift = totalShiftRef.current;
            try {
              if (shift > 0) {
                preToggleMapEntry.onRealtimeCallback({ ...bar, time: bar.time - shift });
              } else {
                preToggleMapEntry.onRealtimeCallback(bar);
              }
            } catch (tvErr) {
              console.error("[AdvancedOHLCChart] Mode-toggle restored callback threw:", String(tvErr));
            }
          };
          // Re-insert into the map so future toggles can also snapshot it
          resolutionCallbackMapRef.current.set(
            preToggleResolution || currentResolution,
            preToggleMapEntry,
          );
          // Cancel recovery timer — we have a valid callback now
          if (subscribeBarsRecoveryRef.current) {
            clearTimeout(subscribeBarsRecoveryRef.current);
            subscribeBarsRecoveryRef.current = null;
          }
        };

        // setSymbol with DIFFERENT symbol forces TradingView to call getBars fresh
        activeChart.setSymbol(newSymbol, currentResolution, () => {
          // setSymbol callback fires after getBars completes.
          // If subscribeBars was NOT called (TV reused old subscription),
          // activeSubscriberUIDRef will still be null (set by unsubscribeBars).
          // Restore from the PRE-TOGGLE snapshot (not the live map, which was cleared).
          restoreSubscriber("setSymbol-callback");
        });

        // SAFETY NET: If TradingView's lifecycle gets stuck after setSymbol()
        // (no subscribeBars within 500ms), restore the pre-toggle subscriber.
        // This is the same pattern as the resolution-switch recovery:
        // unsubscribeBars nulls activeSubscriberUIDRef → callback UID guard drops
        // all WS candles → chart goes blank. Restoring the previous subscriber
        // lets candles keep flowing at the chart's actual scale.
        setTimeout(() => {
          if (!activeSubscriberUIDRef.current && preToggleUID && preToggleMapEntry) {
            restoreSubscriber("safety-timer");
          }
        }, 500);

        // Update price lines after a short delay
        setTimeout(() => {
          syncLinesInFlightRef.current = false;
          lastAppliedLinesRef.current = {};
          updateChartMetrics();
        }, 300);
      } catch (e) {
      }
    };

    // DEBOUNCE: Rapid MC↔USD toggling fires 20+ setSymbol() calls before TradingView
    // can complete even one lifecycle (unsubscribeBars→resolveSymbol→getBars→subscribeBars).
    // TradingView's internal queue gets overwhelmed and drops lifecycles, leaving
    // subscribeBars never called → activeSubscriberUIDRef stays null → all live candles
    // dropped permanently. 300ms debounce collapses rapid toggles into a single call
    // and gives TradingView enough time to complete any in-progress lifecycle.
    if (modeToggleTimerRef.current) {
      clearTimeout(modeToggleTimerRef.current);
    }
    modeToggleTimerRef.current = setTimeout(() => {
      modeToggleTimerRef.current = null;
      if (chart) {
        doReset();
      } else {
        widget.onChartReady(doReset);
      }
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMode]);

  // Refs for data management (same as BackendOHLCChart)
  const lastGoodCandlesRef = useRef<BackendOHLCData[]>(preloadedData || []);
  // Phase 5: Per-resolution cache — avoids re-fetching when switching between timeframes
  // Key: resolution string (e.g. "1S", "15", "60"), Value: cached candle array
  const resolutionCacheRef = useRef<Map<string, BackendOHLCData[]>>(new Map());
  const inFlightRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const lastFetchAtRef = useRef<number>(0);
  const firstLoadRef = useRef(!preloadedData || preloadedData.length === 0);
  const hasInitializedRef = useRef(false);
  const datafeedRef = useRef<any>(null);
  // Cache tracking - prevents redundant HTTP calls
  const cachedIntervalRef = useRef<string | null>(null);
  const cachedTimeframeRef = useRef<string | null>(null);
  const fetchCountRef = useRef<number>(0); // Debug: track fetch count
  const getBarsInFlightRef = useRef<Promise<void> | null>(null); // Prevent concurrent getBars requests
  const getBarsInFlightKeyRef = useRef<string | null>(null);
  const visibleRangeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  // WebSocket for real-time OHLC updates (Monad only)
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscribedCallbackRef = useRef<((bar: any) => void) | null>(null);
  const lifecycleSeqRef = useRef(0); // Debug: monotonic counter for lifecycle event ordering
  const historyCallbackRef = useRef<((bars: any[], meta: any) => void) | null>(
    null,
  ); // Store current history callback for fast refresh
  // Throttle refs for updateChartMetrics from WS handlers (max once per second)
  const metricsThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metricsUpdatePendingRef = useRef(false);
  const latestTradeDataRef = useRef<any[]>(tradeData || []);
  const latestCreatorAddressRef = useRef<string | null>(creatorAddress || null);
  const latestUserWalletRef = useRef<string | null>(userWalletAddress || null);
  const latestTokenSymbolRef = useRef<string | null>(tokenSymbol || null);
  const latestTokenNameRef = useRef<string | null>(tokenName || null);
  const latestTokenDecimalsRef = useRef<number | null>(
    typeof tokenDecimals === "number" && !Number.isNaN(tokenDecimals)
      ? tokenDecimals
      : null,
  );
  const gapShiftsRef = useRef<GapShift[]>([]);
  const totalShiftRef = useRef<number>(0);
  const hasRealPriceDataRef = useRef<boolean>(false); // Track if we've received real price data
  const priceLineShapesRef = useRef<Record<string, any>>({});
  const previewLineShapeIdRef = useRef<string | null>(null);
  const previewCreationSeqRef = useRef(0);
  const lastMetricsRef = useRef<{
    lastPriceUsd?: number;
    lastMarketCapUsd?: number;
    maxMarketCapUsd?: number;
  }>({});
  const maxMarketCapFromApiRef = useRef<number | null>(null);
  const lastAppliedLinesRef = useRef<{
    entry?: number | null;
    exit?: number | null;
    maxMc?: number | null;
    limitOrderHash?: string;
  }>({});
  const syncLinesInFlightRef = useRef<boolean>(false);
  const lastPriceLinesRef = useRef<Record<string, number | null>>({});
  const priceLinesRef = useRef(priceLines);
  const limitOrdersRef = useRef(limitOrders);
  limitOrdersRef.current = limitOrders;

  // Log when priceLines prop changes

  priceLinesRef.current = priceLines;
  const priceLineSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const marksInitializedRef = useRef(false);
  const prevTradeDataLengthRef = useRef<number>(tradeData?.length || 0);
  const prevCreatorAddressRef = useRef<string | null>(creatorAddress || null);
  const tradeSignatureRef = useRef<string>(
    Array.isArray(tradeData)
      ? tradeData
          .map((t: any) => t.signature || t.transaction_hash || t.transactionHash || t.tx_hash || t.id || "")
          .join("|")
      : "",
  );

  // For Monad aggregation: track 1s candles within current timeframe window (1m, 5m, 15m, 1h, etc.)
  const currentAggregatedCandleRef = useRef<BackendOHLCData | null>(null);
  const oneSecondCandlesRef = useRef<BackendOHLCData[]>([]);
  const currentAggregatingIntervalRef = useRef<string | null>(null);
  // Track whether we've bridged the gap between REST/snapshot data and first real-time WS candle
  const wsGapBridgedRef = useRef(false);
  // Track if initial right-alignment has been done to prevent overriding user's zoom/pan
  const hasRightAlignedRef = useRef(false);
  const wsResetDoneRef = useRef(false);
  // Track whether WS is actively providing candle data (skip HTTP polling when true)
  const wsConnectedRef = useRef(false);
  // Track whether preloaded data has already been applied to prevent duplicate resetData()
  const preloadedDataAppliedRef = useRef(false);
  // Counter for throttling WS candle console.log output (~every 10th candle)
  const wsLogCountRef = useRef(0);
  // Fallback: queue a one-shot resetData() if candle arrives before subscribeBars callback is set
  const pendingCandleResetRef = useRef<NodeJS.Timeout | null>(null);
  // Guard: ensure only the FIRST data path triggers resetData() on initial load
  const chartPopulatedRef = useRef(false);
  // Signal getBars() instantly when WS snapshot or preloaded data arrives (replaces 100ms polling)
  const snapshotResolverRef = useRef<(() => void) | null>(null);
  // Recovery timer: if subscribeBars isn't called within 500ms of unsubscribeBars, force resetData()
  const subscribeBarsRecoveryRef = useRef<NodeJS.Timeout | null>(null);
  // Debounce timer for MC/USD mode toggle — prevents flooding TradingView with setSymbol() calls
  const modeToggleTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Flag: true between doReset()'s setSymbol() call and the next subscribeBars.
  // Tells unsubscribeBars to NOT null activeSubscriberUIDRef, delete from map, or start
  // recovery timer — the existing subscription must stay alive during mode toggles.
  const modeTogglePendingRef = useRef(false);
  // Monotonically increasing counter appended to symbol (e.g., TOKEN|MC|t3).
  // Forces TradingView to treat every mode toggle as a NEW symbol, preventing
  // no-ops when setSymbol() is called with the same symbol TV already cached.
  const modeToggleCountRef = useRef(0);

  // Derive the chart's ACTUAL display mode from the active subscriber UID.
  // displayModeRef.current changes instantly on toggle click, but the chart's
  // mode only changes when TradingView's lifecycle completes (subscribeBars).
  // Using displayModeRef for WS candle transformation causes MC-scale values
  // (×1B) to be sent to a USD-scale chart, making candles invisible.
  const getChartDisplayMode = useCallback((): "USD" | "MC" => {
    const uid = (activeSubscriberUIDRef.current || "").toUpperCase();
    if (uid.includes("|MC")) return "MC";
    if (uid.includes("|USD")) return "USD";
    return displayModeRef.current; // fallback when no active subscriber
  }, []);
  // Abort controller for in-flight lazy-load fetch in getBars (scroll-left pagination)
  // Allows unsubscribeBars to cancel a blocking fetch so TradingView's lifecycle can proceed
  const lazyLoadAbortRef = useRef<AbortController | null>(null);
  // Abort controller for predictive scroll-left prefetch (Phase 4: fetches older data before user reaches edge)
  const predictivePrefetchAbortRef = useRef<AbortController | null>(null);
  // Track TradingView's actual current resolution (dropdown selection), separate from React interval prop
  const tvResolutionRef = useRef<string>("1S");
  // Map of resolution → TradingView's raw onRealtimeCallback.
  // TradingView may reuse old subscriptions without calling subscribeBars again
  // (e.g., switching 1S→30S→1D→1S — TV never unsubscribes 1S and reuses it).
  // This Map lets us restore the correct callback when TV switches back.
  const resolutionCallbackMapRef = useRef<Map<string, {
    subscriberUID: string;
    onRealtimeCallback: (bar: any) => void;
  }>>(new Map());
  // Track active TradingView subscriber so stale unsubscribes can't kill the current callback
  const activeSubscriberUIDRef = useRef<string | null>(null);
  // Debounce ref for refreshMarks() calls
  const refreshMarksTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Lightweight hash to skip redundant setCandles/updateChartMetrics in getBars
  const lastCandleHashRef = useRef<string>("");
  // Counter for throttling mark-related logs
  const marksLogCountRef = useRef(0);

  // Helper to (re)draw price lines when chart is ready
  const requestPriceLineSync = useCallback(
    (delay: number = 0) => {

      if (priceLineSyncTimeoutRef.current) {
        clearTimeout(priceLineSyncTimeoutRef.current);
      }

      priceLineSyncTimeoutRef.current = setTimeout(
        () => {
          const widget = widgetRef.current;

          if (!widget) {
            // Retry shortly if widget not ready yet
            priceLineSyncTimeoutRef.current = setTimeout(
              () => requestPriceLineSync(0),
              50,
            );
            return;
          }

          const maxMarketCapUsd =
            lastMetricsRef.current.maxMarketCapUsd ?? null;

          const run = () => {
            syncPriceLines(maxMarketCapUsd);
          };

          if (typeof widget.onChartReady === "function") {
            widget.onChartReady(run);
          } else {
            run();
          }
        },
        Math.max(0, delay),
      );
    },
    [syncPriceLines],
  );

  // Refresh chart price lines when priceLines props change (entry/exit prices)
  // NOTE: We intentionally do NOT include displayMode here to avoid race conditions.
  // When displayMode changes, the chart reset effect (resetData → getBars → updateChartMetrics → syncPriceLines)
  // handles price line sync with fresh data. Including displayMode here causes a race where this effect
  // runs with stale lastMetricsRef before getBars completes with transformed data.
  useEffect(() => {
    requestPriceLineSync(10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceLines, limitOrders, requestPriceLineSync]);

  // Limit order preview line — listens for CustomEvents from TradeActionPanel slider/input
  useEffect(() => {
    const handlePreviewUpdate = (e: Event) => {
      try {
        const { targetMC } = (e as CustomEvent).detail;
        if (!Number.isFinite(targetMC) || targetMC <= 0) return;
        const widget = widgetRef.current;
        if (!widget) return;
        const chart = widget.activeChart?.() || widget.chart?.();
        if (!chart) return;

        const isMC = displayModeRef.current === "MC";
        // targetMC is already in raw USD market cap; convert to axis coordinates
        const axisPrice = isMC ? targetMC : targetMC / MARKET_CAP_MULTIPLIER;
        const labelText = `Limit Target: ${formatAxisLabel(axisPrice, isMC)}`;

        if (previewLineShapeIdRef.current) {
          // Move existing shape in place (no re-render)
          try {
            const shape = chart.getShapeById(previewLineShapeIdRef.current);
            if (shape) {
              shape.setPoints([{ price: axisPrice }]);
              shape.setProperties({ text: labelText });
              return;
            }
          } catch {
            // Shape was destroyed (e.g., removeAllShapes) — fall through to create
          }
          previewLineShapeIdRef.current = null;
        }

        // Create new preview shape
        const seq = ++previewCreationSeqRef.current;
        const result = chart.createShape(
          { price: axisPrice },
          {
            shape: "horizontal_line",
            text: labelText,
            disableSelection: true,
            disableSave: true,
            overrides: {
              linecolor: "#eab308",
              textcolor: "#eab308",
              linestyle: 2,
              linewidth: 1,
              showLabel: true,
              drawPriceLabel: true,
            },
          },
        );

        // Handle thenable (TradingView may return Promise from iframe)
        const storeId = (id: any) => {
          if (seq !== previewCreationSeqRef.current) {
            // Stale creation — remove the orphaned shape
            if (id && typeof id === "string") {
              try {
                const w = widgetRef.current;
                const c = w?.activeChart?.() || w?.chart?.();
                if (c) c.removeEntity(id);
              } catch {}
            }
            return;
          }
          if (id && typeof id === "string") previewLineShapeIdRef.current = id;
        };
        if (result && typeof result.then === "function") {
          result.then(storeId);
        } else {
          storeId(result);
        }
      } catch {
        // Silently ignore — chart may not be ready
      }
    };

    const handlePreviewClear = () => {
      previewCreationSeqRef.current++;
      try {
        if (previewLineShapeIdRef.current) {
          const widget = widgetRef.current;
          const chart = widget?.activeChart?.() || widget?.chart?.();
          if (chart) {
            chart.removeEntity(previewLineShapeIdRef.current);
          }
          previewLineShapeIdRef.current = null;
        }
      } catch {
        previewLineShapeIdRef.current = null;
      }
    };

    window.addEventListener("limit-preview-update", handlePreviewUpdate);
    window.addEventListener("limit-preview-clear", handlePreviewClear);
    return () => {
      window.removeEventListener("limit-preview-update", handlePreviewUpdate);
      window.removeEventListener("limit-preview-clear", handlePreviewClear);
    };
  }, []);

  useEffect(() => {
    latestTradeDataRef.current = tradeData || [];
  }, [tradeData]);

  useEffect(() => {
    latestCreatorAddressRef.current = creatorAddress || null;
  }, [creatorAddress]);

  useEffect(() => {
    latestUserWalletRef.current = userWalletAddress || null;
  }, [userWalletAddress]);

  useEffect(() => {
    latestTokenSymbolRef.current = tokenSymbol || null;
  }, [tokenSymbol]);

  useEffect(() => {
    latestTokenNameRef.current = tokenName || null;
  }, [tokenName]);

  useEffect(() => {
    latestTokenDecimalsRef.current =
      typeof tokenDecimals === "number" && !Number.isNaN(tokenDecimals)
        ? tokenDecimals
        : null;
  }, [tokenDecimals]);

  useEffect(() => {
    const tradeCount = tradeData?.length || 0;
    const previousCreatorAddress = prevCreatorAddressRef.current;
    const creatorAddressChanged = creatorAddress !== previousCreatorAddress;

    if (!widgetRef.current) {
      prevTradeDataLengthRef.current = tradeCount;
      prevCreatorAddressRef.current = creatorAddress || null;
      return;
    }

    if (tradeCount === 0) {
      marksInitializedRef.current = false;
      prevTradeDataLengthRef.current = tradeCount;
      prevCreatorAddressRef.current = creatorAddress || null;
      return;
    }

    const previousCount = prevTradeDataLengthRef.current;

    // Trigger chart reset if:
    // 1. Marks haven't been initialized yet, OR
    // 2. Trade count went from 0 to non-zero, OR
    // 3. Creator address changed (new dev wallet detected)
    if (
      !marksInitializedRef.current ||
      (previousCount === 0 && tradeCount > 0) ||
      creatorAddressChanged ||
      (tradeCount > 0 && previousCount !== tradeCount)
    ) {
      marksInitializedRef.current = true;
      widgetRef.current.onChartReady?.(() => {
        try {
          const chart = widgetRef.current?.chart?.();
          chart?.refreshMarks?.();
        } catch (error) {
          console.error(
            "[AdvancedOHLCChart] Failed to refreshMarks for trade data",
            error,
          );
        }
      });
    }

    prevTradeDataLengthRef.current = tradeCount;
    prevCreatorAddressRef.current = creatorAddress || null;
  }, [creatorAddress, tradeData?.length]);

  // Refresh marks when the underlying trade set changes (even if length stays the same)
  // Debounced to max once every 2 seconds to avoid flicker during high-volume periods
  useEffect(() => {
    const signature = Array.isArray(tradeData)
      ? tradeData
          .map((t: any) => t.signature || t.transaction_hash || t.transactionHash || t.tx_hash || t.id || "")
          .join("|")
      : "";

    if (signature && signature !== tradeSignatureRef.current) {
      tradeSignatureRef.current = signature;
      if (refreshMarksTimeoutRef.current) clearTimeout(refreshMarksTimeoutRef.current);
      refreshMarksTimeoutRef.current = setTimeout(() => {
        refreshMarksTimeoutRef.current = null;
        if (widgetRef.current) {
          widgetRef.current.onChartReady?.(() => {
            try {
              const chart = widgetRef.current?.chart?.();
              chart?.refreshMarks?.();
            } catch {}
          });
        }
      }, 800);
    }
    return () => { if (refreshMarksTimeoutRef.current) clearTimeout(refreshMarksTimeoutRef.current); };
  }, [tradeData]);

  // Single cancellable retry chain shared by both refresh paths (the chart's
  // direct store subscription below, and the imperative `refreshMarksNow` API
  // below that). Without this, every store mutation (add → confirm → remove)
  // spawns a fresh 30-attempt setTimeout chain and they accumulate concurrently
  // until each completes. With cancellation, at most one retry chain is alive
  // at any time and rapid mutations naturally collapse.
  const refreshRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefreshMarks = useCallback(() => {
    if (refreshRetryTimerRef.current) {
      clearTimeout(refreshRetryTimerRef.current);
      refreshRetryTimerRef.current = null;
    }
    const tryRefresh = (attemptsLeft: number) => {
      refreshRetryTimerRef.current = null;
      const widget = widgetRef.current;
      if (!widget) {
        if (attemptsLeft > 0) {
          refreshRetryTimerRef.current = setTimeout(
            () => tryRefresh(attemptsLeft - 1),
            100,
          );
        }
        return;
      }
      try {
        widget.onChartReady?.(() => {
          try {
            widget.chart?.()?.refreshMarks?.();
          } catch {}
        });
      } catch {}
    };
    // Up to 30 attempts × 100ms = 3s of retry headroom — covers the slowest
    // observed widget init time on cold caches.
    tryRefresh(30);
  }, []);

  // Cancel any pending retry chain on unmount so a stale timer can't fire
  // against a torn-down widget.
  useEffect(() => {
    return () => {
      if (refreshRetryTimerRef.current) {
        clearTimeout(refreshRetryTimerRef.current);
        refreshRetryTimerRef.current = null;
      }
    };
  }, []);

  // Direct subscription to the pendingTradeMarkers store as a safety net for
  // the parent's listener path. On component re-mount (e.g. after navigating
  // away and returning), the parent's `subscribePendingTrades` listener may
  // race the chart's widget initialization. Subscribing here too means even
  // if the parent's path silently no-ops (because chartRef wasn't ready), the
  // chart itself triggers a refresh as soon as its widget comes online.
  // Two rAFs of defer to ensure the parent's React render has committed and
  // `latestTradeDataRef` is populated before refreshMarks reads it.
  useEffect(() => {
    return subscribePendingTradeMarkers(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scheduleRefreshMarks();
        });
      });
    });
  }, [scheduleRefreshMarks]);

  // Imperative API: lets the trade page bypass the 800ms debounce above for
  // optimistic-marker inserts. Sub-150ms click→render path lives through here.
  // Robust against the re-mount race where the parent's listener fires before
  // the chart's TradingView widget has finished initializing — we poll widgetRef
  // briefly until it's ready, then run the refresh through onChartReady.
  useImperativeHandle(
    ref,
    () => ({
      refreshMarksNow: () => {
        scheduleRefreshMarks();
      },
    }),
    [scheduleRefreshMarks],
  );

  // Build URL for OHLC data (same as BackendOHLCChart)
  // Allow override of interval for when TradingView requests a different resolution
  const buildUrl = useCallback(
    (
      overrideInterval?: BackendInterval,
      overrideTimeframe?: BackendTimeRange,
    ) => {
      const {
        network: currentNetwork,
        mint: currentMint,
        pairAddress: currentPairAddress,
        interval: currentInterval,
        timeframe: currentTimeframe,
        optimize: currentOptimize,
      } = latestParamsRef.current;

      const effectiveInterval = overrideInterval || currentInterval;
      const effectiveTimeframe = overrideTimeframe || currentTimeframe;

      if (currentNetwork === "monad") {
        if (typeof window === "undefined") {
          throw new Error("Cannot build Monad OHLC URL on the server");
        }
        const url = new URL(
          "/api/token-service/ohlc-monad",
          window.location.origin,
        );
        const tokenAddress = currentMint || currentPairAddress;
        if (tokenAddress) url.searchParams.set("token_address", tokenAddress);
        // Fetch actual interval data (1s for 1s, etc.)
        url.searchParams.set("interval", effectiveInterval);
        url.searchParams.set("timeframe", effectiveTimeframe);
        if (currentOptimize) url.searchParams.set("optimize", "true");
        return url;
      }

      // Use new /v1/ohlcv/{tokenAddress} endpoint for Solana
      // Use pre-aggregated intervals for longer views (TimescaleDB continuous aggregates)
      // For Solana: Always use mint address, never pairAddress (prevents race condition override)
      const tokenAddress = currentMint;
      const url = new URL(`${BACKEND_URL}/v1/ohlcv/${tokenAddress}`);

      // Use effectiveInterval directly — maps to TimescaleDB continuous aggregate table
      // e.g., "5m" → ohlcv_5m, "30m" → ohlcv_30m, "4h" → ohlcv_4h, "1d" → ohlcv_1d
      url.searchParams.set("timeframe", effectiveInterval);

      // Set from timestamp so Go service queries the correct time range
      const timeRangeSeconds: Record<string, number> = {
        "1h": 3600,
        "4h": 14400,
        "24h": 86400,
        "7d": 604800,
        "30d": 2592000,
        "90d": 7776000,
        "180d": 15552000,
        "365d": 31536000,
      };
      const from = Math.floor(Date.now() / 1000) - (timeRangeSeconds[effectiveTimeframe] || 86400);
      url.searchParams.set("from", String(from));
      url.searchParams.set("limit", "2500");
      return url;
    },
    [],
  );

  // Helper function to right-align chart using logical range positioning
  // This ensures candles are aligned to the right side, with latest candles visible
  const rightAlignChart = useCallback((barCount: number) => {
    if (
      !widgetRef.current ||
      !containerRef.current ||
      barCount === 0 ||
      hasRightAlignedRef.current
    ) {
      return;
    }

    widgetRef.current.onChartReady(() => {
      try {
        const chart = widgetRef.current?.chart?.();
        if (!chart) return;

        const timeScale = chart.timeScale();
        if (!timeScale) return;

        // Get data from cache to calculate time-based ranges
        const cachedData = lastGoodCandlesRef.current;
        if (cachedData.length === 0) {
          return;
        }

        // Calculate target bars based on container width
        const PX_PER_BAR = 10; // pixels per bar (higher = fewer bars, more zoomed in)
        const MIN_BARS = 80; // minimum bars to show (lower = more zoomed in)

        const width = containerRef.current?.clientWidth || 800;
        const targetBars = Math.max(Math.floor(width / PX_PER_BAR), MIN_BARS);

        // Get the latest candle time (cache is already sorted by unix_time)
        const latestCandle = cachedData[cachedData.length - 1];
        const latestTime = latestCandle.unix_time;

        // Calculate the interval in seconds from the data
        let intervalSeconds = 60; // default 1 minute
        if (cachedData.length > 1) {
          const timeDiff = cachedData[1].unix_time - cachedData[0].unix_time;
          if (timeDiff > 0) intervalSeconds = timeDiff;
        }

        // Calculate time range: show targetBars worth of data ending at latestTime
        const barsToShow = Math.min(barCount, targetBars);
        const timeSpan = barsToShow * intervalSeconds;
        const fromTime = latestTime - timeSpan;
        const toTime = latestTime + intervalSeconds * 2; // Add buffer for future

        // Try logical range first (for TradingView lightweight charts)
        try {
          if (barCount <= targetBars) {
            // Sparse data: show all bars, position latest on right
            const lastIdx = barCount - 1 + 5; // Add padding
            const firstIdx = Math.max(0, lastIdx - targetBars);
            if (typeof timeScale.setVisibleLogicalRange === "function") {
              timeScale.setVisibleLogicalRange({ from: firstIdx, to: lastIdx });
            } else {
              // Fallback to time-based range
              if (typeof chart.setVisibleRange === "function") {
                chart.setVisibleRange({ from: fromTime, to: toTime });
              }
            }
          } else {
            // Dense data: show most recent bars
            const lastIdx = barCount - 1 + 5;
            const firstIdx = lastIdx - targetBars + 1;
            if (typeof timeScale.setVisibleLogicalRange === "function") {
              timeScale.setVisibleLogicalRange({ from: firstIdx, to: lastIdx });
            } else {
              // Fallback to time-based range
              if (typeof chart.setVisibleRange === "function") {
                chart.setVisibleRange({ from: fromTime, to: toTime });
              }
            }
          }
        } catch (logicalErr) {
          // If logical range fails, use time-based range
          if (typeof chart.setVisibleRange === "function") {
            chart.setVisibleRange({ from: fromTime, to: toTime });
          }
        }

        // Scroll to real-time to keep aligned to the right edge
        setTimeout(() => {
          try {
            timeScale.scrollToRealTime();
          } catch (e) {
          }
        }, 100);

        hasRightAlignedRef.current = true;
      } catch (e) {
      }
    });
  }, []);

  // Fetch candles function (EXACT same logic as BackendOHLCChart)
  const fetchCandles = useCallback(async () => {
    // Skip HTTP polling once WebSocket is providing live data
    if (wsConnectedRef.current) {
      return;
    }

    const {
      mint: currentMint,
      pairAddress: currentPairAddress,
      network: currentNetwork,
    } = latestParamsRef.current;

    // For Solana: WS snapshot is the sole data source — no HTTP polling needed
    if (currentNetwork !== "monad") {
      return;
    }

    // For Solana: require mint address (don't use pairAddress as it won't have OHLC data)
    // For Monad: accept either mint or pairAddress
    if (currentNetwork !== "monad") {
      if (!currentMint) {
        // Don't set error - just wait for mint to be resolved
        return;
      }
    } else if (!currentMint && !currentPairAddress) {
      setError("No mint or pair address provided");
      setIsLoading(false);
      return;
    }

    if (preloadedData && preloadedData.length > 0) {
      setIsLoading(false);
      hasInitializedRef.current = true;
      return;
    }

    if (hasInitializedRef.current && firstLoadRef.current) {
      return;
    }

    const url = buildUrl();
    const key = url.toString();

    if (inFlightRef.current === key) {
      return;
    }

    inFlightRef.current = key;

    const now = Date.now();
    const since = now - lastFetchAtRef.current;
    if (!firstLoadRef.current && since < 1000) {
      await new Promise((r) => setTimeout(r, 1000 - since));
    }
    lastFetchAtRef.current = Date.now();

    const doFetch = async (u: URL) => {
      const r = await fetch(u.toString(), {
        method: "GET",
        headers: {
          accept: "application/json",
          "X-API-Key": process.env.NEXT_PUBLIC_BACKEND_API_KEY || "test-key",
        },
      });
      let body: any = null;
      try {
        body = await r.clone().json();
      } catch {}
      if (!r.ok)
        throw new Error(
          body?.message || body?.error || `${r.status} ${r.statusText}`,
        );
      if (!body?.success)
        throw new Error(
          body?.message || body?.error || "API returned unsuccessful response",
        );

      // Handle different response formats: Solana uses candles[], Monad uses data.items[]
      let items: BackendOHLCData[];
      if (body.candles && Array.isArray(body.candles)) {
        // Solana /v1/ohlcv/{tokenAddress} format
        items = body.candles.map((c: any) => ({
          unix_time: c.time || c.unix_time,
          o: c.open ?? c.o,
          h: c.high ?? c.h,
          l: c.low ?? c.l,
          c: c.close ?? c.c,
          v_usd: c.volume ?? c.volume_usd ?? c.v_usd ?? 0,
        }));
      } else {
        // Monad /v1/trade/ohlc-data format
        items = body?.data?.items ?? [];
      }

      return items;
    };

    try {
      if (firstLoadRef.current) setIsLoading(true);
      setError(null);

      const items = await doFetch(url);
      if (!items || items.length === 0) {
        setError(null);
        setRetryCount((n) => Math.min(n + 1, 8));
        return;
      }

      // Check if we have real price data (not all zeros)
      const hasRealData = items.some(
        (item) => item.c > 0 || item.o > 0 || item.h > 0 || item.l > 0,
      );
      const isFirstRealData = hasRealData && !hasRealPriceDataRef.current;

      if (isFirstRealData) {
        hasRealPriceDataRef.current = true;
      }

      lastGoodCandlesRef.current = items;
      clampLaunchCandles(lastGoodCandlesRef.current);

      // ✅ Mark cache as belonging to the current interval + timeframe
      // This prevents unnecessary HTTP requests when toggling USD/MC
      // and prevents getBars() from seeing timeframeChanged=true after HTTP loads
      cachedIntervalRef.current = selectedInterval;
      cachedTimeframeRef.current = latestParamsRef.current.timeframe;

      setCandles(lastGoodCandlesRef.current);
      setLastUpdate(new Date());
      setRetryCount(0);

      // ✅ INSTANT MAX MC: Compute metrics immediately from HTTP data
      // This makes max MC line show up instantly, not waiting for websocket
      updateChartMetrics();
      onDataUpdate?.(lastGoodCandlesRef.current);

      // ✅ INSTANT PRICE LINES: Sync immediately if widget ready, otherwise queue
      if (widgetRef.current) {
        widgetRef.current.onChartReady?.(() => {
          // No delay - sync price lines right away for instant max MC display
          requestPriceLineSync(0);
        });
      }

      // If this is the first real data, reset chart to trigger re-render with proper price scale
      // Skip if WS snapshot already populated the chart — avoids double-reset race condition
      if (isFirstRealData && widgetRef.current && !chartPopulatedRef.current) {
        widgetRef.current.onChartReady?.(() => {
          try {
            if (chartPopulatedRef.current) return; // WS snapshot beat us — skip
            const chart =
              widgetRef.current?.activeChart?.() ||
              widgetRef.current?.chart?.();
            if (chart) {
              chart.resetData();
            }
          } catch (e) {
          }
        });
      }
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message || "Fetch error");
      setCandles(lastGoodCandlesRef.current);
      setRetryCount((n) => Math.min(n + 1, 8));
    } finally {
      if (mountedRef.current) setIsLoading(false);
      firstLoadRef.current = false;
      hasInitializedRef.current = true;
      inFlightRef.current = null;
    }
  }, [
    buildUrl,
    onDataUpdate,
    preloadedData,
    selectedInterval,
    requestPriceLineSync,
  ]);

  // Load TradingView library
  useEffect(() => {

    // Already loaded
    if ((window as any).TradingView) {
      if (!libraryLoaded) setLibraryLoaded(true);
      return;
    }

    if (libraryLoaded) {
      return;
    }

    // Check for existing script in DOM
    const existingScript = document.querySelector(
      'script[src*="charting_library.standalone.js"]',
    );

    // Function to wait for TradingView to be available
    const waitForTradingView = (timeout: number = 5000) => {
      const startTime = Date.now();

      const check = () => {
        if ((window as any).TradingView) {
          setLibraryLoaded(true);
          return;
        }

        if (Date.now() - startTime < timeout) {
          requestAnimationFrame(check);
        } else {
          console.error(
            "[AdvancedOHLCChart] ❌ TradingView not found after",
            timeout,
            "ms",
          );
          setError("Failed to load TradingView library - timeout");
          setIsLoading(false);
        }
      };

      check();
    };

    if (existingScript) {
      // Script exists, wait for it to load
      waitForTradingView(5000);
      return;
    }

    // Script doesn't exist, create it
    const script = document.createElement("script");
    script.src =
      "/charting_library/charting_library/charting_library.standalone.js";
    script.async = true;

    script.onload = () => {
      waitForTradingView(2000);
    };

    script.onerror = (e) => {
      console.error("[AdvancedOHLCChart] ❌ Script load error:", e);
      setError("Failed to load charting library - script error");
      setIsLoading(false);
    };

    document.head.appendChild(script);
  }, [libraryLoaded]);

  // Update candles when preloaded data changes - PRIORITY DATA SOURCE (same as BackendOHLCChart)
  useEffect(() => {
    if (preloadedData && preloadedData.length > 0) {
      // Only use preloaded data if we have valid mint or pairAddress
      if (!mint && !pairAddress) {
        return;
      }


      // Set preloaded data as the primary source
      setCandles(preloadedData);
      lastGoodCandlesRef.current = preloadedData;
      clampLaunchCandles(lastGoodCandlesRef.current);
      setLastUpdate(new Date());
      setIsLoading(false);
      hasInitializedRef.current = true;
      firstLoadRef.current = false;
      updateChartMetrics();

      onDataUpdate?.(preloadedData);

      // Don't start polling when we have preloaded data
      return;
    }

    // Only start polling if we don't have preloaded data
    mountedRef.current = true;
    fetchCandles();

    const backoff = Math.min(Math.pow(2, retryCount), 8);
    // Skip jitter for faster initial loading, add it only for subsequent polls
    const jitter = firstLoadRef.current ? 0 : Math.floor(Math.random() * 2000);
    const intervalMs = baseRefreshMs * backoff + jitter;

    const id = setInterval(fetchCandles, intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
      // NOTE: WebSocket cleanup is handled by the dedicated WebSocket useEffects (Monad/Solana)
      // This polling effect should only clean up its own resources (the interval timer)
      // DO NOT close WebSocket here - it would break real-time updates when deps change
    };
  }, [
    fetchCandles,
    retryCount,
    mint,
    pairAddress,
    selectedInterval,
    timeframe,
    baseRefreshMs,
    preloadedData,
    onDataUpdate,
  ]);

  // Handle prop changes - refetch data when interval/timeframe changes (same as BackendOHLCChart)
  const prevIntervalRef = useRef(selectedInterval);
  const prevTimeframeRef = useRef(timeframe);

  useEffect(() => {
    // Only refetch if parameters actually changed and we're not on initial load
    if (
      hasInitializedRef.current &&
      (prevIntervalRef.current !== selectedInterval ||
        prevTimeframeRef.current !== timeframe)
    ) {
      prevIntervalRef.current = selectedInterval;
      prevTimeframeRef.current = timeframe;

      // For Solana: WS always streams 1s candles, no HTTP refetch needed.
      // TradingView's setResolution lifecycle (from syncWidgetWithParams effect)
      // handles resolution changes using cached 1s data.
      const currentNetwork = latestParamsRef.current.network;
      if (currentNetwork === "monad") {
        hasInitializedRef.current = false;
        firstLoadRef.current = true;
        fetchCandles();
      }
      // Solana: hasInitializedRef stays true, fetchCandles() skipped
    }
  }, [selectedInterval, timeframe, fetchCandles]);

  // Pre-fetch data on mount (like BackendOHLCChart does)
  useEffect(() => {
    // Use preloaded data if available (same as BackendOHLCChart)
    if (preloadedData && preloadedData.length > 0) {
      lastGoodCandlesRef.current = preloadedData;
      clampLaunchCandles(lastGoodCandlesRef.current);
      setCandles(lastGoodCandlesRef.current);
      setIsLoading(false);
      hasInitializedRef.current = true;
      return;
    }

    // Otherwise fetch data immediately (don't wait for TradingView to call getBars)
    if (!mint && !pairAddress) {
      setError("No mint or pair address provided");
      setIsLoading(false);
      return;
    }

    // Only fetch if we haven't initialized yet
    if (!hasInitializedRef.current) {
      fetchCandles();
    }
  }, [mint, pairAddress, preloadedData]); // Run when these change

  // Monad OHLC WebSocket connection - runs independently of TradingView's lifecycle
  // This ensures real-time updates work even if subscribeBars isn't called by TradingView
  useEffect(() => {
    // Only connect for Monad network (hyperliquid uses its own candle hook)
    if (network !== "monad") {
      return;
    }

    const tokenAddress = mint || pairAddress;
    if (!tokenAddress) {
      return;
    }

    // Build WebSocket URL
    // For Monad: Always use 1s interval (backend supports it) and aggregate into 1m if needed
    const wsBaseUrl =
      process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL ||
      "http://localhost:8081";
    const wsInterval = "1s"; // Always use 1s for Monad to get real-time updates
    // Convert http/https to ws/wss for WebSocket
    const wsProtocol = wsBaseUrl.startsWith("https") ? "wss" : "ws";
    const wsHost = wsBaseUrl.replace(/^https?:\/\//, "");
    const wsUrl = `${wsProtocol}://${wsHost}/v1/ohlc/stream?token_address=${tokenAddress}&interval=${wsInterval}`;

    // Check if we need to aggregate 1s -> 1m when viewing 1m candles
    const needsAggregation = selectedInterval === "1m";

    // Track if connection was closed by cleanup (don't reconnect in that case)
    let closedByCleanup = false;

    // Extract message handler to reuse in connect function
    const handleMessage = (event: MessageEvent) => {
      try {
        // RACE FIX: Reject if this WS is for a different token than currently displayed
        if (activeTokenRef.current !== tokenAddress) {
          return;
        }

        const message = JSON.parse(event.data);

        // Handle initial history batch
        if (message.type === "ohlc_history") {
          const candles = message.data as Array<any>;

          if (candles.length === 0) {

            // Create a placeholder candle at 0 when no data (any network)
            const currentNetwork = latestParamsRef.current.network;
            const now = Math.floor(Date.now() / 1000);
            const placeholderCandle: BackendOHLCData = {
              unix_time: now,
              o: 0,
              h: 0,
              l: 0,
              c: 0,
              v_usd: 0,
            };
            lastGoodCandlesRef.current = [placeholderCandle];

            // Update state to trigger chart refresh
            setCandles([placeholderCandle]);
            setIsLoading(false);
            hasInitializedRef.current = true;
            firstLoadRef.current = false;
            return;
          }

          // Clear existing cache and replace with WebSocket data
          lastGoodCandlesRef.current = [];

          // Update cache with historical data - WebSocket sends { time, o, h, l, c, v }
          // Skip all-zero candles (no trades in that period) to avoid MIN_PRICE → 100 MC artifacts
          candles.forEach((ohlcData: any, idx: number) => {
            if (ohlcData.o === 0 && ohlcData.h === 0 && ohlcData.l === 0 && ohlcData.c === 0) {
              return; // Drop zero candles
            }

            const newCandle: BackendOHLCData = {
              unix_time: ohlcData.time,
              o: ohlcData.o,
              h: ohlcData.h,
              l: ohlcData.l,
              c: ohlcData.c,
              v_usd: ohlcData.v || 0,
            };

            lastGoodCandlesRef.current.push(newCandle);
          });

          // Sort cache by time
          lastGoodCandlesRef.current.sort((a, b) => a.unix_time - b.unix_time);
          clampLaunchCandles(lastGoodCandlesRef.current);

          if (CHART_DEBUG) {
          }

          // Update the cached interval ref so getBars knows we have fresh data for this interval
          cachedIntervalRef.current = selectedInterval;
          if (CHART_DEBUG) console.log(
            "[AdvancedOHLCChart] 📊 cachedIntervalRef set to:",
            cachedIntervalRef.current,
          );

          // Check if we have real price data (not all zeros)
          const hasRealData = lastGoodCandlesRef.current.some(
            (c) => c.c > 0 || c.o > 0 || c.h > 0 || c.l > 0,
          );
          const isFirstRealData = hasRealData && !hasRealPriceDataRef.current;

          if (isFirstRealData) {
            hasRealPriceDataRef.current = true;
            // Refresh symbol once to force TradingView to recalc price scale/timeframe stats
            setTimeout(() => {
              widgetRef.current?.onChartReady(() => {
                try {
                  // For Solana: prefer mint to prevent pairAddress override
                  const currentNetwork = latestParamsRef.current.network;
                  const tokenId =
                    currentNetwork === "monad"
                      ? `${mint || pairAddress}`
                      : `${mint}`;
                  const currentResolution =
                    INTERVAL_TO_RESOLUTION[selectedInterval];
                  widgetRef.current?.setSymbol(
                    tokenId,
                    currentResolution,
                    () => {
                    },
                  );
                } catch (e) {
                }
              });
            }, 50);
          }

          // Only update React state on first initialization (dismiss loading overlay).
          // After that, TradingView gets updates via subscribeBars — no need to re-render React.
          if (!hasInitializedRef.current) {
            setCandles([...lastGoodCandlesRef.current]);
          }
          setIsLoading(false);
          hasInitializedRef.current = true;
          firstLoadRef.current = false; // Ensure loading overlay is dismissed
          updateChartMetrics();

          // Force TradingView to refresh data from the updated cache — only on first WS batch.
          // After that, subscribeBars handles live candle updates without needing resetData().
          // Calling resetData() every WS message forces getMarks() re-fetch → marker flicker.
          if (!wsResetDoneRef.current && !chartPopulatedRef.current) {
            wsResetDoneRef.current = true;
            requestAnimationFrame(() => {
              if (widgetRef.current) {
                try {
                  // Use resetData() to refresh chart without disrupting subscription
                  const chart = widgetRef.current.chart();
                  if (chart && typeof chart.resetData === "function") {
                    chartPopulatedRef.current = true;
                    chart.resetData();
                    // Redraw price lines after reset so overlays persist through refreshes
                    requestPriceLineSync(50);

                    // Refresh marks if trade data is already available
                    if (latestTradeDataRef.current?.length > 0) {
                      setTimeout(() => {
                        try { widgetRef.current?.chart?.()?.refreshMarks?.(); } catch {}
                      }, 500);
                    }

                    // After refresh, right-align chart to show latest candles
                    try {
                      if (lastGoodCandlesRef.current.length > 0) {
                        requestAnimationFrame(() => {
                          rightAlignChart(lastGoodCandlesRef.current.length);
                        });
                      }
                    } catch (rangeErr) {
                    }
                  } else if (isFirstRealData) {
                  // Fallback: only use setSymbol for first real data to update price scale
                  widgetRef.current.onChartReady(() => {
                    try {
                      // For Solana: prefer mint to prevent pairAddress override
                      const currentNetwork = latestParamsRef.current.network;
                      const tokenId =
                        currentNetwork === "monad" ? mint || pairAddress : mint;
                      const currentResolution =
                        INTERVAL_TO_RESOLUTION[selectedInterval] || "1S";
                      widgetRef.current.setSymbol(
                        tokenId,
                        currentResolution,
                        () => {

                          // After refresh, right-align chart to show latest candles
                          try {
                            if (lastGoodCandlesRef.current.length > 0) {
                              requestAnimationFrame(() => {
                                rightAlignChart(
                                  lastGoodCandlesRef.current.length,
                                );
                              });
                            }
                          } catch (rangeErr) {
                          }
                        },
                      );
                    } catch (e) {
                    }
                  });
                }
              } catch (e) {
              }
            } else {
            }
            });
          }

          return;
        }

        // Handle real-time candle updates
        if (message.type !== "ohlc_candle") {
          return;
        }

        // WS is providing live data — stop HTTP polling
        wsConnectedRef.current = true;

        const ohlcData = message.data;

        // Throttle WS candle logs (~every 10th candle) to reduce console noise
        wsLogCountRef.current++;
        const shouldLogWs = wsLogCountRef.current % 10 === 0;

        // For Monad: Aggregate 1s candles into the current viewing timeframe (1m, 5m, 15m, 1h, etc.)
        const currentSelectedInterval = latestParamsRef.current.interval;

        // Only aggregate if viewing a timeframe that's longer than 1s (we always receive 1s candles)
        const needsAggregation =
          network === "monad" &&
          currentSelectedInterval !== "1s" &&
          currentSelectedInterval !== "5s" &&
          currentSelectedInterval !== "15s" &&
          currentSelectedInterval !== "30s";

        if (needsAggregation) {
          // This is a 1s candle - aggregate into current 1m candle
          const oneSecCandle: BackendOHLCData = {
            unix_time: ohlcData.time,
            o: ohlcData.o,
            h: ohlcData.h,
            l: ohlcData.l,
            c: ohlcData.c,
            v_usd: ohlcData.v || 0,
          };

          // Get the current window start time for the viewing interval
          const windowStart = getWindowStartTime(
            oneSecCandle.unix_time,
            currentSelectedInterval,
          );

          // Check if this 1s candle belongs to current timeframe window
          if (
            !currentAggregatedCandleRef.current ||
            currentAggregatedCandleRef.current.unix_time !== windowStart
          ) {
            // New timeframe window - finalize previous candle if it exists
            if (currentAggregatedCandleRef.current) {
              const finalizedCandle = currentAggregatedCandleRef.current;

              // Update cache with finalized candle (it's complete now)
              const cachedData = lastGoodCandlesRef.current;
              const existingIdx = cachedData.findIndex(
                (c) => c.unix_time === finalizedCandle.unix_time,
              );
              if (existingIdx >= 0) {
                cachedData[existingIdx] = finalizedCandle;
              } else {
                cachedData.push(finalizedCandle);
                cachedData.sort((a, b) => a.unix_time - b.unix_time);
              }
            }

            // Create new aggregated candle for new timeframe window
            currentAggregatedCandleRef.current = {
              unix_time: windowStart,
              o: oneSecCandle.o,
              h: oneSecCandle.h,
              l: oneSecCandle.l,
              c: oneSecCandle.c,
              v_usd: oneSecCandle.v_usd,
            };
            oneSecondCandlesRef.current = [oneSecCandle];

          } else {
            // Update existing aggregated candle with this 1s candle
            const currentCandle = currentAggregatedCandleRef.current;
            currentCandle.h = Math.max(currentCandle.h, oneSecCandle.h);
            currentCandle.l = Math.min(currentCandle.l, oneSecCandle.l);
            currentCandle.c = oneSecCandle.c; // Close = latest price
            currentCandle.v_usd += oneSecCandle.v_usd;

            oneSecondCandlesRef.current.push(oneSecCandle);

            // Keep only a reasonable number of 1s candles in memory (e.g., enough for the current timeframe)
            // For 1m: 60, for 5m: 300, for 15m: 900, etc.
            const maxCandlesToKeep =
              currentSelectedInterval === "1m"
                ? 60
                : currentSelectedInterval === "5m"
                  ? 300
                  : currentSelectedInterval === "15m"
                    ? 900
                    : currentSelectedInterval === "1h"
                      ? 3600
                      : 100;

            if (oneSecondCandlesRef.current.length > maxCandlesToKeep) {
              oneSecondCandlesRef.current =
                oneSecondCandlesRef.current.slice(-maxCandlesToKeep);
            }
          }

          // Use the aggregated candle for chart update
          const aggregatedCandle = currentAggregatedCandleRef.current;


          // Convert aggregated candle to TradingView bar format
          const baseBar = {
            time: aggregatedCandle.unix_time * 1000, // Convert to ms
            open: aggregatedCandle.o,
            high: aggregatedCandle.h,
            low: aggregatedCandle.l,
            close: aggregatedCandle.c,
            volume: aggregatedCandle.v_usd,
          };

          // Apply display mode transformation for Monad
          // Use chart's actual mode, not displayModeRef (which changes instantly on click)
          const currentDisplayMode = getChartDisplayMode();
          let bar = applyFlatCandleSpread(transformBar(baseBar, currentDisplayMode, true));

          // Update cache with aggregated 1m candle (store raw USD data)
          const cachedData = lastGoodCandlesRef.current;
          const existingIdx = cachedData.findIndex(
            (c) => c.unix_time === aggregatedCandle.unix_time,
          );
          if (existingIdx >= 0) {
            cachedData[existingIdx] = aggregatedCandle;
          } else {
            cachedData.push(aggregatedCandle);
            cachedData.sort((a, b) => a.unix_time - b.unix_time);
          }

          // Update chart via callback
          if (subscribedCallbackRef.current && bar.time > 0) {
            try {
              subscribedCallbackRef.current(bar);
            } catch (e) {
              subscribedCallbackRef.current = null;
            }
          }
          // Throttled updateChartMetrics (max once per second from WS)
          if (!metricsThrottleRef.current) {
            updateChartMetrics();
            metricsThrottleRef.current = setTimeout(() => {
              metricsThrottleRef.current = null;
              if (metricsUpdatePendingRef.current) {
                metricsUpdatePendingRef.current = false;
                updateChartMetrics();
              }
            }, 1000);
          } else {
            metricsUpdatePendingRef.current = true;
          }

          return; // Don't process as 1s candle
        }


        // Convert to TradingView bar format (raw USD data first)
        const baseBar = {
          time: (ohlcData.time || 0) * 1000, // Convert to ms
          open: ohlcData.o,
          high: ohlcData.h,
          low: ohlcData.l,
          close: ohlcData.c,
          volume: ohlcData.v || 0,
        };

        // For Monad: Ensure new candle connects to previous candle (work with raw USD data)
        const currentNetwork = latestParamsRef.current.network;
        const isMonad = currentNetwork === "monad";
        if (isMonad) {
          const cachedData = lastGoodCandlesRef.current;
          if (cachedData.length > 0) {
            // Find the most recent candle (cache is already sorted by unix_time)
            const previousCandle = cachedData[cachedData.length - 1];

            // If this candle's time is after the previous, ensure continuity
            if (baseBar.time / 1000 > previousCandle.unix_time) {
              const previousClose = previousCandle.c;

              // Connect: new candle's open should equal previous candle's close
              if (baseBar.open !== previousClose) {
                const wasFlat =
                  baseBar.open === baseBar.high &&
                  baseBar.open === baseBar.low &&
                  baseBar.open === baseBar.close;
                baseBar.open = previousClose;

                if (wasFlat) {
                  // Was a flat candle - keep it flat at the new price
                  baseBar.high = previousClose;
                  baseBar.low = previousClose;
                  baseBar.close = previousClose;
                } else {
                  // Had variation - adjust high/low to maintain validity
                  if (baseBar.high < baseBar.open) baseBar.high = baseBar.open;
                  if (baseBar.low > baseBar.open) baseBar.low = baseBar.open;
                }

              }
            }
          }
        }

        // Apply display mode transformation before sending to chart
        // Use chart's actual mode, not displayModeRef (which changes instantly on click)
        const currentDisplayMode = getChartDisplayMode();
        let bar = applyFlatCandleSpread(transformBar(baseBar, currentDisplayMode, true));

        // Update the chart via callback if available
        if (subscribedCallbackRef.current && bar.time > 0) {
          try {
            subscribedCallbackRef.current(bar);
          } catch (e) {
            subscribedCallbackRef.current = null;
          }
        } else {
          console.warn(
            "[AdvancedOHLCChart] ⚠️ Real-time update received but callback not available:",
            {
              hasCallback: !!subscribedCallbackRef.current,
              barTime: bar.time,
              message:
                "subscribeBars may not have been called yet by TradingView",
            },
          );
        }

        // Also update our cache with the new candle (store raw USD data, not transformed)
        const newCandle: BackendOHLCData = {
          unix_time: baseBar.time / 1000,
          o: baseBar.open,
          h: baseBar.high,
          l: baseBar.low,
          c: baseBar.close,
          v_usd: baseBar.volume,
        };

        // Update or add the candle to cache
        const cachedData = lastGoodCandlesRef.current;
        const existingIdx = cachedData.findIndex(
          (c) => c.unix_time === newCandle.unix_time,
        );
        if (existingIdx >= 0) {
          cachedData[existingIdx] = newCandle;
        } else {
          cachedData.push(newCandle);
          cachedData.sort((a, b) => a.unix_time - b.unix_time);
        }
        // Throttled updateChartMetrics (max once per second from WS)
        if (!metricsThrottleRef.current) {
          updateChartMetrics();
          metricsThrottleRef.current = setTimeout(() => {
            metricsThrottleRef.current = null;
            if (metricsUpdatePendingRef.current) {
              metricsUpdatePendingRef.current = false;
              updateChartMetrics();
            }
          }, 1000);
        } else {
          metricsUpdatePendingRef.current = true;
        }
      } catch (e) {
        console.error(
          "[AdvancedOHLCChart] Error parsing WebSocket message:",
          e,
        );
      }
    };

    // Extract connect function that can be called recursively for reconnection
    const connect = () => {
      if (closedByCleanup) {
        return;
      }


      // Close existing WebSocket if any
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
        };

        ws.onmessage = handleMessage;

        ws.onerror = (error) => {
          console.error("[AdvancedOHLCChart] Monad WebSocket error:", error);
        };

        ws.onclose = (event) => {
          wsRef.current = null;

          // Reconnect after delay if component is still mounted and not closed by cleanup
          if (!closedByCleanup && mountedRef.current) {
            wsReconnectTimeoutRef.current = setTimeout(() => {
              connect(); // Recursively call connect to reconnect
            }, 2000); // Reduced from 5000ms to 2000ms for faster reconnection
          }
        };
      } catch (e) {
        console.error(
          "[AdvancedOHLCChart] Failed to create Monad WebSocket:",
          e,
        );
        // Retry connection on error if not closed by cleanup
        if (!closedByCleanup && mountedRef.current) {
          wsReconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 2000);
        }
      }
    };

    // Initial connection
    connect();

    // Cleanup on unmount or when dependencies change
    return () => {
      closedByCleanup = true;
      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
        wsReconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [network, mint, pairAddress]); // Re-connect when token changes (NOT interval — WS always streams 1s, aggregation is client-side)

  // Solana OHLC WebSocket connection - uses /v1/ws/ohlcv/{mint}?timeframe=1s endpoint
  // HTTP loads initial data first, then WebSocket takes over for real-time updates only
  // ROBUST IMPLEMENTATION: Never disconnects - includes heartbeat, exponential backoff, visibility handling
  useEffect(() => {
    // Only connect for Solana network (non-monad, non-hyperliquid)
    if (network === "monad" || network === "hyperliquid") {
      return;
    }

    const tokenAddress = mint || pairAddress;
    if (!tokenAddress) {
      return;
    }

    // WS connects immediately — no need to wait for HTTP.
    // The snapshot provides all historical data; HTTP is a background fallback only.

    // Build WebSocket URL for Solana
    // Use NEXT_PUBLIC_WEBSOCKET_URL which points to the token service
    const wsBaseUrl =
      process.env.NEXT_PUBLIC_WEBSOCKET_URL ||
      "https://token-stage.narrative.trade";
    const wsInterval = "1s"; // Always use 1s for real-time updates
    // Compute snapshot resolution: use display interval for history so the snapshot
    // covers more time (e.g. 500×15m = 5.2 days vs 500×1s = 8 min)
    const currentInterval = latestParamsRef.current.interval;
    const snapshotInterval = ["1s", "5s", "15s", "30s"].includes(currentInterval) ? "1s" : currentInterval;
    const snapshotParam = snapshotInterval !== "1s" ? `&snapshot_timeframe=${snapshotInterval}` : "";
    // Convert http/https to ws/wss for WebSocket
    const wsProtocol = wsBaseUrl.startsWith("https") ? "wss" : "ws";
    const wsHost = wsBaseUrl.replace(/^https?:\/\//, "");
    const wsUrl = `${wsProtocol}://${wsHost}/v1/ws/ohlcv/${tokenAddress}?timeframe=${wsInterval}${snapshotParam}`;

    // Track if connection was closed by cleanup
    let closedByCleanup = false;

    // Robust reconnection state
    let reconnectAttempts = 0;
    const MAX_RECONNECT_DELAY = 30000; // Max 30 seconds between attempts
    const BASE_RECONNECT_DELAY = 1000; // Start with 1 second

    // Heartbeat state - detect dead connections
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let lastMessageTime = Date.now();
    const HEARTBEAT_INTERVAL = 25000; // Check every 25 seconds
    const HEARTBEAT_TIMEOUT = 35000; // Consider dead if no message for 35 seconds

    // Handle Solana WebSocket messages
    const handleSolanaMessage = (event: MessageEvent) => {
      try {
        // Update last message time for heartbeat detection
        lastMessageTime = Date.now();

        // RACE FIX: Reject if this WS is for a different token than currently displayed.
        // tokenAddress is closure-captured when this WS was created; activeTokenRef
        // is updated synchronously during render, so a mismatch = stale WS.
        if (activeTokenRef.current !== tokenAddress) {
          return;
        }

        const message = JSON.parse(event.data);

        // Handle ping/pong for keepalive - respond to server pings
        if (message.type === "ping" || message === "ping") {
          const pong = JSON.stringify({ type: "pong" });
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(pong);
          }
          return;
        }

        // Handle pong responses (server acknowledging our ping)
        if (message.type === "pong" || message === "pong") {
          return;
        }

        // Handle initial snapshot — WS is the PRIMARY data source.
        // If HTTP/preloaded data exists, merge newer candles.
        // If no cached data, use entire snapshot to populate the chart.
        if (message.type === "snapshot") {
          const snapshotCandles = (message.data as Array<any>) || [];
          wsGapBridgedRef.current = false; // Reset for the upcoming real-time candles

          if (snapshotCandles.length === 0) {
            const now = Math.floor(Date.now() / 1000);
            const placeholderCandle: BackendOHLCData = {
              unix_time: now,
              o: 0, h: 0, l: 0, c: 0,
              v_usd: 0,
            };
            lastGoodCandlesRef.current = [placeholderCandle];
            cachedIntervalRef.current = latestParamsRef.current.interval;
            cachedTimeframeRef.current = latestParamsRef.current.timeframe;
            wsConnectedRef.current = true;
            // Wake getBars() — even empty snapshot means "no data, stop waiting"
            if (snapshotResolverRef.current) {
              snapshotResolverRef.current();
              snapshotResolverRef.current = null;
            }
            setCandles([placeholderCandle]);
            setIsLoading(false);
            hasInitializedRef.current = true;
            firstLoadRef.current = false;
            return;
          }

          // Convert snapshot to our format, dropping all-zero candles (no trades in
          // that second). Without this filter, getBars() substitutes MIN_PRICE (1e-7)
          // which in MC mode = 0.0000001 × 1B = 100 — creating a visible green dot.
          const converted: BackendOHLCData[] = snapshotCandles
            .map((c: any) => ({
              unix_time: c.unix_time || c.time,
              o: c.o || c.open || 0,
              h: c.h || c.high || 0,
              l: c.l || c.low || 0,
              c: c.c || c.close || 0,
              v_usd: c.v_usd || c.v || c.volume || 0,
            }))
            .filter((c: BackendOHLCData) => !(c.o === 0 && c.h === 0 && c.l === 0 && c.c === 0))
            .sort((a: BackendOHLCData, b: BackendOHLCData) => a.unix_time - b.unix_time);

          // RACE FIX (defense-in-depth): If chart hasn't been populated yet
          // (token switch in progress), any existing cache is stale from the
          // previous token — purge before applying snapshot.
          if (!chartPopulatedRef.current && lastGoodCandlesRef.current.length > 0) {
            lastGoodCandlesRef.current = [];
          }

          const cachedData = lastGoodCandlesRef.current;

          if (cachedData.length > 0) {
            // HTTP/preloaded data exists — merge only newer candles
            const lastCachedTime = cachedData[cachedData.length - 1].unix_time;
            const newerCandles = converted.filter((c: BackendOHLCData) => c.unix_time > lastCachedTime);

            if (newerCandles.length > 0) {
              cachedData.push(...newerCandles);
              cachedData.sort((a, b) => a.unix_time - b.unix_time);
              clampLaunchCandles(cachedData);
            } else {
            }

            // Sync cached refs so getBars() knows this data matches the current params
            cachedTimeframeRef.current = latestParamsRef.current.timeframe;

            // Always trigger resetData() to re-render with merged data (through getBars → collapseTimeGaps)
            if (!chartPopulatedRef.current) {
              requestAnimationFrame(() => {
                try {
                  const chart = widgetRef.current?.chart?.() || (widgetRef.current as any)?.activeChart?.();
                  if (chart?.resetData) {
                    chartPopulatedRef.current = true;
                    chart.resetData();
                    requestPriceLineSync(50);
                    if (latestTradeDataRef.current?.length > 0) {
                      setTimeout(() => {
                        try { widgetRef.current?.chart?.()?.refreshMarks?.(); } catch {}
                      }, 500);
                    }
                  }
                } catch (e) {
                }
              });
            }
          } else {
            // No cached data — use entire snapshot as primary data source

            lastGoodCandlesRef.current = converted;
            clampLaunchCandles(lastGoodCandlesRef.current);
            cachedIntervalRef.current = latestParamsRef.current.interval;
            cachedTimeframeRef.current = latestParamsRef.current.timeframe;
            wsConnectedRef.current = true;

            // Instantly wake getBars() if it's waiting for snapshot data
            if (snapshotResolverRef.current) {
              snapshotResolverRef.current();
              snapshotResolverRef.current = null;
            }

            setCandles(lastGoodCandlesRef.current);
            setIsLoading(false);
            hasInitializedRef.current = true;
            firstLoadRef.current = false;
            updateChartMetrics();

            // Force TradingView to re-fetch from the now-populated cache
            if (!chartPopulatedRef.current) {
              requestAnimationFrame(() => {
                // getBars() may have already populated the chart — skip redundant resetData()
                if (chartPopulatedRef.current) return;
                try {
                  const chart = widgetRef.current?.chart?.() || (widgetRef.current as any)?.activeChart?.();
                  if (chart?.resetData) {
                    chartPopulatedRef.current = true;
                    chart.resetData();
                    requestPriceLineSync(50);

                    // Refresh marks if trade data is already available
                    if (latestTradeDataRef.current?.length > 0) {
                      setTimeout(() => {
                        try { widgetRef.current?.chart?.()?.refreshMarks?.(); } catch {}
                      }, 500);
                    }
                  }
                } catch (e) {
                }
              });
            }
          }

          // Mark WS as connected so HTTP polling stops
          wsConnectedRef.current = true;
          return;
        }

        // Handle real-time candle updates - this is what we care about
        if (message.type === "candle" && message.data) {
          // WS is providing live data — stop HTTP polling
          wsConnectedRef.current = true;

          // Don't push live candles to chart before snapshot has populated it.
          // Between snapshot processing and resetData() (via rAF), a live candle
          // could flash on the empty/placeholder chart. Cache it instead.
          if (!chartPopulatedRef.current) {
            console.warn("[AdvancedOHLCChart] ⏳ WS candle QUEUED (chartPopulated=false)", {
              hasCallback: !!subscribedCallbackRef.current,
              activeUID: activeSubscriberUIDRef.current,
              tvResolution: tvResolutionRef.current,
              cacheSize: lastGoodCandlesRef.current.length,
            });
            const ohlcData = message.data;
            const oneSecCandle: BackendOHLCData = {
              unix_time: ohlcData.unix_time || ohlcData.time,
              o: ohlcData.o || ohlcData.open || 0,
              h: ohlcData.h || ohlcData.high || 0,
              l: ohlcData.l || ohlcData.low || 0,
              c: ohlcData.c || ohlcData.close || 0,
              v_usd: ohlcData.v_usd || ohlcData.v || ohlcData.volume || 0,
            };
            // Clamp launch-candle artifacts (l=0) before caching
            if (oneSecCandle.c > 0 && oneSecCandle.l <= 0) {
              oneSecCandle.o = oneSecCandle.c;
              oneSecCandle.l = Math.min(oneSecCandle.c, oneSecCandle.h > 0 ? oneSecCandle.h : oneSecCandle.c);
            }
            const cachedData = lastGoodCandlesRef.current;
            const existingIdx = cachedData.findIndex(c => c.unix_time === oneSecCandle.unix_time);
            if (existingIdx >= 0) {
              cachedData[existingIdx] = oneSecCandle;
            } else {
              cachedData.push(oneSecCandle);
              cachedData.sort((a, b) => a.unix_time - b.unix_time);
            }
            return; // resetData() will pick it up from the cache
          }

          // Throttle WS candle logs (~every 10th candle) to reduce console noise
          wsLogCountRef.current++;
          const shouldLogWs = wsLogCountRef.current % 10 === 0;

          const ohlcData = message.data;

          // Convert to our format
          const oneSecCandle: BackendOHLCData = {
            unix_time: ohlcData.unix_time || ohlcData.time,
            o: ohlcData.o || ohlcData.open || 0,
            h: ohlcData.h || ohlcData.high || 0,
            l: ohlcData.l || ohlcData.low || 0,
            c: ohlcData.c || ohlcData.close || 0,
            v_usd: ohlcData.v_usd || ohlcData.v || ohlcData.volume || 0,
          };
          // Clamp launch-candle artifacts (l=0) before chart update
          if (oneSecCandle.c > 0 && oneSecCandle.l <= 0) {
            oneSecCandle.o = oneSecCandle.c;
            oneSecCandle.l = Math.min(oneSecCandle.c, oneSecCandle.h > 0 ? oneSecCandle.h : oneSecCandle.c);
          }

          // Bridge gap between REST/snapshot end and first real-time WS candle (one-time)
          if (!wsGapBridgedRef.current) {
            wsGapBridgedRef.current = true;
            const cachedData = lastGoodCandlesRef.current;
            if (cachedData.length > 0) {
              const lastCached = cachedData[cachedData.length - 1];
              const gapSec = oneSecCandle.unix_time - lastCached.unix_time;
            }
          }

          // Solana: ALWAYS push raw 1s bars — let TradingView handle aggregation
          // to any resolution (5s, 15s, 1m, 15m, 1h, 1d, etc.) internally.
          // This ensures getBars (history) and realtime use the same resolution
          // model. Manual aggregation here caused a mismatch that made TradingView
          // silently drop live candles after resolution switches.
          const baseBar = {
            time: oneSecCandle.unix_time * 1000,
            open: oneSecCandle.o,
            high: oneSecCandle.h,
            low: oneSecCandle.l,
            close: oneSecCandle.c,
            volume: oneSecCandle.v_usd,
          };

          // Connectivity: force open to match previous candle's close
          const cachedData = lastGoodCandlesRef.current;
          if (cachedData.length > 0) {
            const prevCandle = cachedData[cachedData.length - 1];
            if (oneSecCandle.unix_time > prevCandle.unix_time) {
              const previousClose = prevCandle.c;
              if (baseBar.open !== previousClose) {
                baseBar.open = previousClose;
                if (baseBar.high < baseBar.open) baseBar.high = baseBar.open;
                if (baseBar.low > baseBar.open) baseBar.low = baseBar.open;
              }
            }
          }

          // Apply display mode transformation (USD/MC toggle)
          // CRITICAL: Use the chart's ACTUAL mode (from activeSubscriberUID), not displayModeRef.
          // displayModeRef changes instantly on click, but the chart only updates after TV's lifecycle.
          // Using the wrong mode sends MC-scale values (×1B) to a USD chart → candles invisible.
          const currentDisplayMode = getChartDisplayMode();
          const bar = applyFlatCandleSpread(transformBar(baseBar, currentDisplayMode, true));

          // Update cache (store raw 1s candle with connectivity-adjusted open)
          const cachedCandle = { ...oneSecCandle, o: baseBar.open };
          const existingIdx = cachedData.findIndex(
            (c) => c.unix_time === oneSecCandle.unix_time,
          );
          if (existingIdx >= 0) {
            cachedData[existingIdx] = cachedCandle;
          } else {
            cachedData.push(cachedCandle);
            cachedData.sort((a, b) => a.unix_time - b.unix_time);
          }

          // Update chart via callback
          if (subscribedCallbackRef.current && bar.time > 0) {
            try {
              subscribedCallbackRef.current(bar);
            } catch (e) {
              subscribedCallbackRef.current = null;
            }
          }

          // Fallback: if subscribeBars hasn't been called yet (callback is null),
          // queue a one-shot resetData() so candles cached above become visible
          if (!subscribedCallbackRef.current && widgetRef.current && !pendingCandleResetRef.current) {
            pendingCandleResetRef.current = setTimeout(() => {
              pendingCandleResetRef.current = null;
              if (!subscribedCallbackRef.current) {
                try { widgetRef.current?.chart?.()?.resetData?.(); } catch {}
              }
            }, 1000);
          }

          // Throttled updateChartMetrics (max once per second from WS)
          if (!metricsThrottleRef.current) {
            updateChartMetrics();
            metricsThrottleRef.current = setTimeout(() => {
              metricsThrottleRef.current = null;
              if (metricsUpdatePendingRef.current) {
                metricsUpdatePendingRef.current = false;
                updateChartMetrics();
              }
            }, 1000);
          } else {
            metricsUpdatePendingRef.current = true;
          }
        }
      } catch (e) {
        console.error(
          "[AdvancedOHLCChart] Error parsing Solana WebSocket message:",
          e,
        );
      }
    };

    // Calculate reconnect delay with exponential backoff
    const getReconnectDelay = () => {
      const delay = Math.min(
        BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
        MAX_RECONNECT_DELAY,
      );
      // Add jitter (±20%) to prevent thundering herd
      const jitter = delay * 0.2 * (Math.random() - 0.5);
      return Math.round(delay + jitter);
    };

    // Start heartbeat monitoring
    const startHeartbeat = () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }

      heartbeatInterval = setInterval(() => {
        if (closedByCleanup) {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          return;
        }

        const timeSinceLastMessage = Date.now() - lastMessageTime;

        // Send ping to keep connection alive
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(JSON.stringify({ type: "ping" }));
          } catch (e) {
          }
        }

        // Check if connection is dead (no messages for too long)
        if (timeSinceLastMessage > HEARTBEAT_TIMEOUT) {
          if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
          }
          scheduleReconnect();
        }
      }, HEARTBEAT_INTERVAL);
    };

    // Stop heartbeat monitoring
    const stopHeartbeat = () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    };

    // Schedule reconnection with exponential backoff
    const scheduleReconnect = () => {
      if (closedByCleanup || !mountedRef.current) return;

      const delay = getReconnectDelay();
      reconnectAttempts++;

      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
      }

      wsReconnectTimeoutRef.current = setTimeout(() => {
        if (!closedByCleanup && mountedRef.current) {
          connectSolana();
        }
      }, delay);
    };

    // Connect function with robust reconnection logic
    const connectSolana = () => {
      if (closedByCleanup) {
        return;
      }

      // ── Try adopting a prefetched WS from ohlcPrefetchManager ──
      const adopted = ohlcPrefetchManager.adoptConnection(tokenAddress);
      if (adopted?.ws?.readyState === WebSocket.OPEN) {
        // RACE FIX: If token changed since connectSolana was scheduled, discard adopted WS
        if (activeTokenRef.current !== tokenAddress) {
          try { adopted.ws.close(); } catch {}
          // Fall through to create fresh WS for the correct token
        } else {

        // Stop existing heartbeat & close any stale WS
        stopHeartbeat();
        if (wsRef.current) {
          try { wsRef.current.close(); } catch {}
        }

        wsRef.current = adopted.ws;
        reconnectAttempts = 0;
        lastMessageTime = Date.now();

        // Merge adopted cached candles into lastGoodCandlesRef
        if (adopted.cachedData.length > 0) {
          const existing = lastGoodCandlesRef.current;
          if (existing.length > 0) {
            // Merge: keep existing + add any newer candles from adopted data
            const lastExistingTime = existing[existing.length - 1].unix_time;
            const newer = adopted.cachedData.filter(
              (c) => c.unix_time > lastExistingTime,
            );
            if (newer.length > 0) {
              existing.push(...newer);
              existing.sort((a, b) => a.unix_time - b.unix_time);
            }
          } else {
            // No existing data — use adopted candles as primary
            lastGoodCandlesRef.current = adopted.cachedData;
            cachedIntervalRef.current = latestParamsRef.current.interval;
            cachedTimeframeRef.current = latestParamsRef.current.timeframe;
            setCandles(lastGoodCandlesRef.current);
            setIsLoading(false);
            hasInitializedRef.current = true;
            firstLoadRef.current = false;
            updateChartMetrics();

            // Force TradingView to pick up the data
            if (!chartPopulatedRef.current) {
              try {
                const chart =
                  widgetRef.current?.chart?.() ||
                  (widgetRef.current as any)?.activeChart?.();
                if (chart?.resetData) {
                  chartPopulatedRef.current = true;
                  chart.resetData();
                }
              } catch {}
            }
          }
        }

        // Re-attach handlers to the adopted WS
        adopted.ws.onmessage = handleSolanaMessage;
        adopted.ws.onerror = (error) => {
          console.error("[AdvancedOHLCChart] Solana WebSocket error:", error);
        };
        adopted.ws.onclose = (event) => {
          wsRef.current = null;
          stopHeartbeat();
          if (!closedByCleanup && mountedRef.current) {
            scheduleReconnect();
          }
        };

        // Mark WS as connected
        wsConnectedRef.current = true;
        wsGapBridgedRef.current = false;

        // Start heartbeat monitoring on adopted WS
        startHeartbeat();
        return;
        } // end else (activeTokenRef matches)
      }

      // ── Create new WebSocket ──

      // Stop existing heartbeat
      stopHeartbeat();

      // Close existing WebSocket if any
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {
          // Ignore close errors
        }
        wsRef.current = null;
      }

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          // Reset reconnect attempts on successful connection
          reconnectAttempts = 0;
          lastMessageTime = Date.now();
          // Start heartbeat monitoring
          startHeartbeat();
        };

        ws.onmessage = handleSolanaMessage;

        ws.onerror = (error) => {
          console.error("[AdvancedOHLCChart] Solana WebSocket error:", error);
          // Don't reconnect here - let onclose handle it
        };

        ws.onclose = (event) => {
          wsRef.current = null;
          stopHeartbeat();

          // Reconnect with exponential backoff if not closed intentionally
          if (!closedByCleanup && mountedRef.current) {
            scheduleReconnect();
          }
        };
      } catch (e) {
        console.error(
          "[AdvancedOHLCChart] Failed to create Solana WebSocket:",
          e,
        );
        scheduleReconnect();
      }
    };

    // Handle visibility change - reconnect when tab becomes visible
    const handleVisibilityChange = () => {
      if (closedByCleanup) return;

      if (document.visibilityState === "visible") {
        // Check if WebSocket is healthy
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reconnectAttempts = 0; // Reset attempts for visibility-triggered reconnect
          connectSolana();
        } else {
          // Send ping to verify connection is still alive
          try {
            wsRef.current.send(JSON.stringify({ type: "ping" }));
          } catch (e) {
            connectSolana();
          }
        }
      }
    };

    // Handle network online/offline - reconnect when network comes back
    const handleOnline = () => {
      if (closedByCleanup) return;

      reconnectAttempts = 0; // Reset attempts for network-triggered reconnect
      connectSolana();
    };

    const handleOffline = () => {
      // Don't try to reconnect while offline - handleOnline will do it
    };

    // Add event listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial connection
    connectSolana();

    // Cleanup
    return () => {
      closedByCleanup = true;

      // Remove event listeners
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);

      // Stop heartbeat
      stopHeartbeat();

      // Clear reconnect timeout
      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
        wsReconnectTimeoutRef.current = null;
      }

      if (wsRef.current) {
        // Hand off WebSocket to prefetch manager instead of closing it
        // This keeps the WS alive for 30s so returning to the same token is instant
        if (wsRef.current.readyState === WebSocket.OPEN) {
          ohlcPrefetchManager.handoffConnection(
            tokenAddress,
            wsRef.current,
            lastGoodCandlesRef.current,
          );
          wsRef.current = null;
        } else {
          try {
            wsRef.current.close();
          } catch (e) {
            // Ignore close errors
          }
          wsRef.current = null;
        }
      }
    };
  }, [network, mint, pairAddress]); // Re-connect when token changes (NOT interval — WS always streams 1s, aggregation is client-side)

  // Convert TradingView resolution string to milliseconds
  // Used by gap-fill logic to calculate expected candle spacing
  function parseResolutionToMs(res: string): number {
    if (res.endsWith('S')) {
      return parseInt(res) * 1000; // "1S" → 1000, "5S" → 5000
    }
    if (res.endsWith('D')) {
      return (parseInt(res) || 1) * 86400000; // "1D" → 86400000
    }
    if (res.endsWith('W')) {
      return (parseInt(res) || 1) * 604800000; // "1W" → 604800000
    }
    // Otherwise it's minutes: "1" → 60000, "5" → 300000, "60" → 3600000
    return parseInt(res) * 60000;
  }

  // Gap-fill sparse candles with carry-forward flat candles for visual continuity.
  // Standard financial charting behavior: no trade = price unchanged from last close.
  function gapFillBars(
    bars: { time: number; open: number; high: number; low: number; close: number; volume: number }[],
    res: string,
  ) {
    const resolutionMs = parseResolutionToMs(res);
    if (resolutionMs <= 0 || bars.length <= 1) return;

    const MAX_FILLS_PER_GAP = 300; // Cap at 5 minutes of 1s candles to prevent memory bloat
    const filledBars: typeof bars = [bars[0]];

    for (let i = 1; i < bars.length; i++) {
      const prev = filledBars[filledBars.length - 1];
      const curr = bars[i];
      const gapMs = curr.time - prev.time;
      const missedCandles = Math.floor(gapMs / resolutionMs) - 1;

      if (missedCandles > 0 && missedCandles <= MAX_FILLS_PER_GAP) {
        // Insert flat carry-forward candles
        for (let j = 1; j <= missedCandles; j++) {
          filledBars.push({
            time: prev.time + j * resolutionMs,
            open: prev.close,
            high: prev.close,
            low: prev.close,
            close: prev.close,
            volume: 0,
          });
        }
      } else if (missedCandles > MAX_FILLS_PER_GAP) {
        // For huge gaps, insert just one bridge candle to show price level
        filledBars.push({
          time: curr.time - resolutionMs,
          open: prev.close,
          high: prev.close,
          low: prev.close,
          close: prev.close,
          volume: 0,
        });
      }

      filledBars.push(curr);
    }

    // Replace bars in-place with filled version
    bars.length = 0;
    bars.push(...filledBars);
  }

  // Create custom datafeed that uses our fetched candles
  const createDatafeed = useCallback(() => {
    const {
      mint: dfMint,
      pairAddress: dfPairAddress,
      interval: dfInterval,
      network: dfNetwork,
    } = latestParamsRef.current;

    // For Solana: require mint (pairAddress won't have OHLC data)
    // For Monad: accept either
    if (dfNetwork !== "monad") {
      if (!dfMint) {
        return null;
      }
    } else if (!dfMint && !dfPairAddress) {
      return null;
    }

    const resolution = INTERVAL_TO_RESOLUTION[dfInterval];

    // Create a custom datafeed that implements TradingView's datafeed interface
    const computeTradeDisplayValues = (trade: any) => {
      const parsedPrice = parseFloat(trade.price);
      const fallbackPrice = parseFloat(
        String(
          trade.price_usd ||
            trade.priceUsd ||
            trade.data?.priceUsd ||
            trade.originalEvent?.data?.priceUsd ||
            trade.data?.priceUsdTotal ||
            trade.originalEvent?.data?.priceUsdTotal ||
            0,
        ),
      );
      let price = Number.isFinite(parsedPrice) ? parsedPrice : fallbackPrice;

      const amountRaw =
        trade.token_amount ||
        trade.amount ||
        trade.data?.amountNonLiquidityToken ||
        trade.data?.amount0 ||
        trade.data?.amount1 ||
        trade.originalEvent?.data?.amountNonLiquidityToken ||
        trade.originalEvent?.data?.amount0 ||
        trade.originalEvent?.data?.amount1 ||
        "0";

      const parsedAmount = parseFloat(String(amountRaw));
      const resolvedDecimals = latestTokenDecimalsRef.current;
      const formattedAmount = Number.isFinite(parsedAmount)
        ? formatTokenAmount(parsedAmount, resolvedDecimals)
        : String(amountRaw ?? "N/A");

      const totalUsdRaw =
        trade.totalUSD ||
        trade.total_usd ||
        trade.data?.priceUsdTotal ||
        trade.priceUsdTotal ||
        trade.originalEvent?.data?.priceUsdTotal ||
        (Number.isFinite(price) && Number.isFinite(parsedAmount)
          ? price * parsedAmount
          : null);

      const parsedTotalUsd = parseFloat(String(totalUsdRaw));

      if (
        (!Number.isFinite(price) || price === 0) &&
        Number.isFinite(parsedTotalUsd) &&
        Number.isFinite(parsedAmount) &&
        parsedAmount !== 0
      ) {
        price = parsedTotalUsd / parsedAmount;
      }

      const formattedPrice = formatPriceUsd(price);
      const formattedTotalUsd = formatUsdCompact(parsedTotalUsd);

      const displaySymbol = resolveTradeSymbol(
        trade.symbol,
        latestTokenSymbolRef.current,
        latestTokenNameRef.current,
        mint,
      );

      const walletAddress = truncateAddress(trade.maker);

      return {
        price,
        parsedAmount,
        parsedTotalUsd,
        formattedAmount,
        formattedPrice,
        formattedTotalUsd,
        displaySymbol,
        walletAddress,
      };
    };

    const customDatafeed = {
      onReady: (callback: any) => {
        if (CHART_DEBUG) console.log("[AdvancedOHLCChart] ========== onReady CALLED ==========");
        // For Monad, ensure seconds are prominently listed to show in dropdown
        // Use latestParamsRef to get the current network value (not closure value)
        const currentNetwork = latestParamsRef.current.network;
        const isMonad = currentNetwork === "monad";
        const config = {
          // Both Solana and Monad now support 1s candles
          // CRITICAL: Seconds must be in supported_resolutions AND supports_seconds must be true
          // TradingView groups by type (SECONDS, MINUTES, HOURS, DAYS) in the dropdown
          supported_resolutions: [
            "1S",
            "5S",
            "15S",
            "30S",
            "1",
            "5",
            "15",
            "30",
            "60",
            "240",
            "1D",
            "1W",
          ],
          supports_group_request: false,
          supports_marks: true, // ✅ Enable marks support
          supports_search: false,
          supports_timescale_marks: true, // ✅ Enable timescale marks support
          supports_time: true,
          // CRITICAL: supports_seconds MUST be true for SECONDS section to appear in dropdown
          supports_seconds: true, // Both Solana and Monad support 1s candles
        };
        setTimeout(() => {
          if (typeof callback === "function") {
            callback(config);
          } else {
            console.error(
              "[AdvancedOHLCChart] ❌ onReady callback is not a function!",
              typeof callback,
            );
          }
        }, 0);
      },

      searchSymbols: () => {
        // Not implemented
      },

      resolveSymbol: (symbolName: string, onSymbolResolvedCallback: any) => {
        // Strip mode suffix from symbol name (e.g., "TOKEN|MC" -> "TOKEN")
        const symbolParts = symbolName.split("|");
        const baseSymbolName = symbolParts[0];

        // Calculate appropriate pricescale based on typical price range
        // For crypto tokens, prices can vary widely, so we'll use a more flexible approach
        // pricescale determines the precision: 100 = 2 decimals, 1000 = 3 decimals, etc.
        const MIN_PRICE = 0.0000001;

        // Find a real candle with actual price data (not placeholder with all zeros)
        // Use the LATEST candle instead of first - more likely to have current price
        let samplePrice = 1; // Default fallback

        if (lastGoodCandlesRef.current.length > 0) {
          // Cache is always sorted by unix_time — iterate backwards directly (no copy/sort needed)
          const cachedCandles = lastGoodCandlesRef.current;

          // Try to find a candle with real price data (not all zeros)
          // Start from the latest candle and work backwards
          for (let i = cachedCandles.length - 1; i >= 0; i--) {
            const candle = cachedCandles[i];
            // Check if this is a real candle (not a placeholder with all zeros)
            const hasRealPrice =
              candle.c > 0 || candle.o > 0 || candle.h > 0 || candle.l > 0;
            if (hasRealPrice && candle.c > 0) {
              samplePrice = candle.c;
              break;
            }
          }

          // If we didn't find a real candle, try the first candle as fallback
          if (samplePrice === 1 && cachedCandles.length > 0) {
            const firstCandle = cachedCandles[0];
            if (firstCandle.c > 0) {
              samplePrice = firstCandle.c;
            }
          }
        }

        // If sample price is still 0 or invalid, use MIN_PRICE
        if (samplePrice === 0 || !isFinite(samplePrice) || samplePrice < 0) {
          samplePrice = MIN_PRICE;
        }

        // Adjust sample price based on display mode (MC = USD * 1 billion)
        // Extract mode from symbol name (e.g., "TOKEN|MC" → "MC") rather than
        // displayModeRef — during rapid toggles, the ref may have been updated by
        // a later toggle, causing pricescale/data mismatch.
        const modeFromSymbol = symbolParts[1];
        const mode: "USD" | "MC" = (modeFromSymbol === "USD" || modeFromSymbol === "MC") ? modeFromSymbol : displayModeRef.current;
        let effectiveSample = samplePrice;
        if (mode === "MC") {
          effectiveSample = samplePrice * 1_000_000_000;
        }

        // Calculate pricescale based on effective sample (accounts for MC mode)
        // For crypto tokens with very small prices, we need high precision
        // If samplePrice is still the default (1), we haven't loaded real data yet
        // In that case, default to 8 decimals to handle tiny prices safely
        let pricescale = 100000000; // Default to 8 decimals for crypto safety
        if (samplePrice !== 1) {
          // We have real price data, calculate appropriate pricescale
          if (effectiveSample < 0.00000001) {
            pricescale = 10000000000; // 10 decimals for extremely small prices
          } else if (effectiveSample < 0.000001) {
            pricescale = 100000000; // 8 decimals
          } else if (effectiveSample < 0.0001) {
            pricescale = 10000000; // 7 decimals
          } else if (effectiveSample < 0.01) {
            pricescale = 1000000; // 6 decimals for very small prices
          } else if (effectiveSample < 1) {
            pricescale = 100000; // 5 decimals
          } else if (effectiveSample < 100) {
            pricescale = 10000; // 4 decimals
          } else if (effectiveSample < 1000) {
            pricescale = 100; // 2 decimals
          } else {
            pricescale = 1; // 0 decimals for large numbers
          }
        }


        // Use latestParamsRef to get the current network value (not closure value)
        const currentNetwork = latestParamsRef.current.network;
        const isMonad = currentNetwork === "monad";
        // Update description based on display mode (USD vs MC)
        // Reuse the 'mode' variable already declared above
        const modeLabel = mode === "MC" ? "Market Cap" : "Price";

        // Use token symbol/name for display, fallback to truncated address
        const displayName =
          latestTokenSymbolRef.current ||
          latestTokenNameRef.current ||
          (dfMint ? `${dfMint.slice(0, 4)}…${dfMint.slice(-4)}` : null) ||
          (dfPairAddress
            ? `${dfPairAddress.slice(0, 4)}…${dfPairAddress.slice(-4)}`
            : null) ||
          "Token";

        const symbolInfo = {
          name: displayName,
          description: `${displayName} ${modeLabel} Chart`,
          type: "crypto",
          session: "24x7",
          timezone: "Etc/UTC",
          ticker: symbolName,
          exchange: isMonad ? "Monad" : "Solana",
          minmov: 1,
          pricescale: pricescale,
          has_intraday: true,
          has_weekly_and_monthly: false,
          // CRITICAL: has_seconds MUST be true for SECONDS section to appear in dropdown
          // This tells TradingView that this symbol supports second-based resolutions
          has_seconds: true, // Both Solana and Monad support 1s candles
          // Put seconds FIRST in the array - TradingView shows them in order
          // TradingView groups resolutions by type (SECONDS, MINUTES, HOURS, DAYS) in dropdown
          // The SECONDS group will appear if has_seconds=true AND seconds are in supported_resolutions
          supported_resolutions: [
            "1S",
            "5S",
            "15S",
            "30S",
            "1",
            "5",
            "15",
            "30",
            "60",
            "240",
            "1D",
            "1W",
          ],
          volume_precision: 2,
          data_status: "streaming",
        };


        setTimeout(() => {
          if (typeof onSymbolResolvedCallback === "function") {
            onSymbolResolvedCallback(symbolInfo);
          } else {
            console.error(
              "[AdvancedOHLCChart] ❌ onSymbolResolvedCallback is not a function!",
              typeof onSymbolResolvedCallback,
            );
          }
        }, 0);
      },

      getBars: async (
        symbolInfo: any,
        resolution: string,
        periodParams: any,
        onHistoryCallback: any,
        onErrorCallback: any,
      ) => {
        const gbSeq = ++lifecycleSeqRef.current;
        // Store the callback for fast refresh when displayMode changes
        historyCallbackRef.current = onHistoryCallback;

        // Symbol now includes mode suffix (e.g., "TOKEN|USD" or "TOKEN|MC") to force TradingView refresh
        // Extract mode from symbolInfo.ticker (set by resolveSymbol) rather than displayModeRef.
        // During rapid MC/USD toggles, displayModeRef may have been updated by a later toggle
        // before this getBars finishes, causing bars to be transformed with the wrong mode
        // (e.g., MC bars returned for a USD symbol, producing a chart with mismatched Y-axis).
        const symbolTicker = symbolInfo?.ticker || "";
        const tickerParts = symbolTicker.split("|");
        const effectiveDisplayMode: "USD" | "MC" = (tickerParts[1] === "USD" || tickerParts[1] === "MC") ? tickerParts[1] : displayModeRef.current;
        const symbolName = symbolInfo?.name || symbolTicker || "TOKEN";
        // Strip mode suffix for display purposes
        const baseSymbolName = symbolName.split("|")[0];

        // Convert TradingView resolution to our interval format
        const requestedInterval =
          RESOLUTION_TO_INTERVAL[resolution] || dfInterval;

        // Track TradingView's actual resolution and reset stale state on change
        const prevTvResolution = tvResolutionRef.current;
        tvResolutionRef.current = resolution;
        if (prevTvResolution !== resolution) {
          hasRightAlignedRef.current = false;
          currentAggregatedCandleRef.current = null;
          oneSecondCandlesRef.current = [];
          wsGapBridgedRef.current = false;

          // Phase 5: Per-resolution cache — save current candles to old resolution's cache slot,
          // then restore from new resolution's cache if available (avoids re-fetching on switch-back)
          if (lastGoodCandlesRef.current.length > 0) {
            resolutionCacheRef.current.set(prevTvResolution, [...lastGoodCandlesRef.current]);
          }
          const cached = resolutionCacheRef.current.get(resolution);
          if (cached && cached.length > 0) {
            lastGoodCandlesRef.current = cached;
            cachedIntervalRef.current = RESOLUTION_TO_INTERVAL[resolution] || dfInterval;
            const mappedTf = RESOLUTION_TO_TIMEFRAME[resolution];
            cachedTimeframeRef.current = (mappedTf && mappedTf !== "auto")
              ? mappedTf as BackendTimeRange
              : latestParamsRef.current.timeframe;
          }
        }

        // Derive timeframe from TV resolution when user clicks a time frame button
        // (e.g., resolution "30" → RESOLUTION_TO_TIMEFRAME["30"] = "7d")
        // For default "1S" view, fall back to the prop timeframe
        const mappedTimeframe = RESOLUTION_TO_TIMEFRAME[resolution];
        const requestedTimeframe: BackendTimeRange =
          (mappedTimeframe && mappedTimeframe !== "auto")
            ? mappedTimeframe as BackendTimeRange
            : latestParamsRef.current.timeframe;

        fetchCountRef.current += 1;
        const currentFetchCount = fetchCountRef.current;

        // For Solana: WS snapshot is the sole data source.
        // Await it, using WS readyState to detect health instead of a blind timeout.
        {
          const currentNetwork = latestParamsRef.current.network;
          if (currentNetwork !== "monad" && !lastGoodCandlesRef.current.length) {

            // Wait for WS snapshot via Promise signal (instant wake, no polling jitter).
            // Resolves immediately when snapshot arrives; 1s timeout — backend returns in <300ms.
            if (!lastGoodCandlesRef.current.length) {
              await new Promise<void>((resolve) => {
                // Bail out immediately if data arrived between the outer check and here
                if (lastGoodCandlesRef.current.length) { resolve(); return; }
                snapshotResolverRef.current = resolve;
                setTimeout(() => {
                  snapshotResolverRef.current = null;
                  resolve();
                }, 400);
              });
            }

            // If still no data, check WS health (dedicated OR persistent connection)
            if (!lastGoodCandlesRef.current.length) {
              const dedicatedWsOpen = wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
              const wsOpen = dedicatedWsOpen;
              if (wsOpen) {
                // WS is healthy — server had 1s to send snapshot but didn't → token has no data
              } else {
                // WS not connected — connection failed or still connecting
              }

              const now = Math.floor(Date.now() / 1000);
              const placeholderCandle: BackendOHLCData = {
                unix_time: now, o: 0, h: 0, l: 0, c: 0, v_usd: 0,
              };
              lastGoodCandlesRef.current = [placeholderCandle];
              cachedIntervalRef.current = requestedInterval;
              cachedTimeframeRef.current = requestedTimeframe;
            }

            // Mark chart as populated so live candle updates flow through (line ~3110 guard).
            // The snapshot handler's rAF may fail if chart() isn't ready yet — this is the reliable path.
            chartPopulatedRef.current = true;

            // Fall through to normal cached-data path
          }
        }

        // For Solana: WS snapshot is the sole data source — seed cache refs if we have
        // WS data but cache refs haven't been set yet (first getBars after WS snapshot).
        // Without this, cachedTimeframeRef stays null → needsFetch is always true →
        // every mode toggle triggers an unnecessary HTTP re-fetch that may fail/timeout,
        // creating race conditions that break the chart on rapid MC/USD toggle.
        {
          const net = latestParamsRef.current.network;
          if (net !== "monad" && lastGoodCandlesRef.current.length > 0 && !cachedTimeframeRef.current) {
            cachedIntervalRef.current = requestedInterval;
            cachedTimeframeRef.current = requestedTimeframe;
          }
        }

        // CHECK CACHE FIRST - Only fetch if cache is empty OR interval/timeframe changed
        // IMPORTANT: Compare BEFORE updating the refs, otherwise change detection won't work
        const hasCachedData = lastGoodCandlesRef.current.length > 0;
        const currentNetwork = latestParamsRef.current.network;
        // For Solana: WS always streams 1s candles — TradingView aggregates them to any resolution.
        // Never re-fetch on resolution change; only re-fetch when cache is empty or timeframe changes.
        const isSolana = currentNetwork !== "monad";
        // Allow Solana interval changes when TV resolution is not the default 1S
        // (i.e., user clicked a time frame button like 7D → resolution "30" → interval "30m")
        const intervalChanged = isSolana
          ? (resolution !== "1S" && cachedIntervalRef.current !== requestedInterval)
          : cachedIntervalRef.current !== requestedInterval;
        const timeframeChanged =
          cachedTimeframeRef.current !== requestedTimeframe;
        const needsFetch =
          !hasCachedData || intervalChanged || timeframeChanged;

        if (CHART_DEBUG) {
        }
        const now = Date.now();

        // Safely format periodParams dates with validation
        let periodParamsFormatted = null;
        if (
          periodParams &&
          typeof periodParams.from === "number" &&
          typeof periodParams.to === "number" &&
          isFinite(periodParams.from) &&
          isFinite(periodParams.to) &&
          periodParams.from > 0 &&
          periodParams.to > 0
        ) {
          try {
            periodParamsFormatted = {
              from: periodParams.from,
              to: periodParams.to,
              fromDate: new Date(periodParams.from * 1000).toISOString(),
              toDate: new Date(periodParams.to * 1000).toISOString(),
            };
          } catch (e) {
            periodParamsFormatted = {
              from: periodParams.from,
              to: periodParams.to,
              fromDate: "invalid",
              toDate: "invalid",
            };
          }
        }


        // If we have cached data and don't need to fetch, return immediately
        if (!needsFetch) {
          const items = lastGoodCandlesRef.current;
          cachedTimeframeRef.current = requestedTimeframe;

          const MIN_PRICE = 0.0000001;
          const currentNetwork = latestParamsRef.current.network;
          const isMonad = currentNetwork === "monad";
          const currentDisplayMode = effectiveDisplayMode;
          const allBars = items
            .map((item) => {
              const hasZeroValues =
                item.o === 0 && item.h === 0 && item.l === 0 && item.c === 0;
              const baseBar = {
                time: item.unix_time * 1000,
                open: hasZeroValues ? MIN_PRICE : item.o,
                high: hasZeroValues ? MIN_PRICE : item.h,
                low: hasZeroValues ? MIN_PRICE : item.l,
                close: hasZeroValues ? MIN_PRICE : item.c,
                volume: item.v_usd || 0,
              };
              return applyFlatCandleSpread(transformBar(baseBar, currentDisplayMode, true));
            })
            .filter((bar) => bar.time > 0 && isFinite(bar.time));
          allBars.sort((a, b) => a.time - b.time);

          // Only collapse time gaps for Monad — Solana trades 24/7, no session gaps to collapse.
          // Gap collapse + resolution switching causes timestamp mismatches between historical and live bars.
          {
            const isSolana = latestParamsRef.current.network !== "monad";
            if (!isSolana) {
              const resMs = parseResolutionToMs(resolution);
              const { shifts, totalShift } = collapseTimeGaps(allBars, resMs);
              gapShiftsRef.current = shifts;
              totalShiftRef.current = totalShift;
              gapFillBars(allBars, resolution);
            } else {
              gapShiftsRef.current = [];
              totalShiftRef.current = 0;
            }
          }

          // Ensure candles connect properly by making close of one = open of next
          if (allBars.length > 1) {
            for (let i = 0; i < allBars.length - 1; i++) {
              const currentBar = allBars[i];
              const nextBar = allBars[i + 1];

              if (nextBar.open !== currentBar.close) {
                const previousOpen = nextBar.open;
                nextBar.open = currentBar.close;

                if (
                  nextBar.high === previousOpen &&
                  nextBar.low === previousOpen &&
                  nextBar.close === previousOpen
                ) {
                  nextBar.high = currentBar.close;
                  nextBar.low = currentBar.close;
                  nextBar.close = currentBar.close;
                } else {
                  if (nextBar.high < nextBar.open) nextBar.high = nextBar.open;
                  if (nextBar.low > nextBar.open) nextBar.low = nextBar.open;
                }
              }
            }
          }

          // Re-apply flat candle spread after connection loop (it can make candles flat)
          for (let i = 0; i < allBars.length; i++) {
            allBars[i] = applyFlatCandleSpread(allBars[i]);
          }

          if (CHART_DEBUG) {
            if (allBars.length > 0) {
            }
          }

          // TradingView pagination for scroll-left:
          // On non-first requests, TradingView sets `to` to the oldest bar time it has.
          // If that's at or before our oldest cached candle, we need to lazy-load older data.
          // We compare using the oldest COLLAPSED bar time (allBars[0].time) since
          // TradingView's periodParams are in collapsed time space after collapseTimeGaps.
          const fromMs = (periodParams.from ?? 0) * 1000;
          const toMs = (periodParams.to ?? 0) * 1000;

          if (
            !periodParams.firstDataRequest &&
            allBars.length > 0 &&
            toMs &&
            toMs <= allBars[0].time &&
            latestParamsRef.current.network !== "monad"
          ) {
            const oldestCachedTime = lastGoodCandlesRef.current[0]?.unix_time ?? 0;
            const tokenAddress = latestParamsRef.current.mint;

            if (CHART_DEBUG) console.log("[AdvancedOHLCChart] Lazy-loading older candles...");

            try {
              const lazyUrl = new URL(`${BACKEND_URL}/v1/ohlcv/${tokenAddress}`);
              // Use display resolution for history fetch; sub-minute resolutions fall back to 1s
              // because the backend only has ohlcv_1s (no 5s/15s/30s aggregates)
              const displayInterval = RESOLUTION_TO_INTERVAL[resolution] || "1s";
              const lazyTimeframe = ["5s", "15s", "30s"].includes(displayInterval) ? "1s" : displayInterval;
              lazyUrl.searchParams.set("timeframe", lazyTimeframe);
              lazyUrl.searchParams.set("to", String(oldestCachedTime));
              lazyUrl.searchParams.set("limit", "1000");
              // Abort controller shared via ref so unsubscribeBars can cancel immediately
              // on resolution switch — prevents this fetch from blocking TradingView's pipeline
              const lazyAbort = new AbortController();
              lazyLoadAbortRef.current = lazyAbort;
              const lazyTimeout = setTimeout(() => lazyAbort.abort(), 3000);
              const resp = await fetch(lazyUrl.toString(), {
                method: "GET",
                headers: {
                  accept: "application/json",
                  "X-API-Key": process.env.NEXT_PUBLIC_BACKEND_API_KEY || "test-key",
                },
                signal: lazyAbort.signal,
              });
              clearTimeout(lazyTimeout);
              lazyLoadAbortRef.current = null;
              if (resp.ok) {
                const body = await resp.json();
                if (body?.success && Array.isArray(body.candles) && body.candles.length > 0) {
                  const olderItems: BackendOHLCData[] = body.candles.map((c: any) => ({
                    unix_time: c.time || c.unix_time,
                    o: c.open ?? c.o,
                    h: c.high ?? c.h,
                    l: c.low ?? c.l,
                    c: c.close ?? c.c,
                    v_usd: c.volume ?? c.volume_usd ?? c.v_usd ?? 0,
                  }));
                  const deduped = olderItems.filter(c => c.unix_time < oldestCachedTime);
                  if (deduped.length > 0) {
                    lastGoodCandlesRef.current = [...deduped, ...lastGoodCandlesRef.current];
                    clampLaunchCandles(lastGoodCandlesRef.current);

                    // Return ONLY the new bars with real timestamps.
                    // No gap-collapse — TradingView merges them to the left.
                    // Re-collapsing the full dataset would shift existing bar times,
                    // causing visual disconnects with what TV already rendered.
                    const currentDisplayMode = effectiveDisplayMode;
                    const MIN_PRICE = 0.0000001;
                    const newBars = deduped
                      .map((item) => {
                        const hasZeroValues = item.o === 0 && item.h === 0 && item.l === 0 && item.c === 0;
                        const baseBar = {
                          time: item.unix_time * 1000,
                          open: hasZeroValues ? MIN_PRICE : item.o,
                          high: hasZeroValues ? MIN_PRICE : item.h,
                          low: hasZeroValues ? MIN_PRICE : item.l,
                          close: hasZeroValues ? MIN_PRICE : item.c,
                          volume: item.v_usd || 0,
                        };
                        return applyFlatCandleSpread(transformBar(baseBar, currentDisplayMode, true));
                      })
                      .filter((bar) => bar.time > 0 && isFinite(bar.time));
                    newBars.sort((a, b) => a.time - b.time);

                    if (typeof onHistoryCallback === "function") {
                      onHistoryCallback(newBars, { noData: false });
                    }
                    return;
                  }
                }
              }
            } catch (e) {
              lazyLoadAbortRef.current = null;
              const isAbort = (e as any)?.name === 'AbortError';
              if (CHART_DEBUG) console.log("[AdvancedOHLCChart] Lazy-load:", (e as any)?.name === 'AbortError' ? 'aborted' : String(e));
            }
            // No older data available
            if (CHART_DEBUG) console.log("[AdvancedOHLCChart] Lazy-load: no older data");
            if (typeof onHistoryCallback === "function") {
              onHistoryCallback([], { noData: true });
            }
            return;
          }

          if (allBars.length > 0 && typeof onHistoryCallback === "function") {
            const firstBar = allBars[0];
            const lastBar = allBars[allBars.length - 1];
            if (CHART_DEBUG) console.log("[AdvancedOHLCChart] getBars (cached):", resolution, allBars.length, "bars");
            onHistoryCallback(allBars, { noData: false });

            // Mark chart as populated so live WS candles flow through subscribedCallbackRef
            // Without this, resolution changes reset chartPopulatedRef to false (line ~1143)
            // but the cached-data path never restores it, causing all live candles to be
            // silently cached at line ~3203 instead of being forwarded to TradingView.
            chartPopulatedRef.current = true;

            // Right-align chart after first data load from cache
            if (periodParams.firstDataRequest && allBars.length > 0) {
              requestAnimationFrame(() => {
                rightAlignChart(allBars.length);
              });
            }

            // IMPORTANT: Ensure price lines (including max MC) are synced after returning cached data
            requestAnimationFrame(() => {
              if (CHART_DEBUG) console.log(
                "[AdvancedOHLCChart] 📊 Cached data returned - ensuring price lines are synced",
              );
              updateChartMetrics();
            });
          } else if (typeof onHistoryCallback === "function") {
            onHistoryCallback([], { noData: true });
          }
          return;
        }

        // If there's already a request in-flight for this interval, wait for it
        const inFlightKey = `${requestedInterval}|${requestedTimeframe}`;
        if (
          getBarsInFlightRef.current &&
          getBarsInFlightKeyRef.current === inFlightKey
        ) {
          try {
            await getBarsInFlightRef.current;
            // After waiting, use cached data
            const items = lastGoodCandlesRef.current;
            if (items.length > 0) {
              const MIN_PRICE = 0.0000001;
              const currentNetwork = latestParamsRef.current.network;
              const isMonad = currentNetwork === "monad";
              const currentDisplayMode = effectiveDisplayMode;
              const allBars = items
                .map((item) => {
                  const hasZeroValues =
                    item.o === 0 &&
                    item.h === 0 &&
                    item.l === 0 &&
                    item.c === 0;
                  const baseBar = {
                    time: item.unix_time * 1000,
                    open: hasZeroValues ? MIN_PRICE : item.o,
                    high: hasZeroValues ? MIN_PRICE : item.h,
                    low: hasZeroValues ? MIN_PRICE : item.l,
                    close: hasZeroValues ? MIN_PRICE : item.c,
                    volume: item.v_usd || 0,
                  };
                  return applyFlatCandleSpread(transformBar(baseBar, currentDisplayMode, true));
                })
                .filter((bar) => bar.time > 0 && isFinite(bar.time));
              allBars.sort((a, b) => a.time - b.time);

              // Only collapse time gaps for Monad — Solana trades 24/7, no session gaps to collapse.
              // Gap collapse + resolution switching causes timestamp mismatches between historical and live bars.
              {
                const isSolana = latestParamsRef.current.network !== "monad";
                if (!isSolana) {
                  const resMs = parseResolutionToMs(resolution);
                  const { shifts, totalShift } = collapseTimeGaps(allBars, resMs);
                  gapShiftsRef.current = shifts;
                  totalShiftRef.current = totalShift;
                  gapFillBars(allBars, resolution);
                } else {
                  gapShiftsRef.current = [];
                  totalShiftRef.current = 0;
                }
              }

              if (typeof onHistoryCallback === "function") {
                onHistoryCallback(allBars, { noData: false });
                chartPopulatedRef.current = true;
              }
              return;
            }
          } catch {
            // In-flight request failed, continue to try our own request
          }
        }

        // Create a promise for this request so others can wait
        let resolveInFlight: () => void;
        let rejectInFlight: (e: any) => void;
        getBarsInFlightKeyRef.current = inFlightKey;
        getBarsInFlightRef.current = new Promise((resolve, reject) => {
          resolveInFlight = resolve;
          rejectInFlight = reject;
        });

        try {
          let items: BackendOHLCData[];


          const url = buildUrl(requestedInterval, requestedTimeframe);
          const response = await fetch(url, {
            method: "GET",
            headers: {
              accept: "application/json",
              "X-API-Key":
                process.env.NEXT_PUBLIC_BACKEND_API_KEY || "test-key",
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const body = await response.json();
          if (!body?.success) {
            throw new Error(
              body?.message ||
                body?.error ||
                "API returned unsuccessful response",
            );
          }

          // Handle different response formats: Solana uses candles[], Monad uses data.items[]
          if (body.candles && Array.isArray(body.candles)) {
            // Solana /v1/ohlcv/{tokenAddress} format
            items = body.candles.map((c: any) => ({
              unix_time: c.time || c.unix_time,
              o: c.open ?? c.o,
              h: c.high ?? c.h,
              l: c.low ?? c.l,
              c: c.close ?? c.c,
              v_usd: c.volume ?? c.volume_usd ?? c.v_usd ?? 0,
            }));
          } else {
            // Monad /v1/trade/ohlc-data format
            items = body?.data?.items ?? [];
          }

          // Update cache
          if (items.length > 0) {
            lastGoodCandlesRef.current = items;
            clampLaunchCandles(lastGoodCandlesRef.current);
            cachedIntervalRef.current = requestedInterval;
            cachedTimeframeRef.current = requestedTimeframe;

            // Only trigger React re-render and metrics update if candle data actually changed
            const firstTime = items[0]?.unix_time;
            const lastTime = items[items.length - 1]?.unix_time;
            const lastClose = items[items.length - 1]?.c;
            const candleHash = `${items.length}_${firstTime}_${lastTime}_${lastClose}`;

            if (candleHash !== lastCandleHashRef.current) {
              lastCandleHashRef.current = candleHash;
              setCandles(lastGoodCandlesRef.current);
              updateChartMetrics();
              onDataUpdate?.(lastGoodCandlesRef.current);
            }
          }

          // Signal that request is complete
          resolveInFlight!();
          getBarsInFlightRef.current = null;
          getBarsInFlightKeyRef.current = null;
          getBarsInFlightKeyRef.current = null;

          // Get current network for Monad-specific logic
          const currentNetwork = latestParamsRef.current.network;
          const isMonad = currentNetwork === "monad";

          // Handle empty data case
          if (items.length === 0) {
            // Seed cache refs even when HTTP returns empty — prevents infinite re-fetch loop
            if (lastGoodCandlesRef.current.length > 0 && !cachedTimeframeRef.current) {
              cachedIntervalRef.current = requestedInterval;
              cachedTimeframeRef.current = requestedTimeframe;
            }

            // Fallback: aggregate 1s WS candles client-side when backend has no pre-aggregated data
            // (common for newer tokens whose TimescaleDB continuous aggregates haven't populated yet)
            if (isSolana && resolution !== "1S") {
              const baseCandles = resolutionCacheRef.current.get("1S");
              if (baseCandles && baseCandles.length > 0) {
                const aggregated = aggregateCandlesToInterval(baseCandles, requestedInterval);
                if (aggregated.length > 0) {
                  lastGoodCandlesRef.current = aggregated;
                  cachedIntervalRef.current = requestedInterval;
                  cachedTimeframeRef.current = requestedTimeframe;
                  resolutionCacheRef.current.set(resolution, [...aggregated]);

                  const MIN_PRICE = 0.0000001;
                  const currentDisplayMode = effectiveDisplayMode;
                  const aggBars = aggregated
                    .map((item) => {
                      const hasZeroValues = item.o === 0 && item.h === 0 && item.l === 0 && item.c === 0;
                      const baseBar = {
                        time: item.unix_time * 1000,
                        open: hasZeroValues ? MIN_PRICE : item.o,
                        high: hasZeroValues ? MIN_PRICE : item.h,
                        low: hasZeroValues ? MIN_PRICE : item.l,
                        close: hasZeroValues ? MIN_PRICE : item.c,
                        volume: item.v_usd || 0,
                      };
                      return applyFlatCandleSpread(transformBar(baseBar, currentDisplayMode, true));
                    })
                    .filter((bar) => bar.time > 0 && isFinite(bar.time));
                  aggBars.sort((a, b) => a.time - b.time);

                  if (typeof onHistoryCallback === "function") {
                    onHistoryCallback(aggBars, { noData: false });
                    chartPopulatedRef.current = true;
                  }
                  return;
                }
              }
            }

            // Check if we have cached data before returning noData
            const hasAnyCandles =
              lastGoodCandlesRef.current &&
              lastGoodCandlesRef.current.length > 0;
            if (hasAnyCandles) {
              const MIN_PRICE = 0.0000001;
              const currentDisplayMode = effectiveDisplayMode;
              const cachedBars = lastGoodCandlesRef.current
                .map((item) => {
                  const hasZeroValues =
                    item.o === 0 &&
                    item.h === 0 &&
                    item.l === 0 &&
                    item.c === 0;
                  const baseBar = {
                    time: item.unix_time * 1000,
                    open: hasZeroValues ? MIN_PRICE : item.o,
                    high: hasZeroValues ? MIN_PRICE : item.h,
                    low: hasZeroValues ? MIN_PRICE : item.l,
                    close: hasZeroValues ? MIN_PRICE : item.c,
                    volume: item.v_usd || 0,
                  };
                  return applyFlatCandleSpread(transformBar(baseBar, currentDisplayMode, true));
                })
                .filter((bar) => bar.time > 0 && isFinite(bar.time));
              cachedBars.sort((a, b) => a.time - b.time);

              if (typeof onHistoryCallback === "function") {
                onHistoryCallback(cachedBars, { noData: false });
              }
              return;
            }

            if (typeof onHistoryCallback === "function") {
              onHistoryCallback([], { noData: true });
            }
            return;
          }

          // Convert to TradingView format - IMPORTANT: time must be in MILLISECONDS!
          // Our backend returns unix_time in seconds, so we need to convert to milliseconds
          const MIN_PRICE = 0.0000001; // Minimum price for display (0 values are invisible in TradingView)
          const currentDisplayMode = effectiveDisplayMode;

          const allBars = items
            .map((item) => {
              // Validate data
              if (
                typeof item.unix_time !== "number" ||
                typeof item.o !== "number" ||
                typeof item.h !== "number" ||
                typeof item.l !== "number" ||
                typeof item.c !== "number"
              ) {
                console.warn("[AdvancedOHLCChart] Invalid bar data:", item);
                return null;
              }

              // TradingView expects time in milliseconds (Unix timestamp * 1000)
              const timeMs = item.unix_time * 1000;

              // Handle 0-value candles: if all OHLC values are 0, set a small minimum
              // This ensures TradingView renders them (otherwise they may be invisible)
              const hasZeroValues =
                item.o === 0 && item.h === 0 && item.l === 0 && item.c === 0;

              const baseBar = {
                time: timeMs,
                open: hasZeroValues ? MIN_PRICE : item.o,
                high: hasZeroValues ? MIN_PRICE : item.h,
                low: hasZeroValues ? MIN_PRICE : item.l,
                close: hasZeroValues ? MIN_PRICE : item.c,
                volume: item.v_usd || 0,
              };

              const bar = applyFlatCandleSpread(transformBar(baseBar, currentDisplayMode, true));


              return bar;
            })
            .filter(
              (
                bar,
              ): bar is {
                time: number;
                open: number;
                high: number;
                low: number;
                close: number;
                volume: number;
              } => {
                if (!bar) return false;
                // Basic validation - ensure time is valid
                return (
                  bar.time > 0 &&
                  isFinite(bar.time) &&
                  isFinite(bar.open) &&
                  isFinite(bar.high) &&
                  isFinite(bar.low) &&
                  isFinite(bar.close)
                );
              },
            );

          // Sort by time (ascending - oldest first)
          allBars.sort((a, b) => a.time - b.time);

          // Only collapse time gaps for Monad — Solana trades 24/7, no session gaps to collapse.
          // Gap collapse + resolution switching causes timestamp mismatches between historical and live bars.
          {
            const isSolana = latestParamsRef.current.network !== "monad";
            if (!isSolana) {
              const resMs = parseResolutionToMs(resolution);
              const { shifts, totalShift } = collapseTimeGaps(allBars, resMs);
              gapShiftsRef.current = shifts;
              totalShiftRef.current = totalShift;
              gapFillBars(allBars, resolution);
            } else {
              gapShiftsRef.current = [];
              totalShiftRef.current = 0;
            }
          }

          // Ensure candles connect properly by making close of one = open of next
          // This creates visual continuity even when candles are flat (o=h=l=c)
          if (allBars.length > 1) {
            for (let i = 0; i < allBars.length - 1; i++) {
              const currentBar = allBars[i];
              const nextBar = allBars[i + 1];

              // Ensure continuity: next candle's open should equal current candle's close
              // This creates a connected line even when candles are flat
              if (nextBar.open !== currentBar.close) {
                const previousOpen = nextBar.open;
                nextBar.open = currentBar.close;

                // If the next candle was flat (o=h=l=c), update all values to maintain the flat appearance
                // but ensure it connects to the previous candle
                if (
                  nextBar.high === previousOpen &&
                  nextBar.low === previousOpen &&
                  nextBar.close === previousOpen
                ) {
                  // It was a flat candle - keep it flat but at the new price
                  nextBar.high = currentBar.close;
                  nextBar.low = currentBar.close;
                  nextBar.close = currentBar.close;
                } else {
                  // It had variation - only adjust open, keep high/low/close as they were
                  // But ensure high/low still make sense
                  if (nextBar.high < nextBar.open) nextBar.high = nextBar.open;
                  if (nextBar.low > nextBar.open) nextBar.low = nextBar.open;
                }

              }
            }
          }

          // Re-apply flat candle spread after connection loop (it can make candles flat)
          for (let i = 0; i < allBars.length; i++) {
            allBars[i] = applyFlatCandleSpread(allBars[i]);
          }

          // CRITICAL FIX: For first request, ignore from/to and return all candles
          // This ensures TradingView always sees data on initial load
          const isFirst = !!periodParams.firstDataRequest;
          if (isFirst) {
            if (allBars.length === 0) {
              if (typeof onHistoryCallback === "function") {
                onHistoryCallback([], { noData: true });
              }
              return;
            }
            if (typeof onHistoryCallback === "function") {
              onHistoryCallback(allBars, { noData: false });
              chartPopulatedRef.current = true;
            }
            rightAlignChart(allBars.length);
            // Ensure price lines (including max MC) are synced after first data load
            setTimeout(() => {
              updateChartMetrics();
            }, 200);
            return;
          }

          // Filter bars to requested time range (for non-first requests or non-Monad)
          const fromMs = (periodParams.from ?? 0) * 1000;
          const toMs = (periodParams.to ?? 0) * 1000;
          let bars = allBars;


          if (fromMs && toMs && allBars.length > 0) {
            const oldestDataTime = allBars[0].time;
            const newestDataTime = allBars[allBars.length - 1].time;

            // CRITICAL FIX: If ALL our data is AFTER the requested range (future data),
            // we need to handle this specially to prevent infinite loop
            if (oldestDataTime > toMs) {

              // If this is NOT the first data load (firstDataRequest), return noData: false to stop pagination
              // Use noData: false to avoid ghost - data exists, just not in this window
              if (!periodParams.firstDataRequest) {
                if (typeof onHistoryCallback === "function") {
                  onHistoryCallback([], { noData: false });
                }
                return;
              }

              // For the first request, return the future data so it can be displayed
              bars = allBars;
            } else {
              // Normal case: filter to requested range
              const filteredBars = allBars.filter(
                (b) => b.time >= fromMs && b.time <= toMs,
              );
              if (filteredBars.length > 0) {
                bars = filteredBars;
              } else if (newestDataTime < fromMs) {
                // All our data is BEFORE the requested range - use noData: false to avoid ghost
                if (typeof onHistoryCallback === "function") {
                  onHistoryCallback([], { noData: false });
                }
                return;
              } else {
                bars = allBars;
              }
            }
          }

          // Return bars to TradingView
          if (bars.length === 0) {
            // Check if we have cached data before returning noData
            const hasAnyCandles =
              lastGoodCandlesRef.current &&
              lastGoodCandlesRef.current.length > 0;
            if (hasAnyCandles) {
              const MIN_PRICE = 0.0000001;
              const currentNetwork = latestParamsRef.current.network;
              const isMonad = currentNetwork === "monad";
              const currentDisplayMode = effectiveDisplayMode;
              const cachedBars = lastGoodCandlesRef.current
                .map((item) => {
                  const hasZeroValues =
                    item.o === 0 &&
                    item.h === 0 &&
                    item.l === 0 &&
                    item.c === 0;
                  const baseBar = {
                    time: item.unix_time * 1000,
                    open: hasZeroValues ? MIN_PRICE : item.o,
                    high: hasZeroValues ? MIN_PRICE : item.h,
                    low: hasZeroValues ? MIN_PRICE : item.l,
                    close: hasZeroValues ? MIN_PRICE : item.c,
                    volume: item.v_usd || 0,
                  };
                  return applyFlatCandleSpread(transformBar(baseBar, currentDisplayMode, true));
                })
                .filter((bar) => bar.time > 0 && isFinite(bar.time));
              cachedBars.sort((a, b) => a.time - b.time);

              if (typeof onHistoryCallback === "function") {
                onHistoryCallback(cachedBars, { noData: false });
              }
              return;
            }

            if (typeof onHistoryCallback === "function") {
              onHistoryCallback([], { noData: true });
            }
            return;
          }

          if (bars.length > 0 && CHART_DEBUG) {
          }

          // Return bars to TradingView
          if (typeof onHistoryCallback === "function") {
            onHistoryCallback(bars, { noData: false });
            chartPopulatedRef.current = true;

            // Right-align chart after first data load for all networks
            if (periodParams.firstDataRequest && bars.length > 0) {
              setTimeout(() => {
                rightAlignChart(bars.length);

                // For Monad: Ensure thin candles
                if (isMonad && widgetRef.current) {
                  widgetRef.current.onChartReady(() => {
                    try {
                      const chart = widgetRef.current?.chart?.();
                      if (chart) {
                        chart.applyOptions({
                          timeScale: {
                            barSpacing: 2, // Thin candles
                            minBarSpacing: 1,
                          },
                        });
                      }
                    } catch (navErr) {
                    }
                  });
                }
              }, 300);
            }
          }
        } catch (error: any) {
          console.error("[AdvancedOHLCChart] Error fetching bars:", error);

          // Signal that request failed
          rejectInFlight?.(error);
          getBarsInFlightRef.current = null;

          // Seed cache refs even on error — prevents every future getBars from
          // retrying the failed HTTP fetch (especially for Solana where WS is
          // the sole data source and HTTP may always fail).
          if (lastGoodCandlesRef.current.length > 0 && !cachedTimeframeRef.current) {
            cachedIntervalRef.current = requestedInterval;
            cachedTimeframeRef.current = requestedTimeframe;
          }

          // Try to use cached data as fallback
          if (lastGoodCandlesRef.current.length > 0) {
            const MIN_PRICE = 0.0000001;
            const currentNetwork = latestParamsRef.current.network;
            const isMonad = currentNetwork === "monad";
            const currentDisplayMode = effectiveDisplayMode;
            const allBars = lastGoodCandlesRef.current
              .map((item) => {
                const hasZeroValues =
                  item.o === 0 && item.h === 0 && item.l === 0 && item.c === 0;
                const baseBar = {
                  time: item.unix_time * 1000, // Convert to milliseconds
                  open: hasZeroValues ? MIN_PRICE : item.o,
                  high: hasZeroValues ? MIN_PRICE : item.h,
                  low: hasZeroValues ? MIN_PRICE : item.l,
                  close: hasZeroValues ? MIN_PRICE : item.c,
                  volume: item.v_usd || 0,
                };
                return applyFlatCandleSpread(transformBar(baseBar, currentDisplayMode, true));
              })
              .filter((bar) => bar.time > 0); // Filter out invalid bars
            allBars.sort((a, b) => a.time - b.time);

            // Only collapse time gaps for Monad — Solana trades 24/7, no session gaps to collapse.
            // Gap collapse + resolution switching causes timestamp mismatches between historical and live bars.
            {
              const isSolana = latestParamsRef.current.network !== "monad";
              if (!isSolana) {
                const resMs = parseResolutionToMs(resolution);
                const { shifts, totalShift } = collapseTimeGaps(allBars, resMs);
                gapShiftsRef.current = shifts;
                totalShiftRef.current = totalShift;
                gapFillBars(allBars, resolution);
              } else {
                gapShiftsRef.current = [];
                totalShiftRef.current = 0;
              }
            }

            // Ensure candles connect properly in error fallback
            if (allBars.length > 1) {
              for (let i = 0; i < allBars.length - 1; i++) {
                const currentBar = allBars[i];
                const nextBar = allBars[i + 1];

                if (nextBar.open !== currentBar.close) {
                  const previousOpen = nextBar.open;
                  nextBar.open = currentBar.close;

                  if (
                    nextBar.high === previousOpen &&
                    nextBar.low === previousOpen &&
                    nextBar.close === previousOpen
                  ) {
                    nextBar.high = currentBar.close;
                    nextBar.low = currentBar.close;
                    nextBar.close = currentBar.close;
                  } else {
                    if (nextBar.high < nextBar.open)
                      nextBar.high = nextBar.open;
                    if (nextBar.low > nextBar.open) nextBar.low = nextBar.open;
                  }
                }
              }
            }

            // Re-apply flat candle spread after connection loop (it can make candles flat)
            for (let i = 0; i < allBars.length; i++) {
              allBars[i] = applyFlatCandleSpread(allBars[i]);
            }

            // Don't filter cached data by time range in error case - just return what we have
            // This ensures data is shown even if timestamps are outside expected range
            const bars = allBars;

            if (bars.length === 0) {

              if (typeof onHistoryCallback === "function") {
                onHistoryCallback([], { noData: true });
              }
              return;
            }

            if (typeof onHistoryCallback === "function") {
              onHistoryCallback(bars, { noData: false });
              chartPopulatedRef.current = true;
            }
            return;
          }

          console.error(
            "[AdvancedOHLCChart] No data available and no cached data, calling onErrorCallback",
          );
          if (typeof onErrorCallback === "function") {
            onErrorCallback(error?.message || "Failed to fetch data");
          }
        }
      },

      subscribeBars: (
        symbolInfo: any,
        resolution: string,
        onRealtimeCallback: (bar: any) => void,
        subscriberUID: string,
        onResetCacheNeededCallback?: () => void,
      ) => {
        ++lifecycleSeqRef.current;
        // Mode toggle lifecycle completed — clear pending flag
        modeTogglePendingRef.current = false;

        // Clear any pending recovery/reset timers from previous lifecycle
        if (subscribeBarsRecoveryRef.current) {
          clearTimeout(subscribeBarsRecoveryRef.current);
          subscribeBarsRecoveryRef.current = null;
        }
        if (pendingCandleResetRef.current) {
          clearTimeout(pendingCandleResetRef.current);
          pendingCandleResetRef.current = null;
        }

        // Track active subscriber — prevents stale unsubscribes from killing this callback
        activeSubscriberUIDRef.current = subscriberUID;
        tvResolutionRef.current = resolution;

        const {
          network: currentNetwork,
          mint: currentMint,
          pairAddress: currentPairAddress,
        } = latestParamsRef.current;
        const tokenAddress = currentMint || currentPairAddress;

        if (!tokenAddress) {
          return;
        }

        // Wrap the callback to auto-shift real-time bars into collapsed time.
        // Guard: ignore calls if this subscriber has been superseded.
        subscribedCallbackRef.current = (bar: any) => {
          if (activeSubscriberUIDRef.current !== subscriberUID) return;
          const shift = totalShiftRef.current;
          try {
            if (shift > 0) {
              onRealtimeCallback({ ...bar, time: bar.time - shift });
            } else {
              onRealtimeCallback(bar);
            }
          } catch (tvErr) {
          }
        };
        // Store raw callback in Map for potential reuse when TV switches back
        // to this resolution without calling subscribeBars again
        resolutionCallbackMapRef.current.set(resolution, {
          subscriberUID,
          onRealtimeCallback,
        });

        // For Solana: callback is registered, useEffect WebSocket will use it
        // Don't create WebSocket here - the Solana useEffect handles it
        if (currentNetwork !== "monad") {
          return;
        }

        // If we already have an active WebSocket from useEffect, ensure callback is set and return
        // The useEffect WebSocket will handle both initial data and real-time updates
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          // Callback is already set above, so future WebSocket messages will work
          // The WebSocket in useEffect will now be able to send updates via this callback
          return;
        }

        // If WebSocket is connecting, set up a listener to ensure callback works when it opens
        if (
          wsRef.current &&
          wsRef.current.readyState === WebSocket.CONNECTING
        ) {
          // Set up a one-time listener to confirm callback is ready when WebSocket opens
          const checkConnection = () => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            } else if (
              wsRef.current &&
              wsRef.current.readyState === WebSocket.CONNECTING
            ) {
              // Still connecting, check again in a bit
              setTimeout(checkConnection, 100);
            }
          };
          setTimeout(checkConnection, 100);
          return;
        }

        // No active WebSocket, create one (fallback if useEffect didn't connect) - Monad only
        const requestedInterval = RESOLUTION_TO_INTERVAL[resolution] || "1s";
        const wsBaseUrl =
          process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL ||
          "http://localhost:8081";
        // Convert http/https to ws/wss for WebSocket
        const wsProtocol = wsBaseUrl.startsWith("https") ? "wss" : "ws";
        const wsHost = wsBaseUrl.replace(/^https?:\/\//, "");
        const wsUrl = `${wsProtocol}://${wsHost}/v1/ohlc/stream?token_address=${tokenAddress}&interval=${requestedInterval}`;


        try {
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onopen = () => {
          };

          ws.onmessage = (event) => {
            try {
              // RACE FIX: Reject if token changed since this fallback WS was created
              if (activeTokenRef.current !== tokenAddress) return;

              const message = JSON.parse(event.data);

              // Handle real-time candle updates (history is handled by useEffect)
              if (message.type !== "ohlc_candle") {
                return;
              }

              const ohlcData = message.data;

              // Convert to TradingView bar format
              let bar = {
                time: (ohlcData.time || 0) * 1000,
                open: ohlcData.o,
                high: ohlcData.h,
                low: ohlcData.l,
                close: ohlcData.c,
                volume: ohlcData.v || 0,
              };

              // For Monad: Ensure new candle connects to previous candle
              if (currentNetwork === "monad") {
                const cachedData = lastGoodCandlesRef.current;
                if (cachedData.length > 0) {
                  // Cache is already sorted by unix_time
                  const previousCandle = cachedData[cachedData.length - 1];

                  if (bar.time / 1000 > previousCandle.unix_time) {
                    const previousClose = previousCandle.c;

                    if (bar.open !== previousClose) {
                      const wasFlat =
                        bar.open === bar.high &&
                        bar.open === bar.low &&
                        bar.open === bar.close;
                      bar.open = previousClose;

                      if (wasFlat) {
                        bar.high = previousClose;
                        bar.low = previousClose;
                        bar.close = previousClose;
                      } else {
                        if (bar.high < bar.open) bar.high = bar.open;
                        if (bar.low > bar.open) bar.low = bar.open;
                      }
                    }
                  }
                }
              }

              // Update the chart via callback
              if (subscribedCallbackRef.current && bar.time > 0) {
                try {
                  subscribedCallbackRef.current(bar);
                } catch (cbErr) {
                  subscribedCallbackRef.current = null;
                }
              }
            } catch (e) {
              console.error(
                "[AdvancedOHLCChart] subscribeBars WebSocket message error:",
                e,
              );
            }
          };

          ws.onerror = (error) => {
            console.error(
              "[AdvancedOHLCChart] subscribeBars WebSocket error:",
              error,
            );
          };

          ws.onclose = () => {
            wsRef.current = null;
          };
        } catch (e) {
          console.error(
            "[AdvancedOHLCChart] Failed to create WebSocket in subscribeBars:",
            e,
          );
        }
      },

      unsubscribeBars: (subscriberUID: string) => {
        ++lifecycleSeqRef.current;
        const isActive = activeSubscriberUIDRef.current === subscriberUID;

        // Remove this subscriber's callback from the resolution Map
        // Format: "SYMBOL_#_RESOLUTION" → extract resolution suffix
        const uidParts = subscriberUID.split('_#_');
        const uidResolution = uidParts.length > 1 ? uidParts[uidParts.length - 1] : null;
        // Only delete from map if the stored entry's subscriberUID matches the one
        // being unsubscribed. A stale unsubscribe (e.g., delayed MC_#_1S after USD_#_1S
        // already stored at map['1S']) must NOT delete the newer entry — that would
        // corrupt the map and break all future toggles/restorations.
        const mapEntry = uidResolution ? resolutionCallbackMapRef.current.get(uidResolution) : null;
        const willDeleteFromMap = !!mapEntry && mapEntry.subscriberUID === subscriberUID;
        const isModeToggle = modeTogglePendingRef.current;

        // During mode toggles, SKIP all destructive actions. The existing subscription
        // must stay alive so WS candles keep flowing. subscribeBars will atomically
        // replace everything when the lifecycle completes. If it never completes,
        // the old subscription is the correct fallback (matches chart's actual state).
        if (isModeToggle && isActive) {
          // Still abort lazy-loads — they block the pipeline
          if (lazyLoadAbortRef.current) {
            lazyLoadAbortRef.current.abort();
            lazyLoadAbortRef.current = null;
          }
        } else {
          if (willDeleteFromMap && uidResolution) {
            resolutionCallbackMapRef.current.delete(uidResolution);
          }
        }

        // Only mark inactive if this unsubscribe belongs to the currently
        // active subscriber AND no mode toggle is pending.
        // During mode toggles, keeping activeSubscriberUIDRef set prevents:
        //   1) The callback UID guard from dropping WS candles
        //   2) The recovery timer from nulling subscribedCallbackRef
        //   3) pendingCandleResetRef from firing spurious resetData() cycles
        // When subscribeBars is called for the new symbol, it replaces both
        // activeSubscriberUIDRef and subscribedCallbackRef atomically.
        if (isActive && !isModeToggle) {
          activeSubscriberUIDRef.current = null;

          // CRITICAL: Abort any in-flight lazy-load fetch immediately.
          // TradingView serializes getBars calls — a pending lazy-load blocks the
          // entire resolveSymbol→getBars→subscribeBars pipeline for the new resolution.
          // Aborting causes the old getBars to return noData instantly, unblocking TV.
          if (lazyLoadAbortRef.current) {
            lazyLoadAbortRef.current.abort();
            lazyLoadAbortRef.current = null;
          }

          // Recovery: if subscribeBars isn't called within 3s, TradingView's
          // lifecycle got stuck. Force resetData() to restart it.
          // (Now that lazy-load is aborted, lifecycle should complete in <500ms;
          //  this timer is a safety net for unexpected edge cases.)
          if (subscribeBarsRecoveryRef.current) {
            clearTimeout(subscribeBarsRecoveryRef.current);
          }
          subscribeBarsRecoveryRef.current = setTimeout(() => {
            subscribeBarsRecoveryRef.current = null;
            if (!activeSubscriberUIDRef.current) {
              subscribedCallbackRef.current = null;
              try { widgetRef.current?.chart?.()?.resetData?.(); } catch {}
            }
          }, 3000);
        } else {
          // Stale unsubscribe — callback preserved
        }
      },

      // ✅ Implement getMarks for dev buy/sell indicators
      getMarks: (
        symbolInfo: any,
        from: number,
        to: number,
        onDataCallback: any,
        resolution: string,
      ) => {
        const currentTradeData = latestTradeDataRef.current || [];
        const currentCreatorAddress = latestCreatorAddressRef.current;
        const currentUserWallet = latestUserWalletRef.current;

        marksLogCountRef.current++;
        const shouldLogMarks = marksLogCountRef.current % 10 === 1;

        try {
          // TEMP diagnostic — remove once optimistic markers verified.
          const optimisticInTradeData = currentTradeData.filter((t: any) => t.__optimistic);
          if (optimisticInTradeData.length > 0) {
            // eslint-disable-next-line no-console
            console.log("[getMarks] optimistic rows in tradeData:", optimisticInTradeData.length, {
              from,
              to,
              userWallet: currentUserWallet,
              firstOptimistic: {
                maker: optimisticInTradeData[0].maker,
                wallet_address: optimisticInTradeData[0].wallet_address,
                timestamp: optimisticInTradeData[0].timestamp,
                side: optimisticInTradeData[0].side,
              },
            });
          }

          if (!currentTradeData || currentTradeData.length === 0) {
            onDataCallback([]);
            return;
          }

          const matchedTrades = currentTradeData.filter(
            (trade: any) => {
              const maker = (trade.maker || trade.user || trade.wallet_address || "").toLowerCase();
              if (!maker) return false;

              const isDev = currentCreatorAddress && maker === currentCreatorAddress.toLowerCase();
              const isUser = currentUserWallet && maker === currentUserWallet.toLowerCase();
              const isMayhem = MAYHEM_WALLET_ADDRESSES.has(maker);
              // KOL bucket only kicks in if the maker isn't already classified
              // as dev / user / mayhem — avoids double-rendering one trade.
              const kolInfo = !isDev && !isUser && !isMayhem ? KOL_ADDRESS_MAP.get(maker) : null;

              if (!isDev && !isUser && !isMayhem && !kolInfo) return false;

              // Handle different timestamp formats
              let timestamp =
                trade.timestamp || trade.created_at || trade.unix_time;
              if (!timestamp) return false;

              let timeSeconds: number;
              if (typeof timestamp === "string") {
                timeSeconds = Math.floor(new Date(timestamp).getTime() / 1000);
              } else if (timestamp > 10000000000) {
                timeSeconds = Math.floor(timestamp / 1000);
              } else {
                timeSeconds = timestamp;
              }

              // Convert real time to collapsed time for TradingView's from/to range
              const collapsedTimeSec = realToAdjusted(timeSeconds * 1000, gapShiftsRef.current) / 1000;
              return collapsedTimeSec >= from && collapsedTimeSec <= to;
            },
          );

          // Convert to TradingView marks format
          const marks = matchedTrades.map((trade: any) => {
            // Handle different timestamp formats
            let timestamp =
              trade.timestamp || trade.created_at || trade.unix_time;
            let timeSeconds: number;
            if (typeof timestamp === "string") {
              // ISO string format
              timeSeconds = Math.floor(new Date(timestamp).getTime() / 1000);
            } else if (timestamp > 10000000000) {
              // Milliseconds
              timeSeconds = Math.floor(timestamp / 1000);
            } else {
              // Already in seconds
              timeSeconds = timestamp;
            }

            // Robust buy/sell detection - handles multiple trade data formats
            // Normalized strings for side/type/eventDisplayType (check nested fields too)
            const rawSide = String(
              trade.side ||
                trade.type ||
                trade.eventDisplayType ||
                trade.data?.side ||
                trade.originalEvent?.data?.side ||
                "",
            ).toLowerCase();

            let isBuy: boolean;

            // 1) Strongest signal: boolean or numeric is_buy
            if (
              trade.is_buy === true ||
              trade.is_buy === 1 ||
              trade.is_buy === "1"
            ) {
              isBuy = true;
            } else if (
              trade.is_buy === false ||
              trade.is_buy === 0 ||
              trade.is_buy === "0"
            ) {
              isBuy = false;
            }
            // 2) Side / type / eventDisplayType hints (normalized, case-insensitive)
            else if (
              rawSide.includes("buy") ||
              rawSide === "bid" ||
              rawSide === "buy_order"
            ) {
              isBuy = true;
            } else if (
              rawSide.includes("sell") ||
              rawSide === "ask" ||
              rawSide === "sell_order"
            ) {
              isBuy = false;
            }
            // 3) Fallback: treat as buy if eventDisplayType looks like a dev buy
            else if (
              String(trade.eventDisplayType || "")
                .toLowerCase()
                .includes("buy")
            ) {
              isBuy = true;
            } else if (
              String(trade.eventDisplayType || "")
                .toLowerCase()
                .includes("sell")
            ) {
              isBuy = false;
            }
            // 4) Last resort: default to *buy* instead of sell, so DBs don't accidentally show red
            else {
              isBuy = true;
            }

            // Format the timestamp to match the requested format
            const formattedDate = new Date(timeSeconds * 1000)
              .toISOString()
              .replace("T", " ")
              .slice(0, 19);

            const {
              formattedAmount,
              formattedPrice,
              formattedTotalUsd,
              displaySymbol,
              walletAddress,
            } = computeTradeDisplayValues(trade);

            // Determine if this is a dev trade, user trade, mayhem-bot trade, or KOL trade
            const maker = (trade.maker || trade.user || trade.wallet_address || "").toLowerCase();
            const isDev = currentCreatorAddress && maker === currentCreatorAddress.toLowerCase();
            const isUser = currentUserWallet && maker === currentUserWallet.toLowerCase();
            const isMayhem = !isDev && !isUser && MAYHEM_WALLET_ADDRESSES.has(maker);
            const kolInfo = !isDev && !isUser && !isMayhem ? KOL_ADDRESS_MAP.get(maker) : null;

            let label: string;
            let markColor: string;
            let markerText: string;

            if (isDev) {
              // Dev marker: green/red, DB/DS label
              label = isBuy ? "DB" : "DS";
              markColor = isBuy ? "green" : "red";
              markerText = `${isBuy ? "Dev Buy" : "Dev Sell"} • ${displaySymbol}
${formattedDate} UTC

Price: ${formattedPrice}
Amount: ${formattedAmount} ${displaySymbol}
Total: ${formattedTotalUsd}
Maker: ${walletAddress}`;
            } else if (isUser) {
              // User's own trade marker: green/red, B/S label
              label = isBuy ? "B" : "S";
              markColor = isBuy ? "green" : "red";
              markerText = `${isBuy ? "Your Buy" : "Your Sell"} • ${displaySymbol}
${formattedDate} UTC

Price: ${formattedPrice}
Amount: ${formattedAmount} ${displaySymbol}
Total: ${formattedTotalUsd}`;
            } else if (isMayhem) {
              // Mayhem Bot marker: green ring for buys, brand-red ring for sells.
              // Mirrors the dev/user color scheme so a glance at any candle
              // tells you the bot's side immediately. The bot avatar still
              // renders inside the ring via imageUrl below.
              label = isBuy ? "MB" : "MS";
              markColor = isBuy ? "green" : MAYHEM_MARK_COLOR_NAMED;
              markerText = `Mayhem Bot ${isBuy ? "Buy" : "Sell"} • ${displaySymbol}
${formattedDate} UTC

Price: ${formattedPrice}
Amount: ${formattedAmount} ${displaySymbol}
Total: ${formattedTotalUsd}
Maker: ${walletAddress}`;
            } else if (kolInfo) {
              // KOL marker: green for buys, red for sells
              label = kolInfo.label;
              markColor = isBuy ? "green" : "red";
              const kolDisplayName = kolInfo.name || kolInfo.twitterUsername;
              markerText = `KOL ${isBuy ? "Buy" : "Sell"}: ${kolDisplayName} • ${displaySymbol}
${formattedDate} UTC

Price: ${formattedPrice}
Amount: ${formattedAmount} ${displaySymbol}
Total: ${formattedTotalUsd}
Maker: ${walletAddress}`;
            } else {
              // Should not reach here due to filter, but fallback
              label = "??";
              markColor = "gray";
              markerText = "";
            }

            // getMarks only supports named colors (NOT hex)
            const markData: any = {
              id: `${isDev ? "dev" : isUser ? "user" : isMayhem ? "mayhem" : "kol"}_trade_${timeSeconds}_${trade.transactionHash || trade.tx_hash || trade.id || trade.maker || ''}`,
              time: realToAdjusted(timeSeconds * 1000, gapShiftsRef.current) / 1000,
              color: markColor,
              label: label,
              position: "inBar",
              text: markerText,
              labelFontColor: "white",
              minSize: 24,
              size: 1,
              shape: "circle",
              // Branded artwork for the in-bar circle: KOLs get their avatar,
              // Mayhem Bot gets the dedicated /mayhem bot.png. TradingView's
              // imageUrl renders inside the colored circle and falls back to
              // the `label` text if the image 404s, so this is safe to layer.
              ...(isMayhem
                ? { imageUrl: MAYHEM_MARK_IMAGE_URL }
                : kolInfo?.avatarUrl
                  ? { imageUrl: kolInfo.avatarUrl }
                  : {}),
            };

            return markData;
          });


          onDataCallback(marks);
        } catch (error) {
          console.error("[AdvancedOHLCChart] Error in getMarks:", error);
          onDataCallback([]);
        }
      },

      // ✅ Implement getTimescaleMarks for timeline indicators
      getTimescaleMarks: (
        symbolInfo: any,
        from: number,
        to: number,
        onDataCallback: any,
        resolution: string,
      ) => {
        // Timescale marks (Dev / User / Mayhem) disabled
        onDataCallback([]);
        return;

        const shouldLogMarks = marksLogCountRef.current % 10 === 1;
        try {
          const currentTradeData = latestTradeDataRef.current || [];
          const currentCreatorAddress = latestCreatorAddressRef.current;
          const currentUserWallet = latestUserWalletRef.current;

          if (
            !currentTradeData ||
            currentTradeData.length === 0
          ) {
            onDataCallback([]);
            return;
          }

          // Filter for dev + user + mayhem trades within the requested time range
          const matchedTrades = currentTradeData.filter((trade: any) => {
            const maker = (trade.maker || trade.user || trade.wallet_address || "").toLowerCase();
            if (!maker) return false;

            const isDev = currentCreatorAddress && maker === currentCreatorAddress.toLowerCase();
            const isUser = currentUserWallet && maker === currentUserWallet.toLowerCase();
            const isMayhem = MAYHEM_WALLET_ADDRESSES.has(maker);
            if (!isDev && !isUser && !isMayhem) return false;

            const timestamp =
              trade.timestamp || trade.created_at || trade.unix_time;
            if (!timestamp) return false;

            let timeSeconds: number;
            if (typeof timestamp === "string") {
              timeSeconds = Math.floor(new Date(timestamp).getTime() / 1000);
            } else if (timestamp > 10000000000) {
              timeSeconds = Math.floor(timestamp / 1000);
            } else {
              timeSeconds = timestamp;
            }
            // Convert real time to collapsed time for TradingView's from/to range
            const collapsedTimeSec = realToAdjusted(timeSeconds * 1000, gapShiftsRef.current) / 1000;
            return collapsedTimeSec >= from && collapsedTimeSec <= to;
          });

          // Convert to TradingView timescale marks format
          // Use Monad colors for timescale marks
          const monadGreenHex = "#86d99f"; // Monad green for dev buys
          const monadRedHex = "#941839"; // Monad red for dev sells
          const currentNetwork = latestParamsRef.current.network;
          const timescaleMarks = matchedTrades.map((trade: any) => {
            const timestamp =
              trade.timestamp || trade.created_at || trade.unix_time;
            let timeSeconds: number;
            if (typeof timestamp === "string") {
              timeSeconds = Math.floor(new Date(timestamp).getTime() / 1000);
            } else if (timestamp > 10000000000) {
              timeSeconds = Math.floor(timestamp / 1000);
            } else {
              timeSeconds = timestamp;
            }
            // Use same robust buy detection logic as getMarks
            // Normalized strings for side/type/eventDisplayType (check nested fields too)
            const rawSide = String(
              trade.side ||
                trade.type ||
                trade.eventDisplayType ||
                trade.data?.side ||
                trade.originalEvent?.data?.side ||
                "",
            ).toLowerCase();

            let isBuy: boolean;

            // 1) Strongest signal: boolean or numeric is_buy
            if (
              trade.is_buy === true ||
              trade.is_buy === 1 ||
              trade.is_buy === "1"
            ) {
              isBuy = true;
            } else if (
              trade.is_buy === false ||
              trade.is_buy === 0 ||
              trade.is_buy === "0"
            ) {
              isBuy = false;
            }
            // 2) Side / type / eventDisplayType hints (normalized, case-insensitive)
            else if (
              rawSide.includes("buy") ||
              rawSide === "bid" ||
              rawSide === "buy_order"
            ) {
              isBuy = true;
            } else if (
              rawSide.includes("sell") ||
              rawSide === "ask" ||
              rawSide === "sell_order"
            ) {
              isBuy = false;
            }
            // 3) Fallback: treat as buy if eventDisplayType looks like a dev buy
            else if (
              String(trade.eventDisplayType || "")
                .toLowerCase()
                .includes("buy")
            ) {
              isBuy = true;
            } else if (
              String(trade.eventDisplayType || "")
                .toLowerCase()
                .includes("sell")
            ) {
              isBuy = false;
            }
            // 4) Last resort: default to *buy* instead of sell, so DBs don't accidentally show red
            else {
              isBuy = true;
            }
            const {
              formattedAmount,
              formattedPrice,
              formattedTotalUsd,
              displaySymbol,
            } = computeTradeDisplayValues(trade);

            // Determine trade type for timescale mark
            const maker = (trade.maker || trade.user || trade.wallet_address || "").toLowerCase();
            const isDev = currentCreatorAddress && maker === currentCreatorAddress.toLowerCase();
            const isMayhem = !isDev && MAYHEM_WALLET_ADDRESSES.has(maker);

            // Timescale marks color assignment
            // Dev: green/red, Mayhem: brand red regardless of side, User: green/red
            let markColor: string;
            let markLabel: string;
            let markPrefix: string;

            if (isDev) {
              markColor =
                currentNetwork === "monad"
                  ? isBuy
                    ? monadGreenHex
                    : monadRedHex
                  : isBuy
                    ? "#22c55e"
                    : "#ef4444";
              markLabel = isBuy ? "DB" : "DS";
              markPrefix = isBuy ? "Dev Buy" : "Dev Sell";
            } else if (isMayhem) {
              // Mayhem Bot timescale mark — green for buys (#22c55e to match
              // the dev/user palette), brand red #c83c51 for sells. Side-aware
              // coloring matches the in-bar circle ring above.
              markColor = isBuy ? "#22c55e" : MAYHEM_MARK_COLOR_HEX;
              markLabel = isBuy ? "MB" : "MS";
              markPrefix = isBuy ? "Mayhem Buy" : "Mayhem Sell";
            } else {
              // User trade
              markColor = isBuy ? "#22c55e" : "#ef4444"; // green / red hex
              markLabel = isBuy ? "B" : "S";
              markPrefix = isBuy ? "Your Buy" : "Your Sell";
            }

            return {
              id: `${isDev ? "dev" : isMayhem ? "mayhem" : "user"}_timescale_${timeSeconds}_${trade.transactionHash || trade.tx_hash || trade.id || trade.maker || ''}`,
              time: realToAdjusted(timeSeconds * 1000, gapShiftsRef.current) / 1000,
              color: markColor.toLowerCase(), // Ensure lowercase for TradingView
              label: markLabel,
              tooltip: [
                `${markPrefix} • ${displaySymbol}`,
                `Price: ${formattedPrice}`,
                `Amount: ${formattedAmount} ${displaySymbol}`,
                `Total: ${formattedTotalUsd}`,
                new Date(timeSeconds * 1000).toLocaleString(),
              ],
            };
          });

          onDataCallback(timescaleMarks);
        } catch (error) {
          console.error(
            "[AdvancedOHLCChart] Error in getTimescaleMarks:",
            error,
          );
          onDataCallback([]);
        }
      },
    };

    datafeedRef.current = customDatafeed;
    return customDatafeed;
  }, [buildUrl, onDataUpdate, network, updateChartMetrics]); // Include network so datafeed updates when network changes, updateChartMetrics for price line sync

  const syncWidgetWithParams = useCallback(() => {
    try {
      const widget = widgetRef.current;
      if (!widget) return;

      const params = latestParamsRef.current;
      const tokenId = params.mint || params.pairAddress;
      if (!tokenId) return;

      const nextResolution = INTERVAL_TO_RESOLUTION[params.interval];

      const applyUpdate = () => {
        try {
          const currentWidget = widgetRef.current;
          if (!currentWidget) return;
          const chart = currentWidget.chart?.();
          if (!chart) return;

          if (widgetTokenRef.current !== tokenId) {
            // Include display mode suffix so TradingView treats it as a new symbol
            // (matches the format used at widget creation: `${tokenId}|${mode}`)
            const symbolWithMode = `${tokenId}|${displayModeRef.current}`;
            // Remove old token's price line shapes before switching
            try { chart.removeAllShapes?.(); } catch {}
            previewLineShapeIdRef.current = null;
            previewCreationSeqRef.current++;
            currentWidget.setSymbol?.(symbolWithMode, nextResolution, () => {
              widgetTokenRef.current = tokenId;
              chart.resetData?.();
              requestPriceLineSync(50);
            });
            return;
          }

          chart.setResolution?.(nextResolution, () => {
            // NOTE: Do NOT call chart.resetData() here.
            // setResolution already triggers the full TradingView lifecycle
            // (unsubscribeBars → resolveSymbol → getBars → subscribeBars).
            // Calling resetData() in the callback creates a SECOND lifecycle cycle,
            // which nulls subscribedCallbackRef again and causes a race where
            // live WS candles arrive between unsubscribeBars and subscribeBars
            // with no callback to forward them to TradingView.
            requestPriceLineSync(50);
          });
        } catch (error) {
          // Silently ignore during widget initialization/cleanup
        }
      };

      try {
        const chart = widget.chart?.();
        if (chart) {
          applyUpdate();
          return;
        }
      } catch {
        // Chart not ready yet, will try onChartReady
      }

      // Widget might have been cleaned up, check before accessing
      if (widget && typeof widget.onChartReady === "function") {
        widget.onChartReady(() => {
          applyUpdate();
        });
      }
    } catch {
      // Silently ignore all errors - widget may be in an inconsistent state during hot reload
    }
  }, []);

  // Note: Dev trade markers are now handled by TradingView's native marks system
  // via the getMarks() method in the datafeed. No manual marker creation needed.

  // Compute time frame buttons based on token age (hides buttons for periods > token's lifetime)
  const computeTimeFrames = useCallback(() => {
    return [
      { text: "1D",   resolution: "5",   description: "1 Day",    title: "1D"   },
      { text: "7D",   resolution: "30",  description: "7 Days",   title: "7D"   },
      { text: "30D",  resolution: "240", description: "30 Days",  title: "30D"  },
      { text: "180D", resolution: "240", description: "180 Days", title: "180D" },
    ];
  }, []);

  // Initialize TradingView widget
  // Track the token identifier to prevent recreation when pairAddress just refines
  const widgetTokenRef = useRef<string | null>(null);

  useEffect(() => {

    if (!libraryLoaded || !containerRef.current || !initialTokenId) {
      return;
    }

    const container = containerRef.current;
    let disposed = false;

    const setup = async () => {
      await waitForVisibleContainer(container);
      if (disposed || widgetRef.current) return;

      const datafeed = createDatafeed();
      if (!datafeed) {
        setError("No mint or pair address provided");
        setIsLoading(false);
        return;
      }

      try {
        const TradingView = (window as any).TradingView;

        if (!TradingView) {
          throw new Error("TradingView library not found in window object");
        }
        if (!TradingView.widget) {
          throw new Error(
            "TradingView.widget not found - library may not be fully loaded",
          );
        }

        const containerWidth = container.clientWidth || 800;
        const containerHeight = container.clientHeight || 400;


        // Both Monad and Solana use 1s candles as default
        const isMonad = network === "monad";
        // Always start with 1S (1 second) candles for both chains
        const initialInterval = "1S";
        // Pre-populate candle data from preload to prevent getBars 2s wait loop.
        // The useEffect that normally writes preloadedData → lastGoodCandlesRef may not
        // have fired yet when TradingView synchronously calls getBars on onChartReady.
        if (preloadedData && preloadedData.length > 0 && lastGoodCandlesRef.current.length === 0) {
          lastGoodCandlesRef.current = preloadedData;
          clampLaunchCandles(lastGoodCandlesRef.current);
          // Wake getBars() if it's waiting for data
          if (snapshotResolverRef.current) {
            snapshotResolverRef.current();
            snapshotResolverRef.current = null;
          }
        }

        // Include mode suffix in symbol to ensure TradingView refreshes data when mode changes
        // Initial mode is 'MC' (from useState default)
        const initialMode = displayModeRef.current; // Should be 'MC' at init
        const widget = new TradingView.widget({
          debug: false,
          fullscreen: false,
          symbol: `${initialTokenId}|${initialMode}`,
          datafeed: datafeed,
          interval: initialInterval,
          container: container,
          library_path: "/charting_library/charting_library/",
          locale: "en",
          autosize: true, // ✅ Let TV size to the container
          // Enable sidebar toolbar and features
          disabled_features: [
            "use_localstorage_for_settings",
            // Keep toolbar enabled - remove these to show toolbar
            // 'header_compare',
            // 'header_saveload',
            // 'header_screenshot',
            // 'header_chart_type',
            // 'header_resolutions',
            // 'header_symbol_search',
            // 'header_undo_redo',
            // 'header_interval_dialog_button',
            // 'show_interval_dialog_on_key_press',
          ],
          enabled_features: [
            "seconds_resolution", // ✅ Enable seconds resolution for both Solana and Monad
            "study_templates",
            "side_toolbar_in_fullscreen_mode",
            "header_widget",
            "header_chart_type",
            "header_resolutions",
            "header_screenshot",
            "header_saveload",
            "header_undo_redo",
            "header_compare",
            "header_symbol_search",
            "header_interval_dialog_button",
            "show_interval_dialog_on_key_press",
            "timeframes_toolbar",
            "left_toolbar",
            "control_bar",
            "edit_buttons_in_legend",
            "context_menus",
            "display_market_status",
            "two_character_bar_marks_labels", // ✅ Enable two-character labels for marks
          ],
          charts_storage_url: "https://saveload.tradingview.com",
          charts_storage_api_version: "1.1",
          client_id: "tradingview.com",
          user_id: "public_user_id",
          theme: "dark", // Dark mode
          // Time frames shown in the bottom toolbar — each button switches candle resolution
          // and fetches the matching backend aggregate (e.g., 7D → 30m candles, 30D → 4h candles)
          // Buttons are filtered by token age (don't show 180D for a 5-minute-old token)
          time_frames: computeTimeFrames(),
          // Remove custom_css_url to avoid pink theme issues
          custom_css_url: '/charting_library/themed.css',
          loading_screen: { backgroundColor: "transparent" },
          overrides: {
            "paneProperties.background": "#111214",
            "paneProperties.backgroundType": "solid",
            "paneProperties.vertGridProperties.color": "#1E1F21",
            "paneProperties.horzGridProperties.color": "#1E1F21",
            "symbolWatermarkProperties.transparency": 90,
            "scalesProperties.textColor": "#d1d4dc",
            "scalesProperties.lineColor": "#1E1F21",
            // Explicitly set chart type to candlesticks
            "paneProperties.backgroundGradientStartColor": "#111214",
            "paneProperties.backgroundGradientEndColor": "#111214",
            // Unified candle colors (Monad green/red) for both Solana and Monad
            "mainSeriesProperties.candleStyle.upColor": "#86d99f",
            "mainSeriesProperties.candleStyle.downColor": "#f26682",
            "mainSeriesProperties.candleStyle.borderUpColor": "#86d99f",
            "mainSeriesProperties.candleStyle.borderDownColor": "#f26682",
            "mainSeriesProperties.candleStyle.wickUpColor": "#86d99f",
            "mainSeriesProperties.candleStyle.wickDownColor": "#f26682",
            "mainSeriesProperties.candleStyle.drawWick": true,
            "mainSeriesProperties.candleStyle.drawBorder": true,
            "mainSeriesProperties.showCountdown": false,
            "paneProperties.legendProperties.showLegend": true,
            "paneProperties.legendProperties.showStudyArguments": true,
            "paneProperties.legendProperties.showStudyTitles": true,
            "paneProperties.legendProperties.showStudyValues": true,
            "paneProperties.legendProperties.showSeriesTitle": true,
            "paneProperties.legendProperties.showSeriesOHLC": true,
            // Override any pink/red colors to dark theme colors
            "mainSeriesProperties.lineStyle.color": "#26a69a",
            "paneProperties.topMargin": 10,
            "paneProperties.bottomMargin": 10,
            "paneProperties.legendProperties.background": "#111214",
            "paneProperties.legendProperties.color": "#d1d4dc",
            // Thin candles like Solana chart (barSpacing controls candle width)
            "paneProperties.vertGridProperties.style": 0,
            "paneProperties.horzGridProperties.style": 0,
            "scalesProperties.showLeftScale": false,
            "scalesProperties.showRightScale": true,
            "scalesProperties.showSeriesLastValue": true,
            "scalesProperties.showStudyLastValue": true,
            "scalesProperties.showSymbolLabels": false,
            "mainSeriesProperties.priceAxisProperties.autoScale": true,
            "mainSeriesProperties.priceAxisProperties.autoScaleDisabled": false,
            "mainSeriesProperties.visible": true,
          },
          studies_overrides: {
            // Volume bar colors - 0 = down candles (red), 1 = up candles (green)
            // Unified colors (Monad green/red) for both Solana and Monad
            "volume.volume.color.0": "#f26682", // Red bars for down candles
            "volume.volume.color.1": "#86d99f", // Green bars for up candles
            // Volume text/label colors
            "volume.volume.colorup": "#86d99f",
            "volume.volume.colordown": "#f26682",
            // Alternative property names that some TradingView versions use
            "volume.volume.plot.color.0": "#f26682",
            "volume.volume.plot.color.1": "#86d99f",
          },
          // Custom price formatter - dynamically switches between MC mode (K/M/B suffixes) and USD mode
          // CRITICAL: The mode check MUST be inside the format function, not in the factory
          // TradingView caches the formatter object returned by the factory, so checking mode
          // at factory time doesn't work when the user toggles USD/MC
          custom_formatters: {
            // Time/date formatters that map collapsed (adjusted) timestamps back to real time
            timeFormatter: {
              format: (date: Date) => {
                const adjustedMs = date.getTime();
                const realMs = adjustedToReal(adjustedMs, gapShiftsRef.current);
                const d = new Date(realMs);
                const hh = String(d.getUTCHours()).padStart(2, '0');
                const mm = String(d.getUTCMinutes()).padStart(2, '0');
                const ss = String(d.getUTCSeconds()).padStart(2, '0');
                return `${hh}:${mm}:${ss}`;
              },
              formatLocal: (date: Date) => {
                const adjustedMs = date.getTime();
                const realMs = adjustedToReal(adjustedMs, gapShiftsRef.current);
                const d = new Date(realMs);
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              },
              parse: (value: string) => value,
            },
            dateFormatter: {
              format: (date: Date) => {
                const adjustedMs = date.getTime();
                const realMs = adjustedToReal(adjustedMs, gapShiftsRef.current);
                const d = new Date(realMs);
                const yyyy = d.getUTCFullYear();
                const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
                const dd = String(d.getUTCDate()).padStart(2, '0');
                return `${yyyy}-${mo}-${dd}`;
              },
              formatLocal: (date: Date) => {
                const adjustedMs = date.getTime();
                const realMs = adjustedToReal(adjustedMs, gapShiftsRef.current);
                return new Date(realMs).toLocaleDateString();
              },
              parse: (value: string) => value,
            },
            tickMarkFormatter: (date: Date, tickMarkType: string) => {
              const adjustedMs = date.getTime();
              const realMs = adjustedToReal(adjustedMs, gapShiftsRef.current);
              const d = new Date(realMs);
              switch (tickMarkType) {
                case 'Year':
                  return String(d.getUTCFullYear());
                case 'Month':
                  return d.toLocaleDateString(undefined, { month: 'short' });
                case 'DayOfMonth':
                  return String(d.getUTCDate());
                case 'Time':
                  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                case 'TimeWithSeconds':
                  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                default:
                  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              }
            },
            priceFormatterFactory: (symbolInfo: any, minTick: any) => {
              if (symbolInfo === null) {
                return null;
              }

              // Return a formatter that dynamically checks the mode on each format call
              return {
                format: (price: number, signPositive?: boolean) => {
                  // Guard: TradingView can pass non-number values during setSymbol() transitions
                  if (typeof price !== 'number' || !isFinite(price)) return '—';

                  // CRITICAL: Check displayModeRef.current INSIDE format function
                  // This ensures the formatter respects the current toggle state
                  const currentMode = displayModeRef.current;

                  if (currentMode === "MC") {
                    // MC mode: Format with K/M/B suffixes (market cap values)
                    if (price >= 1_000_000_000) {
                      return `${(price / 1_000_000_000).toFixed(2)}B`;
                    }
                    if (price >= 1_000_000) {
                      return `${(price / 1_000_000).toFixed(2)}M`;
                    }
                    if (price >= 1_000) {
                      return `${(price / 1_000).toFixed(2)}K`;
                    }
                    return price.toFixed(2);
                  }

                  // USD mode: Format as USD price with appropriate decimal places (no $ prefix)
                  const abs = Math.abs(price);
                  if (abs >= 1) {
                    return price.toFixed(2);
                  }
                  if (abs >= 0.01) {
                    return price.toFixed(4);
                  }
                  if (abs >= 0.0001) {
                    return price.toFixed(6);
                  }
                  if (abs >= 0.00000001) {
                    return price.toFixed(8);
                  }
                  // For extremely small prices (typical for meme coins)
                  return price.toFixed(10);
                },
              };
            },
          },
          // ✅ Don't pass width/height when using autosize
        });

        widgetRef.current = widget;
        widgetTokenRef.current = initialTokenId;
        // Clear any stale shape refs from previous widget instance
        priceLineShapesRef.current = {};
        previewLineShapeIdRef.current = null;
        previewCreationSeqRef.current++;
        lastPriceLinesRef.current = {};
        setIsLoading(false);
        firstLoadRef.current = false; // Ensure loading overlay is dismissed
        setError(null);

        // Phase 4: Predictive scroll-left prefetch — fetch older candles before user reaches the edge.
        // Subscribes to TradingView's visible range changes and triggers a background fetch
        // when the user scrolls within 2x viewport width of the oldest cached data.
        widget.onChartReady(() => {
          try {
            const chart = widget.chart();
            if (chart?.onVisibleRangeChanged) {
              chart.onVisibleRangeChanged().subscribe(null, (range: { from: number; to: number }) => {
                const oldest = lastGoodCandlesRef.current[0]?.unix_time;
                if (!oldest || !range?.from || !range?.to) return;
                const viewportSpan = range.to - range.from;
                // Trigger prefetch when visible range is within 2x viewport of oldest cached candle
                if (range.from < oldest + viewportSpan * 2) {
                  // Skip if already prefetching or lazy-loading
                  if (predictivePrefetchAbortRef.current || lazyLoadAbortRef.current) return;
                  if (latestParamsRef.current.network === "monad") return;

                  const tokenAddress = latestParamsRef.current.mint || latestParamsRef.current.pairAddress;
                  if (!tokenAddress) return;

                  const res = tvResolutionRef.current;
                  const displayInterval = RESOLUTION_TO_INTERVAL[res] || "1s";
                  const prefetchTf = ["5s", "15s", "30s"].includes(displayInterval) ? "1s" : displayInterval;

                  const abortCtrl = new AbortController();
                  predictivePrefetchAbortRef.current = abortCtrl;
                  const timeout = setTimeout(() => abortCtrl.abort(), 5000);

                  const prefetchUrl = new URL(`${BACKEND_URL}/v1/ohlcv/${tokenAddress}`);
                  prefetchUrl.searchParams.set("timeframe", prefetchTf);
                  prefetchUrl.searchParams.set("to", String(oldest));
                  prefetchUrl.searchParams.set("limit", "1000");

                  fetch(prefetchUrl.toString(), {
                    method: "GET",
                    headers: {
                      accept: "application/json",
                      "X-API-Key": process.env.NEXT_PUBLIC_BACKEND_API_KEY || "test-key",
                    },
                    signal: abortCtrl.signal,
                  })
                    .then((resp) => resp.ok ? resp.json() : null)
                    .then((body) => {
                      clearTimeout(timeout);
                      predictivePrefetchAbortRef.current = null;
                      if (body?.success && Array.isArray(body.candles) && body.candles.length > 0) {
                        const olderItems = body.candles
                          .map((c: any) => ({
                            unix_time: c.time || c.unix_time,
                            o: c.open ?? c.o,
                            h: c.high ?? c.h,
                            l: c.low ?? c.l,
                            c: c.close ?? c.c,
                            v_usd: c.volume ?? c.volume_usd ?? c.v_usd ?? 0,
                          }))
                          .filter((c: any) => c.unix_time < oldest);
                        if (olderItems.length > 0) {
                          lastGoodCandlesRef.current = [...olderItems, ...lastGoodCandlesRef.current];
                          if (CHART_DEBUG) console.log("[AdvancedOHLCChart] Predictive prefetch: cached", olderItems.length, "older candles");
                        }
                      }
                    })
                    .catch(() => {
                      clearTimeout(timeout);
                      predictivePrefetchAbortRef.current = null;
                    });
                }
              });
            }
          } catch {}
        });

        // Add USD/MC toggle button for both Monad and Solana (both have 1B token supply)
        widget.headerReady().then(() => {
          const button = widget.createButton();
          const updateButtonText = (mode: "USD" | "MC") => {
            button.innerHTML =
              mode === "MC"
                ? '<span style="color: #86d99f;">MC</span>/USD'
                : 'MC/<span style="color: #86d99f;">USD</span>';
          };
          updateButtonText(displayMode);
          button.style.cursor = "pointer";
          button.style.padding = "4px 8px";
          button.style.marginLeft = "8px";
          usdMcButtonRef.current = button;

          button.addEventListener("click", () => {
            setDisplayMode((prevMode) => {
              const newMode = prevMode === "MC" ? "USD" : "MC";
              // ✅ CRITICAL: Update ref IMMEDIATELY and SYNCHRONOUSLY before useEffect runs
              displayModeRef.current = newMode;
              if (usdMcButtonRef.current) {
                updateButtonText(newMode);
              }
              return newMode;
            });
            // The useEffect will handle calling resetData() to refresh the chart
          });
        });

        // Force widget to load data after it's ready
        widget.onChartReady(() => {

          try {
            const chart = widget.chart();
            if (chart) {
              // Explicitly set chart type to candlesticks
              chart.setChartType(1); // 1 = Candles, 2 = Hollow Candles, 3 = Bars, etc.

              // For Monad: Set thin candles configuration (right-alignment happens after data loads)
              if (network === "monad") {
                try {
                  // Set thin candles (small barSpacing = thin candles)
                  chart.applyOptions({
                    timeScale: {
                      barSpacing: 2, // Thin candles (lower = thinner, like Solana)
                      minBarSpacing: 1,
                      rightOffset: 12,
                    },
                  });

                } catch (e) {
                }
              }

              // Dev trade markers are now handled automatically by TradingView's marks system

              // Set volume colors to match candle colors
              // Try to set volume study colors programmatically
              try {
                const studies = chart.getAllStudies();
                studies.forEach((study: any) => {
                  if (
                    study &&
                    study.name &&
                    study.name.toLowerCase().includes("volume")
                  ) {
                    // Set volume colors: 0 = down (red), 1 = up (green)
                    study.applyOverrides({
                      "volume.volume.color.0": isMonad ? "#f26682" : "#ef5350", // Red for down candles
                      "volume.volume.color.1": isMonad ? "#86d99f" : "#26a69a", // Green for up candles
                    });
                  }
                });
              } catch (volumeError) {
              }

              // Set watermark with Interstate.so branding
              try {
                const watermarkApi = widget.watermark();
                if (watermarkApi) {
                  const customContentProvider = () => {
                    return [
                      {
                        text: "INTERSTATE.SO",
                        fontSize: 96,
                        lineHeight: 0,
                        vertOffset: 0,
                      },
                    ];
                  };
                  watermarkApi.setContentProvider(customContentProvider);
                  watermarkApi.customVisibility().setValue(true);
                  watermarkApi.color().setValue("rgba(35, 38, 42, 1)");
                }
              } catch (watermarkError) {
              }

              // Track visible range to update timeframe mapping (reduces wrong timeframe requests)
              try {
                chart.onVisibleRangeChanged((range: any) => {
                  // FIX: Don't update timeframe based on visible range
                  // The prop timeframe should always control the API call
                  // Visible range changes are just for zooming/panning within cached data
                });
              } catch (rangeErr) {
              }

              // Trigger resize now that chart is ready
              // Use widget.resize() directly since we have the widget
              if (widgetRef.current?.resize && containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const width = Math.max(0, Math.round(rect.width));
                const height = Math.max(0, Math.round(rect.height));
                if (width && height) {
                  setTimeout(() => {
                    try {
                      widgetRef.current?.resize?.(width, height);
                    } catch (e) {
                    }
                  }, 100);
                }
              }

              // Draw custom price lines - INSTANT if data exists, retry if not
              // No long delays - we want max MC to show immediately
              const syncPriceLinesNow = () => {
                try {
                  const candleData = lastGoodCandlesRef.current;
                  const hasCandles = candleData && candleData.length > 0;
                  const hasApiMaxMc = maxMarketCapFromApiRef.current !== null;

                  // Proceed if we have candle data OR max MC from API
                  // This ensures Max MC line shows as soon as either data source is ready
                  if (!hasCandles && !hasApiMaxMc) {
                    setTimeout(syncPriceLinesNow, 200);
                    return;
                  }

                  const activeChart =
                    widget.activeChart?.() || widget.chart?.();
                  if (
                    activeChart &&
                    typeof activeChart.removeAllShapes === "function"
                  ) {
                    activeChart.removeAllShapes();
                  }
                  priceLineShapesRef.current = {};
                  previewLineShapeIdRef.current = null;
                  previewCreationSeqRef.current++;
                  lastPriceLinesRef.current = {};

                  // ✅ CRITICAL: Reset the same flags that toggle resets
                  // This "unsticks" any blocked state from earlier failed attempts
                  // Without this, syncPriceLines may skip due to in-flight or already-applied checks
                  syncLinesInFlightRef.current = false;
                  lastAppliedLinesRef.current = {};

                  // Compute metrics and sync price lines IMMEDIATELY
                  updateChartMetrics();
                  requestPriceLineSync(0);
                } catch (lineErr) {
                }
              };

              // Start sync immediately - no 800ms delay
              syncPriceLinesNow();

              // Don't force symbol reset - let TradingView call getBars naturally
              // Forcing setSymbol can interleave calls and cause issues
              // If getBars is already firing, forcing a symbol reset can interfere
              // Commented out per TradingView best practices:
              // setTimeout(() => {
              //   const currentSymbol = widget.symbol();
              //   const currentInterval = widget.interval();
              //   widget.setSymbol(currentSymbol, currentInterval, () => {
              //     console.log('[AdvancedOHLCChart] Symbol reset complete');
              //   });
              // }, 1000);

              // Fix: Scroll to real-time after data loads to populate the OHLC legend
              // TradingView's legend shows "O∅ H∅ L∅ C∅" until the chart scrolls to data
              // This triggers the legend to display the latest candle's values on initial load
              setTimeout(() => {
                try {
                  const activeChart =
                    widget.activeChart?.() || widget.chart?.();
                  if (activeChart) {
                    // Scroll to the rightmost (most recent) bar to trigger legend update
                    activeChart.executeActionById?.("timeScaleReset");
                  }
                } catch (e) {
                }
              }, 1500); // Delay to allow data to load first
            }
          } catch (e) {
            console.error(
              "[AdvancedOHLCChart] Error in onChartReady callback:",
              e,
            );
          }
          // Track TradingView native resolution dropdown changes
          try {
            const chart = widget.chart?.();
            if (chart && chart.onIntervalChanged) {
              chart.onIntervalChanged().subscribe(null, (interval: string) => {
                ++lifecycleSeqRef.current;
                const storedEntry = resolutionCallbackMapRef.current.get(interval);

                // TradingView may reuse old subscriber UIDs without calling subscribeBars
                // again (e.g., 1S→30S→1D→1S — TV never unsubscribes 1S and silently
                // reuses its internal subscription). If we have a stored callback for
                // this resolution, restore it so WS bars flow to the correct TV callback.
                if (storedEntry) {
                  activeSubscriberUIDRef.current = storedEntry.subscriberUID;
                  tvResolutionRef.current = interval;
                  // Rebuild the wrapped callback with shift logic
                  subscribedCallbackRef.current = (bar: any) => {
                    if (activeSubscriberUIDRef.current !== storedEntry.subscriberUID) {
                      return; // Another subscribeBars call superseded this
                    }
                    const shift = totalShiftRef.current;
                    try {
                      if (shift > 0) {
                        storedEntry.onRealtimeCallback({ ...bar, time: bar.time - shift });
                      } else {
                        storedEntry.onRealtimeCallback(bar);
                      }
                    } catch (tvErr) {
                      console.error("[AdvancedOHLCChart] Restored callback threw:", String(tvErr));
                    }
                  };
                  // Cancel any pending recovery timer — we have a valid callback
                  if (subscribeBarsRecoveryRef.current) {
                    clearTimeout(subscribeBarsRecoveryRef.current);
                    subscribeBarsRecoveryRef.current = null;
                  }
                }
              });
            }
          } catch (e) {
            console.warn("[AdvancedOHLCChart] Could not register onIntervalChanged:", e);
          }

          syncWidgetWithParams();
        });
      } catch (error: any) {
        console.error(
          "[AdvancedOHLCChart] Failed to initialize widget:",
          error,
        );
        setError(error?.message || "Failed to initialize chart");
        setIsLoading(false);
      }
    };

    setup();

    return () => {
      disposed = true;
      if (widgetRef.current) {
        try {
          widgetRef.current.remove?.();
        } catch (e) {
          console.error(
            "[AdvancedOHLCChart] Error removing widget on cleanup",
            e,
          );
        }
        widgetRef.current = null;
        widgetTokenRef.current = null;
      }
      priceLineShapesRef.current = {};
      previewLineShapeIdRef.current = null;
      previewCreationSeqRef.current++;
      lastPriceLinesRef.current = {};
      if (visibleRangeDebounceRef.current) {
        clearTimeout(visibleRangeDebounceRef.current);
        visibleRangeDebounceRef.current = null;
      }
      if (subscribeBarsRecoveryRef.current) {
        clearTimeout(subscribeBarsRecoveryRef.current);
        subscribeBarsRecoveryRef.current = null;
      }
    };
  }, [libraryLoaded, createDatafeed, initialTokenId, syncWidgetWithParams]);

  useEffect(() => {
    if (!libraryLoaded) return;
    if (!widgetRef.current) return;
    syncWidgetWithParams();
  }, [
    libraryLoaded,
    syncWidgetWithParams,
    mint,
    pairAddress,
    selectedInterval,
    timeframe,
    optimize,
    network,
  ]);

  // Force widget to load data on initialization if we have preloaded data
  useEffect(() => {
    if (!widgetRef.current || !preloadedData || preloadedData.length === 0)
      return;
    // Only apply preloaded data once per token — prevents duplicate resetData() on re-renders
    if (preloadedDataAppliedRef.current) return;
    preloadedDataAppliedRef.current = true;

    // Update the ref so datafeed can use it
    lastGoodCandlesRef.current = preloadedData;
    clampLaunchCandles(lastGoodCandlesRef.current);
    setCandles(lastGoodCandlesRef.current);
    updateChartMetrics();

    // Force widget to refresh and load data — skip if another path already populated the chart
    if (chartPopulatedRef.current) return;
    try {
      widgetRef.current.onChartReady(() => {
        if (chartPopulatedRef.current) return;
        chartPopulatedRef.current = true;
        const chart = widgetRef.current.chart();
        if (chart) {
          // Reset data to trigger getBars call
          chart.resetData();
          requestPriceLineSync(50);

          // Refresh marks if trade data is already available
          if (latestTradeDataRef.current?.length > 0) {
            setTimeout(() => {
              try { widgetRef.current?.chart?.()?.refreshMarks?.(); } catch {}
            }, 500);
          }
        }
      });
    } catch (e) {
      console.error("[AdvancedOHLCChart] Error refreshing chart:", e);
    }
  }, [preloadedData, widgetRef.current]);

  // Marks are automatically updated by TradingView when data changes
  // The getMarks() method in the datafeed handles this automatically

  // Resize function ref - can be called from anywhere
  const resizeChartRef = useRef<(() => void) | null>(null);

  // Simple, robust resize handler - works immediately and when widget is ready
  useEffect(() => {
    if (!containerRef.current) return;

    let rafId: number | null = null;
    let lastWidth = 0;
    let lastHeight = 0;
    let resizeObserver: ResizeObserver | null = null;

    // Resize function - keeps trying until widget is ready
    const resizeChart = () => {
      if (!containerRef.current) return;

      // Use getBoundingClientRect for accurate dimensions (accounts for zoom)
      const rect = containerRef.current.getBoundingClientRect();
      const width = Math.max(0, Math.round(rect.width));
      const height = Math.max(0, Math.round(rect.height));

      // Only resize if dimensions actually changed
      if (width && height && (width !== lastWidth || height !== lastHeight)) {
        lastWidth = width;
        lastHeight = height;

        // Cancel any pending resize
        if (rafId) cancelAnimationFrame(rafId);

        // Resize in next frame
        rafId = requestAnimationFrame(() => {
          // ✅ Use widget.resize() instead of chart.resize()
          if (widgetRef.current?.resize) {
            try {
              widgetRef.current.resize(width, height);
              return;
            } catch (e) {
            }
          }

          // If widget not ready, wait for chart to be ready
          if (widgetRef.current?.onChartReady) {
            try {
              widgetRef.current.onChartReady(() => {
                try {
                  if (widgetRef.current?.resize) {
                    widgetRef.current.resize(width, height);
                  }
                } catch (e) {
                }
              });
            } catch (e) {
            }
          } else {
          }
        });
      }
    };

    // Store resize function in ref so it can be called when widget becomes ready
    resizeChartRef.current = resizeChart;

    // Set up ResizeObserver - this is the main resize detection
    resizeObserver = new ResizeObserver(() => {
      resizeChart();
    });

    resizeObserver.observe(containerRef.current);

    // Also observe parent to catch layout changes
    if (containerRef.current.parentElement) {
      resizeObserver.observe(containerRef.current.parentElement);
    }

    // Also observe the chart wrapper if it exists (for panel resizing)
    const chartWrapper = document.getElementById("chart-container-wrapper");
    if (chartWrapper) {
      resizeObserver.observe(chartWrapper);
    }

    // Listen for window resize (catches zoom changes)
    const handleWindowResize = () => {
      resizeChart();
    };
    window.addEventListener("resize", handleWindowResize, { passive: true });

    // Listen for keyboard zoom
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === "+" || e.key === "-" || e.key === "=")
      ) {
        setTimeout(resizeChart, 100);
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    // Listen for visual viewport changes (mobile zoom)
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", resizeChart, {
        passive: true,
      });
    }

    // Periodic check as backup - ensures resize always works
    // This catches cases where ResizeObserver might miss changes
    const checkInterval = setInterval(() => {
      if (containerRef.current && widgetRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const currentWidth = Math.max(0, Math.round(rect.width));
        const currentHeight = Math.max(0, Math.round(rect.height));

        // If dimensions changed, trigger resize
        if (
          currentWidth &&
          currentHeight &&
          (currentWidth !== lastWidth || currentHeight !== lastHeight)
        ) {
          resizeChart();
        }
      }
    }, 250); // Check every 250ms

    // Initial resize
    resizeChart();

    return () => {
      resizeChartRef.current = null;
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeObserver) resizeObserver.disconnect();
      clearInterval(checkInterval);
      window.removeEventListener("resize", handleWindowResize);
      document.removeEventListener("keydown", handleKeyDown);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", resizeChart);
      }
    };
  }, []); // Set up once on mount

  return (
    <div
      className={`relative ${className}`}
      style={{
        height,
        width,
        zIndex: 1,
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <div
        ref={containerRef}
        className="chart-container relative z-10 h-full min-h-0 w-full min-w-0 bg-[#111214]"
      />

      {isLoading && firstLoadRef.current && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-gray-900/60">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-400" />
            <div className="text-sm text-white">
              Loading OHLC data from backend…
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute bottom-2 left-2 z-40 rounded bg-red-900/90 px-2 py-1 text-xs text-white">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
});

AdvancedOHLCChart.displayName = "AdvancedOHLCChart";

export default AdvancedOHLCChart;
