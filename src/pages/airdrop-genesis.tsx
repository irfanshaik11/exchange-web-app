/**
 * Arena Page
 *
 * Premium gaming interface inspired by League of Legends / Trojan Arena:
 * - Dark background with space theme
 * - Gold/yellow accents for the header
 * - Hexagonal rank badges with glow effects
 * - Scrollable rank carousel with auto-center
 * - Polished animations and micro-interactions
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Header from '~/components/Header';
import Footer from '~/components/Footer';
import { DockedPanelMarginWrapper } from '~/contexts/DockedPanelContext';
import { useUser } from '~/components/UserContext';
import { useArenaStats, useQuests, useCashbackSummary, useClaimCashback, useClaimAllQuests } from '~/hooks/useArena';
import SocialQuestsSection from '~/components/arena/quests/SocialQuestsSection';
import SnagDailyQuests, { SNAG_DAILY_QUEST_IDS } from '~/components/arena/quests/SnagDailyQuests';
import KeyTweetsSection from '~/components/arena/quests/KeyTweetsSection';
import SeasonRoadmap from '~/components/arena/season/SeasonRoadmap';
import SeasonCountdownBanner from '~/components/arena/season/SeasonCountdownBanner';
import ArenaInfoTooltip from '~/components/arena/common/ArenaInfoTooltip';
// claimAllQuests direct import removed — replaced by useClaimAllQuests hook.
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { showArenaErrorToast } from '~/utils/arenaToast';

// React Icons
import { GiTrophy } from 'react-icons/gi';
import ArenaPageToggle from '~/components/ArenaPageToggle';
import { FiCheck, FiLock, FiChevronLeft, FiChevronRight, FiClock, FiExternalLink, FiPlus, FiMinus, FiAward, FiZap, FiInfo } from 'react-icons/fi';
import InterstateTooltip from '~/components/InterstateTooltip';
import { HiLightningBolt, HiSparkles, HiFire, HiSwitchVertical } from 'react-icons/hi';
import { IoRocketSharp, IoFlameSharp } from 'react-icons/io5';
import { BiDiamond, BiTargetLock, BiTrendingUp } from 'react-icons/bi';
import { SiSolana } from 'react-icons/si';
import { RiVipCrownFill } from 'react-icons/ri';

// Rank icons mapping
// Helper to get rank image path
const getRankImage = (rank: string, level: number = 1): string => {
  const rankLower = rank.toLowerCase();
  const clampedLevel = Math.max(1, Math.min(4, level || 1));
  return `/ranks/${rankLower}-${clampedLevel}.png`;
};


// Rank configuration with all levels
const RANK_CONFIG = {
  DEGEN: { cashback: 10, multiplier: 1, color: '#8B7355', levels: [0, 250, 500, 1000] },
  WARRIOR: { cashback: 15, multiplier: 2, color: '#4A90A4', levels: [1000, 2500, 5000, 10000] },
  GLADIATOR: { cashback: 20, multiplier: 2.5, color: '#50C878', levels: [10000, 25000, 50000, 100000] },
  COMMANDER: { cashback: 25, multiplier: 3, color: '#9B59B6', levels: [100000, 250000, 500000, 1000000] },
  TITAN: { cashback: 35, multiplier: 4, color: '#FFD700', levels: [1000000, 2500000, 5000000, 10000000] },
};

// Generate all rank levels for the carousel (levels I-IV for each rank)
const ALL_RANKS = [
  { rank: 'DEGEN', level: 1, name: 'DEGEN I', goldRequired: 0 },
  { rank: 'DEGEN', level: 2, name: 'DEGEN II', goldRequired: 250 },
  { rank: 'DEGEN', level: 3, name: 'DEGEN III', goldRequired: 500 },
  { rank: 'DEGEN', level: 4, name: 'DEGEN IV', goldRequired: 1000 },
  { rank: 'WARRIOR', level: 1, name: 'WARRIOR I', goldRequired: 1000 },
  { rank: 'WARRIOR', level: 2, name: 'WARRIOR II', goldRequired: 2500 },
  { rank: 'WARRIOR', level: 3, name: 'WARRIOR III', goldRequired: 5000 },
  { rank: 'WARRIOR', level: 4, name: 'WARRIOR IV', goldRequired: 10000 },
  { rank: 'GLADIATOR', level: 1, name: 'GLADIATOR I', goldRequired: 10000 },
  { rank: 'GLADIATOR', level: 2, name: 'GLADIATOR II', goldRequired: 25000 },
  { rank: 'GLADIATOR', level: 3, name: 'GLADIATOR III', goldRequired: 50000 },
  { rank: 'GLADIATOR', level: 4, name: 'GLADIATOR IV', goldRequired: 100000 },
  { rank: 'COMMANDER', level: 1, name: 'COMMANDER I', goldRequired: 100000 },
  { rank: 'COMMANDER', level: 2, name: 'COMMANDER II', goldRequired: 250000 },
  { rank: 'COMMANDER', level: 3, name: 'COMMANDER III', goldRequired: 500000 },
  { rank: 'COMMANDER', level: 4, name: 'COMMANDER IV', goldRequired: 1000000 },
  { rank: 'TITAN', level: 1, name: 'TITAN I', goldRequired: 1000000 },
  { rank: 'TITAN', level: 2, name: 'TITAN II', goldRequired: 2500000 },
  { rank: 'TITAN', level: 3, name: 'TITAN III', goldRequired: 5000000 },
  { rank: 'TITAN', level: 4, name: 'TITAN IV', goldRequired: 10000000 },
];

// Space background - contained within rounded container
const SpaceBackgroundContained = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
    {/* Main background image */}
    <div
      className="absolute inset-x-0 top-0 h-[80vh] bg-cover bg-top bg-no-repeat"
      style={{ backgroundImage: 'url(/ranks/Background.png)' }}
    />
    {/* Subtle dark overlay */}
    <div className="absolute inset-0 bg-black/30" />
    {/* Multi-layer gradual fade for smooth transition */}
    <div
      className="absolute inset-0"
      style={{
        background: 'linear-gradient(to bottom, transparent 0%, transparent 20%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.3) 45%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.85) 75%, black 90%)'
      }}
    />
    {/* Extra smooth fade layer */}
    <div
      className="absolute inset-x-0 top-1/4 bottom-0"
      style={{
        background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.2) 25%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.8) 75%, black 100%)'
      }}
    />
    {/* Side vignette */}
    <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />
  </div>
);

// Live countdown timer hook
const useCountdown = (targetHour = 0) => {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setUTCHours(targetHour, 0, 0, 0);
      if (tomorrow <= now) {
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      }
      const diff = tomorrow.getTime() - now.getTime();
      return {
        hours: Math.floor(diff / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      };
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);
    return () => clearInterval(timer);
  }, [targetHour]);

  return timeLeft;
};

// Animated progress bar component
const AnimatedProgressBar = ({ progress, color = 'yellow' }: { progress: number; color?: 'yellow' | 'emerald' | 'purple' }) => {
  const colors = {
    yellow: 'from-yellow-600 via-yellow-400 to-yellow-600',
    emerald: 'from-emerald-600 via-emerald-400 to-emerald-600',
    purple: 'from-purple-600 via-purple-400 to-purple-600',
  };

  return (
    <div className="relative h-2 bg-neutral-800 rounded-full overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 bg-gradient-to-r ${colors[color]} rounded-full transition-all duration-700 ease-out`}
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
      {/* Shine effect */}
      <div
        className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shine"
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  );
};

// Rank badge using PNG images
const HexBadge = ({ rank, level = 1, size = 'md', isLocked = false, isCurrent = false }: { rank: string; level?: number; size?: 'xs' | 'sm' | 'md' | 'lg'; isLocked?: boolean; isCurrent?: boolean }) => {
  const config = RANK_CONFIG[rank as keyof typeof RANK_CONFIG] || RANK_CONFIG.DEGEN;
  const imageLevel = Math.max(1, Math.min(4, level || 1));

  const sizes = {
    xs: { container: 'w-8 h-8', image: 'w-7 h-7' },
    sm: { container: 'w-28 h-28', image: 'w-24 h-24' },
    md: { container: 'w-40 h-40', image: 'w-36 h-36' },
    lg: { container: 'w-52 h-52', image: 'w-48 h-48' },
  };

  return (
    <div className="relative flex flex-col items-center group">
      {/* Glow effect for current/unlocked */}
      {!isLocked && (
        <div
          className={`absolute inset-0 blur-xl transition-opacity duration-500 ${isCurrent ? 'opacity-60 animate-pulse-slow' : 'opacity-30 group-hover:opacity-50'}`}
          style={{
            background: `radial-gradient(circle, ${config.color}60 0%, transparent 70%)`,
            transform: 'scale(1.5)',
          }}
        />
      )}

      {/* Badge container - no zoom on hover */}
      <div className={`relative ${sizes[size].container} flex items-center justify-center`}>
        <img
          src={getRankImage(rank, imageLevel)}
          alt={`${rank} ${imageLevel}`}
          className={`${sizes[size].image} object-contain ${isLocked ? 'opacity-40 grayscale' : ''}`}
          style={{
            filter: !isLocked && isCurrent ? `drop-shadow(0 0 12px ${config.color}80)` : undefined,
          }}
        />
      </div>
    </div>
  );
};

// Main badge display - static with glow effect
const MainBadge = ({ rank, level = 1 }: { rank: string; level?: number }) => {
  const config = RANK_CONFIG[rank as keyof typeof RANK_CONFIG] || RANK_CONFIG.DEGEN;
  const imageLevel = Math.max(1, Math.min(4, level || 1));

  return (
    <div className="relative flex flex-col items-center">
      {/* Glow effect */}
      <div
        className="absolute inset-0 blur-xl opacity-60"
        style={{
          background: `radial-gradient(circle, ${config.color}60 0%, transparent 70%)`,
          transform: 'scale(1.8)',
        }}
      />

      {/* Badge image */}
      <div className="relative" style={{ width: '180px', height: '180px' }}>
        <img
          src={getRankImage(rank, imageLevel)}
          alt={`${rank} ${imageLevel}`}
          className="w-44 h-44 object-contain"
          style={{ filter: `drop-shadow(0 0 15px ${config.color}80)` }}
        />
      </div>
    </div>
  );
};

// Level indicator diamonds with connecting line (exact Trojan match)
const LevelIndicator = ({ currentLevel, totalLevels = 4 }: { currentLevel: number; totalLevels?: number }) => {
  // Bronze/tan color palette
  const bronze = {
    light: '#D4C4B0',      // Light tan fill for active
    main: '#B8A082',       // Main bronze
    border: '#9A8872',     // Tan border for active diamond
  };

  // Calculate progress - line goes up to the active diamond position
  // Positions: 1=15%, 2=38%, 3=62%, 4=85% (centered in their zones)
  const diamondPositions = [15, 38, 62, 85];
  const progressWidth = diamondPositions[currentLevel - 1];

  return (
    <div className="relative mt-8 mb-4" style={{ width: '100%', maxWidth: '400px', margin: '32px auto 16px' }}>
      {/* Diamond row with line through center */}
      <div className="relative" style={{ height: '48px' }}>
        {/* Background line - extends full width, gray */}
        <div
          className="absolute"
          style={{
            top: '50%',
            left: '0',
            right: '0',
            height: '2px',
            transform: 'translateY(-50%)',
            backgroundColor: '#3d3d3d',
          }}
        />

        {/* Progress line - bronze gradient with glow in center */}
        <div
          className="absolute transition-all duration-500"
          style={{
            top: '50%',
            left: '0',
            height: '2px',
            transform: 'translateY(-50%)',
            width: `${progressWidth}%`,
            background: `linear-gradient(to right, #4a3d2e 0%, ${bronze.main} 70%, ${bronze.light} 100%)`,
          }}
        />

        {/* Diamonds positioned absolutely */}
        {[1, 2, 3, 4].map((lvl) => {
          const isActive = lvl === currentLevel;
          const isCompleted = lvl < currentLevel;
          const position = diamondPositions[lvl - 1];

          return (
            <div
              key={lvl}
              className="absolute z-10"
              style={{
                left: `${position}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div
                style={{
                  width: isActive ? '28px' : '16px',
                  height: isActive ? '28px' : '16px',
                  transform: 'rotate(45deg)',
                  backgroundColor: isActive
                    ? bronze.light
                    : isCompleted
                      ? bronze.main
                      : '#4a4a4a',
                  border: isActive
                    ? `3px solid ${bronze.border}`
                    : isCompleted
                      ? `2px solid ${bronze.main}`
                      : '2px solid #5a5a5a',
                  transition: 'all 0.3s ease',
                  boxShadow: isActive
                    ? '0 0 12px rgba(180, 160, 130, 0.3)'
                    : 'none',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Numbers row */}
      <div className="relative" style={{ height: '32px', marginTop: '4px' }}>
        {[1, 2, 3, 4].map((lvl) => {
          const isActive = lvl === currentLevel;
          const isCompleted = lvl < currentLevel;
          const position = diamondPositions[lvl - 1];

          return (
            <div
              key={lvl}
              className="absolute"
              style={{
                left: `${position}%`,
                transform: 'translateX(-50%)',
              }}
            >
              <span
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: isActive
                    ? bronze.light
                    : isCompleted
                      ? bronze.main
                      : '#5a5a5a',
                  transition: 'color 0.3s ease',
                }}
              >
                {lvl}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Card component - clean, no hover effects
const Card = ({ children, className = '' }: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={`
        bg-[#0a0a0a]/95 backdrop-blur-sm border border-neutral-800/50 rounded-xl
        ${className}
      `}
    >
      {children}
    </div>
  );
};

// Credits coin using PNG image
const CreditsCoin = ({ className = '' }: { className?: string; animate?: boolean }) => (
  <img src="/ranks/Coin.png" alt="Credits" className={`${className} object-contain`} />
);

// Solana logo using official SVG
const SolanaLogo = ({ className = '' }: { className?: string }) => (
  <img src="https://solana.com/src/img/branding/solanaLogoMark.svg" alt="SOL" className={`${className} object-contain`} />
);

// Quest item - Row background acts as progress indicator
const QuestItem = ({ quest, index = 0 }: { quest: any; index?: number }) => {
  const isComplete = quest.isCompleted;
  const isClaimed = quest.isClaimed;

  // Calculate progress percentage
  const currentValue = Number(quest.currentValue) || 0;
  const targetValue = Number(quest.targetValue) || 1;
  const progressPercent = Math.min(100, Math.round((currentValue / targetValue) * 100));

  return (
    <div className={`
      relative rounded-xl mb-2 last:mb-0 transition-all duration-200 overflow-hidden
      ${isClaimed
        ? 'bg-neutral-900/40 border border-neutral-800/30'
        : isComplete
          ? 'bg-emerald-500/10 border border-emerald-500/30'
          : 'bg-neutral-900/30 border border-neutral-800/50'
      }
    `}>
      {/* Progress fill background - only for incomplete quests */}
      {!isComplete && !isClaimed && (
        <div
          className="absolute inset-0 bg-gradient-to-r from-amber-500/20 via-amber-400/15 to-transparent transition-all duration-700"
          style={{ width: `${progressPercent}%` }}
        />
      )}

      <div className="relative flex items-center justify-between py-3 px-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Circle indicator */}
          <div className={`
            w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
            transition-all duration-300
            ${isComplete
              ? 'border-emerald-500 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
              : 'border-neutral-600 bg-transparent'
            }
          `}>
            {isComplete && <FiCheck className="w-3 h-3 text-black" />}
          </div>
          <div className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5">
              <span className={`text-[14px] transition-colors truncate ${isClaimed ? 'text-neutral-600 line-through' : 'text-white'}`}>
                {quest.title}
              </span>
              {quest.description && (
                <InterstateTooltip label={quest.description}>
                  <FiInfo className={`w-3.5 h-3.5 flex-shrink-0 cursor-help ${isClaimed ? 'text-neutral-600' : 'text-neutral-500 hover:text-neutral-300'}`} />
                </InterstateTooltip>
              )}
            </span>
            {/* Progress text for incomplete quests */}
            {!isComplete && !isClaimed && (
              <span className="text-xs text-neutral-500">
                {currentValue.toLocaleString()} / {targetValue.toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <CreditsCoin className="w-4 h-4" />
          <span className={`font-bold text-sm ${isClaimed ? 'text-neutral-600' : isComplete ? 'text-emerald-400' : 'text-amber-400'}`}>
            {isClaimed ? '✓' : `+${quest.goldReward}`}
          </span>
        </div>
      </div>
    </div>
  );
};

// Rank carousel item - clean design with dividers
const RankCarouselItem = ({ item, isUnlocked, isCurrent, userGold, isLast }: { item: typeof ALL_RANKS[0]; isUnlocked: boolean; isCurrent: boolean; userGold: number; isLast?: boolean }) => {
  const config = RANK_CONFIG[item.rank as keyof typeof RANK_CONFIG];
  const isLocked = !isUnlocked;
  const isLevelOne = item.level === 1; // Only show perks on level I (when perks change)

  // Get the RANK start threshold (level 1 of this rank) for display
  const rankStartThreshold = config.levels[0];

  return (
    <div className="flex h-full">
      <div className={`
        flex-shrink-0 w-[240px] flex flex-col items-center justify-center px-6 py-5
        transition-all duration-300
        ${isLocked ? 'opacity-50' : 'opacity-100'}
      `}>
        {/* Status badge - more square with small radius */}
        <div className="mb-3 h-7">
          {isCurrent ? (
            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-semibold rounded">
              Current Rank
            </span>
          ) : isLocked ? (
            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-neutral-800/80 border border-neutral-600/50 text-neutral-500 text-xs font-medium rounded">
              <FiLock className="w-3.5 h-3.5" />
              Rank Locked
            </span>
          ) : null}
        </div>

        {/* Badge */}
        <HexBadge rank={item.rank} level={item.level} size="md" isLocked={isLocked} isCurrent={isCurrent} />

        {/* Rank Name */}
        <h4 className={`mt-3 font-black text-2xl tracking-wide ${isLocked ? 'text-neutral-500' : 'text-white'}`}>
          {item.name}
        </h4>

        {/* Rank info - Show perks on level I, show gold threshold on levels II-IV */}
        {isLevelOne ? (
          <div className="mt-3 text-center space-y-1">
            {/* Rank threshold */}
            <p className={`text-sm flex items-center justify-center gap-1.5 ${isLocked ? 'text-neutral-600' : 'text-neutral-400'}`}>
              + {rankStartThreshold.toLocaleString()} <CreditsCoin className="w-4 h-4" />
            </p>
            {/* Cashback percentage */}
            <p className={`text-sm font-medium ${isLocked ? 'text-neutral-600' : 'text-emerald-400'}`}>
              {config.cashback}% Cashback
            </p>
            {/* Credits multiplier */}
            <p className={`text-sm font-medium ${isLocked ? 'text-neutral-600' : 'text-amber-400'}`}>
              {config.multiplier}x Credits Boost
            </p>
          </div>
        ) : (
          /* Levels II, III, IV - show gold threshold */
          <div className="mt-3 text-center">
            <p className={`text-sm flex items-center justify-center gap-1.5 ${isLocked ? 'text-neutral-600' : 'text-neutral-400'}`}>
              + {item.goldRequired.toLocaleString()} <CreditsCoin className="w-4 h-4" />
            </p>
          </div>
        )}
      </div>

      {/* Vertical divider line */}
      {!isLast && (
        <div className="w-px bg-neutral-700/40 self-stretch" />
      )}
    </div>
  );
};

// FAQ Item with smooth animation
const FAQItem = ({ question, answer }: { question: string; answer: string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-neutral-800/50 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-4 text-left group cursor-pointer"
      >
        <span className="text-white group-hover:text-neutral-200 transition-colors">{question}</span>
        <div className={`
          w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center
          transition-all duration-300
          ${isOpen ? 'bg-yellow-500/20 rotate-180' : 'group-hover:bg-neutral-700'}
        `}>
          {isOpen ? (
            <FiMinus className="w-4 h-4 text-yellow-500" />
          ) : (
            <FiPlus className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
          )}
        </div>
      </button>
      <div className={`
        overflow-hidden transition-all duration-300 ease-out
        ${isOpen ? 'max-h-40 opacity-100 pb-4' : 'max-h-0 opacity-0'}
      `}>
        <p className="text-neutral-400 text-sm leading-relaxed">{answer}</p>
      </div>
    </div>
  );
};

// Countdown display component
const CountdownDisplay = ({ hours, minutes, seconds }: { hours: number; minutes: number; seconds: number }) => (
  <div className="flex items-center gap-1 text-neutral-400 text-sm font-mono">
    <FiClock className="w-3.5 h-3.5 text-yellow-500/70" />
    <span className="text-yellow-500/90">
      {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </span>
  </div>
);

const formatVolume = (value: number): string => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
};

const formatSolSubscript = (value: number): string => {
  if (value === 0 || !Number.isFinite(value)) return '0 SOL';
  if (value >= 0.01) return `${value.toFixed(4)} SOL`;
  const str = value.toFixed(20);
  const decIdx = str.indexOf('.');
  if (decIdx === -1) return `${value} SOL`;
  let zeroCount = 0;
  let sigDigits = '';
  for (let i = decIdx + 1; i < str.length; i++) {
    if (str[i] === '0') { zeroCount++; } else {
      sigDigits = str.substring(i, Math.min(i + 3, str.length));
      break;
    }
  }
  const subMap: Record<string, string> = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };
  const sub = zeroCount.toString().split('').map(c => subMap[c] || c).join('');
  return `0.0${sub}${sigDigits} SOL`;
};

export default function ArenaPage() {
  const { user } = useUser();
  const { data: stats } = useArenaStats();
  const { data: questsData, isError: questsError, isLoading: questsLoading } = useQuests();
  useCashbackSummary(); // Hook called for potential cache warming
  const claimCashbackMutation = useClaimCashback();
  const claimAllQuestsMutation = useClaimAllQuests();
  const queryClient = useQueryClient();
  const [isClaimingCashback, setIsClaimingCashback] = useState(false);
  const [isClaimingGold, setIsClaimingGold] = useState(false);
  const [showRanks, setShowRanks] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<'gold' | 'quest'>('gold');
  const [volumeInSol, setVolumeInSol] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Live countdown
  const countdown = useCountdown(0); // Reset at midnight UTC

  // Extract stats with proper defaults
  const displayRank = (stats as any)?.rank || 'DEGEN';
  const displayLevel = (stats as any)?.rankLevel || 1;
  const displayGoldEarned = (stats as any)?.goldEarned || 0;
  const displayGoldAvailable = (stats as any)?.goldAvailable || 0;
  const displayMultiplier = (stats as any)?.goldMultiplier || RANK_CONFIG[displayRank as keyof typeof RANK_CONFIG]?.multiplier || 1;
  const cashbackPercent = (stats as any)?.cashbackPercent || RANK_CONFIG[displayRank as keyof typeof RANK_CONFIG]?.cashback || 10;
  const userName = (user as any)?.name || 'Trader';
  const progressToNext = (stats as any)?.progressToNextLevel || 0;

  // Calculate next RANK threshold (not level) for progress bar display
  const rankOrder = ['DEGEN', 'WARRIOR', 'GLADIATOR', 'COMMANDER', 'TITAN'];
  const displayRankIndex = rankOrder.indexOf(displayRank);
  const currentRankConfig = RANK_CONFIG[displayRank as keyof typeof RANK_CONFIG];

  // Get next rank info
  const nextRankName = displayRankIndex < rankOrder.length - 1
    ? rankOrder[displayRankIndex + 1]
    : null;
  const nextRankThreshold = nextRankName
    ? RANK_CONFIG[nextRankName as keyof typeof RANK_CONFIG]?.levels[0]
    : null;

  // Use API threshold if available, otherwise calculate from rank config
  const nextLevelGold = (stats as any)?.nextLevelThreshold || nextRankThreshold || currentRankConfig?.levels[3] || 1000;
  const isMaxRank = displayRank === 'TITAN';

  const solCashbackAvailable = (stats as any)?.solCashbackAvailable || 0;
  const solCashbackEarned = (stats as any)?.solCashbackEarned || 0;
  const currentStreak = (stats as any)?.currentStreak || 0;
  const longestStreak = (stats as any)?.longestStreak || 0;
  const totalTradingVolume = (stats as any)?.totalTradingVolume || 0;
  const totalSolVolume = (stats as any)?.totalSolVolume || 0;
  const totalTradeCount = (stats as any)?.totalTradeCount || 0;

  // Animation mount effect
  useEffect(() => {
    setMounted(true);
  }, []);

  // Claim all unclaimed quests via the mutation hook (optimistic UI + rollback
  // + invalidation fan-out all live in useClaimAllQuests). Page-level toasts
  // here are skipped — the hook's onSuccess shows them.
  const handleClaimAllGold = async () => {
    if (!user?.bearerToken) {
      showArenaErrorToast('Please log in to claim rewards');
      return;
    }

    const unclaimedQuests = allQuests.filter((q: any) => q.isCompleted && !q.isClaimed);
    if (unclaimedQuests.length === 0) {
      showArenaErrorToast('No credits to claim');
      return;
    }

    setIsClaimingGold(true);
    try {
      await claimAllQuestsMutation.mutateAsync();
    } catch {
      // Errors already toasted in the mutation's onError; nothing to do.
    } finally {
      setIsClaimingGold(false);
    }
  };

  const handleClaimCashback = async () => {
    setIsClaimingCashback(true);
    try {
      await claimCashbackMutation.mutateAsync();
    } finally {
      setIsClaimingCashback(false);
    }
  };

  // Use real API data only — no mocks so empty state messages show when quests haven't been earned yet
  const allDailyQuests = (questsData as any)?.grouped?.daily || [];
  // Snag-verified daily quests (post / code) render via SnagDailyQuests with their
  // own verify/redeem UI; the rest are trade-driven and render via the plain QuestItem.
  const snagDailyQuestIdSet = new Set<string>(SNAG_DAILY_QUEST_IDS as readonly string[]);
  const dailyQuests = allDailyQuests.filter((q: any) => !snagDailyQuestIdSet.has(q.questId));
  // "Post about Interstate" renders under the Social Quests cluster (it's an X
  // action and needs Connect X); the code quest stays in the Daily Quests list.
  const postDailyQuests = allDailyQuests.filter((q: any) => q.questId === 'DAILY_POST_X');
  const codeDailyQuests = allDailyQuests.filter((q: any) => q.questId === 'DAILY_CODE_ENTRY');
  const seasonalQuests = (questsData as any)?.grouped?.seasonal || [];
  const socialQuests = (questsData as any)?.grouped?.special || [];

  // Calculate pending gold from completed but unclaimed quests
  const allQuests = (questsData as any)?.quests || [];
  const pendingGoldFromQuests = allQuests
    .filter((q: any) => q.isCompleted && !q.isClaimed)
    .reduce((sum: number, q: any) => sum + (Number(q.goldReward) || 0), 0);

  // Determine which ranks are unlocked
  const getCurrentRankIndex = useCallback(() => {
    const rankOrder = ['DEGEN', 'WARRIOR', 'GLADIATOR', 'COMMANDER', 'TITAN'];
    const rankIdx = rankOrder.indexOf(displayRank);
    // Each rank has 4 levels (I, II, III, IV), and displayLevel is 1-4
    return rankIdx * 4 + (displayLevel - 1);
  }, [displayRank, displayLevel]);

  const currentRankIndex = getCurrentRankIndex();

  // Auto-scroll carousel to current rank on mount
  useEffect(() => {
    if (carouselRef.current && showRanks) {
      // Each carousel item is 240px wide + 1px divider = 241px
      const itemWidth = 241;
      const scrollPosition = currentRankIndex * itemWidth - (carouselRef.current.clientWidth / 2) + (itemWidth / 2);
      setTimeout(() => {
        carouselRef.current?.scrollTo({
          left: Math.max(0, scrollPosition),
          behavior: 'smooth',
        });
      }, 300);
    }
  }, [showRanks, currentRankIndex]);

  // Carousel scroll
  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const scrollAmount = 241; // Item width
      carouselRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <>
      <Head>
        <title>Airdrop Genesis | Interstate</title>
        <meta name="description" content="Level up your trading with Interstate Airdrop Genesis - earn Credits, climb ranks, and compete for rewards." />
      </Head>

      <div className="min-h-screen bg-black">
        {/* Header stays outside the rounded container */}
        <Header />

        {/* Outer padding wrapper - collapses when a popup is docked */}
        <DockedPanelMarginWrapper>
        <div className="p-1 sm:p-1.5">
          {/* Rounded container with background */}
          <div className="relative rounded-2xl overflow-hidden min-h-[calc(100vh-80px)] border border-white/[0.06]">
            {/* Background inside the rounded container */}
            <SpaceBackgroundContained />

            {/* Content */}
            <main className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-24">
            {/* Arena/Referrals Toggle */}
            <ArenaPageToggle activePage="arena" />

            {/* Epic Title Section */}
            <div className={`text-center mb-8 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
              {/* Decorative top element */}
              <div className="flex items-center justify-center gap-4 mb-4">
                <div className="h-px w-16 bg-gradient-to-r from-transparent via-yellow-500/50 to-yellow-500/20" />
                <GiTrophy className="w-6 h-6 text-yellow-500/70" />
                <div className="h-px w-16 bg-gradient-to-l from-transparent via-yellow-500/50 to-yellow-500/20" />
              </div>

              {/* Main title with info tooltip */}
              <div className="flex items-center justify-center gap-3">
                <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white text-center">
                  AIRDROP GENESIS
                </h1>
                <ArenaInfoTooltip />
              </div>

              {/* Subtitle */}
              <div className="flex items-center justify-center gap-3 mt-4">
                <p className="text-neutral-200 text-sm tracking-[0.3em] uppercase font-semibold">
                  Trade • Compete • Conquer
                </p>
              </div>

              {/* Decorative bottom element */}
              <div className="flex items-center justify-center gap-2 mt-4">
                <div className="w-2 h-2 rounded-full bg-yellow-500/30" />
                <div className="h-px w-24 bg-gradient-to-r from-yellow-500/30 via-yellow-500/10 to-transparent" />
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/20" />
                <div className="h-px w-24 bg-gradient-to-l from-yellow-500/30 via-yellow-500/10 to-transparent" />
                <div className="w-2 h-2 rounded-full bg-yellow-500/30" />
              </div>
            </div>

            {/* v2.0: Rollover countdown banner — only renders in last 14 days */}
            <SeasonCountdownBanner />

            {/* v2.0: Season roadmap — primary way users learn there are 4 seasons */}
            <SeasonRoadmap />

            {/* User Stats Bar - Clean matte design */}
            <div className={`flex flex-col sm:flex-row items-stretch gap-3 mb-6 transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              {/* Left: Username & Progress */}
              <div className="flex-1 flex flex-col gap-2 px-5 py-4 bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] rounded-xl">
                {/* Top row: Badge + Username + Next rank info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Current rank badge */}
                    <img
                      src={getRankImage(displayRank, displayLevel)}
                      alt={displayRank}
                      className="w-6 h-6 object-contain"
                    />
                    <span className="text-white font-semibold text-sm">{userName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isMaxRank ? (
                      <span className="text-amber-400 text-sm font-semibold">Max Rank</span>
                    ) : (
                      <>
                        <span className="text-neutral-300 text-xs font-medium">Next Rank:</span>
                        <span className="text-amber-400 text-sm font-semibold">{nextRankName}</span>
                      </>
                    )}
                  </div>
                </div>
                {/* Progress info row */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1">
                    <CreditsCoin className="w-3.5 h-3.5" />
                    <span className="text-white font-medium">{displayGoldEarned.toLocaleString()}</span>
                  </div>
                  {!isMaxRank && (
                    <span className="text-neutral-300 font-medium">{nextLevelGold.toLocaleString()}</span>
                  )}
                </div>
                {/* Progress bar - full width with amber/gold gradient */}
                <div className="h-3 bg-neutral-800/80 rounded-full overflow-hidden border border-neutral-700/50">
                  <div
                    className="h-full bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-400 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(progressToNext, 100)}%` }}
                  />
                </div>
              </div>

              {/* Right: Gold & SOL Earned */}
              <div className="flex flex-col justify-center gap-2.5 px-6 py-3.5 bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] rounded-xl min-w-[220px]">
                {/* Credits earned row */}
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400 text-sm">Credits earned</span>
                  <div className="flex items-center gap-1.5">
                    <CreditsCoin className="w-4 h-4" />
                    <span className="text-white font-semibold text-sm">{displayGoldEarned.toLocaleString()}</span>
                    {/* Info tooltip */}
                    <div className="relative group">
                      <FiInfo className="w-3.5 h-3.5 text-neutral-500 hover:text-neutral-300 cursor-pointer transition-colors" />
                      <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 whitespace-nowrap">
                        <p className="text-white text-xs font-medium mb-1">Available Credits: <span className="text-amber-400">{displayGoldEarned.toLocaleString()}</span></p>
                        <p className="text-neutral-400 text-xs">You can use your Credits to enter the Jackpot.</p>
                        <div className="absolute bottom-0 right-3 translate-y-1/2 rotate-45 w-2 h-2 bg-neutral-900 border-r border-b border-neutral-700" />
                      </div>
                    </div>
                  </div>
                </div>
                {/* SOL earned row */}
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400 text-sm">SOL earned</span>
                  <div className="flex items-center gap-1.5">
                    <SolanaLogo className="w-3.5 h-3.5" />
                    <span className="text-white font-semibold text-sm">{solCashbackEarned.toFixed(4)} SOL</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Personal Trading Volume */}
            <div className={`flex flex-col sm:flex-row items-stretch gap-3 mb-6 transition-all duration-700 delay-150 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              {/* Trading Volume — click to toggle USD/SOL */}
              <div
                className="flex-1 flex items-center gap-3 px-5 py-4 bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] rounded-xl cursor-pointer select-none transition-colors hover:bg-white/[0.09]"
                onClick={() => setVolumeInSol(v => !v)}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${volumeInSol ? 'bg-purple-500/10' : 'bg-emerald-500/10'}`}>
                  {volumeInSol ? (
                    <SolanaLogo className="w-5 h-5" />
                  ) : (
                    <span className="text-emerald-400 text-lg font-bold">$</span>
                  )}
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-neutral-400 text-xs">{volumeInSol ? 'Volume (SOL)' : 'Volume (USD)'}</span>
                  <span className="text-white font-semibold text-lg leading-tight">
                    {volumeInSol ? formatSolSubscript(totalSolVolume) : formatVolume(totalTradingVolume)}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-neutral-500 flex-shrink-0">
                  <HiSwitchVertical className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-medium">{volumeInSol ? 'USD' : 'SOL'}</span>
                </div>
              </div>
              {/* Total Trades */}
              <div className="flex-1 flex items-center gap-3 px-5 py-4 bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] rounded-xl">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <FiZap className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex flex-col">
                  <span className="text-neutral-400 text-xs">Total Trades</span>
                  <span className="text-white font-semibold text-lg leading-tight">{totalTradeCount.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Cashback Banner - Commented out for now
            <div className={`relative mb-6 px-5 py-4 rounded-xl overflow-hidden transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{ background: 'linear-gradient(90deg, #2a2310 0%, #1a1a0f 50%, #1f1a10 100%)' }}
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-yellow-500 via-amber-500 to-yellow-600" />
              <div
                className="absolute right-0 top-1/2 -translate-y-1/2 w-32 h-32 sm:w-40 sm:h-40 bg-contain bg-center bg-no-repeat opacity-60"
                style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1621778307596-ec0e0abc0e6e?w=200)' }}
              />
              <div className="absolute right-0 top-0 bottom-0 w-48 bg-gradient-to-r from-transparent via-[#1a1a0f]/80 to-[#1a1a0f]" />
              <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl sm:text-2xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 mb-1">
                    CLAIM 45% CASHBACK
                  </h3>
                  <p className="text-neutral-400 text-sm">
                    Earn More SOL By Posting About <span className="text-amber-400 hover:text-amber-300 cursor-pointer transition-colors">@TrojanOnSolana</span>
                  </p>
                </div>
                <button className="px-5 py-2.5 text-white font-semibold text-sm rounded-lg border transition-all duration-200 whitespace-nowrap cursor-pointer"
                  style={{
                    background: 'linear-gradient(180deg, rgba(120, 100, 50, 0.5) 0%, rgba(80, 65, 30, 0.6) 100%)',
                    borderColor: 'rgba(180, 160, 100, 0.4)'
                  }}
                >
                  Claim Cashback Boost
                </button>
              </div>
            </div>
            */}

            {/* Main Content - Unified Box */}
            <Card className={`mb-6 overflow-hidden transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <div className="flex flex-col lg:flex-row">
                {/* Left: Current Rank */}
                <div className="lg:w-[380px] p-6 flex flex-col items-center lg:border-r border-neutral-800/60 relative overflow-hidden">
                  {/* Circuit background - upper half only (behind badge) */}
                  <div
                    className="absolute top-0 left-0 right-0 h-[55%] opacity-[0.04]"
                    style={{
                      backgroundImage: 'url(https://static.vecteezy.com/system/resources/previews/017/213/455/non_2x/green-line-circuit-computer-technology-futuristic-background-design-creative-vector.jpg)',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                  {/* Fade out gradient for smooth transition */}
                  <div className="absolute top-0 left-0 right-0 h-[55%] bg-gradient-to-b from-transparent via-transparent to-[#0a0a0a]" />

                  {/* Rank Badge */}
                  <div className="relative mt-4 z-10">
                    <MainBadge rank={displayRank} level={displayLevel} />
                  </div>

                  {/* Rank Name - Large and bold */}
                  <h3 className="relative z-10 mt-5 text-3xl font-black tracking-widest text-white uppercase">
                    {displayRank} {['', 'I', 'II', 'III', 'IV'][displayLevel]}
                  </h3>

                  {/* Level Diamonds */}
                  <div className="relative z-10 w-full">
                    <LevelIndicator currentLevel={displayLevel} />
                  </div>

                  {/* Perks */}
                  <div className="relative z-10 w-full mt-4 space-y-2">
                    {/* Cashback Perk */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-neutral-900/70 border border-neutral-800/60 rounded-lg backdrop-blur-sm">
                      <FiCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span className="text-white font-medium">{cashbackPercent}% Cashback</span>
                    </div>

                    {/* Credits Boost Perk - with gold shine accent */}
                    <div className="relative flex items-center justify-between gap-3 px-4 py-3 rounded-lg backdrop-blur-sm"
                      style={{
                        background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.2) 0%, rgba(30, 30, 25, 0.7) 100%)',
                        border: '1px solid rgba(212, 175, 55, 0.3)'
                      }}
                    >
                      {/* Gold accent bar on left */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-600" />
                      <div className="flex items-center gap-3 pl-2">
                        <FiCheck className="w-4 h-4 flex-shrink-0" style={{ color: '#D4AF37' }} />
                        <span className="text-white font-medium">{displayMultiplier}x Credits Boost</span>
                      </div>
                      {/* Info tooltip */}
                      <div className="relative group">
                        <FiInfo className="w-4 h-4 text-neutral-500 hover:text-neutral-300 cursor-pointer transition-colors" />
                        <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] whitespace-nowrap">
                          <p className="text-white text-xs font-medium mb-1">Credits Multiplier: <span className="text-amber-400">{displayMultiplier}x</span></p>
                          <p className="text-neutral-400 text-xs">All Credits earned are multiplied by this amount.</p>
                          <div className="absolute bottom-0 right-3 translate-y-1/2 rotate-45 w-2 h-2 bg-neutral-900 border-r border-b border-neutral-700" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Toggle Ranks Button */}
                  <button
                    onClick={() => setShowRanks(!showRanks)}
                    className="relative z-10 mt-4 w-full py-3 bg-neutral-800/70 hover:bg-neutral-700/70 text-white font-medium rounded-lg transition-all border border-neutral-700/50 cursor-pointer backdrop-blur-sm"
                  >
                    {showRanks ? 'Hide Ranks' : 'View All Ranks'}
                  </button>
                </div>

                {/* Right: Quests */}
                <div className="flex-1 p-6">
                  {/* Social Quests — Standalone card above trade quests */}
                  {socialQuests.length > 0 && (
                    <SocialQuestsSection
                      quests={socialQuests}
                      goldMultiplier={displayMultiplier}
                    />
                  )}

                  {/* "Post about Interstate" — daily Snag quest shown with social quests.
                      -mt-4 absorbs SocialQuestsSection's trailing mb-6 (margins collapse:
                      24px - 16px = 8px) so this row sits flush with the social list rhythm. */}
                  {!questsLoading && !questsError && postDailyQuests.length > 0 && (
                    <SnagDailyQuests
                      quests={postDailyQuests}
                      className={`mb-6 ${socialQuests.length > 0 ? '-mt-4' : ''}`}
                    />
                  )}

                  {/* v2.0: Admin-curated Key Tweets (repeatable credits) —
                      HIDDEN until Snag-backed verification is wired.
                      Decision: only social tasks should be Snag-maintained;
                      key tweets currently have no server-side verification
                      (honor system), so we're keeping the UI dark to avoid
                      shipping a claimable-without-engagement surface.
                      The backend tables (arena_key_tweets, arena_key_tweet_claims)
                      and the claimKeyTweetReward service remain in place; only
                      the UI is gated. Re-enable once verification is added. */}
                  {false && (
                    <div className="mt-4">
                      <KeyTweetsSection />
                    </div>
                  )}

                  {/* Daily Quests */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-white font-bold">Daily Quests</h3>
                      <CountdownDisplay hours={countdown.hours} minutes={countdown.minutes} seconds={countdown.seconds} />
                    </div>
                    <div className="space-y-2">
                      {/* Snag-verified daily code quest ("Enter Today's Code") */}
                      {!questsLoading && !questsError && codeDailyQuests.length > 0 && (
                        <SnagDailyQuests quests={codeDailyQuests} />
                      )}
                      {questsError ? (
                        <div className="text-center py-6 text-red-400 text-sm">
                          <p>Failed to load quests.</p>
                          <p className="text-xs mt-1 text-red-500/70">Please try refreshing the page.</p>
                        </div>
                      ) : questsLoading ? (
                        <div className="text-center py-6 text-neutral-500 text-sm">
                          <p>Loading quests...</p>
                        </div>
                      ) : dailyQuests.length > 0 ? (
                        dailyQuests.map((quest: any, idx: number) => (
                          <QuestItem key={quest.id} quest={quest} index={idx} />
                        ))
                      ) : codeDailyQuests.length === 0 ? (
                        <div className="text-center py-6 text-neutral-500 text-sm">
                          <p>No daily quests available yet.</p>
                          <p className="text-xs mt-1">Start trading to unlock quests!</p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Spacer between quest sections */}
                  <div className="mb-6" />

                  {/* Seasonal Quests */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-white font-bold">Seasonal Quests</h3>
                    </div>
                    <div className="space-y-2">
                      {questsError ? (
                        <div className="text-center py-6 text-red-400 text-sm">
                          <p>Failed to load quests.</p>
                          <p className="text-xs mt-1 text-red-500/70">Please try refreshing the page.</p>
                        </div>
                      ) : questsLoading ? (
                        <div className="text-center py-6 text-neutral-500 text-sm">
                          <p>Loading quests...</p>
                        </div>
                      ) : seasonalQuests.length > 0 ? (
                        seasonalQuests.map((quest: any, idx: number) => (
                          <QuestItem key={quest.id} quest={quest} index={idx} />
                        ))
                      ) : (
                        <div className="text-center py-6 text-neutral-500 text-sm">
                          <p>No seasonal quests available yet.</p>
                          <p className="text-xs mt-1">Start trading to unlock quests!</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Rank Carousel */}
            {showRanks && (
              <Card className={`mb-6 relative overflow-hidden transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                {/* Gradient edges for scroll indication */}
                <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#0a0a0a] to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#0a0a0a] to-transparent z-10 pointer-events-none" />

                {/* Navigation buttons */}
                <button
                  onClick={() => scrollCarousel('left')}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 bg-neutral-800/90 hover:bg-neutral-700 border border-neutral-600/50 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer"
                >
                  <FiChevronLeft className="w-5 h-5 text-white" />
                </button>
                <button
                  onClick={() => scrollCarousel('right')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 bg-neutral-800/90 hover:bg-neutral-700 border border-neutral-600/50 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer"
                >
                  <FiChevronRight className="w-5 h-5 text-white" />
                </button>

                {/* Carousel */}
                <div
                  ref={carouselRef}
                  className="flex overflow-x-auto px-10 scrollbar-hide scroll-smooth snap-x snap-mandatory"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {ALL_RANKS.map((item, idx) => {
                    const isUnlocked = idx <= currentRankIndex;
                    const isCurrent = idx === currentRankIndex;
                    const isLast = idx === ALL_RANKS.length - 1;

                    return (
                      <div key={`${item.rank}-${item.level}`} className="snap-center">
                        <RankCarouselItem
                          item={item}
                          isUnlocked={isUnlocked}
                          isCurrent={isCurrent}
                          userGold={displayGoldEarned}
                          isLast={isLast}
                        />
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* SOL & Gold Rewards */}
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 transition-all duration-700 delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              {/* SOL Rewards */}
              <Card className="p-6">
                <div>
                  {/* Title */}
                  <h3 className="text-2xl font-black tracking-wide bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent mb-1">
                    SOL REWARDS
                  </h3>
                  <p className="text-neutral-500 text-sm mb-5">Earned Through Referrals and Trading Rewards</p>

                  {/* Balance box - green tint */}
                  <div
                    className="flex items-center justify-between p-4 rounded-lg"
                    style={{
                      background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, rgba(20, 30, 28, 0.8) 100%)',
                      border: '1px solid rgba(16, 185, 129, 0.15)'
                    }}
                  >
                    <div>
                      <p className="text-neutral-400 text-sm mb-1">Available SOL</p>
                      <div className="flex items-center gap-2">
                        <SolanaLogo className="w-5 h-5" />
                        <span className="text-white text-xl font-bold">{solCashbackAvailable.toFixed(4)}</span>
                      </div>
                    </div>
                    <button
                      onClick={handleClaimCashback}
                      disabled={solCashbackAvailable < 0.005 || isClaimingCashback}
                      className={`px-5 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        solCashbackAvailable >= 0.005 && !isClaimingCashback
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 cursor-pointer'
                          : 'bg-emerald-900/40 text-emerald-400/70 border-emerald-700/30 cursor-not-allowed'
                      }`}
                    >
                      {isClaimingCashback ? 'Claiming...' : 'Claim'}
                    </button>
                  </div>
                </div>
              </Card>

              {/* Gold Rewards */}
              <Card className="p-6">
                <div>
                  {/* Title with badge */}
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-2xl font-black tracking-wide bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
                      CREDITS REWARDS
                    </h3>
                    <span className="px-4 py-1.5 bg-amber-500/15 border border-amber-500/40 text-amber-400 text-sm font-bold rounded-lg">
                      {displayMultiplier}x Credits Boost
                    </span>
                  </div>
                  <p className="text-neutral-500 text-sm mb-5">Earned through Quests, Rank Ups and more</p>

                  {/* Balance box - gold tint */}
                  <div
                    className="flex items-center justify-between p-4 rounded-lg"
                    style={{
                      background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.08) 0%, rgba(30, 28, 20, 0.8) 100%)',
                      border: '1px solid rgba(212, 175, 55, 0.15)'
                    }}
                  >
                    <div>
                      <p className="text-neutral-400 text-sm mb-1">Claimable Credits</p>
                      <div className="flex items-center gap-2">
                        <CreditsCoin className="w-5 h-5" />
                        <span className="text-white text-xl font-bold">{pendingGoldFromQuests.toLocaleString()}</span>
                      </div>
                    </div>
                    <button
                      onClick={handleClaimAllGold}
                      disabled={pendingGoldFromQuests === 0 || isClaimingGold}
                      className={`px-5 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                        pendingGoldFromQuests > 0 && !isClaimingGold
                          ? 'bg-amber-600 hover:bg-amber-500 text-black border-amber-500'
                          : 'bg-amber-900/30 text-amber-400/70 border-amber-700/30 cursor-not-allowed'
                      }`}
                    >
                      {isClaimingGold ? 'Claiming...' : 'Claim'}
                    </button>
                  </div>
                </div>
              </Card>
            </div>

            {/* Overview Section */}
            <div className={`mb-10 transition-all duration-700 delay-[600ms] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              {/* Header with dropdown */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-bold text-lg tracking-wide">OVERVIEW</h2>
                <div className="relative">
                  <select className="appearance-none bg-neutral-900/80 text-white text-sm pl-4 pr-10 py-2 rounded-lg border border-neutral-700/50 focus:outline-none cursor-pointer">
                    <option>Last 7 Days</option>
                    <option>Last 30 Days</option>
                    <option>All Time</option>
                  </select>
                  <FiChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 rotate-90 pointer-events-none" />
                </div>
              </div>

              {/* SOL Rewards Breakdown - Full width on large screens */}
              <Card className="p-5 mb-6">
                  <h3 className="text-white font-bold mb-4 tracking-wide">SOL REWARDS BREAKDOWN</h3>

                  {solCashbackEarned > 0 ? (
                    /* Unlocked state - show actual rewards breakdown */
                    <div className="space-y-4">
                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-neutral-900/60 rounded-lg p-4 border border-neutral-800/50">
                          <p className="text-neutral-500 text-xs mb-1">Total Earned</p>
                          <div className="flex items-center gap-1.5">
                            <SolanaLogo className="w-4 h-4" />
                            <span className="text-white font-bold">{solCashbackEarned.toFixed(4)}</span>
                          </div>
                        </div>
                        <div className="bg-neutral-900/60 rounded-lg p-4 border border-neutral-800/50">
                          <p className="text-neutral-500 text-xs mb-1">Cashback Rate</p>
                          <span className="text-emerald-400 font-bold">{cashbackPercent}%</span>
                        </div>
                        <div className="bg-neutral-900/60 rounded-lg p-4 border border-neutral-800/50">
                          <p className="text-neutral-500 text-xs mb-1">Trading Streak</p>
                          <div className="flex items-center gap-1.5">
                            <HiFire className="w-4 h-4 text-orange-400" />
                            <span className="text-white font-bold">{currentStreak} days</span>
                          </div>
                        </div>
                      </div>

                      {/* Breakdown by source - horizontal bars */}
                      <div className="space-y-3 pt-2">
                        {/* Trading Cashback */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-neutral-400">Trading Cashback</span>
                            <span className="text-white font-medium">{(solCashbackEarned * 0.7).toFixed(4)} SOL</span>
                          </div>
                          <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full" style={{ width: '70%' }} />
                          </div>
                        </div>

                        {/* Referral Rewards */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-neutral-400">Referral Rewards</span>
                            <span className="text-white font-medium">{(solCashbackEarned * 0.25).toFixed(4)} SOL</span>
                          </div>
                          <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full" style={{ width: '25%' }} />
                          </div>
                        </div>

                        {/* Bonuses */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-neutral-400">Streak Bonuses</span>
                            <span className="text-white font-medium">{(solCashbackEarned * 0.05).toFixed(4)} SOL</span>
                          </div>
                          <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-orange-600 to-orange-400 rounded-full" style={{ width: '5%' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Locked state - blurred preview of breakdown structure */
                    <div className="relative rounded-xl overflow-hidden">
                      {/* Blurred preview of what the breakdown will look like */}
                      <div className="blur-[6px] opacity-40 pointer-events-none select-none">
                        {/* Stats row preview */}
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div className="bg-neutral-800/60 rounded-lg p-4">
                            <div className="h-3 w-16 bg-neutral-700 rounded mb-2" />
                            <div className="h-5 w-20 bg-neutral-600 rounded" />
                          </div>
                          <div className="bg-neutral-800/60 rounded-lg p-4">
                            <div className="h-3 w-16 bg-neutral-700 rounded mb-2" />
                            <div className="h-5 w-12 bg-emerald-700 rounded" />
                          </div>
                          <div className="bg-neutral-800/60 rounded-lg p-4">
                            <div className="h-3 w-16 bg-neutral-700 rounded mb-2" />
                            <div className="h-5 w-14 bg-neutral-600 rounded" />
                          </div>
                        </div>
                        {/* Progress bars preview */}
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <div className="flex justify-between">
                              <div className="h-3 w-24 bg-neutral-700 rounded" />
                              <div className="h-3 w-16 bg-neutral-700 rounded" />
                            </div>
                            <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                              <div className="h-full w-3/4 bg-emerald-600/50 rounded-full" />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between">
                              <div className="h-3 w-20 bg-neutral-700 rounded" />
                              <div className="h-3 w-14 bg-neutral-700 rounded" />
                            </div>
                            <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                              <div className="h-full w-1/3 bg-purple-600/50 rounded-full" />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between">
                              <div className="h-3 w-16 bg-neutral-700 rounded" />
                              <div className="h-3 w-12 bg-neutral-700 rounded" />
                            </div>
                            <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                              <div className="h-full w-1/6 bg-orange-600/50 rounded-full" />
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Lock overlay */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex items-center gap-3 px-5 py-3 bg-neutral-900/90 border border-neutral-700/50 rounded-xl shadow-xl">
                          <FiLock className="w-4 h-4 text-neutral-400" />
                          <span className="text-neutral-300 text-sm font-medium">Start trading to unlock breakdown</span>
                        </div>
                      </div>
                    </div>
                  )}
              </Card>

              {/* Leaderboard - Temporarily commented out
              <Card className="p-5">
                <div className="flex items-center gap-6 mb-5">
                  <button
                    onClick={() => setLeaderboardTab('gold')}
                    className={`text-base font-bold transition-colors cursor-pointer ${leaderboardTab === 'gold' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                  >
                    Credits Leaderboard
                  </button>
                  <button
                    onClick={() => setLeaderboardTab('quest')}
                    className={`text-base transition-colors cursor-pointer ${leaderboardTab === 'quest' ? 'text-white font-bold' : 'text-neutral-500 hover:text-neutral-300'}`}
                  >
                    Quest Leaderboard
                  </button>
                  <Link href="/leaderboard" className="ml-auto">
                    <FiExternalLink className="w-4 h-4 text-neutral-500 hover:text-white transition-colors" />
                  </Link>
                </div>
                <div className="space-y-0">
                  <div className="flex items-center justify-between py-3 px-2">
                    <div className="flex items-center gap-4">
                      <span className="text-neutral-500 text-sm font-medium w-14">#1997</span>
                      <span className="text-white text-sm">{leaderboardTab === 'gold' ? 'deneme' : 'Tego'}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <HexBadge rank="DEGEN" level={1} size="xs" />
                      <div className="flex items-center gap-1.5 w-20 justify-end">
                        {leaderboardTab === 'gold' ? (
                          <>
                            <CreditsCoin className="w-4 h-4" />
                            <span className="text-white text-sm font-medium">10,378</span>
                          </>
                        ) : (
                          <>
                            <IoRocketSharp className="w-4 h-4 text-orange-400" />
                            <span className="text-white text-sm font-medium">13</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
              */}
            </div>

            {/* FAQs - keeping existing */}
            <div className={`mb-10 transition-all duration-700 delay-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <h2 className="text-white font-bold text-lg mb-2 tracking-wide">FAQs</h2>
              <p className="text-neutral-500 text-sm mb-4">
                More Questions? <span className="text-neutral-300 hover:text-white underline cursor-pointer transition-colors">Chat with Support</span> or <span className="text-neutral-300 hover:text-white underline cursor-pointer transition-colors">View Airdrop Genesis Intro</span>
              </p>
              <Card className="overflow-hidden">
                <div className="px-5">
                  <FAQItem question="How does Airdrop Genesis work?" answer="Airdrop Genesis is our gamified rewards system. Trade to earn Credits, climb ranks, and unlock better rewards like higher cashback percentages and Credits multipliers." />
                  <FAQItem question="How can I earn Credits?" answer="You earn Credits by trading, completing quests, maintaining trading streaks, and ranking up. All Credits earned is multiplied by your current rank's Credits Boost." />
                  <FAQItem question="Do I have to claim my Credits?" answer="Credits from trading is automatically added to your balance. Quest rewards need to be manually claimed by clicking the Claim button." />
                  <FAQItem question="What can I do with my Credits?" answer="Credits determines your position on the leaderboard. Top performers earn additional prizes. Future features will include more ways to use your Credits." />
                </div>
              </Card>
            </div>

            </main>

            {/* Footer inside the rounded container */}
            <div className="relative z-10">
              <Footer />
            </div>
          </div>
        </div>
        </DockedPanelMarginWrapper>
      </div>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }

        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        @keyframes pulse-slower {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.2; }
        }

        @keyframes shine {
          from { transform: translateX(-100%); }
          to { transform: translateX(200%); }
        }

        @keyframes shimmer {
          0% { transform: translateX(-100%) rotate(-45deg); }
          100% { transform: translateX(100%) rotate(-45deg); }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0) translateX(0);
            opacity: 0.3;
          }
          25% {
            transform: translateY(-20px) translateX(10px);
            opacity: 0.6;
          }
          50% {
            transform: translateY(-40px) translateX(-5px);
            opacity: 0.4;
          }
          75% {
            transform: translateY(-20px) translateX(-10px);
            opacity: 0.5;
          }
        }

        @keyframes slow-zoom {
          0%, 100% { transform: scale(1.1); }
          50% { transform: scale(1.15); }
        }

        @keyframes glow-pulse {
          0%, 100% {
            box-shadow: 0 0 20px rgba(251, 191, 36, 0.3);
          }
          50% {
            box-shadow: 0 0 40px rgba(251, 191, 36, 0.5), 0 0 60px rgba(251, 191, 36, 0.2);
          }
        }

        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }

        .animate-pulse-slower {
          animation: pulse-slower 6s ease-in-out infinite;
        }

        .animate-shine {
          animation: shine 2s ease-in-out infinite;
        }

        .animate-shimmer {
          animation: shimmer 2s ease-in-out infinite;
        }

        .animate-float {
          animation: float 8s ease-in-out infinite;
        }

        .animate-slow-zoom {
          animation: slow-zoom 30s ease-in-out infinite;
        }

        .animate-glow-pulse {
          animation: glow-pulse 2s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
