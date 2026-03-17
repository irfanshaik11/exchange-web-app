// src/components/perpetuals/PerpTabs.tsx
// Tabs component: Positions | Open Orders | Trade History

import React, { useState } from "react";
import PerpPositions from "./PerpPositions";
import type { HyperliquidPositionRow, HyperliquidOpenOrder, HyperliquidFill } from "../../utils/hyperliquidTypes";

interface PerpTabsProps {
  positions: HyperliquidPositionRow[];
  openOrders: HyperliquidOpenOrder[];
  tradeHistory: HyperliquidFill[];
  onClosePosition?: (coin: string, percentage: number) => void;
  onCancelOrder?: (coin: string, oid: number) => void;
  onSelectPosition?: (coin: string) => void;
}

type Tab = "positions" | "orders" | "history";

export default function PerpTabs({
  positions,
  openOrders,
  tradeHistory,
  onClosePosition,
  onCancelOrder,
  onSelectPosition,
}: PerpTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("positions");

  return (
    <div className="overflow-hidden">
      {/* Tab headers */}
      <div className="flex border-b border-[#2A2B33]">
        {(
          [
            { key: "positions", label: "Positions", count: positions.length },
            { key: "orders", label: "Open Orders", count: openOrders.length },
            { key: "history", label: "Trade History", count: tradeHistory.length },
          ] as const
        ).map(({ key, label, count }) => (
          <button
            key={key}
            className={`px-4 py-2 text-[11px] tracking-wide uppercase font-semibold transition-colors ${
              activeTab === key
                ? "text-[#f0f5f5] border-b-2 border-[#70E0B0]"
                : "text-[#9CA3AF] hover:text-[#f0f5f5]"
            }`}
            onClick={() => setActiveTab(key)}
          >
            {label}
            {count > 0 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#2A2B33]">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[120px] max-h-[300px] overflow-auto">
        {activeTab === "positions" && (
          <PerpPositions
            positions={positions}
            onClose={onClosePosition}
            onSelect={onSelectPosition}
          />
        )}

        {activeTab === "orders" && (
          <div className="p-2">
            {openOrders.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-[#9CA3AF] text-sm">
                No open orders
              </div>
            ) : (
              <table className="min-w-full text-[11px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-[#9CA3AF] border-b border-[#2A2B33]">
                    <th className="text-left px-2 py-1 font-semibold">Symbol</th>
                    <th className="text-left px-2 py-1 font-semibold">Side</th>
                    <th className="text-right px-2 py-1 font-semibold">Price</th>
                    <th className="text-right px-2 py-1 font-semibold">Size</th>
                    <th className="text-center px-2 py-1 font-semibold">Cancel</th>
                  </tr>
                </thead>
                <tbody>
                  {openOrders.map((order) => (
                    <tr
                      key={order.oid}
                      className="border-b border-[#1E1F26] hover:bg-white/[0.04]"
                    >
                      <td className="px-2 py-1.5 text-[#f0f5f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{order.coin}</td>
                      <td className={`px-2 py-1.5 ${order.side === "B" ? "text-[#86d99f]" : "text-[#f26682]"}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {order.side === "B" ? "Buy" : "Sell"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[#f0f5f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>${order.limitPx}</td>
                      <td className="px-2 py-1.5 text-right text-[#f0f5f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{order.sz}</td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          className="text-[10px] px-2 py-0.5 rounded bg-[#f26682]/20 text-[#f26682] hover:bg-[#f26682]/40 transition-colors"
                          onClick={() => onCancelOrder?.(order.coin, order.oid)}
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="p-2">
            {tradeHistory.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-[#9CA3AF] text-sm">
                No trade history
              </div>
            ) : (
              <table className="min-w-full text-[11px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-[#9CA3AF] border-b border-[#2A2B33]">
                    <th className="text-left px-2 py-1 font-semibold">Symbol</th>
                    <th className="text-left px-2 py-1 font-semibold">Side</th>
                    <th className="text-right px-2 py-1 font-semibold">Price</th>
                    <th className="text-right px-2 py-1 font-semibold">Size</th>
                    <th className="text-right px-2 py-1 font-semibold">PnL</th>
                    <th className="text-right px-2 py-1 font-semibold">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeHistory.slice(0, 50).map((fill) => {
                    const pnl = parseFloat(fill.closedPnl);
                    return (
                      <tr
                        key={fill.tid}
                        className="border-b border-[#1E1F26] hover:bg-white/[0.04]"
                      >
                        <td className="px-2 py-1.5 text-[#f0f5f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{fill.coin}</td>
                        <td className={`px-2 py-1.5 ${fill.side === "B" ? "text-[#86d99f]" : "text-[#f26682]"}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fill.dir}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[#f0f5f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>${fill.px}</td>
                        <td className="px-2 py-1.5 text-right text-[#f0f5f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{fill.sz}</td>
                        <td className={`px-2 py-1.5 text-right ${pnl >= 0 ? "text-[#86d99f]" : "text-[#f26682]"}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {pnl !== 0 ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[#9CA3AF]" style={{ fontVariantNumeric: 'tabular-nums' }}>${fill.fee}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
