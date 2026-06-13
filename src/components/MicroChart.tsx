import React from "react";
import { TK } from "~/utils/trackersTheme";

/**
 * Static inline-SVG / div micro-charts for the trackers redesign.
 *
 * Deliberately animation-free and lib-free: a sparkline is one <polyline>, a heat
 * strip is N <rect>, a position bar is two divs. Render cost is trivial and equal
 * for every paint — no JS loop, no transition, no canvas. Memoized so row lists
 * don't re-render them needlessly.
 */

/** Sparkline — last-N trend as a single polyline. color defaults to PnL of net move. */
export const Sparkline = React.memo(function Sparkline({
  values,
  width = 64,
  height = 16,
  color,
  strokeWidth = 1.25,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}) {
  if (!values || values.length < 2) return <svg width={width} height={height} />;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const pts = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke =
    color ?? (values[values.length - 1] >= values[0] ? TK.gain : TK.loss);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
});

/**
 * HeatStrip — a row of cells colored by sign/value. Pass `signs` (e.g. buy=+1,
 * sell=-1) or numeric values; each renders gain/loss/neutral. Great for buy/sell
 * pressure rails and win-rate strips.
 */
export const HeatStrip = React.memo(function HeatStrip({
  values,
  height = 14,
  cellWidth = 5,
  gap = 1,
  rounded = 1,
}: {
  values: number[];
  height?: number;
  cellWidth?: number;
  gap?: number;
  rounded?: number;
}) {
  if (!values || values.length === 0) return null;
  const w = values.length * cellWidth + (values.length - 1) * gap;
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
      {values.map((v, i) => {
        const fill = v > 0 ? TK.gain : v < 0 ? TK.loss : "rgba(255,255,255,0.06)";
        return (
          <rect
            key={i}
            x={i * (cellWidth + gap)}
            y={0}
            width={cellWidth}
            height={height}
            rx={rounded}
            fill={fill}
            opacity={v === 0 ? 1 : 0.85}
          />
        );
      })}
    </svg>
  );
});

/**
 * PosBar — a two-segment proportion bar (e.g. bought vs sold, or net-flow). `pos`
 * and `neg` are magnitudes; renders a flat track with gain/neutral segments.
 */
export const PosBar = React.memo(function PosBar({
  pos,
  neg,
  height = 3,
  posColor = TK.gain,
  negColor = "rgba(255,255,255,0.12)",
}: {
  pos: number;
  neg: number;
  height?: number;
  posColor?: string;
  negColor?: string;
}) {
  const total = Math.abs(pos) + Math.abs(neg);
  const pct = total === 0 ? 0 : (Math.abs(pos) / total) * 100;
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height, background: negColor }}>
      <div style={{ height: "100%", width: `${pct}%`, background: posColor }} />
    </div>
  );
});

/** WinRateStrip — 10 cells; fills `round(rate*10)` with gain, rest faint. */
export const WinRateStrip = React.memo(function WinRateStrip({
  rate, // 0..1
  cells = 10,
  height = 12,
  cellWidth = 5,
  gap = 1.5,
}: {
  rate: number;
  cells?: number;
  height?: number;
  cellWidth?: number;
  gap?: number;
}) {
  const on = Math.max(0, Math.min(cells, Math.round((rate || 0) * cells)));
  const vals = Array.from({ length: cells }, (_, i) => (i < on ? 1 : 0));
  const w = cells * cellWidth + (cells - 1) * gap;
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
      {vals.map((v, i) => (
        <rect
          key={i}
          x={i * (cellWidth + gap)}
          y={0}
          width={cellWidth}
          height={height}
          rx={1}
          fill={v ? TK.gain : "rgba(255,255,255,0.07)"}
        />
      ))}
    </svg>
  );
});
