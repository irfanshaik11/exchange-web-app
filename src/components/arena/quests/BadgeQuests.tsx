/**
 * BadgeQuests Component
 *
 * Collaboration badges: a winner enters their SINGLE-USE code, Snag verifies it
 * (and grants the badge — the airdrop receipt), and we mirror the claim on our
 * backend. Reward is the badge only — NO arena credits, NO separate claim step.
 *
 * Each badge quest (questId BADGE_*) is a one-time SPECIAL quest row. Display
 * metadata (badge artwork) is defined here on our side, independent of Snag.
 */

import React, { useCallback, useState } from 'react';
import { FiLoader, FiAward, FiCheck } from 'react-icons/fi';
import type { Quest } from '~/utils/arenaApi';
import { useVerifySocialQuest } from '~/hooks/useArena';

export const BADGE_QUEST_IDS = ['BADGE_COLLAB_1'] as const;

// Per-badge display metadata (our side — not pulled from Snag).
// Add an entry (and an optional imageUrl) for each new collaboration badge.
const BADGE_META: Record<string, { imageUrl?: string }> = {
  BADGE_COLLAB_1: {},
};

interface BadgeQuestsProps {
  quests: Quest[];
  className?: string;
}

function BadgeCard({ quest }: { quest: Quest }) {
  const verify = useVerifySocialQuest();
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const claimed = quest.isClaimed;
  const meta = BADGE_META[quest.questId] || {};

  const handleRedeem = useCallback(async () => {
    const value = code.trim();
    if (!value) return;
    setRedeeming(true);
    try {
      await verify.mutateAsync({ questId: quest.questId, code: value });
      setCode('');
    } finally {
      setRedeeming(false);
    }
  }, [verify, code, quest.questId]);

  return (
    <div
      className={`relative rounded-xl mb-2 last:mb-0 overflow-hidden border ${
        claimed
          ? 'bg-amber-500/10 border-amber-500/30'
          : 'bg-neutral-900/30 border-neutral-800/50'
      }`}
    >
      <div className="flex items-center justify-between py-3 px-4 gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Badge artwork or fallback icon */}
          <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center overflow-hidden border border-amber-500/40 bg-amber-500/10">
            {meta.imageUrl ? (
              <img src={meta.imageUrl} alt={quest.title} className="w-full h-full object-cover" />
            ) : (
              <FiAward className={`w-4 h-4 ${claimed ? 'text-amber-400' : 'text-amber-500/70'}`} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[14px] text-white truncate block">{quest.title}</span>
            {!claimed && quest.description && (
              <span className="text-xs text-neutral-500">{quest.description}</span>
            )}
            {claimed && (
              <span className="text-xs text-amber-400 flex items-center gap-1">
                <FiCheck className="w-3 h-3" /> Badge claimed
              </span>
            )}
          </div>
        </div>

        {!claimed && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRedeem(); }}
              placeholder="Enter code"
              disabled={redeeming}
              className="w-32 px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-white text-xs placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleRedeem}
              disabled={redeeming || !code.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {redeeming && <FiLoader className="w-3 h-3 animate-spin" />}
              {redeeming ? 'Checking' : 'Redeem'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BadgeQuests({ quests, className = '' }: BadgeQuestsProps) {
  const badgeQuests = quests.filter((q) =>
    (BADGE_QUEST_IDS as readonly string[]).includes(q.questId),
  );
  if (badgeQuests.length === 0) return null;

  return (
    <div className={`mb-6 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-white font-bold">Badges</h3>
        <span className="text-xs text-neutral-500">· collaboration rewards</span>
      </div>
      {badgeQuests.map((q) => (
        <BadgeCard key={q.id} quest={q} />
      ))}
    </div>
  );
}
