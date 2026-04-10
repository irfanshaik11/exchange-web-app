/**
 * RankCard Component
 *
 * Full rank display card with perks information.
 * Shows the rank badge, current perks, and progress to next level.
 * Updated with space theme and React Icons.
 */

import React from 'react';
import { HiLightningBolt } from 'react-icons/hi';
import { GiFireGem, GiCoins, GiCrown } from 'react-icons/gi';
import type { RankName } from '~/utils/arenaApi';
import RankBadge, { RANK_COLORS, RANK_NAMES, ROMAN_NUMERALS } from './RankBadge';
import ProgressBar from '../common/ProgressBar';
import GoldDisplay from '../common/GoldDisplay';

interface RankCardProps {
  rank: RankName;
  level: number;
  goldEarned: number;
  goldMultiplier: number;
  cashbackPercent: number;
  nextLevelThreshold: number | null;
  progressToNextLevel: number;
  currentStreak?: number;
  className?: string;
}

export default function RankCard({
  rank,
  level,
  goldEarned,
  goldMultiplier,
  cashbackPercent,
  nextLevelThreshold,
  progressToNextLevel,
  currentStreak,
  className = '',
}: RankCardProps) {
  const colors = RANK_COLORS[rank];

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl border p-6
        backdrop-blur-md bg-black/40 border-emerald-500/20
        shadow-[0_0_30px_rgba(16,185,129,0.1)]
        ${className}
      `}
    >
      {/* Background glow effect */}
      <div className="absolute inset-0 opacity-20">
        <div className={`absolute -top-1/2 -right-1/2 w-full h-full rounded-full blur-3xl ${colors.bg}`} />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-emerald-400/70 text-sm mb-1 uppercase tracking-wider">Current Rank</h3>
            <div className="flex items-center gap-3">
              <RankBadge rank={rank} level={level} size="lg" />
            </div>
          </div>
          {currentStreak !== undefined && currentStreak > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/20 rounded-full border border-orange-500/30">
              <GiFireGem className="w-5 h-5 text-orange-400" />
              <span className="text-orange-400 font-bold text-sm">{currentStreak} day streak</span>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <StatBox
            label="Gold Multiplier"
            value={`${goldMultiplier}x`}
            color={colors.text}
            Icon={HiLightningBolt}
            iconColor="text-yellow-400"
          />
          <StatBox
            label="Cashback Rate"
            value={`${cashbackPercent}%`}
            color={colors.text}
            Icon={GiCoins}
            iconColor="text-emerald-400"
          />
        </div>

        {/* Gold Earned */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-neutral-400 text-sm">Lifetime Gold Earned</span>
            <GoldDisplay amount={goldEarned} size="lg" />
          </div>
        </div>

        {/* Progress to Next Level */}
        {nextLevelThreshold && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-400 text-sm">Progress to Next Level</span>
              <span className="text-neutral-300 text-sm">
                {goldEarned.toLocaleString()} / {nextLevelThreshold.toLocaleString()}
              </span>
            </div>
            <ProgressBar
              progress={progressToNextLevel}
              color="gold"
              size="md"
            />
            <p className="text-xs text-neutral-500 mt-2">
              {Math.round(nextLevelThreshold - goldEarned).toLocaleString()} Gold to reach{' '}
              {getNextRankDisplay(rank, level)}
            </p>
          </div>
        )}

        {/* Max Level Indicator */}
        {!nextLevelThreshold && (
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/20 border border-yellow-500/30 mb-3">
              <GiCrown className="w-8 h-8 text-yellow-400" />
            </div>
            <p className={`${colors.text} font-bold mt-2`}>Maximum Rank Achieved!</p>
            <p className="text-neutral-400 text-sm">You've reached the pinnacle of Airdrop Genesis</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Stat Box sub-component
 */
function StatBox({
  label,
  value,
  color,
  Icon,
  iconColor,
}: {
  label: string;
  value: string;
  color: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
}) {
  return (
    <div className="bg-black/40 backdrop-blur-sm rounded-xl p-4 border border-white/5">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className="text-neutral-400 text-xs">{label}</span>
      </div>
      <span className={`${color} text-2xl font-bold`}>{value}</span>
    </div>
  );
}

/**
 * Get display name for next rank/level
 */
function getNextRankDisplay(currentRank: RankName, currentLevel: number): string {
  const rankOrder: RankName[] = ['DEGEN', 'WARRIOR', 'GLADIATOR', 'COMMANDER', 'TITAN'];
  const currentRankIndex = rankOrder.indexOf(currentRank);

  if (currentLevel < 4) {
    // Next level within same rank
    return `${RANK_NAMES[currentRank]} ${ROMAN_NUMERALS[currentLevel]}`;
  } else if (currentRankIndex < rankOrder.length - 1) {
    // Next rank level 1
    const nextRank = rankOrder[currentRankIndex + 1];
    return `${RANK_NAMES[nextRank]} I`;
  }

  return 'Max Rank';
}
