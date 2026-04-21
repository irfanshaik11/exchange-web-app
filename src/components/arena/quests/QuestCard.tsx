/**
 * QuestCard Component
 *
 * Single quest item with progress, claim button, and rewards display.
 * Updated with space theme and React Icons.
 */

import React from 'react';
import { FiCheck, FiCircle } from 'react-icons/fi';
import { GiTrophy } from 'react-icons/gi';
import { HiSparkles } from 'react-icons/hi';
import type { Quest } from '~/utils/arenaApi';
import ProgressBar from '../common/ProgressBar';
import GoldDisplay from '../common/GoldDisplay';
import InterstateButton from '~/components/InterstateButton';

interface QuestCardProps {
  quest: Quest;
  onClaim: (questId: number) => void;
  isClaimLoading?: boolean;
  goldMultiplier?: number;
  className?: string;
}

export default function QuestCard({
  quest,
  onClaim,
  isClaimLoading = false,
  goldMultiplier = 1,
  className = '',
}: QuestCardProps) {
  const canClaim = quest.isCompleted && !quest.isClaimed;
  const isActive = !quest.isCompleted;
  const estimatedGold = quest.goldReward * goldMultiplier;

  return (
    <div
      className={`
        p-4 rounded-xl border backdrop-blur-md transition-all
        ${quest.isClaimed
          ? 'bg-black/30 border-white/5 opacity-60'
          : canClaim
          ? 'bg-emerald-900/20 border-emerald-500/30 ring-1 ring-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
          : 'bg-black/40 border-white/10 hover:border-emerald-500/20'
        }
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className={`font-semibold ${quest.isClaimed ? 'text-neutral-500' : 'text-white'}`}>
              {quest.title}
            </h4>
            {quest.marketType === 'POLY' && (
              <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-medium tracking-wide rounded border border-blue-500/20 uppercase">
                Polymarket
              </span>
            )}
            {quest.isClaimed && (
              <span className="flex items-center gap-1 text-emerald-500 text-sm">
                <FiCheck className="w-4 h-4" />
                Claimed
              </span>
            )}
            {canClaim && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full animate-pulse border border-emerald-500/30">
                <HiSparkles className="w-3 h-3" />
                Ready!
              </span>
            )}
          </div>
          {quest.description && (
            <p className="text-sm text-neutral-400 mt-1">{quest.description}</p>
          )}
        </div>

        {/* Reward Display */}
        <div className="text-right ml-4">
          <GoldDisplay
            amount={estimatedGold}
            size="md"
            multiplier={goldMultiplier > 1 ? goldMultiplier : undefined}
          />
          {quest.honorsReward && (
            <span className="text-xs text-purple-400 mt-1 block">
              + {quest.honorsReward.replace('_', ' ')}
            </span>
          )}
        </div>
      </div>

      {/* Progress */}
      {isActive && (
        <div className="mb-3">
          <ProgressBar
            progress={quest.percentComplete}
            showValues
            current={quest.currentValue}
            target={quest.targetValue}
            color={quest.percentComplete >= 100 ? 'emerald' : 'gold'}
            size="sm"
          />
        </div>
      )}

      {/* Claim Button */}
      {canClaim && (
        <button
          onClick={() => onClaim(quest.id)}
          disabled={isClaimLoading}
          className="w-full mt-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
        >
          <GiTrophy className="w-5 h-5 text-yellow-300" />
          {isClaimLoading ? 'Claiming...' : `Claim ${estimatedGold.toLocaleString()} Gold`}
        </button>
      )}

      {/* Completion timestamp */}
      {quest.claimedAt && (
        <p className="text-xs text-neutral-500 mt-2">
          Claimed {new Date(quest.claimedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

/**
 * Compact Quest Row (for lists)
 */
export function QuestRow({
  quest,
  onClaim,
  isClaimLoading = false,
  goldMultiplier = 1,
}: QuestCardProps) {
  const canClaim = quest.isCompleted && !quest.isClaimed;
  const estimatedGold = quest.goldReward * goldMultiplier;

  return (
    <div
      className={`
        flex items-center justify-between p-3 rounded-lg border backdrop-blur-sm transition-all
        ${quest.isClaimed
          ? 'bg-black/30 border-white/5 opacity-50'
          : canClaim
          ? 'bg-emerald-900/10 border-emerald-500/30'
          : 'bg-black/30 border-white/10'
        }
      `}
    >
      {/* Quest Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={quest.isClaimed ? 'text-emerald-500' : 'text-neutral-500'}>
            {quest.isClaimed ? (
              <FiCheck className="w-4 h-4" />
            ) : (
              <FiCircle className="w-4 h-4" />
            )}
          </span>
          <span className={`truncate ${quest.isClaimed ? 'text-neutral-500' : 'text-white'}`}>
            {quest.title}
          </span>
          {quest.marketType === 'POLY' && (
            <span className="shrink-0 px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] font-medium tracking-wide rounded border border-blue-500/20 uppercase">
              Poly
            </span>
          )}
        </div>
        {!quest.isClaimed && (
          <div className="flex items-center gap-2 mt-1 ml-6">
            <div className="flex-1 h-1 bg-black/40 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${canClaim ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${quest.percentComplete}%` }}
              />
            </div>
            <span className="text-xs text-neutral-500">
              {quest.currentValue}/{quest.targetValue}
            </span>
          </div>
        )}
      </div>

      {/* Reward & Action */}
      <div className="flex items-center gap-3 ml-4">
        <GoldDisplay amount={estimatedGold} size="sm" />
        {canClaim && (
          <button
            onClick={() => onClaim(quest.id)}
            disabled={isClaimLoading}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
          >
            {isClaimLoading ? '...' : 'Claim'}
          </button>
        )}
      </div>
    </div>
  );
}
