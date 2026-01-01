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
  priceLines?: {
    avgEntryPriceUsd?: number | null;
    avgExitPriceUsd?: number | null;
  };
  onChartMetrics?: (metrics: {
    lastPriceUsd?: number;
    lastMarketCapUsd?: number;
    maxMarketCapUsd?: number;
  }) => void;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
const MONAD_BACKEND_URL = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL!;
const VALID_INTERVALS: BackendInterval[] = ['1s', '5s', '15s', '30s', '1m', '5m', '15m', '1h', '4h', '1d', '7d'];
const MARKET_CAP_MULTIPLIER = 1_000_000_000; // 1B supply for Monad

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

// For Monad: When user selects 1s, show 1-minute candles but update in real-time
// This gives proper candle bodies while maintaining real-time updates
const MONAD_DISPLAY_RESOLUTION: Record<BackendInterval, string> = {
  '1s': '1',    // Show 1-minute candles, update every second
  '5s': '1',    // Show 1-minute candles
  '15s': '1',   // Show 1-minute candles
  '30s': '1',   // Show 1-minute candles
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': '1D',
  '7d': '1W',
};

// Map display resolution to the interval to fetch from backend
const MONAD_FETCH_INTERVAL: Record<BackendInterval, BackendInterval> = {
  '1s': '1m',   // Fetch 1-minute data for display
  '5s': '1m',
  '15s': '1m',
  '30s': '1m',
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '7d': '7d',
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

const formatAxisLabel = (value: number, isMarketCap: boolean): string => {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);

  if (isMarketCap) {
    if (abs >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
    if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  }

  if (abs >= 1) return `$${value.toFixed(2)}`;
  if (abs >= 0.1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
};

const truncateAddress = (address?: string | null): string => {
  if (!address || address.length <= 10) return address || 'Unknown';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

// Helper function to calculate window start time for any interval (for aggregating 1s candles)
const getWindowStartTime = (unixTime: number, interval: BackendInterval): number => {
  const seconds = unixTime;
  
  switch (interval) {
    case '1s':
    case '5s':
    case '15s':
    case '30s':
      // For second intervals, floor to the interval
      const secondInterval = interval === '1s' ? 1 : interval === '5s' ? 5 : interval === '15s' ? 15 : 30;
      return Math.floor(seconds / secondInterval) * secondInterval;
    case '1m':
      return Math.floor(seconds / 60) * 60; // Floor to minute
    case '5m':
      return Math.floor(seconds / 300) * 300; // Floor to 5 minutes
    case '15m':
      return Math.floor(seconds / 900) * 900; // Floor to 15 minutes
    case '1h':
      return Math.floor(seconds / 3600) * 3600; // Floor to hour
    case '4h':
      return Math.floor(seconds / 14400) * 14400; // Floor to 4 hours
    case '1d':
      return Math.floor(seconds / 86400) * 86400; // Floor to day (UTC)
    case '7d':
      return Math.floor(seconds / 604800) * 604800; // Floor to week (UTC)
    default:
      return seconds;
  }
};

const mapSecondsToTimeframe = (spanSeconds: number): BackendTimeRange => {
  if (!Number.isFinite(spanSeconds) || spanSeconds <= 0) return '24h';
  if (spanSeconds >= 15552000) return '180d'; // >= 180d
  if (spanSeconds >= 2592000) return '30d';   // >= 30d
  if (spanSeconds >= 604800) return '7d';     // >= 7d
  if (spanSeconds >= 86400) return '24h';     // >= 1d
  if (spanSeconds >= 14400) return '4h';      // >= 4h
  return '1h';
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
  priceLines,
  onChartMetrics,
}) => {
  // DEBUG: Confirm component is rendering with latest code
  console.log('[AdvancedOHLCChart] 🚀 Component rendering - VERSION 2', { mint, pairAddress, network, interval });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const usdMcButtonRef = useRef<HTMLElement | null>(null);
  const [isLoading, setIsLoading] = useState(!preloadedData || preloadedData.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [candles, setCandles] = useState<BackendOHLCData[]>(preloadedData || []);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(preloadedData && preloadedData.length > 0 ? new Date() : null);
  const [retryCount, setRetryCount] = useState(0);

  const selectedInterval = VALID_INTERVALS.includes(interval) ? interval : '1m';
  const [initialTokenId, setInitialTokenId] = useState<string | null>(() => (mint || pairAddress) ?? null);
  const [displayMode, setDisplayMode] = useState<'USD' | 'MC'>('MC'); // USD/MC toggle for Monad chain
  const displayModeRef = useRef<'USD' | 'MC'>('MC'); // Ref for fast access in callbacks
  const latestParamsRef = useRef({
    mint,
    pairAddress,
    interval: selectedInterval,
    timeframe,
    optimize,
    network,
  });

  // Keep ref in sync with state
  useEffect(() => {
    console.log('🔄 [DISPLAY_MODE_UPDATE] Display mode changing:', {
      oldMode: displayModeRef.current,
      newMode: displayMode,
      timestamp: new Date().toISOString(),
    });
    displayModeRef.current = displayMode;
    console.log('✅ [DISPLAY_MODE_UPDATE] displayModeRef.current updated to:', displayModeRef.current);
  }, [displayMode]);

  // Helper function to transform OHLC values based on display mode (USD vs MC)
  // MC = USD * 1 billion
  const transformOHLCValue = useCallback((value: number, mode: 'USD' | 'MC', isMonad: boolean): number => {
    if (!isMonad || mode === 'USD') {
      return value;
    }
    // MC mode: multiply by 1 billion
    return value * 1_000_000_000;
  }, []);

  // Helper function to transform a bar object based on display mode
  const transformBar = useCallback((bar: { time: number; open: number; high: number; low: number; close: number; volume: number }, mode: 'USD' | 'MC', isMonad: boolean) => {
    if (!isMonad || mode === 'USD') {
      return bar;
    }
    return {
      ...bar,
      open: transformOHLCValue(bar.open, mode, isMonad),
      high: transformOHLCValue(bar.high, mode, isMonad),
      low: transformOHLCValue(bar.low, mode, isMonad),
      close: transformOHLCValue(bar.close, mode, isMonad),
    };
  }, [transformOHLCValue]);

  const computeMaxMarketCapUsd = useCallback((): number | null => {
    console.log('📊 [MAX_MC_COMPUTE] Starting max MC computation...');
    const isMonad = latestParamsRef.current.network === 'monad';
    console.log('📊 [MAX_MC_COMPUTE] Network check:', { isMonad, network: latestParamsRef.current.network });

    if (!isMonad) {
      console.log('⚠️ [MAX_MC_COMPUTE] Not Monad network, returning null');
      return null;
    }

    const data = lastGoodCandlesRef.current || [];
    console.log('📊 [MAX_MC_COMPUTE] Candles available:', data.length);

    if (!data.length) {
      console.log('⚠️ [MAX_MC_COMPUTE] No candle data available, returning null');
      return null;
    }

    let maxHigh = 0;
    let maxHighCandle = null;
    for (const candle of data) {
      if (candle?.h && candle.h > maxHigh) {
        maxHigh = candle.h;
        maxHighCandle = candle;
      }
    }

    console.log('📊 [MAX_MC_COMPUTE] Max high found:', {
      maxHigh,
      maxHighUSD: maxHigh,
      candleTime: maxHighCandle ? new Date(maxHighCandle.unix_time * 1000).toISOString() : null,
      isFinite: Number.isFinite(maxHigh),
      isPositive: maxHigh > 0,
    });

    if (!Number.isFinite(maxHigh) || maxHigh <= 0) {
      console.log('⚠️ [MAX_MC_COMPUTE] Invalid maxHigh, returning null');
      return null;
    }

    const result = maxHigh * MARKET_CAP_MULTIPLIER;
    console.log('✅ [MAX_MC_COMPUTE] Final max MC (USD):', {
      maxHighPriceUSD: maxHigh,
      MARKET_CAP_MULTIPLIER,
      resultMaxMcUSD: result,
      formatted: `$${(result / 1_000_000).toFixed(2)}M`,
    });

    return result;
  }, []);

  // Price line management - always clears and redraws to ensure consistency
  const syncPriceLines = useCallback((maxMarketCapUsdOverride?: number | null) => {
    console.log('🎯 [SYNC_PRICE_LINES] ============= START =============');
    console.log('🎯 [SYNC_PRICE_LINES] Called with maxMarketCapUsdOverride:', maxMarketCapUsdOverride);

    if (syncLinesInFlightRef.current) {
      console.log('⚠️ [SYNC_PRICE_LINES] Already in flight, skipping');
      return;
    }

    syncLinesInFlightRef.current = true;
    console.log('🎯 [SYNC_PRICE_LINES] Set in-flight flag to true');

    const isMonad = latestParamsRef.current.network === 'monad';
    const widget = widgetRef.current;
    console.log('🎯 [SYNC_PRICE_LINES] Initial checks:', {
      isMonad,
      network: latestParamsRef.current.network,
      hasWidget: !!widget,
    });

    if (!widget || !isMonad) {
      console.log('❌ [SYNC_PRICE_LINES] Early exit - no widget or not Monad:', { hasWidget: !!widget, isMonad });
      syncLinesInFlightRef.current = false;
      return;
    }

    let chart: any = null;
    try {
      chart = widget.activeChart?.() || widget.chart?.();
      console.log('🎯 [SYNC_PRICE_LINES] Chart obtained:', {
        hasChart: !!chart,
        hasCreateShape: chart ? typeof chart.createShape === 'function' : false,
      });
    } catch (err) {
      console.log('❌ [SYNC_PRICE_LINES] Failed to get chart:', err);
      syncLinesInFlightRef.current = false;
      return;
    }

    if (!chart || typeof chart.createShape !== 'function') {
      console.log('❌ [SYNC_PRICE_LINES] Invalid chart or missing createShape');
      syncLinesInFlightRef.current = false;
      return;
    }

    const mode = displayModeRef.current;
    const axisIsMarketCap = mode === 'MC';
    console.log('🎯 [SYNC_PRICE_LINES] Display mode:', {
      mode,
      axisIsMarketCap,
      displayModeRef: displayModeRef.current,
    });

    const maxMarketCapUsd = typeof maxMarketCapUsdOverride === 'number'
      ? maxMarketCapUsdOverride
      : computeMaxMarketCapUsd();

    console.log('🎯 [SYNC_PRICE_LINES] Max MC determination:', {
      hasOverride: typeof maxMarketCapUsdOverride === 'number',
      overrideValue: maxMarketCapUsdOverride,
      computedValue: typeof maxMarketCapUsdOverride === 'number' ? '(not computed)' : maxMarketCapUsd,
      finalMaxMarketCapUsd: maxMarketCapUsd,
    });

    const currentPrices = priceLinesRef.current;
    console.log('🎯 [SYNC_PRICE_LINES] Current price line props:', {
      currentPrices,
      avgEntryPriceUsd: currentPrices?.avgEntryPriceUsd,
      avgExitPriceUsd: currentPrices?.avgExitPriceUsd,
    });

    const normalizeUsd = (value: unknown): number | null => {
      const numeric = typeof value === 'string' ? parseFloat(value) : (value as number);
      const result = (!Number.isFinite(numeric) || numeric <= 0) ? null : numeric;
      console.log('🔢 [NORMALIZE_USD]', { input: value, numeric, isFinite: Number.isFinite(numeric), isPositive: numeric > 0, result });
      return result;
    };

    const avgEntryUsd = normalizeUsd(currentPrices?.avgEntryPriceUsd ?? null);
    const avgExitUsd = normalizeUsd(currentPrices?.avgExitPriceUsd ?? null);

    console.log('🎯 [SYNC_PRICE_LINES] Normalized USD values:', {
      avgEntryUsd,
      avgExitUsd,
    });

    const toAxisPrice = (usdPrice?: number | null): number | null => {
      if (usdPrice === null || usdPrice === undefined) {
        console.log('🔢 [TO_AXIS_PRICE] Input is null/undefined:', usdPrice);
        return null;
      }
      const result = axisIsMarketCap ? usdPrice * MARKET_CAP_MULTIPLIER : usdPrice;
      console.log('🔢 [TO_AXIS_PRICE] Conversion:', {
        input_USD: usdPrice,
        axisIsMarketCap,
        MARKET_CAP_MULTIPLIER,
        output_AxisPrice: result,
        formatted: axisIsMarketCap ? `$${(result / 1_000_000_000).toFixed(2)}B` : `$${result.toFixed(6)}`,
      });
      return result;
    };

    console.log('🎯 [SYNC_PRICE_LINES] Converting prices to axis coordinates...');
    const entryPrice = toAxisPrice(avgEntryUsd);
    const exitPrice = toAxisPrice(avgExitUsd);

    console.log('🎯 [SYNC_PRICE_LINES] Max MC axis price calculation...');
    console.log('🎯 [SYNC_PRICE_LINES] maxMarketCapUsd before division:', maxMarketCapUsd);
    const maxMcPriceInput = maxMarketCapUsd ? maxMarketCapUsd / MARKET_CAP_MULTIPLIER : null;
    console.log('🎯 [SYNC_PRICE_LINES] Max MC after dividing by multiplier:', {
      maxMarketCapUsd,
      MARKET_CAP_MULTIPLIER,
      divided: maxMcPriceInput,
      willBeNull: !maxMarketCapUsd,
    });
    const maxMcPrice = toAxisPrice(maxMcPriceInput);

    console.log('🎯 [SYNC_PRICE_LINES] Final axis prices:', {
      entryPrice,
      exitPrice,
      maxMcPrice,
    });

    const lastApplied = lastAppliedLinesRef.current;
    console.log('🎯 [SYNC_PRICE_LINES] Checking if lines already applied:', {
      lastApplied,
      entryPrice,
      exitPrice,
      maxMcPrice,
      entryMatch: lastApplied?.entry === entryPrice,
      exitMatch: lastApplied?.exit === exitPrice,
      maxMcMatch: lastApplied?.maxMc === maxMcPrice,
    });

    if (
      lastApplied &&
      lastApplied.entry === entryPrice &&
      lastApplied.exit === exitPrice &&
      lastApplied.maxMc === maxMcPrice
    ) {
      console.log('⚠️ [SYNC_PRICE_LINES] Lines already applied with same values, skipping');
      syncLinesInFlightRef.current = false;
      return;
    }

    console.log('🎯 [SYNC_PRICE_LINES] Lines need update, proceeding...');

    // STEP 1: Always remove ALL existing shapes first
    console.log('🗑️ [SYNC_PRICE_LINES] STEP 1: Removing existing shapes...');
    try {
      const existingShapes = Object.keys(priceLineShapesRef.current);
      console.log('🗑️ [SYNC_PRICE_LINES] Tracked shapes to remove:', existingShapes);

      // Remove tracked shapes by ID
      Object.values(priceLineShapesRef.current).forEach((line: any) => {
        try {
          if (line?.id && typeof line.id === 'string') {
            console.log('🗑️ [SYNC_PRICE_LINES] Removing shape:', line.id);
            chart.removeEntity(line.id);
          }
        } catch (e) {
          console.log('⚠️ [SYNC_PRICE_LINES] Failed to remove shape:', line?.id, e);
        }
      });
      priceLineShapesRef.current = {};
      console.log('🗑️ [SYNC_PRICE_LINES] Cleared priceLineShapesRef');

      // Also remove all shapes from chart as backup
      if (typeof chart.removeAllShapes === 'function') {
        chart.removeAllShapes();
        console.log('🗑️ [SYNC_PRICE_LINES] Called chart.removeAllShapes()');
      }
    } catch (e) {
      console.log('⚠️ [SYNC_PRICE_LINES] Error during shape removal:', e);
    }

    // STEP 2: Create fresh lines using createShape
    console.log('✨ [SYNC_PRICE_LINES] STEP 2: Creating fresh lines...');
    const createLine = async (key: string, price: number | null, label: string, color: string) => {
      console.log(`✨ [CREATE_LINE] Creating line "${key}":`, {
        key,
        price,
        label,
        color,
        priceIsNull: price === null,
      });

      if (price === null) {
        console.log(`⚠️ [CREATE_LINE] Skipping "${key}" - price is null`);
        return;
      }

      try {
        const formattedPrice = formatAxisLabel(price, axisIsMarketCap);
        const lineText = `${label}: ${formattedPrice}`;
        console.log(`✨ [CREATE_LINE] "${key}" formatted:`, {
          price,
          axisIsMarketCap,
          formattedPrice,
          lineText,
        });

        const result = chart.createShape({ price }, {
          shape: 'horizontal_line',
          text: lineText,
          disableSelection: true,
          disableSave: true,
          overrides: {
            linecolor: color,
            textcolor: color,
            linestyle: 2,
            linewidth: 2,
            showLabel: true,
            drawPriceLabel: true,
          },
        });

        console.log(`✨ [CREATE_LINE] "${key}" createShape called, result type:`, {
          resultType: typeof result,
          isPromise: result instanceof Promise,
          hasThenable: result && typeof result.then === 'function',
          result,
        });

        // Handle both Promise and direct ID returns
        // Use thenable check instead of instanceof Promise (handles cross-realm Promises from iframes)
        const isThenable = (obj: any): obj is Promise<any> => obj && typeof obj.then === 'function';

        let shapeId = isThenable(result) ? await result : result;
        console.log(`✨ [CREATE_LINE] "${key}" after first await:`, {
          shapeId,
          type: typeof shapeId,
          isPromise: shapeId instanceof Promise,
          hasThenable: isThenable(shapeId),
        });

        // Check if we got a nested Promise/thenable and await again if needed
        if (isThenable(shapeId)) {
          console.log(`✨ [CREATE_LINE] "${key}" detected nested thenable, awaiting again...`);
          shapeId = await shapeId;
          console.log(`✨ [CREATE_LINE] "${key}" after second await:`, {
            shapeId,
            type: typeof shapeId,
          });
        }

        console.log(`✨ [CREATE_LINE] "${key}" final shape ID:`, {
          shapeId,
          isString: typeof shapeId === 'string',
        });

        if (shapeId && typeof shapeId === 'string') {
          priceLineShapesRef.current[key] = { id: shapeId };
          console.log(`✅ [CREATE_LINE] "${key}" successfully created and tracked with ID:`, shapeId);

          // Log chart's visible price range to debug visibility issues
          try {
            const priceScale = chart.getPanes?.()?.[0]?.getRightPriceScales?.()?.[0];
            if (priceScale) {
              const visibleRange = priceScale.getVisiblePriceRange?.();
              console.log(`📊 [CREATE_LINE] "${key}" chart visible price range:`, {
                linePrice: price,
                visibleMin: visibleRange?.minValue,
                visibleMax: visibleRange?.maxValue,
                isLineVisible: price >= visibleRange?.minValue && price <= visibleRange?.maxValue,
                lineIsAboveChart: price > visibleRange?.maxValue,
                lineIsBelowChart: price < visibleRange?.minValue,
              });
            }
          } catch (e) {
            console.log(`⚠️ [CREATE_LINE] "${key}" could not get visible range:`, e);
          }
        } else {
          console.log(`⚠️ [CREATE_LINE] "${key}" received invalid shape ID:`, {
            shapeId,
            type: typeof shapeId,
            isNull: shapeId === null,
            isUndefined: shapeId === undefined,
          });
        }
      } catch (err) {
        console.error(`❌ [CREATE_LINE] Failed to create line "${key}":`, err);
      }
    };

    // Create the lines
    (async () => {
      console.log('✨ [SYNC_PRICE_LINES] Starting async line creation...');
      await createLine('avgEntry', entryPrice, 'Avg Entry', '#f2c94c');
      await createLine('avgExit', exitPrice, 'Avg Exit', '#4aa3ff');
      await createLine('maxMc', maxMcPrice, 'Max MC', '#f2994a');

      lastAppliedLinesRef.current = { entry: entryPrice, exit: exitPrice, maxMc: maxMcPrice };
      console.log('✅ [SYNC_PRICE_LINES] All lines created, updated lastAppliedLinesRef:', lastAppliedLinesRef.current);
      console.log('✅ [SYNC_PRICE_LINES] Tracked shapes:', Object.keys(priceLineShapesRef.current));

      syncLinesInFlightRef.current = false;
      console.log('🎯 [SYNC_PRICE_LINES] ============= COMPLETE =============');
    })().catch((err) => {
      console.error('❌ [SYNC_PRICE_LINES] Async line creation failed:', err);
      syncLinesInFlightRef.current = false;
      console.log('🎯 [SYNC_PRICE_LINES] ============= FAILED =============');
    });
  }, [computeMaxMarketCapUsd]);

  const updateChartMetrics = useCallback(() => {
    console.log('📈 [UPDATE_METRICS] ============= START =============');
    const candles = lastGoodCandlesRef.current;
    console.log('📈 [UPDATE_METRICS] Candles:', {
      count: candles?.length || 0,
      hasCandles: !!(candles && candles.length > 0),
    });

    if (!candles || candles.length === 0) {
      console.log('⚠️ [UPDATE_METRICS] No candles available, exiting');
      return;
    }

    const sorted = [...candles].sort((a, b) => a.unix_time - b.unix_time);
    const latest = sorted[sorted.length - 1];
    const lastPriceUsd = Number(latest?.c || latest?.o || 0);

    console.log('📈 [UPDATE_METRICS] Latest candle:', {
      unix_time: latest?.unix_time,
      timestamp: new Date(latest?.unix_time * 1000).toISOString(),
      close: latest?.c,
      open: latest?.o,
      lastPriceUsd,
      isFinite: Number.isFinite(lastPriceUsd),
      isPositive: lastPriceUsd > 0,
    });

    if (!Number.isFinite(lastPriceUsd) || lastPriceUsd <= 0) {
      console.log('⚠️ [UPDATE_METRICS] Invalid last price, exiting');
      return;
    }

    const isMonad = latestParamsRef.current.network === 'monad';
    console.log('📈 [UPDATE_METRICS] Network:', { isMonad, network: latestParamsRef.current.network });

    const maxMarketCapUsd = isMonad
      ? (maxMarketCapFromApiRef.current ?? computeMaxMarketCapUsd())
      : null;

    console.log('📈 [UPDATE_METRICS] Max MC determination:', {
      isMonad,
      maxMarketCapFromApi: maxMarketCapFromApiRef.current,
      computedMaxMc: maxMarketCapFromApiRef.current === null ? 'computed' : 'using API value',
      finalMaxMarketCapUsd: maxMarketCapUsd,
    });

    const metrics = {
      lastPriceUsd,
      lastMarketCapUsd: isMonad ? lastPriceUsd * MARKET_CAP_MULTIPLIER : undefined,
      maxMarketCapUsd: isMonad ? maxMarketCapUsd ?? undefined : undefined,
    };

    console.log('📈 [UPDATE_METRICS] Computed metrics:', {
      lastPriceUsd,
      lastMarketCapUsd: metrics.lastMarketCapUsd,
      maxMarketCapUsd: metrics.maxMarketCapUsd,
      MARKET_CAP_MULTIPLIER,
    });

    lastMetricsRef.current = metrics;
    console.log('📈 [UPDATE_METRICS] Updated lastMetricsRef.current:', lastMetricsRef.current);

    console.log('📈 [UPDATE_METRICS] Calling syncPriceLines with maxMarketCapUsd:', metrics.maxMarketCapUsd ?? null);
    syncPriceLines(metrics.maxMarketCapUsd ?? null);

    console.log('📈 [UPDATE_METRICS] Calling onChartMetrics callback');
    onChartMetrics?.(metrics);

    console.log('📈 [UPDATE_METRICS] ============= COMPLETE =============');
  }, [computeMaxMarketCapUsd, onChartMetrics, syncPriceLines]);

  useEffect(() => {
    if (!initialTokenId && (mint || pairAddress)) {
      setInitialTokenId((mint || pairAddress) ?? null);
    }
  }, [initialTokenId, mint, pairAddress]);

  // Fetch max market cap from full 30d/1s OHLC for Monad tokens to keep Max MC line accurate
  useEffect(() => {
    console.log('🔍 [MAX_MC_FETCH] Effect triggered:', { mint, pairAddress });
    const isMonad = latestParamsRef.current.network === 'monad';
    const tokenId = mint || pairAddress;
    console.log('🔍 [MAX_MC_FETCH] Checks:', {
      isMonad,
      tokenId,
      hasWindow: typeof window !== 'undefined',
    });

    if (!isMonad || !tokenId || typeof window === 'undefined') {
      console.log('⚠️ [MAX_MC_FETCH] Skipping - conditions not met');
      maxMarketCapFromApiRef.current = null;
      return;
    }

    console.log('🔍 [MAX_MC_FETCH] Starting fetch for token:', tokenId);
    const controller = new AbortController();
    const fetchMaxMc = async () => {
      try {
        const url = new URL('/api/token-service/ohlc-monad', window.location.origin);
        url.searchParams.set('token_address', tokenId);
        url.searchParams.set('interval', '1s');
        url.searchParams.set('timeframe', '30d');
        url.searchParams.set('optimize', 'true');

        console.log('🔍 [MAX_MC_FETCH] Fetching URL:', url.toString());

        const resp = await fetch(url.toString(), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        console.log('🔍 [MAX_MC_FETCH] Response status:', resp.status, resp.ok);

        if (!resp.ok) {
          console.warn('⚠️ [MAX_MC_FETCH] Fetch failed with status:', resp.status);
          maxMarketCapFromApiRef.current = null;
          return;
        }

        const data = await resp.json();
        const items: BackendOHLCData[] = data?.data?.items || [];
        console.log('🔍 [MAX_MC_FETCH] Received candles:', items.length);

        let maxHigh = 0;
        let maxHighCandle = null;
        for (const c of items) {
          if (c?.h && c.h > maxHigh) {
            maxHigh = c.h;
            maxHighCandle = c;
          }
        }

        const maxMcUsd = maxHigh > 0 ? maxHigh * MARKET_CAP_MULTIPLIER : null;

        console.log('🔍 [MAX_MC_FETCH] Result:', {
          token: tokenId,
          maxHigh,
          maxMcUsd,
          formatted: maxMcUsd ? `$${(maxMcUsd / 1_000_000).toFixed(2)}M` : 'null',
          candles: items.length,
          maxHighCandle: maxHighCandle ? {
            time: new Date(maxHighCandle.unix_time * 1000).toISOString(),
            high: maxHighCandle.h,
          } : null,
        });

        maxMarketCapFromApiRef.current = maxMcUsd;
        console.log('✅ [MAX_MC_FETCH] Updated maxMarketCapFromApiRef.current:', maxMarketCapFromApiRef.current);

        // Update cached metrics so price line sync can use the fresh max MC
        if (maxMarketCapFromApiRef.current) {
          lastMetricsRef.current = {
            ...lastMetricsRef.current,
            maxMarketCapUsd: maxMarketCapFromApiRef.current,
          };
          console.log('✅ [MAX_MC_FETCH] Updated lastMetricsRef.current:', lastMetricsRef.current);
        }

        console.log('🔍 [MAX_MC_FETCH] Requesting price line sync with delay 0');
        requestPriceLineSync(0);
      } catch (e) {
        if ((e as any)?.name !== 'AbortError') {
          console.warn('❌ [MAX_MC_FETCH] Error:', e);
        }
        maxMarketCapFromApiRef.current = null;
      }
    };

    fetchMaxMc();
    return () => {
      console.log('🔍 [MAX_MC_FETCH] Cleanup - aborting fetch');
      controller.abort();
    };
  }, [mint, pairAddress]);

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

  // Reset right-alignment flag when token changes so chart gets aligned again
  useEffect(() => {
    hasRightAlignedRef.current = false;
  }, [mint, pairAddress]);

  // Refresh chart when displayMode changes (for Monad USD/MC toggle)
  // Refresh chart when displayMode changes - Force complete reload by changing symbol
  // Append mode suffix to symbol name so TradingView treats it as a new symbol
  useEffect(() => {
    const currentNetwork = latestParamsRef.current.network;
    if (currentNetwork !== 'monad') return;
    if (!hasInitializedRef.current) return;

    const widget = widgetRef.current;
    if (!widget) return;

    widget.onChartReady(() => {
      try {
        const baseTokenId = widgetTokenRef.current || (latestParamsRef.current.mint || latestParamsRef.current.pairAddress) || 'TOKEN';
        const currentInterval = latestParamsRef.current.interval || selectedInterval;
        const currentResolution = INTERVAL_TO_RESOLUTION[currentInterval] || '1';
        const currentDisplayMode = displayModeRef.current;
        
        // Append mode suffix to force TradingView to treat it as a new symbol
        // This ensures getBars is called with the new mode
        const symbolWithMode = `${baseTokenId}|${currentDisplayMode}`;
        
        console.log('[AdvancedOHLCChart] 🔄 Changing symbol to force reload:', {
          baseTokenId,
          symbolWithMode,
          mode: currentDisplayMode,
        });

        // Change symbol - this forces TradingView to call getBars again
        widget.setSymbol(symbolWithMode, currentResolution, () => {
          console.log('[AdvancedOHLCChart] ✅ Symbol changed, getBars should be called with mode:', currentDisplayMode);
        });
      } catch (e) {
        console.log('[AdvancedOHLCChart] Failed to change symbol:', e);
      }
    });
  }, [displayMode, selectedInterval]);

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
  const cachedTimeframeRef = useRef<string | null>(null);
  const fetchCountRef = useRef<number>(0); // Debug: track fetch count
  const getBarsInFlightRef = useRef<Promise<void> | null>(null); // Prevent concurrent getBars requests
  const getBarsInFlightKeyRef = useRef<string | null>(null);
  const visibleRangeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  // WebSocket for real-time OHLC updates (Monad only)
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscribedCallbackRef = useRef<((bar: any) => void) | null>(null);
  const historyCallbackRef = useRef<((bars: any[], meta: any) => void) | null>(null); // Store current history callback for fast refresh
  const latestTradeDataRef = useRef<any[]>(tradeData || []);
  const latestCreatorAddressRef = useRef<string | null>(creatorAddress || null);
  const latestTokenSymbolRef = useRef<string | null>(tokenSymbol || null);
  const latestTokenNameRef = useRef<string | null>(tokenName || null);
  const latestTokenDecimalsRef = useRef<number | null>(
    typeof tokenDecimals === 'number' && !Number.isNaN(tokenDecimals) ? tokenDecimals : null
  );
  const hasRealPriceDataRef = useRef<boolean>(false); // Track if we've received real price data
  const priceLineShapesRef = useRef<Record<string, any>>({});
  const lastMetricsRef = useRef<{ lastPriceUsd?: number; lastMarketCapUsd?: number; maxMarketCapUsd?: number }>({});
  const maxMarketCapFromApiRef = useRef<number | null>(null);
  const lastAppliedLinesRef = useRef<{ entry?: number | null; exit?: number | null; maxMc?: number | null }>({});
  const syncLinesInFlightRef = useRef<boolean>(false);
  const lastPriceLinesRef = useRef<Record<string, number | null>>({});
  const priceLinesRef = useRef(priceLines);

  // Log when priceLines prop changes
  if (priceLinesRef.current !== priceLines) {
    console.log('💰 [PRICE_LINES_PROP] Price lines prop changed:', {
      old: priceLinesRef.current,
      new: priceLines,
      oldEntry: priceLinesRef.current?.avgEntryPriceUsd,
      newEntry: priceLines?.avgEntryPriceUsd,
      oldExit: priceLinesRef.current?.avgExitPriceUsd,
      newExit: priceLines?.avgExitPriceUsd,
    });
  }

  priceLinesRef.current = priceLines;
  const priceLineSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const marksInitializedRef = useRef(false);
  const prevTradeDataLengthRef = useRef<number>(tradeData?.length || 0);
  const tradeSignatureRef = useRef<string>(
    Array.isArray(tradeData)
      ? tradeData.map((t: any) => t.transactionHash || t.tx_hash || t.id || '').join('|')
      : ''
  );
  
  // For Monad aggregation: track 1s candles within current timeframe window (1m, 5m, 15m, 1h, etc.)
  const currentAggregatedCandleRef = useRef<BackendOHLCData | null>(null);
  const oneSecondCandlesRef = useRef<BackendOHLCData[]>([]);
  const currentAggregatingIntervalRef = useRef<string | null>(null);
  // Track if initial right-alignment has been done to prevent overriding user's zoom/pan
  const hasRightAlignedRef = useRef(false);

  // Helper to (re)draw price lines when chart is ready
  const requestPriceLineSync = useCallback((delay: number = 0) => {
    console.log('🔔 [REQUEST_SYNC] Price line sync requested with delay:', delay, 'ms');
    console.log('🔔 [REQUEST_SYNC] Current metrics:', lastMetricsRef.current);

    if (priceLineSyncTimeoutRef.current) {
      console.log('🔔 [REQUEST_SYNC] Clearing existing timeout');
      clearTimeout(priceLineSyncTimeoutRef.current);
    }

    priceLineSyncTimeoutRef.current = setTimeout(() => {
      console.log('🔔 [REQUEST_SYNC] Timeout fired, checking widget...');
      const widget = widgetRef.current;

      if (!widget) {
        console.log('⚠️ [REQUEST_SYNC] Widget not ready, will retry in 50ms');
        // Retry shortly if widget not ready yet
        priceLineSyncTimeoutRef.current = setTimeout(() => requestPriceLineSync(0), 50);
        return;
      }

      console.log('🔔 [REQUEST_SYNC] Widget ready, preparing to sync...');
      const maxMarketCapUsd = lastMetricsRef.current.maxMarketCapUsd ?? null;
      console.log('🔔 [REQUEST_SYNC] Will call syncPriceLines with maxMarketCapUsd:', maxMarketCapUsd);

      const run = () => {
        console.log('🔔 [REQUEST_SYNC] Executing syncPriceLines...');
        syncPriceLines(maxMarketCapUsd);
      };

      if (typeof widget.onChartReady === 'function') {
        console.log('🔔 [REQUEST_SYNC] Using widget.onChartReady callback');
        widget.onChartReady(run);
      } else {
        console.log('🔔 [REQUEST_SYNC] Running immediately (no onChartReady)');
        run();
      }
    }, Math.max(0, delay));
  }, [syncPriceLines]);

  // Refresh chart price lines when props or display mode change
  useEffect(() => {
    console.log('🔄 [EFFECT_PRICE_SYNC] Effect triggered - display mode or priceLines changed');
    console.log('🔄 [EFFECT_PRICE_SYNC] Current state:', {
      displayMode,
      displayModeRef: displayModeRef.current,
      priceLines,
      avgEntryPriceUsd: priceLines?.avgEntryPriceUsd,
      avgExitPriceUsd: priceLines?.avgExitPriceUsd,
    });
    console.log('🔄 [EFFECT_PRICE_SYNC] Calling requestPriceLineSync with 10ms delay');
    requestPriceLineSync(10);
  }, [displayMode, priceLines, requestPriceLineSync]);

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
          requestPriceLineSync(50);
        } catch (error) {
          console.error('[AdvancedOHLCChart] Failed to reset chart for marks refresh', error);
        }
      });
    }

    prevTradeDataLengthRef.current = tradeCount;
  }, [creatorAddress, tradeData?.length, requestPriceLineSync]);

  // Refresh marks when the underlying trade set changes (even if length stays the same)
  useEffect(() => {
    const signature = Array.isArray(tradeData)
      ? tradeData.map((t: any) => t.transactionHash || t.tx_hash || t.id || '').join('|')
      : '';

    if (signature && signature !== tradeSignatureRef.current) {
      tradeSignatureRef.current = signature;
      if (widgetRef.current) {
        widgetRef.current.onChartReady?.(() => {
          try {
            const chart = widgetRef.current?.chart?.();
            chart?.resetData?.();
            console.log('[AdvancedOHLCChart] Triggered chart reset after trade data signature change');
            requestPriceLineSync(50);
          } catch (error) {
            console.error('[AdvancedOHLCChart] Failed to reset chart after trade data signature change', error);
          }
        });
      }
    }
  }, [tradeData, requestPriceLineSync]);

  // Build URL for OHLC data (same as BackendOHLCChart)
  // Allow override of interval for when TradingView requests a different resolution
  const buildUrl = useCallback(
    (overrideInterval?: BackendInterval, overrideTimeframe?: BackendTimeRange) => {
      const { network: currentNetwork, mint: currentMint, pairAddress: currentPairAddress, interval: currentInterval, timeframe: currentTimeframe, optimize: currentOptimize } =
        latestParamsRef.current;

      const effectiveInterval = overrideInterval || currentInterval;
      const effectiveTimeframe = overrideTimeframe || currentTimeframe;

      if (currentNetwork === 'monad') {
        if (typeof window === 'undefined') {
          throw new Error('Cannot build Monad OHLC URL on the server');
        }
        const url = new URL('/api/token-service/ohlc-monad', window.location.origin);
        const tokenAddress = currentMint || currentPairAddress;
        if (tokenAddress) url.searchParams.set('token_address', tokenAddress);
        // Fetch actual interval data (1s for 1s, etc.)
        url.searchParams.set('interval', effectiveInterval);
        url.searchParams.set('timeframe', effectiveTimeframe);
        if (currentOptimize) url.searchParams.set('optimize', 'true');
        return url;
      }

      const url = new URL(`${BACKEND_URL}/v1/trade/ohlc-data`);
      if (currentMint) url.searchParams.set('mint', currentMint);
      if (currentPairAddress) url.searchParams.set('pair_address', currentPairAddress);
      url.searchParams.set('interval', effectiveInterval);
      url.searchParams.set('timeframe', effectiveTimeframe);
      if (currentOptimize) url.searchParams.set('optimize', 'true');
      return url;
    },
    []
  );

  // Helper function to right-align chart using logical range positioning
  // This ensures candles are aligned to the right side, with latest candles visible
  const rightAlignChart = useCallback((barCount: number) => {
    if (!widgetRef.current || !containerRef.current || barCount === 0 || hasRightAlignedRef.current) {
      return;
    }

    widgetRef.current.onChartReady(() => {
      try {
        const chart = widgetRef.current?.chart?.();
        if (!chart) return;

        const timeScale = chart.timeScale();
        if (!timeScale) return;

        // Get data from cache to calculate time-based ranges
        const cachedData = lastGoodCandlesRef.current;
        if (cachedData.length === 0) {
          console.log('[AdvancedOHLCChart] ⚠️ No cached data available for right-alignment');
          return;
        }

        // Calculate target bars based on container width
        const PX_PER_BAR = 10;     // pixels per bar (higher = fewer bars, more zoomed in)
        const MIN_BARS = 80;       // minimum bars to show (lower = more zoomed in)

        const width = containerRef.current?.clientWidth || 800;
        const targetBars = Math.max(Math.floor(width / PX_PER_BAR), MIN_BARS);

        // Get the latest candle time
        const sortedData = [...cachedData].sort((a, b) => a.unix_time - b.unix_time);
        const latestCandle = sortedData[sortedData.length - 1];
        const latestTime = latestCandle.unix_time;

        // Calculate the interval in seconds from the data
        let intervalSeconds = 60; // default 1 minute
        if (sortedData.length > 1) {
          const timeDiff = sortedData[1].unix_time - sortedData[0].unix_time;
          if (timeDiff > 0) intervalSeconds = timeDiff;
        }

        // Calculate time range: show targetBars worth of data ending at latestTime
        const barsToShow = Math.min(barCount, targetBars);
        const timeSpan = barsToShow * intervalSeconds;
        const fromTime = latestTime - timeSpan;
        const toTime = latestTime + (intervalSeconds * 2); // Add buffer for future

        // Try logical range first (for TradingView lightweight charts)
        try {
          if (barCount <= targetBars) {
            // Sparse data: show all bars, position latest on right
            const lastIdx = barCount - 1 + 5; // Add padding
            const firstIdx = Math.max(0, lastIdx - targetBars);
            if (typeof timeScale.setVisibleLogicalRange === 'function') {
              timeScale.setVisibleLogicalRange({ from: firstIdx, to: lastIdx });
              console.log('[AdvancedOHLCChart] 📊 Right-aligned sparse data (logical):', { barCount, firstIdx, lastIdx });
            } else {
              // Fallback to time-based range
              if (typeof chart.setVisibleRange === 'function') {
                chart.setVisibleRange({ from: fromTime, to: toTime });
                console.log('[AdvancedOHLCChart] 📊 Right-aligned sparse data (time-based):', { fromTime, toTime });
              }
            }
          } else {
            // Dense data: show most recent bars
            const lastIdx = barCount - 1 + 5;
            const firstIdx = lastIdx - targetBars + 1;
            if (typeof timeScale.setVisibleLogicalRange === 'function') {
              timeScale.setVisibleLogicalRange({ from: firstIdx, to: lastIdx });
              console.log('[AdvancedOHLCChart] 📊 Right-aligned dense data (logical):', { barCount, firstIdx, lastIdx });
            } else {
              // Fallback to time-based range
              if (typeof chart.setVisibleRange === 'function') {
                chart.setVisibleRange({ from: fromTime, to: toTime });
                console.log('[AdvancedOHLCChart] 📊 Right-aligned dense data (time-based):', { fromTime, toTime });
              }
            }
          }
        } catch (logicalErr) {
          // If logical range fails, use time-based range
          console.log('[AdvancedOHLCChart] Logical range failed, trying time-based:', logicalErr);
          if (typeof chart.setVisibleRange === 'function') {
            chart.setVisibleRange({ from: fromTime, to: toTime });
            console.log('[AdvancedOHLCChart] 📊 Right-aligned using time-based range:', { fromTime, toTime });
          }
        }

        // Scroll to real-time to keep aligned to the right edge
        setTimeout(() => {
          try {
            timeScale.scrollToRealTime();
          } catch (e) {
            console.log('[AdvancedOHLCChart] Could not scroll to real-time:', e);
          }
        }, 100);
        
        hasRightAlignedRef.current = true;
        console.log('[AdvancedOHLCChart] ✅ Chart right-aligned successfully');
      } catch (e) {
        console.log('[AdvancedOHLCChart] ⚠️ Could not right-align chart:', e);
      }
    });
  }, []);

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

      // Check if we have real price data (not all zeros)
      const hasRealData = items.some(item => item.c > 0 || item.o > 0 || item.h > 0 || item.l > 0);
      const isFirstRealData = hasRealData && !hasRealPriceDataRef.current;
      
      if (isFirstRealData) {
        hasRealPriceDataRef.current = true;
        console.log('[AdvancedOHLCChart] 📊 First real price data from HTTP - will refresh symbol for price scale');
      }

      lastGoodCandlesRef.current = items;
      
      // ✅ Mark cache as belonging to the current interval
      // This prevents unnecessary HTTP requests when toggling USD/MC
      cachedIntervalRef.current = selectedInterval;
      
      setCandles(items);
      setLastUpdate(new Date());
      setRetryCount(0);
      updateChartMetrics();
      onDataUpdate?.(items);
      
      // If this is the first real data and widget is ready, refresh symbol to update price scale
      if (isFirstRealData && widgetRef.current) {
        setTimeout(() => {
          widgetRef.current?.onChartReady(() => {
            try {
              const tokenId = `${mint || pairAddress}`;
              const currentResolution = INTERVAL_TO_RESOLUTION[selectedInterval];
              widgetRef.current?.setSymbol(tokenId, currentResolution, () => {
                console.log('[AdvancedOHLCChart] ✅ Symbol refreshed after HTTP data - price scale updated');
              });
            } catch (e) {
              console.log('[AdvancedOHLCChart] Symbol refresh failed:', e);
            }
          });
        }, 100);
      }
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
  }, [buildUrl, onDataUpdate, preloadedData, selectedInterval]);

  // Load TradingView library
  useEffect(() => {
    console.log('[AdvancedOHLCChart] 🔄 LIBRARY LOAD useEffect running - VERSION 2', {
      libraryLoaded,
      hasTradingView: !!(window as any).TradingView,
      windowTradingViewType: typeof (window as any).TradingView,
    });

    // Already loaded
    if ((window as any).TradingView) {
      console.log('[AdvancedOHLCChart] ✅ TradingView already available in window');
      if (!libraryLoaded) setLibraryLoaded(true);
      return;
    }
    
    if (libraryLoaded) {
      console.log('[AdvancedOHLCChart] libraryLoaded is true but TradingView not in window - resetting');
      return;
    }

    // Check for existing script in DOM
    const existingScript = document.querySelector('script[src*="charting_library.standalone.js"]');
    console.log('[AdvancedOHLCChart] Existing script found:', !!existingScript);
    
    // Function to wait for TradingView to be available
    const waitForTradingView = (timeout: number = 5000) => {
      console.log('[AdvancedOHLCChart] Waiting for TradingView to be available...');
      const startTime = Date.now();
      
      const check = () => {
        if ((window as any).TradingView) {
          console.log('[AdvancedOHLCChart] ✅ TradingView library loaded!', {
            hasWidget: !!(window as any).TradingView.widget,
          });
          setLibraryLoaded(true);
          return;
        }
        
        if (Date.now() - startTime < timeout) {
          requestAnimationFrame(check);
        } else {
          console.error('[AdvancedOHLCChart] ❌ TradingView not found after', timeout, 'ms');
          setError('Failed to load TradingView library - timeout');
          setIsLoading(false);
        }
      };
      
      check();
    };

    if (existingScript) {
      // Script exists, wait for it to load
      waitForTradingView(5000);
      return;
    }
    
    // Script doesn't exist, create it
    console.log('[AdvancedOHLCChart] 📥 Creating script element for TradingView library');
    const script = document.createElement('script');
    script.src = '/charting_library/charting_library/charting_library.standalone.js';
    script.async = true;
    
    script.onload = () => {
      console.log('[AdvancedOHLCChart] Script onload fired');
      waitForTradingView(2000);
    };
    
    script.onerror = (e) => {
      console.error('[AdvancedOHLCChart] ❌ Script load error:', e);
      setError('Failed to load charting library - script error');
      setIsLoading(false);
    };
    
    document.head.appendChild(script);
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
      updateChartMetrics();
      
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
    // For Monad: Always use 1s interval (backend supports it) and aggregate into 1m if needed
    const wsBaseUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL || 'http://localhost:8081';
    const wsInterval = '1s'; // Always use 1s for Monad to get real-time updates
    // Convert http/https to ws/wss for WebSocket
    const wsProtocol = wsBaseUrl.startsWith('https') ? 'wss' : 'ws';
    const wsHost = wsBaseUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProtocol}://${wsHost}/v1/ohlc/stream?token_address=${tokenAddress}&interval=${wsInterval}`;
    
    // Check if we need to aggregate 1s -> 1m when viewing 1m candles
    const needsAggregation = selectedInterval === '1m';
    
    // Reset aggregation state if interval changed
    if (currentAggregatingIntervalRef.current !== selectedInterval) {
      currentAggregatedCandleRef.current = null;
      oneSecondCandlesRef.current = [];
      currentAggregatingIntervalRef.current = selectedInterval;
    }

    // Track if connection was closed by cleanup (don't reconnect in that case)
    let closedByCleanup = false;

    // Extract message handler to reuse in connect function
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);

        // Handle initial history batch
        if (message.type === 'ohlc_history') {
          const candles = message.data as Array<any>;
          console.log('[AdvancedOHLCChart] 📊 WebSocket ohlc_history received:', candles.length, 'candles');
          console.log('[AdvancedOHLCChart] 📊 Raw first candle from WS:', JSON.stringify(candles[0]));

          if (candles.length === 0) {
            console.log('[AdvancedOHLCChart] ⚠️ No historical candles received from WebSocket');
            
            // For Monad: Create a placeholder candle at 0 when no data
            const currentNetwork = latestParamsRef.current.network;
            if (currentNetwork === 'monad') {
              const now = Math.floor(Date.now() / 1000);
              const placeholderCandle: BackendOHLCData = {
                unix_time: now,
                o: 0,
                h: 0,
                l: 0,
                c: 0,
                v_usd: 0,
              };
              lastGoodCandlesRef.current = [placeholderCandle];
              console.log('[AdvancedOHLCChart] 📊 Created placeholder candle at 0 for Monad (no WebSocket history)');
              
              // Update state to trigger chart refresh
              setCandles([placeholderCandle]);
              setIsLoading(false);
              hasInitializedRef.current = true;
              firstLoadRef.current = false;
            }
            return;
          }

          // Clear existing cache and replace with WebSocket data
          lastGoodCandlesRef.current = [];

          // Update cache with historical data - WebSocket sends { time, o, h, l, c, v }
          candles.forEach((ohlcData: any, idx: number) => {
            // Handle 0-value candles: if all OHLC values are 0, set a small minimum
            // This ensures TradingView renders them (otherwise they may be invisible)
            const hasZeroValues = ohlcData.o === 0 && ohlcData.h === 0 && ohlcData.l === 0 && ohlcData.c === 0;
            const minPrice = 0.0000001; // Small non-zero value for display
            
            const newCandle: BackendOHLCData = {
              unix_time: ohlcData.time,
              o: hasZeroValues ? minPrice : ohlcData.o,
              h: hasZeroValues ? minPrice : ohlcData.h,
              l: hasZeroValues ? minPrice : ohlcData.l,
              c: hasZeroValues ? minPrice : ohlcData.c,
              v_usd: ohlcData.v || 0,
            };

            // Log first few candles for debugging
            if (idx < 3) {
              console.log(`[AdvancedOHLCChart] 📊 Mapped candle ${idx}:`, JSON.stringify(newCandle), hasZeroValues ? '(had zero values)' : '');
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

          // Check if we have real price data (not all zeros)
          const hasRealData = lastGoodCandlesRef.current.some(c => c.c > 0 || c.o > 0 || c.h > 0 || c.l > 0);
          const isFirstRealData = hasRealData && !hasRealPriceDataRef.current;
          
          if (isFirstRealData) {
            hasRealPriceDataRef.current = true;
            console.log('[AdvancedOHLCChart] 📊 First real price data received - will refresh chart for price scale');
            // Refresh symbol once to force TradingView to recalc price scale/timeframe stats
            setTimeout(() => {
              widgetRef.current?.onChartReady(() => {
                try {
                  const tokenId = `${mint || pairAddress}`;
                  const currentResolution = INTERVAL_TO_RESOLUTION[selectedInterval];
                  widgetRef.current?.setSymbol(tokenId, currentResolution, () => {
                    console.log('[AdvancedOHLCChart] ✅ Symbol refreshed after WS data - price scale updated');
                  });
                } catch (e) {
                  console.log('[AdvancedOHLCChart] Symbol refresh after WS data failed:', e);
                }
              });
            }, 50);
          }

          // Update state to trigger re-render and dismiss loading overlay
          setCandles([...lastGoodCandlesRef.current]);
          setIsLoading(false);
          hasInitializedRef.current = true;
          firstLoadRef.current = false; // Ensure loading overlay is dismissed
          console.log('[AdvancedOHLCChart] 📊 WebSocket data received - loading state cleared');
          updateChartMetrics();

          // Force TradingView to refresh data from the updated cache
          // Use resetData() instead of setSymbol to avoid disrupting subscription lifecycle
          setTimeout(() => {
            if (widgetRef.current) {
              try {
                // Use resetData() to refresh chart without disrupting subscription
                const chart = widgetRef.current.chart();
                if (chart && typeof chart.resetData === 'function') {
                  chart.resetData();
                  console.log('[AdvancedOHLCChart] ✅ TradingView chart().resetData() called - chart refreshed without disrupting subscription');
                  // Redraw price lines after reset so overlays persist through refreshes
                  requestPriceLineSync(50);
                  
                  // After refresh, right-align chart to show latest candles
                  try {
                    if (lastGoodCandlesRef.current.length > 0) {
                      setTimeout(() => {
                        rightAlignChart(lastGoodCandlesRef.current.length);
                      }, 300);
                    }
                  } catch (rangeErr) {
                    console.log('[AdvancedOHLCChart] Could not right-align chart:', rangeErr);
                  }
                } else if (isFirstRealData) {
                  // Fallback: only use setSymbol for first real data to update price scale
                  console.log('[AdvancedOHLCChart] 📊 First real data - using setSymbol to update price scale...');
                  widgetRef.current.onChartReady(() => {
                    try {
                      const tokenId = mint || pairAddress;
                      const currentResolution = INTERVAL_TO_RESOLUTION[selectedInterval] || '1S';
                      widgetRef.current.setSymbol(tokenId, currentResolution, () => {
                        console.log('[AdvancedOHLCChart] ✅ Symbol refreshed - price scale should now be correct');
                        
                        // After refresh, right-align chart to show latest candles
                        try {
                          if (lastGoodCandlesRef.current.length > 0) {
                            setTimeout(() => {
                              rightAlignChart(lastGoodCandlesRef.current.length);
                            }, 300);
                          }
                        } catch (rangeErr) {
                          console.log('[AdvancedOHLCChart] Could not right-align chart:', rangeErr);
                        }
                      });
                    } catch (e) {
                      console.log('[AdvancedOHLCChart] Symbol refresh failed:', e);
                    }
                  });
                }
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

        // For Monad: Aggregate 1s candles into the current viewing timeframe (1m, 5m, 15m, 1h, etc.)
        const currentSelectedInterval = latestParamsRef.current.interval;
        
        // Only aggregate if viewing a timeframe that's longer than 1s (we always receive 1s candles)
        const needsAggregation = network === 'monad' && 
          currentSelectedInterval !== '1s' && 
          currentSelectedInterval !== '5s' && 
          currentSelectedInterval !== '15s' && 
          currentSelectedInterval !== '30s';
        
        if (needsAggregation) {
          // This is a 1s candle - aggregate into current 1m candle
          const oneSecCandle: BackendOHLCData = {
            unix_time: ohlcData.time,
            o: ohlcData.o,
            h: ohlcData.h,
            l: ohlcData.l,
            c: ohlcData.c,
            v_usd: ohlcData.v || 0,
          };
          
          // Get the current window start time for the viewing interval
          const windowStart = getWindowStartTime(oneSecCandle.unix_time, currentSelectedInterval);
          
          // Check if this 1s candle belongs to current timeframe window
          if (!currentAggregatedCandleRef.current || currentAggregatedCandleRef.current.unix_time !== windowStart) {
            // New timeframe window - finalize previous candle if it exists
            if (currentAggregatedCandleRef.current) {
              const finalizedCandle = currentAggregatedCandleRef.current;
              console.log(`[AdvancedOHLCChart] 📊 Finalized previous ${currentSelectedInterval} candle:`, {
                windowStart: new Date(finalizedCandle.unix_time * 1000).toISOString(),
                o: finalizedCandle.o,
                h: finalizedCandle.h,
                l: finalizedCandle.l,
                c: finalizedCandle.c,
                v: finalizedCandle.v_usd,
              });
              
              // Update cache with finalized candle (it's complete now)
              const cachedData = lastGoodCandlesRef.current;
              const existingIdx = cachedData.findIndex(c => c.unix_time === finalizedCandle.unix_time);
              if (existingIdx >= 0) {
                cachedData[existingIdx] = finalizedCandle;
              } else {
                cachedData.push(finalizedCandle);
                cachedData.sort((a, b) => a.unix_time - b.unix_time);
              }
            }
            
            // Create new aggregated candle for new timeframe window
            currentAggregatedCandleRef.current = {
              unix_time: windowStart,
              o: oneSecCandle.o,
              h: oneSecCandle.h,
              l: oneSecCandle.l,
              c: oneSecCandle.c,
              v_usd: oneSecCandle.v_usd,
            };
            oneSecondCandlesRef.current = [oneSecCandle];
            
            console.log(`[AdvancedOHLCChart] 📊 New ${currentSelectedInterval} candle window started:`, {
              windowStart: new Date(windowStart * 1000).toISOString(),
              open: currentAggregatedCandleRef.current.o,
            });
          } else {
            // Update existing aggregated candle with this 1s candle
            const currentCandle = currentAggregatedCandleRef.current;
            currentCandle.h = Math.max(currentCandle.h, oneSecCandle.h);
            currentCandle.l = Math.min(currentCandle.l, oneSecCandle.l);
            currentCandle.c = oneSecCandle.c; // Close = latest price
            currentCandle.v_usd += oneSecCandle.v_usd;
            
            oneSecondCandlesRef.current.push(oneSecCandle);
            
            // Keep only a reasonable number of 1s candles in memory (e.g., enough for the current timeframe)
            // For 1m: 60, for 5m: 300, for 15m: 900, etc.
            const maxCandlesToKeep = currentSelectedInterval === '1m' ? 60 :
                                     currentSelectedInterval === '5m' ? 300 :
                                     currentSelectedInterval === '15m' ? 900 :
                                     currentSelectedInterval === '1h' ? 3600 : 100;
            
            if (oneSecondCandlesRef.current.length > maxCandlesToKeep) {
              oneSecondCandlesRef.current = oneSecondCandlesRef.current.slice(-maxCandlesToKeep);
            }
          }
          
          // Use the aggregated candle for chart update
          const aggregatedCandle = currentAggregatedCandleRef.current;
          
          console.log(`[AdvancedOHLCChart] 📊 Aggregated 1s -> ${currentSelectedInterval} candle:`, {
            windowStart: new Date(aggregatedCandle.unix_time * 1000).toISOString(),
            o: aggregatedCandle.o,
            h: aggregatedCandle.h,
            l: aggregatedCandle.l,
            c: aggregatedCandle.c,
            v: aggregatedCandle.v_usd,
            oneSecCount: oneSecondCandlesRef.current.length,
          });
          
          // Convert aggregated candle to TradingView bar format
          const baseBar = {
            time: aggregatedCandle.unix_time * 1000, // Convert to ms
            open: aggregatedCandle.o,
            high: aggregatedCandle.h,
            low: aggregatedCandle.l,
            close: aggregatedCandle.c,
            volume: aggregatedCandle.v_usd,
          };
          
          // Apply display mode transformation for Monad
          const currentNetwork = latestParamsRef.current.network;
          const isMonad = currentNetwork === 'monad';
          const currentDisplayMode = displayModeRef.current; // Use ref for fast access
          let bar = transformBar(baseBar, currentDisplayMode, isMonad);
          
          // Update cache with aggregated 1m candle (store raw USD data)
          const cachedData = lastGoodCandlesRef.current;
          const existingIdx = cachedData.findIndex(c => c.unix_time === aggregatedCandle.unix_time);
          if (existingIdx >= 0) {
            cachedData[existingIdx] = aggregatedCandle;
          } else {
            cachedData.push(aggregatedCandle);
            cachedData.sort((a, b) => a.unix_time - b.unix_time);
          }
          
          // Update chart via callback
          if (subscribedCallbackRef.current && bar.time > 0) {
            console.log(`[AdvancedOHLCChart] 📊 Calling subscribedCallback with aggregated ${currentSelectedInterval} bar:`, {
              time: new Date(bar.time).toISOString(),
              open: bar.open,
              high: bar.high,
              low: bar.low,
              close: bar.close,
            });
            subscribedCallbackRef.current(bar);
          } else {
            console.warn(`[AdvancedOHLCChart] ⚠️ Aggregated ${currentSelectedInterval} update received but callback not available:`, {
              hasCallback: !!subscribedCallbackRef.current,
              barTime: bar.time,
              message: 'subscribeBars may not have been called yet by TradingView',
            });
          }
          updateChartMetrics();
          
          return; // Don't process as 1s candle
        }

        console.log('[AdvancedOHLCChart] 📊 WebSocket OHLC update:', {
          time: new Date(ohlcData.time * 1000).toISOString(),
          close: ohlcData.c,
          interval: selectedInterval,
        });

        // Convert to TradingView bar format (raw USD data first)
        const baseBar = {
          time: (ohlcData.time || 0) * 1000, // Convert to ms
          open: ohlcData.o,
          high: ohlcData.h,
          low: ohlcData.l,
          close: ohlcData.c,
          volume: ohlcData.v || 0,
        };

        // For Monad: Ensure new candle connects to previous candle (work with raw USD data)
        const currentNetwork = latestParamsRef.current.network;
        const isMonad = currentNetwork === 'monad';
        if (isMonad) {
          const cachedData = lastGoodCandlesRef.current;
          if (cachedData.length > 0) {
            // Find the most recent candle before this one
            const sortedCache = [...cachedData].sort((a, b) => a.unix_time - b.unix_time);
            const previousCandle = sortedCache[sortedCache.length - 1];
            
            // If this candle's time is after the previous, ensure continuity
            if (baseBar.time / 1000 > previousCandle.unix_time) {
              const previousClose = previousCandle.c;
              
              // Connect: new candle's open should equal previous candle's close
              if (baseBar.open !== previousClose) {
                const wasFlat = baseBar.open === baseBar.high && baseBar.open === baseBar.low && baseBar.open === baseBar.close;
                baseBar.open = previousClose;
                
                if (wasFlat) {
                  // Was a flat candle - keep it flat at the new price
                  baseBar.high = previousClose;
                  baseBar.low = previousClose;
                  baseBar.close = previousClose;
                } else {
                  // Had variation - adjust high/low to maintain validity
                  if (baseBar.high < baseBar.open) baseBar.high = baseBar.open;
                  if (baseBar.low > baseBar.open) baseBar.low = baseBar.open;
                }
                
                console.log('[AdvancedOHLCChart] 🔗 Connected WebSocket candle to previous:', {
                  previousClose,
                  newOpen: baseBar.open,
                  wasFlat,
                });
              }
            }
          }
        }

        // Apply display mode transformation before sending to chart
        const currentDisplayMode = displayModeRef.current; // Use ref for fast access
        let bar = transformBar(baseBar, currentDisplayMode, isMonad);

        // Update the chart via callback if available
        if (subscribedCallbackRef.current && bar.time > 0) {
          console.log('[AdvancedOHLCChart] 📊 Calling subscribedCallback with bar:', {
            time: new Date(bar.time).toISOString(),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
          });
          subscribedCallbackRef.current(bar);
        } else {
          console.warn('[AdvancedOHLCChart] ⚠️ Real-time update received but callback not available:', {
            hasCallback: !!subscribedCallbackRef.current,
            barTime: bar.time,
            message: 'subscribeBars may not have been called yet by TradingView',
          });
        }

        // Also update our cache with the new candle (store raw USD data, not transformed)
        const newCandle: BackendOHLCData = {
          unix_time: baseBar.time / 1000,
          o: baseBar.open,
          h: baseBar.high,
          l: baseBar.low,
          c: baseBar.close,
          v_usd: baseBar.volume,
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
        updateChartMetrics();
      } catch (e) {
        console.error('[AdvancedOHLCChart] Error parsing WebSocket message:', e);
      }
    };

    // Extract connect function that can be called recursively for reconnection
    const connect = () => {
      if (closedByCleanup) {
        console.log('[AdvancedOHLCChart] Connection attempt skipped - component unmounting');
        return;
      }

      console.log('[AdvancedOHLCChart] 🔌 Monad WebSocket connecting (via useEffect):', wsUrl);
      console.log('[AdvancedOHLCChart] 📊 Selected interval:', selectedInterval, '| WS interval:', wsInterval, '| Aggregating 1s->1m:', needsAggregation);

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
          console.log('[AdvancedOHLCChart] 📊 WebSocket ready - waiting for subscribeBars callback:', {
            hasCallback: !!subscribedCallbackRef.current,
            wsUrl,
          });
        };

        ws.onmessage = handleMessage;

        ws.onerror = (error) => {
          console.error('[AdvancedOHLCChart] Monad WebSocket error:', error);
        };

        ws.onclose = (event) => {
          console.log('[AdvancedOHLCChart] Monad WebSocket closed:', event.code, event.reason);
          wsRef.current = null;

          // Reconnect after delay if component is still mounted and not closed by cleanup
          if (!closedByCleanup && mountedRef.current) {
            wsReconnectTimeoutRef.current = setTimeout(() => {
              console.log('[AdvancedOHLCChart] 🔄 Attempting Monad WebSocket reconnect...');
              connect(); // Recursively call connect to reconnect
            }, 2000); // Reduced from 5000ms to 2000ms for faster reconnection
          }
        };
      } catch (e) {
        console.error('[AdvancedOHLCChart] Failed to create Monad WebSocket:', e);
        // Retry connection on error if not closed by cleanup
        if (!closedByCleanup && mountedRef.current) {
          wsReconnectTimeoutRef.current = setTimeout(() => {
            console.log('[AdvancedOHLCChart] 🔄 Retrying Monad WebSocket connection after error...');
            connect();
          }, 2000);
        }
      }
    };

    // Initial connection
    connect();

    // Cleanup on unmount or when dependencies change
    return () => {
      closedByCleanup = true;
      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
        wsReconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [network, mint, pairAddress, selectedInterval]); // Re-connect when token or interval changes (always use 1s WS, aggregate if needed)

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
        // For Monad, ensure seconds are prominently listed to show in dropdown
        // Use latestParamsRef to get the current network value (not closure value)
        const currentNetwork = latestParamsRef.current.network;
        const isMonad = currentNetwork === 'monad';
        console.log('[AdvancedOHLCChart] 🔍 onReady - network check:', { 
          network, 
          currentNetwork, 
          isMonad,
          latestParamsNetwork: latestParamsRef.current.network 
        });
        const config = {
          // Both Solana and Monad now support 1s candles
          // CRITICAL: Seconds must be in supported_resolutions AND supports_seconds must be true
          // TradingView groups by type (SECONDS, MINUTES, HOURS, DAYS) in the dropdown
          supported_resolutions: ['1S', '5S', '15S', '30S', '1', '5', '15', '60', '240', '1D', '1W'],
          supports_group_request: false,
          supports_marks: true, // ✅ Enable marks support
          supports_search: false,
          supports_timescale_marks: true, // ✅ Enable timescale marks support
          supports_time: true,
          // CRITICAL: supports_seconds MUST be true for SECONDS section to appear in dropdown
          supports_seconds: true, // Both Solana and Monad support 1s candles
        };
        console.log('[AdvancedOHLCChart] 🔧 onReady Datafeed config:', JSON.stringify(config, null, 2), { 
          isMonad, 
          hasSeconds: config.supports_seconds,
          secondsInResolutions: config.supported_resolutions.filter(r => r.includes('S')),
        });
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
        // Strip mode suffix from symbol name (e.g., "TOKEN|MC" -> "TOKEN")
        const [baseSymbolName] = symbolName.split('|');
        console.log('[AdvancedOHLCChart] ========== resolveSymbol CALLED ==========', symbolName, '-> base:', baseSymbolName);
        
        // Calculate appropriate pricescale based on typical price range
        // For crypto tokens, prices can vary widely, so we'll use a more flexible approach
        // pricescale determines the precision: 100 = 2 decimals, 1000 = 3 decimals, etc.
        const MIN_PRICE = 0.0000001;
        
        // Find a real candle with actual price data (not placeholder with all zeros)
        // Use the LATEST candle instead of first - more likely to have current price
        let samplePrice = 1; // Default fallback
        
        if (lastGoodCandlesRef.current.length > 0) {
          // Sort candles by time to get the latest
          const sortedCandles = [...lastGoodCandlesRef.current].sort((a, b) => a.unix_time - b.unix_time);
          
          // Try to find a candle with real price data (not all zeros)
          // Start from the latest candle and work backwards
          for (let i = sortedCandles.length - 1; i >= 0; i--) {
            const candle = sortedCandles[i];
            // Check if this is a real candle (not a placeholder with all zeros)
            const hasRealPrice = candle.c > 0 || candle.o > 0 || candle.h > 0 || candle.l > 0;
            if (hasRealPrice && candle.c > 0) {
              samplePrice = candle.c;
              console.log('[AdvancedOHLCChart] resolveSymbol: Using latest real candle price:', samplePrice, 'from candle at', new Date(candle.unix_time * 1000).toISOString());
              break;
            }
          }
          
          // If we didn't find a real candle, try the first candle as fallback
          if (samplePrice === 1 && sortedCandles.length > 0) {
            const firstCandle = sortedCandles[0];
            if (firstCandle.c > 0) {
              samplePrice = firstCandle.c;
              console.log('[AdvancedOHLCChart] resolveSymbol: Using first candle price as fallback:', samplePrice);
            }
          }
        }
        
        // If sample price is still 0 or invalid, use MIN_PRICE
        if (samplePrice === 0 || !isFinite(samplePrice) || samplePrice < 0) {
          samplePrice = MIN_PRICE;
          console.log('[AdvancedOHLCChart] resolveSymbol: sample price was invalid, using MIN_PRICE');
        }
        
        // Adjust sample price based on display mode (MC = USD * 1 billion)
        const mode = displayModeRef.current; // 'USD' | 'MC'
        let effectiveSample = samplePrice;
        if (mode === 'MC') {
          effectiveSample = samplePrice * 1_000_000_000;
        }
        
        // Calculate pricescale based on effective sample (accounts for MC mode)
        let pricescale = 100;
        if (effectiveSample < 0.01) {
          pricescale = 100000000; // 8 decimals for very small prices
        } else if (effectiveSample < 1) {
          pricescale = 1000000; // 6 decimals
        } else if (effectiveSample < 100) {
          pricescale = 10000; // 4 decimals
        } else if (effectiveSample < 1000) {
          pricescale = 100; // 2 decimals
        } else {
          pricescale = 1; // 0 decimals for large numbers
        }
        
        console.log('[AdvancedOHLCChart] resolveSymbol: samplePrice=', samplePrice, 'mode=', mode, 'effectiveSample=', effectiveSample, 'pricescale=', pricescale);

        // Use latestParamsRef to get the current network value (not closure value)
        const currentNetwork = latestParamsRef.current.network;
        const isMonad = currentNetwork === 'monad';
        console.log('[AdvancedOHLCChart] 🔍 resolveSymbol - network check:', { 
          network, 
          currentNetwork, 
          isMonad,
          latestParamsNetwork: latestParamsRef.current.network 
        });
        // Update description based on display mode (USD vs MC)
        // Reuse the 'mode' variable already declared above
        const modeLabel = mode === 'MC' ? 'Market Cap' : 'Price';
        
        const symbolInfo = {
          name: symbolName,
          description: `${dfMint || dfPairAddress || 'Token'} ${modeLabel} Chart`,
          type: 'crypto',
          session: '24x7',
          timezone: 'Etc/UTC',
          ticker: symbolName,
          exchange: '',
          minmov: 1,
          pricescale: pricescale,
          has_intraday: true,
          has_weekly_and_monthly: false,
          // CRITICAL: has_seconds MUST be true for SECONDS section to appear in dropdown
          // This tells TradingView that this symbol supports second-based resolutions
          has_seconds: true, // Both Solana and Monad support 1s candles
          // Put seconds FIRST in the array - TradingView shows them in order
          // TradingView groups resolutions by type (SECONDS, MINUTES, HOURS, DAYS) in dropdown
          // The SECONDS group will appear if has_seconds=true AND seconds are in supported_resolutions
          supported_resolutions: ['1S', '5S', '15S', '30S', '1', '5', '15', '60', '240', '1D', '1W'],
          volume_precision: 2,
          data_status: 'streaming',
        };
        
        console.log('[AdvancedOHLCChart] 🔧 resolveSymbol - symbolInfo:', {
          has_seconds: symbolInfo.has_seconds,
          supported_resolutions: symbolInfo.supported_resolutions,
          secondsInList: symbolInfo.supported_resolutions.filter(r => r.includes('S')),
          network: network,
          currentNetwork: currentNetwork,
          isMonad,
        });

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
        // Store the callback for fast refresh when displayMode changes
        historyCallbackRef.current = onHistoryCallback;
        
        // Extract mode from symbol name if present (e.g., "TOKEN|MC" -> "MC")
        const symbolName = symbolInfo?.name || symbolInfo?.ticker || 'TOKEN';
        const [baseSymbol, modeFromSymbol] = symbolName.split('|');
        
        // Update displayModeRef if mode was in symbol name
        if (modeFromSymbol && (modeFromSymbol === 'USD' || modeFromSymbol === 'MC')) {
          displayModeRef.current = modeFromSymbol as 'USD' | 'MC';
          console.log('[AdvancedOHLCChart] 🔄 Mode extracted from symbol, updated displayModeRef to:', modeFromSymbol);
        }
        
        console.log('[AdvancedOHLCChart] 🔵 getBars CALLED - symbol:', symbolName, 'mode:', displayModeRef.current, 'resolution:', resolution);
        
        // Convert TradingView resolution to our interval format
        const requestedInterval = RESOLUTION_TO_INTERVAL[resolution] || dfInterval;
        // FIX: Always use the prop timeframe - don't let TradingView's periodParams override it
        // TradingView's periodParams represents the visible window, not how much data to fetch
        // The prop timeframe (e.g., "30d") should control the API call
        const requestedTimeframe: BackendTimeRange = latestParamsRef.current.timeframe;
        // Keep cache ref in sync (for caching logic)
        cachedTimeframeRef.current = requestedTimeframe;

        fetchCountRef.current += 1;
        const currentFetchCount = fetchCountRef.current;

        // CHECK CACHE FIRST - Only fetch if cache is empty OR interval changed
        const hasCachedData = lastGoodCandlesRef.current.length > 0;
        const intervalChanged = cachedIntervalRef.current !== requestedInterval;
        const timeframeChanged = cachedTimeframeRef.current !== requestedTimeframe;
        const needsFetch = !hasCachedData || intervalChanged || timeframeChanged;

        console.log('[AdvancedOHLCChart] ========== getBars #' + currentFetchCount + ' ==========');
          console.log('[AdvancedOHLCChart] Cache check:', {
            hasCachedData,
            cachedInterval: cachedIntervalRef.current,
            cachedTimeframe: cachedTimeframeRef.current,
            requestedInterval,
            requestedTimeframe,
            intervalChanged,
            timeframeChanged,
            needsFetch,
            cachedDataLength: lastGoodCandlesRef.current.length,
            currentDisplayMode: displayModeRef.current,
          });
        const now = Date.now();
        
        // Safely format periodParams dates with validation
        let periodParamsFormatted = null;
        if (periodParams && typeof periodParams.from === 'number' && typeof periodParams.to === 'number' && 
            isFinite(periodParams.from) && isFinite(periodParams.to) && periodParams.from > 0 && periodParams.to > 0) {
          try {
            periodParamsFormatted = {
              from: periodParams.from,
              to: periodParams.to,
              fromDate: new Date(periodParams.from * 1000).toISOString(),
              toDate: new Date(periodParams.to * 1000).toISOString(),
            };
          } catch (e) {
            periodParamsFormatted = {
              from: periodParams.from,
              to: periodParams.to,
              fromDate: 'invalid',
              toDate: 'invalid',
            };
          }
        }
        
        console.log('[AdvancedOHLCChart] getBars params:', {
          resolution,
          requestedInterval,
          cachedInterval: cachedIntervalRef.current,
          hasCachedData,
          cachedDataLength: lastGoodCandlesRef.current.length,
          intervalChanged,
          needsFetch,
          currentTime: new Date(now).toISOString(),
          periodParams: periodParamsFormatted,
          cachedDataTimeRange: lastGoodCandlesRef.current.length > 0 ? {
            firstCandle: new Date(lastGoodCandlesRef.current[0].unix_time * 1000).toISOString(),
            lastCandle: new Date(lastGoodCandlesRef.current[lastGoodCandlesRef.current.length - 1].unix_time * 1000).toISOString(),
          } : null,
        });

        // If we have cached data and don't need to fetch, return immediately
        if (!needsFetch) {
          const items = lastGoodCandlesRef.current;
          console.log('[AdvancedOHLCChart] 📦 Using cached data (skipping HTTP):', items.length, 'candles');
          cachedTimeframeRef.current = requestedTimeframe;

          const MIN_PRICE = 0.0000001;
          const currentNetwork = latestParamsRef.current.network;
          const isMonad = currentNetwork === 'monad';
          const currentDisplayMode = displayModeRef.current; // Use ref which was updated from symbol if needed
          console.log('[AdvancedOHLCChart] 📊 getBars using cached data with mode:', currentDisplayMode, 'isMonad:', isMonad, 'items count:', items.length);
          const allBars = items.map(item => {
            const hasZeroValues = item.o === 0 && item.h === 0 && item.l === 0 && item.c === 0;
            const baseBar = {
              time: item.unix_time * 1000,
              open: hasZeroValues ? MIN_PRICE : item.o,
              high: hasZeroValues ? MIN_PRICE : item.h,
              low: hasZeroValues ? MIN_PRICE : item.l,
              close: hasZeroValues ? MIN_PRICE : item.c,
              volume: item.v_usd || 0,
            };
            return transformBar(baseBar, currentDisplayMode, isMonad);
          }).filter(bar => bar.time > 0 && isFinite(bar.time));
          allBars.sort((a, b) => a.time - b.time);

          // For Monad: Ensure candles connect properly by making close of one = open of next
          if (isMonad && allBars.length > 1) {
            for (let i = 0; i < allBars.length - 1; i++) {
              const currentBar = allBars[i];
              const nextBar = allBars[i + 1];
              
              if (nextBar.open !== currentBar.close) {
                const previousOpen = nextBar.open;
                nextBar.open = currentBar.close;
                
                if (nextBar.high === previousOpen && nextBar.low === previousOpen && nextBar.close === previousOpen) {
                  nextBar.high = currentBar.close;
                  nextBar.low = currentBar.close;
                  nextBar.close = currentBar.close;
                } else {
                  if (nextBar.high < nextBar.open) nextBar.high = nextBar.open;
                  if (nextBar.low > nextBar.open) nextBar.low = nextBar.open;
                }
              }
            }
          }

          console.log('[AdvancedOHLCChart] 📦 Converted to TradingView format:', allBars.length, 'bars');
          if (allBars.length > 0) {
            console.log('[AdvancedOHLCChart] 📦 First bar:', JSON.stringify(allBars[0]));
            console.log('[AdvancedOHLCChart] 📦 Last bar:', JSON.stringify(allBars[allBars.length - 1]));
          }

          // CRITICAL: Check if cached data is within requested time range
          // to prevent infinite loop of TradingView requesting older data
          const fromMs = (periodParams.from ?? 0) * 1000;
          const toMs = (periodParams.to ?? 0) * 1000;
          
          if (allBars.length > 0 && fromMs && toMs) {
            const oldestDataTime = allBars[0].time;
            const newestDataTime = allBars[allBars.length - 1].time;
            
            console.log('[AdvancedOHLCChart] 📦 Cached data time range check:', {
              requestedFrom: new Date(fromMs).toISOString(),
              requestedTo: new Date(toMs).toISOString(),
              dataFrom: new Date(oldestDataTime).toISOString(),
              dataTo: new Date(newestDataTime).toISOString(),
              isFirstRequest: periodParams.firstDataRequest,
            });
            
            // If ALL cached data is AFTER the requested range (future relative to request)
            if (oldestDataTime > toMs) {
              if (!periodParams.firstDataRequest) {
                // Not first request - stop backward pagination (use noData: false to avoid ghost)
                console.log('[AdvancedOHLCChart] 📦 Cached data is in future, stopping backward pagination (noData: false)');
                if (typeof onHistoryCallback === 'function') {
                  onHistoryCallback([], { noData: false });
                }
                return;
              }
              // First request - return data and navigate chart
              console.log('[AdvancedOHLCChart] 📦 First request with future data - returning and will navigate');
            }
            // If ALL cached data is BEFORE the requested range
            else if (newestDataTime < fromMs && !periodParams.firstDataRequest) {
              // Use noData: false to avoid ghost - data exists, just not in this window
              console.log('[AdvancedOHLCChart] 📦 Cached data is before range, noData: false');
              if (typeof onHistoryCallback === 'function') {
                onHistoryCallback([], { noData: false });
              }
              return;
            }
          }

          if (allBars.length > 0 && typeof onHistoryCallback === 'function') {
            console.log('[AdvancedOHLCChart] ✅ Calling onHistoryCallback with', allBars.length, 'bars (noData: false)');
            onHistoryCallback(allBars, { noData: false });
            
            // Right-align chart after first data load from cache
            if (periodParams.firstDataRequest && allBars.length > 0) {
              setTimeout(() => {
                rightAlignChart(allBars.length);
              }, 300);
            }
          } else if (typeof onHistoryCallback === 'function') {
            console.log('[AdvancedOHLCChart] ⚠️ No bars to return');
            
            // For Monad: Return a placeholder candle at 0 on initial load
            if (isMonad && periodParams.firstDataRequest) {
              const now = Math.floor(Date.now() / 1000); // Current time in seconds
              const placeholderCandle = {
                time: now * 1000, // Convert to milliseconds
                open: 0,
                high: 0,
                low: 0,
                close: 0,
                volume: 0,
              };
              console.log('[AdvancedOHLCChart] 📊 Returning placeholder candle at 0 for Monad (cached empty):', placeholderCandle);
              onHistoryCallback([placeholderCandle], { noData: false });
            } else {
              onHistoryCallback([], { noData: true });
            }
          }
          return;
        }

        // If there's already a request in-flight for this interval, wait for it
        const inFlightKey = `${requestedInterval}|${requestedTimeframe}`;
        if (getBarsInFlightRef.current && getBarsInFlightKeyRef.current === inFlightKey) {
          console.log('[AdvancedOHLCChart] ⏳ Waiting for in-flight request...');
          try {
            await getBarsInFlightRef.current;
            // After waiting, use cached data
            const items = lastGoodCandlesRef.current;
            if (items.length > 0) {
              const MIN_PRICE = 0.0000001;
              const currentNetwork = latestParamsRef.current.network;
              const isMonad = currentNetwork === 'monad';
              const currentDisplayMode = displayModeRef.current; // Use ref for fast access
              const allBars = items.map(item => {
                const hasZeroValues = item.o === 0 && item.h === 0 && item.l === 0 && item.c === 0;
                const baseBar = {
                  time: item.unix_time * 1000,
                  open: hasZeroValues ? MIN_PRICE : item.o,
                  high: hasZeroValues ? MIN_PRICE : item.h,
                  low: hasZeroValues ? MIN_PRICE : item.l,
                  close: hasZeroValues ? MIN_PRICE : item.c,
                  volume: item.v_usd || 0,
                };
                return transformBar(baseBar, currentDisplayMode, isMonad);
              }).filter(bar => bar.time > 0 && isFinite(bar.time));
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
        getBarsInFlightKeyRef.current = inFlightKey;
        getBarsInFlightRef.current = new Promise((resolve, reject) => {
          resolveInFlight = resolve;
          rejectInFlight = reject;
        });

        try {
          let items: BackendOHLCData[];

          console.log('[AdvancedOHLCChart] 🌐 Making HTTP request (fetch #' + currentFetchCount + ')');

          const url = buildUrl(requestedInterval, requestedTimeframe);
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
            cachedTimeframeRef.current = requestedTimeframe;
            setCandles(items);
            updateChartMetrics();
            onDataUpdate?.(items);
            console.log('[AdvancedOHLCChart] ✅ Cache updated with', items.length, 'candles');
          }

          // Signal that request is complete
          resolveInFlight!();
          getBarsInFlightRef.current = null;
          getBarsInFlightKeyRef.current = null;
          getBarsInFlightKeyRef.current = null;
          
          // Get current network for Monad-specific logic
          const currentNetwork = latestParamsRef.current.network;
          const isMonad = currentNetwork === 'monad';
          
          // Handle empty data case
          if (items.length === 0) {
            console.log('[AdvancedOHLCChart] No data available');
            
            // Check if we have cached data before returning noData
            const hasAnyCandles = lastGoodCandlesRef.current && lastGoodCandlesRef.current.length > 0;
            if (hasAnyCandles) {
              console.log('[AdvancedOHLCChart] ⚠️ Items empty but have cached candles, using cache');
              const MIN_PRICE = 0.0000001;
              const currentDisplayMode = displayModeRef.current; // Use ref for fast access
              const cachedBars = lastGoodCandlesRef.current.map(item => {
                const hasZeroValues = item.o === 0 && item.h === 0 && item.l === 0 && item.c === 0;
                const baseBar = {
                  time: item.unix_time * 1000,
                  open: hasZeroValues ? MIN_PRICE : item.o,
                  high: hasZeroValues ? MIN_PRICE : item.h,
                  low: hasZeroValues ? MIN_PRICE : item.l,
                  close: hasZeroValues ? MIN_PRICE : item.c,
                  volume: item.v_usd || 0,
                };
                return transformBar(baseBar, currentDisplayMode, isMonad);
              }).filter(bar => bar.time > 0 && isFinite(bar.time));
              cachedBars.sort((a, b) => a.time - b.time);
              
              if (typeof onHistoryCallback === 'function') {
                onHistoryCallback(cachedBars, { noData: false });
              }
              return;
            }
            
            // For Monad: Return a placeholder candle at 0 on initial load
            if (isMonad && periodParams.firstDataRequest) {
              const now = Math.floor(Date.now() / 1000); // Current time in seconds
              const placeholderCandle = {
                time: now * 1000, // Convert to milliseconds
                open: 0,
                high: 0,
                low: 0,
                close: 0,
                volume: 0,
              };
              console.log('[AdvancedOHLCChart] 📊 Returning placeholder candle at 0 for Monad:', placeholderCandle);
              if (typeof onHistoryCallback === 'function') {
                onHistoryCallback([placeholderCandle], { noData: false });
              }
              return;
            }
            
            if (typeof onHistoryCallback === 'function') {
              onHistoryCallback([], { noData: true });
            }
            return;
          }

          // Convert to TradingView format - IMPORTANT: time must be in MILLISECONDS!
          // Our backend returns unix_time in seconds, so we need to convert to milliseconds
          const MIN_PRICE = 0.0000001; // Minimum price for display (0 values are invisible in TradingView)
          const currentDisplayMode = displayModeRef.current; // Use ref for fast access
          
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
            
            // Handle 0-value candles: if all OHLC values are 0, set a small minimum
            // This ensures TradingView renders them (otherwise they may be invisible)
            const hasZeroValues = item.o === 0 && item.h === 0 && item.l === 0 && item.c === 0;
            
            const baseBar = {
              time: timeMs,
              open: hasZeroValues ? MIN_PRICE : item.o,
              high: hasZeroValues ? MIN_PRICE : item.h,
              low: hasZeroValues ? MIN_PRICE : item.l,
              close: hasZeroValues ? MIN_PRICE : item.c,
              volume: item.v_usd || 0,
            };
            
            const bar = transformBar(baseBar, currentDisplayMode, isMonad);
            
            if (hasZeroValues) {
              console.log('[AdvancedOHLCChart] 📊 Converted zero-value candle to min price:', bar);
            }
            
            return bar;
          }).filter((bar): bar is { time: number; open: number; high: number; low: number; close: number; volume: number } => {
            if (!bar) return false;
            // Basic validation - ensure time is valid
            return bar.time > 0 && isFinite(bar.time) && isFinite(bar.open) && isFinite(bar.high) && isFinite(bar.low) && isFinite(bar.close);
          });

          // Sort by time (ascending - oldest first)
          allBars.sort((a, b) => a.time - b.time);

          // For Monad: Ensure candles connect properly by making close of one = open of next
          // This creates visual continuity even when candles are flat (o=h=l=c)
          if (isMonad && allBars.length > 1) {
            for (let i = 0; i < allBars.length - 1; i++) {
              const currentBar = allBars[i];
              const nextBar = allBars[i + 1];
              
              // Ensure continuity: next candle's open should equal current candle's close
              // This creates a connected line even when candles are flat
              if (nextBar.open !== currentBar.close) {
                const previousOpen = nextBar.open;
                nextBar.open = currentBar.close;
                
                // If the next candle was flat (o=h=l=c), update all values to maintain the flat appearance
                // but ensure it connects to the previous candle
                if (nextBar.high === previousOpen && nextBar.low === previousOpen && nextBar.close === previousOpen) {
                  // It was a flat candle - keep it flat but at the new price
                  nextBar.high = currentBar.close;
                  nextBar.low = currentBar.close;
                  nextBar.close = currentBar.close;
                } else {
                  // It had variation - only adjust open, keep high/low/close as they were
                  // But ensure high/low still make sense
                  if (nextBar.high < nextBar.open) nextBar.high = nextBar.open;
                  if (nextBar.low > nextBar.open) nextBar.low = nextBar.open;
                }
                
                console.log('[AdvancedOHLCChart] 🔗 Connected candle', i + 1, 'to previous:', {
                  previousClose: currentBar.close,
                  newOpen: nextBar.open,
                  wasFlat: previousOpen === nextBar.high && previousOpen === nextBar.low && previousOpen === nextBar.close,
                });
              }
            }
          }

          // CRITICAL FIX: For Monad first request, ignore from/to and return all candles
          // This ensures TradingView always sees data on initial load
          const isFirst = !!periodParams.firstDataRequest;
          if (isMonad && isFirst) {
            console.log('[AdvancedOHLCChart] 📊 Monad first request - ignoring time range, returning all', allBars.length, 'bars');
            if (allBars.length === 0) {
              // If somehow empty, create placeholder instead of noData:true
              const now = Math.floor(Date.now() / 1000);
              const placeholderCandle = {
                time: now * 1000,
                open: 0,
                high: 0,
                low: 0,
                close: 0,
                volume: 0,
              };
              allBars.push(placeholderCandle);
              console.log('[AdvancedOHLCChart] 📊 Created placeholder candle for Monad first request');
            }
            if (typeof onHistoryCallback === 'function') {
              onHistoryCallback(allBars, { noData: false });
            }
            rightAlignChart(allBars.length);
            return;
          }

          // Filter bars to requested time range (for non-first requests or non-Monad)
          const fromMs = (periodParams.from ?? 0) * 1000;
          const toMs = (periodParams.to ?? 0) * 1000;
          let bars = allBars;

          console.log('[AdvancedOHLCChart] Time range check:', {
            requestedFrom: new Date(fromMs).toISOString(),
            requestedTo: new Date(toMs).toISOString(),
            dataFrom: allBars.length > 0 ? new Date(allBars[0].time).toISOString() : 'no data',
            dataTo: allBars.length > 0 ? new Date(allBars[allBars.length - 1].time).toISOString() : 'no data',
          });

          if (fromMs && toMs && allBars.length > 0) {
            const oldestDataTime = allBars[0].time;
            const newestDataTime = allBars[allBars.length - 1].time;
            
            // CRITICAL FIX: If ALL our data is AFTER the requested range (future data),
            // we need to handle this specially to prevent infinite loop
            if (oldestDataTime > toMs) {
              console.log('[AdvancedOHLCChart] ⚠️ All data is in the FUTURE relative to requested range');
              console.log('[AdvancedOHLCChart] ⚠️ Oldest data:', new Date(oldestDataTime).toISOString(), '> requested to:', new Date(toMs).toISOString());
              
              // If this is NOT the first data load (firstDataRequest), return noData: false to stop pagination
              // Use noData: false to avoid ghost - data exists, just not in this window
              if (!periodParams.firstDataRequest) {
                console.log('[AdvancedOHLCChart] ✋ Returning noData=false to stop backward pagination');
                if (typeof onHistoryCallback === 'function') {
                  onHistoryCallback([], { noData: false });
                }
                return;
              }
              
              // For the first request, return the future data so it can be displayed
              console.log('[AdvancedOHLCChart] 📊 First request - returning future data and will navigate chart');
              bars = allBars;
            } else {
              // Normal case: filter to requested range
              const filteredBars = allBars.filter(b => b.time >= fromMs && b.time <= toMs);
              if (filteredBars.length > 0) {
                bars = filteredBars;
                console.log('[AdvancedOHLCChart] Filtered to', bars.length, 'bars within requested range');
              } else if (newestDataTime < fromMs) {
                // All our data is BEFORE the requested range - use noData: false to avoid ghost
                console.log('[AdvancedOHLCChart] ✋ All data is before requested range, noData=false');
                if (typeof onHistoryCallback === 'function') {
                  onHistoryCallback([], { noData: false });
                }
                return;
              } else {
                console.log('[AdvancedOHLCChart] ⚠️ No bars in requested range, returning ALL', allBars.length, 'bars');
                bars = allBars;
              }
            }
          }

          // Return bars to TradingView
          if (bars.length === 0) {
            // Check if we have cached data before returning noData
            const hasAnyCandles = lastGoodCandlesRef.current && lastGoodCandlesRef.current.length > 0;
            if (hasAnyCandles) {
              console.log('[AdvancedOHLCChart] ⚠️ Bars empty after filtering but have cached candles, using cache');
              const MIN_PRICE = 0.0000001;
              const currentNetwork = latestParamsRef.current.network;
              const isMonad = currentNetwork === 'monad';
              const currentDisplayMode = displayModeRef.current; // Use ref for fast access
              const cachedBars = lastGoodCandlesRef.current.map(item => {
                const hasZeroValues = item.o === 0 && item.h === 0 && item.l === 0 && item.c === 0;
                const baseBar = {
                  time: item.unix_time * 1000,
                  open: hasZeroValues ? MIN_PRICE : item.o,
                  high: hasZeroValues ? MIN_PRICE : item.h,
                  low: hasZeroValues ? MIN_PRICE : item.l,
                  close: hasZeroValues ? MIN_PRICE : item.c,
                  volume: item.v_usd || 0,
                };
                return transformBar(baseBar, currentDisplayMode, isMonad);
              }).filter(bar => bar.time > 0 && isFinite(bar.time));
              cachedBars.sort((a, b) => a.time - b.time);
              
              if (typeof onHistoryCallback === 'function') {
                onHistoryCallback(cachedBars, { noData: false });
              }
              return;
            }
            
            // For Monad: Return a placeholder candle at 0 on initial load
            if (isMonad && periodParams.firstDataRequest) {
              const now = Math.floor(Date.now() / 1000); // Current time in seconds
              const placeholderCandle = {
                time: now * 1000, // Convert to milliseconds
                open: 0,
                high: 0,
                low: 0,
                close: 0,
                volume: 0,
              };
              console.log('[AdvancedOHLCChart] 📊 Returning placeholder candle at 0 for Monad (no bars after filtering):', placeholderCandle);
              if (typeof onHistoryCallback === 'function') {
                onHistoryCallback([placeholderCandle], { noData: false });
              }
              return;
            }
            
            if (typeof onHistoryCallback === 'function') {
              onHistoryCallback([], { noData: true });
            }
            return;
          }

          console.log('[AdvancedOHLCChart] ✅ Returning', bars.length, 'bars to TradingView');
          if (bars.length > 0) {
            console.log('[AdvancedOHLCChart] 📊 First bar being sent:', JSON.stringify(bars[0]));
            console.log('[AdvancedOHLCChart] 📊 Last bar being sent:', JSON.stringify(bars[bars.length - 1]));
          }

          // Return bars to TradingView
          if (typeof onHistoryCallback === 'function') {
            console.log('[AdvancedOHLCChart] ✅ Calling onHistoryCallback with noData: false');
            onHistoryCallback(bars, { noData: false });
            
            // Right-align chart after first data load for all networks
            if (periodParams.firstDataRequest && bars.length > 0) {
              setTimeout(() => {
                rightAlignChart(bars.length);
                
                // For Monad: Ensure thin candles
                if (isMonad && widgetRef.current) {
                  widgetRef.current.onChartReady(() => {
                    try {
                      const chart = widgetRef.current?.chart?.();
                      if (chart) {
                        chart.applyOptions({
                          timeScale: {
                            barSpacing: 2, // Thin candles
                            minBarSpacing: 1,
                          },
                        });
                        console.log('[AdvancedOHLCChart] 📊 Monad chart configured with thin candles');
                      }
                    } catch (navErr) {
                      console.log('[AdvancedOHLCChart] Chart configuration error:', navErr);
                    }
                  });
                }
              }, 300);
            }
          }
        } catch (error: any) {
          console.error('[AdvancedOHLCChart] Error fetching bars:', error);

          // Signal that request failed
          rejectInFlight?.(error);
          getBarsInFlightRef.current = null;

          // Try to use cached data as fallback
          if (lastGoodCandlesRef.current.length > 0) {
            console.log('[AdvancedOHLCChart] Using cached data due to error');
            const MIN_PRICE = 0.0000001;
            const currentNetwork = latestParamsRef.current.network;
            const isMonad = currentNetwork === 'monad';
            const currentDisplayMode = displayModeRef.current; // Use ref for fast access
            const allBars = lastGoodCandlesRef.current.map(item => {
              const hasZeroValues = item.o === 0 && item.h === 0 && item.l === 0 && item.c === 0;
              const baseBar = {
                time: item.unix_time * 1000, // Convert to milliseconds
                open: hasZeroValues ? MIN_PRICE : item.o,
                high: hasZeroValues ? MIN_PRICE : item.h,
                low: hasZeroValues ? MIN_PRICE : item.l,
                close: hasZeroValues ? MIN_PRICE : item.c,
                volume: item.v_usd || 0,
              };
              return transformBar(baseBar, currentDisplayMode, isMonad);
            }).filter(bar => bar.time > 0); // Filter out invalid bars
            allBars.sort((a, b) => a.time - b.time);
            
            // For Monad: Ensure candles connect properly in error fallback
            if (isMonad && allBars.length > 1) {
              for (let i = 0; i < allBars.length - 1; i++) {
                const currentBar = allBars[i];
                const nextBar = allBars[i + 1];
                
                if (nextBar.open !== currentBar.close) {
                  const previousOpen = nextBar.open;
                  nextBar.open = currentBar.close;
                  
                  if (nextBar.high === previousOpen && nextBar.low === previousOpen && nextBar.close === previousOpen) {
                    nextBar.high = currentBar.close;
                    nextBar.low = currentBar.close;
                    nextBar.close = currentBar.close;
                  } else {
                    if (nextBar.high < nextBar.open) nextBar.high = nextBar.open;
                    if (nextBar.low > nextBar.open) nextBar.low = nextBar.open;
                  }
                }
              }
            }
            
            // Don't filter cached data by time range in error case - just return what we have
            // This ensures data is shown even if timestamps are outside expected range
            const bars = allBars;
            
            if (bars.length === 0) {
              console.log('[AdvancedOHLCChart] Cached data is empty');
              
              // For Monad: Return a placeholder candle at 0 on initial load
              if (isMonad && periodParams?.firstDataRequest) {
                const now = Math.floor(Date.now() / 1000); // Current time in seconds
                const placeholderCandle = {
                  time: now * 1000, // Convert to milliseconds
                  open: 0,
                  high: 0,
                  low: 0,
                  close: 0,
                  volume: 0,
                };
                console.log('[AdvancedOHLCChart] 📊 Returning placeholder candle at 0 for Monad (error case, empty cache):', placeholderCandle);
                if (typeof onHistoryCallback === 'function') {
                  onHistoryCallback([placeholderCandle], { noData: false });
                }
                return;
              }
              
              if (typeof onHistoryCallback === 'function') {
                onHistoryCallback([], { noData: true });
              }
              return;
            }
            console.log('[AdvancedOHLCChart] Using', bars.length, 'bars from cache (unfiltered)');
            
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
          hasExistingWs: !!wsRef.current,
        });

        // Only handle WebSocket for Monad network
        if (currentNetwork !== 'monad' || !tokenAddress) {
          console.log('[AdvancedOHLCChart] subscribeBars skipped - not Monad or no token, network:', currentNetwork, 'tokenAddress:', tokenAddress);
          return;
        }

        // Store callback for use in WebSocket message handler (from useEffect)
        // The useEffect WebSocket will use this callback for real-time updates
        subscribedCallbackRef.current = onRealtimeCallback;
        console.log('[AdvancedOHLCChart] ✅ subscribeBars registered callback for real-time updates', {
          hasWebSocket: !!wsRef.current,
          wsState: wsRef.current ? wsRef.current.readyState : 'none',
          wsStateName: wsRef.current ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][wsRef.current.readyState] : 'none',
        });

        // If we already have an active WebSocket from useEffect, ensure callback is set and return
        // The useEffect WebSocket will handle both initial data and real-time updates
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          console.log('[AdvancedOHLCChart] 📡 Reusing existing WebSocket connection from useEffect - callback is now set for real-time updates');
          // Callback is already set above, so future WebSocket messages will work
          // The WebSocket in useEffect will now be able to send updates via this callback
          return;
        }

        // If WebSocket is connecting, set up a listener to ensure callback works when it opens
        if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
          console.log('[AdvancedOHLCChart] 📡 WebSocket is connecting, callback set - will use when ready');
          // Set up a one-time listener to confirm callback is ready when WebSocket opens
          const checkConnection = () => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              console.log('[AdvancedOHLCChart] ✅ WebSocket opened - callback is ready for real-time updates');
            } else if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
              // Still connecting, check again in a bit
              setTimeout(checkConnection, 100);
            }
          };
          setTimeout(checkConnection, 100);
          return;
        }

        // No active WebSocket, create one (fallback if useEffect didn't connect)
        const requestedInterval = RESOLUTION_TO_INTERVAL[resolution] || '1s';
        const wsBaseUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL || 'http://localhost:8081';
        // Convert http/https to ws/wss for WebSocket
        const wsProtocol = wsBaseUrl.startsWith('https') ? 'wss' : 'ws';
        const wsHost = wsBaseUrl.replace(/^https?:\/\//, '');
        const wsUrl = `${wsProtocol}://${wsHost}/v1/ohlc/stream?token_address=${tokenAddress}&interval=${requestedInterval}`;

        console.log('[AdvancedOHLCChart] 🔌 Creating new WebSocket in subscribeBars:', wsUrl);

        try {
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onopen = () => {
            console.log('[AdvancedOHLCChart] ✅ subscribeBars WebSocket connected');
          };

          ws.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data);

              // Handle real-time candle updates (history is handled by useEffect)
              if (message.type !== 'ohlc_candle') {
                return;
              }

              const ohlcData = message.data;

              // Convert to TradingView bar format
              let bar = {
                time: (ohlcData.time || 0) * 1000,
                open: ohlcData.o,
                high: ohlcData.h,
                low: ohlcData.l,
                close: ohlcData.c,
                volume: ohlcData.v || 0,
              };

              // For Monad: Ensure new candle connects to previous candle
              if (currentNetwork === 'monad') {
                const cachedData = lastGoodCandlesRef.current;
                if (cachedData.length > 0) {
                  const sortedCache = [...cachedData].sort((a, b) => a.unix_time - b.unix_time);
                  const previousCandle = sortedCache[sortedCache.length - 1];
                  
                  if (bar.time / 1000 > previousCandle.unix_time) {
                    const previousClose = previousCandle.c;
                    
                    if (bar.open !== previousClose) {
                      const wasFlat = bar.open === bar.high && bar.open === bar.low && bar.open === bar.close;
                      bar.open = previousClose;
                      
                      if (wasFlat) {
                        bar.high = previousClose;
                        bar.low = previousClose;
                        bar.close = previousClose;
                      } else {
                        if (bar.high < bar.open) bar.high = bar.open;
                        if (bar.low > bar.open) bar.low = bar.open;
                      }
                    }
                  }
                }
              }

              // Update the chart via callback
              if (subscribedCallbackRef.current && bar.time > 0) {
                subscribedCallbackRef.current(bar);
              }
            } catch (e) {
              console.error('[AdvancedOHLCChart] subscribeBars WebSocket message error:', e);
            }
          };

          ws.onerror = (error) => {
            console.error('[AdvancedOHLCChart] subscribeBars WebSocket error:', error);
          };

          ws.onclose = () => {
            console.log('[AdvancedOHLCChart] subscribeBars WebSocket closed');
            wsRef.current = null;
          };
        } catch (e) {
          console.error('[AdvancedOHLCChart] Failed to create WebSocket in subscribeBars:', e);
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
            
            // Robust buy/sell detection - handles multiple trade data formats
            // Normalized strings for side/type/eventDisplayType (check nested fields too)
            const rawSide = String(
              trade.side ||
              trade.type ||
              trade.eventDisplayType ||
              trade.data?.side ||
              trade.originalEvent?.data?.side ||
              ''
            ).toLowerCase();

            let isBuy: boolean;

            // 1) Strongest signal: boolean or numeric is_buy
            if (trade.is_buy === true || trade.is_buy === 1 || trade.is_buy === '1') {
              isBuy = true;
            } else if (trade.is_buy === false || trade.is_buy === 0 || trade.is_buy === '0') {
              isBuy = false;
            }
            // 2) Side / type / eventDisplayType hints (normalized, case-insensitive)
            else if (rawSide.includes('buy') || rawSide === 'bid' || rawSide === 'buy_order') {
              isBuy = true;
            } else if (rawSide.includes('sell') || rawSide === 'ask' || rawSide === 'sell_order') {
              isBuy = false;
            }
            // 3) Fallback: treat as buy if eventDisplayType looks like a dev buy
            else if (String(trade.eventDisplayType || '').toLowerCase().includes('buy')) {
              isBuy = true;
            } else if (String(trade.eventDisplayType || '').toLowerCase().includes('sell')) {
              isBuy = false;
            }
            // 4) Last resort: default to *buy* instead of sell, so DBs don't accidentally show red
            else {
              isBuy = true;
            }
            
            // CRITICAL: getMarks does NOT support hex colors - only named colors!
            // Use simple named colors: "green" for buys, "red" for sells
            // getTimescaleMarks supports hex, but getMarks does not
            const currentNetwork = latestParamsRef.current.network;
            
            console.log('[AdvancedOHLCChart] Color assignment (getMarks - using named colors):', {
              isBuy,
              is_buy: trade.is_buy,
              side: trade.side,
              type: trade.type,
              eventDisplayType: trade.eventDisplayType,
              willUseColor: isBuy ? 'green' : 'red',
              currentNetwork,
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

            // CRITICAL: getMarks only supports named colors, NOT hex colors!
            // Use simple named colors: "green" for buys, "red" for sells
            const label = isBuy ? 'DB' : 'DS';
            
            // Use named colors - getMarks does NOT support hex (#86d99f, #941839, etc.)
            // Named colors that work: "red", "green", "blue", "yellow", "orange", etc.
            const markColor = isBuy ? 'green' : 'red';
            
            // getMarks structure - use named colors (NOT hex like timescale marks)
            // CRITICAL: getMarks does NOT support hex colors, only named colors like "green", "red"
            const markData: any = {
              id: `dev_trade_${timeSeconds}_${Math.random()}`,
              time: timeSeconds,
              color: markColor, // Named color: "green" or "red" (getMarks doesn't support hex)
              label: label,
              position: 'inBar',
              text: markerText,
              labelFontColor: 'white',
              minSize: 24,
              size: 1,
              shape: 'circle',
            };
            
            // markColor is already set to "green" or "red" (named colors)
            // No override needed - getMarks only supports named colors, not hex
            
            // DEBUG: Log the exact color being sent to TradingView
            console.log('[AdvancedOHLCChart] Mark color assignment (getMarks - named colors):', {
              isBuy,
              label,
              markColor: markData.color,
              note: 'getMarks only supports named colors (green/red), not hex values',
            });
            
            console.log('[AdvancedOHLCChart] Creating mark:', {
              isBuy,
              is_buy: trade.is_buy,
              side: trade.side,
              type: trade.type,
              eventDisplayType: trade.eventDisplayType,
              label: isBuy ? 'DB' : 'DS',
              expectedText: `${isBuy ? 'Dev Buy' : 'Dev Sell'} @ ${formattedDate}`,
              markColor: markData.color,
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
          // Use Monad colors for timescale marks
          const monadGreenHex = '#86d99f';  // Monad green for dev buys
          const monadRedHex = '#941839';    // Monad red for dev sells
          const currentNetwork = latestParamsRef.current.network;
          const timescaleMarks = devTrades.map((trade: any) => {
            const timestamp = trade.timestamp || trade.created_at || trade.unix_time;
            const timeSeconds = timestamp < 10000000000 ? timestamp : Math.floor(timestamp / 1000);
            // Use same robust buy detection logic as getMarks
            // Normalized strings for side/type/eventDisplayType (check nested fields too)
            const rawSide = String(
              trade.side ||
              trade.type ||
              trade.eventDisplayType ||
              trade.data?.side ||
              trade.originalEvent?.data?.side ||
              ''
            ).toLowerCase();

            let isBuy: boolean;

            // 1) Strongest signal: boolean or numeric is_buy
            if (trade.is_buy === true || trade.is_buy === 1 || trade.is_buy === '1') {
              isBuy = true;
            } else if (trade.is_buy === false || trade.is_buy === 0 || trade.is_buy === '0') {
              isBuy = false;
            }
            // 2) Side / type / eventDisplayType hints (normalized, case-insensitive)
            else if (rawSide.includes('buy') || rawSide === 'bid' || rawSide === 'buy_order') {
              isBuy = true;
            } else if (rawSide.includes('sell') || rawSide === 'ask' || rawSide === 'sell_order') {
              isBuy = false;
            }
            // 3) Fallback: treat as buy if eventDisplayType looks like a dev buy
            else if (String(trade.eventDisplayType || '').toLowerCase().includes('buy')) {
              isBuy = true;
            } else if (String(trade.eventDisplayType || '').toLowerCase().includes('sell')) {
              isBuy = false;
            }
            // 4) Last resort: default to *buy* instead of sell, so DBs don't accidentally show red
            else {
              isBuy = true;
            }
            const {
              formattedAmount,
              formattedPrice,
              formattedTotalUsd,
              displaySymbol,
            } = computeTradeDisplayValues(trade);

            // Timescale marks color assignment - DB = green, DS = red
            // For Monad: DB = #86d99f (green), DS = #941839 (red)
            // For other networks: DB = #22c55e (green), DS = #ef4444 (red)
            const markColor = (currentNetwork === 'monad' 
              ? (isBuy ? monadGreenHex : monadRedHex)  // Monad: green for buys, red for sells
              : (isBuy ? '#22c55e' : '#ef4444')); // Standard: green for buys, red for sells

            return {
              id: `dev_timescale_${timeSeconds}_${Math.random()}`,
              time: timeSeconds,
              color: markColor.toLowerCase(), // Ensure lowercase for TradingView
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
  }, [buildUrl, onDataUpdate, network]); // Include network so datafeed updates when network changes

  const syncWidgetWithParams = useCallback(() => {
    try {
      const widget = widgetRef.current;
      if (!widget) return;

      const params = latestParamsRef.current;
      const tokenId = params.mint || params.pairAddress;
      if (!tokenId) return;

      const nextResolution = INTERVAL_TO_RESOLUTION[params.interval];

      const applyUpdate = () => {
        try {
          const currentWidget = widgetRef.current;
          if (!currentWidget) return;
          const chart = currentWidget.chart?.();
          if (!chart) return;

          if (widgetTokenRef.current !== tokenId) {
            currentWidget.setSymbol?.(tokenId, nextResolution, () => {
              widgetTokenRef.current = tokenId;
              chart.resetData?.();
              requestPriceLineSync(50);
            });
            return;
          }

          chart.setResolution?.(nextResolution, () => {
            chart.resetData?.();
            requestPriceLineSync(50);
          });
        } catch (error) {
          // Silently ignore during widget initialization/cleanup
        }
      };

      try {
        const chart = widget.chart?.();
        if (chart) {
          applyUpdate();
          return;
        }
      } catch {
        // Chart not ready yet, will try onChartReady
      }

      // Widget might have been cleaned up, check before accessing
      if (widget && typeof widget.onChartReady === 'function') {
        widget.onChartReady(() => {
          applyUpdate();
        });
      }
    } catch {
      // Silently ignore all errors - widget may be in an inconsistent state during hot reload
    }
  }, []);

  // Note: Dev trade markers are now handled by TradingView's native marks system
  // via the getMarks() method in the datafeed. No manual marker creation needed.

  // Initialize TradingView widget
  // Track the token identifier to prevent recreation when pairAddress just refines
  const widgetTokenRef = useRef<string | null>(null);
  
  useEffect(() => {
    console.log('[AdvancedOHLCChart] Widget init useEffect check:', {
      libraryLoaded,
      hasContainer: !!containerRef.current,
      initialTokenId,
      isLoading,
      firstLoadRef: firstLoadRef.current,
    });
    
    if (!libraryLoaded || !containerRef.current || !initialTokenId) {
      console.log('[AdvancedOHLCChart] Widget init blocked - waiting for:', {
        needsLibrary: !libraryLoaded,
        needsContainer: !containerRef.current,
        needsTokenId: !initialTokenId,
      });
      return;
    }

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

        // For Monad, use the standard resolution mapping (our datafeed handles fetching 1m data)
        const isMonad = network === 'monad';
        const initialInterval = INTERVAL_TO_RESOLUTION[latestParamsRef.current.interval];
        console.log('[AdvancedOHLCChart] Creating TradingView widget with datafeed...', { 
          isMonad, 
          network,
          initialInterval,
          willEnableSeconds: isMonad,
        });
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
            ...(isMonad ? ['seconds_resolution'] : []), // ✅ Enable seconds resolution for Monad tokens
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
            'edit_buttons_in_legend',
            'context_menus',
            'display_market_status',
            'two_character_bar_marks_labels', // ✅ Enable two-character labels for marks
          ],
          charts_storage_url: 'https://saveload.tradingview.com',
          charts_storage_api_version: '1.1',
          client_id: 'tradingview.com',
          user_id: 'public_user_id',
          theme: 'dark', // Dark mode
          // Time frames shown in the bottom toolbar
          // For Monad: Show 1D, 7D, 30D, 180D as default timeframe options (all use 1s candles)
          // The resolution field keeps the candle interval the same (1S), only changes visible range
          time_frames: isMonad ? [
            { text: '1D', resolution: '1S', description: '1 Day', title: '1D' },
            { text: '7D', resolution: '1S', description: '7 Days', title: '7D' },
            { text: '30D', resolution: '1S', description: '30 Days', title: '30D' },
            { text: '180D', resolution: '1S', description: '180 Days', title: '180D' },
          ] : [
            { text: '1m', resolution: '1', description: '1 Minute', title: '1m' },
            { text: '5m', resolution: '5', description: '5 Minutes', title: '5m' },
            { text: '15m', resolution: '15', description: '15 Minutes', title: '15m' },
            { text: '1h', resolution: '60', description: '1 Hour', title: '1h' },
            { text: '4h', resolution: '240', description: '4 Hours', title: '4h' },
            { text: '1D', resolution: '1D', description: '1 Day', title: '1D' },
          ],
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
            'mainSeriesProperties.candleStyle.upColor': isMonad ? '#86d99f' : '#26a69a',
            'mainSeriesProperties.candleStyle.downColor': isMonad ? '#f26682' : '#ef5350',
            'mainSeriesProperties.candleStyle.borderUpColor': isMonad ? '#86d99f' : '#26a69a',
            'mainSeriesProperties.candleStyle.borderDownColor': isMonad ? '#f26682' : '#ef5350',
            'mainSeriesProperties.candleStyle.wickUpColor': isMonad ? '#86d99f' : '#26a69a',
            'mainSeriesProperties.candleStyle.wickDownColor': isMonad ? '#f26682' : '#ef5350',
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
            // Thin candles like Solana chart (barSpacing controls candle width)
            'paneProperties.vertGridProperties.style': 0,
            'paneProperties.horzGridProperties.style': 0,
            'scalesProperties.showLeftScale': true,
            'scalesProperties.showRightScale': true,
          },
          studies_overrides: {
            // Volume bar colors - 0 = up candles (green), 1 = down candles (red)
            'volume.volume.color.0': isMonad ? '#86d99f' : '#26a69a', // Green bars for up candles (matches candle upColor)
            'volume.volume.color.1': isMonad ? '#f26682' : '#ef5350', // Red bars for down candles (matches candle downColor)
            // Volume text/label colors - these control the text color above volume bars
            'volume.volume.colorup': isMonad ? '#86d99f' : '#26a69a', // Green text for up candles
            'volume.volume.colordown': isMonad ? '#f26682' : '#ef5350', // Red text for down candles
            // Alternative property names that some TradingView versions use
            'volume.volume.plot.color.0': isMonad ? '#86d99f' : '#26a69a',
            'volume.volume.plot.color.1': isMonad ? '#f26682' : '#ef5350',
          },
          // Custom price formatter for MC mode (K/M/B suffixes)
          custom_formatters: {
            priceFormatterFactory: (symbolInfo: any, minTick: any) => {
              if (symbolInfo === null) {
                return null;
              }
              
              // Only apply custom formatting in MC mode for Monad
              const currentMode = displayModeRef.current;
              const currentNetwork = latestParamsRef.current.network;
              if (currentMode === 'MC' && currentNetwork === 'monad') {
                return {
                  format: (price: number, signPositive?: boolean) => {
                    // Format MC values with K/M/B suffixes
                    if (price >= 1_000_000_000) {
                      return `${(price / 1_000_000_000).toFixed(2)}B`;
                    }
                    if (price >= 1_000_000) {
                      return `${(price / 1_000_000).toFixed(2)}M`;
                    }
                    if (price >= 1_000) {
                      return `${(price / 1_000).toFixed(2)}K`;
                    }
                    return price.toFixed(2);
                  },
                };
              }
              return null; // Use default formatter for USD mode
            },
          },
          // ✅ Don't pass width/height when using autosize
        });

        widgetRef.current = widget;
        widgetTokenRef.current = initialTokenId;
        // Clear any stale shape refs from previous widget instance
        priceLineShapesRef.current = {};
        lastPriceLinesRef.current = {};
        setIsLoading(false);
        firstLoadRef.current = false; // Ensure loading overlay is dismissed
        setError(null);

        console.log('[AdvancedOHLCChart] ✅ TradingView widget initialized - loading overlay should be dismissed now');

        // Add USD/MC toggle button for Monad chain
        if (isMonad) {
          widget.headerReady().then(() => {
            const button = widget.createButton();
            const updateButtonText = (mode: 'USD' | 'MC') => {
              button.innerHTML = mode === 'MC' 
                ? '<span style="color: #86d99f;">MC</span>/USD'
                : 'MC/<span style="color: #86d99f;">USD</span>';
            };
            updateButtonText(displayMode);
            button.style.cursor = 'pointer';
            button.style.padding = '4px 8px';
            button.style.marginLeft = '8px';
            usdMcButtonRef.current = button;
            
            button.addEventListener('click', () => {
              setDisplayMode((prevMode) => {
                const newMode = prevMode === 'MC' ? 'USD' : 'MC';
                // ✅ CRITICAL: Update ref IMMEDIATELY and SYNCHRONOUSLY before useEffect runs
                displayModeRef.current = newMode;
                console.log('[AdvancedOHLCChart] 🎯 Button clicked - displayMode changed to:', newMode, 'ref updated to:', displayModeRef.current);
                if (usdMcButtonRef.current) {
                  updateButtonText(newMode);
                }
                return newMode;
              });
              // The useEffect will handle calling resetData() to refresh the chart
            });
          });
        }

      // Force widget to load data after it's ready
      widget.onChartReady(() => {
        console.log('[AdvancedOHLCChart] Chart is ready, setting chart type to candlesticks...');
        
        try {
          const chart = widget.chart();
          if (chart) {
              // Explicitly set chart type to candlesticks
              chart.setChartType(1); // 1 = Candles, 2 = Hollow Candles, 3 = Bars, etc.
              console.log('[AdvancedOHLCChart] Chart type set to candlesticks');
              
              // For Monad: Set thin candles configuration (right-alignment happens after data loads)
              if (network === 'monad') {
                try {
                  // Set thin candles (small barSpacing = thin candles)
                  chart.applyOptions({
                    timeScale: {
                      barSpacing: 2, // Thin candles (lower = thinner, like Solana)
                      minBarSpacing: 1,
                      rightOffset: 12,
                    },
                  });
                  
                  console.log('[AdvancedOHLCChart] Monad chart configured with thin candles (right-alignment will happen after data loads)');
                } catch (e) {
                  console.log('[AdvancedOHLCChart] Could not configure Monad chart styling:', e);
                }
              }
              
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
                      'volume.volume.color.0': isMonad ? '#86d99f' : '#26a69a', // Green for up candles
                      'volume.volume.color.1': isMonad ? '#f26682' : '#ef5350', // Red for down candles
                    });
                    console.log('[AdvancedOHLCChart] Volume colors set programmatically');
                  }
                });
              } catch (volumeError) {
                console.log('[AdvancedOHLCChart] Could not set volume colors programmatically (may use defaults):', volumeError);
              }
              
              // Track visible range to update timeframe mapping (reduces wrong timeframe requests)
              try {
                chart.onVisibleRangeChanged((range: any) => {
                  // FIX: Don't update timeframe based on visible range
                  // The prop timeframe should always control the API call
                  // Visible range changes are just for zooming/panning within cached data
                });
              } catch (rangeErr) {
                console.log('[AdvancedOHLCChart] Could not bind visible range listener:', rangeErr);
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
              
              // Draw custom price lines once the chart is ready
              // First clear any existing shapes to start fresh
              try {
                const activeChart = widget.activeChart?.() || widget.chart?.();
                if (activeChart && typeof activeChart.removeAllShapes === 'function') {
                  activeChart.removeAllShapes();
                }
                priceLineShapesRef.current = {};
                lastPriceLinesRef.current = {};
                requestPriceLineSync(0);
              } catch (lineErr) {
                console.log('[AdvancedOHLCChart] Could not render price lines on chart ready:', lineErr);
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

              // Fix: Scroll to real-time after data loads to populate the OHLC legend
              // TradingView's legend shows "O∅ H∅ L∅ C∅" until the chart scrolls to data
              // This triggers the legend to display the latest candle's values on initial load
              setTimeout(() => {
                try {
                  const activeChart = widget.activeChart?.() || widget.chart?.();
                  if (activeChart) {
                    // Scroll to the rightmost (most recent) bar to trigger legend update
                    activeChart.executeActionById?.('timeScaleReset');
                    console.log('[AdvancedOHLCChart] Scrolled to real-time to populate OHLC legend');
                  }
                } catch (e) {
                  console.log('[AdvancedOHLCChart] Could not scroll to real-time:', e);
                }
              }, 1500); // Delay to allow data to load first
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
      priceLineShapesRef.current = {};
      lastPriceLinesRef.current = {};
      if (visibleRangeDebounceRef.current) {
        clearTimeout(visibleRangeDebounceRef.current);
        visibleRangeDebounceRef.current = null;
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
    updateChartMetrics();

    // Force widget to refresh and load data
    try {
      widgetRef.current.onChartReady(() => {
        const chart = widgetRef.current.chart();
        if (chart) {
          // Reset data to trigger getBars call
          chart.resetData();
          console.log('[AdvancedOHLCChart] Forced chart refresh with preloaded data');
          requestPriceLineSync(50);
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
        className="w-full h-full min-w-0 min-h-0 relative z-10 chart-container bg-transparent"
      />

      {isLoading && firstLoadRef.current && (
        <div className="absolute inset-0 grid place-items-center bg-gray-900/60 z-30">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" />
            <div className="text-white text-sm">Loading OHLC data from backend…</div>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute bottom-2 left-2 bg-red-900/90 text-white text-xs rounded px-2 py-1 z-40">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
};

export default AdvancedOHLCChart;
