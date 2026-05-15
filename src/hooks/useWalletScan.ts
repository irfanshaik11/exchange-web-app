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

  // Cost basis of the remaining (unsold) portion. This is what the user paid
  // for tokens they still hold — NOT market value. Uses avg-cost pro-rata:
  // if you sold 60% of tokens, remaining cost basis = 40% of total bought USD.
  const soldFraction = p.bought_tokens > 0
    ? Math.min(p.sold_tokens / p.bought_tokens, 1)
    : 0;
  const remainingValue = boughtUsd * Math.max(0, 1 - soldFraction);

  // Market value of remaining tokens (from Go service: remaining_tokens * current_price_usd)
  const remainingMarketValue = p.remaining_value_usd || 0;

  // Unrealized PnL: prefer the Go service's pre-computed value to avoid
  // cost-basis drift (airdrops, transfers-in, missing bought_usd_value).
  // Only fall back to manual calc when the Go service genuinely didn't supply
  // a value AND we have a valid remaining market value to compare against.
  const unrealizedPnl = p.unrealized_pnl_usd != null
    ? p.unrealized_pnl_usd
    : remainingMarketValue > 0
      ? remainingMarketValue - remainingValue
      : 0;
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
    remainingAmount: p.remaining_tokens,
    remainingValue,
    realizedPnl,
    unrealizedPnl,
    totalPnl,
    pnlPercentage,
    isOpen: p.remaining_tokens > DUST,
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseWalletScanOptions {
  /** Incrementing counter (e.g. wallet trade count) that triggers a debounced refetch. */
  refetchSignal?: number;
}

interface UseWalletScanResult {
  summary: WalletPortfolioSummary | null;
  positions: WalletPortfolioPosition[];
  trades: WalletPortfolioTrade[];
  loading: boolean;
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

  const [summary, setSummary] = useState<WalletPortfolioSummary | null>(null);
  const [positions, setPositions] = useState<WalletPortfolioPosition[]>([]);
  const [trades, setTrades] = useState<WalletPortfolioTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inflightRef = useRef<AbortController | null>(null);
  const refetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async (): Promise<void> => {
    if (!address) return;
    inflightRef.current?.abort();
    const ac = new AbortController();
    inflightRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const [s, p, t] = await Promise.all([
        getWalletPortfolioSummary(address, ac.signal),
        getWalletPortfolioPositions(address, {
          includeClosed: true,
          signal: ac.signal,
        }),
        getWalletPortfolioTrades(address, { limit: 500, signal: ac.signal }),
      ]);
      if (ac.signal.aborted) return;
      setSummary(s);
      setPositions(p.positions);
      setTrades(t.trades);
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Failed to load wallet");
      }
    } finally {
      if (inflightRef.current === ac) {
        inflightRef.current = null;
        setLoading(false);
      }
    }
  }, [address]);

  // Reset state + initial fetch on address change.
  useEffect(() => {
    inflightRef.current?.abort();
    inflightRef.current = null;
    if (refetchDebounceRef.current) {
      clearTimeout(refetchDebounceRef.current);
      refetchDebounceRef.current = null;
    }
    setSummary(null);
    setPositions([]);
    setTrades([]);
    setError(null);
    if (!address) {
      setLoading(false);
      return;
    }
    void fetchAll();
    return () => {
      inflightRef.current?.abort();
    };
  }, [address, fetchAll]);

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

  return { summary, positions, trades, loading, error };
}
