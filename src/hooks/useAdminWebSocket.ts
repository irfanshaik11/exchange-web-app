/**
 * useAdminWebSocket - Real-time admin dashboard updates
 *
 * Connects to the backend WebSocket for live updates:
 * - New user signups
 * - Trade events
 * - Referral conversions
 * - Stats updates
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { env } from '~/env';
import type { ActivityEvent } from '~/components/admin/LiveActivityFeed';

const isDev = process.env.NODE_ENV !== 'production';

export interface DailySignup {
  date: string;
  count: number;
}

export interface AdminStats {
  totalUsers: number;
  newUsers24h: number;
  newUsers7d: number;
  newUsers30d: number;
  totalVolume: number;
  volume24h: number;
  totalTrades: number;
  trades24h: number;
  totalReferrals: number;
  topReferrers: Array<{
    code: string;
    userName: string;
    referralCount: number;
    totalVolume: number;
  }>;
  dailySignups: DailySignup[];
}

interface AdminWebSocketMessage {
  type: 'stats_update' | 'new_user' | 'new_trade' | 'new_referral' | 'milestone' | 'connected';
  data?: any;
  timestamp?: number;
}

interface UseAdminWebSocketResult {
  stats: AdminStats | null;
  events: ActivityEvent[];
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

const INITIAL_STATS: AdminStats = {
  totalUsers: 0,
  newUsers24h: 0,
  newUsers7d: 0,
  newUsers30d: 0,
  totalVolume: 0,
  volume24h: 0,
  totalTrades: 0,
  trades24h: 0,
  totalReferrals: 0,
  topReferrers: [],
  dailySignups: [],
};

// Resolve backend URL for WebSocket
function resolveWSUrl(): string {
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || '';
  if (typeof window === 'undefined') return '';

  try {
    const url = new URL(backendUrl || window.location.origin);
    const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${url.host}/ws/admin`;
  } catch {
    return '';
  }
}

export function useAdminWebSocket(): UseAdminWebSocketResult {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const addEvent = useCallback((event: ActivityEvent) => {
    setEvents((prev) => [event, ...prev].slice(0, 100)); // Keep last 100 events
  }, []);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;

    const wsUrl = resolveWSUrl();
    if (!wsUrl) {
      setError('WebSocket URL not configured');
      return;
    }

    isDev && console.log('[Admin WS] Connecting to:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        isDev && console.log('[Admin WS] Connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: AdminWebSocketMessage = JSON.parse(event.data);
          isDev && console.log('[Admin WS] Message:', message.type);

          switch (message.type) {
            case 'stats_update':
              if (message.data) {
                setStats((prev) => ({
                  ...INITIAL_STATS,
                  ...prev,
                  ...message.data,
                }));
              }
              break;

            case 'new_user':
              if (message.data) {
                addEvent({
                  id: `signup-${Date.now()}-${Math.random()}`,
                  type: 'signup',
                  title: 'New User Signup',
                  description: message.data.email || message.data.wallet || 'New user joined',
                  timestamp: new Date(message.timestamp || Date.now()),
                });
                // Increment user count
                setStats((prev) =>
                  prev
                    ? {
                        ...prev,
                        totalUsers: prev.totalUsers + 1,
                        newUsers24h: prev.newUsers24h + 1,
                      }
                    : prev
                );
              }
              break;

            case 'new_trade':
              if (message.data) {
                addEvent({
                  id: `trade-${Date.now()}-${Math.random()}`,
                  type: 'trade',
                  title: `${message.data.type || 'Trade'} ${message.data.symbol || ''}`,
                  description: `$${(message.data.amount || 0).toLocaleString()} volume`,
                  timestamp: new Date(message.timestamp || Date.now()),
                  metadata: {
                    amount: message.data.amount,
                    symbol: message.data.symbol,
                  },
                });
                // Update volume
                setStats((prev) =>
                  prev
                    ? {
                        ...prev,
                        totalVolume: prev.totalVolume + (message.data.amount || 0),
                        volume24h: prev.volume24h + (message.data.amount || 0),
                        totalTrades: prev.totalTrades + 1,
                        trades24h: prev.trades24h + 1,
                      }
                    : prev
                );
              }
              break;

            case 'new_referral':
              if (message.data) {
                addEvent({
                  id: `referral-${Date.now()}-${Math.random()}`,
                  type: 'referral',
                  title: 'New Referral',
                  description: `Code: ${message.data.code || 'unknown'}`,
                  timestamp: new Date(message.timestamp || Date.now()),
                  metadata: {
                    referralCode: message.data.code,
                  },
                });
                setStats((prev) =>
                  prev
                    ? {
                        ...prev,
                        totalReferrals: prev.totalReferrals + 1,
                      }
                    : prev
                );
              }
              break;

            case 'milestone':
              if (message.data) {
                addEvent({
                  id: `milestone-${Date.now()}-${Math.random()}`,
                  type: 'milestone',
                  title: message.data.title || 'Milestone Reached!',
                  description: message.data.description || '',
                  timestamp: new Date(message.timestamp || Date.now()),
                  metadata: {
                    milestone: message.data.value,
                  },
                });
              }
              break;
          }
        } catch (err) {
          console.error('[Admin WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
        isDev && console.log('[Admin WS] Disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // Exponential backoff for reconnection
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          isDev && console.log('[Admin WS] Attempting reconnect...');
          connect();
        }, delay);
      };

      ws.onerror = (err) => {
        console.error('[Admin WS] Error:', err);
        setError('WebSocket connection error');
      };
    } catch (err) {
      console.error('[Admin WS] Connection failed:', err);
      setError('Failed to connect to WebSocket');
    }
  }, [addEvent]);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { stats, events, isConnected, error, reconnect };
}

// ==================== Analytics Types & Hook ====================

export interface TierBreakdown {
  direct: number;
  tier1: number;
  tier2: number;
  tier3: number;
  tier4: number;
}

export interface RewardByTier {
  layer: number;
  rewardCount: number;
  totalSol: number;
  totalUsd: number;
  volumeUsd: number;
}

export interface DailyVolume {
  date: string;
  tradeCount: number;
  volume: number;
}

export interface HonorsDistribution {
  level: number;
  count: number;
}

export interface TopTrader {
  name: string;
  email: string;
  tradeCount: number;
  totalVolume: number;
}

export interface PnlUser {
  name: string;
  email: string;
  totalPnl: number;
  sellCount: number;
  winCount: number;
  totalVolume: number;
}

export interface PnlSummary {
  totalPnl: number;
  totalSells: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnl: number;
  biggestWin: number;
  biggestLoss: number;
}

export interface AdminAnalytics {
  tierBreakdown: TierBreakdown;
  rewardsByTier: RewardByTier[];
  dailyVolume: DailyVolume[];
  honorsDistribution: HonorsDistribution[];
  topTraders: TopTrader[];
  conversionRate: {
    referredUsers: number;
    referredWhoTraded: number;
    rate: number;
  };
  rewardsSummary: {
    totalPendingSol: number;
    totalClaimedSol: number;
    totalDistributedSol: number;
  };
  pnlLeaderboard: {
    winners: PnlUser[];
    losers: PnlUser[];
  };
  pnlSummary: PnlSummary;
}

interface UseAdminAnalyticsResult {
  analytics: AdminAnalytics | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAdminAnalytics(
  intervalMs: number = 60000,
  enabled: boolean = true,
  volumeDays: number = 30
): UseAdminAnalyticsResult {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    if (!isReady || !enabled) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (volumeDays !== 30) params.set('days', String(volumeDays));
      const qs = params.toString();
      const response = await fetch(`/api/admin/stats/analytics${qs ? `?${qs}` : ''}`, {
        credentials: 'include',
      });

      if (response.status === 401) {
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        console.warn('[Admin Analytics] Non-OK response:', response.status);
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      setAnalytics(data);
      setError(null);
    } catch (err) {
      console.error('[Admin Analytics] Error:', err);
      setError('Failed to fetch analytics');
    } finally {
      setIsLoading(false);
    }
  }, [isReady, enabled, volumeDays]);

  // Enable after a short delay to allow auth to complete
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isReady || !enabled) return;

    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, intervalMs);
    return () => clearInterval(interval);
  }, [fetchAnalytics, intervalMs, isReady, enabled]);

  return { analytics, isLoading, error, refetch: fetchAnalytics };
}

// Fallback hook that uses polling instead of WebSocket
export function useAdminPolling(intervalMs: number = 5000, enabled: boolean = true, signupDays: number = 30): UseAdminWebSocketResult {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!isReady || !enabled) return;

    try {
      const params = new URLSearchParams();
      if (signupDays !== 30) params.set('days', String(signupDays));
      const qs = params.toString();
      const response = await fetch(`/api/admin/stats/overview${qs ? `?${qs}` : ''}`, {
        credentials: 'include',
      });

      // Handle auth errors gracefully - don't show error, just wait for auth
      if (response.status === 401) {
        setIsConnected(false);
        return;
      }

      if (!response.ok) {
        // Don't throw, just log and continue
        console.warn('[Admin Polling] Non-OK response:', response.status);
        setIsConnected(false);
        return;
      }

      const data = await response.json();
      setStats(data);
      setIsConnected(true);
      setError(null);
    } catch (err) {
      console.error('[Admin Polling] Error:', err);
      // Only show error if we were previously connected
      if (isConnected) {
        setError('Connection lost. Retrying...');
      }
      setIsConnected(false);
    }
  }, [isReady, enabled, isConnected, signupDays]);

  // Enable polling after a short delay to allow auth to complete
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isReady || !enabled) return;

    fetchStats();
    const interval = setInterval(fetchStats, intervalMs);
    return () => clearInterval(interval);
  }, [fetchStats, intervalMs, isReady, enabled]);

  const reconnect = useCallback(() => {
    setIsReady(true);
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    events,
    isConnected,
    error,
    reconnect,
  };
}
