import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { PredictionMarket } from '~/components/predictions';
import { env } from '~/env';

const isDev = process.env.NODE_ENV !== 'production';

// DFlow API Configuration
// Use backend API (API keys are securely stored on backend)
const API_BASE = `${env.NEXT_PUBLIC_BACKEND_URL}/api/prediction/dflow`;
const WS_BASE = `${env.NEXT_PUBLIC_BACKEND_URL?.replace('http', 'ws')}/ws/predictions`;

// Headers for backend API
const getHeaders = () => ({
  'Accept': 'application/json',
  'Content-Type': 'application/json',
});

// Complete DFlow Market type with all API fields
export interface DFlowMarket {
  ticker: string;
  eventTicker: string;
  marketType: 'binary' | 'multi';
  title: string;
  subtitle?: string;
  yesSubTitle?: string;
  noSubTitle?: string;
  openTime?: number;
  closeTime?: number;
  expirationTime?: number;
  status: string;
  volume: number;
  result?: 'yes' | 'no' | null;
  openInterest?: number;
  canCloseEarly?: boolean;
  earlyCloseCondition?: string;
  rulesPrimary?: string;
  rulesSecondary?: string;
  yesBid?: number | null;
  yesAsk?: number | null;
  noBid?: number | null;
  noAsk?: number | null;
  accounts?: Record<string, {
    marketLedger: string;
    yesMint: string;
    noMint: string;
    isInitialized: boolean;
    redemptionStatus: string | null;
  }>;
}

// Complete DFlow Event type with all API fields
export interface DFlowEvent {
  ticker: string;
  seriesTicker?: string;
  strikeDate?: string | null;
  strikePeriod?: string | null;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  category?: string;
  competition?: string;
  competitionScope?: string;
  settlementSources?: Array<{
    name: string;
    url: string;
  }>;
  volume?: number;
  volume24h?: number;
  liquidity?: number;
  openInterest?: number;
  markets?: DFlowMarket[];
}

// Extended PredictionMarket with additional DFlow data
export interface ExtendedPredictionMarket extends PredictionMarket {
  // Market details
  marketType: 'binary' | 'multi';
  subtitle?: string;
  yesSubTitle?: string;
  noSubTitle?: string;
  eventTicker?: string;
  outcomeCount?: number; // Number of outcomes for multi-outcome markets
  topOutcomes?: { name: string; probability: number }[]; // Top outcomes for multi-outcome cards

  // Timing
  openTime?: number;
  closeTime?: number;
  expirationTime?: number;

  // Order book / pricing
  yesBid?: number | null;
  yesAsk?: number | null;
  noBid?: number | null;
  noAsk?: number | null;

  // Market stats
  openInterest?: number;
  liquidity?: number;
  result?: 'yes' | 'no' | null;

  // Rules & conditions
  canCloseEarly?: boolean;
  earlyCloseCondition?: string;
  rulesPrimary?: string;
  rulesSecondary?: string;

  // Settlement
  settlementSources?: Array<{
    name: string;
    url: string;
  }>;

  // Solana accounts
  accounts?: Record<string, {
    marketLedger: string;
    yesMint: string;
    noMint: string;
    isInitialized: boolean;
    redemptionStatus: string | null;
  }>;

  // Event data
  competition?: string;
  competitionScope?: string;
  seriesTicker?: string;
}

interface DFlowMarketsResponse {
  markets: DFlowMarket[];
  cursor?: number;
}

interface DFlowEventsResponse {
  events: DFlowEvent[];
  cursor?: number;
}

// Map DFlow category to our category system
function mapCategory(event?: DFlowEvent): string {
  if (!event) return 'other';

  const title = (event.title || '').toLowerCase();
  const ticker = (event.ticker || '').toLowerCase();
  const competition = (event.competition || '').toLowerCase();

  // Sports detection
  if (competition || ticker.includes('sb') || title.includes('super bowl') ||
      title.includes('nfl') || title.includes('nba') || title.includes('mlb') ||
      title.includes('champion') || title.includes('world series')) {
    return 'sports';
  }

  // Politics detection
  if (ticker.includes('pres') || ticker.includes('senate') || ticker.includes('house') ||
      title.includes('president') || title.includes('election') || title.includes('mayor') ||
      title.includes('governor') || title.includes('congress') || title.includes('democrat') ||
      title.includes('republican')) {
    return 'politics';
  }

  // Crypto detection
  if (title.includes('bitcoin') || title.includes('btc') || title.includes('ethereum') ||
      title.includes('eth') || title.includes('crypto') || title.includes('solana')) {
    return 'crypto';
  }

  // Economics detection
  if (title.includes('fed') || title.includes('rate') || title.includes('gdp') ||
      title.includes('inflation') || title.includes('economy') || title.includes('stock') ||
      title.includes('market') || title.includes('recession')) {
    return 'economics';
  }

  // Entertainment detection
  if (title.includes('oscar') || title.includes('emmy') || title.includes('grammy') ||
      title.includes('movie') || title.includes('film') || title.includes('album') ||
      title.includes('artist')) {
    return 'entertainment';
  }

  // Science detection
  if (title.includes('spacex') || title.includes('nasa') || title.includes('mars') ||
      title.includes('moon') || title.includes('climate') || title.includes('vaccine')) {
    return 'science';
  }

  return 'other';
}

// Calculate prices from bid/ask or use defaults
function calculatePrices(market: DFlowMarket): { yesPrice: number; noPrice: number } {
  // If we have bid/ask, calculate mid price
  if (market.yesBid != null && market.yesAsk != null) {
    const yesPrice = (market.yesBid + market.yesAsk) / 2 / 100; // Convert from cents to decimal
    return { yesPrice, noPrice: 1 - yesPrice };
  }

  // For finalized markets, use result
  if (market.status === 'finalized' && market.result) {
    return market.result === 'yes'
      ? { yesPrice: 1.0, noPrice: 0.0 }
      : { yesPrice: 0.0, noPrice: 1.0 };
  }

  // Default to 50/50
  return { yesPrice: 0.5, noPrice: 0.5 };
}

// Map DFlow market to extended prediction market
function mapToExtendedMarket(
  market: DFlowMarket,
  event?: DFlowEvent
): ExtendedPredictionMarket {
  const prices = calculatePrices(market);

  // Determine status
  let status: 'active' | 'closed' | 'resolved' = 'active';
  if (market.status === 'finalized' || market.status === 'settled') {
    status = 'resolved';
  } else if (market.status === 'closed' || market.status === 'expired') {
    status = 'closed';
  }

  // Calculate closes at from expirationTime or closeTime
  const closesAt = market.expirationTime
    ? new Date(market.expirationTime * 1000).toISOString()
    : market.closeTime
      ? new Date(market.closeTime * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return {
    // Basic PredictionMarket fields
    ticker: market.ticker,
    title: market.title,
    category: mapCategory(event),
    yesPrice: prices.yesPrice,
    noPrice: prices.noPrice,
    yesPriceChange24h: 0, // API doesn't provide this
    noPriceChange24h: 0,
    volume24h: event?.volume24h || 0,
    totalVolume: market.volume || event?.volume || 0,
    closesAt,
    status,
    resolution: market.result || undefined,
    imageUrl: event?.imageUrl,

    // Extended fields
    marketType: market.marketType || 'binary',
    subtitle: market.subtitle || event?.subtitle,
    yesSubTitle: market.yesSubTitle,
    noSubTitle: market.noSubTitle,
    eventTicker: market.eventTicker,

    // Timing
    openTime: market.openTime,
    closeTime: market.closeTime,
    expirationTime: market.expirationTime,

    // Order book
    yesBid: market.yesBid,
    yesAsk: market.yesAsk,
    noBid: market.noBid,
    noAsk: market.noAsk,

    // Stats
    openInterest: market.openInterest || event?.openInterest,
    liquidity: event?.liquidity,
    result: market.result,

    // Rules
    canCloseEarly: market.canCloseEarly,
    earlyCloseCondition: market.earlyCloseCondition,
    rulesPrimary: market.rulesPrimary,
    rulesSecondary: market.rulesSecondary,

    // Settlement
    settlementSources: event?.settlementSources,

    // Solana accounts
    accounts: market.accounts,

    // Event data
    competition: event?.competition,
    competitionScope: event?.competitionScope,
    seriesTicker: event?.seriesTicker,
  };
}

interface UseDFlowMarketsOptions {
  enabled?: boolean;
  limit?: number;
  category?: string;
  search?: string;
  status?: 'all' | 'active' | 'closed' | 'finalized';
  refreshInterval?: number;
}

interface UseDFlowMarketsResult {
  markets: ExtendedPredictionMarket[];
  events: DFlowEvent[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  totalVolume: number;
  totalMarkets: number;
  totalOpenInterest: number;
  totalLiquidity: number;
}

export default function useDFlowMarkets(options: UseDFlowMarketsOptions = {}): UseDFlowMarketsResult {
  const {
    enabled = true,
    limit = 50,
    category,
    search,
    status = 'all',
    refreshInterval = 30000,
  } = options;

  const [markets, setMarkets] = useState<ExtendedPredictionMarket[]>([]);
  const [events, setEvents] = useState<DFlowEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalVolume, setTotalVolume] = useState(0);
  const [totalMarkets, setTotalMarkets] = useState(0);
  const [totalOpenInterest, setTotalOpenInterest] = useState(0);
  const [totalLiquidity, setTotalLiquidity] = useState(0);

  const fetchInProgress = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchMarkets = useCallback(async () => {
    if (fetchInProgress.current) return;

    try {
      fetchInProgress.current = true;
      setError(null);

      // Build query params for local proxy
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      if (search) params.set('search', search);
      if (status !== 'all') params.set('status', status);

      // Use local proxy (handles CORS)
      const response = await fetch(`${API_BASE}/markets?${params}`, {
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Markets API error: ${response.status}`);
      }

      // Backend returns { success: true, data: { markets, events } }
      const json = await response.json();
      const data = json.data || json;
      const marketsData: DFlowMarketsResponse = { markets: data.markets || [], cursor: data.cursor };
      const eventsData: DFlowEventsResponse = { events: data.events || [] };

      // Create a map of events by ticker for quick lookup
      const eventsMap = new Map<string, DFlowEvent>();
      eventsData.events?.forEach(event => {
        eventsMap.set(event.ticker, event);
      });

      // Map DFlow markets to extended format
      let mappedMarkets = marketsData.markets?.map(market => {
        const relatedEvent = eventsMap.get(market.eventTicker);
        return mapToExtendedMarket(market, relatedEvent);
      }) || [];

      // Filter by status if specified
      if (status !== 'all') {
        mappedMarkets = mappedMarkets.filter(m => {
          if (status === 'active') return m.status === 'active';
          if (status === 'closed') return m.status === 'closed';
          if (status === 'finalized') return m.status === 'resolved';
          return true;
        });
      }

      // Filter by category if specified
      if (category && category !== 'all') {
        mappedMarkets = mappedMarkets.filter(m => m.category === category);
      }

      // Calculate totals
      const total24hVolume = mappedMarkets.reduce((sum, m) => sum + (m.volume24h || 0), 0);
      const totalOI = mappedMarkets.reduce((sum, m) => sum + (m.openInterest || 0), 0);
      const totalLiq = eventsData.events?.reduce((sum, e) => sum + (e.liquidity || 0), 0) || 0;

      setMarkets(mappedMarkets);
      setEvents(eventsData.events || []);
      setTotalVolume(total24hVolume);
      setTotalMarkets(mappedMarkets.length);
      setTotalOpenInterest(totalOI);
      setTotalLiquidity(totalLiq);

      isDev && console.log(`[DFlow] Fetched ${mappedMarkets.length} markets, ${eventsData.events?.length || 0} events`);

    } catch (err) {
      console.error('[DFlow] Failed to fetch markets:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch prediction markets');
    } finally {
      setIsLoading(false);
      fetchInProgress.current = false;
    }
  }, [limit, category, search, status]);

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
    totalOpenInterest,
    totalLiquidity,
  };
}

// Hook to fetch a single market by ticker
export function useDFlowMarket(ticker: string | undefined) {
  const { markets, isLoading, error, refetch } = useDFlowMarkets({
    enabled: !!ticker,
    limit: 200,
  });

  const market = ticker
    ? markets.find(m => m.ticker === ticker)
    : null;

  return { market, isLoading, error, refetch };
}

// Export types for external use (DFlowMarket, DFlowEvent already exported at definition)
export type { UseDFlowMarketsOptions, UseDFlowMarketsResult };

// Helper to get a quote for buying/selling outcome tokens
export async function getDFlowQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
}): Promise<{
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
} | null> {
  try {
    const queryParams = new URLSearchParams({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount.toString(),
      slippageBps: (params.slippageBps || 50).toString(),
    });

    const response = await fetch(`${API_BASE}/quote?${queryParams}`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Quote API error: ${response.status}`);
    }

    const json = await response.json();
    return json.data || json;
  } catch (err) {
    console.error('[DFlow] Failed to get quote:', err);
    return null;
  }
}

// Helper to get a swap transaction from DFlow
export async function getDFlowSwap(params: {
  quoteResponse: Awaited<ReturnType<typeof getDFlowQuote>>;
  userPublicKey: string;
}): Promise<{
  swapTransaction: string; // base64 encoded transaction
  lastValidBlockHeight: number;
} | null> {
  if (!params.quoteResponse) return null;

  try {
    const response = await fetch(`${API_BASE}/swap`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        quoteResponse: params.quoteResponse,
        userPublicKey: params.userPublicKey,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Swap API error: ${response.status} - ${errorText}`);
    }

    const json = await response.json();
    return json.data || json;
  } catch (err) {
    console.error('[DFlow] Failed to get swap transaction:', err);
    return null;
  }
}

// Types for trades and order book
export interface DFlowTrade {
  tradeId: string;
  ticker: string;
  price: number;
  count: number;
  yesPrice: number;
  noPrice: number;
  yesPriceDollars: string;
  noPriceDollars: string;
  takerSide: 'yes' | 'no';
  createdTime: number;
}

export interface DFlowOrderBook {
  yes_bids: Record<string, number>;
  no_bids: Record<string, number>;
  sequence: number;
}

// Fetch recent trades for a market
export async function getDFlowTrades(params: {
  ticker?: string;
  limit?: number;
}): Promise<{ trades: DFlowTrade[]; cursor?: string } | null> {
  try {
    const queryParams = new URLSearchParams();
    if (params.ticker) queryParams.set('ticker', params.ticker);
    if (params.limit) queryParams.set('limit', params.limit.toString());

    const response = await fetch(`${API_BASE}/trades?${queryParams}`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Trades API error: ${response.status}`);
    }

    const json = await response.json();
    return { trades: json.data || json.trades || [] };
  } catch (err) {
    console.error('[DFlow] Failed to fetch trades:', err);
    return null;
  }
}

// Fetch order book for a market
export async function getDFlowOrderBook(ticker: string): Promise<DFlowOrderBook | null> {
  try {
    const response = await fetch(`${API_BASE}/orderbook?ticker=${encodeURIComponent(ticker)}`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      // Order book may not exist for finalized markets
      if (response.status === 404) return null;
      throw new Error(`OrderBook API error: ${response.status}`);
    }

    const json = await response.json();
    return json.data || json;
  } catch (err) {
    console.error('[DFlow] Failed to fetch order book:', err);
    return null;
  }
}

// Hook to fetch trades for a specific market
export function useDFlowTrades(ticker: string, options: { limit?: number; refreshInterval?: number } = {}) {
  const { limit = 20, refreshInterval = 10000 } = options;
  const [trades, setTrades] = useState<DFlowTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = useCallback(async () => {
    if (!ticker) return;

    try {
      const result = await getDFlowTrades({ ticker, limit });
      if (result?.trades) {
        setTrades(result.trades);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch trades');
    } finally {
      setIsLoading(false);
    }
  }, [ticker, limit]);

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchTrades, refreshInterval]);

  return { trades, isLoading, error, refetch: fetchTrades };
}

// Hook to fetch order book for a specific market
export function useDFlowOrderBook(ticker: string, options: { refreshInterval?: number } = {}) {
  const { refreshInterval = 5000 } = options;
  const [orderBook, setOrderBook] = useState<DFlowOrderBook | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderBook = useCallback(async () => {
    if (!ticker) return;

    try {
      const result = await getDFlowOrderBook(ticker);
      setOrderBook(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch order book');
    } finally {
      setIsLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    fetchOrderBook();
    const interval = setInterval(fetchOrderBook, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchOrderBook, refreshInterval]);

  // Process order book into sorted arrays
  const processedOrderBook = useMemo(() => {
    if (!orderBook) return null;

    const yesBids = Object.entries(orderBook.yes_bids)
      .map(([price, size]) => ({ price: parseFloat(price), size }))
      .sort((a, b) => b.price - a.price); // Highest first

    const noBids = Object.entries(orderBook.no_bids)
      .map(([price, size]) => ({ price: parseFloat(price), size }))
      .sort((a, b) => b.price - a.price); // Highest first

    return { yesBids, noBids, sequence: orderBook.sequence };
  }, [orderBook]);

  return { orderBook: processedOrderBook, isLoading, error, refetch: fetchOrderBook };
}

// Types for price history
export interface DFlowPriceHistoryPoint {
  yesPrice: number;
  noPrice: number;
  volume: number;
  timestamp: number;
}

// Fetch price history for a market (forecast history)
export async function getDFlowPriceHistory(params: {
  ticker: string;
  period?: 'hour' | 'day' | 'week' | 'month' | 'all';
}): Promise<{ history: DFlowPriceHistoryPoint[] } | null> {
  try {
    const queryParams = new URLSearchParams();
    queryParams.set('ticker', params.ticker);
    if (params.period) queryParams.set('period', params.period);

    const response = await fetch(`${API_BASE}/price-history?${queryParams}`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      // Price history may not exist for all markets
      if (response.status === 404) return null;
      throw new Error(`PriceHistory API error: ${response.status}`);
    }

    const json = await response.json();
    return json.data || json;
  } catch (err) {
    console.error('[DFlow] Failed to fetch price history:', err);
    return null;
  }
}

// Hook to fetch price history for a specific market
export function useDFlowPriceHistory(
  ticker: string,
  options: { period?: 'hour' | 'day' | 'week' | 'month' | 'all'; refreshInterval?: number } = {}
) {
  const { period = 'day', refreshInterval = 60000 } = options;
  const [history, setHistory] = useState<DFlowPriceHistoryPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!ticker) return;

    try {
      const result = await getDFlowPriceHistory({ ticker, period });
      if (result?.history) {
        setHistory(result.history);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch price history');
    } finally {
      setIsLoading(false);
    }
  }, [ticker, period]);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchHistory, refreshInterval]);

  return { history, isLoading, error, refetch: fetchHistory };
}

// Helper to format volume
export function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) return `$${(volume / 1_000_000_000).toFixed(2)}B`;
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}K`;
  return `$${volume.toFixed(0)}`;
}

// Helper to format open interest
export function formatOpenInterest(oi: number): string {
  if (oi >= 1_000_000) return `${(oi / 1_000_000).toFixed(2)}M`;
  if (oi >= 1_000) return `${(oi / 1_000).toFixed(1)}K`;
  return oi.toFixed(0);
}

// ============================================
// WebSocket Service for Real-Time Updates
// ============================================

export interface DFlowWSPriceUpdate {
  channel: 'prices';
  ticker: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  timestamp: number;
}

export interface DFlowWSTradeUpdate {
  channel: 'trades';
  ticker: string;
  side: 'yes' | 'no';
  price: number;
  size: number;
  timestamp: number;
}

export interface DFlowWSOrderbookUpdate {
  channel: 'orderbook';
  ticker: string;
  yes_bids: Record<string, number>;
  no_bids: Record<string, number>;
  sequence: number;
}

type DFlowWSMessage = DFlowWSPriceUpdate | DFlowWSTradeUpdate | DFlowWSOrderbookUpdate;

export type DFlowWSCallback = (data: DFlowWSMessage) => void;

class DFlowWebSocketService {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, Set<DFlowWSCallback>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private pingInterval: NodeJS.Timeout | null = null;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        // Wait for existing connection attempt
        const checkConnection = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection);
            resolve();
          }
        }, 100);
        return;
      }

      this.isConnecting = true;

      try {
        // Connect to backend WebSocket (which proxies to DFlow)
        this.ws = new WebSocket(WS_BASE);

        this.ws.onopen = () => {
          isDev && console.log('[DFlow WS] Connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;

          // Start ping to keep connection alive
          this.startPing();

          // Re-subscribe to all existing subscriptions
          this.subscriptions.forEach((_, key) => {
            const [channel, ticker] = key.split(':');
            this.sendSubscribe(channel as 'prices' | 'trades' | 'orderbook', ticker);
          });

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as DFlowWSMessage;
            if (data.channel && data.ticker) {
              const key = `${data.channel}:${data.ticker}`;
              const callbacks = this.subscriptions.get(key);
              callbacks?.forEach(cb => cb(data));
            }
          } catch (err) {
            console.error('[DFlow WS] Parse error:', err);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[DFlow WS] Error:', error);
          this.isConnecting = false;
        };

        this.ws.onclose = () => {
          isDev && console.log('[DFlow WS] Disconnected');
          this.isConnecting = false;
          this.stopPing();
          this.attemptReconnect();
        };

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: 'ping' }));
      }
    }, 30000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[DFlow WS] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    isDev && console.log(`[DFlow WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  private sendSubscribe(channel: 'prices' | 'trades' | 'orderbook', ticker: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        channel,
        ticker,
      }));
    }
  }

  private sendUnsubscribe(channel: 'prices' | 'trades' | 'orderbook', ticker: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'unsubscribe',
        channel,
        ticker,
      }));
    }
  }

  subscribe(channel: 'prices' | 'trades' | 'orderbook', ticker: string, callback: DFlowWSCallback): () => void {
    const key = `${channel}:${ticker}`;

    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }

    this.subscriptions.get(key)!.add(callback);

    // Connect and subscribe
    this.connect().then(() => {
      this.sendSubscribe(channel, ticker);
    }).catch(console.error);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscriptions.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscriptions.delete(key);
          this.sendUnsubscribe(channel, ticker);
        }
      }
    };
  }

  disconnect() {
    this.stopPing();
    this.subscriptions.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Singleton instance
export const dflowWebSocket = new DFlowWebSocketService();

// Hook for real-time price updates
export function useDFlowRealtimePrices(ticker: string) {
  const [prices, setPrices] = useState<{
    yesBid: number | null;
    yesAsk: number | null;
    noBid: number | null;
    noAsk: number | null;
  }>({
    yesBid: null,
    yesAsk: null,
    noBid: null,
    noAsk: null,
  });

  useEffect(() => {
    if (!ticker) return;

    const unsubscribe = dflowWebSocket.subscribe('prices', ticker, (data) => {
      if (data.channel === 'prices') {
        const priceData = data as DFlowWSPriceUpdate;
        setPrices({
          yesBid: priceData.yes_bid,
          yesAsk: priceData.yes_ask,
          noBid: priceData.no_bid,
          noAsk: priceData.no_ask,
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [ticker]);

  return prices;
}

// Hook for real-time trades
export function useDFlowRealtimeTrades(ticker: string, maxTrades: number = 20) {
  const [trades, setTrades] = useState<DFlowWSTradeUpdate[]>([]);

  useEffect(() => {
    if (!ticker) return;

    const unsubscribe = dflowWebSocket.subscribe('trades', ticker, (data) => {
      if (data.channel === 'trades') {
        setTrades(prev => {
          const newTrades = [data as DFlowWSTradeUpdate, ...prev];
          return newTrades.slice(0, maxTrades);
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [ticker, maxTrades]);

  return trades;
}

// Hook for real-time orderbook
export function useDFlowRealtimeOrderbook(ticker: string) {
  const [orderbook, setOrderbook] = useState<{
    yesBids: Array<{ price: number; size: number }>;
    noBids: Array<{ price: number; size: number }>;
    sequence: number;
  } | null>(null);

  useEffect(() => {
    if (!ticker) return;

    const unsubscribe = dflowWebSocket.subscribe('orderbook', ticker, (data) => {
      if (data.channel === 'orderbook') {
        const obData = data as DFlowWSOrderbookUpdate;
        const yesBids = Object.entries(obData.yes_bids)
          .map(([price, size]) => ({ price: parseFloat(price), size }))
          .sort((a, b) => b.price - a.price);
        const noBids = Object.entries(obData.no_bids)
          .map(([price, size]) => ({ price: parseFloat(price), size }))
          .sort((a, b) => b.price - a.price);

        setOrderbook({ yesBids, noBids, sequence: obData.sequence });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [ticker]);

  return orderbook;
}
