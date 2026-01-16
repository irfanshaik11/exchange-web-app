import React, { useEffect, useRef, useMemo, useState } from 'react';
import { HiOutlineRefresh } from 'react-icons/hi';

const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  border: "#2A2B33",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  green: "#4ADE80",
  red: "#F87171",
  blue: "#60A5FA",
  yellow: "#FBBF24",
  cyan: "#22D3EE",
  purple: "#818CF8",
  orange: "#FB923C",
  pink: "#F472B6",
};

// Color palette for multi-series
const SERIES_COLORS = [
  '#60A5FA', // blue
  '#22D3EE', // cyan
  '#FBBF24', // yellow
  '#818CF8', // purple
  '#FB923C', // orange
  '#F472B6', // pink
  '#4ADE80', // green
  '#F87171', // red
];

interface PricePoint {
  time: number; // Unix timestamp in milliseconds
  price: number; // 0-1 scale
}

// New interface for multi-series data
export interface ChartSeries {
  id: string;
  label: string;
  data: PricePoint[];
  color?: string;
  currentPrice?: number;
}

interface PolymarketChartProps {
  priceHistory?: PricePoint[] | undefined;
  currentPrice?: number;
  marketTitle: string;
  isLoading?: boolean;
  height?: number;
  selectedInterval: string;
  onIntervalChange: (interval: string) => void;
  // New props for multi-series
  series?: ChartSeries[];
  isMultiSeries?: boolean;
}

const INTERVALS = ['1H', '6H', '1D', '1W', '1M', 'ALL'];

const PolymarketChart: React.FC<PolymarketChartProps> = ({
  priceHistory,
  currentPrice = 0,
  marketTitle,
  isLoading = false,
  height = 300,
  selectedInterval,
  onIntervalChange,
  series,
  isMultiSeries = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: height });
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; price: number; time: number; seriesLabel?: string; seriesColor?: string } | null>(null);

  // Get time filter based on interval
  const getStartTime = (interval: string): number => {
    const now = Date.now();
    switch (interval) {
      case '1H': return now - 60 * 60 * 1000;
      case '6H': return now - 6 * 60 * 60 * 1000;
      case '1D': return now - 24 * 60 * 60 * 1000;
      case '1W': return now - 7 * 24 * 60 * 60 * 1000;
      case '1M': return now - 30 * 24 * 60 * 60 * 1000;
      case 'ALL':
      default: return 0;
    }
  };

  // Filter and prepare multi-series data
  const filteredSeries = useMemo(() => {
    if (!isMultiSeries || !series || series.length === 0) return [];

    const startTime = getStartTime(selectedInterval);
    return series.map((s, idx) => ({
      ...s,
      color: s.color || SERIES_COLORS[idx % SERIES_COLORS.length],
      filteredData: s.data
        .filter(p => p.time >= startTime)
        .sort((a, b) => a.time - b.time),
    }));
  }, [series, isMultiSeries, selectedInterval]);

  // Filter single-series data (backwards compatibility)
  const filteredData = useMemo(() => {
    if (isMultiSeries || !priceHistory || priceHistory.length === 0) return [];

    const startTime = getStartTime(selectedInterval);
    return priceHistory.filter(p => p.time >= startTime).sort((a, b) => a.time - b.time);
  }, [priceHistory, selectedInterval, isMultiSeries]);

  // Handle resize - use actual container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight || height,
        });
      }
    };

    // Small delay to ensure container has rendered
    const timeoutId = setTimeout(updateDimensions, 50);
    window.addEventListener('resize', updateDimensions);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateDimensions);
    };
  }, [height, isMultiSeries]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = AX.bg;
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    const padding = { top: 20, right: 60, bottom: 30, left: 10 };
    const chartWidth = dimensions.width - padding.left - padding.right;
    const chartHeight = dimensions.height - padding.top - padding.bottom;

    // Draw grid lines
    ctx.strokeStyle = AX.border;
    ctx.lineWidth = 0.5;

    // Horizontal grid lines (price levels: 0%, 25%, 50%, 75%, 100%)
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(dimensions.width - padding.right, y);
      ctx.stroke();

      // Price labels
      const price = 100 - (i * 25);
      ctx.fillStyle = AX.muted;
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${price}%`, dimensions.width - padding.right + 8, y + 4);
    }

    // Handle multi-series or single-series data
    const hasMultiSeriesData = isMultiSeries && filteredSeries.length > 0 && filteredSeries.some(s => s.filteredData.length > 0);
    const hasSingleSeriesData = !isMultiSeries && filteredData && filteredData.length > 0;

    if (!hasMultiSeriesData && !hasSingleSeriesData) {
      // No data message
      ctx.fillStyle = AX.muted;
      ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No price history available', dimensions.width / 2, dimensions.height / 2);
      return;
    }

    // Calculate time range across all series
    let allTimes: number[] = [];
    if (hasMultiSeriesData) {
      filteredSeries.forEach(s => {
        allTimes = allTimes.concat(s.filteredData.map(p => p.time));
      });
    } else {
      allTimes = filteredData.map(p => p.time);
    }
    allTimes = allTimes.sort((a, b) => a - b);
    const minTime = allTimes[0];
    const maxTime = allTimes[allTimes.length - 1];
    const timeRange = maxTime - minTime || 1;

    // Scale functions
    const scaleX = (time: number) => padding.left + ((time - minTime) / timeRange) * chartWidth;
    const scaleY = (price: number) => padding.top + (1 - price) * chartHeight;

    if (hasMultiSeriesData) {
      // MULTI-SERIES RENDERING
      // Draw each series line
      filteredSeries.forEach((seriesItem) => {
        if (seriesItem.filteredData.length === 0) return;

        const color = seriesItem.color || AX.blue;

        // Draw line
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        seriesItem.filteredData.forEach((point, i) => {
          const x = scaleX(point.time);
          const y = scaleY(point.price);
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();

        // Draw current price dot
        const lastPoint = seriesItem.filteredData[seriesItem.filteredData.length - 1];
        const x = scaleX(lastPoint.time);
        const y = scaleY(lastPoint.price);

        // Glow effect
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = color + '40'; // Add transparency
        ctx.fill();

        // Dot
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
    } else {
      // SINGLE-SERIES RENDERING (original logic)
      ctx.strokeStyle = AX.blue;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      filteredData.forEach((point, i) => {
        const x = scaleX(point.time);
        const y = scaleY(point.price);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw gradient fill under the line
      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
      gradient.addColorStop(0, 'rgba(96, 165, 250, 0.3)');
      gradient.addColorStop(1, 'rgba(96, 165, 250, 0.0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      filteredData.forEach((point, i) => {
        const x = scaleX(point.time);
        const y = scaleY(point.price);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.lineTo(scaleX(filteredData[filteredData.length - 1].time), padding.top + chartHeight);
      ctx.lineTo(scaleX(filteredData[0].time), padding.top + chartHeight);
      ctx.closePath();
      ctx.fill();

      // Draw current price dot
      const lastPoint = filteredData[filteredData.length - 1];
      const x = scaleX(lastPoint.time);
      const y = scaleY(lastPoint.price);

      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(96, 165, 250, 0.3)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = AX.blue;
      ctx.fill();
    }

    // Draw time labels
    ctx.fillStyle = AX.muted;
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';

    const numLabels = 5;
    for (let i = 0; i <= numLabels; i++) {
      const time = minTime + (timeRange * i) / numLabels;
      const x = scaleX(time);
      const date = new Date(time);

      let label: string;
      if (selectedInterval === '1H' || selectedInterval === '6H') {
        label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (selectedInterval === '1D') {
        label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }

      ctx.fillText(label, x, dimensions.height - 8);
    }

  }, [filteredData, filteredSeries, dimensions, selectedInterval, isMultiSeries]);

  // Handle mouse hover
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!filteredData || filteredData.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const padding = { left: 10, right: 60 };
    const chartWidth = dimensions.width - padding.left - padding.right;

    const minTime = filteredData[0].time;
    const maxTime = filteredData[filteredData.length - 1].time;
    const timeRange = maxTime - minTime || 1;

    const hoverTime = minTime + ((x - padding.left) / chartWidth) * timeRange;

    // Find closest point
    let closestPoint = filteredData[0];
    let minDist = Math.abs(closestPoint.time - hoverTime);

    for (const point of filteredData) {
      const dist = Math.abs(point.time - hoverTime);
      if (dist < minDist) {
        minDist = dist;
        closestPoint = point;
      }
    }

    const scaleX = (time: number) => padding.left + ((time - minTime) / timeRange) * chartWidth;
    const scaleY = (price: number) => 20 + (1 - price) * (dimensions.height - 50);

    setHoveredPoint({
      x: scaleX(closestPoint.time),
      y: scaleY(closestPoint.price),
      price: closestPoint.price,
      time: closestPoint.time,
    });
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height, backgroundColor: AX.bg }}
      >
        <HiOutlineRefresh className="w-6 h-6 animate-spin" style={{ color: AX.muted }} />
      </div>
    );
  }

  // Calculate heights for header elements
  const legendHeight = isMultiSeries && filteredSeries.length > 0 ? 36 : 0;
  const intervalBarHeight = 40;
  const canvasHeight = Math.max(height - legendHeight - intervalBarHeight, 150);

  return (
    <div className="flex flex-col" style={{ backgroundColor: AX.bg, height, overflow: 'hidden' }}>
      {/* Multi-series Legend (shown above chart when multi-series) */}
      {isMultiSeries && filteredSeries.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 flex-shrink-0" style={{ borderBottom: `1px solid ${AX.border}` }}>
          {filteredSeries.map((s, idx) => {
            const lastPrice = s.filteredData.length > 0 ? s.filteredData[s.filteredData.length - 1].price : s.currentPrice || 0;
            return (
              <div key={s.id} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: s.color || SERIES_COLORS[idx % SERIES_COLORS.length] }}
                />
                <span className="text-xs" style={{ color: AX.text }}>
                  {s.label}
                </span>
                <span className="text-xs font-medium" style={{ color: s.color || SERIES_COLORS[idx % SERIES_COLORS.length] }}>
                  {(lastPrice * 100).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Interval selector */}
      <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0" style={{ borderBottom: `1px solid ${AX.border}` }}>
        {INTERVALS.map((interval) => (
          <button
            key={interval}
            onClick={() => onIntervalChange(interval)}
            className="px-2.5 py-1 text-xs font-medium rounded transition-colors"
            style={{
              backgroundColor: selectedInterval === interval ? AX.border : 'transparent',
              color: selectedInterval === interval ? AX.text : AX.muted,
            }}
          >
            {interval}
          </button>
        ))}
        <div className="flex-1" />
        {/* Current price display (only for single-series) */}
        {!isMultiSeries && (
          <span className="text-sm font-medium" style={{ color: AX.blue }}>
            {(currentPrice * 100).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="relative flex-1" style={{ minHeight: 150 }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />

        {/* Hover tooltip */}
        {hoveredPoint && (
          <>
            {/* Vertical line */}
            <div
              className="absolute top-5 pointer-events-none"
              style={{
                left: hoveredPoint.x,
                height: dimensions.height - 50,
                width: 1,
                backgroundColor: AX.muted,
                opacity: 0.3,
              }}
            />
            {/* Tooltip */}
            <div
              className="absolute pointer-events-none px-2 py-1 rounded text-xs"
              style={{
                left: hoveredPoint.x + 10,
                top: hoveredPoint.y - 30,
                backgroundColor: AX.surface,
                border: `1px solid ${AX.border}`,
                color: AX.text,
              }}
            >
              <div style={{ color: AX.blue }}>{(hoveredPoint.price * 100).toFixed(1)}%</div>
              <div style={{ color: AX.muted }}>
                {new Date(hoveredPoint.time).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
            {/* Dot */}
            <div
              className="absolute pointer-events-none rounded-full"
              style={{
                left: hoveredPoint.x - 4,
                top: hoveredPoint.y - 4,
                width: 8,
                height: 8,
                backgroundColor: AX.blue,
              }}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default PolymarketChart;
