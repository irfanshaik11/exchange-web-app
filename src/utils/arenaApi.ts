/**
 * Arena API Utilities
 *
 * Functions for interacting with the Arena gamification system API.
 */

import { env } from "../env";

// ============================================================
// TYPES
// ============================================================

export type RankName =
  | "DEGEN"
  | "WARRIOR"
  | "GLADIATOR"
  | "COMMANDER"
  | "TITAN";

export interface ArenaStats {
  userId: number;
  userName: string;
  email: string;
  rank: RankName;
  rankLevel: number;
  rankDisplay: string;
  goldAvailable: number;
  goldEarned: number;
  solCashbackAvailable: number;
  solCashbackEarned: number;
  solReferralAvailable: number;
  solReferralEarned: number;
  currentStreak: number;
  longestStreak: number;
  lastTradeDate: string | null;
  honorsLevel: number;
  totalTradingVolume: number;
  totalSolVolume: number;
  totalTradeCount: number;
  totalReferralCount: number;
  questsCompletedToday: number;
  questsCompletedLifetime: number;
  isAnonymous: boolean;
  nextLevelThreshold: number | null;
  progressToNextLevel: number;
  cashbackPercent: number;
  goldMultiplier: number;
}

export interface Quest {
  id: number;
  questId: string;
  type: "DAILY" | "SEASONAL" | "REFERRAL" | "SPECIAL";
  title: string;
  description: string;
  goldReward: number;
  honorsReward: string | null;
  currentValue: number;
  targetValue: number;
  percentComplete: number;
  isCompleted: boolean;
  isClaimed: boolean;
  completedAt: string | null;
  claimedAt: string | null;
}

export interface QuestsResponse {
  quests: Quest[];
  grouped: {
    daily: Quest[];
    seasonal: Quest[];
    referral: Quest[];
    special: Quest[];
  };
}

export interface GoldTransaction {
  id: number;
  amount: number;
  baseAmount: number;
  multiplier: number;
  type: string;
  description: string | null;
  createdAt: string;
}

export interface CashbackSummary {
  totalEarned: number;
  available: number;
  claimed: number;
  currentRate: number;
  recentRewards: Array<{
    id: number;
    amount: number;
    usdValue: number;
    percentage: number;
    rank: string;
    createdAt: string;
  }>;
}

export interface RankDefinition {
  rank: RankName;
  displayName: string;
  color: string;
  cashback: number;
  goldMultiplier: number;
  levels: Array<{ level: number; goldRequired: number }>;
}

export interface LeaderboardEntry {
  position: number;
  userId: number;
  userName: string;
  isAnonymous: boolean;
  rank: RankName;
  rankLevel: number;
  rankDisplay: string;
  // Always present on responses from the reshaped controller — used as
  // part of the React list key to disambiguate a BOT and a real USER
  // that happen to share the same numeric id.
  entityType: "USER" | "BOT";
  goldEarned?: number;
  questsCompleted?: number;
  points?: number;
  pnl?: number;
  volume?: number;
  prize: number;
}

export interface LeaderboardResponse {
  type: "POINTS" | "PNL" | "VOLUME";
  period: "DAILY" | "MONTHLY" | "LIFETIME";
  entries: LeaderboardEntry[];
  total: number;
  limit: number;
  offset: number;
  resetTime: string | null;
  countdown: {
    hours: number;
    minutes: number;
    seconds: number;
    totalSeconds: number;
  } | null;
}

export interface UserPosition {
  type: string;
  period: string;
  position: number | null;
  value: number;
  prize: number;
  percentile: number;
  isPlaced: boolean;
}

export interface ReferralStats {
  // Referral counts by tier
  directReferrals: number;
  tier1Referrals: number;
  tier2Referrals: number;
  tier3Referrals: number;
  tier4Referrals: number;
  totalReferrals: number;

  // Volume
  totalReferralVolume: number;

  // Rewards
  pendingSolRewards: number;
  claimedSolRewards: number;
  totalEarnedRewards: number;

  // Honors
  honorsLevel: number;
  honorsName: string;
  nextHonorsLevel: number | null;
  nextHonorsRequirement: number | null;
  tradersToNextTier: number | null;

  // Referral info
  referralCode: string | null;
  referralLink: string;

  // Active traders count (for Honors progression)
  activeTradersCount: number;

  // Fee discount based on Honors level
  feeDiscount?: {
    baseFeePercent: number; // 1%
    effectiveFeePercent: number; // e.g., 0.7% for Honors IV
    discountPercent: number; // e.g., 30% discount
  };
}

export interface DirectReferral {
  id: number;
  name: string;
  username: string | null;
  email: string;
  totalVolume: number;
  joinedAt: string;
  hasTraded: boolean;
  tradeCount: number;
}

// ============================================================
// API FUNCTIONS
// ============================================================

/**
 * Get the backend base URL, upgrading to HTTPS if needed
 */
function getBaseUrl(): string {
  const envUrl = env.NEXT_PUBLIC_BACKEND_URL || "";
  const stripTrailingSlash = (url: string) =>
    url.endsWith("/") ? url.slice(0, -1) : url;

  if (typeof window === "undefined") {
    return stripTrailingSlash(envUrl);
  }

  try {
    const url = new URL(envUrl || window.location.origin);
    if (window.location.protocol === "https:" && url.protocol === "http:") {
      url.protocol = "https:";
    }
    return stripTrailingSlash(url.toString());
  } catch {
    return stripTrailingSlash(window.location.origin);
  }
}

async function fetchWithAuth<T>(
  endpoint: string,
  bearerToken: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new Error(
      error.error || `Request failed with status ${response.status}`,
    );
  }

  const data = await response.json();
  return data.data as T;
}

// ============================================================
// ARENA STATS
// ============================================================

export async function getArenaStats(bearerToken: string): Promise<ArenaStats> {
  return fetchWithAuth<ArenaStats>("/api/arena/stats", bearerToken);
}

// ============================================================
// QUESTS
// ============================================================

export async function getQuests(
  bearerToken: string,
  type?: string,
): Promise<QuestsResponse> {
  const queryParams = type ? `?type=${type}` : "";
  return fetchWithAuth<QuestsResponse>(
    `/api/arena/quests${queryParams}`,
    bearerToken,
  );
}

export async function claimQuest(
  bearerToken: string,
  questId: number,
): Promise<{ goldAwarded: number; honorsUpgrade?: string }> {
  return fetchWithAuth(`/api/arena/quests/${questId}/claim`, bearerToken, {
    method: "POST",
  });
}

export async function claimAllQuests(bearerToken: string): Promise<{
  success: boolean;
  totalGoldAwarded: number;
  claimedCount: number;
  rankUp: boolean;
  newRank?: string;
  newLevel?: number;
  message: string;
}> {
  return fetchWithAuth("/api/arena/quests/claim-all", bearerToken, {
    method: "POST",
  });
}

// ============================================================
// CASHBACK
// ============================================================

export async function getCashbackSummary(
  bearerToken: string,
): Promise<CashbackSummary> {
  return fetchWithAuth<CashbackSummary>("/api/arena/cashback", bearerToken);
}

export async function claimCashback(bearerToken: string): Promise<{
  success: boolean;
  amountClaimed: number;
  txSignature?: string;
  message: string;
}> {
  return fetchWithAuth("/api/arena/cashback/claim", bearerToken, {
    method: "POST",
  });
}

// ============================================================
// GOLD HISTORY
// ============================================================

export async function getGoldHistory(
  bearerToken: string,
  options: { limit?: number; offset?: number; type?: string } = {},
): Promise<{ transactions: GoldTransaction[]; total: number }> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", options.limit.toString());
  if (options.offset) params.set("offset", options.offset.toString());
  if (options.type) params.set("type", options.type);

  const queryString = params.toString() ? `?${params.toString()}` : "";
  return fetchWithAuth(`/api/arena/gold-history${queryString}`, bearerToken);
}

// ============================================================
// RANKS
// ============================================================

export async function getRankDefinitions(): Promise<{
  ranks: RankDefinition[];
  honorsTiers: Array<{
    level: number;
    totalRevShare: number;
    layers: Array<{ layer: string; percentage: number }>;
  }>;
}> {
  const response = await fetch(`${getBaseUrl()}/api/arena/ranks`);
  const data = await response.json();
  return data.data;
}

// ============================================================
// SETTINGS
// ============================================================

export async function setAnonymousMode(
  bearerToken: string,
  isAnonymous: boolean,
): Promise<{ isAnonymous: boolean }> {
  return fetchWithAuth("/api/arena/settings/anonymous", bearerToken, {
    method: "POST",
    body: JSON.stringify({ isAnonymous }),
  });
}

// ============================================================
// LEADERBOARD
// ============================================================

export async function getLeaderboard(
  type: "points" | "pnl" | "volume",
  period: "DAILY" | "MONTHLY" | "LIFETIME",
  options: { limit?: number; offset?: number; search?: string } = {},
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams({ period });
  if (options.limit) params.set("limit", options.limit.toString());
  if (options.offset) params.set("offset", options.offset.toString());
  if (options.search) params.set("search", options.search);

  const response = await fetch(
    `${getBaseUrl()}/api/leaderboard/${type}?${params.toString()}`,
  );
  const data = await response.json();
  return data.data;
}

export async function getUserPosition(
  bearerToken: string,
  type: "points" | "pnl" | "volume",
  period: "DAILY" | "MONTHLY" | "LIFETIME",
): Promise<UserPosition> {
  // Backend parses category case-insensitively — lowercase keeps the API
  // layer consistent with getLeaderboard / getTop3 URL conventions.
  const params = new URLSearchParams({ category: type, period });
  return fetchWithAuth<UserPosition>(
    `/api/leaderboard/position?${params.toString()}`,
    bearerToken,
  );
}

export async function getAllUserPositions(bearerToken: string): Promise<{
  points: {
    daily: UserPosition;
    monthly: UserPosition;
    lifetime: UserPosition;
  };
  pnl: { daily: UserPosition; monthly: UserPosition; lifetime: UserPosition };
  volume: {
    daily: UserPosition;
    monthly: UserPosition;
    lifetime: UserPosition;
  };
}> {
  return fetchWithAuth("/api/leaderboard/my-positions", bearerToken);
}

export async function getTop3(
  type: "points" | "pnl" | "volume",
  period: "DAILY" | "MONTHLY" | "LIFETIME",
): Promise<LeaderboardEntry[]> {
  // URL path segment is conventionally lowercase; backend parses
  // case-insensitively but we normalize here at the client boundary.
  const response = await fetch(
    `${getBaseUrl()}/api/leaderboard/top3/${type}/${period.toLowerCase()}`,
  );
  const data = await response.json();
  return data.data.podium;
}

export async function getLeaderboardCountdown(
  period: "DAILY" | "MONTHLY",
): Promise<{
  countdown: {
    hours: number;
    minutes: number;
    seconds: number;
    totalSeconds: number;
  };
  formatted: string;
}> {
  const response = await fetch(
    `${getBaseUrl()}/api/leaderboard/countdown?period=${period}`,
  );
  const data = await response.json();
  return data.data;
}

// ============================================================
// REFERRALS (5-Layer Referral System)
// ============================================================

/**
 * Get comprehensive referral statistics including:
 * - Tier counts (direct + 4 layers)
 * - Volume from all referrals
 * - Pending and claimed SOL rewards
 * - Honors level and progression
 */
export async function getReferralStats(
  bearerToken: string,
): Promise<ReferralStats> {
  return fetchWithAuth<ReferralStats>("/api/referrals/stats", bearerToken);
}

/**
 * Get list of direct referrals with search and pagination
 */
export async function getDirectReferrals(
  bearerToken: string,
  options: { limit?: number; offset?: number; search?: string } = {},
): Promise<{ referrals: DirectReferral[]; total: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", options.limit.toString());
  if (options.offset) params.set("offset", options.offset.toString());
  if (options.search) params.set("search", options.search);

  const queryString = params.toString() ? `?${params.toString()}` : "";
  return fetchWithAuth(`/api/referrals/direct${queryString}`, bearerToken);
}

export interface AllReferral {
  id: number;
  name: string;
  username: string | null;
  email: string;
  tier: number;
  tierLabel: string;
  totalVolume: number;
  joinedAt: string;
  hasTraded: boolean;
  tradeCount: number;
}

/**
 * Get all referrals across all tiers with their tier information
 */
export async function getAllReferrals(
  bearerToken: string,
  options: { limit?: number; offset?: number; search?: string } = {},
): Promise<{ referrals: AllReferral[]; total: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", options.limit.toString());
  if (options.offset) params.set("offset", options.offset.toString());
  if (options.search) params.set("search", options.search);

  const queryString = params.toString() ? `?${params.toString()}` : "";
  return fetchWithAuth(`/api/referrals/all${queryString}`, bearerToken);
}

/**
 * Claim pending SOL rewards from referrals
 * Returns transaction signature on success for Solscan link
 */
export async function claimReferralRewards(bearerToken: string): Promise<{
  success: boolean;
  amountClaimed: number;
  message: string;
  txSignature?: string;
  cooldownRemaining?: number; // Seconds until next claim allowed
}> {
  return fetchWithAuth("/api/referrals/claim", bearerToken, {
    method: "POST",
  });
}

/**
 * Apply a referral code (for users who signed up without one)
 */
export async function applyReferralCode(
  bearerToken: string,
  code: string,
): Promise<{ success: boolean; message?: string }> {
  return fetchWithAuth("/api/referrals/apply", bearerToken, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

/**
 * Get Honors tier information and progression
 */
export interface HonorsInfo {
  currentLevel: number;
  currentName: string;
  currentRequirement: number;
  revSharePercentages: {
    direct: number;
    tier1: number;
    tier2: number;
    tier3: number;
    tier4: number;
  };
  totalRevShare: number;
  activeTradersCount: number;
  tradersToNextTier: number | null;
  nextTierRequirement: number | null;
  allTiers: Array<{
    level: number;
    name: string;
    requirement: number;
    revSharePercentages: {
      direct: number;
      tier1: number;
      tier2: number;
      tier3: number;
      tier4: number;
    };
    totalRevShare: number;
    isUnlocked: boolean;
    isCurrent: boolean;
  }>;
}

export async function getHonorsInfo(bearerToken: string): Promise<HonorsInfo> {
  return fetchWithAuth<HonorsInfo>("/api/referrals/honors", bearerToken);
}

/**
 * Get referral reward history
 */
export interface ReferralReward {
  id: number;
  layer: number;
  percentage: number;
  amount: number;
  amountUsd: number;
  tradeValueUsd: number | null;
  traderId: number;
  traderName: string;
  createdAt: string;
}

export async function getRewardHistory(
  bearerToken: string,
  options: { limit?: number; offset?: number } = {},
): Promise<{ rewards: ReferralReward[]; total: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", options.limit.toString());
  if (options.offset) params.set("offset", options.offset.toString());

  const queryString = params.toString() ? `?${params.toString()}` : "";
  return fetchWithAuth(`/api/referrals/rewards${queryString}`, bearerToken);
}

/**
 * Get referral quests progress
 */
export interface ReferralQuest {
  id: string;
  type: "RANK_UP" | "INFO";
  title: string;
  description: string;
  progress: number;
  target: number;
  reward?: {
    type: string;
    value: number;
    description: string;
  };
  isComplete: boolean;
}

export async function getReferralQuests(bearerToken: string): Promise<{
  quests: ReferralQuest[];
  currentHonorsLevel: number;
  currentHonorsName: string;
  totalRevShare: number;
}> {
  return fetchWithAuth("/api/referrals/quests", bearerToken);
}

/**
 * Get referral tree structure for visualization
 */
export async function getReferralTree(bearerToken: string): Promise<{
  directReferrals: any[];
  tierCounts: number[];
  totalCount: number;
}> {
  return fetchWithAuth("/api/referrals/tree", bearerToken);
}

// ============================================================
// SOCIAL QUESTS (Snag-powered)
// ============================================================

export interface SocialStatus {
  configured: boolean;
  connections: {
    twitter: boolean;
    telegram: boolean;
    twitterUser?: string;
    telegramUsername?: string;
  };
  ruleCompletion: Record<string, boolean>;
}

export async function getSocialStatus(bearerToken: string): Promise<SocialStatus> {
  return fetchWithAuth<SocialStatus>('/api/arena/social/status', bearerToken);
}

export async function connectSocial(
  bearerToken: string,
  platform: 'twitter' | 'telegram'
): Promise<{ connected: boolean; oauthUrl?: string; platform: string }> {
  return fetchWithAuth(`/api/arena/social/connect/${platform}`, bearerToken, {
    method: 'POST',
  });
}

export async function verifySocialQuest(
  bearerToken: string,
  questId: string
): Promise<{ verified: boolean; quest?: Quest; message?: string }> {
  return fetchWithAuth('/api/arena/social/verify', bearerToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questId }),
  });
}

// ============================================================
// v2.0 — SEASONS, KEY TWEETS, RECRUITER, CREDITS SUMMARY
// All credit amounts reuse `goldEarned`-style fields at the wire level
// (backend keeps "gold" column names). UI renders them as "Credits".
// ============================================================

export interface Season {
  id: number;
  code: 'preseason' | 's1' | 's2' | 's3';
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

export interface SeasonStatsEntry extends Season {
  userCreditsEarned: number;
  userReferralCreditsEarned: number;
  userRank: RankName;
  userRankLevel: number;
  userTradesCount: number;
  userVolumeUsd: number;
  isFrozen: boolean;
}

export interface SeasonStatsResponse {
  seasons: SeasonStatsEntry[];
  activeSeasonId: number | null;
}

export interface CreditsSummary {
  seasonCredits: number;
  lifetimeCredits: number;
  rank: RankName;
  rankLevel: number;
  rankDisplay: string;
  activeSeason: {
    id: number;
    code: string;
    name: string;
    startsAt: string;
    endsAt: string;
  } | null;
  progressToNextRank: number;
  nextRankThreshold: number | null;
  creditsMultiplier: number;
}

export interface KeyTweet {
  id: number;
  tweetId: string;
  tweetUrl: string;
  creditsPerClaim: number;
  claimed: boolean;
  activatedAt: string;
}

export interface RecruiterTier {
  tier: number;
  activeTradersRequired: number;
  baseCredits: number;
  title: string;
  claimed: boolean;
  claimedAt: string | null;
}

export interface RecruiterProgress {
  activeTraderCount: number;
  tiers: RecruiterTier[];
}

export interface SeasonLeaderboardEntry {
  position: number;
  userId: number;
  username: string | null;
  walletSnippet: string | null;
  creditsEarned: number;
  rank: RankName;
  rankLevel: number;
  volumeUsd: number;
}

export interface SeasonLeaderboardResponse {
  seasonId: number | null;
  entries: SeasonLeaderboardEntry[];
}

export async function getSeasons(bearerToken: string): Promise<{ seasons: Season[]; activeSeasonId: number | null }> {
  return fetchWithAuth('/api/arena/seasons', bearerToken);
}

export async function getSeasonStats(bearerToken: string): Promise<SeasonStatsResponse> {
  return fetchWithAuth('/api/arena/season-stats', bearerToken);
}

export async function getCreditsSummary(bearerToken: string): Promise<CreditsSummary> {
  return fetchWithAuth('/api/arena/credits-summary', bearerToken);
}

export async function getKeyTweets(bearerToken: string): Promise<{ tweets: KeyTweet[] }> {
  return fetchWithAuth('/api/arena/key-tweets', bearerToken);
}

export async function claimKeyTweet(
  bearerToken: string,
  keyTweetId: number,
): Promise<{ success: boolean; creditsAwarded?: number; error?: string }> {
  return fetchWithAuth(`/api/arena/key-tweets/${keyTweetId}/claim`, bearerToken, {
    method: 'POST',
  });
}

export async function getRecruiterProgress(bearerToken: string): Promise<RecruiterProgress> {
  return fetchWithAuth('/api/arena/recruiter-progress', bearerToken);
}

export async function getSeasonLeaderboard(
  bearerToken: string,
  opts: { seasonId?: number; limit?: number } = {},
): Promise<SeasonLeaderboardResponse> {
  const params = new URLSearchParams();
  if (opts.seasonId) params.set('seasonId', String(opts.seasonId));
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return fetchWithAuth(`/api/arena/leaderboard/season${qs ? `?${qs}` : ''}`, bearerToken);
}
