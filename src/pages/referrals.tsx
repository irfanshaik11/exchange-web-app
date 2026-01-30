/**
 * Referrals Page
 *
 * Premium Trojan Arena style interface matching the arena page design.
 * Features: Space background, Honors system, 5-layer referrals, quests.
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Header from '~/components/Header';
import Footer from '~/components/Footer';
import { useUser } from '~/components/UserContext';
import { useReferralsPageData, useClaimReferralRewards, useClaimQuest, useDirectReferrals } from '~/hooks/useArena';

// React Icons
import { GiMedal, GiTrophy, GiCrown, GiCoins, GiSpartanHelmet } from 'react-icons/gi';
import { FiUsers, FiCopy, FiCheck, FiEdit2, FiEye, FiLock, FiSearch, FiChevronDown, FiInfo } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi';
import { IoRocketSharp } from 'react-icons/io5';
import { BiUser } from 'react-icons/bi';

// Space background - same as arena
const SpaceBackground = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none">
    <div
      className="absolute inset-x-0 top-0 h-[70vh] bg-cover bg-top bg-no-repeat"
      style={{ backgroundImage: 'url(https://wallpapercave.com/wp/wp8955056.jpg)' }}
    />
    <div className="absolute inset-0 bg-black/50" />
    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/70 to-black" />
    <div className="absolute inset-x-0 top-1/3 bottom-0 bg-gradient-to-b from-transparent to-black" />
    <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />
  </div>
);

// Hexagonal badge for honors
const HonorsBadge = ({ level, size = 'lg', isLocked = false }: { level: number; size?: 'sm' | 'md' | 'lg'; isLocked?: boolean }) => {
  const sizes = { sm: 'w-16 h-18', md: 'w-24 h-28', lg: 'w-32 h-36' };
  const iconSizes = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-16 h-16' };

  return (
    <div className={`relative ${sizes[size]} flex items-center justify-center`}>
      {/* Hexagonal frame */}
      <svg viewBox="0 0 100 115" className="absolute inset-0 w-full h-full">
        <polygon
          points="50,2 95,28 95,87 50,113 5,87 5,28"
          fill={isLocked ? '#1a1a1a' : '#2a2a2a'}
          stroke={isLocked ? '#3a3a3a' : '#4a4a4a'}
          strokeWidth="2"
        />
        {/* Corner accents */}
        <circle cx="50" cy="8" r="3" fill={isLocked ? '#3a3a3a' : '#5a5a5a'} />
        <circle cx="90" cy="30" r="3" fill={isLocked ? '#3a3a3a' : '#5a5a5a'} />
        <circle cx="90" cy="85" r="3" fill={isLocked ? '#3a3a3a' : '#5a5a5a'} />
        <circle cx="50" cy="107" r="3" fill={isLocked ? '#3a3a3a' : '#5a5a5a'} />
        <circle cx="10" cy="85" r="3" fill={isLocked ? '#3a3a3a' : '#5a5a5a'} />
        <circle cx="10" cy="30" r="3" fill={isLocked ? '#3a3a3a' : '#5a5a5a'} />
      </svg>
      {/* Helmet icon */}
      <GiSpartanHelmet className={`${iconSizes[size]} ${isLocked ? 'text-neutral-600' : 'text-neutral-400'} relative z-10`} />
    </div>
  );
};

// Card component
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-[#0a0a0a]/90 backdrop-blur-sm border border-neutral-800/80 rounded-xl ${className}`}>
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

// Gold coin icon
const GoldCoin = ({ className = '' }: { className?: string }) => (
  <GiCoins className={`${className} text-amber-400`} />
);

export default function ReferralsPage() {
  const { user } = useUser();
  const { stats, honors, quests, refetch } = useReferralsPageData();
  const { data: directReferrals } = useDirectReferrals({ limit: 20 });
  const claimRewardsMutation = useClaimReferralRewards();
  const claimQuestMutation = useClaimQuest();
  const [copied, setCopied] = useState(false);
  const [showAllHonors, setShowAllHonors] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Mock data for display (replace with real data)
  const statsData = stats.data || {
    referralCode: user?.name || 'USER',
    referralLink: `https://interstate.com/@${user?.name || 'user'}`,
    directReferrals: 0,
    tier1Referrals: 0,
    tier2Referrals: 0,
    tier3Referrals: 0,
    tier4Referrals: 0,
    totalReferralVolume: 0,
    pendingSolRewards: 0,
    claimedSolRewards: 0,
  };

  const honorsData = honors.data || {
    currentLevel: 1,
    currentTier: {
      totalRevShare: 27.5,
      layers: [
        { layer: 'Direct Ref', percentage: 20 },
        { layer: 'Ref 1', percentage: 3 },
        { layer: 'Ref 2', percentage: 2 },
        { layer: 'Ref 3', percentage: 1.5 },
        { layer: 'Ref 4', percentage: 1 },
      ],
    },
    nextLevel: 2,
    progressToNext: {
      referralCount: { current: 0, target: 250, percentage: 0 },
      referralVolume: { current: 0, target: 5000000, percentage: 0 },
    },
  };

  // All honors tiers
  const allHonorsTiers = [
    { level: 1, name: 'HONORS I', totalRevShare: 27.5, isUnlocked: true },
    { level: 2, name: 'HONORS II', totalRevShare: 32.5, isUnlocked: false },
    { level: 3, name: 'HONORS III', totalRevShare: 42.5, isUnlocked: false },
    { level: 4, name: 'HONORS IV', totalRevShare: 50, isUnlocked: false },
  ];

  // Referral quests
  const referralRankUpQuests = [
    { id: 1, title: 'Recruit 250 traders OR Your referrals trade $5M in volume', reward: 'Honors II', type: 'honors' },
    { id: 2, title: 'Recruit 1000 traders OR Your referrals trade $20M in volume', reward: 'Honors III', type: 'honors' },
    { id: 3, title: 'Recruit 5000 traders OR Your referrals trade $100M in volume', reward: 'Honors IV', type: 'honors' },
  ];

  const referralSeasonalQuests = [
    { id: 4, title: 'Recruit 5 Warriors', reward: 10000, type: 'gold' },
    { id: 5, title: 'Recruit 5 Gladiators', reward: 15000, type: 'gold' },
    { id: 6, title: 'Recruit 2 Commanders', reward: 40000, type: 'gold' },
    { id: 7, title: 'Recruit 1 Titan', reward: 40000, type: 'gold' },
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
        <div className="min-h-screen relative overflow-x-hidden">
          <SpaceBackground />
          <div className="relative z-10">
            <Header />
            <main className="flex flex-col items-center justify-center min-h-[80vh] px-6">
              <div className="text-center">
                <GiMedal className="w-20 h-20 text-amber-400 mx-auto mb-6" />
                <h1 className="text-5xl md:text-7xl font-black tracking-tight text-white mb-4">REFERRALS</h1>
                <p className="text-neutral-400 text-lg mb-8">Build your trading network. Earn from 5 layers.</p>
                <button className="px-8 py-4 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors flex items-center gap-2 mx-auto">
                  <IoRocketSharp /> Connect Wallet
                </button>
              </div>
            </main>
            <Footer />
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

      <div className="min-h-screen relative overflow-x-hidden">
        <SpaceBackground />

        <div className="relative z-10">
          <Header />

          <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-24">
            {/* Title */}
            <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white text-center mb-8">
              REFERRALS
            </h1>

            {/* Share Your Code Bar */}
            <Card className="p-4 mb-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                {/* Left: Share info */}
                <div>
                  <h3 className="text-white font-bold text-sm mb-1">SHARE YOUR CODE</h3>
                  <p className="text-neutral-500 text-xs">Referrals get counted after their first trade.</p>
                </div>

                {/* Center: Referral link */}
                <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-2">
                  <span className="text-neutral-300 text-sm font-mono">{statsData.referralLink}</span>
                  <button
                    onClick={() => handleCopyLink(statsData.referralLink)}
                    className="p-1.5 hover:bg-neutral-800 rounded transition-colors"
                  >
                    {copied ? <FiCheck className="w-4 h-4 text-emerald-400" /> : <FiCopy className="w-4 h-4 text-neutral-400" />}
                  </button>
                  <button className="p-1.5 hover:bg-neutral-800 rounded transition-colors">
                    <FiEdit2 className="w-4 h-4 text-neutral-400" />
                  </button>
                  <button className="p-1.5 hover:bg-neutral-800 rounded transition-colors">
                    <FiEye className="w-4 h-4 text-neutral-400" />
                  </button>
                </div>

                {/* Right: Stats */}
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-neutral-500 text-xs">Gold earned</p>
                    <div className="flex items-center gap-1 justify-end">
                      <GoldCoin className="w-4 h-4" />
                      <span className="text-white font-bold">0</span>
                      <span className="text-neutral-500">(0)</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-neutral-500 text-xs">SOL earned</p>
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-purple-400">≡</span>
                      <span className="text-white font-bold">0 SOL</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Boost Banner */}
            <Card className="p-4 mb-6 border-amber-500/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-neutral-800 rounded-xl flex items-center justify-center border border-neutral-700">
                    <GiMedal className="w-7 h-7 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-neutral-400 text-xs uppercase tracking-wider">Boost your refs to 42.5%</p>
                    <p className="text-white font-black text-xl">
                      CLAIM <span className="text-amber-400">HONORS III</span>
                    </p>
                  </div>
                </div>
                <button className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-lg border border-neutral-600 transition-colors">
                  Claim Your Boost
                </button>
              </div>
            </Card>

            {/* Main Two-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Left: Honors Card */}
              <Card className="p-6">
                <div className="flex flex-col items-center mb-6">
                  <HonorsBadge level={honorsData.currentLevel} size="lg" />
                  <p className="text-neutral-500 text-xs uppercase tracking-wider mt-4">DEGEN</p>
                  <h2 className="text-white font-black text-2xl">HONORS {['I', 'II', 'III', 'IV'][honorsData.currentLevel - 1]}</h2>
                </div>

                {/* Rev Share */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-neutral-800">
                  <span className="text-white font-bold">Total Rev Share</span>
                  <span className="text-emerald-400 font-bold text-xl">{honorsData.currentTier.totalRevShare}%</span>
                </div>

                {/* Layer Breakdown */}
                <div className="space-y-3">
                  {[
                    { label: 'Direct Ref:', icons: 1, percentage: '20%' },
                    { label: 'Ref 1:', icons: 2, percentage: '3%' },
                    { label: 'Ref 2:', icons: 3, percentage: '2%' },
                    { label: 'Ref 3:', icons: 4, percentage: '1.5%' },
                    { label: 'Ref 4:', icons: 5, percentage: '1%' },
                  ].map((layer, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-neutral-400 text-sm">{layer.label}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-1">
                          {Array.from({ length: layer.icons }).map((_, i) => (
                            <BiUser key={i} className="w-4 h-4 text-neutral-500" />
                          ))}
                        </div>
                        <span className="text-white font-bold text-sm w-12 text-right">{layer.percentage}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Hide Ranks Button */}
                <button
                  onClick={() => setShowAllHonors(!showAllHonors)}
                  className="w-full mt-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-lg transition-colors"
                >
                  {showAllHonors ? 'Hide Ranks' : 'Show Ranks'}
                </button>
              </Card>

              {/* Right: Quests */}
              <div className="space-y-6">
                {/* Rank-Up Quests */}
                <Card className="p-6">
                  <h3 className="text-white font-bold mb-4">Referral Rank-Up Quests</h3>
                  <div className="space-y-3">
                    {referralRankUpQuests.map((quest) => (
                      <div key={quest.id} className="flex items-center justify-between p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full border-2 border-neutral-600" />
                          <span className="text-neutral-300 text-sm">{quest.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <GiMedal className="w-4 h-4 text-amber-400" />
                          <span className="text-white font-bold text-sm">{quest.reward}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Seasonal Quests */}
                <Card className="p-6">
                  <h3 className="text-white font-bold mb-4">Referral Seasonal Quests</h3>
                  <div className="space-y-3">
                    {referralSeasonalQuests.map((quest) => (
                      <div key={quest.id} className="flex items-center justify-between p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full border-2 border-neutral-600" />
                          <span className="text-neutral-300 text-sm">{quest.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <GoldCoin className="w-4 h-4" />
                          <span className="text-amber-400 font-bold text-sm">{quest.reward.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>

            {/* Honors Carousel */}
            {showAllHonors && (
              <Card className="p-6 mb-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {allHonorsTiers.map((tier, idx) => (
                    <div key={idx} className="text-center p-4 border border-neutral-800 rounded-xl">
                      <HonorsBadge level={tier.level} size="md" isLocked={!tier.isUnlocked && tier.level !== honorsData.currentLevel} />
                      <p className="text-neutral-500 text-xs uppercase mt-2">DEGEN</p>
                      <h4 className="text-white font-bold">{tier.name}</h4>
                      {tier.level === honorsData.currentLevel ? (
                        <span className="inline-block mt-2 px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full border border-emerald-500/30">
                          Current Rank
                        </span>
                      ) : !tier.isUnlocked ? (
                        <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-neutral-800 text-neutral-500 text-xs font-medium rounded-full">
                          <FiLock className="w-3 h-3" /> Locked
                        </span>
                      ) : null}
                      <p className="text-neutral-400 text-sm mt-2">
                        Total Rev Share: <span className="text-white font-bold">{tier.totalRevShare}%</span>
                      </p>
                    </div>
                  ))}
                  {/* Spartan Partner */}
                  <div className="text-center p-4 border border-amber-500/30 rounded-xl bg-amber-500/5">
                    <div className="w-24 h-28 mx-auto flex items-center justify-center">
                      <GiCrown className="w-12 h-12 text-amber-400" />
                    </div>
                    <p className="text-amber-400 text-xs uppercase mt-2">SPARTAN</p>
                    <h4 className="text-white font-bold">PARTNER</h4>
                    <button className="mt-2 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium rounded-full transition-colors">
                      Get In Touch
                    </button>
                    <p className="text-neutral-400 text-sm mt-2">Custom Rev Share</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Rewards Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* SOL Rewards */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-emerald-400 font-black text-lg">SOL REWARDS</h3>
                    <p className="text-neutral-500 text-sm">Earned Through Referrals and Trading Rewards</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
                  <div>
                    <p className="text-neutral-400 text-sm">Available SOL</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-purple-400 text-xl">≡</span>
                      <span className="text-white font-bold text-2xl">{statsData.pendingSolRewards.toFixed(4)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => claimRewardsMutation.mutate()}
                    disabled={statsData.pendingSolRewards <= 0 || claimRewardsMutation.isPending}
                    className="px-6 py-3 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                  >
                    {claimRewardsMutation.isPending ? 'Claiming...' : 'Claim'}
                  </button>
                </div>
              </Card>

              {/* Gold Rewards */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-amber-400 font-black text-lg">GOLD REWARDS</h3>
                    <p className="text-neutral-500 text-sm">Earned Through Quests, Rank Ups and more</p>
                  </div>
                  <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-xs font-bold rounded border border-amber-500/30">
                    1x Gold Boost
                  </span>
                </div>
                <div className="flex items-center justify-between p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
                  <div>
                    <p className="text-neutral-400 text-sm">Available Gold</p>
                    <div className="flex items-center gap-2 mt-1">
                      <GoldCoin className="w-6 h-6" />
                      <span className="text-white font-bold text-2xl">0</span>
                    </div>
                  </div>
                  <button
                    disabled
                    className="px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors"
                  >
                    Claim
                  </button>
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
                {/* Rank Breakdown */}
                <Card className="p-6 relative overflow-hidden">
                  <h3 className="text-white font-bold text-sm uppercase mb-4">Rank Breakdown</h3>
                  <div className="h-48 flex items-center justify-center">
                    {/* Placeholder chart */}
                    <div className="w-32 h-32 rounded-full border-8 border-neutral-800 relative">
                      <div className="absolute inset-0 rounded-full border-8 border-emerald-500/30" style={{ clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0 100%)' }} />
                    </div>
                  </div>
                  {/* Locked overlay */}
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex items-center gap-2 px-4 py-2 bg-neutral-800 rounded-lg border border-neutral-700">
                      <FiLock className="w-4 h-4 text-neutral-400" />
                      <span className="text-neutral-300 text-sm">Unlock rank data by referring users</span>
                    </div>
                  </div>
                </Card>

                {/* SOL Rewards Breakdown */}
                <Card className="p-6 relative overflow-hidden">
                  <h3 className="text-white font-bold text-sm uppercase mb-4">SOL Rewards Breakdown</h3>
                  <div className="h-48 flex items-center justify-center">
                    {/* Placeholder chart */}
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
                      <span className="text-neutral-300 text-sm">Unlock Rewards Breakdown by Earning SOL</span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            {/* Direct Referrals Table */}
            <Card className="p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold">Direct Referrals</h3>
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                  <input
                    type="text"
                    placeholder="Search Refs"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-800">
                      <th className="text-left py-3 px-4 text-neutral-500 text-sm font-medium">User</th>
                      <th className="text-left py-3 px-4 text-neutral-500 text-sm font-medium">Date Joined</th>
                      <th className="text-left py-3 px-4 text-neutral-500 text-sm font-medium">Arena Rank</th>
                      <th className="text-left py-3 px-4 text-neutral-500 text-sm font-medium">Referral Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {directReferrals?.referrals && directReferrals.referrals.length > 0 ? (
                      directReferrals.referrals.map((ref: any) => (
                        <tr key={ref.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
                          <td className="py-3 px-4 text-white">{ref.name}</td>
                          <td className="py-3 px-4 text-neutral-400">{new Date(ref.createdAt).toLocaleDateString()}</td>
                          <td className="py-3 px-4 text-neutral-400">{ref.rank}</td>
                          <td className="py-3 px-4 text-neutral-400">Direct</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-neutral-500">
                          No results found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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

          <Footer />
        </div>
      </div>
    </>
  );
}
