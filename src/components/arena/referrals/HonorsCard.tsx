/**
 * HonorsCard Component
 *
 * Displays the user's current Honors tier with revenue share breakdown.
 * Updated with space theme and React Icons.
 */

import React from 'react';
import { FiLock } from 'react-icons/fi';
import { GiMedal, GiCrown } from 'react-icons/gi';
import { HiSparkles } from 'react-icons/hi';
import ProgressBar from '../common/ProgressBar';

interface HonorsCardProps {
  currentLevel: number;
  totalRevShare: number;
  layers: Array<{ layer: string; percentage: number }>;
  nextLevel: number | null;
  progressToNext: {
    referralCount: { current: number; target: number; percentage: number };
    referralVolume: { current: number; target: number; percentage: number };
  } | null;
  className?: string;
}

const HONORS_COLORS: Record<number, { bg: string; border: string; text: string; glow: string }> = {
  1: { bg: 'from-blue-900/30 to-blue-800/10', border: 'border-blue-500/30', text: 'text-blue-400', glow: 'shadow-blue-500/20' },
  2: { bg: 'from-purple-900/30 to-purple-800/10', border: 'border-purple-500/30', text: 'text-purple-400', glow: 'shadow-purple-500/20' },
  3: { bg: 'from-pink-900/30 to-pink-800/10', border: 'border-pink-500/30', text: 'text-pink-400', glow: 'shadow-pink-500/20' },
  4: { bg: 'from-amber-900/30 to-amber-800/10', border: 'border-amber-500/30', text: 'text-amber-400', glow: 'shadow-amber-500/20' },
};

export default function HonorsCard({
  currentLevel,
  totalRevShare,
  layers,
  nextLevel,
  progressToNext,
  className = '',
}: HonorsCardProps) {
  const colors = HONORS_COLORS[currentLevel] || HONORS_COLORS[1];

  return (
    <div
      className={`
        rounded-2xl border p-6 backdrop-blur-md bg-gradient-to-br
        ${colors.bg} ${colors.border}
        shadow-lg ${colors.glow}
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-neutral-400 text-sm">Your Honors Tier</p>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-10 h-10 rounded-xl bg-${colors.text.replace('text-', '')}/20 border ${colors.border} flex items-center justify-center`}>
              <GiMedal className={`w-5 h-5 ${colors.text}`} />
            </div>
            <span className={`text-2xl font-bold ${colors.text}`}>
              Honors {['I', 'II', 'III', 'IV'][currentLevel - 1]}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-neutral-400 text-sm">Total Rev Share</p>
          <p className={`text-3xl font-bold ${colors.text}`}>{totalRevShare}%</p>
        </div>
      </div>

      {/* Revenue Share Breakdown */}
      <div className="mb-6">
        <p className="text-sm text-neutral-400 mb-3">Your Commission Structure</p>
        <div className="grid grid-cols-5 gap-2">
          {layers.map((layer, idx) => (
            <div
              key={idx}
              className="bg-black/40 backdrop-blur-sm rounded-lg p-3 text-center border border-white/5"
            >
              <p className="text-xs text-neutral-500">{layer.layer}</p>
              <p className={`text-lg font-bold ${colors.text}`}>{layer.percentage}%</p>
            </div>
          ))}
        </div>
      </div>

      {/* Progress to Next Tier */}
      {nextLevel && progressToNext && (
        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <HiSparkles className="w-4 h-4 text-purple-400" />
            <p className="text-sm text-neutral-400">
              Progress to Honors {['I', 'II', 'III', 'IV'][nextLevel - 1]}
            </p>
          </div>
          <div className="space-y-3">
            {/* Referral Count Progress */}
            <div>
              <div className="flex justify-between text-xs text-neutral-500 mb-1">
                <span>Referrals</span>
                <span>
                  {progressToNext.referralCount.current.toLocaleString()} /{' '}
                  {progressToNext.referralCount.target.toLocaleString()}
                </span>
              </div>
              <ProgressBar
                progress={progressToNext.referralCount.percentage}
                color="purple"
                size="sm"
              />
            </div>

            {/* Volume Progress */}
            <div>
              <div className="flex justify-between text-xs text-neutral-500 mb-1">
                <span>Referral Volume</span>
                <span>
                  ${progressToNext.referralVolume.current.toLocaleString()} /{' '}
                  ${progressToNext.referralVolume.target.toLocaleString()}
                </span>
              </div>
              <ProgressBar
                progress={progressToNext.referralVolume.percentage}
                color="purple"
                size="sm"
              />
            </div>

            <p className="text-xs text-neutral-500 italic">
              Complete either goal to unlock the next tier
            </p>
          </div>
        </div>
      )}

      {/* Max Level */}
      {!nextLevel && (
        <div className="border-t border-white/10 pt-4 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-yellow-500/20 border border-yellow-500/30 mb-3">
            <GiCrown className="w-7 h-7 text-yellow-400" />
          </div>
          <p className={`font-bold ${colors.text} mt-2`}>Maximum Honors Achieved!</p>
          <p className="text-sm text-neutral-400">
            You're earning the highest referral rewards possible
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Honors Tier Comparison (shows all tiers)
 */
interface HonorsTierComparisonProps {
  allTiers: Array<{
    level: number;
    totalRevShare: number;
    layers: Array<{ layer: string; percentage: number }>;
    isUnlocked: boolean;
  }>;
  currentLevel: number;
  className?: string;
}

export function HonorsTierComparison({
  allTiers,
  currentLevel,
  className = '',
}: HonorsTierComparisonProps) {
  return (
    <div className={className}>
      <h3 className="text-lg font-bold text-white mb-4">All Honors Tiers</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-neutral-400 border-b border-white/10">
              <th className="pb-2 pr-4">Tier</th>
              <th className="pb-2 pr-4">Total</th>
              <th className="pb-2 pr-4">Direct</th>
              <th className="pb-2 pr-4">T1</th>
              <th className="pb-2 pr-4">T2</th>
              <th className="pb-2 pr-4">T3</th>
              <th className="pb-2 pr-4">T4</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {allTiers.map((tier) => {
              const colors = HONORS_COLORS[tier.level] || HONORS_COLORS[1];
              const isCurrent = tier.level === currentLevel;

              return (
                <tr
                  key={tier.level}
                  className={`
                    border-b border-white/5
                    ${isCurrent ? 'bg-white/5' : ''}
                    ${!tier.isUnlocked ? 'opacity-50' : ''}
                  `}
                >
                  <td className="py-3 pr-4">
                    <span className={`font-bold ${colors.text}`}>
                      Honors {['I', 'II', 'III', 'IV'][tier.level - 1]}
                    </span>
                  </td>
                  <td className={`py-3 pr-4 font-bold ${colors.text}`}>
                    {tier.totalRevShare}%
                  </td>
                  {tier.layers.map((layer, idx) => (
                    <td key={idx} className="py-3 pr-4 text-neutral-300">
                      {layer.percentage}%
                    </td>
                  ))}
                  <td className="py-3">
                    {isCurrent && (
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded border border-emerald-500/30">
                        Current
                      </span>
                    )}
                    {!tier.isUnlocked && (
                      <FiLock className="w-4 h-4 text-neutral-500" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
