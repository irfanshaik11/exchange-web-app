import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineTrendingUp,
  HiOutlineScale,
  HiOutlineBeaker,
  HiOutlineCloud,
  HiOutlineFilm,
  HiOutlineBriefcase,
  HiOutlineGlobeAlt,
  HiOutlineChartBar,
  HiOutlineChip,
  HiOutlineSparkles,
  HiOutlineCog,
  HiOutlineHome,
} from 'react-icons/hi';
import { BiFootball, BiBitcoin } from 'react-icons/bi';
import { T } from './theme';

interface SidebarCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const CATEGORIES: SidebarCategory[] = [
  { id: 'all', label: 'All Markets', icon: HiOutlineHome, color: T.accent },
  { id: 'politics', label: 'Politics', icon: HiOutlineScale, color: '#818CF8' },      // Indigo
  { id: 'crypto', label: 'Crypto', icon: BiBitcoin, color: '#FBBF24' },               // Amber
  { id: 'sports', label: 'Sports', icon: BiFootball, color: '#4ADE80' },               // Green
  { id: 'finance', label: 'Finance', icon: HiOutlineTrendingUp, color: '#60A5FA' },   // Blue
  { id: 'tech', label: 'AI & Tech', icon: HiOutlineChip, color: '#A78BFA' },          // Purple
  { id: 'entertainment', label: 'Entertainment', icon: HiOutlineFilm, color: '#F472B6' }, // Pink
  { id: 'science', label: 'Science', icon: HiOutlineBeaker, color: '#FB923C' },       // Orange
  { id: 'weather', label: 'Weather', icon: HiOutlineCloud, color: '#38BDF8' },        // Sky blue
  { id: 'geopolitics', label: 'Geopolitics', icon: HiOutlineGlobeAlt, color: '#F97316' }, // Deep orange
];

interface PredictionsSidebarProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  portfolioBalance?: number;
  portfolioPnL?: number;
  activePositions?: number;
  winCount?: number;
  lossCount?: number;
}

export default function PredictionsSidebar({
  selectedCategory,
  onSelectCategory,
  portfolioBalance,
  portfolioPnL,
  activePositions = 0,
  winCount = 0,
  lossCount = 0,
}: PredictionsSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasPnL = portfolioPnL != null && portfolioPnL !== 0;
  const pnlPositive = (portfolioPnL ?? 0) >= 0;

  return (
    <motion.aside
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      animate={{ width: isExpanded ? T.sidebarExpandedWidth : T.sidebarWidth }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="fixed left-0 top-0 bottom-0 z-[9998] hidden md:flex flex-col"
      style={{
        backgroundColor: T.bg,
        borderRight: `1px solid ${T.border}`,
        paddingTop: 72, // below header + breathing room
      }}
    >
      {/* Category Navigation */}
      <nav className="flex-1 flex flex-col gap-1 px-2 pt-4 pb-3 overflow-y-auto overflow-x-hidden">
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.id;
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className="relative flex items-center gap-3 rounded-lg transition-all duration-150 overflow-hidden cursor-pointer hover:bg-white/[0.04]"
              style={{
                padding: '8px 10px',
                backgroundColor: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: isActive ? T.text : T.muted,
              }}
            >
              {/* Active indicator */}
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r"
                  style={{ backgroundColor: T.accent }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                />
              )}
              <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center" style={{ color: isActive ? cat.color : T.muted }}>
                <Icon className="w-5 h-5" />
              </span>
              <AnimatePresence>
                {isExpanded && (
                  <motion.span
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.15 }}
                    className="text-[12px] font-medium whitespace-nowrap"
                  >
                    {cat.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}

        {/* Divider */}
        <div className="my-2 mx-2" style={{ borderTop: `1px solid ${T.border}` }} />

        {/* AI Predictions — scroll to section */}
        <button
          onClick={() => {
            const el = document.getElementById('ai-predictions-section');
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="flex items-center gap-3 rounded-lg w-full text-left cursor-pointer hover:bg-white/[0.04] transition-all duration-150"
          style={{
            padding: '8px 10px',
            color: T.purple,
          }}
        >
          <HiOutlineSparkles className="w-5 h-5 flex-shrink-0" />
          <AnimatePresence>
            {isExpanded && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.15 }}
                className="text-[12px] font-medium whitespace-nowrap"
              >
                AI Predictions
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </nav>

      {/* Portfolio Widget — commented out, re-enable when portfolio data is wired up
      <div
        className="mx-2 mb-3 rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'rgba(255,255,255,0.025)',
          border: `1px solid ${T.border}`,
        }}
      >
        {isExpanded ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="p-3"
          >
            <div className="text-[10px] uppercase tracking-[1.2px] mb-2" style={{ color: T.muted }}>
              Portfolio
            </div>
            <div className="text-lg font-bold" style={{ color: T.text, fontVariantNumeric: 'tabular-nums' }}>
              ${(portfolioBalance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            {hasPnL && (
              <div
                className="text-[11px] font-medium mt-0.5"
                style={{ color: pnlPositive ? T.green : T.red }}
              >
                {pnlPositive ? '+' : ''}{portfolioPnL?.toFixed(2)} today
              </div>
            )}
            {(winCount > 0 || lossCount > 0) && (
              <>
                <div className="flex gap-1 mt-2">
                  <div
                    className="h-[3px] rounded-full"
                    style={{
                      backgroundColor: T.green,
                      flex: winCount || 1,
                    }}
                  />
                  <div
                    className="h-[3px] rounded-full"
                    style={{
                      backgroundColor: T.red,
                      flex: lossCount || 1,
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px]" style={{ color: T.green }}>{winCount} winning</span>
                  <span className="text-[9px]" style={{ color: T.red }}>{lossCount} losing</span>
                </div>
              </>
            )}
            {activePositions > 0 && (
              <div className="text-[10px] mt-2" style={{ color: T.muted }}>
                {activePositions} active position{activePositions !== 1 ? 's' : ''}
              </div>
            )}
          </motion.div>
        ) : (
          <div className="p-2 flex flex-col items-center gap-1">
            <HiOutlineChartBar className="w-4 h-4" style={{ color: T.muted }} />
            {hasPnL && (
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: pnlPositive ? T.green : T.red }}
              />
            )}
          </div>
        )}
      </div>
      */}
    </motion.aside>
  );
}
