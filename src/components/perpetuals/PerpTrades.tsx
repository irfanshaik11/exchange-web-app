// src/components/perpetuals/PerpTrades.tsx
// Real-time trade feed for perpetual markets.
// Price column has depth heat map, size shown in USD.

import React, { useMemo } from "react";
import type { HyperliquidTrade } from "../../utils/hyperliquidTypes";

interface PerpTradesProps {
  trades: HyperliquidTrade[];
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatPrice(px: string): string {
  const val = parseFloat(px);
  if (val >= 1000) return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (val >= 1) return val.toFixed(4);
  return val.toPrecision(4);
}

function formatUsdCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default function PerpTrades({ trades }: PerpTradesProps) {
  // Compute max USD value for heat map scaling
  const maxUsdValue = useMemo(() => {
    if (trades.length === 0) return 1;
    let max = 0;
    for (const t of trades) {
      const usd = parseFloat(t.sz) * parseFloat(t.px);
      if (usd > max) max = usd;
    }
    return max || 1;
  }, [trades]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center px-2 py-1.5 border-b border-[#1f2127] text-[10px] uppercase tracking-wide text-[#a1a1aa]">
        <span className="w-[40%]">Price</span>
        <span className="w-[35%] text-right">Size (USD)</span>
        <span className="w-[25%] text-right">Time</span>
      </div>

      {/* Trade list */}
      <div className="flex-1 overflow-y-auto">
        {trades.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#a1a1aa] text-sm">
            Waiting for trades...
          </div>
        ) : (
          trades.map((trade, i) => {
            const isBuy = trade.side === "B";
            const usdValue = parseFloat(trade.sz) * parseFloat(trade.px);
            // sqrt scale so small trades are still visible when a whale trade exists
            const heatPct = Math.sqrt(usdValue / maxUsdValue) * 100;
            const barColor = isBuy
              ? "linear-gradient(to right, rgba(24, 196, 140, 0.35), rgba(24, 196, 140, 0))"
              : "linear-gradient(to right, rgba(239, 68, 68, 0.35), rgba(239, 68, 68, 0))";
            // Bar spans full row width, capped at 85%
            const barWidthPct = Math.min(heatPct, 100) * 0.85;

            return (
              <div
                key={`${trade.tid}-${i}`}
                className="relative flex items-center px-2 py-[2px] text-[11px] font-mono hover:bg-white/[0.04]"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {/* Heat map bar — behind price column only, grows from left */}
                <div
                  className="absolute top-0 bottom-0 left-0"
                  style={{ width: `${barWidthPct}%`, background: barColor }}
                />

                <span
                  className={`relative z-10 w-[40%] ${isBuy ? "text-[#18c48c]" : "text-[#ef4444]"}`}
                >
                  {formatPrice(trade.px)}
                </span>
                <span className="relative z-10 w-[35%] text-right text-[#f4f4f5]">
                  {formatUsdCompact(usdValue)}
                </span>
                <span className="relative z-10 w-[25%] text-right text-[#a1a1aa]">
                  {formatTime(trade.time)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
