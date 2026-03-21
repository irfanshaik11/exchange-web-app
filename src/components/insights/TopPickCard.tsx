import React from 'react';
import { SentimentBadge } from './SentimentBadge';
import { ConfidenceDot } from './ConfidenceDot';

interface TopPickCardProps {
  question: string;
  text: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
}

export function TopPickCard({ question, text, sentiment, confidence }: TopPickCardProps) {
  return (
    <div
      className="rounded-xl overflow-hidden transition-colors duration-200 hover:border-white/[0.12]"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-[11px] font-medium text-zinc-200 leading-snug">{question}</span>
          <ConfidenceDot confidence={confidence} />
        </div>
        <p className="text-[12px] text-zinc-300/80 leading-[1.6] mb-2.5">{text}</p>
        <SentimentBadge sentiment={sentiment} />
      </div>
    </div>
  );
}
