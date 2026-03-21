import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ExtendedPredictionMarket } from './useDFlowMarkets';
import { env } from '~/env';

const isDev = process.env.NODE_ENV !== 'production';

// Polymarket API Configuration
// Use backend API (no API keys exposed on frontend)
const API_BASE = `${env.NEXT_PUBLIC_BACKEND_URL}/api/prediction/polymarket`;

// Cache configuration for React Query
// Show cached data INSTANTLY, but ALWAYS fetch fresh data in background
const STALE_TIME = 0;             // Always refetch (data is never "fresh enough")
const CACHE_TIME = 5 * 60 * 1000; // Keep in cache for 5 minutes (for instant placeholder)

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
  acceptingOrders?: boolean; // Whether CLOB is accepting new orders
  enableOrderBook?: boolean; // Whether order book is active
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
  // Skip resolved/closed sub-markets — their prices are stale (fallback to 0.5)
  const activeMarkets = event.markets.filter(m => !m.resolved && !m.closed && m.active !== false);
  const candidateMarkets = activeMarkets.length > 0 ? activeMarkets : event.markets;

  let primaryMarket = candidateMarkets[0];
  let highestYesPrice = 0;

  for (const market of candidateMarkets) {
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
    outcomeCount: activeMarkets.length || event.markets.length, // Number of active outcomes

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
  isLoading: boolean;      // True only on first load (no cached data yet)
  isRefreshing?: boolean;  // True when fetching fresh data with cache displayed
  error: string | null;
  refetch: () => Promise<void>;
  totalVolume: number;
  totalMarkets: number;
}

// Fetch function for React Query
async function fetchPolymarketEvents(limit: number): Promise<{
  events: PolymarketEvent[];
  markets: ExtendedPredictionMarket[];
  totalVolume: number;
}> {
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
  const eventsData: PolymarketEvent[] = json.data || json.events || [];

  // Transform all events to unified market format
  const allMarkets: ExtendedPredictionMarket[] = [];
  for (const event of eventsData) {
    const transformed = transformToUnified(event);
    allMarkets.push(...transformed);
  }

  const totalVolume = allMarkets.reduce((sum, m) => sum + (m.volume24h || 0), 0);

  isDev && console.log(`[Polymarket] Fetched ${allMarkets.length} markets from ${eventsData.length} events`);

  return { events: eventsData, markets: allMarkets, totalVolume };
}

export default function usePolymarketMarkets(options: UsePolymarketMarketsOptions = {}): UsePolymarketMarketsResult {
  const {
    enabled = true,
    limit = 50,
    category,
    refreshInterval = 60000,
  } = options;

  // Use React Query for instant loading + always fresh data
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['polymarket', 'events', limit],
    queryFn: () => fetchPolymarketEvents(limit),
    enabled,
    staleTime: STALE_TIME,           // 0 = always refetch fresh data
    gcTime: CACHE_TIME,              // Keep in cache for instant placeholder
    refetchInterval: refreshInterval, // Background refresh every 60s
    refetchOnWindowFocus: true,      // Refresh when user comes back to tab
    refetchOnMount: true,            // Always fetch on mount
    retry: 2,                        // Retry failed requests twice
    // Show cached data instantly while fetching fresh
    placeholderData: (previousData) => previousData,
  });

  // Filter by category (applied client-side for instant filtering)
  const filteredMarkets = useMemo(() => {
    if (!data?.markets) return [];
    if (!category || category === 'all') return data.markets;
    return data.markets.filter(m => m.category === category);
  }, [data?.markets, category]);

  return {
    markets: filteredMarkets,
    events: data?.events || [],
    isLoading: isLoading && !data,  // Only true on first load (no cached data)
    isRefreshing: isFetching && !!data, // True when refreshing with cached data shown
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch Polymarket data') : null,
    refetch: async () => { await refetch(); },
    totalVolume: data?.totalVolume || 0,
    totalMarkets: filteredMarkets.length,
  };
}

// Hook to fetch orderbook for a Polymarket token (React Query)
export function usePolymarketOrderBook(tokenId: string | undefined, options: { refreshInterval?: number } = {}) {
  const { refreshInterval = 10000 } = options;

  const { data: orderBook, isLoading, error, refetch } = useQuery({
    queryKey: ['polymarket', 'orderbook', tokenId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/orderbook?token_id=${encodeURIComponent(tokenId!)}`);
      if (!response.ok) throw new Error(`Orderbook API error: ${response.status}`);
      const json = await response.json();
      const data = json.data || json;
      return {
        bids: (data.bids || []).map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) })),
        asks: (data.asks || []).map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) })),
      };
    },
    enabled: !!tokenId,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    refetchInterval: refreshInterval,
    placeholderData: (prev: any) => prev,
  });

  return {
    orderBook: orderBook ?? null,
    isLoading: isLoading && !orderBook,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch orderbook') : null,
    refetch: async () => { await refetch(); },
  };
}

// Helper to format volume
export function formatPolymarketVolume(volume: number): string {
  if (volume >= 1_000_000_000) return `$${(volume / 1_000_000_000).toFixed(2)}B`;
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}K`;
  return `$${volume.toFixed(0)}`;
}

// Hook to fetch a single Polymarket market by slug (React Query)
export function usePolymarketMarket(
  slug: string | undefined,
  options: { enabled?: boolean; refreshInterval?: number } = {}
) {
  const { enabled = true, refreshInterval = 30000 } = options;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['polymarket', 'market', slug],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/market?slug=${encodeURIComponent(slug!)}`);
      if (!response.ok) {
        if (response.status === 404) throw new Error('Market not found');
        throw new Error(`API error: ${response.status}`);
      }
      const json = await response.json();
      const eventData: PolymarketEvent = json.data || json.event;
      if (!eventData) throw new Error('Market not found');

      const transformed = transformToUnified(eventData);
      return {
        market: transformed.length > 0 ? transformed[0] : null,
        event: eventData,
      };
    },
    enabled: enabled && !!slug,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    refetchInterval: refreshInterval > 0 ? refreshInterval : false,
    placeholderData: (prev: any) => prev,
  });

  return {
    market: data?.market ?? null,
    event: data?.event ?? null,
    isLoading: enabled && !slug ? true : (isLoading && !data),
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch market') : null,
    refetch: async () => { await refetch(); },
  };
}

// Price history point type
export interface PolymarketPricePoint {
  timestamp: number;
  price: number;
}

// Hook to fetch Polymarket price history for charting (React Query)
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

  const { data: history, isLoading, error, refetch } = useQuery({
    queryKey: ['polymarket', 'priceHistory', tokenId, interval, fidelity],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('market', tokenId!);
      params.set('interval', interval);
      params.set('fidelity', fidelity.toString());

      const response = await fetch(`${API_BASE}/prices-history?${params}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const json = await response.json();
      const data = json.data || json;
      isDev && console.log(`[usePolymarketPriceHistory] Fetched ${data.history?.length || 0} price points for token ${tokenId!.slice(0, 8)}...`);
      return (data.history || []) as PolymarketPricePoint[];
    },
    enabled: enabled && !!tokenId,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    refetchInterval: refreshInterval > 0 ? refreshInterval : false,
    placeholderData: (prev: any) => prev,
  });

  return {
    history: history ?? [],
    isLoading: isLoading && !history,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch price history') : null,
    refetch: async () => { await refetch(); },
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

// Hook to fetch price history for multiple tokens (for multi-outcome markets) (React Query)
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

  // Stable key from market token IDs
  const marketsKey = useMemo(
    () => markets?.map(m => m.tokenId).join(',') || '',
    [markets]
  );

  const { data: seriesData, isLoading, error, refetch } = useQuery({
    queryKey: ['polymarket', 'multiPriceHistory', marketsKey, interval, fidelity],
    queryFn: async () => {
      const results = await Promise.all(
        (markets || []).map(async (market) => {
          try {
            const params = new URLSearchParams();
            params.set('market', market.tokenId);
            params.set('interval', interval);
            params.set('fidelity', fidelity.toString());

            const response = await fetch(`${API_BASE}/prices-history?${params}`);
            if (!response.ok) return { ...market, history: [] };

            const json = await response.json();
            const data = json.data || json;
            return {
              id: market.id,
              label: market.label,
              tokenId: market.tokenId,
              history: data.history || [],
              currentPrice: market.currentPrice,
            };
          } catch {
            return { ...market, history: [] };
          }
        })
      );
      return results as MultiSeriesPriceHistory[];
    },
    enabled: enabled && !!markets && markets.length > 0,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    refetchInterval: refreshInterval > 0 ? refreshInterval : false,
    placeholderData: (prev: any) => prev,
  });

  return {
    seriesData: seriesData ?? [],
    isLoading: isLoading && !seriesData,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch price histories') : null,
    refetch: async () => { await refetch(); },
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

// Hook to fetch Polymarket comments (React Query — no auto-refresh, manual only)
export function usePolymarketComments(
  eventId: string | undefined,
  options: { refreshInterval?: number; enabled?: boolean } = {}
) {
  const { refreshInterval = 0, enabled = true } = options;

  const { data: comments, isLoading, error, refetch } = useQuery({
    queryKey: ['polymarket', 'comments', eventId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/comments?event_id=${encodeURIComponent(eventId!)}`);
      if (!response.ok) return [] as PolymarketComment[];
      const json = await response.json();
      const data = json.data || json;
      return (data.comments || data || []) as PolymarketComment[];
    },
    enabled: enabled && !!eventId,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    refetchInterval: refreshInterval > 0 ? refreshInterval : false,
    placeholderData: (prev: any) => prev,
    retry: 1,
  });

  return {
    comments: comments ?? [],
    isLoading: isLoading && !comments,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch comments') : null,
    refetch: async () => { await refetch(); },
  };
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

// Hook to fetch Polymarket top holders (React Query — fetch once, no auto-refresh)
export function usePolymarketHolders(
  conditionId: string | undefined,
  options: { limit?: number; enabled?: boolean } = {}
) {
  const { limit = 20, enabled = true } = options;

  const { data: holders, isLoading, error, refetch } = useQuery({
    queryKey: ['polymarket', 'holders', conditionId, limit],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/holders?market=${encodeURIComponent(conditionId!)}&limit=${limit}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const json = await response.json();
      const data = json.data || json;
      return (data.holders || data || []) as PolymarketHolder[];
    },
    enabled: enabled && !!conditionId,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    placeholderData: (prev: any) => prev,
  });

  return {
    holders: holders ?? [],
    isLoading: isLoading && !holders,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch holders') : null,
    refetch: async () => { await refetch(); },
  };
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

// Hook to fetch Polymarket activity (React Query)
export function usePolymarketActivity(
  conditionId: string | undefined,
  options: { limit?: number; refreshInterval?: number; enabled?: boolean } = {}
) {
  const { limit = 50, refreshInterval = 30000, enabled = true } = options;

  const { data: activities, isLoading, error, refetch } = useQuery({
    queryKey: ['polymarket', 'activity', conditionId, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('market', conditionId!);
      params.set('limit', limit.toString());

      const response = await fetch(`${API_BASE}/activity?${params}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const json = await response.json();
      const data = json.data || json;
      return (data.activities || data || []) as PolymarketActivity[];
    },
    enabled: enabled && !!conditionId,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    refetchInterval: refreshInterval > 0 ? refreshInterval : false,
    placeholderData: (prev: any) => prev,
  });

  return {
    activities: activities ?? [],
    isLoading: isLoading && !activities,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch activity') : null,
    refetch: async () => { await refetch(); },
  };
}
