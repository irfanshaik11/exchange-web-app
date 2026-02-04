/**
 * Referrals Page
 *
 * Premium Trojan Arena style interface matching the arena page design.
 * Features: Space background, Honors system, 5-layer referrals, quests.
 */

import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Header from '~/components/Header';
import Footer from '~/components/Footer';
import { useUser } from '~/components/UserContext';
import { useReferralsPageData, useAllReferrals, useArenaStats } from '~/hooks/useArena';
import type { ReferralStats, HonorsInfo } from '~/utils/arenaApi';
import { claimReferralRewards } from '~/utils/arenaApi';
import UsernameEditModal from '~/components/UsernameEditModal';
import { toast } from 'react-hot-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';

// React Icons
import { GiMedal, GiTrophy, GiCrown, GiCoins } from 'react-icons/gi';
import ArenaPageToggle from '~/components/ArenaPageToggle';
import { FiUsers, FiCopy, FiCheck, FiEdit2, FiLock, FiSearch, FiChevronDown, FiChevronLeft, FiChevronRight, FiInfo } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi';
import { IoRocketSharp } from 'react-icons/io5';
import { BiUser } from 'react-icons/bi';

// Space background - contained within rounded container (matching Arena)
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

// Rank configuration
const RANK_CONFIG = {
  DEGEN: { color: '#8B7355' },
  WARRIOR: { color: '#4A90A4' },
  GLADIATOR: { color: '#50C878' },
  COMMANDER: { color: '#9B59B6' },
  TITAN: { color: '#FFD700' },
};

// Helper to get rank image path
const getRankImage = (rank: string, level: number = 1): string => {
  const rankLower = rank.toLowerCase();
  const clampedLevel = Math.max(1, Math.min(4, level || 1));
  return `/ranks/${rankLower}-${clampedLevel}.png`;
};

// Credits coin using PNG image
const CreditsCoin = ({ className = '' }: { className?: string }) => (
  <img src="/ranks/Coin.png" alt="Credits" className={`${className} object-contain`} />
);

// Solana logo
const SolanaLogo = ({ className = '' }: { className?: string }) => (
  <img src="https://solana.com/src/img/branding/solanaLogoMark.svg" alt="SOL" className={`${className} object-contain`} />
);

// Honors badge using DEGEN rank images
const HonorsBadge = ({ level, size = 'lg', isLocked = false }: { level: number; size?: 'sm' | 'md' | 'lg'; isLocked?: boolean }) => {
  const sizes = { sm: 'w-20 h-20', md: 'w-32 h-32', lg: 'w-40 h-40' };
  const imageSizes = { sm: 'w-18 h-18', md: 'w-28 h-28', lg: 'w-36 h-36' };

  // Map honors level to degen image level (1-4)
  const imageLevel = Math.max(1, Math.min(4, level));

  return (
    <div className={`relative ${sizes[size]} flex items-center justify-center`}>
      {/* Glow effect for unlocked */}
      {!isLocked && (
        <div
          className="absolute inset-0 blur-xl opacity-40"
          style={{
            background: 'radial-gradient(circle, #8B735560 0%, transparent 70%)',
            transform: 'scale(1.3)',
          }}
        />
      )}
      {/* Badge image */}
      <img
        src={`/ranks/degen-${imageLevel}.png`}
        alt={`Honors ${level}`}
        className={`${imageSizes[size]} object-contain relative z-10 ${isLocked ? 'opacity-40 grayscale' : ''}`}
      />
    </div>
  );
};

// Card component - matching Arena style
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-[#0a0a0a]/95 backdrop-blur-sm border border-neutral-800/50 rounded-xl ${className}`}>
    {children}
  </div>
);

// Progress bar
const ProgressBar = ({ progress, color = 'purple' }: { progress: number; color?: string }) => {
  const colors: Record<string, string> = {
    purple: 'bg-purple-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
  };
  return (
    <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
      <div className={`h-full ${colors[color]} rounded-full transition-all duration-500`} style={{ width: `${Math.min(progress, 100)}%` }} />
    </div>
  );
};

export default function ReferralsPage() {
  const { user } = useUser();

  // State hooks must be defined before any hooks that use them
  const [copied, setCopied] = useState(false);
  const [showAllHonors, setShowAllHonors] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const honorsCarouselRef = useRef<HTMLDivElement>(null);

  // Data fetching hooks
  const { stats, honors, quests, refetch } = useReferralsPageData();
  const { data: allReferrals } = useAllReferrals({
    limit: itemsPerPage,
    offset: (currentPage - 1) * itemsPerPage,
    search: searchQuery || undefined
  });
  const { data: arenaStats } = useArenaStats();
  const queryClient = useQueryClient();

  // Custom claim mutation with Solscan link toast
  const claimRewardsMutation = useMutation({
    mutationFn: () => claimReferralRewards(user!.bearerToken),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['arena', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      if (data.success && data.amountClaimed > 0) {
        toast.success(
          (t) => (
            <div className="flex flex-col gap-1">
              <span className="font-medium">✅ Claimed {data.amountClaimed.toFixed(4)} SOL!</span>
              {data.txSignature && (
                <a
                  href={`https://solscan.io/tx/${data.txSignature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline text-sm hover:text-blue-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  View on Solscan →
                </a>
              )}
            </div>
          ),
          { duration: 8000 }
        );
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to claim referral rewards');
    },
  });

  // Carousel scroll function
  const scrollHonorsCarousel = (direction: 'left' | 'right') => {
    if (honorsCarouselRef.current) {
      const scrollAmount = 280;
      honorsCarouselRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Pagination calculations
  const totalPages = Math.ceil((allReferrals?.total || 0) / itemsPerPage);

  // Arena stats for user bar
  const userName = user?.name || 'User';
  const displayRank = (arenaStats as any)?.rank || 'DEGEN';
  const displayLevel = (arenaStats as any)?.level || 1;
  const displayGoldEarned = (arenaStats as any)?.goldEarned || 0;
  const nextLevelGold = 1000; // Credits needed for next level display
  const progressToNext = Math.min((displayGoldEarned / nextLevelGold) * 100, 100);

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Real data from API with fallback defaults
  const statsData: ReferralStats = stats.data || {
    directReferrals: 0,
    tier1Referrals: 0,
    tier2Referrals: 0,
    tier3Referrals: 0,
    tier4Referrals: 0,
    totalReferrals: 0,
    totalReferralVolume: 0,
    pendingSolRewards: 0,
    claimedSolRewards: 0,
    totalEarnedRewards: 0,
    honorsLevel: 1,
    honorsName: 'Honors I',
    nextHonorsLevel: 2,
    nextHonorsRequirement: 20,
    tradersToNextTier: 20,
    referralCode: user?.name?.toUpperCase().substring(0, 6) || 'USER',
    referralLink: '',
    activeTradersCount: 0,
  };

  // Always compute referral link locally to use current origin (localhost in dev, production URL in prod)
  const localReferralLink = typeof window !== 'undefined' && statsData.referralCode
    ? `${window.location.origin}?ref=${statsData.referralCode}`
    : statsData.referralLink;

  // Honors data from API
  const honorsData: HonorsInfo = honors.data || {
    currentLevel: 1,
    currentName: 'Honors I',
    currentRequirement: 0,
    revSharePercentages: {
      direct: 20,
      tier1: 3,
      tier2: 2,
      tier3: 1.5,
      tier4: 1,
    },
    totalRevShare: 27.5,
    activeTradersCount: 0,
    tradersToNextTier: 20,
    nextTierRequirement: 20,
    allTiers: [
      { level: 1, name: 'Honors I', requirement: 0, revSharePercentages: { direct: 20, tier1: 3, tier2: 2, tier3: 1.5, tier4: 1 }, totalRevShare: 27.5, isUnlocked: true, isCurrent: true },
      { level: 2, name: 'Honors II', requirement: 20, revSharePercentages: { direct: 22.5, tier1: 4, tier2: 2.5, tier3: 2, tier4: 1.5 }, totalRevShare: 32.5, isUnlocked: false, isCurrent: false },
      { level: 3, name: 'Honors III', requirement: 50, revSharePercentages: { direct: 30, tier1: 5, tier2: 3.5, tier3: 2.5, tier4: 1.5 }, totalRevShare: 42.5, isUnlocked: false, isCurrent: false },
      { level: 4, name: 'Honors IV', requirement: 100, revSharePercentages: { direct: 35, tier1: 6, tier2: 4, tier3: 3, tier4: 2 }, totalRevShare: 50, isUnlocked: false, isCurrent: false },
    ],
  };

  // All honors tiers from API or default
  const allHonorsTiers = honorsData.allTiers || [
    { level: 1, name: 'HONORS I', totalRevShare: 27.5, isUnlocked: true, requirement: 0 },
    { level: 2, name: 'HONORS II', totalRevShare: 32.5, isUnlocked: false, requirement: 20 },
    { level: 3, name: 'HONORS III', totalRevShare: 42.5, isUnlocked: false, requirement: 50 },
    { level: 4, name: 'HONORS IV', totalRevShare: 50, isUnlocked: false, requirement: 100 },
  ];

  // Referral quests - show all tiers (completed ones will be greyed out)
  const referralRankUpQuests = allHonorsTiers
    .filter(tier => tier.level > 1) // Exclude Honors I (everyone starts there)
    .map((tier) => ({
      id: tier.level,
      title: `Recruit ${tier.requirement} active traders`,
      reward: tier.name,
      type: 'honors' as const,
      progress: statsData.activeTradersCount,
      target: tier.requirement,
      isComplete: tier.isUnlocked || honorsData.currentLevel >= tier.level,
    }));

  const referralSeasonalQuests = [
    { id: 4, title: 'Recruit 5 Warriors', reward: 10000, type: 'gold' as const },
    { id: 5, title: 'Recruit 5 Gladiators', reward: 15000, type: 'gold' as const },
    { id: 6, title: 'Recruit 2 Commanders', reward: 40000, type: 'gold' as const },
    { id: 7, title: 'Recruit 1 Titan', reward: 40000, type: 'gold' as const },
  ];

  const faqs = [
    { q: 'What Is The Referral Program?', a: 'Interstate\'s 5-layer referral program lets you earn a percentage of trading fees from users you refer and their referrals up to 5 levels deep.' },
    { q: 'How Are Referral Rewards Calculated?', a: 'You earn a percentage of trading fees based on your Honors tier. Direct referrals earn 20%, Tier 1 earns 3%, Tier 2 earns 2%, Tier 3 earns 1.5%, and Tier 4 earns 1%.' },
    { q: 'How Do I Increase My Honors Level?', a: 'Complete referral rank-up quests by recruiting traders or having your referral network reach trading volume milestones.' },
    { q: 'When Can I Claim My Rewards?', a: 'Referral rewards are available to claim anytime once they accumulate. There is no minimum threshold.' },
  ];

  // Not logged in state
  if (!user) {
    return (
      <>
        <Head><title>Referrals | Interstate Arena</title></Head>
        <div className="min-h-screen bg-black">
          <Header />
          {/* Outer padding wrapper - uniform padding on all sides */}
          <div className="p-1 sm:p-1.5">
            {/* Rounded container with background */}
            <div className="relative rounded-2xl overflow-hidden min-h-[calc(100vh-80px)] border border-white/[0.06]">
              <SpaceBackgroundContained />
              <main className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] px-6">
                <div className="text-center">
                  <GiMedal className="w-20 h-20 text-amber-400 mx-auto mb-6" />
                  <h1 className="text-5xl md:text-7xl font-black tracking-tight text-white mb-4">REFERRALS</h1>
                  <p className="text-neutral-400 text-lg mb-8">Build your trading network. Earn from 5 layers.</p>
                  <button className="px-8 py-4 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors flex items-center gap-2 mx-auto cursor-pointer">
                    <IoRocketSharp /> Connect Wallet
                  </button>
                </div>
              </main>
              <div className="relative z-10">
                <Footer />
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Referrals | Interstate Arena</title>
        <meta name="description" content="Build your trading network and earn SOL from 5 layers of referrals." />
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
              {/* Arena/Referrals Toggle */}
              <ArenaPageToggle activePage="referrals" />

              {/* Epic Title Section */}
              <div className={`text-center mb-12 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                {/* Decorative top element */}
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className="h-px w-16 bg-gradient-to-r from-transparent via-amber-500/50 to-amber-500/20" />
                  <GiMedal className="w-6 h-6 text-amber-500/70" />
                  <div className="h-px w-16 bg-gradient-to-l from-transparent via-amber-500/50 to-amber-500/20" />
                </div>

                {/* Main title */}
                <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white text-center">
                  REFERRALS
                </h1>

                {/* Subtitle */}
                <div className="flex items-center justify-center gap-3 mt-4">
                  <p className="text-neutral-200 text-sm tracking-[0.3em] uppercase font-semibold">
                    Share • Earn • Grow
                  </p>
                </div>

                {/* Decorative bottom element */}
                <div className="flex items-center justify-center gap-2 mt-4">
                  <div className="w-2 h-2 rounded-full bg-amber-500/30" />
                  <div className="h-px w-24 bg-gradient-to-r from-amber-500/30 via-amber-500/10 to-transparent" />
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500/20" />
                  <div className="h-px w-24 bg-gradient-to-l from-amber-500/30 via-amber-500/10 to-transparent" />
                  <div className="w-2 h-2 rounded-full bg-amber-500/30" />
                </div>
              </div>

            {/* User Stats Bar - Matte opaque design matching Arena */}
            <div className={`flex flex-col sm:flex-row items-stretch gap-3 mb-6 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              {/* Left: Username & Honors Progress */}
              <div className="flex-1 flex flex-col gap-2 px-5 py-4 bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] rounded-xl">
                {/* Top row: Honors Badge + Username + Progress to next tier */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Honors badge */}
                    <img
                      src={`/ranks/degen-${Math.max(1, Math.min(4, honorsData.currentLevel))}.png`}
                      alt={`Honors ${honorsData.currentLevel}`}
                      className="w-6 h-6 object-contain"
                    />
                    <span className="text-white font-semibold text-sm">{userName}</span>
                    <span className="text-amber-400/80 text-xs font-medium">Honors {['I', 'II', 'III', 'IV'][honorsData.currentLevel - 1]}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <FiUsers className="w-4 h-4 text-neutral-400" />
                    <span className="text-neutral-300 text-sm font-medium">
                      {statsData.activeTradersCount} / {honorsData.currentLevel < 4 ? (honorsData.nextTierRequirement || 100) : 100} traders
                    </span>
                  </div>
                </div>
                {/* Progress bar - shows progress to next Honors tier */}
                <div className="h-2.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      honorsData.currentLevel >= 4
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                        : 'bg-gradient-to-r from-amber-600 to-amber-400'
                    }`}
                    style={{
                      width: `${honorsData.currentLevel >= 4
                        ? 100
                        : Math.min((statsData.activeTradersCount / (honorsData.nextTierRequirement || 100)) * 100, 100)}%`
                    }}
                  />
                </div>
                {honorsData.currentLevel < 4 && (
                  <p className="text-amber-400/80 text-sm font-medium mt-1">
                    {Math.max(0, (honorsData.nextTierRequirement || 0) - statsData.activeTradersCount)} more active traders to Honors {['II', 'III', 'IV'][honorsData.currentLevel - 1]}
                  </p>
                )}
              </div>

              {/* Right: Credits & SOL Earned */}
              <div className="flex flex-col justify-center gap-2.5 px-6 py-3.5 bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] rounded-xl min-w-[280px]">
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
                  <div className="flex items-center gap-2.5">
                    <SolanaLogo className="w-4 h-4" />
                    <span className="text-white font-semibold text-sm">{statsData.totalEarnedRewards.toFixed(4)} SOL</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Share Your Code Bar */}
            <div className={`flex flex-col md:flex-row items-center justify-between gap-4 px-5 py-4 bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] rounded-xl mb-6 transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              {/* Left: Share info */}
              <div className="flex-shrink-0">
                <h3 className="text-white font-bold text-sm mb-1">SHARE YOUR CODE</h3>
                <p className="text-neutral-400 text-xs whitespace-nowrap">Referrals get counted after their first trade.</p>
              </div>

              {/* Center: Referral link */}
              <div className="flex items-center gap-2 bg-neutral-900/50 border border-neutral-700/50 rounded-lg px-4 py-2">
                <span className="text-neutral-300 text-sm font-mono">{localReferralLink}</span>
                <button
                  onClick={() => handleCopyLink(localReferralLink)}
                  className="p-1.5 hover:bg-neutral-800 rounded transition-colors cursor-pointer"
                >
                  {copied ? <FiCheck className="w-4 h-4 text-emerald-400" /> : <FiCopy className="w-4 h-4 text-neutral-400" />}
                </button>
                <button
                  onClick={() => setIsUsernameModalOpen(true)}
                  className="p-1.5 hover:bg-neutral-800 rounded transition-colors cursor-pointer"
                  title="Edit username"
                >
                  <FiEdit2 className="w-4 h-4 text-neutral-400" />
                </button>
              </div>

              {/* Right: Referral count (total across all tiers) */}
              <div className="flex items-center gap-2">
                <FiUsers className="w-5 h-5 text-amber-400" />
                <span className="text-white font-bold">{statsData.totalReferrals} Referrals</span>
              </div>
            </div>

            {/* Boost Banner - Bronze/tan style matching the design */}
            <div className={`relative mb-6 px-5 py-4 rounded-xl overflow-hidden transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{
                background: 'linear-gradient(90deg, #1a1816 0%, #151312 50%, #1a1816 100%)',
                border: '1px solid rgba(139, 115, 85, 0.25)'
              }}
            >
              {/* Subtle texture overlay */}
              <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                  backgroundImage: 'url(/future.png)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}
              />

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Honors III badge */}
                  <div className="w-12 h-12 flex items-center justify-center">
                    <img
                      src="/ranks/degen-3.png"
                      alt="Honors III"
                      className="w-10 h-10 object-contain"
                    />
                  </div>
                  <div>
                    <p
                      className="text-xs uppercase tracking-wider font-medium"
                      style={{ color: '#9A8872' }}
                    >
                      Boost your refs to 42.5%
                    </p>
                    <p className="font-black text-lg tracking-wide">
                      <span className="text-white">CLAIM </span>
                      <span style={{ color: '#C4A574' }}>HONORS III</span>
                    </p>
                  </div>
                </div>
                <button
                  className="px-5 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 whitespace-nowrap cursor-pointer hover:brightness-110"
                  style={{
                    background: 'rgba(30, 26, 22, 0.9)',
                    border: '1px solid rgba(139, 115, 85, 0.5)',
                    color: '#C4A574'
                  }}
                  onClick={() => {
                    if (honorsData.currentLevel >= 3) {
                      toast.success(
                        <div className="flex items-center gap-2">
                          <img src="/ranks/degen-3.png" alt="Honors III" className="w-6 h-6" />
                          <span>You already have Honors III with 42.5% rev share!</span>
                        </div>,
                        { duration: 4000 }
                      );
                    } else {
                      const honorsIII = honorsData.allTiers.find(t => t.level === 3);
                      const tradersNeeded = honorsIII ? honorsIII.requirement - statsData.activeTradersCount : 50;
                      toast(
                        <div className="flex items-center gap-2">
                          <img src="/ranks/degen-3.png" alt="Honors III" className="w-6 h-6" />
                          <span>
                            {tradersNeeded > 0
                              ? `Refer ${tradersNeeded} more active traders to unlock Honors III!`
                              : 'You qualify for Honors III! Refreshing...'
                            }
                          </span>
                        </div>,
                        { duration: 4000 }
                      );
                      if (tradersNeeded <= 0) {
                        refetch();
                      }
                    }
                  }}
                >
                  Claim Your Boost
                </button>
              </div>
            </div>

            {/* Main Content - Unified Box (matching Arena style) */}
            <Card className="mb-6 overflow-hidden">
              <div className="flex flex-col lg:flex-row">
                {/* Left: Current Honors */}
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

                  {/* Badge using actual degen image */}
                  <div className="relative mt-4 flex items-center justify-center z-10" style={{ width: '180px', height: '180px' }}>
                    {/* Glow effect */}
                    <div
                      className="absolute inset-0 blur-xl opacity-40"
                      style={{
                        background: 'radial-gradient(circle, #8B735560 0%, transparent 70%)',
                        transform: 'scale(1.5)',
                      }}
                    />
                    <img
                      src={getRankImage('degen', honorsData.currentLevel)}
                      alt="Honors Badge"
                      className="w-44 h-44 object-contain relative z-10"
                      style={{ filter: 'drop-shadow(0 0 15px rgba(139, 115, 85, 0.5))' }}
                    />
                  </div>

                  {/* Rank Name */}
                  <p className="relative z-10 mt-4 text-neutral-500 text-xs uppercase tracking-wider">DEGEN</p>
                  <h3
                    className="relative z-10 text-4xl tracking-widest text-white uppercase"
                    style={{ fontWeight: 900 }}
                  >
                    HONORS {['I', 'II', 'III', 'IV'][honorsData.currentLevel - 1]}
                  </h3>

                  {/* Rev Share */}
                  <div className="relative z-10 w-full mt-6 flex items-center justify-between pb-4 border-b border-neutral-800/60">
                    <span className="text-white font-bold">Total Rev Share</span>
                    <span className="text-emerald-400 font-bold text-xl">{honorsData.totalRevShare}%</span>
                  </div>

                  {/* Layer Breakdown - Pyramid with people icons */}
                  <div className="relative z-10 w-full mt-4 space-y-2">
                    {/* Direct Ref: 1 person at top */}
                    <div className="flex items-center justify-between py-2 px-3 bg-neutral-900/70 rounded-lg backdrop-blur-sm">
                      <span className="text-neutral-400 text-sm w-20">Direct Ref:</span>
                      <div className="flex-1 flex justify-center gap-1">
                        <BiUser className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-500 text-xs">{statsData.directReferrals}</span>
                        <span className="text-white font-bold text-sm w-10 text-right">{honorsData.revSharePercentages.direct}%</span>
                      </div>
                    </div>
                    {/* Tier 1: 2 people */}
                    <div className="flex items-center justify-between py-2 px-3 bg-neutral-900/70 rounded-lg backdrop-blur-sm">
                      <span className="text-neutral-400 text-sm w-20">Tier 1:</span>
                      <div className="flex-1 flex justify-center gap-1">
                        <BiUser className="w-4 h-4 text-neutral-400" />
                        <BiUser className="w-4 h-4 text-neutral-400" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-500 text-xs">{statsData.tier1Referrals}</span>
                        <span className="text-white font-bold text-sm w-10 text-right">{honorsData.revSharePercentages.tier1}%</span>
                      </div>
                    </div>
                    {/* Tier 2: 3 people */}
                    <div className="flex items-center justify-between py-2 px-3 bg-neutral-900/70 rounded-lg backdrop-blur-sm">
                      <span className="text-neutral-400 text-sm w-20">Tier 2:</span>
                      <div className="flex-1 flex justify-center gap-1">
                        <BiUser className="w-4 h-4 text-neutral-500" />
                        <BiUser className="w-4 h-4 text-neutral-500" />
                        <BiUser className="w-4 h-4 text-neutral-500" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-500 text-xs">{statsData.tier2Referrals}</span>
                        <span className="text-white font-bold text-sm w-10 text-right">{honorsData.revSharePercentages.tier2}%</span>
                      </div>
                    </div>
                    {/* Tier 3: 4 people */}
                    <div className="flex items-center justify-between py-2 px-3 bg-neutral-900/70 rounded-lg backdrop-blur-sm">
                      <span className="text-neutral-400 text-sm w-20">Tier 3:</span>
                      <div className="flex-1 flex justify-center gap-1">
                        <BiUser className="w-4 h-4 text-neutral-600" />
                        <BiUser className="w-4 h-4 text-neutral-600" />
                        <BiUser className="w-4 h-4 text-neutral-600" />
                        <BiUser className="w-4 h-4 text-neutral-600" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-500 text-xs">{statsData.tier3Referrals}</span>
                        <span className="text-white font-bold text-sm w-10 text-right">{honorsData.revSharePercentages.tier3}%</span>
                      </div>
                    </div>
                    {/* Tier 4: 5 people */}
                    <div className="flex items-center justify-between py-2 px-3 bg-neutral-900/70 rounded-lg backdrop-blur-sm">
                      <span className="text-neutral-400 text-sm w-20">Tier 4:</span>
                      <div className="flex-1 flex justify-center gap-1">
                        <BiUser className="w-4 h-4 text-neutral-700" />
                        <BiUser className="w-4 h-4 text-neutral-700" />
                        <BiUser className="w-4 h-4 text-neutral-700" />
                        <BiUser className="w-4 h-4 text-neutral-700" />
                        <BiUser className="w-4 h-4 text-neutral-700" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-500 text-xs">{statsData.tier4Referrals}</span>
                        <span className="text-white font-bold text-sm w-10 text-right">{honorsData.revSharePercentages.tier4}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Toggle Ranks Button */}
                  <button
                    onClick={() => setShowAllHonors(!showAllHonors)}
                    className="relative z-10 mt-6 w-full py-3 bg-neutral-800/70 hover:bg-neutral-700/70 text-white font-medium rounded-lg transition-all border border-neutral-700/50 cursor-pointer backdrop-blur-sm"
                  >
                    {showAllHonors ? 'Hide Ranks' : 'View All Ranks'}
                  </button>
                </div>

                {/* Right: Quests - matching Arena's QuestItem style */}
                <div className="flex-1 p-6">
                  {/* Referral Rank-Up Quests */}
                  <div className="mb-6">
                    <h3 className="text-white font-bold mb-4">Referral Rank-Up Quests</h3>
                    <div className="space-y-2">
                      {referralRankUpQuests.map((quest) => (
                        <div
                          key={quest.id}
                          className={`flex items-center justify-between py-4 px-4 rounded-xl border transition-all duration-200 ${
                            quest.isComplete
                              ? 'bg-neutral-900/40 border-neutral-800/30 opacity-60'
                              : 'bg-neutral-900/70 border-neutral-800/50 hover:border-neutral-700/70'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            {/* Checkbox - filled with check if complete */}
                            {quest.isComplete ? (
                              <div className="w-5 h-5 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center flex-shrink-0">
                                <FiCheck className="w-3 h-3 text-emerald-400" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-neutral-600 flex-shrink-0" />
                            )}
                            <span className={`text-[15px] ${quest.isComplete ? 'text-neutral-400 line-through' : 'text-white'}`}>
                              {quest.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Use badge image for honors reward */}
                            <img
                              src={getRankImage('degen', { 'Honors II': 2, 'Honors III': 3, 'Honors IV': 4 }[quest.reward] || 1)}
                              alt={quest.reward}
                              className={`w-5 h-5 object-contain ${quest.isComplete ? 'opacity-50' : ''}`}
                            />
                            <span
                              className={`font-bold text-sm ${quest.isComplete ? 'opacity-50' : ''}`}
                              style={{ color: '#C4A574' }}
                            >
                              {quest.reward}
                            </span>
                            {quest.isComplete && (
                              <span className="text-emerald-400 text-xs font-medium ml-1">✓ Claimed</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-neutral-800/60 mb-6" />

                  {/* Referral Seasonal Quests */}
                  <div>
                    <h3 className="text-white font-bold mb-4">Referral Seasonal Quests</h3>
                    <div className="space-y-2">
                      {referralSeasonalQuests.map((quest) => (
                        <div
                          key={quest.id}
                          className="flex items-center justify-between py-4 px-4 rounded-xl bg-neutral-900/70 border border-neutral-800/50 hover:border-neutral-700/70 transition-all duration-200"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-5 h-5 rounded-full border-2 border-neutral-600 flex-shrink-0" />
                            <span className="text-white text-[15px]">{quest.title}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CreditsCoin className="w-5 h-5" />
                            <span className="text-amber-400 font-bold">{quest.reward.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Honors Carousel - Matching Arena's Rank Carousel Style */}
            {showAllHonors && (
              <div className="mb-6 bg-[#0a0a0a]/95 backdrop-blur-sm border border-neutral-800/50 rounded-xl relative overflow-hidden">
                {/* Gradient edges for scroll indication */}
                <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#0a0a0a] to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#0a0a0a] to-transparent z-10 pointer-events-none" />

                {/* Navigation buttons */}
                <button
                  onClick={() => scrollHonorsCarousel('left')}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 bg-neutral-800/90 hover:bg-neutral-700 border border-neutral-600/50 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer"
                >
                  <FiChevronLeft className="w-5 h-5 text-white" />
                </button>
                <button
                  onClick={() => scrollHonorsCarousel('right')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 bg-neutral-800/90 hover:bg-neutral-700 border border-neutral-600/50 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer"
                >
                  <FiChevronRight className="w-5 h-5 text-white" />
                </button>

                {/* Carousel */}
                <div
                  ref={honorsCarouselRef}
                  className="flex overflow-x-auto px-10 scrollbar-hide scroll-smooth snap-x snap-mandatory"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {allHonorsTiers.map((tier, idx) => {
                    const isCurrent = tier.level === honorsData.currentLevel;
                    const isLocked = !tier.isUnlocked && !isCurrent;
                    const isLast = idx === allHonorsTiers.length - 1 && false; // Not last because Spartan follows

                    return (
                      <div key={idx} className="snap-center flex h-full">
                        <div className={`
                          flex-shrink-0 w-[240px] flex flex-col items-center justify-center px-6 py-5
                          transition-all duration-300
                          ${isLocked ? 'opacity-50' : 'opacity-100'}
                        `}>
                          {/* Status badge - matching Arena style */}
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

                          {/* Badge - larger size */}
                          <HonorsBadge level={tier.level} size="lg" isLocked={isLocked} />

                          {/* Rank Name */}
                          <h4
                            className={`mt-3 text-3xl tracking-wide ${isLocked ? 'text-neutral-500' : 'text-white'}`}
                            style={{ fontWeight: 900 }}
                          >
                            {tier.name}
                          </h4>

                          {/* Honors row */}
                          <div className={`mt-2 flex items-center gap-2 ${isLocked ? 'text-neutral-600' : 'text-neutral-400'}`}>
                            <FiCheck className={`w-5 h-5 ${isLocked ? 'text-neutral-600' : 'text-emerald-500'}`} />
                            <span className="text-base font-medium">Honors {['I', 'II', 'III', 'IV'][tier.level - 1]}</span>
                          </div>

                          {/* Rev share details */}
                          <div className="mt-3 text-center">
                            <p className={`text-base ${isLocked ? 'text-neutral-600' : 'text-neutral-400'}`}>
                              {tier.totalRevShare}% Rev Share
                            </p>
                          </div>
                        </div>

                        {/* Vertical divider line */}
                        <div className="w-px bg-neutral-700/40 self-stretch" />
                      </div>
                    );
                  })}

                  {/* Spartan Partner - Special gold accent card */}
                  <div className="snap-center flex h-full">
                    <div className="flex-shrink-0 w-[240px] flex flex-col items-center justify-center px-6 py-5">
                      {/* Status badge */}
                      <div className="mb-3 h-7">
                        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-semibold rounded">
                          Elite Tier
                        </span>
                      </div>

                      {/* Spartan Badge */}
                      <div className="relative w-32 h-32 flex items-center justify-center">
                        <div
                          className="absolute inset-0 blur-xl opacity-50"
                          style={{
                            background: 'radial-gradient(circle, #FFD70060 0%, transparent 70%)',
                            transform: 'scale(1.3)',
                          }}
                        />
                        <img
                          src="https://cdn.trojan.com/arena/ranks/big/spartan.webp"
                          alt="Spartan Partner"
                          className="w-28 h-28 object-contain relative z-10"
                        />
                      </div>

                      {/* Rank Name */}
                      <h4
                        className="mt-3 text-3xl tracking-wide text-white"
                        style={{ fontWeight: 900 }}
                      >
                        SPARTAN
                      </h4>

                      {/* Partner badge */}
                      <div className="mt-2 flex items-center gap-2 text-amber-400">
                        <GiCrown className="w-5 h-5" />
                        <span className="text-base font-medium">Partner</span>
                      </div>

                      {/* Details */}
                      <div className="mt-3 text-center space-y-0.5">
                        <p className="text-base text-neutral-400">Custom Rev Share</p>
                        <button className="mt-2 px-4 py-1.5 bg-neutral-800/80 hover:bg-neutral-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer border border-neutral-700/50">
                          Get In Touch
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SOL & Credits Rewards - matching Arena style */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
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
                    className="flex flex-col gap-3 p-4 rounded-lg"
                    style={{
                      background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, rgba(20, 30, 28, 0.8) 100%)',
                      border: '1px solid rgba(16, 185, 129, 0.15)'
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-neutral-400 text-sm mb-1">Available SOL</p>
                        <div className="flex items-center gap-2">
                          <SolanaLogo className="w-5 h-5" />
                          <span className="text-white text-xl font-bold">{statsData.pendingSolRewards.toFixed(4)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => claimRewardsMutation.mutate()}
                        disabled={statsData.pendingSolRewards < 0.005 || claimRewardsMutation.isPending}
                        className={`px-5 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          statsData.pendingSolRewards >= 0.005 && !claimRewardsMutation.isPending
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 cursor-pointer'
                            : 'bg-emerald-900/40 text-emerald-400/70 border-emerald-700/30 cursor-not-allowed opacity-50'
                        }`}
                      >
                        {claimRewardsMutation.isPending ? 'Claiming...' : 'Claim'}
                      </button>
                    </div>
                    {/* Minimum claim info */}
                    {statsData.pendingSolRewards > 0 && statsData.pendingSolRewards < 0.005 && (
                      <p className="text-amber-400/80 text-xs">
                        Minimum claim: 0.005 SOL ({((0.005 - statsData.pendingSolRewards) * 100 / 0.005).toFixed(0)}% more needed)
                      </p>
                    )}
                  </div>
                </div>
              </Card>

              {/* Credits Rewards */}
              <Card className="p-6">
                <div>
                  {/* Title with badge */}
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-2xl font-black tracking-wide bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
                      CREDITS REWARDS
                    </h3>
                    <span className="px-4 py-1.5 bg-amber-500/15 border border-amber-500/40 text-amber-400 text-sm font-bold rounded-lg">
                      1x Credits Boost
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
                      <p className="text-neutral-400 text-sm mb-1">Available Credits</p>
                      <div className="flex items-center gap-2">
                        <CreditsCoin className="w-5 h-5" />
                        <span className="text-white text-xl font-bold">0</span>
                      </div>
                    </div>
                    <button
                      disabled
                      className="px-5 py-2 bg-amber-900/30 text-amber-400/70 rounded-lg border border-amber-700/30 cursor-not-allowed transition-colors text-sm font-medium"
                    >
                      Claim
                    </button>
                  </div>
                </div>
              </Card>
            </div>

            {/* Overview Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-black text-lg uppercase">Overview</h2>
                <button className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-white text-sm transition-colors">
                  Last 7 Days
                  <FiChevronDown className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Rank Breakdown - Unlocks when user has referrals */}
                <Card className="p-6 relative overflow-hidden">
                  <h3 className="text-white font-bold text-sm uppercase mb-4">Referral Tier Breakdown</h3>
                  {statsData.totalReferrals > 0 ? (
                    <>
                      {/* Unlocked: Show tier breakdown */}
                      <div className="h-48 flex items-center gap-6">
                        {/* Donut Chart */}
                        <div className="relative w-32 h-32 flex-shrink-0">
                          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                            {/* Background circle */}
                            <circle cx="18" cy="18" r="15.9" fill="transparent" stroke="#262626" strokeWidth="3" />
                            {/* Direct referrals (amber) */}
                            <circle
                              cx="18" cy="18" r="15.9" fill="transparent"
                              stroke="#F59E0B"
                              strokeWidth="3"
                              strokeDasharray={`${(statsData.directReferrals / Math.max(statsData.totalReferrals, 1)) * 100} 100`}
                              strokeDashoffset="0"
                            />
                            {/* Tier 1 (blue) */}
                            <circle
                              cx="18" cy="18" r="15.9" fill="transparent"
                              stroke="#3B82F6"
                              strokeWidth="3"
                              strokeDasharray={`${(statsData.tier1Referrals / Math.max(statsData.totalReferrals, 1)) * 100} 100`}
                              strokeDashoffset={`${-((statsData.directReferrals / Math.max(statsData.totalReferrals, 1)) * 100)}`}
                            />
                            {/* Tier 2 (purple) */}
                            <circle
                              cx="18" cy="18" r="15.9" fill="transparent"
                              stroke="#8B5CF6"
                              strokeWidth="3"
                              strokeDasharray={`${(statsData.tier2Referrals / Math.max(statsData.totalReferrals, 1)) * 100} 100`}
                              strokeDashoffset={`${-(((statsData.directReferrals + statsData.tier1Referrals) / Math.max(statsData.totalReferrals, 1)) * 100)}`}
                            />
                            {/* Tier 3+4 (teal) */}
                            <circle
                              cx="18" cy="18" r="15.9" fill="transparent"
                              stroke="#14B8A6"
                              strokeWidth="3"
                              strokeDasharray={`${((statsData.tier3Referrals + statsData.tier4Referrals) / Math.max(statsData.totalReferrals, 1)) * 100} 100`}
                              strokeDashoffset={`${-(((statsData.directReferrals + statsData.tier1Referrals + statsData.tier2Referrals) / Math.max(statsData.totalReferrals, 1)) * 100)}`}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-2xl font-bold text-white">{statsData.totalReferrals}</span>
                          </div>
                        </div>
                        {/* Legend */}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-amber-500" />
                              <span className="text-neutral-400 text-sm">Direct</span>
                            </div>
                            <span className="text-white font-bold">{statsData.directReferrals}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-blue-500" />
                              <span className="text-neutral-400 text-sm">Tier 1</span>
                            </div>
                            <span className="text-white font-bold">{statsData.tier1Referrals}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-purple-500" />
                              <span className="text-neutral-400 text-sm">Tier 2</span>
                            </div>
                            <span className="text-white font-bold">{statsData.tier2Referrals}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-teal-500" />
                              <span className="text-neutral-400 text-sm">Tier 3-4</span>
                            </div>
                            <span className="text-white font-bold">{statsData.tier3Referrals + statsData.tier4Referrals}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Placeholder when no referrals */}
                      <div className="h-48 flex items-center justify-center">
                        <div className="w-32 h-32 rounded-full border-8 border-neutral-800 relative">
                          <div className="absolute inset-0 rounded-full border-8 border-emerald-500/30" style={{ clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0 100%)' }} />
                        </div>
                      </div>
                      {/* Locked overlay */}
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                        <div className="flex items-center gap-2 px-4 py-2 bg-neutral-800 rounded-lg border border-neutral-700">
                          <FiLock className="w-4 h-4 text-neutral-400" />
                          <span className="text-neutral-300 text-sm">Unlock by referring users</span>
                        </div>
                      </div>
                    </>
                  )}
                </Card>

                {/* SOL Rewards Breakdown - Unlocks when user has earned SOL */}
                <Card className="p-6 relative overflow-hidden">
                  <h3 className="text-white font-bold text-sm uppercase mb-4">SOL Rewards Breakdown</h3>
                  {statsData.totalEarnedRewards > 0 ? (
                    <>
                      {/* Unlocked: Show detailed rewards breakdown */}
                      <div className="space-y-4">
                        {/* Stats row - 3 columns */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-neutral-900/50 rounded-lg p-3">
                            <p className="text-neutral-500 text-xs mb-1">Total Earned</p>
                            <p className="text-emerald-400 font-bold text-lg">{statsData.totalEarnedRewards.toFixed(4)}</p>
                          </div>
                          <div className="bg-neutral-900/50 rounded-lg p-3">
                            <p className="text-neutral-500 text-xs mb-1">Claimed</p>
                            <p className="text-white font-bold text-lg">{statsData.claimedSolRewards.toFixed(4)}</p>
                          </div>
                          <div className="bg-neutral-900/50 rounded-lg p-3">
                            <p className="text-neutral-500 text-xs mb-1">Pending</p>
                            <p className="text-amber-400 font-bold text-lg">{statsData.pendingSolRewards.toFixed(4)}</p>
                          </div>
                        </div>

                        {/* Rewards by Tier - Bar chart */}
                        <div className="space-y-2.5 pt-2">
                          <p className="text-neutral-500 text-xs uppercase tracking-wide">Earnings by Tier</p>
                          {/* Direct Referrals */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                <span className="text-neutral-400">Direct Refs</span>
                              </div>
                              <span className="text-white font-medium">{(statsData.totalEarnedRewards * 0.55).toFixed(4)} SOL</span>
                            </div>
                            <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full" style={{ width: '55%' }} />
                            </div>
                          </div>
                          {/* Tier 1 */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                                <span className="text-neutral-400">Tier 1</span>
                              </div>
                              <span className="text-white font-medium">{(statsData.totalEarnedRewards * 0.22).toFixed(4)} SOL</span>
                            </div>
                            <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full" style={{ width: '22%' }} />
                            </div>
                          </div>
                          {/* Tier 2 */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                                <span className="text-neutral-400">Tier 2</span>
                              </div>
                              <span className="text-white font-medium">{(statsData.totalEarnedRewards * 0.13).toFixed(4)} SOL</span>
                            </div>
                            <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full" style={{ width: '13%' }} />
                            </div>
                          </div>
                          {/* Tier 3-4 */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                                <span className="text-neutral-400">Tier 3-4</span>
                              </div>
                              <span className="text-white font-medium">{(statsData.totalEarnedRewards * 0.10).toFixed(4)} SOL</span>
                            </div>
                            <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-teal-600 to-teal-400 rounded-full" style={{ width: '10%' }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Placeholder when no SOL earned */}
                      <div className="h-48 flex items-center justify-center">
                        <div className="w-full h-32 flex items-end justify-between gap-1 px-4">
                          {[20, 35, 25, 45, 60, 55, 70].map((h, i) => (
                            <div key={i} className="flex-1 bg-emerald-500/30 rounded-t" style={{ height: `${h}%` }} />
                          ))}
                        </div>
                      </div>
                      {/* Locked overlay */}
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                        <div className="flex items-center gap-2 px-4 py-2 bg-neutral-800 rounded-lg border border-neutral-700">
                          <FiLock className="w-4 h-4 text-neutral-400" />
                          <span className="text-neutral-300 text-sm">Unlock by earning SOL rewards</span>
                        </div>
                      </div>
                    </>
                  )}
                </Card>
              </div>
            </div>

            {/* All Referrals Table */}
            <Card className="mb-6 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800/50">
                <div className="flex items-center gap-3">
                  <h3 className="text-white font-bold text-base">All Referrals</h3>
                  <span className="text-neutral-500 text-sm">({allReferrals?.total || 0} total)</span>
                </div>
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                  <input
                    type="text"
                    placeholder="Search Refs"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-transparent border border-neutral-700/60 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-neutral-500 w-40"
                  />
                </div>
              </div>

              {/* Table with fixed height */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-neutral-900/90 backdrop-blur-sm z-10">
                    <tr>
                      <th className="text-left py-3 px-5 text-neutral-400 text-sm font-medium">User</th>
                      <th className="text-left py-3 px-5 text-neutral-400 text-sm font-medium">Date Joined</th>
                      <th className="text-left py-3 px-5 text-neutral-400 text-sm font-medium">Volume</th>
                      <th className="text-left py-3 px-5 text-neutral-400 text-sm font-medium">Referral Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allReferrals?.referrals && allReferrals.referrals.length > 0 ? (
                      allReferrals.referrals.map((ref: any) => (
                        <tr key={ref.id} className="border-b border-neutral-800/30 hover:bg-neutral-800/20 transition-colors">
                          <td className="py-3 px-5">
                            <div className="flex flex-col">
                              <span className="text-white">{ref.name}</span>
                              {ref.username && <span className="text-neutral-500 text-xs">@{ref.username}</span>}
                            </div>
                          </td>
                          <td className="py-3 px-5 text-neutral-400">{new Date(ref.joinedAt).toLocaleDateString()}</td>
                          <td className="py-3 px-5 text-neutral-400">${ref.totalVolume?.toLocaleString() || '0'}</td>
                          <td className="py-3 px-5">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              ref.tier === 0 ? 'bg-amber-500/20 text-amber-400' :
                              ref.tier === 1 ? 'bg-blue-500/20 text-blue-400' :
                              ref.tier === 2 ? 'bg-purple-500/20 text-purple-400' :
                              'bg-teal-500/20 text-teal-400'
                            }`}>
                              {ref.tierLabel}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-neutral-500">
                          No referrals found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-800/50">
                  <span className="text-neutral-500 text-sm">
                    Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, allReferrals?.total || 0)} of {allReferrals?.total || 0}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg border border-neutral-700/60 text-neutral-400 hover:bg-neutral-800/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <FiChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1">
                      {/* Show page numbers */}
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                              currentPage === pageNum
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                : 'text-neutral-400 hover:bg-neutral-800/50'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg border border-neutral-700/60 text-neutral-400 hover:bg-neutral-800/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </Card>

            {/* FAQs */}
            <div className="mb-6">
              <div className="mb-4">
                <h2 className="text-white font-bold text-lg">Referral FAQs</h2>
                <p className="text-neutral-500 text-sm">
                  More Questions? <a href="#" className="text-white underline hover:no-underline">Chat with Support</a> or <a href="/arena" className="text-white underline hover:no-underline">View Arena Intro</a>
                </p>
              </div>

              <div className="space-y-2">
                {faqs.map((faq, idx) => (
                  <div key={idx} className="border-b border-neutral-800">
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                      className="w-full flex items-center justify-between py-4 text-left"
                    >
                      <span className="text-white font-medium">{faq.q}</span>
                      <span className="text-neutral-500 text-xl">{expandedFaq === idx ? '−' : '+'}</span>
                    </button>
                    {expandedFaq === idx && (
                      <div className="pb-4 text-neutral-400 text-sm">
                        {faq.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
      `}</style>

      {/* Username Edit Modal */}
      <UsernameEditModal
        isOpen={isUsernameModalOpen}
        onClose={() => setIsUsernameModalOpen(false)}
        currentUsername={user?.name || null}
        onSuccess={(newUsername) => {
          // Refresh data after username update
          refetch();
        }}
      />
    </>
  );
}
