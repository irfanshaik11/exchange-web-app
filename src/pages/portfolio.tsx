import React, { useState, useEffect } from "react";
import Head from "next/head";
import Header from "../components/Header";
import Footer from "../components/Footer";
import Positions from "../components/trade/Positions";
import TradeTable from "../components/trade/TradeTable";
import Activity from "../components/trade/Activity";
import { useUser } from "../components/UserContext";
import InterstateTooltip from "~/components/InterstateTooltip";
import CustomCheckbox from "../components/CustomCheckbox";
import {
  getTradeHistoryByUser,
  getTradeActivityByUser,
} from "~/utils/functions";
import { formatSmartNumber } from "~/utils/db";
import type { PositionRow, TradeRow } from "~/utils/functions";
import { FaSearch, FaEye, FaUpload, FaTimes } from "react-icons/fa";
import { SiSolana } from "react-icons/si";

// Stacked Token Boxes Component
const StackedTokenBoxes = ({ count = 0 }: { count?: number }) => (
  <InterstateTooltip label="Tokens held">
    <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
      <div className="flex items-center relative" style={{ width: "32px", height: "16px" }}>
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className={`absolute w-4 h-4 rounded-sm ${
              index === 0
                ? "bg-[#4B5563]"
                : index === 1
                ? "bg-[#6B7280]"
                : "bg-[#9CA3AF]"
            }`}
            style={{
              left: `${index * 6}px`,
              zIndex: 3 - index,
            }}
          />
        ))}
      </div>
      <span className="text-sm text-white">{count}</span>
    </div>
  </InterstateTooltip>
);

// SOL icon component for inline use
const SolIcon = () => (
  <SiSolana
    className="h-3 w-3 inline-block -mt-0.5 mx-0.5"
    aria-hidden="true"
    style={{
      color: "unset",
      fill: "url(#solana-gradient-inline)",
      filter: "none",
    }}
  />
);

const spotTabs = ["Active Positions", /* "History", */ "Top 100", "Activity"];

// Token metadata cache interface
interface TokenMetadataCache {
  imageUrl?: string;
  protocol?: string;
  name?: string;
  symbol?: string;
  timestamp: number; // When it was cached
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const CACHE_KEY = "tokenMetadataCache";

export default function PortfolioPage() {
  const [activeSection, setActiveSection] = useState<"spot" | "wallet" | "perpetuals">("spot");
  const [activeSpotTab, setActiveSpotTab] = useState(0);
  const [activePerpetualsTab, setActivePerpetualsTab] = useState(0);
  const { user, loading: userLoading, solBalance, usdcBalance } = useUser();
  const [walletChecked, setWalletChecked] = useState(false);
  const [tradeHistory, setTradeHistory] = useState<TradeRow[]>([]);
  const [loadingTradeHistory, setLoadingTradeHistory] = useState(true);
  const [tradeActivity, setTradeActivity] = useState<TradeRow[]>([]);
  const [loadingTradeActivity, setLoadingTradeActivity] = useState(true);
  const [unrealizedPnl, setUnrealizedPnl] = useState(0);
  const [unrealizedPnlPercentage, setUnrealizedPnlPercentage] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [top100Positions, setTop100Positions] = useState<PositionRow[]>([]);
  const [filteredPositions, setFilteredPositions] = useState<PositionRow[]>([]);
  const [filteredTop100Positions, setFilteredTop100Positions] = useState<PositionRow[]>([]);
  const [filteredTradeHistory, setFilteredTradeHistory] = useState<TradeRow[]>([]);
  const [filteredTradeActivity, setFilteredTradeActivity] = useState<TradeRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [tokenNames, setTokenNames] = useState<Record<string, string>>({});
  const [showHidden, setShowHidden] = useState(false);
  const [sortByUSD, setSortByUSD] = useState(false);
  const [solPrice, setSolPrice] = useState(0);

  // Shared token metadata cache across all tabs
  const [tokenMetadataCache, setTokenMetadataCache] =
    useState<Record<string, TokenMetadataCache>>({});

  // Load cache from localStorage on mount
  useEffect(() => {
    try {
      const savedCache = localStorage.getItem(CACHE_KEY);
      if (savedCache) {
        const parsed: Record<string, TokenMetadataCache> = JSON.parse(savedCache);
        // Filter out expired entries
        const now = Date.now();
        const validCache: Record<string, TokenMetadataCache> = {};
        Object.entries(parsed).forEach(([key, value]) => {
          if (now - value.timestamp < CACHE_TTL) {
            validCache[key] = value;
          }
        });
        if (Object.keys(validCache).length > 0) {
          setTokenMetadataCache(validCache);
          console.log(
            `📦 Loaded ${Object.keys(validCache).length} cached tokens from localStorage`,
          );
        }
      }
    } catch (error) {
      console.error("Error loading token cache:", error);
    }
  }, []);

  // Save cache to localStorage when it changes (debounced)
  useEffect(() => {
    if (Object.keys(tokenMetadataCache).length === 0) return;

    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(tokenMetadataCache));
        console.log(`💾 Saved ${Object.keys(tokenMetadataCache).length} tokens to cache`);
      } catch (error) {
        console.error("Error saving token cache:", error);
      }
    }, 1000); // Debounce saves by 1 second

    return () => clearTimeout(timeoutId);
  }, [tokenMetadataCache]);

  // Helper function to update cache
  const updateTokenMetadataCache = (
    tokenAddress: string,
    metadata: Omit<TokenMetadataCache, "timestamp">,
  ) => {
    setTokenMetadataCache((prev) => ({
      ...prev,
      [tokenAddress]: {
        ...metadata,
        timestamp: Date.now(),
      },
    }));
  };

  // Helper function to check if cache entry is valid
  const isCacheValid = (tokenAddress: string): boolean => {
    const cached = tokenMetadataCache[tokenAddress];
    if (!cached) return false;
    return Date.now() - cached.timestamp < CACHE_TTL;
  };

  // Fetch SOL price using Pyth Network
  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        // Pyth Network price feed for SOL/USD
        const SOL_USD_FEED =
          "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
        const response = await fetch(
          `https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=${SOL_USD_FEED}`,
          { signal: AbortSignal.timeout(5000) },
        );

        if (response.ok) {
          const data = await response.json();
          const priceData = data.parsed?.[0]?.price;
          if (priceData?.price && priceData?.expo) {
            const price = Number(priceData.price) * Math.pow(10, priceData.expo);
            setSolPrice(price);
            return;
          }
        }
      } catch (error) {
        console.error("Error fetching SOL price from Pyth:", error);
      }

      // Fallback to static price if Pyth fails
      setSolPrice(150);
    };

    fetchSolPrice();
    const interval = setInterval(fetchSolPrice, 60000);
    return () => clearInterval(interval);
  }, []);
  const [selectedTimeframe, setSelectedTimeframe] = useState("Max");
  const [timeframeMetrics, setTimeframeMetrics] = useState({
    unrealizedPnl: 0,
    realizedPnl: 0,
    winningTrades: 0,
    losingTrades: 0,
  });
  const [performanceBreakdown, setPerformanceBreakdown] = useState({
    above500: 0,
    between200And500: 0,
    between0And200: 0,
    between0AndMinus50: 0,
    belowMinus50: 0,
  });

  // Fetch trade history whenever user is logged in (needed for performance metrics)
  useEffect(() => {
    const fetchTradeHistory = async () => {
      if (user?.id) {
        setLoadingTradeHistory(true);
        try {
          const history = await getTradeHistoryByUser(user.id);
          setTradeHistory(history);
        } catch (error) {
          console.error("Failed to fetch trade history:", error);
          setTradeHistory([]);
        } finally {
          setLoadingTradeHistory(false);
        }
      }
    };

    fetchTradeHistory();
  }, [user?.id]);

  // Fetch trade activity only when on Activity tab (index 2 after History commented out)
  useEffect(() => {
    let isInitialLoad = true;

    const fetchTradeActivity = async () => {
      if (user?.id && activeSpotTab === 2) {
        // Only show loading state on initial load, not on refreshes
        if (isInitialLoad) {
          setLoadingTradeActivity(true);
        }
        try {
          const activity = await getTradeActivityByUser(user.id);
          // Reverse array so newest trades appear at the top
          setTradeActivity([...activity].reverse());
        } catch (error) {
          console.error("Failed to fetch trade activity:", error);
          setTradeActivity([]);
        } finally {
          if (isInitialLoad) {
            setLoadingTradeActivity(false);
            isInitialLoad = false;
          }
        }
      }
    };

    fetchTradeActivity();

    // Auto-refresh every 5 seconds when on Activity tab
    if (user?.id && activeSpotTab === 2) {
      const intervalId = setInterval(() => {
        fetchTradeActivity();
      }, 5000);

      return () => clearInterval(intervalId);
    }
  }, [user?.id, activeSpotTab]);

  useEffect(() => {
    if (positions.length > 0) {
      // Add validation to prevent extreme values
      const validPositions = positions.filter(
        (pos) =>
          isFinite(pos.pnl) &&
          isFinite(pos.remainingUsdValue) &&
          isFinite(pos.boughtUsdValue) &&
          Math.abs(pos.pnl) < 1e12 && // Less than 1 trillion
          Math.abs(pos.remainingUsdValue) < 1e12 &&
          Math.abs(pos.boughtUsdValue) < 1e12,
      );

      // Apply the same correction rules used in Positions table for consistency
      const correctedPositions = validPositions.map((pos) => {
        // Unit correction for token amounts
        let correctedSold = pos.sold;
        if (pos.sold > pos.bought * 1000) {
          correctedSold = pos.sold / 1000000; // Scale down by 1 million
        }
        const correctedBought = pos.bought;
        const correctedRemaining = Math.max(0, correctedBought - correctedSold);

        // Fix soldUsdValue anomalies
        let correctedSoldUsdValue = pos.soldUsdValue;
        if (
          correctedSoldUsdValue > 10000 &&
          pos.boughtUsdValue > 0 &&
          pos.boughtUsdValue < 1000
        ) {
          if (pos.sold > pos.bought) {
            if (correctedBought > 0) {
              const sellRatio = Math.min(correctedSold / correctedBought, 1);
              correctedSoldUsdValue = pos.boughtUsdValue * sellRatio;
            }
          } else if (correctedSoldUsdValue > pos.boughtUsdValue * 100) {
            const sellRatio = pos.sold / pos.bought;
            correctedSoldUsdValue = pos.boughtUsdValue * Math.min(sellRatio, 1);
          }
        }
        if (pos.sold > pos.bought && correctedSoldUsdValue > pos.boughtUsdValue) {
          correctedSoldUsdValue = pos.boughtUsdValue;
        }

        // Fix remainingUsdValue anomalies
        let correctedRemainingUsdValue = pos.remainingUsdValue;
        const needsRemainingFix =
          pos.remaining < 0 ||
          pos.sold > pos.bought ||
          (Math.abs(correctedRemainingUsdValue) > 10000 &&
            pos.boughtUsdValue > 0 &&
            pos.boughtUsdValue < 1000);
        if (needsRemainingFix) {
          if (correctedBought > 0) {
            const avgBuyPrice = pos.boughtUsdValue / correctedBought;
            correctedRemainingUsdValue = correctedRemaining * avgBuyPrice;
          } else {
            correctedRemainingUsdValue = 0;
          }
        }

        // Recalculate PnL using corrected values
        const correctedPnl =
          correctedSoldUsdValue + correctedRemainingUsdValue - pos.boughtUsdValue;
        const correctedPnlPercentage =
          pos.boughtUsdValue > 0 ? (correctedPnl / pos.boughtUsdValue) * 100 : 0;

        return {
          ...pos,
          sold: correctedSold,
          remaining: correctedRemaining,
          soldUsdValue: correctedSoldUsdValue,
          remainingUsdValue: correctedRemainingUsdValue,
          pnl: correctedPnl,
          pnlPercentage: correctedPnlPercentage,
        };
      });

      const totalPnl = correctedPositions.reduce((acc, pos) => acc + pos.pnl, 0);
      const totalRemainingValue = correctedPositions.reduce(
        (acc, pos) => acc + pos.remainingUsdValue,
        0,
      );
      const totalBoughtValue = correctedPositions.reduce(
        (acc, pos) => acc + pos.boughtUsdValue,
        0,
      );
      setUnrealizedPnl(totalPnl);
      setUnrealizedPnlPercentage(
        totalBoughtValue ? (totalPnl / totalBoughtValue) * 100 : 0,
      );
      setTotalValue(solBalance + totalRemainingValue);

      // Create top 100 positions sorted by corrected USD value
      const sortedByUsdValue = [...correctedPositions].sort((a, b) => {
        return b.remainingUsdValue - a.remainingUsdValue;
      });
      setTop100Positions(sortedByUsdValue.slice(0, 100));
    }
  }, [positions, solBalance]);

  // Search filtering effect
  useEffect(() => {
    const filterData = () => {
      if (!searchQuery.trim()) {
        // If no search query, show all data
        setFilteredPositions(positions);
        setFilteredTop100Positions(top100Positions);
        setFilteredTradeHistory(tradeHistory);
        setFilteredTradeActivity(tradeActivity);
        return;
      }

      const query = searchQuery.toLowerCase().trim();

      // Filter positions (Active Positions and Top 100 tabs)
      const filteredPos = positions.filter((pos) => {
        const tokenName = tokenNames[pos.tokenAddress]?.toLowerCase() || "";
        const tokenAddr = pos.tokenAddress?.toLowerCase() || "";
        const pairAddr = pos.pairAddress?.toLowerCase() || "";
        return (
          tokenAddr.includes(query) ||
          pairAddr.includes(query) ||
          tokenName.includes(query)
        );
      });
      setFilteredPositions(filteredPos);

      // Filter top 100 positions
      const filteredTop100 = top100Positions.filter((pos) => {
        const tokenName = tokenNames[pos.tokenAddress]?.toLowerCase() || "";
        const tokenAddr = pos.tokenAddress?.toLowerCase() || "";
        const pairAddr = pos.pairAddress?.toLowerCase() || "";
        return (
          tokenAddr.includes(query) ||
          pairAddr.includes(query) ||
          tokenName.includes(query)
        );
      });
      setFilteredTop100Positions(filteredTop100);

      // Filter trade history
      const filteredHistory = tradeHistory.filter((trade) => {
        const tokenName = tokenNames[trade.tokenAddress]?.toLowerCase() || "";
        const tokenAddr = trade.tokenAddress?.toLowerCase() || "";
        const txHash = trade.transactionHash?.toLowerCase() || "";
        return (
          tokenAddr.includes(query) ||
          txHash.includes(query) ||
          tokenName.includes(query)
        );
      });
      setFilteredTradeHistory(filteredHistory);

      // Filter trade activity
      const filteredActivity = tradeActivity.filter((trade) => {
        const tokenName = tokenNames[trade.tokenAddress]?.toLowerCase() || "";
        const tokenAddr = trade.tokenAddress?.toLowerCase() || "";
        const txHash = trade.transactionHash?.toLowerCase() || "";
        return (
          tokenAddr.includes(query) ||
          txHash.includes(query) ||
          tokenName.includes(query)
        );
      });
      setFilteredTradeActivity(filteredActivity);
    };

    filterData();
  }, [searchQuery, positions, top100Positions, tradeHistory, tradeActivity, tokenNames]);

  // Calculate metrics based on selected timeframe
  useEffect(() => {
    const calculateTimeframeMetrics = () => {
      console.log("🔄 Calculating timeframe metrics...", {
        selectedTimeframe,
        positionsCount: positions.length,
        tradeHistoryCount: tradeHistory.length,
        unrealizedPnl,
      });

      const now = Date.now();
      let timeframeDays = 0;

      switch (selectedTimeframe) {
        case "1d":
          timeframeDays = 1;
          break;
        case "7d":
          timeframeDays = 7;
          break;
        case "30d":
          timeframeDays = 30;
          break;
        case "Max":
          timeframeDays = Infinity;
          break;
      }

      const cutoffTime =
        timeframeDays === Infinity ? 0 : now - timeframeDays * 24 * 60 * 60 * 1000;

      // Calculate winning and losing trades based on positions
      let winningTrades = 0;
      let losingTrades = 0;
      let totalRealizedPnl = 0;

      // Performance breakdown counters
      let above500 = 0;
      let between200And500 = 0;
      let between0And200 = 0;
      let between0AndMinus50 = 0;
      let belowMinus50 = 0;

      // Count winning/losing positions and categorize by PNL percentage
      positions.forEach((pos) => {
        if (pos.pnl > 0) {
          winningTrades++;
        } else if (pos.pnl < 0) {
          losingTrades++;
        }

        // Calculate realized PNL from sold positions
        // Realized PnL = Money received from selling - Cost basis of sold tokens
        if (pos.sold > 0 && pos.bought > 0 && pos.boughtUsdValue > 0) {
          // Detect unit mismatch: if sold amount is much larger than bought amount
          // This indicates the backend is storing sold amount in wrong units
          let correctedSold = pos.sold;

          if (pos.sold > pos.bought * 1000) {
            // Likely unit mismatch - sold amount is probably in smaller units
            // Try to correct by scaling down
            correctedSold = pos.sold / 1000000; // Scale down by 1 million
            console.warn("Unit mismatch detected - correcting sold amount:", {
              tokenAddress: pos.tokenAddress,
              originalSold: pos.sold,
              correctedSold: correctedSold,
              bought: pos.bought,
            });
          }

          // Calculate average cost per token
          const avgCostPerToken = pos.boughtUsdValue / pos.bought;
          // Cost basis of sold tokens = average cost * amount sold (corrected)
          const costBasisOfSold = avgCostPerToken * correctedSold;

          // Correct soldUsdValue anomalies (same heuristics as Positions table)
          let correctedSoldUsdValue = pos.soldUsdValue;
          if (
            correctedSoldUsdValue > 10000 &&
            pos.boughtUsdValue > 0 &&
            pos.boughtUsdValue < 1000
          ) {
            if (pos.sold > pos.bought) {
              const sellRatio = Math.min(correctedSold / pos.bought, 1);
              correctedSoldUsdValue = pos.boughtUsdValue * sellRatio;
            } else if (correctedSoldUsdValue > pos.boughtUsdValue * 100) {
              const sellRatio = pos.sold / pos.bought;
              correctedSoldUsdValue = pos.boughtUsdValue * Math.min(sellRatio, 1);
            }
          }
          if (pos.sold > pos.bought && correctedSoldUsdValue > pos.boughtUsdValue) {
            correctedSoldUsdValue = pos.boughtUsdValue;
          }

          // Realized PnL = money received - cost basis (using corrected USD)
          const realizedPnl = correctedSoldUsdValue - costBasisOfSold;

          // Debug logging for PNL calculation
          console.log("PNL calculation debug:", {
            tokenAddress: pos.tokenAddress,
            bought: pos.bought,
            boughtUsdValue: pos.boughtUsdValue,
            sold: pos.sold,
            correctedSold: correctedSold,
            soldUsdValue: pos.soldUsdValue,
            avgCostPerToken: avgCostPerToken,
            costBasisOfSold: costBasisOfSold,
            realizedPnl: realizedPnl,
          });

          // Add validation to prevent extreme values
          if (isFinite(realizedPnl) && Math.abs(realizedPnl) < 1e12) {
            // Less than 1 trillion
            totalRealizedPnl += realizedPnl;
          } else {
            console.warn(
              "Invalid realized PNL value:",
              realizedPnl,
              "for token:",
              pos.tokenAddress,
            );
          }
        }

        // Categorize by PNL percentage
        const pnlPercent = pos.pnlPercentage;
        if (pnlPercent > 500) {
          above500++;
        } else if (pnlPercent >= 200 && pnlPercent <= 500) {
          between200And500++;
        } else if (pnlPercent >= 0 && pnlPercent < 200) {
          between0And200++;
        } else if (pnlPercent >= -50 && pnlPercent < 0) {
          between0AndMinus50++;
        } else if (pnlPercent < -50) {
          belowMinus50++;
        }
      });

      // For now, use the overall unrealized PNL since positions don't have timestamps
      const unrealizedPnlForTimeframe = unrealizedPnl;

      console.log("📊 Final timeframe metrics:", {
        unrealizedPnl: unrealizedPnlForTimeframe,
        realizedPnl: totalRealizedPnl,
        winningTrades,
        losingTrades,
        totalRealizedPnl,
      });

      setTimeframeMetrics({
        unrealizedPnl: unrealizedPnlForTimeframe,
        realizedPnl: totalRealizedPnl,
        winningTrades,
        losingTrades,
      });

      setPerformanceBreakdown({
        above500,
        between200And500,
        between0And200,
        between0AndMinus50,
        belowMinus50,
      });
    };

    calculateTimeframeMetrics();
  }, [selectedTimeframe, tradeHistory, positions, unrealizedPnl]);

  // Export performance data as CSV
  const exportPerformanceData = () => {
    // Create CSV content
    const csvContent = [
      // Header
      ["Metric", "Value"],
      ["Timeframe", selectedTimeframe],
      ["Export Date", new Date().toLocaleString()],
      [""],
      ["Performance Metrics", ""],
      ["Unrealized PnL", timeframeMetrics.unrealizedPnl],
      ["Realized PnL", timeframeMetrics.realizedPnl],
      ["Winning Trades", timeframeMetrics.winningTrades],
      ["Losing Trades", timeframeMetrics.losingTrades],
      [
        "Total Trades",
        timeframeMetrics.winningTrades + timeframeMetrics.losingTrades,
      ],
      [""],
      ["Performance Breakdown", ""],
      [">500%", performanceBreakdown.above500],
      ["200% - 500%", performanceBreakdown.between200And500],
      ["0% - 200%", performanceBreakdown.between0And200],
      ["0% - -50%", performanceBreakdown.between0AndMinus50],
      ["< -50%", performanceBreakdown.belowMinus50],
      [""],
      ["Position Details", ""],
      [
        "Token Address",
        "Pair Address",
        "Bought",
        "Bought USD",
        "Sold",
        "Sold USD",
        "Remaining",
        "Remaining USD",
        "PnL",
        "PnL %",
      ],
      ...positions.map((pos) => [
        pos.tokenAddress,
        pos.pairAddress,
        pos.bought,
        pos.boughtUsdValue,
        pos.sold,
        pos.soldUsdValue,
        pos.remaining,
        pos.remainingUsdValue,
        pos.pnl,
        pos.pnlPercentage,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `portfolio-performance-${selectedTimeframe}-${new Date()
        .toISOString()
        .split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <Head>
        <title>Portfolio | Interstate Memeboard</title>
      </Head>
      <div className="min-h-screen bg-[#050608] text-[#E6E7EA]">
        <Header />
        <div className="px-6 pt-6">
          {/* Section Tabs */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex gap-8">
              <button
                className={`text-lg font-light transition cursor-pointer ${
                  activeSection === "spot"
                    ? "text-white"
                    : "text-[#6B7280] hover:text-white"
                }`}
                onClick={() => setActiveSection("spot")}
              >
                Spot
              </button>
              {/* <button
                className={`text-lg font-light transition cursor-pointer ${
                  activeSection === "wallet"
                    ? "text-white"
                    : "text-[#6B7280] hover:text-white"
                }`}
                onClick={() => setActiveSection("wallet")}
              >
                Wallets
              </button> */}
              {/* <button
                className={`text-lg font-light transition cursor-pointer ${
                  activeSection === "perpetuals"
                    ? "text-white"
                    : "text-[#6B7280] hover:text-white"
                }`}
                onClick={() => setActiveSection("perpetuals")}
              >
                Perpetuals
              </button> */}
            </div>

            {/* Right side controls for Spot section */}
            {activeSection === "spot" && (
              <div className="flex items-center gap-4">
                <InterstateTooltip label="SOL Balance">
                  <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                    <SiSolana
                      className="h-4 w-4 -mt-px"
                      aria-hidden="true"
                      style={{
                        color: "unset",
                        fill: "url(#solana-gradient)",
                        filter: "none",
                      }}
                    />
                    <svg className="absolute w-0 h-0">
                      <defs>
                        <linearGradient
                          id="solana-gradient"
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="0%"
                        >
                          <stop offset="0%" stopColor="#9945FF" />
                          <stop offset="100%" stopColor="#14F195" />
                        </linearGradient>
                        <linearGradient
                          id="solana-gradient-inline"
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="0%"
                        >
                          <stop offset="0%" stopColor="#9945FF" />
                          <stop offset="100%" stopColor="#14F195" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <span className="text-sm text-[#9CA3AF]">
                      {formatSmartNumber(solBalance)}
                    </span>
                  </div>
                </InterstateTooltip>
                <StackedTokenBoxes count={positions.length} />
                <div className="flex items-center gap-2">
                  {/* <FaSearch className="text-[#9CA3AF]" />
                  <input
                    type="text"
                    placeholder="Search for other wallets..."
                    className="bg-transparent text-sm text-[#9CA3AF] placeholder-[#6B7280] focus:outline-none"
                  /> */}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedTimeframe("1d")}
                    className={`px-3 py-1 text-xs cursor-pointer transition-colors ${
                      selectedTimeframe === "1d"
                        ? "text-white"
                        : "text-[#9CA3AF] hover:text-white"
                    }`}
                  >
                    1d
                  </button>
                  <button
                    onClick={() => setSelectedTimeframe("7d")}
                    className={`px-3 py-1 text-xs cursor-pointer transition-colors ${
                      selectedTimeframe === "7d"
                        ? "text-white"
                        : "text-[#9CA3AF] hover:text-white"
                    }`}
                  >
                    7d
                  </button>
                  <button
                    onClick={() => setSelectedTimeframe("30d")}
                    className={`px-3 py-1 text-xs cursor-pointer transition-colors ${
                      selectedTimeframe === "30d"
                        ? "text-white"
                        : "text-[#9CA3AF] hover:text-white"
                    }`}
                  >
                    30d
                  </button>
                  <button
                    onClick={() => setSelectedTimeframe("Max")}
                    className={`px-3 py-1 text-xs cursor-pointer transition-colors ${
                      selectedTimeframe === "Max"
                        ? "text-white"
                        : "text-[#9CA3AF] hover:text-white"
                    }`}
                  >
                    Max
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Spot Section */}
          {activeSection === "spot" && (
            <div className="space-y-6">
              {/* Top Panels */}
              <div className="grid grid-cols-3 gap-6">
                {/* Balance */}
                <div className="bg-[#101114] rounded-lg p-6">
                  <div className="mb-4 text-white text-sm font-medium cursor-pointer hover:text-[#70E0B0] transition-colors">
                    Balance
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="text-[#6B7280] text-sm font-light">
                        Total Value
                      </div>
                      <div className="text-2xl font-light text-white">
                        {sortByUSD && solPrice > 0 ? (
                          <>
                            <SolIcon />
                            {formatSmartNumber(totalValue / solPrice)}
                          </>
                        ) : (
                          `$${totalValue.toFixed(2)}`
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#6B7280] text-sm font-light">
                        Unrealized PNL
                      </div>
                      <div className="text-2xl font-light text-white">
                        {sortByUSD && solPrice > 0 ? (
                          <>
                            <SolIcon />
                            {formatSmartNumber(unrealizedPnl / solPrice)}
                          </>
                        ) : (
                          `$${unrealizedPnl.toFixed(2)}`
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#6B7280] text-sm font-light">
                        Available Balance
                      </div>
                      <div className="text-2xl font-light text-white">
                        {sortByUSD && solPrice > 0 ? (
                          <>
                            <SolIcon />
                            {formatSmartNumber(usdcBalance / solPrice)}
                          </>
                        ) : (
                          `$${formatSmartNumber(usdcBalance)}`
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Realized PNL */}
                <div className="bg-[#101114] rounded-lg p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="text-white text-sm font-medium cursor-pointer hover:text-[#70E0B0] transition-colors">
                      Realized PNL
                    </div>
                    {/* Calendar icon commented out */}
                    {/* <InterstateTooltip label="View realized profit/loss over time">
                      <svg className="w-4 h-4 text-[#9CA3AF] cursor-pointer hover:text:white transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                        <rect x="7" y="14" width="3" height="3" fill="currentColor"/>
                      </svg>
                    </InterstateTooltip> */}
                  </div>
                  <div className="flex flex-col h-32">
                    <div
                      className="text-2xl font-light mb-2"
                      style={{
                        color:
                          timeframeMetrics.realizedPnl >= 0 ? "#70E0B0" : "#FF4D7F",
                      }}
                    >
                      {sortByUSD && solPrice > 0 ? (
                        <>
                          <SolIcon />
                          {formatSmartNumber(
                            Math.abs(timeframeMetrics.realizedPnl) / solPrice,
                          )}
                        </>
                      ) : (
                        `${
                          timeframeMetrics.realizedPnl >= 0 ? "+" : "-"
                        }$${formatSmartNumber(
                          Math.abs(timeframeMetrics.realizedPnl),
                        )}`
                      )}
                    </div>
                    {/* Dynamic PNL chart */}
                    <div className="relative w-full flex-1">
                      <svg
                        className="w-full h-full"
                        viewBox="0 0 300 80"
                        preserveAspectRatio="none"
                      >
                        {/* Horizontal reference line (neutral/zero) */}
                        <line
                          x1="0"
                          y1="40"
                          x2="300"
                          y2="40"
                          stroke="#2A2B33"
                          strokeWidth="1"
                        />

                        {/* Dashed reference lines for visual context */}
                        <line
                          x1="0"
                          y1="20"
                          x2="300"
                          y2="20"
                          stroke="#4A4B53"
                          strokeWidth="1"
                          strokeDasharray="4,3"
                          opacity="0.7"
                        />
                        <line
                          x1="0"
                          y1="60"
                          x2="300"
                          y2="60"
                          stroke="#4A4B53"
                          strokeWidth="1"
                          strokeDasharray="4,3"
                          opacity="0.7"
                        />

                        {/* Dynamic PNL line */}
                        <path
                          d={(() => {
                            const pnl = timeframeMetrics.realizedPnl;

                            // More aggressive scaling for small values to make slope visible
                            let normalizedPnl;
                            if (Math.abs(pnl) < 0.01) {
                              // For very small values, use much more aggressive scaling
                              normalizedPnl = Math.max(
                                -1,
                                Math.min(1, pnl * 5000),
                              ); // Scale up by 5000x
                            } else if (Math.abs(pnl) < 1) {
                              // For small-medium values, moderate scaling
                              normalizedPnl = Math.max(
                                -1,
                                Math.min(1, pnl * 100),
                              ); // Scale up by 100x
                            } else {
                              // For larger values, use the original logic
                              const absMaxPnl = Math.max(Math.abs(pnl), 100);
                              normalizedPnl = Math.max(
                                -1,
                                Math.min(1, pnl / absMaxPnl),
                              );
                            }

                            const endY = 40 - normalizedPnl * 30;

                            // Create a more dramatic line that trends up/down based on PNL
                            return `M 0 40 L 60 ${
                              40 - normalizedPnl * 12
                            } L 120 ${
                              40 - normalizedPnl * 18
                            } L 180 ${
                              40 - normalizedPnl * 24
                            } L 240 ${
                              40 - normalizedPnl * 27
                            } L 300 ${endY}`;
                          })()}
                          stroke={
                            timeframeMetrics.realizedPnl >= 0
                              ? "#70E0B0"
                              : "#FF4D7F"
                          }
                          strokeWidth="2.5"
                          fill="none"
                          style={{ transition: "all 0.3s ease" }}
                        />

                        {/* Start and end points for clarity */}
                        <circle
                          cx="0"
                          cy="40"
                          r="2"
                          fill={
                            timeframeMetrics.realizedPnl >= 0
                              ? "#70E0B0"
                              : "#FF4D7F"
                          }
                        />
                        <circle
                          cx="300"
                          cy={
                            40 -
                            Math.max(
                              -1,
                              Math.min(
                                1,
                                timeframeMetrics.realizedPnl *
                                  (Math.abs(timeframeMetrics.realizedPnl) < 0.01
                                    ? 5000
                                    : Math.abs(timeframeMetrics.realizedPnl) < 1
                                    ? 100
                                    : 1),
                              ),
                            ) *
                              30
                          }
                          r="2"
                          fill={
                            timeframeMetrics.realizedPnl >= 0
                              ? "#70E0B0"
                              : "#FF4D7F"
                          }
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Performance */}
                <div className="bg-[#101114] rounded-lg p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="text-white text-sm font-medium cursor-pointer hover:text-[#70E0B0] transition-colors">
                      Performance
                    </div>
                    <InterstateTooltip label="Export">
                      <button
                        onClick={exportPerformanceData}
                        className="text-[#9CA3AF] text-sm cursor-pointer hover:text-white transition-colors"
                      >
                        <FaUpload />
                      </button>
                    </InterstateTooltip>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6B7280] font-light">
                        {selectedTimeframe} Unrealized PNL
                      </span>
                      <span className="text-white font-light">
                        {sortByUSD && solPrice > 0 ? (
                          <>
                            <SolIcon />
                            {formatSmartNumber(
                              timeframeMetrics.unrealizedPnl / solPrice,
                            )}
                          </>
                        ) : (
                          `$${timeframeMetrics.unrealizedPnl.toFixed(2)}`
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6B7280] font-light">
                        {selectedTimeframe} Realized PNL
                      </span>
                      <span className="text-white font-light">
                        {sortByUSD && solPrice > 0 ? (
                          <>
                            <SolIcon />
                            {formatSmartNumber(
                              timeframeMetrics.realizedPnl / solPrice,
                            )}
                          </>
                        ) : (
                          `${
                            timeframeMetrics.realizedPnl >= 0 ? "+" : "-"
                          }$${formatSmartNumber(
                            Math.abs(timeframeMetrics.realizedPnl),
                          )}`
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6B7280] font-light">
                        {selectedTimeframe} Total TXNS
                      </span>
                      <span className="text-white font-light">
                        {timeframeMetrics.winningTrades}/
                        {timeframeMetrics.losingTrades}
                      </span>
                    </div>

                    {/* Performance breakdown */}
                    <div className="space-y-2 mt-4">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-[#70E0B0]"></div>
                          <span className="text-[#6B7280] font-light">
                            &gt;500%
                          </span>
                        </div>
                        <span className="text-white font-light">
                          {performanceBreakdown.above500}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-[#70E0B0]"></div>
                          <span className="text-[#6B7280] font-light">
                            200% ~ 500%
                          </span>
                        </div>
                        <span className="text-white font-light">
                          {performanceBreakdown.between200And500}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-[#70E0B0]"></div>
                          <span className="text-[#6B7280] font-light">
                            0% ~ 200%
                          </span>
                        </div>
                        <span className="text:white font-light">
                          {performanceBreakdown.between0And200}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-[#FF4D7F]"></div>
                          <span className="text-[#6B7280] font-light">
                            0% ~ -50%
                          </span>
                        </div>
                        <span className="text-white font-light">
                          {performanceBreakdown.between0AndMinus50}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-[#FF4D7F]"></div>
                          <span className="text-[#6B7280] font-light">
                            &lt; -50%
                          </span>
                        </div>
                        <span className="text-white font-light">
                          {performanceBreakdown.belowMinus50}
                        </span>
                      </div>
                    </div>

                    {/* Pink line at bottom */}
                    <div className="w-full h-px bg-[#FF4D7F] mt-4"></div>
                  </div>
                </div>
              </div>

              {/* Positions Table Section  */}
              <div className="bg-[#101114] rounded-lg">
                {/* Sub-navigation tabs with controls */}
                <div className="flex items-center justify-between border-b border-[#2A2B33]">
                  <div className="flex">
                    {spotTabs.map((tab, i) => (
                      <button
                        key={tab}
                        className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                          activeSpotTab === i
                            ? "text-white border-b-2 border-[#70E0B0]"
                            : "text-[#9CA3AF] hover:text-white"
                        }`}
                        onClick={() => setActiveSpotTab(i)}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#17191E] border border-[#2A2B33] hover:border-[#374151] transition-colors">
                      <FaSearch className="text-[#9CA3AF] text-xs" />
                      <input
                        type="text"
                        placeholder="Search by name or address"
                        className="bg-transparent text-xs text-[#9CA3AF] placeholder-[#6B7280] focus:outline-none w-40"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searchQuery.trim() && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="text-[#9CA3AF] hover:text-white transition-colors"
                        >
                          <FaTimes className="text-xs" />
                        </button>
                      )}
                    </div>
                    {searchQuery.trim() && (
                      <div className="text-xs text-[#9CA3AF]">
                        {(() => {
                          const activeTab = activeSpotTab;
                          if (activeTab === 0)
                            return `${filteredPositions.length} of ${positions.length} positions`;
                          // History tab (index 1) is commented out
                          if (activeTab === 1)
                            return `${filteredTop100Positions.length} of ${top100Positions.length} positions`;
                          if (activeTab === 2)
                            return `${filteredTradeActivity.length} of ${tradeActivity.length} activities`;
                          return "";
                        })()}
                      </div>
                    )}
                    <button
                      onClick={() => setShowHidden(!showHidden)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-all duration-200 cursor-pointer text-xs ${
                        !showHidden
                          ? "bg-[#2A2B33] text-[#70E0B0]"
                          : "bg-transparent hover:bg-[#2A2B33] text-[#9CA3AF] hover:text-white"
                      }`}
                    >
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        {!showHidden ? (
                          <>
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </>
                        ) : (
                          <>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </>
                        )}
                      </svg>
                      Show Hidden
                    </button>
                    <button
                      onClick={() => setSortByUSD(!sortByUSD)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg transition-all duration-200 cursor-pointer bg-transparent text-[#9CA3AF] hover:text-white text-xs"
                    >
                      <span className="text-xs">↑↓</span>
                      {sortByUSD ? "USD" : "SOL"}
                    </button>
                  </div>
                </div>

                {/* Table Content */}
                <div className="min-h-[200px]">
                  {activeSpotTab === 0 &&
                    (userLoading ? (
                      <div className="py-8 text-center text-[#9CA3AF]">
                        Loading...
                      </div>
                    ) : !user?.id ? (
                      <div className="py-8 text-center text-[#9CA3AF]">
                        Please log in to view your positions.
                      </div>
                    ) : (
                      <Positions
                        bearerToken={user.bearerToken}
                        userId={user.id}
                        onPositionsChange={setPositions}
                        onTokenNamesChange={setTokenNames}
                        preloadedPositions={filteredPositions}
                        skipFetch={searchQuery.trim() !== ""}
                        showHidden={showHidden}
                        showInSOL={sortByUSD}
                        tokenMetadataCache={tokenMetadataCache}
                        onUpdateCache={updateTokenMetadataCache}
                        isCacheValid={isCacheValid}
                      />
                    ))}
                  {/* History tab commented out */}
                  {/* {activeSpotTab === 1 &&
                    (userLoading || loadingTradeHistory ? (
                      <div className="py-8 text-center text-[#9CA3AF]">
                        Loading...
                      </div>
                    ) : !user?.id ? (
                      <div className="py-8 text-center text-[#9CA3AF]">
                        Please log in to view your trade history.
                      </div>
                    ) : (
                      <TradeTable
                        trades={filteredTradeHistory}
                        loading={loadingTradeHistory}
                        onTokenNamesChange={setTokenNames}
                      />
                    ))} */}
                  {activeSpotTab === 1 &&
                    (userLoading ? (
                      <div className="py-8 text-center text-[#9CA3AF]">
                        Loading...
                      </div>
                    ) : !user?.id ? (
                      <div className="py-8 text-center text-[#9CA3AF]">
                        Please log in to view your positions.
                      </div>
                    ) : (
                      <Positions
                        bearerToken={user.bearerToken}
                        userId={user.id}
                        onPositionsChange={setPositions}
                        onTokenNamesChange={setTokenNames}
                        preloadedPositions={
                          searchQuery.trim() ? filteredTop100Positions : undefined
                        }
                        skipFetch={searchQuery.trim() !== ""}
                        showHidden={showHidden}
                        showInSOL={sortByUSD}
                        tokenMetadataCache={tokenMetadataCache}
                        onUpdateCache={updateTokenMetadataCache}
                        isCacheValid={isCacheValid}
                      />
                    ))}
                  {activeSpotTab === 2 &&
                    (userLoading || loadingTradeActivity ? (
                      <div className="py-8 text-center text-[#9CA3AF]">
                        Loading...
                      </div>
                    ) : !user?.id ? (
                      <div className="py-8 text-center text-[#9CA3AF]">
                        Please log in to view your activity.
                      </div>
                    ) : (
                      <div className="w-full">
                        <Activity
                          trades={filteredTradeActivity}
                          loading={loadingTradeActivity}
                          onTokenNamesChange={setTokenNames}
                          tokenMetadataCache={tokenMetadataCache}
                          onUpdateCache={updateTokenMetadataCache}
                          isCacheValid={isCacheValid}
                        />
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Wallet Section */}
          {activeSection === "wallet" && (
            <div className="bg-[#101114] rounded-lg overflow-hidden">
              {/* Header Row  */}
              <div className="grid grid-cols-2 border-b border-[#2A2B33]">
                {/* Left Panel Header */}
                <div className="px-4 py-3">
                  <div className="flex justify-between gap-2">
                    <div className="flex items-center px-3 py-1 rounded-full bg-[#17191E] border border-[#2A2B33] w-48">
                      <input
                        type="text"
                        placeholder="Search by name or address"
                        className="bg-transparent text-xs text-[#9CA3AF] placeholder-[#6B7280] focus:outline-none w-full"
                      />
                    </div>
                    <button
                      onClick={() => setShowHidden(!showHidden)}
                      className={`flex items-center gap-1 px-1 ml-10 py-1 rounded-full transition-colors duration-200 cursor-pointer text-xs whitespace-nowrap ${
                        !showHidden
                          ? "text-[#70E0B0]"
                          : "text-[#9CA3AF] hover:text-white"
                      }`}
                    >
                      <svg
                        className="w-3 h-3 flex-shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        {!showHidden ? (
                          // Eye with slash
                          <>
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </>
                        ) : (
                          // Regular eye
                          <>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </>
                        )}
                      </svg>
                      <span className="hidden sm:inline">Show Archived</span>
                      <span className="sm:hidden">Archived</span>
                    </button>
                    <button className="px-3  py-1 rounded-full bg-[#374151] text-xs text-white hover:bg-[#4B5563] transition-colors cursor-pointer whitespace-nowrap">
                      Import
                    </button>
                    <button className="px-2 py-1 rounded-full bg-[#70E0B0] text-xs text-[#1A1A1A] hover:bg-[#58B890] transition-colors cursor-pointer whitespace-nowrap">
                      Create Wallet
                    </button>
                  </div>
                </div>

                {/* Right Panel Header */}
                <div className="px-2 py-4 border-l border-[#2A2B33]">
                  <h3 className="text-white font-medium text-sm">Source wallets</h3>
                </div>
              </div>

              {/* Table Headers Row - Spans Both Panels */}
              <div className="grid grid-cols-2 border-b border-[#2A2B33]">
                <div className="px-4 py-2">
                  <div className="grid grid-cols-4 gap-2 text-xs text-[#9CA3AF]">
                    <div className="font-medium truncate">Wallet</div>
                    <div className="font-medium truncate">Balance</div>
                    <div className="font-medium truncate">Holdings</div>
                    <div className="font-medium truncate">Actions</div>
                  </div>
                </div>
                <div className="px-4 py-2 border-l border-[#2A2B33]">
                  <div className="grid grid-cols-4 gap-2 text-xs text-[#9CA3AF]">
                    <div className="font-medium truncate">Wallet</div>
                    <div className="font-medium truncate">Balance</div>
                    <div className="font-medium truncate">Holdings</div>
                    <div className="font-medium truncate">Actions</div>
                  </div>
                </div>
              </div>

              {/* Content Area */}
              <div className="grid grid-cols-2">
                {/* Left Panel Content */}
                <div className="px-4 py-3 ">
                  <div className="min-h-[300px]">
                    {user ? (
                      <div className="border-b border-[#2A2B33] hover:bg-[#17191E] transition">
                        <div className="grid grid-cols-4 gap-2 items-center py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-3 h-3 rounded bg-[#FF6B35] flex-shrink-0"></div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-white text-sm truncate">
                                Interstate Main
                              </div>
                              <div className="text-xs text-[#9CA3AF] font-mono truncate">
                                {user.publicKey.slice(0, 4)}...
                                {user.publicKey.slice(-4)}
                              </div>
                            </div>
                            <button className="text-[#9CA3AF] hover:text-white flex-shrink-0">
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                                <rect
                                  x="9"
                                  y="9"
                                  width="13"
                                  height="13"
                                  rx="2"
                                  ry="2"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                />
                                <path
                                  d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                />
                              </svg>
                            </button>
                          </div>
                          <div className="flex items-center gap-1 justify-center">
                            <SiSolana
                              className="h-3 w-3 flex-shrink-0"
                              aria-hidden="true"
                              style={{
                                color: "unset",
                                fill: "url(#solana-gradient-wallets)",
                                filter: "none",
                              }}
                            />
                            <svg className="absolute w-0 h-0">
                              <defs>
                                <linearGradient
                                  id="solana-gradient-wallets"
                                  x1="0%"
                                  y1="0%"
                                  x2="100%"
                                  y2="0%"
                                >
                                  <stop offset="0%" stopColor="#9945FF" />
                                  <stop offset="100%" stopColor="#14F195" />
                                </linearGradient>
                              </defs>
                            </svg>
                            <span className="text-xs text:white">0</span>
                          </div>
                          <div className="flex items-center gap-1 justify-center">
                            <div className="w-5 h-2.5 bg-[#374151] rounded-sm relative">
                              <div className="absolute top-0 left-0 w-2.5 h-2.5 bg-[#70E0B0] rounded-sm"></div>
                            </div>
                            <span className="text-xs text-[#9CA3AF]">0</span>
                          </div>
                          <div className="text-center">
                            <span className="text-xs text-[#9CA3AF]">-</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-24 flex-col items-center justify-center text-[#9CA3AF] text-xs">
                        Please log in to view your wallets.
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Panel Content */}
                <div className="py-3 border-l border-[#2A2B33]">
                  <div className="min-h-[150px] flex flex-col items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-[#9CA3AF]">
                      <svg
                        className="w-6 h-6"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <p className="text-xs">Drag wallets to distribute SOL</p>
                    </div>
                  </div>

                  {/* Destination Section */}
                  <div className="px-4 py-2 border-t border-[#2A2B33] flex items-center justify-between">
                    <h3 className="text-white font-medium text-sm">Destination</h3>
                    <button className="px-3 py-1 rounded-full bg-[#70E0B0] text-xs text-[#1A1A1A] hover:bg-[#58B890] transition-colors cursor-pointer">
                      Start Transfer
                    </button>
                  </div>
                  <div className="border-b border-[#2A2B33]"></div>
                  <div className="grid grid-cols-4 gap-2 px-4 py-1 text-sm text-[#9CA3AF]">
                    <div className="font-medium truncate">Wallet</div>
                    <div className="font-medium truncate">Balance</div>
                    <div className="font-medium truncate">Holdings</div>
                    <div className="font-medium truncate">Actions</div>
                  </div>
                  <div className="min-h-[150px] flex flex-col items-center justify-center">
                    <div className="text-[#9CA3AF] text-xs">
                      No destination wallets selected
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Perpetuals Section */}
          {activeSection === "perpetuals" && (
            <div className="space-y-6">
              {/* Header with Time Range */}
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-light text-white">Your holdings</h2>
                <div className="flex items-center gap-2">
                  {["1d", "7d", "30d", "Max"].map((period, index) => (
                    <button
                      key={period}
                      className={`px-3 py-1 text-sm transition-colors cursor-pointer ${
                        period === "Max"
                          ? "text-[#70E0B0] bg-[#70E0B0]/10 rounded"
                          : "text-[#9CA3AF] hover:text-white"
                      }`}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>

              {/* Performance Metrics and PNL Chart */}
              <div className="grid grid-cols-2 gap-6">
                {/* Left Panel - Performance Metrics */}
                <div className="bg-[#101114] rounded-lg p-6">
                  <h3 className="text-white font-medium text-lg mb-4">Performance</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-[#9CA3AF] mb-1">
                        All Time Volume
                      </div>
                      <div className="text-2xl font-light text-white">$0</div>
                    </div>
                    <div>
                      <div className="text-sm text-[#9CA3AF] mb-1">
                        All Time PNL
                      </div>
                      <div className="text-2xl font-light text-white">$0</div>
                      <div className="text-xs text-[#9CA3AF] mt-1">
                        Number of Trades: 0
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-sm text-[#9CA3AF] mb-1">
                        Account Value
                      </div>
                      <div className="text-2xl font-light text-white">$0</div>
                    </div>
                  </div>
                </div>

                {/* Right Panel - PNL Chart */}
                <div className="bg-[#101114] rounded-lg p-6">
                  <h3 className="text-white font-medium text-lg mb-4">PNL</h3>
                  <div className="h-48 flex items-center justify-center relative">
                    {/* Simple chart representation */}
                    <div className="w-full h-24 border-b border-[#2A2B33] relative">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-full h-px bg-[#70E0B0]"></div>
                      </div>
                    </div>
                    {/* Chart icon in bottom right */}
                    <div className="absolute bottom-2 right-2 w-6 h-6 border border-white rounded flex items-center justify-center">
                      <span className="text-xs text-white">T</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Positions Table */}
              <div className="bg-[#101114] rounded-lg overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-[#2A2B33]">
                  <button
                    className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      activePerpetualsTab === 0
                        ? "text-white border-b-2 border-[#70E0B0]"
                        : "text-[#9CA3AF] hover:text-white"
                    }`}
                    onClick={() => setActivePerpetualsTab(0)}
                  >
                    Open Positions
                  </button>
                  <button
                    className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      activePerpetualsTab === 1
                        ? "text-white border-b-2 border-[#70E0B0]"
                        : "text-[#9CA3AF] hover:text-white"
                    }`}
                    onClick={() => setActivePerpetualsTab(1)}
                  >
                    Trade History
                  </button>
                </div>

                {/* Table Headers */}
                <div className="grid grid-cols-9 gap-4 px-6 py-1 text-xs text-[#9CA3AF] border-b border-[#2A2B33]">
                  <div className="font-medium flex items-center gap-1">
                    Token ↑
                  </div>
                  <div className="font-medium">Position</div>
                  <div className="font-medium">Position Value</div>
                  <div className="font-medium">Entry Price</div>
                  <div className="font-medium">Mark Price</div>
                  <div className="font-medium">Liquidation Price</div>
                  <div className="font-medium">Margin Used (PNL)</div>
                  <div className="font-medium">TP/SL</div>
                  <div className="font-medium">Close</div>
                </div>

                {/* Content based on active tab */}
                {activePerpetualsTab === 0 && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="text-[#9CA3AF] text-sm">
                        No open positions
                      </div>
                    </div>
                  </div>
                )}

                {activePerpetualsTab === 1 && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="text-[#9CA3AF] text-sm">
                        No trade history
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}