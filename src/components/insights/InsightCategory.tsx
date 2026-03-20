import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiChevronRight } from 'react-icons/hi';
import { SentimentBadge } from './SentimentBadge';
import { ConfidenceDot } from './ConfidenceDot';

interface InsightCategoryProps {
  label: string;
  insight: {
    text: string;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    confidence: 'high' | 'medium' | 'low';
  };
}

const SENTIMENT_BORDER = {
  bullish: 'rgba(74, 222, 128, 0.3)',
  bearish: 'rgba(248, 113, 113, 0.3)',
  neutral: 'rgba(129, 140, 248, 0.2)',
} as const;

export function InsightCategory({ label, insight }: InsightCategoryProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)'}`,
        backdropFilter: 'blur(12px)',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <HiChevronRight className="w-3 h-3 text-zinc-600" />
          </motion.div>
          <span className="text-[11px] font-medium text-zinc-300 tracking-wide">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <SentimentBadge sentiment={insight.sentiment} />
          <ConfidenceDot confidence={insight.confidence} />
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0.5">
              <div
                className="rounded-xl px-3 py-2.5"
                style={{
                  background: 'rgba(0, 0, 0, 0.15)',
                  borderLeft: `2px solid ${SENTIMENT_BORDER[insight.sentiment]}`,
                }}
              >
                <p className="text-[11px] text-zinc-400 leading-[1.65]">
                  {insight.text}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
