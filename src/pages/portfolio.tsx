import React, { useState, useEffect } from "react";
import Head from "next/head";
import Header from "../components/Header";
import Footer from "../components/Footer";
import Positions from "../components/trade/Positions";
import TradeTable from "../components/trade/TradeTable";
import { useUser } from "../components/UserContext";
import InterstateTooltip from "~/components/InterstateTooltip";
import CustomCheckbox from "../components/CustomCheckbox";
import {
  getTradeHistoryByUser,
  getTradeActivityByUser,
} from "~/utils/functions";
import { formatSmartNumber } from "~/utils/db";
import type { PositionRow, TradeRow } from "~/utils/functions";
import { FaSearch, FaEye, FaUpload } from "react-icons/fa";
import { SiSolana } from "react-icons/si";

// Stacked Token Boxes Component
const StackedTokenBoxes = ({ count = 0 }: { count?: number }) => (
  <InterstateTooltip label="Tokens held">
    <div className="flex cursor-pointer items-center gap-2 transition-opacity hover:opacity-80">
      <div
        className="relative flex items-center"
        style={{ width: "32px", height: "16px" }}
      >
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className={`absolute h-4 w-4 rounded-sm ${
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
      <span className="text-sm text-white">0</span>
    </div>
  </InterstateTooltip>
);

const spotTabs = ["Active Positions", "History", "Top 100", "Activity"];

export default function PortfolioPage() {
  const [activeSection, setActiveSection] = useState<
    "spot" | "wallet" | "perpetuals"
  >("spot");
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
  const [showHidden, setShowHidden] = useState(false);
  const [sortByUSD, setSortByUSD] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState("Max");

  useEffect(() => {
    const fetchTradeHistory = async () => {
      if (user?.id && activeSpotTab === 1) {
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

    const fetchTradeActivity = async () => {
      if (user?.id && activeSpotTab === 3) {
        setLoadingTradeActivity(true);
        try {
          const activity = await getTradeActivityByUser(user.id);
          setTradeActivity(activity);
        } catch (error) {
          console.error("Failed to fetch trade activity:", error);
          setTradeActivity([]);
        } finally {
          setLoadingTradeActivity(false);
        }
      }
    };

    fetchTradeHistory();
    fetchTradeActivity();
  }, [user?.id, activeSpotTab]);

  useEffect(() => {
    if (positions.length > 0) {
      const totalPnl = positions.reduce((acc, pos) => acc + pos.pnl, 0);
      const totalRemainingValue = positions.reduce(
        (acc, pos) => acc + pos.remainingUsdValue,
        0,
      );
      const totalBoughtValue = positions.reduce(
        (acc, pos) => acc + pos.boughtUsdValue,
        0,
      );
      setUnrealizedPnl(totalPnl);
      setUnrealizedPnlPercentage(
        totalBoughtValue ? (totalPnl / totalBoughtValue) * 100 : 0,
      );
      setTotalValue(solBalance + totalRemainingValue);
    }
  }, [positions, solBalance]);

  return (
    <>
      <Head>
        <title>Portfolio | Interstate Memeboard</title>
      </Head>
      <div className="min-h-screen bg-[#06070B] text-[#E6E7EA]">
        <Header />
        <div className="px-6 pt-6">
          {/* Section Tabs */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex gap-8">
              <button
                className={`cursor-pointer text-lg font-light transition ${
                  activeSection === "spot"
                    ? "text-white"
                    : "text-[#6B7280] hover:text-white"
                }`}
                onClick={() => setActiveSection("spot")}
              >
                Spot
              </button>
              <button
                className={`cursor-pointer text-lg font-light transition ${
                  activeSection === "wallet"
                    ? "text-white"
                    : "text-[#6B7280] hover:text-white"
                }`}
                onClick={() => setActiveSection("wallet")}
              >
                Wallets
              </button>
              <button
                className={`cursor-pointer text-lg font-light transition ${
                  activeSection === "perpetuals"
                    ? "text-white"
                    : "text-[#6B7280] hover:text-white"
                }`}
                onClick={() => setActiveSection("perpetuals")}
              >
                Perpetuals
              </button>
            </div>

            {/* Right side controls for Spot section */}
            {activeSection === "spot" && (
              <div className="flex items-center gap-4">
                <InterstateTooltip label="SOL Balance">
                  <div className="flex cursor-pointer items-center gap-2 transition-opacity hover:opacity-80">
                    <SiSolana
                      className="-mt-px h-4 w-4"
                      aria-hidden="true"
                      style={{
                        color: "unset",
                        fill: "url(#solana-gradient)",
                        filter: "none",
                      }}
                    />
                    <svg className="absolute h-0 w-0">
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
                      </defs>
                    </svg>
                    <span className="text-sm text-[#9CA3AF]">0</span>
                  </div>
                </InterstateTooltip>
                <StackedTokenBoxes count={0} />
                <div className="flex items-center gap-2">
                  <FaSearch className="text-[#9CA3AF]" />
                  <input
                    type="text"
                    placeholder="Search for other wallets..."
                    className="bg-transparent text-sm text-[#9CA3AF] placeholder-[#6B7280] focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedTimeframe("1d")}
                    className={`cursor-pointer px-3 py-1 text-xs transition-colors ${
                      selectedTimeframe === "1d"
                        ? "text-white"
                        : "text-[#9CA3AF] hover:text-white"
                    }`}
                  >
                    1d
                  </button>
                  <button
                    onClick={() => setSelectedTimeframe("7d")}
                    className={`cursor-pointer px-3 py-1 text-xs transition-colors ${
                      selectedTimeframe === "7d"
                        ? "text-white"
                        : "text-[#9CA3AF] hover:text-white"
                    }`}
                  >
                    7d
                  </button>
                  <button
                    onClick={() => setSelectedTimeframe("30d")}
                    className={`cursor-pointer px-3 py-1 text-xs transition-colors ${
                      selectedTimeframe === "30d"
                        ? "text-white"
                        : "text-[#9CA3AF] hover:text-white"
                    }`}
                  >
                    30d
                  </button>
                  <button
                    onClick={() => setSelectedTimeframe("Max")}
                    className={`cursor-pointer px-3 py-1 text-xs transition-colors ${
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
            <div className="">
              {/* Top Panels */}
              <div className="grid grid-cols-3">
                {/* Balance */}
                <div className="border border-[#21242D] bg-[#101114] p-6">
                  <div className="mb-4 cursor-pointer text-sm font-medium text-white transition-colors hover:text-[#70E0B0]">
                    Balance
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-light text-[#6B7280]">
                        Total Value
                      </div>
                      <div className="text-2xl font-light text-white">
                        ${totalValue.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-light text-[#6B7280]">
                        Unrealized PNL
                      </div>
                      <div className="text-2xl font-light text-white">
                        ${unrealizedPnl.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-light text-[#6B7280]">
                        Available Balance
                      </div>
                      <div className="text-2xl font-light text-white">
                        ${formatSmartNumber(usdcBalance)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Realized PNL */}
                <div className="border border-[#21242D] bg-[#101114] p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="cursor-pointer text-sm font-medium text-white transition-colors hover:text-[#70E0B0]">
                      Realized PNL
                    </div>
                    <InterstateTooltip label="View realized profit/loss over time">
                      <svg
                        className="h-4 w-4 cursor-pointer text-[#9CA3AF] transition-colors hover:text-white"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect
                          x="3"
                          y="4"
                          width="18"
                          height="18"
                          rx="2"
                          ry="2"
                        />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                        <rect
                          x="7"
                          y="14"
                          width="3"
                          height="3"
                          fill="currentColor"
                        />
                      </svg>
                    </InterstateTooltip>
                  </div>
                  <div className="flex h-32 flex-1 items-center justify-center">
                    {/* Chart placeholder with pink line */}
                    <div className="relative h-full w-full">
                      <div className="absolute inset-0 flex items-center">
                        <div className="h-px w-full bg-[#FF4D7F]"></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Performance */}
                <div className="border border-[#21242D] bg-[#101114] p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="cursor-pointer text-sm font-medium text-white transition-colors hover:text-[#70E0B0]">
                      Performance
                    </div>
                    <InterstateTooltip label="Export performance data">
                      <FaUpload className="cursor-pointer text-sm text-[#9CA3AF] transition-colors hover:text-white" />
                    </InterstateTooltip>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="font-light text-[#6B7280]">
                        Unrealized PNL
                      </span>
                      <span className="font-light text-white">
                        ${unrealizedPnl.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-light text-[#6B7280]">
                        Realized PNL
                      </span>
                      <span className="font-light text-white">$0.00</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-light text-[#6B7280]">
                        Total TXNS
                      </span>
                      <span className="font-light text-white">0 0 / 0</span>
                    </div>

                    {/* Performance breakdown */}
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-[#70E0B0]"></div>
                          <span className="font-light text-[#6B7280]">
                            &gt;500%
                          </span>
                        </div>
                        <span className="font-light text-white">0</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-[#70E0B0]"></div>
                          <span className="font-light text-[#6B7280]">
                            200% ~ 500%
                          </span>
                        </div>
                        <span className="font-light text-white">0</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-[#70E0B0]"></div>
                          <span className="font-light text-[#6B7280]">
                            0% ~ 200%
                          </span>
                        </div>
                        <span className="font-light text-white">0</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-[#FF4D7F]"></div>
                          <span className="font-light text-[#6B7280]">
                            0% ~ -50%
                          </span>
                        </div>
                        <span className="font-light text-white">0</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-[#FF4D7F]"></div>
                          <span className="font-light text-[#6B7280]">
                            &lt; -50%
                          </span>
                        </div>
                        <span className="font-light text-white">0</span>
                      </div>
                    </div>

                    {/* Pink line at bottom */}
                    <div className="mt-4 h-px w-full bg-[#FF4D7F]"></div>
                  </div>
                </div>
              </div>

              {/* Positions Table Section  */}
              <div className="rounded-lg bg-[#101114]">
                {/* Sub-navigation tabs with controls */}
                <div className="flex items-center justify-between border-b border-[#2A2B33] py-2">
                  <div className="flex">
                    {spotTabs.map((tab, i) => (
                      <button
                        key={tab}
                        className={`cursor-pointer px-3 py-2 text-xs font-medium transition-colors ${
                          activeSpotTab === i
                            ? "border-b-2 border-[#70E0B0] text-white"
                            : "text-[#9CA3AF] hover:text-white"
                        }`}
                        onClick={() => setActiveSpotTab(i)}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex cursor-text items-center gap-2 rounded-full border border-[#2A2B33] bg-[#17191E] px-3 py-1.5 transition-colors hover:border-[#374151]">
                      <FaSearch className="text-xs text-[#9CA3AF]" />
                      <input
                        type="text"
                        placeholder="Search by name or address"
                        className="w-40 bg-transparent text-xs text-[#9CA3AF] placeholder-[#6B7280] focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => setShowHidden(!showHidden)}
                      className={`flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs transition-all duration-200 ${
                        showHidden
                          ? "bg-[#2A2B33] text-[#70E0B0]"
                          : "bg-transparent text-[#9CA3AF] hover:bg-[#2A2B33] hover:text-white"
                      }`}
                    >
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        {showHidden ? (
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
                      className="flex cursor-pointer items-center gap-1 rounded-lg bg-transparent px-2 py-1 text-xs text-[#9CA3AF] transition-all duration-200 hover:text-white"
                    >
                      <span className="text-xs">↑↓</span>
                      {sortByUSD ? "SOL" : "USD"}
                    </button>
                  </div>
                </div>

                {/* Table headers */}
                <div className="grid grid-cols-6 gap-4 border-b border-[#2A2B33] px-6 py-1 text-xs text-[#9CA3AF]">
                  <div>Token</div>
                  <div>Bought</div>
                  <div>Sold</div>
                  <div className="flex items-center gap-1">
                    Remaining
                    <span className="text-sm">↓</span>
                  </div>
                  <div>PNL</div>
                  <div>Action</div>
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
                      />
                    ))}
                  {activeSpotTab === 1 &&
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
                        trades={tradeHistory}
                        loading={loadingTradeHistory}
                      />
                    ))}
                  {activeSpotTab === 2 && (
                    <div className="py-8 text-center text-[#9CA3AF]">
                      No data.
                    </div>
                  )}
                  {activeSpotTab === 3 && (
                    <div className="px-6 py-8 text-sm font-light text-[#9CA3AF]">
                      No activity log.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Wallet Section */}
          {activeSection === "wallet" && (
            <div className="overflow-hidden rounded-lg bg-[#1E1F26]">
              {/* Header Row  */}
              <div className="grid grid-cols-2 border-b border-[#2A2B33]">
                {/* Left Panel Header */}
                <div className="px-4 py-3">
                  <div className="flex justify-between gap-2">
                    <div className="flex w-48 items-center rounded-full border border-[#2A2B33] bg-[#17191E] px-3 py-1">
                      <input
                        type="text"
                        placeholder="Search by name or address"
                        className="w-full bg-transparent text-xs text-[#9CA3AF] placeholder-[#6B7280] focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => setShowHidden(!showHidden)}
                      className={`ml-10 flex cursor-pointer items-center gap-1 rounded-full px-1 py-1 text-xs whitespace-nowrap transition-colors duration-200 ${
                        showHidden
                          ? "text-[#70E0B0]"
                          : "text-[#9CA3AF] hover:text-white"
                      }`}
                    >
                      <svg
                        className="h-3 w-3 flex-shrink-0"
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
                    <button className="cursor-pointer rounded-full bg-[#374151] px-3 py-1 text-xs whitespace-nowrap text-white transition-colors hover:bg-[#4B5563]">
                      Import
                    </button>
                    <button className="cursor-pointer rounded-full bg-[#70E0B0] px-2 py-1 text-xs whitespace-nowrap text-[#1A1A1A] transition-colors hover:bg-[#58B890]">
                      Create Wallet
                    </button>
                  </div>
                </div>

                {/* Right Panel Header */}
                <div className="border-l border-[#2A2B33] px-2 py-4">
                  <h3 className="text-sm font-medium text-white">
                    Source wallets
                  </h3>
                </div>
              </div>

              {/* Table Headers Row - Spans Both Panels */}
              <div className="grid grid-cols-2 border-b border-[#2A2B33]">
                <div className="px-4 py-2">
                  <div className="grid grid-cols-4 gap-2 text-xs text-[#9CA3AF]">
                    <div className="truncate font-medium">Wallet</div>
                    <div className="truncate font-medium">Balance</div>
                    <div className="truncate font-medium">Holdings</div>
                    <div className="truncate font-medium">Actions</div>
                  </div>
                </div>
                <div className="border-l border-[#2A2B33] px-4 py-2">
                  <div className="grid grid-cols-4 gap-2 text-xs text-[#9CA3AF]">
                    <div className="truncate font-medium">Wallet</div>
                    <div className="truncate font-medium">Balance</div>
                    <div className="truncate font-medium">Holdings</div>
                    <div className="truncate font-medium">Actions</div>
                  </div>
                </div>
              </div>

              {/* Content Area */}
              <div className="grid grid-cols-2">
                {/* Left Panel Content */}
                <div className="px-4 py-3">
                  <div className="min-h-[300px]">
                    {user ? (
                      <div className="border-b border-[#2A2B33] transition hover:bg-[#17191E]">
                        <div className="grid grid-cols-4 items-center gap-2 py-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="h-3 w-3 flex-shrink-0 rounded bg-[#FF6B35]"></div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-white">
                                Interstate Main
                              </div>
                              <div className="truncate font-mono text-xs text-[#9CA3AF]">
                                {user.publicKey.slice(0, 4)}...
                                {user.publicKey.slice(-4)}
                              </div>
                            </div>
                            <button className="flex-shrink-0 text-[#9CA3AF] hover:text-white">
                              <svg
                                width="12"
                                height="12"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
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
                          <div className="flex items-center justify-center gap-1">
                            <SiSolana
                              className="h-3 w-3 flex-shrink-0"
                              aria-hidden="true"
                              style={{
                                color: "unset",
                                fill: "url(#solana-gradient-wallets)",
                                filter: "none",
                              }}
                            />
                            <svg className="absolute h-0 w-0">
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
                            <span className="text-xs text-white">0</span>
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            <div className="relative h-2.5 w-5 rounded-sm bg-[#374151]">
                              <div className="absolute top-0 left-0 h-2.5 w-2.5 rounded-sm bg-[#70E0B0]"></div>
                            </div>
                            <span className="text-xs text-[#9CA3AF]">0</span>
                          </div>
                          <div className="text-center">
                            <span className="text-xs text-[#9CA3AF]">-</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-24 flex-col items-center justify-center text-xs text-[#9CA3AF]">
                        Please log in to view your wallets.
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Panel Content */}
                <div className="border-l border-[#2A2B33] py-3">
                  <div className="flex min-h-[150px] flex-col items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-[#9CA3AF]">
                      <svg
                        className="h-6 w-6"
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
                  <div className="flex items-center justify-between border-t border-[#2A2B33] px-4 py-2">
                    <h3 className="text-sm font-medium text-white">
                      Destination
                    </h3>
                    <button className="cursor-pointer rounded-full bg-[#70E0B0] px-3 py-1 text-xs text-[#1A1A1A] transition-colors hover:bg-[#58B890]">
                      Start Transfer
                    </button>
                  </div>
                  <div className="border-b border-[#2A2B33]"></div>
                  <div className="grid grid-cols-4 gap-2 px-4 py-1 text-sm text-[#9CA3AF]">
                    <div className="truncate font-medium">Wallet</div>
                    <div className="truncate font-medium">Balance</div>
                    <div className="truncate font-medium">Holdings</div>
                    <div className="truncate font-medium">Actions</div>
                  </div>
                  <div className="flex min-h-[150px] flex-col items-center justify-center">
                    <div className="text-xs text-[#9CA3AF]">
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
                <h2 className="text-2xl font-light text-white">
                  Your holdings
                </h2>
                <div className="flex items-center gap-2">
                  {["1d", "7d", "30d", "Max"].map((period, index) => (
                    <button
                      key={period}
                      className={`cursor-pointer px-3 py-1 text-sm transition-colors ${
                        period === "Max"
                          ? "rounded bg-[#70E0B0]/10 text-[#70E0B0]"
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
                <div className="rounded-lg bg-[#1E1F26] p-6">
                  <h3 className="mb-4 text-lg font-medium text-white">
                    Performance
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="mb-1 text-sm text-[#9CA3AF]">
                        All Time Volume
                      </div>
                      <div className="text-2xl font-light text-white">$0</div>
                    </div>
                    <div>
                      <div className="mb-1 text-sm text-[#9CA3AF]">
                        All Time PNL
                      </div>
                      <div className="text-2xl font-light text-white">$0</div>
                      <div className="mt-1 text-xs text-[#9CA3AF]">
                        Number of Trades: 0
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="mb-1 text-sm text-[#9CA3AF]">
                        Account Value
                      </div>
                      <div className="text-2xl font-light text-white">$0</div>
                    </div>
                  </div>
                </div>

                {/* Right Panel - PNL Chart */}
                <div className="rounded-lg bg-[#1E1F26] p-6">
                  <h3 className="mb-4 text-lg font-medium text-white">PNL</h3>
                  <div className="relative flex h-48 items-center justify-center">
                    {/* Simple chart representation */}
                    <div className="relative h-24 w-full border-b border-[#2A2B33]">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-px w-full bg-[#70E0B0]"></div>
                      </div>
                    </div>
                    {/* Chart icon in bottom right */}
                    <div className="absolute right-2 bottom-2 flex h-6 w-6 items-center justify-center rounded border border-white">
                      <span className="text-xs text-white">T</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Positions Table */}
              <div className="overflow-hidden rounded-lg bg-[#1E1F26]">
                {/* Tabs */}
                <div className="flex border-b border-[#2A2B33]">
                  <button
                    className={`cursor-pointer px-3 py-2 text-xs font-medium transition-colors ${
                      activePerpetualsTab === 0
                        ? "border-b-2 border-[#70E0B0] text-white"
                        : "text-[#9CA3AF] hover:text-white"
                    }`}
                    onClick={() => setActivePerpetualsTab(0)}
                  >
                    Open Positions
                  </button>
                  <button
                    className={`cursor-pointer px-3 py-2 text-xs font-medium transition-colors ${
                      activePerpetualsTab === 1
                        ? "border-b-2 border-[#70E0B0] text-white"
                        : "text-[#9CA3AF] hover:text-white"
                    }`}
                    onClick={() => setActivePerpetualsTab(1)}
                  >
                    Trade History
                  </button>
                </div>

                {/* Table Headers */}
                <div className="grid grid-cols-9 gap-4 border-b border-[#2A2B33] px-6 py-1 text-xs text-[#9CA3AF]">
                  <div className="flex items-center gap-1 font-medium">
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
                      <div className="text-sm text-[#9CA3AF]">
                        No open positions
                      </div>
                    </div>
                  </div>
                )}

                {activePerpetualsTab === 1 && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="text-sm text-[#9CA3AF]">
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
