/**
 * useWalletScan
 *
 * Lightweight REST-only hook for the wallet tracker's scan panel.
 * Fetches summary, positions (open + closed), and trades from the Go token
 * service — the same backend the portfolio page uses, but without opening
 * a dedicated WebSocket per panel.
 *
 * Live-ish updates come from the caller passing `refetchSignal` (typically
 * wired to the wallet-tracker WS trade count for that wallet). On signal
 * change we fire a 2-second trailing-edge debounced refetch so the Go
 * service's indexer has time to aggregate.
 *
 * Performance notes:
 *  - The three endpoints are fired independently (not Promise.all) so each
 *    tab can render as soon as its data is ready. The trades endpoint is
 *    typically the slowest (~6s for limit=500), so positions/summary tabs
 *    paint at ~3s instead of waiting for it.
 *  - A module-level cache makes reopening the same wallet panel instant;
 *    stale entries are still shown while a background refresh runs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getWalletPortfolioSummary,
  getWalletPortfolioPositions,
  getWalletPortfolioTrades,
  type WalletPortfolioPosition,
  type WalletPortfolioSummary,
  type WalletPortfolioTrade,
} from "~/utils/api";

// ─── Adapter types ────────────────────────────────────────────────────────────

/** Matches the AggregatedPosition shape used by WalletScanPanel's render code. */
export interface AggregatedPosition {
  mint: string;
  tokenName: string | null;
  tokenSymbol: string | null;
  imageUrl: string | null;
  launchpadProtocol: string | null;
  boughtAmount: number;
  boughtValue: number;
  soldAmount: number;
  soldValue: number;
  remainingAmount: number;
  remainingValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  pnlPercentage: number;
  isOpen: boolean;
}

/** Matches the ClosedOrder shape used by WalletScanPanel's render code. */
export interface ClosedOrder {
  mint: string;
  tokenName: string | null;
  tokenSymbol: string | null;
  imageUrl: string | null;
  launchpadProtocol: string | null;
  boughtAmount: number;
  soldAmount: number;
  boughtValue: number;
  soldValue: number;
  pnl: number;
  pnlPercentage: number;
  closedAt: number;
}

// ─── Adapter functions ────────────────────────────────────────────────────────

const DUST = 0.001;

export function toAggregatedPosition(
  p: WalletPortfolioPosition,
  solPrice: number,
): AggregatedPosition {
  const boughtUsd =
    p.bought_usd_value > 0 ? p.bought_usd_value : p.bought_sol * solPrice;
  const soldUsd =
    p.sold_usd_value > 0 ? p.sold_usd_value : p.sold_sol * solPrice;
  const realizedPnl =
    p.realized_pnl_usd != null
      ? p.realized_pnl_usd
      : p.realized_pnl_sol * solPrice;

  // Use on-chain balance from RPC if available, otherwise fall back to remaining_tokens
  const rpcBalance = p.on_chain_token_balance ?? p.remaining_tokens;
  const price = p.current_price_usd ?? 0;
  const marketValue = rpcBalance * price;

  // Cost basis of the remaining (unsold) portion using avg-cost pro-rata
  const soldFraction = p.bought_tokens > 0
    ? Math.min(p.sold_tokens / p.bought_tokens, 1)
    : 0;
  const costBasis = boughtUsd * Math.max(0, 1 - soldFraction);

  // Unrealized PnL from RPC: market value of on-chain balance minus cost basis
  const unrealizedPnl = rpcBalance > DUST ? marketValue - costBasis : 0;
  const totalPnl = realizedPnl + unrealizedPnl;
  const pnlPercentage = boughtUsd > 0 ? (totalPnl / boughtUsd) * 100 : 0;

  return {
    mint: p.token_mint,
    tokenName: p.token_name ?? null,
    tokenSymbol: p.token_symbol ?? null,
    imageUrl: p.image_url ?? null,
    launchpadProtocol: p.launchpad_protocol ?? null,
    boughtAmount: p.bought_tokens,
    boughtValue: boughtUsd,
    soldAmount: p.sold_tokens,
    soldValue: soldUsd,
    remainingAmount: rpcBalance,
    remainingValue: marketValue,
    realizedPnl,
    unrealizedPnl,
    totalPnl,
    pnlPercentage,
    isOpen: rpcBalance > DUST,
  };
}

export function toClosedOrder(
  agg: AggregatedPosition,
): ClosedOrder {
  return {
    mint: agg.mint,
    tokenName: agg.tokenName,
    tokenSymbol: agg.tokenSymbol,
    imageUrl: agg.imageUrl,
    launchpadProtocol: agg.launchpadProtocol,
    boughtAmount: agg.boughtAmount,
    soldAmount: agg.soldAmount,
    boughtValue: agg.boughtValue,
    soldValue: agg.soldValue,
    pnl: agg.realizedPnl,
    pnlPercentage: agg.pnlPercentage,
    closedAt: 0, // Will be overridden by caller with last_activity_at
  };
}

/**
 * Convert a Go service WalletPortfolioPosition into a ClosedOrder with proper
 * closedAt timestamp, using the raw position's last_activity_at field.
 */
export function positionToClosedOrder(
  p: WalletPortfolioPosition,
  solPrice: number,
): ClosedOrder {
  const agg = toAggregatedPosition(p, solPrice);
  const closedAt = p.last_activity_at
    ? new Date(p.last_activity_at).getTime()
    : 0;
  return { ...toClosedOrder(agg), closedAt };
}

// ─── Module-level cache ───────────────────────────────────────────────────────
// Survives panel close/reopen and route changes within the same SPA session.
// Fresh entries (<CACHE_FRESH_MS) are served without any network call; stale
// entries are still seeded while a background refresh runs.

const CACHE_FRESH_MS = 30_000;
const TRADES_LIMIT = 100;

interface CacheEntry {
  summary: WalletPortfolioSummary | null;
  positions: WalletPortfolioPosition[];
  trades: WalletPortfolioTrade[];
  summaryTs: number;
  positionsTs: number;
  tradesTs: number;
}

const cache = new Map<string, CacheEntry>();

function getEntry(addr: string): CacheEntry | undefined {
  return cache.get(addr);
}

function setSummary(addr: string, s: WalletPortfolioSummary) {
  const e = cache.get(addr) ?? emptyEntry();
  e.summary = s;
  e.summaryTs = Date.now();
  cache.set(addr, e);
}
function setPositions(addr: string, p: WalletPortfolioPosition[]) {
  const e = cache.get(addr) ?? emptyEntry();
  e.positions = p;
  e.positionsTs = Date.now();
  cache.set(addr, e);
}
function setTrades(addr: string, t: WalletPortfolioTrade[]) {
  const e = cache.get(addr) ?? emptyEntry();
  e.trades = t;
  e.tradesTs = Date.now();
  cache.set(addr, e);
}
function emptyEntry(): CacheEntry {
  return {
    summary: null,
    positions: [],
    trades: [],
    summaryTs: 0,
    positionsTs: 0,
    tradesTs: 0,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseWalletScanOptions {
  /** Incrementing counter (e.g. wallet trade count) that triggers a debounced refetch. */
  refetchSignal?: number;
}

interface UseWalletScanResult {
  summary: WalletPortfolioSummary | null;
  positions: WalletPortfolioPosition[];
  trades: WalletPortfolioTrade[];
  /** True while ANY of the three resources is still loading. Kept for back-compat. */
  loading: boolean;
  /** True while the summary endpoint is loading. */
  summaryLoading: boolean;
  /** True while the positions endpoint is loading. Drives Active Positions / History / Top 100 tabs. */
  positionsLoading: boolean;
  /** True while the trades endpoint is loading. Drives the Activity tab. */
  tradesLoading: boolean;
  error: string | null;
}

export function useWalletScan(
  walletAddress: string | null | undefined,
  opts?: UseWalletScanOptions,
): UseWalletScanResult {
  const address = useMemo(() => {
    if (!walletAddress) return "";
    const v = walletAddress.trim();
    return v.length >= 32 && v.length <= 44 ? v : "";
  }, [walletAddress]);

  // Seed initial state from cache so reopening a wallet panel is instant.
  const initialEntry = address ? getEntry(address) : undefined;

  const [summary, setSummaryState] = useState<WalletPortfolioSummary | null>(
    initialEntry?.summary ?? null,
  );
  const [positions, setPositionsState] = useState<WalletPortfolioPosition[]>(
    initialEntry?.positions ?? [],
  );
  const [trades, setTradesState] = useState<WalletPortfolioTrade[]>(
    initialEntry?.trades ?? [],
  );

  // Per-resource loading flags. If we have a fresh-enough cached value, start
  // with that resource not-loading so its tab paints immediately.
  const now = Date.now();
  const seededSummaryFresh =
    !!initialEntry?.summary && now - initialEntry.summaryTs < CACHE_FRESH_MS;
  const seededPositionsFresh =
    !!initialEntry && initialEntry.positionsTs > 0 &&
    now - initialEntry.positionsTs < CACHE_FRESH_MS;
  const seededTradesFresh =
    !!initialEntry && initialEntry.tradesTs > 0 &&
    now - initialEntry.tradesTs < CACHE_FRESH_MS;

  const [summaryLoading, setSummaryLoading] = useState(
    !!address && !seededSummaryFresh,
  );
  const [positionsLoading, setPositionsLoading] = useState(
    !!address && !seededPositionsFresh,
  );
  const [tradesLoading, setTradesLoading] = useState(
    !!address && !seededTradesFresh,
  );

  const [error, setError] = useState<string | null>(null);

  const inflightRef = useRef<AbortController | null>(null);
  const refetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async (): Promise<void> => {
    if (!address) return;
    inflightRef.current?.abort();
    const ac = new AbortController();
    inflightRef.current = ac;
    setError(null);
    setSummaryLoading(true);
    setPositionsLoading(true);
    setTradesLoading(true);

    const onErr = (e: unknown) => {
      if ((e as { name?: string })?.name === "AbortError") return;
      setError(prev => prev ?? (e instanceof Error ? e.message : "Failed to load wallet"));
    };

    // Fire all three in parallel but resolve each independently so a slow
    // trades request doesn't block the positions/summary tabs.
    void getWalletPortfolioSummary(address, ac.signal)
      .then((s) => {
        if (ac.signal.aborted) return;
        setSummary(address, s);
        setSummaryState(s);
      })
      .catch(onErr)
      .finally(() => {
        if (!ac.signal.aborted) setSummaryLoading(false);
      });

    void getWalletPortfolioPositions(address, {
      includeClosed: true,
      signal: ac.signal,
    })
      .then((p) => {
        if (ac.signal.aborted) return;
        setPositions(address, p.positions);
        setPositionsState(p.positions);
      })
      .catch(onErr)
      .finally(() => {
        if (!ac.signal.aborted) setPositionsLoading(false);
      });

    void getWalletPortfolioTrades(address, {
      limit: TRADES_LIMIT,
      signal: ac.signal,
    })
      .then((t) => {
        if (ac.signal.aborted) return;
        setTrades(address, t.trades);
        setTradesState(t.trades);
      })
      .catch(onErr)
      .finally(() => {
        if (!ac.signal.aborted) setTradesLoading(false);
      });
  }, [address]);

  // Reset state + initial fetch on address change.
  useEffect(() => {
    inflightRef.current?.abort();
    inflightRef.current = null;
    if (refetchDebounceRef.current) {
      clearTimeout(refetchDebounceRef.current);
      refetchDebounceRef.current = null;
    }

    if (!address) {
      setSummaryState(null);
      setPositionsState([]);
      setTradesState([]);
      setSummaryLoading(false);
      setPositionsLoading(false);
      setTradesLoading(false);
      setError(null);
      return;
    }

    // Seed from cache for instant paint, then refresh anything stale in the
    // background. If a resource is fresh we skip its request entirely.
    const entry = getEntry(address);
    if (entry) {
      if (entry.summary) setSummaryState(entry.summary);
      setPositionsState(entry.positions);
      setTradesState(entry.trades);
    } else {
      setSummaryState(null);
      setPositionsState([]);
      setTradesState([]);
    }
    setError(null);

    const t = Date.now();
    const summaryFresh =
      !!entry?.summary && t - entry.summaryTs < CACHE_FRESH_MS;
    const positionsFresh =
      !!entry && entry.positionsTs > 0 && t - entry.positionsTs < CACHE_FRESH_MS;
    const tradesFresh =
      !!entry && entry.tradesTs > 0 && t - entry.tradesTs < CACHE_FRESH_MS;

    if (summaryFresh && positionsFresh && tradesFresh) {
      setSummaryLoading(false);
      setPositionsLoading(false);
      setTradesLoading(false);
      return;
    }

    const ac = new AbortController();
    inflightRef.current = ac;

    const onErr = (e: unknown) => {
      if ((e as { name?: string })?.name === "AbortError") return;
      setError(prev => prev ?? (e instanceof Error ? e.message : "Failed to load wallet"));
    };

    if (!summaryFresh) {
      setSummaryLoading(true);
      void getWalletPortfolioSummary(address, ac.signal)
        .then((s) => {
          if (ac.signal.aborted) return;
          setSummary(address, s);
          setSummaryState(s);
        })
        .catch(onErr)
        .finally(() => {
          if (!ac.signal.aborted) setSummaryLoading(false);
        });
    } else {
      setSummaryLoading(false);
    }

    if (!positionsFresh) {
      setPositionsLoading(true);
      void getWalletPortfolioPositions(address, {
        includeClosed: true,
        signal: ac.signal,
      })
        .then((p) => {
          if (ac.signal.aborted) return;
          setPositions(address, p.positions);
          setPositionsState(p.positions);
        })
        .catch(onErr)
        .finally(() => {
          if (!ac.signal.aborted) setPositionsLoading(false);
        });
    } else {
      setPositionsLoading(false);
    }

    if (!tradesFresh) {
      setTradesLoading(true);
      void getWalletPortfolioTrades(address, {
        limit: TRADES_LIMIT,
        signal: ac.signal,
      })
        .then((tr) => {
          if (ac.signal.aborted) return;
          setTrades(address, tr.trades);
          setTradesState(tr.trades);
        })
        .catch(onErr)
        .finally(() => {
          if (!ac.signal.aborted) setTradesLoading(false);
        });
    } else {
      setTradesLoading(false);
    }

    return () => {
      ac.abort();
    };
  }, [address]);

  // Trailing-edge debounced refetch on signal change (e.g. new trade from WS).
  const signalRef = useRef(opts?.refetchSignal ?? 0);
  useEffect(() => {
    const signal = opts?.refetchSignal ?? 0;
    if (signal === signalRef.current) return;
    signalRef.current = signal;
    if (!address) return;

    if (refetchDebounceRef.current) {
      clearTimeout(refetchDebounceRef.current);
    }
    refetchDebounceRef.current = setTimeout(() => {
      refetchDebounceRef.current = null;
      void fetchAll();
    }, 2000);
  }, [opts?.refetchSignal, address, fetchAll]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      inflightRef.current?.abort();
      if (refetchDebounceRef.current) {
        clearTimeout(refetchDebounceRef.current);
      }
    };
  }, []);

  const loading = summaryLoading || positionsLoading || tradesLoading;

  return {
    summary,
    positions,
    trades,
    loading,
    summaryLoading,
    positionsLoading,
    tradesLoading,
    error,
  };
}
