/**
 * GoldDisplay Component
 *
 * Displays Gold amounts with a coin icon.
 * Supports different sizes and can show the multiplier badge.
 */

import React from 'react';

interface GoldDisplayProps {
  amount: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showIcon?: boolean;
  showLabel?: boolean;
  multiplier?: number;
  className?: string;
  animated?: boolean;
}

const sizeStyles = {
  sm: { text: 'text-sm', icon: 'w-4 h-4', gap: 'gap-1' },
  md: { text: 'text-base', icon: 'w-5 h-5', gap: 'gap-1.5' },
  lg: { text: 'text-xl font-bold', icon: 'w-6 h-6', gap: 'gap-2' },
  xl: { text: 'text-3xl font-bold', icon: 'w-8 h-8', gap: 'gap-2' },
};

export default function GoldDisplay({
  amount,
  size = 'md',
  showIcon = true,
  showLabel = false,
  multiplier,
  className = '',
  animated = false,
}: GoldDisplayProps) {
  const styles = sizeStyles[size];

  return (
    <div className={`flex items-center ${styles.gap} ${className}`}>
      {showIcon && (
        <div
          className={`${styles.icon} rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center ${
            animated ? 'animate-pulse' : ''
          }`}
        >
          <span className="text-[0.6em] font-bold text-amber-900">G</span>
        </div>
      )}
      <span className={`${styles.text} text-amber-400`}>
        {amount.toLocaleString()}
        {showLabel && <span className="text-neutral-400 ml-1 font-normal">Gold</span>}
      </span>
      {multiplier && multiplier > 1 && (
        <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-bold rounded">
          {multiplier}x
        </span>
      )}
    </div>
  );
}

/**
 * Gold Coin Icon (for standalone use)
 */
export function GoldCoinIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      className={`rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="font-bold text-amber-900" style={{ fontSize: size * 0.5 }}>
        G
      </span>
    </div>
  );
}
