import React from 'react';

const CONFIDENCE_CONFIG = {
  high: { color: '#4ADE80', glow: '0 0 6px rgba(74, 222, 128, 0.4)', label: 'High' },
  medium: { color: '#FBBF24', glow: '0 0 6px rgba(251, 191, 36, 0.3)', label: 'Med' },
  low: { color: '#6B7280', glow: 'none', label: 'Low' },
} as const;

export function ConfidenceDot({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const c = CONFIDENCE_CONFIG[confidence];
  return (
    <span className="inline-flex items-center gap-1">
      <span
        style={{
          backgroundColor: c.color,
          boxShadow: c.glow,
        }}
        className="w-1.5 h-1.5 rounded-full"
      />
      <span className="text-[9px] text-zinc-500 font-medium tracking-wide">{c.label}</span>
    </span>
  );
}
