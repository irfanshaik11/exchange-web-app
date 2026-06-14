// src/components/perpetuals/PerpPositionModal.tsx
// Full position detail modal with close/add margin actions.
// Uses bottom-0 + 100dvh for mobile (per PositionDetailModal fix).

import React, { useState, useCallback } from "react";
import type { HyperliquidPositionRow } from "../../utils/hyperliquidTypes";
import { closePosition, updateIsolatedMargin } from "../../utils/hyperliquidApi";

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
  const [marginAmount, setMarginAmount] = useState("");
  const [marginBusy, setMarginBusy] = useState(false);

  const handleMargin = useCallback(
    async (sign: 1 | -1) => {
      if (!position || !token) return;
      const amt = parseFloat(marginAmount);
      if (!amt || amt <= 0) return;
      setMarginBusy(true);
      setError(null);
      try {
        await updateIsolatedMargin(token, position.coin, sign * amt, position.side === "LONG");
        setMarginAmount("");
        onPositionClosed?.(); // refresh position data (margin/liq changed)
      } catch (err: any) {
        setError(err.message || "Failed to update margin");
      } finally {
        setMarginBusy(false);
      }
    },
    [position, token, marginAmount, onPositionClosed]
  );

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

  const pnlColor = position.unrealizedPnl >= 0 ? "text-[#18c48c]" : "text-[#ef4444]";
  const sideColor = position.side === "LONG" ? "text-[#18c48c]" : "text-[#ef4444]";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-full sm:max-w-md bg-[#0c0d10] border border-[#1f2127] rounded-t-2xl sm:rounded-2xl overflow-hidden overflow-y-auto h-[100dvh] sm:h-auto sm:max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1f2127]">
          <div className="flex items-center gap-2">
            <span className="text-[#f4f4f5] font-bold text-lg">{position.coin}</span>
            <span className={`text-sm font-bold ${sideColor}`}>{position.side}</span>
            <span className="text-[11px] text-[#a1a1aa]">{position.leverage}x</span>
          </div>
          <button onClick={onClose} className="text-[#a1a1aa] hover:text-[#f4f4f5] text-xl">
            &times;
          </button>
        </div>

        {/* Details */}
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-[#a1a1aa] text-[11px]">Size</span>
              <div className="text-[#f4f4f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{position.size.toFixed(4)}</div>
            </div>
            <div>
              <span className="text-[#a1a1aa] text-[11px]">Entry Price</span>
              <div className="text-[#f4f4f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatPrice(position.entryPrice)}</div>
            </div>
            <div>
              <span className="text-[#a1a1aa] text-[11px]">Liq Price</span>
              <div className="text-[#f4f4f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {position.liquidationPrice ? formatPrice(position.liquidationPrice) : "—"}
              </div>
            </div>
            <div>
              <span className="text-[#a1a1aa] text-[11px]">Margin Used</span>
              <div className="text-[#f4f4f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>${position.marginUsed.toFixed(2)}</div>
            </div>
            <div>
              <span className="text-[#a1a1aa] text-[11px]">Unrealized PnL</span>
              <div className={`font-medium ${pnlColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {position.unrealizedPnl >= 0 ? "+" : ""}
                ${position.unrealizedPnl.toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-[#a1a1aa] text-[11px]">ROE</span>
              <div className={pnlColor} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {position.returnOnEquity >= 0 ? "+" : ""}
                {(position.returnOnEquity * 100).toFixed(2)}%
              </div>
            </div>
            <div className="col-span-2">
              <span className="text-[#a1a1aa] text-[11px]">Funding Since Open</span>
              <div className={position.fundingSinceOpen >= 0 ? "text-[#18c48c]" : "text-[#ef4444]"} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {position.fundingSinceOpen >= 0 ? "+" : ""}
                ${position.fundingSinceOpen.toFixed(4)}
              </div>
            </div>
          </div>

          {/* Adjust Isolated Margin */}
          <div className="border-t border-[#1f2127] pt-3 space-y-2">
            <span className="text-[11px] text-[#a1a1aa]">Adjust Margin (USDC)</span>
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                value={marginAmount}
                onChange={(e) => setMarginAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-[#101114] border border-[#1f2127] rounded-lg px-3 py-2 text-sm text-[#f4f4f5] outline-none"
                style={{ fontVariantNumeric: "tabular-nums" }}
              />
              <button
                onClick={() => handleMargin(1)}
                disabled={marginBusy || !parseFloat(marginAmount)}
                className="px-3 py-2 rounded-lg bg-[#141619] text-[#18c48c] text-[12px] font-semibold hover:bg-[#1f2127] transition-colors disabled:opacity-40"
              >
                Add
              </button>
              <button
                onClick={() => handleMargin(-1)}
                disabled={marginBusy || !parseFloat(marginAmount)}
                className="px-3 py-2 rounded-lg bg-[#141619] text-[#ef4444] text-[12px] font-semibold hover:bg-[#1f2127] transition-colors disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          </div>

          {/* Close Position */}
          <div className="border-t border-[#1f2127] pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#a1a1aa]">Close Amount</span>
              <span className="text-[11px] text-[#f4f4f5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{closePercent}%</span>
            </div>

            <div className="flex gap-2">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setClosePercent(pct)}
                  className={`flex-1 py-1.5 rounded text-[11px] transition-colors ${
                    closePercent === pct
                      ? "bg-[#ef4444] text-white"
                      : "bg-[#141619] text-[#a1a1aa] hover:bg-[#1f2127]"
                  }`}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {pct}%
                </button>
              ))}
            </div>

            {error && (
              <div className="text-[11px] text-[#ef4444] bg-[#ef4444]/10 px-3 py-2 rounded">
                {error}
              </div>
            )}

            <button
              onClick={handleClose}
              disabled={closing}
              className="w-full py-3 rounded-lg bg-[#ef4444] hover:bg-[#dc2626] text-white font-bold text-sm transition-colors disabled:opacity-50"
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
