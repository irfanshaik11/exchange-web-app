/**
 * Leaderboard Page
 *
 * Premium Trojan Arena style interface with podium, rankings table,
 * jackpot banner, and competitive features.
 */

import React, { useState, useMemo, useEffect } from 'react';
import Head from 'next/head';
import Header from '~/components/Header';
import Footer from '~/components/Footer';
import { useUser } from '~/components/UserContext';
import { useLeaderboardPageData, useArenaStats } from '~/hooks/useArena';

// React Icons
import { GiCoins, GiSpartanHelmet, GiTrophy } from 'react-icons/gi';
import { FiSearch, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { IoRocketSharp } from 'react-icons/io5';

type LeaderboardType = 'gold' | 'quests';
type LeaderboardPeriod = 'DAILY' | 'MONTHLY' | 'LIFETIME';

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

// Card component
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-[#0a0a0a]/90 backdrop-blur-sm border border-neutral-800/80 rounded-xl ${className}`}>
    {children}
  </div>
);

// Gold coin icon
const GoldCoin = ({ className = '' }: { className?: string }) => (
  <GiCoins className={`${className} text-amber-400`} />
);

// Rank badge component with hexagonal frame
const RankBadge = ({ rank, size = 'md', variant = 'default' }: { rank: string; size?: 'sm' | 'md' | 'lg'; variant?: 'gold' | 'silver' | 'bronze' | 'default' }) => {
  const sizes = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-20 h-20' };
  const iconSizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };

  const colors = {
    gold: { bg: 'bg-gradient-to-br from-amber-400 to-amber-600', border: 'border-amber-300', icon: 'text-amber-900' },
    silver: { bg: 'bg-gradient-to-br from-slate-300 to-slate-500', border: 'border-slate-200', icon: 'text-slate-700' },
    bronze: { bg: 'bg-gradient-to-br from-amber-600 to-amber-800', border: 'border-amber-500', icon: 'text-amber-200' },
    default: { bg: 'bg-neutral-800', border: 'border-neutral-600', icon: 'text-neutral-400' },
  };

  const c = colors[variant];

  return (
    <div className={`relative ${sizes[size]} flex items-center justify-center`}>
      <div className={`absolute inset-0 ${c.bg} ${c.border} border-2 rounded-lg rotate-45`} />
      <GiSpartanHelmet className={`${iconSizes[size]} ${c.icon} relative z-10`} />
    </div>
  );
};

// Get rank color based on rank name
const getRankColor = (rank: string) => {
  if (rank?.toLowerCase().includes('titan')) return 'text-amber-400';
  if (rank?.toLowerCase().includes('commander')) return 'text-orange-400';
  if (rank?.toLowerCase().includes('gladiator')) return 'text-emerald-400';
  if (rank?.toLowerCase().includes('warrior')) return 'text-cyan-400';
  return 'text-neutral-400';
};

// Countdown timer component
const CountdownTimer = ({ targetTime }: { targetTime: Date }) => {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculate = () => {
      const now = new Date().getTime();
      const target = targetTime.getTime();
      const diff = Math.max(0, target - now);

      setTimeLeft({
        hours: Math.floor(diff / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return (
    <div className="flex items-center gap-2 text-white">
      <span className="font-bold text-lg">{String(timeLeft.hours).padStart(2, '0')}</span>
      <span className="text-neutral-500 text-sm">Hours</span>
      <span className="font-bold text-lg">{String(timeLeft.minutes).padStart(2, '0')}</span>
      <span className="text-neutral-500 text-sm">Minutes</span>
      <span className="font-bold text-lg">{String(timeLeft.seconds).padStart(2, '0')}</span>
      <span className="text-neutral-500 text-sm">Seconds</span>
    </div>
  );
};

export default function LeaderboardPage() {
  const { user } = useUser();
  const [type, setType] = useState<LeaderboardType>('gold');
  const [period, setPeriod] = useState<LeaderboardPeriod>('DAILY');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const pageSize = 50;

  const { leaderboard, position, top3 } = useLeaderboardPageData(type, period, {
    limit: pageSize,
    offset: (page - 1) * pageSize,
    search: search || undefined,
  });
  const { data: arenaStats } = useArenaStats();

  const nextResetTime = useMemo(() => {
    if (period === 'LIFETIME') return null;
    const now = new Date();
    return period === 'DAILY'
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }, [period]);

  // Mock top 3 data for display
  const top3Data = top3.data || [];
  const leaderboardEntries = leaderboard.data?.entries || [];
  const totalEntries = leaderboard.data?.total || 0;
  const totalPages = Math.ceil(totalEntries / pageSize);

  // Prize amounts
  const getPrize = (pos: number) => {
    if (period === 'LIFETIME') return 0;
    const prizes = period === 'DAILY'
      ? { 1: 1000, 2: 900, 3: 800, 4: 700, 5: 700, 6: 700, 7: 700, 8: 700, 9: 700, 10: 700 }
      : { 1: 10000, 2: 8000, 3: 6000, 4: 4000, 5: 4000, 6: 4000, 7: 4000, 8: 4000, 9: 4000, 10: 4000 };
    if (pos <= 10) return prizes[pos as keyof typeof prizes] || 700;
    if (pos <= 50) return period === 'DAILY' ? 500 : 2500;
    if (pos <= 100) return period === 'DAILY' ? 350 : 1500;
    if (pos <= 500) return period === 'DAILY' ? 200 : 800;
    if (pos <= 1000) return period === 'DAILY' ? 100 : 500;
    if (pos <= 2500) return period === 'DAILY' ? 50 : 300;
    return 0;
  };

  const faqs = [
    { q: 'How Does The Leaderboard Work?', a: 'The leaderboard ranks users by Gold earned (Gold Leaderboard) or quests completed (Quest Leaderboard). Rankings reset daily at midnight UTC for daily boards and on the 1st of each month for monthly boards.' },
    { q: 'Want to keep it stealth?', a: 'Enable anonymous mode in your Arena settings to hide your username on the leaderboard. Your stats will still count, but others will see ******* instead of your name.' },
    { q: 'How Is The Gold Calculated?', a: 'Gold is earned through trading activity, quest completion, trading streaks, and rank-up bonuses. Your Gold multiplier increases with your Arena rank.' },
  ];

  return (
    <>
      <Head>
        <title>Leaderboard | Interstate Arena</title>
        <meta name="description" content="Compete for Gold prizes on the Interstate Arena leaderboard." />
      </Head>

      <div className="min-h-screen relative overflow-x-hidden">
        <SpaceBackground />

        <div className="relative z-10">
          <Header />

          <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-24">
            {/* Page Title */}
            <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white text-center mb-8">
              LEADERBOARD
            </h1>

            {/* Header Tabs - Three sections: Gold Toggle | Period Selector | Quest Toggle */}
            <div className="flex items-center justify-center mb-6">
              <div className="inline-flex items-center bg-neutral-900/80 backdrop-blur-sm rounded-full border border-neutral-700/50 p-1 gap-1">
                {/* Gold Leaderboard Toggle */}
                <button
                  onClick={() => setType('gold')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                    type === 'gold'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'text-neutral-400 hover:text-neutral-300'
                  }`}
                >
                  <GoldCoin className="w-5 h-5" />
                  <span className="font-bold">Gold Leaderboard</span>
                </button>

                {/* Period Tabs - Always in center */}
                <div className="flex items-center gap-1 px-3 border-l border-r border-neutral-700/50">
                  {(['DAILY', 'MONTHLY', 'LIFETIME'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => { setPeriod(p); setPage(1); }}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors rounded ${
                        period === p ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>

                {/* Quest Leaderboard Toggle */}
                <button
                  onClick={() => setType('quests')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                    type === 'quests'
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : 'text-neutral-400 hover:text-neutral-300'
                  }`}
                >
                  <IoRocketSharp className="w-5 h-5" />
                  <span className="font-bold">Quest Leaderboard</span>
                </button>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white text-center mb-8">
              LEADERBOARD
            </h1>

            {/* Top 3 Podium */}
            {top3Data.length >= 3 && (
              <div className="flex items-end justify-center gap-8 mb-8">
                {/* #2 - Silver (left) */}
                <div className="text-center">
                  <RankBadge rank="silver" size="lg" variant="silver" />
                  <p className="text-white font-bold mt-3">@{top3Data[1]?.userName || '---'}</p>
                  <p className={`text-sm ${getRankColor(top3Data[1]?.rank)}`}>
                    <GiTrophy className="inline w-4 h-4 mr-1" />
                    {top3Data[1]?.rank || 'Degen'} {top3Data[1]?.rankLevel || 'I'}
                  </p>
                  <div className="mt-3 px-4 py-2 bg-neutral-800/80 rounded-lg border border-neutral-700">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-1">
                        {type === 'gold' ? (
                          <GoldCoin className="w-4 h-4" />
                        ) : (
                          <IoRocketSharp className="w-4 h-4 text-orange-400" />
                        )}
                        <span className={type === 'gold' ? 'text-amber-400 font-bold' : 'text-orange-400 font-bold'}>
                          {type === 'gold'
                            ? (top3Data[1]?.goldEarned || 0).toLocaleString()
                            : top3Data[1]?.questsCompleted || 0}
                        </span>
                      </div>
                      <span className="text-neutral-400">+{getPrize(2)}</span>
                      <GoldCoin className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* #1 - Gold (center, elevated) */}
                <div className="text-center -mt-8">
                  <RankBadge rank="gold" size="lg" variant="gold" />
                  <p className="text-white font-bold mt-3">@{top3Data[0]?.userName || '---'}</p>
                  <p className={`text-sm ${getRankColor(top3Data[0]?.rank)}`}>
                    <GiTrophy className="inline w-4 h-4 mr-1" />
                    {top3Data[0]?.rank || 'Degen'} {top3Data[0]?.rankLevel || 'I'}
                  </p>
                  <div className="mt-3 px-4 py-2 bg-amber-500/20 rounded-lg border border-amber-500/40">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-1">
                        {type === 'gold' ? (
                          <GoldCoin className="w-4 h-4" />
                        ) : (
                          <IoRocketSharp className="w-4 h-4 text-orange-400" />
                        )}
                        <span className={type === 'gold' ? 'text-amber-400 font-bold' : 'text-orange-400 font-bold'}>
                          {type === 'gold'
                            ? (top3Data[0]?.goldEarned || 0).toLocaleString()
                            : top3Data[0]?.questsCompleted || 0}
                        </span>
                      </div>
                      <span className="text-amber-300">+{getPrize(1).toLocaleString()}</span>
                      <GoldCoin className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* #3 - Bronze (right) */}
                <div className="text-center">
                  <RankBadge rank="bronze" size="lg" variant="bronze" />
                  <p className="text-white font-bold mt-3">@{top3Data[2]?.userName || '---'}</p>
                  <p className={`text-sm ${getRankColor(top3Data[2]?.rank)}`}>
                    <GiTrophy className="inline w-4 h-4 mr-1" />
                    {top3Data[2]?.rank || 'Degen'} {top3Data[2]?.rankLevel || 'I'}
                  </p>
                  <div className="mt-3 px-4 py-2 bg-amber-700/20 rounded-lg border border-amber-600/40">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-1">
                        {type === 'gold' ? (
                          <GoldCoin className="w-4 h-4" />
                        ) : (
                          <IoRocketSharp className="w-4 h-4 text-orange-400" />
                        )}
                        <span className={type === 'gold' ? 'text-amber-400 font-bold' : 'text-orange-400 font-bold'}>
                          {type === 'gold'
                            ? (top3Data[2]?.goldEarned || 0).toLocaleString()
                            : top3Data[2]?.questsCompleted || 0}
                        </span>
                      </div>
                      <span className="text-amber-500">+{getPrize(3)}</span>
                      <GoldCoin className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Countdown Timer */}
            {nextResetTime && (
              <div className="text-center mb-6">
                <p className="text-neutral-400 text-sm uppercase tracking-wider font-bold mb-2">
                  {period} Leaderboard Resets In
                </p>
                <CountdownTimer targetTime={nextResetTime} />
              </div>
            )}

            {/* Your Position Bar */}
            {user && (
              <Card className="p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-neutral-500 font-medium">
                      {position.data?.position ? `#${position.data.position}` : 'Not Placed'}
                    </span>
                    <span className="text-white font-bold">You ({user.name})</span>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="flex items-center gap-2">
                      <RankBadge rank={(arenaStats as any)?.rank || 'Degen'} size="sm" />
                      <span className="text-neutral-400">{(arenaStats as any)?.rank || 'Degen'} {(arenaStats as any)?.rankLevel || 'I'}</span>
                    </div>
                    {type === 'gold' ? (
                      <div className="flex items-center gap-1">
                        <GoldCoin className="w-4 h-4" />
                        <span className="text-amber-400">{position.data?.value?.toLocaleString() || '0'}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <IoRocketSharp className="w-4 h-4 text-orange-400" />
                        <span className="text-orange-400">{position.data?.value || 0}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <GoldCoin className="w-4 h-4" />
                      <span className="text-amber-400">+{position.data?.prize || 0}</span>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Jackpot Banner */}
            <div className="relative mb-6 rounded-xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-600/80 via-amber-500/60 to-amber-600/80" />
              <div
                className="absolute inset-0 bg-cover bg-center opacity-30"
                style={{ backgroundImage: 'url(https://wallpapercave.com/wp/wp8955056.jpg)' }}
              />
              <div className="relative flex items-center justify-between p-6">
                <div>
                  <h3 className="text-white font-black text-2xl">$2,159.08 DAILY JACKPOT NOW LIVE</h3>
                  <p className="text-amber-100">Turn Your Gold Into Huge Solana Rewards!</p>
                </div>
                <button className="px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold rounded-lg transition-colors">
                  Enter The Jackpot
                </button>
              </div>
            </div>

            {/* Rankings Table */}
            <Card className="p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className={type === 'gold' ? 'text-amber-400 font-bold' : 'text-white font-bold'}>
                  {type === 'gold' ? 'Gold Ranks' : 'Quest Ranks'}
                </h3>
                <div className="flex items-center gap-3">
                  <button className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg transition-colors border border-neutral-700">
                    Show Your Position
                  </button>
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                    <input
                      type="text"
                      placeholder="Search User"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                      className="pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                    />
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-800">
                      <th className="text-left py-3 px-4 text-neutral-500 text-sm font-medium">Place</th>
                      <th className="text-left py-3 px-4 text-neutral-500 text-sm font-medium">User</th>
                      <th className="text-left py-3 px-4 text-neutral-500 text-sm font-medium">Arena Rank</th>
                      {type === 'gold' ? (
                        <>
                          <th className="text-left py-3 px-4 text-neutral-500 text-sm font-medium">SOL Earned</th>
                          <th className="text-left py-3 px-4 text-neutral-500 text-sm font-medium">Gold Claimed</th>
                        </>
                      ) : (
                        <th className="text-left py-3 px-4 text-neutral-500 text-sm font-medium">Quests Completed</th>
                      )}
                      <th className="text-left py-3 px-4 text-neutral-500 text-sm font-medium">Prizes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardEntries.length > 0 ? (
                      leaderboardEntries.map((entry: any, idx: number) => {
                        const pos = (page - 1) * pageSize + idx + 1;
                        return (
                          <tr key={entry.userId || idx} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
                            <td className="py-3 px-4 text-neutral-500">#{pos}</td>
                            <td className="py-3 px-4 text-white font-medium">
                              @{entry.isAnonymous ? '*******' : entry.userName}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <RankBadge rank={entry.rank} size="sm" />
                                <span className={getRankColor(entry.rank)}>
                                  {entry.rank} {entry.rankLevel}
                                </span>
                              </div>
                            </td>
                            {type === 'gold' ? (
                              <>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-1">
                                    <span className="text-purple-400">≡</span>
                                    <span className="text-white">{(entry.solEarned || 0).toFixed(4)} SOL</span>
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-1">
                                    <GoldCoin className="w-4 h-4" />
                                    <span className="text-amber-400 font-bold">
                                      {entry.goldEarned >= 1000
                                        ? `${(entry.goldEarned / 1000).toFixed(1)}K`
                                        : entry.goldEarned?.toLocaleString() || '0'}
                                    </span>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1">
                                  <IoRocketSharp className="w-4 h-4 text-orange-400" />
                                  <span className="text-orange-400 font-bold">
                                    {entry.questsCompleted || 0}
                                  </span>
                                </div>
                              </td>
                            )}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1">
                                <GoldCoin className="w-4 h-4" />
                                <span className="text-amber-400 font-bold">+{getPrize(pos).toLocaleString()}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={type === 'gold' ? 6 : 5} className="py-8 text-center text-neutral-500">
                          No results found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    className="px-3 py-2 text-neutral-500 hover:text-white disabled:opacity-30"
                  >
                    «
                  </button>
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-3 py-2 text-neutral-500 hover:text-white disabled:opacity-30"
                  >
                    <FiChevronLeft />
                  </button>

                  {/* Page numbers */}
                  {Array.from({ length: Math.min(6, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 6) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 5 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-8 h-8 rounded ${
                          page === pageNum
                            ? 'bg-neutral-700 text-white'
                            : 'text-neutral-500 hover:text-white'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  {totalPages > 6 && <span className="text-neutral-500">...</span>}
                  {totalPages > 6 && (
                    <button
                      onClick={() => setPage(totalPages)}
                      className={`w-8 h-8 rounded ${
                        page === totalPages ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'
                      }`}
                    >
                      {totalPages}
                    </button>
                  )}

                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-2 text-neutral-500 hover:text-white disabled:opacity-30"
                  >
                    <FiChevronRight />
                  </button>
                  <button
                    onClick={() => setPage(totalPages)}
                    disabled={page === totalPages}
                    className="px-3 py-2 text-neutral-500 hover:text-white disabled:opacity-30"
                  >
                    »
                  </button>
                </div>
              )}
            </Card>

            {/* FAQs */}
            <div className="mb-6">
              <div className="mb-4">
                <h2 className="text-white font-bold text-lg">FAQs</h2>
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
