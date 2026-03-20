import React from 'react';
import { SentimentBadge } from './SentimentBadge';
import { ConfidenceDot } from './ConfidenceDot';

interface TopPickCardProps {
  question: string;
  text: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  onClick: () => void;
}

export function TopPickCard({ question, text, sentiment, confidence, onClick }: TopPickCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-xs font-medium text-zinc-200 line-clamp-2 leading-snug">{question}</span>
        <ConfidenceDot confidence={confidence} />
      </div>
      <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2 mb-2">{text}</p>
      <SentimentBadge sentiment={sentiment} />
    </button>
  );
}
