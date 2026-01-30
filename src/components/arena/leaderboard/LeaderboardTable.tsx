/**
 * LeaderboardTable Component
 *
 * Paginated leaderboard table with search functionality.
 * Updated with space theme and React Icons.
 */

import React from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { GiLaurelCrown, GiMedal } from 'react-icons/gi';
import type { LeaderboardEntry, RankName } from '~/utils/arenaApi';
import RankBadge from '../ranks/RankBadge';
import GoldDisplay from '../common/GoldDisplay';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  type: 'GOLD' | 'QUEST';
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  highlightUserId?: number;
  isLoading?: boolean;
  className?: string;
}

export default function LeaderboardTable({
  entries,
  type,
  total,
  page,
  pageSize,
  onPageChange,
  highlightUserId,
  isLoading = false,
  className = '',
}: LeaderboardTableProps) {
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className={className}>
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-neutral-400 border-b border-white/10">
              <th className="pb-3 pl-4 w-16">Place</th>
              <th className="pb-3">User</th>
              <th className="pb-3">Rank</th>
              <th className="pb-3 text-right">{type === 'GOLD' ? 'Gold Earned' : 'Quests'}</th>
              <th className="pb-3 text-right pr-4">Prize</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              // Loading skeletons
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="py-3 pl-4">
                    <div className="w-8 h-5 bg-white/5 rounded animate-pulse" />
                  </td>
                  <td className="py-3">
                    <div className="w-24 h-5 bg-white/5 rounded animate-pulse" />
                  </td>
                  <td className="py-3">
                    <div className="w-20 h-5 bg-white/5 rounded animate-pulse" />
                  </td>
                  <td className="py-3 text-right">
                    <div className="w-16 h-5 bg-white/5 rounded animate-pulse ml-auto" />
                  </td>
                  <td className="py-3 text-right pr-4">
                    <div className="w-12 h-5 bg-white/5 rounded animate-pulse ml-auto" />
                  </td>
                </tr>
              ))
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-neutral-500">
                  No entries yet
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <LeaderboardRow
                  key={`${entry.userId}-${entry.position}`}
                  entry={entry}
                  type={type}
                  isHighlighted={entry.userId === highlightUserId}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-black/40 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-900/30 transition border border-white/10"
          >
            <FiChevronLeft className="w-4 h-4" />
            Prev
          </button>
          <span className="px-4 text-neutral-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-black/40 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-900/30 transition border border-white/10"
          >
            Next
            <FiChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * LeaderboardRow Component
 */
function LeaderboardRow({
  entry,
  type,
  isHighlighted,
}: {
  entry: LeaderboardEntry;
  type: 'GOLD' | 'QUEST';
  isHighlighted: boolean;
}) {
  const displayName = entry.isAnonymous ? '•••••••' : entry.userName;

  return (
    <tr
      className={`
        border-b border-white/5 transition
        ${isHighlighted
          ? 'bg-emerald-900/20 border-emerald-500/30'
          : 'hover:bg-white/5'
        }
      `}
    >
      {/* Position */}
      <td className="py-3 pl-4">
        <PositionBadge position={entry.position} />
      </td>

      {/* User */}
      <td className="py-3">
        <span className={`font-medium ${isHighlighted ? 'text-emerald-400' : 'text-white'}`}>
          {displayName}
          {isHighlighted && <span className="ml-2 text-xs text-emerald-500">(You)</span>}
        </span>
      </td>

      {/* Rank */}
      <td className="py-3">
        <RankBadge rank={entry.rank} level={entry.rankLevel} size="sm" />
      </td>

      {/* Value */}
      <td className="py-3 text-right">
        {type === 'GOLD' ? (
          <GoldDisplay amount={entry.goldEarned || 0} size="sm" />
        ) : (
          <span className="text-white font-medium">{entry.questsCompleted || 0}</span>
        )}
      </td>

      {/* Prize */}
      <td className="py-3 text-right pr-4">
        {entry.prize > 0 ? (
          <GoldDisplay amount={entry.prize} size="sm" />
        ) : (
          <span className="text-neutral-600">—</span>
        )}
      </td>
    </tr>
  );
}

/**
 * Position Badge (special styling for top 3)
 */
function PositionBadge({ position }: { position: number }) {
  if (position === 1) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500/20 border border-yellow-500/30">
        <GiLaurelCrown className="w-5 h-5 text-yellow-400" />
      </span>
    );
  }
  if (position === 2) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-400/20 border border-slate-400/30">
        <GiMedal className="w-5 h-5 text-slate-300" />
      </span>
    );
  }
  if (position === 3) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-700/20 border border-amber-600/30">
        <GiMedal className="w-5 h-5 text-amber-600" />
      </span>
    );
  }
  return (
    <span className="text-neutral-400 font-medium">#{position}</span>
  );
}
