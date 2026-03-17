// src/components/perpetuals/OrderBookTradesPanel.tsx
// Tabbed panel: Order Book | Trades — matches chart height in the middle column.

import React, { useState } from "react";
import OrderBookPanel from "./OrderBookPanel";
import PerpTrades from "./PerpTrades";
import type { OrderBookData } from "../../hooks/useHyperliquidOrderBook";
import type { HyperliquidTrade } from "../../utils/hyperliquidTypes";

const AX = {
  bg: "#111214",
  border: "#2A2B33",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  mint: "#70E0B0",
};

type Tab = "orderbook" | "trades";

interface OrderBookTradesPanelProps {
  orderBook: OrderBookData;
  trades: HyperliquidTrade[];
  onPriceClick?: (price: string) => void;
}

export default function OrderBookTradesPanel({
  orderBook,
  trades,
  onPriceClick,
}: OrderBookTradesPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("orderbook");

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: AX.bg }}>
      {/* Tab bar */}
      <div
        className="flex items-center flex-shrink-0 border-b"
        style={{ borderColor: AX.border }}
      >
        {(["orderbook", "trades"] as Tab[]).map((tab) => {
          const isActive = activeTab === tab;
          const label = tab === "orderbook" ? "Order Book" : "Trades";
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="relative px-4 py-2.5 text-[12px] font-medium transition-colors"
              style={{
                color: isActive ? AX.text : AX.muted,
              }}
            >
              {label}
              {isActive && (
                <div
                  className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full"
                  style={{ backgroundColor: AX.mint }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "orderbook" ? (
          <OrderBookPanel
            orderBook={orderBook}
            onPriceClick={onPriceClick}
          />
        ) : (
          <PerpTrades trades={trades} />
        )}
      </div>
    </div>
  );
}
