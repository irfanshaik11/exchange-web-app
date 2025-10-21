// // BirdeyePairChart.tsx
// import React, { useEffect, useRef, useState, useCallback } from 'react';
// import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
// import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';

// export type BirdeyeTF = '1s' | '15s' | '30s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
// type Mode = 'range' | 'count';

// export interface BirdeyeOHLC {
//   address: string;
//   h: number; o: number; l: number; c: number;
//   type: string;
//   v: number;
//   unix_time: number; // seconds
//   v_usd: number;
// }

// export interface BirdeyePairChartProps {
//   /** Pair/pool address (NOT a token mint) */
//   pairAddress: string;
//   timeframe?: BirdeyeTF;            // default '15m'
//   mode?: Mode;                      // 'count' (default) or 'range'
//   /** Only for mode='range' (UNIX seconds) */
//   timeFrom?: number;
//   timeTo?: number;
//   /** Only for mode='count' */
//   countLimit?: number;              // default 1000 (Birdeye max 5000)

//   height?: string;                  // CSS size
//   width?: string;                   // CSS size
//   className?: string;
//   baseRefreshMs?: number;           // default 60000
//   onDataUpdate?: (data: BirdeyeOHLC[]) => void;
// }

// /** Inline config (for testing; don’t ship to prod like this) */
// const BIRDEYE_API_KEY = 'ff0bcb7c34704869b6af6f740775898f';
// const BIRDEYE_PAIR_URL = 'https://public-api.birdeye.so/defi/v3/ohlcv/pair';
// const VALID_TF: BirdeyeTF[] = ['1s','15s','30s','1m','5m','15m','1h','4h','1d'];

// /** Wait until an element is visible and has non-zero size */
// function waitForVisibleContainer(el: HTMLElement): Promise<void> {
//   return new Promise((resolve) => {
//     const check = () => {
//       const r = el.getBoundingClientRect();
//       const visible = r.width > 40 && r.height > 40 && el.isConnected && getComputedStyle(el).display !== 'none';
//       if (visible) resolve();
//       else requestAnimationFrame(check);
//     };
//     check();
//   });
// }

// const BirdeyeChart: React.FC<BirdeyePairChartProps> = ({
//   pairAddress,
//   timeframe = '15m',
//   mode = 'count',
//   timeFrom,
//   timeTo,
//   countLimit = 1000,

//   height = '400px',
//   width  = '100%',
//   className = '',
//   baseRefreshMs = 60000,
//   onDataUpdate,
// }) => {
//   const [tf, setTf] = useState<BirdeyeTF>(VALID_TF.includes(timeframe) ? timeframe : '15m');
//   const [isLoading, setIsLoading] = useState(true);
//   const [error, setError]       = useState<string | null>(null);
//   const [candles, setCandles]   = useState<BirdeyeOHLC[]>([]);
//   const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
//   const [retryCount, setRetryCount] = useState(0);

//   const chartRef     = useRef<IChartApi | null>(null);
//   const seriesRef    = useRef<ISeriesApi<'Candlestick'> | null>(null);
//   const containerRef = useRef<HTMLDivElement>(null);

//   const lastGoodCandlesRef = useRef<BirdeyeOHLC[]>([]);
//   const inFlightRef        = useRef<string | null>(null);
//   const mountedRef         = useRef(true);
//   const lastFetchAtRef     = useRef<number>(0);
//   const roRef              = useRef<ResizeObserver | null>(null);
//   const firstLoadRef       = useRef(true);
//   const moRef              = useRef<MutationObserver | null>(null);

//   const buildUrl = (m: Mode) => {
//     const url = new URL(BIRDEYE_PAIR_URL);
//     url.searchParams.set('address', pairAddress);
//     url.searchParams.set('type', tf);
//     url.searchParams.set('padding', 'true');  // keep scale stable
//     url.searchParams.set('outlier', 'true');  // default on

//     if (m === 'range') {
//       if (!timeFrom || !timeTo) throw new Error('timeFrom/timeTo required when mode="range"');
//       url.searchParams.set('mode', 'range');
//       url.searchParams.set('time_from', String(timeFrom));
//       url.searchParams.set('time_to',   String(timeTo));
//     } else {
//       url.searchParams.set('mode', 'count');
//       url.searchParams.set('count_limit', String(Math.min(Math.max(countLimit, 1), 5000)));
//     }
//     return url;
//   };

//   const fetchCandles = useCallback(async () => {
//     if (!pairAddress) {
//       setError('No pair address provided');
//       setIsLoading(false);
//       return;
//     }

//     const url = buildUrl(mode);
//     const key = url.toString();

//     if (inFlightRef.current === key) return; // de-dupe rapid calls
//     inFlightRef.current = key;

//     // tiny throttle for dev double-renders
//     const now = Date.now();
//     const since = now - lastFetchAtRef.current;
//     if (since < 2000) await new Promise(r => setTimeout(r, 2000 - since));
//     lastFetchAtRef.current = Date.now();

//     const doFetch = async (u: URL) => {
//       const r = await fetch(u.toString(), {
//         method: 'GET',
//         headers: {
//           accept: 'application/json',
//           'x-chain': 'solana',
//           'X-API-KEY': BIRDEYE_API_KEY,  // uppercase header
//         },
//       });
//       let body: any = null;
//       try { body = await r.clone().json(); } catch {}
//       if (!r.ok) throw new Error(body?.message || `${r.status} ${r.statusText}`);
//       if (!body?.success) throw new Error(body?.message || 'API returned unsuccessful response');
//       return (body?.data?.items ?? []) as BirdeyeOHLC[];
//     };

//     try {
//       if (firstLoadRef.current) setIsLoading(true);
//       setError(null);

//       let items = await doFetch(url);

//       // If empty in count mode, try one coarser TF once
//       if ((!items || items.length === 0) && mode === 'count') {
//         const fallback: Record<string,string> = { '1s':'1m','15s':'1m','30s':'5m','1m':'5m','5m':'15m','15m':'1h' };
//         const next = fallback[tf];
//         if (next) {
//           const url2 = new URL(BIRDEYE_PAIR_URL);
//           url2.searchParams.set('address', pairAddress);
//           url2.searchParams.set('type', next);
//           url2.searchParams.set('mode', 'count');
//           url2.searchParams.set('count_limit', String(Math.min(Math.max(countLimit, 1), 5000)));
//           url2.searchParams.set('padding', 'true');
//           url2.searchParams.set('outlier', 'true');
//           items = await doFetch(url2);
//           if (items.length > 0) setTf(next as BirdeyeTF);
//         }
//       }

//       // Keep prior data if response empty (don’t blank chart)
//       if (!items || items.length === 0) {
//         setError(null);
//         setRetryCount((n) => Math.min(n + 1, 8));
//         return;
//         // note: we DO NOT call setCandles([]) here
//       }

//       lastGoodCandlesRef.current = items;
//       setCandles(items);
//       setLastUpdate(new Date());
//       setRetryCount(0);
//       onDataUpdate?.(items);
//     } catch (e: any) {
//       if (!mountedRef.current) return;
//       setError(e?.message || 'Fetch error');
//       setCandles(lastGoodCandlesRef.current); // keep last good
//       setRetryCount((n) => Math.min(n + 1, 8));
//     } finally {
//       if (mountedRef.current) setIsLoading(false);
//       firstLoadRef.current = false;
//       inFlightRef.current = null;
//     }
//   // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [pairAddress, tf, mode, timeFrom, timeTo, countLimit, onDataUpdate]);

//   // Init chart once (no async return; proper cleanup returned to React)
//   useEffect(() => {
//     const container = containerRef.current;
//     if (!container) return;

//     let disposed = false;

//     const setup = async () => {
//       await waitForVisibleContainer(container);
//       if (disposed) return;

//       // StrictMode / Fast Refresh guard + hard clear
//       if (chartRef.current) return;
//       container.innerHTML = '';

//       const chart = createChart(container, {
//         width: container.clientWidth || 600,
//         height: container.clientHeight || 400,
//         layout: { background: { type: ColorType.Solid, color: '#131722' }, textColor: '#d1d4dc' },
//         grid:   { vertLines: { color: '#2B2B43' }, horzLines: { color: '#2B2B43' } },
//         crosshair: { mode: 1 },
//         rightPriceScale: { borderColor: '#2B2B43' },
//         timeScale: {
//           borderColor: '#2B2B43',
//           timeVisible: true,
//           secondsVisible: ['1s','15s','30s'].includes(tf),
//           rightOffset: 10,
//         },
//         handleScroll: { mouseWheel: true, pressedMouseMove: true },
//         handleScale:  { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
//         localization: { timeFormatter: (t: any) => new Date(t * 1000).toLocaleString() },
//       });

//       const series = chart.addSeries(CandlestickSeries, {
//         upColor: '#26a69a',
//         downColor: '#ef5350',
//         borderDownColor: '#ef5350',
//         borderUpColor: '#26a69a',
//         wickDownColor: '#ef5350',
//         wickUpColor: '#26a69a',
//         priceFormat: { type: 'price', precision: 8, minMove: 1e-8 },
//         lastValueVisible: true,
//         priceLineVisible: true,
//       });

//       chartRef.current = chart;
//       seriesRef.current = series;

//       const resize = async () => {
//         if (!chartRef.current || !containerRef.current) return;
//         await waitForVisibleContainer(containerRef.current);
//         chartRef.current.applyOptions({
//           width:  containerRef.current.clientWidth  || 600,
//           height: containerRef.current.clientHeight || 400,
//         });
//         chartRef.current.timeScale().fitContent();
//       };

//       if ('ResizeObserver' in window) {
//         const ro = new ResizeObserver(() => resize());
//         roRef.current = ro;
//         ro.observe(container);
//       } else {
//       }

//       const onVisible = () => { if (document.visibilityState === 'visible') resize(); };
//       document.addEventListener('visibilitychange', onVisible);

//       // Some overlays toggle body styles/classes without resize
//       const mo = new MutationObserver(() => resize());
//       mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
//       moRef.current = mo;
//     };

//     setup();

//     // Proper cleanup returned here
//     return () => {
//       disposed = true;
//       document.removeEventListener('visibilitychange', () => {});
//       moRef.current?.disconnect();
//       moRef.current = null;

//       if (roRef.current) {
//         roRef.current.disconnect();
//         roRef.current = null;
//       } else {
//         // remove window resize fallback if we ever added it
//         // (safe to call even if not added)
//         window.removeEventListener('resize', () => {});
//       }

//       seriesRef.current = null;
//       chartRef.current?.remove();
//       chartRef.current = null;
//       if (container) container.innerHTML = '';
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []); // once

//   // Fetch + poll with jittered backoff
//   useEffect(() => {
//     mountedRef.current = true;
//     fetchCandles();

//     const backoff = Math.min(Math.pow(2, retryCount), 8);
//     const jitter  = Math.floor(Math.random() * 4000);
//     const interval = baseRefreshMs * backoff + jitter;

//     const id = setInterval(fetchCandles, interval);
//     return () => {
//       mountedRef.current = false;
//       clearInterval(id);
//     };
//   }, [fetchCandles, retryCount, pairAddress, tf, baseRefreshMs]);

//   // Push data to series (wait until visible to draw)
//   useEffect(() => {
//     const run = async () => {
//       if (!seriesRef.current || !containerRef.current) return;
//       const src = candles && candles.length > 0 ? candles : lastGoodCandlesRef.current;
//       if (!src || src.length === 0) return;

//       await waitForVisibleContainer(containerRef.current);

//       const data = src
//         .map(c => ({
//           time:  c.unix_time as UTCTimestamp,
//           open:  c.o,
//           high:  c.h,
//           low:   c.l,
//           close: c.c,
//         }))
//         .sort((a, b) => (a.time as number) - (b.time as number));

//       seriesRef.current.setData(data);
//       chartRef.current?.timeScale().fitContent();
//     };
//     run();
//   }, [candles]);

//   // Toggle seconds on sub-minute TFs
//   useEffect(() => {
//     if (!chartRef.current) return;
//     chartRef.current.applyOptions({
//       timeScale: { secondsVisible: ['1s','15s','30s'].includes(tf) },
//     });
//   }, [tf]);

//   return (
//     <div className={`relative ${className}`} style={{ height, width }}>
//       <div ref={containerRef} className="w-full h-full" style={{ height: '100%', width: '100%' }} />

//       {/* Controls */}
//       <div className="absolute top-2 right-2 bg-gray-800/90 rounded px-2 py-1 flex items-center gap-2">
//         <span className="text-xs text-gray-300">PAIR</span>
//         <select
//           value={tf}
//           onChange={(e) => setTf(e.target.value as BirdeyeTF)}
//           className="bg-transparent text-white text-xs border-none outline-none cursor-pointer"
//           disabled={isLoading}
//         >
//           <option value="1s">1s</option>
//           <option value="15s">15s</option>
//           <option value="30s">30s</option>
//           <option value="1m">1m</option>
//           <option value="5m">5m</option>
//           <option value="15m">15m</option>
//           <option value="1h">1H</option>
//           <option value="4h">4H</option>
//           <option value="1d">1D</option>
//         </select>
//         <button
//           onClick={() => fetchCandles()}
//           className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
//           disabled={isLoading}
//         >
//           Refresh
//         </button>
//       </div>

//       {/* Loading (first load only) */}
//       {isLoading && firstLoadRef.current && (
//         <div className="absolute inset-0 grid place-items-center bg-gray-900/60">
//           <div className="flex flex-col items-center gap-3">
//             <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" />
//             <div className="text-white text-sm">Loading Birdeye OHLCV…</div>
//           </div>
//         </div>
//       )}

//       {/* Error (keeps last data plotted) */}
//       {!isLoading && error && (
//         <div className="absolute bottom-2 left-2 bg-red-900/90 text-white text-xs rounded px-2 py-1">
//           ⚠️ {error}
//         </div>
//       )}

//       {/* Status */}
//       {(candles.length > 0 || lastGoodCandlesRef.current.length > 0) && lastUpdate && (
//         <div className="absolute bottom-2 left-2 bg-gray-800/90 rounded px-3 py-1 text-xs text-gray-300">
//           <span className="text-green-400">●</span> Birdeye v3 pair | TF {tf} | Updated {lastUpdate.toLocaleTimeString()}
//         </div>
//       )}
//     </div>
//   );
// };

// export default BirdeyeChart;
// BirdeyePairChart.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';

export type BirdeyeTF = '1s' | '15s' | '30s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
type Mode = 'range' | 'count';

export interface BirdeyeOHLC {
  address: string;
  h: number; o: number; l: number; c: number;
  type: string;
  v: number;
  unix_time: number; // seconds
  v_usd: number;
}

export interface BirdeyePairChartProps {
  pairAddress: string;             // PAIR address, not mint
  timeframe?: BirdeyeTF;           // default '15m'
  mode?: Mode;                     // 'count' (default) or 'range'
  timeFrom?: number;               // UNIX seconds (range) or single anchor (count)
  timeTo?: number;                 // UNIX seconds (range) or single anchor (count)
  countLimit?: number;             // default 1000 (Birdeye max 5000)
  height?: string;
  width?: string;
  className?: string;
  baseRefreshMs?: number;          // default 60000
  onDataUpdate?: (data: BirdeyeOHLC[]) => void;
}

/** Get API key from environment variables */
// Use our secure proxy endpoint instead of calling BirdEye directly
const BIRDEYE_PROXY_URL = '/api/birdeye-ohlcv-pair';
const VALID_TF: BirdeyeTF[] = ['1s','15s','30s','1m','5m','15m','1h','4h','1d'];

/** Wait until an element is visible and non-zero sized */
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

const BirdeyeChart: React.FC<BirdeyePairChartProps> = ({
  pairAddress,
  timeframe = '15m',
  mode = 'count',
  timeFrom,
  timeTo,
  countLimit = 1000,
  height = '400px',
  width  = '100%',
  className = '',
  baseRefreshMs = 60000,
  onDataUpdate,
}) => {
  const [tf, setTf] = useState<BirdeyeTF>(VALID_TF.includes(timeframe) ? timeframe : '15m');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<BirdeyeOHLC[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const lastGoodCandlesRef = useRef<BirdeyeOHLC[]>([]);
  const inFlightRef        = useRef<string | null>(null);
  const mountedRef         = useRef(true);
  const lastFetchAtRef     = useRef<number>(0);
  const roRef              = useRef<ResizeObserver | null>(null);
  const firstLoadRef       = useRef(true);
  const moRef              = useRef<MutationObserver | null>(null);

  /** Build the proxy request URL according to mode */
  const buildUrl = (m: Mode) => {
    const url = new URL(BIRDEYE_PROXY_URL, window.location.origin);
    url.searchParams.set('address', pairAddress);
    url.searchParams.set('type', tf);
    url.searchParams.set('padding', 'true');  // keep empty candles to stabilize scale
    url.searchParams.set('outlier', 'true');  // default true

    if (m === 'range') {
      if (!timeFrom || !timeTo) throw new Error('timeFrom/timeTo required when mode="range"');
      url.searchParams.set('mode', 'range');
      url.searchParams.set('time_from', String(timeFrom));
      url.searchParams.set('time_to',   String(timeTo));
    } else {
      // COUNT MODE: Birdeye requires AT MOST ONE of time_from / time_to
      url.searchParams.set('mode', 'count');
      url.searchParams.set('count_limit', String(Math.min(Math.max(countLimit, 1), 5000)));

      const hasFrom = Number.isFinite(timeFrom as number);
      const hasTo   = Number.isFinite(timeTo as number);

      if (hasFrom && !hasTo) {
        url.searchParams.set('time_from', String(timeFrom));
      } else if (hasTo && !hasFrom) {
        url.searchParams.set('time_to', String(timeTo));
      } else if (hasFrom && hasTo) {
        // Both provided: Birdeye says provide only one. We’ll send neither and warn.
        // (Caller can switch to range if they need a fixed window.)
        console.warn('[BirdeyeChart] In count mode, provide only one of timeFrom OR timeTo. Ignoring both.');
      }
      // else: no anchor -> latest N candles “up to now”
    }
    return url;
  };

  const fetchCandles = useCallback(async () => {
    if (!pairAddress) {
      setError('No pair address provided');
      setIsLoading(false);
      return;
    }

    const url = buildUrl(mode);
    const key = url.toString();

    if (inFlightRef.current === key) return; // de-dupe
    inFlightRef.current = key;

    // tiny throttle (handles double-renders)
    const now = Date.now();
    const since = now - lastFetchAtRef.current;
    if (since < 2000) await new Promise(r => setTimeout(r, 2000 - since));
    lastFetchAtRef.current = Date.now();

    const doFetch = async (u: URL) => {
      const r = await fetch(u.toString(), {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-chain': 'solana',
        },
      });
      let body: any = null;
      try { body = await r.clone().json(); } catch {}
      if (!r.ok) throw new Error(body?.message || `${r.status} ${r.statusText}`);
      if (!body?.success) throw new Error(body?.message || 'API returned unsuccessful response');
      return (body?.data?.items ?? []) as BirdeyeOHLC[];
    };

    try {
      if (firstLoadRef.current) setIsLoading(true);
      setError(null);

      let items = await doFetch(url);

      // If empty in count mode, try one coarser TF once
      if ((!items || items.length === 0) && mode === 'count') {
        const fallback: Record<string,string> = { '1s':'1m','15s':'1m','30s':'5m','1m':'5m','5m':'15m','15m':'1h' };
        const next = fallback[tf];
        if (next) {
          const url2 = new URL(BIRDEYE_PROXY_URL, window.location.origin);
          url2.searchParams.set('address', pairAddress);
          url2.searchParams.set('type', next);
          url2.searchParams.set('mode', 'count');
          url2.searchParams.set('count_limit', String(Math.min(Math.max(countLimit, 1), 5000)));
          url2.searchParams.set('padding', 'true');
          url2.searchParams.set('outlier', 'true');

          // Repeat the single-anchor rule for the fallback call
          const hasFrom = Number.isFinite(timeFrom as number);
          const hasTo   = Number.isFinite(timeTo as number);
          if (hasFrom && !hasTo) url2.searchParams.set('time_from', String(timeFrom));
          else if (hasTo && !hasFrom) url2.searchParams.set('time_to', String(timeTo));

          items = await doFetch(url2);
          if (items.length > 0) setTf(next as BirdeyeTF);
        }
      }

      if (!items || items.length === 0) {
        // keep last data drawn; increase backoff
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
  }, [pairAddress, tf, mode, timeFrom, timeTo, countLimit, onDataUpdate]);

  // Init chart once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;

    const setup = async () => {
      await waitForVisibleContainer(container);
      if (disposed) return;
      if (chartRef.current) return; // guard

      container.innerHTML = '';

      const chart = createChart(container, {
        width: container.clientWidth || 600,
        height: container.clientHeight || 400,
        layout: { background: { type: ColorType.Solid, color: '#131722' }, textColor: '#d1d4dc' },
        grid:   { vertLines: { color: '#2B2B43' }, horzLines: { color: '#2B2B43' } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: '#2B2B43' },
        timeScale: {
          borderColor: '#2B2B43',
          timeVisible: true,
          secondsVisible: ['1s','15s','30s'].includes(tf),
          rightOffset: 10,
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
        chartRef.current.applyOptions({
          width:  containerRef.current.clientWidth  || 600,
          height: containerRef.current.clientHeight || 400,
        });
        chartRef.current.timeScale().fitContent();
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
      moRef.current?.disconnect();
      moRef.current = null;
      roRef.current?.disconnect();
      roRef.current = null;

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
    const interval = baseRefreshMs * backoff + jitter;

    const id = setInterval(fetchCandles, interval);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchCandles, retryCount, pairAddress, tf, baseRefreshMs]);

  // Draw data
  useEffect(() => {
    const run = async () => {
      if (!seriesRef.current || !containerRef.current) return;
      const src = candles && candles.length > 0 ? candles : lastGoodCandlesRef.current;
      if (!src || src.length === 0) return;

      await waitForVisibleContainer(containerRef.current);

      const data = src
        .map(c => ({
          time:  c.unix_time as UTCTimestamp,
          open:  c.o,
          high:  c.h,
          low:   c.l,
          close: c.c,
        }))
        .sort((a, b) => (a.time as number) - (b.time as number));

      seriesRef.current.setData(data);
      chartRef.current?.timeScale().fitContent();
    };
    run();
  }, [candles]);

  // Toggle seconds on sub-minute TFs
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      timeScale: { secondsVisible: ['1s','15s','30s'].includes(tf) },
    });
  }, [tf]);

  return (
    <div className={`relative ${className}`} style={{ height, width }}>
      <div ref={containerRef} className="w-full h-full" style={{ height: '100%', width: '100%' }} />

      {/* Controls */}
      <div className="absolute top-2 right-2 bg-gray-800/90 rounded px-2 py-1 flex items-center gap-2">
        <span className="text-xs text-gray-300">PAIR</span>
        <select
          value={tf}
          onChange={(e) => setTf(e.target.value as BirdeyeTF)}
          className="bg-transparent text-white text-xs border-none outline-none cursor-pointer"
          disabled={isLoading}
        >
          <option value="1s">1s</option>
          <option value="15s">15s</option>
          <option value="30s">30s</option>
          <option value="1m">1m</option>
          <option value="5m">5m</option>
          <option value="15m">15m</option>
          <option value="1h">1H</option>
          <option value="4h">4H</option>
          <option value="1d">1D</option>
        </select>
        <button
          onClick={() => fetchCandles()}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
          disabled={isLoading}
        >
          Refresh
        </button>
      </div>

      {/* Loading (first load only) */}
      {isLoading && firstLoadRef.current && (
        <div className="absolute inset-0 grid place-items-center bg-gray-900/60">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" />
            <div className="text-white text-sm">Loading Birdeye OHLCV…</div>
          </div>
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <div className="absolute bottom-2 left-2 bg-red-900/90 text-white text-xs rounded px-2 py-1">
          ⚠️ {error}
        </div>
      )}

      {/* Status */}
      {(candles.length > 0 || lastGoodCandlesRef.current.length > 0) && lastUpdate && (
        <div className="absolute bottom-2 left-2 bg-gray-800/90 rounded px-3 py-1 text-xs text-gray-300">
          <span className="text-green-400">●</span> Birdeye v3 pair | TF {tf} | Updated {lastUpdate.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default BirdeyeChart;
