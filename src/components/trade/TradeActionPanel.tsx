"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { LuPencil, LuCheck } from "react-icons/lu";
import { formatSmartNumber, type Token } from "~/utils/db";
import { useQuickBuy } from "~/components/QuickBuyContext";
import { FaRunning, FaGasPump, FaCoins, FaBan, FaCopy, FaExternalLinkAlt, FaTrophy, FaDice, FaUsers, FaChartBar, FaCrown, FaCrosshairs, FaFire } from "react-icons/fa";
import InterstateTooltip from "../InterstateTooltip";
import QuickBuy from "../QuickBuy";
import { createLimitOrder, tradeBuy, tradeSellPercentage, SOL_MINT_ADDRESS, ApiError } from "~/utils/api";
import { getTradeActivityByUser } from "~/utils/functions";
import toast, { type ToastOptions } from "react-hot-toast";
import {
  showCenteredErrorToast,
  showTransactionPendingToast,
  startTransactionToastTimeout,
  updateTransactionToast,
} from "~/utils/toast";
import { executeEnhancedTrade } from "~/utils/enhancedTradeHandler";
import { showEnhancedToast } from "~/utils/enhancedToast";
import { useUser } from "~/components/UserContext";
import { SiSolana } from "react-icons/si";
import useTokenStatsWebSocket from "~/hooks/useTokenStatsWebSocket";
import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";
import HighSlippageWarningDialog from "../HighSlippageWarningDialog";
import LowLiquidityWarningDialog from "../LowLiquidityWarningDialog";
import { BsCoin, BsPersonGear } from "react-icons/bs";
import { RiGhostLine } from "react-icons/ri";
import { LuChefHat } from "react-icons/lu";
import { BiCandles } from "react-icons/bi";
// import TokenAnalyticsPanel from "../TokenAnalyticsPanel";

type TimeRange = "5m" | "1h" | "12h" | "24h";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ---- style palette ---- */
const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  mint: "#70E0B0",
  mintHover: "#58B890",
  sell: "#FF4D7F",
  aiGreen: "#14b080",
  red: "#f25561",
};

const baseBtn =
  "inline-flex items-center justify-center font-semibold rounded-full transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(112_224_176_/_0.4)]";

const tabBtn =
  "pb-1.5 text-[11px] tracking-wide uppercase font-semibold text-[#9CA3AF] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(112_224_176_/_0.3)]";

/* helpers */
const num = (v: any) => (typeof v === "number" ? v : 0);
const allowDecimal = (v: string) => /^\d*([.]\d{0,9})?$/.test(v);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const LOW_LIQUIDITY_WARNING_THRESHOLD = 1_000; // USD
const HIGH_SLIPPAGE_WARNING_THRESHOLD = 50; // Percent

function getCountsAndVol(t: any, side: "buy" | "sell", window: TimeRange) {
  const s = side;
  const count =
    window === "5m"
      ? num(t[`total_${s}s_5m`])
      : window === "1h"
      ? num(t[`total_${s}s_1h`]) || num(t[`total_${s}s_60m`])
      : window === "12h"
      ? num(t[`total_${s}s_12h`]) || num(t[`total_${s}s_720m`])
      : num(t[`total_${s}s_24h`]);

  const vol =
    window === "5m"
      ? num(t[`total_${s}_volume_5m`])
      : window === "1h"
      ? num(t[`total_${s}_volume_1h`]) || num(t[`total_${s}_volume_60m`])
      : window === "12h"
      ? num(t[`total_${s}_volume_12h`]) || num(t[`total_${s}_volume_720m`])
      : num(t[`total_${s}_volume_24h`]);

  return { count, vol };
}

const prettyAmt = (s: string) => {
  if (!s || s === ".") return "";
  const n = Number(s);
  if (!Number.isFinite(n)) return "";
  return Number(n.toFixed(6)).toString();
};

// Helper function to truncate address
const truncateAddress = (address: string, start = 4, end = 4) => {
  if (!address) return "";
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
};

// Helper function to copy to clipboard
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  } catch (err) {
    showCenteredErrorToast("Failed to copy");
  }
};

// Address display component
const AddressDisplay: React.FC<{
  label: string;
  address: string;
  icon: React.ReactNode;
  solscanUrl: string;
  tooltip: string;
}> = ({ label, address, icon, solscanUrl, tooltip }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!address) return null;

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-[#2A2B33]">
      <div className="flex items-center gap-2">
        <div className="text-[#9CA3AF]">{icon}</div>
        <InterstateTooltip label={tooltip}>
          <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide cursor-help">
            {label}:
          </span>
        </InterstateTooltip>
        <span className="text-[#E6E7EA] text-[11px] font-mono">
          {truncateAddress(address)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={handleCopy}
          className="p-1 hover:bg-[#2A2B33] rounded transition-colors"
          title="Copy address"
        >
          <FaCopy className={`w-3 h-3 ${copied ? 'text-[#70E0B0]' : 'text-[#9CA3AF]'}`} />
        </button>
        <a
          href={solscanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 hover:bg-[#2A2B33] rounded transition-colors"
          title="View on Solscan"
        >
          <FaExternalLinkAlt className="w-3 h-3 text-[#9CA3AF]" />
        </a>
      </div>
    </div>
  );
};

// Token Info Dropdown Component
const TokenInfoDropdown: React.FC<{ token: any }> = ({ token }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Get token metrics (using token-analytics if available)
  const sniperPercent = token?.sniper_holding_percentage ?? 0;
  const bundlePercent = token?.bundle_holding_percentage ?? 0;
  const insiderPercent = token?.insider_holding_percentage ?? 0;
  const devPercent = token?.dev_holding_percentage ?? 0;
  const top10Percent = token?.top10_holding_percentage ?? 0;
  const lpBurned = token?.lp_burned ?? false;

  return (
    <div className="border-t border-[#2A2B33]">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-2 py-1 -mx-2 -my-1 rounded hover:bg-[#2A2B33] transition-colors"
        >
          <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide">Token Info</span>
          <svg 
            width="12" 
            height="12" 
            viewBox="0 0 12 12" 
            fill="none" 
            className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
          >
            <path d="M6 9L1 4L11 4L6 9Z" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={() => {
            // Refresh action could go here
            console.log('Refresh token info');
          }}
          className="p-1 rounded hover:bg-[#1E1F26] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="px-3 pb-3 space-y-2" style={{ backgroundColor: AX.bg }}>
          {/* Tax Percentage - Large Display */}
          <div className="rounded-md p-2.5 border" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
            <div className="text-center">
              <div className="text-[12px] font-bold mb-0.5" style={{ color: AX.muted }}>
                {token?.tax_percentage ? `${token.tax_percentage}%` : '0%'}
              </div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: AX.muted }}>Tax %</div>
            </div>
          </div>

          {/* Separator Line */}
          <div className="h-px" style={{ backgroundColor: AX.border }}></div>

          {/* Token Metrics Grid - First Row */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* Top 10 Holders */}
            <div className="rounded-md p-2 border" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5">
                  <BsPersonGear size={16} style={{ color: AX.aiGreen }} />
                  <div className="text-[12px] font-bold" style={{ color: AX.aiGreen }}>
                    {top10Percent > 0 ? `${top10Percent.toFixed(2)}%` : '0%'}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Top 10 H.</div>
              </div>
            </div>

            {/* Dev Holdings */}
            <div className="rounded-md p-2 border" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5">
                  <LuChefHat size={16} style={{ color: AX.aiGreen }} />
                  <div className="text-[12px] font-bold" style={{ color: AX.aiGreen }}>
                    {devPercent > 0 ? `${devPercent.toFixed(1)}%` : '0%'}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Dev H.</div>
              </div>
            </div>

            {/* Sniper Holdings */}
            <div className="rounded-md p-2 border" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5">
                  <FaCrosshairs size={16} style={{ color: AX.aiGreen }} />
                  <div className="text-[12px] font-bold" style={{ color: AX.aiGreen }}>
                    {sniperPercent > 0 ? `${sniperPercent.toFixed(1)}%` : '0%'}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Snipers H.</div>
              </div>
            </div>
          </div>

          {/* Token Metrics Grid - Second Row */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* Insider Holdings */}
            <div className="rounded-md p-2 border" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5">
                  <RiGhostLine size={16} style={{ color: AX.aiGreen }} />
                  <div className="text-[12px] font-bold" style={{ color: AX.aiGreen }}>
                    {insiderPercent > 0 ? `${insiderPercent.toFixed(1)}%` : '0%'}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Insiders</div>
              </div>
            </div>

            {/* Bundle Holdings */}
            <div className="rounded-md p-2 border" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5">
                  <FaDice size={16} style={{ color: AX.aiGreen }} />
                  <div className="text-[12px] font-bold" style={{ color: AX.aiGreen }}>
                    {bundlePercent > 0 ? `${bundlePercent.toFixed(2)}%` : '0%'}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Bundlers</div>
              </div>
            </div>

            {/* LP Burned */}
            <div className="rounded-md p-2 border" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5">
                  <FaFire size={16} style={{ color: AX.aiGreen }} />
                  <div className="text-[12px] font-bold" style={{ color: AX.aiGreen }}>
                    {lpBurned ? '100%' : '0%'}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>LP Burned</div>
              </div>
            </div>
          </div>

          {/* Separator Line */}
          <div className="h-px" style={{ backgroundColor: AX.border }}></div>

          {/* Additional Metrics - Third Row */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* Holders */}
            <div className="rounded-md p-2 border" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5">
                  <FaUsers className="text-white" size={16} />
                  <div className="text-[12px] font-bold" style={{ color: AX.muted }}>
                    {token?.total_holders || 0}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Holders</div>
              </div>
            </div>

            {/* Pro Traders */}
            <div className="rounded-md p-2 border" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5">
                  <BiCandles className="text-white" size={16} />
                  <div className="text-[12px] font-bold" style={{ color: AX.muted }}>
                    {token?.pro_traders || 0}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Pro Traders</div>
              </div>
            </div>

            {/* Dex Paid */}
            <div className="rounded-md p-2 border" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5">
                  <img 
                    src="https://i.pinimg.com/736x/e6/2d/e6/e62de698746dfcb09d2d64f85371eed1.jpg" 
                    alt="Dex" 
                    style={{ 
                      width: '16px', 
                      height: '16px'
                    }}
                  />
                  <div className="text-[12px] font-bold" style={{ color: token?.dex_paid ? AX.aiGreen : AX.red }}>
                    {token?.dex_paid ? 'Paid' : 'Unpaid'}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Dex Paid</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const formatCompactNumber = (n: number): string => {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  
  if (abs >= 1_000_000_000) {
    return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  }
  if (abs >= 1_000_000) {
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (abs >= 1_000) {
    return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  // For small numbers, show decimal places instead of rounding to 0
  if (abs < 1) {
    return n.toFixed(4).replace(/\.?0+$/, ""); // Show up to 4 decimal places, remove trailing zeros
  }
  return Math.round(n).toString();
};

// Meteora Migration Logo Component
const MeteoraMigrationLogo: React.FC = () => (
  <div className="flex items-center justify-center gap-1 mb-4">
    {/* Red Meteora Logo (left) */}
    <div 
      className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center relative" 
      style={{ 
        border: '0.5px solid #ff4662',
        backgroundColor: 'transparent'
      }}
    >
      <img 
        src="https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013" 
        alt="Meteora" 
        className="w-full h-full object-cover"
      />
    </div>
    
    {/* 3 Green Chevron Arrows */}
    {[0, 1, 2].map((i) => (
      <svg
        key={i}
        width="4"
        height="5"
        viewBox="0 0 4 5"
        fill="none"
        className="animate-pulse"
        style={{
          animationDelay: `${i * 0.2}s`,
          animationDuration: '1s'
        }}
      >
        <path
          d="M0.5 0.5L3.5 2.5L0.5 4.5"
          stroke="#22c55e"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ))}
    
    {/* Yellow Meteora Logo (right) */}
    <div 
      className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center relative" 
      style={{ 
        border: '0.5px solid #fbbf24',
        backgroundColor: 'transparent'
      }}
    >
      <img 
        src="https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013" 
        alt="Meteora" 
        className="w-full h-full object-cover"
        style={{ filter: 'sepia(1) saturate(5) hue-rotate(5deg) brightness(1.1)' }}
      />
    </div>
  </div>
);

interface TokenStats {
  timeframes: {
    [key: string]: {
      buys: number;
      sells: number;
      volume: number;
      buyVolume: number;
      sellVolume: number;
      change?: number;
    };
  };
}

interface TradeActionPanelProps {
  token: Token | null;
  tradeParams?: any; // Use any to match TradePageParams from queryParams
  setTradeParams?: (params: any) => void;
  quickBuySettings?: any;
  quickBuySide?: "buy" | "sell";
  initialStats?: TokenStats | null; // Initial stats from REST API
}

const TradeActionPanel: React.FC<TradeActionPanelProps> = ({ 
  token, 
  tradeParams: externalTradeParams,
  setTradeParams: setExternalTradeParams,
  quickBuySettings: externalQuickBuySettings,
  quickBuySide: externalQuickBuySide,
  initialStats
}) => {
  // Only show skeleton if we have absolutely no token data (not even optimistic)
  if (!token || (!token.name && !token.symbol)) {
    return (
      <div className="flex-shrink-0 min-w-[260px] basis-[280px] md:basis-[310px] lg:basis-[330px] hidden lg:block">
        <div className="h-full bg-neutral-800/50 rounded-lg p-4">
          <div className="animate-pulse">
            <div className="h-6 w-32 bg-neutral-700 rounded mb-4" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-neutral-700 rounded" />
              <div className="h-4 w-3/4 bg-neutral-700 rounded" />
              <div className="h-4 w-1/2 bg-neutral-700 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Determine the pool address to use: migrated_pool_address if available, otherwise pair_address
  const effectivePoolAddress = useMemo(() => {
    return token.migrated_pool_address || token.pair_address || '';
  }, [token.migrated_pool_address, token.pair_address]);

  // Internal state with fallback to external props
  const [mode, setMode] = useState<"buy" | "sell">(externalTradeParams?.mode || "buy");
  const [tab, setTab] = useState<"market" | "limit" | "adv">(externalTradeParams?.tab || "market");
  const [timeRange, setTimeRange] = useState<TimeRange>(externalTradeParams?.timeRange as TimeRange || "5m");
  const [amount, setAmount] = useState(externalTradeParams?.amount || "");
  const [targetMC, setTargetMC] = useState(externalTradeParams?.targetMC || "");
  const [sliderPct, setSliderPct] = useState(externalTradeParams?.sliderPct || 0);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [migrationMode, setMigrationMode] = useState(false);
  const [devSellMode, setDevSellMode] = useState(true);
  const [creatorAddress, setCreatorAddress] = useState<string>("");

  // High slippage warning dialog state
  const [showSlippageWarning, setShowSlippageWarning] = useState(false);
  const [showLiquidityWarning, setShowLiquidityWarning] = useState(false);
  const [pendingTradeOptions, setPendingTradeOptions] = useState<{ skipLiquidity?: boolean; skipSlippage?: boolean } | null>(null);
  const tradeButtonRef = useRef<HTMLButtonElement>(null);

  // Position data for this token
  const [positionData, setPositionData] = useState<{
    bought: number;
    boughtUsdValue: number;
    sold: number;
    soldUsdValue: number;
    remaining: number;
    remainingUsdValue: number;
    pnl: number;
    pnlPercentage: number;
  } | null>(null);

  // Check if this is a high bonding Meteora token that should show migration UI
  const isMigratingToken = useMemo(() => {
    const launchpadProtocol = token.launchpad_protocol?.toLowerCase() || '';
    const isMeteora = launchpadProtocol.includes('meteora');
    const bondingPct = token.bonding_pct ?? 0;
    return isMeteora && bondingPct > 98.6;
  }, [token.launchpad_protocol, token.bonding_pct]);

  // Convert initialStats to TokenStatsData format if available
  const convertedInitialStats = useMemo(() => {
    if (!initialStats) return null;
    
    // Ensure all timeframe objects have the required 'change' property
    const processedTimeframes: { [key: string]: { buys: number; sells: number; volume: number; buyVolume: number; sellVolume: number; change: number; } } = {};
    
    for (const [timeframe, data] of Object.entries(initialStats.timeframes)) {
      processedTimeframes[timeframe] = {
        ...data,
        change: data.change ?? 0, // Default to 0 if change is undefined
      };
    }
    
    return {
      success: true,
      tokenAddress: token.mint || '' || '',
      pairAddress: effectivePoolAddress || '',
      dataSource: 'rest-api',
      timestamp: new Date().toISOString(),
      data: {
        timeframes: processedTimeframes,
      },
    };
  }, [initialStats, token.mint || '' || '', effectivePoolAddress]);

  // WebSocket hook for real-time token stats
  const {
    isConnected: wsConnected,
    loading: wsLoading,
    error: wsError,
    data: wsData,
    getFormattedStats,
  } = useTokenStatsWebSocket({
    pairAddress: effectivePoolAddress,
    tokenAddress: token.mint || '',
    enabled: true,
    initialStats: convertedInitialStats,
  });

  // Update internal state when external props change (only on mount)
  useEffect(() => {
    if (externalTradeParams) {
      setMode(externalTradeParams.mode);
      setTab(externalTradeParams.tab);
      setTimeRange(externalTradeParams.timeRange as TimeRange);
      setAmount(externalTradeParams.amount);
      setTargetMC(externalTradeParams.targetMC);
      setSliderPct(externalTradeParams.sliderPct);
    }
  }, []); // Only run on mount

  // Update external state when internal state changes (debounced)
  const updateExternalParams = useCallback(() => {
    if (setExternalTradeParams) {
      setExternalTradeParams({
        mode,
        tab,
        timeRange,
        amount,
        targetMC,
        sliderPct,
      });
    }
  }, [mode, tab, timeRange, amount, targetMC, sliderPct, setExternalTradeParams]);

  // Debounce external updates to avoid loops
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateExternalParams();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [mode, tab, timeRange, amount, targetMC, sliderPct, updateExternalParams]);

  const { presets: qbPresets, activePreset } = useQuickBuy();
  const { user, solBalance } = useUser();
  
  // Calculate position data from trade activity (like Activity tab does)
  useEffect(() => {
    const calculatePositionFromTrades = async () => {
      if (!user?.id || !token?.mint) {
        const emptyData = {
          bought: 0,
          boughtUsdValue: 0,
          sold: 0,
          soldUsdValue: 0,
          remaining: 0,
          remainingUsdValue: 0,
          pnl: 0,
          pnlPercentage: 0,
        };
        setPositionData(emptyData);
        return;
      }
      
      try {
        // Get all trade activity for this user (like Activity tab)
        const trades = await getTradeActivityByUser(user.id.toString());
        
        console.log('🔍 TradeActionPanel - Fetched trade activity:', trades.length, 'trades');
        console.log('🔍 TradeActionPanel - Looking for token:', token.mint || '');
        
        // Filter trades for this specific token
        const tokenTrades = trades.filter((trade: any) => 
          trade.tokenAddress?.toLowerCase() === token.mint || ''?.toLowerCase()
        );
        
        console.log('🔍 TradeActionPanel - Found', tokenTrades.length, 'trades for this token');
        
        if (tokenTrades.length > 0) {
          // Calculate position from individual trades
          let bought = 0;
          let boughtUsdValue = 0;
          let sold = 0;
          let soldUsdValue = 0;
          
          tokenTrades.forEach((trade: any) => {
            if (trade.type === 'Buy') {
              bought += Number(trade.tokenAmount) || 0;
              boughtUsdValue += Number(trade.usdValue) || 0;
            } else if (trade.type === 'Sell') {
              sold += Number(trade.tokenAmount) || 0;
              soldUsdValue += Number(trade.usdValue) || 0;
            }
          });
          
          const remaining = bought - sold;
          
          // Calculate PnL: (sold value + remaining value) - bought value
          // For remaining value, we'll use the average price of remaining tokens
          const avgBoughtPrice = bought > 0 ? boughtUsdValue / bought : 0;
          const remainingUsdValue = remaining * avgBoughtPrice;
          const pnl = (soldUsdValue + remainingUsdValue) - boughtUsdValue;
          const pnlPercentage = boughtUsdValue > 0 ? (pnl / boughtUsdValue) * 100 : 0;
          
          const newData = {
            bought,
            boughtUsdValue,
            sold,
            soldUsdValue,
            remaining,
            remainingUsdValue,
            pnl,
            pnlPercentage,
          };
          
          setPositionData(newData);
          console.log('✅ TradeActionPanel - Calculated position from trades:', newData);
          console.log('🔍 Sample trades:', tokenTrades.slice(0, 3));
          console.log('🔍 Position data set:', {
            bought: newData.bought,
            boughtUsdValue: newData.boughtUsdValue,
            sold: newData.sold,
            soldUsdValue: newData.soldUsdValue,
            remaining: newData.remaining,
            remainingUsdValue: newData.remainingUsdValue,
            pnl: newData.pnl,
            pnlPercentage: newData.pnlPercentage
          });
        } else {
          // No trades found for this token
          setPositionData({
            bought: 0,
            boughtUsdValue: 0,
            sold: 0,
            soldUsdValue: 0,
            remaining: 0,
            remainingUsdValue: 0,
            pnl: 0,
            pnlPercentage: 0,
          });
          console.log('ℹ️ TradeActionPanel - No trades found for token:', token.mint || '');
        }
      } catch (error) {
        console.error('Error calculating position from trades:', error);
        setPositionData({
          bought: 0,
          boughtUsdValue: 0,
          sold: 0,
          soldUsdValue: 0,
          remaining: 0,
          remainingUsdValue: 0,
          pnl: 0,
          pnlPercentage: 0,
        });
      }
    };
    
    calculatePositionFromTrades();
    
    // Refresh position data every 10 seconds
    const interval = setInterval(calculatePositionFromTrades, 10000);
    return () => clearInterval(interval);
  }, [user?.id, token?.mint]);
  
  // Use external QuickBuy settings if available, otherwise use internal context
  const settings = externalQuickBuySettings || (
    mode === "buy"
      ? qbPresets[activePreset].quickBuySettings
      : qbPresets[activePreset].quickSellSettings
  );

  const baseMarketCap: number = useMemo(() => {
    const t: any = token || {};
    return Number(
      t.market_cap_usd ??
        t.marketcap_usd ??
        t.market_cap ??
        t.marketcap ??
        t.fdv_usd ??
        t.fdv ??
        0
    ) || 0;
  }, [token]);

  // Derive % change from base MC -> targetMC (used to display slider value)
  const derivedPct: number = useMemo(() => {
    const t = Number(targetMC);
    if (!baseMarketCap || !Number.isFinite(t)) return 0;
    // Allow negative percentages even when targetMC is 0
    if (t <= 0) {
      // Calculate what percentage would result in 0 market cap
      return -100;
    }
    return clamp(Math.round(((t - baseMarketCap) / baseMarketCap) * 100), -100, 100);
  }, [targetMC, baseMarketCap]);

  // Initialize target market cap on entering Limit tab if empty/zero
  useEffect(() => {
    if (tab === "limit" && baseMarketCap > 0) {
      const t = Number(targetMC);
      if (!Number.isFinite(t) || t === 0) {
        setTargetMC(String(Math.round(baseMarketCap)));
        setSliderPct(0);
      }
    }
  }, [tab, baseMarketCap]);

  // Sync slider percentage when market cap changes (e.g., from typing)
  useEffect(() => {
    if (baseMarketCap && targetMC) {
      const t = Number(targetMC);
      if (Number.isFinite(t) && t > 0) {
        const calculatedPct = Math.round(((t - baseMarketCap) / baseMarketCap) * 100);
        const clampedPct = clamp(calculatedPct, -100, 100);
        setSliderPct(clampedPct);
      }
    }
  }, [targetMC, baseMarketCap]);

  // Real-time stats from WebSocket with fallback to static data
  const realTimeStats = useMemo(() => {
    if (wsData && wsData.data && wsData.data.timeframes) {
      // Use WebSocket data directly since timeframes now match
      const wsTimeframe = timeRange;
      const stats = getFormattedStats(wsTimeframe);
      return {
        buys: stats.buys,
        sells: stats.sells,
        volume: stats.volume,
        buyVolume: stats.buyVolume,
        sellVolume: stats.sellVolume,
        netVolume: stats.netVolume,
        buyPercentage: stats.buyPercentage,
        sellPercentage: stats.sellPercentage,
      };
    } else {
      // Fallback to static data
      const buyStats = getCountsAndVol(token as any, "buy", timeRange);
      const sellStats = getCountsAndVol(token as any, "sell", timeRange);
      const totalVol = (buyStats.vol ?? 0) + (sellStats.vol ?? 0);
      const buyPct = totalVol ? (buyStats.vol / totalVol) * 100 : 50;
      const sellPct = 100 - buyPct;
      const netVol = (buyStats.vol ?? 0) - (sellStats.vol ?? 0);
      
      return {
        buys: buyStats.count,
        sells: sellStats.count,
        volume: totalVol,
        buyVolume: buyStats.vol,
        sellVolume: sellStats.vol,
        netVolume: netVol,
        buyPercentage: buyPct,
        sellPercentage: sellPct,
      };
    }
  }, [wsData, timeRange, getFormattedStats, token]);

  // Extract stats for easier access
  const { buys, sells, volume, buyVolume, sellVolume, netVolume, buyPercentage, sellPercentage } = realTimeStats;

  const liquidityUsd = useMemo(() => {
    if (!token) return 0;
    const possibleValues = [
      token.total_liquidity_usd,
      (token as any).liquidity_usd,
      (token as any).liquidityUsd,
      (token as any).total_liquidityUsd,
    ];
    for (const value of possibleValues) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }
    }
    // Fall back to zero if we have no positive readings
    return Number(token.total_liquidity_usd) || 0;
  }, [token]);

  // Fetch creator address from token-service
  useEffect(() => {
    const fetchCreatorAddress = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/tokens/dev?tokenAddress=${token.mint || ''}&limit=1`
        );
        if (response.ok) {
          const data = await response.json();
          console.log('📊 Creator address data received:', data);
          
          if (data?.filterTokens?.results?.[0]?.token?.creatorAddress) {
            const creatorAddr = data.filterTokens.results[0].token.creatorAddress;
            console.log('✅ Creator address found:', creatorAddr);
            setCreatorAddress(creatorAddr);
          } else {
            console.log('⚠️ No creator address found in response');
          }
        } else {
          console.warn('⚠️ Creator address fetch failed with status:', response.status);
        }
      } catch (error) {
        console.error("❌ Failed to fetch creator address:", error);
      }
    };
    
    if (token.mint || '') {
      fetchCreatorAddress();
    }
  }, [token.mint || '']);

  // amount presets - different for buy vs sell
  const buyPresets = [0.01, 0.1, 0.5, 1];
  const sellPresets = [10, 25, 50, 100];
  const [amountPresets, setAmountPresets] = useState<number[]>(buyPresets);
  const [editingPresets, setEditingPresets] = useState(false);
  const [presetDrafts, setPresetDrafts] = useState<string[]>(buyPresets.map(String));
  
  // Update presets when mode changes and clear amount
  useEffect(() => {
    const newPresets = mode === "sell" ? sellPresets : buyPresets;
    setAmountPresets(newPresets);
    setPresetDrafts(newPresets.map(String));
    // Clear amount when switching modes to avoid confusion
    setAmount("");
  }, [mode]);
  
  useEffect(() => setPresetDrafts(amountPresets.map(String)), [amountPresets]);

  const commitPresetDrafts = () => {
    const next = presetDrafts.map((s, idx) => {
      // Handle empty string, just ".", or whitespace as 0
      if (!s || s.trim() === "" || s.trim() === ".") {
        return 0;
      }
      const n = parseFloat(s);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
    setAmountPresets(next);
    setEditingPresets(false);
    // Force re-render by updating the drafts
    setPresetDrafts(next.map(String));
  };

  const initiateTrade = useCallback(
    async (overrides?: { skipLiquidity?: boolean; skipSlippage?: boolean }) => {
      const options = {
        skipLiquidity: overrides?.skipLiquidity ?? false,
        skipSlippage: overrides?.skipSlippage ?? false,
      };

      setPendingTradeOptions(options);

      if (!user?.bearerToken) {
        setSuccessMessage(null);
        showCenteredErrorToast("Authentication required to create orders.");
        setPendingTradeOptions(null);
        return;
      }

      const shouldCheckLiquidity =
        mode === "buy" && tab === "market" && !options.skipLiquidity;

      if (shouldCheckLiquidity) {
        setPendingTradeOptions({ ...options, skipLiquidity: true });
        setShowLiquidityWarning(true);
        return;
      }

      const shouldCheckSlippage = tab === "market" && !options.skipSlippage;

      if (shouldCheckSlippage) {
        const slippagePercent = (settings.maxSlippage || 0.2) * 100;
        if (slippagePercent >= HIGH_SLIPPAGE_WARNING_THRESHOLD) {
          setPendingTradeOptions({ ...options, skipSlippage: true });
          setShowSlippageWarning(true);
          return;
        }
      }

      setPendingTradeOptions(null);
      setIsLoading(true);
      setSuccessMessage(null);

      if (tab === "limit") {
        if (!amount || !targetMC) {
          setSuccessMessage(null);
          showCenteredErrorToast("Amount and Target Market Cap are required for limit orders.");
          setIsLoading(false);
          return;
        }
        const numericAmount = Number(amount);
        const numericTargetMC = Number(targetMC);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
          setSuccessMessage(null);
          showCenteredErrorToast("Enter a valid amount.");
          setIsLoading(false);
          return;
        }
        if (!Number.isFinite(numericTargetMC) || numericTargetMC <= 0) {
          setSuccessMessage(null);
          showCenteredErrorToast("Enter a valid target market cap.");
          setIsLoading(false);
          return;
        }
        let pendingToastId: string | null = null;
        let clearToastTimeout = () => undefined;
        try {
          pendingToastId = showTransactionPendingToast("Attempting transaction...");
          clearToastTimeout = startTransactionToastTimeout(pendingToastId);
          await createLimitOrder(
            {
              tokenAddress: token.mint || "",
              amount: Number(amount),
              type: mode === "buy" ? "Buy" : "Sell",
              direction: "Above",
              targetMC: Number(targetMC),
              currentPrice: token.usd_price,
              currentMarketCap: token.market_cap_usd || token.fully_diluted_value,
              tokenName: token.name,
              tokenSymbol: token.symbol,
              tokenDecimals: token.decimals,
              poolAddress: effectivePoolAddress,
              pairAddress: token.pair_address || "",
              poolType: getPoolTypeFromToken(token),
            },
            user.bearerToken
          );
          clearToastTimeout();
          updateTransactionToast(
            pendingToastId,
            "success",
            `✅ Limit order for ${token.symbol} created successfully!`
          );
          setSuccessMessage(`Limit order for ${token.symbol} created successfully!`);
          setAmount("");
          setTargetMC("");
        } catch (error: any) {
          clearToastTimeout();
          const errorMsg =
            error.message?.length > 60 ? `${error.message.substring(0, 57)}...` : error.message || "Failed to create limit order";
          updateTransactionToast(pendingToastId, "error", `❌ Failed to create limit order: ${errorMsg}`);
          setSuccessMessage(null);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      if (mode === "buy") {
        const requested = Number(amount || 0);
        if (!requested || requested <= 0) {
          setIsLoading(false);
          setSuccessMessage(null);
          showEnhancedToast("error", "Please enter a valid SOL amount", {
            title: "Invalid Amount",
          });
          return;
        }
      } else if (mode === "sell") {
        const percentage = Number(amount || 0);
        if (!percentage || percentage <= 0) {
          setIsLoading(false);
          setSuccessMessage(null);
          showEnhancedToast("error", "Please enter a valid percentage", {
            title: "Invalid Percentage",
          });
          return;
        }
        if (percentage > 100) {
          setIsLoading(false);
          setSuccessMessage(null);
          showEnhancedToast("error", "Percentage cannot exceed 100%", {
            title: "Invalid Percentage",
          });
          return;
        }
      }

      const result = await executeEnhancedTrade({
        token,
        amount: Number(amount),
        side: mode,
        settings,
        user: { bearerToken: user.bearerToken, id: user.id },
        solBalance: Number(solBalance),
        solPriceUsd: 150,
        onSuccess: async (txHash, stats) => {
          console.log("✅ Enhanced Trade successful:", { txHash, stats });
          setSuccessMessage(
            `✅ Trade successful! ${mode === "buy" ? "Bought" : "Sold"} ${stats.tokenAmount || "tokens"} ${token.symbol}. Tx: ${String(
              txHash
            ).slice(0, 8)}...`
          );

          setTimeout(async () => {
            try {
              const trades = await getTradeActivityByUser(user.id.toString());
              const tokenTrades = trades.filter(
                (trade: any) => trade.tokenAddress?.toLowerCase() === (token.mint || "").toLowerCase()
              );

              if (tokenTrades.length > 0) {
                let bought = 0;
                let boughtUsdValue = 0;
                let sold = 0;
                let soldUsdValue = 0;

                tokenTrades.forEach((trade: any) => {
                  if (trade.type === "Buy") {
                    bought += Number(trade.tokenAmount) || 0;
                    boughtUsdValue += Number(trade.usdValue) || 0;
                  } else if (trade.type === "Sell") {
                    sold += Number(trade.tokenAmount) || 0;
                    soldUsdValue += Number(trade.usdValue) || 0;
                  }
                });

                const remaining = bought - sold;
                const avgBoughtPrice = bought > 0 ? boughtUsdValue / bought : 0;
                const remainingUsdValue = remaining * avgBoughtPrice;
                const pnl = soldUsdValue + remainingUsdValue - boughtUsdValue;
                const pnlPercentage = boughtUsdValue > 0 ? (pnl / boughtUsdValue) * 100 : 0;

                const newData = {
                  bought,
                  boughtUsdValue,
                  sold,
                  soldUsdValue,
                  remaining,
                  remainingUsdValue,
                  pnl,
                  pnlPercentage,
                };

                setPositionData(newData);
                console.log("🔄 TradeActionPanel - Position data refreshed after trade:", newData);
              }
            } catch (error) {
              console.error("Error refreshing position data:", error);
            }
          }, 2000);
        },
        onError: (error) => {
          console.error("❌ Enhanced Trade failed:", error);
          setSuccessMessage(null);
        },
        onWarning: (warnings) => {
          console.warn("⚠️ Pre-transaction warnings:", warnings);
        },
      });

      setIsLoading(false);

      return result;
    },
    [
      amount,
      mode,
      settings,
      solBalance,
      tab,
      targetMC,
      token,
      user,
      effectivePoolAddress,
    ]
  );

  // High slippage warning handlers
  const handleSlippageWarningContinue = useCallback(() => {
    setShowSlippageWarning(false);
    const next = { ...(pendingTradeOptions || {}), skipSlippage: true };
    void initiateTrade(next);
  }, [pendingTradeOptions, initiateTrade]);

  const handleSlippageWarningCancel = useCallback(() => {
    setShowSlippageWarning(false);
    setPendingTradeOptions(null);
    setIsLoading(false);
  }, []);

  const handleLiquidityWarningContinue = useCallback(() => {
    setShowLiquidityWarning(false);
    const next = { ...(pendingTradeOptions || {}), skipLiquidity: true };
    void initiateTrade(next);
  }, [pendingTradeOptions, initiateTrade]);

  const handleLiquidityWarningCancel = useCallback(() => {
    setShowLiquidityWarning(false);
    setPendingTradeOptions(null);
    setIsLoading(false);
  }, []);

  return (
    <div
      className="flex flex-col text-[12px] leading-tight"
      style={{ backgroundColor: '#0f1012', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial', paddingBottom: '100px' }}
    >
      {/* ===== A. Time buttons ===== */}
      <div className="px-3 pt-2 pb-2 border-b border-[#2A2B33]">
        <div className="mx-auto w-full max-w-xl overflow-hidden">
          <div className="flex gap-1 rounded-xl bg-[#1E1F26] border border-[#2A2B33] p-1">
            {(["5m", "1h", "12h", "24h"] as TimeRange[]).map((rng) => {
              // Get change from WebSocket data if available, otherwise fallback to token properties
              let ch = 0;
              if (wsData && wsData.data && wsData.data.timeframes) {
                // Map from WebSocket timeframes data to timeframe changes
                // Use change property if available, otherwise fallback to 0
                const changeMap: Record<TimeRange, number> = {
                  "5m": Number(wsData.data.timeframes["5m"]?.change ?? 0),
                  "1h": Number(wsData.data.timeframes["1h"]?.change ?? 0),
                  "12h": Number(wsData.data.timeframes["12h"]?.change ?? 0),
                  "24h": Number(wsData.data.timeframes["24h"]?.change ?? 0),
                };
                ch = changeMap[rng] ?? 0;
              } else {
                // Fallback to token properties
                const changeMap: Record<TimeRange, number> = {
                  "5m": Number((token as any).price_change_5m ?? (token as any).change_5m ?? 0),
                  "1h": Number((token as any).price_change_1h ?? (token as any).change_1h ?? 0),
                  "12h": Number((token as any).price_change_12h ?? (token as any).change_12h ?? 0),
                  "24h": Number((token as any).price_change_24h ?? (token as any).change_24h ?? 0),
                };
                ch = changeMap[rng] ?? 0;
              }
              const isUp = ch >= 0;
              const abs = Math.abs(ch);

              return (
                <button
                  key={rng}
                  onClick={() => setTimeRange(rng)}
                  aria-pressed={timeRange === rng}
                  className={cx(
                    "flex-1 h-9 rounded-lg px-2 text-left flex flex-col items-start justify-center cursor-pointer",
                    timeRange === rng ? "bg-[#17191E] ring-1 ring-white/10" : "hover:bg-[#1E1F26]"
                  )}
                >
                  <span
                    className={cx(
                      "text-[11px] tracking-wide uppercase font-semibold",
                      timeRange === rng ? "text-[#E6E7EA]" : "text-[#9CA3AF]"
                    )}
                  >
                    {rng}
                  </span>
                  <span className={cx("text-[10px] tabular-nums", isUp ? "text-[#70E0B0]" : "text-[#FF4D7F]")}>
                    {isUp ? "+" : "-"}
                    {abs.toFixed(2)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== B. Real-time Stats ===== */}
      <div className="px-3 py-1.5 border-b border-[#2A2B33]">
        <div className="grid grid-cols-4 gap-3 tabular-nums">
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide whitespace-nowrap">
              {timeRange} Vol
            </div>
            <div className="text-[#E6E7EA] whitespace-nowrap text-[11px]">${formatCompactNumber(Math.round(volume || 0))}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Buys</div>
            <div className="whitespace-nowrap tabular-nums text-[#70E0B0] flex items-baseline gap-0.5 text-[11px]">
              <span>{formatCompactNumber(Math.round(buys ?? 0))}</span>
              <span className="text-[#9CA3AF]">/</span>
              <span className="text-[#70E0B0]">${formatCompactNumber(Math.round(buyVolume || 0))}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Sells</div>
            <div className="whitespace-nowrap tabular-nums text-[#FF4D7F] flex items-baseline gap-0.5 text-[11px]">
              <span>{formatCompactNumber(Math.round(sells ?? 0))}</span>
              <span className="text-[#9CA3AF]">/</span>
              <span className="text-[#FF4D7F]">${formatCompactNumber(Math.round(sellVolume || 0))}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Net</div>
            <div className={cx("whitespace-nowrap tabular-nums text-[11px]", netVolume >= 0 ? "text-[#70E0B0]" : "text-[#FF4D7F]")}>
              {netVolume >= 0 ? "+" : "-"}${formatCompactNumber(Math.round(Math.abs(netVolume)))}
            </div>
          </div>
        </div>
        <div className="mt-1 h-0.5 w-full rounded-full bg-[#17191E] relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full" style={{ width: `${buyPercentage}%`, background: AX.mint }} />
          <div className="absolute right-0 top-0 h-full" style={{ width: `${sellPercentage}%`, background: AX.sell }} />
        </div>
      </div>

      {/* ===== C. Buy/Sell switcher ===== */}
      <div className="px-3 py-1.5 -mt-px border-b border-[#2A2B33]">
        <div className="mx-auto w-full max-w-xl relative">
          <div className="relative h-9 rounded-lg border border-[#2A2B33] bg-[#1E1F26] overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full w-1/2 rounded-md transition-transform duration-200"
              style={{
                transform: mode === "sell" ? "translateX(100%)" : "translateX(0%)",
                background: mode === "buy" ? AX.mint : AX.sell,
              }}
            />
            <div className="relative z-10 grid grid-cols-2 h-full">
              <button
                className={cx(
                  "cursor-pointer select-none text-[13px] font-semibold",
                  "flex items-center justify-center h-full",
                  mode === "buy" ? "text-black" : "text-[#C7CBD1] hover:text-white"
                )}
                onClick={() => setMode("buy")}
              >
                Buy
              </button>
              <button
                className={cx(
                  "cursor-pointer select-none text-[13px] font-semibold",
                  "flex items-center justify-center h-full",
                  mode === "sell" ? "text-black" : "text-[#C7CBD1] hover:text-white"
                )}
                onClick={() => setMode("sell")}
              >
                Sell
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== D. Tabs ===== */}
      <div className="px-3 pt-1 pb-1.5 border-b border-[#2A2B33]">
        <div className="flex items-center gap-6">
          {(["market", "limit", "adv"] as const).map((t) => (
            <button
              key={t}
              className={cx(
                tabBtn, 
                "hover:text-[#E6E7EA]", 
                tab === t && "text-[#70E0B0] border-b-2 border-[#70E0B0]",
                isMigratingToken && t === "market" && "opacity-50 cursor-not-allowed blur-sm"
              )}
              onClick={() => {
                if (isMigratingToken && t === "market") return; // Disable market tab for migrating tokens
                setTab(t);
              }}
              disabled={isMigratingToken && t === "market"}
            >
              {t === "adv" ? "Adv." : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Migration Message for High Bonding Meteora Tokens ===== */}
      {isMigratingToken && (
        <div className="px-3 pt-4 pb-2">
          <div className="text-center">
            <MeteoraMigrationLogo />
            <p className="text-white text-sm leading-relaxed">
              This pair is currently migrating. This may take up to 30 minutes. In the meantime, you can still place limit orders, and buy or sell on migration!
            </p>
          </div>
        </div>
      )}

      {/* ===== E. Migration/Dev Sell Toggle ===== */}
      {tab === "adv" && (
        <div className="px-3 pt-2">
          <div className="mx-auto w-full max-w-xs relative rounded-md border border-[#2A2B33] bg-[#1E1F26] p-0.5">
            <div
              className="absolute top-0 left-0 h-full w-1/2 rounded-md transition-transform duration-200"
              style={{
                transform: migrationMode ? "translateX(0%)" : "translateX(100%)",
                background: '#4B5563',
              }}
            />
            <div className="relative flex">
              <button
                type="button"
                className={cx(
                  "flex-1 py-1.5 text-[12px] font-medium transition-colors duration-200 rounded-md flex items-center justify-center gap-1",
                  migrationMode ? "text-[#70E0B0]" : "text-[#9CA3AF]"
                )}
                onClick={() => {
                  setMigrationMode(true);
                  setDevSellMode(false);
                }}
              >
                <span>»</span>
                Migration
              </button>
              <button
                type="button"
                className={cx(
                  "flex-1 py-1.5 text-[12px] font-medium transition-colors duration-200 rounded-md flex items-center justify-center gap-1",
                  devSellMode ? "text-[#70E0B0]" : "text-[#9CA3AF]"
                )}
                onClick={() => {
                  setDevSellMode(true);
                  setMigrationMode(false);
                }}
              >
                <span>↑</span>
                Dev Sell
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== F. Amount ===== */}
      <div className="px-3 pt-2">
        <div className="mx-auto w-full max-w-xl relative rounded-lg border border-[#2A2B33] bg-[#1E1F26]">
          <div className="flex items-center justify-between gap-3 px-3 py-1.5">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide">Amount</span>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                className="h-8 w-20 bg-transparent border-none text-left pl-2
                           text-[12px] font-normal text-[#E6E7EA] tabular-nums
                           placeholder:text-[#9CA3AF] focus:outline-none"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, ".");
                  if (allowDecimal(raw)) setAmount(raw);
                }}
                onBlur={(e) => {
                  // When user finishes typing, check if amount meets minimum (buy mode only)
                  const value = Number(e.target.value);
                  if (mode === "buy" && value > 0) {
                    const poolType = getPoolTypeFromToken(token);
                    const minAmount = 0.001; // Standard minimum for all pools
                    
                    if (value < minAmount) {
                      setAmount(String(minAmount));
                      showEnhancedToast('warning', `Amount auto-corrected to minimum: ${minAmount} SOL`, {
                        title: 'Minimum Amount',
                      });
                    }
                  }
                }}
              />
            </div>
            <div className="flex items-center justify-center w-5 h-5">
              {mode === "sell" ? (
                // Show % symbol for sell mode
                <span className="text-[14px] font-semibold text-[#E6E7EA]">%</span>
              ) : (
                // Show SOL logo for buy mode
                <svg width="16" height="16" viewBox="0 0 397.7 311.7" fill="none">
                  <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear)"/>
                  <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear)"/>
                  <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear)"/>
                  <defs>
                    <linearGradient id="paint0_linear" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#00FFA3"/>
                      <stop offset="1" stopColor="#DC1FFF"/>
                    </linearGradient>
                    <linearGradient id="paint1_linear" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#00FFA3"/>
                      <stop offset="1" stopColor="#DC1FFF"/>
                    </linearGradient>
                    <linearGradient id="paint2_linear" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#00FFA3"/>
                      <stop offset="1" stopColor="#DC1FFF"/>
                    </linearGradient>
                  </defs>
                </svg>
              )}
            </div>
          </div>
          
          {/* Minimum Amount Hint - only for buy mode */}
          {tab === "market" && mode === "buy" && (() => {
            const poolType = getPoolTypeFromToken(token);
            const minimums: Record<string, number> = {
              "meteora amm v2": 0.0001,
              "meteora amm v1": 0.0001,
              "Raydium CPMM": 0.00001,
              "Raydium AMM": 0.00001,
              "PumpAmm": 0.000001,
              "Pumpfun": 0.000001,
              "meteora dbc": 0.000001,
            };
            const minAmount = minimums[poolType];
            
            if (minAmount && minAmount > 0.000001) {
              return (
                <div className="px-3 py-1.5 text-[10px] text-neutral-500">
                  ℹ️ Minimum: {minAmount} SOL for {token.launchpad_protocol || token.protocol || poolType}
                </div>
              );
            }
            return null;
          })()}

          {/* Presets */}
          <div className="border-t border-[#2A2B33] rounded-b-lg overflow-hidden">
            <div className="grid grid-cols-5">
              {amountPresets.map((opt, i) => {
                const currentValue = editingPresets ? (presetDrafts[i] || "") : String(opt);
                const active = amount === currentValue;
                if (editingPresets) {
                  return (
                    <div key={i} className="h-9 border-r border-[#2A2B33] last:border-r-0 min-w-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="h-full w-full bg-[#17191E] text-center text-[12px] font-semibold text-[#E6E7EA]
                                   outline-none focus:bg-[#1E1F26]"
                        value={presetDrafts[i] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.replace(/,/g, ".");
                          if (allowDecimal(v)) {
                            setPresetDrafts((d) => d.map((x, idx) => (idx === i ? v : x)));
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitPresetDrafts();
                          }
                        }}
                      />
                    </div>
                  );
                }
                return (
                  <button
                    key={i}
                    type="button"
                    className={cx(
                      "h-9 border-r border-[#2A2B33] last:border-r-0 text-[12px] font-semibold tabular-nums",
                      active
                        ? "bg-[#2A2B33] text-[#E6E7EA]"
                        : "bg-[#17191E] hover:bg-[#1E1F26] text-[#E6E7EA]"
                    )}
                    onClick={() => setAmount(String(opt))}
                  >
                    {opt}
                  </button>
                );
              })}
              {!editingPresets ? (
                <button
                  type="button"
                  onClick={() => setEditingPresets(true)}
                  className="h-9 bg-[#17191E] hover:bg-[#1E1F26] text-[#E6E7EA]"
                  title="Edit preset values"
                >
                  <LuPencil className="mx-auto h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={commitPresetDrafts}
                  className="h-9 bg-[#1E1F26] text-[#E6E7EA] hover:bg-[#17191E]"
                  title="Done"
                >
                  <LuCheck className="mx-auto h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== F. LIMIT FIELDS (with SLIDER) ===== */}
      {tab === "limit" && (
        <div className="px-3 pt-2 space-y-3">
          {/* Market cap input */}
          <div className=" pt-2 pb-3">
            <div className="mx-auto w-full max-w-xl relative rounded-lg border border-[#2A2B33] bg-[#1E1F26] mb-3">
              <div className="flex items-center justify-between gap-3 px-3 py-1.5">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide">MKT CAP</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    className="h-8 w-20 bg-transparent border-none text-left pl-2
                               text-[12px] font-normal text-[#E6E7EA] tabular-nums
                               placeholder:text-[#9CA3AF] focus:outline-none"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                    placeholder="0"
                    value={targetMC}
                    onChange={(e) => {
                      const v = e.target.value.replace(/,/g, ".");
                      if (/^\d*\.?\d*$/.test(v)) setTargetMC(v);
                    }}
                  />
                </div>
                <span className="text-[11px] font-normal text-[#9CA3AF]">$</span>
              </div>
            </div>

            {/* Slider row */}
            <div className="flex items-center gap-3 ml-2">
              {/* slider + ticks */}
              <div className="flex-1">
                <div className="relative h-4 flex items-center">
                  {/* Base track */}
                  <div className="absolute top-1/2 left-0 w-full h-0.5 bg-[#2A2B33] rounded-lg"></div>
                  
                  {/* Markings */}
                  <div className="absolute top-1/2 left-0 w-full h-0.5 flex justify-between items-center pointer-events-none">
                    <div className="w-px h-1 bg-[#9CA3AF] -mt-0.5"></div>
                    <div className="w-px h-1 bg-[#9CA3AF] -mt-0.5"></div>
                    <div className="w-px h-1.5 bg-[#E6E7EA] -mt-0.5"></div>
                    <div className="w-px h-1 bg-[#9CA3AF] -mt-0.5"></div>
                    <div className="w-px h-1 bg-[#9CA3AF] -mt-0.5"></div>
                  </div>
                  
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={1}
                    value={sliderPct}
                    onChange={(e) => {
                      if (!baseMarketCap) return;
                      const p = clamp(Number(e.target.value), -100, 100);
                      setSliderPct(p);
                      const next = Math.round(baseMarketCap * (1 + p / 100));
                      setTargetMC(String(Math.max(0, next)));
                    }}
                    className="w-full h-0.5 appearance-none cursor-pointer slider relative z-10 bg-transparent"
                    style={{
                      background: `linear-gradient(to right, 
                        ${sliderPct >= 0 
                          ? `#2A2B33 0%, #2A2B33 50%, #526fff 50%, #526fff ${50 + (sliderPct / 2)}%, #2A2B33 ${50 + (sliderPct / 2)}%, #2A2B33 100%`
                          : `#2A2B33 0%, #2A2B33 ${50 + (sliderPct / 2)}%, #FF4D7F ${50 + (sliderPct / 2)}%, #FF4D7F 50%, #2A2B33 50%, #2A2B33 100%`
                        }`
                    }}
                  />
                  <style jsx>{`
                    .slider::-webkit-slider-thumb {
                      appearance: none;
                      width: 16px;
                      height: 16px;
                      border-radius: 50%;
                      background: #526fff;
                      cursor: pointer;
                      border: none;
                      outline: none;
                      z-index: 2;
                    }
                    .slider::-moz-range-thumb {
                      width: 16px;
                      height: 16px;
                      border-radius: 50%;
                      background: #526fff;
                      cursor: pointer;
                      border: none;
                      outline: none;
                      z-index: 2;
                    }
                    .slider::-webkit-slider-track {
                      background: transparent;
                    }
                    .slider::-moz-range-track {
                      background: transparent;
                    }
                  `}</style>
                </div>
                {/* tick labels */}
                <div className="mt-2 flex justify-between text-[9px] text-[#9CA3AF] font-normal">
                  <span>-100%</span>
                  <span>-50%</span>
                  <span>0%</span>
                  <span>+50%</span>
                  <span>+100%</span>
                </div>
              </div>

              {/* % box */}
              <div className="w-18">
                <div className="relative">
                  <input
                    type="number"
                    min={-100}
                    max={100}
                    step={1}
                    value={sliderPct}
                    onChange={(e) => {
                      const p = clamp(Number(e.target.value || 0), -100, 100);
                      setSliderPct(p);
                      if (baseMarketCap) {
                        const next = Math.round(baseMarketCap * (1 + p / 100));
                        setTargetMC(String(Math.max(0, next)));
                      }
                    }}
                    className="h-8 w-full rounded border border-[#2A2B33] bg-[#101114] px-2 pr-5 text-[12px] font-semibold text-[#E6E7EA] outline-none focus:border-[#52c5ff] focus:ring-1 focus:ring-[#52c5ff]/20 transition-all duration-200"
                  />
                  <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-[#9CA3AF] font-normal">%</span>
                </div>
              </div>
            </div>

            {/* helper if base MC is unknown */}
            {!baseMarketCap ? (
              <div className="mt-2 text-[9px] text-[#9CA3AF] font-normal">
                Current market cap unavailable — enter a target value directly to enable the slider.
              </div>
            ) : null}
          </div>

        </div>
      )}

      {/* ===== G. ANALYTICS TAB ===== */}
      {/* Analytics panel commented out
      {tab === "analytics" && (
        <div className="px-3 pt-2 pb-4">
          <TokenAnalyticsPanel
            mintAddress={token.mint || ''}
            tokenInfo={{
              symbol: token.symbol,
              name: token.name,
              pool: effectivePoolAddress,
              dex: getPoolTypeFromToken(token),
            }}
          />
        </div>
      */}

      {/* ===== Settings ===== */}
      <div className="mx-3 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#E6E7EA]">
        <InterstateTooltip label="Max Slippage">
          <span className="flex items-center gap-1 text-[#9CA3AF]">
            <FaRunning className="opacity-80" /> {settings.maxSlippage * 100}%
          </span>
        </InterstateTooltip>
        <InterstateTooltip
          label={`Priority Fee: ${settings.priority}. ${settings.priority < 0.01 ? "We recommend a priority fee of atleast 0.01" : ""}`}
        >
          <span className="flex items-center gap-1 text-[#9CA3AF]">
            <FaGasPump className="opacity-90" /> {settings.priority}
            {settings.priority < 0.01 ? <span className="text-[#FF4D7F]">⚠</span> : null}
          </span>
        </InterstateTooltip>
        <InterstateTooltip label="Bribe">
          <span className="flex items-center gap-1 text-[#9CA3AF]">
            <FaCoins className="opacity-90" /> {settings.bribe} <span className="text-[#FF4D7F]">⚠</span>
          </span>
        </InterstateTooltip>
        <InterstateTooltip label="MEV Protection">
          <span
            className={cx(
              "flex items-center gap-1",
              settings.mevMode === "off" ? "text-[#9CA3AF]" : settings.mevMode === "reduced" ? "text-[#9CA3AF]" : "text-[#70E0B0]"
            )}
          >
            <FaBan className="opacity-90" />
            {settings.mevMode === "off" ? "Off" : settings.mevMode === "reduced" ? "Reduced" : "Secure"}
          </span>
        </InterstateTooltip>
        </div>

      {/* Feedback */}
      {/* Previously showed inline success/error messages; replaced by centered toasts */}

      {/* Helper line */}
      <div className="px-3 mt-1.5 text-right text-[11px] text-[#9CA3AF]">
        {amount ? (
          <>
            You'll {mode === "buy" ? "spend" : "sell"} <span className="text-[#E6E7EA] font-semibold">{amount}</span>
            {mode === "sell" ? (
              <span className="text-[#E6E7EA] font-semibold">%</span>
            ) : (
              <div className="inline-block w-3 h-3 ml-1 align-middle">
                <svg width="12" height="12" viewBox="0 0 397.7 311.7" fill="none">
                  <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear_helper)"/>
                  <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear_helper)"/>
                  <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear_helper)"/>
                  <defs>
                    <linearGradient id="paint0_linear_helper" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#00FFA3"/>
                      <stop offset="1" stopColor="#DC1FFF"/>
                    </linearGradient>
                    <linearGradient id="paint1_linear_helper" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#00FFA3"/>
                      <stop offset="1" stopColor="#DC1FFF"/>
                    </linearGradient>
                    <linearGradient id="paint2_linear_helper" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#00FFA3"/>
                      <stop offset="1" stopColor="#DC1FFF"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            )}
          </>
        ) : null}
        </div>

      {/* Primary action */}
      <div className="px-3 py-2">
        <button
          ref={tradeButtonRef}
          type="button"
          className={cx(
            baseBtn,
            "w-full h-10 rounded-full text-[14px] cursor-pointer",
            mode === "buy" ? "bg-[#70E0B0] text-black hover:bg-[#58B890]" : "bg-[#FF4D7F] text-black hover:opacity-90"
          )}
          disabled={!amount || isLoading || (tab === "limit" && !targetMC)}
          onClick={() => {
            void initiateTrade();
          }}
        >
          {isLoading ? (
            "Processing..."
          ) : (
            <span className="inline-flex items-center gap-1">
              {isMigratingToken && mode === "buy" ? "Snipe" : mode === "buy" ? "Buy" : "Sell"} {token.symbol}
              {prettyAmt(amount) && (
                <>
                  {" "}{prettyAmt(amount)}
                  {mode === "sell" ? (
                    <span>%</span>
                  ) : (
                    <SiSolana className="h-4 w-4 -mt-px" aria-hidden="true" />
                  )}
                </>
              )}
            </span>
          )}
        </button>
        </div>

      {/* footer mini stats */}
      <div className="grid grid-cols-4 gap-1 p-3" style={{ borderTop: `1px solid ${AX.border}` }}>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#17191E] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Bought</span>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5">
              <svg width="10" height="10" viewBox="0 0 397.7 311.7" fill="none">
                <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear_bought)"/>
                <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear_bought)"/>
                <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear_bought)"/>
                <defs>
                  <linearGradient id="paint0_linear_bought" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint1_linear_bought" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint2_linear_bought" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="text-[#70E0B0] text-[10px] font-semibold">
              ${positionData ? formatCompactNumber(positionData.boughtUsdValue) : '0'}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#17191E] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Sold</span>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5">
              <svg width="10" height="10" viewBox="0 0 397.7 311.7" fill="none">
                <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear_sold)"/>
                <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear_sold)"/>
                <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear_sold)"/>
                <defs>
                  <linearGradient id="paint0_linear_sold" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint1_linear_sold" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint2_linear_sold" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="text-[#FF4D7F] text-[10px] font-semibold">
              ${positionData ? formatCompactNumber(positionData.soldUsdValue) : '0'}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#17191E] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Holding</span>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5">
              <svg width="10" height="10" viewBox="0 0 397.7 311.7" fill="none">
                <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear_holding)"/>
                <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear_holding)"/>
                <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear_holding)"/>
                <defs>
                  <linearGradient id="paint0_linear_holding" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint1_linear_holding" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint2_linear_holding" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="text-[#E6E7EA] text-[10px] font-semibold">
              ${positionData ? formatCompactNumber(positionData.remainingUsdValue) : '0'}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#17191E] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">PnL</span>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5">
              <svg width="10" height="10" viewBox="0 0 397.7 311.7" fill="none">
                <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear_pnl)"/>
                <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear_pnl)"/>
                <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear_pnl)"/>
                <defs>
                  <linearGradient id="paint0_linear_pnl" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint1_linear_pnl" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint2_linear_pnl" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className={`text-[9px] font-semibold ${positionData && positionData.pnl >= 0 ? 'text-[#70E0B0]' : 'text-[#FF4D7F]'}`}>
              {positionData ? (
                <div className="flex flex-col items-center leading-tight">
                  <div className="mb-0.5">
                    {positionData.pnl >= 0 ? '+' : ''}${formatCompactNumber(Math.abs(positionData.pnl))}
                  </div>
                  <div>
                    ({positionData.pnl >= 0 ? '+' : ''}{positionData.pnlPercentage.toFixed(1)}%)
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center leading-tight">
                  <div className="mb-0.5">$0</div>
                  <div>(+0%)</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full overflow-hidden" style={{ borderTop: `1px solid ${AX.border}` }}>
        <QuickBuy hideActionButton className="rounded-none border-none bg-transparent" />
      </div>

      {/* ===== Contract Address ===== */}
      <div className="border-t border-[#2A2B33]">
        <AddressDisplay
          label="CA"
          address={token.mint || ''}
          icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
          }
          solscanUrl={`https://solscan.io/token/${token.mint || ''}`}
          tooltip="Contract Address - The token's smart contract address on Solana"
        />
        
        {/* Dev Address */}
        {creatorAddress && (
          <AddressDisplay
            label="DA"
            address={creatorAddress}
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            }
            solscanUrl={`https://solscan.io/account/${creatorAddress}`}
            tooltip="Dev Address - The address of the token creator/developer"
          />
        )}
      </div>

      {/* ===== Token Info ===== */}
      <TokenInfoDropdown token={token} />

      {/* High Slippage Warning Dialog */}
      <HighSlippageWarningDialog
        isOpen={showSlippageWarning}
        slippagePercent={(settings.maxSlippage || 0.2) * 100}
        onContinue={handleSlippageWarningContinue}
        onCancel={handleSlippageWarningCancel}
      />
      <LowLiquidityWarningDialog
        isOpen={showLiquidityWarning}
        liquidityUsd={Number(liquidityUsd) || 0}
        thresholdUsd={LOW_LIQUIDITY_WARNING_THRESHOLD}
        onContinue={handleLiquidityWarningContinue}
        onCancel={handleLiquidityWarningCancel}
      />
    </div>
  );
};

export default TradeActionPanel;
