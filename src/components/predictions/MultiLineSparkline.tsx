import React, { useMemo, useId } from 'react';

interface SparklineSeries {
  data: number[];
  color: string;
  label?: string;
}

interface MultiLineSparklineProps {
  series: SparklineSeries[];
  width?: number;
  height?: number;
  /** Show gradient fill under the first (primary) line */
  showGradient?: boolean;
  /** Show labels at the end of each line */
  showLabels?: boolean;
}

export default function MultiLineSparkline({
  series,
  width = 120,
  height = 48,
  showGradient = true,
  showLabels = false,
}: MultiLineSparklineProps) {
  const uid = useId();

  const paths = useMemo(() => {
    if (!series || series.length === 0) return [];

    // Find global min/max across all series for consistent Y scaling
    let globalMin = Infinity;
    let globalMax = -Infinity;
    for (const s of series) {
      for (const v of s.data) {
        if (v < globalMin) globalMin = v;
        if (v > globalMax) globalMax = v;
      }
    }
    const range = globalMax - globalMin || 1;

    const padding = 2;
    const rightPad = showLabels ? 70 : 2; // extra space for labels
    const chartWidth = width - padding - rightPad;
    const chartHeight = height - padding * 2;

    return series.map((s) => {
      if (!s.data || s.data.length < 2) return null;

      const points = s.data.map((value, index) => {
        const x = padding + (index / (s.data.length - 1)) * chartWidth;
        const y = padding + chartHeight - ((value - globalMin) / range) * chartHeight;
        return { x, y };
      });

      const pathD = points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(' ');

      const gradientD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height - padding} L ${padding} ${height - padding} Z`;

      const endPoint = points[points.length - 1];

      return {
        pathD,
        gradientD,
        endPoint,
        color: s.color,
        label: s.label,
        lastValue: s.data[s.data.length - 1],
        labelY: endPoint.y, // will be adjusted for collisions
      };
    }).filter(Boolean) as NonNullable<typeof paths[number]>[];
  }, [series, width, height, showLabels]);

  // Resolve overlapping labels by pushing them apart
  const resolvedPaths = useMemo(() => {
    if (!showLabels || paths.length <= 1) return paths;
    const MIN_GAP = 12; // minimum px between label centers
    // Sort by endpoint Y to resolve top-to-bottom
    const sorted = paths.map((p, i) => ({ ...p, idx: i })).sort((a, b) => a.endPoint.y - b.endPoint.y);
    // Push labels apart
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (curr.labelY - prev.labelY < MIN_GAP) {
        curr.labelY = prev.labelY + MIN_GAP;
      }
    }
    // Rebuild in original order
    const result = [...paths];
    for (const s of sorted) {
      result[s.idx] = { ...result[s.idx], labelY: s.labelY };
    }
    return result;
  }, [paths, showLabels]);

  if (paths.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ width, height, color: '#6b7280' }}
      >
        —
      </div>
    );
  }

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        {showGradient && paths[0] && (
          <linearGradient id={`ml-grad-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={paths[0].color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={paths[0].color} stopOpacity="0" />
          </linearGradient>
        )}
      </defs>

      {/* Gradient fill under primary line only */}
      {showGradient && resolvedPaths[0] && (
        <path d={resolvedPaths[0].gradientD} fill={`url(#ml-grad-${uid})`} />
      )}

      {/* Lines — draw secondary lines first (behind), primary last (on top) */}
      {[...resolvedPaths].reverse().map((p, i) => {
        const isPrimary = i === resolvedPaths.length - 1; // first series = primary = drawn last
        return (
          <g key={i}>
            <path
              d={p.pathD}
              fill="none"
              stroke={p.color}
              strokeWidth={isPrimary ? 1.5 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={isPrimary ? 1 : 0.5}
            />
            {/* End dot */}
            <circle
              cx={p.endPoint.x}
              cy={p.endPoint.y}
              r={isPrimary ? 2.5 : 1.5}
              fill={p.color}
              opacity={isPrimary ? 1 : 0.7}
            />
            {/* Label at end — Y adjusted to avoid overlaps */}
            {showLabels && p.label && (
              <text
                x={p.endPoint.x + 5}
                y={p.labelY + 3}
                fontSize="8"
                fontWeight="600"
                fill={p.color}
                opacity={isPrimary ? 0.9 : 0.6}
              >
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
