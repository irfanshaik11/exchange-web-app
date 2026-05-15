import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { DockedPanelMarginWrapper } from "../contexts/DockedPanelContext";
import Positions from "../components/trade/Positions";
import TradeTable from "../components/trade/TradeTable";
import Activity from "../components/trade/Activity";
import { useWalletPortfolio } from "~/hooks/useWalletPortfolio";
import { useWalletTrades } from "~/hooks/useWalletTrades";
import { walletPortfolioTradeToTradeRow } from "~/utils/walletTradeAdapter";
import { useUser } from "../components/UserContext";
import { useSolPrice } from "../components/SolPriceContext";
import InterstateTooltip from "~/components/InterstateTooltip";
import CustomCheckbox from "../components/CustomCheckbox";
import {
  getTradeHistoryByUser,
  getTradeActivityByUser,
  fetchTradeActivity,
} from "~/utils/functions";
import { getWithdrawalHistory } from "~/utils/api";
import { formatSmartNumber, formatSmallPrice } from "~/utils/db";
import type { PositionRow, TradeRow } from "~/utils/functions";
import type { UnifiedTokenMetadata } from "~/utils/tokenMetadata";
import { FaSearch, FaEye, FaUpload, FaTimes, FaInfoCircle, FaStar, FaRegStar, FaTrash, FaSync } from "react-icons/fa";
import { IoIosGitNetwork } from "react-icons/io";
import { PiNetwork } from "react-icons/pi";
import { SiSolana } from "react-icons/si";
import toast from "react-hot-toast";
import { FiEdit2, FiCheck, FiX, FiInfo } from "react-icons/fi";
import ImportSolanaWalletModal from "../components/ImportSolanaWalletModal";
import ImportEvmWalletModal from "../components/ImportEvmWalletModal";
import { SolanaIcon } from "../components/Footer";
import ExportWalletModal from "../components/ExportWalletModal";
import RealizedPnlChart, { type PnlChartDataPoint } from "~/components/charts/RealizedPnlChart";

import { useWalletTokenBalances } from "~/hooks/useWalletTokenBalances";
import { useImagePreloader } from "~/hooks/useImagePreloader";
import { extractTokenImage } from "~/utils/images";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { normalizeMonadAddress } from "~/utils/normalizeMonadAddress";
import { acknowledgeWalletExport } from "~/utils/api";
import { TRADE_COMPLETED_EVENT, consumePendingTradeRefreshes, type TradeCompletedDetail } from "~/utils/tradeEvents";
import { redistributeWalletFunds } from "~/utils/api";
import { getWalletPortfolioSummary } from "~/utils/api";
import { deleteUserWallet } from "~/utils/api";
import { PredictionPositions, UnifiedPortfolio, PolygonWalletCard } from "~/components/predictions";
import { useSolanaPositionWebSocketContext } from "~/contexts/SolanaPositionWebSocketContext";
import posthog from "posthog-js";

const isDev = process.env.NODE_ENV !== 'production';

// Interactive Balance Chart Component
const BalanceChart = ({ 
  data, 
  chain, 
  initialBalance 
}: { 
  data: Array<{ timestamp: number; balance: number; balanceChange: number }>; 
  chain: string;
  initialBalance: number;
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const gradientId = `balanceGradient-${chain}-${Date.now()}`;
  
  const chartData = data.map((entry, index) => {
    const date = new Date(entry.timestamp);
    const timeLabel = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const balanceChangeFromInitial = entry.balance - initialBalance;
    const balanceChangePercent = initialBalance > 0 ? ((balanceChangeFromInitial / initialBalance) * 100) : 0;
    
    return {
      time: timeLabel,
      timestamp: entry.timestamp,
      balance: entry.balance,
      balanceChange: entry.balanceChange,
      balanceChangeFromInitial,
      balanceChangePercent,
      index,
    };
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#0c0e12]/95 backdrop-blur-xl border border-white/[0.08] rounded-md p-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-50 pointer-events-none" style={{
          position: 'absolute',
          transform: 'translateY(-100%)',
          marginTop: '-10px'
        }}>
          <p className="text-[#52525b] text-[10px] mb-1.5 font-semibold uppercase tracking-wide">{data.time}</p>
          <div className="space-y-0.5">
            <p className="text-xs font-semibold tabular-nums" style={{ color: data.balanceChangeFromInitial >= 0 ? "#18c48c" : "#ef4444" }}>
              Balance: {formatSmartNumber(data.balance)} {chain === 'monad' ? 'MON' : 'SOL'}
            </p>
            <p className="text-[10px] tabular-nums" style={{ color: data.balanceChangeFromInitial >= 0 ? "#18c48c" : "#ef4444" }}>
              Change: {data.balanceChangeFromInitial >= 0 ? "+" : ""}{formatSmartNumber(Math.abs(data.balanceChangeFromInitial))} {chain === 'monad' ? 'MON' : 'SOL'}
            </p>
            <p className="text-[10px] tabular-nums" style={{ color: data.balanceChangePercent >= 0 ? "#18c48c" : "#ef4444" }}>
              {data.balanceChangePercent >= 0 ? "+" : ""}{data.balanceChangePercent.toFixed(2)}%
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) return null;

  const isPositive = chartData[chartData.length - 1]?.balanceChangeFromInitial >= 0;
  const strokeColor = isPositive ? "#18c48c" : "#ef4444";

  // Calculate fixed domain for Y-axis to prevent chart from moving
  const allValues = chartData.map(d => d.balanceChangeFromInitial);
  const minValue = Math.min(...allValues, 0);
  const maxValue = Math.max(...allValues, 0);
  const padding = Math.max(Math.abs(minValue), Math.abs(maxValue)) * 0.1; // 10% padding
  const yDomain = [minValue - padding, maxValue + padding];

  return (
    <div className="w-full h-full min-h-[120px] sm:min-h-[160px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
          onMouseMove={(e: any) => {
            if (e && e.activeTooltipIndex !== undefined) {
              setHoveredIndex(e.activeTooltipIndex);
            }
          }}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" opacity={0.5} />
          <XAxis 
            dataKey="time" 
            stroke="#27272a"
            fontSize={8}
            tick={{ fill: '#52525b' }}
            interval={Math.floor(chartData.length / 5)}
            tickLine={{ stroke: 'rgba(255,255,255,0.04)' }}
          />
          <YAxis 
            stroke="#27272a"
            fontSize={8}
            tick={{ fill: '#52525b' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.04)' }}
            domain={yDomain}
            allowDataOverflow={false}
            width={40}
            tickFormatter={(value) => {
              if (Math.abs(value) >= 1) return value.toFixed(2);
              if (Math.abs(value) >= 0.1) return value.toFixed(3);
              return value.toFixed(4);
            }}
          />
          <Tooltip 
            content={<CustomTooltip />}
            cursor={{ stroke: strokeColor, strokeWidth: 1, strokeDasharray: '5 5' }}
            position={{ y: -10 }}
          />
          <Area
            type="monotone"
            dataKey="balanceChangeFromInitial"
            stroke={strokeColor}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ 
              r: 5, 
              fill: strokeColor,
              stroke: 'rgba(0,0,0,0.8)',
              strokeWidth: 2
            }}
            animationDuration={300}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// Stacked Token Boxes Component - JTX style
const StackedTokenBoxes = ({ count = 0 }: { count?: number }) => (
  <InterstateTooltip label="Tokens held">
    <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity px-2 py-1 rounded-md bg-[#0c0e12]/60 border border-white/[0.06]">
      <div className="flex items-center relative" style={{ width: "28px", height: "14px" }}>
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className={`absolute w-3.5 h-3.5 rounded ${
              index === 0
                ? "bg-[#3f3f46]"
                : index === 1
                ? "bg-[#52525b]"
                : "bg-[#71717a]"
            }`}
            style={{
              left: `${index * 5}px`,
              zIndex: 3 - index,
            }}
          />
        ))}
      </div>
      <span className="text-xs text-[#f4f4f5] tabular-nums">{count}</span>
    </div>
  </InterstateTooltip>
);

// Dynamic chain icon component (Solana or Monad)
const ChainIcon = ({ chain = 'sol', size = 'small' }: { chain?: string; size?: 'small' | 'medium' | 'large' }) => {
  const sizeClasses = {
    small: 'h-3 w-3',
    medium: 'h-4 w-4',
    large: 'h-5 w-5',
  };
  
  if (chain === 'monad') {
    return (
      <img
        src="https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1"
        alt="Monad"
        className={`${sizeClasses[size]} inline-block -mt-0.5 mx-0.5 rounded`}
        style={{ objectFit: 'contain' }}
      />
    );
  }
  return (
    <SiSolana
      className={`${sizeClasses[size]} inline-block -mt-0.5 mx-0.5`}
      aria-hidden="true"
      style={{
        color: "unset",
        fill: "url(#solana-gradient-inline)",
        filter: "none",
      }}
    />
  );
};

// SOL icon component for inline use (kept for backward compatibility)
const SolIcon = () => <ChainIcon chain="sol" />;

const spotTabs = ["Active Positions", /* "History", */ "Top 100", "Activity"];

// Token metadata cache interface
interface TokenMetadataCache extends UnifiedTokenMetadata {
  timestamp: number; // When it was cached
}

interface UserWallet {
  id: string;
  label: string;
  address: string;
  solanaAddress: string;
  ethereumAddress: string;
  balance: number;
  holdingsCount: number;
  isArchived?: boolean;
  isPrimary?: boolean;
  walletId?: string | null; // Turnkey wallet ID (null for imported wallets)
}

const isValidSolanaAddress = (address?: string | null) =>
  typeof address === "string" &&
  /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());

const normalizeWalletFromApi = (
  wallet: any,
  fallbackIndex?: number
): UserWallet => {
  const rawAddress =
    typeof wallet?.address === "string" ? wallet.address.trim() : "";
  const solanaAddress =
    isValidSolanaAddress(wallet?.solanaAddress)
      ? wallet.solanaAddress.trim()
      : isValidSolanaAddress(rawAddress)
      ? rawAddress
      : "";
  const ethereumAddress =
    normalizeMonadAddress(wallet?.ethereumAddress) ||
    normalizeMonadAddress(rawAddress) ||
    "";
  const resolvedAddress = solanaAddress || ethereumAddress || "";
  let label = typeof wallet?.label === "string" ? wallet.label : undefined;
  if (!label) {
    if (typeof fallbackIndex === "number") {
      label = fallbackIndex === 0 ? "Interstate Main" : `Wallet ${fallbackIndex + 1}`;
    } else {
      label = "Wallet";
    }
  }
  return {
    id: wallet?.id ?? "",
    label,
    address: resolvedAddress,
    solanaAddress: solanaAddress,
    ethereumAddress,
    balance: typeof wallet?.balance === "number" ? wallet.balance : 0,
    holdingsCount: typeof wallet?.holdingsCount === "number" ? wallet.holdingsCount : 0,
    isArchived: Boolean(wallet?.isArchived),
    isPrimary: Boolean(wallet?.isPrimary),
    walletId: wallet?.walletId ?? null, // Turnkey wallet ID
  };
};

const getAddressForChain = (wallet: UserWallet, chain: string) => {
  if (chain === "sol") {
    if (isValidSolanaAddress(wallet.solanaAddress)) {
      return wallet.solanaAddress.trim();
    }
    if (isValidSolanaAddress(wallet.address)) {
      return wallet.address.trim();
    }
    return "";
  }
  return (
    normalizeMonadAddress(wallet.ethereumAddress) ||
    normalizeMonadAddress(wallet.address) ||
    ""
  );
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const CACHE_KEY = "tokenMetadataCache";

export default function PortfolioPage() {
  const [activeSection, setActiveSectionState] = useState<"spot" | "predictions" | "wallet" | "perpetuals">("spot");
  const setActiveSection = (section: "spot" | "predictions" | "wallet" | "perpetuals") => {
    setActiveSectionState(section);
    // Notify Header about section change so it can toggle prediction balance display
    window.dispatchEvent(new CustomEvent('portfolio-section-change', { detail: { section } }));
  };
  const [activeSpotTab, setActiveSpotTab] = useState(0);
  const [activePerpetualsTab, setActivePerpetualsTab] = useState(0);
  const { user, loading: userLoading, solBalance, usdcBalance, refreshBalance, refreshAllBalances, chainBalances, primaryWalletAddresses, walletBalances: contextWalletBalances, walletList: contextWalletList, walletListLoading, refreshWalletList, refreshUser, selectedWalletIds, selectAllWalletsForChain, selectWalletsWithFunds, clearSelectedWallets, setSelectedWalletsForChain } = useUser();
  const { requestSnapshot, connected: wsConnected } = useSolanaPositionWebSocketContext();
  const { solPrice: contextSolPrice, monPrice } = useSolPrice();
  const router = useRouter();
  // Get chain from URL first, then localStorage, then default to solana
  const currentChain = (() => {
    if (router.query.chain) {
      return router.query.chain as string;
    }
    if (typeof window !== 'undefined') {
      const savedChain = localStorage.getItem('selected-chain');
      if (savedChain === 'sol' || savedChain === 'monad') {
        return savedChain;
      }
    }
    return 'sol';
  })();
  const monBalance = chainBalances?.monad || 0;
  const chainBalance = chainBalances?.[currentChain] ?? (currentChain === "sol" ? solBalance : 0);
  const chainPrice = currentChain === 'monad' ? (monPrice || 0) : (contextSolPrice || 0);

  // Chain-derived portfolio for the primary Solana wallet. Source of truth for
  // Active Positions + Top 100 + the position-derived top metric cards.
  // Returns empty state when chain != "sol" or no primary is set yet.
  // Powered by /v1/wallet/:addr/* on token-service (live via WS, see useRobustWebSocket).
  const primarySolAddr = currentChain === "sol" ? (primaryWalletAddresses?.solana ?? null) : null;
  const wp = useWalletPortfolio(primarySolAddr);

  // Chain-derived trade history for Activity tab. Only fetches when:
  //  - The Activity tab (index 2) is active (lazy fetch — no waste on Active Positions/Top 100 views)
  //  - Chain is Solana with a primary wallet set
  // When the wallet trader index is still building, isIndexing flips true and the
  // Activity render below falls back to existing on-platform trades + shows a banner.
  const wt = useWalletTrades(primarySolAddr, currentChain === "sol" && activeSpotTab === 2);

  // Per-wallet chain-derived holdings counts. The Wallets list shows a holdings
  // badge per row; backend's wallet.holdingsCount is computed from TradeHistory
  // (on-platform trades only), which means wallets that traded primarily off-
  // platform (Axiom/Phantom/etc.) show 0 even though they hold tokens on chain.
  // Fix: for each Solana wallet in walletList, fetch its summary and use the
  // chain-derived active_position_count. Refreshes on walletList change.
  const [chainHoldingsCounts, setChainHoldingsCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (currentChain !== "sol") return;
    const solWallets = (contextWalletList || []).filter(
      (w: any) => w.solanaAddress && !w.isArchived,
    );
    if (solWallets.length === 0) return;
    let cancelled = false;

    // Concurrency cap: token-service runs a wallet_holder_positions aggregate
    // per request (236M-row table). Power users may have 10-20 wallets in
    // their list — firing them all in parallel can starve the token-service
    // connection pool. Cap at 3 in flight; total wall-clock is still <2s for
    // typical lists.
    const CONCURRENCY = 3;
    const fetchSummariesLimited = async (): Promise<Array<{ addr: string; count: number } | null>> => {
      const results: Array<{ addr: string; count: number } | null> = new Array(solWallets.length).fill(null);
      let cursor = 0;
      const worker = async (): Promise<void> => {
        while (true) {
          if (cancelled) return;
          const i = cursor++;
          if (i >= solWallets.length) return;
          const w = solWallets[i];
          try {
            const s = await getWalletPortfolioSummary(w.solanaAddress);
            results[i] = { addr: w.solanaAddress, count: s.active_position_count };
          } catch {
            results[i] = null;
          }
        }
      };
      const workers = Array.from({ length: Math.min(CONCURRENCY, solWallets.length) }, () => worker());
      await Promise.all(workers);
      return results;
    };

    fetchSummariesLimited().then((results) => {
      if (cancelled) return;
      const map: Record<string, number> = {};
      results.forEach((r) => {
        if (r) map[r.addr] = r.count;
      });
      setChainHoldingsCounts(map);
    });
    return () => {
      cancelled = true;
    };
    // Note: not depending on tradeRefreshCounter (declared later in this scope)
    // — would cause TDZ. Non-primary wallet counts refresh on walletList changes
    // only; primary wallet count is live via positions.length so doesn't need
    // this map.
  }, [contextWalletList, currentChain]);

  const [walletChecked, setWalletChecked] = useState(false);
  // Incremented when a trade-completed event fires, triggers re-fetch of history/activity
  const [tradeRefreshCounter, setTradeRefreshCounter] = useState(0);
  // Cache keys for trade history and activity (user-specific and chain-specific)
  const tradeHistoryCacheKey = useMemo(() => {
    return `trade_history_cache_${user?.id || 'anonymous'}_${currentChain}`;
  }, [user?.id, currentChain]);

  const tradeActivityCacheKey = useMemo(() => {
    return `trade_activity_cache_${user?.id || 'anonymous'}_${currentChain}`;
  }, [user?.id, currentChain]);

  // Initialize trade history from localStorage cache for instant display
  // No TTL gating — background fetch always runs on mount and replaces cached data within seconds
  const [tradeHistory, setTradeHistory] = useState<TradeRow[]>(() => {
    if (!user?.id || typeof window === 'undefined') return [];
    try {
      const cacheKey = `trade_history_cache_${user.id}_${currentChain}`;
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
          isDev && console.log(`[Trade History] ✅ Restored ${parsed.data.length} trades from cache for instant display`);
          return parsed.data as TradeRow[];
        }
      }
    } catch (error) {
      console.warn(`[Trade History] Failed to restore cache:`, error);
    }
    return [];
  });
  const [loadingTradeHistory, setLoadingTradeHistory] = useState(() => {
    if (!user?.id || typeof window === 'undefined') return true;
    try {
      const cacheKey = `trade_history_cache_${user.id}_${currentChain}`;
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.data?.length > 0) return false;
      }
    } catch { /* ignore */ }
    return true;
  });
  
  // Initialize trade activity from localStorage cache for instant display
  // No TTL gating — background fetch always runs on mount and replaces cached data within seconds
  const [tradeActivity, setTradeActivity] = useState<TradeRow[]>(() => {
    if (!user?.id || typeof window === 'undefined') return [];
    try {
      const cacheKey = `trade_activity_cache_${user.id}_${currentChain}`;
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
          isDev && console.log(`[Trade Activity] ✅ Restored ${parsed.data.length} trades from cache for instant display`);
          return parsed.data as TradeRow[];
        }
      }
    } catch (error) {
      console.warn(`[Trade Activity] Failed to restore cache:`, error);
    }
    return [];
  });
  const [loadingTradeActivity, setLoadingTradeActivity] = useState(() => {
    if (!user?.id || typeof window === 'undefined') return true;
    try {
      const cacheKey = `trade_activity_cache_${user.id}_${currentChain}`;
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.data?.length > 0) return false;
      }
    } catch { /* ignore */ }
    return true;
  });
  
  // Load from cache when cache keys change (e.g., user or chain changes)
  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') return;
    
    // Load trade history from cache
    try {
      const cached = window.localStorage.getItem(tradeHistoryCacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
          isDev && console.log(`[Trade History] ✅ Loaded ${parsed.data.length} trades from cache (cache key changed)`);
          setTradeHistory(parsed.data as TradeRow[]);
          setLoadingTradeHistory(false);
        }
      }
    } catch (error) {
      console.warn(`[Trade History] Failed to load cache:`, error);
    }

    // Load trade activity from cache
    try {
      const cached = window.localStorage.getItem(tradeActivityCacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
          isDev && console.log(`[Trade Activity] ✅ Loaded ${parsed.data.length} trades from cache (cache key changed)`);
          setTradeActivity(parsed.data as TradeRow[]);
          setLoadingTradeActivity(false);
        }
      }
    } catch (error) {
      console.warn(`[Trade Activity] Failed to load cache:`, error);
    }
  }, [tradeHistoryCacheKey, tradeActivityCacheKey, user?.id]);
  const [unrealizedPnl, setUnrealizedPnl] = useState(0);
  const [unrealizedPnlPercentage, setUnrealizedPnlPercentage] = useState(0);
  const [totalPnl, setTotalPnl] = useState(0);
  const [totalPnlPercentage, setTotalPnlPercentage] = useState(0);
  const [actualBalanceChangePnl, setActualBalanceChangePnl] = useState(0);
  const [actualBalanceChangePnlPercentage, setActualBalanceChangePnlPercentage] = useState(0);
  const [actualBalanceChangeNative, setActualBalanceChangeNative] = useState(0); // Native balance change (MON or SOL)
  const [actualBalanceChangeNativePercentage, setActualBalanceChangeNativePercentage] = useState(0); // Native percentage change
  const [balanceHistory, setBalanceHistory] = useState<Array<{ timestamp: number; balance: number; balanceChange: number }>>([]);
  const [pnlChartData, setPnlChartData] = useState<PnlChartDataPoint[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  // Track previous balances to detect sales - persist across page reloads
  const previousBalancesRef = useRef<Record<string, number>>({});
  
  // Track cumulative realized PNL (persists across reloads)
  const cumulativeRealizedPnlRef = useRef<number>(0);
  
  // Track initial native balance (MON for Monad, SOL for Solana) for actual PNL calculation
  const initialNativeBalanceRef = useRef<number | null>(null);
  
  // Track if balance refresh should be forced (e.g., when wallets are updated)
  const forceBalanceRefreshRef = useRef(false);
  const activityLoadedRef = useRef(false);
  const pendingWsTradesRef = useRef<any[]>([]);
  
  // Helper to get localStorage keys (computed based on user and chain)
  const getStorageKeys = () => ({
    previousBalances: `previousBalances_${user?.id || 'anonymous'}_${currentChain}`,
    cumulativeRealizedPnl: `cumulativeRealizedPnl_${user?.id || 'anonymous'}_${currentChain}`,
    initialNativeBalance: `initialNativeBalance_${user?.id || 'anonymous'}_${currentChain}`,
  });
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [top100Positions, setTop100Positions] = useState<PositionRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Mirror chain-derived positions for the primary Solana wallet into the page-level
  // `positions` state. Downstream consumers (Performance breakdown, top100Positions
  // derivation, Realized PNL math, etc.) all read from `positions` — by syncing here,
  // they continue to work without per-call rewrites. When chain is Monad, leave the
  // existing Monad position flow alone.
  //
  // Filter dust (remaining ≤ 0.001) defensively so a sold-out token can't linger in
  // any downstream computation — Top 100 in particular sorts by USD value desc and
  // doesn't filter; without this, a just-sold position with remaining=0 would still
  // appear at the bottom of Top 100 until the next REST refetch.
  //
  // Reverse to oldest-first: <Positions> at line 983 does `[...preloaded].reverse()`
  // before render — a hidden convention from the legacy user-keyed API that returned
  // ASC. Our chain-derived endpoint returns DESC (newest-first). Without this reverse,
  // the component's reverse pushes the newest buy to the bottom of the list.
  //
  // USD enrichment: chain endpoint returns 0 for *_usd fields (backend USD multiplier
  // is a separate TODO). We have live SOL price client-side via SolPrice context, so
  // populate USD fields here so downstream consumers (Performance breakdown bins,
  // Realized PNL display, top100 sorting) work correctly. Computed locally — no extra
  // network calls.
  useEffect(() => {
    if (currentChain !== "sol") return;
    const solPrice = contextSolPrice || 0;
    const enriched = wp.positions
      .filter((p) => p.remaining > 0.001)
      .map((p) => {
        // Cost basis priority order:
        //   1. p.boughtUsdValue from backend (currently always 0; indexer doesn't
        //      stamp USD-at-trade-time yet, so this branch is rarely taken)
        //   2. total_outflow_sol × solPrice — the indexer's full SOL outflow
        //      (swap + ALL fees) from migration 023. THIS is the chain-truth
        //      cost basis; what Axiom/GMGN use.
        //   3. bought_sol × solPrice — swap-amount-only fallback for positions
        //      composed of pre-migration-023 trades where total_outflow_sol is 0.
        //      Understates real cost basis by 70-95% on small trades but it's
        //      the best we have for old data.
        const boughtSol = (p as any).bought_sol ?? 0;
        const soldSol = (p as any).sold_sol ?? 0;
        const realizedSol = (p as any).realized_pnl_sol ?? 0;
        const totalOutflowSol = (p as any).total_outflow_sol ?? 0;
        const boughtUsd = p.boughtUsdValue && p.boughtUsdValue > 0
          ? p.boughtUsdValue
          : totalOutflowSol > 0
            ? totalOutflowSol * solPrice
            : boughtSol * solPrice;
        const soldUsd = p.soldUsdValue && p.soldUsdValue > 0
          ? p.soldUsdValue
          : soldSol * solPrice;
        const realizedUsd = realizedSol * solPrice; // SOL-based realized * USD/SOL
        const remainingUsd = p.remainingUsdValue || 0;
        // Total PnL on this position: realized (closed portion) + unrealized (open).
        // unrealized = (remaining at current price) - (cost basis of remaining).
        const remainingFraction = boughtSol > 0 ? (boughtSol - soldSol * (boughtSol / Math.max(boughtSol, 1e-9))) / boughtSol : 0; // simplified
        const costBasisRemainingUsd = boughtSol > 0
          ? boughtUsd * Math.max(0, 1 - (soldSol / boughtSol))
          : 0;
        const unrealizedUsd = remainingUsd - costBasisRemainingUsd;
        const totalPnlUsd = realizedUsd + unrealizedUsd;
        const pnlPercentage = boughtUsd > 0 ? (totalPnlUsd / boughtUsd) * 100 : 0;
        return {
          ...p,
          boughtUsdValue: boughtUsd,
          soldUsdValue: soldUsd,
          pnl: totalPnlUsd,
          pnlPercentage,
        };
      })
      .reverse();
    setPositions(enriched);
  }, [wp.positions, currentChain, contextSolPrice]);

  // Realized PNL override for primary-wallet view on sol. Existing computation
  // (lines ~1664-1948) iterates user-keyed `tradeHistory` from memecoin-backend —
  // returns user-aggregate, not wallet-scoped. wp.summary.* IS wallet-scoped +
  // chain-authoritative. Prefer the indexer's USD field (priced at trade time)
  // over SOL × current-price, which retroactively re-prices closed trades and
  // distorts realized PnL during SOL-volatile periods.
  const chainRealizedPnlUsd = useMemo(() => {
    if (currentChain !== "sol" || !wp.summary) return null;
    const usdField = wp.summary.total_realized_pnl_usd;
    if (typeof usdField === "number" && usdField !== 0) return usdField;
    const solPrice = contextSolPrice || 0;
    return (wp.summary.total_realized_pnl_sol || 0) * solPrice;
  }, [currentChain, wp.summary, contextSolPrice]);

  // Wallet-scoped Realized PnL percentage. True accuracy would need
  // cost_basis_of_sold (per-token avg-buy × sold), which summary doesn't expose;
  // approximate as realized / total_bought_usd. Good enough for v1 vs. the
  // alternative (user-aggregate timeframe percentage), which is even less
  // correct for the primary-wallet view.
  const chainRealizedPnlPct = useMemo(() => {
    if (currentChain !== "sol" || !wp.summary || chainRealizedPnlUsd == null) return null;
    const solPrice = contextSolPrice || 0;
    const boughtUsd = (wp.summary.total_bought_sol || 0) * solPrice;
    if (boughtUsd <= 0) return 0;
    return (chainRealizedPnlUsd / boughtUsd) * 100;
  }, [currentChain, wp.summary, contextSolPrice, chainRealizedPnlUsd]);

  // The display values: chain-derived when on Solana with summary loaded;
  // fall back to the legacy user-aggregate `timeframeMetrics` for Monad and
  // pre-summary-load states.
  const displayRealizedPnl = useMemo(() => {
    return chainRealizedPnlUsd ?? null; // null = "use legacy"
  }, [chainRealizedPnlUsd]);
  const displayRealizedPnlPct = useMemo(() => {
    return chainRealizedPnlPct ?? null;
  }, [chainRealizedPnlPct]);
  const [tokenNames, setTokenNames] = useState<Record<string, string>>({});
  const [showHidden, setShowHidden] = useState(false);
  const [sortByUSD, setSortByUSD] = useState(false);
  // Calculate native price for current chain
  const nativePriceForDisplay = useMemo(() => {
    if (currentChain === 'monad') {
      return monPrice || 0.025;
    } else {
      return contextSolPrice || 0;
    }
  }, [currentChain, monPrice, contextSolPrice]);

  // Formatting functions matching Header.tsx for consistent display
  const formatBalance = (value: number, digits = 3) => {
    if (value === 0) return "0";
    const fixed = value.toFixed(digits);
    return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  };
  const formatCurrency = (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const [wallets, setWallets] = useState<UserWallet[]>([]);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [walletRenameValue, setWalletRenameValue] = useState("");
  const [renamingWalletId, setRenamingWalletId] = useState<string | null>(null);
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});
  const [showImportSolanaModal, setShowImportSolanaModal] = useState(false);
  const [showImportEvmModal, setShowImportEvmModal] = useState(false);
  const [showImportDropdown, setShowImportDropdown] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportWalletId, setExportWalletId] = useState<string | null>(null);
  const [exportWalletAddress, setExportWalletAddress] = useState<string | null>(null);
  const [forceExportChain, setForceExportChain] = useState<"sol" | "monad" | null>(null);
  const [walletSearchQuery, setWalletSearchQuery] = useState("");
  const [redistributing, setRedistributing] = useState(false);
  const [deletingWalletId, setDeletingWalletId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserWallet | null>(null);
  const [deleteRiskAck, setDeleteRiskAck] = useState(false);
  const [refreshingBalances, setRefreshingBalances] = useState(false);
  const isWalletsLoading = walletListLoading && wallets.length === 0;

  const notifyWalletsUpdated = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("wallets-updated"));
    }
  };


  // Shared token metadata cache across all tabs
  const [tokenMetadataCache, setTokenMetadataCache] =
    useState<Record<string, TokenMetadataCache>>({});
  const tokenMetadataCacheRef = useRef<Record<string, TokenMetadataCache>>({});

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
          tokenMetadataCacheRef.current = validCache;
          isDev && console.log(
            `📦 Loaded ${Object.keys(validCache).length} cached tokens from localStorage`,
          );
        }
      }
    } catch (error) {
      console.error("Error loading token cache:", error);
    }
  }, []);

  useEffect(() => {
    tokenMetadataCacheRef.current = tokenMetadataCache;
  }, [tokenMetadataCache]);

  // Force Solana export when switching to Sol chain and user hasn't acknowledged backup
  useEffect(() => {
    if (!user?.id) return;
    if (currentChain !== "sol") return;
    if (showExportModal) return;

    try {
      const solAck = localStorage.getItem("export_ack_sol") === "true";
      if (solAck) return;
    } catch {
      // ignore storage issues
    }

    const primary =
      wallets.find((w) => w.isPrimary) ||
      wallets[0];

    if (primary) {
      setExportWalletId(primary.walletId || primary.id);
      setExportWalletAddress(getAddressForChain(primary, "sol"));
      setForceExportChain("sol");
      setShowExportModal(true);
      posthog.capture("wallet_export_initiated", { chain: currentChain });
    }
  }, [currentChain, showExportModal, user?.id, wallets]);

  // Save cache to localStorage when it changes (debounced)
  useEffect(() => {
    if (Object.keys(tokenMetadataCache).length === 0) return;

    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(tokenMetadataCache));
      } catch (error) {
        console.error("Error saving token cache:", error);
      }
    }, 1000); // Debounce saves by 1 second

    return () => clearTimeout(timeoutId);
  }, [tokenMetadataCache]);

  // Helper function to update cache
  const updateTokenMetadataCache = useCallback(
    (
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
    },
    [],
  );

  // Helper function to check if cache entry is valid
  const isCacheValid = useCallback((tokenAddress: string): boolean => {
    const cached = tokenMetadataCacheRef.current[tokenAddress];
    if (!cached) return false;
    return Date.now() - cached.timestamp < CACHE_TTL;
  }, []);

  const normalizeBlockchainValue = (value?: string | null) => {
    if (!value) return "solana";
    const normalized = value.toLowerCase();
    if (normalized === "sol") return "solana";
    return normalized;
  };

  const isTradeOnCurrentChain = useCallback(
    (trade: TradeRow) => {
      const normalized = normalizeBlockchainValue(trade.blockchain);
      if (currentChain === "monad") {
        return normalized === "monad";
      }
      // Default to Solana for undefined/other values
      return normalized === "solana";
    },
    [currentChain],
  );

  const fallbackPositions = useMemo(() => {
    const map: Record<string, PositionRow> = {};

    // Filter out split trades (multi-wallet children) to avoid double-counting
    const nonSplitTrades = tradeHistory.filter(t => !t.isSplitTrade);

    nonSplitTrades.forEach((trade) => {
      const tokenKey = trade.tokenAddress?.toLowerCase();
      if (!tokenKey) return;

      if (!map[tokenKey]) {
        map[tokenKey] = {
          tokenAddress: trade.tokenAddress,
          pairAddress: trade.originalPairAddress || trade.pairAddress,
          bought: 0,
          boughtUsdValue: 0,
          sold: 0,
          soldUsdValue: 0,
          remaining: 0,
          remainingUsdValue: 0,
          pnl: 0,
          pnlPercentage: 0,
          actions: "sell",
          blockchain: trade.blockchain,
          launchpad: trade.launchpad || null,
        };
      }

      const entry = map[tokenKey];
      const tokenAmount = Number(trade.tokenAmount) || 0;
      const usdValue = Number(trade.usdValue) || 0;

      if (trade.type === "Buy") {
        entry.bought += tokenAmount;
        entry.boughtUsdValue += usdValue;
      } else if (trade.type === "Sell") {
        entry.sold += tokenAmount;
        entry.soldUsdValue += usdValue;
      }

      entry.remaining = entry.bought - entry.sold;
      entry.remainingUsdValue = entry.boughtUsdValue - entry.soldUsdValue;
      entry.pnl = entry.soldUsdValue + entry.remainingUsdValue - entry.boughtUsdValue;
      entry.pnlPercentage =
        entry.boughtUsdValue > 0 ? (entry.pnl / entry.boughtUsdValue) * 100 : 0;
    });

    return map;
  }, [tradeHistory]);

  // SOL price now comes from shared SolPriceContext (contextSolPrice) — no local fetch needed
  const [selectedTimeframe, setSelectedTimeframe] = useState("Max");
  const [timeframeMetrics, setTimeframeMetrics] = useState<{
    unrealizedPnl: number;
    realizedPnl: number;
    realizedPnlPercentage: number;
    winningTrades: number;
    losingTrades: number;
  }>({
    unrealizedPnl: 0,
    realizedPnl: 0,
    realizedPnlPercentage: 0,
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
        // Check cache to determine if we should show loading
        let hasValidCache = false;
        if (typeof window !== 'undefined') {
          try {
            const cached = window.localStorage.getItem(tradeHistoryCacheKey);
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
                hasValidCache = true;
              }
            }
          } catch (error) {
            // Ignore cache errors
          }
        }

        // Only show loading if we don't have valid cache (for instant display)
        if (!hasValidCache) {
          setLoadingTradeHistory(true);
        } else {
          isDev && console.log(`[Trade History] 🔄 Refreshing trade history in background (cache available for instant display)`);
        }

        try {
          // Map chain query param to blockchain: 'sol' -> 'solana', 'monad' -> 'monad'
          const blockchain = currentChain === 'monad' ? 'monad' : currentChain === 'sol' ? 'solana' : undefined;
          // Use getTradeActivityByUser to get raw trades with PNL fields (pricePerToken, costBasis, realizedPnl, etc.)
          const history = await getTradeActivityByUser(user.id, blockchain);
          const filteredHistory = Array.isArray(history)
            ? history.filter(isTradeOnCurrentChain)
            : [];

          // Merge WS trades that REST hasn't confirmed yet
          const now = Date.now();
          const restIds = new Set(filteredHistory.map((t: any) => t.id));
          pendingWsTradesRef.current = pendingWsTradesRef.current.filter((t: any) => {
            if (restIds.has(t.id)) return false; // REST confirmed
            if (now - (t._wsTimestamp || 0) > 60000) return false; // Expired
            return true;
          });

          let finalHistory = filteredHistory;
          if (pendingWsTradesRef.current.length > 0) {
            const wsIds = new Set(pendingWsTradesRef.current.map((t: any) => t.id));
            const dedupedRest = filteredHistory.filter((t: any) => !wsIds.has(t.id));
            finalHistory = [...pendingWsTradesRef.current, ...dedupedRest];
          }
          setTradeHistory(finalHistory);

          // Save to localStorage cache for instant loading when navigating back
          if (typeof window !== 'undefined') {
            try {
              window.localStorage.setItem(tradeHistoryCacheKey, JSON.stringify({
                data: finalHistory, timestamp: Date.now(),
              }));
            } catch {}
          }
        } catch (error) {
          console.error("Failed to fetch trade history:", error);
          setTradeHistory([]);
        } finally {
          setLoadingTradeHistory(false);
        }
      }
    };

    fetchTradeHistory();
  }, [user?.id, currentChain, isTradeOnCurrentChain, tradeHistoryCacheKey, tradeRefreshCounter]);

  // Fetch trade activity — always fetch on tradeRefreshCounter change (event-driven),
  // but only auto-poll every 5s when the Activity tab is visible.
  useEffect(() => {
    let isInitialLoad = true;

    const loadTradeActivity = async () => {
      if (!user?.id) return;

      // Check cache to determine if we should show loading
      let hasValidCache = false;
      if (typeof window !== 'undefined') {
        try {
          const cached = window.localStorage.getItem(tradeActivityCacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
              hasValidCache = true;
            }
          }
        } catch (error) {
          // Ignore cache errors
        }
      }

      // Only show loading state on initial load if no cache, not on refreshes
      if (isInitialLoad && !hasValidCache && !activityLoadedRef.current) {
        setLoadingTradeActivity(true);
      } else if (hasValidCache) {
        isDev && console.log(`[Trade Activity] 🔄 Refreshing trade activity in background (cache available for instant display)`);
      }

      try {
        // Map chain query param to blockchain: 'sol' -> 'solana', 'monad' -> 'monad'
        const blockchain = currentChain === 'monad' ? 'monad' : currentChain === 'sol' ? 'solana' : undefined;
        const result = await fetchTradeActivity(user.id, blockchain);

        if (!result.ok) {
          // Error/timeout — preserve existing tradeActivity, don't wipe to []
          console.warn(`[Trade Activity] Fetch failed (${(result as { ok: false; data: null; error: string }).error}), keeping existing data`);
        } else {
          const filteredActivity = result.data.filter(isTradeOnCurrentChain);

          // Merge WS trades that REST hasn't confirmed yet
          const now = Date.now();
          const restIds = new Set(filteredActivity.map((t: any) => t.id));
          pendingWsTradesRef.current = pendingWsTradesRef.current.filter((t: any) => {
            if (restIds.has(t.id)) return false; // REST confirmed
            if (now - (t._wsTimestamp || 0) > 60000) return false; // Expired
            return true;
          });

          let finalActivity = filteredActivity;
          if (pendingWsTradesRef.current.length > 0) {
            const wsIds = new Set(pendingWsTradesRef.current.map((t: any) => t.id));
            const dedupedRest = filteredActivity.filter((t: any) => !wsIds.has(t.id));
            finalActivity = [...pendingWsTradesRef.current, ...dedupedRest];
          }
          // Preserve recent optimistic entries (negative id) that REST hasn't confirmed yet
          const mergedActivity = finalActivity;
          setTradeActivity((prev) => {
            const now = Date.now();
            const recentOptimistic = prev.filter((t: any) =>
              t.id < 0 && (now + t.id) < 10000 // id is -Date.now(), so age = now + id
              && (!t.transactionHash || !mergedActivity.some((r: any) => r.transactionHash === t.transactionHash))
            );
            if (recentOptimistic.length === 0) return mergedActivity;
            return [...recentOptimistic, ...mergedActivity];
          });

          // Clean up pending_ws_trades localStorage too
          if (typeof window !== 'undefined') {
            try {
              const lsRaw = localStorage.getItem('pending_ws_trades');
              if (lsRaw) {
                const lsTrades = JSON.parse(lsRaw);
                const cleaned = lsTrades.filter((t: any) => !restIds.has(t.id) && now - (t._wsTimestamp || 0) < 60000);
                if (cleaned.length === 0) localStorage.removeItem('pending_ws_trades');
                else localStorage.setItem('pending_ws_trades', JSON.stringify(cleaned));
              }
            } catch {}
          }

          // Save to localStorage cache for instant loading when navigating back
          if (typeof window !== 'undefined') {
            try {
              window.localStorage.setItem(tradeActivityCacheKey, JSON.stringify({
                data: finalActivity, timestamp: Date.now(),
              }));
            } catch {}
          }
        }
      } catch (error) {
        // Unexpected error — still preserve existing data
        console.error("Failed to fetch trade activity:", error);
      } finally {
        if (isInitialLoad) {
          setLoadingTradeActivity(false);
          isInitialLoad = false;
          activityLoadedRef.current = true;
        }
      }
    };

    loadTradeActivity();

    // Fallback: poll every 10s when WS disconnected, every 30s as background safety net
    const pollMs = wsConnected ? 30000 : 10000;
    const activityPollId = setInterval(loadTradeActivity, pollMs);
    return () => clearInterval(activityPollId);
  }, [user?.id, currentChain, isTradeOnCurrentChain, tradeActivityCacheKey, tradeRefreshCounter, wsConnected]);

  // Preload token images from activity rows as soon as data arrives
  const { preloadImages } = useImagePreloader();
  useEffect(() => {
    if (!tradeActivity || tradeActivity.length === 0) return;
    const imageSources = tradeActivity
      .map((trade: any) => extractTokenImage(trade))
      .filter(Boolean);
    if (imageSources.length > 0) {
      preloadImages(imageSources, { priority: true, timeout: 2000 });
    }
  }, [tradeActivity, preloadImages]);

  // Listen for trade-completed events and consume pending refreshes on mount
  useEffect(() => {
    // Clear stale WS trades from previous chain on chain switch
    pendingWsTradesRef.current = [];

    // Request WS snapshot for instant activity data (handles page navigation when WS already open)
    if (!activityLoadedRef.current) {
      requestSnapshot();
    }

    // On mount: consume any pending trade refreshes from other pages (cross-navigation)
    const pending = consumePendingTradeRefreshes();
    const relevantPending = pending.filter((p) =>
      (currentChain === 'monad' && p.chain === 'monad') ||
      (currentChain !== 'monad' && p.chain === 'sol')
    );
    if (relevantPending.length > 0) {
      isDev && console.log(`[Portfolio] Consuming ${relevantPending.length} pending trade refresh(es)`);
      refreshBalance({ chain: currentChain === 'monad' ? 'monad' : 'sol', force: true }).catch(() => {});
      setTradeRefreshCounter((c) => c + 1);
      // Retry to catch trades still being saved (buy API still processing or Pumpfun async save)
      setTimeout(() => setTradeRefreshCounter((c) => c + 1), 500);
      setTimeout(() => setTradeRefreshCounter((c) => c + 1), 2000);
      setTimeout(() => setTradeRefreshCounter((c) => c + 1), 5000);
    }

    // Consume any WS-pushed trades that arrived while portfolio was unmounted
    // These come from the global WS hook (always mounted) and are guaranteed post-DB-save
    try {
      const wsKey = 'pending_ws_trades';
      const pendingRaw = localStorage.getItem(wsKey);
      if (pendingRaw) {
        localStorage.removeItem(wsKey); // consume immediately
        const pendingTrades = JSON.parse(pendingRaw);
        const now = Date.now();
        // Filter: only trades from last 60s, matching current chain
        const relevant = pendingTrades.filter((t: any) => {
          if (now - (t._wsTimestamp || 0) > 60000) return false;
          const chain = (t.blockchain || 'solana').toLowerCase();
          return (currentChain === 'monad' && chain === 'monad') ||
                 (currentChain !== 'monad' && chain === 'solana');
        });
        if (relevant.length > 0) {
          isDev && console.log(`[Portfolio] Consuming ${relevant.length} pending WS trade(s) from localStorage`);
          // Add to ref for merge protection against REST overwrites
          pendingWsTradesRef.current = [
            ...pendingWsTradesRef.current.filter((t: any) => !relevant.some((r: any) => r.id === t.id)),
            ...relevant.map((t: any) => ({ ...t, _wsTimestamp: t._wsTimestamp || Date.now() })),
          ];
          setTradeActivity(prev => {
            const existingIds = new Set(prev.map((t: any) => t.id));
            const newTrades = relevant.filter((t: any) => !existingIds.has(t.id));
            if (newTrades.length === 0) return prev;
            const updated = [...newTrades, ...prev];
            try {
              localStorage.setItem(tradeActivityCacheKey, JSON.stringify({ data: updated, timestamp: now }));
            } catch {}
            return updated;
          });
          setTradeHistory(prev => {
            const existingIds = new Set(prev.map((t: any) => t.id));
            const newTrades = relevant.filter((t: any) => !existingIds.has(t.id));
            if (newTrades.length === 0) return prev;
            const updated = [...newTrades, ...prev];
            try {
              localStorage.setItem(tradeHistoryCacheKey, JSON.stringify({ data: updated, timestamp: now }));
            } catch {}
            return updated;
          });
        }
      }
    } catch {}

    // Listen for live trade-completed events (same-page)
    const handleTradeCompleted = (event: Event) => {
      const detail = (event as CustomEvent<TradeCompletedDetail>).detail;
      // Filter: only refresh if the trade's chain matches the currently viewed chain
      const isRelevant =
        (currentChain === 'monad' && detail?.chain === 'monad') ||
        (currentChain !== 'monad' && detail?.chain === 'sol');
      if (!isRelevant) return;

      isDev && console.log(`[Portfolio] Trade completed: ${detail?.tradeType} on ${detail?.chain}`);
      // Force balance refresh
      refreshBalance({ chain: currentChain === 'monad' ? 'monad' : 'sol', force: true }).catch(() => {});

      // Optimistic buy entry: show in Activity tab immediately (before DB record arrives via REST/WS)
      if (detail?.tradeType === 'buy' && detail.tokenAddress) {
        const optimisticTrade: TradeRow = {
          id: -Date.now(),
          tokenAddress: detail.tokenAddress,
          tokenName: detail.tokenName || undefined,
          tokenSymbol: detail.tokenSymbol || undefined,
          imageUrl: detail.imageUrl || null,
          type: 'Buy' as const,
          marketCap: 0,
          solAmount: detail.solAmountSpent || 0,
          tokenAmount: 0,
          usdValue: detail.solAmountSpent || 0,
          transactionHash: detail.txHash || '',
          blockchain: detail.chain === 'monad' ? 'monad' : 'solana',
          createdAt: new Date().toISOString(),
          tradeTime: new Date().toTimeString().split(" ")[0],
        };
        setTradeActivity((prev) => {
          // Deduplicate by txHash (allows multi-buys of same token)
          if (detail.txHash && prev.some((t: any) => t.transactionHash === detail.txHash)) return prev;
          return [optimisticTrade, ...prev];
        });
      }

      // Delay REST re-fetch by 2s so backend setImmediate saves complete before fetch
      // WS solanaNewTrade events still push real data at ~200ms for instant display
      setTimeout(() => setTradeRefreshCounter((c) => c + 1), 2000);

      // Refresh chain-derived positions for the primary Solana wallet immediately
      // after a trade. Without this, the page waits for the chain WS push (~1-3s
      // after confirmation) — feels sluggish vs the old user-keyed flow that had
      // optimistic in-component updates. wp.refetch() pulls fresh /v1/wallet/:addr/
      // {summary,positions} in ~500ms, much closer to the old "instant" feel.
      // Stagger slightly so backend has had a chance to write the trade.
      if (currentChain === "sol" && detail?.chain === "sol") {
        setTimeout(() => { void wp.refetch().catch(() => {}); }, 800);
      }
    };

    window.addEventListener(TRADE_COMPLETED_EVENT, handleTradeCompleted);

    // Listen for WS-driven position change signals
    const handlePositionsChanged = () => {
      refreshBalance({ chain: currentChain === 'monad' ? 'monad' : 'sol', force: true }).catch(() => {});
      setTradeRefreshCounter((c) => c + 1);
      // Same chain-derived refresh trigger — covers WS-driven changes that didn't
      // go through TRADE_COMPLETED_EVENT (e.g. trades from another tab/device).
      if (currentChain === "sol") {
        void wp.refetch().catch(() => {});
      }
    };
    window.addEventListener('solanaPositionsChanged', handlePositionsChanged);

    // Listen for WS-pushed full position data (balance may have changed)
    const handlePositionUpdate = () => {
      refreshBalance({ chain: currentChain === 'monad' ? 'monad' : 'sol', force: true }).catch(() => {});
    };
    window.addEventListener('solanaPositionUpdate', handlePositionUpdate);

    // Listen for WS-pushed new trade records (instant Activity/History update)
    const handleNewTrade = (event: Event) => {
      const trade = (event as CustomEvent).detail;
      if (!trade?.tokenAddress) return;

      // Chain filter: only process trades for the currently viewed chain
      const tradeChain = (trade.blockchain || 'solana').toLowerCase();
      const isRelevant =
        (currentChain === 'monad' && tradeChain === 'monad') ||
        (currentChain !== 'monad' && tradeChain === 'solana');
      if (!isRelevant) return;

      // Track in ref so REST fetches don't discard it
      if (trade.id && !pendingWsTradesRef.current.some((t: any) => t.id === trade.id)) {
        pendingWsTradesRef.current.push({ ...trade, _wsTimestamp: Date.now() });
        if (pendingWsTradesRef.current.length > 20) pendingWsTradesRef.current.splice(0, pendingWsTradesRef.current.length - 20);
      }

      // Prepend to tradeActivity (Activity tab) — deduplicate by id
      setTradeActivity((prev) => {
        if (trade.id && prev.some((t: any) => t.id === trade.id)) return prev;
        const updated = [trade, ...prev];
        try {
          window.localStorage.setItem(
            tradeActivityCacheKey,
            JSON.stringify({ data: updated, timestamp: Date.now() })
          );
        } catch {}
        return updated;
      });

      // Prepend to tradeHistory (Trade History tab + PNL metrics) — deduplicate by id
      setTradeHistory((prev) => {
        if (trade.id && prev.some((t: any) => t.id === trade.id)) return prev;
        const updated = [trade, ...prev];
        try {
          window.localStorage.setItem(
            tradeHistoryCacheKey,
            JSON.stringify({ data: updated, timestamp: Date.now() })
          );
        } catch {}
        return updated;
      });
    };
    window.addEventListener('solanaNewTrade', handleNewTrade);

    // Listen for WS activity snapshot — instant Activity tab data on connection
    const handleActivitySnapshot = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.activity || !Array.isArray(detail.activity) || detail.activity.length === 0) return;

      const expectedBC = currentChain === 'monad' ? 'monad' : currentChain === 'sol' ? 'solana' : 'all';
      if (detail.blockchain !== expectedBC) return;

      // Only apply if activity hasn't loaded via REST yet
      if (activityLoadedRef.current) return;

      isDev && console.log(`[Portfolio] WS activity snapshot: ${detail.activity.length} trades`);
      const filteredActivity = detail.activity.filter(isTradeOnCurrentChain);
      setTradeActivity(filteredActivity);
      setLoadingTradeActivity(false);
      activityLoadedRef.current = true;

      try {
        window.localStorage.setItem(tradeActivityCacheKey, JSON.stringify({
          data: filteredActivity,
          timestamp: Date.now(),
        }));
      } catch {}
    };
    window.addEventListener('solanaActivitySnapshot', handleActivitySnapshot);

    // Refresh all data when WS reconnects (may have missed updates while disconnected)
    const handleWsReconnected = () => {
      setTradeRefreshCounter((c) => c + 1);
      refreshBalance({ chain: currentChain === 'monad' ? 'monad' : 'sol', force: true }).catch(() => {});
    };
    window.addEventListener('solanaWsReconnected', handleWsReconnected);

    return () => {
      window.removeEventListener(TRADE_COMPLETED_EVENT, handleTradeCompleted);
      window.removeEventListener('solanaPositionsChanged', handlePositionsChanged);
      window.removeEventListener('solanaPositionUpdate', handlePositionUpdate);
      window.removeEventListener('solanaNewTrade', handleNewTrade);
      window.removeEventListener('solanaActivitySnapshot', handleActivitySnapshot);
      window.removeEventListener('solanaWsReconnected', handleWsReconnected);
    };
  }, [currentChain, refreshBalance, tradeActivityCacheKey, tradeHistoryCacheKey, isTradeOnCurrentChain, requestSnapshot, wp.refetch]);

  // Note: Initial balance is set once when first detected and persists
  // It does NOT auto-reset to prevent wallet balance change from going to 0

  // Get unique token addresses from active positions for live price fetching
  const activeTokenAddresses = useMemo(() => {
    return Array.from(
      new Set(
        positions
          .filter((pos) => pos.remaining > 0)
          .map((pos) => pos.tokenAddress)
          .filter(Boolean)
      )
    );
  }, [positions]);

  // Get wallet address for current chain
  const walletAddress = useMemo(() => {
    if (currentChain === 'monad') {
      return primaryWalletAddresses?.ethereum || user?.publicKey || null;
    }
    return primaryWalletAddresses?.solana || user?.publicKey || null;
  }, [currentChain, primaryWalletAddresses, user?.publicKey]);

  // Build live prices from backend position data (currentPrice comes from Go token-service)
  const livePrices = useMemo(() => {
    const priceMap: Record<string, number> = {};
    positions.forEach((pos) => {
      if (pos.currentPrice && pos.currentPrice > 0) {
        priceMap[pos.tokenAddress] = pos.currentPrice;
      }
    });
    return priceMap;
  }, [positions]);

  // Fetch actual token balances from wallet (real blockchain state)
  const { balances: actualBalances } = useWalletTokenBalances(
    walletAddress,
    activeTokenAddresses,
    {
      enabled: activeTokenAddresses.length > 0 && !!walletAddress,
      refreshInterval: 3000, // Update every 3 seconds for faster updates
      chain: currentChain,
    }
  );

  // Load persisted data on mount or chain change
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Reset chain-scoped refs/state when switching chains to avoid cross-chain bleed
    initialNativeBalanceRef.current = null;
    setBalanceHistory([]);
    previousBalancesRef.current = {};
    cumulativeRealizedPnlRef.current = 0;

    const storageKeys = getStorageKeys();
    
    try {
      // Load previous balances from localStorage
      const savedBalances = localStorage.getItem(storageKeys.previousBalances);
      if (savedBalances) {
        previousBalancesRef.current = JSON.parse(savedBalances);
        isDev && console.log("📊 Loaded previous balances from localStorage:", previousBalancesRef.current);
      }
      
      // Load cumulative realized PNL
      const savedCumulative = localStorage.getItem(storageKeys.cumulativeRealizedPnl);
      if (savedCumulative) {
        cumulativeRealizedPnlRef.current = parseFloat(savedCumulative) || 0;
        isDev && console.log("📊 Loaded cumulative realized PNL:", cumulativeRealizedPnlRef.current);
      }
      
      // Load initial native balance
      const savedInitialBalance = localStorage.getItem(storageKeys.initialNativeBalance);
      if (savedInitialBalance) {
        initialNativeBalanceRef.current = parseFloat(savedInitialBalance);
        isDev && console.log("📊 Loaded initial native balance:", initialNativeBalanceRef.current, currentChain === "monad" ? "MON" : "SOL");
      }
    } catch (error) {
      console.error("Error loading persisted data:", error);
    }
  }, [user?.id, currentChain]);

  // Initialize previous balances when positions are loaded (before actual balances come in)
  useEffect(() => {
    if (positions.length > 0) {
      // Only initialize if we don't have saved data
      if (Object.keys(previousBalancesRef.current).length === 0) {
        // Initialize with positions' remaining amounts as baseline
        positions.forEach(pos => {
          if (pos.tokenAddress && pos.remaining > 0) {
            previousBalancesRef.current[pos.tokenAddress] = pos.remaining;
          }
        });
        isDev && console.log("📊 Initialized previous balances from positions:", previousBalancesRef.current);
        
        // Save to localStorage
        try {
          const storageKeys = getStorageKeys();
          localStorage.setItem(storageKeys.previousBalances, JSON.stringify(previousBalancesRef.current));
        } catch (error) {
          console.error("Error saving previous balances:", error);
        }
      }
    }
  }, [positions, user?.id, currentChain]);

  // Reset balance change metrics when switching chains to avoid cross-chain bleed
  useEffect(() => {
    setActualBalanceChangePnl(0);
    setActualBalanceChangePnlPercentage(0);
    setActualBalanceChangeNative(0);
    setActualBalanceChangeNativePercentage(0);
    setBalanceHistory([]);
  }, [currentChain]);

  // Update previous balances when actual balances come in - but ONLY if we don't have a saved value
  useEffect(() => {
    if (Object.keys(actualBalances).length > 0) {
      let updated = false;
      
      // Update balances that exist, but keep previous values for comparison
      Object.keys(actualBalances).forEach(tokenAddress => {
        if (previousBalancesRef.current[tokenAddress] === undefined) {
          // New token we're tracking, initialize with current balance
          previousBalancesRef.current[tokenAddress] = actualBalances[tokenAddress];
          updated = true;
        }
      });
      
      // Save to localStorage if updated
      if (updated) {
        try {
          const storageKeys = getStorageKeys();
          localStorage.setItem(storageKeys.previousBalances, JSON.stringify(previousBalancesRef.current));
        } catch (error) {
          console.error("Error saving previous balances:", error);
        }
      }
    }
  }, [actualBalances, user?.id, currentChain]);

  useEffect(() => {
    if (positions.length > 0) {
      // Add validation to prevent extreme values
      const validPositions = positions.filter(
        (pos) =>
          pos.remaining > 0 && // Only include positions with remaining balance > 0
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

        // Get actual balance from wallet (real blockchain state)
        const actualBalance = actualBalances[pos.tokenAddress] ?? null;
        const actualRemaining = actualBalance !== null ? actualBalance : correctedRemaining;
        
        // Use actual balance if available, otherwise use backend-reported balance
        const remainingToUse = actualRemaining;
        
        // Use live price if available, otherwise use corrected remaining value
        const currentPrice = livePrices[pos.tokenAddress] || 0;
        const liveRemainingValue = currentPrice > 0 
          ? remainingToUse * currentPrice 
          : (actualBalance !== null && correctedBought > 0) 
            ? (remainingToUse * (pos.boughtUsdValue / correctedBought)) // Use average buy price
            : correctedRemainingUsdValue;

        // Recalculate PnL using actual balances and live prices
        const correctedPnl =
          correctedSoldUsdValue + liveRemainingValue - pos.boughtUsdValue;
        const correctedPnlPercentage =
          pos.boughtUsdValue > 0 ? (correctedPnl / pos.boughtUsdValue) * 100 : 0;

        return {
          ...pos,
          sold: correctedSold,
          remaining: correctedRemaining,
          soldUsdValue: correctedSoldUsdValue,
          remainingUsdValue: liveRemainingValue, // Use live value
          pnl: correctedPnl,
          pnlPercentage: correctedPnlPercentage,
        };
      });

      const totalUnrealizedPnl = correctedPositions.reduce((acc, pos) => acc + pos.pnl, 0);
      const totalRemainingValue = correctedPositions.reduce(
        (acc, pos) => acc + pos.remainingUsdValue,
        0,
      );
      const totalBoughtValue = correctedPositions.reduce(
        (acc, pos) => acc + pos.boughtUsdValue,
        0,
      );
      setUnrealizedPnl(totalUnrealizedPnl);
      setUnrealizedPnlPercentage(
        totalBoughtValue ? (totalUnrealizedPnl / totalBoughtValue) * 100 : 0,
      );
      // Use appropriate balance based on current chain
      // For Monad: convert MON to USD, for Solana: solBalance is already in USD
      const currentBalanceUsd = currentChain === 'monad'
        ? monBalance * (monPrice || 0.025) // Convert MON to USD using MON price
        : solBalance; // solBalance is already in USD
      setTotalValue(currentBalanceUsd + totalRemainingValue);

      // Create top 100 positions sorted by corrected USD value
      const sortedByUsdValue = [...correctedPositions].sort((a, b) => {
        return b.remainingUsdValue - a.remainingUsdValue;
      });
      setTop100Positions(sortedByUsdValue.slice(0, 100));
    } else {
      // Reset values when no positions. Top 100 must also reset here —
      // otherwise it retains its last-non-empty snapshot when the user sells
      // their final position, causing the Top 100 tab to show stale rows
      // (e.g., a just-sold token still appearing as the sole entry).
      setUnrealizedPnl(0);
      setUnrealizedPnlPercentage(0);
      setTotalPnl(0);
      setTotalPnlPercentage(0);
      setTop100Positions([]);
    }
  }, [positions, solBalance, monBalance, currentChain, monPrice, livePrices, actualBalances]);

  // Search filtering using useMemo for better performance and reactivity
  const filteredPositions = useMemo(() => {
    if (!searchQuery.trim()) {
      return positions;
    }
    const query = searchQuery.toLowerCase().trim();
    return positions.filter((pos) => {
      const tokenAddr = pos.tokenAddress?.toLowerCase() || "";
      const pairAddr = pos.pairAddress?.toLowerCase() || "";
      const posName = pos.tokenName?.toLowerCase() || "";
      const posSymbol = pos.tokenSymbol?.toLowerCase() || "";

      // Check token name from tokenNames mapping (async fallback)
      const tokenName = tokenNames[pos.tokenAddress]?.toLowerCase() || "";

      // Check token metadata (name and symbol) from cache (async fallback)
      const metadata = tokenMetadataCache[pos.tokenAddress];
      const metadataName = metadata?.name?.toLowerCase() || "";
      const metadataSymbol = metadata?.symbol?.toLowerCase() || "";

      return (
        tokenAddr.includes(query) ||
        pairAddr.includes(query) ||
        posName.includes(query) ||
        posSymbol.includes(query) ||
        tokenName.includes(query) ||
        metadataName.includes(query) ||
        metadataSymbol.includes(query)
      );
    });
  }, [searchQuery, positions, tokenNames, tokenMetadataCache]);

  const filteredTop100Positions = useMemo(() => {
    if (!searchQuery.trim()) {
      // Reverse so newest positions appear at the top
      return [...top100Positions].reverse();
    }
    const query = searchQuery.toLowerCase().trim();
    return top100Positions.filter((pos) => {
      const tokenAddr = pos.tokenAddress?.toLowerCase() || "";
      const pairAddr = pos.pairAddress?.toLowerCase() || "";
      const posName = pos.tokenName?.toLowerCase() || "";
      const posSymbol = pos.tokenSymbol?.toLowerCase() || "";

      // Check token name from tokenNames mapping (async fallback)
      const tokenName = tokenNames[pos.tokenAddress]?.toLowerCase() || "";

      // Check token metadata (name and symbol) from cache (async fallback)
      const metadata = tokenMetadataCache[pos.tokenAddress];
      const metadataName = metadata?.name?.toLowerCase() || "";
      const metadataSymbol = metadata?.symbol?.toLowerCase() || "";

      return (
        tokenAddr.includes(query) ||
        pairAddr.includes(query) ||
        posName.includes(query) ||
        posSymbol.includes(query) ||
        tokenName.includes(query) ||
        metadataName.includes(query) ||
        metadataSymbol.includes(query)
      );
    });
  }, [searchQuery, top100Positions, tokenNames, tokenMetadataCache]);

  const filteredTradeHistory = useMemo(() => {
    if (!searchQuery.trim()) {
      return tradeHistory;
    }
    const query = searchQuery.toLowerCase().trim();
    return tradeHistory.filter((trade) => {
      const tokenAddr = trade.tokenAddress?.toLowerCase() || "";
      const txHash = trade.transactionHash?.toLowerCase() || "";
      const tradeName = trade.tokenName?.toLowerCase() || "";
      const tradeSymbol = trade.tokenSymbol?.toLowerCase() || "";

      // Check token name from tokenNames mapping (async fallback)
      const tokenName = tokenNames[trade.tokenAddress]?.toLowerCase() || "";

      // Check token metadata (name and symbol) from cache (async fallback)
      const metadata = tokenMetadataCache[trade.tokenAddress];
      const metadataName = metadata?.name?.toLowerCase() || "";
      const metadataSymbol = metadata?.symbol?.toLowerCase() || "";

      return (
        tokenAddr.includes(query) ||
        txHash.includes(query) ||
        tradeName.includes(query) ||
        tradeSymbol.includes(query) ||
        tokenName.includes(query) ||
        metadataName.includes(query) ||
        metadataSymbol.includes(query)
      );
    });
  }, [searchQuery, tradeHistory, tokenNames, tokenMetadataCache]);

  // Adapt chain-derived trades (from token-service /v1/wallet/:addr/trades) into
  // the legacy TradeRow shape that <Activity> renders. Enrich with cached token
  // metadata where available (name, symbol, image). Adapter leaves PnL fields
  // undefined since chain rows don't contain matched buy/sell pairs.
  const chainTradeActivity = useMemo(() => {
    if (currentChain !== "sol" || !wt.trades || wt.trades.length === 0) return [];
    return wt.trades.map((t) =>
      walletPortfolioTradeToTradeRow(t, tokenMetadataCache[t.token_mint]),
    );
  }, [wt.trades, currentChain, tokenMetadataCache]);

  const filteredTradeActivity = useMemo(() => {
    // Source selection:
    //   - Solana + chain trades available (index built, wallet has trades): use chain-derived (full history including off-platform).
    //   - Solana but indexing/empty: fall back to on-platform tradeActivity filtered by primary wallet.
    //   - Monad: existing user-aggregate tradeActivity (no per-wallet scope on Monad yet).
    const useChainSource =
      currentChain === "sol" && !wt.isIndexing && chainTradeActivity.length > 0;

    const baseTrades: TradeRow[] = useChainSource
      ? chainTradeActivity
      : (() => {
          if (currentChain !== "sol" || !primarySolAddr) return tradeActivity;
          return tradeActivity.filter((trade) => {
            const candidates = [
              trade.walletAddress,
              trade.wallet,
              trade.userWalletAddress,
              trade.userWallet,
              trade.fromAddress,
            ];
            return candidates.some((c) => c && c === primarySolAddr);
          });
        })();

    if (!searchQuery.trim()) {
      return baseTrades;
    }
    const query = searchQuery.toLowerCase().trim();
    return baseTrades.filter((trade) => {
      const tokenAddr = trade.tokenAddress?.toLowerCase() || "";
      const txHash = trade.transactionHash?.toLowerCase() || "";
      const tradeName = trade.tokenName?.toLowerCase() || "";
      const tradeSymbol = trade.tokenSymbol?.toLowerCase() || "";

      // Check token name from tokenNames mapping (async fallback)
      const tokenName = tokenNames[trade.tokenAddress]?.toLowerCase() || "";

      // Check token metadata (name and symbol) from cache (async fallback)
      const metadata = tokenMetadataCache[trade.tokenAddress];
      const metadataName = metadata?.name?.toLowerCase() || "";
      const metadataSymbol = metadata?.symbol?.toLowerCase() || "";

      return (
        tokenAddr.includes(query) ||
        txHash.includes(query) ||
        tradeName.includes(query) ||
        tradeSymbol.includes(query) ||
        tokenName.includes(query) ||
        metadataName.includes(query) ||
        metadataSymbol.includes(query)
      );
    });
  }, [
    searchQuery,
    tradeActivity,
    chainTradeActivity,
    wt.isIndexing,
    tokenNames,
    tokenMetadataCache,
    currentChain,
    primarySolAddr,
  ]);

  // Calculate metrics based on selected timeframe
  useEffect(() => {
    const calculateTimeframeMetrics = () => {
      const currentTime = Date.now();
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
        timeframeDays === Infinity ? 0 : currentTime - timeframeDays * 24 * 60 * 60 * 1000;

      // Calculate winning and losing trades based on positions
      let winningTrades = 0;
      let losingTrades = 0;
      
      // COMPREHENSIVE REALIZED PNL CALCULATION
      // Calculate from multiple sources: balance changes, trade history, and backend data
      let totalRealizedPnl = 0;
      const salesDetected: Array<{
        tokenAddress: string;
        soldAmount: number;
        salePrice: number;
        costBasis: number;
        realizedPnl: number;
        source: string;
        timestamp: number;
        tokenSymbol: string;
        tokenName: string;
      }> = [];
      
      // 1. Calculate from TRADE HISTORY (most accurate - actual sell transactions)
      // Normalize token addresses for matching (case-insensitive)
      const normalizeAddress = (addr: string | undefined) => {
        if (!addr) return '';
        return addr.toLowerCase().trim();
      };

      // Parse trade timestamp safely — tradeTime is a time-only column ("14:30:00")
      // which produces NaN from new Date(). Use createdAt (full datetime) as primary.
      const parseTradeTimestamp = (trade: { tradeTime?: string; createdAt?: string }) => {
        let t = new Date(trade.createdAt || '').getTime();
        if (!isNaN(t)) return t;
        t = new Date(trade.tradeTime || '').getTime();
        if (!isNaN(t)) return t;
        return Date.now();
      };

      // Filter out split trades (multi-wallet children) to avoid double-counting in PnL
      const nonSplitTrades = tradeHistory.filter(t => !t.isSplitTrade);

      const sellTrades = nonSplitTrades.filter(t => {
        const type = t.type?.toLowerCase();
        return type === "sell" || type === "s";
      });

      const buyTradesByToken = new Map<string, Array<{
        amount: number;
        usdValue: number;
        pricePerToken: number; // Price per token for accurate cost basis
        timestamp: number;
        tradeId: string;
        consumed: number; // Track how much of this buy has been used
      }>>();

      // Group buys by token (normalized address)
      nonSplitTrades.filter(t => {
        const type = t.type?.toLowerCase();
        return type === "buy" || type === "b";
      }).forEach(buy => {
        const tokenAddress = normalizeAddress(buy.tokenAddress);
        if (!tokenAddress) return;
        
        const tokenAmount = typeof buy.tokenAmount === 'string' ? parseFloat(buy.tokenAmount) : (buy.tokenAmount || 0);
        const usdValue = typeof buy.usdValue === 'string' ? parseFloat(buy.usdValue) : (buy.usdValue || 0);
        const timestamp = parseTradeTimestamp(buy);
        const tradeId = buy.transactionHash || `${buy.tokenAddress}_${timestamp}`;
        
        if (tokenAmount > 0 && usdValue > 0) {
          if (!buyTradesByToken.has(tokenAddress)) {
            buyTradesByToken.set(tokenAddress, []);
          }
          // Use stored pricePerToken if available, otherwise calculate
          const pricePerToken = buy.pricePerToken || (usdValue / tokenAmount);
          buyTradesByToken.get(tokenAddress)!.push({ 
            amount: tokenAmount, 
            usdValue,
            pricePerToken, // Store price per token for accurate cost basis calculation
            timestamp,
            tradeId,
            consumed: 0,
          });
        }
      });
      
      // Sort all buys by timestamp (oldest first for FIFO)
      buyTradesByToken.forEach((buys, tokenAddress) => {
        buys.sort((a, b) => a.timestamp - b.timestamp);
      });
      
      // Track which trades we've already counted (to avoid double-counting)
      const processedSellTrades = new Set<string>();
      
      // Calculate realized PNL from sell trades
      // PRIORITY: Use stored realizedPnl from database if available (more accurate)
      sellTrades.forEach(sell => {
        const tokenAddress = normalizeAddress(sell.tokenAddress);
        if (!tokenAddress) return;
        
        const tradeId = sell.transactionHash || `${sell.tokenAddress}_${parseTradeTimestamp(sell)}`;
        
        // Skip if already processed
        if (processedSellTrades.has(tradeId)) return;
        processedSellTrades.add(tradeId);
        
        const soldAmount = typeof sell.tokenAmount === 'string' ? parseFloat(sell.tokenAmount) : (sell.tokenAmount || 0);
        const saleValueUsd = typeof sell.usdValue === 'string' ? parseFloat(sell.usdValue) : (sell.usdValue || 0);

        // Check stored PnL first — cleanup sells have usdValue=0 but valid stored PnL
        const storedRealizedPnl = typeof sell.realizedPnl === 'string'
          ? parseFloat(sell.realizedPnl)
          : (sell.realizedPnl != null ? Number(sell.realizedPnl) : null);

        if (soldAmount <= 0) return;
        if (saleValueUsd <= 0 && (storedRealizedPnl === null || isNaN(storedRealizedPnl))) return;
        const storedCostBasis = typeof sell.costBasis === 'string'
          ? parseFloat(sell.costBasis)
          : (sell.costBasis || null);
        
        let saleRealizedPnl: number;
        let totalCostBasis: number;
        
        if (storedRealizedPnl !== null && storedRealizedPnl !== undefined && !isNaN(storedRealizedPnl)) {
          // Use stored values from database (calculated at trade time)
          saleRealizedPnl = storedRealizedPnl;
          totalCostBasis = storedCostBasis || (saleValueUsd - saleRealizedPnl);
          
        } else {
          // Fallback: Calculate using FIFO matching (for older trades without stored PNL)
          const buys = buyTradesByToken.get(tokenAddress) || [];
          if (buys.length === 0) {
            console.warn("⚠️ Sell trade found but no matching buys:", {
              tokenAddress: sell.tokenAddress,
              soldAmount,
              saleValueUsd,
            });
            return;
          }
          
          // Match sold amount with buys (FIFO) - track consumed amounts
          let remainingToSell = soldAmount;
          totalCostBasis = 0;
          
          for (const buy of buys) {
            if (remainingToSell <= 0) break;
            
            const availableFromThisBuy = buy.amount - buy.consumed;
            if (availableFromThisBuy <= 0) continue; // This buy is fully consumed
            
            const buyPricePerToken = buy.pricePerToken || (buy.usdValue / buy.amount);
            const amountFromThisBuy = Math.min(remainingToSell, availableFromThisBuy);
            const costBasisForThisAmount = amountFromThisBuy * buyPricePerToken;
            
            totalCostBasis += costBasisForThisAmount;
            buy.consumed += amountFromThisBuy; // Mark as consumed
            remainingToSell -= amountFromThisBuy;
          }
          
          // If we couldn't match all sold amount, use average buy price as fallback
          if (remainingToSell > 0) {
            const totalBuyAmount = buys.reduce((sum, b) => sum + b.amount, 0);
            const totalBuyValue = buys.reduce((sum, b) => sum + b.usdValue, 0);
            if (totalBuyAmount > 0) {
              const avgBuyPrice = totalBuyValue / totalBuyAmount;
              totalCostBasis += remainingToSell * avgBuyPrice;
              console.warn("⚠️ Partial match for sale, using average buy price for remainder:", {
                tokenAddress: sell.tokenAddress,
                remainingToSell,
                avgBuyPrice,
              });
            }
          }
          
          // Calculate realized PNL for this sale
          saleRealizedPnl = saleValueUsd - totalCostBasis;
          
        }
        
        totalRealizedPnl += saleRealizedPnl;
        
        salesDetected.push({
          tokenAddress: sell.tokenAddress || tokenAddress,
          soldAmount,
          salePrice: saleValueUsd / soldAmount,
          costBasis: totalCostBasis,
          realizedPnl: saleRealizedPnl,
          source: storedRealizedPnl !== null ? 'trade_history_stored' : 'trade_history',
          timestamp: parseTradeTimestamp(sell),
          tokenSymbol: sell.tokenSymbol || '',
          tokenName: sell.tokenName || '',
        });
      });
      
      // 2. Calculate from balance decreases (for recent sales not yet in trade history)
      // This catches sales that happened but aren't in trade history yet
      const allTrackedTokens = new Set([
        ...positions.map(p => normalizeAddress(p.tokenAddress)),
        ...Object.keys(actualBalances).map(addr => normalizeAddress(addr)),
      ]);
      
      allTrackedTokens.forEach((normalizedTokenAddress) => {
        // Find the original token address (for matching)
        const originalTokenAddress = positions.find(p => normalizeAddress(p.tokenAddress) === normalizedTokenAddress)?.tokenAddress 
          || Object.keys(actualBalances).find(addr => normalizeAddress(addr) === normalizedTokenAddress)
          || normalizedTokenAddress;
        
        const currentBalance = actualBalances[originalTokenAddress] ?? actualBalances[normalizedTokenAddress] ?? 0;
        const previousBalance = previousBalancesRef.current[originalTokenAddress] 
          ?? previousBalancesRef.current[normalizedTokenAddress]
          ?? undefined;
        
        // If balance decreased significantly, tokens were sold
        if (previousBalance !== undefined && currentBalance < previousBalance - 0.0001) {
          const soldAmount = previousBalance - currentBalance;
          
          // Check if this sale was already counted from trade history
          const alreadyCounted = salesDetected.some(s => {
            const sAddr = normalizeAddress(s.tokenAddress);
            return (sAddr === normalizedTokenAddress || sAddr === normalizeAddress(originalTokenAddress)) &&
              Math.abs(s.soldAmount - soldAmount) < Math.max(soldAmount * 0.1, 0.0001) && // Allow 10% tolerance
              s.source === 'trade_history';
          });
          
          if (alreadyCounted) {
            // Already counted from trade history, just update balance
            previousBalancesRef.current[originalTokenAddress] = currentBalance;
            previousBalancesRef.current[normalizedTokenAddress] = currentBalance;
            return;
          }
          
          // Find the position to get buy price
          const position = positions.find(p => 
            normalizeAddress(p.tokenAddress) === normalizedTokenAddress || 
            p.tokenAddress === originalTokenAddress
          );
          
          if (position && position.bought > 0 && position.boughtUsdValue > 0) {
            const avgBuyPrice = position.boughtUsdValue / position.bought;
            const currentPrice = livePrices[originalTokenAddress] || livePrices[normalizedTokenAddress] || 0;
            let salePrice = currentPrice;
            
            // Try to get sale price from position data
            if (salePrice <= 0 && position.soldUsdValue > 0 && position.sold > 0) {
              salePrice = position.soldUsdValue / position.sold;
            }
            
            // If still no price, try to estimate from recent trade history
            if (salePrice <= 0) {
              const recentSells = sellTrades
                .filter(s => normalizeAddress(s.tokenAddress) === normalizedTokenAddress)
                .sort((a, b) => {
                  const aTime = parseTradeTimestamp(a);
                  const bTime = parseTradeTimestamp(b);
                  return bTime - aTime; // Most recent first
                });
              
              if (recentSells.length > 0) {
                const recentSell = recentSells[0];
                const recentSoldAmount = typeof recentSell.tokenAmount === 'string' 
                  ? parseFloat(recentSell.tokenAmount) 
                  : (recentSell.tokenAmount || 0);
                const recentSaleValue = typeof recentSell.usdValue === 'string' 
                  ? parseFloat(recentSell.usdValue) 
                  : (recentSell.usdValue || 0);
                
                if (recentSoldAmount > 0) {
                  salePrice = recentSaleValue / recentSoldAmount;
                }
              }
            }
            
            // Last resort: use buy price (break-even assumption)
            if (salePrice <= 0) {
              salePrice = avgBuyPrice;
            }
            
            const saleValueUsd = soldAmount * salePrice;
            const costBasisOfSold = soldAmount * avgBuyPrice;
            const saleRealizedPnl = saleValueUsd - costBasisOfSold;
            
            totalRealizedPnl += saleRealizedPnl;
            
            salesDetected.push({
              tokenAddress: originalTokenAddress,
              soldAmount,
              salePrice,
              costBasis: costBasisOfSold,
              realizedPnl: saleRealizedPnl,
              source: 'balance_change',
              timestamp: Date.now(),
              tokenSymbol: position?.tokenSymbol || tokenNames[originalTokenAddress] || '',
              tokenName: position?.tokenName || '',
            });
            
          } else {
            // No position found - might be fully sold, try to find in trade history
            isDev && console.log("⚠️ Balance decreased but no position found:", {
              tokenAddress: originalTokenAddress,
              normalizedTokenAddress,
              previousBalance,
              currentBalance,
              soldAmount,
            });
          }
        }
        
        // Always update previous balance for next check (even if no sale detected)
        previousBalancesRef.current[originalTokenAddress] = currentBalance;
        previousBalancesRef.current[normalizedTokenAddress] = currentBalance;
      });
      
      // Save updated balances to localStorage
      try {
        const storageKeys = getStorageKeys();
        localStorage.setItem(storageKeys.previousBalances, JSON.stringify(previousBalancesRef.current));
      } catch (error) {
        console.error("Error saving previous balances:", error);
      }
      
      // 3. Calculate from backend-reported sales (for positions with sold > 0)
      // Only count if not already counted from trade history or balance changes
      positions.forEach((pos) => {
        if (pos.sold > 0 && pos.bought > 0 && pos.boughtUsdValue > 0) {
          // Check if already counted
          const alreadyCounted = salesDetected.some(s =>
            s.tokenAddress === pos.tokenAddress &&
            (s.source === 'trade_history' || s.source === 'trade_history_stored' || s.source === 'balance_change')
          );
          
          if (alreadyCounted) return;
          
          const avgBuyPrice = pos.boughtUsdValue / pos.bought;
          const costBasisOfSold = pos.sold * avgBuyPrice;
          const saleValueUsd = pos.soldUsdValue || (pos.sold * (livePrices[pos.tokenAddress] || avgBuyPrice));
          const saleRealizedPnl = saleValueUsd - costBasisOfSold;
          
          totalRealizedPnl += saleRealizedPnl;
          
          salesDetected.push({
            tokenAddress: pos.tokenAddress,
            soldAmount: pos.sold,
            salePrice: saleValueUsd / pos.sold,
            costBasis: costBasisOfSold,
            realizedPnl: saleRealizedPnl,
            source: 'backend',
            timestamp: Date.now(),
            tokenSymbol: pos.tokenSymbol || '',
            tokenName: pos.tokenName || '',
          });
          
        }
      });

      // Build PNL chart data from salesDetected (same array that produced totalRealizedPnl)
      const filteredSales = salesDetected.filter(s => s.timestamp >= cutoffTime);
      if (filteredSales.length > 0) {
        const sorted = [...filteredSales].sort((a, b) => a.timestamp - b.timestamp);
        let cumulative = 0;
        const chartPoints: PnlChartDataPoint[] = [];
        const firstDate = new Date(sorted[0].timestamp);
        chartPoints.push({
          time: firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          date: 'Start', cumulativePnl: 0, tradePnl: 0,
          tokenSymbol: '', tokenName: '', index: 0,
        });
        sorted.forEach((sale, i) => {
          const tradeDate = new Date(sale.timestamp);
          const timeLabel = tradeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const dateLabel = timeLabel + ', ' + tradeDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          cumulative += sale.realizedPnl;
          chartPoints.push({
            time: timeLabel, date: dateLabel,
            cumulativePnl: Math.round(cumulative * 1e6) / 1e6,
            tradePnl: Math.round(sale.realizedPnl * 1e6) / 1e6,
            tokenSymbol: sale.tokenSymbol, tokenName: sale.tokenName, index: i + 1,
          });
        });
        setPnlChartData(chartPoints);
      } else {
        setPnlChartData([]);
      }

      // Update cumulative realized PNL (persists across reloads)
      // Store the total calculated from all sources
      cumulativeRealizedPnlRef.current = totalRealizedPnl;
      
      // Save cumulative realized PNL to localStorage
      try {
        const storageKeys = getStorageKeys();
        localStorage.setItem(storageKeys.cumulativeRealizedPnl, totalRealizedPnl.toString());
      } catch (error) {
        console.error("Error saving realized PNL data:", error);
      }

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
      
      // Calculate total PNL (realized + unrealized)
      const totalPnlForTimeframe = totalRealizedPnl + unrealizedPnlForTimeframe;
      
      // Calculate total cost basis (for percentage calculation)
      // For REALIZED PNL percentage, use cost basis of SOLD tokens only (not all buys)
      // This gives accurate percentage: realizedPnl / costBasisOfSoldTokens
      const totalCostBasisOfSoldTokens = salesDetected.reduce((acc, sale) => acc + (sale.costBasis || 0), 0);
      
      // For TOTAL PNL percentage, use all buy trades (includes unrealized positions)
      const totalCostBasisFromTrades = nonSplitTrades
        .filter(t => t.type === "Buy")
        .reduce((acc, buy) => {
          const usdValue = typeof buy.usdValue === 'string' ? parseFloat(buy.usdValue) : buy.usdValue;
          return acc + (usdValue || 0);
        }, 0);
      
      const totalCostBasisFromPositions = positions.reduce((acc, pos) => acc + (pos.boughtUsdValue || 0), 0);
      const totalCostBasis = Math.max(totalCostBasisFromTrades, totalCostBasisFromPositions);
      
      const totalPnlPercentageForTimeframe = totalCostBasis > 0 
        ? (totalPnlForTimeframe / totalCostBasis) * 100 
        : 0;
      
      // Calculate realized PNL percentage using cost basis of SOLD tokens only
      // This is the correct way: realizedPnl / costBasisOfSoldTokens
      const realizedPnlPercentage = totalCostBasisOfSoldTokens > 0 
        ? (totalRealizedPnl / totalCostBasisOfSoldTokens) * 100 
        : 0;

      setTimeframeMetrics({
        unrealizedPnl: unrealizedPnlForTimeframe,
        realizedPnl: totalRealizedPnl,
        realizedPnlPercentage: realizedPnlPercentage,
        winningTrades,
        losingTrades,
      });
      
      // Update total PNL state
      setTotalPnl(totalPnlForTimeframe);
      setTotalPnlPercentage(totalPnlPercentageForTimeframe);

      // ROBUST ACTUAL BALANCE CHANGE PNL CALCULATION
      // Formula: Trading PNL = Current Balance - Initial Balance - (Deposits - Withdrawals)
      // This excludes external deposits/withdrawals to show pure trading performance
      const currentNativeBalance = currentChain === 'monad' 
        ? (chainBalances?.monad || 0)
        : (solBalance || 0);
      
      // Use correct price for the chain
      const nativePrice = currentChain === 'monad' ? (monPrice || 0.025) : contextSolPrice;
      
      // Initialize initial balance if not set (first time we see a balance) - per chain
      if (initialNativeBalanceRef.current === null && currentNativeBalance > 0) {
        initialNativeBalanceRef.current = currentNativeBalance;
        const storageKeys = getStorageKeys();
        try {
          localStorage.setItem(storageKeys.initialNativeBalance, currentNativeBalance.toString());
          isDev && console.log("📊 Initialized initial native balance:", currentNativeBalance, currentChain === "monad" ? "MON" : "SOL");
        } catch (error) {
          console.error("Error saving initial balance:", error);
        }
      }
      
      // VALIDATION: Detect if initial balance seems incorrect
      // If current balance is significantly larger than stored initial, it might be wrong
      // This can happen if initial balance was set when balance was very low
      if (initialNativeBalanceRef.current !== null && 
          initialNativeBalanceRef.current > 0 && 
          currentNativeBalance > 0 &&
          currentNativeBalance > initialNativeBalanceRef.current * 10) {
        // Current balance is 10x+ larger than initial - this suggests initial was set incorrectly
        // However, don't auto-update - let user reset manually to avoid false positives
        console.warn("⚠️ Initial balance seems unusually small compared to current balance:", {
          initialBalance: initialNativeBalanceRef.current,
          currentBalance: currentNativeBalance,
          ratio: currentNativeBalance / initialNativeBalanceRef.current,
          recommendation: "Consider resetting initial balance if this seems incorrect",
        });
      }
      
      // Calculate actual balance change PNL
      const storedInitialBalance = initialNativeBalanceRef.current;
      
      if (storedInitialBalance !== null && storedInitialBalance > 0 && user?.bearerToken) {
        // Fetch all transactions to get deposits and withdrawals
        getWithdrawalHistory(user.bearerToken)
          .then((withdrawalData) => {
            // Get all transactions for this chain (both deposits and withdrawals)
            const allChainTransactions = (withdrawalData?.transactions || []).filter((tx: any) => {
              // For withdrawals, check destination address format
              if (tx.destinationAddress) {
                const addr = String(tx.destinationAddress).trim();
                if (currentChain === 'monad') {
                  return addr.startsWith('0x') && addr.length === 42;
                } else {
                  return !addr.startsWith('0x') && addr.length >= 32 && addr.length <= 44;
                }
              }
              // For deposits, include them (they might not have destinationAddress)
              return tx.type === 'deposit';
            });
            
            // Calculate total deposits and withdrawals (completed only)
            let totalDeposits = 0;
            let totalWithdrawals = 0;
            
            allChainTransactions.forEach((tx: any) => {
              if (tx.status !== 'completed') return;
              
              if (tx.type === 'deposit') {
                totalDeposits += Number(tx.amount) || 0;
              } else if (tx.type === 'withdraw' || tx.type === 'withdrawal') {
                totalWithdrawals += Number(tx.amount) || 0;
              }
            });
            
            // ROBUST CALCULATION:
            // Trading PNL = Current Balance - Initial Balance - (Deposits - Withdrawals)
            // 
            // Explanation:
            // - Current Balance = Initial + Deposits - Withdrawals + Trading PNL
            // - Therefore: Trading PNL = Current - Initial - Deposits + Withdrawals
            // - Which simplifies to: Trading PNL = Current - Initial - (Deposits - Withdrawals)
            //
            // Example:
            // - Started with 0.5 MON (initial)
            // - Deposited 0.2 MON (totalDeposits = 0.2)
            // - Withdrew 0.3 MON (totalWithdrawals = 0.3)
            // - Current balance: 0.145 MON
            // - Net Deposits = 0.2 - 0.3 = -0.1 (net withdrawal)
            // - Trading PNL = 0.145 - 0.5 - (-0.1) = 0.145 - 0.5 + 0.1 = -0.255 MON
            // This means you lost 0.255 MON from trading
            
            const netDeposits = totalDeposits - totalWithdrawals; // Positive = money added, negative = money removed
            const tradingBalanceChange = currentNativeBalance - storedInitialBalance - netDeposits;
            
            const tradingBalanceChangeUsd = tradingBalanceChange * nativePrice;
            const storedInitialBalanceUsd = storedInitialBalance * nativePrice;
            
            // Calculate percentage - only show if initial balance is reasonable (>= $1.00 to avoid huge percentages)
            let tradingBalanceChangePercentage = 0;
            if (storedInitialBalanceUsd >= 1.00) {
              tradingBalanceChangePercentage = (tradingBalanceChangeUsd / storedInitialBalanceUsd) * 100;
            } else {
              // If initial balance is too small, percentage will be unreliable - don't show it
              console.warn("⚠️ Initial balance too small for accurate percentage:", {
                initialBalance: storedInitialBalance,
                initialBalanceUsd: storedInitialBalanceUsd,
                threshold: 1.00,
                recommendation: "Reset initial balance or wait until you have more balance",
              });
              tradingBalanceChangePercentage = 0;
            }
            
            setActualBalanceChangePnl(tradingBalanceChangeUsd);
            setActualBalanceChangePnlPercentage(tradingBalanceChangePercentage);
            setActualBalanceChangeNative(tradingBalanceChange); // Store native balance change (MON or SOL)
            
            // Calculate native percentage change - guard against near-zero initial balance
            let nativePercentageChange = 0;
            if (storedInitialBalance > 0 && storedInitialBalanceUsd >= 1.00) {
              nativePercentageChange = (tradingBalanceChange / storedInitialBalance) * 100;
            }
            setActualBalanceChangeNativePercentage(nativePercentageChange);

            // Update balance history for chart
            setBalanceHistory((prev) => {
              const newEntry = {
                timestamp: Date.now(),
                balance: currentNativeBalance,
                balanceChange: tradingBalanceChange,
              };
              const updated = [...prev, newEntry];
              // Keep last 100 data points
              return updated.slice(-100);
            });
            
          })
          .catch((error) => {
            console.error("Failed to fetch transaction history for PNL calculation:", error);
            // Fallback: calculate raw balance change (without deposits/withdrawals adjustment)
            const balanceChange = currentNativeBalance - storedInitialBalance;
            const balanceChangeUsd = balanceChange * nativePrice;
            const storedInitialBalanceUsd = storedInitialBalance * nativePrice;
            
            let balanceChangePercentage = 0;
            if (storedInitialBalanceUsd >= 1.00) {
              balanceChangePercentage = (balanceChangeUsd / storedInitialBalanceUsd) * 100;
            }
            
            setActualBalanceChangePnl(balanceChangeUsd);
            setActualBalanceChangePnlPercentage(balanceChangePercentage);
            setActualBalanceChangeNative(balanceChange); // Store native balance change (MON or SOL)
            
            // Calculate native percentage change - guard against near-zero initial balance
            let nativePercentageChange = 0;
            if (storedInitialBalance > 0 && storedInitialBalanceUsd >= 1.00) {
              nativePercentageChange = (balanceChange / storedInitialBalance) * 100;
            }
            setActualBalanceChangeNativePercentage(nativePercentageChange);

            // Update balance history for chart
            setBalanceHistory((prev) => {
              const newEntry = {
                timestamp: Date.now(),
                balance: currentNativeBalance,
                balanceChange: balanceChange,
              };
              const updated = [...prev, newEntry];
              // Keep last 100 data points
              return updated.slice(-100);
            });
            
          });
      } else if (storedInitialBalance === null && currentNativeBalance > 0) {
        // No stored initial balance - initialize with current balance (first time user)
        initialNativeBalanceRef.current = currentNativeBalance;
        const storageKeys = getStorageKeys();
        try {
          localStorage.setItem(storageKeys.initialNativeBalance, currentNativeBalance.toString());
          isDev && console.log("📊 Initialized initial native balance (first time):", currentNativeBalance);
        } catch (error) {
          console.error("Error saving initial balance:", error);
        }
        setActualBalanceChangePnl(0);
        setActualBalanceChangePnlPercentage(0);
        setActualBalanceChangeNative(0);
        setActualBalanceChangeNativePercentage(0);
      } else {
        setActualBalanceChangePnl(0);
        setActualBalanceChangePnlPercentage(0);
        setActualBalanceChangeNative(0);
        setActualBalanceChangeNativePercentage(0);
      }

      setPerformanceBreakdown({
        above500,
        between200And500,
        between0And200,
        between0AndMinus50,
        belowMinus50,
      });

    };

    calculateTimeframeMetrics();
  }, [selectedTimeframe, tradeHistory, positions, unrealizedPnl, actualBalances, livePrices, user?.id, user?.bearerToken, currentChain, chainBalances, solBalance, contextSolPrice, monPrice]);


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
      ["Total PnL", totalPnl],
      ["Total PnL %", `${totalPnlPercentage >= 0 ? "+" : ""}${totalPnlPercentage.toFixed(2)}%`],
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

  // Sync local wallets state from centralized context to prevent duplicate fetches
  // Portfolio keeps its own state for local operations (editing, etc.)
  useEffect(() => {
    if (contextWalletList.length > 0) {
      const mappedWallets: UserWallet[] = contextWalletList.map((w: any, index: number) =>
        normalizeWalletFromApi(w, index)
      );
      setWallets(mappedWallets);
      return;
    }

    if (!walletListLoading && user?.id) {
      // Context is empty but not loading and user is logged in - clear wallets
      setWallets([]);
    }
  }, [contextWalletList, walletListLoading, user?.id]);

  // Wrapper to refresh wallets using centralized function
  const fetchWallets = useCallback(async () => {
    if (!user?.id) {
      setWallets([]);
      return;
    }
    // Use centralized refresh with force to bypass debounce
    await refreshWalletList(true);
  }, [user?.id, refreshWalletList]);

  // Refresh all wallet balances for the current chain using batch endpoint
  useEffect(() => {
    if (!user || wallets.length === 0) {
      return;
    }

    let cancelled = false;

    // Refresh all wallets using the batch endpoint
    const refreshAllWalletBalances = async (forceRefresh = false) => {
      // Prepare wallet addresses for batch fetch
      const walletAddresses = wallets
        .map((wallet) => getAddressForChain(wallet, currentChain))
        .filter((address): address is string => Boolean(address));

      if (walletAddresses.length === 0) return;

      // Use the batch endpoint via UserContext
      // This will update contextWalletBalances, which the sync effect below will react to
      await refreshAllBalances(
        walletAddresses.map((address) => ({
          address,
          chain: currentChain,
        })),
        forceRefresh,
      );

      // Note: Don't try to sync immediately here - React state updates are async
      // The useEffect below (lines 1927-1951) will properly sync from contextWalletBalances
      // when it updates, ensuring we always have the latest values

      // Reset force flag after refresh
      forceBalanceRefreshRef.current = false;
    };

    // Check if this is a forced refresh
    const shouldForce = forceBalanceRefreshRef.current;

    // Refresh immediately
    refreshAllWalletBalances(shouldForce);

    // Set up interval to refresh all wallets periodically (30 seconds instead of 12)
    const interval = setInterval(() => refreshAllWalletBalances(false), 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // Note: contextWalletBalances is intentionally NOT in dependencies
    // We don't want to re-fetch when balances update - the sync effect below handles that
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, wallets, currentChain, refreshAllBalances]);

  // REMOVED: fetchWallets() on mount - context handles initial fetch
  // Wallets sync automatically from contextWalletList effect above

  // Sync local walletBalances from UserContext whenever contextWalletBalances changes
  useEffect(() => {
    if (!wallets.length || Object.keys(contextWalletBalances).length === 0) return;

    setWalletBalances(prev => {
      const updated = { ...prev };
      let hasChanges = false;

      for (const wallet of wallets) {
        const address = getAddressForChain(wallet, currentChain);

        if (address && contextWalletBalances[address] !== undefined) {
          if (updated[wallet.id] !== contextWalletBalances[address]) {
            updated[wallet.id] = contextWalletBalances[address];
            hasChanges = true;
          }
        }
      }

      return hasChanges ? updated : prev;
    });
  }, [wallets, currentChain, contextWalletBalances]);

  // Listen for wallet updates to trigger balance refresh
  // UserContext handles wallet list refresh with debouncing
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleWalletsUpdated = () => {
      isDev && console.log("🔄 Wallets updated event - forcing balance refresh");
      forceBalanceRefreshRef.current = true;
    };

    window.addEventListener("wallets-updated", handleWalletsUpdated);

    return () => {
      window.removeEventListener("wallets-updated", handleWalletsUpdated);
    };
  }, []);

  // Filter wallets based on search query and archived status
  const filteredWallets = useMemo(() => {
    return wallets
      .filter((w) => {
        // Hide wallets that don't have an address for the current chain
        const addrForChain = getAddressForChain(w, currentChain);
        if (!addrForChain) return false;

        // Filter by archived status
        if (!showHidden && w.isArchived) return false;
        
        // Filter by search query
        if (walletSearchQuery.trim()) {
          const query = walletSearchQuery.toLowerCase().trim();
          const label = (w.label || "").toLowerCase();
          const solanaAddr = (w.solanaAddress || "").toLowerCase();
          const ethereumAddr = (w.ethereumAddress || "").toLowerCase();
          const address = (w.address || "").toLowerCase();
          const displayAddr = addrForChain.toLowerCase();
          
          return (
            label.includes(query) ||
            solanaAddr.includes(query) ||
            ethereumAddr.includes(query) ||
            address.includes(query) ||
            displayAddr.includes(query)
          );
        }
        
        return true;
      });
  }, [wallets, showHidden, walletSearchQuery, currentChain]);

  const selectedSolWalletIds = selectedWalletIds?.sol || [];
  const selectedSolSet = useMemo(() => new Set(selectedSolWalletIds), [selectedSolWalletIds]);
  const selectedMonWalletIds = selectedWalletIds?.monad || [];
  const selectedMonSet = useMemo(() => new Set(selectedMonWalletIds), [selectedMonWalletIds]);
  const isAllSolSelected = currentChain === "sol" && filteredWallets.length > 0 && selectedSolSet.size === filteredWallets.length;
  const isAllMonSelected = currentChain === "monad" && filteredWallets.length > 0 && selectedMonSet.size === filteredWallets.length;

  const handleRedistributeFunds = async (mode: "split" | "consolidate") => {
    if (!user?.bearerToken) {
      toast.error("Please log in first");
      return;
    }
    const ids = currentChain === "sol" ? selectedSolWalletIds : selectedMonWalletIds;
    if (!ids || ids.length === 0) {
      toast.error("Select at least one wallet first");
      return;
    }

    setRedistributing(true);
    try {
      const response = await redistributeWalletFunds(
        { chain: currentChain as "sol" | "monad", mode, walletIds: ids },
        user.bearerToken
      );

      const { summary, results } = response || {};
      if (mode === "consolidate") {
        const sentFrom =
          results
            ?.filter((r) => r.status === "sent" && r.from)
            .map((r) => r.from)
            .filter(Boolean) || [];
        const uniqueFrom = Array.from(new Set(sentFrom));
        const label = uniqueFrom
          .slice(0, 3)
          .map((addr) =>
            addr.length > 10 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr
          )
          .join(", ");
        const more = uniqueFrom.length > 3 ? ` +${uniqueFrom.length - 3} more` : "";
        toast.success(
          `Consolidation queued: moved from ${uniqueFrom.length} wallet(s)${label ? ` (${label}${more})` : ""}`
        );
      } else {
        toast.success("Split successful");
      }

      // Refresh balances for affected wallets
      const addresses = wallets
        .filter((w) => ids.includes(w.id))
        .map((w) => getAddressForChain(w, currentChain))
        .filter(Boolean) as string[];

      const primaryAddress =
        currentChain === "sol"
          ? primaryWalletAddresses.solana || getAddressForChain(wallets.find((w) => w.isPrimary) || wallets[0] || ({} as any), "sol")
          : primaryWalletAddresses.ethereum ||
            normalizeMonadAddress(
              getAddressForChain(wallets.find((w) => w.isPrimary) || wallets[0] || ({} as any), "monad")
            );

      const refreshSet = new Set(addresses);
      if (primaryAddress) refreshSet.add(primaryAddress);

      if (refreshSet.size) {
        await refreshBalancesForCurrentChain();
      }
      await refreshWalletList(true);
    } catch (error: any) {
      console.error("Redistribute failed:", error);
      toast.error(error?.message || "Failed to redistribute funds");
    } finally {
      setRedistributing(false);
    }
  };

  const beginDeleteWallet = (wallet: UserWallet) => {
    setDeleteTarget(wallet);
    setDeleteRiskAck(false);
    setDeleteModalOpen(true);
  };

  const refreshBalancesForCurrentChain = async () => {
    if (!wallets.length) return;
    setRefreshingBalances(true);
    try {
      const addresses = wallets
        .map((w) => getAddressForChain(w, currentChain))
        .filter(Boolean) as string[];
      if (addresses.length) {
        await refreshAllBalances(
          addresses.map((address) => ({ address, chain: currentChain })),
          true
        );
      }
      const primaryAddress =
        currentChain === "sol"
          ? primaryWalletAddresses.solana
          : primaryWalletAddresses.ethereum;
      if (primaryAddress) {
        await refreshBalance({
          chain: currentChain,
          address: primaryAddress,
          force: true,
          updateChainBalance: true,
        });
      }
    } catch (error) {
      console.error("Balance refresh failed:", error);
    } finally {
      setRefreshingBalances(false);
    }
  };

  const handleDeleteWallet = async () => {
    if (!deleteTarget) return;
    if (!user?.bearerToken) {
      toast.error("Please log in first");
      return;
    }
    setDeletingWalletId(deleteTarget.id);
    try {
      await deleteUserWallet(deleteTarget.id, user.bearerToken);

      // Remove from selection locally
      if (currentChain === "sol") {
        setSelectedWalletsForChain(
          selectedSolWalletIds.filter((id) => id !== deleteTarget.id),
          "sol"
        );
      } else {
        setSelectedWalletsForChain(
          selectedMonWalletIds.filter((id) => id !== deleteTarget.id),
          "monad"
        );
      }

      await refreshWalletList(true);

      // Refresh balances to update header/chain balances
      await refreshAllBalances([], true); // noop but keeps contract
      await refreshBalance({ chain: currentChain, force: true, updateChainBalance: true });

      toast.success("Wallet deleted");
    } catch (error: any) {
      console.error("Delete wallet failed:", error);
      toast.error(error?.message || "Failed to delete wallet");
    } finally {
      setDeletingWalletId(null);
      setDeleteModalOpen(false);
      setDeleteTarget(null);
    }
  };

    const handleCreateWallet = async () => {
    if (!user?.id) {
      toast.error("Please log in first");
      return;
    }

    setCreatingWallet(true);
    try {
      // POST to your backend which does:
      // - create Turnkey sub-org / wallet for this user
      // - persist wallet to DB
      // - return the new wallet with balance = 0 (or computed)
      isDev && console.log("Creating new wallet for user:", user.id);
      const res = await fetch(
  `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/wallet`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${user.bearerToken}`,
    },
    body: JSON.stringify({
      userId: user.id,
      // you can optionally send: label, chain, etc.
    }),
  }
);

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Failed to create wallet: ${res.status} ${errorText}`);
      }

      const createdRaw = await res.json();
      const newWalletData = createdRaw?.wallet ?? createdRaw;

      // Initialize the new wallet with balance 0 immediately
      const nextIndex = wallets.length;
      const newWallet = normalizeWalletFromApi(newWalletData, nextIndex);
      
      // Set balance to 0 for the new wallet immediately (before fetching from API/chain)
      setWalletBalances((prev) => ({
        ...prev,
        [newWallet.id]: 0, // New wallet starts with 0 balance
      }));

      setWallets((prev) => [...prev, newWallet]);
      notifyWalletsUpdated();
      
      // Fetch all wallets to get the latest state, then refresh balances
      await fetchWallets();
      
      // Immediately fetch the actual balance for the new wallet from the chain
      // This ensures it shows the correct balance (which should be 0 for a new wallet)
      const newWalletAddress = getAddressForChain(newWallet, currentChain);
      
      if (newWalletAddress) {
        try {
          const balanceResult = await refreshBalance({
            chain: currentChain,
            address: newWalletAddress,
            force: true, // Force refresh to get actual balance from chain
          });
          
          if (balanceResult?.balance !== undefined) {
            setWalletBalances((prev) => ({
              ...prev,
              [newWallet.id]: balanceResult.balance, // Update with actual chain balance
            }));
          }
        } catch (error) {
          console.error(`Failed to fetch balance for new wallet ${newWallet.id}:`, error);
          // Keep balance at 0 if fetch fails
        }
      }

      toast.success("New wallet created");
    } catch (err) {
      console.error(err);
      toast.error("Could not create wallet");
    } finally {
      setCreatingWallet(false);
    }
  };

  const handleBeginRenameWallet = (wallet: UserWallet) => {
    setEditingWalletId(wallet.id);
    setWalletRenameValue(wallet.label || "");
  };

  const handleCancelRenameWallet = () => {
    setEditingWalletId(null);
    setWalletRenameValue("");
    setRenamingWalletId(null);
  };

  const handleExportWallet = (walletId: string) => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) {
      toast.error("Wallet not found");
      return;
    }
    
    // Check if this is a Turnkey wallet (has walletId) or imported wallet
    if (!wallet.walletId) {
      toast.error("Imported wallets cannot be exported. Only Turnkey-managed wallets can be exported.");
      return;
    }
    
    const address = getAddressForChain(wallet, currentChain);
    // Use the Turnkey walletId, not the database id
    setExportWalletId(wallet.walletId);
    setExportWalletAddress(address);
    setForceExportChain(null);
    setShowExportModal(true);
  };

  const handleExported = useCallback(() => {
    try {
      localStorage.setItem("export_ack_sol", "true");
      localStorage.setItem("export_ack_monad", "true");
    } catch {
      // ignore storage issues
    }
    setForceExportChain(null);
  }, []);

  const acknowledgeBackup = useCallback(async () => {
    if (!user?.bearerToken) return;
    try {
      await acknowledgeWalletExport(user.bearerToken);
      await refreshUser();
    } catch (err: any) {
      console.error("Failed to acknowledge wallet export", err);
    }
  }, [refreshUser, user?.bearerToken]);

  const handleRenameWallet = async () => {
    if (!editingWalletId || !user?.bearerToken) {
      toast.error("Please log in first");
      return;
    }

    const trimmed = walletRenameValue.trim();
    if (!trimmed) {
      toast.error("Wallet name cannot be empty");
      return;
    }

    const currentLabel =
      wallets.find((wallet) => wallet.id === editingWalletId)?.label ?? "";
    if (trimmed === currentLabel.trim()) {
      handleCancelRenameWallet();
      return;
    }

    try {
      setRenamingWalletId(editingWalletId);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/wallet/${editingWalletId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.bearerToken}`,
          },
          body: JSON.stringify({
            label: trimmed,
            userId: user.id,
            walletId: editingWalletId,
          }),
        }
      );

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(
          errorText || `Failed to rename wallet (${res.status})`
        );
      }

      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data?.wallets)) {
        setWallets(
          data.wallets.map((w: any, index: number) => normalizeWalletFromApi(w, index))
        );
      } else if (data?.wallet) {
        setWallets((prev) => {
          const currentIndex = prev.findIndex((wallet) => wallet.id === editingWalletId);
          const normalized = normalizeWalletFromApi(
            data.wallet,
            currentIndex >= 0 ? currentIndex : undefined
          );
          return prev.map((wallet) =>
            wallet.id === editingWalletId ? normalized : wallet
          );
        });
      } else {
        setWallets((prev) =>
          prev.map((wallet) =>
            wallet.id === editingWalletId
              ? { ...wallet, label: trimmed }
              : wallet
          )
        );
      }
      notifyWalletsUpdated();

      toast.success("Wallet name updated");
      setEditingWalletId(null);
      setWalletRenameValue("");
    } catch (err) {
      console.error("Failed to rename wallet:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to rename wallet"
      );
    } finally {
      setRenamingWalletId(null);
    }
  };

    const handleSetPrimaryWallet = async (walletId: string) => {
    if (!user?.id) {
      toast.error("Please log in first");
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/wallet/${walletId}/primary`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.bearerToken}`,
          },
        }
      );

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        console.error("Failed to set primary wallet:", res.status, errorText);
        toast.error("Failed to set primary wallet");
        return;
      }

      const data = await res.json().catch(() => ({}));

      let mappedWallets: UserWallet[] = [];

      // backend setPrimaryWallet returns: { success, message, wallets }
      if (Array.isArray(data.wallets)) {
        mappedWallets = data.wallets.map((w: any, index: number) =>
          normalizeWalletFromApi(w, index)
        );
      } else {
        // API didn't include wallets - optimistically flip local state
        mappedWallets = wallets.map((wallet) => ({
          ...wallet,
          isPrimary: wallet.id === walletId,
        }));
      }

      setWallets(mappedWallets);
      notifyWalletsUpdated();

      // Make sure context refreshes even if backend omitted wallets in the response
      try {
        await refreshWalletList(true);
      } catch (refreshErr) {
        console.error("Failed to refresh wallet list after setting primary:", refreshErr);
      }
      
      // Immediately refresh the new primary wallet's balance to update Header
      const newPrimaryWallet =
        mappedWallets.find((w) => w.isPrimary) ??
        mappedWallets.find((w) => w.id === walletId);
      if (newPrimaryWallet) {
        const newPrimaryAddress = getAddressForChain(newPrimaryWallet, currentChain);
        
        if (newPrimaryAddress) {
          // Force immediate refresh to update Header balance right away
          // Use updateChainBalance to ensure chainBalances is updated even though
          // primaryWalletAddresses hasn't updated in UserContext yet
          try {
            const balanceResult = await refreshBalance({
              chain: currentChain,
              address: newPrimaryAddress,
              force: true, // Force refresh to bypass cooldown
              updateChainBalance: true, // Force update chainBalances[chain] for Header
            });
            
            if (balanceResult?.balance !== undefined) {
              // Balance is now updated in chainBalances, which Header will read
              // Also update the walletBalances for consistency
              setWalletBalances((prev) => ({
                ...prev,
                [newPrimaryWallet.id]: balanceResult.balance,
              }));
            }
          } catch (error) {
            console.error(`Failed to refresh balance for new primary wallet:`, error);
          }
        }
      }
      
      toast.success("Primary wallet updated");
    } catch (err) {
      console.error("Error setting primary wallet:", err);
      toast.error("Failed to set primary wallet");
    }
  };

  return (
    <>
      <Head>
        <title>Portfolio | Interstate Memeboard</title>
      </Head>
      <div className="flex min-h-screen flex-col bg-[#030304] text-zinc-100">
        <div className="relative z-[10000]"><Header /></div>
        <DockedPanelMarginWrapper>
        <div className="p-1 sm:p-1.5">
          {/* JTX-style main container */}
          <div className="relative overflow-hidden rounded-xl border border-white/[0.06] min-h-[calc(100vh-80px)] bg-[#030304]">
            {/* JTX-style background with corner brackets and ambient glow */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl bg-[#030304]/95">
              {/* Corner brackets */}
              <div className="absolute left-2 top-2 h-6 w-6 border-l border-t border-white/[0.12]" />
              <div className="absolute right-2 top-2 h-6 w-6 border-r border-t border-white/[0.12]" />
              <div className="absolute bottom-2 left-2 h-6 w-6 border-b border-l border-white/[0.12]" />
              <div className="absolute bottom-2 right-2 h-6 w-6 border-b border-r border-white/[0.12]" />
              
              {/* Subtle ambient glow - emerald tint */}
              <div
                className="absolute -top-[40%] left-1/2 h-[60vh] w-[120%] -translate-x-1/2"
                style={{ background: 'radial-gradient(ellipse at center, rgba(112, 224, 176, 0.03) 0%, transparent 70%)' }}
              />
              {/* Secondary purple glow */}
              <div
                className="absolute top-[20%] left-1/2 h-[40vh] w-[80%] -translate-x-1/2"
                style={{ background: 'radial-gradient(ellipse at center, rgba(124, 58, 237, 0.02) 0%, transparent 60%)' }}
              />
              {/* Subtle side vignette */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-black/30" />
              {/* Subtle top-to-bottom gradient */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
            </div>
            {/* Content */}
            <div className="relative z-10 px-3 sm:px-4 md:px-6 pt-4 sm:pt-6 pb-6">

          {/* JTX-style Section Tabs */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 px-2 gap-3 sm:gap-0">
            <div className="flex gap-1 p-1 bg-[#0c0e12]/60 rounded-lg border border-white/[0.06]">
              <button
                className={`px-4 py-2 text-sm font-medium transition-all duration-200 cursor-pointer rounded-md ${
                  activeSection === "spot"
                    ? "text-[#f4f4f5] bg-white/[0.08] border border-white/[0.08]"
                    : "text-[#71717a] hover:text-[#a1a1aa] border border-transparent"
                }`}
                onClick={() => setActiveSection("spot")}
              >
                Spot
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium transition-all duration-200 cursor-pointer rounded-md ${
                  activeSection === "predictions"
                    ? "text-[#f4f4f5] bg-white/[0.08] border border-white/[0.08]"
                    : "text-[#71717a] hover:text-[#a1a1aa] border border-transparent"
                }`}
                onClick={() => setActiveSection("predictions")}
              >
                Predictions
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium transition-all duration-200 cursor-pointer rounded-md ${
                  activeSection === "wallet"
                    ? "text-[#f4f4f5] bg-white/[0.08] border border-white/[0.08]"
                    : "text-[#71717a] hover:text-[#a1a1aa] border border-transparent"
                }`}
                onClick={() => setActiveSection("wallet")}
              >
                Wallets
              </button>
              {/* <button
                className={`text-base sm:text-lg font-light transition cursor-pointer ${
                  activeSection === "perpetuals"
                    ? "text-[#f0f5f5]"
                    : "text-[#6B7280] hover:text-[#f0f5f5]"
                }`}
                onClick={() => setActiveSection("perpetuals")}
              >
                Perpetuals
              </button> */}
            </div>

            {/* Right side controls for Spot section - JTX style */}
            {activeSection === "spot" && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <InterstateTooltip label={currentChain === 'monad' ? 'MON Balance' : 'SOL Balance'}>
                  <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity px-2.5 py-1.5 rounded-md bg-[#0c0e12]/60 border border-white/[0.06]">
                    {currentChain === 'monad' ? (
                      <img
                        src="https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1"
                        alt="Monad"
                        className="h-5 w-5 -mt-px rounded"
                        style={{ objectFit: 'contain' }}
                      />
                    ) : (
                      <SiSolana
                        className="h-3.5 w-3.5 -mt-px"
                        aria-hidden="true"
                        style={{
                          color: "unset",
                          fill: "url(#solana-gradient)",
                          filter: "none",
                        }}
                      />
                    )}
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
                    <span className="text-xs text-[#a1a1aa] tabular-nums">
                      {formatBalance(chainBalance)} {currentChain === "monad" ? "MON" : "SOL"}
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
                {/* JTX-style timeframe selector */}
                <div className="flex items-center gap-0.5 p-0.5 bg-[#0c0e12]/60 rounded-md border border-white/[0.06]">
                  <button
                    onClick={() => setSelectedTimeframe("1d")}
                    className={`px-2.5 py-1 text-xs cursor-pointer transition-all duration-200 rounded ${
                      selectedTimeframe === "1d"
                        ? "text-[#f4f4f5] bg-white/[0.08]"
                        : "text-[#71717a] hover:text-[#a1a1aa]"
                    }`}
                  >
                    1d
                  </button>
                  <button
                    onClick={() => setSelectedTimeframe("7d")}
                    className={`px-2.5 py-1 text-xs cursor-pointer transition-all duration-200 rounded ${
                      selectedTimeframe === "7d"
                        ? "text-[#f4f4f5] bg-white/[0.08]"
                        : "text-[#71717a] hover:text-[#a1a1aa]"
                    }`}
                  >
                    7d
                  </button>
                  <button
                    onClick={() => setSelectedTimeframe("30d")}
                    className={`px-2.5 py-1 text-xs cursor-pointer transition-all duration-200 rounded ${
                      selectedTimeframe === "30d"
                        ? "text-[#f4f4f5] bg-white/[0.08]"
                        : "text-[#71717a] hover:text-[#a1a1aa]"
                    }`}
                  >
                    30d
                  </button>
                  <button
                    onClick={() => setSelectedTimeframe("Max")}
                    className={`px-2.5 py-1 text-xs cursor-pointer transition-all duration-200 rounded ${
                      selectedTimeframe === "Max"
                        ? "text-[#f4f4f5] bg-white/[0.08]"
                        : "text-[#71717a] hover:text-[#a1a1aa]"
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
            <div className="space-y-4 sm:space-y-6">
              {/* JTX-style Top Panels */}
              <div className={`grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${initialNativeBalanceRef.current !== null ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
                {/* Balance Card - JTX style */}
                <div className="relative rounded-lg border border-white/[0.06] bg-[#0c0e12]/80 p-4 sm:p-5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                  {/* Mini corner brackets */}
                  <div className="pointer-events-none absolute inset-0 rounded-lg overflow-hidden">
                    <div className="absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l border-t border-white/[0.08]" />
                    <div className="absolute right-1.5 top-1.5 h-2.5 w-2.5 border-r border-t border-white/[0.08]" />
                  </div>
                  <div className="mb-3 sm:mb-4 text-[#f4f4f5] text-xs sm:text-sm font-semibold uppercase tracking-wide">
                    Balance
                  </div>
                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <div className="text-[#52525b] text-xs uppercase tracking-wide mb-0.5">
                        Available Balance (USD)
                      </div>
                      <div className="text-xl sm:text-2xl font-semibold text-[#f4f4f5] tabular-nums">
                        ${formatCurrency(chainBalance * chainPrice)}
                      </div>
                    </div>
                    {/* Unrealized PNL - Commented out */}
                    {/* <div>
                      <div className="text-[#6B7280] text-xs sm:text-sm font-light flex items-center gap-1">
                        Unrealized PNL
                        <InterstateTooltip label="Profit/loss from positions you still hold (tokens you haven't sold yet). This changes as token prices change.">
                          <span className="text-[#6B7280] hover:text-[#9CA3AF] cursor-help text-xs">ℹ️</span>
                        </InterstateTooltip>
                      </div>
                      <div className="text-xl sm:text-2xl font-light text-[#f0f5f5]">
                        ${formatSmallPrice(unrealizedPnl)}
                      </div>
                      {unrealizedPnlPercentage !== 0 && (
                        <div className={`text-xs mt-1 ${unrealizedPnlPercentage >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {unrealizedPnlPercentage >= 0 ? '+' : ''}{formatSmallPrice(unrealizedPnlPercentage)}%
                        </div>
                      )}
                    </div> */}
                    <div>
                      <div className="text-[#52525b] text-xs uppercase tracking-wide mb-0.5">
                        Available ({currentChain === "monad" ? "MON" : "SOL"})
                      </div>
                      <div className="text-xl sm:text-2xl font-semibold text-[#f4f4f5] flex items-center gap-1 tabular-nums">
                        <ChainIcon chain={currentChain} size="medium" />
                        {formatBalance(chainBalance)} {currentChain === "monad" ? "MON" : "SOL"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Total PNL - Commented out */}
                {/* <div className="rounded-xl border border-white/[0.08] bg-white/[0.05] p-6 backdrop-blur-xl">
                  <div className="mb-4 text-[#f0f5f5] text-sm font-medium cursor-pointer hover:text-[#70E0B0] transition-colors">
                    Total PNL
                  </div>
                  <div className="flex flex-col h-32">
                    <div
                      className="text-2xl font-light mb-2"
                      style={{
                        color: totalPnl >= 0 ? "#70E0B0" : "#FF4D7F",
                      }}
                    >
                      {sortByUSD && contextSolPrice > 0 ? (
                        <>
                          <ChainIcon chain={currentChain} size="medium" />
                          {formatSmartNumber(Math.abs(totalPnl) / contextSolPrice)}
                        </>
                      ) : (
                        `${totalPnl >= 0 ? "+" : "-"}$${formatSmallPrice(Math.abs(totalPnl))}`
                      )}
                    </div>
                    {totalPnlPercentage !== 0 && (
                      <div className={`text-sm mb-2 ${totalPnlPercentage >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {totalPnlPercentage >= 0 ? "+" : ""}{formatSmallPrice(totalPnlPercentage)}%
                      </div>
                    )}
                    <div className="text-xs text-[#6B7280] mt-auto flex items-center gap-2">
                      <span>Realized + Unrealized</span>
                      <InterstateTooltip label={
                        <div className="text-xs space-y-1">
                          <div><strong>Realized PNL:</strong> Profit/loss from completed trades (tokens you've sold)</div>
                          <div><strong>Unrealized PNL:</strong> Profit/loss from positions you still hold (tokens you haven't sold yet)</div>
                          <div><strong>Total PNL:</strong> Realized + Unrealized combined</div>
                        </div>
                      }>
                        <span className="text-[#6B7280] hover:text-[#9CA3AF] cursor-help">ℹ️</span>
                      </InterstateTooltip>
                    </div>
                  </div>
                </div> */}

                {/* Wallet Balance Change - JTX style */}
                {initialNativeBalanceRef.current !== null && (
                  <div className="relative rounded-lg border border-white/[0.06] bg-[#0c0e12]/80 p-4 sm:p-5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                    {/* Mini corner brackets */}
                    <div className="pointer-events-none absolute inset-0 rounded-lg overflow-hidden">
                      <div className="absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l border-t border-white/[0.08]" />
                      <div className="absolute right-1.5 top-1.5 h-2.5 w-2.5 border-r border-t border-white/[0.08]" />
                    </div>
                    <div className="mb-3 sm:mb-4 text-[#f4f4f5] text-xs sm:text-sm font-semibold uppercase tracking-wide">
                      Balance Change ({currentChain === "monad" ? "MON" : "SOL"})
                    </div>
                    <div className="flex flex-col">
                      <div
                        className="text-xl sm:text-2xl font-semibold mb-2 tabular-nums"
                        style={{
                          color: actualBalanceChangePnl >= 0 ? "#18c48c" : "#ef4444",
                        }}
                      >
                        {sortByUSD && nativePriceForDisplay > 0 ? (
                          <>
                            <ChainIcon chain={currentChain} size="medium" />
                            {formatSmartNumber(Math.abs(actualBalanceChangePnl) / (nativePriceForDisplay || 1))}
                          </>
                        ) : (
                          `${actualBalanceChangePnl >= 0 ? "+" : "-"}$${formatSmallPrice(Math.abs(actualBalanceChangePnl))}`
                        )}
                      </div>
                      {/* Show native balance change (MON or SOL) */}
                      <div 
                        className="text-sm mb-1 tabular-nums"
                        style={{
                          color: actualBalanceChangeNative >= 0 ? "#18c48c" : "#ef4444",
                        }}
                      >
                        {actualBalanceChangeNative >= 0 ? "+" : "-"}
                        {formatSmartNumber(Math.abs(actualBalanceChangeNative))} {currentChain === 'monad' ? 'MON' : 'SOL'}
                      </div>
                      {/* Show native percentage change (clamped to ±999.99%) */}
                      {actualBalanceChangeNativePercentage !== 0 && (() => {
                        const clampedNativePct = Math.max(-999.99, Math.min(999.99, actualBalanceChangeNativePercentage));
                        const isNativeClamped = Math.abs(actualBalanceChangeNativePercentage) > 999.99;
                        return (
                          <div
                            className="text-sm mb-2 tabular-nums"
                            style={{
                              color: actualBalanceChangeNativePercentage >= 0 ? "#18c48c" : "#ef4444",
                            }}
                          >
                            {isNativeClamped
                              ? (actualBalanceChangeNativePercentage > 0 ? ">+999.99%" : "<-999.99%")
                              : `${clampedNativePct >= 0 ? "+" : ""}${formatSmallPrice(clampedNativePct)}%`
                            }
                          </div>
                        );
                      })()}
                      {actualBalanceChangePnlPercentage !== 0 && (() => {
                        const clampedUsdPct = Math.max(-999.99, Math.min(999.99, actualBalanceChangePnlPercentage));
                        const isUsdClamped = Math.abs(actualBalanceChangePnlPercentage) > 999.99;
                        return (
                          <div className={`text-sm mb-3 tabular-nums ${actualBalanceChangePnlPercentage >= 0 ? 'text-[#18c48c]' : 'text-[#ef4444]'}`}>
                            {isUsdClamped
                              ? (actualBalanceChangePnlPercentage > 0 ? ">+999.99% (USD)" : "<-999.99% (USD)")
                              : `${clampedUsdPct >= 0 ? "+" : ""}${formatSmallPrice(clampedUsdPct)}% (USD)`
                            }
                          </div>
                        );
                      })()}
                      {/* Interactive Chart */}
                      {balanceHistory.length > 0 && (
                        <div className="mt-2 h-32 sm:h-40 w-full">
                          <BalanceChart 
                            data={balanceHistory} 
                            chain={currentChain}
                            initialBalance={initialNativeBalanceRef.current || 0}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Realized PNL - JTX style */}
                <div className="relative rounded-lg border border-white/[0.06] bg-[#0c0e12]/80 p-4 sm:p-5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                  {/* Mini corner brackets */}
                  <div className="pointer-events-none absolute inset-0 rounded-lg overflow-hidden">
                    <div className="absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l border-t border-white/[0.08]" />
                    <div className="absolute right-1.5 top-1.5 h-2.5 w-2.5 border-r border-t border-white/[0.08]" />
                  </div>
                  <div className="mb-3 sm:mb-4 flex items-center justify-between">
                    <div className="text-[#f4f4f5] text-xs sm:text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
                      Realized PNL
                      <InterstateTooltip label="Profit/loss from completed trades (tokens you've sold). This is locked in and won't change unless you make more trades.">
                        <FiInfo className="text-[#52525b] hover:text-[#a1a1aa] cursor-help text-xs w-3.5 h-3.5 transition-colors" />
                      </InterstateTooltip>
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
                  <div className="flex flex-col">
                    {/*
                      Realized PnL display source:
                      - On Solana with wp.summary loaded → wallet-scoped chain value
                        (displayRealizedPnl / displayRealizedPnlPct).
                      - Otherwise (Monad, pre-load) → legacy user-aggregate timeframeMetrics.
                      The chart below still uses tradeHistory-derived series — it's
                      timeframe-aware and the headline number is what users complained
                      about being "user-aggregate, not wallet-scoped".
                      Styling (font-semibold, tabular-nums, #18c48c/#ef4444 colors)
                      comes from prod's design refresh; merged with our chain-source logic.
                    */}
                    {(() => {
                      const realizedValue = displayRealizedPnl ?? timeframeMetrics.realizedPnl;
                      const realizedPct = displayRealizedPnlPct ?? timeframeMetrics.realizedPnlPercentage;
                      return (
                        <>
                          <div
                            className="text-xl sm:text-2xl font-semibold mb-2 tabular-nums"
                            style={{ color: realizedValue >= 0 ? "#18c48c" : "#ef4444" }}
                          >
                            {sortByUSD && contextSolPrice > 0 ? (
                              <>
                                <ChainIcon chain={currentChain} size="medium" />
                                {formatSmartNumber(Math.abs(realizedValue) / contextSolPrice)}
                              </>
                            ) : (
                              `${realizedValue >= 0 ? "+" : "-"}$${formatSmallPrice(Math.abs(realizedValue))}`
                            )}
                          </div>
                          {/* Realized PNL Percentage - Always show */}
                          <div className={`text-sm mb-2 tabular-nums ${realizedPct >= 0 ? 'text-[#18c48c]' : 'text-[#ef4444]'}`}>
                            {realizedPct >= 0 ? "+" : ""}{formatSmallPrice(realizedPct)}%
                          </div>
                        </>
                      );
                    })()}
                    {/* Interactive Realized PNL Chart */}
                    {pnlChartData.length > 1 ? (
                      <div className="h-40 sm:h-48 w-full">
                        <RealizedPnlChart data={pnlChartData} />
                      </div>
                    ) : (
                      <div className="h-40 sm:h-48 w-full flex items-center justify-center">
                        <p className="text-[#52525b] text-xs">No realized trades yet</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Performance - JTX style */}
                <div className="relative rounded-lg border border-white/[0.06] bg-[#0c0e12]/80 p-4 sm:p-5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                  {/* Mini corner brackets */}
                  <div className="pointer-events-none absolute inset-0 rounded-lg overflow-hidden">
                    <div className="absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l border-t border-white/[0.08]" />
                    <div className="absolute right-1.5 top-1.5 h-2.5 w-2.5 border-r border-t border-white/[0.08]" />
                  </div>
                  <div className="mb-3 sm:mb-4 flex items-center justify-between">
                    <div className="text-[#f4f4f5] text-xs sm:text-sm font-semibold uppercase tracking-wide">
                      Performance
                    </div>
                    <InterstateTooltip label="Export">
                      <button
                        onClick={exportPerformanceData}
                        className="text-[#52525b] text-sm cursor-pointer hover:text-[#a1a1aa] transition-colors"
                      >
                        <FaUpload />
                      </button>
                    </InterstateTooltip>
                  </div>
                  <div className="space-y-2 sm:space-y-3">
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="text-[#71717a] truncate pr-2">
                        {selectedTimeframe} Unrealized PNL
                      </span>
                      <span className="text-[#f4f4f5] whitespace-nowrap tabular-nums">
                        {sortByUSD && contextSolPrice > 0 ? (
                          <>
                            <ChainIcon chain={currentChain} size="medium" />
                            {formatSmartNumber(
                              timeframeMetrics.unrealizedPnl / contextSolPrice,
                            )}
                          </>
                        ) : (
                          `$${formatSmallPrice(timeframeMetrics.unrealizedPnl)}`
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="text-[#71717a] truncate pr-2">
                        {selectedTimeframe} Realized PNL
                      </span>
                      <span className="text-[#f4f4f5] whitespace-nowrap tabular-nums">
                        {sortByUSD && contextSolPrice > 0 ? (
                          <>
                            <ChainIcon chain={currentChain} size="medium" />
                            {formatSmartNumber(
                              timeframeMetrics.realizedPnl / contextSolPrice,
                            )}
                          </>
                        ) : (
                          `${
                            timeframeMetrics.realizedPnl >= 0 ? "+" : "-"
                          }$${formatSmallPrice(
                            Math.abs(timeframeMetrics.realizedPnl),
                          )}`
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="text-[#71717a] truncate pr-2">
                        {selectedTimeframe} Total PNL
                      </span>
                      <span
                        className="whitespace-nowrap tabular-nums"
                        style={{
                          color: totalPnl >= 0 ? "#18c48c" : "#ef4444",
                        }}
                      >
                        {sortByUSD && contextSolPrice > 0 ? (
                          <>
                            <ChainIcon chain={currentChain} size="medium" />
                            {formatSmartNumber(Math.abs(totalPnl) / contextSolPrice)}
                          </>
                        ) : (
                          `${totalPnl >= 0 ? "+" : "-"}$${formatSmallPrice(Math.abs(totalPnl))}`
                        )}
                        {totalPnlPercentage !== 0 && (
                          <span className="ml-1 sm:ml-2 text-xs">
                            ({totalPnlPercentage >= 0 ? "+" : ""}{formatSmallPrice(totalPnlPercentage)}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="text-[#71717a] truncate pr-2">
                        {selectedTimeframe} Total TXNS
                      </span>
                      <span className="text-[#f4f4f5] whitespace-nowrap tabular-nums">
                        {timeframeMetrics.winningTrades}/
                        {timeframeMetrics.losingTrades}
                      </span>
                    </div>

                    {/* Performance breakdown - JTX style */}
                    <div className="space-y-2 mt-4 pt-3 border-t border-white/[0.06]">
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#18c48c] flex-shrink-0"></div>
                          <span className="text-[#71717a] truncate">
                            &gt;500%
                          </span>
                        </div>
                        <span className="text-[#f4f4f5] whitespace-nowrap ml-2 tabular-nums">
                          {performanceBreakdown.above500}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#18c48c] flex-shrink-0"></div>
                          <span className="text-[#71717a] truncate">
                            200% ~ 500%
                          </span>
                        </div>
                        <span className="text-[#f4f4f5] whitespace-nowrap ml-2 tabular-nums">
                          {performanceBreakdown.between200And500}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#18c48c] flex-shrink-0"></div>
                          <span className="text-[#71717a] truncate">
                            0% ~ 200%
                          </span>
                        </div>
                        <span className="text-[#f4f4f5] whitespace-nowrap ml-2 tabular-nums">
                          {performanceBreakdown.between0And200}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#ef4444] flex-shrink-0"></div>
                          <span className="text-[#71717a] truncate">
                            0% ~ -50%
                          </span>
                        </div>
                        <span className="text-[#f4f4f5] whitespace-nowrap ml-2 tabular-nums">
                          {performanceBreakdown.between0AndMinus50}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#ef4444] flex-shrink-0"></div>
                          <span className="text-[#71717a] truncate">
                            &lt; -50%
                          </span>
                        </div>
                        <span className="text-[#f4f4f5] whitespace-nowrap ml-2 tabular-nums">
                          {performanceBreakdown.belowMinus50}
                        </span>
                      </div>
                    </div>

                    {/* Accent line at bottom - JTX style */}
                    <div className="w-full h-0.5 bg-gradient-to-r from-[#ef4444] via-[#ef4444]/50 to-transparent mt-4 rounded-full"></div>
                  </div>
                </div>
              </div>

              {/* Positions Table Section - JTX style */}
              <div className="relative rounded-lg border border-white/[0.06] bg-[#0c0e12]/80 overflow-hidden backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                {/* Mini corner brackets */}
                <div className="pointer-events-none absolute inset-0 rounded-lg overflow-hidden z-10">
                  <div className="absolute left-1.5 top-1.5 h-3 w-3 border-l border-t border-white/[0.08]" />
                  <div className="absolute right-1.5 top-1.5 h-3 w-3 border-r border-t border-white/[0.08]" />
                  <div className="absolute bottom-1.5 left-1.5 h-3 w-3 border-b border-l border-white/[0.08]" />
                  <div className="absolute bottom-1.5 right-1.5 h-3 w-3 border-b border-r border-white/[0.08]" />
                </div>
                {/* Sub-navigation tabs with controls - JTX style */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/[0.06] gap-3 sm:gap-0 p-3 sm:px-4 sm:py-3">
                  <div className="flex flex-wrap gap-1 p-0.5 bg-[#080a0d]/60 rounded-md border border-white/[0.04]">
                    {spotTabs.map((tab, i) => (
                      <button
                        key={tab}
                        className={`px-3 sm:px-4 py-1.5 text-xs transition-all duration-200 cursor-pointer rounded ${
                          activeSpotTab === i
                            ? "text-[#f4f4f5] font-semibold bg-white/[0.08]"
                            : "text-[#71717a] font-medium hover:text-[#a1a1aa]"
                        }`}
                        onClick={() => setActiveSpotTab(i)}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                    {/* JTX-style search input */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#080a0d]/60 border border-white/[0.06] hover:border-white/[0.1] transition-colors flex-1 sm:flex-initial min-w-[200px] sm:min-w-0">
                      <FaSearch className="text-[#52525b] text-xs flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Search by name or address"
                        className="bg-transparent text-xs text-[#a1a1aa] placeholder-[#52525b] focus:outline-none w-full sm:w-40"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searchQuery.trim() && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="text-[#52525b] hover:text-[#a1a1aa] transition-colors flex-shrink-0"
                        >
                          <FaTimes className="text-xs" />
                        </button>
                      )}
                    </div>
                    {searchQuery.trim() && (
                      <div className="text-xs text-[#71717a] whitespace-nowrap">
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
                    {/* JTX-style toggle buttons */}
                    <button
                      onClick={() => setShowHidden(!showHidden)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all duration-200 cursor-pointer text-xs whitespace-nowrap border ${
                        !showHidden
                          ? "bg-[#18c48c]/10 border-[#18c48c]/30 text-[#18c48c]"
                          : "bg-transparent border-white/[0.06] hover:border-white/[0.1] text-[#71717a] hover:text-[#a1a1aa]"
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
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all duration-200 cursor-pointer border border-white/[0.06] hover:border-white/[0.1] text-[#71717a] hover:text-[#a1a1aa] text-xs"
                    >
                      <span className="text-xs">↑↓</span>
                      {sortByUSD ? "USD" : "SOL"}
                    </button>
                  </div>
                </div>

                {/* Table Content — display toggling keeps components mounted to avoid re-fetch on tab switch */}
                <div className="min-h-[200px]">
                  <div style={{ display: activeSpotTab === 0 ? 'block' : 'none' }}>
                    {!user?.id && !userLoading ? (
                      <div className="py-8 text-center text-[#52525b] text-sm">
                        Please log in to view your positions.
                      </div>
                    ) : !user?.id ? (
                      null
                    ) : (
                      <Positions
                        bearerToken={user.bearerToken}
                        userId={user.id}
                        onPositionsChange={setPositions}
                        onTokenNamesChange={setTokenNames}
                        // For Solana: feed the *enriched* local `positions` state (sourced
                        // from the useEffect at line 603-640 that maps wp.positions through
                        // USD enrichment + dust filter + .reverse()). Reading wp.positions
                        // directly here was Bug 1 — WS updates flowed in but with USD fields
                        // = 0 and no dust filter, producing a visually-identical render even
                        // though the prop reference changed. Top 100 was already keyed off
                        // `positions` via top100Positions derivation; this aligns Active
                        // Positions with the same source of truth.
                        // For Monad: keep existing behavior — let Positions fetch internally.
                        preloadedPositions={
                          currentChain === "sol"
                            ? (searchQuery.trim() !== "" ? filteredPositions : positions)
                            : (searchQuery.trim() !== "" ? filteredPositions : undefined)
                        }
                        skipFetch={currentChain === "sol" || searchQuery.trim() !== ""}
                        showHidden={showHidden}
                        showInSOL={sortByUSD}
                        tokenMetadataCache={tokenMetadataCache}
                        onUpdateCache={updateTokenMetadataCache}
                        isCacheValid={isCacheValid}
                        fallbackPositions={fallbackPositions}
                      />
                    )}
                  </div>
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
                  <div style={{ display: activeSpotTab === 1 ? 'block' : 'none' }}>
                    {!user?.id && !userLoading ? (
                      <div className="py-8 text-center text-[#52525b] text-sm">
                        Please log in to view your positions.
                      </div>
                    ) : !user?.id ? (
                      <div />
                    ) : (
                      <Positions
                        bearerToken={user.bearerToken}
                        userId={user.id}
                        onPositionsChange={setPositions}
                        onTokenNamesChange={setTokenNames}
                        // For Solana: top100Positions is derived from wp.positions via the
                        // existing useEffect (line ~1419) — top-100 by USD value desc.
                        // skipFetch=true unconditionally for sol since wp owns the data.
                        preloadedPositions={
                          currentChain === "sol"
                            ? (searchQuery.trim() ? filteredTop100Positions : top100Positions)
                            : (searchQuery.trim()
                                ? filteredTop100Positions
                                : top100Positions.length > 0
                                  ? top100Positions
                                  : undefined)
                        }
                        skipFetch={
                          currentChain === "sol"
                            ? true
                            : (activeSpotTab !== 1 || searchQuery.trim() !== "" || top100Positions.length > 0)
                        }
                        showHidden={showHidden}
                        showInSOL={sortByUSD}
                        tokenMetadataCache={tokenMetadataCache}
                        onUpdateCache={updateTokenMetadataCache}
                        isCacheValid={isCacheValid}
                        fallbackPositions={fallbackPositions}
                      />
                    )}
                  </div>
                  <div style={{ display: activeSpotTab === 2 ? 'block' : 'none' }}>
                    {!user?.id && !userLoading ? (
                      <div className="py-8 text-center text-[#52525b] text-sm">
                        Please log in to view your activity.
                      </div>
                    ) : !user?.id ? (
                      <div />
                    ) : (
                      <div className="w-full">
                        {/* Banner: chain-derived trade history is unavailable while the
                            wallet trader index builds (~few hours). Falls back to on-platform
                            trades filtered by primary wallet in the meantime. */}
                        {currentChain === "sol" && wt.isIndexing && (
                          <div className="mb-3 rounded-md border border-[#2A2D32] bg-[#15171C] px-3 py-2 text-xs text-[#9CA3AF]">
                            Chain-wide trade history is being indexed (~few hours). Showing on-platform trades for now.
                          </div>
                        )}
                        <Activity
                          trades={filteredTradeActivity}
                          loading={loadingTradeActivity || (currentChain === "sol" && wt.loading && filteredTradeActivity.length === 0)}
                          onTokenNamesChange={setTokenNames}
                          tokenMetadataCache={tokenMetadataCache}
                          onUpdateCache={updateTokenMetadataCache}
                          isCacheValid={isCacheValid}
                        />
                      </div>
                    )}
                  </div>
                  {/* Predictions sub-tab removed — now a top-level section */}
                </div>
              </div>
            </div>
          )}

          {/* Predictions Section - JTX style */}
          {activeSection === "predictions" && (
            <div className="space-y-3 sm:space-y-4">
              {/* Polygon Wallet */}
              <PolygonWalletCard variant="compact" />
              
              {/* Positions - JTX style */}
              <div className="relative rounded-lg border border-white/[0.06] bg-[#0c0e12]/80 overflow-hidden backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                {/* Mini corner brackets */}
                <div className="pointer-events-none absolute inset-0 rounded-lg overflow-hidden z-10">
                  <div className="absolute left-1.5 top-1.5 h-3 w-3 border-l border-t border-white/[0.08]" />
                  <div className="absolute right-1.5 top-1.5 h-3 w-3 border-r border-t border-white/[0.08]" />
                  <div className="absolute bottom-1.5 left-1.5 h-3 w-3 border-b border-l border-white/[0.08]" />
                  <div className="absolute bottom-1.5 right-1.5 h-3 w-3 border-b border-r border-white/[0.08]" />
                </div>
                <div className="border-b border-white/[0.06] px-4 py-3 bg-[#080a0d]/40">
                  <span className="text-xs font-semibold text-[#f4f4f5] uppercase tracking-wide">Positions & History</span>
                </div>
                <div className="p-4" style={{ minHeight: '200px' }}>
                  {user?.bearerToken ? (
                    <UnifiedPortfolio
                      authToken={user.bearerToken}
                      walletAddress={primaryWalletAddresses?.ethereum}
                      variant="portfolio"
                    />
                  ) : (
                    <PredictionPositions
                      userPublicKey={user?.publicKey}
                      showEmptyState={!!user?.id}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Wallet Section - JTX style */}
          {activeSection === "wallet" && (
            <div className="relative rounded-lg border border-white/[0.06] bg-[#0c0e12]/80 overflow-hidden backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
              {/* Mini corner brackets */}
              <div className="pointer-events-none absolute inset-0 rounded-lg overflow-hidden z-10">
                <div className="absolute left-1.5 top-1.5 h-3 w-3 border-l border-t border-white/[0.08]" />
                <div className="absolute right-1.5 top-1.5 h-3 w-3 border-r border-t border-white/[0.08]" />
                <div className="absolute bottom-1.5 left-1.5 h-3 w-3 border-b border-l border-white/[0.08]" />
                <div className="absolute bottom-1.5 right-1.5 h-3 w-3 border-b border-r border-white/[0.08]" />
              </div>
              {/* Header Row - JTX style */}
              <div className="border-b border-white/[0.06]">
                {/* Left Panel Header */}
                <div className="px-3 sm:px-4 py-3">
                  <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-2">
                    <div className="flex items-center px-2.5 sm:px-3 py-1.5 rounded-md bg-[#080a0d]/60 border border-white/[0.06] w-full sm:w-48">
                      <FaSearch className="text-[#52525b] text-xs mr-2 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Search by name or address"
                        className="bg-transparent text-xs text-[#9CA3AF] placeholder-[#6B7280] focus:outline-none w-full"
                        value={walletSearchQuery}
                        onChange={(e) => setWalletSearchQuery(e.target.value)}
                      />
                      {walletSearchQuery.trim() && (
                        <button
                          onClick={() => setWalletSearchQuery("")}
                          className="text-[#9CA3AF] hover:text-[#f0f5f5] transition-colors ml-2 flex-shrink-0"
                        >
                          <FaTimes className="text-xs" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                    {/* JTX-style toggle */}
                    <button
                      onClick={() => setShowHidden(!showHidden)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all duration-200 cursor-pointer text-xs whitespace-nowrap border ${
                        !showHidden
                          ? "bg-[#18c48c]/10 border-[#18c48c]/30 text-[#18c48c]"
                          : "border-white/[0.06] text-[#71717a] hover:text-[#a1a1aa] hover:border-white/[0.1]"
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
                    {/* JTX-style wallet action buttons */}
                    {(currentChain === "sol" || currentChain === "monad") && (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          className="px-2.5 py-1.5 rounded-md border border-white/[0.06] bg-[#080a0d]/60 text-xs text-[#a1a1aa] hover:bg-white/[0.05] hover:border-white/[0.1] hover:text-[#f4f4f5] transition-all cursor-pointer whitespace-nowrap"
                          onClick={() => {
                            if (currentChain === "sol") {
                              if (isAllSolSelected) clearSelectedWallets("sol");
                              else selectAllWalletsForChain("sol");
                            } else {
                              if (isAllMonSelected) clearSelectedWallets("monad");
                              else selectAllWalletsForChain("monad");
                            }
                          }}
                        >
                          {(currentChain === "sol" ? isAllSolSelected : isAllMonSelected) ? "Unselect all" : "Select all"}
                        </button>
                        <button
                          className="px-2.5 py-1.5 rounded-md border border-white/[0.06] bg-[#080a0d]/60 text-xs text-[#a1a1aa] hover:bg-white/[0.05] hover:border-white/[0.1] hover:text-[#f4f4f5] transition-all cursor-pointer whitespace-nowrap"
                          onClick={() => selectWalletsWithFunds(currentChain as "sol" | "monad")}
                        >
                          Select with funds
                        </button>
                        <button
                          className="px-2.5 py-1.5 rounded-md border border-white/[0.06] bg-[#080a0d]/60 text-xs text-[#a1a1aa] hover:bg-white/[0.05] hover:border-white/[0.1] hover:text-[#f4f4f5] transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50"
                          disabled={redistributing}
                          onClick={() => handleRedistributeFunds("consolidate")}
                          title="Move all selected funds to the primary wallet"
                        >
                          <IoIosGitNetwork size={14} />
                          <span className="hidden sm:inline">{redistributing ? "Working..." : "Consolidate"}</span>
                          <span className="sm:hidden">{redistributing ? "..." : "Consolidate"}</span>
                        </button>
                        <button
                          className="px-2.5 py-1.5 rounded-md border border-white/[0.06] bg-[#080a0d]/60 text-xs text-[#a1a1aa] hover:bg-white/[0.05] hover:border-white/[0.1] hover:text-[#f4f4f5] transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50"
                          disabled={redistributing}
                          onClick={() => handleRedistributeFunds("split")}
                          title="Split selected balance equally across wallets"
                        >
                          <PiNetwork size={14} />
                          <span className="hidden sm:inline">{redistributing ? "Working..." : "Split"}</span>
                          <span className="sm:hidden">{redistributing ? "..." : "Split"}</span>
                        </button>
                      </div>
                    )}
                    <div className="relative">
                      <button
                        onClick={() => setShowImportDropdown(!showImportDropdown)}
                        className="px-2.5 py-1.5 rounded-md border border-white/[0.06] bg-[#080a0d]/60 text-xs text-[#a1a1aa] hover:bg-white/[0.05] hover:border-white/[0.1] hover:text-[#f4f4f5] transition-all cursor-pointer whitespace-nowrap"
                      >
                        Import ▾
                      </button>
                      {showImportDropdown && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setShowImportDropdown(false)}
                          />
                          <div className="absolute top-full mt-1 right-0 bg-[#0c0e12]/95 backdrop-blur-xl border border-white/[0.08] rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-20 min-w-[220px]">
                            <button
                              onClick={() => {
                                setShowImportSolanaModal(true);
                                setShowImportDropdown(false);
                                posthog.capture("wallet_import_initiated", { chain: "sol" });
                              }}
                              className="w-full px-3 py-2.5 text-left text-xs text-[#a1a1aa] hover:bg-white/[0.05] hover:text-[#f4f4f5] transition-colors first:rounded-t-md flex items-center gap-2"
                            >
                              <SolanaIcon size={14} />
                              Import Solana Wallet
                            </button>
                            <button
                              onClick={() => {
                                setShowImportEvmModal(true);
                                setShowImportDropdown(false);
                                posthog.capture("wallet_import_initiated", { chain: "evm" });
                              }}
                              className="w-full px-3 py-2.5 text-left text-xs text-[#a1a1aa] hover:bg-white/[0.05] hover:text-[#f4f4f5] transition-colors last:rounded-b-md flex items-center gap-2"
                            >
                              <img
                                src="./monad_icon.png"
                                alt="Monad"
                                className="object-contain"
                                style={{ width: 14, height: 14 }}
                              />
                              Import EVM Wallet (Monad/Polygon)
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {/* JTX-style create wallet button */}
                    <button
                    onClick={handleCreateWallet}
                    disabled={creatingWallet || !user}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all cursor-pointer
                      ${creatingWallet || !user
                        ? "bg-white/[0.04] text-[#52525b] cursor-not-allowed border border-white/[0.04]" 
                        : "bg-gradient-to-r from-[#18c48c] to-[#0ea371] text-[#030304] hover:brightness-110 border border-[#18c48c]/30 shadow-[0_0_12px_rgba(24,196,140,0.2)]"
}`}
          >
                  {creatingWallet ? "Creating..." : "Create Wallet"}
                </button>
                    </div>
                  </div>
                </div>

                {/* Right Panel Header */}
                {/* <div className="px-2 py-4 border-l border-white/[0.06]">
                  <h3 className="text-[#f0f5f5] font-medium text-sm">Source wallets</h3>
                </div> */}
              </div>

              {/* Table Headers Row - JTX style */}
              <div className="border-b border-white/[0.06] bg-[#080a0d]/40">
                <div className="py-2.5 -mx-3 sm:-mx-4 px-3 sm:px-4">
                  <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1.2fr] gap-2 text-xs text-[#71717a] uppercase tracking-wider">
                    <div className="font-semibold truncate pl-7">Wallet</div>
                    <div className="font-semibold truncate text-center flex items-center justify-center gap-2">
                      <span>
                        Balance ({currentChain === "monad" ? "MON" : "SOL"})
                      </span>
                      <button
                        className="flex items-center justify-center rounded p-1 text-[10px] hover:bg-white/[0.05] transition disabled:opacity-50"
                        title="Refresh balances"
                        onClick={() => refreshBalancesForCurrentChain()}
                        disabled={refreshingBalances}
                      >
                        <FaSync
                          size={10}
                          className={refreshingBalances ? "animate-spin" : ""}
                        />
                      </button>
                    </div>
                    <div className="font-semibold truncate text-center">Holdings</div>
                    <div className="font-semibold truncate text-center">Actions</div>
                  </div>
                </div>
                {/* <div className="px-4 py-2 border-l border-white/[0.06]">
                  <div className="grid grid-cols-4 gap-2 text-xs text-[#9CA3AF]">
                    <div className="font-medium truncate">Wallet</div>
                    <div className="font-medium truncate">
                      Balance ({currentChain === "monad" ? "MON" : "SOL"})
                    </div>
                    <div className="font-medium truncate">Holdings</div>
                    <div className="font-medium truncate">Actions</div>
                  </div>
                </div> */}
              </div>

              {/* Content Area */}
              <div>
                {/* Left Panel Content */}
                <div className="px-3 sm:px-4 py-3">
                  <div className="min-h-[300px]">
                    {!user ? (
                      <div className="flex h-24 flex-col items-center justify-center text-[#52525b] text-sm">
                        Please log in to view your wallets.
                      </div>
                    ) : isWalletsLoading ? (
                      <div className="flex h-24 flex-col items-center justify-center text-[#52525b] text-sm">
                        Loading wallets...
                      </div>
                    ) : wallets.length === 0 ? (
                      <div className="flex h-24 flex-col items-center justify-center text-[#52525b] text-xs">
                        No wallets yet. Click &quot;Create Wallet&quot; to get started.
                      </div>
                    ) : filteredWallets.length === 0 ? (
                      <div className="flex h-24 flex-col items-center justify-center text-[#52525b] text-xs">
                        {walletSearchQuery.trim() 
                          ? `No wallets found matching "${walletSearchQuery}"`
                          : showHidden 
                            ? "No archived wallets"
                            : "No wallets found"}
                      </div>
                    ) : (
                      <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden pr-2 -mr-2 pb-10">
                        {filteredWallets.map((wallet) => {
                          const displayAddress = getAddressForChain(wallet, currentChain);
                          const truncated =
                            displayAddress.length > 8
                              ? `${displayAddress.slice(0, 4)}...${displayAddress.slice(-4)}`
                              : displayAddress;
                          const isSelectable = currentChain === "sol" || currentChain === "monad";
                          const isSelected = isSelectable
                            ? currentChain === "sol"
                              ? selectedSolSet.has(wallet.id)
                              : selectedMonSet.has(wallet.id)
                            : false;
                          const rowBackground = undefined;
                          return (
                            <div
                              key={wallet.id}
                              className="group border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors -mx-3 sm:-mx-4 px-3 sm:px-4"
                              style={{ backgroundColor: rowBackground }}
                            >
                              <div className="flex flex-col sm:grid sm:grid-cols-[2fr_1fr_1fr_1.2fr] gap-3 sm:gap-2 items-start sm:items-center py-3">
                              {/* Wallet + address */}
                                <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
                                  <div
                                    className="relative flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer"
                                    style={{
                                      borderColor: wallet.isPrimary ? "#FF6B35" : isSelected ? "#2563EB" : "rgba(255,255,255,0.06)",
                                      boxShadow: isSelected ? "0 0 0 1px #2563EB" : "none",
                                      backgroundColor: wallet.isPrimary ? "#FF6B3522" : isSelected ? "#2563EB20" : "transparent",
                                    }}
                                    title={
                                      wallet.isPrimary
                                        ? "Primary wallet"
                                        : isSelected
                                          ? "Selected for trading"
                                          : "Wallet"
                                    }
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (currentChain === "sol" || currentChain === "monad") {
                                        const next =
                                          currentChain === "sol"
                                            ? new Set(selectedSolSet)
                                            : new Set(selectedMonSet);
                                        if (isSelected) {
                                          next.delete(wallet.id);
                                        } else {
                                          next.add(wallet.id);
                                        }
                                        setSelectedWalletsForChain(
                                          Array.from(next),
                                          currentChain as "sol" | "monad"
                                        );
                                      }
                                    }}
                                  >
                                    {wallet.isPrimary && (
                                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#FF6B35" }} />
                                    )}
                                    {!wallet.isPrimary && isSelected && (
                                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#2563EB" }} />
                                    )}
                                    {wallet.isPrimary && isSelected && (
                                      <div className="absolute inset-0 rounded border border-[#2563EB] pointer-events-none" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-sm flex items-center gap-2 flex-wrap" style={{ color: wallet.isPrimary ? "#FF6B35" : "#f0f5f5" }}>
                                    {editingWalletId === wallet.id ? (
                                      <>
                                        <input
                                          className="bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-xs text-[#f0f5f5] focus:outline-none focus:ring-1 focus:ring-[#70E0B0]"
                                          value={walletRenameValue}
                                          onChange={(e) => setWalletRenameValue(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              handleRenameWallet();
                                            } else if (e.key === "Escape") {
                                              handleCancelRenameWallet();
                                            }
                                          }}
                                          autoFocus
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        <button
                                          type="button"
                                          className="text-[#70E0B0] hover:text-[#58B890]"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRenameWallet();
                                          }}
                                          disabled={renamingWalletId === wallet.id}
                                        >
                                          <FiCheck size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          className="text-[#9CA3AF] hover:text-[#f0f5f5]"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleCancelRenameWallet();
                                          }}
                                          disabled={renamingWalletId === wallet.id}
                                        >
                                          <FiX size={14} />
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <span>{wallet.label}</span>
                                        <button
                                          type="button"
                                          className="text-[#9CA3AF] hover:text-[#f0f5f5]"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleBeginRenameWallet(wallet);
                                          }}
                                          title="Rename wallet"
                                        >
                                          <FiEdit2 size={14} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                    <div className="text-xs text-[#9CA3AF] font-mono truncate flex items-center gap-1.5">
                                      <span>{truncated || "—"}</span>
                                      <button
                                        className="text-[#9CA3AF] hover:text-[#f0f5f5] flex-shrink-0 ml-1"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (displayAddress) {
                                            navigator.clipboard.writeText(displayAddress).then(
                                              () => toast.success("Address copied"),
                                              () => toast.error("Failed to copy address")
                                            );
                                          }
                                        }}
                                      >
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
                                  </div>
                                </div>

                              {/* Balance */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:justify-center w-full sm:w-auto">
                                  <span className="text-xs text-[#6B7280] sm:hidden">Balance ({currentChain === "monad" ? "MON" : "SOL"}):</span>
                                  <div className="flex items-center gap-1">
                                    {currentChain === 'monad' ? (
                                      <img
                                        src="https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1"
                                        alt="Monad"
                                        className="h-4 w-4 flex-shrink-0 rounded"
                                        style={{ objectFit: 'contain' }}
                                      />
                                    ) : (
                                      <SiSolana
                                        className="h-3 w-3 flex-shrink-0"
                                        aria-hidden="true"
                                        style={{
                                          color: "unset",
                                          fill: "url(#solana-gradient-wallets)",
                                          filter: "none",
                                        }}
                                      />
                                    )}
                                    <span className="text-xs text-white">
                                      {formatSmartNumber(
                                        walletBalances[wallet.id] ?? wallet.balance,
                                      )}
                                    </span>
                                  </div>
                                </div>

                                {/* Holdings */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:justify-center w-full sm:w-auto">
                                  <span className="text-xs text-[#6B7280] sm:hidden">Holdings:</span>
                                  <div className="flex items-center">
                                    <StackedTokenBoxes
                                      count={(() => {
                                        // Priority for Solana wallets:
                                        //   1. Primary wallet → live page-level `positions.length` (most up-to-date,
                                        //      mirrors WS pushes and refetch-on-trade).
                                        //   2. Any other wallet → chain-derived count from chainHoldingsCounts
                                        //      (fetched once per walletList change; reflects on-chain truth).
                                        //   3. Fallback → backend's wallet.holdingsCount (TradeHistory-based).
                                        // For Monad / non-Solana, fall through to backend count.
                                        const addr = wallet.solanaAddress as string | undefined;
                                        if (currentChain === "sol") {
                                          if (wallet.isPrimary && positions.length > 0) {
                                            return positions.length;
                                          }
                                          if (addr && typeof chainHoldingsCounts[addr] === "number") {
                                            return chainHoldingsCounts[addr];
                                          }
                                        }
                                        return wallet.holdingsCount;
                                      })()}
                                    />
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-2 sm:justify-end w-full sm:w-auto">
                                  <span className="text-xs text-[#6B7280] sm:hidden">Actions:</span>
                                  <div className="flex items-center gap-2 flex-wrap">
                                  <button
                                    className={`transition-opacity p-1 ${wallet.isPrimary ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                                    title={wallet.isPrimary ? "Primary wallet" : "Set as primary"}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSetPrimaryWallet(wallet.id);
                                    }}
                                  >
                                    {wallet.isPrimary ? (
                                      <FaStar size={14} color="#FF6B35" />
                                    ) : (
                                      <FaRegStar size={14} color="#9CA3AF" />
                                    )}
                                  </button>
                                  <button
                                    className="px-2 py-1 rounded-full text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 disabled:opacity-60"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      beginDeleteWallet(wallet);
                                    }}
                                    title="Delete wallet"
                                    disabled={deletingWalletId === wallet.id}
                                  >
                                    <FaTrash size={12} />
                                  </button>
                                  <button
                                    className="px-2 sm:px-3 py-1 rounded-full border border-white/[0.06] bg-white/[0.03] text-xs text-neutral-200 hover:bg-white/[0.07] hover:border-white/[0.1] transition-colors cursor-pointer whitespace-nowrap"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleExportWallet(wallet.id);
                                    }}
                                    title="Export wallet"
                                  >
                                    <span className="hidden sm:inline">Export wallet</span>
                                    <span className="sm:hidden">Export</span>
                                  </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Panel Content - Source wallets and Destination sections commented out */}
                {/* <div className="py-3 border-l border-white/[0.06]">
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

                  Destination Section
                  <div className="px-4 py-2 border-t border-white/[0.06] flex items-center justify-between">
                    <h3 className="text-[#f0f5f5] font-medium text-sm">Destination</h3>
                    <button className="px-3 py-1 rounded-full bg-[#70E0B0] text-xs text-[#1A1A1A] hover:brightness-90 transition-colors cursor-pointer">
                      Start Transfer
                    </button>
                  </div>
                  <div className="border-b border-white/[0.06]"></div>
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
                </div> */}
              </div>
            </div>
          )}

          {/* Perpetuals Section */}
          {activeSection === "perpetuals" && (
            <div className="space-y-6">
              {/* Header with Time Range */}
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-light text-[#f0f5f5]">Your holdings</h2>
                <div className="flex items-center gap-2">
                  {["1d", "7d", "30d", "Max"].map((period, index) => (
                    <button
                      key={period}
                      className={`px-3 py-1 text-sm transition-colors cursor-pointer ${
                        period === "Max"
                          ? "text-white font-semibold bg-white/[0.07] border border-white/[0.08] rounded-lg"
                          : "text-[#9CA3AF] hover:text-[#f0f5f5]"
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
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.05] p-6 backdrop-blur-xl">
                  <h3 className="text-[#f0f5f5] font-medium text-lg mb-4">Performance</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-[#9CA3AF] mb-1">
                        All Time Volume
                      </div>
                      <div className="text-2xl font-light text-[#f0f5f5]">$0</div>
                    </div>
                    <div>
                      <div className="text-sm text-[#9CA3AF] mb-1">
                        All Time PNL
                      </div>
                      <div className="text-2xl font-light text-[#f0f5f5]">$0</div>
                      <div className="text-xs text-[#9CA3AF] mt-1">
                        Number of Trades: 0
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-sm text-[#9CA3AF] mb-1">
                        Account Value
                      </div>
                      <div className="text-2xl font-light text-[#f0f5f5]">$0</div>
                    </div>
                  </div>
                </div>

                {/* Right Panel - PNL Chart */}
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.05] p-6 backdrop-blur-xl">
                  <h3 className="text-[#f0f5f5] font-medium text-lg mb-4">PNL</h3>
                  <div className="h-48 flex items-center justify-center relative">
                    {/* Simple chart representation */}
                    <div className="w-full h-24 border-b border-white/[0.06] relative">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-full h-px bg-[#70E0B0]"></div>
                      </div>
                    </div>
                    {/* Chart icon in bottom right */}
                    <div className="absolute bottom-2 right-2 w-6 h-6 border border-white rounded flex items-center justify-center">
                      <span className="text-xs text-[#f0f5f5]">T</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Positions Table */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.05] overflow-hidden backdrop-blur-xl">
                {/* Tabs */}
                <div className="flex border-b border-white/[0.06]">
                  <button
                    className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      activePerpetualsTab === 0
                        ? "text-white font-semibold border border-white/[0.08] bg-white/[0.07] rounded-lg"
                        : "text-neutral-400 font-medium border border-transparent hover:bg-white/[0.04] hover:text-neutral-200 rounded-lg"
                    }`}
                    onClick={() => setActivePerpetualsTab(0)}
                  >
                    Open Positions
                  </button>
                  <button
                    className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      activePerpetualsTab === 1
                        ? "text-white font-semibold border border-white/[0.08] bg-white/[0.07] rounded-lg"
                        : "text-neutral-400 font-medium border border-transparent hover:bg-white/[0.04] hover:text-neutral-200 rounded-lg"
                    }`}
                    onClick={() => setActivePerpetualsTab(1)}
                  >
                    Trade History
                  </button>
                </div>

                {/* Table Headers */}
                <div className="grid grid-cols-9 gap-4 px-6 py-1 text-xs text-[#9CA3AF] border-b border-white/[0.06]">
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
        </div>
        </DockedPanelMarginWrapper>
      </div>
      <Footer />
      
      {/* Import Solana Wallet Modal */}
      <ImportSolanaWalletModal
        isOpen={showImportSolanaModal}
        onClose={() => setShowImportSolanaModal(false)}
        onImported={fetchWallets}
      />

      {/* Import EVM/Monad Wallet Modal */}
      <ImportEvmWalletModal
        isOpen={showImportEvmModal}
        onClose={() => setShowImportEvmModal(false)}
        onImported={fetchWallets}
      />
      
      {/* Export Wallet Modal */}
      <ExportWalletModal
        isOpen={showExportModal}
        onClose={() => {
          setShowExportModal(false);
          setExportWalletId(null);
          setExportWalletAddress(null);
          setForceExportChain(null);
        }}
        walletId={exportWalletId || undefined}
        walletAddress={exportWalletAddress || undefined}
        forceExport={forceExportChain !== null}
        onExported={handleExported}
        onForceExportConfirmed={async () => {
          await acknowledgeBackup();
          await handleExported();
        }}
      />

      {/* Delete Wallet Confirmation */}
      {deleteModalOpen && deleteTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3 sm:px-4">
          <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-white/[0.05] backdrop-blur-xl p-4 sm:p-5 shadow-2xl mx-3 sm:mx-0">
            <div className="mb-3 flex items-center gap-2 text-[#f0f5f5]">
              <span className="text-lg">⚠️ Deletion Reminder</span>
            </div>
            <p className="text-sm text-[#c7c9d1] mb-3 leading-relaxed">
              This archives the wallet and removes it from your list. Funds stay on-chain, but this wallet will no longer be used for trading. Export any keys you need first.
            </p>
            <p className="text-sm text-[#c7c9d1] mb-3 leading-relaxed">
              Wallet: <span className="text-[#70E0B0]">{deleteTarget.label}</span>
            </p>
            <label className="flex items-center gap-2 text-sm text-[#c7c9d1]">
              <input
                type="checkbox"
                checked={deleteRiskAck}
                onChange={(e) => setDeleteRiskAck(e.target.checked)}
                className="h-4 w-4 accent-[#70E0B0]"
              />
              I understand this will archive the wallet and stop its trades.
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteTarget(null);
                }}
                className="rounded-md border border-white/[0.06] px-4 py-2 text-sm text-[#c7c9d1] hover:border-white/[0.1]"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteWallet}
                disabled={!deleteRiskAck || deletingWalletId === deleteTarget.id}
                className="flex items-center gap-2 rounded-md bg-[#ef4444] px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60"
              >
                <FaTrash size={12} />
                {deletingWalletId === deleteTarget.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
