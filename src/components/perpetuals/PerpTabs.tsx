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
  /** Modify a resting order in place (price/size). Resolves when accepted. */
  onModifyOrder?: (order: HyperliquidOpenOrder, newPrice: number, newSize: number) => Promise<void>;
}

type Tab = "positions" | "orders" | "history";

export default function PerpTabs({
  positions,
  openOrders,
  tradeHistory,
  onClosePosition,
  onCancelOrder,
  onSelectPosition,
  onModifyOrder,
}: PerpTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("positions");
  const [editingOid, setEditingOid] = useState<number | null>(null);
  const [draftPrice, setDraftPrice] = useState("");
  const [draftSize, setDraftSize] = useState("");
  const [savingOid, setSavingOid] = useState<number | null>(null);

  const startEdit = (order: HyperliquidOpenOrder) => {
    setEditingOid(order.oid);
    setDraftPrice(order.limitPx);
    setDraftSize(order.sz);
  };

  const saveEdit = async (order: HyperliquidOpenOrder) => {
    if (!onModifyOrder) return;
    const p = parseFloat(draftPrice);
    const s = parseFloat(draftSize);
    if (!(p > 0) || !(s > 0)) return;
    setSavingOid(order.oid);
    try {
      await onModifyOrder(order, p, s);
      setEditingOid(null);
    } finally {
      setSavingOid(null);
    }
  };

  return (
    <div className="overflow-hidden">
      {/* Tab headers */}
      <div className="flex border-b border-[#1f2127]">
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
                ? "text-[#f4f4f5] border-b-2 border-[#18c48c]"
                : "text-[#a1a1aa] hover:text-[#f4f4f5]"
            }`}
            onClick={() => setActiveTab(key)}
          >
            {label}
            {count > 0 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#1f2127]">
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
              <div className="flex items-center justify-center h-24 text-[#a1a1aa] text-sm">
                No open orders
              </div>
            ) : (
              <table className="min-w-full text-[11px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-[#a1a1aa] border-b border-[#1f2127]">
                    <th className="text-left px-2 py-1 font-semibold">Symbol</th>
                    <th className="text-left px-2 py-1 font-semibold">Side</th>
                    <th className="text-right px-2 py-1 font-semibold">Price</th>
                    <th className="text-right px-2 py-1 font-semibold">Size</th>
                    <th className="text-center px-2 py-1 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {openOrders.map((order) => {
                    const isEditing = editingOid === order.oid;
                    const isSaving = savingOid === order.oid;
                    return (
                    <tr
                      key={order.oid}
                      className="border-b border-[#141619] hover:bg-white/[0.04]"
                    >
                      <td className="px-2 py-1.5 text-[#f4f4f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{order.coin}</td>
                      <td className={`px-2 py-1.5 ${order.side === "B" ? "text-[#18c48c]" : "text-[#ef4444]"}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {order.side === "B" ? "Buy" : "Sell"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[#f4f4f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {isEditing ? (
                          <input
                            inputMode="decimal"
                            value={draftPrice}
                            onChange={(e) => setDraftPrice(e.target.value)}
                            className="w-20 bg-[#101114] border border-[#1f2127] rounded px-1.5 py-0.5 text-right text-[#f4f4f5] outline-none"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          />
                        ) : (
                          <>${order.limitPx}</>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[#f4f4f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {isEditing ? (
                          <input
                            inputMode="decimal"
                            value={draftSize}
                            onChange={(e) => setDraftSize(e.target.value)}
                            className="w-16 bg-[#101114] border border-[#1f2127] rounded px-1.5 py-0.5 text-right text-[#f4f4f5] outline-none"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          />
                        ) : (
                          order.sz
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <button
                              disabled={isSaving}
                              className="text-[10px] px-2 py-0.5 rounded bg-[#18c48c]/20 text-[#18c48c] hover:bg-[#18c48c]/40 transition-colors disabled:opacity-50"
                              onClick={() => saveEdit(order)}
                            >
                              {isSaving ? "…" : "Save"}
                            </button>
                            <button
                              disabled={isSaving}
                              className="ml-1 text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-[#a1a1aa] hover:bg-white/[0.12] transition-colors"
                              onClick={() => setEditingOid(null)}
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            {onModifyOrder && (
                              <button
                                className="text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-[#a1a1aa] hover:bg-white/[0.12] transition-colors"
                                onClick={() => startEdit(order)}
                              >
                                Edit
                              </button>
                            )}
                            <button
                              className="ml-1 text-[10px] px-2 py-0.5 rounded bg-[#ef4444]/20 text-[#ef4444] hover:bg-[#ef4444]/40 transition-colors"
                              onClick={() => onCancelOrder?.(order.coin, order.oid)}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="p-2">
            {tradeHistory.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-[#a1a1aa] text-sm">
                No trade history
              </div>
            ) : (
              <table className="min-w-full text-[11px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-[#a1a1aa] border-b border-[#1f2127]">
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
                        className="border-b border-[#141619] hover:bg-white/[0.04]"
                      >
                        <td className="px-2 py-1.5 text-[#f4f4f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{fill.coin}</td>
                        <td className={`px-2 py-1.5 ${fill.side === "B" ? "text-[#18c48c]" : "text-[#ef4444]"}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fill.dir}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[#f4f4f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>${fill.px}</td>
                        <td className="px-2 py-1.5 text-right text-[#f4f4f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{fill.sz}</td>
                        <td className={`px-2 py-1.5 text-right ${pnl >= 0 ? "text-[#18c48c]" : "text-[#ef4444]"}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {pnl !== 0 ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[#a1a1aa]" style={{ fontVariantNumeric: 'tabular-nums' }}>${fill.fee}</td>
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
