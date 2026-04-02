// src/components/predictions/UnifiedPortfolio.tsx
// Unified portfolio component with gamified stats, tabs for Overview/Positions/Orders/History
// Enhanced with auto-settlement status display and polished UI

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineClock,
  HiOutlineRefresh,
  HiOutlineExternalLink,
  HiOutlineTrash,
  HiOutlineExclamationCircle,
  HiOutlineCash,
  HiOutlineChartBar,
  HiOutlineFire,
  HiOutlineStar,
  HiOutlineCollection,
  HiOutlineClipboardList,
  HiOutlineBadgeCheck,
  HiOutlineSparkles,
  HiOutlineShieldCheck,
  HiOutlineLightningBolt,
} from 'react-icons/hi';
import {
  getUserPredictionPositions,
  getUserPredictionTrades,
  getPolymarketOpenOrders,
  getPolymarketBalance,
  cancelPolymarketOrder,
  cancelAllPolymarketOrders,
  sellTalarionPosition,
  type PredictionPosition,
  type PredictionTrade,
  type PolymarketOpenOrder,
  type PolymarketBalance,
} from '~/utils/api';
import { PredictionTheme, PortfolioTheme } from './theme';
import { createPolymarketTradeToast } from '~/utils/tradeToast';

// Types
type TabType = 'overview' | 'positions' | 'orders' | 'history';

interface ClaimablePosition {
  conditionId: string;
  marketTitle: string;
  tokenId: string;
  side: 'YES' | 'NO';
  tokenAmount: number;
  claimableAmount: number;
  resolved: boolean;
  winningOutcome: 'YES' | 'NO' | null;
  isWinner: boolean;
}

interface ClaimedWinning {
  conditionId: string;
  marketTitle: string;
  side: 'YES' | 'NO';
  amount: number;
  txHash: string;
  claimedAt: string;
}

interface WinningsStats {
  totalWinnings: number;
  totalLosses: number;
  netProfit: number;
  winRate: number;
  totalTrades: number;
  winStreak: number;
  bestWin: number;
}

interface UnifiedPortfolioProps {
  authToken?: string;
  walletAddress?: string;
  onClaimSuccess?: () => void;
  /** Controls color scheme: 'predictions' for prediction pages, 'portfolio' for portfolio page */
  variant?: 'predictions' | 'portfolio';
}

// localStorage key for claimed history
const CLAIMED_HISTORY_KEY = 'polymarket_claimed_history';

// Helper functions for claimed history
function loadClaimedHistory(): ClaimedWinning[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(CLAIMED_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveClaimedHistory(history: ClaimedWinning[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CLAIMED_HISTORY_KEY, JSON.stringify(history));
  } catch {
    console.error('Failed to save claimed history');
  }
}

function addClaimToHistory(claim: ClaimedWinning): ClaimedWinning[] {
  const history = loadClaimedHistory();
  if (history.some(h => h.txHash === claim.txHash)) {
    return history;
  }
  const updated = [claim, ...history];
  saveClaimedHistory(updated);
  return updated;
}

function getClaimedConditionIds(): Set<string> {
  const history = loadClaimedHistory();
  return new Set(history.map(h => h.conditionId));
}

// API functions for winnings
async function getMarketResolutionStatus(conditionId: string): Promise<{
  resolved: boolean;
  winningOutcome: 'YES' | 'NO' | null;
}> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/prediction/polymarket/market-status?conditionId=${conditionId}`
  );
  const data = await response.json();
  if (data.success) {
    return {
      resolved: data.data.resolved,
      winningOutcome: data.data.winningOutcome,
    };
  }
  return { resolved: false, winningOutcome: null };
}

async function redeemWinnings(conditionId: string, authToken: string): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
}> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/prediction/polymarket/redeem`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ conditionId }),
    }
  );
  const data = await response.json();
  return {
    success: data.success,
    txHash: data.data?.txHash,
    error: data.error,
  };
}

// Theme type — use Record to avoid `never` from const literal union conflicts
type Theme = Record<string, string>;

// ── Stats Header ─────────────────────────────────────────────────────────

function StatsHeader({
  balance,
  netPnl,
  winRate,
  streak,
  positionsValue,
  settledCount,
  isLoading,
  theme: C,
}: {
  balance: number;
  netPnl: number;
  winRate: number;
  streak: number;
  positionsValue: number;
  settledCount: number;
  isLoading: boolean;
  theme: Theme;
}) {
  const stats = [
    { label: 'Balance', icon: HiOutlineCash, value: `$${balance.toFixed(2)}`, color: C.text },
    { label: 'Net P&L', icon: HiOutlineChartBar, value: `${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)}`, color: netPnl >= 0 ? C.green : C.red },
    { label: 'Positions', icon: HiOutlineCollection, value: `$${positionsValue.toFixed(2)}`, color: C.text },
    { label: 'Win Rate', icon: HiOutlineStar, value: `${winRate.toFixed(0)}%`, color: winRate >= 50 ? C.green : C.text, hideMobile: true },
    { label: settledCount > 0 ? 'Settled' : 'Streak', icon: settledCount > 0 ? HiOutlineShieldCheck : HiOutlineFire, value: `${settledCount > 0 ? settledCount : streak}`, color: settledCount > 0 ? C.green : (streak > 0 ? '#FBBF24' : C.text), hideMobile: true },
  ];

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}` }}>
      <div className="grid grid-cols-3 sm:grid-cols-5">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className={`px-3 py-3 text-center ${s.hideMobile ? 'hidden sm:block' : ''}`}
              style={{ borderRight: i < stats.length - 1 ? `1px solid ${C.border}` : undefined }}
            >
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Icon className="w-3 h-3" style={{ color: C.muted }} />
                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: C.muted }}>{s.label}</span>
              </div>
              <div className="text-base sm:text-lg font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab Navigation ───────────────────────────────────────────────────────

function TabNavigation({
  activeTab,
  onChange,
  counts,
  theme: C,
}: {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
  counts: { positions: number; orders: number; history: number; claimable: number; settled: number };
  theme: Theme;
}) {
  const tabs: { key: TabType; label: string; icon: React.ComponentType<{ className?: string }>; count?: number; highlight?: boolean }[] = [
    {
      key: 'overview',
      label: 'Overview',
      icon: HiOutlineBadgeCheck,
      count: (counts.claimable + counts.settled) > 0 ? counts.claimable + counts.settled : undefined,
      highlight: counts.claimable > 0,
    },
    { key: 'positions', label: 'Positions', icon: HiOutlineCollection, count: counts.positions },
    { key: 'orders', label: 'Orders', icon: HiOutlineClipboardList, count: counts.orders },
    { key: 'history', label: 'History', icon: HiOutlineChartBar, count: counts.history > 0 ? counts.history : undefined },
  ];

  return (
    <div className="flex gap-0.5 rounded-xl p-1" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.key;
        const TabIcon = tab.icon;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all rounded-md flex-1 justify-center"
            style={{
              color: isActive ? C.text : C.muted,
              backgroundColor: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
            }}
          >
            <TabIcon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[18px] text-center"
                style={{
                  backgroundColor: tab.highlight ? C.green : (isActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'),
                  color: tab.highlight ? '#000' : (isActive ? C.text : C.muted),
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────

export default function UnifiedPortfolio({
  authToken,
  walletAddress,
  onClaimSuccess,
  variant = 'predictions',
}: UnifiedPortfolioProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Select theme based on variant, with glass-style overrides for uniform look
  const baseTheme = variant === 'portfolio' ? PortfolioTheme : PredictionTheme;
  const C = {
    ...baseTheme,
    // Use transparent surfaces so inner cards blend with the parent glassy container
    surface: 'rgba(255,255,255,0.02)',
    border: 'rgba(255,255,255,0.07)',
  };

  // ── localStorage snapshot for instant hydration ──
  const SNAPSHOT_KEY = 'polymarket_portfolio_snapshot';

  const loadSnapshot = (): any => {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return null;
      const snap = JSON.parse(raw);
      // Expire after 10 minutes
      if (Date.now() - (snap._ts || 0) > 10 * 60_000) return null;
      return snap;
    } catch { return null; }
  };

  const saveSnapshot = (data: {
    positions: PredictionPosition[];
    settledPositions: PredictionPosition[];
    openOrders: PolymarketOpenOrder[];
    trades: PredictionTrade[];
    balance: PolymarketBalance | null;
    stats: WinningsStats;
  }) => {
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ ...data, _ts: Date.now() }));
    } catch {}
  };

  // Hydrate from snapshot (instant) or start empty
  const snapshot = useRef(loadSnapshot()).current;

  // Portfolio data state — initialize from snapshot if available
  const [positions, setPositions] = useState<PredictionPosition[]>(snapshot?.positions || []);
  const [settledPositions, setSettledPositions] = useState<PredictionPosition[]>(snapshot?.settledPositions || []);
  const [openOrders, setOpenOrders] = useState<PolymarketOpenOrder[]>(snapshot?.openOrders || []);
  const [trades, setTrades] = useState<PredictionTrade[]>(snapshot?.trades || []);
  const [balance, setBalance] = useState<PolymarketBalance | null>(snapshot?.balance || null);

  // Talarion positions (AI Markets)
  const [talarionPositions, setTalarionPositions] = useState<PredictionPosition[]>([]);
  const [talarionTrades, setTalarionTrades] = useState<PredictionTrade[]>([]);
  const [sellingPositionId, setSellingPositionId] = useState<number | null>(null);
  const [sellConfirm, setSellConfirm] = useState<{ position: PredictionPosition } | null>(null);

  // Winnings state
  const [claimablePositions, setClaimablePositions] = useState<ClaimablePosition[]>([]);
  const [claimedHistory, setClaimedHistory] = useState<ClaimedWinning[]>([]);
  const [stats, setStats] = useState<WinningsStats>(snapshot?.stats || {
    totalWinnings: 0,
    totalLosses: 0,
    netProfit: 0,
    winRate: 0,
    totalTrades: 0,
    winStreak: 0,
    bestWin: 0,
  });

  // UI state — skip loading spinner if we have a snapshot
  const [isLoading, setIsLoading] = useState(!snapshot);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<{ success: boolean; message: string } | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  // Load claimed history on mount
  useEffect(() => {
    let history = loadClaimedHistory();

    // Seed the known NHL redemption for this wallet
    const NHL_CONDITION_ID = '0x92cd86aeee9419974506a4c15408612f999a21e0d18b1770efb4308479a869bd';
    const NHL_TX_HASH = '0xf7efe0f1a5ea354d17117cc71f7aab6769dd4850fc355d5f80860d697456e79f';

    if (walletAddress?.toLowerCase() === '0xb9f9cc480f9ee681e204ed8ef64cfc237371fce2') {
      const alreadyHasNhlClaim = history.some(
        h => h.txHash === NHL_TX_HASH || h.conditionId === NHL_CONDITION_ID
      );

      if (!alreadyHasNhlClaim) {
        const seedClaim: ClaimedWinning = {
          conditionId: NHL_CONDITION_ID,
          marketTitle: 'NHL: Sharks vs. Canucks (Jan 27)',
          side: 'YES',
          amount: 2.62,
          txHash: NHL_TX_HASH,
          claimedAt: '2025-01-28T00:00:00.000Z',
        };
        history = addClaimToHistory(seedClaim);
      }
    }

    setClaimedHistory(history);
  }, [walletAddress]);

  // Calculate stats from positions and claimed history
  const calculateStats = useCallback((claimable: ClaimablePosition[], claimed: ClaimedWinning[]) => {
    const winners = claimable.filter(p => p.isWinner);
    const losers = claimable.filter(p => p.resolved && !p.isWinner);

    const claimedTotal = claimed.reduce((sum, c) => sum + c.amount, 0);
    const totalWinnings = winners.reduce((sum, p) => sum + p.claimableAmount, 0) + claimedTotal;
    const totalLosses = losers.reduce((sum, p) => sum + p.tokenAmount * 0.5, 0);

    const totalWins = winners.length + claimed.length;
    const totalTrades = claimable.length + claimed.length;

    const positionBestWin = winners.length > 0 ? Math.max(...winners.map(w => w.claimableAmount)) : 0;
    const claimedBestWin = claimed.length > 0 ? Math.max(...claimed.map(c => c.amount)) : 0;
    const bestWin = Math.max(positionBestWin, claimedBestWin);

    let streak = 0;
    for (const p of claimable) {
      if (p.isWinner) streak++;
      else break;
    }
    if (claimed.length > 0 && winners.length === 0) {
      streak += claimed.length;
    }

    setStats({
      totalWinnings,
      totalLosses,
      netProfit: totalWinnings - totalLosses,
      winRate: totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0,
      totalTrades,
      winStreak: streak,
      bestWin,
    });
  }, []);

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!authToken) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel — include settled positions and Talarion positions
      const [positionsRes, settledRes, ordersRes, tradesRes, balanceRes, talarionActiveRes, talarionSettledRes, talarionTradesRes] = await Promise.all([
        getUserPredictionPositions(authToken, 'polymarket', 'active').catch(() => null),
        getUserPredictionPositions(authToken, 'polymarket', 'settled').catch(() => null),
        getPolymarketOpenOrders(authToken).catch(() => null),
        getUserPredictionTrades(authToken, 'polymarket', 20).catch(() => null),
        getPolymarketBalance(authToken).catch(() => null),
        getUserPredictionPositions(authToken, 'talarion', 'active').catch(() => null),
        getUserPredictionPositions(authToken, 'talarion', 'settled').catch(() => null),
        getUserPredictionTrades(authToken, 'talarion', 20).catch(() => null),
      ]);

      const claimedConditionIds = getClaimedConditionIds();

      const freshPositions = positionsRes?.success && positionsRes.data
        ? positionsRes.data.filter((p: PredictionPosition) => !p.conditionId || !claimedConditionIds.has(p.conditionId))
        : positions;
      const freshSettled = settledRes?.success && settledRes.data ? settledRes.data : settledPositions;
      const freshOrders = ordersRes?.success && ordersRes.data ? ordersRes.data : openOrders;
      const freshTrades = tradesRes?.success && tradesRes.data ? tradesRes.data : trades;
      const freshBalance = balanceRes?.success && balanceRes.data ? balanceRes.data : balance;

      // Talarion positions — normalize numeric fields (TypeORM returns strings)
      const normalizeTalarionPositions = (data: PredictionPosition[]) =>
        data.map(p => ({
          ...p,
          tokenAmount: Number(p.tokenAmount) || 0,
          avgEntryPrice: Number(p.avgEntryPrice) || 0,
          costBasis: Number(p.costBasis) || 0,
          currentValue: p.currentValue != null ? Number(p.currentValue) : undefined,
          unrealizedPnl: p.unrealizedPnl != null ? Number(p.unrealizedPnl) : undefined,
          settlementAmount: p.settlementAmount != null ? Number(p.settlementAmount) : undefined,
        }));

      const freshTalarionActive = talarionActiveRes?.success && talarionActiveRes.data
        ? normalizeTalarionPositions(talarionActiveRes.data.filter((p: PredictionPosition) => (Number(p.tokenAmount) || 0) > 0.001))
        : talarionPositions;
      const freshTalarionSettled = talarionSettledRes?.success && talarionSettledRes.data
        ? normalizeTalarionPositions(talarionSettledRes.data)
        : [];
      const freshTalarionTrades = talarionTradesRes?.success && talarionTradesRes.data
        ? talarionTradesRes.data
        : talarionTrades;

      setPositions(freshPositions);
      setSettledPositions([...freshSettled, ...freshTalarionSettled]);
      setOpenOrders(freshOrders);
      setTrades(freshTrades);
      setBalance(freshBalance);
      setTalarionPositions(freshTalarionActive);
      setTalarionTrades(freshTalarionTrades);

      // Check for claimable winnings from user's REAL positions
      const userPositionsForClaim: ClaimablePosition[] = (positionsRes?.data || [])
        .filter((p: PredictionPosition) => p.conditionId && !claimedConditionIds.has(p.conditionId))
        .map((p: PredictionPosition) => ({
          conditionId: p.conditionId || '',
          marketTitle: p.marketTitle || p.marketId || 'Unknown Market',
          tokenId: p.tokenId || '',
          side: (p.side || 'YES').toUpperCase() as 'YES' | 'NO',
          tokenAmount: Number(p.tokenAmount) || 0,
          claimableAmount: 0,
          resolved: false,
          winningOutcome: null,
          isWinner: false,
        }));

      if (userPositionsForClaim.length > 0) {
        const updatedPositions = await Promise.all(
          userPositionsForClaim.map(async (pos) => {
            try {
              const status = await getMarketResolutionStatus(pos.conditionId);
              const isWinner = status.resolved && status.winningOutcome === pos.side;
              return {
                ...pos,
                resolved: status.resolved,
                winningOutcome: status.winningOutcome,
                isWinner,
                claimableAmount: isWinner ? pos.tokenAmount : 0,
              };
            } catch {
              return pos;
            }
          })
        );
        setClaimablePositions(updatedPositions);
        calculateStats(updatedPositions, claimedHistory);
      } else {
        setClaimablePositions([]);
        calculateStats([], claimedHistory);
      }
      // Save snapshot for instant hydration on next visit
      saveSnapshot({
        positions: freshPositions,
        settledPositions: freshSettled,
        openOrders: freshOrders,
        trades: freshTrades,
        balance: freshBalance,
        stats,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load portfolio data');
    } finally {
      setIsLoading(false);
    }
  }, [authToken, calculateStats, claimedHistory]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh portfolio every 30s to prevent stale data
  useEffect(() => {
    if (!authToken) return;
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [authToken, fetchData]);

  // Also refresh when the tab becomes visible (user switches back to the tab)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && authToken) fetchData();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [authToken, fetchData]);

  // Pick up balance broadcasts from Header for instant display
  useEffect(() => {
    const handleBalanceData = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (data) setBalance(data);
    };
    window.addEventListener('polygon-balance-data', handleBalanceData);
    return () => window.removeEventListener('polygon-balance-data', handleBalanceData);
  }, []);

  // Handlers
  const handleClaim = async (position: ClaimablePosition) => {
    if (!authToken || claimingId) return;

    setClaimingId(position.conditionId);
    setClaimResult(null);

    try {
      const result = await redeemWinnings(position.conditionId, authToken);

      if (result.success && result.txHash) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);

        setClaimResult({
          success: true,
          message: `Claimed $${position.claimableAmount.toFixed(2)}!`,
        });

        const newClaim: ClaimedWinning = {
          conditionId: position.conditionId,
          marketTitle: position.marketTitle,
          side: position.side,
          amount: position.claimableAmount,
          txHash: result.txHash,
          claimedAt: new Date().toISOString(),
        };
        const updatedHistory = addClaimToHistory(newClaim);
        setClaimedHistory(updatedHistory);

        setClaimablePositions(prev =>
          prev.map(p =>
            p.conditionId === position.conditionId
              ? { ...p, claimableAmount: 0 }
              : p
          )
        );

        onClaimSuccess?.();
      } else {
        setClaimResult({
          success: false,
          message: result.error || 'Claim failed. Please try again.',
        });
      }
    } catch (err: any) {
      setClaimResult({
        success: false,
        message: err.message || 'Claim failed',
      });
    } finally {
      setClaimingId(null);
    }
  };

  const handleNavigateToMarket = useCallback((position: PredictionPosition) => {
    const isReadableSlug = (str: string | undefined): boolean => {
      if (!str) return false;
      if (str.startsWith('0x')) return false;
      if (/^\d+$/.test(str)) return false;
      return str.includes('-') || /[g-zG-Z]/.test(str);
    };

    let marketSlug: string | undefined;
    if (isReadableSlug(position.marketId)) {
      marketSlug = position.marketId;
    } else if (isReadableSlug(position.ticker)) {
      marketSlug = position.ticker;
    } else if (position.conditionId) {
      marketSlug = position.conditionId;
    } else {
      marketSlug = position.marketId;
    }

    if (marketSlug) {
      router.push(`/predictions/${encodeURIComponent(marketSlug)}`);
    }
  }, [router]);

  const handleCancelOrder = async (orderId: string) => {
    if (!authToken || cancellingOrderId) return;

    setCancellingOrderId(orderId);
    try {
      const result = await cancelPolymarketOrder(orderId, authToken);
      if (result?.success) {
        setOpenOrders(prev => prev.filter(o => o.id !== orderId));
      }
    } catch (err: any) {
      console.error('Failed to cancel order:', err.message);
    } finally {
      setCancellingOrderId(null);
    }
  };

  const handleCancelAllOrders = async () => {
    if (!authToken || cancellingOrderId) return;

    setCancellingOrderId('all');
    try {
      const result = await cancelAllPolymarketOrders(authToken);
      if (result?.success) {
        setOpenOrders([]);
      }
    } catch (err: any) {
      console.error('Failed to cancel all orders:', err.message);
    } finally {
      setCancellingOrderId(null);
    }
  };

  // Talarion sell handler
  const handleTalarionSell = async (position: PredictionPosition) => {
    if (!authToken || sellingPositionId) return;
    setSellingPositionId(position.id);

    const title = (position.marketTitle && !position.marketTitle.startsWith('0x'))
      ? position.marketTitle : 'AI Market';
    const sellToast = createPolymarketTradeToast({
      label: `Sell ${position.side} — ${title.slice(0, 35)}`,
      tokenName: title,
    });

    try {
      const result = await sellTalarionPosition(
        authToken,
        position.marketId,
        (position.side?.toUpperCase() || 'YES') as 'YES' | 'NO',
        {},
      );
      if (result?.success) {
        const data = result.data;
        sellToast.complete(
          `Position closed — $${data.proceeds.toFixed(2)} margin returned`,
          data.txHash,
        );
        // Refresh positions
        const freshRes = await getUserPredictionPositions(authToken, 'talarion', 'active').catch(() => null);
        if (freshRes?.success && freshRes.data) {
          setTalarionPositions(freshRes.data.filter((p: PredictionPosition) => (Number(p.tokenAmount) || 0) > 0.001).map(p => ({
            ...p,
            tokenAmount: Number(p.tokenAmount) || 0,
            avgEntryPrice: Number(p.avgEntryPrice) || 0,
            costBasis: Number(p.costBasis) || 0,
          })));
        }
        setSellConfirm(null);
      }
    } catch (err: any) {
      console.error('[Talarion Sell] Error:', err.message);
      sellToast.error(err.message || 'Sell failed');
    } finally {
      setSellingPositionId(null);
    }
  };

  // Calculated values
  const totalPositionValue = [...positions, ...talarionPositions].reduce((sum, p) => {
    const value = Number(p.currentValue) || Number(p.costBasis) || 0;
    return sum + value;
  }, 0);

  const readyToClaim = claimablePositions.filter(p => p.isWinner && p.claimableAmount > 0);
  const pendingResolution = claimablePositions.filter(p => !p.resolved);

  // Auto-settled positions that the user won (redeemed by backend)
  const autoSettledWins = settledPositions.filter(p =>
    p.resolution && p.side?.toUpperCase() === p.resolution.toUpperCase() && Number(p.settlementAmount) > 0
  );
  const autoSettledLosses = settledPositions.filter(p =>
    p.resolution && p.side?.toUpperCase() !== p.resolution.toUpperCase()
  );

  // Not logged in state
  if (!authToken) {
    return (
      <div className="py-8 text-center">
        <div
          className="w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center"
          style={{ backgroundColor: C.purpleBg }}
        >
          <HiOutlineCollection className="w-7 h-7" style={{ color: C.purple }} />
        </div>
        <h3 className="text-lg font-medium mb-2" style={{ color: C.text }}>
          Sign in to View Portfolio
        </h3>
        <p className="text-sm max-w-md mx-auto" style={{ color: C.muted }}>
          Connect your wallet to see your prediction market positions, orders, and winnings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Stats Header */}
      <StatsHeader
        balance={balance?.usdc || 0}
        netPnl={stats.netProfit}
        winRate={stats.winRate}
        streak={stats.winStreak}
        positionsValue={totalPositionValue}
        settledCount={settledPositions.length}
        isLoading={isLoading}
        theme={C}
      />

      {/* Tab Navigation */}
      <TabNavigation
        activeTab={activeTab}
        onChange={setActiveTab}
        counts={{
          positions: positions.length + talarionPositions.length,
          orders: openOrders.length,
          history: trades.length + talarionTrades.length,
          claimable: readyToClaim.length,
          settled: autoSettledWins.length,
        }}
        theme={C}
      />

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {/* ── Overview Tab ── */}
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-2"
          >
            {/* Auto-Settlement Banner */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{
              backgroundColor: C.surface,
              border: `1px solid ${C.border}`,
            }}>
              <HiOutlineShieldCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: C.green }} />
              <span className="text-[11px]" style={{ color: C.muted }}>
                Markets are auto-settled when they resolve. Winning tokens are redeemed automatically.
              </span>
            </div>

            {/* Claimable Winnings (manual claims still pending) */}
            {readyToClaim.length > 0 && (
              <div className="rounded-xl overflow-hidden relative" style={{
                border: `1px solid ${C.green}40`,
                background: `linear-gradient(135deg, ${C.green}06, transparent)`,
              }}>
                {/* Glow effect */}
                <div className="absolute inset-0 pointer-events-none" style={{
                  boxShadow: `inset 0 0 40px ${C.green}08`,
                }} />

                <div className="flex items-center justify-between px-4 py-3 relative" style={{
                  borderBottom: `1px solid ${C.green}20`,
                }}>
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{
                        background: `linear-gradient(135deg, ${C.green}, #22C55E)`,
                      }}>
                        <HiOutlineSparkles className="w-4.5 h-4.5 text-black" />
                      </div>
                      {/* Pulse dot */}
                      <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full animate-pulse" style={{
                        backgroundColor: C.green,
                        boxShadow: `0 0 8px ${C.green}`,
                      }} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold" style={{ color: C.text }}>Ready to Claim</h4>
                      <p className="text-[11px]" style={{ color: C.muted }}>
                        {readyToClaim.length} winning {readyToClaim.length === 1 ? 'position' : 'positions'}
                      </p>
                    </div>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{
                    background: `linear-gradient(135deg, ${C.green}20, ${C.green}10)`,
                    color: C.green,
                    border: `1px solid ${C.green}30`,
                  }}>
                    ${readyToClaim.reduce((sum, p) => sum + p.claimableAmount, 0).toFixed(2)}
                  </div>
                </div>

                <div className="divide-y" style={{ borderColor: `${C.green}15` }}>
                  {readyToClaim.map((position) => (
                    <ClaimableRow
                      key={position.conditionId}
                      position={position}
                      onClaim={handleClaim}
                      isClaiming={claimingId === position.conditionId}
                      theme={C}
                    />
                  ))}
                </div>

                {/* Claim Result Toast */}
                <AnimatePresence>
                  {claimResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -20, scale: 0.95 }}
                      className="mx-4 mb-4 p-3 rounded-lg flex items-center gap-2"
                      style={{
                        backgroundColor: claimResult.success ? `${C.green}15` : `${C.red}15`,
                        border: `1px solid ${claimResult.success ? C.green : C.red}40`,
                      }}
                    >
                      {claimResult.success ? (
                        <HiOutlineCheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: C.green }} />
                      ) : (
                        <HiOutlineExclamationCircle className="w-5 h-5 flex-shrink-0" style={{ color: C.red }} />
                      )}
                      <span className="text-sm font-medium" style={{ color: claimResult.success ? C.green : C.red }}>
                        {claimResult.message}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Pending Resolution */}
            {pendingResolution.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{
                backgroundColor: C.surface,
                border: `1px solid ${C.border}`,
              }}>
                <div className="flex items-center gap-2.5 px-4 py-2.5" style={{
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  <HiOutlineClock className="w-4 h-4 flex-shrink-0" style={{ color: '#FBBF24' }} />
                  <h4 className="text-[13px] font-semibold" style={{ color: C.text }}>Pending Resolution</h4>
                  <span className="text-[11px]" style={{ color: C.muted }}>
                    {pendingResolution.length} position{pendingResolution.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div>
                  {pendingResolution.map((position) => (
                    <PendingRow key={position.conditionId} position={position} theme={C} />
                  ))}
                </div>
              </div>
            )}

            {/* Auto-Settled Results */}
            {(autoSettledWins.length > 0 || autoSettledLosses.length > 0) && (
              <div className="rounded-xl overflow-hidden" style={{
                backgroundColor: C.surface,
                border: `1px solid ${C.border}`,
              }}>
                <div className="flex items-center justify-between px-4 py-3" style={{
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{
                      background: `linear-gradient(135deg, ${C.green}20, ${C.purple}20)`,
                    }}>
                      <HiOutlineLightningBolt className="w-4.5 h-4.5" style={{ color: C.green }} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold" style={{ color: C.text }}>Auto-Settled</h4>
                      <p className="text-[11px]" style={{ color: C.muted }}>
                        {autoSettledWins.length} won, {autoSettledLosses.length} lost
                      </p>
                    </div>
                  </div>
                  {autoSettledWins.length > 0 && (
                    <div className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{
                      backgroundColor: C.greenBg, color: C.green,
                    }}>
                      +${autoSettledWins.reduce((s, p) => s + (Number(p.settlementAmount) || 0), 0).toFixed(2)}
                    </div>
                  )}
                </div>

                <div className="space-y-0.5 p-1">
                  {autoSettledWins.map((pos) => (
                    <SettledRow key={pos.id} position={pos} isWinner={true} theme={C} />
                  ))}
                  {autoSettledLosses.map((pos) => (
                    <SettledRow key={pos.id} position={pos} isWinner={false} theme={C} />
                  ))}
                </div>
              </div>
            )}

            {/* Claimed History */}
            {claimedHistory.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{
                backgroundColor: C.surface,
                border: `1px solid ${C.border}`,
              }}>
                <div className="flex items-center justify-between px-4 py-3" style={{
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{
                      backgroundColor: C.greenBg,
                    }}>
                      <HiOutlineBadgeCheck className="w-4.5 h-4.5" style={{ color: C.green }} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold" style={{ color: C.text }}>Claimed History</h4>
                      <p className="text-[11px]" style={{ color: C.muted }}>
                        {claimedHistory.length} {claimedHistory.length === 1 ? 'redemption' : 'redemptions'}
                      </p>
                    </div>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{
                    backgroundColor: C.greenBg, color: C.green,
                  }}>
                    ${claimedHistory.reduce((sum, c) => sum + c.amount, 0).toFixed(2)} total
                  </div>
                </div>

                <div className="space-y-0.5 p-1">
                  {claimedHistory.map((claim) => (
                    <ClaimedRow key={claim.txHash} claim={claim} theme={C} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && readyToClaim.length === 0 && pendingResolution.length === 0 &&
             claimedHistory.length === 0 && autoSettledWins.length === 0 && autoSettledLosses.length === 0 && (
              <div className="text-center py-10 rounded-xl relative overflow-hidden" style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{
                  background: `linear-gradient(135deg, ${C.purple}15, ${C.green}15)`,
                  border: `1px solid ${C.purple}20`,
                }}>
                  <HiOutlineSparkles className="w-8 h-8" style={{ color: C.purple }} />
                </div>
                <h3 className="text-base font-semibold mb-1.5" style={{ color: C.text }}>
                  No Winnings Yet
                </h3>
                <p className="text-sm max-w-sm mx-auto" style={{ color: C.muted }}>
                  Make predictions to see your results here. Winning positions are auto-settled when markets resolve.
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Positions Tab ── */}
        {activeTab === 'positions' && (
          <motion.div
            key="positions"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-2"
          >
            {isLoading ? (
              <LoadingState message="Loading positions..." theme={C} />
            ) : (positions.length === 0 && talarionPositions.length === 0) ? (
              <EmptyState message="No open positions" icon={HiOutlineCollection} theme={C} />
            ) : (
              <>
                {/* Polymarket Positions */}
                {positions.length > 0 && talarionPositions.length > 0 && (
                  <div className="flex items-center gap-2 pb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>Polymarket</span>
                    <div className="flex-1 h-px" style={{ backgroundColor: C.border }} />
                  </div>
                )}
                {positions.map((position, index) => (
                  <PositionRow
                    key={position.id}
                    position={position}
                    index={index}
                    onClick={() => handleNavigateToMarket(position)}
                    theme={C}
                  />
                ))}

                {/* Talarion AI Market Positions */}
                {talarionPositions.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 pt-2 pb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.purple }}>Predictions</span>
                      <div className="flex-1 h-px" style={{ backgroundColor: C.border }} />
                    </div>
                    {talarionPositions.map((position, index) => (
                      <TalarionPositionRow
                        key={position.id}
                        position={position}
                        index={index}
                        isSelling={sellingPositionId === position.id}
                        onSell={() => setSellConfirm({ position })}
                        theme={C}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* ── Orders Tab ── */}
        {activeTab === 'orders' && (
          <motion.div
            key="orders"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-2"
          >
            {openOrders.length > 0 && (
              <div className="flex justify-end mb-1">
                <button
                  onClick={handleCancelAllOrders}
                  disabled={cancellingOrderId !== null}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ backgroundColor: C.redBg, color: C.red }}
                >
                  <HiOutlineTrash className="w-3.5 h-3.5" />
                  Cancel All
                </button>
              </div>
            )}
            {isLoading ? (
              <LoadingState message="Loading orders..." theme={C} />
            ) : openOrders.length === 0 ? (
              <EmptyState message="No open orders" icon={HiOutlineClipboardList} theme={C} />
            ) : (
              openOrders.map((order, index) => (
                <OpenOrderRow
                  key={order.id}
                  order={order}
                  index={index}
                  onCancel={handleCancelOrder}
                  isCancelling={cancellingOrderId === order.id || cancellingOrderId === 'all'}
                  theme={C}
                />
              ))
            )}
          </motion.div>
        )}

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-2"
          >
            {isLoading ? (
              <LoadingState message="Loading trade history..." theme={C} />
            ) : (trades.length === 0 && talarionTrades.length === 0) ? (
              <EmptyState message="No trade history" icon={HiOutlineChartBar} theme={C} />
            ) : (
              [...trades, ...talarionTrades]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((trade, index) => (
                <TradeRow
                  key={trade.id}
                  trade={trade}
                  index={index}
                  onClick={trade.source === 'talarion' ? undefined : () => {
                    const isReadableSlug = (str: string | undefined): boolean => {
                      if (!str) return false;
                      if (str.startsWith('0x')) return false;
                      if (/^\d+$/.test(str)) return false;
                      return str.includes('-') || /[g-zG-Z]/.test(str);
                    };

                    let marketSlug: string | undefined;
                    if (isReadableSlug(trade.marketId)) {
                      marketSlug = trade.marketId;
                    } else if (isReadableSlug(trade.ticker)) {
                      marketSlug = trade.ticker;
                    } else {
                      marketSlug = trade.marketId;
                    }

                    if (marketSlug) {
                      router.push(`/predictions/${encodeURIComponent(marketSlug)}`);
                    }
                  }}
                  theme={C}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Talarion Sell Confirmation Modal */}
      <AnimatePresence>
        {sellConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setSellConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl p-5"
              style={{ backgroundColor: 'rgba(12, 14, 18, 0.95)', border: `1px solid ${C.border}` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-[13px] font-semibold" style={{ color: C.red }}>
                  Sell {sellConfirm.position.side} Position
                </span>
                <button onClick={() => setSellConfirm(null)} className="text-sm p-1 rounded-lg hover:bg-white/5" style={{ color: C.muted }}>
                  &times;
                </button>
              </div>

              <p className="text-[13px] font-medium mb-3 line-clamp-2" style={{ color: C.text }}>
                {(sellConfirm.position.marketTitle && !sellConfirm.position.marketTitle.startsWith('Talarion: 0x'))
                  ? sellConfirm.position.marketTitle
                  : 'AI Prediction Market'}
              </p>

              <div className="flex flex-col gap-1.5 px-3 py-2 rounded-lg mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                <div className="flex justify-between text-[11px]">
                  <span style={{ color: C.muted }}>Shares</span>
                  <span style={{ color: C.text }}>{(Number(sellConfirm.position.tokenAmount) || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span style={{ color: C.muted }}>Cost basis</span>
                  <span style={{ color: C.text }}>${(Number(sellConfirm.position.costBasis) || 0).toFixed(2)}</span>
                </div>
              </div>

              <p className="text-[11px] mb-4" style={{ color: C.muted }}>
                This will cancel the trade on the Escrow contract and return your ${(Number(sellConfirm.position.costBasis) || 0).toFixed(2)} margin to your wallet.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setSellConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: C.muted, border: `1px solid ${C.border}` }}
                >
                  Keep Position
                </button>
                <button
                  onClick={() => handleTalarionSell(sellConfirm.position)}
                  disabled={sellingPositionId !== null}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all active:scale-[0.97]"
                  style={{ backgroundColor: C.red, color: '#fff', opacity: sellingPositionId ? 0.6 : 1 }}
                >
                  {sellingPositionId ? 'Exiting...' : 'Exit Position'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Refresh Button */}
      <div className="flex justify-end pt-1">
        <button
          onClick={fetchData}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-white/5"
          style={{ color: C.muted, border: `1px solid ${C.border}` }}
        >
          <HiOutlineRefresh className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function LoadingState({ message, theme: C }: { message: string; theme: Theme }) {
  return (
    <div className="py-10 flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
        backgroundColor: 'rgba(255,255,255,0.05)',
      }}>
        <HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: C.muted }} />
      </div>
      <span className="text-sm" style={{ color: C.muted }}>{message}</span>
    </div>
  );
}

function EmptyState({ message, icon: Icon, theme: C }: { message: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; theme: Theme }) {
  return (
    <div className="py-10 text-center rounded-xl" style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      <Icon className="w-8 h-8 mx-auto mb-2" style={{ color: C.muted, opacity: 0.4 }} />
      <span className="text-sm" style={{ color: C.muted }}>{message}</span>
    </div>
  );
}

function ClaimableRow({
  position,
  onClaim,
  isClaiming,
  theme: C,
}: {
  position: ClaimablePosition;
  onClaim: (position: ClaimablePosition) => void;
  isClaiming: boolean;
  theme: Theme;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center justify-between p-4"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{
          background: `linear-gradient(135deg, ${C.green}25, ${C.green}10)`,
        }}>
          <HiOutlineCheckCircle className="w-5 h-5" style={{ color: C.green }} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: C.text }}>
            {position.marketTitle}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
              background: `linear-gradient(135deg, ${C.green}30, ${C.green}15)`,
              color: C.green,
            }}>
              {position.side} WON
            </span>
            <span className="text-[11px]" style={{ color: C.muted }}>
              {position.tokenAmount.toFixed(2)} tokens
            </span>
          </div>
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => onClaim(position)}
        disabled={isClaiming}
        className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ml-3 flex-shrink-0"
        style={{
          background: isClaiming ? C.muted : `linear-gradient(135deg, ${C.green}, #22C55E)`,
          color: '#000',
          opacity: isClaiming ? 0.6 : 1,
          boxShadow: isClaiming ? 'none' : `0 4px 12px ${C.green}30`,
        }}
      >
        {isClaiming ? (
          <>
            <HiOutlineRefresh className="w-4 h-4 animate-spin" />
            Claiming...
          </>
        ) : (
          <>
            <HiOutlineCash className="w-4 h-4" />
            Claim ${position.claimableAmount.toFixed(2)}
          </>
        )}
      </motion.button>
    </motion.div>
  );
}

function PendingRow({ position, theme: C }: { position: ClaimablePosition; theme: Theme }) {
  const sideColor = position.side === 'YES' ? C.green : C.red;
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <HiOutlineClock className="w-4 h-4 flex-shrink-0" style={{ color: '#FBBF24' }} />
        <div className="min-w-0">
          <div className="text-[13px] font-medium truncate" style={{ color: C.text }}>
            {position.marketTitle}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] font-bold px-1.5 py-px rounded" style={{
              backgroundColor: `${sideColor}15`,
              color: sideColor,
            }}>
              {position.side}
            </span>
            <span className="text-[11px]" style={{ color: C.muted }}>
              {position.tokenAmount.toFixed(2)} tokens
            </span>
          </div>
        </div>
      </div>

      <div className="px-2.5 py-1 rounded-lg text-[11px] font-semibold flex-shrink-0 ml-3 tabular-nums" style={{
        backgroundColor: `${C.green}10`,
        color: C.green,
        border: `1px solid ${C.green}20`,
      }}>
        ~${position.tokenAmount.toFixed(2)} if won
      </div>
    </div>
  );
}

function SettledRow({
  position,
  isWinner,
  theme: C,
}: {
  position: PredictionPosition;
  isWinner: boolean;
  theme: Theme;
}) {
  const amount = Number(position.settlementAmount) || 0;
  const costBasis = Number(position.costBasis) || 0;

  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{
          backgroundColor: isWinner ? C.greenBg : C.redBg,
        }}>
          {isWinner ? (
            <HiOutlineCheckCircle className="w-5 h-5" style={{ color: C.green }} />
          ) : (
            <HiOutlineXCircle className="w-5 h-5" style={{ color: C.red }} />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: C.text }}>
            {position.marketTitle || position.marketId}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
              backgroundColor: isWinner ? C.greenBg : C.redBg,
              color: isWinner ? C.green : C.red,
            }}>
              {position.side} {isWinner ? 'WON' : 'LOST'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              color: C.muted,
            }}>
              <HiOutlineLightningBolt className="w-3 h-3" />
              Auto-settled
            </span>
          </div>
        </div>
      </div>

      <div className="text-right ml-3 flex-shrink-0">
        {isWinner ? (
          <div className="text-sm font-bold" style={{ color: C.green }}>
            +${amount.toFixed(2)}
          </div>
        ) : (
          <div className="text-sm font-bold" style={{ color: C.red }}>
            -${costBasis.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}

function ClaimedRow({ claim, theme: C }: { claim: ClaimedWinning; theme: Theme }) {
  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{
          backgroundColor: C.greenBg,
        }}>
          <HiOutlineBadgeCheck className="w-5 h-5" style={{ color: C.green }} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: C.text }}>
            {claim.marketTitle}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
              backgroundColor: C.greenBg,
              color: C.green,
            }}>
              {claim.side} WON
            </span>
            <span className="text-[11px]" style={{ color: C.muted }}>
              {new Date(claim.claimedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 ml-3 flex-shrink-0">
        <div className="font-bold text-sm" style={{ color: C.green }}>
          +${claim.amount.toFixed(2)}
        </div>
        <a
          href={`https://polygonscan.com/tx/${claim.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-opacity hover:opacity-80"
          style={{ backgroundColor: C.purpleBg, color: C.purple }}
        >
          <HiOutlineExternalLink className="w-3 h-3" />
          Tx
        </a>
      </div>
    </div>
  );
}

function PositionRow({
  position,
  index,
  onClick,
  theme: C,
}: {
  position: PredictionPosition;
  index: number;
  onClick?: () => void;
  theme: Theme;
}) {
  const isYes = position.side?.toUpperCase() === 'YES';
  const costBasis = Number(position.costBasis) || 0;
  const unrealizedPnl = Number(position.unrealizedPnl) || 0;
  const tokenAmount = Number(position.tokenAmount) || 0;
  const avgEntryPrice = Number(position.avgEntryPrice) || 0;
  const currentValue = Number(position.currentValue) || costBasis;
  const pnlPercent = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center justify-between p-3.5 rounded-xl transition-colors cursor-pointer group"
      style={{
        backgroundColor: C.surface,
        border: `1px solid ${C.border}`,
      }}
      onClick={onClick}
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{
          backgroundColor: isYes ? C.greenBg : C.redBg,
        }}>
          {isYes ? (
            <HiOutlineCheckCircle className="w-5 h-5" style={{ color: C.green }} />
          ) : (
            <HiOutlineXCircle className="w-5 h-5" style={{ color: C.red }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: C.text }}>
            {position.marketTitle || position.marketId}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-bold uppercase" style={{ color: isYes ? C.green : C.red }}>
              {position.side}
            </span>
            <span className="text-[11px]" style={{ color: C.muted }}>
              {tokenAmount.toFixed(2)} @ {(avgEntryPrice * 100).toFixed(0)}c
            </span>
          </div>
        </div>
      </div>

      <div className="text-right ml-4">
        <div className="text-sm font-bold tabular-nums" style={{ color: C.text }}>
          ${currentValue.toFixed(2)}
        </div>
        {unrealizedPnl !== 0 && (
          <div className="text-[11px] tabular-nums" style={{ color: unrealizedPnl >= 0 ? C.green : C.red }}>
            {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%)
          </div>
        )}
      </div>
    </motion.div>
  );
}

function TalarionPositionRow({
  position,
  index,
  isSelling,
  onSell,
  theme: C,
}: {
  position: PredictionPosition;
  index: number;
  isSelling: boolean;
  onSell: () => void;
  theme: Theme;
}) {
  const isYes = position.side?.toUpperCase() === 'YES';
  const costBasis = Number(position.costBasis) || 0;
  const tokenAmount = Number(position.tokenAmount) || 0;
  const avgEntryPrice = Number(position.avgEntryPrice) || 0;
  const currentValue = Number(position.currentValue) || costBasis;

  // Clean up the market title — show readable name, never raw hex
  let title = position.marketTitle || '';
  const isHexTitle = !title || title.startsWith('Talarion: 0x') || title.startsWith('0x');
  if (isHexTitle) {
    title = 'AI Prediction Market';
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center justify-between p-3.5 rounded-xl transition-colors"
      style={{
        backgroundColor: C.surface,
        border: `1px solid ${C.border}`,
      }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{
          backgroundColor: isYes ? C.greenBg : C.redBg,
        }}>
          {isYes ? (
            <HiOutlineCheckCircle className="w-5 h-5" style={{ color: C.green }} />
          ) : (
            <HiOutlineXCircle className="w-5 h-5" style={{ color: C.red }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: C.text }}>
            {title}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-bold uppercase" style={{ color: isYes ? C.green : C.red }}>
              {position.side}
            </span>
            <span className="text-[11px]" style={{ color: C.muted }}>
              {tokenAmount.toFixed(2)} @ {(avgEntryPrice * 100).toFixed(0)}c
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 ml-4">
        <div className="text-right">
          <div className="text-sm font-bold tabular-nums" style={{ color: C.text }}>
            ${currentValue.toFixed(2)}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onSell(); }}
          disabled={isSelling}
          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex-shrink-0"
          style={{
            backgroundColor: C.redBg || 'rgba(248,113,113,0.15)',
            color: C.red,
            border: `1px solid rgba(248,113,113,0.2)`,
            opacity: isSelling ? 0.5 : 1,
          }}
        >
          {isSelling ? '...' : 'Exit'}
        </button>
      </div>
    </motion.div>
  );
}

function OpenOrderRow({
  order,
  index,
  onCancel,
  isCancelling,
  theme: C,
}: {
  order: PolymarketOpenOrder;
  index: number;
  onCancel: (orderId: string) => void;
  isCancelling: boolean;
  theme: Theme;
}) {
  const isBuy = order.side === 'BUY';
  const size = parseFloat(order.original_size || '0') - parseFloat(order.size_matched || '0');
  const price = parseFloat(order.price || '0');
  const value = size * price;
  const isYesOutcome = order.outcome?.toUpperCase() === 'YES';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center justify-between p-3.5 rounded-xl"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{
          backgroundColor: isBuy ? C.greenBg : C.redBg,
        }}>
          <span className="text-[10px] font-bold" style={{ color: isBuy ? C.green : C.red }}>
            {isBuy ? 'BUY' : 'SELL'}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{
              backgroundColor: isYesOutcome ? C.greenBg : C.redBg,
              color: isYesOutcome ? C.green : C.red,
            }}>
              {order.outcome || 'YES'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
              backgroundColor: '#FBBF2415',
              color: '#FBBF24',
            }}>
              {order.type}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px]" style={{ color: C.muted }}>
              {size.toFixed(2)} @ {(price * 100).toFixed(0)}c = ${value.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onCancel(order.id);
        }}
        disabled={isCancelling}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ml-3 flex-shrink-0"
        style={{
          backgroundColor: C.border,
          color: isCancelling ? C.muted : C.red,
        }}
      >
        {isCancelling ? (
          <HiOutlineRefresh className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <HiOutlineTrash className="w-3.5 h-3.5" />
        )}
        {isCancelling ? '...' : 'Cancel'}
      </button>
    </motion.div>
  );
}

function TradeRow({
  trade,
  index,
  onClick,
  theme: C,
}: {
  trade: PredictionTrade;
  index: number;
  onClick?: () => void;
  theme: Theme;
}) {
  const isBuy = trade.tradeType?.toUpperCase() === 'BUY';
  const isYes = trade.side?.toUpperCase() === 'YES';
  const tokenAmount = Number(trade.tokenAmount) || 0;
  const pricePerToken = Number(trade.pricePerToken) || 0;
  const usdValue = Number(trade.usdValue) || 0;
  const timestamp = trade.createdAt ? new Date(trade.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) : '';

  const txHash = (trade as any).transactionHash;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={`flex items-center justify-between p-3.5 rounded-xl transition-colors ${onClick ? 'cursor-pointer' : ''}`}
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{
          backgroundColor: isBuy ? C.greenBg : C.redBg,
        }}>
          <span className="text-[10px] font-bold" style={{ color: isBuy ? C.green : C.red }}>
            {isBuy ? 'BUY' : 'SELL'}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: C.text }}>
            {(trade.marketTitle && !trade.marketTitle.startsWith('0x') && !trade.marketTitle.startsWith('Talarion: 0x'))
              ? trade.marketTitle
              : (trade.source === 'talarion' ? 'AI Prediction Market' : trade.marketId)}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-bold uppercase" style={{ color: isYes ? C.green : C.red }}>
              {trade.side}
            </span>
            <span className="text-[11px]" style={{ color: C.muted }}>
              {tokenAmount.toFixed(2)} @ {(pricePerToken * 100).toFixed(0)}c
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 ml-3 flex-shrink-0">
        <div className="text-right">
          <div className="text-sm font-bold tabular-nums" style={{ color: C.text }}>
            ${usdValue.toFixed(2)}
          </div>
          <div className="text-[10px]" style={{ color: C.muted }}>
            {timestamp}
          </div>
        </div>

        <span className="text-[10px] px-2 py-1 rounded-full font-medium" style={{
          backgroundColor: trade.status === 'confirmed' ? C.greenBg :
                         trade.status === 'pending' ? '#FBBF2415' : C.redBg,
          color: trade.status === 'confirmed' ? C.green :
                 trade.status === 'pending' ? '#FBBF24' : C.red,
        }}>
          {trade.status || 'unknown'}
        </span>

        {txHash && (
          <a
            href={`https://polygonscan.com/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] transition-opacity hover:opacity-80"
            style={{ backgroundColor: C.purpleBg, color: C.purple }}
            title="View on Polygonscan"
          >
            <HiOutlineExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </motion.div>
  );
}
