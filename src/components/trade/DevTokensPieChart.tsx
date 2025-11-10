import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface DevTokensPieChartProps {
  migrated: number;
  nonMigrated: number;
}

const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  migrated: "#70E0B0", // Green for migrated
  nonMigrated: "#EC4899", // Pink/magenta for non-migrated
};

// Helper function to darken a hex color
const darkenColor = (color: string, percent: number): string => {
  const num = parseInt(color.replace('#', ''), 16);
  const r = Math.floor((num >> 16) * (1 - percent));
  const g = Math.floor(((num >> 8) & 0x00FF) * (1 - percent));
  const b = Math.floor((num & 0x0000FF) * (1 - percent));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

const DevTokensPieChart: React.FC<DevTokensPieChartProps> = ({ migrated, nonMigrated }) => {
  const total = migrated + nonMigrated;
  const migratedPercent = total > 0 ? (migrated / total) * 100 : 0;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Prepare data for recharts - migrated first so it starts at the top
  const data = [
    { name: 'Migrated', value: migrated, color: AX.migrated },
    { name: 'Non-migrated', value: nonMigrated, color: AX.nonMigrated },
  ];

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, coordinate }: any) => {
    if (!active || !payload || !payload[0] || !coordinate) return null;

    const entry = payload[0];
    const isMigrated = entry.name === 'Migrated';
    const color = isMigrated ? AX.migrated : AX.nonMigrated;
    const value = entry.value;

    // Chart dimensions (chart is 256px, centered in container)
    const chartSize = 256;
    const centerX = chartSize / 2; // 128px from left
    const centerY = chartSize / 2; // 128px from top
    const middleRadius = 112; // Average of innerRadius (104) and outerRadius (120)

    // Calculate angle for the middle of the segment
    let angle = 0;
    if (isMigrated) {
      // Migrated segment: starts at 90° (top), calculate middle angle
      const segmentAngle = (migrated / total) * 360;
      angle = 90 - (segmentAngle / 2); // Middle of migrated segment
    } else {
      // Non-migrated segment: starts after migrated, calculate middle angle
      const migratedAngle = (migrated / total) * 360;
      const segmentAngle = (nonMigrated / total) * 360;
      angle = 90 - migratedAngle - (segmentAngle / 2); // Middle of non-migrated segment
    }

    // Convert angle to radians (recharts uses standard math coordinates)
    const angleRad = (angle * Math.PI) / 180;

    // Calculate point on the ring (relative to chart center)
    const offsetX = middleRadius * Math.cos(angleRad);
    const offsetY = -middleRadius * Math.sin(angleRad); // Negative because y increases downward in SVG

    // Calculate the actual point on the ring in container coordinates
    // Since the chart is 256px and centered in the ResponsiveContainer
    const segmentPointX = centerX + offsetX;
    const segmentPointY = centerY + offsetY;

    // Position tooltip so tail tip originates from segment point on ring
    // The tail extends downward from the tooltip bottom, so tooltip should be above the segment point
    const tailHeight = 8; // Height of the tail triangle (extends 8px below tooltip bottom)
    const estimatedTooltipHeight = 60; // Approximate tooltip height
    
    // Calculate tooltip position:
    // Tail tip = tooltip bottom + tailHeight = segmentPointY
    // tooltip bottom = tooltipY + tooltipHeight
    // So: tooltipY + tooltipHeight + tailHeight = segmentPointY
    // Therefore: tooltipY = segmentPointY - tooltipHeight - tailHeight
    const tooltipX = segmentPointX; // Center tooltip horizontally on segment point
    const tooltipY = segmentPointY - estimatedTooltipHeight - tailHeight; // Position above segment point so tail tip aligns with segment

    return (
      <div
        style={{
          position: 'absolute',
          left: `${tooltipX}px`,
          top: `${tooltipY}px`,
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          border: `1px solid ${AX.border}`,
          borderTopLeftRadius: '8px',
          borderTopRightRadius: '8px',
          borderBottomLeftRadius: '0px',
          borderBottomRightRadius: '0px',
          padding: '6px 8px',
          paddingBottom: '12px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
          fontSize: '0.75rem',
          pointerEvents: 'none',
          zIndex: 1000,
        }}
      >
        <div style={{ color: '#FFFFFF', marginBottom: '6px', fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
          {entry.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              backgroundColor: color,
              borderRadius: '2px',
              flexShrink: 0,
            }}
          />
          <span style={{ color: '#FFFFFF', fontSize: '0.75rem' }}>{value.toLocaleString()}</span>
        </div>
        {/* Tail pointing downward to segment point on ring - tip originates from segment point */}
        {/* Tail is positioned at bottom center of tooltip, pointing down to segment point */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '-8px',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: `8px solid rgba(0, 0, 0, 0.85)`,
          }}
        />
        {/* Border for the tail */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '-9px',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '9px solid transparent',
            borderRight: '9px solid transparent',
            borderTop: `9px solid ${AX.border}`,
            zIndex: -1,
          }}
        />
      </div>
    );
  };

  // Custom label function to show percentage in center
  const renderCustomLabel = ({ cx, cy }: { cx: number; cy: number }) => {
    return (
      <g>
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ 
            fontSize: '2.8rem', 
            fontWeight: 'bold', 
            fill: '#FFFFFF',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}
        >
          {migratedPercent.toFixed(0)}%
        </text>
        <text
          x={cx}
          y={cy + 19}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ 
            fontSize: '0.8rem', 
            fill: '#FFFFFF',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}
        >
          Migrated
        </text>
      </g>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center" style={{ width: '100%', backgroundColor: '#000000' }}>
      <div style={{ width: '100%', height: '256px', maxWidth: '256px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip 
              content={<CustomTooltip />}
              cursor={{ fill: 'transparent' }}
            />
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={104}
              outerRadius={120}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              label={renderCustomLabel}
              labelLine={false}
              isAnimationActive={true}
              animationBegin={0}
              animationDuration={800}
              stroke="none"
              activeIndex={activeIndex ?? undefined}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {data.map((entry, index) => {
                const isActive = activeIndex === index;
                const fillColor = isActive ? darkenColor(entry.color, 0.15) : entry.color;
                return (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={fillColor} 
                    stroke="none"
                    style={{ cursor: 'pointer', transition: 'fill 0.2s ease' }}
                  />
                );
              })}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DevTokensPieChart;

