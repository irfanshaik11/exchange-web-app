/**
 * Admin Dashboard - Command Center
 * Real-time platform metrics with daily signup tracking
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import {
  HiUsers,
  HiTrendingUp,
  HiSwitchHorizontal,
  HiUserGroup,
  HiRefresh,
  HiChartBar,
  HiCalendar,
  HiCurrencyDollar,
  HiLightningBolt,
  HiArrowRight,
  HiShieldCheck,
} from 'react-icons/hi';
import {
  FaTrophy,
  FaMedal,
  FaAward,
  FaHashtag,
  FaStar,
} from 'react-icons/fa';
import AdminLayout from '~/components/admin/AdminLayout';
import StatCard from '~/components/admin/StatCard';
import AnimatedCounter from '~/components/admin/AnimatedCounter';
import { useAdminPolling, useAdminAnalytics } from '~/hooks/useAdminWebSocket';
import type { AdminAnalytics } from '~/hooks/useAdminWebSocket';

interface DailySignup {
  date: string;
  count: number;
}

interface TopEarner {
  name: string;
  email: string;
  totalEarned: number;
  honorsLevel: number;
}

// Shared volume formatter
function formatVol(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

const SIGNUP_RANGE_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: '60d', value: 60 },
  { label: '90d', value: 90 },
];

// Daily signups chart component
const DailySignupsChart: React.FC<{
  data: DailySignup[];
  days: number;
  onDaysChange: (days: number) => void;
  className?: string;
}> = ({ data, days, onDaysChange, className = '' }) => {
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

  const sortedData = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const displayData = sortedData.slice(-days);
  const totalCount = displayData.reduce((s, d) => s + d.count, 0);
  const maxCount = Math.max(...displayData.map((d) => d.count), 1);

  return (
    <div className={`rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 border border-neutral-800/50 p-4 sm:p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HiCalendar className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-white">Daily Signups</h3>
        </div>
        <div className="flex items-center gap-1 bg-neutral-800/50 rounded-lg p-0.5">
          {SIGNUP_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onDaysChange(opt.value)}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                days === opt.value
                  ? 'bg-blue-500/30 text-blue-400'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bar chart or empty state */}
      {totalCount === 0 ? (
        <div className="flex items-center justify-center h-32 sm:h-40">
          <div className="text-center">
            <HiUsers className="w-8 h-8 text-neutral-700 mx-auto mb-2" />
            <p className="text-neutral-500 text-sm">No signups in this period</p>
            <p className="text-neutral-600 text-xs mt-1">{displayData.length} days shown</p>
          </div>
        </div>
      ) : (
        <div className="flex items-end gap-1 h-32 sm:h-40">
          {displayData.map((day) => {
            const height = (day.count / maxCount) * 100;
            const isToday = day.date === new Date().toISOString().split('T')[0];

            return (
              <div
                key={day.date}
                className="flex-1 h-full flex flex-col justify-end items-center group relative"
              >
                <div
                  className={`w-full rounded-t transition-all duration-300 ${
                    isToday ? 'bg-emerald-500' : 'bg-blue-500/70 hover:bg-blue-500'
                  }`}
                  style={{ height: `${Math.max(height, 3)}%` }}
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
      )}

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-xs text-neutral-500">
        <span>{displayData[0]?.date?.slice(5) || ''}</span>
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

const VOLUME_RANGE_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: '60d', value: 60 },
  { label: '90d', value: 90 },
];

// Daily Volume Chart
const DailyVolumeChart: React.FC<{
  data: Array<{ date: string; tradeCount: number; volume: number }>;
  days: number;
  onDaysChange: (days: number) => void;
  className?: string;
}> = ({ data, days, onDaysChange, className = '' }) => {
  if (!data || data.length === 0) {
    return (
      <div className={`rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 border border-neutral-800/50 p-6 ${className}`}>
        <div className="flex items-center gap-2 mb-4">
          <HiChartBar className="w-5 h-5 text-emerald-400" />
          <h3 className="font-semibold text-white">Daily Volume</h3>
        </div>
        <p className="text-neutral-500 text-sm">No volume data available</p>
      </div>
    );
  }

  const totalVolume = data.reduce((s, d) => s + d.volume, 0);
  const maxVolume = Math.max(...data.map((d) => d.volume), 1);

  return (
    <div className={`rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 border border-neutral-800/50 p-4 sm:p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HiChartBar className="w-5 h-5 text-emerald-400" />
          <h3 className="font-semibold text-white">Daily Volume</h3>
        </div>
        <div className="flex items-center gap-1 bg-neutral-800/50 rounded-lg p-0.5">
          {VOLUME_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onDaysChange(opt.value)}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                days === opt.value
                  ? 'bg-emerald-500/30 text-emerald-400'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {totalVolume === 0 ? (
        <div className="flex items-center justify-center h-32 sm:h-40">
          <div className="text-center">
            <HiChartBar className="w-8 h-8 text-neutral-700 mx-auto mb-2" />
            <p className="text-neutral-500 text-sm">No trading volume in this period</p>
            <p className="text-neutral-600 text-xs mt-1">{data.length} days shown</p>
          </div>
        </div>
      ) : (
        <div className="flex items-end gap-0.5 h-32 sm:h-40">
          {data.map((day) => {
            const height = (day.volume / maxVolume) * 100;
            const isToday = day.date === new Date().toISOString().split('T')[0];

            return (
              <div
                key={day.date}
                className="flex-1 h-full flex flex-col justify-end items-center group relative"
              >
                <div
                  className={`w-full rounded-t transition-all duration-300 ${
                    isToday
                      ? 'bg-emerald-500'
                      : 'bg-emerald-500/50 hover:bg-emerald-500/70'
                  }`}
                  style={{ height: `${Math.max(height, 3)}%` }}
                />
                <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                  <div className="bg-neutral-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                    <div className="font-medium">{formatVol(day.volume)}</div>
                    <div className="text-neutral-400">
                      {day.tradeCount} trades
                    </div>
                    <div className="text-neutral-500">{day.date}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-between mt-2 text-xs text-neutral-500">
        <span>{data[0]?.date?.slice(5) || ''}</span>
        <span>Today</span>
      </div>
    </div>
  );
};

// Referral Tier Breakdown - shows counts and rewards per tier
const TierBreakdownCard: React.FC<{
  analytics: AdminAnalytics | null;
  className?: string;
}> = ({ analytics, className = '' }) => {
  if (!analytics) {
    return (
      <div className={`rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 border border-neutral-800/50 p-6 ${className}`}>
        <div className="flex items-center gap-2 mb-4">
          <HiUserGroup className="w-5 h-5 text-purple-400" />
          <h3 className="font-semibold text-white">Referral Tier Breakdown</h3>
        </div>
        <p className="text-neutral-500 text-sm">Loading...</p>
      </div>
    );
  }

  const { tierBreakdown, rewardsByTier } = analytics;
  const tiers = [
    { label: 'Direct', key: 'direct' as const, layer: 0, color: 'bg-purple-500' },
    { label: 'Tier 1', key: 'tier1' as const, layer: 1, color: 'bg-blue-500' },
    { label: 'Tier 2', key: 'tier2' as const, layer: 2, color: 'bg-cyan-500' },
    { label: 'Tier 3', key: 'tier3' as const, layer: 3, color: 'bg-teal-500' },
    { label: 'Tier 4', key: 'tier4' as const, layer: 4, color: 'bg-emerald-500' },
  ];

  const maxCount = Math.max(
    tierBreakdown.direct,
    tierBreakdown.tier1,
    tierBreakdown.tier2,
    tierBreakdown.tier3,
    tierBreakdown.tier4,
    1
  );

  const getRewardForLayer = (layer: number) =>
    rewardsByTier.find((r) => r.layer === layer);

  return (
    <div className={`rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 border border-neutral-800/50 overflow-hidden ${className}`}>
      <div className="p-4 border-b border-neutral-800/50">
        <div className="flex items-center gap-2">
          <HiUserGroup className="w-5 h-5 text-purple-400" />
          <h3 className="font-semibold text-white">Referral Tier Breakdown</h3>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {tiers.map((tier) => {
          const count = tierBreakdown[tier.key];
          const reward = getRewardForLayer(tier.layer);
          const barWidth = (count / maxCount) * 100;

          return (
            <div key={tier.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-neutral-300">
                  {tier.label}
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-neutral-400">
                    {count} referrals
                  </span>
                  {reward && reward.totalSol > 0 && (
                    <span className="text-emerald-400">
                      {reward.totalSol.toFixed(4)} SOL
                    </span>
                  )}
                  {reward && reward.volumeUsd > 0 && (
                    <span className="text-neutral-500">
                      {formatVol(reward.volumeUsd)} vol
                    </span>
                  )}
                </div>
              </div>
              <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${tier.color} transition-all duration-500`}
                  style={{ width: `${Math.max(barWidth, count > 0 ? 2 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 pb-4 pt-1">
        <div className="flex justify-between text-xs text-neutral-500 border-t border-neutral-800/50 pt-3">
          <span>
            Total:{' '}
            {tierBreakdown.direct +
              tierBreakdown.tier1 +
              tierBreakdown.tier2 +
              tierBreakdown.tier3 +
              tierBreakdown.tier4}{' '}
            referrals
          </span>
          <span>
            {rewardsByTier.reduce((s, r) => s + r.totalSol, 0).toFixed(4)} SOL
            distributed
          </span>
        </div>
      </div>
    </div>
  );
};

// Platform Health Metrics - conversion rate + rewards summary
const PlatformHealthMetrics: React.FC<{
  analytics: AdminAnalytics | null;
  className?: string;
}> = ({ analytics, className = '' }) => {
  if (!analytics) return null;

  const { conversionRate, rewardsSummary } = analytics;

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${className}`}>
      {/* Conversion Rate */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 via-neutral-900/70 to-neutral-950/90 border border-blue-500/20 p-5">
        <div className="flex items-center gap-2 mb-3">
          <HiShieldCheck className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-white text-sm">Conversion Rate</h3>
        </div>
        <div className="text-3xl font-bold text-blue-400 mb-1">
          {conversionRate.rate}%
        </div>
        <p className="text-xs text-neutral-500">
          {conversionRate.referredWhoTraded} of{' '}
          {conversionRate.referredUsers} referred users traded
        </p>
        {conversionRate.referredUsers > 0 && (
          <div className="mt-3 w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(conversionRate.rate, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Rewards Summary */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-500/10 via-neutral-900/70 to-neutral-950/90 border border-amber-500/20 p-5">
        <div className="flex items-center gap-2 mb-3">
          <HiCurrencyDollar className="w-5 h-5 text-amber-400" />
          <h3 className="font-semibold text-white text-sm">Rewards Summary</h3>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-neutral-500">Pending</span>
            <span className="text-sm font-medium text-amber-400">
              {rewardsSummary.totalPendingSol.toFixed(6)} SOL
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-neutral-500">Claimed</span>
            <span className="text-sm font-medium text-emerald-400">
              {rewardsSummary.totalClaimedSol.toFixed(6)} SOL
            </span>
          </div>
          <div className="border-t border-neutral-800/50 pt-2 flex justify-between items-center">
            <span className="text-xs text-neutral-400 font-medium">
              Total Distributed
            </span>
            <span className="text-sm font-bold text-white">
              {rewardsSummary.totalDistributedSol.toFixed(6)} SOL
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Honors Distribution - bar chart of user counts per level
const HonorsDistributionChart: React.FC<{
  data: Array<{ level: number; count: number }>;
  className?: string;
}> = ({ data, className = '' }) => {
  if (!data || data.length === 0) {
    return (
      <div className={`rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 border border-neutral-800/50 p-6 ${className}`}>
        <div className="flex items-center gap-2 mb-4">
          <FaStar className="w-4 h-4 text-yellow-400" />
          <h3 className="font-semibold text-white">Honors Distribution</h3>
        </div>
        <p className="text-neutral-500 text-sm">No data available</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const totalUsers = data.reduce((s, d) => s + d.count, 0);
  const levelLabels: Record<number, string> = {
    1: 'Level I',
    2: 'Level II',
    3: 'Level III',
    4: 'Level IV',
  };
  const levelColors: Record<number, string> = {
    1: 'bg-neutral-500',
    2: 'bg-blue-500',
    3: 'bg-purple-500',
    4: 'bg-yellow-500',
  };

  return (
    <div className={`rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 border border-neutral-800/50 p-4 sm:p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FaStar className="w-4 h-4 text-yellow-400" />
          <h3 className="font-semibold text-white">Honors Distribution</h3>
        </div>
        <span className="text-xs text-neutral-500">{totalUsers} users</span>
      </div>

      <div className="space-y-3">
        {data.map((item) => {
          const pct = totalUsers > 0 ? ((item.count / totalUsers) * 100).toFixed(1) : '0';
          return (
            <div key={item.level}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-neutral-300">
                  {levelLabels[item.level] || `Level ${item.level}`}
                </span>
                <span className="text-xs text-neutral-400">
                  {item.count} ({pct}%)
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${levelColors[item.level] || 'bg-neutral-500'} transition-all duration-500`}
                  style={{
                    width: `${Math.max((item.count / maxCount) * 100, item.count > 0 ? 2 : 0)}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Top Traders Table
// P&L Leaderboard — winners, losers, and platform summary
const PnlLeaderboard: React.FC<{
  analytics: AdminAnalytics | null;
  className?: string;
}> = ({ analytics, className = '' }) => {
  const pnl = analytics?.pnlLeaderboard;
  const summary = analytics?.pnlSummary;

  const formatPnl = (value: number) => {
    const prefix = value >= 0 ? '+' : '';
    if (Math.abs(value) >= 1000) return `${prefix}$${(value / 1000).toFixed(2)}K`;
    return `${prefix}$${value.toFixed(2)}`;
  };

  return (
    <div className={`rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 border border-neutral-800/50 overflow-hidden ${className}`}>
      {/* Header + Summary Stats */}
      <div className="p-4 border-b border-neutral-800/50">
        <div className="flex items-center gap-2 mb-3">
          <HiTrendingUp className="w-5 h-5 text-emerald-400" />
          <h3 className="font-semibold text-white">P&L Leaderboard</h3>
        </div>
        {summary && summary.totalSells > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-neutral-500">Platform P&L</p>
              <p className={`text-sm font-bold ${summary.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatPnl(summary.totalPnl)}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Win Rate</p>
              <p className="text-sm font-bold text-white">{summary.winRate}%</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Biggest Win</p>
              <p className="text-sm font-bold text-emerald-400">{formatPnl(summary.biggestWin)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Biggest Loss</p>
              <p className="text-sm font-bold text-red-400">{formatPnl(summary.biggestLoss)}</p>
            </div>
          </div>
        )}
        {(!summary || summary.totalSells === 0) && (
          <p className="text-neutral-500 text-sm">No sell trades with P&L data yet</p>
        )}
      </div>

      {/* Two-column: Winners | Losers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-neutral-800/50">
        {/* Winners */}
        <div>
          <div className="px-4 py-2 bg-emerald-500/5 border-b border-neutral-800/50">
            <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
              Top Winners
            </span>
          </div>
          <div className="divide-y divide-neutral-800/30">
            {(!pnl || pnl.winners.length === 0) ? (
              <div className="p-4 text-center text-neutral-500 text-sm">No winners yet</div>
            ) : (
              pnl.winners.map((user, i) => (
                <div key={`w-${user.email}-${i}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-neutral-800/30 transition-colors">
                  <span className="text-xs text-neutral-500 w-5 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{user.name || 'Unknown'}</p>
                    <p className="text-xs text-neutral-500">
                      {user.winCount}/{user.sellCount} wins
                    </p>
                  </div>
                  <span className="text-sm font-bold text-emerald-400 tabular-nums">
                    {formatPnl(user.totalPnl)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Losers */}
        <div>
          <div className="px-4 py-2 bg-red-500/5 border-b border-neutral-800/50">
            <span className="text-xs font-medium text-red-400 uppercase tracking-wider">
              Top Losers
            </span>
          </div>
          <div className="divide-y divide-neutral-800/30">
            {(!pnl || pnl.losers.length === 0) ? (
              <div className="p-4 text-center text-neutral-500 text-sm">No losers yet</div>
            ) : (
              pnl.losers.map((user, i) => (
                <div key={`l-${user.email}-${i}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-neutral-800/30 transition-colors">
                  <span className="text-xs text-neutral-500 w-5 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{user.name || 'Unknown'}</p>
                    <p className="text-xs text-neutral-500">
                      {user.sellCount} sells
                    </p>
                  </div>
                  <span className="text-sm font-bold text-red-400 tabular-nums">
                    {formatPnl(user.totalPnl)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const TopTradersTable: React.FC<{
  traders: Array<{
    name: string;
    email: string;
    tradeCount: number;
    totalVolume: number;
  }>;
  className?: string;
}> = ({ traders, className = '' }) => {
  return (
    <div className={`rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 border border-neutral-800/50 overflow-hidden ${className}`}>
      <div className="p-4 border-b border-neutral-800/50">
        <div className="flex items-center gap-2">
          <HiLightningBolt className="w-5 h-5 text-amber-400" />
          <h3 className="font-semibold text-white">Top Traders</h3>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-800/50 bg-neutral-900/30">
              <th className="text-left p-3 text-xs font-medium text-neutral-500 uppercase tracking-wider w-8">
                #
              </th>
              <th className="text-left p-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Name
              </th>
              <th className="text-right p-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Trades
              </th>
              <th className="text-right p-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Volume
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/30">
            {traders.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="p-6 text-center text-neutral-500 text-sm"
                >
                  No trades yet
                </td>
              </tr>
            ) : (
              traders.map((trader, index) => (
                <tr
                  key={`${trader.email}-${index}`}
                  className="hover:bg-neutral-800/30 transition-colors"
                >
                  <td className="p-3 text-sm text-neutral-500">{index + 1}</td>
                  <td className="p-3">
                    <div>
                      <p className="text-sm font-medium text-white truncate">
                        {trader.name || 'Unknown'}
                      </p>
                      <p className="text-xs text-neutral-500 truncate">
                        {trader.email}
                      </p>
                    </div>
                  </td>
                  <td className="p-3 text-right text-sm text-neutral-400">
                    {trader.tradeCount}
                  </td>
                  <td className="p-3 text-right">
                    <span className="text-sm font-medium text-emerald-400">
                      {formatVol(trader.totalVolume)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Top Earners Preview - compact list with link to referrals page
const TopEarnersPreview: React.FC<{
  earners: TopEarner[];
  className?: string;
}> = ({ earners, className = '' }) => {
  const honorsLabels: Record<number, string> = {
    1: 'I',
    2: 'II',
    3: 'III',
    4: 'IV',
  };
  const honorsColors: Record<number, string> = {
    1: 'text-neutral-400 bg-neutral-700/50',
    2: 'text-blue-400 bg-blue-500/20',
    3: 'text-purple-400 bg-purple-500/20',
    4: 'text-yellow-400 bg-yellow-500/20',
  };

  return (
    <div className={`rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 border border-neutral-800/50 overflow-hidden ${className}`}>
      <div className="p-4 border-b border-neutral-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FaTrophy className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-white">Top Earners</h3>
          </div>
          <Link
            href="/admin/referrals"
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            View all
            <HiArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      <div className="divide-y divide-neutral-800/30">
        {earners.length === 0 ? (
          <div className="p-6 text-center text-neutral-500 text-sm">
            No earners yet
          </div>
        ) : (
          earners.map((earner, index) => (
            <div
              key={`${earner.email}-${index}`}
              className="flex items-center gap-3 p-3 hover:bg-neutral-800/30 transition-colors"
            >
              <div className="w-6 text-center text-xs text-neutral-500 font-medium">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {earner.name || 'Unknown'}
                </p>
              </div>
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  honorsColors[earner.honorsLevel] || honorsColors[1]
                }`}
              >
                {honorsLabels[earner.honorsLevel] || earner.honorsLevel}
              </span>
              <span className="text-sm font-medium text-emerald-400 tabular-nums">
                {earner.totalEarned.toFixed(4)} SOL
              </span>
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

  // Chart range state
  const [signupDays, setSignupDays] = useState(30);
  const [volumeDays, setVolumeDays] = useState(30);

  const { stats, events, isConnected, error, reconnect } = useAdminPolling(5000, isAuthorized, signupDays);
  const { analytics } = useAdminAnalytics(60000, isAuthorized, volumeDays);

  // Fetch top 5 earners for preview
  const [topEarners, setTopEarners] = useState<TopEarner[]>([]);
  const fetchTopEarners = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      const res = await fetch(
        '/api/admin/stats/rewards?limit=5&sortBy=totalEarned&sortOrder=desc',
        { credentials: 'include' }
      );
      if (res.ok) {
        const data = await res.json();
        setTopEarners(data.users || []);
      }
    } catch {
      // Silently fail — preview is non-critical
    }
  }, [isAuthorized]);

  useEffect(() => {
    fetchTopEarners();
    const interval = setInterval(fetchTopEarners, 120000); // refresh every 2 min
    return () => clearInterval(interval);
  }, [fetchTopEarners]);

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

      {/* Stats Grid - Expanded */}
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
          title="New Users (7d)"
          value={stats?.newUsers7d || 0}
          icon={<HiUsers className="w-5 h-5" />}
          isLive={isConnected}
          highlightColor="#6366f1"
        />

        <StatCard
          title="New Users (30d)"
          value={stats?.newUsers30d || 0}
          icon={<HiUsers className="w-5 h-5" />}
          isLive={isConnected}
          highlightColor="#8b5cf6"
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
          title="Trades (24h)"
          value={stats?.trades24h || 0}
          icon={<HiLightningBolt className="w-5 h-5" />}
          isLive={isConnected}
          highlightColor="#ef4444"
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
        <DailySignupsChart
          data={(stats as any)?.dailySignups || []}
          days={signupDays}
          onDaysChange={setSignupDays}
        />
      </div>

      {/* Weekly Volume Chart */}
      <div className="mb-6 sm:mb-8">
        <DailyVolumeChart
          data={analytics?.dailyVolume || []}
          days={volumeDays}
          onDaysChange={setVolumeDays}
        />
      </div>

      {/* Referral Tier Breakdown */}
      <div className="mb-6 sm:mb-8">
        <TierBreakdownCard analytics={analytics} />
      </div>

      {/* Platform Health Metrics */}
      <div className="mb-6 sm:mb-8">
        <PlatformHealthMetrics analytics={analytics} />
      </div>

      {/* Honors Distribution */}
      <div className="mb-6 sm:mb-8">
        <HonorsDistributionChart
          data={analytics?.honorsDistribution || []}
        />
      </div>

      {/* Referral Code Usage Table */}
      <div className="mb-6 sm:mb-8">
        <ReferralCodeUsageTable referrers={stats?.topReferrers || []} />
      </div>

      {/* Top Traders + Top Earners - Two Column */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <TopTradersTable traders={analytics?.topTraders || []} />
        <TopEarnersPreview earners={topEarners} />
      </div>

      {/* P&L Leaderboard */}
      <div className="mb-6 sm:mb-8">
        <PnlLeaderboard analytics={analytics} />
      </div>

      {/* Leaderboard */}
      <div>
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
