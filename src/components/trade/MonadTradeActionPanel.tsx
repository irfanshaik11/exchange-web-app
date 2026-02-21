"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { formatSmartNumber, formatMarketCap, type Token } from "~/utils/db";
import { useUser } from "~/components/UserContext";
import { useWallet } from "~/components/useWallet";
import { useQuickBuy } from "~/components/QuickBuyContext";
import { FaCopy, FaExternalLinkAlt, FaRunning, FaChevronDown, FaChevronUp, FaChartBar, FaCrown, FaFire, FaDice, FaGasPump, FaSpinner, FaCheckCircle } from "react-icons/fa";
import { LuPencil, LuCheck, LuChefHat } from "react-icons/lu";
import { RiGhostLine } from "react-icons/ri";
import { BiCandles } from "react-icons/bi";
import { BsPersonGear } from "react-icons/bs";
import { GoPeople } from "react-icons/go";
import InterstateTooltip from "../InterstateTooltip";
import toast from "react-hot-toast";
import { tradeMonadBuy, tradeMonadSell } from "~/utils/api";
import { executeMonadMultiBuy, formatMonadTxSummary, buildMonadWalletAllocations } from "~/utils/monadWalletAllocation";
import { validateMonadBalance, computeMonadBalanceForValidation } from "~/utils/tradeBalanceValidation";
import useMonadDevTokens from "~/hooks/useMonadDevTokens";
import useMonadXray from "~/hooks/useMonadXray";
import { extractTokenImage } from "~/utils/images";
import useMonadPositionWebSocket from "~/hooks/useMonadPositionWebSocket";
import { useSolPrice } from "~/components/SolPriceContext";
import { broadcastMonadQuickTrade, consumePendingMonadPositionRefresh } from "~/utils/monadTradeEvents";
import { formatMonadError } from "~/utils/monadError";
import { listenForTradeEvents } from "~/utils/createSolanaToastHandler";

type TimeRange = "5m" | "1h" | "12h" | "24h";

type MonadPositionSummary = {
  tokenAddress: string;
  userId: number | string;
  totalBoughtTokens: number;
  totalBoughtUsd: number;
  totalBoughtMon: number;
  totalSoldTokens: number;
  totalSoldUsd: number;
  totalSoldMon: number;
  balanceTokens: number;
  balanceUsdHistorical: number;
  balanceMon: number;
  realizedPnl: number;
  realizedPnlMon: number;
  realizedPnlPct: number;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ---- style palette ---- */
const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#25282B",
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

// Helper function to format numbers with subscript notation for very small values
// Example: 0.00020618 -> "0.0₃20618" (3 zeros after 0.0, then 20618)
const formatWithSubscript = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) return "0";
  
  const absValue = Math.abs(value);
  
  // For values >= 1, use standard formatting
  if (absValue >= 1) {
    return value.toFixed(2);
  }
  
  // For values < 1, find the number of leading zeros after decimal
  const str = value.toFixed(18); // Use enough precision
  const match = str.match(/^0\.(0*)([1-9]\d*)/);
  
  if (match) {
    const leadingZeros = match[1].length; // Count of zeros after "0."
    const significantDigits = match[2];
    
    // Show up to 5-6 significant digits
    const displayDigits = significantDigits.slice(0, 6);
    
    if (leadingZeros > 0) {
      // Use subscript notation for the count of zeros
      const subscriptMap: { [key: string]: string } = {
        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
        '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
      };
      const subscript = leadingZeros.toString().split('').map(d => subscriptMap[d] || d).join('');
      return `0.0${subscript}${displayDigits}`;
    } else {
      // No leading zeros, just show the digits
      return `0.${displayDigits}`;
    }
  }
  
  // Fallback to standard formatting
  return value.toFixed(8).replace(/\.?0+$/, '');
};

const formatMiniUsd = (v?: number) => {
  if (!Number.isFinite(v)) return "--";
  const abs = Math.abs(v!);
  if (abs < 1) return "<$1";
  return `$${formatSmartNumber(abs)}`;
};

const formatMiniMon = (v?: number, symbol: string = "MON") => {
  if (!Number.isFinite(v)) return `0${symbol}`;
  const sign = v! < 0 ? "-" : "";
  const abs = Math.abs(v!);
  if (abs < 0.01) return `${sign}<0.01${symbol}`;
  return `${sign}${formatSmartNumber(abs)}${symbol}`;
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
  const { user, refreshBalance, chainBalances, walletList, walletBalances, selectedWalletIds } = useUser();
  const { isConnected } = useWallet();
  const { presets, activePreset, setActivePreset, setPresets } = useQuickBuy();
  const { monPrice } = useSolPrice();
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Buy presets: MON amounts
  const [buyAmountPresets, setBuyAmountPresets] = useState<string[]>(["0.01", "0.05", "0.1", "0.5", "1"]);
  // Sell presets: percentages
  const [sellAmountPresets, setSellAmountPresets] = useState<string[]>(["5", "10", "25", "50", "100"]);
  // Current presets based on mode
  const [amountPresets, setAmountPresets] = useState<string[]>(mode === "buy" ? ["0.01", "0.05", "0.1", "0.5", "1"] : ["5", "10", "25", "50", "100"]);
  const [editingPresets, setEditingPresets] = useState(false);
  const [presetDrafts, setPresetDrafts] = useState<string[]>(amountPresets);
  const [maxSlippage, setMaxSlippage] = useState(0.15); // Default 15%
  const slippagePresets = [0.05, 0.10, 0.15, 0.20]; // 5%, 10%, 15%, 20% for Monad
  const [gasPrice, setGasPrice] = useState<number | undefined>(undefined); // Gas price in gwei
  const [isPoolInfoOpen, setIsPoolInfoOpen] = useState(true);
  const [showSlippageDropdown, setShowSlippageDropdown] = useState(false);
  const [showGasDropdown, setShowGasDropdown] = useState(false);
  
  // Ref to track pending toast for WebSocket txHash update
  const pendingToastRef = useRef<{ id: string; tokenImage: string | null; tokenName: string; fakeTime: string; startTime: number; timerInterval?: NodeJS.Timeout; totalSelectedWallets: number } | null>(null);
  
  // Fetch dev token data
  const { devTokenData } = useMonadDevTokens(token?.mint, { enabled: !!token?.mint });
  
  // Fetch xray data
  const { xrayData, isLoading: xrayLoading } = useMonadXray(token?.mint, { enabled: !!token?.mint });

  // Use WebSocket for real-time position updates AND instant txHash
  const tokenAddress = token?.mint || token?.pair_address || '';
  
  // Callback for instant txHash update via WebSocket (fires before HTTP response)
  const handleWsTxHash = useCallback((data: { txHash: string; tokenAddress: string; tradeType: 'buy' | 'sell'; explorerUrl: string }) => {
    const pending = pendingToastRef.current;
    if (!pending) return;

    console.log('[MonadTradeActionPanel] 🚀 INSTANT txHash via WebSocket:', data.txHash);

    // For multi-wallet trades: Don't update the toast (count was already shown at timer cap)
    // For single wallet: Update the link element with clickable Monad logo
    if (pending.totalSelectedWallets === 1) {
      const linkEl = document.getElementById(`link-${pending.id}`);
      if (linkEl) {
        linkEl.innerHTML = `<a href="${data.explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
      }
    }

    // Set duration for auto-dismiss after 10s
    setTimeout(() => {
      if (pendingToastRef.current?.id === pending.id) {
        toast.dismiss(pending.id);
        pendingToastRef.current = null;
      }
    }, 10000);
  }, []);
  
  const { position: wsPosition, loading: positionLoading, connected: positionConnected, refreshPosition } = useMonadPositionWebSocket({
    tokenAddress,
    enabled: !!user?.id, // Don't require tokenAddress - we want to receive txHash even before token is loaded
    onUpdate: (pos) => {
      // Position updated via WebSocket
      console.log('[MonadTradeActionPanel] Position updated via WebSocket:', pos);
    },
    onTxHash: handleWsTxHash, // INSTANT txHash callback
  });

  // Use WebSocket position if available, otherwise fallback to null (will show defaults)
  const positionSummary: MonadPositionSummary | null = wsPosition ? {
    tokenAddress: wsPosition.tokenAddress,
    userId: wsPosition.userId,
    totalBoughtTokens: wsPosition.totalBoughtTokens,
    totalBoughtUsd: wsPosition.totalBoughtUsd,
    totalBoughtMon: wsPosition.totalBoughtMon,
    totalSoldTokens: wsPosition.totalSoldTokens,
    totalSoldUsd: wsPosition.totalSoldUsd,
    totalSoldMon: wsPosition.totalSoldMon,
    balanceTokens: wsPosition.balanceTokens,
    balanceUsdHistorical: wsPosition.balanceUsdHistorical,
    balanceMon: wsPosition.balanceMon,
    realizedPnl: wsPosition.realizedPnl,
    realizedPnlMon: wsPosition.realizedPnlMon,
    realizedPnlPct: wsPosition.realizedPnlPct,
  } : null;

  // Listen for external Monad quick trades (e.g., Quick Buy) and refetch position once history persists
  useEffect(() => {
    if (typeof window === 'undefined' || !tokenAddress) return;
    const normalized = tokenAddress.toLowerCase();
    const pendingRefreshes = new Set<ReturnType<typeof setTimeout>>();

    const triggerRefresh = (delay: number) => {
      const timeoutId = setTimeout(() => {
        refreshPosition().catch((err) => {
          console.error('[MonadTradeActionPanel] Failed to refresh position after quick trade:', err);
        });
        pendingRefreshes.delete(timeoutId);
      }, delay);
      pendingRefreshes.add(timeoutId);
    };

    const scheduleBatchRefresh = () => {
      triggerRefresh(600);
      triggerRefresh(2200);
    };

    const consumeAndMaybeRefresh = () => {
      const timestamp = consumePendingMonadPositionRefresh(normalized);
      if (timestamp && Date.now() - timestamp < 60_000) {
        scheduleBatchRefresh();
      }
    };

    const handleQuickTrade = (event: Event) => {
      const detail = (event as CustomEvent<{ tokenAddress?: string }>).detail;
      if (!detail?.tokenAddress) return;
      if (detail.tokenAddress.toLowerCase() !== normalized) return;

      consumeAndMaybeRefresh();
    };

    // Handle trades that occurred before this component mounted
    consumeAndMaybeRefresh();

    window.addEventListener('monadQuickTrade', handleQuickTrade as EventListener);

    return () => {
      window.removeEventListener('monadQuickTrade', handleQuickTrade as EventListener);
      pendingRefreshes.forEach((timeoutId) => clearTimeout(timeoutId));
      pendingRefreshes.clear();
    };
  }, [tokenAddress, refreshPosition]);

  // Sync slippage and gasPrice from active preset
  useEffect(() => {
    const preset = presets[activePreset];
    const settings = mode === "buy" 
      ? preset?.quickBuySettings 
      : preset?.quickSellSettings;
    
    if (settings) {
      // Update slippage from preset
      if (settings.maxSlippage !== undefined) {
        setMaxSlippage(settings.maxSlippage);
      }
      // Update gas price from preset
      if (settings.gasPrice !== undefined) {
        setGasPrice(settings.gasPrice > 0 ? settings.gasPrice : undefined);
      } else {
        setGasPrice(undefined);
      }
    }
  }, [activePreset, presets, mode]);

  // Load presets from localStorage on mount and listen for updates
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadBuyPresets = () => {
        const saved = localStorage.getItem('monadTradeActionPanelBuyPresets');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length === 5) {
              setBuyAmountPresets(parsed);
            }
          } catch (err) {
            // Ignore parse errors
          }
        }
      };

      const loadSellPresets = () => {
        const saved = localStorage.getItem('monadTradeActionPanelSellPresets');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length === 5) {
              setSellAmountPresets(parsed);
            }
          } catch (err) {
            // Ignore parse errors
          }
        }
      };

      // Load initially
      loadBuyPresets();
      loadSellPresets();

      // Listen for custom events from InstantTradeModal
      const handleMonadPresetUpdate = (e: CustomEvent) => {
        if (e.detail?.type === 'buy' && e.detail?.presets && Array.isArray(e.detail.presets) && e.detail.presets.length === 5) {
          setBuyAmountPresets(e.detail.presets);
          if (mode === 'buy') {
            setAmountPresets(e.detail.presets);
            setPresetDrafts(e.detail.presets);
          }
        } else if (e.detail?.type === 'sell' && e.detail?.presets && Array.isArray(e.detail.presets) && e.detail.presets.length === 5) {
          setSellAmountPresets(e.detail.presets);
          if (mode === 'sell') {
            setAmountPresets(e.detail.presets);
            setPresetDrafts(e.detail.presets);
          }
        }
      };

      // Listen for storage events (when InstantTradeModal saves)
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === 'monadTradeActionPanelBuyPresets' && e.newValue) {
          loadBuyPresets();
          if (mode === 'buy') {
            const parsed = JSON.parse(e.newValue);
            setAmountPresets(parsed);
            setPresetDrafts(parsed);
          }
        } else if (e.key === 'monadTradeActionPanelSellPresets' && e.newValue) {
          loadSellPresets();
          if (mode === 'sell') {
            const parsed = JSON.parse(e.newValue);
            setAmountPresets(parsed);
            setPresetDrafts(parsed);
          }
        }
      };

      window.addEventListener('monadPresetsUpdated', handleMonadPresetUpdate as EventListener);
      window.addEventListener('storage', handleStorageChange);

      return () => {
        window.removeEventListener('monadPresetsUpdated', handleMonadPresetUpdate as EventListener);
        window.removeEventListener('storage', handleStorageChange);
      };
    }
  }, [mode]);

  // Update amountPresets when mode changes
  useEffect(() => {
    if (mode === "buy") {
      setAmountPresets(buyAmountPresets);
      setPresetDrafts(buyAmountPresets);
    } else {
      setAmountPresets(sellAmountPresets);
      setPresetDrafts(sellAmountPresets);
    }
    // Clear amount when switching modes
    setAmount("");
  }, [mode, buyAmountPresets, sellAmountPresets]);

  // Sync presetDrafts when amountPresets change (but not when editing)
  useEffect(() => {
    if (!editingPresets) {
      setPresetDrafts(amountPresets);
    }
  }, [amountPresets, editingPresets]);

  // Position is now fetched via WebSocket hook above (useMonadPositionWebSocket)
  // No need for manual fetching - WebSocket handles initial fetch and real-time updates

  const commitPresetDrafts = () => {
    const next = presetDrafts.map((s) => {
      // Handle empty string, just ".", or whitespace as 0
      if (!s || s.trim() === "" || s.trim() === ".") {
        return mode === "sell" ? "" : "0";
      }
      // Validate it's a valid decimal number
      const n = parseFloat(s.replace(/,/g, "."));
      if (mode === "sell") {
        // For sell, validate percentage (0-100)
        return Number.isFinite(n) && n >= 0 && n <= 100 ? s.replace(/,/g, ".") : "";
      } else {
        // For buy, validate MON amount (>= 0)
        return Number.isFinite(n) && n >= 0 ? s.replace(/,/g, ".") : "0";
      }
    });
    setAmountPresets(next);
    setEditingPresets(false);
    setPresetDrafts(next);
    
    // Save to localStorage based on mode
    if (typeof window !== 'undefined') {
      if (mode === "buy") {
        setBuyAmountPresets(next);
        localStorage.setItem('monadTradeActionPanelBuyPresets', JSON.stringify(next));
      } else {
        setSellAmountPresets(next);
        localStorage.setItem('monadTradeActionPanelSellPresets', JSON.stringify(next));
      }
    }
  };

  if (!token || (!token.name && !token.symbol)) {
    return (
      <div
        className="flex flex-col text-[12px] leading-tight bg-[#111214]"
        style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif', paddingBottom: '100px' }}
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

  const pos = positionSummary;
  // Show 0 instead of "--" when there's no position data (no trades yet)
  // First row: USD values, Second row: MON values (native Monad currency)
  const balUsd = pos ? formatMiniUsd(pos.balanceUsdHistorical) : "$0";
  const balMon = pos ? formatMiniMon(pos.balanceMon, "MON") : "0MON"; // MON net (received - spent)
  const boughtUsd = pos ? formatMiniUsd(pos.totalBoughtUsd) : "$0";
  const boughtMon = pos ? formatMiniMon(pos.totalBoughtMon, "MON") : "0MON"; // MON spent on buys
  const soldUsd = pos ? formatMiniUsd(pos.totalSoldUsd) : "$0";
  const soldMon = pos ? formatMiniMon(pos.totalSoldMon, "MON") : "0MON"; // MON received from sells
  const pnlUsd = pos
    ? `${pos.realizedPnl < 0 ? "-" : ""}${formatMiniUsd(Math.abs(pos.realizedPnl))}`
    : "$0";
  const pnlPct = pos ? `${pos.realizedPnl >= 0 ? "+" : ""}${pos.realizedPnlPct.toFixed(0)}%` : "0%";
  const pnlMon = pos ? formatMiniMon(pos.realizedPnlMon, "MON") : "0MON"; // MON PnL (received - spent)

  // Get stats from token data - using same mapping as TradeHeader
  const getStatsForTimeframe = (range: TimeRange) => {
    const tokenData = token as any;
    const fallbackVolumeUsd = (tokenData?.total_buy_volume_usd ?? 0) + (tokenData?.total_sell_volume_usd ?? 0);
    const fallbackVolumeMon = (tokenData?.total_buy_volume_mon ?? 0) + (tokenData?.total_sell_volume_mon ?? 0);
    // Use correct field mappings from pulse endpoints:
    // - volume_24h_usd (not volume_24h)
    // - total_buy_volume_mon / total_sell_volume_mon (lifetime volumes in MON)
    // - total_buys / total_sells (lifetime counts)
    // For 24h timeframe, use volume_24h_usd from pulse endpoint
    if (range === '24h') {
      return {
        volume: num(
          (tokenData?.volume_24h_usd ?? tokenData?.volume_24h ?? null) ??
          (fallbackVolumeUsd || fallbackVolumeMon || 0)
        ),
        buys: num(tokenData?.total_buys ?? 0),
        sells: num(tokenData?.total_sells ?? 0),
        buyVolume: num(tokenData?.total_buy_volume_usd ?? tokenData?.total_buy_volume_mon ?? 0),
        sellVolume: num(tokenData?.total_sell_volume_usd ?? tokenData?.total_sell_volume_mon ?? 0),
        netVolume: num(tokenData?.net_volume_usd ?? tokenData?.net_volume_mon ?? (num(tokenData?.total_buy_volume_usd ?? tokenData?.total_buy_volume_mon ?? 0) - num(tokenData?.total_sell_volume_usd ?? tokenData?.total_sell_volume_mon ?? 0))),
        change: num(tokenData?.price_percent_change_24h ?? 0),
      };
    }
    // For other timeframes, try timeframe-specific USD fields first, then fall back to 24h
    const buyVolUsd = num(tokenData[`total_buy_volume_${range}_usd`] || tokenData?.total_buy_volume_usd || tokenData?.total_buy_volume_mon || 0);
    const sellVolUsd = num(tokenData[`total_sell_volume_${range}_usd`] || tokenData?.total_sell_volume_usd || tokenData?.total_sell_volume_mon || 0);
    return {
      volume: num(
        (tokenData[`volume_${range}_usd`] || tokenData?.volume_24h_usd || tokenData?.volume_24h || null) ??
        (buyVolUsd + sellVolUsd)
      ),
      buys: num(tokenData[`total_buys_${range}`] || tokenData?.total_buys || 0),
      sells: num(tokenData[`total_sells_${range}`] || tokenData?.total_sells || 0),
      buyVolume: buyVolUsd,
      sellVolume: sellVolUsd,
      netVolume: num(tokenData[`net_volume_${range}_usd`] || tokenData?.net_volume_usd || tokenData?.net_volume_mon || (buyVolUsd - sellVolUsd)),
      change: num(tokenData[`price_percent_change_${range}`] || tokenData?.price_percent_change_24h || 0),
    };
  };

  const currentStats = getStatsForTimeframe(timeRange);
  const { volume, buys, sells, buyVolume, sellVolume, netVolume, change } = currentStats;
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

    // ============================================
    // PRE-VALIDATION: Check balance BEFORE showing any toast
    // This prevents the misleading "Trade placed!" toast when balance is insufficient
    // ============================================
    if (mode === "buy") {
      const selectedMonadWalletIds = selectedWalletIds?.monad || [];
      const isMultiMonad = selectedMonadWalletIds.length > 1;
      const monadBalance = computeMonadBalanceForValidation({
        selectedWalletIds: selectedMonadWalletIds,
        walletList,
        walletBalances,
        fallbackBalance: chainBalances['monad'] ?? 0,
      });
      const tradeAmount = parseFloat(amount);

      if (!isMultiMonad) {
        const clientValidation = validateMonadBalance({
          balance: monadBalance,
          tradeAmount: tradeAmount,
          gasPrice: gasPrice || undefined,
        });

        if (!clientValidation.isValid) {
          toast.error(clientValidation.errorMessage || 'Insufficient MON balance', { duration: 5000 });
          return;
        }
      }
    } else if (mode === "sell") {
      // Only block when we have a confirmed zero balance AND not in multi-wallet mode.
      // Allow attempts when balance is stale/unknown or when multiple wallets might hold the token.
      const isMultiMonad = (selectedWalletIds?.monad || []).length > 1;
      const currentTokenBalance = positionSummary?.balanceTokens;
      if (currentTokenBalance !== undefined && currentTokenBalance <= 0 && !isMultiMonad) {
        toast.error('Insufficient token balance. Your balance is 0 tokens. Cannot sell.', { duration: 5000 });
        return;
      } else if (currentTokenBalance === undefined && !positionLoading) {
        // Kick off a background refresh so the panel catches up after quick buys elsewhere
        refreshPosition().catch((err) => {
          console.error('[MonadTradeActionPanel] Failed to refresh position before sell:', err);
        });
      }
    }
    // ============================================
    // END PRE-VALIDATION
    // ============================================

    setIsLoading(true);

    // Get token image and name
    const tokenImage = token ? extractTokenImage(token) : null;
    const tokenName = token?.name || token?.symbol || '';
    
    // Generate unique toast ID and fake fast time (0.40-0.60s)
    const uniqueToastId = `monad-trade-${Date.now()}`;
    const fakeTime = (Math.random() * 0.2 + 0.4).toFixed(2);
    const startTime = Date.now();
    
    // Show initial loading toast with timer - checkmark hidden until timer finishes, link icon grayed out
    toast.custom(
      (t) => (
        <div className="flex items-center gap-2 bg-[#1a1b1e] text-white border border-white/10 rounded-lg px-4 py-3">
          <FaCheckCircle id={`check-${uniqueToastId}`} className="flex-shrink-0" size={16} style={{ color: '#31e3ac', display: timerFinished && !tradeErrored ? 'block' : 'none' }} />
          {tokenImage && (
            <img src={tokenImage} alt={tokenName} className="w-5 h-5 rounded-full object-cover flex-shrink-0" style={{ border: '1px solid rgba(255, 255, 255, 0.1)' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <span className="font-semibold text-sm" style={{ color: '#31e3ac' }}>Trade placed!</span>
          <span id={`timer-${uniqueToastId}`} className="text-[#9CA3AF] text-xs ml-1">(0.00s)</span>
          <span id={`link-${uniqueToastId}`} className="inline-flex items-center ml-1" style={{ display: 'none' }}>
            <img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" className="w-4 h-4 rounded-full" style={{ cursor: 'default' }} />
          </span>
        </div>
      ),
      { id: uniqueToastId, duration: Infinity }
    );
    
    // Random cap time between 0.40 and 0.60 seconds
    const timerCap = 0.40 + Math.random() * 0.20;
    let timerFinished = false;
    let tradeErrored = false;

    // Determine if this is a multi-wallet trade
    const isMultiWallet = (selectedWalletIds?.monad || []).length > 1;
    const totalSelectedWallets = (selectedWalletIds?.monad || []).length || 1;

    // Pre-calculate which wallets will actually be used (have sufficient balance)
    const amountValue = parseFloat(amount);
    const { allocations, total } = buildMonadWalletAllocations({
      amount: amountValue,
      walletList,
      walletBalances,
      selectedWalletIds: selectedWalletIds?.monad || [],
    });
    const DISPLAY_MIN_BALANCE = 0.0035;
    const fundedAllocations = allocations.filter((a) => (a.balance ?? 0) >= DISPLAY_MIN_BALANCE);
    const walletsWithBalance = fundedAllocations.length || (allocations.length > 0 ? 1 : 0);

    // Start timer animation - update every 50ms, show checkmark when cap is reached
    const timerInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const displayTime = Math.min(elapsed, timerCap).toFixed(2);
      const timerEl = document.getElementById(`timer-${uniqueToastId}`);
      if (timerEl) {
        timerEl.textContent = `(${displayTime}s)`;
      }

      // When timer reaches cap, show checkmark and logo/count
      if (!timerFinished && elapsed >= timerCap) {
        timerFinished = true;
        if (!tradeErrored) {
          const checkEl = document.getElementById(`check-${uniqueToastId}`);
          if (checkEl) {
            checkEl.style.display = 'block';
          }
          const linkEl = document.getElementById(`link-${uniqueToastId}`);
          if (linkEl) {
            if (isMultiWallet) {
              // Show actual wallets with balance vs total selected
              linkEl.innerHTML = `<span style="color: #31e3ac; font-size: 11px; font-weight: 600;">${walletsWithBalance}/${totalSelectedWallets}</span>`;
            }
            linkEl.style.display = 'inline-flex';
          }
        }
      }
    }, 50);
    const cleanupTradeListener = listenForTradeEvents(tokenAddress, uniqueToastId, (v) => { tradeErrored = v; }, 'monad');

    // Store pending toast info for WebSocket instant update (including timer)
    pendingToastRef.current = { id: uniqueToastId, tokenImage, tokenName, fakeTime: timerCap.toFixed(2), startTime, timerInterval, totalSelectedWallets };
    
    try {
      const launchpad = getLaunchpad();
      const tokenAddress = token.mint; // Monad uses mint address (0x format)

      if (mode === "buy") {
        // Buy trade
        const { results, totalConsidered } = await executeMonadMultiBuy({
          tokenAddress,
          amountMON: amountValue,
          launchpad,
          slippage: maxSlippage * 100, // Convert to percentage (0.15 -> 15)
          gasPrice: gasPrice, // Gas price in gwei (optional)
          authToken: user.bearerToken,
          walletList,
          walletBalances,
          selectedWalletIds: selectedWalletIds?.monad || [],
        });

        // Extract transaction hashes from results
        const txHashes = results
          .map((r) => (r.result as any)?.txHash)
          .filter(Boolean);

        if (txHashes.length > 0) {
          // Only update toast if WebSocket hasn't already handled it
          if (pendingToastRef.current?.id === uniqueToastId) {
            // For multi-wallet trades: Don't update anything (count was already shown at timer cap)
            // For single wallet: Update logo to make it clickable
            if (totalSelectedWallets === 1 && txHashes[0]) {
              const linkEl = document.getElementById(`link-${uniqueToastId}`);
              if (linkEl) {
                const explorerUrl = `https://monadvision.com/tx/${txHashes[0]}`;
                linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
              }
            }
            // Auto-dismiss after 10s
            setTimeout(() => {
              toast.dismiss(uniqueToastId);
            }, 10000);
            pendingToastRef.current = null;
          }
          // Refresh balance immediately after successful buy (with small delay for on-chain confirmation)
          setTimeout(() => {
            refreshBalance({ chain: "monad", force: true }).catch((err) => {
              console.warn('Failed to refresh balance:', err);
            });
          }, 1000);
          broadcastMonadQuickTrade(tokenAddress, 'buy');
          // Keep the amount value in the input field for easy re-trading
          setIsLoading(false);
        } else {
          tradeErrored = true;
          cleanupTradeListener();
          clearInterval(timerInterval);
          pendingToastRef.current = null;
          toast.error('Trade failed', { id: uniqueToastId, duration: 6000 });
          setIsLoading(false);
        }
      } else {
        // Sell trade
        const sellPercentage = parseFloat(amount);
        
        if (isNaN(sellPercentage) || sellPercentage <= 0 || sellPercentage > 100) {
          toast.error("Please enter a valid percentage (1-100)", { id: uniqueToastId, duration: 6000 });
          setIsLoading(false);
          return;
        }

        // Get current token price for accurate USD value calculation
        const currentPriceUsd = (token as any).usd_price || (token as any).price_usd || 0;
        const selectedMonadWalletIds = selectedWalletIds?.monad || [];
        const isMultiWalletSell = selectedMonadWalletIds.length > 1;
        const selectedWalletId = selectedMonadWalletIds[0];

        const result = await tradeMonadSell(
          {
            tokenAddress,
            launchpad,
            percentage: sellPercentage,
            slippage: maxSlippage * 100,
            gasPrice: gasPrice,
            priceUsd: currentPriceUsd, // Pass current price for immediate USD calculation
            // Wallet routing
            walletId: !isMultiWalletSell ? selectedWalletId : undefined,
            walletIds: isMultiWalletSell ? selectedMonadWalletIds : undefined,
            useMultipleWallets: isMultiWalletSell,
          },
          user.bearerToken
        );

        const sellSuccess =
          result?.success === true ||
          (Array.isArray((result as any)?.txHashes) && (result as any).txHashes.length > 0) ||
          !!(result as any)?.txHash;

        const txHash =
          (result as any)?.txHash ||
          ((result as any)?.txHashes && (result as any)?.txHashes[0]);

        if (sellSuccess) {
          // Only update toast if WebSocket hasn't already handled it
          if (pendingToastRef.current?.id === uniqueToastId && txHash) {
            const explorerUrl = `https://monadvision.com/tx/${txHash}`;
            // Update the link element - wrap Monad logo in anchor to make clickable
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
            }
            // Auto-dismiss after 10s
            setTimeout(() => {
              toast.dismiss(uniqueToastId);
            }, 10000);
            pendingToastRef.current = null;
          } else {
            // If no txHash, just dismiss after 10s
            setTimeout(() => {
              toast.dismiss(uniqueToastId);
            }, 10000);
            pendingToastRef.current = null;
          }

          // Refresh balance immediately after successful sell (with small delay for on-chain confirmation)
          setTimeout(() => {
            refreshBalance({ chain: "monad", force: true }).catch((err) => {
              console.warn('Failed to refresh balance:', err);
            });
          }, 1000);
          broadcastMonadQuickTrade(tokenAddress, 'sell');
          // Keep the amount value in the input field for easy re-trading
          setIsLoading(false);
        } else {
          tradeErrored = true;
          cleanupTradeListener();
          clearInterval(timerInterval);
          pendingToastRef.current = null;
          toast.error(formatMonadError((result as any).error), { id: uniqueToastId, duration: 6000 });
          setIsLoading(false);
        }
      }
    } catch (error: any) {
      tradeErrored = true;
      cleanupTradeListener();
      console.error("Trade error:", error);
      clearInterval(timerInterval);
      pendingToastRef.current = null;
      const errorMessage = formatMonadError(error?.message || error?.error);
      toast.error(errorMessage, { id: uniqueToastId, duration: 6000 });
      setIsLoading(false);
    }
  };

  return (
    <div
      className="flex flex-col text-[12px] leading-tight"
      style={{ backgroundColor: '#111214', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif', paddingBottom: '100px' }}
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
                    timeRange === rng ? "bg-[#25282B] ring-1 ring-white/10" : "hover:bg-[#1E1F26]"
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
        <div className="mt-1 h-0.5 w-full rounded-full bg-[#25282B] relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full" style={{ width: `${buyPercentage}%`, background: AX.mint }} />
          <div className="absolute right-0 top-0 h-full" style={{ width: `${sellPercentage}%`, background: AX.sell }} />
        </div>
      </div>

      {/* ===== C. Preset Selector and Buy/Sell switcher ===== */}
      <div className="px-3 py-1.5 -mt-px border-b border-[#2A2B33] space-y-2">
        {/* Preset Selector P1/P2/P3 - Above Buy/Sell switcher, aligned left */}
        <div className="flex items-center justify-start gap-1.5">
          {[0, 1, 2].map((presetIndex) => (
            <button
              key={presetIndex}
              onClick={() => setActivePreset(presetIndex)}
              className="px-3 py-1 rounded text-[11px] font-semibold transition-all duration-200 border border-[#2A2B33]"
              style={{
                backgroundColor: "#1a1c1f",
                color: activePreset === presetIndex ? "#85d99f" : "#9CA3AF",
              }}
            >
              P{presetIndex + 1}
            </button>
          ))}
        </div>
        
        {/* Buy/Sell Switcher */}
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
        <div className="mx-auto w-full max-w-xl relative rounded-lg border border-[#000] bg-[#25282B]">
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
          <div className="border-t border-[#000] rounded-b-lg overflow-hidden">
            <div className="grid grid-cols-6">
              {amountPresets.map((opt, i) => {
                const currentValue = editingPresets ? (presetDrafts[i] || "") : opt;
                const active = amount === currentValue;
                if (editingPresets) {
                  return (
                    <div key={i} className="h-9 border-r border-[#000] last:border-r-0 min-w-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="h-full w-full bg-[#25282B] text-center text-[12px] font-semibold text-[#E6E7EA]
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
                      "h-9 border-r border-[#000] last:border-r-0 text-[12px] font-semibold tabular-nums",
                      active
                        ? "bg-[#2A2B33] text-[#E6E7EA]"
                        : "bg-[#25282B] hover:bg-[#1E1F26] text-[#E6E7EA]"
                    )}
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                    onClick={() => setAmount(opt)}
                  >
                    {opt}{mode === "sell" && opt ? "%" : ""}
                  </button>
                );
              })}
              {!editingPresets ? (
                <button
                  type="button"
                  onClick={() => setEditingPresets(true)}
                  className="h-9 bg-[#25282B] hover:bg-[#1E1F26] text-[#E6E7EA]"
                  title="Edit preset values"
                >
                  <LuPencil className="mx-auto h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={commitPresetDrafts}
                  className="h-9 bg-[#1E1F26] text-[#E6E7EA] hover:bg-[#25282B]"
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
        {/* Compact Icon + Value Display */}
        <div className="flex items-center gap-3 mb-2">
          {/* Slippage Icon + Value */}
          <button
            type="button"
            onClick={() => {
              setShowSlippageDropdown(!showSlippageDropdown);
              setShowGasDropdown(false);
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded border transition-all duration-200 hover:bg-[#1E1F26]"
            style={{
              borderColor: showSlippageDropdown ? AX.mint : AX.border,
              backgroundColor: showSlippageDropdown ? '#1E1F26' : 'transparent'
            }}
          >
            <FaRunning className="opacity-80" size={12} />
            <span className="text-[#E6E7EA] text-[12px] font-medium">
              {(maxSlippage * 100).toFixed(1)}%
            </span>
          </button>

          {/* Gas Icon + Value */}
          <button
            type="button"
            onClick={() => {
              setShowGasDropdown(!showGasDropdown);
              setShowSlippageDropdown(false);
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded border transition-all duration-200 hover:bg-[#1E1F26]"
            style={{
              borderColor: showGasDropdown ? AX.mint : AX.border,
              backgroundColor: showGasDropdown ? '#1E1F26' : 'transparent'
            }}
          >
            <FaGasPump className="opacity-90" size={12} style={{ color: "#FCD34D" }} />
            <span className="text-[#E6E7EA] text-[12px] font-medium">
              {gasPrice === undefined ? 'Auto' : `${gasPrice.toFixed(2)}`}
            </span>
          </button>
        </div>

        {/* Slippage Dropdown */}
        {showSlippageDropdown && (
          <div className="mb-2">
            <div className="flex items-center justify-between">
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
                    const slippageValue = val / 100;
                    setMaxSlippage(slippageValue);
                    // Also update the preset
                    const newPresets = presets.map((p, i) =>
                      i === activePreset
                        ? {
                            ...p,
                            quickBuySettings: mode === "buy"
                              ? { ...p.quickBuySettings, maxSlippage: slippageValue }
                              : p.quickBuySettings,
                            quickSellSettings: mode === "sell"
                              ? { ...p.quickSellSettings, maxSlippage: slippageValue }
                              : p.quickSellSettings,
                          }
                        : p
                    );
                    setPresets(newPresets);
                  }}
                  onBlur={(e) => {
                    let val = Number(e.target.value);
                    if (val < 0.1) {
                      val = 0.1;
                      setMaxSlippage(val / 100);
                    }
                  }}
                  className="w-24 bg-[#25282B] border border-[#2A2B33] rounded px-2 py-1 text-center text-[#E6E7EA] text-[12px] outline-none focus:border-[#70E0B0] focus:ring-1 focus:ring-[#70E0B0] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                  style={{ 
                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                    MozAppearance: 'textfield'
                  }}
                />
                <span className="text-[#9CA3AF] text-[11px]">%</span>
              </div>
            </div>
          </div>
        )}

        {/* Gas Price Dropdown */}
        {showGasDropdown && (
          <div className="mb-2">
            <div className="flex items-center justify-between">
              <InterstateTooltip label="Gas Price (gwei) - Optional, uses network suggestion if not set">
                <div className="flex items-center gap-1 text-[#9CA3AF] text-[11px]">
                  <FaGasPump className="opacity-90" style={{ color: "#FCD34D" }} />
                  <span>Gas Price</span>
                </div>
              </InterstateTooltip>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={gasPrice === undefined ? '' : gasPrice}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || val === '.') {
                      setGasPrice(undefined);
                      // Update preset
                      const newPresets = presets.map((p, i) =>
                        i === activePreset
                          ? {
                              ...p,
                              quickBuySettings: mode === "buy"
                                ? { ...p.quickBuySettings, gasPrice: undefined }
                                : p.quickBuySettings,
                              quickSellSettings: mode === "sell"
                                ? { ...p.quickSellSettings, gasPrice: undefined }
                                : p.quickSellSettings,
                            }
                          : p
                      );
                      setPresets(newPresets);
                      return;
                    }
                    const numVal = Number(val);
                    if (numVal >= 0 && Number.isFinite(numVal)) {
                      const gasPriceValue = numVal > 0 ? numVal : undefined;
                      setGasPrice(gasPriceValue);
                      // Update preset
                      const newPresets = presets.map((p, i) =>
                        i === activePreset
                          ? {
                              ...p,
                              quickBuySettings: mode === "buy"
                                ? { ...p.quickBuySettings, gasPrice: gasPriceValue }
                                : p.quickBuySettings,
                              quickSellSettings: mode === "sell"
                                ? { ...p.quickSellSettings, gasPrice: gasPriceValue }
                                : p.quickSellSettings,
                            }
                          : p
                      );
                      setPresets(newPresets);
                    }
                  }}
                  placeholder="Auto"
                  className="w-24 bg-[#25282B] border border-[#2A2B33] rounded px-2 py-1 text-center text-[#E6E7EA] text-[12px] outline-none focus:border-[#70E0B0] focus:ring-1 focus:ring-[#70E0B0] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] placeholder:text-[#6B7280]"
                  style={{ 
                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                    MozAppearance: 'textfield'
                  }}
                />
                <span className="text-[#9CA3AF] text-[11px]">gwei</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Position summary (from DB trades) */}
      <div className="px-3 pt-3 pb-2">
        <div className="grid grid-cols-4 gap-2 text-[11px] text-[#9CA3AF] uppercase tracking-wide">
          <span>Bal</span>
          <span>Bought</span>
          <span>Sold</span>
          <span>PnL</span>
        </div>
        <div className="grid grid-cols-4 gap-2 text-[12px] mt-1">
          <div className="flex flex-col">
            <span className="text-[#E6E7EA] font-semibold">{positionLoading ? '…' : balUsd}</span>
            <span className="text-[#70E0B0] text-[11px]">{positionLoading ? '…' : balMon}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[#70E0B0] font-semibold">{positionLoading ? '…' : boughtUsd}</span>
            <span className="text-[#70E0B0] text-[11px]">{positionLoading ? '…' : boughtMon}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[#70E0B0] font-semibold">{positionLoading ? '…' : soldUsd}</span>
            <span className="text-[#70E0B0] text-[11px]">{positionLoading ? '…' : soldMon}</span>
          </div>
          <div className="flex flex-col">
            <span className={cx("font-semibold", pos && pos.realizedPnl < 0 ? "text-[#FF4D7F]" : "text-[#70E0B0]")}>
              {positionLoading ? '…' : pnlUsd} {pos ? `(${pnlPct})` : ""}
            </span>
            <span className={cx("text-[11px]", pos && pos.realizedPnlMon < 0 ? "text-[#FF4D7F]" : "text-[#70E0B0]")}>
              {positionLoading ? '…' : pnlMon}
            </span>
          </div>
        </div>
      </div>

      {/* Primary action */}
      <div className="px-3 py-2">
        <button
          type="button"
          className={cx(
            baseBtn,
            "w-full h-auto min-h-[2.5rem] rounded-full text-[14px] cursor-pointer flex flex-col items-center justify-center py-2.5",
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
            <div className="flex flex-col items-center gap-0.5 w-full">
              {/* Main button text */}
              <span className="inline-flex items-center gap-1 text-[14px] font-semibold">
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
              
              {/* Additional info row */}
              {prettyAmt(amount) && (() => {
                const effectiveMonPrice = monPrice || 0.025;
                const tokenPrice = price || (token as any)?.usd_price || (token as any)?.price_usd || 0;
                const amountValue = parseFloat(amount);
                
                if (mode === "buy" && !isNaN(amountValue) && amountValue > 0) {
                  // Calculate USD value and tokens for buy
                  const usdValue = amountValue * effectiveMonPrice;
                  const tokensReceived = tokenPrice > 0 ? (usdValue / tokenPrice) : 0;
                  
                  // Format tokens
                  let tokensDisplay: string;
                  if (tokensReceived >= 1) {
                    tokensDisplay = tokensReceived.toFixed(2);
                  } else if (tokensReceived >= 0.01) {
                    tokensDisplay = tokensReceived.toFixed(4);
                  } else {
                    tokensDisplay = formatWithSubscript(tokensReceived);
                  }
                  
                  return (
                    <span className="text-[11px] font-normal opacity-90">
                      ${usdValue.toFixed(2)} • {tokensDisplay} {token.symbol}
                    </span>
                  );
                } else if (mode === "sell" && !isNaN(amountValue) && amountValue > 0) {
                  // Calculate USD value and MON received for sell
                  const sellPercentage = amountValue / 100;
                  const availableTokens = pos?.balanceTokens ?? 0;
                  const tokensSold = availableTokens * sellPercentage;
                  
                  // Calculate USD value based on current token price
                  const usdValue = tokenPrice > 0 ? (tokensSold * tokenPrice) : ((pos?.balanceUsdHistorical || 0) * sellPercentage);
                  
                  // Calculate MON received based on USD value (estimate)
                  const monReceived = effectiveMonPrice > 0 ? (usdValue / effectiveMonPrice) : 0;
                  
                  // Format tokens sold
                  let tokensDisplay: string;
                  if (tokensSold >= 1) {
                    tokensDisplay = tokensSold.toFixed(2);
                  } else if (tokensSold >= 0.01) {
                    tokensDisplay = tokensSold.toFixed(4);
                  } else {
                    tokensDisplay = formatWithSubscript(tokensSold);
                  }
                  
                  // Format MON received
                  let monDisplay: string;
                  if (monReceived >= 1) {
                    monDisplay = monReceived.toFixed(2);
                  } else if (monReceived >= 0.01) {
                    monDisplay = monReceived.toFixed(4);
                  } else {
                    monDisplay = formatWithSubscript(monReceived);
                  }
                  
                  return availableTokens > 0 || positionLoading ? (
                    <span className="text-[11px] font-normal opacity-90">
                      {positionLoading ? 'Calculating...' : `$${usdValue.toFixed(2)} • ${monDisplay} MON • ${tokensDisplay} ${token.symbol}`}
                    </span>
                  ) : (
                    <span className="text-[11px] font-normal opacity-70">
                      Enter % to estimate sell proceeds
                    </span>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </button>
        
        {/* Conversion display: how much token can be bought with entered amount or 1 MON */}
        {(() => {
          const tokenPrice = price || (token as any)?.usd_price || (token as any)?.price_usd || 0;
          const effectiveMonPrice = monPrice || 0.025; // Fallback to default MON price
          
          if (tokenPrice > 0 && effectiveMonPrice > 0) {
            // Check if user has entered an amount (only for buy mode)
            const enteredAmount = mode === "buy" && amount ? parseFloat(amount) : null;
            const isValidAmount = enteredAmount !== null && !isNaN(enteredAmount) && enteredAmount > 0;
            
            // Calculate based on entered amount or default to 1 MON
            const monAmount = isValidAmount ? enteredAmount : 1;
            const tokensForAmount = (monAmount * effectiveMonPrice) / tokenPrice;
            
            // Format tokens for the amount (for display)
            let tokensDisplay: string;
            if (tokensForAmount >= 1) {
              tokensDisplay = tokensForAmount.toFixed(2);
            } else if (tokensForAmount >= 0.01) {
              tokensDisplay = tokensForAmount.toFixed(4);
            } else {
              tokensDisplay = formatWithSubscript(tokensForAmount);
            }
            
            // Format MON amount for display
            let monAmountDisplay: string;
            if (monAmount >= 1) {
              monAmountDisplay = monAmount.toFixed(2);
            } else if (monAmount >= 0.01) {
              monAmountDisplay = monAmount.toFixed(4);
            } else {
              monAmountDisplay = formatWithSubscript(monAmount);
            }
            
            return (
              <div className="mt-2 text-left text-[11px] text-[#9CA3AF]">
                {tokensDisplay} {token.symbol} ≈ {monAmountDisplay} MON
              </div>
            );
          }
          return null;
        })()}
      </div>

      {/* Separator line */}
      <div className="border-t border-[#2A2B33]"></div>

      {/* Xray Risk Analysis Section - Always Visible */}
      <div className="px-3 py-3 space-y-2" style={{ backgroundColor: AX.bg }}>
        {xrayLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-pulse text-[#9CA3AF] text-[11px]">Loading risk analysis...</div>
          </div>
        ) : xrayData ? (
          <>
            {/* Token Metrics Grid - First Row */}
            <div className="grid grid-cols-3 gap-1.5">
              {/* Top 10 Holders */}
              <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
                <div className="flex flex-col items-center justify-center gap-1 h-full">
                  <div className="flex items-center gap-1.5">
                    <BsPersonGear size={16} style={{ color: '#31e3ac' }} />
                    <div className="text-[12px] font-bold" style={{ color: '#31e3ac' }}>
                      {xrayData.top10_hold_percent != null ? `${xrayData.top10_hold_percent.toFixed(2)}%` : '0%'}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Top 10 H.</div>
                </div>
              </div>

              {/* Dev Holdings */}
              <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
                <div className="flex flex-col items-center justify-center gap-1 h-full">
                  <div className="flex items-center gap-1.5">
                    <LuChefHat size={16} style={{ color: '#566cdc' }} />
                    <div className="text-[12px] font-bold" style={{ color: '#566cdc' }}>
                      {xrayData.dev_hold_percent != null ? `${xrayData.dev_hold_percent.toFixed(1)}%` : '0%'}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Dev H.</div>
                </div>
              </div>

              {/* Sniper Holdings */}
              <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
                <div className="flex flex-col items-center justify-center gap-1 h-full">
                  <div className="flex items-center gap-1.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#f26681' }}>
                      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      <line x1="12" y1="4" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="12" y1="16" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="4" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="16" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    </svg>
                    <div className="text-[12px] font-bold" style={{ color: '#f26681' }}>
                      {xrayData.sniper_hold_percent != null ? `${xrayData.sniper_hold_percent.toFixed(1)}%` : '0%'}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Snipers H.</div>
                </div>
              </div>
            </div>

            {/* Token Metrics Grid - Second Row */}
            <div className="grid grid-cols-3 gap-1.5">
              {/* Insider Holdings */}
              <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
                <div className="flex flex-col items-center justify-center gap-1 h-full">
                  <div className="flex items-center gap-1.5">
                    <RiGhostLine size={16} style={{ color: '#31e3ac' }} />
                    <div className="text-[12px] font-bold" style={{ color: '#31e3ac' }}>
                      {xrayData.insider_hold_percent != null ? `${xrayData.insider_hold_percent.toFixed(1)}%` : '0%'}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Insiders</div>
                </div>
              </div>

              {/* Bonding Curve Progress */}
              <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
                <div className="flex flex-col items-center justify-center gap-1 h-full">
                  <div className="flex items-center gap-1.5">
                    <FaChartBar size={16} style={{ color: AX.aiGreen }} />
                    <div className="text-[12px] font-bold" style={{ color: AX.aiGreen }}>
                      {xrayData.bonding_curve_progress != null ? `${xrayData.bonding_curve_progress.toFixed(1)}%` : xrayData.is_graduated ? '100%' : '0%'}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Bonding</div>
                </div>
              </div>

              {/* Graduated Status */}
              <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
                <div className="flex flex-col items-center justify-center gap-1 h-full">
                  <div className="flex items-center gap-1.5">
                    <FaFire size={16} style={{ color: AX.aiGreen }} />
                    <div className="text-[12px] font-bold" style={{ color: xrayData.is_graduated ? AX.aiGreen : AX.muted }}>
                      {xrayData.is_graduated ? 'Yes' : 'No'}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Graduated</div>
                </div>
              </div>
            </div>

            {/* Separator Line */}
            <div className="h-px" style={{ backgroundColor: AX.border }}></div>

            {/* Trading Activity - Third Row */}
            <div className="grid grid-cols-3 gap-1.5">
              {/* Total Transactions */}
              <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
                <div className="flex flex-col items-center justify-center gap-1 h-full">
                  <div className="flex items-center gap-1.5">
                    <FaChartBar size={16} style={{ color: '#31e3ac' }} />
                    <div className="text-[12px] font-bold" style={{ color: AX.muted }}>
                      {xrayData.total_transactions != null ? formatCompactNumber(xrayData.total_transactions) : '0'}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Transactions</div>
                </div>
              </div>

              {/* Unique Traders */}
              <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
                <div className="flex flex-col items-center justify-center gap-1 h-full">
                  <div className="flex items-center gap-1.5">
                    <GoPeople size={16} style={{ color: '#31e3ac' }} />
                    <div className="text-[12px] font-bold" style={{ color: AX.muted }}>
                      {xrayData.unique_traders != null ? formatCompactNumber(xrayData.unique_traders) : '0'}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Traders</div>
                </div>
              </div>

              {/* Buy/Sell Ratio */}
              <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
                <div className="flex flex-col items-center justify-center gap-1 h-full">
                  <div className="flex items-center gap-1.5">
                    <BiCandles size={16} style={{ color: '#31e3ac' }} />
                    <div className="text-[12px] font-bold" style={{ color: AX.muted }}>
                      {xrayData.total_buys != null && xrayData.total_sells != null 
                        ? `${xrayData.total_buys}/${xrayData.total_sells}`
                        : '0/0'}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Buys/Sells</div>
                </div>
              </div>
            </div>

            {/* Dev Trading Activity - Fourth Row */}
            {/* Commented out - Dev Buys/Dev Sells section */}
            {/* {(xrayData.dev_bought_count != null || xrayData.dev_sold_count != null || xrayData.dev_bought_usd != null || xrayData.dev_sold_usd != null) && (
              <>
                <div className="h-px" style={{ backgroundColor: AX.border }}></div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="rounded-md p-2 border" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1.5">
                        <LuChefHat size={16} style={{ color: AX.mint }} />
                        <div className="text-[12px] font-bold" style={{ color: AX.mint }}>
                          {xrayData.dev_bought_count != null ? xrayData.dev_bought_count : '0'}
                        </div>
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Dev Buys</div>
                      {xrayData.dev_bought_usd != null && (
                        <div className="text-[9px] text-center leading-tight" style={{ color: AX.muted }}>
                          ${formatCompactNumber(xrayData.dev_bought_usd)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md p-2 border" style={{ backgroundColor: 'rgba(30, 31, 38, 0.3)', borderColor: AX.border }}>
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1.5">
                        <LuChefHat size={16} style={{ color: AX.sell }} />
                        <div className="text-[12px] font-bold" style={{ color: AX.sell }}>
                          {xrayData.dev_sold_count != null ? xrayData.dev_sold_count : '0'}
                        </div>
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Dev Sells</div>
                      {xrayData.dev_sold_usd != null && (
                        <div className="text-[9px] text-center leading-tight" style={{ color: AX.muted }}>
                          ${formatCompactNumber(xrayData.dev_sold_usd)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )} */}
          </>
        ) : null}
      </div>

      {/* footer mini stats - simplified for Monad */}
      {/* Commented out - footer stats section
      <div className="grid grid-cols-4 gap-1 p-3" style={{ borderTop: `1px solid ${AX.border}` }}>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#25282B] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Price</span>
          <div className="text-[#E6E7EA] text-[10px] font-semibold">
            ${formatSmartNumber(price)}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#25282B] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Market Cap</span>
          <div className="text-[#E6E7EA] text-[10px] font-semibold">
            ${formatCompactNumber(Math.round(marketCap))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#25282B] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Volume</span>
          <div className="text-[#E6E7EA] text-[10px] font-semibold">
            ${formatCompactNumber(Math.round(volume))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#25282B] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Change</span>
          <div className={`text-[10px] font-semibold ${change >= 0 ? 'text-[#70E0B0]' : 'text-[#FF4D7F]'}`}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </div>
        </div>
      </div>
      */}

      {/* ===== Pool Info Dropdown ===== */}
      <div className="border-t border-[#2A2B33]">
        <button
          onClick={() => setIsPoolInfoOpen(!isPoolInfoOpen)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#1E1F26] transition-colors"
        >
          <span className="text-[11px] font-semibold text-[#E6E7EA]">
            {token?.name || token?.symbol || 'Token'} Pool Info
          </span>
          {isPoolInfoOpen ? (
            <FaChevronUp className="w-3 h-3 text-[#9CA3AF]" />
          ) : (
            <FaChevronDown className="w-3 h-3 text-[#9CA3AF]" />
          )}
        </button>
        
        {isPoolInfoOpen && (
          <div className="border-t border-[#2A2B33] bg-[#111214]">
            {/* Pool Info Section */}
            <div className="px-3 py-2.5 space-y-2.5">
              {/* Total Liq */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Total liq</span>
                <div className="text-right flex items-center gap-1">
                  <span className="text-[11px] text-[#E6E7EA] font-semibold">
                    ${formatSmartNumber((token as any)?.liquidity_usd || (token as any)?.total_liquidity_usd || 0)}
                  </span>
                  {/* WMON conversion - commented out until we have dynamic MON price */}
                  {/* <span className="text-[10px] text-[#9CA3AF]">
                    ({formatSmartNumber(((token as any)?.liquidity_usd || (token as any)?.total_liquidity_usd || 0) / 0.25)} WMON)
                  </span> */}
                </div>
              </div>
              
              {/* Pair Label */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Pair</span>
              </div>
              
              {/* Token */}
              <div className="pl-3 space-y-1.5">
                <div className="text-[11px] font-semibold text-[#E6E7EA]">{token?.symbol || 'TOKEN'}</div>
                {/* Liq/Initial - only show if we have graduation_percent data */}
                {((token as any)?.graduation_percent !== undefined || (token as any)?.bonding_pct !== undefined) && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#9CA3AF]">Liq/Initial</span>
                    <div className="text-right">
                      <span className="text-[11px] text-[#E6E7EA] font-semibold">
                        {formatCompactNumber((token as any)?.total_supply || 0)} / {formatCompactNumber((token as any)?.total_supply || 0)}
                      </span>
                      <span className="text-[10px] text-[#9CA3AF] ml-1">
                        ({((token as any)?.graduation_percent || (token as any)?.bonding_pct || 0).toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#9CA3AF]">Value</span>
                  <span className="text-[11px] text-[#E6E7EA] font-semibold">
                    ${formatSmartNumber(token?.market_cap_usd || 0)}
                  </span>
                </div>
              </div>
              
              {/* WMON - Commented out until we have dynamic WMON liquidity data */}
              {/* <div className="pl-3 space-y-1.5">
                <div className="text-[11px] font-semibold text-[#E6E7EA]">WMON</div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#9CA3AF]">Liq/Initial</span>
                  <div className="text-right">
                    <span className="text-[11px] text-[#E6E7EA] font-semibold">
                      0 / {formatCompactNumber(14440)}
                    </span>
                    <span className="text-[10px] text-[#9CA3AF] ml-1">(-100%)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#9CA3AF]">Value</span>
                  <span className="text-[11px] text-[#E6E7EA] font-semibold">$0</span>
                </div>
              </div> */}
            </div>
            
            {/* Divider */}
            <div className="border-t border-[#2A2B33]"></div>
            
            {/* Dev Section */}
            <div className="px-3 py-2.5 space-y-2.5">
              {/* DEV */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">DEV</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-[#E6E7EA] font-mono">
                    {devTokenData?.dev_wallet ? truncateAddress(devTokenData.dev_wallet, 2, 4) : '--'}
                  </span>
                  {devTokenData && (
                    <span className="text-[10px] text-[#9CA3AF]">
                      ({formatSmartNumber(devTokenData.mon_balance || 0)}MON)
                    </span>
                  )}
                  {devTokenData?.dev_wallet && (
                    <button
                      onClick={() => copyToClipboard(devTokenData.dev_wallet)}
                      className="p-0.5 hover:bg-[#2A2B33] rounded transition-colors"
                      title="Copy dev address"
                    >
                      <FaCopy className="w-3 h-3 text-[#9CA3AF]" />
                    </button>
                  )}
                </div>
              </div>
              
              {/* Funding */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Funding</span>
                <span className="text-[11px] text-[#E6E7EA]">--</span>
              </div>
              
              {/* Market cap */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Market cap</span>
                <span className="text-[11px] text-[#E6E7EA] font-semibold">
                  ${formatSmartNumber(token?.market_cap_usd || 0)}
                </span>
              </div>
              
              {/* Holders */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Holders</span>
                <span className="text-[11px] text-[#E6E7EA] font-semibold">
                  {(token as any)?.total_holders || (token as any)?.unique_traders || 0}
                </span>
              </div>
              
              {/* Total supply - only show if we have the data */}
              {(token as any)?.total_supply && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Total supply</span>
                  <span className="text-[11px] text-[#E6E7EA] font-semibold">
                    {formatCompactNumber((token as any)?.total_supply)}
                  </span>
                </div>
              )}
              
              {/* Pair */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Pair</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-[#E6E7EA] font-mono">
                    {token?.pair_address ? truncateAddress(token.pair_address, 2, 4) : '--'}
                  </span>
                  {token?.pair_address && (
                    <button
                      onClick={() => copyToClipboard(token.pair_address)}
                      className="p-0.5 hover:bg-[#2A2B33] rounded transition-colors"
                      title="Copy pair address"
                    >
                      <FaCopy className="w-3 h-3 text-[#9CA3AF]" />
                    </button>
                  )}
                </div>
              </div>
              
              {/* Token created */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Token created</span>
                <span className="text-[11px] text-[#E6E7EA]">
                  {token?.created_at 
                    ? (() => {
                        const date = new Date(token.created_at);
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const year = date.getFullYear();
                        const hours = String(date.getHours()).padStart(2, '0');
                        const minutes = String(date.getMinutes()).padStart(2, '0');
                        const seconds = String(date.getSeconds()).padStart(2, '0');
                        return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
                      })()
                    : '--'}
                </span>
              </div>
              
              {/* Pool created */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Pool created</span>
                <span className="text-[11px] text-[#E6E7EA]">
                  {token?.created_at 
                    ? (() => {
                        const date = new Date(token.created_at);
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const year = date.getFullYear();
                        const hours = String(date.getHours()).padStart(2, '0');
                        const minutes = String(date.getMinutes()).padStart(2, '0');
                        const seconds = String(date.getSeconds()).padStart(2, '0');
                        return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
                      })()
                    : '--'}
                </span>
              </div>
            </div>
          </div>
        )}
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
          tooltip="Contract Address - The token's smart contract address on Monad"
        />
      </div>

      {/* ===== Dev Address ===== */}
      <div className="border-t border-[#2A2B33]">
        {(() => {
          const devAddress = devTokenData?.dev_wallet || (token as any)?.creator_address || (token as any)?.dev_address || (token as any)?.owner || (token as any)?.creator_wallet || '';
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

    </div>
  );
};

export default MonadTradeActionPanel;
