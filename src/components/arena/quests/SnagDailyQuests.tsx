/**
 * SnagDailyQuests Component
 *
 * Renders the "Post about Interstate" daily, Snag-verified quest shown alongside
 * the Social Quests cluster on the Outpost (airdrop-genesis) page:
 *   - DAILY_POST_X → post on X tagging @interstatefdn, then Verify
 *
 * Resets every UTC day (date-stamped quest rows on the backend) and awards 100
 * credits on Claim. Verification is async (Snag polls X for up to ~30s).
 * Styling mirrors QuestItem in airdrop-genesis.tsx.
 *
 * (Collaboration badge / code redemption lives in BadgeQuests.tsx.)
 */

import React, { useCallback, useState } from 'react';
import { FiCheck, FiLoader } from 'react-icons/fi';
import InterstateTooltip from '~/components/InterstateTooltip';
import { FiInfo } from 'react-icons/fi';
import type { Quest } from '~/utils/arenaApi';
import {
  useConnectSocial,
  useVerifySocialQuest,
  useClaimQuest,
  useSocialStatus,
} from '~/hooks/useArena';

export const SNAG_DAILY_QUEST_IDS = ['DAILY_POST_X'] as const;

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

  const [postActionTaken, setPostActionTaken] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const postQuest = quests.find((q) => q.questId === 'DAILY_POST_X');

  const handleConnectX = useCallback(async () => {
    const result = await connectSocial.mutateAsync('twitter');
    if (result.oauthUrl) {
      window.location.href = result.oauthUrl; // returns with ?social_connected=twitter
    }
  }, [connectSocial]);

  const handlePost = useCallback(() => {
    window.open(POST_INTENT_URL, '_blank', 'noopener,noreferrer');
    setPostActionTaken(true);
  }, []);

  const handleVerify = useCallback(async () => {
    setVerifying(true);
    try {
      await verifySocialQuest.mutateAsync('DAILY_POST_X');
    } finally {
      setVerifying(false);
    }
  }, [verifySocialQuest]);

  const handleClaim = useCallback((questDbId: number) => {
    claimQuest.mutate(questDbId);
  }, [claimQuest]);

  if (!postQuest) return null;

  const isComplete = postQuest.isCompleted;
  const isClaimed = postQuest.isClaimed;

  const btnBase =
    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  let action: React.ReactNode = null;
  if (isClaimed) {
    action = null;
  } else if (isComplete) {
    action = (
      <button
        type="button"
        onClick={() => handleClaim(postQuest.id)}
        disabled={claimQuest.isPending}
        className={`${btnBase} bg-emerald-500 hover:bg-emerald-400 text-black`}
      >
        Claim
      </button>
    );
  } else if (!twitterConnected) {
    action = (
      <button
        type="button"
        onClick={handleConnectX}
        disabled={connectSocial.isPending}
        className={`${btnBase} bg-white hover:bg-neutral-200 text-black`}
      >
        Connect X
      </button>
    );
  } else if (!postActionTaken) {
    action = (
      <button
        type="button"
        onClick={handlePost}
        className={`${btnBase} bg-white hover:bg-neutral-200 text-black`}
      >
        Post
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        onClick={handleVerify}
        disabled={verifying}
        className={`${btnBase} bg-amber-500 hover:bg-amber-400 text-black inline-flex items-center gap-1.5`}
      >
        {verifying && <FiLoader className="w-3 h-3 animate-spin" />}
        {verifying ? 'Verifying' : 'Verify'}
      </button>
    );
  }

  return (
    <div className={className}>
      <div
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
            ) : (
              <div className="flex-shrink-0 w-5 flex items-center justify-center">
                <XLogo />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5">
                <span className={`text-[14px] truncate ${isClaimed ? 'text-neutral-600 line-through' : 'text-white'}`}>
                  {postQuest.title}
                </span>
                {postQuest.description && (
                  <InterstateTooltip label={postQuest.description}>
                    <FiInfo className={`w-3.5 h-3.5 flex-shrink-0 cursor-help ${isClaimed ? 'text-neutral-600' : 'text-neutral-500 hover:text-neutral-300'}`} />
                  </InterstateTooltip>
                )}
              </span>
              {!isComplete && !isClaimed && twitterConnected && postActionTaken && (
                <span className="text-xs text-neutral-500">Posted? Tap Verify once it's live.</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <CreditsCoin className="w-4 h-4" />
              <span className={`font-bold text-sm ${isClaimed ? 'text-neutral-600' : isComplete ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isClaimed ? '✓' : `+${postQuest.goldReward}`}
              </span>
            </div>
            {action}
          </div>
        </div>
      </div>
    </div>
  );
}
