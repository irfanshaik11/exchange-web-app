/**
 * Arena API Utilities
 *
 * Functions for interacting with the Arena gamification system API.
 */

import { env } from '../env';

// ============================================================
// TYPES
// ============================================================

export type RankName = 'DEGEN' | 'WARRIOR' | 'GLADIATOR' | 'COMMANDER' | 'TITAN';

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
  type: 'DAILY' | 'SEASONAL' | 'REFERRAL' | 'SPECIAL';
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
  goldEarned?: number;
  questsCompleted?: number;
  prize: number;
}

export interface LeaderboardResponse {
  type: 'GOLD' | 'QUEST';
  period: 'DAILY' | 'MONTHLY' | 'LIFETIME';
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
  directReferrals: number;
  tier1Referrals: number;
  tier2Referrals: number;
  tier3Referrals: number;
  tier4Referrals: number;
  totalReferralVolume: number;
  pendingSolRewards: number;
  claimedSolRewards: number;
  honorsLevel: number;
  referralCode: string;
  referralLink: string;
  honorsInfo: {
    currentLevel: number;
    totalRevShare: number;
    layers: Array<{ layer: string; percentage: number }>;
    nextLevel: number | null;
    progressToNext: {
      referralCount: { current: number; target: number; percentage: number };
      referralVolume: { current: number; target: number; percentage: number };
    } | null;
  };
}

export interface DirectReferral {
  id: number;
  name: string;
  email: string;
  rank: RankName;
  rankLevel: number;
  totalVolume: number;
  joinedAt: string;
  hasCompletedFirstTrade: boolean;
  status: string;
}

// ============================================================
// API FUNCTIONS
// ============================================================

/**
 * Get the backend base URL, upgrading to HTTPS if needed
 */
function getBaseUrl(): string {
  const envUrl = env.NEXT_PUBLIC_BACKEND_URL || '';
  const stripTrailingSlash = (url: string) =>
    url.endsWith('/') ? url.slice(0, -1) : url;

  if (typeof window === 'undefined') {
    return stripTrailingSlash(envUrl);
  }

  try {
    const url = new URL(envUrl || window.location.origin);
    if (window.location.protocol === 'https:' && url.protocol === 'http:') {
      url.protocol = 'https:';
    }
    return stripTrailingSlash(url.toString());
  } catch {
    return stripTrailingSlash(window.location.origin);
  }
}

async function fetchWithAuth<T>(
  endpoint: string,
  bearerToken: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `Request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.data as T;
}

// ============================================================
// ARENA STATS
// ============================================================

export async function getArenaStats(bearerToken: string): Promise<ArenaStats> {
  return fetchWithAuth<ArenaStats>('/api/arena/stats', bearerToken);
}

// ============================================================
// QUESTS
// ============================================================

export async function getQuests(bearerToken: string, type?: string): Promise<QuestsResponse> {
  const queryParams = type ? `?type=${type}` : '';
  return fetchWithAuth<QuestsResponse>(`/api/arena/quests${queryParams}`, bearerToken);
}

export async function claimQuest(
  bearerToken: string,
  questId: number
): Promise<{ goldAwarded: number; honorsUpgrade?: string }> {
  return fetchWithAuth(`/api/arena/quests/${questId}/claim`, bearerToken, {
    method: 'POST',
  });
}

// ============================================================
// CASHBACK
// ============================================================

export async function getCashbackSummary(bearerToken: string): Promise<CashbackSummary> {
  return fetchWithAuth<CashbackSummary>('/api/arena/cashback', bearerToken);
}

export async function claimCashback(
  bearerToken: string
): Promise<{ amountClaimed: number; message: string }> {
  return fetchWithAuth('/api/arena/cashback/claim', bearerToken, {
    method: 'POST',
  });
}

// ============================================================
// GOLD HISTORY
// ============================================================

export async function getGoldHistory(
  bearerToken: string,
  options: { limit?: number; offset?: number; type?: string } = {}
): Promise<{ transactions: GoldTransaction[]; total: number }> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.offset) params.set('offset', options.offset.toString());
  if (options.type) params.set('type', options.type);

  const queryString = params.toString() ? `?${params.toString()}` : '';
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
  isAnonymous: boolean
): Promise<{ isAnonymous: boolean }> {
  return fetchWithAuth('/api/arena/settings/anonymous', bearerToken, {
    method: 'POST',
    body: JSON.stringify({ isAnonymous }),
  });
}

// ============================================================
// LEADERBOARD
// ============================================================

export async function getLeaderboard(
  type: 'gold' | 'quests',
  period: 'DAILY' | 'MONTHLY' | 'LIFETIME',
  options: { limit?: number; offset?: number; search?: string } = {}
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams({ period });
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.offset) params.set('offset', options.offset.toString());
  if (options.search) params.set('search', options.search);

  const response = await fetch(`${getBaseUrl()}/api/leaderboard/${type}?${params.toString()}`);
  const data = await response.json();
  return data.data;
}

export async function getUserPosition(
  bearerToken: string,
  type: 'GOLD' | 'QUEST',
  period: 'DAILY' | 'MONTHLY' | 'LIFETIME'
): Promise<UserPosition> {
  const params = new URLSearchParams({ type, period });
  return fetchWithAuth<UserPosition>(`/api/leaderboard/position?${params.toString()}`, bearerToken);
}

export async function getAllUserPositions(
  bearerToken: string
): Promise<{
  gold: { daily: UserPosition; monthly: UserPosition; lifetime: UserPosition };
  quest: { daily: UserPosition; monthly: UserPosition; lifetime: UserPosition };
}> {
  return fetchWithAuth('/api/leaderboard/my-positions', bearerToken);
}

export async function getTop3(
  type: 'gold' | 'quest',
  period: 'daily' | 'monthly' | 'lifetime'
): Promise<LeaderboardEntry[]> {
  const response = await fetch(`${getBaseUrl()}/api/leaderboard/top3/${type}/${period}`);
  const data = await response.json();
  return data.data.podium;
}

export async function getLeaderboardCountdown(
  period: 'DAILY' | 'MONTHLY'
): Promise<{
  countdown: { hours: number; minutes: number; seconds: number; totalSeconds: number };
  formatted: string;
}> {
  const response = await fetch(`${getBaseUrl()}/api/leaderboard/countdown?period=${period}`);
  const data = await response.json();
  return data.data;
}

// ============================================================
// REFERRALS
// ============================================================

export async function getReferralStats(bearerToken: string): Promise<ReferralStats> {
  return fetchWithAuth<ReferralStats>('/api/referrals/stats', bearerToken);
}

export async function getDirectReferrals(
  bearerToken: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ referrals: DirectReferral[]; total: number }> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.offset) params.set('offset', options.offset.toString());

  const queryString = params.toString() ? `?${params.toString()}` : '';
  return fetchWithAuth(`/api/referrals/direct${queryString}`, bearerToken);
}

export async function claimReferralRewards(
  bearerToken: string
): Promise<{ amountClaimed: number; message: string }> {
  return fetchWithAuth('/api/referrals/rewards/claim', bearerToken, {
    method: 'POST',
  });
}

export async function applyReferralCode(
  bearerToken: string,
  code: string
): Promise<{ success: boolean; message?: string }> {
  return fetchWithAuth('/api/referrals/apply', bearerToken, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function getHonorsInfo(
  bearerToken: string
): Promise<{
  currentLevel: number;
  currentTier: { totalRevShare: number; layers: Array<{ layer: string; percentage: number }> };
  nextLevel: number | null;
  nextTier: { totalRevShare: number; layers: Array<{ layer: string; percentage: number }> } | null;
  progressToNext: {
    referralCount: { current: number; target: number; percentage: number };
    referralVolume: { current: number; target: number; percentage: number };
  } | null;
  allTiers: Array<{
    level: number;
    totalRevShare: number;
    layers: Array<{ layer: string; percentage: number }>;
    isUnlocked: boolean;
  }>;
}> {
  return fetchWithAuth('/api/referrals/honors', bearerToken);
}
