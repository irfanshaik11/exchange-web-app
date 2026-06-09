/**
 * SnagDailyQuests Component
 *
 * Renders the daily, Snag-verified quests that live inside the Daily Quests
 * section of the Outpost (airdrop-genesis) page:
 *   - DAILY_POST_X     → post on X tagging @interstatefdn, then Verify
 *   - DAILY_CODE_ENTRY → enter today's collaboration code, then Redeem
 *
 * Both reset every UTC day (date-stamped quest rows on the backend) and award
 * 100 credits on Claim. Verification is async (Snag polls X for up to ~30s).
 *
 * Styling mirrors QuestItem in airdrop-genesis.tsx so the rows blend into the
 * existing daily list.
 */

import React, { useCallback, useState } from 'react';
import { FiCheck, FiInfo, FiLoader } from 'react-icons/fi';
import InterstateTooltip from '~/components/InterstateTooltip';
import type { Quest } from '~/utils/arenaApi';
import {
  useConnectSocial,
  useVerifySocialQuest,
  useClaimQuest,
  useSocialStatus,
} from '~/hooks/useArena';

export const SNAG_DAILY_QUEST_IDS = ['DAILY_POST_X', 'DAILY_CODE_ENTRY'] as const;

// Pre-filled X composer text. Must contain "interstatefdn" so Snag's
// "Post should include" criteria matches. Users can still edit before posting.
const POST_INTENT_URL =
  'https://x.com/intent/tweet?text=' +
  encodeURIComponent('Trading on @interstatefdn 🚀');

const CreditsCoin = ({ className = '' }: { className?: string }) => (
  <img src="/ranks/Coin.png" alt="Credits" className={`${className} object-contain`} />
);

// X (Twitter) logo — white. Matches SocialQuestsSection's XLogo.
const XLogo = () => (
  <svg className="w-[18px] h-[18px] text-white" fill="currentColor" viewBox="0 0 24 24">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

interface SnagDailyQuestsProps {
  quests: Quest[];
  className?: string;
}

export default function SnagDailyQuests({ quests, className = '' }: SnagDailyQuestsProps) {
  const connectSocial = useConnectSocial();
  const verifySocialQuest = useVerifySocialQuest();
  const claimQuest = useClaimQuest();
  const { data: socialStatus } = useSocialStatus();

  const twitterConnected = !!socialStatus?.connections?.twitter;

  // Per-quest local UI state
  const [actionTaken, setActionTaken] = useState<Record<string, boolean>>({});
  const [verifyingQuest, setVerifyingQuest] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');

  const questMap = React.useMemo(() => {
    const map: Record<string, Quest> = {};
    quests.forEach((q) => { map[q.questId] = q; });
    return map;
  }, [quests]);

  const handleConnectX = useCallback(async () => {
    const result = await connectSocial.mutateAsync('twitter');
    if (result.oauthUrl) {
      window.location.href = result.oauthUrl; // returns with ?social_connected=twitter
    }
  }, [connectSocial]);

  const handlePost = useCallback(() => {
    window.open(POST_INTENT_URL, '_blank', 'noopener,noreferrer');
    setActionTaken((prev) => ({ ...prev, DAILY_POST_X: true }));
  }, []);

  const handleVerifyPost = useCallback(async () => {
    setVerifyingQuest('DAILY_POST_X');
    try {
      await verifySocialQuest.mutateAsync('DAILY_POST_X');
    } finally {
      setVerifyingQuest(null);
    }
  }, [verifySocialQuest]);

  const handleRedeemCode = useCallback(async () => {
    const code = codeInput.trim();
    if (!code) return;
    setVerifyingQuest('DAILY_CODE_ENTRY');
    try {
      await verifySocialQuest.mutateAsync({ questId: 'DAILY_CODE_ENTRY', code });
      setCodeInput('');
    } finally {
      setVerifyingQuest(null);
    }
  }, [verifySocialQuest, codeInput]);

  const handleClaim = useCallback((questDbId: number) => {
    claimQuest.mutate(questDbId);
  }, [claimQuest]);

  // Shell matching QuestItem: progress-less row, circle indicator, reward chip + action.
  const renderRow = (
    quest: Quest,
    body: React.ReactNode,
    action: React.ReactNode,
    icon?: React.ReactNode,
  ) => {
    const isComplete = quest.isCompleted;
    const isClaimed = quest.isClaimed;
    return (
      <div
        key={quest.id}
        className={`
          relative rounded-xl mb-2 last:mb-0 transition-all duration-200 overflow-hidden
          ${isClaimed
            ? 'bg-neutral-900/40 border border-neutral-800/30'
            : isComplete
              ? 'bg-emerald-500/10 border border-emerald-500/30'
              : 'bg-neutral-900/30 border border-neutral-800/50'}
        `}
      >
        <div className="relative flex items-center justify-between py-3 px-4 gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {isComplete ? (
              <div className="w-5 h-5 rounded-full border-2 border-emerald-500 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] flex items-center justify-center flex-shrink-0">
                <FiCheck className="w-3 h-3 text-black" />
              </div>
            ) : icon ? (
              <div className="flex-shrink-0 w-5 flex items-center justify-center">{icon}</div>
            ) : (
              <div className="w-5 h-5 rounded-full border-2 border-neutral-600 bg-transparent flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5">
                <span className={`text-[14px] truncate ${isClaimed ? 'text-neutral-600 line-through' : 'text-white'}`}>
                  {quest.title}
                </span>
                {quest.description && (
                  <InterstateTooltip label={quest.description}>
                    <FiInfo className={`w-3.5 h-3.5 flex-shrink-0 cursor-help ${isClaimed ? 'text-neutral-600' : 'text-neutral-500 hover:text-neutral-300'}`} />
                  </InterstateTooltip>
                )}
              </span>
              {body}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <CreditsCoin className="w-4 h-4" />
              <span className={`font-bold text-sm ${isClaimed ? 'text-neutral-600' : isComplete ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isClaimed ? '✓' : `+${quest.goldReward}`}
              </span>
            </div>
            {action}
          </div>
        </div>
      </div>
    );
  };

  const btnBase =
    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  const renderAction = (quest: Quest, kind: 'post' | 'code') => {
    if (quest.isClaimed) return null;
    if (quest.isCompleted) {
      return (
        <button
          type="button"
          onClick={() => handleClaim(quest.id)}
          disabled={claimQuest.isPending}
          className={`${btnBase} bg-emerald-500 hover:bg-emerald-400 text-black`}
        >
          Claim
        </button>
      );
    }

    const isVerifying = verifyingQuest === quest.questId;

    if (kind === 'post') {
      if (!twitterConnected) {
        return (
          <button
            type="button"
            onClick={handleConnectX}
            disabled={connectSocial.isPending}
            className={`${btnBase} bg-white hover:bg-neutral-200 text-black`}
          >
            Connect X
          </button>
        );
      }
      if (!actionTaken.DAILY_POST_X) {
        return (
          <button
            type="button"
            onClick={handlePost}
            className={`${btnBase} bg-white hover:bg-neutral-200 text-black`}
          >
            Post
          </button>
        );
      }
      return (
        <button
          type="button"
          onClick={handleVerifyPost}
          disabled={isVerifying}
          className={`${btnBase} bg-amber-500 hover:bg-amber-400 text-black inline-flex items-center gap-1.5`}
        >
          {isVerifying && <FiLoader className="w-3 h-3 animate-spin" />}
          {isVerifying ? 'Verifying' : 'Verify'}
        </button>
      );
    }

    // kind === 'code'
    return null; // code rows render their input/button inside the body
  };

  const postQuest = questMap.DAILY_POST_X;
  const codeQuest = questMap.DAILY_CODE_ENTRY;
  if (!postQuest && !codeQuest) return null;

  const codeVerifying = verifyingQuest === 'DAILY_CODE_ENTRY';

  return (
    <div className={className}>
      {postQuest && renderRow(
        postQuest,
        !postQuest.isCompleted && !postQuest.isClaimed && twitterConnected && actionTaken.DAILY_POST_X ? (
          <span className="text-xs text-neutral-500">Posted? Tap Verify once it's live.</span>
        ) : null,
        renderAction(postQuest, 'post'),
        <XLogo />,
      )}

      {codeQuest && renderRow(
        codeQuest,
        !codeQuest.isCompleted && !codeQuest.isClaimed ? (
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRedeemCode(); }}
              placeholder="Enter code"
              disabled={codeVerifying}
              className="w-32 px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-white text-xs placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleRedeemCode}
              disabled={codeVerifying || !codeInput.trim()}
              className={`${btnBase} bg-amber-500 hover:bg-amber-400 text-black inline-flex items-center gap-1.5`}
            >
              {codeVerifying && <FiLoader className="w-3 h-3 animate-spin" />}
              {codeVerifying ? 'Checking' : 'Redeem'}
            </button>
          </div>
        ) : null,
        renderAction(codeQuest, 'code'),
      )}
    </div>
  );
}
