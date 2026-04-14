/**
 * SocialQuestsSection Component
 *
 * Matches existing QuestItem row styling. Platform icons (X/TG) replace
 * the circle indicator. Header shows total earnable credits.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { FiCheck, FiExternalLink, FiLoader, FiInfo, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import InterstateTooltip from '~/components/InterstateTooltip';
import type { Quest } from '~/utils/arenaApi';
import {
  useConnectSocial,
  useVerifySocialQuest,
  useClaimQuest,
} from '~/hooks/useArena';

const CreditsCoin = ({ className = '' }: { className?: string }) => (
  <img src="/ranks/Coin.png" alt="Credits" className={`${className} object-contain`} />
);

// X (Twitter) logo — white
const XLogo = () => (
  <svg className="w-[18px] h-[18px] text-white" fill="currentColor" viewBox="0 0 24 24">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

// Telegram logo — brand blue
const TGLogo = () => (
  <svg className="w-[18px] h-[18px] text-[#27A7E7]" fill="currentColor" viewBox="0 0 24 24">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

// ============================================================
// CONFIG
// ============================================================

const SOCIAL_QUEST_CONFIGS = [
  { questId: 'SOCIAL_CONNECT_X', platform: 'twitter' as const, icon: <XLogo />, actionLabel: 'Connect', actionUrl: undefined, tooltip: 'Link your X (Twitter) account to Interstate to unlock social quests and earn credits.' },
  { questId: 'SOCIAL_FOLLOW_X', platform: 'twitter' as const, icon: <XLogo />, actionLabel: 'Follow', actionUrl: 'https://x.com/interstatefdn', tooltip: 'Follow @interstatefdn on X to stay updated and earn credits. Click Follow, then come back and verify.' },
  { questId: 'SOCIAL_ENGAGE_POST', platform: 'twitter' as const, icon: <XLogo />, actionLabel: 'Engage', actionUrl: 'https://x.com/interstatefdn/status/2041067022562324801', tooltip: 'Like, comment, AND repost the Interstate post on X. You must do all three to complete this quest.' },
  { questId: 'SOCIAL_JOIN_TG', platform: 'telegram' as const, icon: <TGLogo />, actionLabel: 'Join', actionUrl: 'https://t.me/+DDXGrsJoe3szYTAx', tooltip: 'Join the Interstate Telegram community to connect with other traders and earn credits.' },
];

// ============================================================
// COMPONENT
// ============================================================

interface SocialQuestsSectionProps {
  quests: Quest[];
  goldMultiplier?: number;
  className?: string;
}

export default function SocialQuestsSection({
  quests,
  goldMultiplier = 1,
  className = '',
}: SocialQuestsSectionProps) {
  const connectSocial = useConnectSocial();
  const verifySocialQuest = useVerifySocialQuest();
  const claimQuest = useClaimQuest();

  const router = useRouter();
  const [actionTaken, setActionTaken] = useState<Record<string, boolean>>({});
  const [verifyingQuest, setVerifyingQuest] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const autoVerifyDone = useRef(false);

  const questMap = useMemo(() => {
    const map: Record<string, Quest> = {};
    quests.forEach(q => { map[q.questId] = q; });
    return map;
  }, [quests]);

  const totalCredits = useMemo(() => {
    return SOCIAL_QUEST_CONFIGS.reduce((sum, cfg) => {
      const q = questMap[cfg.questId];
      return sum + (q ? q.goldReward : 0);
    }, 0);
  }, [questMap]);

  const remainingCredits = useMemo(() => {
    return SOCIAL_QUEST_CONFIGS.reduce((sum, cfg) => {
      const q = questMap[cfg.questId];
      return sum + (q && !q.isClaimed ? q.goldReward : 0);
    }, 0);
  }, [questMap]);

  const allClaimed = useMemo(() => {
    return SOCIAL_QUEST_CONFIGS.every(cfg => questMap[cfg.questId]?.isClaimed);
  }, [questMap]);

  const claimedCredits = useMemo(() => {
    return SOCIAL_QUEST_CONFIGS.reduce((sum, cfg) => {
      const q = questMap[cfg.questId];
      return sum + (q && q.isClaimed ? q.goldReward : 0);
    }, 0);
  }, [questMap]);

  const handleConnect = useCallback(async (platform: 'twitter' | 'telegram') => {
    const result = await connectSocial.mutateAsync(platform);
    if (result.oauthUrl) {
      // Redirect same tab — callback will return here with ?social_connected=twitter
      window.location.href = result.oauthUrl;
    }
  }, [connectSocial]);

  const handleAction = useCallback((questId: string, url?: string) => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    setActionTaken(prev => ({ ...prev, [questId]: true }));
  }, []);

  const handleVerify = useCallback(async (questId: string) => {
    setVerifyingQuest(questId);
    try { await verifySocialQuest.mutateAsync(questId); } finally { setVerifyingQuest(null); }
  }, [verifySocialQuest]);

  /**
   * TG Join requires TWO prerequisites: (1) user joined the group, (2) TG linked to Snag.
   * This handler checks if TG is already connected — if not, starts OAuth (auto-verify on return).
   * If already connected, verifies the join rule directly.
   */
  const handleTelegramVerify = useCallback(async () => {
    setVerifyingQuest('SOCIAL_JOIN_TG');
    try {
      const result = await connectSocial.mutateAsync('telegram');
      if (result.oauthUrl) {
        // TG not linked to Snag yet — OAuth first, auto-verify fires on redirect back
        window.location.href = result.oauthUrl;
        return;
      }
      // TG already connected — verify group membership directly
      await verifySocialQuest.mutateAsync('SOCIAL_JOIN_TG');
    } finally {
      setVerifyingQuest(null);
    }
  }, [connectSocial, verifySocialQuest]);

  const handleClaim = useCallback((questDbId: number) => {
    claimQuest.mutate(questDbId);
  }, [claimQuest]);

  // Handle OAuth redirect return — either success (auto-verify) or error (toast)
  useEffect(() => {
    if (!router.isReady || autoVerifyDone.current) return;
    const platform = router.query.social_connected as string | undefined;
    const errorCode = router.query.social_error as string | undefined;
    const errorPlatform = router.query.platform as string | undefined;

    if (!platform && !errorCode) return;

    autoVerifyDone.current = true;

    // Clean up URL
    const { social_connected, social_error, platform: _p, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });

    // Error path — show a toast explaining why the connection failed
    if (errorCode) {
      if (errorCode === 'account_already_linked') {
        const platformLabel = errorPlatform === 'twitter' ? 'X (Twitter)' : 'Telegram';
        toast.error(
          `This ${platformLabel} account is already linked to another Interstate user. Please use a different account.`,
          { duration: 6000 }
        );
      } else {
        toast.error(`Social connection failed: ${errorCode.replace(/_/g, ' ')}`);
      }
      return;
    }

    // Success path — auto-verify the quest
    if (platform === 'twitter') {
      handleVerify('SOCIAL_CONNECT_X');
    } else if (platform === 'telegram') {
      handleVerify('SOCIAL_JOIN_TG');
    }
  }, [router.isReady, router.query, handleVerify]);

  return (
    <div className={`mb-6 ${className}`}>
      {allClaimed ? (
        /* Completed header — collapsible to show finished quests */
        <button
          type="button"
          onClick={() => setCollapsed(prev => !prev)}
          className="flex items-center justify-between w-full mb-4 group cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <FiCheck className="w-4 h-4 text-emerald-500" />
            <h3 className="text-white font-bold">Social Quests</h3>
            <span className="text-xs text-emerald-400">Complete</span>
            <span className="text-xs text-neutral-500">·</span>
            <div className="flex items-center gap-1">
              <CreditsCoin className="w-3.5 h-3.5" />
              <span className="text-xs text-neutral-400">{claimedCredits.toLocaleString()} claimed</span>
            </div>
          </div>
          {collapsed
            ? <FiChevronRight className="w-4 h-4 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
            : <FiChevronDown className="w-4 h-4 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
          }
        </button>
      ) : (
        /* In-progress header */
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-bold">Social Quests</h3>
            <span className="text-xs text-neutral-500">·</span>
            <div className="flex items-center gap-1">
              <CreditsCoin className="w-3.5 h-3.5" />
              <span className="text-xs text-neutral-400">{remainingCredits.toLocaleString()} credits available</span>
            </div>
          </div>
        </div>
      )}

      {(allClaimed && collapsed) ? null : SOCIAL_QUEST_CONFIGS.map((cfg) => {
        const quest = questMap[cfg.questId];
        if (!quest) return null;

        const isComplete = quest.isCompleted;
        const isClaimed = quest.isClaimed;
        const canClaim = isComplete && !isClaimed;
        const isVerifying = verifyingQuest === cfg.questId;
        const hasActed = actionTaken[cfg.questId];

        let btnLabel: React.ReactNode = null;
        let btnAction: (() => void) | undefined;
        let btnDisabled = false;
        let btnStyle = 'bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700';

        if (isClaimed) {
          // no button
        } else if (canClaim) {
          btnLabel = 'Claim';
          btnAction = () => handleClaim(quest.id);
          btnStyle = 'bg-emerald-600 hover:bg-emerald-700 text-white';
        } else if (isVerifying) {
          btnLabel = <><FiLoader className="w-3 h-3 animate-spin" /> Verifying</>;
          btnDisabled = true;
          btnStyle = 'bg-neutral-800 text-neutral-400';
        } else if (cfg.questId === 'SOCIAL_CONNECT_X' && !isComplete) {
          btnLabel = 'Connect';
          btnAction = () => handleConnect('twitter');
        } else if (cfg.questId === 'SOCIAL_JOIN_TG' && !isComplete && !hasActed) {
          // Step 1: Open the TG group invite link so the user actually joins
          btnLabel = <>{cfg.actionLabel} <FiExternalLink className="w-3 h-3" /></>;
          btnAction = () => handleAction(cfg.questId, cfg.actionUrl);
        } else if (cfg.questId === 'SOCIAL_JOIN_TG' && !isComplete && hasActed) {
          // Step 2: Connect TG to Snag (if needed) + verify group membership
          btnLabel = 'Verify';
          btnAction = () => handleTelegramVerify();
        } else if (!isComplete && hasActed) {
          btnLabel = 'Verify';
          btnAction = () => handleVerify(cfg.questId);
        } else if (!isComplete) {
          btnLabel = <>{cfg.actionLabel} <FiExternalLink className="w-3 h-3" /></>;
          btnAction = () => handleAction(cfg.questId, cfg.actionUrl);
        }

        return (
          <div
            key={cfg.questId}
            className={`
              relative rounded-xl mb-2 last:mb-0 transition-all duration-200 overflow-hidden
              ${isClaimed
                ? 'bg-neutral-900/40 border border-neutral-800/30'
                : isComplete
                  ? 'bg-emerald-500/10 border border-emerald-500/30'
                  : 'bg-neutral-900/30 border border-neutral-800/50'
              }
            `}
          >
            <div className="relative flex items-center justify-between py-3 px-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Platform icon — no circle border, just the logo */}
                <div className="flex-shrink-0 w-5 flex items-center justify-center">
                  {isComplete ? (
                    <div className="w-5 h-5 rounded-full border-2 border-emerald-500 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] flex items-center justify-center">
                      <FiCheck className="w-3 h-3 text-black" />
                    </div>
                  ) : (
                    cfg.icon
                  )}
                </div>

                <span className="flex items-center gap-1.5">
                  <span className={`text-[14px] transition-colors truncate ${isClaimed ? 'text-neutral-600 line-through' : 'text-white'}`}>
                    {quest.title}
                  </span>
                  {cfg.tooltip && (
                    <InterstateTooltip label={cfg.tooltip}>
                      <FiInfo className={`w-3.5 h-3.5 flex-shrink-0 cursor-help ${isClaimed ? 'text-neutral-600' : 'text-neutral-500 hover:text-neutral-300'}`} />
                    </InterstateTooltip>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {/* Credits — fixed width so numbers align */}
                <div className="flex items-center gap-1.5 w-[70px] justify-end">
                  <CreditsCoin className="w-4 h-4" />
                  <span className={`font-bold text-sm ${isClaimed ? 'text-neutral-600' : isComplete ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isClaimed ? '\u2713' : `+${quest.goldReward}`}
                  </span>
                </div>

                {/* Button — fixed width so all buttons align */}
                <div className="w-[80px] flex justify-end">
                  {btnLabel ? (
                    <button
                      type="button"
                      onClick={btnAction}
                      disabled={btnDisabled}
                      className={`flex items-center justify-center gap-1 w-full py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${btnStyle}`}
                    >
                      {btnLabel}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

