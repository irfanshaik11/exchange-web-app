// src/components/predictions/PredictionWinnings.tsx
// @deprecated - Use UnifiedPortfolio instead. This component's functionality has been
// merged into UnifiedPortfolio.tsx for a cleaner, unified portfolio experience.
// Gamified prediction market winnings tracker with claim functionality

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineCash,
  HiOutlineChartBar,
  HiOutlineFire,
  HiOutlineRefresh,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineSparkles,
  HiOutlineStar,
  HiOutlineBadgeCheck,
  HiOutlineExternalLink,
} from 'react-icons/hi';

// Color palette
const C = {
  bg: "#0a0b0d",
  surface: "#12141a",
  surfaceHover: "#1a1d24",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  green: "#4ADE80",
  greenBg: "rgba(74, 222, 128, 0.15)",
  red: "#F87171",
  redBg: "rgba(248, 113, 113, 0.15)",
  yellow: "#FBBF24",
  yellowBg: "rgba(251, 191, 36, 0.15)",
  purple: "#818CF8",
  purpleBg: "rgba(129, 140, 248, 0.15)",
  gold: "#FFD700",
  goldBg: "rgba(255, 215, 0, 0.15)",
};

interface ClaimablePosition {
  conditionId: string;
  marketTitle: string;
  tokenId: string;
  side: 'YES' | 'NO';
  tokenAmount: number;
  claimableAmount: number; // In USDC
  resolved: boolean;
  winningOutcome: 'YES' | 'NO' | null;
  isWinner: boolean;
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

interface ClaimedWinning {
  conditionId: string;
  marketTitle: string;
  side: 'YES' | 'NO';
  amount: number;
  txHash: string;
  claimedAt: string; // ISO date string
}

// localStorage key for claimed history
const CLAIMED_HISTORY_KEY = 'polymarket_claimed_history';

// Helper to load claimed history from localStorage
function loadClaimedHistory(): ClaimedWinning[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(CLAIMED_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Helper to save claimed history to localStorage
function saveClaimedHistory(history: ClaimedWinning[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CLAIMED_HISTORY_KEY, JSON.stringify(history));
  } catch {
    console.error('Failed to save claimed history');
  }
}

// Helper to add a new claim to history
function addClaimToHistory(claim: ClaimedWinning): ClaimedWinning[] {
  const history = loadClaimedHistory();
  // Don't add duplicates
  if (history.some(h => h.txHash === claim.txHash)) {
    return history;
  }
  const updated = [claim, ...history]; // Newest first
  saveClaimedHistory(updated);
  return updated;
}

interface PredictionWinningsProps {
  authToken?: string;
  walletAddress?: string;
  onClaimSuccess?: () => void;
}

// API functions (add these to api.ts later)
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

export default function PredictionWinnings({
  authToken,
  walletAddress,
  onClaimSuccess,
}: PredictionWinningsProps) {
  const [claimablePositions, setClaimablePositions] = useState<ClaimablePosition[]>([]);
  const [claimedHistory, setClaimedHistory] = useState<ClaimedWinning[]>([]);
  const [stats, setStats] = useState<WinningsStats>({
    totalWinnings: 0,
    totalLosses: 0,
    netProfit: 0,
    winRate: 0,
    totalTrades: 0,
    winStreak: 0,
    bestWin: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load claimed history on mount
  useEffect(() => {
    let history = loadClaimedHistory();

    // Seed the known NHL redemption for this wallet if not already in history
    // This ensures the claim is tracked even if it was made before this feature existed
    const NHL_CONDITION_ID = '0x92cd86aeee9419974506a4c15408612f999a21e0d18b1770efb4308479a869bd';
    const NHL_TX_HASH = '0xf7efe0f1a5ea354d17117cc71f7aab6769dd4850fc355d5f80860d697456e79f';

    if (walletAddress?.toLowerCase() === '0xb9f9cc480f9ee681e204ed8ef64cfc237371fce2') {
      // Check if this claim is already in history (by txHash or conditionId)
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
          claimedAt: '2025-01-28T00:00:00.000Z', // Actual claim date
        };
        history = addClaimToHistory(seedClaim);
      }
    }

    setClaimedHistory(history);
  }, [walletAddress]);

  // Calculate stats from positions/trades and claimed history
  const calculateStats = useCallback((positions: ClaimablePosition[], claimed: ClaimedWinning[]) => {
    const winners = positions.filter(p => p.isWinner);
    const losers = positions.filter(p => p.resolved && !p.isWinner);

    // Include claimed winnings in totals
    const claimedTotal = claimed.reduce((sum, c) => sum + c.amount, 0);
    const totalWinnings = winners.reduce((sum, p) => sum + p.claimableAmount, 0) + claimedTotal;
    const totalLosses = losers.reduce((sum, p) => sum + p.tokenAmount * 0.5, 0); // Estimate loss

    const totalWins = winners.length + claimed.length;
    const totalTrades = positions.length + claimed.length;

    // Find best win including claimed
    const positionBestWin = winners.length > 0 ? Math.max(...winners.map(w => w.claimableAmount)) : 0;
    const claimedBestWin = claimed.length > 0 ? Math.max(...claimed.map(c => c.amount)) : 0;
    const bestWin = Math.max(positionBestWin, claimedBestWin);

    setStats({
      totalWinnings,
      totalLosses,
      netProfit: totalWinnings - totalLosses,
      winRate: totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0,
      totalTrades,
      winStreak: calculateStreak(positions) + (claimed.length > 0 && winners.length === 0 ? claimed.length : 0),
      bestWin,
    });
  }, []);

  const calculateStreak = (positions: ClaimablePosition[]): number => {
    let streak = 0;
    for (const p of positions) {
      if (p.isWinner) streak++;
      else break;
    }
    return streak;
  };

  // For now, show example data - in production, fetch from backend
  useEffect(() => {
    // Track if this effect is still current (for cleanup)
    let isCurrent = true;

    if (!authToken) {
      setIsLoading(false);
      return;
    }

    // TODO: In production, fetch actual positions and check resolution status
    // For now, show the NHL market as an example
    const examplePositions: ClaimablePosition[] = [
      {
        conditionId: '0x92cd86aeee9419974506a4c15408612f999a21e0d18b1770efb4308479a869bd',
        marketTitle: 'NHL: Sharks vs. Canucks (Jan 27)',
        tokenId: '24805358206707059866948714153238094417461345581679625271502562437853832292739',
        side: 'YES',
        tokenAmount: 2.62,
        claimableAmount: 2.62,
        resolved: false, // Will check on-chain
        winningOutcome: null,
        isWinner: false,
      },
    ];

    // Filter out positions that have already been claimed
    const alreadyClaimedConditionIds = new Set(claimedHistory.map(c => c.conditionId));
    const unclaimedPositions = examplePositions.filter(
      pos => !alreadyClaimedConditionIds.has(pos.conditionId)
    );

    // If all positions are already claimed, skip resolution check
    if (unclaimedPositions.length === 0) {
      setClaimablePositions([]);
      calculateStats([], claimedHistory);
      setIsLoading(false);
      return;
    }

    // Check resolution status for each unclaimed position
    const checkResolution = async () => {
      setIsLoading(true);
      const updatedPositions = await Promise.all(
        unclaimedPositions.map(async (pos) => {
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

      // Only update state if this effect is still current
      // Prevents race condition where stale async result overwrites newer state
      if (isCurrent) {
        setClaimablePositions(updatedPositions);
        calculateStats(updatedPositions, claimedHistory);
        setIsLoading(false);
      }
    };

    checkResolution();

    // Cleanup: mark this effect as stale when it re-runs or unmounts
    return () => {
      isCurrent = false;
    };
  }, [authToken, calculateStats, claimedHistory]);

  const handleClaim = async (position: ClaimablePosition) => {
    if (!authToken || claimingId) return;

    setClaimingId(position.conditionId);
    setClaimResult(null);

    try {
      const result = await redeemWinnings(position.conditionId, authToken);

      if (result.success && result.txHash) {
        setClaimResult({
          success: true,
          message: `Claimed $${position.claimableAmount.toFixed(2)}! Tx: ${result.txHash.slice(0, 10)}...`,
        });

        // Save to claimed history
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

        // Update position as claimed
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

  const totalClaimable = claimablePositions
    .filter(p => p.isWinner && p.claimableAmount > 0)
    .reduce((sum, p) => sum + p.claimableAmount, 0);

  const pendingResolution = claimablePositions.filter(p => !p.resolved);
  const readyToClaim = claimablePositions.filter(p => p.isWinner && p.claimableAmount > 0);

  if (!authToken) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Gamified Stats Header */}
      <div
        className="relative overflow-hidden rounded-xl p-4"
        style={{
          background: `linear-gradient(135deg, ${C.surface} 0%, ${C.purpleBg} 100%)`,
          border: `1px solid ${C.border}`,
        }}
      >
        {/* Trophy decoration */}
        <div className="absolute top-2 right-2 opacity-10">
          <HiOutlineStar className="w-24 h-24" style={{ color: C.gold }} />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <HiOutlineSparkles className="w-5 h-5" style={{ color: C.gold }} />
            <h3 className="text-lg font-bold" style={{ color: C.text }}>
              Prediction Stats
            </h3>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Net Profit */}
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: `${C.bg}80` }}
            >
              <div className="flex items-center gap-1 mb-1">
                <HiOutlineCash className="w-4 h-4" style={{ color: C.muted }} />
                <span className="text-xs uppercase" style={{ color: C.muted }}>Net P&L</span>
              </div>
              <div
                className="text-xl font-bold"
                style={{ color: stats.netProfit >= 0 ? C.green : C.red }}
              >
                {stats.netProfit >= 0 ? '+' : ''}${stats.netProfit.toFixed(2)}
              </div>
            </div>

            {/* Win Rate */}
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: `${C.bg}80` }}
            >
              <div className="flex items-center gap-1 mb-1">
                <HiOutlineChartBar className="w-4 h-4" style={{ color: C.muted }} />
                <span className="text-xs uppercase" style={{ color: C.muted }}>Win Rate</span>
              </div>
              <div className="text-xl font-bold" style={{ color: C.text }}>
                {stats.winRate.toFixed(0)}%
              </div>
            </div>

            {/* Win Streak */}
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: `${C.bg}80` }}
            >
              <div className="flex items-center gap-1 mb-1">
                <HiOutlineFire className="w-4 h-4" style={{ color: stats.winStreak > 0 ? C.yellow : C.muted }} />
                <span className="text-xs uppercase" style={{ color: C.muted }}>Streak</span>
              </div>
              <div className="text-xl font-bold" style={{ color: stats.winStreak > 0 ? C.yellow : C.text }}>
                {stats.winStreak > 0 ? `${stats.winStreak}🔥` : '0'}
              </div>
            </div>

            {/* Best Win */}
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: `${C.bg}80` }}
            >
              <div className="flex items-center gap-1 mb-1">
                <HiOutlineStar className="w-4 h-4" style={{ color: C.gold }} />
                <span className="text-xs uppercase" style={{ color: C.muted }}>Best Win</span>
              </div>
              <div className="text-xl font-bold" style={{ color: C.gold }}>
                ${stats.bestWin.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Claimable Winnings Section */}
      {(readyToClaim.length > 0 || pendingResolution.length > 0) && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: `1px solid ${C.border}` }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: C.goldBg }}
              >
                <HiOutlineCash className="w-4 h-4" style={{ color: C.gold }} />
              </div>
              <div>
                <h4 className="font-semibold" style={{ color: C.text }}>Winnings</h4>
                <p className="text-xs" style={{ color: C.muted }}>
                  {readyToClaim.length > 0 ? 'Ready to claim!' : 'Waiting for resolution...'}
                </p>
              </div>
            </div>
            {totalClaimable > 0 && (
              <div
                className="px-3 py-1.5 rounded-lg text-sm font-bold"
                style={{ backgroundColor: C.greenBg, color: C.green }}
              >
                ${totalClaimable.toFixed(2)} available
              </div>
            )}
          </div>

          {/* Positions List */}
          <div className="divide-y" style={{ borderColor: C.border }}>
            {isLoading ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: C.muted }} />
                <span style={{ color: C.muted }}>Checking markets...</span>
              </div>
            ) : (
              <>
                {/* Ready to Claim */}
                {readyToClaim.map((position) => (
                  <motion.div
                    key={position.conditionId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: C.greenBg }}
                      >
                        <HiOutlineCheckCircle className="w-5 h-5" style={{ color: C.green }} />
                      </div>
                      <div>
                        <div className="font-medium" style={{ color: C.text }}>
                          {position.marketTitle}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className="text-xs font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: C.greenBg, color: C.green }}
                          >
                            {position.side} WON
                          </span>
                          <span className="text-xs" style={{ color: C.muted }}>
                            {position.tokenAmount.toFixed(2)} tokens
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleClaim(position)}
                      disabled={claimingId === position.conditionId}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all hover:scale-105"
                      style={{
                        background: `linear-gradient(135deg, ${C.green} 0%, #22C55E 100%)`,
                        color: '#000',
                        opacity: claimingId === position.conditionId ? 0.7 : 1,
                      }}
                    >
                      {claimingId === position.conditionId ? (
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
                    </button>
                  </motion.div>
                ))}

                {/* Pending Resolution */}
                {pendingResolution.map((position) => (
                  <motion.div
                    key={position.conditionId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between p-4 opacity-70"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: C.yellowBg }}
                      >
                        <HiOutlineClock className="w-5 h-5" style={{ color: C.yellow }} />
                      </div>
                      <div>
                        <div className="font-medium" style={{ color: C.text }}>
                          {position.marketTitle}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className="text-xs font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: C.yellowBg, color: C.yellow }}
                          >
                            {position.side}
                          </span>
                          <span className="text-xs" style={{ color: C.muted }}>
                            {position.tokenAmount.toFixed(2)} tokens • Awaiting resolution
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      className="px-3 py-2 rounded-lg text-sm"
                      style={{ backgroundColor: C.yellowBg, color: C.yellow }}
                    >
                      ~${position.tokenAmount.toFixed(2)} if won
                    </div>
                  </motion.div>
                ))}
              </>
            )}
          </div>

          {/* Claim Result Toast */}
          <AnimatePresence>
            {claimResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mx-4 mb-4 p-3 rounded-lg flex items-center gap-2"
                style={{
                  backgroundColor: claimResult.success ? C.greenBg : C.redBg,
                  border: `1px solid ${claimResult.success ? C.green : C.red}`,
                }}
              >
                {claimResult.success ? (
                  <HiOutlineCheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: C.green }} />
                ) : (
                  <HiOutlineExclamationCircle className="w-5 h-5 flex-shrink-0" style={{ color: C.red }} />
                )}
                <span
                  className="text-sm"
                  style={{ color: claimResult.success ? C.green : C.red }}
                >
                  {claimResult.message}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Claimed History Section */}
      {claimedHistory.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: `1px solid ${C.border}` }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: C.greenBg }}
              >
                <HiOutlineBadgeCheck className="w-4 h-4" style={{ color: C.green }} />
              </div>
              <div>
                <h4 className="font-semibold" style={{ color: C.text }}>Claimed History</h4>
                <p className="text-xs" style={{ color: C.muted }}>
                  {claimedHistory.length} successful {claimedHistory.length === 1 ? 'redemption' : 'redemptions'}
                </p>
              </div>
            </div>
            <div
              className="px-3 py-1.5 rounded-lg text-sm font-bold"
              style={{ backgroundColor: C.greenBg, color: C.green }}
            >
              ${claimedHistory.reduce((sum, c) => sum + c.amount, 0).toFixed(2)} total
            </div>
          </div>

          {/* Claimed List */}
          <div className="divide-y" style={{ borderColor: C.border }}>
            {claimedHistory.map((claim) => (
              <motion.div
                key={claim.txHash}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: C.greenBg }}
                  >
                    <HiOutlineCheckCircle className="w-5 h-5" style={{ color: C.green }} />
                  </div>
                  <div>
                    <div className="font-medium" style={{ color: C.text }}>
                      {claim.marketTitle}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-xs font-bold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: C.greenBg, color: C.green }}
                      >
                        {claim.side} WON
                      </span>
                      <span className="text-xs" style={{ color: C.muted }}>
                        {new Date(claim.claimedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-bold" style={{ color: C.green }}>
                      +${claim.amount.toFixed(2)}
                    </div>
                  </div>
                  <a
                    href={`https://polygonscan.com/tx/${claim.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors hover:opacity-80"
                    style={{ backgroundColor: C.purpleBg, color: C.purple }}
                  >
                    <img
                      src="https://polygonscan.com/assets/poly/images/svg/logos/chain-dim.svg?v=26.1.4.2"
                      alt="Polygonscan"
                      className="w-3.5 h-3.5"
                    />
                    View Tx
                  </a>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && readyToClaim.length === 0 && pendingResolution.length === 0 && claimedHistory.length === 0 && (
        <div
          className="text-center py-8 rounded-xl"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          <div
            className="w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center"
            style={{ backgroundColor: C.purpleBg }}
          >
            <HiOutlineStar className="w-7 h-7" style={{ color: C.purple }} />
          </div>
          <h3 className="text-lg font-medium mb-2" style={{ color: C.text }}>
            No Winnings Yet
          </h3>
          <p className="text-sm max-w-md mx-auto" style={{ color: C.muted }}>
            Make predictions and win to see your claimable winnings here!
          </p>
        </div>
      )}
    </div>
  );
}
