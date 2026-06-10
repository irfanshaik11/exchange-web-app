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
  // The Go service typed `realized_pnl_usd: number` (never null) but
  // currently always returns 0 — see wallet-scan-pnl-backend-gap. A
  // `!= null` check would always be truthy, silently zeroing every
  // per-position PnL row. Use `!== 0` to fall back to the SOL value
  // (the only field the backend actually populates).
  const realizedPnl =
    p.realized_pnl_usd !== 0
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

/**
 * Defensive sanity cap for backend PnL numbers.
 *
 * The Go aggregator's realized-PnL formula has historically produced absurd
 * values (e.g. -$17.6 trillion) when a wallet has a dust `bought_tokens`
 * value being divided into a large `sold_tokens`. The backend has its own
 * clamp now (see exchange-token-service/internal/repo/pg/wallet_queries.go
 * — `LEAST(sold_tokens, bought_tokens)`), but we keep this client-side
 * guard as defense-in-depth: any future backend regression that produces a
 * >1M SOL or non-finite PnL value will render "—" instead of garbage.
 *
 * Thresholds: 1M SOL ≈ $200M+ in any realistic scenario, so anything beyond
 * that is contamination, not a real trader.
 */
const ABSURD_SOL_THRESHOLD = 1_000_000;
const ABSURD_USD_THRESHOLD = 1_000_000_000; // $1B

function sanitizeSummary(
  s: WalletPortfolioSummary,
): WalletPortfolioSummary {
  const guarded = { ...s };
  if (
    !Number.isFinite(guarded.total_realized_pnl_sol) ||
    Math.abs(guarded.total_realized_pnl_sol) > ABSURD_SOL_THRESHOLD
  ) {
    console.warn(
      "[useWalletScan] absurd total_realized_pnl_sol — clamping to 0",
      { wallet: s.wallet_address, raw: s.total_realized_pnl_sol },
    );
    guarded.total_realized_pnl_sol = 0;
  }
  if (
    !Number.isFinite(guarded.total_realized_pnl_usd) ||
    Math.abs(guarded.total_realized_pnl_usd) > ABSURD_USD_THRESHOLD
  ) {
    console.warn(
      "[useWalletScan] absurd total_realized_pnl_usd — clamping to 0",
      { wallet: s.wallet_address, raw: s.total_realized_pnl_usd },
    );
    guarded.total_realized_pnl_usd = 0;
  }
  return guarded;
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
    !!initialEntry &&
    initialEntry.positionsTs > 0 &&
    now - initialEntry.positionsTs < CACHE_FRESH_MS;
  const seededTradesFresh =
    !!initialEntry &&
    initialEntry.tradesTs > 0 &&
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
  //
  // The guard MUST run on every path that writes positions to React state —
  // including cache seeds — otherwise a stale cache entry painted on panel
  // reopen would show a since-closed position as open with no fetch firing
  // to re-engage the guard.
  const closedMintsRef = useRef<Map<string, number>>(new Map()); // mint -> expiresAt (ms)
  const prevOpenMintsRef = useRef<Set<string>>(new Set());

  /**
   * Apply the resurrection guard to a positions array and update the rolling
   * ref state. Pure with respect to its inputs — call from any path that
   * paints positions (fresh fetch, cached seed, initial useState).
   */
  const applyResurrectionGuard = useCallback(
    (rawPositions: WalletPortfolioPosition[]): WalletPortfolioPosition[] => {
      const now = Date.now();

      // Sweep expired guards (avoids unbounded growth).
      for (const [mint, expiresAt] of closedMintsRef.current) {
        if (now >= expiresAt) closedMintsRef.current.delete(mint);
      }

      // Detect mints that just transitioned open → closed (or disappeared).
      // Defensive: skip mints already guarded so a re-detection can't
      // accidentally extend an existing window.
      const currentOpenMints = new Set(
        rawPositions
          .filter((pos) => pos.remaining_tokens > DUST_TOKENS)
          .map((pos) => pos.token_mint),
      );
      for (const mint of prevOpenMintsRef.current) {
        if (!currentOpenMints.has(mint) && !closedMintsRef.current.has(mint)) {
          closedMintsRef.current.set(mint, now + CLOSED_MINT_GUARD_MS);
        }
      }

      // Filter: only drop rows that claim a guarded mint is OPEN again.
      // Genuine closed rows (remaining ≤ DUST) pass through.
      const guarded =
        closedMintsRef.current.size === 0
          ? rawPositions
          : rawPositions.filter((pos) => {
              const expiresAt = closedMintsRef.current.get(pos.token_mint);
              if (!expiresAt) return true;
              if (now >= expiresAt) return true;
              return pos.remaining_tokens <= DUST_TOKENS;
            });

      // Update the "previously open" snapshot from the GUARDED result so a
      // resurrection row we just dropped doesn't get back in via the next
      // iteration's open-set comparison.
      prevOpenMintsRef.current = new Set(
        guarded
          .filter((pos) => pos.remaining_tokens > DUST_TOKENS)
          .map((pos) => pos.token_mint),
      );

      return guarded;
    },
    [],
  );

  const fetchAll = useCallback(async (): Promise<void> => {
    if (!address) return;
    inflightRef.current?.abort();
    const ac = new AbortController();
    inflightRef.current = ac;

    // Background-refetch awareness: when we already have data for a resource,
    // suppress the loading spinner (paint the new data when it arrives) and
    // swallow transient errors (don't clobber the user's view — the next WS
    // signal will retry). The "Failed to fetch" wall in the Activity/History
    // tabs was previously caused by a single flaky refetch overwriting a
    // perfectly good state.
    const entry = cache.get(address);
    const haveSummary = !!entry?.summary;
    const havePositions = !!entry && entry.positionsTs > 0;
    const haveTrades = !!entry && entry.tradesTs > 0;
    const haveAnyData = haveSummary || havePositions || haveTrades;

    if (!haveAnyData) setError(null);
    if (!haveSummary) setSummaryLoading(true);
    if (!havePositions) setPositionsLoading(true);
    if (!haveTrades) setTradesLoading(true);

    const onErr = (e: unknown) => {
      if ((e as { name?: string })?.name === "AbortError") return;
      // Some browsers surface a fetch abort as TypeError("Failed to fetch")
      // instead of AbortError. If our controller has been aborted, treat it
      // the same as AbortError.
      if (ac.signal.aborted) return;
      const message =
        e instanceof Error ? e.message : "Failed to load wallet";
      if (haveAnyData) {
        // Background refetch failure — keep the user's view intact.
        console.warn(
          "[useWalletScan] background refetch failed, keeping cached data:",
          message,
        );
        return;
      }
      setError((prev) => prev ?? message);
    };

    // Fire all three in parallel but resolve each independently so a slow
    // trades request doesn't block the positions/summary tabs.
    void getWalletPortfolioSummary(address, ac.signal)
      .then((s) => {
        if (ac.signal.aborted) return;
        const safe = sanitizeSummary(s);
        setSummary(address, safe);
        setSummaryState(safe);
        setError(null);
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
        const guarded = applyResurrectionGuard(p.positions);
        setPositions(address, guarded);
        setPositionsState(guarded);
        setError(null);
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
        setError(null);
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
    // Resurrection-guard state is per-wallet; clear it so wallet B never
    // inherits wallet A's just-closed mints.
    closedMintsRef.current.clear();
    prevOpenMintsRef.current.clear();

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
    // Cached positions MUST go through the resurrection guard — otherwise a
    // stale "still open" snapshot from a position the user has since sold
    // would paint on reopen and stay visible for the entire freshness window
    // (no fetch would fire to engage the guard).
    const entry = getEntry(address);
    if (entry) {
      if (entry.summary) setSummaryState(entry.summary);
      const guardedCached = applyResurrectionGuard(entry.positions);
      setPositionsState(guardedCached);
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
      !!entry &&
      entry.positionsTs > 0 &&
      t - entry.positionsTs < CACHE_FRESH_MS;
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

    // Mirrors fetchAll: if we've seeded any state from a stale cache entry,
    // a single endpoint failure shouldn't blow away the user's view.
    const haveAnyData =
      !!entry?.summary ||
      (entry?.positions?.length ?? 0) > 0 ||
      (entry?.trades?.length ?? 0) > 0;

    const onErr = (e: unknown) => {
      if ((e as { name?: string })?.name === "AbortError") return;
      if (ac.signal.aborted) return;
      const message =
        e instanceof Error ? e.message : "Failed to load wallet";
      if (haveAnyData) {
        console.warn(
          "[useWalletScan] stale-cache refresh failed, keeping seeded data:",
          message,
        );
        return;
      }
      setError((prev) => prev ?? message);
    };

    if (!summaryFresh) {
      // Only show the loading spinner when we have no seeded data to paint.
      // Stale-seeded data refreshes in the background without disrupting UI.
      setSummaryLoading(!entry?.summary);
      void getWalletPortfolioSummary(address, ac.signal)
        .then((s) => {
          if (ac.signal.aborted) return;
          const safe = sanitizeSummary(s);
          setSummary(address, safe);
          setSummaryState(safe);
          setError(null);
        })
        .catch(onErr)
        .finally(() => {
          if (!ac.signal.aborted) setSummaryLoading(false);
        });
    } else {
      setSummaryLoading(false);
    }

    if (!positionsFresh) {
      setPositionsLoading(!entry || entry.positions.length === 0);
      void getWalletPortfolioPositions(address, {
        includeClosed: true,
        signal: ac.signal,
      })
        .then((p) => {
          if (ac.signal.aborted) return;
          const guarded = applyResurrectionGuard(p.positions);
          setPositions(address, guarded);
          setPositionsState(guarded);
          setError(null);
        })
        .catch(onErr)
        .finally(() => {
          if (!ac.signal.aborted) setPositionsLoading(false);
        });
    } else {
      setPositionsLoading(false);
    }

    if (!tradesFresh) {
      setTradesLoading(!entry || entry.trades.length === 0);
      void getWalletPortfolioTrades(address, {
        limit: TRADES_LIMIT,
        signal: ac.signal,
      })
        .then((tr) => {
          if (ac.signal.aborted) return;
          setTrades(address, tr.trades);
          setTradesState(tr.trades);
          setError(null);
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
    isUnsupportedChain: unsupportedChain,
  };
}
