import React, { useEffect, useState, useMemo, useRef } from "react";
import type { Wallet, TradeRow } from "~/utils/functions";
import { formatSmartNumber, fetchWalletBalance } from "~/utils/functions";
import InterstatePopout from "./InterstatePopout";
import { FaRegCopy, FaCheck } from "react-icons/fa";
import { FiExternalLink } from "react-icons/fi";
import type { Token } from "~/utils/db";
import { getWalletSolBalance } from "~/utils/walletTracking";
import { useWalletTracker } from "./WalletTrackerContext";
import Activity from "./trade/Activity";
import PnlCalendar from "./PnlCalendar";
import { Sparkline } from "./MicroChart";
import { SolanaIcon } from "./Footer";
import { pnlColor, pnlHeat } from "~/utils/trackersTheme";
import { getWalletDailyPnl, type WalletDailyPnlDay } from "~/utils/api";
import { useSolPrice } from "./SolPriceContext";
import RealizedPnlChart, {
  type PnlChartDataPoint,
} from "./charts/RealizedPnlChart";
import useDevTokensByWallet from "../hooks/useDevTokensByWallet";
import { IoIosCloseCircleOutline } from "react-icons/io";
import { useImagePreloader } from "~/hooks/useImagePreloader";
import { extractTokenImage } from "~/utils/images";
import { preloadImage } from "~/utils/imagePreloader";
import {
  getCachedScanImage,
  resolveScanImage,
} from "~/utils/scanImageResolver";
import {
  useWalletScan,
  toAggregatedPosition,
  positionToClosedOrder,
  type AggregatedPosition,
  type ClosedOrder,
} from "~/hooks/useWalletScan";
import {
  ScanCard,
  DistributionRow,
  WinLossBar,
  TokenAvatar,
} from "./WalletScanCards";

interface WalletScanPanelProps {
  wallet: Wallet;
  onClose: () => void;
}

const TABS = [
  "PnL Calendar",
  "Active Positions",
  "History",
  "Top 100",
  "Dev Tokens",
  "Activity",
];

const MAX_TOKEN_NAME_LENGTH = 10;
const truncateTokenName = (name: string | null | undefined): string => {
  if (!name) return "";
  return name.length > MAX_TOKEN_NAME_LENGTH
    ? `${name.slice(0, MAX_TOKEN_NAME_LENGTH)}…`
    : name;
};

// Helper to format timestamp as relative time (like "5m", "3h", "2d")
function formatTimeAgo(timestamp: string | number | Date): string {
  let date: Date;

  // Parse the timestamp
  if (typeof timestamp === "string") {
    date = new Date(timestamp);
  } else if (typeof timestamp === "number") {
    // Handle both seconds and milliseconds
    date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    return "Unknown";
  }

  // Validate date
  if (isNaN(date.getTime())) {
    return "Unknown";
  }

  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 0) return "Just now";

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const months = Math.floor(diff / 2592000000);
  const years = Math.floor(diff / 31536000000);

  if (years > 0) return `${years}y`;
  if (months > 0) return `${months}mo`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return "Just now";
}

const WalletScanPanel: React.FC<WalletScanPanelProps> = ({
  wallet,
  onClose,
}) => {
  // Get latest trades from context (same as Live Trades)
  const { latestTrades, walletBalances } = useWalletTracker();

  const { tokens: devTokens, isLoading: devTokensLoading } =
    useDevTokensByWallet(wallet?.address);

  // Only re-fetch history when the count of trades for THIS wallet changes,
  // not on every unrelated trade from other tracked wallets.
  const walletTradeCount = useMemo(
    () =>
      latestTrades.filter(
        (t) => t.wallet.toLowerCase() === wallet.address.toLowerCase(),
      ).length,
    [latestTrades, wallet.address],
  );

  // Get SOL price from context
  const { solPrice } = useSolPrice();
  // Use SOL price with fallback if not available
  const currentSolPrice = solPrice > 0 ? solPrice : 150;

  // ─── Go token service data (replaces RPC + client-side FIFO) ────────────────
  const {
    summary: goSummary,
    positions: goPositions,
    trades: goTrades,
    positionsLoading,
    positionsDegraded,
    tradesLoading,
    error: goError,
    isUnsupportedChain,
  } = useWalletScan(wallet.address, { refetchSignal: walletTradeCount });

  // Live data state — hydrate from context batch balance for instant display
  const contextBalance = walletBalances[wallet.address] ?? null;
  const [balance, setBalance] = useState<number | null>(contextBalance);
  const [loading, setLoading] = useState(contextBalance === null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Land on Activity: it's a bounded LIMIT-100 read (~200ms cold), so the panel
  // is instantly useful. The PnL Calendar's cold path scans the wallet's whole
  // trade history for cost basis (~1.6s for a whale), so we DON'T land on it —
  // instead we prefetch its current month in the background (below) so it's warm
  // by the time the user clicks the tab. (The other tabs' data is already
  // prefetched by useWalletScan on open.)
  const [tab, setTab] = useState("Activity");
  const [calendarPrefetch, setCalendarPrefetch] = useState<{
    month: string;
    days: WalletDailyPnlDay[];
  } | null>(null);

  // Background-warm the PnL calendar's current month so switching to the
  // (cold-slow) calendar tab is instant. Delayed ~900ms so this heavy
  // full-history scan doesn't contend with the summary/positions/trades requests
  // the landing (Activity) tab needs first. Fire-and-forget; the result both
  // seeds the component and warms the server cache.
  useEffect(() => {
    if (!wallet?.address) return;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      const now = new Date();
      const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      getWalletDailyPnl(wallet.address, { month, signal: ac.signal })
        .then((r) => setCalendarPrefetch({ month, days: r.days || [] }))
        .catch(() => {
          /* aborted or transient — calendar will fetch on its own when opened */
        });
    }, 900);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [wallet?.address]);

  const [walletBalance, setWalletBalance] = useState<{
    sol: number;
    usd: number;
    usdFormatted: string | null;
  } | null>(null);

  const [token, setToken] = useState<Token | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [tokenBalanceLoading, setTokenBalanceLoading] = useState(true);
  const [tokenBalanceError, setTokenBalanceError] = useState<string | null>(
    null,
  );
  const [selectedRange, setSelectedRange] = useState("Max");
  const timeRanges = ["1d", "7d", "30d", "Max"];
  const [toast, setToast] = useState<string | null>(null);

  // Whale wallets: the positions query can run 15-60s server-side on first
  // load. After 8s of spinner, swap in an explanatory line so the user knows
  // it's the wallet's history size, not a hang.
  const [positionsSlow, setPositionsSlow] = useState(false);
  useEffect(() => {
    if (!positionsLoading) {
      setPositionsSlow(false);
      return;
    }
    const t = setTimeout(() => setPositionsSlow(true), 8000);
    return () => clearTimeout(t);
  }, [positionsLoading]);

  // ─── Token avatars (shared resolver w/ localStorage persistence) ─────────────
  // resolveScanImage handles the full pipeline (direct URL → metadata URI →
  // token-service → pump.fun/DexScreener cascade) and persists successes to
  // localStorage, so reloads and revisits paint instantly. Only the rendered
  // subset (first 1K rows, newest-first) is scanned; 80 fresh lookups per pass.
  const [metaImages, setMetaImages] = useState<Record<string, string>>({});
  useEffect(() => {
    if (goPositions.length === 0 && goTrades.length === 0) return;
    let cancelled = false;

    const fromCache: Record<string, string> = {};
    const work: { mint: string; raw: string | null; uri: string | null }[] = [];
    const seen = new Set<string>();
    const add = (mint: string, raw: string | null, uri: string | null) => {
      if (seen.has(mint)) return;
      seen.add(mint);
      const cached = getCachedScanImage(mint);
      if (typeof cached === "string") {
        fromCache[mint] = cached;
      } else if (cached === undefined) {
        work.push({ mint, raw, uri });
      }
    };
    for (const p of goPositions.slice(0, 1000)) {
      add(p.token_mint, p.image_url ?? null, p.uri ?? null);
    }
    // Activity rows reference mints the wallet TRADED, which for fast flippers
    // barely overlap current holdings — resolve those too or the Activity tab
    // stays letter-tiled (trade rows carry no image fields of their own).
    for (const t of goTrades) {
      add(t.token_mint, null, null);
    }
    if (Object.keys(fromCache).length > 0) {
      setMetaImages((prev) => ({ ...prev, ...fromCache }));
    }
    if (work.length === 0) return;

    // Drain in batches of 80 until everything visible has been attempted —
    // the effect only re-fires on data changes, so stragglers must not wait
    // for one.
    void (async () => {
      for (let i = 0; i < work.length && !cancelled; i += 80) {
        // Collect the batch and commit ONE state update: per-image updates made
        // every downstream memo (activityData, enrichedPositions) rebuild row
        // identities up to 80× per batch, which remounted Activity rows and
        // flickered their borders/protocol badges.
        const updates: Record<string, string> = {};
        await Promise.allSettled(
          work.slice(i, i + 80).map(async ({ mint, raw, uri }) => {
            const url = await resolveScanImage(mint, raw, uri);
            if (url) {
              updates[mint] = url;
              void preloadImage(url);
            }
          }),
        );
        if (!cancelled && Object.keys(updates).length > 0) {
          setMetaImages((prev) => ({ ...prev, ...updates }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [goPositions, goTrades]);

  // ─── Derived data from Go token service ──────────────────────────────────────
  // The resolved+proxied URL always wins over the raw indexer URL: raw values
  // are frequently metadata JSON links that FastImage can't render directly.
  const enrichedPositions = useMemo(
    () =>
      goPositions.map((p) =>
        metaImages[p.token_mint]
          ? { ...p, image_url: metaImages[p.token_mint] }
          : p,
      ),
    [goPositions, metaImages],
  );

  const allAggregatedPositions = useMemo(
    () => enrichedPositions.map((p) => toAggregatedPosition(p, currentSolPrice)),
    [enrichedPositions, currentSolPrice],
  );

  const aggregatedPositions = useMemo(
    () =>
      allAggregatedPositions
        .filter((p) => p.isOpen)
        // Hide zero-cost-basis airdrop dust: tokens the wallet never bought
        // (boughtAmount === 0 → received via transfer/airdrop) AND worth under
        // $1. KOL wallets get flooded with these — they otherwise bury the real
        // positions under a wall of "$0 bought / $0 sold / +0.0% PnL" rows.
        // Meaningful airdrops (≥ $1) and every actually-traded position stay.
        .filter((p) => !(p.boughtAmount === 0 && p.remainingValue < 1))
        // Real positions (the wallet actually bought) first, airdrops/received
        // (no cost basis) sink to the bottom — so the user sees their actual
        // active positions up top. Within each group, sort by value.
        .sort((a, b) => {
          const aAir = a.boughtAmount === 0 ? 1 : 0;
          const bAir = b.boughtAmount === 0 ? 1 : 0;
          if (aAir !== bAir) return aAir - bAir;
          return b.remainingValue - a.remainingValue;
        }),
    [allAggregatedPositions],
  );

  const closedOrders = useMemo((): ClosedOrder[] => {
    // Whale wallets return 15K+ closed positions with include_closed=1 (measured
    // 15,348 for one wallet). The History table renders plain <tr> rows with no
    // virtualization, so an uncapped map freezes the tab. Newest 500 is far more
    // than anyone scrolls; performanceMetrics still uses the summary's
    // authoritative totals for the "Max" range, so the bins stay correct.
    const MAX_HISTORY_ROWS = 500;
    const closed = enrichedPositions
      .filter((p) => p.remaining_tokens <= 0.001)
      .map((p) => positionToClosedOrder(p, currentSolPrice));
    return closed
      .sort((a, b) => b.closedAt - a.closedAt)
      .slice(0, MAX_HISTORY_ROWS);
  }, [enrichedPositions, currentSolPrice]);

  // Max |pnl| in the history set — normalizes the pnlHeat() cell tints so the
  // History table reads as a color-graded ledger (strongest mover = deepest tint).
  const maxAbsClosedPnl = useMemo(
    () =>
      closedOrders.reduce((m, o) => Math.max(m, Math.abs(o.pnl || 0)), 0) || 1,
    [closedOrders],
  );

  // Calculate performance metrics from closed orders
  // Authoritative realized PnL for the selected range, in USD. Comes from the
  // server, which computes each window from raw solana_trades over the COMPLETE
  // token set — NOT from the capped (~500) client position slice (which
  // understates whale windows ~10x), and NOT from wallet_holder_positions
  // (whose columns double-count ~2x unevenly). SOL→USD via currentSolPrice.
  // Undefined ⇒ older backend without these fields ⇒ callers fall back.
  const serverRangePnlUsd = useMemo<number | undefined>(() => {
    if (!goSummary) return undefined;
    // Prefer NET-of-cost USD (GMGN-comparable: gross − fees − router/tip costs),
    // then gross USD, then SOL × current price (older backend). All time-accurate
    // except the last, which drifts as SOL moves since the trades were made.
    const net =
      selectedRange === "1d"
        ? goSummary.realized_pnl_1d_net_usd
        : selectedRange === "7d"
          ? goSummary.realized_pnl_7d_net_usd
          : selectedRange === "30d"
            ? goSummary.realized_pnl_30d_net_usd
            : goSummary.realized_pnl_max_net_usd;
    if (net !== undefined && net !== null) return net;
    const usd =
      selectedRange === "1d"
        ? goSummary.realized_pnl_1d_usd
        : selectedRange === "7d"
          ? goSummary.realized_pnl_7d_usd
          : selectedRange === "30d"
            ? goSummary.realized_pnl_30d_usd
            : goSummary.realized_pnl_max_usd;
    if (usd !== undefined && usd !== null) return usd;
    const sol =
      selectedRange === "1d"
        ? goSummary.realized_pnl_1d_sol
        : selectedRange === "7d"
          ? goSummary.realized_pnl_7d_sol
          : selectedRange === "30d"
            ? goSummary.realized_pnl_30d_sol
            : goSummary.realized_pnl_max_sol;
    return sol !== undefined && sol !== null ? sol * currentSolPrice : undefined;
  }, [goSummary, selectedRange, currentSolPrice]);

  const performanceMetrics = useMemo(() => {
    if (!closedOrders || closedOrders.length === 0) {
      // Even with no closed orders, the summary may have realized PnL
      // (positions endpoint doesn't capture all trades).
      const summaryPnl =
        serverRangePnlUsd !== undefined
          ? serverRangePnlUsd
          : goSummary
            ? goSummary.total_realized_pnl_usd !== 0
              ? goSummary.total_realized_pnl_usd
              : goSummary.total_realized_pnl_sol * currentSolPrice
            : 0;
      return {
        totalPnl: summaryPnl,
        totalTransactions: 0,
        completedTransactions: 0,
        categoryCounts: {
          over500: 0,
          twoHundredTo500: 0,
          zeroTo200: 0,
          zeroToNeg50: 0,
          underNeg50: 0,
        },
        progressPercentage: 0,
      };
    }

    // Filter by selectedRange
    const now = Date.now();
    let filteredOrders = closedOrders;
    if (selectedRange !== "Max") {
      const windowMs =
        selectedRange === "1d"
          ? 24 * 60 * 60 * 1000
          : selectedRange === "7d"
            ? 7 * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000;
      const cutoff = now - windowMs;
      filteredOrders = closedOrders.filter((order) => order.closedAt >= cutoff);
    }

    // Every range now has an authoritative server figure (chain-truth, complete
    // token set). Prefer it; the client position sum is only a fallback for an
    // older backend that doesn't send the windowed fields.
    const positionPnl = filteredOrders.reduce(
      (sum, order) => sum + order.pnl,
      0,
    );
    const totalPnl =
      serverRangePnlUsd !== undefined
        ? serverRangePnlUsd
        : selectedRange === "Max" && goSummary
          ? goSummary.total_realized_pnl_usd !== 0
            ? goSummary.total_realized_pnl_usd
            : goSummary.total_realized_pnl_sol * currentSolPrice
          : positionPnl;
    const totalTransactions = filteredOrders.length;
    const completedTransactions = filteredOrders.length;

    // Categorize by PNL percentage
    const categoryCounts = {
      over500: 0,
      twoHundredTo500: 0,
      zeroTo200: 0,
      zeroToNeg50: 0,
      underNeg50: 0,
    };

    filteredOrders.forEach((order) => {
      const pnlPercentage = order.pnlPercentage;
      if (pnlPercentage > 500) {
        categoryCounts.over500++;
      } else if (pnlPercentage > 200) {
        categoryCounts.twoHundredTo500++;
      } else if (pnlPercentage >= 0) {
        categoryCounts.zeroTo200++;
      } else if (pnlPercentage >= -50) {
        categoryCounts.zeroToNeg50++;
      } else {
        categoryCounts.underNeg50++;
      }
    });

    // Calculate progress bar percentage (based on winning vs losing positions)
    const winningPositions = filteredOrders.filter((o) => o.pnl > 0).length;
    const progressPercentage =
      completedTransactions > 0
        ? (winningPositions / completedTransactions) * 100
        : 0;

    return {
      totalPnl,
      totalTransactions,
      completedTransactions,
      categoryCounts,
      progressPercentage,
    };
  }, [closedOrders, selectedRange, goSummary, currentSolPrice, serverRangePnlUsd]);

  // Build per-trade Realized PnL chart data, scoped to selectedRange
  const pnlChartData = useMemo((): PnlChartDataPoint[] => {
    if (!closedOrders || closedOrders.length === 0) return [];

    const now = Date.now();
    let scoped = closedOrders;
    if (selectedRange !== "Max") {
      const windowMs =
        selectedRange === "1d"
          ? 24 * 60 * 60 * 1000
          : selectedRange === "7d"
            ? 7 * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000;
      const cutoff = now - windowMs;
      scoped = closedOrders.filter((o) => o.closedAt >= cutoff);
    }

    if (scoped.length === 0) return [];

    const ordered = [...scoped].sort((a, b) => a.closedAt - b.closedAt);

    const formatTime = (ts: number) =>
      new Date(ts).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    const formatDate = (ts: number) =>
      new Date(ts).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

    const points: PnlChartDataPoint[] = [
      {
        time: formatTime(ordered[0].closedAt),
        date: formatDate(ordered[0].closedAt),
        cumulativePnl: 0,
        tradePnl: 0,
        tokenSymbol: "",
        tokenName: "",
        index: 0,
      },
    ];

    let cum = 0;
    ordered.forEach((order, i) => {
      cum += order.pnl;
      points.push({
        time: formatTime(order.closedAt),
        date: formatDate(order.closedAt),
        cumulativePnl: cum,
        tradePnl: order.pnl,
        tokenSymbol: order.tokenSymbol || "",
        tokenName: order.tokenName || "",
        index: i + 1,
      });
    });

    // Anchor the terminal cumulative to the authoritative server figure for this
    // range. The client only holds a capped slice of a whale's closed positions,
    // so the raw cumulative under-counts and would end far below the headline
    // number. Scale proportionally — trajectory shape is preserved, endpoint tells
    // the truth. Guarded to same-sign, non-trivial factors: scaling across a sign
    // flip would invert the curve and mislead, so in that rare case we leave raw.
    if (
      serverRangePnlUsd !== undefined &&
      Number.isFinite(serverRangePnlUsd) &&
      cum !== 0 &&
      Math.sign(serverRangePnlUsd) === Math.sign(cum)
    ) {
      const factor = serverRangePnlUsd / cum;
      if (Number.isFinite(factor) && factor > 0 && Math.abs(factor - 1) > 0.01) {
        for (const p of points) {
          p.cumulativePnl *= factor;
          p.tradePnl *= factor;
        }
      }
    }

    return points;
  }, [closedOrders, selectedRange, serverRangePnlUsd]);

  const realizedPnlPercentage = useMemo(() => {
    // For "Max" range, derive percentage from summary's authoritative totals.
    if (selectedRange === "Max" && goSummary) {
      const totalBoughtUsd = goSummary.total_bought_sol * currentSolPrice;
      if (totalBoughtUsd <= 0) return 0;
      const pnlUsd =
        goSummary.total_realized_pnl_usd !== 0
          ? goSummary.total_realized_pnl_usd
          : goSummary.total_realized_pnl_sol * currentSolPrice;
      return (pnlUsd / totalBoughtUsd) * 100;
    }

    if (!closedOrders || closedOrders.length === 0) return 0;

    const now = Date.now();
    let scoped = closedOrders;
    if (selectedRange !== "Max") {
      const windowMs =
        selectedRange === "1d"
          ? 24 * 60 * 60 * 1000
          : selectedRange === "7d"
            ? 7 * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000;
      const cutoff = now - windowMs;
      scoped = closedOrders.filter((o) => o.closedAt >= cutoff);
    }

    const totalCostBasis = scoped.reduce((sum, o) => sum + o.boughtValue, 0);
    if (totalCostBasis <= 0) return 0;
    const totalPnl = scoped.reduce((sum, o) => sum + o.pnl, 0);
    return (totalPnl / totalCostBasis) * 100;
  }, [closedOrders, selectedRange, goSummary, currentSolPrice]);

  // Keep latest SOL price in a ref so the balance-loader can read it without
  // re-firing the fetch on every SOL price tick.
  const solPriceRef = useRef(solPrice);
  useEffect(() => {
    solPriceRef.current = solPrice;
  }, [solPrice]);

  // Fetch balance independently (fast: ~100-200ms)
  // If we already have a context balance, show it instantly and refresh in background
  useEffect(() => {
    if (!wallet?.address) return;
    // EVM/Monad wallets short-circuit at render; skip the doomed Solana
    // balance endpoint + RPC fallback for them.
    if (isUnsupportedChain) return;

    // Only show loading spinner if we have no data at all (no context balance)
    const hasContextBalance = walletBalances[wallet.address] != null;
    if (!hasContextBalance) {
      setLoading(true);
    }

    const loadBalance = async () => {
      try {
        const data = await fetchWalletBalance(wallet.address);
        if (data?.balance) {
          setWalletBalance(data.balance);
          setBalance(data.balance.sol);
          return;
        }
        // Primary returned success but no balance — fall through to RPC fallback.
        throw new Error("balance endpoint returned no balance");
      } catch (err) {
        console.warn(
          "[WalletScan] primary balance endpoint failed, trying RPC fallback:",
          err,
        );
        try {
          const sol = await getWalletSolBalance(wallet.address);
          if (sol != null && Number.isFinite(sol)) {
            const liveSolPrice = solPriceRef.current;
            // If solPrice context hasn't loaded yet, use NaN as an "unknown USD"
            // sentinel. Both portfolioMetrics.totalValue (line 468) and the
            // header USD display (line 688) treat NaN as missing and fall back
            // to `sol * currentSolPrice`, which uses the component-scoped
            // live price (with a 150 floor). Writing 0 here would silently
            // undercount the SOL position in totalValue.
            const usd = liveSolPrice > 0 ? sol * liveSolPrice : Number.NaN;
            setWalletBalance({ sol, usd, usdFormatted: null });
            setBalance(sol);
          } else if (!hasContextBalance) {
            setBalance(null);
          }
        } catch (fallbackErr) {
          console.warn(
            "[WalletScan] RPC balance fallback also failed:",
            fallbackErr,
          );
          if (!hasContextBalance) {
            setBalance(null);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    void loadBalance();
  }, [wallet.address, isUnsupportedChain]);

  // Activity data: convert Go service trades to TradeRow format for Activity component
  const activityData = useMemo((): TradeRow[] => {
    // Trade rows from the Go service carry no image; the Activity component's
    // extractTokenImage() therefore always fell back to letter tiles. Reuse the
    // resolved+proxied avatar map (metaImages) and the positions' raw URLs —
    // trades and positions share the same mints.
    const rawByMint = new Map<string, string>();
    // Fall back to the positions' resolved name/symbol for any trade mint the
    // server didn't enrich (trades and positions share mints).
    const nameByMint = new Map<string, string>();
    const symbolByMint = new Map<string, string>();
    const protocolByMint = new Map<string, string>();
    for (const p of goPositions) {
      if (p.image_url) rawByMint.set(p.token_mint, p.image_url);
      if (p.token_name) nameByMint.set(p.token_mint, p.token_name);
      if (p.token_symbol) symbolByMint.set(p.token_mint, p.token_symbol);
      if (p.launchpad_protocol)
        protocolByMint.set(p.token_mint, p.launchpad_protocol);
    }
    return goTrades.map((t, idx) => {
      const date = new Date(t.created_at);
      const usdValue =
        t.price_usd > 0 && t.token_amount > 0
          ? t.price_usd * t.token_amount
          : t.sol_amount * currentSolPrice;
      return {
        id: idx,
        tokenAddress: t.token_mint,
        // Prefer the server-enriched name/symbol, then the positions map; the
        // Activity component shows tokenAddress only when both are empty.
        tokenName: t.name || nameByMint.get(t.token_mint) || "",
        tokenSymbol: t.symbol || symbolByMint.get(t.token_mint) || "",
        // Carry the protocol so the Activity row's border color + AMM badge
        // render WITH the image instead of popping in after the async metadata
        // fetch. /trades is server-enriched with launchpad_protocol; fall back
        // to the positions map.
        launchpad: t.launchpad_protocol || protocolByMint.get(t.token_mint) || "",
        pairAddress: t.pool_address ?? undefined,
        blockchain: "sol",
        tradeTime: date.toISOString(),
        type: t.is_buy ? ("Buy" as const) : ("Sell" as const),
        marketCap: t.market_cap_usd || 0,
        solAmount: t.sol_amount,
        tokenAmount: t.token_amount,
        usdValue,
        transactionHash: t.signature,
        createdAt: date.toISOString(),
        imageUrl:
          t.image_url ??
          metaImages[t.token_mint] ??
          rawByMint.get(t.token_mint) ??
          null,
      };
    });
  }, [goTrades, goPositions, metaImages, currentSolPrice]);

  // (FIFO computations removed — positions are now served pre-computed by Go token service)

  // Calculate total portfolio value and unrealized PnL from RPC (on-chain balances)
  const portfolioMetrics = useMemo(() => {
    let totalPositionsValue = 0;
    let totalUnrealizedPnl = 0;

    for (const p of goPositions) {
      if (p.remaining_tokens <= 0.001) continue;
      // Use on-chain balance from RPC if available, otherwise fall back to remaining_tokens
      const rpcBalance = p.on_chain_token_balance ?? p.remaining_tokens;
      const price = p.current_price_usd ?? 0;
      const marketValue = rpcBalance * price;
      totalPositionsValue += marketValue;

      // Unrealized PnL from RPC: market value of on-chain balance minus cost basis
      const soldFraction =
        p.bought_tokens > 0 ? Math.min(p.sold_tokens / p.bought_tokens, 1) : 0;
      const boughtUsd =
        p.bought_usd_value > 0
          ? p.bought_usd_value
          : p.bought_sol * currentSolPrice;
      const costBasis = boughtUsd * Math.max(0, 1 - soldFraction);
      totalUnrealizedPnl += marketValue - costBasis;
    }

    // Wallet SOL balance in USD
    let solBalanceUsd = 0;
    if (walletBalance) {
      if (
        typeof walletBalance.usd === "number" &&
        Number.isFinite(walletBalance.usd)
      ) {
        solBalanceUsd = walletBalance.usd;
      } else if (
        typeof walletBalance.sol === "number" &&
        Number.isFinite(walletBalance.sol)
      ) {
        solBalanceUsd = walletBalance.sol * currentSolPrice;
      }
    }

    return {
      totalValue: totalPositionsValue + solBalanceUsd,
      unrealizedPnl: totalUnrealizedPnl,
    };
  }, [goPositions, walletBalance, currentSolPrice]);

  // Top 100 positions by PnL — open positions always shown first (so Activity
  // tab tokens are always visible), then closed positions fill remaining slots.
  const top100Positions = useMemo(() => {
    const open = allAggregatedPositions.filter((p) => p.isOpen);
    const closed = allAggregatedPositions.filter((p) => !p.isOpen);
    return [...open, ...closed].slice(0, 100);
  }, [allAggregatedPositions]);

  // Preload token images from activity rows as soon as data arrives
  const { preloadImages } = useImagePreloader();
  useEffect(() => {
    if (!activityData || activityData.length === 0) return;
    const imageSources = activityData
      .map((trade: any) => extractTokenImage(trade))
      .filter(Boolean);
    if (imageSources.length > 0) {
      preloadImages(imageSources, { priority: true, timeout: 2000 });
    }
  }, [activityData, preloadImages]);

  // Warm the browser cache for every position image as soon as positions land,
  // so switching to Active Positions / History / Top 100 renders instantly
  // instead of popping avatars in row by row.
  useEffect(() => {
    const sources = enrichedPositions
      .map((p) => p.image_url)
      .filter(Boolean) as string[];
    if (sources.length > 0) {
      preloadImages(sources, { priority: false, timeout: 4000 });
    }
  }, [enrichedPositions, preloadImages]);

  useEffect(() => {
    if (!wallet.address) return;
    setTokenLoading(true);
    setTokenError(null);
    fetch(`/api/token/${wallet.address}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.result) setToken(data.result);
        else setTokenError("Token not found");
      })
      .catch(() => setTokenError("Failed to fetch token info"))
      .finally(() => setTokenLoading(false));
  }, [wallet.address]);

  // Derive SPL token balance from Go service positions (already fetched by useWalletScan)
  useEffect(() => {
    if (!wallet.address || !token || !token.pair_address) return;
    setTokenBalanceLoading(true);
    setTokenBalanceError(null);

    const position = goPositions.find(
      (p) => p.token_mint === token.pair_address,
    );
    setTokenBalance(position ? position.remaining_tokens : 0);
    setTokenBalanceLoading(false);
  }, [wallet.address, token && token.pair_address, goPositions]);

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(wallet.address).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      });
    }
  };

  // Toast display logic
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // EVM/Monad wallets short-circuit: the Go token service is Solana-only, so
  // we render a clean "coming soon" state instead of letting the panel hit a
  // 400 and render empty tabs.
  if (isUnsupportedChain) {
    const truncatedAddress =
      typeof wallet.address === "string" && wallet.address.length >= 10
        ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
        : wallet.address || "—";
    return (
      <InterstatePopout
        open={true}
        onClose={onClose}
        align="center"
        zIndex={99999}
        className="h-auto w-[90%] bg-transparent p-0 shadow-none md:w-[480px]"
      >
        <div className="relative flex w-full flex-col items-center gap-3 rounded-xl border border-white/[0.06] bg-[#030304] px-6 py-8 text-center">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 rounded p-1 text-[#71717a] hover:bg-white/[0.06] hover:text-[#a1a1aa]"
            aria-label="Close"
          >
            <IoIosCloseCircleOutline className="h-5 w-5" />
          </button>
          <div className="text-lg font-semibold text-[#f4f4f5]">
            {wallet.name || "Wallet"}
          </div>
          <div className="font-mono text-xs text-[#71717a]">
            {truncatedAddress}
          </div>
          <div className="mt-2 text-sm font-medium text-[#18c48c]">
            Monad wallet scan coming soon
          </div>
          <p className="max-w-[360px] text-xs leading-relaxed text-[#71717a]">
            Trade history and PnL for EVM wallets aren't wired yet. Solana
            wallets work as expected.
          </p>
        </div>
      </InterstatePopout>
    );
  }

  return (
    <InterstatePopout
      open={true}
      onClose={onClose}
      align="center"
      zIndex={99999}
      className="h-[calc(100vh-120px)] w-[90%] bg-transparent p-0 shadow-none md:w-[80%]"
    >
      <div className="relative flex h-[calc(100vh-120px)] w-full flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#030304]">
        {/* Atmospheric layer — matches the Trackers page: faint brand-green
            tech-grid + top-center glow + light-beam. Single static paint,
            pointer-events-none, no blur/shadow/animation (~0 CPU). */}
        <div
          className="pointer-events-none absolute inset-0 z-0 rounded-xl"
          style={{
            backgroundImage:
              "linear-gradient(rgba(24,196,140,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(24,196,140,0.035) 1px,transparent 1px)",
            backgroundSize: "34px 34px",
            maskImage:
              "radial-gradient(ellipse 80% 50% at 50% 0%, #000 0%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 50% at 50% 0%, #000 0%, transparent 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-44"
          style={{
            background:
              "radial-gradient(ellipse 55% 100% at 50% 0%, rgba(24,196,140,0.10), transparent 72%)",
          }}
        />
        <div
          className="pointer-events-none absolute top-0 left-1/2 z-0 h-px w-[70%] -translate-x-1/2"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(127,255,201,0.55) 50%, transparent)",
          }}
        />
        {/* Header — slim identity row + time-range pills + close */}
        <div className="relative z-10 flex flex-shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-[#0c0e12] text-sm">
              👛
            </span>
            {wallet.name ? (
              <span className="truncate text-sm font-semibold text-[#f4f4f5]">
                {wallet.name}
              </span>
            ) : null}
            <span className="flex items-center gap-1.5 font-mono text-xs text-[#71717a]">
              {typeof wallet.address === "string" && wallet.address.length >= 10
                ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
                : wallet.address || "—"}
              <button
                className="rounded p-1 text-[#52525b] hover:bg-white/[0.06] hover:text-[#a1a1aa]"
                onClick={handleCopy}
                title="Copy address"
                type="button"
              >
                {copied ? (
                  <FaCheck className="text-xs text-[#18c48c]" />
                ) : (
                  <FaRegCopy className="text-xs" />
                )}
              </button>
              <button
                className="rounded p-1 text-[#52525b] hover:bg-white/[0.06] hover:text-[#a1a1aa]"
                title="Open in Solscan"
                type="button"
                onClick={() => {
                  window.open(
                    `https://solscan.io/account/${wallet.address}`,
                    "_blank",
                  );
                  setToast("Wallet updated successfully");
                }}
              >
                <FiExternalLink className="text-xs" />
              </button>
              {tokenBalanceLoading ||
              tokenLoading ? null : tokenBalanceError ? (
                <>
                  <span className="text-white/10">|</span>
                  <span className="text-[#F0616D]">Error</span>
                </>
              ) : tokenBalance !== null && token ? (
                <>
                  <span className="text-white/10">|</span>
                  <span className="text-[#a1a1aa]">
                    {tokenBalance} {token.symbol}
                  </span>
                </>
              ) : null}
            </span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-md border border-white/[0.06] bg-[#0c0e12] p-0.5">
              {timeRanges.map((label) => (
                <button
                  key={label}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium ${
                    selectedRange === label
                      ? "bg-white/[0.08] text-[#f4f4f5]"
                      : "text-[#71717a] hover:text-[#a1a1aa]"
                  }`}
                  onClick={() => setSelectedRange(label)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-[#71717a] hover:bg-white/[0.06] hover:text-[#f4f4f5]"
              aria-label="Close"
              type="button"
            >
              <IoIosCloseCircleOutline className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* Main Content — scrolls as a whole so nothing is clipped on short
            viewports / mobile (cards + tabs + tab content share one scroll). */}
        <div className="relative z-10 flex flex-1 flex-col overflow-y-auto">
          {/* Top: Balance, PNL, Performance — go side-by-side at md so they're a
              compact row on desktop instead of a tall stack that clips. */}
          <div className="grid flex-shrink-0 grid-cols-1 gap-3 px-5 pt-4 pb-3 md:grid-cols-3">
            {/* Balance card — hero total value + cumulative-PnL sparkline */}
            <ScanCard label="Portfolio">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-[#52525b]">
                    Total Value
                  </div>
                  {loading ? (
                    <span className="mt-1 block text-sm text-[#52525b]">Loading…</span>
                  ) : (
                    <div className="mt-1 text-3xl font-bold tracking-tight tabular-nums text-[#f4f4f5]">
                      ${formatSmartNumber(portfolioMetrics.totalValue)}
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-[#52525b]">
                      Unrealized
                    </span>
                    <span
                      className="text-[13px] font-semibold tabular-nums"
                      style={{ color: pnlColor(portfolioMetrics.unrealizedPnl) }}
                    >
                      {portfolioMetrics.unrealizedPnl >= 0 ? "+" : "-"}$
                      {formatSmartNumber(Math.abs(portfolioMetrics.unrealizedPnl))}
                    </span>
                  </div>
                </div>
                {pnlChartData.length > 1 && (
                  <div className="flex-shrink-0 pt-3">
                    <Sparkline
                      values={pnlChartData.map((p) => p.cumulativePnl)}
                      width={88}
                      height={38}
                      strokeWidth={1.5}
                    />
                  </div>
                )}
              </div>
              <div className="my-3 h-px w-full bg-white/[0.06]" />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#71717a]">SOL Balance</span>
                {walletBalance ? (
                  <div className="flex flex-col items-end">
                    <span className="flex items-center justify-end gap-1.5 text-sm font-semibold tabular-nums text-[#f4f4f5]">
                      <SolanaIcon size={13} /> {walletBalance.sol.toFixed(4)}
                    </span>
                    <span className="text-[11px] tabular-nums text-[#71717a]">
                      {typeof walletBalance.usd === "number" &&
                      Number.isFinite(walletBalance.usd)
                        ? `$${formatSmartNumber(walletBalance.usd)}`
                        : walletBalance.usdFormatted
                          ? walletBalance.usdFormatted
                          : typeof walletBalance.sol === "number" &&
                              Number.isFinite(walletBalance.sol)
                            ? `$${formatSmartNumber(walletBalance.sol * currentSolPrice)}`
                            : "—"}
                    </span>
                  </div>
                ) : balance !== null ? (
                  <div className="flex flex-col items-end">
                    <span className="flex items-center justify-end gap-1.5 text-sm font-semibold tabular-nums text-[#f4f4f5]">
                      <SolanaIcon size={13} /> {balance.toFixed(4)}
                    </span>
                    <span className="text-[11px] tabular-nums text-[#71717a]">
                      ${formatSmartNumber(balance * currentSolPrice)}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-[#F0616D]">No balance</span>
                )}
              </div>
            </ScanCard>
            {/* PnL chart card */}
            <ScanCard
              label={
                <>
                  PNL
                  <span
                    className="text-[10px] normal-case text-[#52525b]"
                    title="Cumulative realized PnL from closed positions over the selected time range. Bars show per-trade PnL; the line shows running total."
                  >
                    (i)
                  </span>
                </>
              }
            >
              <div className="flex items-baseline gap-2">
                {performanceMetrics.totalPnl >= 0 ? (
                  <span
                    className="bg-clip-text text-3xl font-bold tracking-tight tabular-nums text-transparent"
                    style={{ backgroundImage: "linear-gradient(90deg,#7FFFC9,#18c48c)" }}
                  >
                    +${formatSmartNumber(Math.abs(performanceMetrics.totalPnl))}
                  </span>
                ) : (
                  <span
                    className="text-3xl font-bold tracking-tight tabular-nums"
                    style={{ color: "#F0616D" }}
                  >
                    -${formatSmartNumber(Math.abs(performanceMetrics.totalPnl))}
                  </span>
                )}
                <span
                  className="text-[13px] font-semibold tabular-nums"
                  style={{ color: pnlColor(realizedPnlPercentage) }}
                >
                  {realizedPnlPercentage >= 0 ? "+" : ""}
                  {realizedPnlPercentage.toFixed(2)}%
                </span>
              </div>
              <div className="mt-2 h-[150px] w-full sm:h-[180px]">
                {positionsLoading ? (
                  <div className="flex h-full items-center justify-center text-xs text-[#52525b]">
                    Loading chart…
                  </div>
                ) : pnlChartData.length <= 1 ? (
                  <div className="flex h-full items-center justify-center text-xs text-[#52525b]">
                    No closed trades in this range
                  </div>
                ) : (
                  <RealizedPnlChart data={pnlChartData} />
                )}
              </div>
            </ScanCard>
            {/* Performance card */}
            <ScanCard
              label={
                <>
                  Performance
                  <span
                    className="text-[10px] normal-case text-[#52525b]"
                    title="Performance ranges show the number of positions with PNL in each range. Example: >500% means positions with more than 500% profit."
                  >
                    (?)
                  </span>
                </>
              }
            >
              <div className="flex items-end justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-[#52525b]">
                    Win Rate
                  </span>
                  <span
                    className="text-3xl font-bold tracking-tight tabular-nums"
                    style={{
                      color:
                        performanceMetrics.progressPercentage >= 50
                          ? "#18c48c"
                          : "#a1a1aa",
                    }}
                  >
                    {performanceMetrics.progressPercentage.toFixed(0)}%
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-[#52525b]">
                    {selectedRange === "Max" ? "Total TXNS" : `${selectedRange} TXNS`}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-[#f4f4f5]">
                    {performanceMetrics.completedTransactions} /{" "}
                    {performanceMetrics.totalTransactions}
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <WinLossBar winPercentage={performanceMetrics.progressPercentage} />
              </div>
              <div className="mt-3 flex flex-col gap-1.5 border-t border-white/[0.06] pt-3">
                {(() => {
                  const c = performanceMetrics.categoryCounts;
                  const catMax = Math.max(
                    c.over500,
                    c.twoHundredTo500,
                    c.zeroTo200,
                    c.zeroToNeg50,
                    c.underNeg50,
                    1,
                  );
                  return (
                    <>
                      <DistributionRow
                        dotColor="#18c48c"
                        label=">500%"
                        count={c.over500}
                        maxCount={catMax}
                      />
                      <DistributionRow
                        dotColor="#3fcf8e"
                        label="200% ~ 500%"
                        count={c.twoHundredTo500}
                        maxCount={catMax}
                      />
                      <DistributionRow
                        dotColor="#86efac"
                        label="0% ~ 200%"
                        count={c.zeroTo200}
                        maxCount={catMax}
                      />
                      <DistributionRow
                        dotColor="#fb7185"
                        label="0% ~ -50%"
                        count={c.zeroToNeg50}
                        maxCount={catMax}
                      />
                      <DistributionRow
                        dotColor="#F0616D"
                        label="< -50%"
                        count={c.underNeg50}
                        maxCount={catMax}
                      />
                    </>
                  );
                })()}
              </div>
            </ScanCard>
          </div>
          {/* Tabs — understated text tabs with active underline. Sticky so they
              stay reachable while the modal body scrolls. */}
          <div className="sticky top-0 z-20 flex flex-shrink-0 items-center border-b border-white/[0.06] bg-[#030304] px-5">
            <div className="flex flex-row gap-6 text-sm">
              {TABS.map((t) => {
                const label =
                  t === "Dev Tokens" ? `Dev Tokens (${devTokens.length})` : t;
                return (
                  <button
                    key={t}
                    className={`relative -mb-px border-b-2 py-2.5 text-xs font-medium ${
                      tab === t
                        ? "border-[#18c48c] text-[#f4f4f5]"
                        : "border-transparent text-[#71717a] hover:text-[#a1a1aa]"
                    }`}
                    onClick={() => setTab(t)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Tab Content Area — min-height so it never collapses; when cards +
              this exceed the viewport, the Main Content scroll above takes over. */}
          <div className="flex-1 overflow-auto px-5 pb-2 min-h-[420px]">
            {tab === "PnL Calendar" && (
              <div className="h-full w-full py-1">
                <PnlCalendar address={wallet.address} initial={calendarPrefetch} />
              </div>
            )}
            {tab === "History" && (
              <div className="h-full w-full">
                {positionsLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="animate-pulse text-[#52525b]">
                      Loading history...
                    </div>
                  </div>
                ) : goError ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-[#F0616D]">{goError}</div>
                  </div>
                ) : closedOrders.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-[#52525b]">
                      {positionsDegraded
                        ? "Trade history for this heavy wallet is still being computed — Active Positions shows live on-chain holdings meanwhile."
                        : "No closed orders found"}
                    </div>
                  </div>
                ) : (
                  <table className="w-full table-fixed text-sm"><colgroup><col className="w-[8%]" /><col className="w-[32%]" /><col className="w-[20%]" /><col className="w-[20%]" /><col className="w-[20%]" /></colgroup>
                    <thead
                      className="sticky top-0 z-20"
                      style={{
                        background: "#030304",
                      }}
                    >
                      <tr className="border-b border-white/[0.06]">
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Time
                        </th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Token
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Bought
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Sold
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          PnL
                        </th>
                        {/* <th className="px-4 py-3 text-center font-semibold">
                          Tx
                        </th> */}
                      </tr>
                    </thead>
                    <tbody>
                      {closedOrders.map((order, idx) => {
                        // Format time - when the position was closed (sell time)
                        const timeAgo = formatTimeAgo(order.closedAt);

                        const displayName =
                          order.tokenName || order.tokenSymbol || null;
                        const displaySymbol =
                          order.tokenSymbol ||
                          order.tokenName ||
                          order.mint?.slice(0, 8) + "..." ||
                          "Unknown";

                        const boughtDisplay = `$${formatSmartNumber(order.boughtValue)}`;
                        const soldDisplay = `$${formatSmartNumber(order.soldValue)}`;

                        // Format PnL
                        const pnlDisplay = `${order.pnl >= 0 ? "+" : ""}$${formatSmartNumber(Math.abs(order.pnl))}`;
                        const pnlPercentageDisplay = `${order.pnlPercentage >= 0 ? "+" : ""}${order.pnlPercentage.toFixed(2)}%`;

                        return (
                          <tr
                            key={order.mint || idx}
                            className="border-b border-white/[0.06] hover:bg-white/[0.04]"
                          >
                            <td className="px-4 py-2.5 text-[#a1a1aa]">
                              <div className="font-mono text-xs">{timeAgo}</div>
                            </td>
                            <td className="px-4 py-2.5">
                              {(() => {
                                const shortAddress = order.mint
                                  ? `${order.mint.slice(0, 4)}...${order.mint.slice(-4)}`
                                  : "";
                                return (
                                  <div className="flex items-center gap-3">
                                    <TokenAvatar
                                      imageUrl={order.imageUrl}
                                      name={displayName}
                                      symbol={displaySymbol}
                                      mint={order.mint}
                                      protocol={order.launchpadProtocol}
                                    />
                                    <div className="flex min-w-0 flex-col">
                                      <span
                                        className="truncate text-sm font-semibold text-neutral-100"
                                        title={order.mint || undefined}
                                      >
                                        {truncateTokenName(
                                          displayName ||
                                            displaySymbol ||
                                            shortAddress,
                                        )}
                                      </span>
                                      {shortAddress && (
                                        <span
                                          className="truncate font-mono text-[11px] text-[#52525b]"
                                          title={order.mint || undefined}
                                        >
                                          {shortAddress}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[#d4d4d8]">
                              {boughtDisplay}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[#d4d4d8]">
                              {soldDisplay}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <span
                                  className="inline-flex items-center rounded-md px-2 py-0.5 font-semibold tabular-nums"
                                  style={{
                                    color: pnlColor(order.pnl),
                                    backgroundColor: pnlHeat(
                                      order.pnl / maxAbsClosedPnl,
                                    ).background,
                                  }}
                                >
                                  {pnlDisplay}
                                </span>
                                <span
                                  className="text-xs tabular-nums"
                                  style={{
                                    color:
                                      order.pnlPercentage >= 0
                                        ? "rgba(24,196,140,0.7)"
                                        : "rgba(240,97,109,0.7)",
                                  }}
                                >
                                  {pnlPercentageDisplay}
                                </span>
                              </div>
                            </td>
                            {/* <td className="px-4 py-3 text-center">
                                <a
                                  href={`https://solscan.io/tx/${order.sellTrade.tx}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300"
                                  title="View on Solscan"
                                >
                                  <FiExternalLink className="inline text-sm" />
                                </a>
                              </td> */}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {tab === "Active Positions" && (
              <div className="h-full w-full overflow-auto">
                {positionsLoading ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2">
                    <div className="animate-pulse text-[#52525b]">
                      Loading positions...
                    </div>
                    {positionsSlow && (
                      <div className="max-w-xs text-center text-xs text-[#3f3f46]">
                        Heavy trading history — first load for this wallet can
                        take up to a minute. It&apos;s cached after that.
                      </div>
                    )}
                  </div>
                ) : goError && aggregatedPositions.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="max-w-sm text-center text-xs text-[#F0616D]">
                      Positions are temporarily unavailable for this wallet —
                      the history is too large for the current query and it
                      timed out. The Activity tab still works; try again in a
                      bit.
                    </div>
                  </div>
                ) : aggregatedPositions.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-[#52525b]">
                      No active positions found
                    </div>
                  </div>
                ) : (
                  <table className="w-full table-fixed text-sm"><colgroup><col className="w-[28%]" /><col className="w-[13%]" /><col className="w-[13%]" /><col className="w-[13%]" /><col className="w-[14%]" /><col className="w-[13%]" /><col className="w-[6%]" /></colgroup>
                    <thead
                      className="sticky top-0 z-20"
                      style={{
                        background: "#030304",
                      }}
                    >
                      <tr className="border-b border-white/[0.06]">
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Token
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Bought
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Sold
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Remaining
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          PNL ↑
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          $
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {aggregatedPositions.map((position, idx) => {
                        const displayName =
                          position.tokenName || position.tokenSymbol || null;
                        const displaySymbol =
                          position.tokenSymbol ||
                          position.tokenName ||
                          position.mint?.slice(0, 8) + "..." ||
                          "Unknown";
                        const imageUrl = position.imageUrl || "";
                        // No buy trades → the wallet received this (airdrop /
                        // transfer), so there's no cost basis. Show it as such
                        // instead of a misleading "$0 bought / +0.0% PnL".
                        const isAirdrop = position.boughtAmount === 0;

                        return (
                          <tr
                            key={position.mint || idx}
                            className="border-b border-white/[0.06] hover:bg-white/[0.04]"
                          >
                            <td
                              className="cursor-pointer px-4 py-2.5"
                              onClick={() => {
                                const addr = position.mint;
                                if (addr) {
                                  window.open(`/trade/${addr}`, "_blank");
                                }
                              }}
                            >
                              <div className="flex items-center gap-3">
                                <TokenAvatar
                                  imageUrl={imageUrl}
                                  name={displayName}
                                  symbol={displaySymbol}
                                  mint={position.mint}
                                  protocol={position.launchpadProtocol}
                                />
                                <div className="flex min-w-0 flex-col">
                                  <span
                                    className="truncate text-sm font-semibold text-neutral-100 hover:text-[#18c48c]"
                                    title={position.mint || undefined}
                                  >
                                    {truncateTokenName(
                                      displayName || displaySymbol,
                                    )}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-[11px] text-[#52525b]">
                                      {displaySymbol}
                                    </span>
                                    {isAirdrop && (
                                      <span
                                        className="shrink-0 rounded bg-[#18c48c]/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-[#18c48c]/80"
                                        title="Received with no buy trades — airdrop or transfer (no cost basis)"
                                      >
                                        Airdropped
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {isAirdrop ? (
                                <span
                                  className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#8b8b94]"
                                  title="Received with no buy trades (airdrop or transfer) — no cost basis"
                                >
                                  Airdrop
                                </span>
                              ) : (
                                <div className="flex flex-col items-end">
                                  <span className="font-semibold tabular-nums text-neutral-100">
                                    ${formatSmartNumber(position.boughtValue)}
                                  </span>
                                  <span className="text-xs tabular-nums text-[#52525b]">
                                    {formatSmartNumber(position.boughtAmount)}{" "}
                                    {displaySymbol}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {isAirdrop && position.soldAmount === 0 ? (
                                <span className="text-sm text-[#52525b]">—</span>
                              ) : (
                                <div className="flex flex-col items-end">
                                  <span className="font-semibold tabular-nums text-neutral-100">
                                    ${formatSmartNumber(position.soldValue)}
                                  </span>
                                  <span className="text-xs tabular-nums text-[#52525b]">
                                    {formatSmartNumber(position.soldAmount)}{" "}
                                    {displaySymbol}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-semibold tabular-nums text-neutral-100">
                                  ${formatSmartNumber(position.remainingValue)}
                                </span>
                                <span className="text-xs tabular-nums text-[#52525b]">
                                  {formatSmartNumber(position.remainingAmount)}{" "}
                                  {displaySymbol}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {isAirdrop ? (
                                <span className="text-sm text-[#52525b]">—</span>
                              ) : (
                                <span
                                  className="inline-flex items-center rounded-md px-2 py-0.5 font-semibold tabular-nums"
                                  style={{
                                    color: pnlColor(position.pnlPercentage),
                                    backgroundColor: pnlHeat(
                                      position.pnlPercentage / 200,
                                    ).background,
                                  }}
                                >
                                  {position.pnlPercentage >= 0 ? "+" : ""}
                                  {position.pnlPercentage.toFixed(1)}%
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {isAirdrop ? (
                                <span className="text-sm text-[#52525b]">—</span>
                              ) : (
                                <span
                                  className="font-semibold tabular-nums"
                                  style={{
                                    color:
                                      position.totalPnl >= 0
                                        ? "#18c48c"
                                        : "#F0616D",
                                  }}
                                >
                                  {position.totalPnl >= 0 ? "+" : ""}$
                                  {formatSmartNumber(
                                    Math.abs(position.totalPnl),
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                className="text-[#52525b] hover:text-[#f4f4f5]"
                                onClick={() => {
                                  const addr = position.mint;
                                  if (addr) {
                                    window.open(`/trade/${addr}`, "_blank");
                                  }
                                }}
                                title="Open trade"
                              >
                                <FiExternalLink size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {tab === "Top 100" && (
              <div className="h-full w-full overflow-auto">
                {positionsLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="animate-pulse text-[#52525b]">
                      Loading top positions...
                    </div>
                  </div>
                ) : top100Positions.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-[#52525b]">No positions found</div>
                  </div>
                ) : (
                  <table className="w-full table-fixed text-sm"><colgroup><col className="w-[30%]" /><col className="w-[16%]" /><col className="w-[16%]" /><col className="w-[16%]" /><col className="w-[16%]" /><col className="w-[6%]" /></colgroup>
                    <thead
                      className="sticky top-0 z-20"
                      style={{
                        background: "#030304",
                      }}
                    >
                      <tr className="border-b border-white/[0.06]">
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Token
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Bought
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Sold
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          PNL ↑
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          $
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {top100Positions.map((position, idx) => {
                        const displayName =
                          position.tokenName || position.tokenSymbol || null;
                        const displaySymbol =
                          position.tokenSymbol ||
                          position.tokenName ||
                          position.mint?.slice(0, 8) + "..." ||
                          "Unknown";
                        const imageUrl = position.imageUrl || "";
                        const isAirdrop = position.boughtAmount === 0;

                        return (
                          <tr
                            key={position.mint || idx}
                            className="border-b border-white/[0.06] hover:bg-white/[0.04]"
                          >
                            <td
                              className="cursor-pointer px-4 py-2.5"
                              onClick={() => {
                                const addr = position.mint;
                                if (addr) {
                                  window.open(`/trade/${addr}`, "_blank");
                                }
                              }}
                            >
                              <div className="flex items-center gap-3">
                                <TokenAvatar
                                  imageUrl={imageUrl}
                                  name={displayName}
                                  symbol={displaySymbol}
                                  mint={position.mint}
                                  protocol={position.launchpadProtocol}
                                />
                                <div className="flex min-w-0 flex-col">
                                  <span
                                    className="truncate text-sm font-semibold text-neutral-100 hover:text-[#18c48c]"
                                    title={position.mint || undefined}
                                  >
                                    {truncateTokenName(
                                      displayName || displaySymbol,
                                    )}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-[11px] text-[#52525b]">
                                      {displaySymbol}
                                    </span>
                                    {isAirdrop && (
                                      <span
                                        className="shrink-0 rounded bg-[#18c48c]/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-[#18c48c]/80"
                                        title="Received with no buy trades — airdrop or transfer (no cost basis)"
                                      >
                                        Airdropped
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {isAirdrop ? (
                                <span
                                  className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#8b8b94]"
                                  title="Received with no buy trades (airdrop or transfer) — no cost basis"
                                >
                                  Airdrop
                                </span>
                              ) : (
                                <div className="flex flex-col items-end">
                                  <span className="font-semibold tabular-nums text-neutral-100">
                                    ${formatSmartNumber(position.boughtValue)}
                                  </span>
                                  <span className="text-xs tabular-nums text-[#52525b]">
                                    {formatSmartNumber(position.boughtAmount)}{" "}
                                    {displaySymbol}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {isAirdrop && position.soldAmount === 0 ? (
                                <span className="text-sm text-[#52525b]">—</span>
                              ) : (
                                <div className="flex flex-col items-end">
                                  <span className="font-semibold tabular-nums text-neutral-100">
                                    ${formatSmartNumber(position.soldValue)}
                                  </span>
                                  <span className="text-xs tabular-nums text-[#52525b]">
                                    {formatSmartNumber(position.soldAmount)}{" "}
                                    {displaySymbol}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {isAirdrop ? (
                                <span className="text-sm text-[#52525b]">—</span>
                              ) : (
                                <span
                                  className="inline-flex items-center rounded-md px-2 py-0.5 font-semibold tabular-nums"
                                  style={{
                                    color: pnlColor(position.pnlPercentage),
                                    backgroundColor: pnlHeat(
                                      position.pnlPercentage / 200,
                                    ).background,
                                  }}
                                >
                                  {position.pnlPercentage >= 0 ? "+" : ""}
                                  {position.pnlPercentage.toFixed(1)}%
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {isAirdrop ? (
                                <span className="text-sm text-[#52525b]">—</span>
                              ) : (
                                <span
                                  className="font-semibold tabular-nums"
                                  style={{
                                    color:
                                      position.totalPnl >= 0
                                        ? "#18c48c"
                                        : "#F0616D",
                                  }}
                                >
                                  {position.totalPnl >= 0 ? "+" : ""}$
                                  {formatSmartNumber(
                                    Math.abs(position.totalPnl),
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                className="text-[#52525b] hover:text-[#f4f4f5]"
                                onClick={() => {
                                  const addr = position.mint;
                                  if (addr) {
                                    window.open(`/trade/${addr}`, "_blank");
                                  }
                                }}
                                title="Open trade"
                              >
                                <FiExternalLink size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {tab === "Activity" && (
              <div className="h-full w-full">
                {tradesLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="animate-pulse text-[#52525b]">
                      Loading activity...
                    </div>
                  </div>
                ) : goError ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-[#F0616D]">{goError}</div>
                  </div>
                ) : activityData.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-[#52525b]">No activity found</div>
                  </div>
                ) : (
                  <div className="h-full w-full">
                    <Activity
                      trades={activityData}
                      loading={false}
                      tokenMetadataCache={{}}
                      maxTokenNameLength={10}
                    />
                  </div>
                )}
              </div>
            )}
            {tab === "Dev Tokens" && (
              <div className="h-full w-full">
                {devTokensLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="animate-pulse text-[#52525b]">
                      Loading dev tokens...
                    </div>
                  </div>
                ) : devTokens.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-[#52525b]">
                      No tokens launched by this wallet
                    </div>
                  </div>
                ) : (
                  <table className="w-full table-fixed text-sm"><colgroup><col className="w-[40%]" /><col className="w-[14%]" /><col className="w-[23%]" /><col className="w-[23%]" /></colgroup>
                    <thead
                      className="sticky top-0 z-20"
                      style={{
                        background: "#030304",
                      }}
                    >
                      <tr className="border-b border-white/[0.06]">
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Token
                        </th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Migrated
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Market Cap
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                          Liquidity
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {devTokens.map((dt) => {
                        const isMigrated = !!dt.token.migrated_pool_address;
                        const ageSec = Math.max(
                          0,
                          Math.floor(Date.now() / 1000 - dt.token.createdAt),
                        );
                        const age =
                          ageSec >= 86400
                            ? `${Math.floor(ageSec / 86400)}d`
                            : ageSec >= 3600
                              ? `${Math.floor(ageSec / 3600)}h`
                              : ageSec >= 60
                                ? `${Math.floor(ageSec / 60)}m`
                                : `${ageSec}s`;
                        const formatUsdShort = (raw: string) => {
                          const n = parseFloat(raw);
                          if (!Number.isFinite(n)) return "$0";
                          if (n >= 1_000_000)
                            return `$${(n / 1_000_000).toFixed(1)}M`;
                          if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
                          return `$${n.toFixed(0)}`;
                        };
                        return (
                          <tr
                            key={dt.token.address}
                            className="cursor-pointer border-b border-white/[0.06] hover:bg-white/[0.04]"
                            onClick={() =>
                              window.open(
                                `/trade/${dt.token.address}`,
                                "_blank",
                              )
                            }
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-3">
                                <TokenAvatar
                                  imageUrl={dt.token.image}
                                  name={dt.token.name}
                                  symbol={dt.token.symbol}
                                  mint={dt.token.address}
                                  protocol={dt.token.launchpad_protocol}
                                />
                                <div className="flex min-w-0 flex-col">
                                  <span
                                    className="truncate font-semibold text-neutral-100"
                                    title={dt.token.address}
                                  >
                                    {truncateTokenName(
                                      dt.token.symbol ||
                                        dt.token.name ||
                                        `${dt.token.address.slice(0, 4)}...${dt.token.address.slice(-4)}`,
                                    )}
                                  </span>
                                  <span className="text-xs text-[#52525b]">
                                    {age} ago
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              {isMigrated ? (
                                <span className="text-[#18c48c]">✓</span>
                              ) : (
                                <span className="text-[#F0616D]">
                                  <IoIosCloseCircleOutline size={16} />
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[#d4d4d8]">
                              {formatUsdShort(dt.marketCap)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[#d4d4d8]">
                              {formatUsdShort(dt.liquidity)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {toast && (
        <div className="animate-fade-in fixed top-12 left-1/2 z-50 -translate-x-1/2 rounded-md border border-white/[0.08] bg-[#0c0e12] px-4 py-2 text-sm font-semibold text-[#f4f4f5]">
          {toast}
        </div>
      )}
      <style jsx global>{`
        .dark-datepicker,
        .dark-datepicker .react-datepicker__header,
        .dark-datepicker .react-datepicker__month,
        .dark-datepicker .react-datepicker__day,
        .dark-datepicker .react-datepicker__day-name,
        .dark-datepicker .react-datepicker__current-month,
        .dark-datepicker .react-datepicker__year-dropdown,
        .dark-datepicker .react-datepicker__month-dropdown {
          background: #18181b !important;
          color: #fff !important;
          border-color: #27272a !important;
        }
        .dark-datepicker .react-datepicker__day--selected,
        .dark-datepicker .react-datepicker__day--keyboard-selected {
          background: #2563eb !important;
          color: #fff !important;
        }
        .dark-datepicker .react-datepicker__day:hover {
          background: #334155 !important;
          color: #fff !important;
        }
        .dark-datepicker .react-datepicker__month-dropdown,
        .dark-datepicker .react-datepicker__year-dropdown {
          background: #18181b !important;
          color: #fff !important;
        }
        .dark-datepicker .react-datepicker__navigation-icon::before {
          border-color: #fff !important;
        }
      `}</style>
    </InterstatePopout>
  );
};

export default WalletScanPanel;
