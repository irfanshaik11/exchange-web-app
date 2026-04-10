/**
 * SocialQuestsSection Component
 *
 * Standalone section displaying social quests (X + Telegram) powered by Snag Solutions.
 * Rendered above Daily Quests on the Airdrop Genesis page.
 * Matches the existing QuestItem styling (progress fill, circle indicator, CreditsCoin).
 *
 * Task state machine per quest:
 *   NOT_CONNECTED → [Connect] → OAuth redirect → CONNECTED
 *   CONNECTED     → [Go/Join] → opens external link → ACTION_DONE
 *   ACTION_DONE   → [Verify]  → Snag async verification → COMPLETED
 *   COMPLETED     → [Claim]   → credits awarded → CLAIMED
 */

import React, { useCallback, useMemo, useState } from 'react';
import { FiCheck, FiExternalLink, FiLoader, FiInfo } from 'react-icons/fi';
import type { Quest } from '~/utils/arenaApi';
import InterstateTooltip from '~/components/InterstateTooltip';
import {
  useConnectSocial,
  useVerifySocialQuest,
  useClaimQuest,
} from '~/hooks/useArena';

// Credits coin — matches the existing CreditsCoin in airdrop-genesis.tsx
const CreditsCoin = ({ className = '' }: { className?: string }) => (
  <img src="/ranks/Coin.png" alt="Credits" className={`${className} object-contain`} />
);

// X (Twitter) logo — white to match dark theme
const XIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

// Telegram logo
const TelegramIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

// ============================================================
// SOCIAL QUEST CONFIG
// ============================================================

interface SocialQuestConfig {
  questId: string;
  platform: 'twitter' | 'telegram';
  icon: React.ReactNode;
  actionLabel: string;
  actionUrl?: string;
}

const SOCIAL_QUEST_CONFIGS: SocialQuestConfig[] = [
  {
    questId: 'SOCIAL_CONNECT_X',
    platform: 'twitter',
    icon: <XIcon className="w-4 h-4 text-white" />,
    actionLabel: 'Connect',
  },
  {
    questId: 'SOCIAL_FOLLOW_X',
    platform: 'twitter',
    icon: <XIcon className="w-4 h-4 text-white" />,
    actionLabel: 'Follow',
    actionUrl: 'https://twitter.com/intersatefdn',
  },
  {
    questId: 'SOCIAL_ENGAGE_POST',
    platform: 'twitter',
    icon: <XIcon className="w-4 h-4 text-white" />,
    actionLabel: 'Like / RT',
    actionUrl: 'https://twitter.com/intersatefdn',
  },
  {
    questId: 'SOCIAL_JOIN_TG',
    platform: 'telegram',
    icon: <TelegramIcon className="w-4 h-4 text-[#27A7E7]" />,
    actionLabel: 'Join',
    actionUrl: 'https://t.me/interstate_community',
  },
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

  // Track which quests have had external action taken (user clicked Go/Join)
  const [actionTaken, setActionTaken] = useState<Record<string, boolean>>({});
  // Track which quest is currently verifying
  const [verifyingQuest, setVerifyingQuest] = useState<string | null>(null);

  // Build questId → Quest map
  const questMap = useMemo(() => {
    const map: Record<string, Quest> = {};
    quests.forEach(q => { map[q.questId] = q; });
    return map;
  }, [quests]);

  const allClaimed = useMemo(() => {
    return SOCIAL_QUEST_CONFIGS.every(cfg => questMap[cfg.questId]?.isClaimed);
  }, [questMap]);

  // Handlers
  const handleConnect = useCallback(async (platform: 'twitter' | 'telegram') => {
    const result = await connectSocial.mutateAsync(platform);
    if (result.oauthUrl) {
      window.open(result.oauthUrl, '_blank', 'noopener,noreferrer');
    }
  }, [connectSocial]);

  const handleAction = useCallback((questId: string, url?: string) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    setActionTaken(prev => ({ ...prev, [questId]: true }));
  }, []);

  const handleVerify = useCallback(async (questId: string) => {
    setVerifyingQuest(questId);
    try {
      await verifySocialQuest.mutateAsync(questId);
    } finally {
      setVerifyingQuest(null);
    }
  }, [verifySocialQuest]);

  const handleClaim = useCallback((questDbId: number) => {
    claimQuest.mutate(questDbId);
  }, [claimQuest]);

  // If all quests are claimed, show collapsed banner
  if (allClaimed) {
    return (
      <div className={`mb-6 ${className}`}>
        <div className="flex items-center gap-2 mb-4">
          <FiCheck className="w-4 h-4 text-emerald-500" />
          <h3 className="text-white font-bold">Social Quests</h3>
          <span className="text-xs text-emerald-400">Complete</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`mb-6 ${className}`}>
      {/* Header — matches Daily Quests / Seasonal Quests header style */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold">Social Quests</h3>
      </div>

      {/* Quest List — matches QuestItem styling from airdrop-genesis.tsx */}
      <div className="space-y-2">
        {SOCIAL_QUEST_CONFIGS.map((cfg) => {
          const quest = questMap[cfg.questId];
          if (!quest) return null;

          const isComplete = quest.isCompleted;
          const isClaimed = quest.isClaimed;
          const canClaim = isComplete && !isClaimed;
          const isVerifying = verifyingQuest === cfg.questId;
          const hasActed = actionTaken[cfg.questId];

          // Determine button state + content
          let buttonContent: React.ReactNode;
          let buttonAction: (() => void) | undefined;
          let buttonDisabled = false;

          if (isClaimed) {
            // No button needed — shown via checkmark
            buttonContent = null;
          } else if (canClaim) {
            buttonContent = 'Claim';
            buttonAction = () => handleClaim(quest.id);
          } else if (isVerifying) {
            buttonContent = (
              <span className="flex items-center gap-1.5">
                <FiLoader className="w-3 h-3 animate-spin" /> Verifying
              </span>
            );
            buttonDisabled = true;
          } else if (cfg.questId === 'SOCIAL_CONNECT_X' && !isComplete) {
            buttonContent = 'Connect';
            buttonAction = () => handleConnect('twitter');
          } else if (!isComplete && hasActed) {
            buttonContent = 'Verify';
            buttonAction = () => handleVerify(cfg.questId);
          } else if (!isComplete) {
            buttonContent = (
              <span className="flex items-center gap-1">
                {cfg.actionLabel} <FiExternalLink className="w-3 h-3" />
              </span>
            );
            buttonAction = () => handleAction(cfg.questId, cfg.actionUrl);
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
                  {/* Circle indicator with platform icon inside */}
                  <div className={`
                    w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                    transition-all duration-300
                    ${isComplete
                      ? 'border-emerald-500 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                      : 'border-neutral-600 bg-transparent'
                    }
                  `}>
                    {isComplete ? (
                      <FiCheck className="w-3 h-3 text-black" />
                    ) : (
                      <span className="scale-75">{cfg.icon}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className={`text-[14px] transition-colors truncate ${isClaimed ? 'text-neutral-600 line-through' : 'text-white'}`}>
                        {quest.title}
                      </span>
                      {quest.description && (
                        <InterstateTooltip label={quest.description}>
                          <FiInfo className={`w-3.5 h-3.5 flex-shrink-0 cursor-help ${isClaimed ? 'text-neutral-600' : 'text-neutral-500 hover:text-neutral-300'}`} />
                        </InterstateTooltip>
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* Credits reward */}
                  <div className="flex items-center gap-1.5">
                    <CreditsCoin className="w-4 h-4" />
                    <span className={`font-bold text-sm ${isClaimed ? 'text-neutral-600' : isComplete ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {isClaimed ? '\u2713' : `+${quest.goldReward}`}
                    </span>
                  </div>

                  {/* Action button */}
                  {buttonContent && (
                    <button
                      type="button"
                      onClick={buttonAction}
                      disabled={buttonDisabled}
                      className={`
                        px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 whitespace-nowrap
                        disabled:cursor-not-allowed disabled:opacity-50
                        ${canClaim
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : isVerifying
                            ? 'bg-neutral-700 text-neutral-300'
                            : 'bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700'
                        }
                      `}
                    >
                      {buttonContent}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
