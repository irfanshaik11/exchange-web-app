/**
 * AssetPlaceholder Component
 *
 * Placeholder for designer assets (badges, icons, etc.)
 * Shows a labeled box until real assets are added.
 */

import React from 'react';

interface AssetPlaceholderProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  sm: 'w-8 h-8',
  md: 'w-16 h-16',
  lg: 'w-24 h-24',
  xl: 'w-32 h-32',
};

export default function AssetPlaceholder({
  name,
  size = 'md',
  className = '',
}: AssetPlaceholderProps) {
  return (
    <div
      className={`${sizes[size]} bg-neutral-800 rounded-lg flex items-center justify-center border border-neutral-700 ${className}`}
    >
      <span className="text-[8px] text-neutral-500 text-center px-1 break-words">
        [{name}]
      </span>
    </div>
  );
}

/**
 * Required Assets List (for documentation)
 *
 * Rank Badges:
 * - DEGEN_BADGE, WARRIOR_BADGE, GLADIATOR_BADGE, COMMANDER_BADGE, TITAN_BADGE
 *
 * Rank Levels (each rank has I-IV):
 * - DEGEN_I, DEGEN_II, DEGEN_III, DEGEN_IV
 * - WARRIOR_I, WARRIOR_II, WARRIOR_III, WARRIOR_IV
 * - etc.
 *
 * Honors Badges:
 * - HONORS_I, HONORS_II, HONORS_III, HONORS_IV, SPARTAN_PARTNER
 *
 * Currency Icons:
 * - GOLD_COIN, SOL_ICON
 *
 * Misc:
 * - LOCKED_ICON, CHECKMARK, TROPHY, FIRE (streak)
 *
 * Background:
 * - Arena background image with stadium/colosseum theme
 */
