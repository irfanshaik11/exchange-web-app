import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';

export type BackendInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export type BackendTimeRange = '1h' | '4h' | '24h' | '7d' | '30d';

export interface BackendOHLCData {
  unix_time: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v_usd: number;
}

export interface BackendOHLCChartProps {
  mint?: string;
  pairAddress?: string;
  interval?: BackendInterval;
  timeframe?: BackendTimeRange;
  height?: string;
  width?: string;
  className?: string;
  baseRefreshMs?: number;
  onDataUpdate?: (data: BackendOHLCData[]) => void;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://157.180.71.112:8080';
const VALID_INTERVALS: BackendInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

const SEC_PER_BAR: Record<BackendInterval, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
};

function waitForVisibleContainer(el: HTMLElement): Promise<void> {
  return new Promise(resolve => {
    const tick = () => {
      const r = el.getBoundingClientRect();
      const visible = r.width > 40 && r.height > 40 && el.isConnected && getComputedStyle(el).display !== 'none';
      if (visible) resolve(); else requestAnimationFrame(tick);
    };
    tick();
  });
}

const BackendOHLCChart: React.FC<BackendOHLCChartProps> = ({
  mint,
  pairAddress,
  interval = '1m',
  timeframe = '24h',
  height = '400px',
  width  = '100%',
  className = '',
  baseRefreshMs = 30000,
  onDataUpdate,
}) => {
  const [selectedInterval] = useState<BackendInterval>(VALID_INTERVALS.includes(interval) ? interval : '1m');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<BackendOHLCData[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const lastGoodCandlesRef = useRef<BackendOHLCData[]>([]);
  const inFlightRef        = useRef<string | null>(null);
  const mountedRef         = useRef(true);
  const lastFetchAtRef     = useRef<number>(0);
  const roRef              = useRef<ResizeObserver | null>(null);
  const firstLoadRef       = useRef(true);
  const moRef              = useRef<MutationObserver | null>(null);
  const didInitialZoomRef  = useRef(false); // apply default zoom once

  const buildUrl = () => {
    const url = new URL(`${BACKEND_URL}/v1/trade/ohlc-data`);
    if (mint) url.searchParams.set('mint', mint);
    if (pairAddress) url.searchParams.set('pair_address', pairAddress);
    url.searchParams.set('interval', selectedInterval);
    url.searchParams.set('timeframe', timeframe);
    return url;
  };

  const fetchCandles = useCallback(async () => {
    if (!mint && !pairAddress) {
      setError('No mint or pair address provided');
      setIsLoading(false);
      return;
    }
    const url = buildUrl();
    const key = url.toString();
    if (inFlightRef.current === key) return;
    inFlightRef.current = key;

    const now = Date.now();
    const since = now - lastFetchAtRef.current;
    if (since < 2000) await new Promise(r => setTimeout(r, 2000 - since));
    lastFetchAtRef.current = Date.now();

    const doFetch = async (u: URL) => {
      const r = await fetch(u.toString(), {
        method: 'GET',
        headers: { accept: 'application/json', 'X-API-Key': process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key' },
      });
      let body: any = null;
      try { body = await r.clone().json(); } catch {}
      if (!r.ok) throw new Error(body?.message || body?.error || `${r.status} ${r.statusText}`);
      if (!body?.success) throw new Error(body?.message || body?.error || 'API returned unsuccessful response');
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
      inFlightRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint, pairAddress, selectedInterval, timeframe, onDataUpdate]);

  // Logical range helper: show ~N bars (thin candles) and a little right padding
// Right-align and keep bars thin by showing enough logical bars for the container width
const setDefaultLogicalRange = useCallback((dataLen: number) => {
  if (!chartRef.current || !containerRef.current || dataLen === 0) return;
  const ts = chartRef.current.timeScale();

  // Tune these two:
  const PX_PER_BAR   = 2.2;   // smaller => thinner bars (try 2.0–2.6)
  const MIN_BARS     = 420;   // safety floor (ensure thin even on narrow screens)
  const RIGHT_PAD    = 4;     // small breathing room on the right (in bars)

  const width        = containerRef.current.clientWidth || 800;
  const targetBars   = Math.max(Math.floor(width / PX_PER_BAR), MIN_BARS);

  const lastIdx      = (dataLen - 1) + RIGHT_PAD;        // anchor to newest bar + tiny pad
  const firstIdx     = lastIdx - targetBars + 1;         // ensure wide logical span

  ts.setVisibleLogicalRange({ from: firstIdx, to: lastIdx });
  ts.scrollToRealTime();                                  // keep aligned to the right edge
}, []);


  // Init chart once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const setup = async () => {
      await waitForVisibleContainer(container);
      if (disposed || chartRef.current) return;

      container.innerHTML = '';

      const chart = createChart(container, {
        width: container.clientWidth || 600,
        height: container.clientHeight || 400,
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#d1d4dc' },
        grid:   { vertLines: { color: '#2B2B43' }, horzLines: { color: '#2B2B43' } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: '#2B2B43', scaleMargins: { top: 0.1, bottom: 0.1 } },
        leftPriceScale: { visible: false },
        timeScale: {
          borderColor: '#2B2B43',
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 12,
          barSpacing: 1,        // thin bars
          minBarSpacing: 1,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale:  { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        localization: { timeFormatter: (t: any) => new Date(t * 1000).toLocaleString() },
      });

      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderDownColor: '#ef5350',
        borderUpColor: '#26a69a',
        wickDownColor: '#ef5350',
        wickUpColor: '#26a69a',
        priceFormat: { type: 'price', precision: 8, minMove: 1e-8 },
        lastValueVisible: true,
        priceLineVisible: true,
      });

      chartRef.current = chart;
      seriesRef.current = series;

      const resize = async () => {
        if (!chartRef.current || !containerRef.current) return;
        await waitForVisibleContainer(containerRef.current);

        // preserve current logical range on resize (don’t re-fit)
        const ts = chartRef.current.timeScale();
        const current = ts.getVisibleLogicalRange();

        chartRef.current.applyOptions({
          width:  containerRef.current.clientWidth  || 600,
          height: containerRef.current.clientHeight || 400,
        });

        if (current) ts.setVisibleLogicalRange(current);
      };

      if ('ResizeObserver' in window) {
        const ro = new ResizeObserver(() => resize());
        roRef.current = ro;
        ro.observe(container);
      }

      const onVisible = () => { if (document.visibilityState === 'visible') resize(); };
      document.addEventListener('visibilitychange', onVisible);

      const mo = new MutationObserver(() => resize());
      mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
      moRef.current = mo;
    };

    setup();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', () => {});
      moRef.current?.disconnect(); moRef.current = null;
      roRef.current?.disconnect(); roRef.current = null;

      seriesRef.current = null;
      chartRef.current?.remove();
      chartRef.current = null;
      container && (container.innerHTML = '');
    };
  }, []);

  // Polling with jittered backoff
  useEffect(() => {
    mountedRef.current = true;
    fetchCandles();

    const backoff = Math.min(Math.pow(2, retryCount), 8);
    const jitter  = Math.floor(Math.random() * 4000);
    const intervalMs = baseRefreshMs * backoff + jitter;

    const id = setInterval(fetchCandles, intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchCandles, retryCount, mint, pairAddress, selectedInterval, timeframe, baseRefreshMs]);

  // Draw data; default zoom-out once, then never fight user zoom
  useEffect(() => {
    (async () => {
      if (!seriesRef.current || !containerRef.current) return;
      const src = candles && candles.length > 0 ? candles : lastGoodCandlesRef.current;
      if (!src || src.length === 0) return;

      await waitForVisibleContainer(containerRef.current);

      const data = src
        .map(c => ({ time: c.unix_time as UTCTimestamp, open: c.o, high: c.h, low: c.l, close: c.c }))
        .sort((a, b) => (a.time as number) - (b.time as number));

      seriesRef.current.setData(data);

      const ts = chartRef.current?.timeScale();
      if (!ts) return;

      if (!didInitialZoomRef.current) {
        // true zoom-out: base on logical bars (not time span)
        setDefaultLogicalRange(data.length);
        didInitialZoomRef.current = true;
      }
      // thereafter, user zoom/pan is preserved
    })();
  }, [candles, setDefaultLogicalRange]);

  return (
    <div className={`relative ${className}`} style={{ height, width, zIndex: 100 }}>
      <div
        ref={containerRef}
        className="w-full h-full chart-container"
        style={{
          height: '100%',
          width: '100%',
          position: 'relative',
          zIndex: 100,
          backgroundColor: 'transparent',
          // no maxWidth cap; let it breathe
        }}
      />

      {isLoading && firstLoadRef.current && (
        <div className="absolute inset-0 grid place-items-center bg-gray-900/60" style={{ zIndex: 150 }}>
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" />
            <div className="text-white text-sm">Loading OHLC data from backend…</div>
          </div>
        </div>
      )}

      {!isLoading && error && (
        <div className="absolute bottom-2 left-2 bg-red-900/90 text-white text-xs rounded px-2 py-1" style={{ zIndex: 200 }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
};

export default BackendOHLCChart;
