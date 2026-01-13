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
};

interface PricePoint {
  time: number; // Unix timestamp in milliseconds
  price: number; // 0-1 scale
}

interface PolymarketChartProps {
  priceHistory: PricePoint[] | undefined;
  currentPrice: number;
  marketTitle: string;
  isLoading?: boolean;
  height?: number;
  selectedInterval: string;
  onIntervalChange: (interval: string) => void;
}

const INTERVALS = ['1H', '6H', '1D', '1W', '1M', 'ALL'];

const PolymarketChart: React.FC<PolymarketChartProps> = ({
  priceHistory,
  currentPrice,
  marketTitle,
  isLoading = false,
  height = 300,
  selectedInterval,
  onIntervalChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: height });
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; price: number; time: number } | null>(null);

  // Filter data based on selected interval
  const filteredData = useMemo(() => {
    if (!priceHistory || priceHistory.length === 0) return [];

    const now = Date.now();
    let startTime = 0;

    switch (selectedInterval) {
      case '1H':
        startTime = now - 60 * 60 * 1000;
        break;
      case '6H':
        startTime = now - 6 * 60 * 60 * 1000;
        break;
      case '1D':
        startTime = now - 24 * 60 * 60 * 1000;
        break;
      case '1W':
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case '1M':
        startTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case 'ALL':
      default:
        startTime = 0;
        break;
    }

    return priceHistory.filter(p => p.time >= startTime).sort((a, b) => a.time - b.time);
  }, [priceHistory, selectedInterval]);

  // Handle resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: height,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [height]);

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

    if (!filteredData || filteredData.length === 0) {
      // No data message
      ctx.fillStyle = AX.muted;
      ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No price history available', dimensions.width / 2, dimensions.height / 2);
      return;
    }

    // Calculate scales
    const minTime = filteredData[0].time;
    const maxTime = filteredData[filteredData.length - 1].time;
    const timeRange = maxTime - minTime || 1;

    // Scale functions
    const scaleX = (time: number) => padding.left + ((time - minTime) / timeRange) * chartWidth;
    const scaleY = (price: number) => padding.top + (1 - price) * chartHeight;

    // Draw line chart
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
    // Close the path
    ctx.lineTo(scaleX(filteredData[filteredData.length - 1].time), padding.top + chartHeight);
    ctx.lineTo(scaleX(filteredData[0].time), padding.top + chartHeight);
    ctx.closePath();
    ctx.fill();

    // Draw current price dot
    if (filteredData.length > 0) {
      const lastPoint = filteredData[filteredData.length - 1];
      const x = scaleX(lastPoint.time);
      const y = scaleY(lastPoint.price);

      // Glow effect
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(96, 165, 250, 0.3)';
      ctx.fill();

      // Dot
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

  }, [filteredData, dimensions, selectedInterval]);

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

  return (
    <div className="flex flex-col" style={{ backgroundColor: AX.bg }}>
      {/* Interval selector */}
      <div className="flex items-center gap-1 px-3 py-2" style={{ borderBottom: `1px solid ${AX.border}` }}>
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
        {/* Current price display */}
        <span className="text-sm font-medium" style={{ color: AX.blue }}>
          {(currentPrice * 100).toFixed(1)}%
        </span>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="relative" style={{ height }}>
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
                height: height - 50,
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
