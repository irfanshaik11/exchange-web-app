import React from 'react';

export type PredictionDataSource = 'dflow' | 'polymarket' | 'all';

interface DataSourceSwitcherProps {
  source: PredictionDataSource;
  onSourceChange: (source: PredictionDataSource) => void;
  dflowCount?: number;
  polymarketCount?: number;
  showCounts?: boolean;
  size?: 'sm' | 'md';
}

const AX = {
  bg: "#111214",
  surface: "#1E1F26",
  border: "#2A2B33",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  mint: "#70E0B0",
  purple: "#A78BFA",
};

export default function DataSourceSwitcher({
  source,
  onSourceChange,
  dflowCount,
  polymarketCount,
  showCounts = false,
  size = 'md',
}: DataSourceSwitcherProps) {
  const isSmall = size === 'sm';
  const buttonPadding = isSmall ? 'px-2 py-1' : 'px-3 py-1.5';
  const fontSize = isSmall ? 'text-[10px]' : 'text-xs';

  const sources: { key: PredictionDataSource; label: string; color: string; count?: number }[] = [
    { key: 'all', label: 'All', color: AX.text, count: (dflowCount || 0) + (polymarketCount || 0) },
    { key: 'dflow', label: 'dFlow', color: AX.mint, count: dflowCount },
    { key: 'polymarket', label: 'Polymarket', color: AX.purple, count: polymarketCount },
  ];

  return (
    <div
      className="inline-flex rounded-lg overflow-hidden"
      style={{ border: `1px solid ${AX.border}`, backgroundColor: AX.bg }}
    >
      {sources.map((s, idx) => {
        const isActive = source === s.key;
        return (
          <button
            key={s.key}
            onClick={() => onSourceChange(s.key)}
            className={`${buttonPadding} ${fontSize} font-medium transition-all flex items-center gap-1.5`}
            style={{
              backgroundColor: isActive ? `${s.color}20` : 'transparent',
              color: isActive ? s.color : AX.muted,
              borderRight: idx < sources.length - 1 ? `1px solid ${AX.border}` : undefined,
            }}
          >
            {/* Source indicator dot */}
            {s.key !== 'all' && (
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: isActive ? s.color : AX.muted }}
              />
            )}
            <span>{s.label}</span>
            {showCounts && s.count !== undefined && s.count > 0 && (
              <span
                className="text-[9px] px-1 py-0.5 rounded"
                style={{
                  backgroundColor: isActive ? `${s.color}30` : AX.surface,
                  color: isActive ? s.color : AX.muted,
                }}
              >
                {s.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Compact badge to show source on market cards
export function SourceBadge({ source, size = 'sm' }: { source: 'dflow' | 'polymarket'; size?: 'sm' | 'md' }) {
  const isPolymarket = source === 'polymarket';
  const color = isPolymarket ? AX.purple : AX.mint;
  const label = isPolymarket ? 'Polymarket' : 'dFlow';

  const sizeClasses = size === 'sm' ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5';

  return (
    <span
      className={`${sizeClasses} rounded font-medium uppercase tracking-wider`}
      style={{
        backgroundColor: `${color}20`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      {label}
    </span>
  );
}
