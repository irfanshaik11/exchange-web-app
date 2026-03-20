import React from 'react';

const CONFIDENCE_COLORS = {
  high: '#4ADE80',
  medium: '#FBBF24',
  low: '#6B7280',
} as const;

export function ConfidenceDot({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  return (
    <span
      title={`${confidence} confidence`}
      style={{ backgroundColor: CONFIDENCE_COLORS[confidence] }}
      className="inline-block w-2 h-2 rounded-full"
    />
  );
}
