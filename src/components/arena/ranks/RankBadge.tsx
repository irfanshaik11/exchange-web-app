/**
 * RankBadge Component
 *
 * Displays a user's rank with icon and name.
 * Used throughout the Arena UI for compact rank display.
 */

import React from 'react';
import type { RankName } from '~/utils/arenaApi';

interface RankBadgeProps {
  rank: RankName;
  level: number;
  size?: 'sm' | 'md' | 'lg';
  showLevel?: boolean;
  showName?: boolean;
  className?: string;
}

// Rank colors matching the backend configuration
const RANK_COLORS: Record<RankName, { bg: string; text: string; border: string; glow: string }> = {
  DEGEN: {
    bg: 'bg-gradient-to-br from-amber-900/50 to-amber-800/30',
    text: 'text-amber-500',
    border: 'border-amber-700/50',
    glow: 'shadow-amber-900/20',
  },
  WARRIOR: {
    bg: 'bg-gradient-to-br from-slate-700/50 to-slate-600/30',
    text: 'text-slate-300',
    border: 'border-slate-500/50',
    glow: 'shadow-slate-700/20',
  },
  GLADIATOR: {
    bg: 'bg-gradient-to-br from-emerald-900/50 to-emerald-800/30',
    text: 'text-emerald-400',
    border: 'border-emerald-600/50',
    glow: 'shadow-emerald-900/20',
  },
  COMMANDER: {
    bg: 'bg-gradient-to-br from-red-900/50 to-amber-900/30',
    text: 'text-red-400',
    border: 'border-red-700/50',
    glow: 'shadow-red-900/20',
  },
  TITAN: {
    bg: 'bg-gradient-to-br from-yellow-600/50 to-amber-500/30',
    text: 'text-yellow-400',
    border: 'border-yellow-500/50',
    glow: 'shadow-yellow-600/30',
  },
};

const RANK_NAMES: Record<RankName, string> = {
  DEGEN: 'Degen',
  WARRIOR: 'Warrior',
  GLADIATOR: 'Gladiator',
  COMMANDER: 'Commander',
  TITAN: 'Titan',
};

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV'];

const sizeStyles = {
  sm: {
    container: 'px-2 py-0.5',
    icon: 'w-4 h-4',
    text: 'text-xs',
  },
  md: {
    container: 'px-3 py-1',
    icon: 'w-5 h-5',
    text: 'text-sm',
  },
  lg: {
    container: 'px-4 py-1.5',
    icon: 'w-6 h-6',
    text: 'text-base',
  },
};

export default function RankBadge({
  rank,
  level,
  size = 'md',
  showLevel = true,
  showName = true,
  className = '',
}: RankBadgeProps) {
  const colors = RANK_COLORS[rank];
  const styles = sizeStyles[size];
  const romanLevel = ROMAN_NUMERALS[level - 1] || level.toString();

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 rounded-full border
        ${colors.bg} ${colors.border} shadow-lg ${colors.glow}
        ${styles.container} ${className}
      `}
    >
      <RankIcon rank={rank} className={styles.icon} />
      {showName && (
        <span className={`font-semibold ${colors.text} ${styles.text}`}>
          {RANK_NAMES[rank]}
          {showLevel && ` ${romanLevel}`}
        </span>
      )}
    </div>
  );
}

/**
 * Rank Icon (stylized icon for each rank)
 */
export function RankIcon({ rank, className = '' }: { rank: RankName; className?: string }) {
  const colors = RANK_COLORS[rank];

  // Simple geometric icons for each rank
  const icons: Record<RankName, React.ReactNode> = {
    DEGEN: (
      // Diamond shape for Degen
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 2L22 12L12 22L2 12L12 2Z" />
      </svg>
    ),
    WARRIOR: (
      // Shield shape for Warrior
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 2L4 5V11C4 16.5 7.8 21.7 12 23C16.2 21.7 20 16.5 20 11V5L12 2Z" />
      </svg>
    ),
    GLADIATOR: (
      // Sword shape for Gladiator
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M19 3L5 17L3 21L7 19L21 5L19 3ZM7 7L17 17M9 5L19 15" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    COMMANDER: (
      // Star/badge for Commander
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
    ),
    TITAN: (
      // Crown for Titan
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19H5V17H19V19Z" />
      </svg>
    ),
  };

  return <span className={colors.text}>{icons[rank]}</span>;
}

/**
 * Get rank display name with level
 */
export function getRankDisplayName(rank: RankName, level: number): string {
  const romanLevel = ROMAN_NUMERALS[level - 1] || level.toString();
  return `${RANK_NAMES[rank]} ${romanLevel}`;
}

/**
 * Get rank color for styling
 */
export function getRankColor(rank: RankName): string {
  return RANK_COLORS[rank].text.replace('text-', '');
}

export { RANK_COLORS, RANK_NAMES, ROMAN_NUMERALS };
