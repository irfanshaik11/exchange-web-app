// src/components/perpetuals/PerpTrades.tsx
// Real-time trade feed for perpetual markets.

import React from "react";
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

function formatSize(sz: string): string {
  const val = parseFloat(sz);
  if (val >= 1000) return val.toFixed(2);
  if (val >= 1) return val.toFixed(4);
  return val.toPrecision(3);
}

export default function PerpTrades({ trades }: PerpTradesProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center px-2 py-1.5 border-b border-[#2A2B33] text-[10px] uppercase tracking-wide text-[#9CA3AF]">
        <span className="flex-1">Price</span>
        <span className="flex-1 text-right">Size</span>
        <span className="w-16 text-right">Time</span>
      </div>

      {/* Trade list */}
      <div className="flex-1 overflow-y-auto">
        {trades.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#9CA3AF] text-sm">
            Waiting for trades...
          </div>
        ) : (
          trades.map((trade, i) => {
            const isBuy = trade.side === "B";
            return (
              <div
                key={`${trade.tid}-${i}`}
                className="flex items-center px-2 py-[2px] text-[11px] font-mono hover:bg-white/[0.04]"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                <span
                  className={`flex-1 ${isBuy ? "text-[#86d99f]" : "text-[#f26682]"}`}
                >
                  {formatPrice(trade.px)}
                </span>
                <span className="flex-1 text-right text-[#f0f5f5]">
                  {formatSize(trade.sz)}
                </span>
                <span className="w-16 text-right text-[#9CA3AF]">
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
