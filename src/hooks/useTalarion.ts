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

  /**
   * Parse an SSE stream and call onInstrument for each instrument event.
   * Returns the collected instruments array.
   */
  const consumeSSEStream = async (
    response: globalThis.Response,
    onInstrument: (inst: TalarionInstrument) => void,
    signal: AbortSignal,
  ): Promise<TalarionInstrument[]> => {
    const allInstruments: TalarionInstrument[] = [];
    const reader = response.body?.getReader();
    if (!reader) return allInstruments;

    const decoder = new TextDecoder();
    let buffer = '';
    // Persist across chunks — an event may span multiple reader.read() calls
    let currentEvent = '';
    let currentData = '';

    try {
      while (true) {
        if (signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse complete SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // Keep incomplete last line in buffer

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);
          } else if (line === '' && currentData) {
            // Empty line = end of SSE event
            if (currentEvent === 'instrument') {
              try {
                const inst: TalarionInstrument = JSON.parse(currentData);
                if (inst?.instrument_id && inst?.title) {
                  // Keep price as-is (null = card shows loading dots, real = card shows buttons)
                  allInstruments.push(inst);
                  onInstrument(inst);
                }
              } catch (e) {
                console.warn('[useTalarion] SSE parse error:', e);
              }
            }
            // Reset for next event
            currentEvent = '';
            currentData = '';
          }
        }
      }
    } catch (e) {
      console.warn('[useTalarion] SSE stream read error:', e);
    } finally {
      reader.releaseLock();
    }

    return allInstruments;
  };

  /** Fire background quote fetches for instruments missing a price, retry until Talarion delivers */
  const fetchMissingQuotes = (instruments: TalarionInstrument[]) => {
    const updatePrice = (instrumentId: string, price: number) => {
      setGeneratedMarkets((prev) =>
        prev.filter(Boolean).map((m) =>
          m.instrument_id === instrumentId ? { ...m, price } : m
        )
      );
    };

    const isValidPrice = (p: number | undefined | null): p is number =>
      p != null && p > 0.01 && p < 0.99;

    for (const inst of instruments) {
      if (isValidPrice(inst.price)) continue;

      const fetchUntilPriced = async () => {
        const delays = [0, 1500, 3000, 5000, 8000]; // escalating waits
        for (const delay of delays) {
          if (delay > 0) await new Promise(r => setTimeout(r, delay));
          try {
            const q = await getQuote(inst.instrument_id, true, 10);
            if (isValidPrice(q.price)) {
              updatePrice(inst.instrument_id, q.price);
              return;
            }
          } catch { /* retry */ }
        }
      };

      fetchUntilPriced();
    }
  };

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

      // Clear previous results for fresh search
      setGeneratedMarkets([]);
      setMatchingPublicMarkets([]);

      // Fire Polymarket search IMMEDIATELY — don't wait for AI generation
      searchPolymarketForQuery(query);

      try {
        // Try SSE stream first (single connection, results stream as they arrive)
        const sseRes = await fetch(`${API_BASE}/generate-stream`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ query, resolution_time: resolutionTime }),
          signal: controller.signal,
        });

        // If SSE endpoint works, consume the stream
        if (sseRes.ok && sseRes.headers.get('content-type')?.includes('text/event-stream')) {
          const allInstruments = await consumeSSEStream(
            sseRes,
            (inst) => {
              // Each instrument appears immediately as it arrives (price may be null → loading dots)
              setGeneratedMarkets((prev) => [...prev.filter(Boolean), inst].slice(0, 20));
            },
            controller.signal,
          );

          // Background: fetch quotes for any instruments that arrived without a price
          fetchMissingQuotes(allInstruments);

          return allInstruments;
        }

        // Fallback: SSE not available — use parallel generate calls
        console.warn('[useTalarion] SSE stream unavailable, falling back to parallel fetches');
        const tags = ['trend', 'policy', 'person', 'crypto', 'macro'];
        const allInstruments: TalarionInstrument[] = [];
        const seenTitles = new Set<string>();

        const singleGenerate = async (tag: string) => {
          const res = await fetch(`${API_BASE}/generate`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ query, resolution_time: resolutionTime, tag }),
            signal: controller.signal,
          });
          if (!res.ok) return null;
          const json = await res.json();
          let instruments: TalarionInstrument[] = json.instruments ?? json.data?.instruments ?? json.data ?? [];
          if (!Array.isArray(instruments)) instruments = [instruments].filter(Boolean);

          const inst = instruments[0];
          if (!inst?.instrument_id || !inst.title) return null;

          const titleKey = inst.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
          if (seenTitles.has(titleKey)) return null;
          seenTitles.add(titleKey);

          // Don't set default price — let card show loading dots if price is null
          allInstruments.push(inst);
          setGeneratedMarkets((prev) => [...prev.filter(Boolean), inst].slice(0, 20));
          return inst;
        };

        await Promise.allSettled(tags.map((tag) => singleGenerate(tag).catch(() => null)));

        // Background: fetch quotes for instruments without price
        fetchMissingQuotes(allInstruments);

        return allInstruments;
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return [];
        }

        const msg = err instanceof Error ? err.message : 'Unknown error';

        // Only fallback to mock on network errors (fetch failed entirely)
        const isNetworkError = err instanceof TypeError && (
          msg.includes('fetch') || msg.includes('Failed to fetch') || msg.includes('NetworkError')
        );

        if (isNetworkError) {
          console.warn('[useTalarion] Backend unreachable, using mock:', msg);
          try {
            const mocked = await mockGenerateMarkets(query, resolutionTime);
            for (const inst of mocked) {
              setGeneratedMarkets((prev) => [...prev, inst].slice(0, 20));
              await new Promise(r => setTimeout(r, 300));
            }
            return mocked;
          } catch {
            setError('Failed to generate markets. Please try again.');
            return [];
          }
        }

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
   * Search Polymarket via backend — searches across all 8000+ cached events
   * plus Polymarket's own relevance-ranked search (results are merged & deduped)
   */
  const searchPolymarketForQuery = useCallback((query: string) => {
    const POLYMARKET_API = `${env.NEXT_PUBLIC_BACKEND_URL}/api/prediction/polymarket`;
    fetch(`${POLYMARKET_API}/search?q=${encodeURIComponent(query)}&limit=20`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json) return;
        const events = (json.data || []) as Array<any>;

        const matches: PolymarketMatch[] = [];
        for (const evt of events) {
          if (!evt.title) continue;
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

        setMatchingPublicMarkets(matches);
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
