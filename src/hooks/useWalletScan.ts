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
  // Cost-basis priority chain — same as the portfolio page enrichment
  // (portfolio.tsx ~line 653). The chain endpoint returns *_usd_value as 0,
  // so the SOL-based fallbacks are the real path:
  //   1. bought_usd_value (backend-stamped USD; rarely populated today)
  //   2. cost_basis_sol — outflow minus recoverable ATA rent (migration-024,
  //      matches Axiom/GMGN economics). Prefer when > 0.
  //   3. total_outflow_sol — raw outflow incl. rent (migration-023).
  //   4. bought_sol — swap-only; understates real cost on small trades.
  const costBasisSol = p.cost_basis_sol ?? 0;
  const totalOutflowSol = p.total_outflow_sol ?? 0;
  const boughtUsd =
    p.bought_usd_value > 0
      ? p.bought_usd_value
      : costBasisSol > 0
        ? costBasisSol * solPrice
        : totalOutflowSol > 0
          ? totalOutflowSol * solPrice
          : p.bought_sol * solPrice;
  const soldUsd =
    p.sold_usd_value > 0 ? p.sold_usd_value : p.sold_sol * solPrice;
  // NB: the Go service serializes realized_pnl_usd as 0 (never null) — its USD
  // stamping isn't implemented. A `!= null` check here made every History row
  // show +$0; treat 0 as "missing" and derive from the SOL figure, same as the
  // portfolio page's enrichment does.
  const realizedPnl =
    p.realized_pnl_usd != null && p.realized_pnl_usd !== 0
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

// ─── localStorage persistence (stale-while-revalidate across reloads) ────────
// Whale wallets take 15-60s server-side on first load; once paid, that result
// should survive a page reload. Stale entries paint instantly while the
// background refresh runs. Rows are capped per wallet to respect the ~5MB
// localStorage quota; freshest wallets win.
const PERSIST_KEY = "__wscan_cache_v1";
const PERSIST_TTL_MS = 24 * 60 * 60 * 1000;
const PERSIST_MAX_WALLETS = 10;
const PERSIST_MAX_POSITIONS = 200;
const PERSIST_MAX_TRADES = 100;

if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) {
      const now = Date.now();
      const entries: [string, CacheEntry][] = JSON.parse(raw);
      for (const [addr, e] of entries) {
        const newest = Math.max(e.summaryTs, e.positionsTs, e.tradesTs);
        if (now - newest > PERSIST_TTL_MS) continue;
        cache.set(addr, e);
      }
    }
  } catch {
    /* corrupted cache — start clean */
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (typeof window === "undefined" || persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const entries = [...cache.entries()]
        .sort(
          (a, b) =>
            Math.max(b[1].summaryTs, b[1].positionsTs, b[1].tradesTs) -
            Math.max(a[1].summaryTs, a[1].positionsTs, a[1].tradesTs),
        )
        .slice(0, PERSIST_MAX_WALLETS)
        .map(([addr, e]) => [
          addr,
          {
            ...e,
            positions: e.positions.slice(0, PERSIST_MAX_POSITIONS),
            trades: e.trades.slice(0, PERSIST_MAX_TRADES),
          },
        ]);
      localStorage.setItem(PERSIST_KEY, JSON.stringify(entries));
    } catch {
      /* quota exceeded — drop persistence silently, in-memory cache still works */
    }
  }, 2000);
}

function getEntry(addr: string): CacheEntry | undefined {
  return cache.get(addr);
}

function setSummary(addr: string, s: WalletPortfolioSummary) {
  const e = cache.get(addr) ?? emptyEntry();
  e.summary = s;
  e.summaryTs = Date.now();
  cache.set(addr, e);
  schedulePersist();
}
function setPositions(addr: string, p: WalletPortfolioPosition[]) {
  const e = cache.get(addr) ?? emptyEntry();
  e.positions = p;
  e.positionsTs = Date.now();
  cache.set(addr, e);
  schedulePersist();
}
function setTrades(addr: string, t: WalletPortfolioTrade[]) {
  const e = cache.get(addr) ?? emptyEntry();
  e.trades = t;
  e.tradesTs = Date.now();
  cache.set(addr, e);
  schedulePersist();
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

// In-flight prefetch dedupe — at most one background warm per wallet at a time.
const prefetchInFlight = new Set<string>();

/**
 * Background-warm the scan cache for a wallet (call on tracker-row hover or
 * idle). Fetches only stale resources, writes into the module cache (and so
 * into localStorage), never throws. By the time the user opens the scan panel
 * the data paints instantly — this is the cheapest "preload everything" lever
 * because the server result is shared via its own 5s cache too.
 */
export async function prefetchWalletScan(address: string): Promise<void> {
  if (!address || typeof window === "undefined") return;
  if (isEvmAddress(address)) return;
  if (prefetchInFlight.has(address)) return;

  const e = getEntry(address);
  const t = Date.now();
  const needSummary = !e?.summary || t - e.summaryTs > CACHE_FRESH_MS;
  const needPositions =
    !e || e.positionsTs === 0 || t - e.positionsTs > CACHE_FRESH_MS;
  const needTrades = !e || e.tradesTs === 0 || t - e.tradesTs > CACHE_FRESH_MS;
  if (!needSummary && !needPositions && !needTrades) return;

  prefetchInFlight.add(address);
  const jobs: Promise<unknown>[] = [];
  if (needSummary) {
    jobs.push(
      getWalletPortfolioSummary(address)
        .then((s) => setSummary(address, sanitizeSummary(s)))
        .catch(() => {}),
    );
  }
  if (needPositions) {
    jobs.push(
      getWalletPortfolioPositions(address, { includeClosed: true })
        .then((p) => {
          setPositions(address, p.positions);
          // Warm the avatars for the rows the panel paints first, so by the
          // time the user clicks, images render instantly from cache.
          void import("~/utils/scanImageResolver").then(
            ({ resolveScanImage }) => {
              for (const pos of p.positions.slice(0, 30)) {
                void resolveScanImage(
                  pos.token_mint,
                  pos.image_url ?? null,
                  pos.uri ?? null,
                );
              }
            },
          );
        })
        .catch(() => {}),
    );
  }
  if (needTrades) {
    jobs.push(
      getWalletPortfolioTrades(address, { limit: TRADES_LIMIT })
        .then((tr) => setTrades(address, tr.trades))
        .catch(() => {}),
    );
  }
  try {
    await Promise.allSettled(jobs);
  } finally {
    prefetchInFlight.delete(address);
  }
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
  /** True when the server timed out the trade aggregation (heavy wallet) and
   * served chain-holdings only — History/PnL data absent until a full response. */
  positionsDegraded: boolean;
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

  // Per-resource loading flags. Stale-while-revalidate: a resource counts as
  // "loading" ONLY when there is no cached value to show at all. If we have ANY
  // cached data — even stale — we paint it immediately and refresh in the
  // background, so the user never stares at a "Loading…" spinner on a wallet
  // they (or a hover/click prefetch) have opened before.
  const seededSummaryAny = !!initialEntry?.summary;
  const seededPositionsAny =
    !!initialEntry && initialEntry.positionsTs > 0;
  const seededTradesAny = !!initialEntry && initialEntry.tradesTs > 0;

  const [summaryLoading, setSummaryLoading] = useState(
    !!address && !seededSummaryAny,
  );
  const [positionsLoading, setPositionsLoading] = useState(
    !!address && !seededPositionsAny,
  );
  const [positionsDegraded, setPositionsDegraded] = useState(false);
  const [tradesLoading, setTradesLoading] = useState(
    !!address && !seededTradesAny,
  );

  const [error, setError] = useState<string | null>(null);

  const inflightRef = useRef<AbortController | null>(null);
  const refetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whale-wallet refetch coalescing: while a (potentially 15-60s) fetch is in
  // flight, refetch signals queue a single trailing run instead of aborting it.
  const fetchInFlightRef = useRef(false);
  const pendingRefetchRef = useRef(false);

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

  const fetchAll = useCallback(async (fresh = false): Promise<void> => {
    if (!address) return;
    // A positions query for a whale wallet runs 15-60s server-side. Aborting
    // and restarting it on every refetch signal — and live trades arrive
    // constantly for exactly those wallets — means it NEVER completes: the
    // panel sits on "Loading positions..." forever. Coalesce instead: let the
    // in-flight request finish, then run a single trailing refetch.
    if (fetchInFlightRef.current) {
      pendingRefetchRef.current = true;
      return;
    }
    fetchInFlightRef.current = true;
    const ac = new AbortController();
    inflightRef.current = ac;
    setError(null);
    setSummaryLoading(true);
    setPositionsLoading(true);
    setTradesLoading(true);

    const onErr = (e: unknown) => {
      if ((e as { name?: string })?.name === "AbortError") return;
      setError(
        (prev) =>
          prev ?? (e instanceof Error ? e.message : "Failed to load wallet"),
      );
    };

    // Fire all three in parallel but resolve each independently so a slow
    // trades request doesn't block the positions/summary tabs.
    const summaryP = getWalletPortfolioSummary(address, ac.signal)
      .then((s) => {
        if (ac.signal.aborted) return;
        const safe = sanitizeSummary(s);
        setSummary(address, safe);
        setSummaryState(safe);
      })
      .catch(onErr)
      .finally(() => {
        if (!ac.signal.aborted) setSummaryLoading(false);
      });

    const positionsP = getWalletPortfolioPositions(address, {
      includeClosed: true,
      fresh, // revalidate (bypass server cache) only on trade-triggered refetch
      signal: ac.signal,
    })
      .then((p) => {
        if (ac.signal.aborted) return;
        const guarded = applyResurrectionGuard(p.positions);
        setPositions(address, guarded);
        setPositionsState(guarded);
        setPositionsDegraded(p.degraded === true);
      })
      .catch(onErr)
      .finally(() => {
        if (!ac.signal.aborted) setPositionsLoading(false);
      });

    const tradesP = getWalletPortfolioTrades(address, {
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

    void Promise.allSettled([summaryP, positionsP, tradesP]).then(() => {
      fetchInFlightRef.current = false;
      // Trailing refetch: signals that arrived mid-flight collapsed into one.
      if (pendingRefetchRef.current && !ac.signal.aborted) {
        pendingRefetchRef.current = false;
        // A coalesced refetch was triggered by a trade signal → keep it fresh.
        void fetchAll(fresh);
      }
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

    // True stale-while-revalidate: ALWAYS refetch on open, even if the cache is
    // "fresh" (<30s). A wallet you just traded on changes the instant the trade
    // lands, so a 30s-cached snapshot can show stale values (e.g. a just-bought
    // position with $0 cost basis from the pre-aggregation moment). The cache is
    // still painted instantly below (setXLoading(!hasX) → no spinner when we
    // have cached data), so there's NO added latency — the refetch runs in the
    // background and swaps in fresh data when it arrives (~1.5s). summaryFresh/
    // positionsFresh/tradesFresh are intentionally no longer used to skip the
    // fetch; kept only for reference.
    void summaryFresh;
    void positionsFresh;
    void tradesFresh;
    const hasSummary = !!entry?.summary;
    const hasPositions = !!entry && entry.positionsTs > 0;
    const hasTrades = !!entry && entry.tradesTs > 0;

    const ac = new AbortController();
    inflightRef.current = ac;
    // Mark in-flight so refetch signals coalesce behind this mount fetch too
    // (see fetchAll). Cleared by the allSettled trailer below.
    fetchInFlightRef.current = true;
    pendingRefetchRef.current = false;
    const mountFetches: Promise<unknown>[] = [];

    const onErr = (e: unknown) => {
      if ((e as { name?: string })?.name === "AbortError") return;
      setError(
        (prev) =>
          prev ?? (e instanceof Error ? e.message : "Failed to load wallet"),
      );
    };

    // Always revalidate. setXLoading(!hasX) keeps the spinner OFF when cached
    // data is already showing → instant paint, background refresh, no latency.
    setSummaryLoading(!hasSummary);
    mountFetches.push(
      getWalletPortfolioSummary(address, ac.signal)
        .then((s) => {
          if (ac.signal.aborted) return;
          const safe = sanitizeSummary(s);
          setSummary(address, safe);
          setSummaryState(safe);
        })
        .catch(onErr)
        .finally(() => {
          if (!ac.signal.aborted) setSummaryLoading(false);
        }),
    );

    setPositionsLoading(!hasPositions);
    mountFetches.push(
      getWalletPortfolioPositions(address, {
        includeClosed: true,
        signal: ac.signal,
      })
        .then((p) => {
          if (ac.signal.aborted) return;
          const guarded = applyResurrectionGuard(p.positions);
          setPositions(address, guarded);
          setPositionsState(guarded);
          setPositionsDegraded(p.degraded === true);
        })
        .catch(onErr)
        .finally(() => {
          if (!ac.signal.aborted) setPositionsLoading(false);
        }),
    );

    setTradesLoading(!hasTrades);
    mountFetches.push(
      getWalletPortfolioTrades(address, {
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
        }),
    );

    void Promise.allSettled(mountFetches).then(() => {
      fetchInFlightRef.current = false;
      if (pendingRefetchRef.current && !ac.signal.aborted) {
        pendingRefetchRef.current = false;
        void fetchAll();
      }
    });

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
      // Trade-triggered → revalidate with fresh=1 so the server recomputes the
      // wallet's positions instead of returning the ≤150s-stale warmer cache.
      void fetchAll(true);
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
    positionsDegraded,
    tradesLoading,
    error,
    isUnsupportedChain: unsupportedChain,
  };
}
