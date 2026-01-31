/**
 * QuestList Component
 *
 * List of quests grouped by type with section headers.
 * Updated with space theme and React Icons.
 */

import React from 'react';
import { FiCalendar, FiUsers, FiClock } from 'react-icons/fi';
import { GiTrophy, GiMedal, GiRank3 } from 'react-icons/gi';
import { HiSparkles } from 'react-icons/hi';
import type { Quest } from '~/utils/arenaApi';
import QuestCard, { QuestRow } from './QuestCard';

interface QuestListProps {
  quests: Quest[];
  onClaim: (questId: number) => void;
  claimingQuestId?: number;
  goldMultiplier?: number;
  title?: string;
  description?: string;
  emptyMessage?: string;
  compact?: boolean;
  className?: string;
}

export default function QuestList({
  quests,
  onClaim,
  claimingQuestId,
  goldMultiplier = 1,
  title,
  description,
  emptyMessage = 'No quests available',
  compact = false,
  className = '',
}: QuestListProps) {
  // Sort quests: claimable first, then in-progress, then claimed
  const sortedQuests = [...quests].sort((a, b) => {
    const aClaimable = a.isCompleted && !a.isClaimed ? 0 : a.isClaimed ? 2 : 1;
    const bClaimable = b.isCompleted && !b.isClaimed ? 0 : b.isClaimed ? 2 : 1;
    return aClaimable - bClaimable;
  });

  const claimableCount = quests.filter(q => q.isCompleted && !q.isClaimed).length;

  return (
    <div className={className}>
      {/* Header */}
      {title && (
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            {description && (
              <p className="text-sm text-neutral-400">{description}</p>
            )}
          </div>
          {claimableCount > 0 && (
            <span className="flex items-center gap-1 px-3 py-1 bg-emerald-500/20 text-emerald-400 text-sm rounded-full border border-emerald-500/30">
              <HiSparkles className="w-4 h-4" />
              {claimableCount} ready to claim
            </span>
          )}
        </div>
      )}

      {/* Quest List */}
      {sortedQuests.length === 0 ? (
        <div className="text-center py-8 text-neutral-500">
          {emptyMessage}
        </div>
      ) : (
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
          {sortedQuests.map((quest) =>
            compact ? (
              <QuestRow
                key={quest.id}
                quest={quest}
                onClaim={onClaim}
                isClaimLoading={claimingQuestId === quest.id}
                goldMultiplier={goldMultiplier}
              />
            ) : (
              <QuestCard
                key={quest.id}
                quest={quest}
                onClaim={onClaim}
                isClaimLoading={claimingQuestId === quest.id}
                goldMultiplier={goldMultiplier}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * DailyQuests Section
 */
interface DailyQuestsSectionProps {
  quests: Quest[];
  onClaim: (questId: number) => void;
  claimingQuestId?: number;
  goldMultiplier?: number;
  resetTime?: Date | string;
  className?: string;
}

export function DailyQuestsSection({
  quests,
  onClaim,
  claimingQuestId,
  goldMultiplier = 1,
  resetTime,
  className = '',
}: DailyQuestsSectionProps) {
  return (
    <div className={`bg-black/40 backdrop-blur-md rounded-2xl p-5 border border-white/10 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <FiCalendar className="w-5 h-5 text-blue-400" />
          </div>
          <h3 className="text-lg font-bold text-white">Daily Quests</h3>
        </div>
        {resetTime && (
          <div className="flex items-center gap-1 text-sm text-neutral-400">
            <FiClock className="w-4 h-4" />
            <span>Resets at midnight UTC</span>
          </div>
        )}
      </div>

      <QuestList
        quests={quests}
        onClaim={onClaim}
        claimingQuestId={claimingQuestId}
        goldMultiplier={goldMultiplier}
        emptyMessage="Check back tomorrow for new daily quests!"
        compact
      />
    </div>
  );
}

/**
 * SeasonalQuests Section
 */
interface SeasonalQuestsSectionProps {
  quests: Quest[];
  onClaim: (questId: number) => void;
  claimingQuestId?: number;
  goldMultiplier?: number;
  seasonId?: string;
  className?: string;
}

export function SeasonalQuestsSection({
  quests,
  onClaim,
  claimingQuestId,
  goldMultiplier = 1,
  seasonId,
  className = '',
}: SeasonalQuestsSectionProps) {
  return (
    <div className={`bg-black/40 backdrop-blur-md rounded-2xl p-5 border border-white/10 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center">
            <GiTrophy className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Seasonal Quests</h3>
            {seasonId && (
              <p className="text-xs text-neutral-500">{seasonId.replace('_', ' ')}</p>
            )}
          </div>
        </div>
      </div>

      <QuestList
        quests={quests}
        onClaim={onClaim}
        claimingQuestId={claimingQuestId}
        goldMultiplier={goldMultiplier}
        emptyMessage="No seasonal quests available"
        compact
      />
    </div>
  );
}

/**
 * ReferralQuests Section
 */
interface ReferralQuestsSectionProps {
  quests: Quest[];
  onClaim: (questId: number) => void;
  claimingQuestId?: number;
  goldMultiplier?: number;
  className?: string;
}

export function ReferralQuestsSection({
  quests,
  onClaim,
  claimingQuestId,
  goldMultiplier = 1,
  className = '',
}: ReferralQuestsSectionProps) {
  // Separate rank-up quests (with honorsReward) from regular referral quests
  const rankUpQuests = quests.filter(q => q.honorsReward);
  const regularQuests = quests.filter(q => !q.honorsReward);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Rank-up Quests */}
      {rankUpQuests.length > 0 && (
        <div className="bg-purple-900/20 backdrop-blur-md rounded-2xl p-5 border border-purple-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
              <GiMedal className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Honors Progression</h3>
              <p className="text-xs text-purple-400">Unlock higher referral tiers</p>
            </div>
          </div>

          <QuestList
            quests={rankUpQuests}
            onClaim={onClaim}
            claimingQuestId={claimingQuestId}
            goldMultiplier={goldMultiplier}
            emptyMessage="All honors tiers unlocked!"
          />
        </div>
      )}

      {/* Regular Referral Quests */}
      {regularQuests.length > 0 && (
        <div className="bg-black/40 backdrop-blur-md rounded-2xl p-5 border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <FiUsers className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-white">Referral Challenges</h3>
          </div>

          <QuestList
            quests={regularQuests}
            onClaim={onClaim}
            claimingQuestId={claimingQuestId}
            goldMultiplier={goldMultiplier}
            emptyMessage="Refer friends to unlock challenges!"
            compact
          />
        </div>
      )}
    </div>
  );
}
