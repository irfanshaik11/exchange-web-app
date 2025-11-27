import React, { useEffect, useRef, useState, useCallback } from 'react';

// Re-export types from BackendOHLCChart for consistency
export type BackendInterval = '1s' | '5s' | '15s' | '30s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '7d';
export type BackendTimeRange = '1h' | '4h' | '24h' | '7d' | '30d' | '90d' | '180d' | '365d';

export interface BackendOHLCData {
  unix_time: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v_usd: number;
}

export interface AdvancedOHLCChartProps {
  mint?: string;
  pairAddress?: string;
  interval?: BackendInterval;
  timeframe?: BackendTimeRange;
  optimize?: boolean;
  height?: string;
  width?: string;
  className?: string;
  baseRefreshMs?: number;
  onDataUpdate?: (data: BackendOHLCData[]) => void;
  preloadedData?: BackendOHLCData[];
  tradeData?: any[]; // Trade data for dev buy markers
  creatorAddress?: string | null; // Creator/dev wallet address
  tokenSymbol?: string | null;
  tokenName?: string | null;
  tokenDecimals?: number | null;
  network?: 'solana' | 'monad'; // Network type (defaults to 'solana' for backward compatibility)
}

const BACKEND_URL = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
const MONAD_BACKEND_URL = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL!;
const VALID_INTERVALS: BackendInterval[] = ['1s', '5s', '15s', '30s', '1m', '5m', '15m', '1h', '4h', '1d', '7d'];

// Map our intervals to TradingView resolution format
const INTERVAL_TO_RESOLUTION: Record<BackendInterval, string> = {
  '1s': '1S',
  '5s': '5S',
  '15s': '15S',
  '30s': '30S',
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': '1D',
  '7d': '1W',
};

// Reverse map: TradingView resolution -> our interval format
const RESOLUTION_TO_INTERVAL: Record<string, BackendInterval> = {
  '1S': '1s',
  '5S': '5s',
  '15S': '15s',
  '30S': '30s',
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '60': '1h',
  '240': '4h',
  '1D': '1d',
  '1W': '7d',
};

const formatUsdCompact = (value: number): string => {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;

  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const formatPriceUsd = (value: number): string => {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  let digits = 4;
  if (abs >= 1) digits = 2;
  if (abs < 1) digits = 4;
  if (abs < 0.1) digits = 6;
  if (abs < 0.01) digits = 8;

  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
};

const formatTokenAmount = (value: number, tokenDecimals?: number | null): string => {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  let digits = 2;

  if (abs >= 1_000_000) digits = 0;
  else if (abs >= 1_000) digits = 1;
  else if (abs >= 1) digits = 2;
  else if (abs >= 0.01) digits = 4;
  else digits = 6;

  if (typeof tokenDecimals === 'number' && tokenDecimals >= 0) {
    digits = Math.min(digits, Math.max(0, tokenDecimals));
  }

  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
};

const truncateAddress = (address?: string | null): string => {
  if (!address || address.length <= 10) return address || 'Unknown';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

const resolveTradeSymbol = (
  tradeSymbol: string | null | undefined,
  tokenSymbol?: string | null,
  tokenName?: string | null,
  mint?: string
): string => {
  const fromTrade = tradeSymbol?.trim();
  if (fromTrade) return fromTrade;

  const fromSymbol = tokenSymbol?.trim();
  if (fromSymbol) return fromSymbol;

  const fromName = tokenName?.trim();
  if (fromName) return fromName;

  if (mint && mint.length > 10) {
    return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
  }

  return 'Token';
};

function waitForVisibleContainer(el: HTMLElement): Promise<void> {
  return new Promise(resolve => {
    // Fast path: check immediately
    const r = el.getBoundingClientRect();
    const visible = r.width > 40 && r.height > 40 && el.isConnected && getComputedStyle(el).display !== 'none';
    if (visible) {
      resolve();
      return;
    }
    
    // Fallback: poll with requestAnimationFrame (but limit iterations)
    let iterations = 0;
    const maxIterations = 10; // Max ~160ms wait time
    const tick = () => {
      iterations++;
      const r = el.getBoundingClientRect();
      const visible = r.width > 40 && r.height > 40 && el.isConnected && getComputedStyle(el).display !== 'none';
      if (visible || iterations >= maxIterations) {
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

const AdvancedOHLCChart: React.FC<AdvancedOHLCChartProps> = ({
  mint,
  pairAddress,
  interval = '1m',
  timeframe = '24h',
  optimize = false,
  height = '400px',
  width = '100%',
  className = '',
  baseRefreshMs = 30000,
  onDataUpdate,
  preloadedData,
  tradeData = [],
  creatorAddress = null,
  tokenSymbol = null,
  tokenName = null,
  tokenDecimals = null,
  network = 'solana', // Default to solana for backward compatibility
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(!preloadedData || preloadedData.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [candles, setCandles] = useState<BackendOHLCData[]>(preloadedData || []);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(preloadedData && preloadedData.length > 0 ? new Date() : null);
  const [retryCount, setRetryCount] = useState(0);

  const selectedInterval = VALID_INTERVALS.includes(interval) ? interval : '1m';
  const [initialTokenId, setInitialTokenId] = useState<string | null>(() => (mint || pairAddress) ?? null);
  const latestParamsRef = useRef({
    mint,
    pairAddress,
    interval: selectedInterval,
    timeframe,
    optimize,
    network,
  });

  useEffect(() => {
    if (!initialTokenId && (mint || pairAddress)) {
      setInitialTokenId((mint || pairAddress) ?? null);
    }
  }, [initialTokenId, mint, pairAddress]);

  useEffect(() => {
    latestParamsRef.current = {
      mint,
      pairAddress,
      interval: VALID_INTERVALS.includes(interval) ? interval : '1m',
      timeframe,
      optimize,
      network,
    };
  }, [mint, pairAddress, interval, timeframe, optimize, network]);

  // Refs for data management (same as BackendOHLCChart)
  const lastGoodCandlesRef = useRef<BackendOHLCData[]>(preloadedData || []);
  const inFlightRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const lastFetchAtRef = useRef<number>(0);
  const firstLoadRef = useRef(!preloadedData || preloadedData.length === 0);
  const hasInitializedRef = useRef(false);
  const datafeedRef = useRef<any>(null);
  // Cache tracking - prevents redundant HTTP calls
  const cachedIntervalRef = useRef<string | null>(null);
  const fetchCountRef = useRef<number>(0); // Debug: track fetch count
  const getBarsInFlightRef = useRef<Promise<void> | null>(null); // Prevent concurrent getBars requests
  // WebSocket for real-time OHLC updates (Monad only)
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscribedCallbackRef = useRef<((bar: any) => void) | null>(null);
  const latestTradeDataRef = useRef<any[]>(tradeData || []);
  const latestCreatorAddressRef = useRef<string | null>(creatorAddress || null);
  const latestTokenSymbolRef = useRef<string | null>(tokenSymbol || null);
  const latestTokenNameRef = useRef<string | null>(tokenName || null);
  const latestTokenDecimalsRef = useRef<number | null>(
    typeof tokenDecimals === 'number' && !Number.isNaN(tokenDecimals) ? tokenDecimals : null
  );
  const marksInitializedRef = useRef(false);
  const prevTradeDataLengthRef = useRef<number>(tradeData?.length || 0);

  useEffect(() => {
    latestTradeDataRef.current = tradeData || [];
  }, [tradeData]);

  useEffect(() => {
    latestCreatorAddressRef.current = creatorAddress || null;
  }, [creatorAddress]);

  useEffect(() => {
    latestTokenSymbolRef.current = tokenSymbol || null;
  }, [tokenSymbol]);

  useEffect(() => {
    latestTokenNameRef.current = tokenName || null;
  }, [tokenName]);

  useEffect(() => {
    latestTokenDecimalsRef.current =
      typeof tokenDecimals === 'number' && !Number.isNaN(tokenDecimals) ? tokenDecimals : null;
  }, [tokenDecimals]);

  useEffect(() => {
    const tradeCount = tradeData?.length || 0;

    if (!widgetRef.current) {
      prevTradeDataLengthRef.current = tradeCount;
      return;
    }

    if (!creatorAddress || tradeCount === 0) {
      if (tradeCount === 0) {
        marksInitializedRef.current = false;
      }
      prevTradeDataLengthRef.current = tradeCount;
      return;
    }

    const previousCount = prevTradeDataLengthRef.current;

    if (!marksInitializedRef.current || (previousCount === 0 && tradeCount > 0)) {
      marksInitializedRef.current = true;
      widgetRef.current.onChartReady?.(() => {
        try {
          const chart = widgetRef.current?.chart?.();
          chart?.resetData?.();
          console.log('[AdvancedOHLCChart] Triggered chart reset to refresh marks', { tradeCount });
        } catch (error) {
          console.error('[AdvancedOHLCChart] Failed to reset chart for marks refresh', error);
        }
      });
    }

    prevTradeDataLengthRef.current = tradeCount;
  }, [creatorAddress, tradeData?.length]);

  // Build URL for OHLC data (same as BackendOHLCChart)
  // Allow override of interval for when TradingView requests a different resolution
  const buildUrl = useCallback(
    (overrideInterval?: BackendInterval) => {
      const { network: currentNetwork, mint: currentMint, pairAddress: currentPairAddress, interval: currentInterval, timeframe: currentTimeframe, optimize: currentOptimize } =
        latestParamsRef.current;

      const effectiveInterval = overrideInterval || currentInterval;

      if (currentNetwork === 'monad') {
        if (typeof window === 'undefined') {
          throw new Error('Cannot build Monad OHLC URL on the server');
        }
        const url = new URL('/api/token-service/ohlc-monad', window.location.origin);
        const tokenAddress = currentMint || currentPairAddress;
        if (tokenAddress) url.searchParams.set('token_address', tokenAddress);
        url.searchParams.set('interval', effectiveInterval);
        url.searchParams.set('timeframe', currentTimeframe);
        if (currentOptimize) url.searchParams.set('optimize', 'true');
        return url;
      }

      const url = new URL(`${BACKEND_URL}/v1/trade/ohlc-data`);
      if (currentMint) url.searchParams.set('mint', currentMint);
      if (currentPairAddress) url.searchParams.set('pair_address', currentPairAddress);
      url.searchParams.set('interval', effectiveInterval);
      url.searchParams.set('timeframe', currentTimeframe);
      if (currentOptimize) url.searchParams.set('optimize', 'true');
      return url;
    },
    []
  );

  // Fetch candles function (EXACT same logic as BackendOHLCChart)
  const fetchCandles = useCallback(async () => {
    const { mint: currentMint, pairAddress: currentPairAddress } = latestParamsRef.current;

    if (!currentMint && !currentPairAddress) {
      setError('No mint or pair address provided');
      setIsLoading(false);
      return;
    }

    if (preloadedData && preloadedData.length > 0) {
      console.log('[AdvancedOHLCChart] BLOCKING fetch - preloaded data available:', preloadedData.length, 'candles');
      setIsLoading(false);
      hasInitializedRef.current = true;
      return;
    }

    if (hasInitializedRef.current && firstLoadRef.current) {
      console.log('[AdvancedOHLCChart] Skipping fetch - already initialized');
      return;
    }

    const url = buildUrl();
    const key = url.toString();

    if (inFlightRef.current === key) {
      console.log('[AdvancedOHLCChart] Request already in flight for:', key);
      return;
    }

    console.log('[AdvancedOHLCChart] Starting fetch for:', key);
    inFlightRef.current = key;

    const now = Date.now();
    const since = now - lastFetchAtRef.current;
    if (!firstLoadRef.current && since < 1000) {
      await new Promise(r => setTimeout(r, 1000 - since));
    }
    lastFetchAtRef.current = Date.now();

    const doFetch = async (u: URL) => {
      console.log('[AdvancedOHLCChart] Fetching OHLC data from:', u.toString());
      const r = await fetch(u.toString(), {
        method: 'GET',
        headers: { accept: 'application/json', 'X-API-Key': process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key' },
      });
      let body: any = null;
      try {
        body = await r.clone().json();
      } catch {}
      if (!r.ok) throw new Error(body?.message || body?.error || `${r.status} ${r.statusText}`);
      if (!body?.success) throw new Error(body?.message || body?.error || 'API returned unsuccessful response');
      console.log('[AdvancedOHLCChart] Received OHLC data:', body?.data?.items?.length || 0, 'candles');
      return (body?.data?.items ?? []) as BackendOHLCData[];
    };

    try {
      if (firstLoadRef.current) setIsLoading(true);
      setError(null);

      const items = await doFetch(url);
      if (!items || items.length === 0) {
        setError(null);
        setRetryCount(n => Math.min(n + 1, 8));
        return;
      }

      lastGoodCandlesRef.current = items;
      setCandles(items);
      setLastUpdate(new Date());
      setRetryCount(0);
      onDataUpdate?.(items);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message || 'Fetch error');
      setCandles(lastGoodCandlesRef.current);
      setRetryCount(n => Math.min(n + 1, 8));
    } finally {
      if (mountedRef.current) setIsLoading(false);
      firstLoadRef.current = false;
      hasInitializedRef.current = true;
      inFlightRef.current = null;
    }
  }, [buildUrl, onDataUpdate, preloadedData]);

  // Load TradingView library
  useEffect(() => {
    console.log('[AdvancedOHLCChart] Checking TradingView library...', {
      libraryLoaded,
      hasTradingView: !!(window as any).TradingView,
      TradingViewType: typeof (window as any).TradingView,
    });

    if (libraryLoaded || (window as any).TradingView) {
      if ((window as any).TradingView) {
        console.log('[AdvancedOHLCChart] TradingView already available');
        setLibraryLoaded(true);
      }
      return;
    }

    // Check if script is already in the DOM (preloaded by _app.tsx)
    const existingScript = document.querySelector('script[src="/charting_library/charting_library/charting_library.standalone.js"]');
    
    if (existingScript) {
      // Script already exists, check if it's loaded
      if ((window as any).TradingView) {
        console.log('[AdvancedOHLCChart] TradingView already loaded from preloaded script');
        setLibraryLoaded(true);
        return;
      }
      // Script exists but not loaded yet, wait for it
      let timeoutId: NodeJS.Timeout | null = null;
      const checkInterval = setInterval(() => {
        if ((window as any).TradingView) {
          console.log('[AdvancedOHLCChart] ✅ TradingView library found from preloaded script!');
          setLibraryLoaded(true);
          clearInterval(checkInterval);
          if (timeoutId) clearTimeout(timeoutId);
        }
      }, 10); // Check every 10ms instead of waiting 100ms
      
      // Fallback timeout after 2 seconds
      timeoutId = setTimeout(() => {
        clearInterval(checkInterval);
        if (!(window as any).TradingView) {
          console.error('[AdvancedOHLCChart] ❌ TradingView not found after waiting for preloaded script');
          setError('Failed to load TradingView library - TradingView object not found');
          setIsLoading(false);
        }
      }, 2000);
      
      // Cleanup on unmount
      return () => {
        clearInterval(checkInterval);
        if (timeoutId) clearTimeout(timeoutId);
      };
    }
    
    // Script doesn't exist, create it
    console.log('[AdvancedOHLCChart] Loading TradingView library from /charting_library/charting_library/charting_library.standalone.js');
    const script = document.createElement('script');
    script.src = '/charting_library/charting_library/charting_library.standalone.js';
    script.async = true;
    script.onload = () => {
      console.log('[AdvancedOHLCChart] Script loaded, checking for TradingView...');
      // Reduced timeout - check immediately and then with a small delay if needed
      const checkTradingView = () => {
        if ((window as any).TradingView) {
          console.log('[AdvancedOHLCChart] ✅ TradingView library found!', {
            hasWidget: !!(window as any).TradingView.widget,
            TradingViewKeys: Object.keys((window as any).TradingView || {}),
          });
          setLibraryLoaded(true);
        } else {
          // If not ready immediately, check again after a shorter delay
          setTimeout(() => {
            if ((window as any).TradingView) {
              console.log('[AdvancedOHLCChart] ✅ TradingView library found after short delay!');
              setLibraryLoaded(true);
            } else {
              console.error('[AdvancedOHLCChart] ❌ TradingView not found after script load');
              setError('Failed to load TradingView library - TradingView object not found');
              setIsLoading(false);
            }
          }, 50); // Reduced from 100ms to 50ms
        }
      };
      checkTradingView();
    };
    script.onerror = (e) => {
      console.error('[AdvancedOHLCChart] ❌ Script load error:', e);
      setError('Failed to load charting library - script error');
      setIsLoading(false);
    };
    document.head.appendChild(script);

    return () => {
      // Don't remove script as it may be used by other components
    };
  }, [libraryLoaded]);

  // Update candles when preloaded data changes - PRIORITY DATA SOURCE (same as BackendOHLCChart)
  useEffect(() => {
    if (preloadedData && preloadedData.length > 0) {
      // Only use preloaded data if we have valid mint or pairAddress
      if (!mint && !pairAddress) {
        console.log('[AdvancedOHLCChart] Rejecting preloaded data - no mint or pairAddress yet');
        return;
      }
      
      console.log('[AdvancedOHLCChart] PRIORITY: Using preloaded data:', preloadedData.length, 'candles');
      
      // Set preloaded data as the primary source
      setCandles(preloadedData);
      lastGoodCandlesRef.current = preloadedData;
      setLastUpdate(new Date());
      setIsLoading(false);
      hasInitializedRef.current = true;
      firstLoadRef.current = false;
      
      onDataUpdate?.(preloadedData);
      
      // Don't start polling when we have preloaded data
      return;
    }

    // Only start polling if we don't have preloaded data
    console.log('[AdvancedOHLCChart] Starting API polling - no preloaded data available');
    mountedRef.current = true;
    fetchCandles();

    const backoff = Math.min(Math.pow(2, retryCount), 8);
    // Skip jitter for faster initial loading, add it only for subsequent polls
    const jitter = firstLoadRef.current ? 0 : Math.floor(Math.random() * 2000);
    const intervalMs = baseRefreshMs * backoff + jitter;

    const id = setInterval(fetchCandles, intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
      // Clean up WebSocket on unmount
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
        wsReconnectTimeoutRef.current = null;
      }
      subscribedCallbackRef.current = null;
    };
  }, [fetchCandles, retryCount, mint, pairAddress, selectedInterval, timeframe, baseRefreshMs, preloadedData, onDataUpdate]);

  // Handle prop changes - refetch data when interval/timeframe changes (same as BackendOHLCChart)
  const prevIntervalRef = useRef(selectedInterval);
  const prevTimeframeRef = useRef(timeframe);
  
  useEffect(() => {
    // Only refetch if parameters actually changed and we're not on initial load
    if (hasInitializedRef.current && 
        (prevIntervalRef.current !== selectedInterval || prevTimeframeRef.current !== timeframe)) {
      console.log('[AdvancedOHLCChart] Parameters changed, refetching data');
      prevIntervalRef.current = selectedInterval;
      prevTimeframeRef.current = timeframe;
      
      // Reset and refetch with new parameters
      hasInitializedRef.current = false;
      firstLoadRef.current = true;
      fetchCandles();
    }
  }, [selectedInterval, timeframe, fetchCandles]);

  // Pre-fetch data on mount (like BackendOHLCChart does)
  useEffect(() => {
    // Use preloaded data if available (same as BackendOHLCChart)
    if (preloadedData && preloadedData.length > 0) {
      console.log('[AdvancedOHLCChart] Using preloaded data:', preloadedData.length, 'candles');
      lastGoodCandlesRef.current = preloadedData;
      setCandles(preloadedData);
      setIsLoading(false);
      hasInitializedRef.current = true;
      return;
    }

    // Otherwise fetch data immediately (don't wait for TradingView to call getBars)
    if (!mint && !pairAddress) {
      setError('No mint or pair address provided');
      setIsLoading(false);
      return;
    }

    // Only fetch if we haven't initialized yet
    if (!hasInitializedRef.current) {
      console.log('[AdvancedOHLCChart] Pre-fetching data on mount');
      fetchCandles();
    }
  }, [mint, pairAddress, preloadedData]); // Run when these change

  // Monad OHLC WebSocket connection - runs independently of TradingView's lifecycle
  // This ensures real-time updates work even if subscribeBars isn't called by TradingView
  useEffect(() => {
    // Only connect for Monad network
    if (network !== 'monad') {
      return;
    }

    const tokenAddress = mint || pairAddress;
    if (!tokenAddress) {
      console.log('[AdvancedOHLCChart] Monad WebSocket: No token address, skipping');
      return;
    }

    // Build WebSocket URL
    const wsBaseUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL || 'http://localhost:8081';
    const requestedInterval = selectedInterval || '1s';
    const wsUrl = wsBaseUrl.replace(/^http/, 'ws') + `/v1/ohlc/stream?token_address=${tokenAddress}&interval=${requestedInterval}`;

    console.log('[AdvancedOHLCChart] 🔌 Monad WebSocket connecting (via useEffect):', wsUrl);

    // Close existing WebSocket if any
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[AdvancedOHLCChart] ✅ Monad WebSocket connected for', tokenAddress.slice(0, 10) + '...');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Handle initial history batch
          if (message.type === 'ohlc_history') {
            const candles = message.data as Array<any>;
            console.log('[AdvancedOHLCChart] 📊 WebSocket ohlc_history received:', candles.length, 'candles');
            console.log('[AdvancedOHLCChart] 📊 Raw first candle from WS:', JSON.stringify(candles[0]));

            if (candles.length === 0) {
              console.log('[AdvancedOHLCChart] ⚠️ No historical candles received from WebSocket');
              return;
            }

            // Clear existing cache and replace with WebSocket data
            lastGoodCandlesRef.current = [];

            // Update cache with historical data - WebSocket sends { time, o, h, l, c, v }
            candles.forEach((ohlcData: any, idx: number) => {
              const newCandle: BackendOHLCData = {
                unix_time: ohlcData.time,
                o: ohlcData.o,
                h: ohlcData.h,
                l: ohlcData.l,
                c: ohlcData.c,
                v_usd: ohlcData.v || 0,
              };

              // Log first few candles for debugging
              if (idx < 3) {
                console.log(`[AdvancedOHLCChart] 📊 Mapped candle ${idx}:`, JSON.stringify(newCandle));
              }

              lastGoodCandlesRef.current.push(newCandle);
            });

            // Sort cache by time
            lastGoodCandlesRef.current.sort((a, b) => a.unix_time - b.unix_time);

            console.log('[AdvancedOHLCChart] 📊 Cache populated:', lastGoodCandlesRef.current.length, 'candles');
            console.log('[AdvancedOHLCChart] 📊 Time range:', {
              first: new Date(lastGoodCandlesRef.current[0]?.unix_time * 1000).toISOString(),
              last: new Date(lastGoodCandlesRef.current[lastGoodCandlesRef.current.length - 1]?.unix_time * 1000).toISOString(),
            });

            // Update the cached interval ref so getBars knows we have fresh data for this interval
            cachedIntervalRef.current = selectedInterval;
            console.log('[AdvancedOHLCChart] 📊 cachedIntervalRef set to:', cachedIntervalRef.current);

            // Update state to trigger re-render
            setCandles([...lastGoodCandlesRef.current]);
            setIsLoading(false);
            hasInitializedRef.current = true;

            // Force TradingView to refresh data from the updated cache
            // Use a small delay to ensure React state has updated
            setTimeout(() => {
              if (widgetRef.current) {
                try {
                  console.log('[AdvancedOHLCChart] 📊 Forcing TradingView refresh via setSymbol...');
                  const tokenId = mint || pairAddress;
                  const currentResolution = INTERVAL_TO_RESOLUTION[selectedInterval] || '1S';

                  // Use onChartReady to ensure chart is available
                  widgetRef.current.onChartReady(() => {
                    try {
                      // Use setSymbol to force complete refresh including resolveSymbol (for price scale)
                      widgetRef.current.setSymbol(tokenId, currentResolution, () => {
                        console.log('[AdvancedOHLCChart] ✅ TradingView setSymbol() completed - chart should now show data');
                      });
                    } catch (e) {
                      console.log('[AdvancedOHLCChart] setSymbol failed, trying chart().resetData():', e);
                      try {
                        const chart = widgetRef.current.chart();
                        if (chart && typeof chart.resetData === 'function') {
                          chart.resetData();
                          console.log('[AdvancedOHLCChart] ✅ TradingView chart().resetData() called');
                        }
                      } catch (e2) {
                        console.log('[AdvancedOHLCChart] chart().resetData() also failed:', e2);
                      }
                    }
                  });
                } catch (e) {
                  console.log('[AdvancedOHLCChart] Could not refresh TradingView data:', e);
                }
              } else {
                console.log('[AdvancedOHLCChart] ⚠️ widgetRef.current is null, cannot refresh chart');
              }
            }, 100);

            return;
          }

          // Handle real-time candle updates
          if (message.type !== 'ohlc_candle') {
            return;
          }

          const ohlcData = message.data;

          console.log('[AdvancedOHLCChart] 📊 WebSocket OHLC update:', {
            time: new Date(ohlcData.time * 1000).toISOString(),
            close: ohlcData.c,
          });

          // Convert to TradingView bar format
          const bar = {
            time: (ohlcData.time || 0) * 1000, // Convert to ms
            open: ohlcData.o,
            high: ohlcData.h,
            low: ohlcData.l,
            close: ohlcData.c,
            volume: ohlcData.v || 0,
          };

          // Update the chart via callback if available
          if (subscribedCallbackRef.current && bar.time > 0) {
            subscribedCallbackRef.current(bar);
          }

          // Also update our cache with the new candle
          const newCandle: BackendOHLCData = {
            unix_time: bar.time / 1000,
            o: bar.open,
            h: bar.high,
            l: bar.low,
            c: bar.close,
            v_usd: bar.volume,
          };

          // Update or add the candle to cache
          const cachedData = lastGoodCandlesRef.current;
          const existingIdx = cachedData.findIndex(c => c.unix_time === newCandle.unix_time);
          if (existingIdx >= 0) {
            cachedData[existingIdx] = newCandle;
          } else {
            cachedData.push(newCandle);
            cachedData.sort((a, b) => a.unix_time - b.unix_time);
          }
        } catch (e) {
          console.error('[AdvancedOHLCChart] Error parsing WebSocket message:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('[AdvancedOHLCChart] Monad WebSocket error:', error);
      };

      ws.onclose = (event) => {
        console.log('[AdvancedOHLCChart] Monad WebSocket closed:', event.code, event.reason);
        wsRef.current = null;

        // Reconnect after delay if component is still mounted
        if (mountedRef.current) {
          wsReconnectTimeoutRef.current = setTimeout(() => {
            console.log('[AdvancedOHLCChart] Attempting Monad WebSocket reconnect...');
            // The useEffect will re-run and reconnect automatically
          }, 5000);
        }
      };
    } catch (e) {
      console.error('[AdvancedOHLCChart] Failed to create Monad WebSocket:', e);
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
        wsReconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [network, mint, pairAddress, selectedInterval]); // Re-connect when token or interval changes

  // Create custom datafeed that uses our fetched candles
  const createDatafeed = useCallback(() => {
    const { mint: dfMint, pairAddress: dfPairAddress, interval: dfInterval } = latestParamsRef.current;

    if (!dfMint && !dfPairAddress) {
      return null;
    }

    const resolution = INTERVAL_TO_RESOLUTION[dfInterval];

    // Create a custom datafeed that implements TradingView's datafeed interface
    const computeTradeDisplayValues = (trade: any) => {
      const parsedPrice = parseFloat(trade.price);
      const fallbackPrice = parseFloat(
        String(
          trade.price_usd ||
            trade.priceUsd ||
            trade.data?.priceUsd ||
            trade.originalEvent?.data?.priceUsd ||
            trade.data?.priceUsdTotal ||
            trade.originalEvent?.data?.priceUsdTotal ||
            0
        )
      );
      let price = Number.isFinite(parsedPrice) ? parsedPrice : fallbackPrice;

      const amountRaw =
        trade.amount ||
        trade.data?.amountNonLiquidityToken ||
        trade.data?.amount0 ||
        trade.data?.amount1 ||
        trade.originalEvent?.data?.amountNonLiquidityToken ||
        trade.originalEvent?.data?.amount0 ||
        trade.originalEvent?.data?.amount1 ||
        '0';

      const parsedAmount = parseFloat(String(amountRaw));
      const resolvedDecimals = latestTokenDecimalsRef.current;
      const formattedAmount = Number.isFinite(parsedAmount)
        ? formatTokenAmount(parsedAmount, resolvedDecimals)
        : String(amountRaw ?? 'N/A');

      const totalUsdRaw =
        trade.totalUSD ||
        trade.data?.priceUsdTotal ||
        trade.priceUsdTotal ||
        trade.originalEvent?.data?.priceUsdTotal ||
        (Number.isFinite(price) && Number.isFinite(parsedAmount) ? price * parsedAmount : null);

      const parsedTotalUsd = parseFloat(String(totalUsdRaw));

      if ((!Number.isFinite(price) || price === 0) && Number.isFinite(parsedTotalUsd) && Number.isFinite(parsedAmount) && parsedAmount !== 0) {
        price = parsedTotalUsd / parsedAmount;
      }

      const formattedPrice = formatPriceUsd(price);
      const formattedTotalUsd = formatUsdCompact(parsedTotalUsd);

      const displaySymbol = resolveTradeSymbol(
        trade.symbol,
        latestTokenSymbolRef.current,
        latestTokenNameRef.current,
        mint
      );

      const walletAddress = truncateAddress(trade.maker);

      return {
        price,
        parsedAmount,
        parsedTotalUsd,
        formattedAmount,
        formattedPrice,
        formattedTotalUsd,
        displaySymbol,
        walletAddress,
      };
    };

    const customDatafeed = {
      onReady: (callback: any) => {
        console.log('[AdvancedOHLCChart] ========== onReady CALLED ==========');
        const config = {
          supported_resolutions: ['1S', '5S', '15S', '30S', '1', '5', '15', '60', '240', '1D', '1W'],
          supports_group_request: false,
          supports_marks: true, // ✅ Enable marks support
          supports_search: false,
          supports_timescale_marks: true, // ✅ Enable timescale marks support
          supports_time: true,
          supports_seconds: true, // Required for second-based resolutions
        };
        console.log('[AdvancedOHLCChart] Datafeed config:', config);
        setTimeout(() => {
          if (typeof callback === 'function') {
            callback(config);
            console.log('[AdvancedOHLCChart] ✅ onReady callback completed - TradingView should now call getBars');
          } else {
            console.error('[AdvancedOHLCChart] ❌ onReady callback is not a function!', typeof callback);
          }
        }, 0);
      },

      searchSymbols: () => {
        // Not implemented
      },

      resolveSymbol: (symbolName: string, onSymbolResolvedCallback: any) => {
        console.log('[AdvancedOHLCChart] ========== resolveSymbol CALLED ==========', symbolName);
        
        // Calculate appropriate pricescale based on typical price range
        // For crypto tokens, prices can vary widely, so we'll use a more flexible approach
        // pricescale determines the precision: 100 = 2 decimals, 1000 = 3 decimals, etc.
        const samplePrice = lastGoodCandlesRef.current.length > 0 
          ? lastGoodCandlesRef.current[0].c 
          : 1;
        let pricescale = 100;
        if (samplePrice < 0.01) {
          pricescale = 100000000; // 8 decimals for very small prices
        } else if (samplePrice < 1) {
          pricescale = 1000000; // 6 decimals
        } else if (samplePrice < 100) {
          pricescale = 10000; // 4 decimals
        } else if (samplePrice < 1000) {
          pricescale = 100; // 2 decimals
        } else {
          pricescale = 1; // 0 decimals for large numbers
        }

        const symbolInfo = {
          name: symbolName,
          description: `${dfMint || dfPairAddress || 'Token'} Price Chart`,
          type: 'crypto',
          session: '24x7',
          timezone: 'Etc/UTC',
          ticker: symbolName,
          exchange: '',
          minmov: 1,
          pricescale: pricescale,
          has_intraday: true,
          has_weekly_and_monthly: false,
          has_seconds: true, // Required for second-based resolutions
          supported_resolutions: ['1S', '5S', '15S', '30S', '1', '5', '15', '60', '240', '1D', '1W'], // Must match onReady exactly
          volume_precision: 2,
          data_status: 'streaming',
        };

        console.log('[AdvancedOHLCChart] Resolved symbol info:', symbolInfo);
        
        setTimeout(() => {
          if (typeof onSymbolResolvedCallback === 'function') {
            onSymbolResolvedCallback(symbolInfo);
            console.log('[AdvancedOHLCChart] ✅ Symbol resolved successfully - TradingView should now call getBars');
          } else {
            console.error('[AdvancedOHLCChart] ❌ onSymbolResolvedCallback is not a function!', typeof onSymbolResolvedCallback);
          }
        }, 0);
      },

      getBars: async (
        symbolInfo: any,
        resolution: string,
        periodParams: any,
        onHistoryCallback: any,
        onErrorCallback: any
      ) => {
        // Convert TradingView resolution to our interval format
        const requestedInterval = RESOLUTION_TO_INTERVAL[resolution] || dfInterval;

        fetchCountRef.current += 1;
        const currentFetchCount = fetchCountRef.current;

        // CHECK CACHE FIRST - Only fetch if cache is empty OR interval changed
        const hasCachedData = lastGoodCandlesRef.current.length > 0;
        const intervalChanged = cachedIntervalRef.current !== requestedInterval;
        const needsFetch = !hasCachedData || intervalChanged;

        console.log('[AdvancedOHLCChart] ========== getBars #' + currentFetchCount + ' ==========');
        console.log('[AdvancedOHLCChart] getBars params:', {
          resolution,
          requestedInterval,
          cachedInterval: cachedIntervalRef.current,
          hasCachedData,
          cachedDataLength: lastGoodCandlesRef.current.length,
          intervalChanged,
          needsFetch,
          periodParams: periodParams ? {
            from: periodParams.from,
            to: periodParams.to,
            fromDate: new Date(periodParams.from * 1000).toISOString(),
            toDate: new Date(periodParams.to * 1000).toISOString(),
          } : null,
        });

        // If we have cached data and don't need to fetch, return immediately
        if (!needsFetch) {
          const items = lastGoodCandlesRef.current;
          console.log('[AdvancedOHLCChart] 📦 Using cached data (skipping HTTP):', items.length, 'candles');

          const allBars = items.map(item => ({
            time: item.unix_time * 1000,
            open: item.o,
            high: item.h,
            low: item.l,
            close: item.c,
            volume: item.v_usd || 0,
          })).filter(bar => bar.time > 0 && isFinite(bar.time));
          allBars.sort((a, b) => a.time - b.time);

          console.log('[AdvancedOHLCChart] 📦 Converted to TradingView format:', allBars.length, 'bars');
          if (allBars.length > 0) {
            console.log('[AdvancedOHLCChart] 📦 First bar:', JSON.stringify(allBars[0]));
            console.log('[AdvancedOHLCChart] 📦 Last bar:', JSON.stringify(allBars[allBars.length - 1]));
          }

          if (allBars.length > 0 && typeof onHistoryCallback === 'function') {
            console.log('[AdvancedOHLCChart] ✅ Calling onHistoryCallback with', allBars.length, 'bars (noData: false)');
            onHistoryCallback(allBars, { noData: false });
          } else if (typeof onHistoryCallback === 'function') {
            console.log('[AdvancedOHLCChart] ⚠️ No bars to return, calling onHistoryCallback with noData: true');
            onHistoryCallback([], { noData: true });
          }
          return;
        }

        // If there's already a request in-flight for this interval, wait for it
        if (getBarsInFlightRef.current && !intervalChanged) {
          console.log('[AdvancedOHLCChart] ⏳ Waiting for in-flight request...');
          try {
            await getBarsInFlightRef.current;
            // After waiting, use cached data
            const items = lastGoodCandlesRef.current;
            if (items.length > 0) {
              const allBars = items.map(item => ({
                time: item.unix_time * 1000,
                open: item.o,
                high: item.h,
                low: item.l,
                close: item.c,
                volume: item.v_usd || 0,
              })).filter(bar => bar.time > 0 && isFinite(bar.time));
              allBars.sort((a, b) => a.time - b.time);

              if (typeof onHistoryCallback === 'function') {
                onHistoryCallback(allBars, { noData: false });
              }
              return;
            }
          } catch {
            // In-flight request failed, continue to try our own request
          }
        }

        // Create a promise for this request so others can wait
        let resolveInFlight: () => void;
        let rejectInFlight: (e: any) => void;
        getBarsInFlightRef.current = new Promise((resolve, reject) => {
          resolveInFlight = resolve;
          rejectInFlight = reject;
        });

        try {
          let items: BackendOHLCData[];

          console.log('[AdvancedOHLCChart] 🌐 Making HTTP request (fetch #' + currentFetchCount + ')');

          const url = buildUrl(requestedInterval);
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              accept: 'application/json',
              'X-API-Key': process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key',
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const body = await response.json();
          if (!body?.success) {
            throw new Error(body?.message || body?.error || 'API returned unsuccessful response');
          }

          items = body?.data?.items ?? [];

          // Update cache
          if (items.length > 0) {
            lastGoodCandlesRef.current = items;
            cachedIntervalRef.current = requestedInterval;
            setCandles(items);
            onDataUpdate?.(items);
            console.log('[AdvancedOHLCChart] ✅ Cache updated with', items.length, 'candles');
          }

          // Signal that request is complete
          resolveInFlight!();
          getBarsInFlightRef.current = null;
          // Handle empty data case
          if (items.length === 0) {
            console.log('[AdvancedOHLCChart] No data available');
            if (typeof onHistoryCallback === 'function') {
              onHistoryCallback([], { noData: true });
            }
            return;
          }

          // Convert to TradingView format - IMPORTANT: time must be in MILLISECONDS!
          // Our backend returns unix_time in seconds, so we need to convert to milliseconds
          const allBars = items.map(item => {
            // Validate data
            if (typeof item.unix_time !== 'number' || 
                typeof item.o !== 'number' || 
                typeof item.h !== 'number' || 
                typeof item.l !== 'number' || 
                typeof item.c !== 'number') {
              console.warn('[AdvancedOHLCChart] Invalid bar data:', item);
              return null;
            }

            // TradingView expects time in milliseconds (Unix timestamp * 1000)
            const timeMs = item.unix_time * 1000;

            return {
              time: timeMs,
              open: item.o,
              high: item.h,
              low: item.l,
              close: item.c,
              volume: item.v_usd || 0,
            };
          }).filter((bar): bar is { time: number; open: number; high: number; low: number; close: number; volume: number } => {
            if (!bar) return false;
            // Basic validation - ensure time is valid
            return bar.time > 0 && isFinite(bar.time) && isFinite(bar.open) && isFinite(bar.high) && isFinite(bar.low) && isFinite(bar.close);
          });

          // Sort by time (ascending - oldest first)
          allBars.sort((a, b) => a.time - b.time);

          // Filter bars to requested time range (but be lenient - if filtering yields nothing, return all)
          const fromMs = (periodParams.from ?? 0) * 1000;
          const toMs = (periodParams.to ?? 0) * 1000;
          let bars = allBars;

          if (fromMs && toMs) {
            const filteredBars = allBars.filter(b => b.time >= fromMs && b.time <= toMs);
            if (filteredBars.length > 0) {
              bars = filteredBars;
            }
          }

          // Return bars to TradingView
          if (bars.length === 0) {
            if (typeof onHistoryCallback === 'function') {
              onHistoryCallback([], { noData: true });
            }
            return;
          }

          console.log('[AdvancedOHLCChart] ✅ Returning', bars.length, 'bars to TradingView');

          // Return bars to TradingView
          if (typeof onHistoryCallback === 'function') {
            onHistoryCallback(bars, { noData: false });
          }
        } catch (error: any) {
          console.error('[AdvancedOHLCChart] Error fetching bars:', error);

          // Signal that request failed
          rejectInFlight?.(error);
          getBarsInFlightRef.current = null;

          // Try to use cached data as fallback
          if (lastGoodCandlesRef.current.length > 0) {
            console.log('[AdvancedOHLCChart] Using cached data due to error');
            const allBars = lastGoodCandlesRef.current.map(item => ({
              time: item.unix_time * 1000, // Convert to milliseconds
              open: item.o,
              high: item.h,
              low: item.l,
              close: item.c,
              volume: item.v_usd || 0,
            })).filter(bar => bar.time > 0); // Filter out invalid bars
            allBars.sort((a, b) => a.time - b.time);
            
            // Filter to requested time range
            const fromMs = (periodParams.from ?? 0) * 1000;
            const toMs = (periodParams.to ?? 0) * 1000;
            const bars = (fromMs && toMs)
              ? allBars.filter(b => b.time >= fromMs && b.time <= toMs)
              : allBars;
            
            if (bars.length === 0) {
              console.log('[AdvancedOHLCChart] Cached data has no bars in requested range');
              if (typeof onHistoryCallback === 'function') {
                onHistoryCallback([], { noData: true });
              }
              return;
            }
            
            console.log('[AdvancedOHLCChart] Using cached data due to error, calling onHistoryCallback');
            if (typeof onHistoryCallback === 'function') {
              onHistoryCallback(bars, { noData: false });
            }
            return;
          }
          
          console.error('[AdvancedOHLCChart] No data available and no cached data, calling onErrorCallback');
          if (typeof onErrorCallback === 'function') {
            onErrorCallback(error?.message || 'Failed to fetch data');
          }
        }
      },

      subscribeBars: (
        symbolInfo: any,
        resolution: string,
        onRealtimeCallback: (bar: any) => void,
        subscriberUID: string,
        onResetCacheNeededCallback?: () => void
      ) => {
        const { network: currentNetwork, mint: currentMint, pairAddress: currentPairAddress } = latestParamsRef.current;
        const tokenAddress = currentMint || currentPairAddress;

        // DEBUG: Log all values to trace why WebSocket might not connect
        console.log('[AdvancedOHLCChart] subscribeBars called with:', {
          currentNetwork,
          currentMint,
          currentPairAddress,
          tokenAddress,
          resolution,
          subscriberUID,
          latestParamsRef: latestParamsRef.current,
        });

        // Only connect WebSocket for Monad network
        if (currentNetwork !== 'monad' || !tokenAddress) {
          console.log('[AdvancedOHLCChart] subscribeBars skipped - not Monad or no token, network:', currentNetwork, 'tokenAddress:', tokenAddress);
          return;
        }

        // Store callback for use in WebSocket message handler
        subscribedCallbackRef.current = onRealtimeCallback;

        // Get the interval for this resolution
        const requestedInterval = RESOLUTION_TO_INTERVAL[resolution] || '1s';

        // Build dedicated OHLC WebSocket URL with token address and interval
        const wsBaseUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL || 'http://localhost:8081';
        const wsUrl = wsBaseUrl.replace(/^http/, 'ws') + `/v1/ohlc/stream?token_address=${tokenAddress}&interval=${requestedInterval}`;

        console.log('[AdvancedOHLCChart] 🔌 Connecting dedicated OHLC WebSocket:', wsUrl);

        // Clean up existing connection
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }

        try {
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onopen = () => {
            console.log('[AdvancedOHLCChart] ✅ OHLC WebSocket connected for', tokenAddress.slice(0, 10) + '...');
          };

          ws.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data);

              // Handle initial history batch
              if (message.type === 'ohlc_history') {
                const candles = message.data as Array<any>;
                console.log('[AdvancedOHLCChart] 📊 Received', candles.length, 'historical candles via WebSocket');

                // Update cache with historical data
                candles.forEach((ohlcData: any) => {
                  const newCandle: BackendOHLCData = {
                    unix_time: ohlcData.time,
                    o: ohlcData.o,
                    h: ohlcData.h,
                    l: ohlcData.l,
                    c: ohlcData.c,
                    v_usd: ohlcData.v || 0,
                  };

                  const cachedData = lastGoodCandlesRef.current;
                  const existingIdx = cachedData.findIndex(c => c.unix_time === newCandle.unix_time);
                  if (existingIdx >= 0) {
                    cachedData[existingIdx] = newCandle;
                  } else {
                    cachedData.push(newCandle);
                  }
                });

                // Sort cache
                lastGoodCandlesRef.current.sort((a, b) => a.unix_time - b.unix_time);
                return;
              }

              // Handle real-time candle updates
              if (message.type !== 'ohlc_candle') {
                return;
              }

              const ohlcData = message.data;

              console.log('[AdvancedOHLCChart] 📊 WebSocket OHLC update:', {
                time: new Date(ohlcData.time * 1000).toISOString(),
                close: ohlcData.c,
              });

              // Convert to TradingView bar format
              const bar = {
                time: (ohlcData.time || 0) * 1000, // Convert to ms
                open: ohlcData.o,
                high: ohlcData.h,
                low: ohlcData.l,
                close: ohlcData.c,
                volume: ohlcData.v || 0,
              };

              // Update the chart via callback
              if (subscribedCallbackRef.current && bar.time > 0) {
                subscribedCallbackRef.current(bar);

                // Also update our cache with the new candle
                const newCandle: BackendOHLCData = {
                  unix_time: bar.time / 1000,
                  o: bar.open,
                  h: bar.high,
                  l: bar.low,
                  c: bar.close,
                  v_usd: bar.volume,
                };

                // Update or add the candle to cache
                const cachedData = lastGoodCandlesRef.current;
                const existingIdx = cachedData.findIndex(c => c.unix_time === newCandle.unix_time);
                if (existingIdx >= 0) {
                  cachedData[existingIdx] = newCandle;
                } else {
                  cachedData.push(newCandle);
                  cachedData.sort((a, b) => a.unix_time - b.unix_time);
                }
              }
            } catch (e) {
              console.error('[AdvancedOHLCChart] Error parsing WebSocket message:', e);
            }
          };

          ws.onerror = (error) => {
            console.error('[AdvancedOHLCChart] WebSocket error:', error);
          };

          ws.onclose = (event) => {
            console.log('[AdvancedOHLCChart] WebSocket closed:', event.code, event.reason);
            wsRef.current = null;

            // Reconnect after delay (only if component is still mounted)
            if (mountedRef.current && subscribedCallbackRef.current) {
              wsReconnectTimeoutRef.current = setTimeout(() => {
                console.log('[AdvancedOHLCChart] Attempting WebSocket reconnect...');
                // Re-trigger subscribeBars (the callback will handle reconnection)
              }, 5000);
            }
          };
        } catch (e) {
          console.error('[AdvancedOHLCChart] Failed to create WebSocket:', e);
        }
      },

      unsubscribeBars: (subscriberUID: string) => {
        console.log('[AdvancedOHLCChart] unsubscribeBars called:', subscriberUID);

        // Clear callback
        subscribedCallbackRef.current = null;

        // Clear reconnect timeout
        if (wsReconnectTimeoutRef.current) {
          clearTimeout(wsReconnectTimeoutRef.current);
          wsReconnectTimeoutRef.current = null;
        }

        // Close WebSocket
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
      },

      // ✅ Implement getMarks for dev buy/sell indicators
      getMarks: (
        symbolInfo: any,
        from: number,
        to: number,
        onDataCallback: any,
        resolution: string
      ) => {
        const currentTradeData = latestTradeDataRef.current || [];
        const currentCreatorAddress = latestCreatorAddressRef.current;

        console.log('[AdvancedOHLCChart] ========== getMarks CALLED ==========', {
          from: from,
          to: to,
          fromDate: new Date(from * 1000).toISOString(),
          toDate: new Date(to * 1000).toISOString(),
          hasTradeData: !!currentTradeData,
          tradeDataLength: currentTradeData?.length || 0,
          hasCreatorAddress: !!currentCreatorAddress,
          creatorAddress: currentCreatorAddress,
          sampleTradeData: currentTradeData?.slice(0, 3).map(trade => ({
            maker: trade.maker,
            timestamp: trade.timestamp,
            eventDisplayType: trade.eventDisplayType,
            transactionHash: trade.transactionHash
          }))
        });

        try {
          if (!currentTradeData || !currentCreatorAddress || currentTradeData.length === 0) {
            console.log('[AdvancedOHLCChart] No trade data or creator address for marks');
            onDataCallback([]);
            return;
          }

          // Filter for dev trades within the requested time range
          console.log('[AdvancedOHLCChart] Starting to filter trades. Total trades:', currentTradeData.length);
          console.log('[AdvancedOHLCChart] Looking for creator address:', currentCreatorAddress);
          
          const devTrades = currentTradeData.filter((trade: any, index: number) => {
            // Handle different trade data structures
            // For processed WebSocket data: trade.maker
            // For mock data: trade.maker, trade.user, trade.wallet_address
            const maker = trade.maker || trade.user || trade.wallet_address;
            
            // Debug first few trades to understand structure
            if (index < 5) {
              console.log(`[AdvancedOHLCChart] Trade ${index}:`, {
                maker: maker,
                creatorAddress: currentCreatorAddress,
                matches: maker && currentCreatorAddress && maker.toLowerCase() === currentCreatorAddress.toLowerCase(),
                timestamp: trade.timestamp,
                side: trade.side,
                eventDisplayType: trade.eventDisplayType,
                originalEvent: trade.originalEvent,
                fullTrade: trade
              });
            }
            
            if (!maker || !currentCreatorAddress || maker.toLowerCase() !== currentCreatorAddress.toLowerCase()) {
              return false;
            }

            // Handle different timestamp formats
            // Processed WebSocket data uses ISO string timestamps
            let timestamp = trade.timestamp || trade.created_at || trade.unix_time;
            if (!timestamp) return false;

            // Convert timestamp to seconds
            let timeSeconds: number;
            if (typeof timestamp === 'string') {
              // ISO string format (processed WebSocket data)
              timeSeconds = Math.floor(new Date(timestamp).getTime() / 1000);
            } else if (timestamp > 10000000000) {
              // Milliseconds
              timeSeconds = Math.floor(timestamp / 1000);
            } else {
              // Already in seconds
              timeSeconds = timestamp;
            }
            
            // Check if within requested range
            const inRange = timeSeconds >= from && timeSeconds <= to;
            
            if (currentCreatorAddress && maker.toLowerCase() === currentCreatorAddress.toLowerCase()) {
              console.log('[AdvancedOHLCChart] Found matching maker trade:', {
                maker,
                timeSeconds,
                from,
                to,
                inRange,
                timestamp: new Date(timeSeconds * 1000).toISOString(),
                side: trade.side,
                eventDisplayType: trade.eventDisplayType
              });
            }
            
            return inRange;
          });

          console.log('[AdvancedOHLCChart] Found dev trades for marks:', devTrades.length);

          // Convert to TradingView marks format
          const marks = devTrades.map((trade: any) => {
            // Handle different timestamp formats
            let timestamp = trade.timestamp || trade.created_at || trade.unix_time;
            let timeSeconds: number;
            if (typeof timestamp === 'string') {
              // ISO string format
              timeSeconds = Math.floor(new Date(timestamp).getTime() / 1000);
            } else if (timestamp > 10000000000) {
              // Milliseconds
              timeSeconds = Math.floor(timestamp / 1000);
            } else {
              // Already in seconds
              timeSeconds = timestamp;
            }
            
            // Handle different buy/sell detection formats
            // Processed WebSocket data: trade.side = "buy" | "sell"
            // Original event data: trade.eventDisplayType = "Buy" | "Sell"
            // Mock data: trade.is_buy, trade.side, trade.type
            const isBuy = trade.is_buy || 
                         trade.side === 'buy' || 
                         trade.type === 'buy' ||
                         trade.eventDisplayType === 'Buy' ||
                         trade.originalEvent?.eventDisplayType === 'Buy';
            
            // TradingView marks should be positioned on top of candles
            // Try different color formats - TradingView might prefer RGB or specific hex formats
            const greenColorHex = '#00FF00';  // Bright green hex
            const redColorHex = '#FF0000';    // Bright red hex
            const greenColorRgb = 'rgb(0, 255, 0)';  // Bright green RGB
            const redColorRgb = 'rgb(255, 0, 0)';    // Bright red RGB
            
            const markColorHex = isBuy ? greenColorHex : redColorHex;
            const markColorRgb = isBuy ? greenColorRgb : redColorRgb;
            
            console.log('[AdvancedOHLCChart] Color assignment:', {
              isBuy,
              hexColor: markColorHex,
              rgbColor: markColorRgb,
            });
            
            // Format the timestamp to match the requested format
            const formattedDate = new Date(timeSeconds * 1000).toISOString().replace('T', ' ').slice(0, 19);
            
            const {
              price,
              parsedAmount,
              parsedTotalUsd,
              formattedAmount,
              formattedPrice,
              formattedTotalUsd,
              displaySymbol,
              walletAddress,
            } = computeTradeDisplayValues(trade);

            // Debug trade analysis with resolved values
            console.log('[AdvancedOHLCChart] Trade analysis:', {
              tradeId: trade.id || trade.transactionHash,
              is_buy: trade.is_buy,
              side: trade.side,
              type: trade.type,
              eventDisplayType: trade.eventDisplayType,
              calculatedIsBuy: isBuy,
              expectedColor: isBuy ? 'GREEN' : 'RED',
              expectedText: isBuy ? 'Dev Buy' : 'Dev Sell',
              maker: trade.maker,
              timestamp: timestamp,
              price,
              parsedAmount,
              parsedTotalUsd,
              displaySymbol,
            });

            // Create dynamic paragraph text for the marker
            const markerText = `${isBuy ? 'Dev Buy' : 'Dev Sell'} • ${displaySymbol}
${formattedDate} UTC

Price: ${formattedPrice}
Amount: ${formattedAmount} ${displaySymbol}
Total: ${formattedTotalUsd}
Maker: ${walletAddress}`;

            // Simplified approach - use only the essential properties TradingView supports
            const markData = {
              id: `dev_trade_${timeSeconds}_${Math.random()}`,
              time: timeSeconds,
              position: 'inBar', // Position markers inside the candle area near its top
              color: isBuy ? 'green' : 'red', // Try color names instead of hex/rgb
              text: markerText, // Dynamic paragraph text shown on marker
              label: isBuy ? 'DB' : 'DS', // Simple label for tooltip
              labelFontColor: 'white',
              minSize: 24, // Keep original size
              size: 1, // Keep original size multiplier
              shape: 'circle', // Use circle shape for better visibility
            };
            
            console.log('[AdvancedOHLCChart] Creating mark:', {
              isBuy,
              expectedText: `${isBuy ? 'Dev Buy' : 'Dev Sell'} @ ${formattedDate}`,
              expectedColor: isBuy ? '#00ff00' : '#ff0000',
              markData,
            });
            
            return markData;
          });

          console.log('[AdvancedOHLCChart] ✅ Returning marks:', marks.length, 'marks');
          console.log('[AdvancedOHLCChart] Sample mark:', marks[0]);

          onDataCallback(marks);
        } catch (error) {
          console.error('[AdvancedOHLCChart] Error in getMarks:', error);
          onDataCallback([]);
        }
      },

      // ✅ Implement getTimescaleMarks for timeline indicators
      getTimescaleMarks: (
        symbolInfo: any,
        from: number,
        to: number,
        onDataCallback: any,
        resolution: string
      ) => {
        console.log('[AdvancedOHLCChart] ========== getTimescaleMarks CALLED ==========');

        try {
          const currentTradeData = latestTradeDataRef.current || [];
          const currentCreatorAddress = latestCreatorAddressRef.current;

          if (!currentTradeData || !currentCreatorAddress || currentTradeData.length === 0) {
            onDataCallback([]);
            return;
          }

          // Filter for dev trades within the requested time range
          const devTrades = currentTradeData.filter((trade: any) => {
            const maker = trade.maker || trade.user || trade.wallet_address;
            if (!maker || !currentCreatorAddress || maker.toLowerCase() !== currentCreatorAddress.toLowerCase()) {
              return false;
            }

            const timestamp = trade.timestamp || trade.created_at || trade.unix_time;
            if (!timestamp) return false;

            const timeSeconds = timestamp < 10000000000 ? timestamp : Math.floor(timestamp / 1000);
            return timeSeconds >= from && timeSeconds <= to;
          });

          // Convert to TradingView timescale marks format
          const timescaleMarks = devTrades.map((trade: any) => {
            const timestamp = trade.timestamp || trade.created_at || trade.unix_time;
            const timeSeconds = timestamp < 10000000000 ? timestamp : Math.floor(timestamp / 1000);
            const isBuy = trade.is_buy || trade.side === 'buy' || trade.type === 'buy';
            const {
              formattedAmount,
              formattedPrice,
              formattedTotalUsd,
              displaySymbol,
            } = computeTradeDisplayValues(trade);

            return {
              id: `dev_timescale_${timeSeconds}_${Math.random()}`,
              time: timeSeconds,
              color: isBuy ? '#22c55e' : '#ef4444',
              label: isBuy ? 'DB' : 'DS',
              tooltip: [
                `${isBuy ? 'Dev Buy' : 'Dev Sell'} • ${displaySymbol}`,
                `Price: ${formattedPrice}`,
                `Amount: ${formattedAmount} ${displaySymbol}`,
                `Total: ${formattedTotalUsd}`,
                new Date(timeSeconds * 1000).toLocaleString(),
              ],
            };
          });

          console.log('[AdvancedOHLCChart] ✅ Returning timescale marks:', timescaleMarks.length);
          onDataCallback(timescaleMarks);
        } catch (error) {
          console.error('[AdvancedOHLCChart] Error in getTimescaleMarks:', error);
          onDataCallback([]);
        }
      },
    };

    datafeedRef.current = customDatafeed;
    return customDatafeed;
  }, [buildUrl, onDataUpdate]);

  const syncWidgetWithParams = useCallback(() => {
    const widget = widgetRef.current;
    if (!widget) return;

    const params = latestParamsRef.current;
    const tokenId = params.mint || params.pairAddress;
    if (!tokenId) return;

    const nextResolution = INTERVAL_TO_RESOLUTION[params.interval];

    const applyUpdate = () => {
      try {
        const chart = widget.chart?.();
        if (!chart) return;

        if (widgetTokenRef.current !== tokenId) {
          widget.setSymbol(tokenId, nextResolution, () => {
            widgetTokenRef.current = tokenId;
            chart.resetData?.();
          });
          return;
        }

        chart.setResolution(nextResolution, () => {
          chart.resetData?.();
        });
      } catch (error) {
        console.error('[AdvancedOHLCChart] Failed to sync widget with params', error);
      }
    };

    try {
      const chart = widget.chart?.();
      if (chart) {
        applyUpdate();
        return;
      }
    } catch (err) {
      console.error('[AdvancedOHLCChart] Chart not ready for sync yet', err);
    }

    widget.onChartReady?.(() => {
      applyUpdate();
    });
  }, []);

  // Note: Dev trade markers are now handled by TradingView's native marks system
  // via the getMarks() method in the datafeed. No manual marker creation needed.

  // Initialize TradingView widget
  // Track the token identifier to prevent recreation when pairAddress just refines
  const widgetTokenRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (!libraryLoaded || !containerRef.current || !initialTokenId) return;

    const container = containerRef.current;
    let disposed = false;

    const setup = async () => {
      await waitForVisibleContainer(container);
      if (disposed || widgetRef.current) return;

      const datafeed = createDatafeed();
      if (!datafeed) {
        setError('No mint or pair address provided');
        setIsLoading(false);
        return;
      }

      try {
        const TradingView = (window as any).TradingView;
        console.log('[AdvancedOHLCChart] Attempting to create widget...', {
          hasTradingView: !!TradingView,
          hasWidget: !!(TradingView?.widget),
          TradingViewKeys: TradingView ? Object.keys(TradingView) : [],
        });

        if (!TradingView) {
          throw new Error('TradingView library not found in window object');
        }
        if (!TradingView.widget) {
          throw new Error('TradingView.widget not found - library may not be fully loaded');
        }

        const containerWidth = container.clientWidth || 800;
        const containerHeight = container.clientHeight || 400;

        console.log('[AdvancedOHLCChart] Initializing widget with container size:', containerWidth, 'x', containerHeight);

        const initialInterval = INTERVAL_TO_RESOLUTION[latestParamsRef.current.interval];
        console.log('[AdvancedOHLCChart] Creating TradingView widget with datafeed...');
        const widget = new TradingView.widget({
          debug: true,
          fullscreen: false,
          symbol: `${initialTokenId}`,
          datafeed: datafeed,
          interval: initialInterval,
          container: container,
          library_path: '/charting_library/charting_library/',
          locale: 'en',
          autosize: true, // ✅ Let TV size to the container
          // Enable sidebar toolbar and features
          disabled_features: [
            'use_localstorage_for_settings',
            // Keep toolbar enabled - remove these to show toolbar
            // 'header_compare',
            // 'header_saveload',
            // 'header_screenshot',
            // 'header_chart_type',
            // 'header_resolutions',
            // 'header_symbol_search',
            // 'header_undo_redo',
            // 'header_interval_dialog_button',
            // 'show_interval_dialog_on_key_press',
          ],
          enabled_features: [
            'study_templates',
            'side_toolbar_in_fullscreen_mode',
            'header_widget',
            'header_chart_type',
            'header_resolutions',
            'header_screenshot',
            'header_saveload',
            'header_undo_redo',
            'header_compare',
            'header_symbol_search',
            'header_interval_dialog_button',
            'show_interval_dialog_on_key_press',
            'timeframes_toolbar',
            'left_toolbar',
            'control_bar',
            'timeframes_toolbar',
            'edit_buttons_in_legend',
            'context_menus',
            'display_market_status',
            'header_saveload',
            'header_screenshot',
            'header_widget',
            'two_character_bar_marks_labels', // ✅ Enable two-character labels for marks
          ],
          charts_storage_url: 'https://saveload.tradingview.com',
          charts_storage_api_version: '1.1',
          client_id: 'tradingview.com',
          user_id: 'public_user_id',
          theme: 'dark', // Dark mode
          // Remove custom_css_url to avoid pink theme issues
          // custom_css_url: '/charting_library/themed.css',
          loading_screen: { backgroundColor: 'transparent' },
          overrides: {
            'paneProperties.background': '#000000',
            'paneProperties.backgroundType': 'solid',
            'paneProperties.vertGridProperties.color': '#2B2B43',
            'paneProperties.horzGridProperties.color': '#2B2B43',
            'symbolWatermarkProperties.transparency': 90,
            'scalesProperties.textColor': '#d1d4dc',
            'scalesProperties.lineColor': '#2B2B43',
            // Explicitly set chart type to candlesticks
            'paneProperties.backgroundGradientStartColor': '#000000',
            'paneProperties.backgroundGradientEndColor': '#000000',
            'mainSeriesProperties.candleStyle.upColor': '#26a69a',
            'mainSeriesProperties.candleStyle.downColor': '#ef5350',
            'mainSeriesProperties.candleStyle.borderUpColor': '#26a69a',
            'mainSeriesProperties.candleStyle.borderDownColor': '#ef5350',
            'mainSeriesProperties.candleStyle.wickUpColor': '#26a69a',
            'mainSeriesProperties.candleStyle.wickDownColor': '#ef5350',
            'mainSeriesProperties.candleStyle.drawWick': true,
            'mainSeriesProperties.candleStyle.drawBorder': true,
            'mainSeriesProperties.showCountdown': false,
            'paneProperties.legendProperties.showLegend': true,
            'paneProperties.legendProperties.showStudyArguments': true,
            'paneProperties.legendProperties.showStudyTitles': true,
            'paneProperties.legendProperties.showStudyValues': true,
            'paneProperties.legendProperties.showSeriesTitle': true,
            'paneProperties.legendProperties.showSeriesOHLC': true,
            // Override any pink/red colors to dark theme colors
            'mainSeriesProperties.lineStyle.color': '#26a69a',
            'paneProperties.topMargin': 10,
            'paneProperties.bottomMargin': 10,
            'paneProperties.legendProperties.background': '#000000',
            'paneProperties.legendProperties.color': '#d1d4dc',
          },
          studies_overrides: {
            // Volume bar colors - 0 = up candles (green), 1 = down candles (red)
            'volume.volume.color.0': '#26a69a', // Green bars for up candles (matches candle upColor)
            'volume.volume.color.1': '#ef5350', // Red bars for down candles (matches candle downColor)
            // Volume text/label colors - these control the text color above volume bars
            'volume.volume.colorup': '#26a69a', // Green text for up candles
            'volume.volume.colordown': '#ef5350', // Red text for down candles
            // Alternative property names that some TradingView versions use
            'volume.volume.plot.color.0': '#26a69a',
            'volume.volume.plot.color.1': '#ef5350',
          },
          // ✅ Don't pass width/height when using autosize
        });

        widgetRef.current = widget;
        widgetTokenRef.current = initialTokenId;
        setIsLoading(false);
        setError(null);

        console.log('[AdvancedOHLCChart] TradingView widget initialized with sidebar toolbar');

        // Force widget to load data after it's ready
        widget.onChartReady(() => {
          console.log('[AdvancedOHLCChart] Chart is ready, setting chart type to candlesticks...');
          
          try {
            const chart = widget.chart();
            if (chart) {
              // Explicitly set chart type to candlesticks
              chart.setChartType(1); // 1 = Candles, 2 = Hollow Candles, 3 = Bars, etc.
              console.log('[AdvancedOHLCChart] Chart type set to candlesticks');
              
              // Dev trade markers are now handled automatically by TradingView's marks system
              console.log('[AdvancedOHLCChart] Chart ready - marks will be loaded automatically via getMarks()');
              
              // Set volume colors to match candle colors
              // Try to set volume study colors programmatically
              try {
                const studies = chart.getAllStudies();
                studies.forEach((study: any) => {
                  if (study && study.name && study.name.toLowerCase().includes('volume')) {
                    // Set volume colors for up (green) and down (red) candles
                    study.applyOverrides({
                      'volume.volume.color.0': '#26a69a', // Green for up candles
                      'volume.volume.color.1': '#ef5350', // Red for down candles
                    });
                    console.log('[AdvancedOHLCChart] Volume colors set programmatically');
                  }
                });
              } catch (volumeError) {
                console.log('[AdvancedOHLCChart] Could not set volume colors programmatically (may use defaults):', volumeError);
              }
              
              // Trigger resize now that chart is ready
              // Use widget.resize() directly since we have the widget
              if (widgetRef.current?.resize && containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const width = Math.max(0, Math.round(rect.width));
                const height = Math.max(0, Math.round(rect.height));
                if (width && height) {
                  setTimeout(() => {
                    try {
                      widgetRef.current?.resize?.(width, height);
                      console.log('[AdvancedOHLCChart] Widget resized on chart ready to:', width, 'x', height);
                    } catch (e) {
                      console.log('[AdvancedOHLCChart] Resize on chart ready failed:', e);
                    }
                  }, 100);
                }
              }
              
              // Don't force symbol reset - let TradingView call getBars naturally
              // Forcing setSymbol can interleave calls and cause issues
              // If getBars is already firing, forcing a symbol reset can interfere
              // Commented out per TradingView best practices:
              // setTimeout(() => {
              //   const currentSymbol = widget.symbol();
              //   const currentInterval = widget.interval();
              //   widget.setSymbol(currentSymbol, currentInterval, () => {
              //     console.log('[AdvancedOHLCChart] Symbol reset complete');
              //   });
              // }, 1000);
            }
          } catch (e) {
            console.error('[AdvancedOHLCChart] Error in onChartReady callback:', e);
          }
          syncWidgetWithParams();
        });
      } catch (error: any) {
        console.error('[AdvancedOHLCChart] Failed to initialize widget:', error);
        setError(error?.message || 'Failed to initialize chart');
        setIsLoading(false);
      }
    };

    setup();

    return () => {
      disposed = true;
      if (widgetRef.current) {
        try {
          widgetRef.current.remove?.();
        } catch (e) {
          console.error('[AdvancedOHLCChart] Error removing widget on cleanup', e);
        }
        widgetRef.current = null;
        widgetTokenRef.current = null;
      }
    };
  }, [libraryLoaded, createDatafeed, initialTokenId, syncWidgetWithParams]);

  useEffect(() => {
    if (!libraryLoaded) return;
    if (!widgetRef.current) return;
    syncWidgetWithParams();
  }, [libraryLoaded, syncWidgetWithParams, mint, pairAddress, selectedInterval, timeframe, optimize, network]);

  // Force widget to load data on initialization if we have preloaded data
  useEffect(() => {
    if (!widgetRef.current || !preloadedData || preloadedData.length === 0) return;

    // Update the ref so datafeed can use it
    lastGoodCandlesRef.current = preloadedData;
    setCandles(preloadedData);

    // Force widget to refresh and load data
    try {
      widgetRef.current.onChartReady(() => {
        const chart = widgetRef.current.chart();
        if (chart) {
          // Reset data to trigger getBars call
          chart.resetData();
          console.log('[AdvancedOHLCChart] Forced chart refresh with preloaded data');
        }
      });
    } catch (e) {
      console.error('[AdvancedOHLCChart] Error refreshing chart:', e);
    }
  }, [preloadedData, widgetRef.current]);

  // Marks are automatically updated by TradingView when data changes
  // The getMarks() method in the datafeed handles this automatically

  // Resize function ref - can be called from anywhere
  const resizeChartRef = useRef<(() => void) | null>(null);

  // Simple, robust resize handler - works immediately and when widget is ready
  useEffect(() => {
    if (!containerRef.current) return;

    let rafId: number | null = null;
    let lastWidth = 0;
    let lastHeight = 0;
    let resizeObserver: ResizeObserver | null = null;

    // Resize function - keeps trying until widget is ready
    const resizeChart = () => {
      if (!containerRef.current) return;
      
      // Use getBoundingClientRect for accurate dimensions (accounts for zoom)
      const rect = containerRef.current.getBoundingClientRect();
      const width = Math.max(0, Math.round(rect.width));
      const height = Math.max(0, Math.round(rect.height));
      
      // Only resize if dimensions actually changed
      if (width && height && (width !== lastWidth || height !== lastHeight)) {
        lastWidth = width;
        lastHeight = height;
        
        // Cancel any pending resize
        if (rafId) cancelAnimationFrame(rafId);
        
        // Resize in next frame
        rafId = requestAnimationFrame(() => {
          // ✅ Use widget.resize() instead of chart.resize()
          if (widgetRef.current?.resize) {
            try {
              widgetRef.current.resize(width, height);
              console.log('[AdvancedOHLCChart] Widget resized to:', width, 'x', height);
              return;
            } catch (e) {
              console.log('[AdvancedOHLCChart] Widget resize failed, retrying via onChartReady...');
            }
          }
          
          // If widget not ready, wait for chart to be ready
          if (widgetRef.current?.onChartReady) {
            try {
              widgetRef.current.onChartReady(() => {
                try {
                  if (widgetRef.current?.resize) {
                    widgetRef.current.resize(width, height);
                    console.log('[AdvancedOHLCChart] Widget resized (via onChartReady) to:', width, 'x', height);
                  }
                } catch (e) {
                  console.log('[AdvancedOHLCChart] Resize failed in onChartReady:', e);
                }
              });
            } catch (e) {
              console.log('[AdvancedOHLCChart] Widget not ready for resize:', e);
            }
          } else {
            console.log('[AdvancedOHLCChart] Widget ref not available for resize');
          }
        });
      }
    };

    // Store resize function in ref so it can be called when widget becomes ready
    resizeChartRef.current = resizeChart;

    // Set up ResizeObserver - this is the main resize detection
    resizeObserver = new ResizeObserver(() => {
      resizeChart();
    });

    resizeObserver.observe(containerRef.current);
    
    // Also observe parent to catch layout changes
    if (containerRef.current.parentElement) {
      resizeObserver.observe(containerRef.current.parentElement);
    }
    
    // Also observe the chart wrapper if it exists (for panel resizing)
    const chartWrapper = document.getElementById('chart-container-wrapper');
    if (chartWrapper) {
      resizeObserver.observe(chartWrapper);
    }

    // Listen for window resize (catches zoom changes)
    const handleWindowResize = () => {
      resizeChart();
    };
    window.addEventListener('resize', handleWindowResize, { passive: true });
    
    // Listen for keyboard zoom
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === '+' || e.key === '-' || e.key === '=')) {
        setTimeout(resizeChart, 100);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // Listen for visual viewport changes (mobile zoom)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resizeChart, { passive: true });
    }

    // Periodic check as backup - ensures resize always works
    // This catches cases where ResizeObserver might miss changes
    const checkInterval = setInterval(() => {
      if (containerRef.current && widgetRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const currentWidth = Math.max(0, Math.round(rect.width));
        const currentHeight = Math.max(0, Math.round(rect.height));
        
        // If dimensions changed, trigger resize
        if (currentWidth && currentHeight && 
            (currentWidth !== lastWidth || currentHeight !== lastHeight)) {
          resizeChart();
        }
      }
    }, 250); // Check every 250ms

    // Initial resize
    resizeChart();

    return () => {
      resizeChartRef.current = null;
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeObserver) resizeObserver.disconnect();
      clearInterval(checkInterval);
      window.removeEventListener('resize', handleWindowResize);
      document.removeEventListener('keydown', handleKeyDown);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', resizeChart);
      }
    };
  }, []); // Set up once on mount


  return (
    <div 
      className={`relative ${className}`} 
      style={{ 
        height, 
        width, 
        zIndex: 1,
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <div
        ref={containerRef}
        className="w-full h-full chart-container"
        style={{
          height: '100%',
          width: '100%',
          position: 'relative',
          zIndex: 1,
          backgroundColor: 'transparent',
          minHeight: 0,
          minWidth: 0,
        }}
      />

      {isLoading && firstLoadRef.current && (
        <div className="absolute inset-0 grid place-items-center bg-gray-900/60" style={{ zIndex: 3 }}>
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" />
            <div className="text-white text-sm">Loading OHLC data from backend…</div>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute bottom-2 left-2 bg-red-900/90 text-white text-xs rounded px-2 py-1" style={{ zIndex: 4 }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
};

export default AdvancedOHLCChart;
