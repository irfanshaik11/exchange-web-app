import React from 'react';
import { SentimentBadge } from './SentimentBadge';
import { ConfidenceDot } from './ConfidenceDot';

interface TopPickCardProps {
  question: string;
  text: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  onClick?: () => void;
}

const SENTIMENT_LINE = {
  bullish: 'rgba(74, 222, 128, 0.4)',
  bearish: 'rgba(248, 113, 113, 0.4)',
  neutral: 'rgba(129, 140, 248, 0.3)',
} as const;

export function TopPickCard({ question, text, sentiment, confidence }: TopPickCardProps) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Accent line */}
      <div className="h-[1px]" style={{ background: `linear-gradient(90deg, ${SENTIMENT_LINE[sentiment]}, transparent 80%)` }} />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-[11px] font-medium text-zinc-200 leading-snug">{question}</span>
          <ConfidenceDot confidence={confidence} />
        </div>
        <p className="text-[11px] text-zinc-300/80 leading-[1.6] mb-2.5">{text}</p>
        <SentimentBadge sentiment={sentiment} />
      </div>
    </div>
  );
}
