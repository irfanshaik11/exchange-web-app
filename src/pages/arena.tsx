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
import { useUser } from '~/components/UserContext';
import { useArenaStats, useQuests, useCashbackSummary, useClaimCashback } from '~/hooks/useArena';
import { claimQuest } from '~/utils/arenaApi';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

// React Icons
import { GiTrophy, GiSwordman, GiSpartanHelmet, GiCrown, GiAngelWings, GiCoins, GiFireGem, GiLaurelsTrophy } from 'react-icons/gi';
import { FiCheck, FiLock, FiChevronLeft, FiChevronRight, FiClock, FiExternalLink, FiPlus, FiMinus, FiAward, FiZap, FiInfo } from 'react-icons/fi';
import { HiLightningBolt, HiSparkles, HiFire } from 'react-icons/hi';
import { IoRocketSharp, IoFlameSharp } from 'react-icons/io5';
import { BiDiamond, BiTargetLock } from 'react-icons/bi';
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

// Generate all rank levels for the carousel
const ALL_RANKS = [
  { rank: 'DEGEN', level: 0, name: 'DEGEN', goldRequired: 0, isBase: true },
  { rank: 'DEGEN', level: 1, name: 'DEGEN I', goldRequired: 0 },
  { rank: 'DEGEN', level: 2, name: 'DEGEN II', goldRequired: 250 },
  { rank: 'DEGEN', level: 3, name: 'DEGEN III', goldRequired: 500 },
  { rank: 'DEGEN', level: 4, name: 'DEGEN IV', goldRequired: 1000 },
  { rank: 'WARRIOR', level: 0, name: 'WARRIOR', goldRequired: 1000, isBase: true },
  { rank: 'WARRIOR', level: 1, name: 'WARRIOR I', goldRequired: 1000 },
  { rank: 'WARRIOR', level: 2, name: 'WARRIOR II', goldRequired: 2500 },
  { rank: 'WARRIOR', level: 3, name: 'WARRIOR III', goldRequired: 5000 },
  { rank: 'WARRIOR', level: 4, name: 'WARRIOR IV', goldRequired: 10000 },
  { rank: 'GLADIATOR', level: 0, name: 'GLADIATOR', goldRequired: 10000, isBase: true },
  { rank: 'GLADIATOR', level: 1, name: 'GLADIATOR I', goldRequired: 10000 },
  { rank: 'GLADIATOR', level: 2, name: 'GLADIATOR II', goldRequired: 25000 },
  { rank: 'GLADIATOR', level: 3, name: 'GLADIATOR III', goldRequired: 50000 },
  { rank: 'GLADIATOR', level: 4, name: 'GLADIATOR IV', goldRequired: 100000 },
  { rank: 'COMMANDER', level: 0, name: 'COMMANDER', goldRequired: 100000, isBase: true },
  { rank: 'COMMANDER', level: 1, name: 'COMMANDER I', goldRequired: 100000 },
  { rank: 'COMMANDER', level: 2, name: 'COMMANDER II', goldRequired: 250000 },
  { rank: 'COMMANDER', level: 3, name: 'COMMANDER III', goldRequired: 500000 },
  { rank: 'COMMANDER', level: 4, name: 'COMMANDER IV', goldRequired: 1000000 },
  { rank: 'TITAN', level: 0, name: 'TITAN', goldRequired: 1000000, isBase: true },
  { rank: 'TITAN', level: 1, name: 'TITAN I', goldRequired: 1000000 },
  { rank: 'TITAN', level: 2, name: 'TITAN II', goldRequired: 2500000 },
  { rank: 'TITAN', level: 3, name: 'TITAN III', goldRequired: 5000000 },
  { rank: 'TITAN', level: 4, name: 'TITAN IV', goldRequired: 10000000 },
];

// Space background - contained within rounded container
const SpaceBackgroundContained = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
    {/* Main background image - future.png */}
    <div
      className="absolute inset-x-0 top-0 h-[80vh] bg-cover bg-top bg-no-repeat"
      style={{ backgroundImage: 'url(/future.png)' }}
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

// Gold coin using PNG image
const GoldCoin = ({ className = '' }: { className?: string; animate?: boolean }) => (
  <img src="/ranks/Coin.png" alt="Gold" className={`${className} object-contain`} />
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
            <span className={`text-[14px] transition-colors block truncate ${isClaimed ? 'text-neutral-600 line-through' : 'text-white'}`}>
              {quest.title}
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
          <GoldCoin className="w-4 h-4" />
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

        {/* Honors row */}
        <div className={`mt-1.5 flex items-center gap-2 ${isLocked ? 'text-neutral-600' : 'text-neutral-400'}`}>
          <FiCheck className={`w-4 h-4 ${isLocked ? 'text-neutral-600' : 'text-emerald-500'}`} />
          <span className="text-sm">Honors I</span>
        </div>

        {/* Gold requirement or perks */}
        {item.isBase ? (
          <div className="mt-2 text-center space-y-0.5">
            <p className={`text-sm ${isLocked ? 'text-neutral-600' : 'text-neutral-400'}`}>{config.cashback}% Cashback</p>
            <p className={`text-sm ${isLocked ? 'text-neutral-600' : 'text-neutral-400'}`}>{config.multiplier}x Gold Boost</p>
          </div>
        ) : (
          <div className="mt-2 text-center">
            {item.goldRequired > 0 && (
              <p className={`text-sm flex items-center justify-center gap-1.5 ${isLocked ? 'text-neutral-600' : 'text-neutral-400'}`}>
                + {item.goldRequired.toLocaleString()} <GoldCoin className="w-4 h-4" />
              </p>
            )}
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

export default function ArenaPage() {
  const { user } = useUser();
  const { data: stats } = useArenaStats();
  const { data: questsData } = useQuests();
  const { data: cashback } = useCashbackSummary();
  const claimCashbackMutation = useClaimCashback();
  const queryClient = useQueryClient();
  const [isClaimingCashback, setIsClaimingCashback] = useState(false);
  const [isClaimingGold, setIsClaimingGold] = useState(false);
  const [showRanks, setShowRanks] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<'gold' | 'quest'>('gold');
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
  // Get the next level threshold - if not from API, calculate from rank config
  const currentRankConfig = RANK_CONFIG[displayRank as keyof typeof RANK_CONFIG];
  const nextLevelGold = (stats as any)?.nextLevelThreshold ||
    (displayLevel < 4
      ? currentRankConfig?.levels[displayLevel] // Next level within same rank
      : currentRankConfig?.levels[3] // Max level, show current threshold
    ) || 1000;
  const solCashbackAvailable = (stats as any)?.solCashbackAvailable || 0;
  const solCashbackEarned = (stats as any)?.solCashbackEarned || 0;
  const currentStreak = (stats as any)?.currentStreak || 0;
  const longestStreak = (stats as any)?.longestStreak || 0;

  // Animation mount effect
  useEffect(() => {
    setMounted(true);
  }, []);

  // Claim all unclaimed quests - uses API directly to avoid multiple toasts
  const handleClaimAllGold = async () => {
    const unclaimedQuests = allQuests.filter((q: any) => q.isCompleted && !q.isClaimed);
    if (unclaimedQuests.length === 0) {
      toast('No gold to claim!', { icon: '💡' });
      return;
    }

    if (!user?.bearerToken) {
      toast.error('Please log in to claim rewards');
      return;
    }

    setIsClaimingGold(true);
    let totalClaimed = 0;

    try {
      // Claim all quests sequentially using API directly (no individual toasts)
      for (const quest of unclaimedQuests) {
        const result = await claimQuest(user.bearerToken, quest.id);
        totalClaimed += result.goldAwarded || 0;
      }

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['arena', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['arena', 'quests'] });

      // Show ONE toast with total
      toast.success(`🪙 Claimed ${totalClaimed.toLocaleString()} Gold!`, { duration: 4000 });
    } catch (error: any) {
      toast.error(error.message || 'Failed to claim gold');
      // Still refresh in case some claims succeeded
      queryClient.invalidateQueries({ queryKey: ['arena', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['arena', 'quests'] });
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

  const dailyQuests = (questsData as any)?.grouped?.daily?.slice(0, 4) || [];
  const seasonalQuests = (questsData as any)?.grouped?.seasonal?.slice(0, 4) || [];

  // Calculate pending gold from completed but unclaimed quests
  const allQuests = (questsData as any)?.quests || [];
  const pendingGoldFromQuests = allQuests
    .filter((q: any) => q.isCompleted && !q.isClaimed)
    .reduce((sum: number, q: any) => sum + (Number(q.goldReward) || 0), 0);

  // Determine which ranks are unlocked
  const getCurrentRankIndex = useCallback(() => {
    const rankOrder = ['DEGEN', 'WARRIOR', 'GLADIATOR', 'COMMANDER', 'TITAN'];
    const rankIdx = rankOrder.indexOf(displayRank);
    return rankIdx * 5 + displayLevel;
  }, [displayRank, displayLevel]);

  const currentRankIndex = getCurrentRankIndex();

  // Auto-scroll carousel to current rank on mount
  useEffect(() => {
    if (carouselRef.current && showRanks) {
      const scrollPosition = currentRankIndex * 144 - (carouselRef.current.clientWidth / 2) + 72;
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
      const scrollAmount = 288;
      carouselRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <>
      <Head>
        <title>Arena | Interstate</title>
        <meta name="description" content="Level up your trading with Interstate Arena - earn Gold, climb ranks, and compete for rewards." />
      </Head>

      <div className="min-h-screen bg-black">
        {/* Header stays outside the rounded container */}
        <Header />

        {/* Outer padding wrapper - uniform padding on all sides */}
        <div className="p-1 sm:p-1.5">
          {/* Rounded container with background */}
          <div className="relative rounded-2xl overflow-hidden min-h-[calc(100vh-80px)] border border-white/[0.06]">
            {/* Background inside the rounded container */}
            <SpaceBackgroundContained />

            {/* Content */}
            <main className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-24">
            {/* Epic Title Section */}
            <div className={`text-center mb-12 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
              {/* Decorative top element */}
              <div className="flex items-center justify-center gap-4 mb-4">
                <div className="h-px w-16 bg-gradient-to-r from-transparent via-yellow-500/50 to-yellow-500/20" />
                <GiTrophy className="w-6 h-6 text-yellow-500/70" />
                <div className="h-px w-16 bg-gradient-to-l from-transparent via-yellow-500/50 to-yellow-500/20" />
              </div>

              {/* Main title */}
              <div className="relative inline-block">
                <h1 className="text-6xl md:text-8xl font-black tracking-[0.2em] bg-gradient-to-b from-yellow-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent relative z-10">
                  ARENA
                </h1>
                {/* Glow effect behind text */}
                <div className="absolute inset-0 text-6xl md:text-8xl font-black tracking-[0.2em] text-yellow-500/20 blur-xl z-0">
                  ARENA
                </div>
              </div>

              {/* Subtitle with icons */}
              <div className="flex items-center justify-center gap-3 mt-4">
                <IoFlameSharp className="w-4 h-4 text-orange-500/70" />
                <p className="text-neutral-400 text-sm tracking-[0.3em] uppercase font-medium">
                  Trade • Compete • Conquer
                </p>
                <IoFlameSharp className="w-4 h-4 text-orange-500/70" />
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

            {/* User Stats Bar - Clean matte design */}
            <div className={`flex flex-col sm:flex-row items-stretch gap-3 mb-6 transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              {/* Left: Username & Progress */}
              <div className="flex-1 flex flex-col gap-2 px-5 py-4 bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] rounded-xl">
                {/* Top row: Badge + Username + Gold count */}
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
                    <GoldCoin className="w-4 h-4" />
                    <span className="text-neutral-300 text-sm font-medium">{displayGoldEarned.toLocaleString()} / {nextLevelGold.toLocaleString()}</span>
                  </div>
                </div>
                {/* Progress bar - full width */}
                <div className="h-2.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-neutral-500 to-neutral-400 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(progressToNext, 100)}%` }}
                  />
                </div>
              </div>

              {/* Right: Gold & SOL Earned */}
              <div className="flex flex-col justify-center gap-2.5 px-6 py-3.5 bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] rounded-xl min-w-[220px]">
                {/* Gold earned row */}
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400 text-sm">Gold earned</span>
                  <div className="flex items-center gap-1.5">
                    <GoldCoin className="w-4 h-4" />
                    <span className="text-white font-semibold text-sm">{displayGoldEarned.toLocaleString()}</span>
                    {/* Info tooltip */}
                    <div className="relative group">
                      <FiInfo className="w-3.5 h-3.5 text-neutral-500 hover:text-neutral-300 cursor-pointer transition-colors" />
                      <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 whitespace-nowrap">
                        <p className="text-white text-xs font-medium mb-1">Available Gold: <span className="text-amber-400">{displayGoldEarned.toLocaleString()}</span></p>
                        <p className="text-neutral-400 text-xs">You can use your Gold to enter the Jackpot.</p>
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

            {/* Cashback Banner */}
            <div className={`relative mb-6 px-5 py-4 rounded-xl overflow-hidden transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{ background: 'linear-gradient(90deg, #2a2310 0%, #1a1a0f 50%, #1f1a10 100%)' }}
            >
              {/* Gold accent border on left */}
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-yellow-500 via-amber-500 to-yellow-600" />

              {/* Coin image on right */}
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

            {/* Main Content - Unified Box */}
            <Card className={`mb-6 overflow-hidden transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <div className="flex flex-col lg:flex-row">
                {/* Left: Current Rank */}
                <div className="lg:w-[380px] p-6 flex flex-col items-center lg:border-r border-neutral-800/60">
                  {/* Rank Badge - Spinning on hover */}
                  <div className="relative mt-4">
                    <MainBadge rank={displayRank} level={displayLevel} />
                  </div>

                  {/* Rank Name - Large and bold */}
                  <h3 className="mt-5 text-3xl font-black tracking-widest text-white uppercase">
                    {displayRank} {['', 'I', 'II', 'III', 'IV'][displayLevel]}
                  </h3>

                  {/* Level Diamonds */}
                  <LevelIndicator currentLevel={displayLevel} />

                  {/* Perks */}
                  <div className="w-full mt-4 space-y-2">
                    {/* Cashback Perk */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-neutral-900/40 border border-neutral-800/60 rounded-lg">
                      <FiCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span className="text-white font-medium">{cashbackPercent}% Cashback</span>
                    </div>

                    {/* Gold Boost Perk - with gold shine accent */}
                    <div className="relative flex items-center justify-between gap-3 px-4 py-3 rounded-lg overflow-hidden"
                      style={{
                        background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.15) 0%, rgba(30, 30, 25, 0.6) 100%)',
                        border: '1px solid rgba(212, 175, 55, 0.25)'
                      }}
                    >
                      {/* Gold accent bar on left */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-600" />
                      <div className="flex items-center gap-3 pl-2">
                        <FiCheck className="w-4 h-4 flex-shrink-0" style={{ color: '#D4AF37' }} />
                        <span className="text-white font-medium">{displayMultiplier}x Gold Boost</span>
                      </div>
                      <button className="p-1 rounded hover:bg-white/5 transition-colors cursor-pointer">
                        <FiExternalLink className="w-4 h-4 text-neutral-500" />
                      </button>
                    </div>
                  </div>

                  {/* Toggle Ranks Button */}
                  <button
                    onClick={() => setShowRanks(!showRanks)}
                    className="mt-4 w-full py-3 bg-neutral-800/60 hover:bg-neutral-700/60 text-white font-medium rounded-lg transition-all border border-neutral-700/50 cursor-pointer"
                  >
                    {showRanks ? 'Hide Ranks' : 'View All Ranks'}
                  </button>
                </div>

                {/* Right: Quests */}
                <div className="flex-1 p-6">
                  {/* Daily Quests */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-white font-bold">Daily Quests</h3>
                      <CountdownDisplay hours={countdown.hours} minutes={countdown.minutes} seconds={countdown.seconds} />
                    </div>
                    <div className="space-y-2">
                      {dailyQuests.length > 0 ? (
                        dailyQuests.map((quest: any, idx: number) => (
                          <QuestItem key={quest.id} quest={quest} index={idx} />
                        ))
                      ) : (
                        <div className="text-center py-6 text-neutral-500 text-sm">
                          <p>No daily quests available yet.</p>
                          <p className="text-xs mt-1">Start trading to unlock quests!</p>
                        </div>
                      )}
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
                      {seasonalQuests.length > 0 ? (
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
                      GOLD REWARDS
                    </h3>
                    <span className="px-4 py-1.5 bg-amber-500/15 border border-amber-500/40 text-amber-400 text-sm font-bold rounded-lg">
                      {displayMultiplier}x Gold Boost
                    </span>
                  </div>
                  <p className="text-neutral-500 text-sm mb-5">Earned Through Quests, Rank Ups and more</p>

                  {/* Balance box - gold tint */}
                  <div
                    className="flex items-center justify-between p-4 rounded-lg"
                    style={{
                      background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.08) 0%, rgba(30, 28, 20, 0.8) 100%)',
                      border: '1px solid rgba(212, 175, 55, 0.15)'
                    }}
                  >
                    <div>
                      <p className="text-neutral-400 text-sm mb-1">Claimable Gold</p>
                      <div className="flex items-center gap-2">
                        <GoldCoin className="w-5 h-5" />
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
                    /* Locked state - placeholder chart */
                    <div className="relative h-44 rounded-xl overflow-hidden">
                      <div className="absolute bottom-0 left-0 right-0 h-full">
                        <svg className="w-full h-full" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="chartGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.3" />
                              <stop offset="50%" stopColor="#10B981" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#10B981" stopOpacity="0.5" />
                            </linearGradient>
                          </defs>
                          <path
                            d="M 0 140 Q 50 130, 100 120 T 200 100 T 300 80 T 400 60 T 500 30"
                            fill="none"
                            stroke="url(#chartGradient)"
                            strokeWidth="2"
                            className="opacity-50"
                          />
                          <path
                            d="M 0 140 Q 50 130, 100 120 T 200 100 T 300 80 T 400 60 T 500 30 L 500 180 L 0 180 Z"
                            fill="url(#chartGradient)"
                            className="opacity-20"
                          />
                        </svg>
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/50 backdrop-blur-[1px]">
                        <div className="flex items-center gap-3 px-4 py-2.5 bg-neutral-800/90 border border-neutral-700/50 rounded-xl">
                          <FiLock className="w-4 h-4 text-neutral-500" />
                          <span className="text-neutral-400 text-sm">Unlock Rewards Breakdown by Earning SOL</span>
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
                    Gold Leaderboard
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
                            <GoldCoin className="w-4 h-4" />
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
                More Questions? <span className="text-neutral-300 hover:text-white underline cursor-pointer transition-colors">Chat with Support</span> or <span className="text-neutral-300 hover:text-white underline cursor-pointer transition-colors">View Arena Intro</span>
              </p>
              <Card className="overflow-hidden">
                <div className="px-5">
                  <FAQItem question="How does the Arena work?" answer="The Arena is our gamified rewards system. Trade to earn Gold, climb ranks, and unlock better rewards like higher cashback percentages and Gold multipliers." />
                  <FAQItem question="How can I earn Gold?" answer="You earn Gold by trading, completing quests, maintaining trading streaks, and ranking up. All Gold earned is multiplied by your current rank's Gold Boost." />
                  <FAQItem question="Do I have to claim my Gold?" answer="Gold from trading is automatically added to your balance. Quest rewards need to be manually claimed by clicking the Claim button." />
                  <FAQItem question="What can I do with my Gold?" answer="Gold determines your position on the leaderboard. Top performers earn additional prizes. Future features will include more ways to use your Gold." />
                </div>
              </Card>
            </div>

            {/* Navigation Links */}
            <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 transition-all duration-700 delay-[800ms] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <Link href="/leaderboard" className="block group">
                <Card className="p-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <GiTrophy className="w-6 h-6 text-yellow-500" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold">Leaderboard</h4>
                      <p className="text-neutral-500 text-sm">Compete for rankings</p>
                    </div>
                    <FiChevronRight className="w-5 h-5 text-neutral-600 group-hover:text-yellow-500 group-hover:translate-x-1 transition-all ml-auto" />
                  </div>
                </Card>
              </Link>
              <Link href="/referrals" className="block group">
                <Card className="p-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <GiCoins className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold">Referrals</h4>
                      <p className="text-neutral-500 text-sm">Build your network</p>
                    </div>
                    <FiChevronRight className="w-5 h-5 text-neutral-600 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all ml-auto" />
                  </div>
                </Card>
              </Link>
              <Link href="/arena/rewards" className="block group">
                <Card className="p-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <SolanaLogo className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold">Rewards</h4>
                      <p className="text-neutral-500 text-sm">Claim your earnings</p>
                    </div>
                    <FiChevronRight className="w-5 h-5 text-neutral-600 group-hover:text-purple-500 group-hover:translate-x-1 transition-all ml-auto" />
                  </div>
                </Card>
              </Link>
            </div>
            </main>

            {/* Footer inside the rounded container */}
            <div className="relative z-10">
              <Footer />
            </div>
          </div>
        </div>
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
