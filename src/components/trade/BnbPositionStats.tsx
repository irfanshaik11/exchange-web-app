"use client";

import React from "react";
import { LuArrowLeftRight } from "react-icons/lu";
import { BNB_CHAIN_ICON } from "~/utils/bnbProtocols";

const AX = {
  surface: "#101114",
  border: "#1f2127",
  muted: "#71717a",
  mint: "#18c48c",
  sell: "#ef4444",
};

function BnbIcon({ size = 16 }: { size?: number }) {
  return (
    <img
      src={BNB_CHAIN_ICON}
      alt="BNB"
      width={size}
      height={size}
      className="rounded-full object-cover"
    />
  );
}

const formatPanelUsd = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const abs = Math.abs(n);
  if (abs < 0.01) return "<0.01";
  if (abs < 1) return n.toFixed(2);
  const formatCompact = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
    if (a >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (a >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return Math.round(v).toString();
  };
  return formatCompact(Math.round(n));
};

export interface PositionDisplay {
  bought: string;
  sold: string;
  holding: string;
  pnlUsd: number;
  pnlPct: number;
}

interface BnbPositionStatsProps {
  positionDisplay: PositionDisplay;
  pnlMode: "unrealized" | "realized";
  onPnlModeToggle: () => void;
}

const BnbPositionStats: React.FC<BnbPositionStatsProps> = ({
  positionDisplay,
  pnlMode,
  onPnlModeToggle,
}) => {
  const pnlPositive = positionDisplay.pnlUsd >= 0;

  return (
    <div className="grid grid-cols-4 gap-1 p-3">
      {(["Bought", "Sold", "Holding", "UPnL"] as const).map((label, idx) => {
        const isPnl = label === "UPnL";
        const color = idx === 1 ? AX.sell : idx === 2 ? "#3b82f6" : AX.mint;
        const valueLabel =
          label === "Bought"
            ? positionDisplay.bought
            : label === "Sold"
              ? positionDisplay.sold
              : label === "Holding"
                ? positionDisplay.holding
                : null;

        return (
          <div
            key={label}
            className="flex flex-col items-center justify-center gap-1 rounded-lg p-2"
            style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}
          >
            {isPnl ? (
              <button
                type="button"
                role="switch"
                aria-checked={pnlMode === "unrealized"}
                onClick={onPnlModeToggle}
                className="flex flex-col items-center gap-1"
              >
                <span
                  className="flex items-center gap-1 text-[9px] uppercase tracking-wide"
                  style={{ color: AX.muted }}
                >
                  {pnlMode === "unrealized" ? "UPnL" : "PnL"}
                  <LuArrowLeftRight size={9} />
                </span>
                <div className="flex items-center gap-1">
                  <BnbIcon size={10} />
                  <span
                    className="text-[9px] font-semibold"
                    style={{ color: pnlPositive ? AX.mint : AX.sell }}
                  >
                    {pnlPositive ? "+" : "-"}${formatPanelUsd(Math.abs(positionDisplay.pnlUsd))}
                    {pnlMode === "unrealized"
                      ? ` (${pnlPositive ? "+" : ""}${positionDisplay.pnlPct.toFixed(1)}%)`
                      : ""}
                  </span>
                </div>
              </button>
            ) : (
              <>
                <span
                  className="text-[9px] uppercase tracking-wide"
                  style={{ color: AX.muted }}
                >
                  {label}
                </span>
                <div className="flex items-center gap-1">
                  <BnbIcon size={10} />
                  <span className="text-[10px] font-semibold" style={{ color }}>
                    ${valueLabel}
                  </span>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BnbPositionStats;
