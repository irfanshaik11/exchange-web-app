"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { LuPencil, LuCheck } from "react-icons/lu";
import { formatSmartNumber, type Token } from "~/utils/db";
import { useQuickBuy } from "~/components/QuickBuyContext";
import { FaRunning, FaGasPump, FaCoins, FaBan, FaCopy, FaExternalLinkAlt } from "react-icons/fa";
import InterstateTooltip from "../InterstateTooltip";
import QuickBuy from "../QuickBuy";
import { createLimitOrder, tradeBuy, tradeSellPercentage, SOL_MINT_ADDRESS, ApiError } from "~/utils/api";
import toast from "react-hot-toast";
import { useUser } from "~/components/UserContext";
import { SiSolana } from "react-icons/si";
import useTokenStatsWebSocket from "~/hooks/useTokenStatsWebSocket";
import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";

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
    toast.error("Failed to copy");
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
  return Math.round(n).toString();
};

interface TradeActionPanelProps {
  token: Token;
  tradeParams?: {
    mode: "buy" | "sell";
    tab: "market" | "limit" | "adv";
    timeRange: "5m" | "1h" | "12h" | "24h";
    amount: string;
    targetMC: string;
    sliderPct: number;
  };
  setTradeParams?: (params: any) => void;
  quickBuySettings?: any;
  quickBuySide?: "buy" | "sell";
}

const TradeActionPanel: React.FC<TradeActionPanelProps> = ({ 
  token, 
  tradeParams: externalTradeParams,
  setTradeParams: setExternalTradeParams,
  quickBuySettings: externalQuickBuySettings,
  quickBuySide: externalQuickBuySide
}) => {
  // Determine the pool address to use: migrated_pool_address if available, otherwise pair_address
  const effectivePoolAddress = useMemo(() => {
    return token.migrated_pool_address || token.pair_address;
  }, [token.migrated_pool_address, token.pair_address]);

  // Internal state with fallback to external props
  const [mode, setMode] = useState<"buy" | "sell">(externalTradeParams?.mode || "buy");
  const [tab, setTab] = useState<"market" | "limit" | "adv">(externalTradeParams?.tab || "market");
  const [timeRange, setTimeRange] = useState<TimeRange>(externalTradeParams?.timeRange as TimeRange || "5m");
  const [amount, setAmount] = useState(externalTradeParams?.amount || "");
  const [targetMC, setTargetMC] = useState(externalTradeParams?.targetMC || "");
  const [sliderPct, setSliderPct] = useState(externalTradeParams?.sliderPct || 0);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [migrationMode, setMigrationMode] = useState(false);
  const [devSellMode, setDevSellMode] = useState(true);

  // WebSocket hook for real-time token stats
  const {
    isConnected: wsConnected,
    loading: wsLoading,
    error: wsError,
    data: wsData,
    getFormattedStats,
  } = useTokenStatsWebSocket({
    pairAddress: effectivePoolAddress,
    tokenAddress: token.mint,
    enabled: true,
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

  // amount presets
  const [amountPresets, setAmountPresets] = useState<number[]>([0.01, 0.1, 0.5, 1]);
  const [editingPresets, setEditingPresets] = useState(false);
  const [presetDrafts, setPresetDrafts] = useState<string[]>([0.01, 0.1, 0.5, 1].map(String));
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

  return (
    <div
      className="flex h-full flex-col text-[12px] leading-tight"
      style={{ backgroundColor: '#0f1012', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}
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
              className={cx(tabBtn, "hover:text-[#E6E7EA]", tab === t && "text-[#70E0B0] border-b-2 border-[#70E0B0]")}
              onClick={() => setTab(t)}
            >
              {t === "adv" ? "Adv." : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

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
                  // When user finishes typing, check if amount meets minimum
                  const value = Number(e.target.value);
                  if (value > 0) {
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
                    const minAmount = minimums[poolType] || 0.000001;
                    
                    if (value < minAmount) {
                      setAmount(String(minAmount));
                      const protocolName = token.launchpad_protocol || token.protocol || poolType;
                      toast.error(
                        `Amount auto-corrected to minimum: ${minAmount} SOL for ${protocolName}`,
                        { duration: 4000 }
                      );
                    }
                  }
                }}
              />
            </div>
            <div className="flex items-center justify-center w-5 h-5">
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
            </div>
          </div>
          
          {/* Minimum Amount Hint */}
          {tab === "market" && (() => {
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
      {message && (
        <div
          className={cx(
            "mx-3 mt-2 rounded-md p-2 text-center text-[11px] font-bold",
            message.type === "success" ? "bg-[#70E0B0] text-black" : "bg-[#FF4D7F] text-black"
          )}
        >
          {message.text}
        </div>
      )}

      {/* Helper line */}
      <div className="px-3 mt-1.5 text-right text-[11px] text-[#9CA3AF]">
        {amount ? (
          <>
            You'll {mode === "buy" ? "spend" : "sell"} <span className="text-[#E6E7EA] font-semibold">{amount}</span> 
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
          </>
        ) : null}
      </div>


      {/* Primary action */}
      <div className="px-3 py-2">
        <button
          type="button"
          className={cx(
            baseBtn,
            "w-full h-10 rounded-full text-[14px] cursor-pointer",
            mode === "buy" ? "bg-[#70E0B0] text-black hover:bg-[#58B890]" : "bg-[#FF4D7F] text-black hover:opacity-90"
          )}
          disabled={!amount || isLoading || (tab === "limit" && !targetMC)}
          onClick={async () => {
            if (!user?.bearerToken) {
              setMessage({ type: "error", text: "Authentication required to create orders." });
              return;
            }
            setIsLoading(true);
            setMessage(null);

            if (tab === "limit") {
              if (!amount || !targetMC) {
                setMessage({
                  type: "error",
                  text: "Amount and Target Market Cap are required for limit orders.",
                });
                setIsLoading(false);
                return;
              }
              try {
                await createLimitOrder(
                  {
                    tokenAddress: token.mint, // Use token mint address, not pool address
                    amount: Number(amount),
                    type: mode === "buy" ? "Buy" : "Sell",
                    direction: "Above",
                    targetMC: Number(targetMC),
                    // Send context data from frontend
                    currentPrice: token.usd_price,
                    currentMarketCap: token.market_cap_usd || token.fully_diluted_value,
                    tokenName: token.name,
                    tokenSymbol: token.symbol,
                    tokenDecimals: token.decimals,
                    poolAddress: effectivePoolAddress, // For trading: migrated_pool_address || pair_address
                    pairAddress: token.pair_address, // For market cap tracking: always pair_address
                    poolType: getPoolTypeFromToken(token),
                  },
                  user.bearerToken
                );
                setMessage({ type: "success", text: `Limit order for ${token.symbol} created successfully!` });
                setAmount("");
                setTargetMC("");
              } catch (error: any) {
                setMessage({ type: "error", text: `Failed to create limit order: ${error.message}` });
              } finally {
                setIsLoading(false);
              }
              return;
            }

            // Market flow
            if (mode === "buy") {
              const requested = Number(amount || 0);
              const safetyBuffer = 0.003;
              const required = requested + safetyBuffer;
              if (!requested || requested <= 0) {
                setIsLoading(false);
                setMessage({ type: "error", text: "Enter a valid amount." });
                toast.error("Enter a valid amount");
                return;
              }
              
              // Check minimum amounts based on pool type
              const poolType = getPoolTypeFromToken(token);
              const minimums: Record<string, number> = {
                "meteora amm v2": 0.0001, // Meteora CPAMM minimum
                "meteora amm v1": 0.0001,
                "Raydium CPMM": 0.00001,
                "Raydium AMM": 0.00001,
                "PumpAmm": 0.000001,
                "Pumpfun": 0.000001,
                "meteora dbc": 0.000001,
              };
              
              const minAmount = minimums[poolType] || 0.000001; // Default 0.000001 SOL
              
              if (requested < minAmount) {
                setIsLoading(false);
                const protocolName = token.launchpad_protocol || token.protocol || poolType;
                setMessage({ 
                  type: "error", 
                  text: `❌ Amount too small for ${protocolName}. Minimum: ${minAmount} SOL` 
                });
                toast.error(`Minimum trade amount: ${minAmount} SOL for ${protocolName}`, { 
                  duration: 5000 
                });
                return;
              }
              
              if (solBalance < required) {
                setIsLoading(false);
                const need = Math.max(required - solBalance, 0);
                const msg = `Less balance: need ~${required.toFixed(3)} SOL (missing ${need.toFixed(3)} SOL).`;
                setMessage({ type: "error", text: msg });
                toast.error("Less balance. Please fund your wallet.");
                return;
              }
            }

            // Use shared pool type detection
            const poolType = getPoolTypeFromToken(token);
            console.log(`🔍 Trading ${token.symbol} - Protocol: ${token.launchpad_protocol || token.protocol || 'unknown'} → PoolType: ${poolType}`);
            console.log(`🔍 Pool Address: ${effectivePoolAddress} ${token.migrated_pool_address ? '(using migrated_pool_address)' : '(using pair_address)'}`);

            // Wrap in try-catch to prevent Next.js error overlay in dev mode
            let tradingError: any = null;
            
            try {
              const tradeParams = {
                amount: Number(amount),
                poolAddress: effectivePoolAddress,
                originalPairAddress: token.pair_address, // Original pair_address from token-service
                baseMint: token.mint,
                quoteMint: SOL_MINT_ADDRESS,
                mevProtection: (settings.mevMode == "off" ? 0 : 1) as 0 | 1,
                poolType,
                // Preset trading parameters
                slippage: settings.maxSlippage || 0.4, // Default 40%
                priorityFee: settings.priority || 0.0001, // Default 0.0001 SOL
                bribe: settings.bribe || 0, // Default 0
                mevMode: settings.mevMode,
                autoFee: settings.autoFee || false,
                maxFee: settings.maxFee || 0,
                rpc: settings.rpc,
                // Debugging metadata
                tokenName: token.name,
                tokenSymbol: token.symbol,
              };
              console.log(`🎯 Trading with presets:`, {
                slippage: `${(tradeParams.slippage * 100).toFixed(1)}%`,
                priorityFee: `${tradeParams.priorityFee} SOL`,
                bribe: `${tradeParams.bribe} SOL`,
                mevMode: tradeParams.mevMode,
                autoFee: tradeParams.autoFee,
              });
              const tr = mode === "buy" 
                ? await tradeBuy(tradeParams, user.bearerToken)
                    .catch((err) => {
                      // Capture error without throwing to prevent Next.js overlay
                      tradingError = err;
                      return null;
                    })
                : await tradeSellPercentage({
                    tokenAddress: token.mint,
                    percentageToSell: 100, // Sell 100% of tokens
                    poolAddress: effectivePoolAddress,
                    baseMint: token.mint,
                    quoteMint: SOL_MINT_ADDRESS,
                    poolType,
                  }, user.bearerToken)
                    .catch((err) => {
                      // Capture error without throwing to prevent Next.js overlay
                      tradingError = err;
                      return null;
                    });
              
              if (!tradingError) {
                const txHash = tr?.hash || tr?.txid;
                const tokenAmount = tr?.amount || tr?.tokenAmount;
                if (tr && txHash) {
                  setMessage({
                    type: "success",
                    text: `✅ Trade successful! ${mode === "buy" ? "Bought" : "Sold"} ${tokenAmount || "tokens"} ${token.symbol}. Tx: ${String(txHash).slice(0, 8)}...`,
                  });
                } else {
                  setMessage({ type: "error", text: "❌ Trade failed. Please try again." });
                }
              }
            } catch (error: any) {
              // Catch any other errors
              tradingError = error;
            }
            
            // Handle errors outside try-catch to prevent Next.js overlay
            if (tradingError) {
              const error = tradingError;
              // Prevent Next.js error overlay from showing
              console.error("Trade error caught:", error);
              
              let errorMessage = "Trade failed. Please try again.";
              let suggestions: string[] = [];
              let showToast = true;
              
              // Handle structured API errors
              if (error instanceof ApiError) {
                errorMessage = error.message;
                suggestions = error.suggestions || [];
                
                // Special handling for specific error codes
                if (error.code === 'AMOUNT_TOO_SMALL') {
                  const minAmount = (error.details as any)?.minimumAmount || 0.0001;
                  const protocol = (error.details as any)?.protocol || 'this DEX';
                  errorMessage = `💰 Amount Too Small`;
                  toast.error(
                    `Minimum ${minAmount} SOL required for ${protocol}`,
                    { duration: 6000 }
                  );
                  setMessage({ 
                    type: "error", 
                    text: `Minimum trade amount: ${minAmount} SOL for ${protocol}. Please increase your amount.` 
                  });
                  return; // Don't show suggestions toast
                } else if (error.code === 'NO_ACTIVE_POOL') {
                  errorMessage = `⚠️ Pool Unavailable: ${error.message}`;
                  toast.error(`Pool unavailable for ${token.symbol}`, { duration: 5000 });
                } else if (error.code === 'POOL_GRADUATED') {
                  errorMessage = `🎓 Pool Graduated: This pool has completed its bonding curve. A new pool may be available.`;
                  toast.error(`Pool graduated for ${token.symbol}`, { duration: 5000 });
                } else if (error.code === 'SERVICE_UNAVAILABLE') {
                  errorMessage = `⏸️ Service Temporarily Unavailable: ${error.message}`;
                  toast.error(`Trading service unavailable. Try a different token.`, { duration: 6000 });
                } else if (error.code === 'TRADE_FAILED') {
                  errorMessage = `❌ Trade Failed: This pool configuration is not currently supported.`;
                  suggestions = error.suggestions || ['Try a different token on a supported DEX'];
                } else if (error.code === 'POOL_UNAVAILABLE') {
                  errorMessage = `⚠️ Pool Unavailable: ${error.message}`;
                  toast.error(`Pool has insufficient liquidity`, { duration: 5000 });
                } else if (error.code === 'TX_FAILED') {
                  errorMessage = `❌ Transaction Failed: ${error.message}`;
                  toast.error(`Trade could not be completed. Try again or use a different token.`, { duration: 5000 });
                }
              } else {
                // Handle known error patterns from error message
                if (error.message?.includes("AMOUNT_TOO_SMALL") || error.message?.includes("Amount too small")) {
                  errorMessage = `💰 Amount Too Small: Minimum 0.0001 SOL required for this token`;
                  toast.error("Trade amount too small. Increase your amount.", { duration: 6000 });
                } else if (error.message?.includes("Insufficient SOL balance") || error.message?.includes("INSUFFICIENT_BALANCE")) {
                  errorMessage = `💰 Insufficient SOL balance. Add SOL and try again.`;
                } else if (error.message?.includes("insufficient funds")) {
                  errorMessage = `💰 Insufficient funds. Please add SOL.`;
                } else if (error.message?.includes("Invalid account discriminator") || error.message?.includes("INVALID_POOL_ADDRESS")) {
                  errorMessage = `❌ Invalid pool address. The pool data may be outdated.`;
                  suggestions.push("Try refreshing the page to get updated pool information");
                } else if (error.message?.includes("TokenAccountNotFoundError")) {
                  errorMessage = `❌ Token account not found. The pool may not exist.`;
                  suggestions.push("This token may not have an active trading pool");
                } else if (error.message?.includes("Pool is completed") || error.message?.includes("POOL_GRADUATED")) {
                  errorMessage = `🎓 This pool has graduated and is no longer active.`;
                  suggestions.push("The token may have migrated to a new pool");
                  suggestions.push("Try refreshing to see if a new pool is available");
                }
              }
              
              // Always display user-friendly error message in the UI
              // Make sure we have a helpful message
              if (!errorMessage || errorMessage === "Unknown error") {
                errorMessage = "❌ Trade could not be completed. Please try a different token or check your connection.";
              }
              
              // Improve common generic errors to be more helpful
              if (errorMessage.includes("Buy tx was failed") || errorMessage.includes("tx was failed")) {
                errorMessage = "❌ Trade Failed: Pool may have insufficient liquidity. Try a different token with higher volume.";
                if (!suggestions.length) {
                  suggestions = ['Look for tokens with higher 24h volume', 'Try tokens on Pump.fun or Meteora'];
                }
              } else if (errorMessage.includes("fetch failed") || errorMessage.includes("Failed to fetch")) {
                errorMessage = "❌ Network Error: Could not connect to trading service. Check your internet connection.";
              } else if (errorMessage.includes("Not Found") && !errorMessage.includes("Pool")) {
                errorMessage = "❌ Token Not Found: This token may not have active trading pools. Try a different token.";
              }
              
              setMessage({ type: "error", text: errorMessage });
              
              // Show suggestions if available
              if (suggestions.length > 0 && showToast) {
                console.log("Error suggestions:", suggestions);
                try {
                  setTimeout(() => {
                    toast.error(
                      `💡 ${suggestions[0]}`,
                      { duration: 6000 }
                    );
                  }, 1000);
                } catch (toastError) {
                  // Silently fail if toast errors
                  console.error("Toast error:", toastError);
                }
              }
            }
            
            // Always set loading to false
            setIsLoading(false);
          }}
        >
          {isLoading ? (
            "Processing..."
          ) : (
            <span className="inline-flex items-center gap-1">
              {mode === "buy" ? "Buy" : "Sell"} {token.symbol}
              {prettyAmt(amount) && (
                <>
                  {" "}{prettyAmt(amount)}
                  <SiSolana className="h-4 w-4 -mt-px" aria-hidden="true" />
                </>
              )}
            </span>
          )}
        </button>
      </div>

      {/* footer mini stats */}
      <div className="grid grid-cols-4 gap-1 p-3" style={{ borderTop: `1px solid ${AX.border}` }}>
        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg bg-[#17191E] border border-[#2A2B33]">
          <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Bought</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3">
              <svg width="12" height="12" viewBox="0 0 397.7 311.7" fill="none">
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
            <span className="text-[#70E0B0] text-[12px] font-semibold">0</span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg bg-[#17191E] border border-[#2A2B33]">
          <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Sold</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3">
              <svg width="12" height="12" viewBox="0 0 397.7 311.7" fill="none">
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
            <span className="text-[#FF4D7F] text-[12px] font-semibold">0</span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg bg-[#17191E] border border-[#2A2B33]">
          <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Holding</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3">
              <svg width="12" height="12" viewBox="0 0 397.7 311.7" fill="none">
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
            <span className="text-[#E6E7EA] text-[12px] font-semibold">0</span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg bg-[#17191E] border border-[#2A2B33]">
          <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">PnL</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3">
              <svg width="12" height="12" viewBox="0 0 397.7 311.7" fill="none">
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
            <span className="text-[#70E0B0] text-[12px] font-semibold">0(+0%)</span>
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
          address={token.mint}
          icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
          }
          solscanUrl={`https://solscan.io/token/${token.mint}`}
          tooltip="Contract Address - The token's smart contract address on Solana"
        />
        
        {/* Dev Address - Commented out for now */}
        {/* 
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
        */}
      </div>
    </div>
  );
};

export default TradeActionPanel;
