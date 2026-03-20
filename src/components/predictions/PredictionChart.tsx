import React, { useEffect, useRef, useMemo } from 'react';

interface PredictionChartProps {
  ticker: string;
  yesPrice: number;
  noPrice: number;
  height?: string;
  className?: string;
  priceHistory?: Array<{ time: number; price: number }>;
}

// Generate simulated historical data based on current price
function generateSimulatedHistory(
  currentPrice: number,
  points: number = 100,
  volatility: number = 0.02
): Array<{ time: number; price: number }> {
  const now = Date.now();
  const intervalMs = 3600000; // 1 hour intervals
  const result: Array<{ time: number; price: number }> = [];

  // Start from a random price around current price
  let price = currentPrice * (0.85 + Math.random() * 0.3);

  for (let i = points - 1; i >= 0; i--) {
    const time = now - i * intervalMs;

    // Random walk towards current price with mean reversion
    const drift = (currentPrice - price) * 0.08;
    const change = (Math.random() - 0.5) * volatility + drift;

    price = Math.max(0.01, Math.min(0.99, price + change));

    // Make the last point exactly the current price
    if (i === 0) price = currentPrice;

    result.push({ time, price });
  }

  return result;
}

const PredictionChart: React.FC<PredictionChartProps> = ({
  ticker,
  yesPrice,
  noPrice,
  height = '300px',
  className = '',
  priceHistory,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate or use provided history data
  const chartData = useMemo(() => {
    if (priceHistory && priceHistory.length > 0) {
      return priceHistory;
    }
    return generateSimulatedHistory(yesPrice);
  }, [yesPrice, priceHistory]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size with device pixel ratio for sharp rendering
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Colors
    const bgColor = '#111214';
    const gridColor = '#1E1F26';
    const textColor = '#6B7280';
    const lineColor = '#22C55E';
    const fillStart = 'rgba(34, 197, 94, 0.3)';
    const fillEnd = 'rgba(34, 197, 94, 0.02)';
    const midLineColor = '#4B5563';

    // Clear canvas
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Padding
    const paddingLeft = 45;
    const paddingRight = 15;
    const paddingTop = 20;
    const paddingBottom = 30;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Draw grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    // Horizontal grid lines (at 0%, 25%, 50%, 75%, 100%)
    for (let i = 0; i <= 4; i++) {
      const y = paddingTop + (chartHeight * i) / 4;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();
    }

    // Draw 50% reference line (dashed)
    const midY = paddingTop + chartHeight / 2;
    ctx.strokeStyle = midLineColor;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, midY);
    ctx.lineTo(width - paddingRight, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Y-axis labels
    ctx.fillStyle = textColor;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= 4; i++) {
      const y = paddingTop + (chartHeight * i) / 4;
      const value = 100 - i * 25;
      ctx.fillText(`${value}%`, paddingLeft - 8, y);
    }

    // Draw data if available
    if (chartData.length > 0) {
      const minTime = chartData[0].time;
      const maxTime = chartData[chartData.length - 1].time;
      const timeRange = maxTime - minTime || 1;

      // Create gradient for fill
      const gradient = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartHeight);
      gradient.addColorStop(0, fillStart);
      gradient.addColorStop(1, fillEnd);

      // Draw filled area
      ctx.beginPath();
      ctx.moveTo(paddingLeft, paddingTop + chartHeight);

      chartData.forEach((point, i) => {
        const x = paddingLeft + ((point.time - minTime) / timeRange) * chartWidth;
        const y = paddingTop + (1 - point.price) * chartHeight;

        if (i === 0) {
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.lineTo(paddingLeft + chartWidth, paddingTop + chartHeight);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Draw line
      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      chartData.forEach((point, i) => {
        const x = paddingLeft + ((point.time - minTime) / timeRange) * chartWidth;
        const y = paddingTop + (1 - point.price) * chartHeight;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Draw current price dot
      const lastPoint = chartData[chartData.length - 1];
      const lastX = paddingLeft + chartWidth;
      const lastY = paddingTop + (1 - lastPoint.price) * chartHeight;

      // Glow effect
      ctx.beginPath();
      ctx.arc(lastX, lastY, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();

      // Current price label
      ctx.fillStyle = lineColor;
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(lastPoint.price * 100)}%`, lastX - 35, lastY - 12);
    }

    // X-axis time labels
    ctx.fillStyle = textColor;
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const timeLabels = ['4d ago', '3d ago', '2d ago', '1d ago', 'Now'];
    timeLabels.forEach((label, i) => {
      const x = paddingLeft + (chartWidth * i) / (timeLabels.length - 1);
      ctx.fillText(label, x, height - paddingBottom + 10);
    });

  }, [chartData]);

  return (
    <div
      className={`relative ${className}`}
      style={{ height, backgroundColor: '#111214', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default PredictionChart;
