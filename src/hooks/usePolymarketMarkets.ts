import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ExtendedPredictionMarket } from './useDFlowMarkets';
import { env } from '~/env';

// Polymarket API Configuration
// Use backend API (no API keys exposed on frontend)
const API_BASE = `${env.NEXT_PUBLIC_BACKEND_URL}/api/prediction/polymarket`;

// Polymarket API response types
export interface PolymarketTag {
  id: string;
  label: string;
  slug: string;
}

export interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  questionId: string;
  slug: string;
  outcomes: string; // JSON string: '["Yes", "No"]'
  outcomePrices: string; // JSON string: '["0.65", "0.35"]'
  clobTokenIds: string[] | string; // Could be array or JSON string
  tickSize: string;
  negRisk: boolean;
  volume: string;
  liquidity: string;
  startDate: string;
  endDate: string;
  closed: boolean;
  active: boolean;
  resolved?: boolean;
  resolvedBy?: string; // UMA resolver contract address
  groupItemTitle?: string; // Label for multi-outcome markets
  groupItemThreshold?: string; // Threshold for ordering multi-outcome markets
  image?: string;
  icon?: string;
}

export interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  startDate: string;
  endDate: string;
  volume: string;
  volume24hr: number;
  liquidity: string;
  openInterest?: number;
  markets: PolymarketMarket[];
  tags: PolymarketTag[];
  image?: string;
  icon?: string;
  active: boolean;
  closed: boolean;
}

// Parse JSON strings safely
const safeJsonParse = <T>(str: string, fallback: T): T => {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

// Map Polymarket tags to our category system
const mapPolymarketCategory = (tags: PolymarketTag[], title: string): string => {
  const tagLabels = tags.map(t => t.label.toLowerCase());
  const titleLower = title.toLowerCase();

  // Check tags first
  if (tagLabels.some(t => ['politics', 'election', 'congress', 'president', 'senate'].includes(t))) return 'politics';
  if (tagLabels.some(t => ['sports', 'nfl', 'nba', 'mlb', 'soccer', 'football'].includes(t))) return 'sports';
  if (tagLabels.some(t => ['crypto', 'bitcoin', 'ethereum', 'blockchain'].includes(t))) return 'crypto';
  if (tagLabels.some(t => ['finance', 'economy', 'fed', 'interest rates'].includes(t))) return 'economics';
  if (tagLabels.some(t => ['entertainment', 'movies', 'oscars', 'music'].includes(t))) return 'entertainment';
  if (tagLabels.some(t => ['science', 'tech', 'ai', 'space'].includes(t))) return 'science';

  // Fallback to title analysis
  if (titleLower.includes('trump') || titleLower.includes('biden') || titleLower.includes('election')) return 'politics';
  if (titleLower.includes('bitcoin') || titleLower.includes('eth') || titleLower.includes('crypto')) return 'crypto';
  if (titleLower.includes('fed') || titleLower.includes('interest rate')) return 'economics';

  return 'other';
};

// Transform Polymarket event to a SINGLE ExtendedPredictionMarket
// Multi-outcome events (like "Who will Trump nominate?") should show as ONE card, not one per outcome
const transformToUnified = (event: PolymarketEvent): ExtendedPredictionMarket[] => {
  // Always return ONE card per event
  if (event.markets.length === 0) return [];

  // For multi-outcome markets, find the leading outcome (highest YES probability)
  // For simple Yes/No markets, just use the first market
  const isMultiOutcome = event.markets.length > 1;

  // Find the market with highest YES probability to feature on the card
  let primaryMarket = event.markets[0];
  let highestYesPrice = 0;

  for (const market of event.markets) {
    const prices = safeJsonParse<string[]>(market.outcomePrices, ['0.5', '0.5']).map(Number);
    const yesPrice = prices[0] || 0;
    if (yesPrice > highestYesPrice) {
      highestYesPrice = yesPrice;
      primaryMarket = market;
    }
  }

  // Parse outcomes and prices from primary market
  const prices = safeJsonParse<string[]>(primaryMarket.outcomePrices, ['0.5', '0.5']).map(Number);

  // Parse token IDs (could be array or JSON string)
  let tokenIds: string[] = [];
  if (Array.isArray(primaryMarket.clobTokenIds)) {
    tokenIds = primaryMarket.clobTokenIds;
  } else if (typeof primaryMarket.clobTokenIds === 'string') {
    tokenIds = safeJsonParse<string[]>(primaryMarket.clobTokenIds, []);
  }

  const yesPrice = prices[0] || 0.5;
  const noPrice = prices[1] || (1 - yesPrice);

  // Determine status
  let status: 'active' | 'closed' | 'resolved' = 'active';
  if (primaryMarket.resolved) {
    status = 'resolved';
  } else if (primaryMarket.closed || event.closed) {
    status = 'closed';
  }

  // For multi-outcome, show the leading outcome in subtitle
  const leadingOutcome = isMultiOutcome && primaryMarket.groupItemTitle
    ? `Leading: ${primaryMarket.groupItemTitle} (${(yesPrice * 100).toFixed(0)}%)`
    : undefined;

  return [{
    // Basic PredictionMarket fields
    // Use event.slug for ticker since Polymarket API queries by event slug
    ticker: event.slug || primaryMarket.slug || `poly-${primaryMarket.id}`,
    title: event.title,
    category: mapPolymarketCategory(event.tags, event.title),
    yesPrice,
    noPrice,
    yesPriceChange24h: 0,
    noPriceChange24h: 0,
    volume24h: event.volume24hr || 0,
    totalVolume: parseFloat(event.volume) || 0,
    closesAt: primaryMarket.endDate || event.endDate,
    status,
    resolution: undefined,
    imageUrl: event.image || event.icon || primaryMarket.image,

    // Extended fields
    marketType: isMultiOutcome ? 'multi' : 'binary',
    subtitle: leadingOutcome,
    eventTicker: event.slug,
    outcomeCount: event.markets.length, // Number of outcomes in multi-outcome market

    // Timing
    openTime: new Date(event.startDate).getTime() / 1000,
    closeTime: new Date(primaryMarket.endDate || event.endDate).getTime() / 1000,
    expirationTime: new Date(primaryMarket.endDate || event.endDate).getTime() / 1000,

    // Stats
    openInterest: event.openInterest || parseFloat(event.liquidity) || 0,
    liquidity: parseFloat(event.liquidity) || 0,

    // Polymarket-specific (stored in extended fields)
    polymarketData: {
      source: 'polymarket' as const,
      eventId: event.id,
      marketId: primaryMarket.id,
      conditionId: primaryMarket.conditionId,
      yesTokenId: tokenIds[0] || '',
      noTokenId: tokenIds[1] || '',
      tickSize: primaryMarket.tickSize,
      negRisk: primaryMarket.negRisk,
      isMultiOutcome,
      outcomeCount: event.markets.length,
    },
  } as ExtendedPredictionMarket & { polymarketData: any }];
};

interface UsePolymarketMarketsOptions {
  enabled?: boolean;
  limit?: number;
  category?: string;
  refreshInterval?: number;
}

interface UsePolymarketMarketsResult {
  markets: ExtendedPredictionMarket[];
  events: PolymarketEvent[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  totalVolume: number;
  totalMarkets: number;
}

export default function usePolymarketMarkets(options: UsePolymarketMarketsOptions = {}): UsePolymarketMarketsResult {
  const {
    enabled = true,
    limit = 50,
    category,
    refreshInterval = 60000, // Polymarket has lower rate limits, use 60s
  } = options;

  const [markets, setMarkets] = useState<ExtendedPredictionMarket[]>([]);
  const [events, setEvents] = useState<PolymarketEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalVolume, setTotalVolume] = useState(0);
  const [totalMarkets, setTotalMarkets] = useState(0);

  const fetchInProgress = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchMarkets = useCallback(async () => {
    if (fetchInProgress.current) return;

    try {
      fetchInProgress.current = true;
      setError(null);

      // Fetch from our proxy
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      params.set('active', 'true');
      params.set('closed', 'false');
      params.set('order', 'volume24hr');
      params.set('ascending', 'false');

      const response = await fetch(`${API_BASE}/events?${params}`);

      if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.status}`);
      }

      const json = await response.json();
      // Backend returns { success: true, data: [...] }
      const eventsData: PolymarketEvent[] = json.data || json.events || [];

      // Transform all events to unified market format
      let allMarkets: ExtendedPredictionMarket[] = [];
      for (const event of eventsData) {
        const transformed = transformToUnified(event);
        allMarkets.push(...transformed);
      }

      // Filter by category if specified
      if (category && category !== 'all') {
        allMarkets = allMarkets.filter(m => m.category === category);
      }

      // Calculate totals
      const total24hVolume = allMarkets.reduce((sum, m) => sum + (m.volume24h || 0), 0);

      setMarkets(allMarkets);
      setEvents(eventsData);
      setTotalVolume(total24hVolume);
      setTotalMarkets(allMarkets.length);

      console.log(`[Polymarket] Fetched ${allMarkets.length} markets from ${eventsData.length} events`);

    } catch (err) {
      console.error('[Polymarket] Failed to fetch markets:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch Polymarket data');
    } finally {
      setIsLoading(false);
      fetchInProgress.current = false;
    }
  }, [limit, category]);

  // Initial fetch and refresh interval
  useEffect(() => {
    if (!enabled) {
      setMarkets([]);
      setEvents([]);
      setIsLoading(false);
      return;
    }

    fetchMarkets();

    if (refreshInterval > 0) {
      intervalRef.current = setInterval(fetchMarkets, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, fetchMarkets, refreshInterval]);

  return {
    markets,
    events,
    isLoading,
    error,
    refetch: fetchMarkets,
    totalVolume,
    totalMarkets,
  };
}

// Hook to fetch orderbook for a Polymarket token
export function usePolymarketOrderBook(tokenId: string | undefined, options: { refreshInterval?: number } = {}) {
  const { refreshInterval = 10000 } = options;
  const [orderBook, setOrderBook] = useState<{
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderBook = useCallback(async () => {
    if (!tokenId) return;

    try {
      const response = await fetch(`${API_BASE}/orderbook?token_id=${encodeURIComponent(tokenId)}`);

      if (!response.ok) {
        throw new Error(`Orderbook API error: ${response.status}`);
      }

      const json = await response.json();
      const data = json.data || json;

      setOrderBook({
        bids: (data.bids || []).map((b: any) => ({
          price: parseFloat(b.price),
          size: parseFloat(b.size),
        })),
        asks: (data.asks || []).map((a: any) => ({
          price: parseFloat(a.price),
          size: parseFloat(a.size),
        })),
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch orderbook');
    } finally {
      setIsLoading(false);
    }
  }, [tokenId]);

  useEffect(() => {
    if (!tokenId) {
      setOrderBook(null);
      setIsLoading(false);
      return;
    }

    fetchOrderBook();
    const interval = setInterval(fetchOrderBook, refreshInterval);
    return () => clearInterval(interval);
  }, [tokenId, fetchOrderBook, refreshInterval]);

  return { orderBook, isLoading, error, refetch: fetchOrderBook };
}

// Helper to format volume
export function formatPolymarketVolume(volume: number): string {
  if (volume >= 1_000_000_000) return `$${(volume / 1_000_000_000).toFixed(2)}B`;
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}K`;
  return `$${volume.toFixed(0)}`;
}

// Hook to fetch a single Polymarket market by slug
export function usePolymarketMarket(
  slug: string | undefined,
  options: { enabled?: boolean; refreshInterval?: number } = {}
) {
  const { enabled = true, refreshInterval = 30000 } = options;

  const [market, setMarket] = useState<ExtendedPredictionMarket | null>(null);
  const [event, setEvent] = useState<PolymarketEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarket = useCallback(async () => {
    if (!slug || !enabled) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/market?slug=${encodeURIComponent(slug)}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('Market not found');
        } else {
          throw new Error(`API error: ${response.status}`);
        }
        return;
      }

      const json = await response.json();
      // Backend returns { success: true, data: {...event} }
      const eventData: PolymarketEvent = json.data || json.event;

      if (!eventData) {
        setError('Market not found');
        return;
      }

      setEvent(eventData);

      // Transform to unified format
      const transformed = transformToUnified(eventData);
      if (transformed.length > 0) {
        setMarket(transformed[0]);
      }
      setError(null);
    } catch (err) {
      console.error('[Polymarket] Failed to fetch market:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch market');
    } finally {
      setIsLoading(false);
    }
  }, [slug, enabled]);

  useEffect(() => {
    // If not enabled or no slug, reset state but keep loading true
    // The parent component should handle showing loading based on router.isReady
    if (!enabled) {
      setMarket(null);
      setIsLoading(false);
      return;
    }

    if (!slug) {
      // No slug yet (router still initializing) - keep loading true
      setIsLoading(true);
      return;
    }

    setIsLoading(true);
    fetchMarket();

    if (refreshInterval > 0) {
      const interval = setInterval(fetchMarket, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [slug, enabled, fetchMarket, refreshInterval]);

  return {
    market,
    event,
    isLoading,
    error,
    refetch: fetchMarket,
  };
}

// Price history point type
export interface PolymarketPricePoint {
  timestamp: number;
  price: number;
}

// Hook to fetch Polymarket price history for charting
export function usePolymarketPriceHistory(
  tokenId: string | undefined,
  options: {
    interval?: string; // "1h", "1d", "1w", "1m"
    fidelity?: number; // Resolution in minutes
    refreshInterval?: number;
    enabled?: boolean;
  } = {}
) {
  const {
    interval = '1w',
    fidelity = 60,
    refreshInterval = 60000,
    enabled = true,
  } = options;

  const [history, setHistory] = useState<PolymarketPricePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!tokenId || !enabled) {
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set('market', tokenId);
      params.set('interval', interval);
      params.set('fidelity', fidelity.toString());

      const response = await fetch(`${API_BASE}/prices-history?${params}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const json = await response.json();
      const data = json.data || json;
      setHistory(data.history || []);
      setError(null);

      console.log(`[usePolymarketPriceHistory] Fetched ${data.history?.length || 0} price points for token ${tokenId.slice(0, 8)}...`);
    } catch (err) {
      console.error('[Polymarket] Failed to fetch price history:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch price history');
    } finally {
      setIsLoading(false);
    }
  }, [tokenId, interval, fidelity, enabled]);

  useEffect(() => {
    if (!tokenId || !enabled) {
      setHistory([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchHistory();

    if (refreshInterval > 0) {
      const intervalId = setInterval(fetchHistory, refreshInterval);
      return () => clearInterval(intervalId);
    }
  }, [tokenId, enabled, fetchHistory, refreshInterval]);

  return {
    history,
    isLoading,
    error,
    refetch: fetchHistory,
  };
}

// Multi-series price history interface
export interface MultiSeriesPriceHistory {
  id: string;
  label: string;
  tokenId: string;
  history: PolymarketPricePoint[];
  currentPrice?: number;
}

// Hook to fetch price history for multiple tokens (for multi-outcome markets)
export function usePolymarketMultiPriceHistory(
  markets: Array<{ id: string; label: string; tokenId: string; currentPrice?: number }> | undefined,
  options: {
    interval?: string;
    fidelity?: number;
    refreshInterval?: number;
    enabled?: boolean;
  } = {}
) {
  const {
    interval = 'max',
    fidelity = 60,
    refreshInterval = 60000,
    enabled = true,
  } = options;

  const [seriesData, setSeriesData] = useState<MultiSeriesPriceHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAllHistories = useCallback(async () => {
    if (!markets || markets.length === 0 || !enabled) {
      return;
    }

    try {
      // Fetch all token histories in parallel
      const results = await Promise.all(
        markets.map(async (market) => {
          try {
            const params = new URLSearchParams();
            params.set('market', market.tokenId);
            params.set('interval', interval);
            params.set('fidelity', fidelity.toString());

            const response = await fetch(`${API_BASE}/prices-history?${params}`);

            if (!response.ok) {
              return { ...market, history: [] };
            }

            const json = await response.json();
            const data = json.data || json;
            return {
              id: market.id,
              label: market.label,
              tokenId: market.tokenId,
              history: data.history || [],
              currentPrice: market.currentPrice,
            };
          } catch (err) {
            return { ...market, history: [] };
          }
        })
      );

      setSeriesData(results);
      setError(null);
    } catch (err) {
      console.error('[usePolymarketMultiPriceHistory] Failed to fetch histories:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch price histories');
    } finally {
      setIsLoading(false);
    }
  }, [markets, interval, fidelity, enabled]);

  useEffect(() => {
    if (!markets || markets.length === 0 || !enabled) {
      setSeriesData([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchAllHistories();

    if (refreshInterval > 0) {
      const intervalId = setInterval(fetchAllHistories, refreshInterval);
      return () => clearInterval(intervalId);
    }
  }, [markets?.length, enabled, fetchAllHistories, refreshInterval]);

  return {
    seriesData,
    isLoading,
    error,
    refetch: fetchAllHistories,
  };
}

// Comment type
export interface PolymarketComment {
  id: string;
  body: string;
  userAddress: string;
  createdAt: string;
  profile?: {
    name?: string;
    pseudonym?: string;
    profileImage?: string;
  };
  reactionCount: number;
  parentCommentID?: string;
}

// Hook to fetch Polymarket comments
export function usePolymarketComments(
  eventId: string | undefined,
  options: { refreshInterval?: number; enabled?: boolean } = {}
) {
  const { refreshInterval = 0, enabled = true } = options;

  const [comments, setComments] = useState<PolymarketComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    if (!eventId || !enabled) return;

    try {
      const response = await fetch(`${API_BASE}/comments?event_id=${encodeURIComponent(eventId)}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const json = await response.json();
      const data = json.data || json;
      setComments(data.comments || data || []);
      setError(null);
    } catch (err) {
      console.error('[Polymarket] Failed to fetch comments:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch comments');
    } finally {
      setIsLoading(false);
    }
  }, [eventId, enabled]);

  useEffect(() => {
    if (!eventId || !enabled) {
      setComments([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchComments();

    if (refreshInterval > 0) {
      const intervalId = setInterval(fetchComments, refreshInterval);
      return () => clearInterval(intervalId);
    }
  }, [eventId, enabled, fetchComments, refreshInterval]);

  return { comments, isLoading, error, refetch: fetchComments };
}

// Holder type
export interface PolymarketHolder {
  proxyWallet: string;
  name?: string;
  pseudonym?: string;
  profileImage?: string;
  amount: number;
  outcome: 'yes' | 'no';
}

// Hook to fetch Polymarket top holders
export function usePolymarketHolders(
  conditionId: string | undefined,
  options: { limit?: number; enabled?: boolean } = {}
) {
  const { limit = 20, enabled = true } = options;

  const [holders, setHolders] = useState<PolymarketHolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHolders = useCallback(async () => {
    if (!conditionId || !enabled) return;

    try {
      const response = await fetch(`${API_BASE}/holders?market=${encodeURIComponent(conditionId)}&limit=${limit}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const json = await response.json();
      const data = json.data || json;
      setHolders(data.holders || data || []);
      setError(null);
    } catch (err) {
      console.error('[Polymarket] Failed to fetch holders:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch holders');
    } finally {
      setIsLoading(false);
    }
  }, [conditionId, limit, enabled]);

  useEffect(() => {
    if (!conditionId || !enabled) {
      setHolders([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchHolders();
  }, [conditionId, enabled, fetchHolders]);

  return { holders, isLoading, error, refetch: fetchHolders };
}

// Activity type
export interface PolymarketActivity {
  id: string;
  type: 'trade' | 'deposit' | 'withdrawal' | 'transfer' | string;
  timestamp: string;
  user?: string;
  proxyWallet?: string;
  name?: string;
  pseudonym?: string;
  profileImage?: string;
  market?: string;
  outcome?: string;
  side?: 'buy' | 'sell';
  size?: number;
  price?: number;
  amount?: number;
  transactionHash?: string;
}

// Hook to fetch Polymarket activity
export function usePolymarketActivity(
  conditionId: string | undefined,
  options: { limit?: number; refreshInterval?: number; enabled?: boolean } = {}
) {
  const { limit = 50, refreshInterval = 30000, enabled = true } = options;

  const [activities, setActivities] = useState<PolymarketActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    if (!conditionId || !enabled) return;

    try {
      const params = new URLSearchParams();
      params.set('market', conditionId);
      params.set('limit', limit.toString());

      const response = await fetch(`${API_BASE}/activity?${params}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const json = await response.json();
      const data = json.data || json;
      setActivities(data.activities || data || []);
      setError(null);
    } catch (err) {
      console.error('[Polymarket] Failed to fetch activity:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch activity');
    } finally {
      setIsLoading(false);
    }
  }, [conditionId, limit, enabled]);

  useEffect(() => {
    if (!conditionId || !enabled) {
      setActivities([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchActivity();

    if (refreshInterval > 0) {
      const intervalId = setInterval(fetchActivity, refreshInterval);
      return () => clearInterval(intervalId);
    }
  }, [conditionId, enabled, fetchActivity, refreshInterval]);

  return { activities, isLoading, error, refetch: fetchActivity };
}
