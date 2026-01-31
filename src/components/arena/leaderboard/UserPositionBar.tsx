/**
 * UserPositionBar Component
 *
 * Always-visible bar showing the current user's leaderboard position.
 */

import React from 'react';
import type { UserPosition, RankName } from '~/utils/arenaApi';
import RankBadge from '../ranks/RankBadge';
import GoldDisplay from '../common/GoldDisplay';

interface UserPositionBarProps {
  position: UserPosition;
  userName: string;
  rank: RankName;
  rankLevel: number;
  type: 'GOLD' | 'QUEST';
  onScrollToPosition?: () => void;
  className?: string;
}

export default function UserPositionBar({
  position,
  userName,
  rank,
  rankLevel,
  type,
  onScrollToPosition,
  className = '',
}: UserPositionBarProps) {
  const isPlaced = position.isPlaced && position.position !== null;

  return (
    <div
      className={`
        p-4 rounded-xl bg-gradient-to-r from-emerald-900/30 to-emerald-800/10
        border border-emerald-700/30
        ${className}
      `}
    >
      <div className="flex items-center justify-between">
        {/* User Info */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-emerald-400 uppercase tracking-wide">Your Position</span>
            {isPlaced ? (
              <span className="text-3xl font-bold text-white">
                #{position.position?.toLocaleString()}
              </span>
            ) : (
              <span className="text-xl font-medium text-neutral-400">Not Placed</span>
            )}
          </div>

          <div className="h-10 w-px bg-emerald-800/50" />

          <div>
            <p className="text-white font-medium">{userName}</p>
            <RankBadge rank={rank} level={rankLevel} size="sm" />
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6">
          {/* Value */}
          <div className="text-right">
            <span className="text-xs text-neutral-400 block">
              {type === 'GOLD' ? 'Gold Earned' : 'Quests Completed'}
            </span>
            {type === 'GOLD' ? (
              <GoldDisplay amount={position.value} size="lg" />
            ) : (
              <span className="text-2xl font-bold text-white">{position.value}</span>
            )}
          </div>

          {/* Prize */}
          {position.prize > 0 && (
            <div className="text-right">
              <span className="text-xs text-neutral-400 block">Prize</span>
              <GoldDisplay amount={position.prize} size="lg" />
            </div>
          )}

          {/* Percentile */}
          {isPlaced && (
            <div className="text-right">
              <span className="text-xs text-neutral-400 block">Top</span>
              <span className="text-xl font-bold text-emerald-400">
                {position.percentile.toFixed(1)}%
              </span>
            </div>
          )}

          {/* Action */}
          {onScrollToPosition && isPlaced && (
            <button
              onClick={onScrollToPosition}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition"
            >
              Show Position
            </button>
          )}
        </div>
      </div>

      {/* Not placed message */}
      {!isPlaced && (
        <p className="text-sm text-neutral-400 mt-2">
          {type === 'GOLD'
            ? 'Earn Gold by trading and completing quests to appear on the leaderboard!'
            : 'Complete quests to appear on the leaderboard!'}
        </p>
      )}
    </div>
  );
}

/**
 * Compact User Position (for mobile)
 */
export function CompactUserPosition({
  position,
  userName,
  type,
  className = '',
}: {
  position: UserPosition;
  userName: string;
  type: 'GOLD' | 'QUEST';
  className?: string;
}) {
  const isPlaced = position.isPlaced && position.position !== null;

  return (
    <div
      className={`
        flex items-center justify-between p-3 rounded-lg
        bg-emerald-900/20 border border-emerald-700/30
        ${className}
      `}
    >
      <div className="flex items-center gap-3">
        <span className="text-emerald-400 text-sm">You:</span>
        {isPlaced ? (
          <span className="text-white font-bold">#{position.position}</span>
        ) : (
          <span className="text-neutral-400">Not Placed</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {type === 'GOLD' ? (
          <GoldDisplay amount={position.value} size="sm" />
        ) : (
          <span className="text-white">{position.value} quests</span>
        )}
        {position.prize > 0 && (
          <span className="text-amber-400 text-sm">+{position.prize} Gold</span>
        )}
      </div>
    </div>
  );
}
