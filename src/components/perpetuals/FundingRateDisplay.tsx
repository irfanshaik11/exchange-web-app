// src/components/perpetuals/FundingRateDisplay.tsx
// Current funding rate with countdown to next funding (every 8h).

import React, { useState, useEffect } from "react";

interface FundingRateDisplayProps {
  fundingRate: number;
}

export default function FundingRateDisplay({ fundingRate }: FundingRateDisplayProps) {
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hours = now.getUTCHours();
      const nextHour = hours < 8 ? 8 : hours < 16 ? 16 : 24;
      const next = new Date(now);
      next.setUTCHours(nextHour, 0, 0, 0);
      if (nextHour === 24) next.setUTCDate(next.getUTCDate() + 1);

      const diff = next.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const isPositive = fundingRate >= 0;

  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-[#a1a1aa]">Funding Rate</span>
      <div className="flex items-center gap-2">
        <span className={isPositive ? "text-[#18c48c]" : "text-[#ef4444]"} style={{ fontVariantNumeric: "tabular-nums" }}>
          {isPositive ? "+" : ""}
          {(fundingRate * 100).toFixed(4)}%
        </span>
        <span className="text-[#a1a1aa]" style={{ fontVariantNumeric: "tabular-nums" }}>{countdown}</span>
      </div>
    </div>
  );
}
