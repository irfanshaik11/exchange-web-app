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

export function InsightCategory({ label, insight }: InsightCategoryProps) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className="rounded-xl overflow-hidden transition-colors duration-200 hover:border-white/[0.12]"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
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
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0.5">
              <p className="text-[12px] text-zinc-300/80 leading-[1.65]">
                {insight.text}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
