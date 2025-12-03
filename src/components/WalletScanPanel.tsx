import React, { useEffect, useState, useMemo } from "react";
import type { Wallet, TradeRow } from "~/utils/functions";
import {
  formatSmartNumber,
  scanWallet,
  transformWalletScanToTradeRows,
} from "~/utils/functions";
import InterstatePopout from "./InterstatePopout";
import {
  FaRegCopy,
  FaCheck,
  FaStar,
  FaSearch,
  FaRegChartBar,
  FaBell,
  FaExternalLinkAlt,
  FaArrowUp,
  FaArrowDown,
  FaRegCalendar,
} from "react-icons/fa";
import { FiExternalLink } from "react-icons/fi";
import PriceChartWidget from "./PriceChartWidget";
import type { Token } from "~/utils/db";
import { AiOutlineCalendar } from "react-icons/ai";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { batchFetchChainTokenMetadata } from "~/utils/tokenMetadata";
import {
  getWalletSolBalance,
  getWalletTransactions,
  getWalletHistory,
  getWalletTradeHistory,
  type TradeEvent,
} from "~/utils/walletTracking";
import { useWalletTracker } from "./WalletTrackerContext";
import Activity from "./trade/Activity";

interface WalletScanPanelProps {
  wallet: Wallet;
  onClose: () => void;
}

const TABS = ["Active Positions", "History", "Top 100", "Activity"];

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
  const { latestTrades } = useWalletTracker();

  // Live data state
  const [balance, setBalance] = useState<number | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("Activity");

  // Wallet scan state
  const [scanData, setScanData] = useState<TradeRow[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  
  // Activity data - using same history source as History tab
  const [activityData, setActivityData] = useState<TradeRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<{
    sol: number;
    usd: number;
    usdFormatted: string | null;
  } | null>(null);

  // History data - using TradeEvent format (same as Live Trades)
  const [history, setHistory] = useState<TradeEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [tokenMetadata, setTokenMetadata] = useState<
    Map<string, { symbol?: string | null; name?: string | null }>
  >(new Map());
  const [token, setToken] = useState<Token | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [tokenBalanceLoading, setTokenBalanceLoading] = useState(true);
  const [tokenBalanceError, setTokenBalanceError] = useState<string | null>(
    null,
  );
  const [isFavorite, setIsFavorite] = useState(false);
  const [notify, setNotify] = useState(false);
  const [selectedRange, setSelectedRange] = useState("Max");
  const timeRanges = ["1d", "7d", "30d", "Max"];
  const [toast, setToast] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currency, setCurrency] = useState<"USD" | "SOL">("USD");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Calculate performance metrics from history
  const performanceMetrics = useMemo(() => {
    if (!history || history.length === 0) {
      return {
        totalPnl: 0,
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
    let filteredHistory = history;
    if (selectedRange !== "Max") {
      const windowMs =
        selectedRange === "1d"
          ? 24 * 60 * 60 * 1000
          : selectedRange === "7d"
            ? 7 * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000;
      const cutoff = now - windowMs;
      filteredHistory = history.filter((trade) => trade.at >= cutoff);
    }

    // Group trades by mint (token) to calculate position PNL
    const positions = new Map<
      string,
      {
        buys: Array<{ amount: number; cost: number; timestamp: number }>;
        sells: Array<{ amount: number; revenue: number; timestamp: number }>;
      }
    >();

    // Process all trades
    filteredHistory.forEach((trade) => {
      if (!trade.mint) return;

      const amount = typeof trade.amount === "number" ? trade.amount : 0;
      const priceUsd = trade.price_usd ?? null;
      const solSpent = trade.sol_spent ?? null;

      // Calculate USD value
      let usdValue: number | null = null;
      if (priceUsd !== null && Number.isFinite(amount) && Number.isFinite(priceUsd)) {
        usdValue = amount * priceUsd;
      } else if (solSpent !== null && Number.isFinite(solSpent)) {
        // Approximate: 1 SOL ≈ $150 (fallback, but ideally we'd have price_usd)
        usdValue = solSpent * 150;
      }

      if (usdValue === null || !Number.isFinite(usdValue) || usdValue <= 0) return;

      if (!positions.has(trade.mint)) {
        positions.set(trade.mint, { buys: [], sells: [] });
      }

      const position = positions.get(trade.mint)!;

      if (trade.side === "buy") {
        position.buys.push({
          amount,
          cost: usdValue,
          timestamp: trade.at,
        });
      } else if (trade.side === "sell") {
        position.sells.push({
          amount,
          revenue: usdValue,
          timestamp: trade.at,
        });
      }
    });

    // Calculate PNL for each position using FIFO
    const positionPnls: Array<{ pnl: number; pnlPercentage: number }> = [];

    positions.forEach((position, mint) => {
      // Sort buys and sells by timestamp
      position.buys.sort((a, b) => a.timestamp - b.timestamp);
      position.sells.sort((a, b) => a.timestamp - b.timestamp);

      // FIFO matching: match sells with buys
      let totalCost = 0;
      let totalRevenue = 0;
      let remainingBuys = [...position.buys];
      let totalBoughtAmount = position.buys.reduce((sum, b) => sum + b.amount, 0);
      let totalSoldAmount = position.sells.reduce((sum, s) => sum + s.amount, 0);

      // Only calculate PNL for completed positions (where we have both buys and sells)
      if (totalBoughtAmount > 0 && totalSoldAmount > 0) {
        // Match sells to buys using FIFO
        for (const sell of position.sells) {
          let remainingSellAmount = sell.amount;
          let sellCost = 0;

          while (remainingSellAmount > 0 && remainingBuys.length > 0) {
            const buy = remainingBuys[0];
            const matchedAmount = Math.min(remainingSellAmount, buy.amount);
            const costPerUnit = buy.cost / buy.amount;
            sellCost += matchedAmount * costPerUnit;

            buy.amount -= matchedAmount;
            remainingSellAmount -= matchedAmount;

            if (buy.amount <= 0) {
              remainingBuys.shift();
            }
          }

          totalCost += sellCost;
          totalRevenue += sell.revenue;
        }

        // Calculate PNL
        const pnl = totalRevenue - totalCost;
        const pnlPercentage = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

        if (Number.isFinite(pnl) && Number.isFinite(pnlPercentage)) {
          positionPnls.push({ pnl, pnlPercentage });
        }
      }
    });

    // Calculate totals
    const totalPnl = positionPnls.reduce((sum, p) => sum + p.pnl, 0);
    const totalTransactions = filteredHistory.length;
    const completedTransactions = positionPnls.length;

    // Categorize by PNL percentage
    const categoryCounts = {
      over500: 0,
      twoHundredTo500: 0,
      zeroTo200: 0,
      zeroToNeg50: 0,
      underNeg50: 0,
    };

    positionPnls.forEach(({ pnlPercentage }) => {
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
    const winningPositions = positionPnls.filter((p) => p.pnl > 0).length;
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
  }, [history, selectedRange]);

  // Convert TradeEvent to TradeRow format for Activity component
  const convertTradeEventToTradeRow = (trade: TradeEvent, index: number): TradeRow => {
    const timestamp = trade.at || Date.now();
    const date = new Date(timestamp);
    
    // Calculate USD value - prioritize price_usd * amount, fallback to sol_spent
    let usdValue: number = 0;
    if (trade.price_usd !== null && trade.price_usd !== undefined && 
        Number.isFinite(trade.price_usd) && 
        trade.amount !== null && trade.amount !== undefined && 
        Number.isFinite(trade.amount)) {
      usdValue = Math.abs(trade.amount * trade.price_usd);
    } else if (trade.sol_spent !== null && trade.sol_spent !== undefined && 
               Number.isFinite(trade.sol_spent)) {
      // Fallback: use sol_spent (will be converted to USD by Activity component using SOL price)
      usdValue = Math.abs(trade.sol_spent);
    }
    
    return {
      id: index,
      tokenAddress: trade.mint,
      pairAddress: trade.pair_address,
      blockchain: 'sol',
      tradeTime: date.toISOString(),
      type: trade.side === 'buy' ? 'Buy' : 'Sell',
      marketCap: trade.market_cap_usd || 0,
      solAmount: trade.sol_spent || 0,
      tokenAmount: trade.amount || 0,
      usdValue: usdValue,
      transactionHash: trade.tx,
      createdAt: date.toISOString(),
      tokenName: trade.name || trade.symbol || undefined,
    };
  };

  useEffect(() => {
    if (!wallet?.address) return;

    setLoading(true);
    setScanLoading(true);
    setError(null);
    setScanError(null);

    // Call scan-wallet backend API (for balance and initial scan)
    scanWallet(wallet.address, 100)
      .then((data) => {
        // Set wallet balance from scan
        setWalletBalance(data.balance);
        setBalance(data.balance.sol);

        // Transform and set scan data (keep for backward compatibility)
        const tradeRows = transformWalletScanToTradeRows(data);
        setScanData(tradeRows);
      })
      .catch((err) => {
        console.error("Error scanning wallet:", err);
        setScanError(err.message || "Failed to scan wallet");
        setScanData([]);

        // Fallback to old method if scan fails
        getWalletSolBalance(wallet.address)
          .then((balance) => setBalance(balance))
          .catch(() => setBalance(null));
      })
      .finally(() => {
        setLoading(false);
        setScanLoading(false);
      });
  }, [wallet.address]);

  // Fetch activity data when Activity tab is selected - show ALL chain activity (not wallet-specific)
  useEffect(() => {
    if (tab !== 'Activity') return;
    
    setActivityLoading(true);
    setActivityError(null);
    
    // Activity tab shows ALL trades from the chain (not filtered by wallet)
    // Use all latestTrades from context (all wallets, all activity)
    const allRealTimeTrades = latestTrades; // Don't filter by wallet - show all chain activity
    
    // For Activity tab, we want to show recent global activity
    // Since we don't have a global trades endpoint, we'll use latestTrades which contains
    // all trades from watched wallets (which represents recent chain activity)
    const fetchActivity = async () => {
      try {
        // Convert all real-time trades to TradeRow format
        // These are already sorted by timestamp (newest first) from the context
        const activityRows = allRealTimeTrades
          .sort((a, b) => b.at - a.at)
          .slice(0, 200) // Limit to 200 most recent
          .map((trade, idx) => convertTradeEventToTradeRow(trade, idx));
        
        console.log("[Activity] Showing all chain activity:", {
          totalTrades: allRealTimeTrades.length,
          displayed: activityRows.length
        });
        
        setActivityData(activityRows);
      } catch (err) {
        console.error("[Activity] Error:", err);
        setActivityError(
          typeof err === 'object' && err !== null && 'message' in err && typeof err.message === "string"
            ? err.message
            : "Failed to load activity",
        );
        setActivityData([]);
      } finally {
        setActivityLoading(false);
      }
    };
    
    fetchActivity();
  }, [tab, latestTrades]);

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

  // Fetch SPL token balance
  useEffect(() => {
    if (!wallet.address || !token || !token.pair_address) return;
    setTokenBalanceLoading(true);
    setTokenBalanceError(null);

    // Get token accounts by owner via secure backend endpoint
    const backendUrl = process.env.NEXT_PUBLIC_WALLET_TRACKER_URL || "";

    fetch(
      `${backendUrl}/api/token-accounts/${encodeURIComponent(wallet.address)}?mint=${encodeURIComponent(token.pair_address)}`,
    )
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok || !data.accounts || data.accounts.length === 0) {
          setTokenBalance(0);
          return;
        }
        // Use the first account (most users have one)
        const amount =
          data.accounts[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
        setTokenBalance(typeof amount === "number" ? amount : 0);
      })
      .catch(() => setTokenBalanceError("Failed to fetch token balance"))
      .finally(() => setTokenBalanceLoading(false));
  }, [wallet.address, token && token.pair_address]);

  // Fetch history when History tab is selected - using same data source as Live Trades
  useEffect(() => {
    if (tab !== "History" || !wallet?.address) return;

    setHistoryLoading(true);
    setHistoryError(null);

    // Get real-time trades from context filtered by wallet address
    const realTimeTrades = latestTrades.filter(
      (trade) => trade.wallet.toLowerCase() === wallet.address.toLowerCase(),
    );

    // Fetch historical data using the same function as Live Trades
    const fetchHistory = async () => {
      try {
        const historicalTrades = await getWalletTradeHistory([wallet.address], {
          limit: 100,
          windowMs: 7 * 24 * 60 * 60 * 1000, // 7 days, same as Live Trades
        });

        // Merge real-time and historical trades, removing duplicates by tx
        const tradeMap = new Map<string, TradeEvent>();

        // Add historical trades first
        historicalTrades.forEach((trade) => {
          tradeMap.set(trade.tx, trade);
        });

        // Add real-time trades (they will overwrite historical if same tx, keeping latest)
        realTimeTrades.forEach((trade) => {
          const existing = tradeMap.get(trade.tx);
          if (!existing || trade.at > existing.at) {
            tradeMap.set(trade.tx, trade);
          }
        });

        // Convert to array and sort by timestamp (newest first)
        const mergedTrades = Array.from(tradeMap.values()).sort(
          (a, b) => b.at - a.at,
        );

        console.log("[History] Merged trades:", {
          realTime: realTimeTrades.length,
          historical: historicalTrades.length,
          merged: mergedTrades.length,
        });

        setHistory(mergedTrades);
      } catch (err) {
        console.error("[History] Error:", err);
        setHistoryError(
          typeof err === "object" &&
            err !== null &&
            "message" in err &&
            typeof err.message === "string"
            ? err.message
            : "Failed to load trading history",
        );
        // Fallback to just real-time trades if historical fetch fails
        setHistory(realTimeTrades);
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [tab, wallet?.address, latestTrades]);

  // Fetch token metadata for all mints in history
  useEffect(() => {
    if (history.length === 0) return;

    // Extract unique mints that don't have symbol/name
    const mintsToFetch = history
      .filter((trade) => trade.mint && (!trade.symbol || !trade.name))
      .map((trade) => trade.mint)
      .filter((mint, idx, arr) => arr.indexOf(mint) === idx); // unique

    if (mintsToFetch.length === 0) return;

    console.log(
      "[History] Fetching metadata for",
      mintsToFetch.length,
      "tokens",
    );

    batchFetchChainTokenMetadata(mintsToFetch)
      .then((metadata) => {
        console.log("[History] Fetched token metadata:", metadata);
        setTokenMetadata(metadata);
      })
      .catch((err) => {
        console.error("[History] Error fetching token metadata:", err);
      });
  }, [history]);

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

  return (
    <InterstatePopout
      open={true}
      onClose={onClose}
      align="center"
      zIndex={9999}
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
              <span className="mx-2 text-neutral-500">|</span>
              {tokenBalanceLoading || tokenLoading ? (
                <span className="animate-pulse text-neutral-500">—</span>
              ) : tokenBalanceError ? (
                <span className="text-red-400">Error</span>
              ) : tokenBalance !== null && token ? (
                <span className="text-neutral-300">
                  {tokenBalance} {token.symbol}
                </span>
              ) : (
                <span className="text-red-400">No balance</span>
              )}
            </span>
          </div>
          <div className="absolute top-1/2 right-16 flex -translate-y-1/2 items-center gap-4">
            <FaStar
              className={`cursor-pointer text-base transition-colors ${isFavorite ? "text-yellow-400" : "text-neutral-500 hover:text-yellow-400"}`}
              title="Track Wallet"
              onClick={() => {
                setIsFavorite((fav) => !fav);
                setToast("Wallet updated successfully");
              }}
            />
            <FaBell
              className={`cursor-pointer text-base transition-colors ${notify ? "text-blue-400" : "text-neutral-500 hover:text-blue-400"}`}
              title="Notify"
              onClick={() => {
                setNotify((n) => !n);
                setToast("Wallet updated successfully");
              }}
            />
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
            <FaSearch
              className="cursor-pointer text-base text-neutral-500 hover:text-blue-400"
              title="Search on Solscan"
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
              <div className="mb-1 text-xs text-neutral-400">Balance</div>
              <div className="text-3xl font-bold text-white">
                {tokenLoading ? (
                  <span className="animate-pulse text-neutral-500">—</span>
                ) : !token || typeof token.usd_price !== "number" ? (
                  <span className="text-red-400">No price data</span>
                ) : (
                  `$${token.usd_price.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
                )}
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                Unrealized PNL
              </div>
              <div className="text-lg font-semibold text-white">$0</div>
              <div className="mt-2 text-xs text-neutral-500">
                Available Balance
              </div>
              <div className="text-lg font-semibold text-white">
                {scanLoading || loading ? (
                  <span className="animate-pulse text-neutral-500">
                    Loading...
                  </span>
                ) : walletBalance ? (
                  <div className="flex flex-col">
                    <span>{walletBalance.sol.toFixed(4)} SOL</span>
                    {walletBalance.usdFormatted && (
                      <span className="text-sm font-normal text-neutral-400">
                        {walletBalance.usdFormatted}
                      </span>
                    )}
                  </div>
                ) : balance !== null ? (
                  `${balance.toFixed(4)} SOL`
                ) : (
                  <span className="text-red-400">No balance</span>
                )}
              </div>
            </div>
            {/* PNL with TradingView Chart */}
            <div className="flex min-w-[180px] flex-1 flex-col justify-between">
              <div className="flex w-full flex-row items-start justify-between">
                <div className="mt-1 mb-1 w-full pl-2 text-left text-xs text-neutral-400">
                  PNL
                </div>
                <div className="relative mt-1 mr-2">
                  <button
                    className="rounded p-1 text-neutral-400 transition-colors hover:text-blue-400"
                    title={
                      selectedDate
                        ? `Selected: ${selectedDate.toLocaleDateString()}`
                        : "Select date"
                    }
                    onClick={() => setShowDatePicker((v) => !v)}
                  >
                    <AiOutlineCalendar className="text-lg" />
                  </button>
                  {showDatePicker && (
                    <div className="absolute top-8 right-0 z-50">
                      <DatePicker
                        selected={selectedDate}
                        onChange={(date: Date | null) => {
                          setSelectedDate(date);
                          setShowDatePicker(false);
                        }}
                        inline
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="select"
                        calendarClassName="bg-neutral-900 text-white border border-neutral-700 rounded shadow-lg dark-datepicker"
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center">
                <div className="mb-2 font-mono text-4xl text-neutral-300">
                  {performanceMetrics.totalPnl >= 0 ? "+" : ""}
                  ${formatSmartNumber(Math.abs(performanceMetrics.totalPnl))}
                </div>
                <div className="h-1 w-2/3 rounded-full bg-neutral-700" />
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
                  {performanceMetrics.totalPnl >= 0 ? "+" : ""}
                  ${formatSmartNumber(Math.abs(performanceMetrics.totalPnl))}
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
              {TABS.map((t) => (
                <button
                  key={t}
                  className={`border-b-2 py-2 transition-colors duration-200 ${tab === t ? "border-blue-400 font-semibold text-blue-400" : "border-transparent text-neutral-400 hover:text-white"}`}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab !== "Activity" && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="rounded-full border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white focus:ring-2 focus:ring-blue-400 focus:outline-none"
                  style={{ minWidth: 120 }}
                />
                <button
                  className={`border border-neutral-700 px-3 py-1 text-xs font-semibold ${currency === "USD" ? "bg-blue-500 text-white" : "bg-neutral-800 text-neutral-300"} rounded-full transition-colors`}
                  onClick={() =>
                    setCurrency(currency === "USD" ? "SOL" : "USD")
                  }
                  style={{ minWidth: 56 }}
                >
                  {currency === "USD" ? "USD" : "SOL"}
                </button>
              </div>
            )}
          </div>
          {/* Tab Content Area */}
          <div className="flex-1 overflow-auto px-8">
            {tab === "History" && (
              <div className="h-full w-full">
                {historyLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="animate-pulse text-neutral-400">
                      Loading history...
                    </div>
                  </div>
                ) : historyError ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-red-400">{historyError}</div>
                  </div>
                ) : history.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-neutral-500">
                      No trading history found
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
                        <th className="px-4 py-3 text-center font-semibold">
                          Side
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
                        <th className="px-4 py-3 text-center font-semibold">
                          Tx
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {history
                        .filter((trade) => {
                          if (!searchTerm) return true;
                          const term = searchTerm.toLowerCase();
                          const metadata = tokenMetadata.get(trade.mint);
                          return (
                            trade.symbol?.toLowerCase().includes(term) ||
                            trade.name?.toLowerCase().includes(term) ||
                            metadata?.symbol?.toLowerCase().includes(term) ||
                            metadata?.name?.toLowerCase().includes(term) ||
                            trade.mint?.toLowerCase().includes(term) ||
                            trade.tx?.toLowerCase().includes(term)
                          );
                        })
                        .map((trade, idx) => {
                          // TradeEvent format: amount is number, price_usd, sol_spent, at (timestamp)
                          const amount =
                            typeof trade.amount === "number" ? trade.amount : 0;
                          const priceUsd = trade.price_usd ?? null;
                          const solSpent = trade.sol_spent ?? null;

                          // Calculate value and PnL
                          const value =
                            priceUsd !== null &&
                            Number.isFinite(amount) &&
                            Number.isFinite(priceUsd)
                              ? amount * priceUsd
                              : solSpent !== null && Number.isFinite(solSpent)
                                ? solSpent // Fallback to SOL spent if price not available
                                : null;

                          const pnl =
                            value !== null
                              ? trade.side === "sell"
                                ? value
                                : -value
                              : null;
                          const pnlDisplay =
                            pnl !== null && Number.isFinite(pnl)
                              ? `${pnl >= 0 ? "+" : "-"}$${formatSmartNumber(Math.abs(pnl))}`
                              : "—";

                          // Format time - TradeEvent uses 'at' (timestamp in ms)
                          const timeAgo = trade.at
                            ? formatTimeAgo(trade.at)
                            : "Unknown";

                          // Use fetched metadata as fallback - match notification logic
                          const metadata = tokenMetadata.get(trade.mint);
                          // Priority: name first (like notifications), then symbol, then mint
                          const displayName =
                            trade.name ||
                            metadata?.name ||
                            trade.symbol ||
                            metadata?.symbol ||
                            null;
                          const displaySymbol =
                            trade.symbol ||
                            metadata?.symbol ||
                            trade.name ||
                            metadata?.name ||
                            trade.mint?.slice(0, 8) + "..." ||
                            "Unknown";

                          // Format bought/sold amounts
                          const boughtDisplay =
                            trade.side === "buy" &&
                            Number.isFinite(amount) &&
                            amount > 0
                              ? currency === "USD" && priceUsd !== null
                                ? `$${formatSmartNumber(amount * priceUsd)}`
                                : solSpent !== null
                                  ? (
                                      <span className="flex items-center justify-end">
                                        <img 
                                          src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" 
                                          alt="SOL" 
                                          className="w-5 h-5 inline-block"
                                        />
                                        {formatSmartNumber(Math.abs(solSpent))}
                                      </span>
                                    )
                                  : `${formatSmartNumber(Math.abs(amount))} ${displaySymbol}`
                              : "—";

                          const soldDisplay =
                            trade.side === "sell" &&
                            Number.isFinite(amount) &&
                            amount > 0
                              ? currency === "USD" && priceUsd !== null
                                ? `$${formatSmartNumber(amount * priceUsd)}`
                                : `${formatSmartNumber(Math.abs(amount))}`
                              : "—";

                          return (
                            <tr
                              key={trade.tx || idx}
                              className="transition-colors hover:bg-neutral-800"
                            >
                              <td className="px-4 py-3 text-neutral-300">
                                <div className="font-mono text-sm">
                                  {timeAgo}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col">
                                  <span
                                    className="font-semibold text-white"
                                    title={trade.mint || undefined}
                                  >
                                    {displayName || displaySymbol}
                                  </span>
                                  {displayName &&
                                    displaySymbol &&
                                    displayName !== displaySymbol && (
                                      <span className="text-[10px] text-neutral-500">
                                        {displaySymbol}
                                      </span>
                                    )}
                                  {!displayName &&
                                    !displaySymbol &&
                                    trade.mint && (
                                      <span className="font-mono text-[10px] text-neutral-500">
                                        {trade.mint.slice(0, 4)}...
                                        {trade.mint.slice(-4)}
                                      </span>
                                    )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`rounded px-2 py-1 text-xs font-bold ${
                                    trade.side === "buy"
                                      ? "bg-emerald-900/30 text-emerald-400"
                                      : "bg-rose-900/30 text-rose-400"
                                  }`}
                                >
                                  {trade.side?.toUpperCase() || "—"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-neutral-300">
                                {boughtDisplay}
                              </td>
                              <td className="px-4 py-3 text-right text-neutral-300">
                                {soldDisplay}
                              </td>
                              <td className="px-4 py-3 text-right text-neutral-300">
                                {pnlDisplay}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <a
                                  href={`https://solscan.io/tx/${trade.tx}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 transition-colors hover:text-blue-300"
                                  title="View on Solscan"
                                >
                                  <FiExternalLink className="inline text-sm" />
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {tab === "Active Positions" && (
              <div className="flex h-full items-center justify-center text-neutral-500">
                Active Positions - Coming Soon
              </div>
            )}
            {tab === "Top 100" && (
              <div className="flex h-full items-center justify-center text-neutral-500">
                Top 100 - Coming Soon
              </div>
            )}
            {tab === "Activity" && (
              <div className="h-full w-full">
                {activityLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="animate-pulse text-neutral-400">
                      Loading activity...
                    </div>
                  </div>
                ) : activityError ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-red-400">{activityError}</div>
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
                    />
                  </div>
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
