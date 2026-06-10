// src/components/perpetuals/PerpChart.tsx
// TradingView Advanced Chart for Hyperliquid perpetuals.
// Uses the same charting_library widget + dark theme as AdvancedOHLCChart
// but with a clean USD price datafeed — no market cap conversion, no Solana logic.

import React, { useEffect, useRef, useCallback } from "react";
import type { HyperliquidOHLCItem } from "../../hooks/useHyperliquidCandles";
import { subscribeToChannel } from "../../hooks/useHyperliquidWebSocket";

declare const TradingView: any;

// Map TV resolutions to Hyperliquid interval strings
const RESOLUTION_TO_HL_INTERVAL: Record<string, string> = {
  "1": "1m",
  "3": "3m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "120": "2h",
  "240": "4h",
  "480": "8h",
  "720": "12h",
  "1D": "1d",
  "3D": "3d",
  "1W": "1w",
  "1M": "1M",
};

interface PerpChartProps {
  coin: string;
  tokenName: string;
  /** Initial candle data from useHyperliquidCandles hook */
  preloadedData?: HyperliquidOHLCItem[];
  height?: string | number;
  width?: string | number;
}

/**
 * Determine TradingView pricescale based on price magnitude.
 * pricescale = 10^N where N = decimal places to show.
 */
function getPricescale(price: number): number {
  if (price >= 10000) return 10;       // BTC: $71,785.1
  if (price >= 100) return 100;        // ETH/SOL: $1,900.25
  if (price >= 1) return 1000;         // LINK: $15.123
  if (price >= 0.01) return 10000;     // DOGE: $0.1523
  if (price >= 0.0001) return 1000000; // SHIB: $0.000012
  return 100000000;                    // PEPE: $0.00000001
}

/**
 * Fetch candles from Hyperliquid REST API for TradingView getBars.
 */
async function fetchHlCandles(
  coin: string,
  interval: string,
  startTime: number,
  endTime: number
): Promise<HyperliquidOHLCItem[]> {
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: { coin, interval, startTime, endTime },
    }),
  });
  if (!res.ok) return [];
  const raw = await res.json();
  if (!Array.isArray(raw)) return [];
  return raw.map((c: any) => ({
    unix_time: Math.floor(c.t / 1000),
    o: parseFloat(c.o),
    h: parseFloat(c.h),
    l: parseFloat(c.l),
    c: parseFloat(c.c),
    v_usd: parseFloat(c.v),
  }));
}

export default function PerpChart({
  coin,
  tokenName,
  preloadedData,
  height = "100%",
  width = "100%",
}: PerpChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const subscribedCallbackRef = useRef<((bar: any) => void) | null>(null);
  const wsUnsubRef = useRef<(() => void) | null>(null);
  const coinRef = useRef(coin);
  const preloadedRef = useRef(preloadedData);

  // Keep refs current
  useEffect(() => {
    coinRef.current = coin;
  }, [coin]);
  useEffect(() => {
    preloadedRef.current = preloadedData;
  }, [preloadedData]);

  // Load TradingView charting_library script
  const loadScript = useCallback(() => {
    return new Promise<void>((resolve) => {
      if (typeof TradingView !== "undefined" && TradingView.widget) {
        resolve();
        return;
      }

      const existing = document.querySelector(
        'script[src*="charting_library.standalone.js"]'
      );
      if (existing) {
        existing.addEventListener("load", () => resolve());
        if (typeof TradingView !== "undefined") resolve();
        return;
      }

      const script = document.createElement("script");
      script.src =
        "/charting_library/charting_library/charting_library.standalone.js";
      script.async = true;
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }, []);

  // Create widget
  useEffect(() => {
    if (!containerRef.current || !coin) return;

    let cancelled = false;

    (async () => {
      await loadScript();
      if (cancelled || !containerRef.current) return;
      if (typeof TradingView === "undefined" || !TradingView.widget) return;

      // Clean up previous widget
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch {}
        widgetRef.current = null;
      }

      // Build datafeed
      const datafeed = {
        onReady: (callback: any) => {
          setTimeout(() => {
            callback({
              supported_resolutions: [
                "1",
                "3",
                "5",
                "15",
                "30",
                "60",
                "120",
                "240",
                "480",
                "720",
                "1D",
                "3D",
                "1W",
                "1M",
              ],
              supports_marks: false,
              supports_timescale_marks: false,
              supports_time: true,
            });
          }, 0);
        },

        searchSymbols: (
          _input: string,
          _exchange: string,
          _type: string,
          onResult: any
        ) => {
          onResult([]);
        },

        resolveSymbol: (
          _symbolName: string,
          onResolve: any,
          _onError: any
        ) => {
          setTimeout(() => {
            onResolve({
              name: `${coinRef.current}-PERP`,
              full_name: `${coinRef.current}-PERP`,
              description: `${coinRef.current} Perpetual`,
              type: "crypto",
              session: "24x7",
              timezone: "Etc/UTC",
              exchange: "Hyperliquid",
              listed_exchange: "Hyperliquid",
              minmov: 1,
              pricescale: preloadedRef.current?.length
                ? getPricescale(preloadedRef.current[preloadedRef.current.length - 1].c)
                : coinRef.current === "BTC" ? 10 : coinRef.current === "ETH" ? 100 : 10000,
              has_intraday: true,
              has_seconds: false,
              has_daily: true,
              has_weekly_and_monthly: true,
              supported_resolutions: [
                "1",
                "3",
                "5",
                "15",
                "30",
                "60",
                "120",
                "240",
                "480",
                "720",
                "1D",
                "3D",
                "1W",
                "1M",
              ],
              volume_precision: 2,
              data_status: "streaming",
              format: "price",
            });
          }, 0);
        },

        getBars: async (
          _symbolInfo: any,
          resolution: string,
          periodParams: any,
          onResult: any,
          _onError: any
        ) => {
          const hlInterval =
            RESOLUTION_TO_HL_INTERVAL[resolution] || "1h";
          const fromMs = periodParams.from * 1000;
          const toMs = periodParams.to * 1000;

          // Try preloaded data first (for initial load with 1h interval)
          if (
            hlInterval === "1h" &&
            preloadedRef.current?.length &&
            periodParams.firstDataRequest
          ) {
            const bars = preloadedRef.current
              .filter(
                (c) =>
                  c.unix_time * 1000 >= fromMs &&
                  c.unix_time * 1000 <= toMs
              )
              .map((c) => ({
                time: c.unix_time * 1000,
                open: c.o,
                high: c.h,
                low: c.l,
                close: c.c,
                volume: c.v_usd,
              }));

            if (bars.length > 0) {
              onResult(bars, { noData: false });
              return;
            }
          }

          // Fetch from Hyperliquid API
          try {
            const candles = await fetchHlCandles(
              coinRef.current,
              hlInterval,
              fromMs,
              toMs
            );
            const bars = candles.map((c) => ({
              time: c.unix_time * 1000,
              open: c.o,
              high: c.h,
              low: c.l,
              close: c.c,
              volume: c.v_usd,
            }));
            onResult(bars, { noData: bars.length === 0 });
          } catch {
            onResult([], { noData: true });
          }
        },

        subscribeBars: (
          _symbolInfo: any,
          resolution: string,
          onRealtimeCallback: (bar: any) => void,
          _subscriberUID: string
        ) => {
          subscribedCallbackRef.current = onRealtimeCallback;

          // Clean up previous WS subscription
          if (wsUnsubRef.current) {
            wsUnsubRef.current();
            wsUnsubRef.current = null;
          }

          // Subscribe to Hyperliquid WS candles at the current resolution
          const hlInterval = RESOLUTION_TO_HL_INTERVAL[resolution] || "1h";
          wsUnsubRef.current = subscribeToChannel(
            "candle",
            (msg) => {
              const data = msg.data;
              if (!data || !subscribedCallbackRef.current) return;
              if (data.s?.toUpperCase() !== coinRef.current.toUpperCase()) return;

              const bar = {
                time: Math.floor(data.t / 1000) * 1000,
                open: parseFloat(data.o),
                high: parseFloat(data.h),
                low: parseFloat(data.l),
                close: parseFloat(data.c),
                volume: parseFloat(data.v),
              };
              subscribedCallbackRef.current(bar);
            },
            { type: "candle", coin: coinRef.current, interval: hlInterval }
          );
        },

        unsubscribeBars: (_subscriberUID: string) => {
          subscribedCallbackRef.current = null;
          if (wsUnsubRef.current) {
            wsUnsubRef.current();
            wsUnsubRef.current = null;
          }
        },
      };

      const widget = new TradingView.widget({
        debug: false,
        fullscreen: false,
        symbol: `${coin}-PERP`,
        datafeed,
        interval: "1", // 1m default
        container: containerRef.current,
        library_path: "/charting_library/charting_library/",
        locale: "en",
        autosize: true,
        disabled_features: [
          "use_localstorage_for_settings",
        ],
        enabled_features: [
          "study_templates",
          "side_toolbar_in_fullscreen_mode",
          "header_widget",
          "header_chart_type",
          "header_resolutions",
          "header_screenshot",
          "header_saveload",
          "header_undo_redo",
          "header_compare",
          "header_symbol_search",
          "header_interval_dialog_button",
          "show_interval_dialog_on_key_press",
          "timeframes_toolbar",
          "left_toolbar",
          "control_bar",
          "edit_buttons_in_legend",
          "context_menus",
          "display_market_status",
        ],
        charts_storage_url: "https://saveload.tradingview.com",
        charts_storage_api_version: "1.1",
        client_id: "tradingview.com",
        user_id: "public_user_id",
        // theme:"dark" is needed for the CHROME (toolbars/menus/scales) — without
        // it they render light. But the dark theme also re-applies its stock
        // candle palette AFTER constructor `overrides`, so the brand colors are
        // re-asserted via settings_overrides (applied after theme) and again in
        // onChartReady via changeTheme().then(applyOverrides).
        theme: "dark",
        settings_overrides: {
          "paneProperties.background": "#0c0d10",
          "paneProperties.backgroundType": "solid",
          "paneProperties.backgroundGradientStartColor": "#0c0d10",
          "paneProperties.backgroundGradientEndColor": "#0c0d10",
          "mainSeriesProperties.candleStyle.upColor": "#18c48c",
          "mainSeriesProperties.candleStyle.downColor": "#ef4444",
          "mainSeriesProperties.candleStyle.borderUpColor": "#18c48c",
          "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
          "mainSeriesProperties.candleStyle.wickUpColor": "#18c48c",
          "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444",
        },
        time_frames: [
          { text: "1D", resolution: "5", description: "1 Day" },
          { text: "7D", resolution: "30", description: "7 Days" },
          { text: "30D", resolution: "240", description: "30 Days" },
          { text: "180D", resolution: "1D", description: "180 Days" },
        ],
        // Perps-only chrome theme — themed.css belongs to the Solana chart
        // (AdvancedOHLCChart) and must keep its original look.
        custom_css_url: "/charting_library/perp-themed.css",
        loading_screen: { backgroundColor: "transparent" },
        overrides: {
          "paneProperties.background": "#0c0d10",
          "paneProperties.backgroundType": "solid",
          "paneProperties.backgroundGradientStartColor": "#0c0d10",
          "paneProperties.backgroundGradientEndColor": "#0c0d10",
          "paneProperties.vertGridProperties.color": "#1E1F21",
          "paneProperties.horzGridProperties.color": "#1E1F21",
          "symbolWatermarkProperties.transparency": 90,
          "scalesProperties.textColor": "#d1d4dc",
          "scalesProperties.lineColor": "#1E1F21",
          // Candle colors — match existing chart
          "mainSeriesProperties.candleStyle.upColor": "#18c48c",
          "mainSeriesProperties.candleStyle.downColor": "#ef4444",
          "mainSeriesProperties.candleStyle.borderUpColor": "#18c48c",
          "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
          "mainSeriesProperties.candleStyle.wickUpColor": "#18c48c",
          "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444",
          "mainSeriesProperties.candleStyle.drawWick": true,
          "mainSeriesProperties.candleStyle.drawBorder": true,
          "mainSeriesProperties.showCountdown": false,
          "paneProperties.legendProperties.showLegend": true,
          "paneProperties.legendProperties.showStudyArguments": true,
          "paneProperties.legendProperties.showStudyTitles": true,
          "paneProperties.legendProperties.showStudyValues": true,
          "paneProperties.legendProperties.showSeriesTitle": true,
          "paneProperties.legendProperties.showSeriesOHLC": true,
          "mainSeriesProperties.lineStyle.color": "#26a69a",
          "paneProperties.topMargin": 10,
          "paneProperties.bottomMargin": 10,
          "paneProperties.legendProperties.background": "#0c0d10",
          "paneProperties.legendProperties.color": "#d1d4dc",
          "paneProperties.vertGridProperties.style": 0,
          "paneProperties.horzGridProperties.style": 0,
          "scalesProperties.showLeftScale": false,
          "scalesProperties.showRightScale": true,
          "scalesProperties.showSeriesLastValue": true,
          "scalesProperties.showStudyLastValue": true,
          "scalesProperties.showSymbolLabels": false,
          "mainSeriesProperties.priceAxisProperties.autoScale": true,
          "mainSeriesProperties.priceAxisProperties.autoScaleDisabled": false,
          "mainSeriesProperties.visible": true,
        },
        studies_overrides: {
          "volume.volume.color.0": "#ef4444",
          "volume.volume.color.1": "#18c48c",
          "volume.volume.colorup": "#18c48c",
          "volume.volume.colordown": "#ef4444",
          "volume.volume.plot.color.0": "#ef4444",
          "volume.volume.plot.color.1": "#18c48c",
        },
      });

      widgetRef.current = widget;

      widget.onChartReady(() => {
        // Volume study is auto-created by TradingView when data includes volume.
        // Colors are set via studies_overrides — do NOT createStudy("Volume") again
        // or you get a duplicate volume pane.

        // The dark theme re-applies its stock candle palette asynchronously and
        // can land AFTER ready, wiping overrides. changeTheme() returns a
        // promise — re-asserting our colors in .then() guarantees final order.
        const BRAND_OVERRIDES = {
          "paneProperties.background": "#0c0d10",
          "paneProperties.backgroundType": "solid",
          "paneProperties.backgroundGradientStartColor": "#0c0d10",
          "paneProperties.backgroundGradientEndColor": "#0c0d10",
          "mainSeriesProperties.candleStyle.upColor": "#18c48c",
          "mainSeriesProperties.candleStyle.downColor": "#ef4444",
          "mainSeriesProperties.candleStyle.borderUpColor": "#18c48c",
          "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
          "mainSeriesProperties.candleStyle.wickUpColor": "#18c48c",
          "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444",
        };
        try {
          const apply = () => {
            try {
              widget.applyOverrides(BRAND_OVERRIDES);
            } catch (err) {
              console.warn("[PerpChart] applyOverrides failed:", err);
            }
          };
          if (typeof widget.changeTheme === "function") {
            widget.changeTheme("dark").then(apply).catch(apply);
          } else {
            apply();
          }
        } catch (err) {
          console.warn("[PerpChart] theme/override sequencing failed:", err);
        }
      });
    })();

    return () => {
      cancelled = true;
      subscribedCallbackRef.current = null;
      if (wsUnsubRef.current) {
        wsUnsubRef.current();
        wsUnsubRef.current = null;
      }
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch {}
        widgetRef.current = null;
      }
    };
  }, [coin, loadScript]);

  return (
    <div
      className="relative"
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        width: typeof width === "number" ? `${width}px` : width,
      }}
    >
      <div
        ref={containerRef}
        style={{ height: "100%", width: "100%", backgroundColor: "#0c0d10" }}
      />
      {/* Interstate watermark — pointer-transparent overlay (the chart renders
          in an iframe, so painting into its canvas isn't possible; a faint
          overlay reads as a background watermark without blocking interaction) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
      >
        <span
          style={{
            fontSize: "clamp(26px, 5vw, 56px)",
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "rgba(255, 255, 255, 0.04)",
            whiteSpace: "nowrap",
          }}
        >
          interstate.so
        </span>
      </div>
    </div>
  );
}
