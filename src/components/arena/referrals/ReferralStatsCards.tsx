/**
 * ReferralStatsCards Component
 *
 * Overview stats for the referral system showing counts and earnings.
 * Updated with space theme and React Icons.
 */

import React from 'react';
import { FiUsers, FiCheck } from 'react-icons/fi';
import { GiReceiveMoney, GiChart } from 'react-icons/gi';
import { BiTrendingUp } from 'react-icons/bi';
import SolDisplay from '../common/SolDisplay';

interface ReferralStatsCardsProps {
  directReferrals: number;
  tier1Referrals: number;
  tier2Referrals: number;
  tier3Referrals: number;
  tier4Referrals: number;
  totalReferralVolume: number;
  pendingSolRewards: number;
  claimedSolRewards: number;
  className?: string;
}

export default function ReferralStatsCards({
  directReferrals,
  tier1Referrals,
  tier2Referrals,
  tier3Referrals,
  tier4Referrals,
  totalReferralVolume,
  pendingSolRewards,
  claimedSolRewards,
  className = '',
}: ReferralStatsCardsProps) {
  const totalReferrals = directReferrals + tier1Referrals + tier2Referrals + tier3Referrals + tier4Referrals;

  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className}`}>
      {/* Total Referrals */}
      <StatCard
        Icon={FiUsers}
        iconColor="text-blue-400"
        iconBg="bg-blue-500/20 border-blue-500/30"
        label="Total Referrals"
        value={totalReferrals.toLocaleString()}
        subValue={`${directReferrals} direct`}
      />

      {/* Total Volume */}
      <StatCard
        Icon={BiTrendingUp}
        iconColor="text-purple-400"
        iconBg="bg-purple-500/20 border-purple-500/30"
        label="Network Volume"
        value={`$${(totalReferralVolume / 1000000).toFixed(2)}M`}
        subValue="All-time trading"
      />

      {/* Pending Rewards */}
      <StatCard
        Icon={GiReceiveMoney}
        iconColor="text-emerald-400"
        iconBg="bg-emerald-500/20 border-emerald-500/30"
        label="Pending Rewards"
        value={<SolDisplay amount={pendingSolRewards} size="lg" showIcon />}
        subValue="Available to claim"
        highlight
      />

      {/* Claimed Rewards */}
      <StatCard
        Icon={FiCheck}
        iconColor="text-amber-400"
        iconBg="bg-amber-500/20 border-amber-500/30"
        label="Total Claimed"
        value={<SolDisplay amount={claimedSolRewards} size="lg" showIcon />}
        subValue="Lifetime earnings"
      />
    </div>
  );
}

function StatCard({
  Icon,
  iconColor,
  iconBg,
  label,
  value,
  subValue,
  highlight = false,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  label: string;
  value: React.ReactNode;
  subValue?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`
        rounded-xl p-4 border backdrop-blur-md
        ${highlight
          ? 'bg-emerald-900/20 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
          : 'bg-black/40 border-white/10'
        }
      `}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg ${iconBg} border flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <span className="text-sm text-neutral-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {subValue && (
        <p className="text-xs text-neutral-500 mt-1">{subValue}</p>
      )}
    </div>
  );
}

/**
 * Tier Breakdown Component
 */
interface TierBreakdownProps {
  directReferrals: number;
  tier1Referrals: number;
  tier2Referrals: number;
  tier3Referrals: number;
  tier4Referrals: number;
  className?: string;
}

export function TierBreakdown({
  directReferrals,
  tier1Referrals,
  tier2Referrals,
  tier3Referrals,
  tier4Referrals,
  className = '',
}: TierBreakdownProps) {
  const tiers = [
    { name: 'Direct', count: directReferrals, color: 'bg-emerald-500' },
    { name: 'Tier 1', count: tier1Referrals, color: 'bg-blue-500' },
    { name: 'Tier 2', count: tier2Referrals, color: 'bg-purple-500' },
    { name: 'Tier 3', count: tier3Referrals, color: 'bg-pink-500' },
    { name: 'Tier 4', count: tier4Referrals, color: 'bg-amber-500' },
  ];

  const total = tiers.reduce((sum, t) => sum + t.count, 0);

  return (
    <div className={`bg-black/40 backdrop-blur-md rounded-xl p-5 border border-white/10 ${className}`}>
      <h3 className="text-lg font-bold text-white mb-4">Referral Network</h3>

      {/* Visual breakdown */}
      <div className="flex h-4 rounded-full overflow-hidden mb-4">
        {tiers.map((tier, idx) => (
          tier.count > 0 && (
            <div
              key={idx}
              className={`${tier.color} transition-all`}
              style={{ width: `${(tier.count / total) * 100}%` }}
              title={`${tier.name}: ${tier.count}`}
            />
          )
        ))}
        {total === 0 && (
          <div className="w-full bg-white/10" />
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-5 gap-2">
        {tiers.map((tier, idx) => (
          <div key={idx} className="text-center">
            <div className={`w-3 h-3 rounded-full ${tier.color} mx-auto mb-1`} />
            <p className="text-xs text-neutral-400">{tier.name}</p>
            <p className="text-sm font-bold text-white">{tier.count}</p>
          </div>
        ))}
      </div>

      {total === 0 && (
        <p className="text-sm text-neutral-500 text-center mt-4">
          Share your referral link to start building your network!
        </p>
      )}
    </div>
  );
}
