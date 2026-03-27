const isDev = process.env.NODE_ENV !== 'production';

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
import { useSolPrice } from "./SolPriceContext";

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
  // Get SOL price from context
  const { solPrice } = useSolPrice();
  // Use SOL price with fallback if not available
  const currentSolPrice = solPrice > 0 ? solPrice : 150;

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
  
  // Closed orders (completed positions with PnL)
  interface ClosedOrder {
    mint: string;
    buyTrade: TradeEvent;
    sellTrade: TradeEvent;
    boughtAmount: number;
    soldAmount: number;
    boughtValue: number;
    soldValue: number;
    pnl: number;
    pnlPercentage: number;
    closedAt: number; // Timestamp of the sell (when position was closed)
  }
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

  // Calculate closed orders from history (only completed positions)
  const closedOrders = useMemo((): ClosedOrder[] => {
    if (!history || history.length === 0) return [];

    // Group trades by mint (token) to match buys with sells
    const positions = new Map<
      string,
      {
        buys: Array<{ trade: TradeEvent; amount: number; cost: number; timestamp: number }>;
        sells: Array<{ trade: TradeEvent; amount: number; revenue: number; timestamp: number }>;
      }
    >();

    // Process all trades
    history.forEach((trade) => {
      if (!trade.mint) return;

      const amount = typeof trade.amount === "number" ? trade.amount : 0;
      const priceUsd = trade.price_usd ?? null;
      const solSpent = trade.sol_spent ?? null;

      // Calculate USD value
      let usdValue: number | null = null;
      if (priceUsd !== null && Number.isFinite(amount) && Number.isFinite(priceUsd)) {
        usdValue = amount * priceUsd;
      } else if (solSpent !== null && Number.isFinite(solSpent)) {
        // Use current SOL price from context
        usdValue = solSpent * currentSolPrice;
      }

      if (usdValue === null || !Number.isFinite(usdValue) || usdValue <= 0) return;

      if (!positions.has(trade.mint)) {
        positions.set(trade.mint, { buys: [], sells: [] });
      }

      const position = positions.get(trade.mint)!;

      if (trade.side === "buy") {
        position.buys.push({
          trade,
          amount,
          cost: usdValue,
          timestamp: trade.at,
        });
      } else if (trade.side === "sell") {
        position.sells.push({
          trade,
          amount,
          revenue: usdValue,
          timestamp: trade.at,
        });
      }
    });

    // Match sells with buys using FIFO to create closed orders
    const closedOrdersList: ClosedOrder[] = [];

    positions.forEach((position, mint) => {
      // Sort buys and sells by timestamp (FIFO)
      position.buys.sort((a, b) => a.timestamp - b.timestamp);
      position.sells.sort((a, b) => a.timestamp - b.timestamp);

      let remainingBuys = [...position.buys];

      // Match each sell with buys using FIFO
      for (const sell of position.sells) {
        let remainingSellAmount = sell.amount;
        let matchedBuys: Array<{ buy: typeof position.buys[0]; matchedAmount: number }> = [];
        let totalCost = 0;

        // Match this sell with buys in FIFO order
        while (remainingSellAmount > 0 && remainingBuys.length > 0) {
          const buy = remainingBuys[0];
          const matchedAmount = Math.min(remainingSellAmount, buy.amount);
          const costPerUnit = buy.cost / buy.amount;
          const matchedCost = matchedAmount * costPerUnit;

          matchedBuys.push({ buy, matchedAmount });
          totalCost += matchedCost;

          buy.amount -= matchedAmount;
          remainingSellAmount -= matchedAmount;

          if (buy.amount <= 0) {
            remainingBuys.shift();
          }
        }

        // If we matched the entire sell, create a closed order
        if (remainingSellAmount === 0 && matchedBuys.length > 0) {
          // Use the first buy as the representative buy trade
          const buyTrade = matchedBuys[0].buy.trade;
          const boughtAmount = matchedBuys.reduce((sum, m) => sum + m.matchedAmount, 0);
          const soldAmount = sell.amount;
          const boughtValue = totalCost;
          const soldValue = sell.revenue;
          const pnl = soldValue - boughtValue;
          const pnlPercentage = boughtValue > 0 ? (pnl / boughtValue) * 100 : 0;

          if (Number.isFinite(pnl) && Number.isFinite(pnlPercentage)) {
            closedOrdersList.push({
              mint,
              buyTrade,
              sellTrade: sell.trade,
              boughtAmount,
              soldAmount,
              boughtValue,
              soldValue,
              pnl,
              pnlPercentage,
              closedAt: sell.timestamp, // When the position was closed
            });
          }
        }
      }
    });

    // Sort by closed time (newest first)
    return closedOrdersList.sort((a, b) => b.closedAt - a.closedAt);
  }, [history, currentSolPrice]);

  // Calculate performance metrics from closed orders
  const performanceMetrics = useMemo(() => {
    if (!closedOrders || closedOrders.length === 0) {
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

    // Calculate totals from closed orders
    const totalPnl = filteredOrders.reduce((sum, order) => sum + order.pnl, 0);
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
  }, [closedOrders, selectedRange]);

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

    // Add a small delay to prevent race conditions on initial load
    const loadData = async () => {
      try {
        // Small delay to ensure component is fully mounted
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Call scan-wallet backend API (for balance and initial scan)
        const data = await scanWallet(wallet.address, 100);
        
        // Set wallet balance from scan
        if (data?.balance) {
          setWalletBalance(data.balance);
          setBalance(data.balance.sol);
        }

        // Transform and set scan data (keep for backward compatibility)
        if (data?.tokenActivity) {
          const tradeRows = transformWalletScanToTradeRows(data);
          setScanData(tradeRows);
        } else {
          setScanData([]);
        }
        setScanError(null); // Clear any previous errors
      } catch (err) {
        // Silently handle errors - don't show runtime errors
        console.warn("Error scanning wallet (handled gracefully):", err);
        // Extract error message safely
        const errorMessage = err instanceof Error 
          ? err.message 
          : typeof err === 'string' 
            ? err 
            : "Failed to scan wallet";
        setScanError(errorMessage);
        setScanData([]);

        // Fallback to old method if scan fails
        try {
          const balance = await getWalletSolBalance(wallet.address);
          if (balance !== null) {
            setBalance(balance);
          }
        } catch (balanceErr) {
          // Silently handle balance fetch errors too
          console.warn("Failed to get wallet balance (handled gracefully):", balanceErr);
          setBalance(null);
        }
      } finally {
        setLoading(false);
        setScanLoading(false);
      }
    };

    // Use void to explicitly mark promise as intentionally not awaited
    void loadData();
  }, [wallet.address]);

  // Calculate transactions that are part of open positions (both buys and sells)
  interface OpenPositionTransaction {
    trade: TradeEvent; // Original trade (buy or sell)
    side: 'buy' | 'sell';
    originalAmount: number; // Original amount
    originalValue: number; // Original value
    remainingAmount: number; // For buys: remaining amount. For sells: amount that matched open positions
    remainingValue: number; // For buys: cost basis of remaining. For sells: value that matched open positions
  }

  const openPositionTransactions = useMemo((): OpenPositionTransaction[] => {
    if (!history || history.length === 0) return [];

    // Group trades by mint (token) to calculate positions
    const positions = new Map<
      string,
      {
        buys: Array<{ 
          trade: TradeEvent; // Store original trade
          amount: number; 
          cost: number; 
          timestamp: number;
        }>;
        sells: Array<{ 
          trade: TradeEvent; // Store original trade
          amount: number; 
          revenue: number; 
          timestamp: number;
        }>;
      }
    >();

    // Process all trades - store original trades for both buys and sells
    history.forEach((trade) => {
      if (!trade.mint) return;

      const amount = typeof trade.amount === "number" ? trade.amount : 0;
      const priceUsd = trade.price_usd ?? null;
      const solSpent = trade.sol_spent ?? null;

      // Calculate USD value
      let usdValue: number | null = null;
      if (priceUsd !== null && Number.isFinite(amount) && Number.isFinite(priceUsd)) {
        usdValue = amount * priceUsd;
      } else if (solSpent !== null && Number.isFinite(solSpent)) {
        // Use current SOL price from context
        usdValue = solSpent * currentSolPrice;
      }

      if (usdValue === null || !Number.isFinite(usdValue) || usdValue <= 0) return;

      if (!positions.has(trade.mint)) {
        positions.set(trade.mint, { buys: [], sells: [] });
      }

      const position = positions.get(trade.mint)!;

      if (trade.side === "buy") {
        position.buys.push({
          trade, // Store original trade
          amount,
          cost: usdValue,
          timestamp: trade.at,
        });
      } else if (trade.side === "sell") {
        position.sells.push({
          trade, // Store original trade
          amount,
          revenue: usdValue,
          timestamp: trade.at,
        });
      }
    });

    // Calculate open position transactions using FIFO matching
    const openTransactions: OpenPositionTransaction[] = [];

    positions.forEach((position) => {
      // Sort buys and sells by timestamp (FIFO)
      position.buys.sort((a, b) => a.timestamp - b.timestamp);
      position.sells.sort((a, b) => a.timestamp - b.timestamp);

      // Create a working copy of buys for FIFO matching
      const remainingBuys = position.buys.map(buy => ({
        ...buy,
        remainingAmount: buy.amount, // Track remaining amount
        remainingCost: buy.cost, // Track remaining cost
      }));

      // Track which sells matched against buys that still have remaining amounts
      const sellsMatchedToOpenPositions: Array<{
        sell: typeof position.sells[0];
        matchedAmount: number;
        matchedValue: number;
      }> = [];

      // Match sells to buys using FIFO
      for (const sell of position.sells) {
        let remainingSellAmount = sell.amount;
        let matchedToOpenAmount = 0;
        let matchedToOpenValue = 0;

        while (remainingSellAmount > 0 && remainingBuys.length > 0) {
          const buy = remainingBuys[0];
          const matchedAmount = Math.min(remainingSellAmount, buy.remainingAmount);
          const costPerUnit = buy.remainingCost / buy.remainingAmount;
          const matchedCost = matchedAmount * costPerUnit;
          const matchedRevenue = (matchedAmount / sell.amount) * sell.revenue;

          buy.remainingAmount -= matchedAmount;
          buy.remainingCost -= matchedCost;
          remainingSellAmount -= matchedAmount;

          // Track if this sell matched against a buy that will still have remaining
          // (i.e., the buy still has remainingAmount > 0 after this match)
          if (buy.remainingAmount > 0) {
            matchedToOpenAmount += matchedAmount;
            matchedToOpenValue += matchedRevenue;
          }

          // Remove buy if fully matched
          if (buy.remainingAmount <= 0) {
            remainingBuys.shift();
          }
        }

        // If this sell matched against buys that still have remaining (open positions), include it
        if (matchedToOpenAmount > 0) {
          sellsMatchedToOpenPositions.push({
            sell,
            matchedAmount: matchedToOpenAmount,
            matchedValue: matchedToOpenValue,
          });
        }
      }

      // Add all buys that still have remaining amount
      remainingBuys.forEach((buy) => {
        if (buy.remainingAmount > 0 && buy.remainingCost > 0) {
          openTransactions.push({
            trade: buy.trade,
            side: 'buy',
            originalAmount: buy.amount,
            originalValue: buy.cost,
            remainingAmount: buy.remainingAmount,
            remainingValue: buy.remainingCost,
          });
        }
      });

      // Add all sells that matched against open positions
      sellsMatchedToOpenPositions.forEach(({ sell, matchedAmount, matchedValue }) => {
        openTransactions.push({
          trade: sell.trade,
          side: 'sell',
          originalAmount: sell.amount,
          originalValue: sell.revenue,
          remainingAmount: matchedAmount, // Amount that matched open positions
          remainingValue: matchedValue, // Value that matched open positions
        });
      });
    });

    // Sort by trade timestamp (most recent first)
    return openTransactions.sort((a, b) => b.trade.at - a.trade.at);
  }, [history, currentSolPrice]);

  // Calculate aggregated active positions (grouped by token)
  interface AggregatedPosition {
    mint: string;
    tokenName: string | null;
    tokenSymbol: string | null;
    boughtAmount: number; // Total tokens bought
    boughtValue: number; // Total USD value bought
    soldAmount: number; // Total tokens sold
    soldValue: number; // Total USD value sold
    remainingAmount: number; // Remaining tokens
    remainingValue: number; // Cost basis of remaining (for unrealized PnL)
    realizedPnl: number; // PnL from sold portion
    unrealizedPnl: number; // Estimated PnL from remaining (0 for now, could fetch current price)
    totalPnl: number; // Realized + Unrealized
    pnlPercentage: number; // PnL as percentage of cost basis
  }

  const aggregatedPositions = useMemo((): AggregatedPosition[] => {
    if (!history || history.length === 0) return [];

    // Group trades by mint (token) to calculate aggregated positions
    const positions = new Map<
      string,
      {
        buys: Array<{ amount: number; cost: number; timestamp: number }>;
        sells: Array<{ amount: number; revenue: number; timestamp: number }>;
        tokenName: string | null;
        tokenSymbol: string | null;
      }
    >();

    // Process all trades
    history.forEach((trade) => {
      if (!trade.mint) return;

      const amount = typeof trade.amount === "number" ? trade.amount : 0;
      const priceUsd = trade.price_usd ?? null;
      const solSpent = trade.sol_spent ?? null;

      // Calculate USD value
      let usdValue: number | null = null;
      if (priceUsd !== null && Number.isFinite(amount) && Number.isFinite(priceUsd)) {
        usdValue = amount * priceUsd;
      } else if (solSpent !== null && Number.isFinite(solSpent)) {
        // Use current SOL price from context
        usdValue = solSpent * currentSolPrice;
      }

      if (usdValue === null || !Number.isFinite(usdValue) || usdValue <= 0) return;

      if (!positions.has(trade.mint)) {
        positions.set(trade.mint, { 
          buys: [], 
          sells: [],
          tokenName: trade.name || null,
          tokenSymbol: trade.symbol || null,
        });
      }

      const position = positions.get(trade.mint)!;

      // Update token name/symbol if we have better data
      if (trade.name && !position.tokenName) {
        position.tokenName = trade.name;
      }
      if (trade.symbol && !position.tokenSymbol) {
        position.tokenSymbol = trade.symbol;
      }

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

    // Calculate aggregated positions using FIFO matching
    const aggregated: AggregatedPosition[] = [];

    positions.forEach((position, mint) => {
      // Sort buys and sells by timestamp (FIFO)
      position.buys.sort((a, b) => a.timestamp - b.timestamp);
      position.sells.sort((a, b) => a.timestamp - b.timestamp);

      // Calculate totals
      const totalBoughtAmount = position.buys.reduce((sum, b) => sum + b.amount, 0);
      const totalBoughtValue = position.buys.reduce((sum, b) => sum + b.cost, 0);
      const totalSoldAmount = position.sells.reduce((sum, s) => sum + s.amount, 0);
      const totalSoldValue = position.sells.reduce((sum, s) => sum + s.revenue, 0);

      // Calculate remaining using FIFO matching
      let remainingBuys = [...position.buys];
      let remainingAmount = totalBoughtAmount;
      let remainingCost = totalBoughtValue;
      let realizedCost = 0; // Cost basis of sold tokens

      // Match sells to buys using FIFO
      for (const sell of position.sells) {
        let remainingSellAmount = sell.amount;

        while (remainingSellAmount > 0 && remainingBuys.length > 0) {
          const buy = remainingBuys[0];
          const matchedAmount = Math.min(remainingSellAmount, buy.amount);
          const costPerUnit = buy.cost / buy.amount;
          const matchedCost = matchedAmount * costPerUnit;

          buy.amount -= matchedAmount;
          remainingSellAmount -= matchedAmount;
          remainingAmount -= matchedAmount;
          remainingCost -= matchedCost;
          realizedCost += matchedCost;

          if (buy.amount <= 0) {
            remainingBuys.shift();
          }
        }
      }

      // Only include positions with remaining amount > 0 (active positions)
      if (remainingAmount > 0 && remainingCost > 0) {
        // Calculate realized PnL (from sold portion)
        const realizedPnl = totalSoldValue - realizedCost;
        
        // Unrealized PnL (for now, assume 0 - could fetch current price later)
        const unrealizedPnl = 0; // remainingValue - remainingCost (if we had current price)
        
        // Total PnL = realized + unrealized
        const totalPnl = realizedPnl + unrealizedPnl;
        
        // PnL percentage based on cost basis
        const costBasis = totalBoughtValue;
        const pnlPercentage = costBasis > 0 ? (totalPnl / costBasis) * 100 : 0;

        aggregated.push({
          mint,
          tokenName: position.tokenName,
          tokenSymbol: position.tokenSymbol,
          boughtAmount: totalBoughtAmount,
          boughtValue: totalBoughtValue,
          soldAmount: totalSoldAmount,
          soldValue: totalSoldValue,
          remainingAmount,
          remainingValue: remainingCost, // Cost basis of remaining
          realizedPnl,
          unrealizedPnl,
          totalPnl,
          pnlPercentage,
        });
      }
    });

    // Sort by total PnL (highest first)
    return aggregated.sort((a, b) => b.totalPnl - a.totalPnl);
  }, [history, currentSolPrice]);

  // Calculate total portfolio value and unrealized PnL
  const portfolioMetrics = useMemo(() => {
    // Sum of all active positions' remaining value (cost basis)
    const totalPositionsValue = aggregatedPositions.reduce(
      (sum, position) => sum + position.remainingValue,
      0
    );

    // Wallet SOL balance in USD
    let solBalanceUsd = 0;
    if (walletBalance) {
      if (typeof walletBalance.usd === "number" && Number.isFinite(walletBalance.usd)) {
        solBalanceUsd = walletBalance.usd;
      } else if (typeof walletBalance.sol === "number" && Number.isFinite(walletBalance.sol)) {
        // Use current SOL price from context
        solBalanceUsd = walletBalance.sol * currentSolPrice;
      }
    }

    // Total value = positions + SOL balance
    const totalValue = totalPositionsValue + solBalanceUsd;

    // Unrealized PnL = sum of unrealized PnL from all active positions
    const unrealizedPnl = aggregatedPositions.reduce(
      (sum, position) => sum + position.unrealizedPnl,
      0
    );

    return {
      totalValue,
      unrealizedPnl,
    };
  }, [aggregatedPositions, walletBalance, currentSolPrice]);

  // Calculate top 100 positions by PnL
  const top100Positions = useMemo((): AggregatedPosition[] => {
    // aggregatedPositions is already sorted by PnL (highest first)
    // Just take the top 100
    return aggregatedPositions.slice(0, 100);
  }, [aggregatedPositions]);

  // Update activity data when openPositionTransactions changes (depends on history)
  // Activity tab shows each individual transaction (buy or sell) that is part of an open position
  useEffect(() => {
    if (!wallet?.address) {
      setActivityData([]);
      return;
    }
    
    // If history is still loading, show loading state
    if (historyLoading) {
      setActivityLoading(true);
      setActivityError(null);
      return;
    }
    
    setActivityLoading(true);
    setActivityError(null);
    
    // Convert each open position transaction to TradeRow format
    const updateActivity = async () => {
      try {
        // Add a small delay to ensure loading state is visible
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const activityRows: TradeRow[] = openPositionTransactions.map((openTx, idx) => {
          const trade = openTx.trade;
          
          return {
            id: idx,
            tokenAddress: trade.mint,
            pairAddress: trade.pair_address,
            blockchain: 'sol',
            tradeTime: new Date(trade.at).toISOString(),
            type: openTx.side === 'buy' ? 'Buy' : 'Sell',
            marketCap: trade.market_cap_usd || 0,
            solAmount: trade.sol_spent || 0,
            tokenAmount: openTx.remainingAmount, // For buys: remaining amount. For sells: amount that matched open positions
            usdValue: openTx.remainingValue, // For buys: cost basis. For sells: value that matched open positions
            transactionHash: trade.tx,
            createdAt: new Date(trade.at).toISOString(),
            tokenName: trade.name || trade.symbol || undefined,
          };
        });
        
        isDev && console.log("[Activity] Updated activity data:", {
          openTransactions: openPositionTransactions.length,
          buys: openPositionTransactions.filter(t => t.side === 'buy').length,
          sells: openPositionTransactions.filter(t => t.side === 'sell').length,
          displayed: activityRows.length
        });
        
        setActivityData(activityRows);
        setActivityError(null); // Clear any previous errors
      } catch (err) {
        // Silently handle errors - don't show runtime errors
        console.warn("[Activity] Error (handled gracefully):", err);
        setActivityError(
          typeof err === 'object' && err !== null && 'message' in err && typeof err.message === "string"
            ? err.message
            : "Failed to load open positions",
        );
        setActivityData([]);
      } finally {
        setActivityLoading(false);
      }
    };
    
    // Use void to explicitly mark promise as intentionally not awaited
    void updateActivity();
  }, [wallet?.address, openPositionTransactions, historyLoading]); // Removed tab dependency - update when data changes

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

  // Fetch history when wallet changes - this data is used by all tabs
  // History tab: shows closed orders
  // Active Positions tab: shows aggregated positions
  // Top 100 tab: shows top 100 positions
  // Activity tab: shows open position transactions
  useEffect(() => {
    if (!wallet?.address) {
      setHistory([]);
      setHistoryLoading(false);
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);

    // Get real-time trades from context filtered by wallet address
    const realTimeTrades = latestTrades.filter(
      (trade) => trade.wallet.toLowerCase() === wallet.address.toLowerCase(),
    );

    // Fetch historical data using the same function as Live Trades
    const fetchHistory = async () => {
      try {
        // Add a small delay to prevent race conditions
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const historicalTrades = await getWalletTradeHistory([wallet.address], {
          limit: 200,
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

        isDev && console.log("[WalletScan] Fetched history for all tabs:", {
          realTime: realTimeTrades.length,
          historical: historicalTrades.length,
          merged: mergedTrades.length,
        });

        setHistory(mergedTrades);
        setHistoryError(null); // Clear any previous errors
      } catch (err) {
        // Silently handle errors - don't show runtime errors
        console.warn("[WalletScan] Error fetching history (handled gracefully):", err);
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

    // Use void to explicitly mark promise as intentionally not awaited
    void fetchHistory();
  }, [wallet?.address, latestTrades]); // Removed tab dependency - fetch when wallet changes

  // Fetch token metadata for all mints in closed orders and active positions
  useEffect(() => {
    // Combine mints from both closed orders and active positions
    const allMints = new Set<string>();
    
    closedOrders.forEach((order) => {
      if (order.mint) allMints.add(order.mint);
    });
    
    aggregatedPositions.forEach((position) => {
      if (position.mint) allMints.add(position.mint);
    });

    if (allMints.size === 0) return;

    // Extract unique mints that don't have symbol/name
    const mintsToFetch = Array.from(allMints).filter((mint) => {
      // Check if we already have metadata for this mint
      const metadata = tokenMetadata.get(mint);
      return !metadata?.symbol || !metadata?.name;
    });

    if (mintsToFetch.length === 0) return;

    isDev && console.log(
      "[WalletScan] Fetching metadata for",
      mintsToFetch.length,
      "tokens",
    );

    batchFetchChainTokenMetadata(mintsToFetch)
      .then((metadata) => {
        isDev && console.log("[WalletScan] Fetched token metadata:", metadata);
        setTokenMetadata(metadata);
      })
      .catch((err) => {
        console.error("[WalletScan] Error fetching token metadata:", err);
      });
  }, [closedOrders, aggregatedPositions, tokenMetadata]);

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
              <div className="mb-1 text-xs text-neutral-400">Total Value</div>
              <div className="text-3xl font-bold text-white">
                {historyLoading || scanLoading || loading ? (
                  <span className="animate-pulse text-neutral-500">—</span>
                ) : (
                  `$${formatSmartNumber(portfolioMetrics.totalValue)}`
                )}
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                Unrealized PNL
              </div>
              <div className={`text-lg font-semibold ${portfolioMetrics.unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {historyLoading ? (
                  <span className="animate-pulse text-neutral-500">—</span>
                ) : (
                  `${portfolioMetrics.unrealizedPnl >= 0 ? "+" : ""}$${formatSmartNumber(Math.abs(portfolioMetrics.unrealizedPnl))}`
                )}
              </div>
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
                    {typeof walletBalance.usd === "number" && Number.isFinite(walletBalance.usd) ? (
                      <span>${formatSmartNumber(walletBalance.usd)}</span>
                    ) : walletBalance.usdFormatted ? (
                      <span>{walletBalance.usdFormatted}</span>
                    ) : typeof walletBalance.sol === "number" && Number.isFinite(walletBalance.sol) ? (
                      <span>${formatSmartNumber(walletBalance.sol * currentSolPrice)}</span>
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
                      {closedOrders
                        .filter((order) => {
                          if (!searchTerm) return true;
                          const term = searchTerm.toLowerCase();
                          const metadata = tokenMetadata.get(order.mint);
                          return (
                            order.buyTrade.symbol?.toLowerCase().includes(term) ||
                            order.buyTrade.name?.toLowerCase().includes(term) ||
                            order.sellTrade.symbol?.toLowerCase().includes(term) ||
                            order.sellTrade.name?.toLowerCase().includes(term) ||
                            metadata?.symbol?.toLowerCase().includes(term) ||
                            metadata?.name?.toLowerCase().includes(term) ||
                            order.mint?.toLowerCase().includes(term) ||
                            order.sellTrade.tx?.toLowerCase().includes(term)
                          );
                        })
                        .map((order, idx) => {
                          // Format time - when the position was closed (sell time)
                          const timeAgo = formatTimeAgo(order.closedAt);

                          // Use fetched metadata as fallback - match notification logic
                          const metadata = tokenMetadata.get(order.mint);
                          // Priority: name first (like notifications), then symbol, then mint
                          const displayName =
                            order.sellTrade.name ||
                            order.buyTrade.name ||
                            metadata?.name ||
                            order.sellTrade.symbol ||
                            order.buyTrade.symbol ||
                            metadata?.symbol ||
                            null;
                          const displaySymbol =
                            order.sellTrade.symbol ||
                            order.buyTrade.symbol ||
                            metadata?.symbol ||
                            order.sellTrade.name ||
                            order.buyTrade.name ||
                            metadata?.name ||
                            order.mint?.slice(0, 8) + "..." ||
                            "Unknown";

                          // Format bought/sold amounts
                          const boughtDisplay = currency === "USD"
                            ? `$${formatSmartNumber(order.boughtValue)}`
                            : (
                                <span className="flex items-center justify-end">
                                  <img 
                                    src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" 
                                    alt="SOL" 
                                    className="w-5 h-5 inline-block"
                                  />
                                  {formatSmartNumber(order.boughtAmount)}
                                </span>
                              );

                          const soldDisplay = currency === "USD"
                            ? `$${formatSmartNumber(order.soldValue)}`
                            : formatSmartNumber(order.soldAmount);

                          // Format PnL
                          const pnlDisplay = `${order.pnl >= 0 ? "+" : ""}$${formatSmartNumber(Math.abs(order.pnl))}`;
                          const pnlPercentageDisplay = `${order.pnlPercentage >= 0 ? "+" : ""}${order.pnlPercentage.toFixed(2)}%`;

                          return (
                            <tr
                              key={order.sellTrade.tx || idx}
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
                                    title={order.mint || undefined}
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
                                    order.mint && (
                                      <span className="font-mono text-[10px] text-neutral-500">
                                        {order.mint.slice(0, 4)}...
                                        {order.mint.slice(-4)}
                                      </span>
                                    )}
                                </div>
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
                {historyLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="animate-pulse text-neutral-400">
                      Loading positions...
                    </div>
                  </div>
                ) : aggregatedPositions.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-neutral-500">No active positions found</div>
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
                          PnL
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {aggregatedPositions
                        .filter((position) => {
                          if (!searchTerm) return true;
                          const term = searchTerm.toLowerCase();
                          return (
                            position.tokenSymbol?.toLowerCase().includes(term) ||
                            position.tokenName?.toLowerCase().includes(term) ||
                            position.mint?.toLowerCase().includes(term)
                          );
                        })
                        .map((position, idx) => {
                          const metadata = tokenMetadata.get(position.mint);
                          const displayName =
                            position.tokenName ||
                            metadata?.name ||
                            position.tokenSymbol ||
                            metadata?.symbol ||
                            null;
                          const displaySymbol =
                            position.tokenSymbol ||
                            metadata?.symbol ||
                            position.tokenName ||
                            metadata?.name ||
                            position.mint?.slice(0, 8) + "..." ||
                            "Unknown";

                          // Format bought
                          const boughtDisplay = (
                            <div className="flex flex-col items-end">
                              <span className="text-emerald-400 font-semibold">
                                ${formatSmartNumber(position.boughtValue)}
                              </span>
                              <span className="text-xs text-neutral-500">
                                {formatSmartNumber(position.boughtAmount)} {displaySymbol}
                              </span>
                            </div>
                          );

                          // Format sold
                          const soldDisplay = (
                            <div className="flex flex-col items-end">
                              <span className="text-red-400 font-semibold">
                                ${formatSmartNumber(position.soldValue)}
                              </span>
                              <span className="text-xs text-neutral-500">
                                {formatSmartNumber(position.soldAmount)} {displaySymbol}
                              </span>
                            </div>
                          );

                          // Format remaining
                          const remainingDisplay = (
                            <div className="flex flex-col items-end">
                              <span className="text-white font-semibold">
                                ${formatSmartNumber(position.remainingValue)}
                              </span>
                              <span className="text-xs text-neutral-500">
                                {formatSmartNumber(position.remainingAmount)} {displaySymbol}
                              </span>
                            </div>
                          );

                          // Format PnL
                          const pnlDisplay = (
                            <div className="flex flex-col items-end">
                              <span
                                className={`font-semibold ${
                                  position.totalPnl >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                              >
                                {position.totalPnl >= 0 ? "+" : ""}
                                ${formatSmartNumber(Math.abs(position.totalPnl))}
                              </span>
                              <span
                                className={`text-xs ${
                                  position.pnlPercentage >= 0
                                    ? "text-emerald-400/70"
                                    : "text-red-400/70"
                                }`}
                              >
                                {position.pnlPercentage >= 0 ? "+" : ""}
                                {position.pnlPercentage.toFixed(2)}%
                              </span>
                            </div>
                          );

                          return (
                            <tr
                              key={position.mint || idx}
                              className="transition-colors hover:bg-neutral-800"
                              onClick={() => {
                                // Navigate to token page using mint (faster WebSocket connection)
                                const trade = history.find(t => t.mint === position.mint);
                                const addr = position.mint || trade?.pair_address;
                                if (addr) {
                                  window.open(`/trade/${addr}`, '_blank');
                                }
                              }}
                            >
                              <td className="px-4 py-3">
                                <div className="flex flex-col">
                                  <span
                                    className="font-semibold text-white"
                                    title={position.mint || undefined}
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
                                    position.mint && (
                                      <span className="font-mono text-[10px] text-neutral-500">
                                        {position.mint.slice(0, 4)}...
                                        {position.mint.slice(-4)}
                                      </span>
                                    )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {boughtDisplay}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {soldDisplay}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {remainingDisplay}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {pnlDisplay}
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
                {historyLoading ? (
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
                          Rank
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
                          Remaining
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          PnL
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {top100Positions
                        .filter((position) => {
                          if (!searchTerm) return true;
                          const term = searchTerm.toLowerCase();
                          const metadata = tokenMetadata.get(position.mint);
                          return (
                            position.tokenSymbol?.toLowerCase().includes(term) ||
                            position.tokenName?.toLowerCase().includes(term) ||
                            metadata?.symbol?.toLowerCase().includes(term) ||
                            metadata?.name?.toLowerCase().includes(term) ||
                            position.mint?.toLowerCase().includes(term)
                          );
                        })
                        .map((position, idx) => {
                          const metadata = tokenMetadata.get(position.mint);
                          const displayName =
                            position.tokenName ||
                            metadata?.name ||
                            position.tokenSymbol ||
                            metadata?.symbol ||
                            null;
                          const displaySymbol =
                            position.tokenSymbol ||
                            metadata?.symbol ||
                            position.tokenName ||
                            metadata?.name ||
                            position.mint?.slice(0, 8) + "..." ||
                            "Unknown";

                          // Format bought
                          const boughtDisplay = (
                            <div className="flex flex-col items-end">
                              <span className="text-emerald-400 font-semibold">
                                ${formatSmartNumber(position.boughtValue)}
                              </span>
                              <span className="text-xs text-neutral-500">
                                {formatSmartNumber(position.boughtAmount)} {displaySymbol}
                              </span>
                            </div>
                          );

                          // Format sold
                          const soldDisplay = (
                            <div className="flex flex-col items-end">
                              <span className="text-red-400 font-semibold">
                                ${formatSmartNumber(position.soldValue)}
                              </span>
                              <span className="text-xs text-neutral-500">
                                {formatSmartNumber(position.soldAmount)} {displaySymbol}
                              </span>
                            </div>
                          );

                          // Format remaining
                          const remainingDisplay = (
                            <div className="flex flex-col items-end">
                              <span className="text-white font-semibold">
                                ${formatSmartNumber(position.remainingValue)}
                              </span>
                              <span className="text-xs text-neutral-500">
                                {formatSmartNumber(position.remainingAmount)} {displaySymbol}
                              </span>
                            </div>
                          );

                          // Format PnL
                          const pnlDisplay = (
                            <div className="flex flex-col items-end">
                              <span
                                className={`font-semibold ${
                                  position.totalPnl >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                              >
                                {position.totalPnl >= 0 ? "+" : ""}
                                ${formatSmartNumber(Math.abs(position.totalPnl))}
                              </span>
                              <span
                                className={`text-xs ${
                                  position.pnlPercentage >= 0
                                    ? "text-emerald-400/70"
                                    : "text-red-400/70"
                                }`}
                              >
                                {position.pnlPercentage >= 0 ? "+" : ""}
                                {position.pnlPercentage.toFixed(2)}%
                              </span>
                            </div>
                          );

                          // Calculate rank (1-indexed)
                          const rank = idx + 1;

                          return (
                            <tr
                              key={position.mint || idx}
                              className="transition-colors hover:bg-neutral-800 cursor-pointer"
                              onClick={() => {
                                // Navigate to token page using mint (faster WebSocket connection)
                                const trade = history.find(t => t.mint === position.mint);
                                const addr = position.mint || trade?.pair_address;
                                if (addr) {
                                  window.open(`/trade/${addr}`, '_blank');
                                }
                              }}
                            >
                              <td className="px-4 py-3 text-neutral-400">
                                <div className="font-mono text-sm">
                                  #{rank}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col">
                                  <span
                                    className="font-semibold text-white"
                                    title={position.mint || undefined}
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
                                    position.mint && (
                                      <span className="font-mono text-[10px] text-neutral-500">
                                        {position.mint.slice(0, 4)}...
                                        {position.mint.slice(-4)}
                                      </span>
                                    )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {boughtDisplay}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {soldDisplay}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {remainingDisplay}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {pnlDisplay}
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
                {activityLoading || historyLoading ? (
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
