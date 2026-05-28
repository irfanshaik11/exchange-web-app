import React, { useEffect, useState, useMemo, useRef } from "react";
import type { Wallet, TradeRow } from "~/utils/functions";
import { formatSmartNumber, fetchWalletBalance } from "~/utils/functions";
import InterstatePopout from "./InterstatePopout";
import { FaRegCopy, FaCheck, FaExternalLinkAlt } from "react-icons/fa";
import { FiExternalLink } from "react-icons/fi";
import type { Token } from "~/utils/db";
import { getWalletSolBalance } from "~/utils/walletTracking";
import { useWalletTracker } from "./WalletTrackerContext";
import Activity from "./trade/Activity";
import { useSolPrice } from "./SolPriceContext";
import RealizedPnlChart, {
  type PnlChartDataPoint,
} from "./charts/RealizedPnlChart";
import FastImage from "./FastImage";
import useDevTokensByWallet from "../hooks/useDevTokensByWallet";
import { IoIosCloseCircleOutline } from "react-icons/io";
import { getProtocolBranding } from "~/utils/protocolBranding";
import Image from "next/image";
import { useImagePreloader } from "~/hooks/useImagePreloader";
import { extractTokenImage } from "~/utils/images";
import {
  useWalletScan,
  toAggregatedPosition,
  positionToClosedOrder,
  type AggregatedPosition,
  type ClosedOrder,
} from "~/hooks/useWalletScan";

interface WalletScanPanelProps {
  wallet: Wallet;
  onClose: () => void;
}

const TABS = [
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
  const [tab, setTab] = useState("Activity");

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

  // ─── Derived data from Go token service ──────────────────────────────────────
  const allAggregatedPositions = useMemo(
    () => goPositions.map((p) => toAggregatedPosition(p, currentSolPrice)),
    [goPositions, currentSolPrice],
  );

  const aggregatedPositions = useMemo(
    () => allAggregatedPositions.filter((p) => p.isOpen),
    [allAggregatedPositions],
  );

  const closedOrders = useMemo((): ClosedOrder[] => {
    const closed = goPositions
      .filter((p) => p.remaining_tokens <= 0.001)
      .map((p) => positionToClosedOrder(p, currentSolPrice));
    return closed.sort((a, b) => b.closedAt - a.closedAt);
  }, [goPositions, currentSolPrice]);

  // Calculate performance metrics from closed orders
  const performanceMetrics = useMemo(() => {
    if (!closedOrders || closedOrders.length === 0) {
      // Even with no closed orders, the summary may have realized PnL
      // (positions endpoint doesn't capture all trades).
      const summaryPnl = goSummary
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

    // For "Max" range, use the summary's authoritative total rather than
    // summing per-position PnL (positions don't capture all trades).
    const positionPnl = filteredOrders.reduce(
      (sum, order) => sum + order.pnl,
      0,
    );
    const totalPnl =
      selectedRange === "Max" && goSummary
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
  }, [closedOrders, selectedRange, goSummary, currentSolPrice]);

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

    return points;
  }, [closedOrders, selectedRange]);

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
    return goTrades.map((t, idx) => {
      const date = new Date(t.created_at);
      const usdValue =
        t.price_usd > 0 && t.token_amount > 0
          ? t.price_usd * t.token_amount
          : t.sol_amount * currentSolPrice;
      return {
        id: idx,
        tokenAddress: t.token_mint,
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
      };
    });
  }, [goTrades, currentSolPrice]);

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
        <div className="relative flex w-full flex-col items-center gap-3 border border-neutral-700 bg-black px-6 py-8 text-center shadow-2xl">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
            aria-label="Close"
          >
            <IoIosCloseCircleOutline className="h-5 w-5" />
          </button>
          <div className="text-lg font-semibold text-white">
            {wallet.name || "Wallet"}
          </div>
          <div className="font-mono text-xs text-neutral-400">
            {truncatedAddress}
          </div>
          <div className="mt-2 text-sm font-medium text-pink-400">
            Monad wallet scan coming soon
          </div>
          <p className="max-w-[360px] text-xs leading-relaxed text-neutral-400">
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
      <div className="relative flex h-[calc(100vh-120px)] w-full flex-col border border-neutral-700 bg-black shadow-2xl">
        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-neutral-800 px-8 pt-6 pb-3">
          <div className="flex items-center gap-4">
            <span className="text-lg font-bold text-pink-400">
              {wallet.name || "Null"}
            </span>
            <span className="flex items-center gap-1 font-mono text-sm text-neutral-400">
              {typeof wallet.address === "string" && wallet.address.length >= 10
                ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
                : wallet.address || "—"}
              <button
                className="ml-1 rounded p-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-800"
                onClick={handleCopy}
                title="Copy address"
                type="button"
              >
                {copied ? (
                  <FaCheck className="text-base text-emerald-400" />
                ) : (
                  <FaRegCopy className="text-base" />
                )}
              </button>
              {copied && (
                <span className="ml-1 text-xs text-emerald-400">Copied!</span>
              )}
              {tokenBalanceLoading ||
              tokenLoading ? null : tokenBalanceError ? (
                <>
                  <span className="mx-2 text-neutral-500">|</span>
                  <span className="text-red-400">Error</span>
                </>
              ) : tokenBalance !== null && token ? (
                <>
                  <span className="mx-2 text-neutral-500">|</span>
                  <span className="text-neutral-300">
                    {tokenBalance} {token.symbol}
                  </span>
                </>
              ) : (
                <>
                  <span className="mx-2 text-neutral-500">|</span>
                  <span className="text-red-400">No balance</span>
                </>
              )}
            </span>
          </div>
          <div className="absolute top-1/2 right-16 flex -translate-y-1/2 items-center gap-4">
            <FaExternalLinkAlt
              className="cursor-pointer text-base text-neutral-500 hover:text-blue-400"
              title="Open in Solscan"
              onClick={() => {
                window.open(
                  `https://solscan.io/account/${wallet.address}`,
                  "_blank",
                );
                setToast("Wallet updated successfully");
              }}
            />
            <span className="mx-2 text-neutral-700">|</span>
            {timeRanges.map((label) => (
              <button
                key={label}
                className={`rounded px-2 py-1 text-xs font-semibold ${selectedRange === label ? "text-blue-400" : "text-neutral-400 hover:text-blue-400"} transition-colors hover:bg-neutral-800`}
                onClick={() => setSelectedRange(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="absolute top-1/2 right-4 -translate-y-1/2 rounded px-2 py-1 text-2xl font-bold text-neutral-400 transition-colors hover:text-white"
          >
            ×
          </button>
        </div>
        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top: Balance, PNL, Performance */}
          <div className="flex flex-row gap-8 px-8 pt-6 pb-2">
            {/* Balance */}
            <div className="min-w-[180px] flex-1">
              <div className="mt-2 text-xs text-neutral-500">
                Available Balance
              </div>
              <div className="text-lg font-semibold text-white">
                {loading ? (
                  <span className="animate-pulse text-neutral-500">
                    Loading...
                  </span>
                ) : walletBalance ? (
                  <div className="flex flex-col">
                    {typeof walletBalance.usd === "number" &&
                    Number.isFinite(walletBalance.usd) ? (
                      <span>${formatSmartNumber(walletBalance.usd)}</span>
                    ) : walletBalance.usdFormatted ? (
                      <span>{walletBalance.usdFormatted}</span>
                    ) : typeof walletBalance.sol === "number" &&
                      Number.isFinite(walletBalance.sol) ? (
                      <span>
                        $
                        {formatSmartNumber(walletBalance.sol * currentSolPrice)}
                      </span>
                    ) : (
                      <span className="text-red-400">No balance</span>
                    )}
                    <span className="text-sm font-normal text-neutral-400">
                      {walletBalance.sol.toFixed(4)} SOL
                    </span>
                  </div>
                ) : balance !== null ? (
                  <div className="flex flex-col">
                    <span>${formatSmartNumber(balance * currentSolPrice)}</span>
                    <span className="text-sm font-normal text-neutral-400">
                      {balance.toFixed(4)} SOL
                    </span>
                  </div>
                ) : (
                  <span className="text-red-400">No balance</span>
                )}
              </div>
            </div>
            {/* Realized PNL with chart */}
            <div className="flex min-w-[260px] flex-[2] flex-col">
              <div className="mb-1 flex items-center gap-2 text-xs text-neutral-400">
                Realized PNL
                <span
                  className="text-[10px] text-neutral-500"
                  title="Cumulative realized PnL from closed positions over the selected time range. Bars show per-trade PnL; the line shows running total."
                >
                  (i)
                </span>
              </div>
              <div
                className={`text-3xl font-bold ${performanceMetrics.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {performanceMetrics.totalPnl >= 0 ? "+" : "-"}$
                {formatSmartNumber(Math.abs(performanceMetrics.totalPnl))}
              </div>
              <div
                className={`text-sm font-semibold ${realizedPnlPercentage >= 0 ? "text-emerald-400/80" : "text-red-400/80"}`}
              >
                {realizedPnlPercentage >= 0 ? "+" : ""}
                {realizedPnlPercentage.toFixed(2)}%
              </div>
              <div className="mt-2 h-[180px] w-full">
                {positionsLoading ? (
                  <div className="flex h-full items-center justify-center text-xs text-neutral-500">
                    Loading chart...
                  </div>
                ) : pnlChartData.length <= 1 ? (
                  <div className="flex h-full items-center justify-center text-xs text-neutral-500">
                    No closed trades in this range
                  </div>
                ) : (
                  <RealizedPnlChart data={pnlChartData} />
                )}
              </div>
            </div>
            {/* Performance */}
            <div className="min-w-[180px] flex-1">
              <div className="mb-1 flex items-center gap-2 text-xs text-neutral-400">
                Performance
                <span
                  className="text-[10px] text-neutral-500"
                  title="Performance ranges show the number of positions with PNL in each range. Example: >500% means positions with more than 500% profit."
                >
                  (?)
                </span>
              </div>
              <div className="mb-2 flex flex-row items-center justify-between">
                <span className="text-xs text-neutral-400">
                  {selectedRange === "Max"
                    ? "Total PNL"
                    : `${selectedRange} PNL`}
                </span>
                <span className="text-xs text-neutral-400">
                  {selectedRange === "Max"
                    ? "Total TXNS"
                    : `${selectedRange} TXNS`}
                </span>
              </div>
              <div className="mb-2 flex flex-row items-center justify-between">
                <span className="font-semibold text-white">
                  {performanceMetrics.totalPnl >= 0 ? "+" : "-"}$
                  {formatSmartNumber(Math.abs(performanceMetrics.totalPnl))}
                </span>
                <span className="font-semibold text-white">
                  {performanceMetrics.completedTransactions} /{" "}
                  {performanceMetrics.totalTransactions}
                </span>
              </div>
              <div className="mt-2">
                <div className="mt-2 mb-2 flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="inline-block h-3 w-3 rounded-full bg-green-900" />
                    <span>&gt;500%</span>
                    <span className="ml-auto">
                      {performanceMetrics.categoryCounts.over500}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="inline-block h-3 w-3 rounded-full bg-green-700" />
                    <span>200% ~ 500%</span>
                    <span className="ml-auto">
                      {performanceMetrics.categoryCounts.twoHundredTo500}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="inline-block h-3 w-3 rounded-full bg-green-500" />
                    <span>0% ~ 200%</span>
                    <span className="ml-auto">
                      {performanceMetrics.categoryCounts.zeroTo200}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="inline-block h-3 w-3 rounded-full bg-rose-900" />
                    <span>0% ~ -50%</span>
                    <span className="ml-auto">
                      {performanceMetrics.categoryCounts.zeroToNeg50}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="inline-block h-3 w-3 rounded-full bg-rose-700" />
                    <span>&lt;-50%</span>
                    <span className="ml-auto">
                      {performanceMetrics.categoryCounts.underNeg50}
                    </span>
                  </div>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-neutral-800">
                  <div
                    className="h-2 rounded-full bg-pink-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, performanceMetrics.progressPercentage),
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          {/* Tabs */}
          <div className="mt-2 flex items-center justify-between border-b border-neutral-800 px-8">
            <div className="mt-2 flex flex-row gap-10 text-sm">
              {TABS.map((t) => {
                const label =
                  t === "Dev Tokens" ? `Dev Tokens (${devTokens.length})` : t;
                return (
                  <button
                    key={t}
                    className={`border-b-2 py-2 transition-colors duration-200 ${tab === t ? "border-blue-400 font-semibold text-blue-400" : "border-transparent text-neutral-400 hover:text-white"}`}
                    onClick={() => setTab(t)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Tab Content Area */}
          <div className="flex-1 overflow-auto px-8">
            {tab === "History" && (
              <div className="h-full w-full">
                {positionsLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="animate-pulse text-neutral-400">
                      Loading history...
                    </div>
                  </div>
                ) : goError && closedOrders.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-red-400">{goError}</div>
                  </div>
                ) : closedOrders.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-neutral-500">
                      No closed orders found
                    </div>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 border-b border-neutral-800 bg-black">
                      <tr className="text-xs text-neutral-400 uppercase">
                        <th className="px-4 py-3 text-left font-semibold">
                          Time
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Token
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          Bought
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          Sold
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          PnL
                        </th>
                        {/* <th className="px-4 py-3 text-center font-semibold">
                          Tx
                        </th> */}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
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
                            className="transition-colors hover:bg-neutral-800"
                          >
                            <td className="px-4 py-3 text-neutral-300">
                              <div className="font-mono text-sm">{timeAgo}</div>
                            </td>
                            <td className="px-4 py-3">
                              {(() => {
                                const protocolSource =
                                  order.launchpadProtocol ||
                                  (order.mint?.toLowerCase().endsWith("pump")
                                    ? "pumpfun"
                                    : "");
                                const branding = getProtocolBranding(
                                  protocolSource || "",
                                );
                                const protocolColor = branding.color;
                                const tokenIcon = branding.iconUrl;
                                const isFullCircleImage = branding.isFullCircle;
                                const shortAddress = order.mint
                                  ? `${order.mint.slice(0, 4)}...${order.mint.slice(-4)}`
                                  : "";
                                return (
                                  <div className="flex items-center gap-3">
                                    <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center">
                                      <div
                                        className="relative rounded-lg transition-all duration-300 ease-out"
                                        style={{
                                          border: protocolSource
                                            ? `1px solid ${protocolColor}`
                                            : "1px solid rgba(128, 128, 128, 0.3)",
                                          padding: "2px",
                                        }}
                                      >
                                        <div
                                          className="relative rounded-lg"
                                          style={{
                                            border:
                                              "1px solid rgba(192, 192, 192, 0.5)",
                                            padding: "2px",
                                          }}
                                        >
                                          <div className="relative h-10 w-10 overflow-hidden rounded-lg">
                                            <FastImage
                                              src={order.imageUrl || ""}
                                              alt={
                                                displayName ||
                                                displaySymbol ||
                                                "Token"
                                              }
                                              symbol={
                                                displaySymbol || undefined
                                              }
                                              name={displayName || undefined}
                                              width={40}
                                              height={40}
                                              className="h-full w-full object-cover"
                                              showBubble={false}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                      {protocolSource && tokenIcon && (
                                        <div
                                          className="absolute right-0 bottom-0 z-10 flex translate-x-1/4 translate-y-1/4 items-center justify-center rounded-full bg-white"
                                          style={{
                                            width: 18,
                                            height: 18,
                                            border: `2px solid ${protocolColor}`,
                                            boxShadow: `0 0 4px ${protocolColor}60`,
                                          }}
                                        >
                                          <Image
                                            src={tokenIcon}
                                            alt={`${protocolSource} logo`}
                                            width={14}
                                            height={14}
                                            className={`${isFullCircleImage ? "h-full w-full object-cover" : "h-3/4 w-3/4 object-contain"} rounded-full`}
                                          />
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex min-w-0 flex-col">
                                      <span
                                        className="truncate text-sm font-medium text-neutral-100"
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
                                          className="truncate font-mono text-xs text-neutral-400"
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
                            <td className="px-4 py-3 text-right text-neutral-300">
                              {boughtDisplay}
                            </td>
                            <td className="px-4 py-3 text-right text-neutral-300">
                              {soldDisplay}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex flex-col items-end">
                                <div
                                  className={`font-semibold ${
                                    order.pnl >= 0
                                      ? "text-emerald-400"
                                      : "text-red-400"
                                  }`}
                                >
                                  {pnlDisplay}
                                </div>
                                <div
                                  className={`text-xs ${
                                    order.pnlPercentage >= 0
                                      ? "text-emerald-400/70"
                                      : "text-red-400/70"
                                  }`}
                                >
                                  {pnlPercentageDisplay}
                                </div>
                              </div>
                            </td>
                            {/* <td className="px-4 py-3 text-center">
                                <a
                                  href={`https://solscan.io/tx/${order.sellTrade.tx}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 transition-colors hover:text-blue-300"
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
                  <div className="flex h-full items-center justify-center">
                    <div className="animate-pulse text-neutral-400">
                      Loading positions...
                    </div>
                  </div>
                ) : aggregatedPositions.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-neutral-500">
                      No active positions found
                    </div>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 border-b border-neutral-800 bg-black">
                      <tr className="text-xs text-neutral-400 uppercase">
                        <th className="px-4 py-3 text-left font-semibold">
                          Token
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          Bought
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          Sold
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          Remaining
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          PNL ↑
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          $
                        </th>
                        <th className="px-4 py-3 text-right font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {aggregatedPositions.map((position, idx) => {
                        const displayName =
                          position.tokenName || position.tokenSymbol || null;
                        const displaySymbol =
                          position.tokenSymbol ||
                          position.tokenName ||
                          position.mint?.slice(0, 8) + "..." ||
                          "Unknown";
                        const imageUrl = position.imageUrl || "";

                        return (
                          <tr
                            key={position.mint || idx}
                            className="transition-colors hover:bg-neutral-800/60"
                          >
                            <td
                              className="cursor-pointer px-4 py-2"
                              onClick={() => {
                                const addr = position.mint;
                                if (addr) {
                                  window.open(`/trade/${addr}`, "_blank");
                                }
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-neutral-800">
                                  <FastImage
                                    src={imageUrl}
                                    alt={
                                      displayName || displaySymbol || "Token"
                                    }
                                    symbol={displaySymbol || undefined}
                                    name={displayName || undefined}
                                    width={32}
                                    height={32}
                                    className="h-full w-full object-cover"
                                    showBubble={false}
                                  />
                                </div>
                                <div className="flex min-w-0 flex-col">
                                  <span
                                    className="truncate text-sm font-semibold text-white hover:text-blue-400"
                                    title={position.mint || undefined}
                                  >
                                    {truncateTokenName(
                                      displayName || displaySymbol,
                                    )}
                                  </span>
                                  <span className="truncate text-[11px] text-neutral-500">
                                    {displaySymbol}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-semibold text-neutral-100">
                                  ${formatSmartNumber(position.boughtValue)}
                                </span>
                                <span className="text-xs text-neutral-500">
                                  {formatSmartNumber(position.boughtAmount)}{" "}
                                  {displaySymbol}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-semibold text-neutral-100">
                                  ${formatSmartNumber(position.soldValue)}
                                </span>
                                <span className="text-xs text-neutral-500">
                                  {formatSmartNumber(position.soldAmount)}{" "}
                                  {displaySymbol}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-semibold text-neutral-100">
                                  ${formatSmartNumber(position.remainingValue)}
                                </span>
                                <span className="text-xs text-neutral-500">
                                  {formatSmartNumber(position.remainingAmount)}{" "}
                                  {displaySymbol}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span
                                className={`font-semibold ${
                                  position.pnlPercentage >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                              >
                                {position.pnlPercentage >= 0 ? "+" : ""}
                                {position.pnlPercentage.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span
                                className={`font-semibold ${
                                  position.totalPnl >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                              >
                                {position.totalPnl >= 0 ? "+" : ""}$
                                {formatSmartNumber(Math.abs(position.totalPnl))}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button
                                className="text-neutral-400 transition-colors hover:text-white"
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
                    <div className="animate-pulse text-neutral-400">
                      Loading top positions...
                    </div>
                  </div>
                ) : top100Positions.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-neutral-500">No positions found</div>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 border-b border-neutral-800 bg-black">
                      <tr className="text-xs text-neutral-400 uppercase">
                        <th className="px-4 py-3 text-left font-semibold">
                          Token
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          Bought
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          Sold
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          PNL ↑
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          $
                        </th>
                        <th className="px-4 py-3 text-right font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {top100Positions.map((position, idx) => {
                        const displayName =
                          position.tokenName || position.tokenSymbol || null;
                        const displaySymbol =
                          position.tokenSymbol ||
                          position.tokenName ||
                          position.mint?.slice(0, 8) + "..." ||
                          "Unknown";
                        const imageUrl = position.imageUrl || "";

                        return (
                          <tr
                            key={position.mint || idx}
                            className="transition-colors hover:bg-neutral-800/60"
                          >
                            <td
                              className="cursor-pointer px-4 py-2"
                              onClick={() => {
                                const addr = position.mint;
                                if (addr) {
                                  window.open(`/trade/${addr}`, "_blank");
                                }
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-neutral-800">
                                  <FastImage
                                    src={imageUrl}
                                    alt={
                                      displayName || displaySymbol || "Token"
                                    }
                                    symbol={displaySymbol || undefined}
                                    name={displayName || undefined}
                                    width={32}
                                    height={32}
                                    className="h-full w-full object-cover"
                                    showBubble={false}
                                  />
                                </div>
                                <div className="flex min-w-0 flex-col">
                                  <span
                                    className="truncate text-sm font-semibold text-white hover:text-blue-400"
                                    title={position.mint || undefined}
                                  >
                                    {truncateTokenName(
                                      displayName || displaySymbol,
                                    )}
                                  </span>
                                  <span className="truncate text-[11px] text-neutral-500">
                                    {displaySymbol}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-semibold text-neutral-100">
                                  ${formatSmartNumber(position.boughtValue)}
                                </span>
                                <span className="text-xs text-neutral-500">
                                  {formatSmartNumber(position.boughtAmount)}{" "}
                                  {displaySymbol}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-semibold text-neutral-100">
                                  ${formatSmartNumber(position.soldValue)}
                                </span>
                                <span className="text-xs text-neutral-500">
                                  {formatSmartNumber(position.soldAmount)}{" "}
                                  {displaySymbol}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span
                                className={`font-semibold ${
                                  position.pnlPercentage >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                              >
                                {position.pnlPercentage >= 0 ? "+" : ""}
                                {position.pnlPercentage.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span
                                className={`font-semibold ${
                                  position.totalPnl >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                              >
                                {position.totalPnl >= 0 ? "+" : ""}$
                                {formatSmartNumber(Math.abs(position.totalPnl))}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button
                                className="text-neutral-400 transition-colors hover:text-white"
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
                    <div className="animate-pulse text-neutral-400">
                      Loading activity...
                    </div>
                  </div>
                ) : goError && activityData.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-red-400">{goError}</div>
                  </div>
                ) : activityData.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-neutral-500">No activity found</div>
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
                    <div className="animate-pulse text-neutral-400">
                      Loading dev tokens...
                    </div>
                  </div>
                ) : devTokens.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-neutral-500">
                      No tokens launched by this wallet
                    </div>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 border-b border-neutral-800 bg-black text-xs text-neutral-400">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">
                          Token
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Migrated
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          Market Cap
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          Liquidity
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
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
                            className="cursor-pointer transition-colors hover:bg-neutral-800"
                            onClick={() =>
                              window.open(
                                `/trade/${dt.token.address}`,
                                "_blank",
                              )
                            }
                          >
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span
                                  className="font-semibold text-white"
                                  title={dt.token.address}
                                >
                                  {truncateTokenName(
                                    dt.token.symbol ||
                                      dt.token.name ||
                                      `${dt.token.address.slice(0, 4)}...${dt.token.address.slice(-4)}`,
                                  )}
                                </span>
                                <span className="text-xs text-neutral-500">
                                  {age} ago
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {isMigrated ? (
                                <span className="text-emerald-400">✓</span>
                              ) : (
                                <span className="text-rose-400">
                                  <IoIosCloseCircleOutline size={16} />
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-neutral-300">
                              {formatUsdShort(dt.marketCap)}
                            </td>
                            <td className="px-4 py-3 text-right text-neutral-300">
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
        <div className="animate-fade-in fixed top-12 left-1/2 z-50 -translate-x-1/2 rounded-md bg-neutral-800 px-4 py-2 text-sm font-semibold text-white shadow-md">
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
