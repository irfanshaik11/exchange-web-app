/**
 * SocialQuestsSection Component
 *
 * Standalone card displaying social quests (X + Telegram) powered by Snag Solutions.
 * Rendered above Daily Quests on the Outpost page.
 *
 * Task state machine per quest:
 *   NOT_CONNECTED → [Connect] → OAuth redirect → CONNECTED
 *   CONNECTED     → [Go/Join] → opens external link → ACTION_DONE
 *   ACTION_DONE   → [Verify]  → Snag async verification → COMPLETED
 *   COMPLETED     → [Claim]   → gold awarded → CLAIMED
 */

import React, { useCallback, useMemo, useState } from 'react';
import { FiCheck, FiExternalLink, FiLoader } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi';
import type { Quest } from '~/utils/arenaApi';
import GoldDisplay from '../common/GoldDisplay';
import InterstateButton from '~/components/InterstateButton';
import {
  useConnectSocial,
  useVerifySocialQuest,
  useClaimQuest,
} from '~/hooks/useArena';

// ============================================================
// SOCIAL QUEST CONFIG
// ============================================================

interface SocialQuestConfig {
  questId: string;
  platform: 'twitter' | 'telegram';
  icon: React.ReactNode;
  actionLabel: string;
  actionUrl?: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  accentRing: string;
}

const SOCIAL_QUEST_CONFIGS: SocialQuestConfig[] = [
  {
    questId: 'SOCIAL_CONNECT_X',
    platform: 'twitter',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    actionLabel: 'Connect',
    accentColor: 'text-blue-400',
    accentBg: 'bg-blue-500/10',
    accentBorder: 'border-blue-500/30',
    accentRing: 'ring-blue-500/20',
  },
  {
    questId: 'SOCIAL_FOLLOW_X',
    platform: 'twitter',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    actionLabel: 'Follow',
    actionUrl: 'https://twitter.com/intersatefdn',
    accentColor: 'text-blue-400',
    accentBg: 'bg-blue-500/10',
    accentBorder: 'border-blue-500/30',
    accentRing: 'ring-blue-500/20',
  },
  {
    questId: 'SOCIAL_ENGAGE_POST',
    platform: 'twitter',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    actionLabel: 'Like / RT',
    actionUrl: 'https://twitter.com/intersatefdn',
    accentColor: 'text-blue-400',
    accentBg: 'bg-blue-500/10',
    accentBorder: 'border-blue-500/30',
    accentRing: 'ring-blue-500/20',
  },
  {
    questId: 'SOCIAL_JOIN_TG',
    platform: 'telegram',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
    actionLabel: 'Join',
    actionUrl: 'https://t.me/interstate_community',
    accentColor: 'text-sky-400',
    accentBg: 'bg-sky-500/10',
    accentBorder: 'border-sky-500/30',
    accentRing: 'ring-sky-500/20',
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
  // Track which quest is currently verifying (for loading state)
  const [verifyingQuest, setVerifyingQuest] = useState<string | null>(null);

  // Build a map of questId → Quest for quick lookup
  const questMap = useMemo(() => {
    const map: Record<string, Quest> = {};
    quests.forEach(q => { map[q.questId] = q; });
    return map;
  }, [quests]);

  // Calculate total gold (claimed + unclaimed)
  const totalGold = useMemo(() => {
    return SOCIAL_QUEST_CONFIGS.reduce((sum, cfg) => {
      const q = questMap[cfg.questId];
      return sum + (q ? q.goldReward : 0);
    }, 0);
  }, [questMap]);

  const claimedGold = useMemo(() => {
    return SOCIAL_QUEST_CONFIGS.reduce((sum, cfg) => {
      const q = questMap[cfg.questId];
      return sum + (q?.isClaimed ? q.goldReward : 0);
    }, 0);
  }, [questMap]);

  const allClaimed = claimedGold >= totalGold && totalGold > 0;

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
      <div className={`mb-4 p-3 rounded-xl border border-emerald-500/20 bg-emerald-900/10 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiCheck className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-300">Social Quests Complete</span>
          </div>
          <GoldDisplay amount={totalGold * goldMultiplier} size="sm" />
        </div>
      </div>
    );
  }

  return (
    <div className={`mb-6 rounded-2xl border border-neutral-800/50 bg-neutral-950/80 backdrop-blur-md overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <HiSparkles className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-bold text-white tracking-tight">Social Quests</h3>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <GoldDisplay amount={claimedGold * goldMultiplier} size="sm" />
            <span className="text-neutral-500">/</span>
            <GoldDisplay amount={totalGold * goldMultiplier} size="sm" />
          </div>
        </div>
        <p className="text-xs text-neutral-400">Connect your socials & earn bonus gold!</p>
      </div>

      {/* Quest List */}
      <div className="px-4 pb-4 space-y-2">
        {SOCIAL_QUEST_CONFIGS.map((cfg, index) => {
          const quest = questMap[cfg.questId];
          if (!quest) return null;

          const canClaim = quest.isCompleted && !quest.isClaimed;
          const isVerifying = verifyingQuest === cfg.questId;
          const hasActed = actionTaken[cfg.questId];
          const estimatedGold = quest.goldReward * goldMultiplier;

          // Determine button state
          let buttonContent: React.ReactNode;
          let buttonAction: (() => void) | undefined;
          let buttonDisabled = false;
          let buttonClass = '';

          if (quest.isClaimed) {
            buttonContent = (
              <span className="flex items-center gap-1">
                <FiCheck className="w-4 h-4" /> Claimed
              </span>
            );
            buttonDisabled = true;
            buttonClass = 'bg-neutral-800 text-neutral-500 cursor-default';
          } else if (canClaim) {
            buttonContent = 'Claim';
            buttonAction = () => handleClaim(quest.id);
            buttonClass = 'bg-emerald-600 hover:bg-emerald-700 text-white';
          } else if (isVerifying) {
            buttonContent = (
              <span className="flex items-center gap-1.5">
                <FiLoader className="w-3.5 h-3.5 animate-spin" /> Verifying
              </span>
            );
            buttonDisabled = true;
            buttonClass = 'bg-neutral-700 text-neutral-300';
          } else if (cfg.questId === 'SOCIAL_CONNECT_X' && !quest.isCompleted) {
            // Connect X — needs OAuth
            buttonContent = 'Connect';
            buttonAction = () => handleConnect('twitter');
            buttonClass = 'bg-blue-600 hover:bg-blue-700 text-white';
          } else if (cfg.questId === 'SOCIAL_JOIN_TG' && !quest.isCompleted) {
            if (hasActed) {
              buttonContent = 'Verify';
              buttonAction = () => handleVerify(cfg.questId);
              buttonClass = `${cfg.accentBg} hover:bg-sky-500/20 ${cfg.accentColor} border ${cfg.accentBorder}`;
            } else {
              buttonContent = (
                <span className="flex items-center gap-1">
                  Join <FiExternalLink className="w-3 h-3" />
                </span>
              );
              buttonAction = () => handleAction(cfg.questId, cfg.actionUrl);
              buttonClass = 'bg-sky-600 hover:bg-sky-700 text-white';
            }
          } else if (!quest.isCompleted) {
            // X follow / engage — open link then verify
            if (hasActed) {
              buttonContent = 'Verify';
              buttonAction = () => handleVerify(cfg.questId);
              buttonClass = `${cfg.accentBg} hover:bg-blue-500/20 ${cfg.accentColor} border ${cfg.accentBorder}`;
            } else {
              buttonContent = (
                <span className="flex items-center gap-1">
                  {cfg.actionLabel} <FiExternalLink className="w-3 h-3" />
                </span>
              );
              buttonAction = () => handleAction(cfg.questId, cfg.actionUrl);
              buttonClass = 'bg-blue-600 hover:bg-blue-700 text-white';
            }
          }

          return (
            <div
              key={cfg.questId}
              className={`
                flex items-center gap-3 p-3 rounded-xl border transition-all
                ${quest.isClaimed
                  ? 'bg-black/20 border-white/5 opacity-50'
                  : canClaim
                  ? `${cfg.accentBg} ${cfg.accentBorder} ring-1 ${cfg.accentRing} shadow-[0_0_15px_rgba(59,130,246,0.1)]`
                  : 'bg-black/30 border-white/10 hover:border-white/20'
                }
              `}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Platform Icon */}
              <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${cfg.accentBg} border ${cfg.accentBorder} flex items-center justify-center ${cfg.accentColor}`}>
                {cfg.icon}
              </div>

              {/* Quest Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className={`text-sm font-medium truncate ${quest.isClaimed ? 'text-neutral-500' : 'text-white'}`}>
                    {quest.title}
                  </h4>
                  {canClaim && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded-full animate-pulse border border-emerald-500/30">
                      <HiSparkles className="w-2.5 h-2.5" />
                      Ready
                    </span>
                  )}
                </div>
                <p className={`text-xs truncate ${quest.isClaimed ? 'text-neutral-600' : 'text-neutral-400'}`}>
                  {quest.description}
                </p>
              </div>

              {/* Gold Reward */}
              <div className="flex-shrink-0 mr-1">
                <GoldDisplay
                  amount={estimatedGold}
                  size="sm"
                  multiplier={goldMultiplier > 1 ? goldMultiplier : undefined}
                />
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={buttonAction}
                disabled={buttonDisabled}
                className={`
                  flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold
                  transition-all duration-200 whitespace-nowrap
                  disabled:cursor-not-allowed
                  ${buttonClass}
                `}
              >
                {buttonContent}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
