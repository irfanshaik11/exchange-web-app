import React from 'react';

const SENTIMENT_STYLES = {
  bullish: { bg: 'rgba(74, 222, 128, 0.15)', text: '#4ADE80', label: 'Bullish' },
  bearish: { bg: 'rgba(248, 113, 113, 0.15)', text: '#F87171', label: 'Bearish' },
  neutral: { bg: 'rgba(107, 114, 128, 0.15)', text: '#9CA3AF', label: 'Neutral' },
} as const;

export function SentimentBadge({ sentiment }: { sentiment: 'bullish' | 'bearish' | 'neutral' }) {
  const style = SENTIMENT_STYLES[sentiment];
  return (
    <span
      style={{ backgroundColor: style.bg, color: style.text }}
      className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide"
    >
      {style.label}
    </span>
  );
}
