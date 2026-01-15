/**
 * Admin Dashboard - Command Center
 * Real-time platform metrics with daily signup tracking
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  HiUsers,
  HiTrendingUp,
  HiSwitchHorizontal,
  HiUserGroup,
  HiRefresh,
  HiChartBar,
  HiCalendar,
} from 'react-icons/hi';
import {
  FaTrophy,
  FaMedal,
  FaAward,
  FaHashtag,
} from 'react-icons/fa';
import AdminLayout from '~/components/admin/AdminLayout';
import StatCard from '~/components/admin/StatCard';
import AnimatedCounter from '~/components/admin/AnimatedCounter';
import LiveActivityFeed from '~/components/admin/LiveActivityFeed';
import { useAdminPolling } from '~/hooks/useAdminWebSocket';

interface DailySignup {
  date: string;
  count: number;
}

// Daily signups chart component
const DailySignupsChart: React.FC<{
  data: DailySignup[];
  className?: string;
}> = ({ data, className = '' }) => {
  if (!data || data.length === 0) {
    return (
      <div className={`rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 border border-neutral-800/50 p-6 ${className}`}>
        <div className="flex items-center gap-2 mb-4">
          <HiCalendar className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-white">Daily Signups</h3>
        </div>
        <p className="text-neutral-500 text-sm">No signup data available</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const sortedData = [...data].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className={`rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 border border-neutral-800/50 p-4 sm:p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HiCalendar className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-white">Daily Signups</h3>
        </div>
        <span className="text-xs text-neutral-500">Last 30 days</span>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-1 h-32 sm:h-40">
        {sortedData.slice(-30).map((day, index) => {
          const height = (day.count / maxCount) * 100;
          const isToday = day.date === new Date().toISOString().split('T')[0];

          return (
            <div
              key={day.date}
              className="flex-1 flex flex-col items-center group relative"
            >
              <div
                className={`w-full rounded-t transition-all duration-300 ${
                  isToday ? 'bg-emerald-500' : 'bg-blue-500/70 hover:bg-blue-500'
                }`}
                style={{ height: `${Math.max(height, 2)}%` }}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="bg-neutral-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                  <div className="font-medium">{day.count} signups</div>
                  <div className="text-neutral-400">{day.date}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-xs text-neutral-500">
        <span>{sortedData[0]?.date?.slice(5) || ''}</span>
        <span>Today</span>
      </div>
    </div>
  );
};

// Referral Code Usage Table - shows all codes in ascending order by usage
const ReferralCodeUsageTable: React.FC<{
  referrers: Array<{
    code: string;
    userName: string;
    referralCount: number;
    totalVolume: number;
  }>;
  className?: string;
}> = ({ referrers, className = '' }) => {
  // Sort in ascending order by referral count
  const sortedReferrers = [...referrers].sort((a, b) => a.referralCount - b.referralCount);

  const formatVolume = (value: number): string => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  return (
    <div className={`rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 border border-neutral-800/50 overflow-hidden ${className}`}>
      <div className="p-4 border-b border-neutral-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HiUserGroup className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-white">Referral Code Usage</h3>
          </div>
          <span className="text-xs text-neutral-500 bg-neutral-800/50 px-2 py-1 rounded">
            Ascending by users
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-800/50 bg-neutral-900/30">
              <th className="text-left p-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">Code</th>
              <th className="text-left p-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden sm:table-cell">Owner</th>
              <th className="text-right p-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">Users</th>
              <th className="text-right p-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">Volume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/30">
            {sortedReferrers.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-neutral-500 text-sm">
                  No referral codes used yet
                </td>
              </tr>
            ) : (
              sortedReferrers.map((referrer, index) => (
                <tr key={referrer.code} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="p-3">
                    <code className="text-sm font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
                      {referrer.code}
                    </code>
                  </td>
                  <td className="p-3 hidden sm:table-cell">
                    <span className="text-sm text-neutral-400 truncate">
                      {referrer.userName || '-'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <span className="text-sm font-medium text-white">
                      {referrer.referralCount}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <span className={`text-sm font-medium ${referrer.totalVolume > 0 ? 'text-emerald-400' : 'text-neutral-500'}`}>
                      {formatVolume(referrer.totalVolume)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sortedReferrers.length > 0 && (
        <div className="p-3 border-t border-neutral-800/50 bg-neutral-900/30">
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Total codes: {sortedReferrers.length}</span>
            <span>
              Total referred: {sortedReferrers.reduce((sum, r) => sum + r.referralCount, 0)} users
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// Referrer leaderboard component with React Icons
const ReferrerLeaderboard: React.FC<{
  referrers: Array<{
    code: string;
    userName: string;
    referralCount: number;
    totalVolume: number;
  }>;
  className?: string;
}> = ({ referrers, className = '' }) => {
  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <FaTrophy className="w-5 h-5 text-yellow-400" />;
      case 1:
        return <FaMedal className="w-5 h-5 text-neutral-400" />;
      case 2:
        return <FaAward className="w-5 h-5 text-amber-600" />;
      default:
        return <FaHashtag className="w-4 h-4 text-neutral-500" />;
    }
  };

  return (
    <div className={`rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 border border-neutral-800/50 overflow-hidden ${className}`}>
      <div className="p-4 border-b border-neutral-800/50">
        <div className="flex items-center gap-2">
          <FaTrophy className="w-5 h-5 text-yellow-400" />
          <h3 className="font-semibold text-white">Top Referrers</h3>
        </div>
      </div>

      <div className="divide-y divide-neutral-800/30">
        {referrers.length === 0 ? (
          <div className="p-6 text-center text-neutral-500 text-sm">
            No referrers yet
          </div>
        ) : (
          referrers.slice(0, 10).map((referrer, index) => (
            <div
              key={referrer.code}
              className="flex items-center gap-3 p-3 sm:p-4 hover:bg-neutral-800/30 transition-colors"
            >
              <div className="w-8 flex justify-center">
                {getRankIcon(index)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate text-sm sm:text-base">
                  {referrer.userName || referrer.code}
                </p>
                <p className="text-xs text-neutral-500 truncate">
                  Code: {referrer.code}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-emerald-400 text-sm sm:text-base">
                  {referrer.referralCount} users
                </p>
                <p className="text-xs text-neutral-500">
                  ${(referrer.totalVolume || 0).toLocaleString()} vol
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default function AdminDashboard() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/admin/session', {
          credentials: 'include',
        });
        const data = await response.json();

        if (!data.authenticated) {
          router.replace('/admin/login');
          return;
        }
        setIsAuthorized(true);
      } catch (err) {
        console.error('Auth check error:', err);
        router.replace('/admin/login');
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  const { stats, events, isConnected, error, reconnect } = useAdminPolling(5000, isAuthorized);

  if (isCheckingAuth || !isAuthorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-500 border-t-transparent mx-auto mb-4" />
          <p className="text-neutral-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout title="Dashboard">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Command Center</h2>
          <p className="text-neutral-500 text-sm mt-1">Real-time platform metrics</p>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live
            </span>
          ) : (
            <button
              onClick={reconnect}
              className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-full hover:bg-amber-500/20 transition-colors"
            >
              <HiRefresh className="w-3 h-3" />
              Reconnect
            </button>
          )}
        </div>
      </div>

      {/* Hero Counter */}
      <div className="mb-6 sm:mb-8 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-emerald-900/30 via-neutral-900/50 to-neutral-950/80 border border-emerald-500/20 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent" />
        <p className="text-neutral-400 text-sm sm:text-base mb-2 relative">Total Users</p>
        <div className="relative">
          <AnimatedCounter
            value={stats?.totalUsers || 0}
            size="xl"
            highlightColor="#22c55e"
            showCelebration={true}
            className="text-white"
          />
        </div>
        <p className="text-emerald-400/70 text-xs sm:text-sm mt-3 relative flex items-center justify-center gap-1">
          <HiTrendingUp className="w-4 h-4" />
          Growing every day
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <StatCard
          title="New Users (24h)"
          value={stats?.newUsers24h || 0}
          icon={<HiUsers className="w-5 h-5" />}
          isLive={isConnected}
          highlightColor="#3b82f6"
          trend={stats?.newUsers24h && stats?.newUsers7d ? ((stats.newUsers24h / (stats.newUsers7d / 7)) - 1) * 100 : undefined}
          trendLabel="vs avg"
        />

        <StatCard
          title="Total Volume"
          value={(stats?.totalVolume || 0) * 2}
          prefix="$"
          icon={<HiChartBar className="w-5 h-5" />}
          isLive={isConnected}
          highlightColor="#22c55e"
          formatLargeNumbers={true}
        />

        <StatCard
          title="24h Volume"
          value={(stats?.volume24h || 0) * 2}
          prefix="$"
          icon={<HiTrendingUp className="w-5 h-5" />}
          isLive={isConnected}
          highlightColor="#10b981"
          formatLargeNumbers={true}
        />

        <StatCard
          title="Total Trades"
          value={stats?.totalTrades || 0}
          icon={<HiSwitchHorizontal className="w-5 h-5" />}
          isLive={isConnected}
          highlightColor="#f59e0b"
        />

        <StatCard
          title="Total Referrals"
          value={stats?.totalReferrals || 0}
          icon={<HiUserGroup className="w-5 h-5" />}
          isLive={isConnected}
          highlightColor="#ec4899"
        />
      </div>

      {/* Daily Signups Chart */}
      <div className="mb-6 sm:mb-8">
        <DailySignupsChart data={(stats as any)?.dailySignups || []} />
      </div>

      {/* Referral Code Usage Table - Full Width */}
      <div className="mb-6 sm:mb-8">
        <ReferralCodeUsageTable referrers={stats?.topReferrers || []} />
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        <LiveActivityFeed events={events} maxEvents={20} />
        <ReferrerLeaderboard referrers={stats?.topReferrers || []} />
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-20 md:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm z-50">
          {error}
        </div>
      )}
    </AdminLayout>
  );
}
