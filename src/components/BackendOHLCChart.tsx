import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  createSeriesMarkers,
} from "lightweight-charts";
import type {
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  SeriesOptionsMap,
} from "lightweight-charts";

export type BackendInterval =
  | "1s"
  | "5s"
  | "15s"
  | "30s"
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "4h"
  | "1d"
  | "7d";
export type BackendTimeRange =
  | "1h"
  | "4h"
  | "24h"
  | "7d"
  | "30d"
  | "90d"
  | "180d"
  | "365d";

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
  optimize?: boolean;
  height?: string;
  width?: string;
  className?: string;
  baseRefreshMs?: number;
  onDataUpdate?: (data: BackendOHLCData[]) => void;
  preloadedData?: BackendOHLCData[];
  tradeData?: any[]; // Trade data for dev buy markers
  creatorAddress?: string | null; // Creator/dev wallet address
}

const BACKEND_URL = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
const VALID_INTERVALS: BackendInterval[] = [
  "1s",
  "5s",
  "15s",
  "30s",
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "7d",
];

const SEC_PER_BAR: Record<BackendInterval, number> = {
  "1s": 1,
  "5s": 5,
  "15s": 15,
  "30s": 30,
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "7d": 604800,
};

function waitForVisibleContainer(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      const r = el.getBoundingClientRect();
      const visible =
        r.width > 40 &&
        r.height > 40 &&
        el.isConnected &&
        getComputedStyle(el).display !== "none";
      if (visible) resolve();
      else requestAnimationFrame(tick);
    };
    // Start immediately for faster loading
    tick();
  });
}

const BackendOHLCChart: React.FC<BackendOHLCChartProps> = ({
  mint,
  pairAddress,
  interval = "1m",
  timeframe = "24h",
  optimize = false,
  height = "400px",
  width = "100%",
  className = "",
  baseRefreshMs = 30000,
  onDataUpdate,
  preloadedData,
  tradeData = [],
  creatorAddress = null,
}) => {
  // Log received props for debugging
  useEffect(() => {
    console.log("[BackendOHLCChart] Received props:", {
      tradeDataLength: tradeData?.length,
      creatorAddress: creatorAddress,
      hasTradeData: !!tradeData && tradeData.length > 0,
      hasCreatorAddress: !!creatorAddress,
    });
  }, [tradeData, creatorAddress]);

  // Use prop directly instead of state to respond to changes
  const selectedInterval = VALID_INTERVALS.includes(interval) ? interval : "1m";
  const [isLoading, setIsLoading] = useState(
    !preloadedData || preloadedData.length === 0,
  );
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<BackendOHLCData[]>(
    preloadedData || [],
  );
  const [lastUpdate, setLastUpdate] = useState<Date | null>(
    preloadedData && preloadedData.length > 0 ? new Date() : null,
  );
  const [retryCount, setRetryCount] = useState(0);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    data: any;
  } | null>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);
  const markersApiRef = useRef<any>(null);

  const lastGoodCandlesRef = useRef<BackendOHLCData[]>(preloadedData || []);
  const inFlightRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const lastFetchAtRef = useRef<number>(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const firstLoadRef = useRef(!preloadedData || preloadedData.length === 0);
  const moRef = useRef<MutationObserver | null>(null);
  const didInitialZoomRef = useRef(false); // apply default zoom once
  const hasInitializedRef = useRef(false); // track if we've made initial request

  const buildUrl = () => {
    const url = new URL(`${BACKEND_URL}/v1/trade/ohlc-data`);
    if (mint) url.searchParams.set("mint", mint);
    if (pairAddress) url.searchParams.set("pair_address", pairAddress);
    url.searchParams.set("interval", selectedInterval);
    url.searchParams.set("timeframe", timeframe);
    if (optimize) url.searchParams.set("optimize", "true");
    return url;
  };

  const fetchCandles = useCallback(async () => {
    if (!mint && !pairAddress) {
      setError("No mint or pair address provided");
      setIsLoading(false);
      return;
    }

    // AGGRESSIVELY skip fetching if we have preloaded data
    if (preloadedData && preloadedData.length > 0) {
      console.log(
        "[BackendOHLCChart] BLOCKING fetch - preloaded data available:",
        preloadedData.length,
        "candles",
      );
      setIsLoading(false);
      hasInitializedRef.current = true;
      return;
    }

    // Skip if we've already made an initial request
    if (hasInitializedRef.current && firstLoadRef.current) {
      console.log("[BackendOHLCChart] Skipping fetch - already initialized");
      return;
    }

    const url = buildUrl();
    const key = url.toString();

    // Prevent concurrent requests with the same key
    if (inFlightRef.current === key) {
      console.log("[BackendOHLCChart] Request already in flight for:", key);
      return;
    }

    console.log("[BackendOHLCChart] Starting fetch for:", key);
    inFlightRef.current = key;

    const now = Date.now();
    const since = now - lastFetchAtRef.current;
    // Skip throttling for initial load to maximize speed
    if (!firstLoadRef.current && since < 1000) {
      await new Promise((r) => setTimeout(r, 1000 - since));
    }
    lastFetchAtRef.current = Date.now();

    const doFetch = async (u: URL) => {
      console.log("[BackendOHLCChart] Fetching OHLC data from:", u.toString());
      const r = await fetch(u.toString(), {
        method: "GET",
        headers: {
          accept: "application/json",
          "X-API-Key": process.env.NEXT_PUBLIC_BACKEND_API_KEY || "test-key",
        },
      });
      let body: any = null;
      try {
        body = await r.clone().json();
      } catch {}
      if (!r.ok)
        throw new Error(
          body?.message || body?.error || `${r.status} ${r.statusText}`,
        );
      if (!body?.success)
        throw new Error(
          body?.message || body?.error || "API returned unsuccessful response",
        );
      console.log(
        "[BackendOHLCChart] Received OHLC data:",
        body?.data?.items?.length || 0,
        "candles",
      );
      return (body?.data?.items ?? []) as BackendOHLCData[];
    };

    try {
      if (firstLoadRef.current) setIsLoading(true);
      setError(null);

      const items = await doFetch(url);
      if (!items || items.length === 0) {
        setError(null);
        setRetryCount((n) => Math.min(n + 1, 8));
        return;
      }

      lastGoodCandlesRef.current = items;
      setCandles(items);
      setLastUpdate(new Date());
      setRetryCount(0);
      onDataUpdate?.(items);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message || "Fetch error");
      setCandles(lastGoodCandlesRef.current);
      setRetryCount((n) => Math.min(n + 1, 8));
    } finally {
      if (mountedRef.current) setIsLoading(false);
      firstLoadRef.current = false;
      hasInitializedRef.current = true;
      inFlightRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint, pairAddress, selectedInterval, timeframe, onDataUpdate]);

  // Logical range helper: show ~N bars with good spacing
  // Right-align and show appropriate number of bars for the container width
  const setDefaultLogicalRange = useCallback((dataLen: number) => {
    if (!chartRef.current || !containerRef.current || dataLen === 0) return;
    const ts = chartRef.current.timeScale();

    // Tune these two:
    const PX_PER_BAR = 10; // pixels per bar (higher = fewer bars, more zoomed in)
    const MIN_BARS = 100; // minimum bars to show (lower = more zoomed in)
    const RIGHT_PAD = 3; // small breathing room on the right (in bars)

    const width = containerRef.current.clientWidth || 800;
    const targetBars = Math.max(Math.floor(width / PX_PER_BAR), MIN_BARS);

    const lastIdx = dataLen - 1 + RIGHT_PAD; // anchor to newest bar + tiny pad
    const firstIdx = lastIdx - targetBars + 1; // ensure wide logical span

    ts.setVisibleLogicalRange({ from: firstIdx, to: lastIdx });
    ts.scrollToRealTime(); // keep aligned to the right edge
  }, []);

  // Init chart once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const setup = async () => {
      await waitForVisibleContainer(container);
      if (disposed || chartRef.current) return;

      container.innerHTML = "";

      // Dynamically adjust precision based on container width
      const containerWidth = container.clientWidth || 600;
      const precision = containerWidth > 1600 ? 6 : 8;

      const chart = createChart(container, {
        width: containerWidth,
        height: container.clientHeight || 400,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#d1d4dc",
        },
        grid: {
          vertLines: { color: "#2B2B43" },
          horzLines: { color: "#2B2B43" },
        },
        crosshair: { mode: 1 },
        rightPriceScale: {
          borderColor: "#2B2B43",
          scaleMargins: { top: 0.1, bottom: 0.1 },
          autoScale: true,
        },
        leftPriceScale: { visible: false },
        timeScale: {
          borderColor: "#2B2B43",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 12,
          barSpacing: 3, // thicker bars
          minBarSpacing: 2,
          fixLeftEdge: false,
          fixRightEdge: false,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
        localization: {
          timeFormatter: (t: any) => new Date(t * 1000).toLocaleString(),
          priceFormatter: (price: number) => {
            const abs = Math.abs(price);

            // For very large numbers, use K/M/B notation
            if (abs >= 1000000000) {
              return (price / 1000000000).toFixed(2).replace(/\.00$/, "") + "B";
            } else if (abs >= 1000000) {
              return (price / 1000000).toFixed(2).replace(/\.00$/, "") + "M";
            } else if (abs >= 1000) {
              return (price / 1000).toFixed(2).replace(/\.00$/, "") + "K";
            } else if (abs >= 1) {
              return price.toFixed(2).replace(/\.00$/, "");
            } else if (abs >= 0.01) {
              return price.toFixed(3).replace(/\.000$/, "");
            } else {
              return price.toFixed(6).replace(/\.000000$/, "");
            }
          },
        },
      });

      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderDownColor: "#ef5350",
        borderUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        wickUpColor: "#26a69a",
        priceFormat: { type: "price", precision: precision, minMove: 1e-8 },
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
          width: containerRef.current.clientWidth || 600,
          height: containerRef.current.clientHeight || 400,
        });

        if (current) ts.setVisibleLogicalRange(current);
      };

      if ("ResizeObserver" in window) {
        const ro = new ResizeObserver(() => resize());
        roRef.current = ro;
        ro.observe(container);
      }

      const onVisible = () => {
        if (document.visibilityState === "visible") resize();
      };
      document.addEventListener("visibilitychange", onVisible);

      const mo = new MutationObserver(() => resize());
      mo.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
      moRef.current = mo;
    };

    setup();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", () => {});
      moRef.current?.disconnect();
      moRef.current = null;
      roRef.current?.disconnect();
      roRef.current = null;

      seriesRef.current = null;
      chartRef.current?.remove();
      chartRef.current = null;
      container && (container.innerHTML = "");
    };
  }, []);

  // Update candles when preloaded data changes - PRIORITY DATA SOURCE
  // Combined effect to prevent multiple reloads
  useEffect(() => {
    if (preloadedData && preloadedData.length > 0) {
      // Only use preloaded data if we have valid mint or pairAddress
      // This prevents using stale data when parameters are still loading
      if (!mint && !pairAddress) {
        console.log(
          "[BackendOHLCChart] Rejecting preloaded data - no mint or pairAddress yet",
        );
        return;
      }

      console.log(
        "[BackendOHLCChart] PRIORITY: Using preloaded data:",
        preloadedData.length,
        "candles",
      );

      // Set preloaded data as the primary source and disable API fetching
      setCandles(preloadedData);
      lastGoodCandlesRef.current = preloadedData;
      setLastUpdate(new Date());
      setIsLoading(false);
      hasInitializedRef.current = true;

      // Mark that we're using preloaded data to prevent API conflicts
      firstLoadRef.current = false;

      onDataUpdate?.(preloadedData);

      // Don't start polling when we have preloaded data
      return;
    }

    // Only start polling if we don't have preloaded data
    console.log(
      "[BackendOHLCChart] Starting API polling - no preloaded data available",
    );
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
    };
  }, [
    fetchCandles,
    retryCount,
    mint,
    pairAddress,
    selectedInterval,
    timeframe,
    baseRefreshMs,
    preloadedData,
    onDataUpdate,
  ]);

  // Handle prop changes - refetch data when interval/timeframe changes
  const prevIntervalRef = useRef(selectedInterval);
  const prevTimeframeRef = useRef(timeframe);

  useEffect(() => {
    // Only refetch if parameters actually changed and we're not on initial load
    if (
      hasInitializedRef.current &&
      (prevIntervalRef.current !== selectedInterval ||
        prevTimeframeRef.current !== timeframe)
    ) {
      console.log("[BackendOHLCChart] Parameters changed, refetching data");
      prevIntervalRef.current = selectedInterval;
      prevTimeframeRef.current = timeframe;

      // Reset and refetch with new parameters
      hasInitializedRef.current = false;
      firstLoadRef.current = true;
      fetchCandles();
    }
  }, [selectedInterval, timeframe, fetchCandles]);

  // Draw data; default zoom-out once, then never fight user zoom
  useEffect(() => {
    (async () => {
      if (!seriesRef.current || !containerRef.current) return;
      const src =
        candles && candles.length > 0 ? candles : lastGoodCandlesRef.current;
      if (!src || src.length === 0) return;

      await waitForVisibleContainer(containerRef.current);

      const data = src
        .map((c) => ({
          time: c.unix_time as UTCTimestamp,
          open: c.o,
          high: c.h,
          low: c.l,
          close: c.c,
        }))
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

  // Helper function to build markers from trade events
  const buildMarkersFromEvents = useCallback(
    (events: any[], creatorAddr: string | null) => {
      if (!events || events.length === 0 || !creatorAddr) {
        console.log("[BackendOHLCChart] No events or creator address", {
          eventsLength: events?.length,
          creatorAddr,
        });
        return [];
      }

      console.log(
        "[BackendOHLCChart] Building markers from events:",
        events.length,
        "creator:",
        creatorAddr,
      );

      // Get seconds per bar for snapping timestamps to candle times
      const secondsPerBar = SEC_PER_BAR[selectedInterval];

      return events
        .map((evt) => {
          // Get timestamp in seconds (lightweight-charts expects UTCTimestamp)
          let timestamp: UTCTimestamp;
          if (typeof evt.timestamp === "number") {
            const ts =
              evt.timestamp < 10000000000
                ? evt.timestamp
                : evt.timestamp / 1000;
            // Snap to bar start to match candle times exactly (v5 requirement)
            timestamp = (Math.floor(ts / secondsPerBar) *
              secondsPerBar) as UTCTimestamp;
          } else if (typeof evt.timestamp === "string") {
            const ts = new Date(evt.timestamp).getTime() / 1000;
            // Snap to bar start
            timestamp = (Math.floor(ts / secondsPerBar) *
              secondsPerBar) as UTCTimestamp;
          } else {
            return null;
          }

          // Try multiple fields to get the maker address
          // The processed trade from useOptimizedTradeEventsWebSocket has maker at the top level
          const maker = evt.maker || evt.originalEvent?.maker || "";

          const isDevTrade =
            maker &&
            creatorAddr &&
            maker.toLowerCase() === creatorAddr.toLowerCase();

          // Log address comparison for debugging
          console.log(
            "[BackendOHLCChart] Comparing addresses - Maker:",
            maker,
            "| Creator:",
            creatorAddr,
            "| Match:",
            isDevTrade,
          );

          // Warn if no maker field found
          if (!maker) {
            console.log(
              "[BackendOHLCChart] ⚠️ Trade has no maker field. Event keys:",
              Object.keys(evt),
            );
          }

          // Only mark dev trades
          if (!isDevTrade) {
            return null;
          }

          const isBuy = evt.side === "buy" || evt.eventDisplayType === "Buy";
          const eventType = isBuy ? "DEV_BUY" : "DEV_SELL";

          const shortMaker =
            maker.length > 10
              ? `${maker.slice(0, 4)}...${maker.slice(-4)}`
              : maker;
          console.log(
            "[BackendOHLCChart] ✅ Creating marker for dev trade:",
            eventType,
            "maker:",
            shortMaker,
          );

          const price = parseFloat(evt.price || evt.data?.priceUsd || "0");

          return {
            time: timestamp,
            position: "aboveBar" as "belowBar" | "aboveBar" | "inBar",
            color: isBuy ? "#00ff00" : "#ff0000",
            shape: "arrowDown" as "circle" | "square" | "arrowUp" | "arrowDown",
            size: 1,
            text: isBuy ? "DB" : "DS",
            price: price,
            // Store original event data for tooltip
            id: evt.transactionHash || evt.id,
            data: {
              type: eventType,
              timestamp: evt.timestamp,
              price: evt.price || evt.data?.priceUsd || "0",
              amount: evt.amount || evt.data?.amountNonLiquidityToken || "0",
              totalUSD: evt.totalUSD || evt.data?.priceUsdTotal || "0",
              maker: maker,
              transactionHash: evt.transactionHash,
            },
          };
        })
        .filter(Boolean);
    },
    [selectedInterval],
  );

  // Add markers for dev trades using setMarkers()
  useEffect(() => {
    if (
      !seriesRef.current ||
      !tradeData ||
      tradeData.length === 0 ||
      !creatorAddress
    ) {
      // Clear markers
      if (seriesRef.current && markersRef.current.length > 0) {
        try {
          (seriesRef.current as any).setMarkers?.([]);
        } catch (e) {
          // Method might not exist
        }
        markersRef.current = [];
      }
      return;
    }

    const markers = buildMarkersFromEvents(tradeData, creatorAddress);
    markersRef.current = markers;

    console.log(
      "[BackendOHLCChart] Setting markers:",
      markers.length,
      "markers",
    );
    console.log("[BackendOHLCChart] Sample marker:", markers[0]);

    // Use setTimeout to ensure series is fully initialized
    const timeoutId = setTimeout(() => {
      console.log("[BackendOHLCChart] Series state:", {
        hasSeries: !!seriesRef.current,
        markersCount: markers.length,
        seriesType: "Candlestick",
      });

      if (seriesRef.current && markers.length > 0) {
        try {
          // Check if setMarkers exists
          const hasSetMarkers = "setMarkers" in seriesRef.current;
          const isFunction =
            typeof (seriesRef.current as any).setMarkers === "function";
          console.log("[BackendOHLCChart] setMarkers check:", {
            hasSetMarkers,
            isFunction,
          });

          // Try the old API first (backwards compatibility)
          const series = seriesRef.current as any;

          try {
            if (series.setMarkers && typeof series.setMarkers === "function") {
              series.setMarkers(markers);
              console.log(
                "[BackendOHLCChart] ✅ setMarkers called directly (old API)",
              );
              return; // Success, exit
            }
          } catch (err) {
            // Old API doesn't exist, continue to v5 API
          }

          // Use v5 API: createSeriesMarkers
          console.log("[BackendOHLCChart] Using createSeriesMarkers v5 API");
          try {
            const markersApi = createSeriesMarkers(seriesRef.current, markers);
            markersApiRef.current = markersApi;
            console.log(
              "[BackendOHLCChart] ✅ Markers created using createSeriesMarkers",
            );
          } catch (createError: any) {
            console.error(
              "[BackendOHLCChart] ❌ createSeriesMarkers failed:",
              createError,
            );
          }
        } catch (error) {
          console.error("[BackendOHLCChart] ❌ Error setting markers:", error);
        }
      } else {
        console.log("[BackendOHLCChart] No markers to set or series not ready");

        // If markers exist but data changed, try to update via the API
        if (markersApiRef.current && markers.length > 0) {
          try {
            (markersApiRef.current as any).setMarkers?.(markers);
            console.log("[BackendOHLCChart] Updated markers via API");
          } catch (err) {
            console.error("[BackendOHLCChart] Failed to update markers:", err);
          }
        }
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [tradeData, creatorAddress, buildMarkersFromEvents]);

  // Subscribe to crosshair move for tooltip
  useEffect(() => {
    if (
      !chartRef.current ||
      !seriesRef.current ||
      !tradeData ||
      tradeData.length === 0
    )
      return;

    const handleCrosshairMove = (param: any) => {
      if (param === null || param.point === undefined) {
        setTooltip(null);
        return;
      }

      // Check if there's a marker at this time
      const time = param.time;
      const markers = buildMarkersFromEvents(tradeData, creatorAddress);
      const markerAtTime = markers.find((m: any) => m.time === time);

      if (markerAtTime && markerAtTime.data) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setTooltip({
            x: rect.left + param.point.x,
            y: rect.top + param.point.y,
            data: markerAtTime.data,
          });
        }
      } else {
        setTooltip(null);
      }
    };

    chartRef.current.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      if (chartRef.current) {
        chartRef.current.unsubscribeCrosshairMove(handleCrosshairMove);
      }
    };
  }, [tradeData, creatorAddress, buildMarkersFromEvents]);

  // Helper to format numbers
  const formatNumber = (num: number | string): string => {
    const n = typeof num === "string" ? parseFloat(num) : num;
    if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
    if (n >= 1000) return `$${(n / 1000).toFixed(2)}K`;
    return `$${n.toFixed(2)}`;
  };

  const formatTokenAmount = (num: number | string): string => {
    const n = typeof num === "string" ? parseFloat(num) : num;
    if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
    return n.toFixed(2);
  };

  const shortAddress = (addr: string): string => {
    if (!addr) return "";
    return addr.length > 10 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;
  };

  return (
    <div
      className={`relative ${className}`}
      style={{ height, width, zIndex: 1 }}
    >
      <div
        ref={containerRef}
        className="chart-container relative z-10 h-full w-full bg-transparent"
      />

      {isLoading && firstLoadRef.current && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-gray-900/60">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-400" />
            <div className="text-sm text-white">
              Loading OHLC data from backend…
            </div>
          </div>
        </div>
      )}

      {tooltip && (
        <div
          className="pointer-events-none absolute rounded-lg border border-gray-700 bg-black/90 px-3 py-2 text-xs text-white shadow-lg"
          style={{
            left: `${tooltip.x + 10}px`,
            top: `${tooltip.y - 10}px`,
            zIndex: 5,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="mb-1 font-semibold">
            {tooltip.data.type === "DEV_BUY" ? "Dev Buy" : "Dev Sell"} @{" "}
            {new Date(tooltip.data.timestamp)
              .toISOString()
              .replace("T", " ")
              .slice(0, 19)}
          </div>
          <div className="text-gray-300">
            Price: ${parseFloat(tooltip.data.price).toFixed(2)} USD
            <br />
            Amount: {formatTokenAmount(tooltip.data.amount)}
            <br />
            Total USD: {formatNumber(tooltip.data.totalUSD)}
            <br />
            <span className="font-mono text-gray-400">
              {shortAddress(tooltip.data.maker)}
            </span>
          </div>
        </div>
      )}

      {!isLoading && error && (
        <div className="absolute bottom-2 left-2 z-40 rounded bg-red-900/90 px-2 py-1 text-xs text-white">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
};

export default BackendOHLCChart;
