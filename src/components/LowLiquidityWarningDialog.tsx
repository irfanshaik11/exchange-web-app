"use client";

import React from "react";
import { FaTimes, FaExclamationTriangle } from "react-icons/fa";

interface LowLiquidityWarningDialogProps {
  isOpen: boolean;
  liquidityUsd: number;
  thresholdUsd: number;
  onContinue: () => void;
  onCancel: () => void;
}

const formatUsd = (value: number): string => {
  if (!Number.isFinite(value)) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const LowLiquidityWarningDialog: React.FC<LowLiquidityWarningDialogProps> = ({
  isOpen,
  liquidityUsd,
  thresholdUsd,
  onContinue,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
      <div className="relative w-full max-w-md mx-4 bg-[#1E1F26] rounded-lg border border-[#F97316] shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-[#2A2B33]">
          <div className="flex items-center gap-2">
            <FaExclamationTriangle className="text-[#F97316]" size={20} />
            <h3 className="text-lg font-semibold text-white">Low Liquidity Warning</h3>
          </div>
          <button
            onClick={onCancel}
            className="text-[#9CA3AF] hover:text-white transition-colors"
          >
            <FaTimes size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-center">
            <p className="text-sm text-[#9CA3AF]">Current Pool Liquidity</p>
            <div className="text-4xl font-bold text-[#F97316] mt-1">
              {formatUsd(Math.max(liquidityUsd, 0))}
            </div>
          </div>

          <div className="bg-[#17191E] border border-[#2A2B33] rounded-lg p-4 space-y-3">
            <p className="text-sm text-[#E6E7EA]">
              This pool currently has{" "}
              <span className="font-semibold text-white">
                {formatUsd(Math.max(liquidityUsd, 0))}
              </span>{" "}
              of liquidity. We recommend at least{" "}
              <span className="font-semibold text-white">
                {formatUsd(thresholdUsd)}
              </span>{" "}
              before taking new positions.
            </p>
            <ul className="space-y-2 text-sm text-[#9CA3AF]">
              <li className="flex items-start gap-2">
                <span className="text-[#F97316] mt-0.5">•</span>
                <span>Low liquidity can lead to extreme price impact on buys and sells</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#F97316] mt-0.5">•</span>
                <span>Large holders can move the price sharply with small trades</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#F97316] mt-0.5">•</span>
                <span>Exiting your position later may be difficult or costly</span>
              </li>
            </ul>
          </div>

          <div className="bg-[#3b2413] border border-[#F97316]/40 rounded-lg p-3">
            <p className="text-xs text-[#F97316] text-center">
              ⚠️ Only continue if you understand and accept the risks of trading illiquid pools
            </p>
          </div>
        </div>

        <div className="flex gap-3 p-4 border-t border-[#2A2B33]">
          <button
            onClick={onCancel}
            className="flex-1 h-10 rounded-lg font-medium text-white bg-[#2A2B33] hover:bg-[#3A3B43] transition-colors text-sm"
          >
            Go Back
          </button>
          <button
            onClick={onContinue}
            className="flex-1 h-10 rounded-lg font-medium text-white bg-[#F97316] hover:bg-[#ea580c] transition-colors text-sm"
          >
            Continue Anyway
          </button>
        </div>
      </div>
    </div>
  );
};

export default LowLiquidityWarningDialog;

