/**
 * LeaderboardPodium Component
 *
 * Top 3 display with special styling for winners.
 * Updated with space theme and React Icons.
 */

import React from 'react';
import { GiLaurelCrown, GiMedal, GiTrophy } from 'react-icons/gi';
import type { LeaderboardEntry } from '~/utils/arenaApi';
import RankBadge from '../ranks/RankBadge';
import GoldDisplay from '../common/GoldDisplay';

interface LeaderboardPodiumProps {
  entries: LeaderboardEntry[];
  type: 'GOLD' | 'QUEST';
  className?: string;
}

export default function LeaderboardPodium({
  entries,
  type,
  className = '',
}: LeaderboardPodiumProps) {
  // Get top 3, filling with placeholders if needed
  const first = entries[0];
  const second = entries[1];
  const third = entries[2];

  return (
    <div className={`flex items-end justify-center gap-4 ${className}`}>
      {/* 2nd Place */}
      <PodiumSpot entry={second} position={2} type={type} />

      {/* 1st Place (taller) */}
      <PodiumSpot entry={first} position={1} type={type} />

      {/* 3rd Place */}
      <PodiumSpot entry={third} position={3} type={type} />
    </div>
  );
}

interface PodiumSpotProps {
  entry?: LeaderboardEntry;
  position: 1 | 2 | 3;
  type: 'GOLD' | 'QUEST';
}

function PodiumSpot({ entry, position, type }: PodiumSpotProps) {
  const heights = {
    1: 'h-40',
    2: 'h-32',
    3: 'h-28',
  };

  const bgColors = {
    1: 'from-yellow-500/30 to-yellow-600/10 border-yellow-500/30',
    2: 'from-slate-400/30 to-slate-500/10 border-slate-400/30',
    3: 'from-amber-700/30 to-amber-800/10 border-amber-600/30',
  };

  const MedalIcon = position === 1 ? GiLaurelCrown : GiMedal;
  const medalColors = {
    1: 'text-yellow-400',
    2: 'text-slate-300',
    3: 'text-amber-600',
  };

  const displayName = entry ? entry.userName || 'User' : '—';

  return (
    <div className={`w-32 ${position === 1 ? 'order-2' : position === 2 ? 'order-1' : 'order-3'}`}>
      {/* User Info */}
      <div className="text-center mb-2">
        <div className="flex justify-center mb-2">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            position === 1 ? 'bg-yellow-500/20 border border-yellow-500/30' :
            position === 2 ? 'bg-slate-400/20 border border-slate-400/30' :
            'bg-amber-600/20 border border-amber-600/30'
          }`}>
            <MedalIcon className={`w-6 h-6 ${medalColors[position]}`} />
          </div>
        </div>
        <p className="text-white font-bold mt-1 truncate">{displayName}</p>
        {entry && (
          <>
            <div className="flex justify-center mt-1">
              <RankBadge rank={entry.rank} level={entry.rankLevel} size="sm" showLevel={false} />
            </div>
            <div className="mt-2">
              {type === 'GOLD' ? (
                <GoldDisplay amount={entry.goldEarned || 0} size="sm" />
              ) : (
                <span className="text-white text-sm">{entry.questsCompleted || 0} quests</span>
              )}
            </div>
            {entry.prize > 0 && (
              <div className="mt-1">
                <span className="text-xs text-amber-400">Prize: </span>
                <GoldDisplay amount={entry.prize} size="sm" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Podium Stand */}
      <div
        className={`
          ${heights[position]} w-full rounded-t-lg border-t border-x backdrop-blur-md
          bg-gradient-to-b ${bgColors[position]}
          flex items-center justify-center
        `}
      >
        <span className="text-4xl font-bold text-white/20">#{position}</span>
      </div>
    </div>
  );
}

/**
 * Compact Podium (horizontal layout for mobile)
 */
export function CompactPodium({
  entries,
  type,
  className = '',
}: LeaderboardPodiumProps) {
  const MedalIcons = [GiLaurelCrown, GiMedal, GiMedal];
  const medalColors = ['text-yellow-400', 'text-slate-300', 'text-amber-600'];

  return (
    <div className={`space-y-2 ${className}`}>
      {entries.slice(0, 3).map((entry, index) => {
        const position = index + 1;
        const MedalIcon = MedalIcons[index];
        const displayName = entry.userName || 'User';

        return (
          <div
            key={entry.userId}
            className={`
              flex items-center justify-between p-3 rounded-lg border backdrop-blur-md
              ${position === 1 ? 'bg-yellow-500/10 border-yellow-500/30' :
                position === 2 ? 'bg-slate-400/10 border-slate-400/30' :
                'bg-amber-700/10 border-amber-600/30'}
            `}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                position === 1 ? 'bg-yellow-500/20' :
                position === 2 ? 'bg-slate-400/20' :
                'bg-amber-600/20'
              }`}>
                <MedalIcon className={`w-5 h-5 ${medalColors[index]}`} />
              </div>
              <div>
                <p className="text-white font-bold">{displayName}</p>
                <RankBadge rank={entry.rank} level={entry.rankLevel} size="sm" />
              </div>
            </div>
            <div className="text-right">
              {type === 'GOLD' ? (
                <GoldDisplay amount={entry.goldEarned || 0} size="md" />
              ) : (
                <span className="text-white font-bold">{entry.questsCompleted || 0}</span>
              )}
              {entry.prize > 0 && (
                <div className="text-xs text-amber-400 mt-1">
                  +{entry.prize.toLocaleString()} Gold
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
