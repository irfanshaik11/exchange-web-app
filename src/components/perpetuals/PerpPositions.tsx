// src/components/perpetuals/PerpPositions.tsx
// Positions table with live PnL, leverage, and action buttons.

import React from "react";
import type { HyperliquidPositionRow } from "../../utils/hyperliquidTypes";

interface PerpPositionsProps {
  positions: HyperliquidPositionRow[];
  onClose?: (coin: string, percentage: number) => void;
  onSelect?: (coin: string) => void;
}

function formatPrice(value: number): string {
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toPrecision(4)}`;
}

export default function PerpPositions({ positions, onClose, onSelect }: PerpPositionsProps) {
  if (positions.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-[#9CA3AF] text-sm">
        No open positions
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-[11px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-[#9CA3AF] border-b border-[#2A2B33]">
            <th className="text-left px-2 py-2 font-semibold">Symbol</th>
            <th className="text-right px-2 py-2 font-semibold">Size</th>
            <th className="text-right px-2 py-2 font-semibold">Entry</th>
            <th className="text-right px-2 py-2 font-semibold">Liq Price</th>
            <th className="text-right px-2 py-2 font-semibold">PnL</th>
            <th className="text-right px-2 py-2 font-semibold">ROE</th>
            <th className="text-right px-2 py-2 font-semibold">Leverage</th>
            <th className="text-right px-2 py-2 font-semibold">Margin</th>
            <th className="text-center px-2 py-2 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => {
            const pnlColor = pos.unrealizedPnl >= 0 ? "text-[#86d99f]" : "text-[#f26682]";
            const sideColor = pos.side === "LONG" ? "text-[#86d99f]" : "text-[#f26682]";

            return (
              <tr
                key={pos.coin}
                className="border-b border-[#1E1F26] hover:bg-white/[0.04] cursor-pointer"
                onClick={() => onSelect?.(pos.coin)}
              >
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[#f0f5f5] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{pos.coin}</span>
                    <span className={`text-[10px] font-bold ${sideColor}`}>
                      {pos.side}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2 text-right text-[#f0f5f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {pos.size.toFixed(4)}
                </td>
                <td className="px-2 py-2 text-right text-[#9CA3AF]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatPrice(pos.entryPrice)}
                </td>
                <td className="px-2 py-2 text-right text-[#9CA3AF]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {pos.liquidationPrice ? formatPrice(pos.liquidationPrice) : "—"}
                </td>
                <td className={`px-2 py-2 text-right font-medium ${pnlColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {pos.unrealizedPnl >= 0 ? "+" : ""}
                  ${pos.unrealizedPnl.toFixed(2)}
                </td>
                <td className={`px-2 py-2 text-right ${pnlColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {pos.returnOnEquity >= 0 ? "+" : ""}
                  {(pos.returnOnEquity * 100).toFixed(2)}%
                </td>
                <td className="px-2 py-2 text-right text-[#9CA3AF]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {pos.leverage}x
                </td>
                <td className="px-2 py-2 text-right text-[#9CA3AF]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  ${pos.marginUsed.toFixed(2)}
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    className="text-[10px] px-2 py-0.5 rounded bg-[#f26682]/20 text-[#f26682] hover:bg-[#f26682]/40 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose?.(pos.coin, 100);
                    }}
                  >
                    Close
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
