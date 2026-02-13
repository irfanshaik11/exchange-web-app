/**
 * RankCarousel Component
 *
 * Horizontal scrollable display showing all ranks and their perks.
 * Highlights the user's current rank.
 * Updated with space theme and React Icons.
 */

import React, { useRef } from 'react';
import { FiChevronLeft, FiChevronRight, FiLock } from 'react-icons/fi';
import { HiLightningBolt } from 'react-icons/hi';
import { GiCoins } from 'react-icons/gi';
import type { RankName, RankDefinition } from '~/utils/arenaApi';
import { RANK_COLORS, RANK_NAMES, RankIcon } from './RankBadge';

interface RankCarouselProps {
  ranks: RankDefinition[];
  currentRank: RankName;
  currentLevel: number;
  goldEarned: number;
  className?: string;
}

export default function RankCarousel({
  ranks,
  currentRank,
  currentLevel,
  goldEarned,
  className = '',
}: RankCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollTo = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -300 : 300;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className={`relative ${className}`}>
      <h2 className="text-xl font-bold text-white mb-4">Outpost Ranks</h2>

      {/* Scroll buttons */}
      <button
        onClick={() => scrollTo('left')}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-black/60 backdrop-blur-sm hover:bg-emerald-900/50 rounded-full flex items-center justify-center text-white transition border border-white/10"
      >
        <FiChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => scrollTo('right')}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-black/60 backdrop-blur-sm hover:bg-emerald-900/50 rounded-full flex items-center justify-center text-white transition border border-white/10"
      >
        <FiChevronRight className="w-5 h-5" />
      </button>

      {/* Scrollable container */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide px-12 pb-4"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {ranks.map((rankDef) => {
          const isCurrent = rankDef.rank === currentRank;
          const isUnlocked = isRankUnlocked(rankDef.rank, currentRank);
          const colors = RANK_COLORS[rankDef.rank];

          return (
            <div
              key={rankDef.rank}
              className={`
                flex-shrink-0 w-64 p-5 rounded-xl border backdrop-blur-md transition-all
                ${isCurrent
                  ? `bg-black/60 border-emerald-500/50 ring-2 ring-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)]`
                  : isUnlocked
                  ? `bg-black/40 border-white/10 opacity-90`
                  : 'bg-black/30 border-white/5 opacity-50'
                }
              `}
              style={{ scrollSnapAlign: 'center' }}
            >
              {/* Rank Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <RankIcon rank={rankDef.rank} className="w-8 h-8" />
                  <span className={`text-lg font-bold ${isUnlocked ? colors.text : 'text-neutral-500'}`}>
                    {rankDef.displayName}
                  </span>
                </div>
                {isCurrent && (
                  <span className="px-2 py-0.5 bg-emerald-500/20 rounded text-xs text-emerald-400 border border-emerald-500/30">
                    Current
                  </span>
                )}
                {!isUnlocked && (
                  <FiLock className="w-4 h-4 text-neutral-500" />
                )}
              </div>

              {/* Perks */}
              <div className="space-y-3">
                <PerkRow
                  Icon={HiLightningBolt}
                  iconColor="text-yellow-400"
                  label="Gold Multiplier"
                  value={`${rankDef.goldMultiplier}x`}
                  isActive={isUnlocked}
                />
                <PerkRow
                  Icon={GiCoins}
                  iconColor="text-emerald-400"
                  label="Cashback"
                  value={`${(rankDef.cashback * 100).toFixed(0)}%`}
                  isActive={isUnlocked}
                />
              </div>

              {/* Level thresholds */}
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-xs text-neutral-500 mb-2">Levels</p>
                <div className="grid grid-cols-4 gap-1">
                  {rankDef.levels.map((lvl, idx) => {
                    const levelNum = idx + 1;
                    const isLevelUnlocked = isUnlocked && (
                      rankDef.rank !== currentRank || levelNum <= currentLevel
                    );
                    const isCurrentLevel = isCurrent && levelNum === currentLevel;

                    return (
                      <div
                        key={idx}
                        className={`
                          text-center p-1 rounded text-xs transition-all
                          ${isCurrentLevel
                            ? `bg-emerald-500/20 ${colors.text} font-bold border border-emerald-500/30`
                            : isLevelUnlocked
                            ? 'bg-white/5 text-neutral-300'
                            : 'bg-black/30 text-neutral-600'
                          }
                        `}
                      >
                        {['I', 'II', 'III', 'IV'][idx]}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Perk Row sub-component
 */
function PerkRow({
  Icon,
  iconColor,
  label,
  value,
  isActive,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  label: string;
  value: string;
  isActive: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${isActive ? iconColor : 'text-neutral-600'}`} />
        <span className={`text-sm ${isActive ? 'text-neutral-300' : 'text-neutral-600'}`}>
          {label}
        </span>
      </div>
      <span className={`font-bold ${isActive ? 'text-white' : 'text-neutral-600'}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Check if a rank is unlocked (at or below current rank)
 */
function isRankUnlocked(rank: RankName, currentRank: RankName): boolean {
  const rankOrder: RankName[] = ['DEGEN', 'WARRIOR', 'GLADIATOR', 'COMMANDER', 'TITAN'];
  return rankOrder.indexOf(rank) <= rankOrder.indexOf(currentRank);
}
