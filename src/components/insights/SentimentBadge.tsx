import React from 'react';

const SENTIMENT_CONFIG = {
  bullish: {
    bg: 'rgba(74, 222, 128, 0.08)',
    border: 'rgba(74, 222, 128, 0.2)',
    text: '#4ADE80',
    glow: '0 0 12px rgba(74, 222, 128, 0.15)',
    label: 'Bullish',
    icon: '\u25B2', // ▲
  },
  bearish: {
    bg: 'rgba(248, 113, 113, 0.08)',
    border: 'rgba(248, 113, 113, 0.2)',
    text: '#F87171',
    glow: '0 0 12px rgba(248, 113, 113, 0.15)',
    label: 'Bearish',
    icon: '\u25BC', // ▼
  },
  neutral: {
    bg: 'rgba(129, 140, 248, 0.06)',
    border: 'rgba(129, 140, 248, 0.15)',
    text: '#818CF8',
    glow: 'none',
    label: 'Neutral',
    icon: '\u2014', // —
  },
} as const;

export function SentimentBadge({ sentiment }: { sentiment: 'bullish' | 'bearish' | 'neutral' }) {
  const c = SENTIMENT_CONFIG[sentiment];
  return (
    <span
      style={{
        backgroundColor: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        boxShadow: c.glow,
      }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-[0.08em]"
    >
      <span className="text-[7px] leading-none">{c.icon}</span>
      {c.label}
    </span>
  );
}
