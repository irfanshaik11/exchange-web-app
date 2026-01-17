import React, { useMemo } from 'react';

interface MiniSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showGradient?: boolean;
}

export default function MiniSparkline({
  data,
  width = 60,
  height = 24,
  color,
  showGradient = true,
}: MiniSparklineProps) {
  const { path, gradientPath, isPositive, changePercent } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: '', gradientPath: '', isPositive: true, changePercent: 0 };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    // Padding
    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Generate points
    const points = data.map((value, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((value - min) / range) * chartHeight;
      return { x, y };
    });

    // Create SVG path
    const pathD = points
      .map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');

    // Create gradient fill path (closed shape)
    const gradientD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`;

    const firstValue = data[0];
    const lastValue = data[data.length - 1];
    const change = ((lastValue - firstValue) / firstValue) * 100;

    return {
      path: pathD,
      gradientPath: gradientD,
      isPositive: lastValue >= firstValue,
      changePercent: change,
    };
  }, [data, width, height]);

  if (!data || data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ width, height, color: '#6b7280' }}
      >
        —
      </div>
    );
  }

  const lineColor = color || (isPositive ? '#4ADE80' : '#F87171');
  const gradientId = `sparkline-gradient-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Gradient fill */}
      {showGradient && (
        <path
          d={gradientPath}
          fill={`url(#${gradientId})`}
        />
      )}

      {/* Line */}
      <path
        d={path}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* End dot */}
      <circle
        cx={width - 2}
        cy={path.split(' ').slice(-1)[0]}
        r="2"
        fill={lineColor}
      />
    </svg>
  );
}
