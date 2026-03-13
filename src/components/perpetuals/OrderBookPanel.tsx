// src/components/perpetuals/OrderBookPanel.tsx
// Order book with bids/asks, depth bars, click-to-fill, and cumulative totals.
// Reference: Price | Amount (USD) | Total (USD)

import React, { useMemo } from "react";
import type { OrderBookData } from "../../hooks/useHyperliquidOrderBook";
import type { HyperliquidL2Level } from "../../utils/hyperliquidTypes";

const AX = {
  bg: "#111214",
  border: "#2A2B33",
  text: "#f0f5f5",
  muted: "#9CA3AF",
};

interface OrderBookPanelProps {
  orderBook: OrderBookData;
  onPriceClick?: (price: string) => void;
  maxLevels?: number;
}

function formatPrice(px: string): string {
  const val = parseFloat(px);
  if (val >= 1000) return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (val >= 1) return val.toFixed(4);
  return val.toPrecision(4);
}

function formatUsdCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toFixed(0);
}

interface LevelWithTotal {
  level: HyperliquidL2Level;
  usdAmount: number;
  cumulativeUsd: number;
}

function LevelRow({
  data,
  maxCumulative,
  side,
  onClick,
}: {
  data: LevelWithTotal;
  maxCumulative: number;
  side: "bid" | "ask";
  onClick?: (price: string) => void;
}) {
  const depthPct = maxCumulative > 0 ? (data.cumulativeUsd / maxCumulative) * 100 : 0;
  const barColor =
    side === "bid"
      ? "rgba(134, 217, 159, 0.10)"
      : "rgba(242, 102, 130, 0.10)";
  const textColor = side === "bid" ? "text-[#86d99f]" : "text-[#f26682]";

  return (
    <div
      className="relative flex items-center px-2.5 py-[3px] cursor-pointer hover:bg-white/[0.04] text-[11px] font-mono"
      style={{ fontVariantNumeric: "tabular-nums" }}
      onClick={() => onClick?.(data.level.px)}
    >
      {/* Depth bar */}
      <div
        className="absolute top-0 bottom-0 right-0"
        style={{ width: `${Math.min(depthPct, 100)}%`, background: barColor }}
      />

      {/* Price */}
      <span className={`relative z-10 w-[35%] ${textColor}`}>
        {formatPrice(data.level.px)}
      </span>

      {/* Amount (USD) */}
      <span className="relative z-10 w-[35%] text-right text-[#f0f5f5]">
        {formatUsdCompact(data.usdAmount)}
      </span>

      {/* Total (USD) */}
      <span className="relative z-10 w-[30%] text-right text-[#9CA3AF]">
        {formatUsdCompact(data.cumulativeUsd)}
      </span>
    </div>
  );
}

export default function OrderBookPanel({
  orderBook,
  onPriceClick,
  maxLevels = 15,
}: OrderBookPanelProps) {
  const { bids, asks, spread, spreadPct, midPrice } = orderBook;

  const processedAsks = useMemo(() => {
    const sliced = asks.slice(0, maxLevels).reverse(); // lowest ask at bottom
    let cumulative = 0;
    // Build from highest (index 0) to lowest, then reverse for display
    const withTotals = sliced.map((level) => {
      const usdAmount = parseFloat(level.sz) * parseFloat(level.px);
      cumulative += usdAmount;
      return { level, usdAmount, cumulativeUsd: cumulative };
    });
    // Reverse cumulative so lowest ask has the largest total
    let runningTotal = 0;
    const reversed: LevelWithTotal[] = [];
    for (let i = sliced.length - 1; i >= 0; i--) {
      const usdAmount = parseFloat(sliced[i].sz) * parseFloat(sliced[i].px);
      runningTotal += usdAmount;
      reversed.unshift({ level: sliced[i], usdAmount, cumulativeUsd: runningTotal });
    }
    return reversed;
  }, [asks, maxLevels]);

  const processedBids = useMemo(() => {
    const sliced = bids.slice(0, maxLevels);
    let cumulative = 0;
    return sliced.map((level) => {
      const usdAmount = parseFloat(level.sz) * parseFloat(level.px);
      cumulative += usdAmount;
      return { level, usdAmount, cumulativeUsd: cumulative };
    });
  }, [bids, maxLevels]);

  const maxAskCum = processedAsks.length > 0 ? Math.max(...processedAsks.map((d) => d.cumulativeUsd)) : 0;
  const maxBidCum = processedBids.length > 0 ? Math.max(...processedBids.map((d) => d.cumulativeUsd)) : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: AX.bg }}>
      {/* Column headers */}
      <div
        className="flex items-center px-2.5 py-2 text-[10px] uppercase tracking-wide flex-shrink-0"
        style={{ color: AX.muted, borderBottom: `1px solid ${AX.border}` }}
      >
        <span className="w-[35%]">Price</span>
        <span className="w-[35%] text-right">Amount (USD)</span>
        <span className="w-[30%] text-right">Total (USD)</span>
      </div>

      {/* Asks (highest at top, lowest near spread) */}
      <div className="flex-1 overflow-hidden flex flex-col justify-end min-h-0">
        {processedAsks.map((data, i) => (
          <LevelRow
            key={`ask-${i}`}
            data={data}
            maxCumulative={maxAskCum}
            side="ask"
            onClick={onPriceClick}
          />
        ))}
      </div>

      {/* Spread row */}
      <div
        className="flex items-center justify-between px-2.5 py-1.5 text-[11px] flex-shrink-0"
        style={{
          backgroundColor: AX.bg,
          borderTop: `1px solid ${AX.border}`,
          borderBottom: `1px solid ${AX.border}`,
        }}
      >
        <span className="font-medium font-mono" style={{ color: AX.text, fontVariantNumeric: "tabular-nums" }}>
          {midPrice > 0 ? formatPrice(midPrice.toString()) : "—"}
        </span>
        <span style={{ color: AX.muted, fontVariantNumeric: "tabular-nums" }}>
          Spread: {spread.toFixed(2)} ({spreadPct.toFixed(3)}%)
        </span>
      </div>

      {/* Bids (highest near spread) */}
      <div className="flex-1 overflow-hidden min-h-0">
        {processedBids.map((data, i) => (
          <LevelRow
            key={`bid-${i}`}
            data={data}
            maxCumulative={maxBidCum}
            side="bid"
            onClick={onPriceClick}
          />
        ))}
      </div>
    </div>
  );
}
