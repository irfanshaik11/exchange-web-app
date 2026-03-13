// src/components/perpetuals/PerpPositionModal.tsx
// Full position detail modal with close/add margin actions.
// Uses bottom-0 + 100dvh for mobile (per PositionDetailModal fix).

import React, { useState, useCallback } from "react";
import type { HyperliquidPositionRow } from "../../utils/hyperliquidTypes";
import { closePosition } from "../../utils/hyperliquidApi";

interface PerpPositionModalProps {
  position: HyperliquidPositionRow | null;
  token: string | undefined;
  onClose: () => void;
  onPositionClosed?: () => void;
}

function formatPrice(value: number): string {
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toPrecision(4)}`;
}

export default function PerpPositionModal({
  position,
  token,
  onClose,
  onPositionClosed,
}: PerpPositionModalProps) {
  const [closing, setClosing] = useState(false);
  const [closePercent, setClosePercent] = useState(100);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(async () => {
    if (!position || !token) return;

    setClosing(true);
    setError(null);

    try {
      await closePosition(token, position.coin, closePercent);
      onPositionClosed?.();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to close position");
    } finally {
      setClosing(false);
    }
  }, [position, token, closePercent, onClose, onPositionClosed]);

  if (!position) return null;

  const pnlColor = position.unrealizedPnl >= 0 ? "text-[#86d99f]" : "text-[#f26682]";
  const sideColor = position.side === "LONG" ? "text-[#86d99f]" : "text-[#f26682]";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-full sm:max-w-md bg-[#111214] border border-[#2A2B33] rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ bottom: 0, height: "100dvh", maxHeight: "100dvh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2A2B33]">
          <div className="flex items-center gap-2">
            <span className="text-[#f0f5f5] font-bold text-lg">{position.coin}</span>
            <span className={`text-sm font-bold ${sideColor}`}>{position.side}</span>
            <span className="text-[11px] text-[#9CA3AF]">{position.leverage}x</span>
          </div>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#f0f5f5] text-xl">
            &times;
          </button>
        </div>

        {/* Details */}
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-[#9CA3AF] text-[11px]">Size</span>
              <div className="text-[#f0f5f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{position.size.toFixed(4)}</div>
            </div>
            <div>
              <span className="text-[#9CA3AF] text-[11px]">Entry Price</span>
              <div className="text-[#f0f5f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatPrice(position.entryPrice)}</div>
            </div>
            <div>
              <span className="text-[#9CA3AF] text-[11px]">Liq Price</span>
              <div className="text-[#f0f5f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {position.liquidationPrice ? formatPrice(position.liquidationPrice) : "—"}
              </div>
            </div>
            <div>
              <span className="text-[#9CA3AF] text-[11px]">Margin Used</span>
              <div className="text-[#f0f5f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>${position.marginUsed.toFixed(2)}</div>
            </div>
            <div>
              <span className="text-[#9CA3AF] text-[11px]">Unrealized PnL</span>
              <div className={`font-medium ${pnlColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {position.unrealizedPnl >= 0 ? "+" : ""}
                ${position.unrealizedPnl.toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-[#9CA3AF] text-[11px]">ROE</span>
              <div className={pnlColor} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {position.returnOnEquity >= 0 ? "+" : ""}
                {(position.returnOnEquity * 100).toFixed(2)}%
              </div>
            </div>
            <div className="col-span-2">
              <span className="text-[#9CA3AF] text-[11px]">Funding Since Open</span>
              <div className={position.fundingSinceOpen >= 0 ? "text-[#86d99f]" : "text-[#f26682]"} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {position.fundingSinceOpen >= 0 ? "+" : ""}
                ${position.fundingSinceOpen.toFixed(4)}
              </div>
            </div>
          </div>

          {/* Close Position */}
          <div className="border-t border-[#2A2B33] pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#9CA3AF]">Close Amount</span>
              <span className="text-[11px] text-[#f0f5f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{closePercent}%</span>
            </div>

            <div className="flex gap-2">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setClosePercent(pct)}
                  className={`flex-1 py-1.5 rounded text-[11px] transition-colors ${
                    closePercent === pct
                      ? "bg-[#FF4D7F] text-white"
                      : "bg-[#1E1F26] text-[#9CA3AF] hover:bg-[#2A2B33]"
                  }`}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {pct}%
                </button>
              ))}
            </div>

            {error && (
              <div className="text-[11px] text-[#FF4D7F] bg-[#FF4D7F]/10 px-3 py-2 rounded">
                {error}
              </div>
            )}

            <button
              onClick={handleClose}
              disabled={closing}
              className="w-full py-3 rounded-lg bg-[#FF4D7F] hover:bg-[#e03a6a] text-white font-bold text-sm transition-colors disabled:opacity-50"
            >
              {closing ? "Closing..." : `Close ${closePercent}% of Position`}
            </button>
          </div>

          {/* Bottom spacer for mobile safe area */}
          <div className="h-2" />
        </div>
      </div>
    </div>
  );
}
