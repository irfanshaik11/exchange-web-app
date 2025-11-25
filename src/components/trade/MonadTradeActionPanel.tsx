"use client";

import React, { useState, useMemo, useEffect } from "react";
import { formatSmartNumber, formatMarketCap, type Token } from "~/utils/db";
import { useUser } from "~/components/UserContext";
import { useWallet } from "~/components/useWallet";
import { FaCopy, FaExternalLinkAlt, FaRunning } from "react-icons/fa";
import { LuPencil, LuCheck } from "react-icons/lu";
import InterstateTooltip from "../InterstateTooltip";
import toast from "react-hot-toast";
import { tradeMonadBuy, tradeMonadSell } from "~/utils/api";

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
  text: "#f0f5f5",
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
  if (abs < 1) {
    return n.toFixed(4).replace(/\.?0+$/, "");
  }
  return Math.round(n).toString();
};

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
  tooltip: string;
}> = ({ label, address, icon, tooltip }) => {
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
      </div>
    </div>
  );
};

interface MonadTradeActionPanelProps {
  token: Token | null;
}

const MonadTradeActionPanel: React.FC<MonadTradeActionPanelProps> = ({ token }) => {
  const { user } = useUser();
  const { isConnected } = useWallet();
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [amountPresets, setAmountPresets] = useState<string[]>(["0.01", "0.05", "0.1", "0.5", "1"]);
  const [editingPresets, setEditingPresets] = useState(false);
  const [presetDrafts, setPresetDrafts] = useState<string[]>(["0.01", "0.05", "0.1", "0.5", "1"]);
  const [maxSlippage, setMaxSlippage] = useState(0.15); // Default 15%
  const slippagePresets = [0.05, 0.10, 0.15, 0.20]; // 5%, 10%, 15%, 20% for Monad

  // Load presets from localStorage on mount and listen for updates
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadPresets = () => {
        const saved = localStorage.getItem('monadTradeActionPanelPresets');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length === 5) {
              setAmountPresets(parsed);
              setPresetDrafts(parsed);
            }
          } catch (err) {
            // Ignore parse errors
          }
        }
      };

      // Load initially
      loadPresets();

      // Listen for custom events from InstantTradeModal
      const handleMonadPresetUpdate = (e: CustomEvent) => {
        if (e.detail?.presets && Array.isArray(e.detail.presets) && e.detail.presets.length === 5) {
          setAmountPresets(e.detail.presets);
          setPresetDrafts(e.detail.presets);
        }
      };

      // Listen for storage events (when InstantTradeModal saves)
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === 'monadTradeActionPanelPresets' && e.newValue) {
          loadPresets();
        }
      };

      window.addEventListener('monadPresetsUpdated', handleMonadPresetUpdate as EventListener);
      window.addEventListener('storage', handleStorageChange);

      return () => {
        window.removeEventListener('monadPresetsUpdated', handleMonadPresetUpdate as EventListener);
        window.removeEventListener('storage', handleStorageChange);
      };
    }
  }, []);

  // Sync presetDrafts when amountPresets change (but not when editing)
  useEffect(() => {
    if (!editingPresets) {
      setPresetDrafts(amountPresets);
    }
  }, [amountPresets, editingPresets]);

  const commitPresetDrafts = () => {
    const next = presetDrafts.map((s) => {
      // Handle empty string, just ".", or whitespace as 0
      if (!s || s.trim() === "" || s.trim() === ".") {
        return "0";
      }
      // Validate it's a valid decimal number
      const n = parseFloat(s.replace(/,/g, "."));
      return Number.isFinite(n) && n >= 0 ? s.replace(/,/g, ".") : "0";
    });
    setAmountPresets(next);
    setEditingPresets(false);
    setPresetDrafts(next);
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('monadTradeActionPanelPresets', JSON.stringify(next));
    }
  };

  if (!token || (!token.name && !token.symbol)) {
    return (
      <div
        className="flex flex-col text-[12px] leading-tight"
        style={{ backgroundColor: '#0f1012', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif', paddingBottom: '100px' }}
      >
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

  const price = (token as any).usd_price || (token as any).price_usd || 0;
  const marketCap = token.market_cap_usd || (token as any).fully_diluted_value || 0;

  // Get stats from token data (Monad may not have all timeframes)
  const getStatsForTimeframe = (range: TimeRange) => {
    const tokenData = token as any;
    return {
      volume: num(tokenData[`volume_${range}`] || tokenData[`volume_24h`] || 0),
      buys: num(tokenData[`total_buys_${range}`] || tokenData[`total_buys`] || 0),
      sells: num(tokenData[`total_sells_${range}`] || tokenData[`total_sells`] || 0),
      buyVolume: num(tokenData[`total_buy_volume_${range}`] || tokenData[`total_buy_volume_24h`] || 0),
      sellVolume: num(tokenData[`total_sell_volume_${range}`] || tokenData[`total_sell_volume_24h`] || 0),
      change: num(tokenData[`price_percent_change_${range}`] || tokenData[`price_percent_change_24h`] || 0),
    };
  };

  const currentStats = getStatsForTimeframe(timeRange);
  const { volume, buys, sells, buyVolume, sellVolume, change } = currentStats;
  const netVolume = buyVolume - sellVolume;
  const totalVol = buyVolume + sellVolume;
  const buyPercentage = totalVol > 0 ? (buyVolume / totalVol) * 100 : 50;
  const sellPercentage = 100 - buyPercentage;

  // Helper function to map launchpad protocol to backend format
  const getLaunchpad = (): 'nadfun' | 'flapsh-simple' | 'flapsh-devs' => {
    const protocol = (token as any)?.launchpad_protocol?.toLowerCase() || '';
    
    if (protocol.includes('nad.fun') || protocol.includes('nadfun')) {
      return 'nadfun';
    } else if (protocol.includes('flap.sh') || protocol.includes('flapsh')) {
      // Check if it's devs portal (usually has 'dev' in the name or specific identifier)
      if (protocol.includes('dev')) {
        return 'flapsh-devs';
      }
      return 'flapsh-simple';
    }
    
    // Default to nadfun if unknown
    return 'nadfun';
  };

  const handleTrade = async () => {
    if (!isConnected || !user) {
      toast.error("Please connect your wallet to trade");
      return;
    }

    if (!user.bearerToken) {
      toast.error("Please log in to trade");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (!token?.mint) {
      toast.error("Invalid token information");
      return;
    }

    setIsLoading(true);
    
    try {
      const launchpad = getLaunchpad();
      const tokenAddress = token.mint; // Monad uses mint address (0x format)
      const amountValue = parseFloat(amount);

      if (mode === "buy") {
        // Buy trade
        const result = await tradeMonadBuy(
          {
            tokenAddress,
            amountMON: amountValue,
            launchpad,
            slippage: maxSlippage * 100, // Convert to percentage (0.15 -> 15)
          },
          user.bearerToken
        );

        if (result.success && result.txHash) {
          toast.success(
            `✅ Buy successful! Tx: ${result.txHash.slice(0, 8)}...`,
            { duration: 5000 }
          );
          // Reset amount after successful trade
          setAmount("");
        } else {
          toast.error("Buy failed. Please try again.");
        }
      } else {
        // Sell trade - need to determine if using percentage or exact amount
        const sellPercentage = parseFloat(amount);
        
        if (isNaN(sellPercentage) || sellPercentage <= 0 || sellPercentage > 100) {
          toast.error("Please enter a valid percentage (1-100)");
          setIsLoading(false);
          return;
        }

        // Check if launchpad supports sells
        if (launchpad === 'flapsh-devs') {
          toast.error("This launchpad does not support sells");
          setIsLoading(false);
          return;
        }

        const result = await tradeMonadSell(
          {
            tokenAddress,
            launchpad: launchpad as 'nadfun' | 'flapsh-simple',
            percentage: sellPercentage,
            slippage: maxSlippage * 100,
          },
          user.bearerToken
        );

        if (result.success && result.txHash) {
          toast.success(
            `✅ Sold ${sellPercentage}% successfully! Tx: ${result.txHash.slice(0, 8)}...`,
            { duration: 5000 }
          );
          // Reset amount after successful trade
          setAmount("");
        } else {
          toast.error("Sell failed. Please try again.");
        }
      }
    } catch (error: any) {
      console.error("Trade error:", error);
      const errorMessage = error?.message || error?.error || "Trade failed. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="flex flex-col text-[12px] leading-tight"
      style={{ backgroundColor: '#0f1012', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif', paddingBottom: '100px' }}
    >
      {/* ===== A. Time buttons ===== */}
      {/* Commented out - Monad may not have timeframe data
      <div className="px-3 pt-2 pb-2 border-b border-[#2A2B33]">
        <div className="mx-auto w-full max-w-xl overflow-hidden">
          <div className="flex gap-1 rounded-xl bg-[#1E1F26] border border-[#2A2B33] p-1">
            {(["5m", "1h", "12h", "24h"] as TimeRange[]).map((rng) => {
              const stats = getStatsForTimeframe(rng);
              const ch = stats.change;
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
                  <span 
                    className={cx("text-[10px] tabular-nums", isUp ? "text-[#70E0B0]" : "text-[#FF4D7F]")}
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                  >
                    {isUp ? "+" : "-"}
                    {abs.toFixed(2)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      */}

      {/* ===== B. Real-time Stats ===== */}
      <div className="px-3 py-1.5 border-b border-[#2A2B33]">
        <div 
          className="grid grid-cols-4 gap-3 tabular-nums"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
        >
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide whitespace-nowrap">
              {timeRange} Vol
            </div>
            <div className="text-[#E6E7EA] whitespace-nowrap text-[11px]">${formatCompactNumber(Math.round(volume || 0))}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Buys</div>
            <div 
              className="whitespace-nowrap tabular-nums text-[#70E0B0] flex items-baseline gap-0.5 text-[11px]"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
            >
              <span>{formatCompactNumber(Math.round(buys ?? 0))}</span>
              <span className="text-[#9CA3AF]">/</span>
              <span className="text-[#70E0B0]">${formatCompactNumber(Math.round(buyVolume || 0))}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Sells</div>
            <div 
              className="whitespace-nowrap tabular-nums text-[#FF4D7F] flex items-baseline gap-0.5 text-[11px]"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
            >
              <span>{formatCompactNumber(Math.round(sells ?? 0))}</span>
              <span className="text-[#9CA3AF]">/</span>
              <span className="text-[#FF4D7F]">${formatCompactNumber(Math.round(sellVolume || 0))}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Net</div>
            <div 
              className={cx("whitespace-nowrap tabular-nums text-[11px]", netVolume >= 0 ? "text-[#70E0B0]" : "text-[#FF4D7F]")}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
            >
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

      {/* ===== D. Tabs (Market only for Monad) ===== */}
      <div className="px-3 pt-1 pb-1.5 border-b border-[#2A2B33]">
        <div className="flex items-center gap-6">
          <button
            className={cx(
              tabBtn,
              "hover:text-[#E6E7EA]",
              "text-[#70E0B0] border-b-2 border-[#70E0B0]"
            )}
          >
            Market
          </button>
        </div>
      </div>

      {/* ===== E. Amount ===== */}
      <div className="px-3 pt-2">
        <div className="mx-auto w-full max-w-xl relative rounded-lg border border-[#2A2B33] bg-[#1E1F26]">
          <div className="flex items-center justify-between gap-3 px-3 py-1.5">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide">
                Amount
              </span>
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
                  if (!allowDecimal(raw)) return;
                  setAmount(raw);
                }}
              />
            </div>
            <div className="flex items-center justify-center w-5 h-5">
              {mode === "sell" ? (
                <span className="text-[14px] font-semibold text-[#E6E7EA]">%</span>
              ) : (
                <img
                  src="https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1"
                  alt="MON"
                  className="w-5 h-5 rounded-full object-cover"
                />
              )}
            </div>
          </div>
          
          {/* Presets */}
          <div className="border-t border-[#2A2B33] rounded-b-lg overflow-hidden">
            <div className="grid grid-cols-6">
              {amountPresets.map((opt, i) => {
                const currentValue = editingPresets ? (presetDrafts[i] || "") : opt;
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
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                    onClick={() => setAmount(opt)}
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

      {/* Helper line */}
      <div className="px-3 mt-1.5 text-right text-[11px] text-[#9CA3AF]">
        {amount ? (
          <>
            You'll {mode === "buy" ? "spend" : "sell"} <span className="text-[#E6E7EA] font-semibold">{amount}</span>
            {mode === "sell" ? (
              <span className="text-[#E6E7EA] font-semibold">%</span>
            ) : (
              <img
                src="https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1"
                alt="MON"
                className="w-4 h-4 ml-1 align-middle rounded-full object-cover"
              />
            )}
          </>
        ) : null}
      </div>

      {/* ===== Settings ===== */}
      <div className="mx-3 mt-2">
        {/* Slippage Display and Presets */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1.5">
            <InterstateTooltip label="Max Slippage">
              <div className="flex items-center gap-1 text-[#9CA3AF] text-[11px]">
                <FaRunning className="opacity-80" />
                <span>Slippage</span>
              </div>
            </InterstateTooltip>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0.1}
                max={100}
                step={0.1}
                value={(maxSlippage * 100).toFixed(1)}
                onChange={(e) => {
                  let val = Number(e.target.value);
                  if (val < 0.1 && val !== 0) val = 0.1;
                  if (val > 100) val = 100;
                  val = Math.round(val * 10) / 10; // Round to 1 decimal
                  setMaxSlippage(val / 100);
                }}
                onBlur={(e) => {
                  let val = Number(e.target.value);
                  if (val < 0.1) {
                    val = 0.1;
                    setMaxSlippage(val / 100);
                  }
                }}
                className="w-20 bg-[#17191E] border border-[#2A2B33] rounded px-2 py-1 text-center text-[#E6E7EA] text-[12px] outline-none focus:border-[#70E0B0] focus:ring-1 focus:ring-[#70E0B0] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
              />
              <span className="text-[#9CA3AF] text-[11px]">%</span>
            </div>
          </div>
          {/* Slippage Preset Buttons */}
          <div className="flex gap-1.5">
            {slippagePresets.map((preset) => {
              const isActive = Math.abs(maxSlippage - preset) < 0.001;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMaxSlippage(preset)}
                  className={cx(
                    "flex-1 h-7 rounded text-[11px] font-semibold transition-all duration-200",
                    isActive
                      ? "bg-[#A855F7] text-white shadow-sm"
                      : "bg-[#17191E] text-[#9CA3AF] hover:text-[#E6E7EA] hover:bg-[#1E1F26] border border-[#2A2B33]"
                  )}
                >
                  {(preset * 100).toFixed(0)}%
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Primary action */}
      <div className="px-3 py-2">
        <button
          type="button"
          className={cx(
            baseBtn,
            "w-full h-10 rounded-full text-[14px] cursor-pointer",
            mode === "buy"
              ? "bg-[#70E0B0] text-black hover:bg-[#58B890]"
              : "bg-[#FF4D7F] text-black hover:opacity-90"
          )}
          disabled={!amount || isLoading || !isConnected}
          onClick={handleTrade}
        >
          {isLoading ? (
            "Processing..."
          ) : !isConnected ? (
            "Connect Wallet"
          ) : (
            <span className="inline-flex items-center gap-1">
              {mode === "buy" ? "Buy" : "Sell"} {token.symbol}
              {prettyAmt(amount) && (
                <>
                  {" "}{prettyAmt(amount)}
                  {mode === "sell" ? (
                    <span>%</span>
                  ) : (
                    <img
                      src="https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1"
                      alt="MON"
                      className="w-5 h-5 inline-block rounded-full object-cover"
                    />
                  )}
                </>
              )}
            </span>
          )}
        </button>
      </div>

      {/* footer mini stats - simplified for Monad */}
      {/* Commented out - footer stats section
      <div className="grid grid-cols-4 gap-1 p-3" style={{ borderTop: `1px solid ${AX.border}` }}>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#17191E] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Price</span>
          <div className="text-[#E6E7EA] text-[10px] font-semibold">
            ${formatSmartNumber(price)}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#17191E] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Market Cap</span>
          <div className="text-[#E6E7EA] text-[10px] font-semibold">
            ${formatCompactNumber(Math.round(marketCap))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#17191E] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Volume</span>
          <div className="text-[#E6E7EA] text-[10px] font-semibold">
            ${formatCompactNumber(Math.round(volume))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#17191E] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Change</span>
          <div className={`text-[10px] font-semibold ${change >= 0 ? 'text-[#70E0B0]' : 'text-[#FF4D7F]'}`}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </div>
        </div>
      </div>
      */}

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
          tooltip="Contract Address - The token's smart contract address on Monad"
        />
      </div>

      {/* ===== Dev Address ===== */}
      <div className="border-t border-[#2A2B33]">
        {(() => {
          const devAddress = (token as any)?.creator_address || (token as any)?.dev_address || (token as any)?.owner || (token as any)?.creator_wallet || '';
          if (!devAddress) {
            // Show section even when empty with placeholder
            return (
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="text-[#9CA3AF]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <InterstateTooltip label="Developer Address - The address that created this token on Monad">
                    <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide cursor-help">
                      DA:
                    </span>
                  </InterstateTooltip>
                  <span className="text-[#9CA3AF] text-[11px] italic">Not available</span>
                </div>
              </div>
            );
          }
          return (
            <AddressDisplay
              label="DA"
              address={devAddress}
              icon={
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              }
              tooltip="Developer Address - The address that created this token on Monad"
            />
          );
        })()}
      </div>

      {/* Info Message */}
      <div className="px-3 py-2 border-t border-[#2A2B33]">
        <div className="text-[10px] text-[#9CA3AF] text-center">
          <strong className="text-[#E6E7EA]">Note:</strong> Monad trading functionality is currently in development.
        </div>
      </div>
    </div>
  );
};

export default MonadTradeActionPanel;
