import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiChevronDown } from 'react-icons/hi';
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
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-white/[0.06] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-white/[0.03] transition-colors"
      >
        <span className="text-zinc-200 text-xs font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <SentimentBadge sentiment={insight.sentiment} />
          <ConfidenceDot confidence={insight.confidence} />
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <HiChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          </motion.div>
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 text-xs text-zinc-400 leading-relaxed">
              {insight.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
