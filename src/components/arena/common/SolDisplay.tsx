/**
 * SolDisplay Component
 *
 * Displays SOL amounts with the Solana logo.
 * Supports different sizes and optional USD conversion display.
 */

import React from 'react';

interface SolDisplayProps {
  amount: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showIcon?: boolean;
  showLabel?: boolean;
  usdValue?: number;
  className?: string;
  decimals?: number;
}

const sizeStyles = {
  sm: { text: 'text-sm', icon: 'w-4 h-4', gap: 'gap-1' },
  md: { text: 'text-base', icon: 'w-5 h-5', gap: 'gap-1.5' },
  lg: { text: 'text-xl font-bold', icon: 'w-6 h-6', gap: 'gap-2' },
  xl: { text: 'text-3xl font-bold', icon: 'w-8 h-8', gap: 'gap-2' },
};

export default function SolDisplay({
  amount,
  size = 'md',
  showIcon = true,
  showLabel = false,
  usdValue,
  className = '',
  decimals = 4,
}: SolDisplayProps) {
  const styles = sizeStyles[size];

  return (
    <div className={`flex items-center ${styles.gap} ${className}`}>
      {showIcon && <SolanaIcon className={styles.icon} />}
      <div className="flex flex-col">
        <span className={`${styles.text} text-white`}>
          {amount.toFixed(decimals)}
          {showLabel && <span className="text-neutral-400 ml-1 font-normal">SOL</span>}
        </span>
        {usdValue !== undefined && (
          <span className="text-xs text-neutral-500">
            ≈ ${usdValue.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Solana Logo Icon
 */
export function SolanaIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="solGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00FFA3" />
          <stop offset="50%" stopColor="#03E1FF" />
          <stop offset="100%" stopColor="#DC1FFF" />
        </linearGradient>
      </defs>
      <path
        d="M25.7 95.6l14.3-14.3c0.6-0.6 1.4-0.9 2.2-0.9h75.5c1.4 0 2.1 1.7 1.1 2.7l-14.3 14.3c-0.6 0.6-1.4 0.9-2.2 0.9H26.8c-1.4 0-2.1-1.7-1.1-2.7z"
        fill="url(#solGradient)"
      />
      <path
        d="M25.7 32.4l14.3 14.3c0.6 0.6 1.4 0.9 2.2 0.9h75.5c1.4 0 2.1-1.7 1.1-2.7L104.5 30.6c-0.6-0.6-1.4-0.9-2.2-0.9H26.8c-1.4 0-2.1 1.7-1.1 2.7z"
        fill="url(#solGradient)"
      />
      <path
        d="M102.3 63.9l-14.3-14.3c-0.6-0.6-1.4-0.9-2.2-0.9H10.3c-1.4 0-2.1 1.7-1.1 2.7l14.3 14.3c0.6 0.6 1.4 0.9 2.2 0.9h75.5c1.4 0 2.1-1.7 1.1-2.7z"
        fill="url(#solGradient)"
      />
    </svg>
  );
}
