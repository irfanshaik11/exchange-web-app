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

/** Dust threshold used by the resurrection guard. Kept in sync with DUST. */
const DUST_TOKENS = 0.001;

/**
 * How long to suppress a "just closed" mint's re-appearance from the API.
 * Sized for the Go service's L2 Redis cache TTL (~5s) plus a safety margin.
 *
 * NOTE: a genuine re-buy of the same mint within this window will be hidden
 * until the guard expires. This is an explicit tradeoff: the stale L2 cache
 * causes "100% sell → position resurrects for 2-5s" on every close, which
 * happens to every user; same-mint re-buys within 15s are rare degen flows.
 * Don't widen this without re-evaluating that tradeoff.
 */
const CLOSED_MINT_GUARD_MS = 15_000;

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
  const soldFraction =
    p.bought_tokens > 0 ? Math.min(p.sold_tokens / p.bought_tokens, 1) : 0;
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

export function toClosedOrder(agg: AggregatedPosition): ClosedOrder {
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
  /** True when the address is an EVM/Monad (0x…) wallet the Go service doesn't support. */
  isUnsupportedChain: boolean;
}

/**
 * EVM addresses (Ethereum / Monad / etc.) are 40 hex chars prefixed with `0x`.
 * The Go token service validates wallet addresses with a Solana base58 regex,
 * which rejects any address containing `0` (not in base58) — so calling it
 * with a `0x…` would return 400 and the panel would render an error state.
 * Detect here and short-circuit so the panel can show a clean "coming soon".
 */
function isEvmAddress(addr: string): boolean {
  if (!addr) return false;
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

export function useWalletScan(
  walletAddress: string | null | undefined,
  opts?: UseWalletScanOptions,
): UseWalletScanResult {
  const unsupportedChain = useMemo(() => {
    if (!walletAddress) return false;
    return isEvmAddress(walletAddress.trim());
  }, [walletAddress]);

  const address = useMemo(() => {
    if (!walletAddress) return "";
    const v = walletAddress.trim();
    if (isEvmAddress(v)) return ""; // skip Go service for EVM addresses
    return v.length >= 32 && v.length <= 44 ? v : "";
  }, [walletAddress]);

  const [summary, setSummary] = useState<WalletPortfolioSummary | null>(null);
  const [positions, setPositions] = useState<WalletPortfolioPosition[]>([]);
  const [trades, setTrades] = useState<WalletPortfolioTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inflightRef = useRef<AbortController | null>(null);
  const refetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stale-resurrection guard (REST-only flavour).
  //
  // useWalletPortfolio drives this off WS sell events. We don't have a WS,
  // but the same Go service L2 Redis cache (~5s TTL) can serve a pre-sell
  // snapshot on a subsequent refetch after the indexer aggregator has already
  // emitted remaining=0. Effect: a mint closes in one fetch, then "resurrects"
  // open in the next, then closes again. To avoid the visual flicker we mark
  // any mint that just transitioned open → closed in our fetch stream and
  // reject any subsequent fetch row that shows it open again, until the
  // guard window expires (see CLOSED_MINT_GUARD_MS).
  const closedMintsRef = useRef<Map<string, number>>(new Map()); // mint -> expiresAt (ms)
  const prevOpenMintsRef = useRef<Set<string>>(new Set());

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

      const now = Date.now();

      // Sweep expired guards (avoids unbounded growth).
      for (const [mint, expiresAt] of closedMintsRef.current) {
        if (now >= expiresAt) closedMintsRef.current.delete(mint);
      }

      // Detect mints that just transitioned open → closed (or disappeared) in
      // this fetch. Mark them so a later stale L2 response can't resurrect them.
      // Defensive: skip mints already in the guard map so a re-detection can't
      // accidentally extend an existing window.
      const currentOpenMints = new Set(
        p.positions
          .filter((pos) => pos.remaining_tokens > DUST_TOKENS)
          .map((pos) => pos.token_mint),
      );
      for (const mint of prevOpenMintsRef.current) {
        if (!currentOpenMints.has(mint) && !closedMintsRef.current.has(mint)) {
          closedMintsRef.current.set(mint, now + CLOSED_MINT_GUARD_MS);
        }
      }

      // Filter: only drop rows that claim a guarded mint is OPEN again.
      // Genuine closed rows (remaining ≤ DUST) pass through so the History
      // tab and closed-orders math stay correct.
      const guardedPositions =
        closedMintsRef.current.size === 0
          ? p.positions
          : p.positions.filter((pos) => {
              const expiresAt = closedMintsRef.current.get(pos.token_mint);
              if (!expiresAt) return true;
              if (now >= expiresAt) return true;
              return pos.remaining_tokens <= DUST_TOKENS;
            });

      // Update the "previously open" snapshot from the GUARDED result so that
      // a resurrection row we just dropped doesn't get back in via the next
      // iteration's open-set comparison.
      prevOpenMintsRef.current = new Set(
        guardedPositions
          .filter((pos) => pos.remaining_tokens > DUST_TOKENS)
          .map((pos) => pos.token_mint),
      );

      setSummary(s);
      setPositions(guardedPositions);
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
    // Resurrection-guard state is per-wallet; clear it so wallet B never
    // inherits wallet A's just-closed mints.
    closedMintsRef.current.clear();
    prevOpenMintsRef.current.clear();
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

  return {
    summary,
    positions,
    trades,
    loading,
    error,
    isUnsupportedChain: unsupportedChain,
  };
}
