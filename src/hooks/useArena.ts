/**
 * Arena React Hooks
 *
 * Custom hooks for interacting with the Arena gamification system.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "react-hot-toast";
import {
  showQuestClaimedToast,
  showBatchClaimToast,
  showKeyTweetClaimedToast,
  showRankUpToast,
  showHonorsUpgradeToast,
  showReferralClaimToast,
  showCashbackClaimToast,
  showArenaErrorToast,
} from "~/utils/arenaToast";
import { useUser } from "~/components/UserContext";
import {
  getArenaStats,
  getQuests,
  claimQuest,
  claimAllQuests,
  getCashbackSummary,
  claimCashback,
  getGoldHistory,
  getRankDefinitions,
  setAnonymousMode,
  getLeaderboard,
  getUserPosition,
  getAllUserPositions,
  getTop3,
  getReferralStats,
  getDirectReferrals,
  getAllReferrals,
  claimReferralRewards,
  getHonorsInfo,
  getRewardHistory,
  getReferralQuests,
  getReferralTree,
  getSocialStatus,
  connectSocial,
  verifySocialQuest,
  // v2.0
  getSeasons,
  getSeasonStats,
  getCreditsSummary,
  getKeyTweets,
  claimKeyTweet,
  getRecruiterProgress,
  getSeasonLeaderboard,
  type ArenaStats,
  type Quest,
  type QuestsResponse,
  type CashbackSummary,
  type GoldTransaction,
  type RankDefinition,
  type LeaderboardResponse,
  type UserPosition,
  type ReferralStats,
  type DirectReferral,
  type AllReferral,
  type HonorsInfo,
  type ReferralReward,
  type ReferralQuest,
  type SocialStatus,
  type Season,
  type SeasonStatsResponse,
  type CreditsSummary,
  type KeyTweet,
  type RecruiterProgress,
  type SeasonLeaderboardResponse,
} from '~/utils/arenaApi';

// ============================================================
// ARENA STATS HOOK
// ============================================================

export function useArenaStats() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["arena", "stats", user?.id],
    queryFn: () => getArenaStats(user!.bearerToken),
    enabled: !!user?.bearerToken,
    staleTime: Infinity,
    refetchInterval: 5 * 60 * 1000,
    // 'always' overrides the staleTime-gated behavior of refetchOnMount: true.
    // Required because this app persists the React Query cache to localStorage
    // (src/lib/queryClient.ts) — without 'always' the restored cache is
    // considered fresh-forever and never re-syncs with the server on reload.
    refetchOnMount: 'always',
  });
}

// ============================================================
// QUESTS HOOKS
// ============================================================

export function useQuests(
  type?: "DAILY" | "SEASONAL" | "REFERRAL" | "SPECIAL",
) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["arena", "quests", user?.id, type],
    queryFn: () => getQuests(user!.bearerToken, type),
    enabled: !!user?.bearerToken,
    staleTime: Infinity,
    refetchInterval: 5 * 60 * 1000,
    refetchOnMount: 'always', // override persister-cache-restoration (see useArenaStats)
  });
}

export function useClaimQuest() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (questId: number) => claimQuest(user!.bearerToken, questId),
    onMutate: async (questId: number) => {
      const userId = user?.id;
      const questsKey = ["arena", "quests", userId] as const;
      const statsKey = ["arena", "stats", userId] as const;

      await queryClient.cancelQueries({ queryKey: questsKey });
      await queryClient.cancelQueries({ queryKey: statsKey });

      const prevQuestsEntries = queryClient.getQueriesData<QuestsResponse>({ queryKey: questsKey });
      const prevStats = queryClient.getQueryData<ArenaStats>(statsKey);

      let goldReward = 0;
      for (const [, data] of prevQuestsEntries) {
        const found = data?.quests?.find((q) => q.id === questId);
        if (found) {
          goldReward = found.goldReward ?? 0;
          break;
        }
      }

      queryClient.setQueriesData<QuestsResponse>({ queryKey: questsKey }, (old) => {
        if (!old) return old;
        const flip = (q: Quest): Quest =>
          q.id === questId
            ? { ...q, isClaimed: true, claimedAt: q.claimedAt ?? new Date().toISOString() }
            : q;
        return {
          ...old,
          quests: old.quests.map(flip),
          grouped: {
            daily: old.grouped.daily.map(flip),
            seasonal: old.grouped.seasonal.map(flip),
            referral: old.grouped.referral.map(flip),
            special: old.grouped.special.map(flip),
          },
        };
      });

      if (prevStats && goldReward > 0) {
        queryClient.setQueryData<ArenaStats>(statsKey, {
          ...prevStats,
          goldAvailable: prevStats.goldAvailable + goldReward,
          goldEarned: prevStats.goldEarned + goldReward,
          questsCompletedToday: prevStats.questsCompletedToday,
        });
      }

      return { prevQuestsEntries, prevStats, questsKey, statsKey };
    },
    onError: (error: Error, _questId, ctx) => {
      if (ctx) {
        for (const [key, data] of ctx.prevQuestsEntries) {
          queryClient.setQueryData(key, data);
        }
        if (ctx.prevStats !== undefined) {
          queryClient.setQueryData(ctx.statsKey, ctx.prevStats);
        }
      }
      showArenaErrorToast(error.message || "Failed to claim quest");
    },
    onSuccess: (data) => {
      if (data.goldAwarded) {
        showQuestClaimedToast(data.goldAwarded);
      }
      if (data.honorsUpgrade) {
        showHonorsUpgradeToast(data.honorsUpgrade);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["arena", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "quests"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "cashback"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "gold-history"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "credits-summary"] });
    },
  });
}

/**
 * Claim all completed-but-unclaimed quests in a single server transaction.
 *
 * Backend is atomic: all claim rows commit together or none do. Optimistic UI
 * flips every cached ready quest to claimed and bumps stats by the sum of
 * goldReward. Full snapshot rollback on error.
 */
export function useClaimAllQuests() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => claimAllQuests(user!.bearerToken),
    onMutate: async () => {
      const userId = user?.id;
      const questsKey = ["arena", "quests", userId] as const;
      const statsKey = ["arena", "stats", userId] as const;

      await queryClient.cancelQueries({ queryKey: questsKey });
      await queryClient.cancelQueries({ queryKey: statsKey });

      const prevQuestsEntries = queryClient.getQueriesData<QuestsResponse>({ queryKey: questsKey });
      const prevStats = queryClient.getQueryData<ArenaStats>(statsKey);

      let totalGoldReward = 0;
      const readyIds = new Set<number>();
      for (const [, data] of prevQuestsEntries) {
        if (!data?.quests) continue;
        for (const q of data.quests) {
          if (q.isCompleted && !q.isClaimed && !readyIds.has(q.id)) {
            readyIds.add(q.id);
            totalGoldReward += q.goldReward ?? 0;
          }
        }
      }

      queryClient.setQueriesData<QuestsResponse>({ queryKey: questsKey }, (old) => {
        if (!old) return old;
        const flipIfReady = (q: Quest): Quest =>
          readyIds.has(q.id)
            ? { ...q, isClaimed: true, claimedAt: q.claimedAt ?? new Date().toISOString() }
            : q;
        return {
          ...old,
          quests: old.quests.map(flipIfReady),
          grouped: {
            daily: old.grouped.daily.map(flipIfReady),
            seasonal: old.grouped.seasonal.map(flipIfReady),
            referral: old.grouped.referral.map(flipIfReady),
            special: old.grouped.special.map(flipIfReady),
          },
        };
      });

      if (prevStats && totalGoldReward > 0) {
        queryClient.setQueryData<ArenaStats>(statsKey, {
          ...prevStats,
          goldAvailable: prevStats.goldAvailable + totalGoldReward,
          goldEarned: prevStats.goldEarned + totalGoldReward,
        });
      }

      return { prevQuestsEntries, prevStats, questsKey, statsKey };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx) {
        for (const [key, data] of ctx.prevQuestsEntries) {
          queryClient.setQueryData(key, data);
        }
        if (ctx.prevStats !== undefined) {
          queryClient.setQueryData(ctx.statsKey, ctx.prevStats);
        }
      }
      showArenaErrorToast(error.message || "Failed to claim all quests");
    },
    onSuccess: (data) => {
      if (data.success && data.totalGoldAwarded > 0) {
        showBatchClaimToast(data.claimedCount, data.totalGoldAwarded);
      }
      if (data.rankUp && data.newRank) {
        showRankUpToast(data.newRank, data.newLevel);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["arena", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "quests"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "cashback"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "gold-history"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "credits-summary"] });
    },
  });
}

// ============================================================
// CASHBACK HOOKS
// ============================================================

export function useCashbackSummary() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["arena", "cashback", user?.id],
    queryFn: () => getCashbackSummary(user!.bearerToken),
    enabled: !!user?.bearerToken,
    staleTime: 30 * 1000,
    refetchInterval: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useClaimCashback() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => claimCashback(user!.bearerToken),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["arena", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "cashback"] });
      if (data.success && data.amountClaimed > 0) {
        showCashbackClaimToast(data.amountClaimed, data.txSignature);
      }
    },
    onError: (error: Error) => {
      showArenaErrorToast(error.message || "Failed to claim cashback");
    },
  });
}

// ============================================================
// GOLD HISTORY HOOK
// ============================================================

export function useGoldHistory(
  options: { limit?: number; offset?: number; type?: string } = {},
) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["arena", "gold-history", user?.id, options],
    queryFn: () => getGoldHistory(user!.bearerToken, options),
    enabled: !!user?.bearerToken,
    staleTime: 30 * 1000,
    refetchInterval: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

// ============================================================
// RANK DEFINITIONS HOOK
// ============================================================

export function useRankDefinitions() {
  return useQuery({
    queryKey: ["arena", "ranks"],
    queryFn: getRankDefinitions,
    staleTime: 5 * 60 * 1000, // 5 minutes (these rarely change)
  });
}

// ============================================================
// ANONYMOUS MODE HOOK
// ============================================================

export function useSetAnonymousMode() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (isAnonymous: boolean) =>
      setAnonymousMode(user!.bearerToken, isAnonymous),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["arena", "stats"] });
      toast.success(
        data.isAnonymous
          ? "🔒 You are now anonymous on the leaderboard"
          : "👁️ Your username is now visible on the leaderboard",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update anonymity setting");
    },
  });
}

// ============================================================
// LEADERBOARD HOOKS
// ============================================================

// Consistent casing across every leaderboard hook: lowercase category
// (matches the URL path segment convention) and uppercase period (matches
// the UI state type used on the leaderboard page). This removes the
// asymmetric `.toUpperCase()` / `.toLowerCase()` casts that previously lived
// inside useLeaderboardPageData.
export type LeaderboardCategory = "points" | "pnl" | "volume";
export type LeaderboardPeriod = "DAILY" | "MONTHLY" | "LIFETIME";

export function useLeaderboard(
  type: LeaderboardCategory,
  period: LeaderboardPeriod,
  options: { limit?: number; offset?: number; search?: string } = {},
) {
  return useQuery({
    queryKey: ["leaderboard", type, period, options],
    queryFn: () => getLeaderboard(type, period, options),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    // Keep the previous page visible while the next one is in flight so
    // tab switches / pagination / debounced search don't flash an empty
    // state between requests.
    placeholderData: keepPreviousData,
  });
}

export function useUserLeaderboardPosition(
  type: LeaderboardCategory,
  period: LeaderboardPeriod,
) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["leaderboard", "position", user?.id, type, period],
    queryFn: () => getUserPosition(user!.bearerToken, type, period),
    enabled: !!user?.bearerToken,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useAllUserPositions() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["leaderboard", "all-positions", user?.id],
    queryFn: () => getAllUserPositions(user!.bearerToken),
    enabled: !!user?.bearerToken,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useTop3(type: LeaderboardCategory, period: LeaderboardPeriod) {
  return useQuery({
    queryKey: ["leaderboard", "top3", type, period],
    queryFn: () => getTop3(type, period),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

// ============================================================
// REFERRAL HOOKS
// ============================================================

export function useReferralStats() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["referrals", "stats", user?.id],
    queryFn: () => getReferralStats(user!.bearerToken),
    enabled: !!user?.bearerToken,
    staleTime: Infinity,
    refetchInterval: 5 * 60 * 1000,
    refetchOnMount: 'always', // override persister-cache-restoration (see useArenaStats)
  });
}

export function useDirectReferrals(
  options: { limit?: number; offset?: number; search?: string } = {},
) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["referrals", "direct", user?.id, options],
    queryFn: () => getDirectReferrals(user!.bearerToken, options),
    enabled: !!user?.bearerToken,
    staleTime: 30 * 1000,
    refetchInterval: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useAllReferrals(
  options: { limit?: number; offset?: number; search?: string } = {},
) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["referrals", "all", user?.id, options],
    queryFn: () => getAllReferrals(user!.bearerToken, options),
    enabled: !!user?.bearerToken,
    staleTime: Infinity,
    refetchInterval: 5 * 60 * 1000,
    refetchOnMount: 'always', // override persister-cache-restoration (see useArenaStats)
  });
}

export function useClaimReferralRewards() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => claimReferralRewards(user!.bearerToken),
    onMutate: async () => {
      const userId = user?.id;
      const refStatsKey = ["referrals", "stats", userId] as const;
      const arenaStatsKey = ["arena", "stats", userId] as const;

      await queryClient.cancelQueries({ queryKey: refStatsKey });
      await queryClient.cancelQueries({ queryKey: arenaStatsKey });

      const prevRefStats = queryClient.getQueryData<ReferralStats>(refStatsKey);
      const prevArenaStats = queryClient.getQueryData<ArenaStats>(arenaStatsKey);

      const pending = (prevRefStats as any)?.pendingSolRewards ?? 0;
      if (prevRefStats && pending > 0) {
        queryClient.setQueryData<ReferralStats>(refStatsKey, {
          ...prevRefStats,
          pendingSolRewards: 0,
          lifetimeEarnings: ((prevRefStats as any).lifetimeEarnings ?? 0) + pending,
        } as ReferralStats);
      }
      if (prevArenaStats && pending > 0) {
        queryClient.setQueryData<ArenaStats>(arenaStatsKey, {
          ...prevArenaStats,
          solReferralAvailable: Math.max(0, prevArenaStats.solReferralAvailable - pending),
          solReferralEarned: prevArenaStats.solReferralEarned + pending,
        });
      }

      return { prevRefStats, prevArenaStats, refStatsKey, arenaStatsKey };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx) {
        if (ctx.prevRefStats !== undefined) {
          queryClient.setQueryData(ctx.refStatsKey, ctx.prevRefStats);
        }
        if (ctx.prevArenaStats !== undefined) {
          queryClient.setQueryData(ctx.arenaStatsKey, ctx.prevArenaStats);
        }
      }
      showArenaErrorToast(error.message || "Failed to claim referral rewards");
    },
    onSuccess: (data) => {
      if (data.success && data.amountClaimed > 0) {
        showReferralClaimToast(data.amountClaimed, data.txSignature);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["arena", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "credits-summary"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "cashback"] });
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
    },
  });
}

export function useHonorsInfo() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["referrals", "honors", user?.id],
    queryFn: () => getHonorsInfo(user!.bearerToken),
    enabled: !!user?.bearerToken,
    staleTime: Infinity,
    refetchInterval: 5 * 60 * 1000,
    refetchOnMount: 'always', // override persister-cache-restoration (see useArenaStats)
  });
}

export function useRewardHistory(
  options: { limit?: number; offset?: number } = {},
) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["referrals", "rewards", user?.id, options],
    queryFn: () => getRewardHistory(user!.bearerToken, options),
    enabled: !!user?.bearerToken,
    staleTime: 30 * 1000,
    refetchInterval: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useReferralQuests() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["referrals", "quests", user?.id],
    queryFn: () => getReferralQuests(user!.bearerToken),
    enabled: !!user?.bearerToken,
    staleTime: 30 * 1000,
    refetchInterval: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useReferralTree() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["referrals", "tree", user?.id],
    queryFn: () => getReferralTree(user!.bearerToken),
    enabled: !!user?.bearerToken,
    staleTime: 60 * 1000,
    refetchInterval: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

// ============================================================
// COMBINED DATA HOOK
// ============================================================

/**
 * Combined hook for the main Arena page
 * Fetches stats, quests, and cashback in parallel
 */
export function useArenaPageData() {
  const stats = useArenaStats();
  const quests = useQuests();
  const cashback = useCashbackSummary();
  const ranks = useRankDefinitions();

  return {
    stats,
    quests,
    cashback,
    ranks,
    isLoading:
      stats.isLoading ||
      quests.isLoading ||
      cashback.isLoading ||
      ranks.isLoading,
    isError:
      stats.isError || quests.isError || cashback.isError || ranks.isError,
    error: stats.error || quests.error || cashback.error || ranks.error,
    refetch: () => {
      stats.refetch();
      quests.refetch();
      cashback.refetch();
    },
  };
}

/**
 * Combined hook for the Referrals page
 */
export function useReferralsPageData() {
  const stats = useReferralStats();
  const honors = useHonorsInfo();
  const quests = useQuests("REFERRAL");

  return {
    stats,
    honors,
    quests,
    isLoading: stats.isLoading || honors.isLoading || quests.isLoading,
    isError: stats.isError || honors.isError || quests.isError,
    error: stats.error || honors.error || quests.error,
    refetch: () => {
      stats.refetch();
      honors.refetch();
      quests.refetch();
    },
  };
}

/**
 * Combined hook for the Leaderboard page
 */
export function useLeaderboardPageData(
  type: LeaderboardCategory,
  period: LeaderboardPeriod,
  options: { limit?: number; offset?: number; search?: string } = {},
) {
  const leaderboard = useLeaderboard(type, period, options);
  const position = useUserLeaderboardPosition(type, period);
  const top3 = useTop3(type, period);

  return {
    leaderboard,
    position,
    top3,
    isLoading: leaderboard.isLoading || position.isLoading || top3.isLoading,
    isError: leaderboard.isError || position.isError || top3.isError,
    error: leaderboard.error || position.error || top3.error,
    refetch: () => {
      leaderboard.refetch();
      position.refetch();
      top3.refetch();
    },
  };
}

// ============================================================
// SOCIAL QUEST HOOKS (Snag-powered)
// ============================================================

export function useSocialStatus() {
  const { user } = useUser();

  return useQuery({
    queryKey: ['arena', 'social-status', user?.id],
    queryFn: () => getSocialStatus(user!.bearerToken),
    enabled: !!user?.bearerToken,
    staleTime: 30 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useConnectSocial() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (platform: 'twitter' | 'telegram') =>
      connectSocial(user!.bearerToken, platform),
    onSuccess: (data) => {
      if (data.connected) {
        queryClient.invalidateQueries({ queryKey: ['arena', 'social-status'] });
        queryClient.invalidateQueries({ queryKey: ['arena', 'quests'] });
        toast.success(`${data.platform === 'twitter' ? 'X' : 'Telegram'} account connected!`);
      }
      // If oauthUrl is returned, the component handles the redirect
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to connect account');
    },
  });
}

export function useVerifySocialQuest() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (questId: string) =>
      verifySocialQuest(user!.bearerToken, questId),
    onSuccess: (data) => {
      if (data.verified) {
        queryClient.invalidateQueries({ queryKey: ['arena', 'quests'] });
        queryClient.invalidateQueries({ queryKey: ['arena', 'social-status'] });
        toast.success(data.message || 'Task verified! Claim your gold.');
      }
    },
    onError: (error: Error) => {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('twitter not connected') || msg.includes('x not connected')) {
        toast.error(
          'This X account may already be linked to another Interstate user. Please use a different account.',
          { duration: 6000 }
        );
      } else if (msg.includes('telegram not connected')) {
        toast.error(
          'This Telegram account may already be linked to another Interstate user. Please use a different account.',
          { duration: 6000 }
        );
      } else {
        toast.error(error.message || 'Verification failed — did you complete the task?');
      }
    },
  });
}

// ============================================================
// v2.0 — SEASONS / CREDITS SUMMARY / KEY TWEETS / RECRUITER
// ============================================================

/**
 * Always-on credits summary for the header chip.
 * Polls every 30s; refreshes on quest-claim via queryClient.invalidateQueries.
 */
export function useCreditsSummary() {
  const { user } = useUser();
  return useQuery<CreditsSummary>({
    queryKey: ['arena', 'credits-summary', user?.id],
    queryFn: () => getCreditsSummary(user!.bearerToken),
    enabled: !!user?.bearerToken,
    staleTime: Infinity,
    refetchInterval: 5 * 60 * 1000,
    refetchOnMount: 'always', // override persister-cache-restoration (see useArenaStats)
  });
}

/** All seasons + which is active. Cached for 5 minutes (dates don't change). */
export function useSeasons() {
  const { user } = useUser();
  return useQuery<{ seasons: Season[]; activeSeasonId: number | null }>({
    queryKey: ['arena', 'seasons'],
    queryFn: () => getSeasons(user!.bearerToken),
    enabled: !!user?.bearerToken,
    staleTime: 5 * 60_000,
  });
}

/** User's per-season stats (drives the Preseason | S1 | S2 | S3 selector). */
export function useSeasonStats() {
  const { user } = useUser();
  return useQuery<SeasonStatsResponse>({
    queryKey: ['arena', 'season-stats', user?.id],
    queryFn: () => getSeasonStats(user!.bearerToken),
    enabled: !!user?.bearerToken,
    staleTime: 60_000,
  });
}

/** Active curated tweets for current season + this user's claim status. */
export function useKeyTweets() {
  const { user } = useUser();
  return useQuery<{ tweets: KeyTweet[] }>({
    queryKey: ['arena', 'key-tweets', user?.id],
    queryFn: () => getKeyTweets(user!.bearerToken),
    enabled: !!user?.bearerToken,
    staleTime: Infinity,
    refetchInterval: 5 * 60 * 1000,
    refetchOnMount: 'always', // override persister-cache-restoration (see useArenaStats)
  });
}

/**
 * Claim a key tweet — optimistically marks the tweet as claimed and bumps
 * credits by its reward. Full rollback on error via cached snapshot.
 */
export function useClaimKeyTweet() {
  const qc = useQueryClient();
  const { user } = useUser();
  return useMutation<
    { success: boolean; creditsAwarded?: number; error?: string },
    Error,
    number,
    {
      prevTweets: { tweets: KeyTweet[] } | undefined;
      prevCredits: CreditsSummary | undefined;
      tweetsKey: readonly unknown[];
      creditsKey: readonly unknown[];
      creditsAwarded: number;
    }
  >({
    mutationFn: (keyTweetId: number) => claimKeyTweet(user!.bearerToken, keyTweetId),
    onMutate: async (keyTweetId) => {
      const userId = user?.id;
      const tweetsKey = ["arena", "key-tweets", userId] as const;
      const creditsKey = ["arena", "credits-summary", userId] as const;

      await qc.cancelQueries({ queryKey: tweetsKey });
      await qc.cancelQueries({ queryKey: creditsKey });

      const prevTweets = qc.getQueryData<{ tweets: KeyTweet[] }>(tweetsKey);
      const prevCredits = qc.getQueryData<CreditsSummary>(creditsKey);

      const found = prevTweets?.tweets?.find((t: any) => t.id === keyTweetId || t.keyTweetId === keyTweetId);
      const creditsAwarded = (found as any)?.creditsReward ?? (found as any)?.credits ?? 0;

      if (prevTweets) {
        qc.setQueryData<{ tweets: KeyTweet[] }>(tweetsKey, {
          ...prevTweets,
          tweets: prevTweets.tweets.map((t: any) =>
            t.id === keyTweetId || t.keyTweetId === keyTweetId
              ? { ...t, isClaimed: true, claimedAt: t.claimedAt ?? new Date().toISOString() }
              : t,
          ),
        });
      }
      if (prevCredits && creditsAwarded > 0) {
        qc.setQueryData<CreditsSummary>(creditsKey, {
          ...prevCredits,
          creditsAvailable: ((prevCredits as any).creditsAvailable ?? 0) + creditsAwarded,
          creditsEarned: ((prevCredits as any).creditsEarned ?? 0) + creditsAwarded,
        } as CreditsSummary);
      }

      return { prevTweets, prevCredits, tweetsKey, creditsKey, creditsAwarded };
    },
    onError: (err: any, _keyTweetId, ctx) => {
      if (ctx) {
        if (ctx.prevTweets !== undefined) qc.setQueryData(ctx.tweetsKey, ctx.prevTweets);
        if (ctx.prevCredits !== undefined) qc.setQueryData(ctx.creditsKey, ctx.prevCredits);
      }
      showArenaErrorToast(err?.message || "Claim failed");
    },
    onSuccess: (res) => {
      if (res?.success && res.creditsAwarded) {
        showKeyTweetClaimedToast(res.creditsAwarded);
      } else if (res?.error) {
        showArenaErrorToast(res.error);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["arena", "key-tweets"] });
      qc.invalidateQueries({ queryKey: ["arena", "credits-summary"] });
      qc.invalidateQueries({ queryKey: ["arena", "stats"] });
      qc.invalidateQueries({ queryKey: ["arena", "cashback"] });
    },
  });
}

/** Recruiter milestone progress for the referrals page. */
export function useRecruiterProgress() {
  const { user } = useUser();
  return useQuery<RecruiterProgress>({
    queryKey: ['arena', 'recruiter-progress', user?.id],
    queryFn: () => getRecruiterProgress(user!.bearerToken),
    enabled: !!user?.bearerToken,
    staleTime: 60_000,
  });
}

/** Season-scoped leaderboard (top 100 of active season by default). */
export function useSeasonLeaderboard(opts: { seasonId?: number; limit?: number } = {}) {
  const { user } = useUser();
  return useQuery<SeasonLeaderboardResponse>({
    queryKey: ['arena', 'leaderboard', 'season', opts.seasonId ?? 'active', opts.limit ?? 100],
    queryFn: () => getSeasonLeaderboard(user!.bearerToken, opts),
    enabled: !!user?.bearerToken,
    staleTime: 30_000,
  });
}
