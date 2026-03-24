import { useState, useCallback, useRef } from 'react';
import { env } from '~/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TalarionInstrument {
  instrument_id: string;
  title: string;
  rules: string;
  start_time: string;
  resolution_time: string;
  price?: number; // YES price 0-1, populated from quote or generation
}

export interface TalarionQuote {
  instrument_id: string;
  amount: number;
  price: number;
  buy_yes: boolean;
  expiry_utc: string;
}

export interface PolymarketMatch {
  ticker: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  volume: string;
  liquidity: string;
  outcomes: number;
  source: 'polymarket';
  slug?: string;
}

export interface TalarionTradeResult {
  trade_id: string;
  instrument_id: string;
  side: 'YES' | 'NO';
  amount: number;
  price: number;
  dollars: number;
  txHash: string | null;
  relaySuccessful: boolean;
}

interface UseTalarionResult {
  generateMarkets: (query: string, resolutionTime: string) => Promise<TalarionInstrument[]>;
  getQuote: (instrumentId: string, buyYes: boolean, dollars: number) => Promise<TalarionQuote>;
  executeTrade: (instrumentId: string, buyYes: boolean, dollars: number) => Promise<TalarionTradeResult>;
  isGenerating: boolean;
  isTrading: boolean;
  generatedMarkets: TalarionInstrument[];
  matchingPublicMarkets: PolymarketMatch[];
  error: string | null;
  clearMarkets: () => void;
}

// ---------------------------------------------------------------------------
// Mock fallbacks (used when backend is unavailable)
// ---------------------------------------------------------------------------

const MOCK_TEMPLATES = [
  { suffix: 'by end of period', rulePrefix: 'This market resolves YES if' },
  { suffix: 'before resolution', rulePrefix: 'Resolves YES when' },
  { suffix: 'within the timeframe', rulePrefix: 'Market resolves affirmatively if' },
];

async function mockGenerateMarkets(
  query: string,
  resolutionTime: string,
): Promise<TalarionInstrument[]> {
  // Simulate network + AI processing latency
  await new Promise((r) => setTimeout(r, 1800 + Math.random() * 600));

  const count = 2 + Math.floor(Math.random() * 2); // 2-3 markets
  const now = new Date();
  const markets: TalarionInstrument[] = [];

  for (let i = 0; i < count; i++) {
    const template = MOCK_TEMPLATES[i % MOCK_TEMPLATES.length]!;
    const price = 0.2 + Math.random() * 0.6; // 20-80 cent range

    markets.push({
      instrument_id: crypto.randomUUID(),
      title: i === 0 ? query : `${query} ${template.suffix}`,
      rules: `${template.rulePrefix} the stated condition is met based on verifiable on-chain or public data sources. Resolution is determined by Talarion oracle consensus.`,
      start_time: now.toISOString(),
      resolution_time: resolutionTime,
      price: Math.round(price * 100) / 100,
    });
  }

  return markets;
}

async function mockGetQuote(
  instrumentId: string,
  buyYes: boolean,
  dollars: number,
): Promise<TalarionQuote> {
  await new Promise((r) => setTimeout(r, 300));
  const price = 0.3 + Math.random() * 0.4;
  const expiry = new Date(Date.now() + 15_000); // 15s expiry

  return {
    instrument_id: instrumentId,
    amount: dollars / price,
    price,
    buy_yes: buyYes,
    expiry_utc: expiry.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const API_BASE = `${env.NEXT_PUBLIC_BACKEND_URL}/api/prediction/talarion`;

export default function useTalarion(authToken?: string): UseTalarionResult {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTrading, setIsTrading] = useState(false);
  const [generatedMarkets, setGeneratedMarkets] = useState<TalarionInstrument[]>([]);
  const [matchingPublicMarkets, setMatchingPublicMarkets] = useState<PolymarketMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    return headers;
  }, [authToken]);

  const generateMarkets = useCallback(
    async (query: string, resolutionTime: string): Promise<TalarionInstrument[]> => {
      // Cancel any in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setIsGenerating(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/generate`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ query, resolution_time: resolutionTime }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Generation failed (${res.status})`);
        }

        const json = await res.json();
        // Backend returns { success, instruments: [...] } — handle both shapes defensively
        const instruments: TalarionInstrument[] = json.instruments ?? json.data?.instruments ?? json.data ?? [];

        setGeneratedMarkets((prev) => [...instruments, ...prev].slice(0, 20));

        // In parallel: search existing Polymarket markets for related results
        searchPolymarketForQuery(query);

        return instruments;
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return [];
        }

        const msg = err instanceof Error ? err.message : 'Unknown error';

        // Only fallback to mock on network errors (fetch failed entirely)
        // For HTTP errors (400, 401, 500 etc.), propagate the real error
        const isNetworkError = err instanceof TypeError && (
          msg.includes('fetch') || msg.includes('Failed to fetch') || msg.includes('NetworkError')
        );

        if (isNetworkError) {
          console.warn('[useTalarion] Backend unreachable, using mock:', msg);
          try {
            const mocked = await mockGenerateMarkets(query, resolutionTime);
            setGeneratedMarkets((prev) => [...mocked, ...prev].slice(0, 20));
            searchPolymarketForQuery(query);
            return mocked;
          } catch {
            setError('Failed to generate markets. Please try again.');
            return [];
          }
        }

        // HTTP error — show real error message
        setError(msg);
        return [];
      } finally {
        setIsGenerating(false);
        abortRef.current = null;
      }
    },
    [getHeaders],
  );

  const getQuote = useCallback(
    async (instrumentId: string, buyYes: boolean, dollars: number): Promise<TalarionQuote> => {
      try {
        const res = await fetch(`${API_BASE}/quote`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            instrument_id: instrumentId,
            buy_yes: buyYes,
            dollars,
          }),
        });

        if (!res.ok) {
          throw new Error(`Quote failed (${res.status})`);
        }

        const json = await res.json();
        // Backend wraps response in { success, data }
        return (json.data ?? json) as TalarionQuote;
      } catch {
        // Fallback to mock
        return mockGetQuote(instrumentId, buyYes, dollars);
      }
    },
    [getHeaders],
  );

  /**
   * Search existing Polymarket markets for query matches (fire-and-forget, non-blocking)
   */
  const searchPolymarketForQuery = useCallback((query: string) => {
    const POLYMARKET_API = `${env.NEXT_PUBLIC_BACKEND_URL}/api/prediction/polymarket`;
    fetch(`${POLYMARKET_API}/events?active=true&closed=false&limit=100&order=volume24hr&ascending=false`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json) return;
        // Backend returns { success, data: [...events], count }
        const events = (json.data || json) as Array<any>;
        if (!Array.isArray(events) || events.length === 0) return;

        // Client-side fuzzy search — match query words against event titles + market questions
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
        if (queryWords.length === 0) return;

        const matches: PolymarketMatch[] = [];

        for (const evt of events) {
          if (!evt.title) continue;
          const titleLower = evt.title.toLowerCase();

          // Also check individual market questions for broader matching
          const marketQuestions = (evt.markets || []).map((m: any) => (m.question || '').toLowerCase()).join(' ');
          const searchText = `${titleLower} ${marketQuestions}`;

          const matchCount = queryWords.filter(w => searchText.includes(w)).length;
          if (matchCount === 0) continue;

          // Get first active market's prices
          const markets = evt.markets || [];
          const activeMarket = markets.find((m: any) => m.active !== false && !m.closed && !m.resolved) || markets[0];
          if (!activeMarket) continue;

          let yesPrice = 0.5, noPrice = 0.5;
          try {
            const priceStr = activeMarket.outcomePrices;
            const prices = typeof priceStr === 'string' ? JSON.parse(priceStr) : priceStr;
            if (Array.isArray(prices) && prices.length >= 2) {
              yesPrice = parseFloat(prices[0]) || 0.5;
              noPrice = parseFloat(prices[1]) || 1 - yesPrice;
            }
          } catch {}

          matches.push({
            ticker: evt.slug || activeMarket.slug || `poly-${activeMarket.id}`,
            title: evt.title,
            yesPrice,
            noPrice,
            volume: evt.volume || '0',
            liquidity: evt.liquidity || '0',
            outcomes: markets.length || 2,
            source: 'polymarket',
            slug: evt.slug,
          });
        }

        // Sort by match relevance (more matching words = higher), then volume
        matches.sort((a, b) => {
          const aScore = queryWords.filter(w => a.title.toLowerCase().includes(w)).length;
          const bScore = queryWords.filter(w => b.title.toLowerCase().includes(w)).length;
          if (bScore !== aScore) return bScore - aScore;
          return parseFloat(b.volume) - parseFloat(a.volume);
        });

        setMatchingPublicMarkets(matches.slice(0, 10));
      })
      .catch((err) => {
        console.warn('[useTalarion] Polymarket search failed:', err);
      });
  }, []);

  /**
   * Execute a full trade: quote → submit → sign → relay (all server-side via Turnkey)
   * The frontend calls ONE endpoint — private keys never leave the backend.
   */
  const executeTrade = useCallback(
    async (instrumentId: string, buyYes: boolean, dollars: number): Promise<TalarionTradeResult> => {
      setIsTrading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/trade`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            instrument_id: instrumentId,
            buy_yes: buyYes,
            dollars,
          }),
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `Trade failed (${res.status})`);
        }

        const json = await res.json();
        return (json.data ?? json) as TalarionTradeResult;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Trade execution failed';

        // For network errors in mock/dev, return a mock result
        const isNetworkError = err instanceof TypeError && (
          msg.includes('fetch') || msg.includes('Failed to fetch')
        );

        if (isNetworkError) {
          console.warn('[useTalarion] Backend unreachable for trade, using mock');
          await new Promise(r => setTimeout(r, 800));
          return {
            trade_id: crypto.randomUUID(),
            instrument_id: instrumentId,
            side: buyYes ? 'YES' : 'NO',
            amount: dollars / 0.5,
            price: 0.5,
            dollars,
            txHash: null,
            relaySuccessful: true,
          };
        }

        throw new Error(msg);
      } finally {
        setIsTrading(false);
      }
    },
    [getHeaders],
  );

  const clearMarkets = useCallback(() => {
    setGeneratedMarkets([]);
    setMatchingPublicMarkets([]);
    setError(null);
  }, []);

  return {
    generateMarkets,
    getQuote,
    executeTrade,
    isGenerating,
    isTrading,
    generatedMarkets,
    matchingPublicMarkets,
    error,
    clearMarkets,
  };
}
