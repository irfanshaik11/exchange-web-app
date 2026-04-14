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
import { useUser } from "~/components/UserContext";
import {
  getArenaStats,
  getQuests,
  claimQuest,
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
  type ArenaStats,
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
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
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
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useClaimQuest() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (questId: number) => claimQuest(user!.bearerToken, questId),
    onSuccess: (data) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["arena", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "quests"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "cashback"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "gold-history"] });

      // Show success toast
      if (data.goldAwarded) {
        toast.success(`🏆 Claimed ${data.goldAwarded.toLocaleString()} Gold!`, {
          duration: 4000,
        });
      }
      if (data.honorsUpgrade) {
        toast.success(`🎖️ Upgraded to ${data.honorsUpgrade}!`, {
          duration: 5000,
        });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to claim quest");
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
        toast.success(
          `💰 Claimed ${data.amountClaimed.toFixed(6)} SOL!${data.txSignature ? " Check Solscan for details." : ""}`,
          { duration: 6000 },
        );
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to claim cashback");
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
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
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
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useClaimReferralRewards() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => claimReferralRewards(user!.bearerToken),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["arena", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
      if (data.success && data.amountClaimed > 0) {
        // Show success toast - the txSignature is returned for Solscan link
        // The referrals page component will handle showing the link
        toast.success(
          `✅ Claimed ${data.amountClaimed.toFixed(4)} SOL!${data.txSignature ? " Check Solscan for details." : ""}`,
          { duration: 6000 },
        );
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to claim referral rewards");
    },
  });
}

export function useHonorsInfo() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["referrals", "honors", user?.id],
    queryFn: () => getHonorsInfo(user!.bearerToken),
    enabled: !!user?.bearerToken,
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
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
