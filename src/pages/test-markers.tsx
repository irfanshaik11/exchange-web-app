import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';

export default function TestMarkers() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const [markersStatus, setMarkersStatus] = useState<string>('Initializing...');
  const [markerPositions, setMarkerPositions] = useState<Array<{ x: number; y: number; marker: any }>>([]);
  const [hoveredMarker, setHoveredMarker] = useState<{ x: number; y: number; marker: any } | null>(null);

  // We'll keep candles + generated markers in refs/state so we can recompute
  const candlesRef = useRef<
    Array<{ time: UTCTimestamp; open: number; high: number; low: number; close: number }>
  >([]);
  const [testMarkers, setTestMarkers] = useState<any[]>([]);
  const testMarkersRef = useRef<any[]>([]);

  // Helper to calculate screen-space marker positions for overlay
  const calculatePositions = useCallback(() => {
    if (!chartRef.current || !seriesRef.current || !chartContainerRef.current) return;
    if (testMarkersRef.current.length === 0) return;

    const timeScale = chartRef.current.timeScale();

    const newPositions = testMarkersRef.current
      .map((marker) => {
        const timeCoord = timeScale.timeToCoordinate(marker.time);
        const priceCoord = seriesRef.current!.priceToCoordinate(marker.price);

        if (timeCoord === null || priceCoord === null) {
          return null;
        }

        return {
          x: timeCoord,
          y: priceCoord - 20, // Offset above the bar
          marker,
        };
      })
      .filter(Boolean) as Array<{ x: number; y: number; marker: any }>;

    setMarkerPositions(newPositions);
    setMarkersStatus(`✅ Calculated ${newPositions.length} overlay marker(s)`);
  }, []); // Stable reference - we'll access testMarkers from ref in the implementation

  // Initialize chart + data once
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 1. Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 600,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2B2B43' },
        horzLines: { color: '#2B2B43' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // 2. Add candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      wickUpColor: '#26a69a',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // 3. Generate candle data aligned to minute boundaries
    const nowRaw = Math.floor(Date.now() / 1000);
    const nowAligned = nowRaw - (nowRaw % 60); // floor to start of current minute
    const sampleCandles: Array<{
      time: UTCTimestamp;
      open: number;
      high: number;
      low: number;
      close: number;
    }> = [];

    let price = 100;
    // make 21 candles, 1-minute apart
    for (let i = 20; i >= 0; i--) {
      const t = (nowAligned - i * 60) as UTCTimestamp;
      price += (Math.random() - 0.5) * 2;

      sampleCandles.push({
        time: t,
        open: price - 0.5,
        high: price + 1,
        low: price - 1,
        close: price,
      });
    }

    candlesRef.current = sampleCandles;
    candlestickSeries.setData(sampleCandles);

    // 4. Build the test markers.
    const secondsPerBar = 60; // 1m bars
    // We'll pick candle indices we KNOW exist to avoid mismatch.
    const midIdx = Math.floor(sampleCandles.length * 0.5);
    const lateIdx = Math.floor(sampleCandles.length * 0.8);

    const midCandle = sampleCandles[midIdx];
    const lateCandle = sampleCandles[lateIdx];

    const test = [
      {
        // align marker time EXACTLY to candle time
        time: midCandle.time,
        position: 'belowBar' as const,
        color: '#7bdc6e', // green-ish
        text: 'DB',
        isBuy: true,
        price: midCandle.close,
      },
      {
        time: lateCandle.time,
        position: 'aboveBar' as const,
        color: '#ef5350', // red-ish
        text: 'DS',
        isBuy: false,
        price: lateCandle.close,
      },
    ];

    setTestMarkers(test);
    testMarkersRef.current = test;
    setMarkersStatus('Chart + candles ready, markers built');

    // 5. Subscribe to timescale changes so we can keep overlays in sync on zoom/pan/resize
    const ts = chart.timeScale();
    const handleLogicalRangeChange = () => {
      calculatePositions();
    };
    const handleSizeChange = () => {
      calculatePositions();
    };

    (ts as any).subscribeVisibleLogicalRangeChange?.(handleLogicalRangeChange);
    (ts as any).subscribeSizeChange?.(handleSizeChange);

    // Also update on window resize (container might change width)
    const handleWindowResize = () => {
      if (!chartContainerRef.current || !chartRef.current) return;
      const { clientWidth } = chartContainerRef.current;

      chartRef.current.applyOptions({
        width: clientWidth,
        height: 600,
      });

      calculatePositions();
    };

    window.addEventListener('resize', handleWindowResize);

    // Cleanup
    return () => {
      (ts as any).unsubscribeVisibleLogicalRangeChange?.(handleLogicalRangeChange);
      (ts as any).unsubscribeSizeChange?.(handleSizeChange);
      window.removeEventListener('resize', handleWindowResize);
      chart.remove();
    };
   }, []); // No dependencies - only run once

  // Recalculate positions when markers change or after chart updates
  useEffect(() => {
    if (testMarkers.length === 0) return;
    
    // Small delay to ensure chart is ready
    const timeout = setTimeout(() => {
      calculatePositions();
    }, 100);
    
    return () => clearTimeout(timeout);
  }, [testMarkers.length]); // Only depend on length, not the full array

  return (
    <div className="min-h-screen bg-gray-900 p-8 text-white">
      <div className="max-w-7xl mx-auto space-y-4">
        <h1 className="text-3xl font-bold">Lightweight Charts Markers Test</h1>

        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-xl mb-2">Status:</h2>
          <p className="text-green-400 font-mono">{markersStatus}</p>
        </div>

        {/* wrapper that is RELATIVE and has NO padding offset around the chart canvas + overlays */}
        <div className="bg-gray-800 rounded-lg relative" style={{ width: '100%', height: '600px' }}>
          {/* chart mounts here, positioned at top-left of this relative parent */}
          <div
            ref={chartContainerRef}
            className="absolute left-0 top-0 w-full h-full"
          />

          {/* HTML Overlay Markers */}
          {markerPositions.map((pos, idx) => (
            <div
              key={`marker-${idx}`}
              className="absolute pointer-events-auto cursor-pointer transition-transform hover:scale-110"
              style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                transform: 'translate(-50%, -50%)',
                zIndex: 10,
              }}
              onMouseEnter={() => setHoveredMarker(pos)}
              onMouseLeave={() => setHoveredMarker(null)}
            >
              <div
                className="flex items-center justify-center font-bold leading-none rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
                style={{
                  width: '28px',
                  height: '28px',
                  backgroundColor: pos.marker.isBuy ? '#7bdc6e' : '#ef5350',
                  border: '1px solid rgba(0,0,0,0.4)',
                  color: '#0d1222',
                  fontSize: '11px',
                }}
              >
                {pos.marker.text}
              </div>
            </div>
          ))}

          {/* Tooltip */}
          {hoveredMarker && (
            <div
              className="absolute pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg border border-gray-700 z-20"
              style={{
                left: `${hoveredMarker.x + 20}px`,
                top: `${hoveredMarker.y}px`,
                transform: 'translateY(-50%)',
              }}
            >
              <div className="font-semibold mb-1">
                {hoveredMarker.marker.isBuy ? 'Dev Buy' : 'Dev Sell'} @ {new Date(hoveredMarker.marker.time * 1000).toLocaleTimeString()}
              </div>
              <div className="text-gray-300">
                Price: ${hoveredMarker.marker.price.toFixed(2)} USD
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-2">Expected:</h3>
          <ul className="list-disc list-inside space-y-1 text-gray-300">
            <li>Green circle with "DB" centered over a candle around the middle</li>
            <li>Red circle with "DS" centered over a later candle</li>
            <li>Overlay pills stay aligned on zoom/pan/resize</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
