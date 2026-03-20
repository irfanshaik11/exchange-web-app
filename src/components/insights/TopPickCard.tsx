import React from 'react';
import { motion } from 'framer-motion';
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
  bullish: '#4ADE80',
  bearish: '#F87171',
  neutral: '#818CF8',
} as const;

export function TopPickCard({ question, text, sentiment, confidence, onClick }: TopPickCardProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="w-full text-left rounded-xl overflow-hidden transition-all duration-200"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Thin colored top accent line */}
      <div className="h-[2px] w-full" style={{ background: `linear-gradient(90deg, ${SENTIMENT_LINE[sentiment]}, transparent)` }} />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <span className="text-[11px] font-medium text-zinc-200 line-clamp-2 leading-snug">{question}</span>
          <ConfidenceDot confidence={confidence} />
        </div>
        <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2 mb-2">{text}</p>
        <SentimentBadge sentiment={sentiment} />
      </div>
    </motion.button>
  );
}
