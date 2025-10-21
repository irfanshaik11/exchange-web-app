"use client";

import React, { useState, useEffect, useMemo } from "react";
import { FaTimes, FaRunning, FaGasPump, FaCoins, FaBan } from "react-icons/fa";
import { formatSmartNumber } from "~/utils/db";
import { tradeSellPercentage, SOL_MINT_ADDRESS } from "~/utils/api";
import toast from "react-hot-toast";
import { useUser } from "~/components/UserContext";
import InterstateTooltip from "./InterstateTooltip";
import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";
import type { PositionRow } from "~/utils/functions";
import { useQuickBuy } from "~/components/QuickBuyContext";

interface SellPopupProps {
  isOpen: boolean;
  onClose: () => void;
  position: PositionRow;
  tokenMetadata?: {
    name?: string;
    symbol?: string;
    imageUrl?: string;
  };
  onSellSuccess?: () => void;
}

const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  mint: "#70E0B0",
  mintHover: "#58B890",
  sell: "#FF4D7F",
};

const sellPresets = [10, 25, 50, 100];

const SellPopup: React.FC<SellPopupProps> = ({ isOpen, onClose, position, tokenMetadata, onSellSuccess }) => {
  const { user } = useUser();
  const { presets, activePreset } = useQuickBuy();
  const [amount, setAmount] = useState("");
  const [sliderPct, setSliderPct] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Get sell settings from QuickBuy context
  const settings = presets[activePreset].quickSellSettings;

  // Calculate effective pool address
  const effectivePoolAddress = useMemo(() => {
    return position.pairAddress;
  }, [position.pairAddress]);

  // Get pool type
  const poolType = useMemo(() => {
    return getPoolTypeFromToken({
      mint: position.tokenAddress,
      pair_address: position.pairAddress,
    } as any);
  }, [position.tokenAddress, position.pairAddress]);

  // Update slider when amount changes
  useEffect(() => {
    if (amount) {
      const pct = Math.min(100, Math.max(0, Number(amount)));
      setSliderPct(pct);
    } else {
      setSliderPct(0);
    }
  }, [amount]);

  // Update amount when slider changes
  const handleSliderChange = (value: number) => {
    setSliderPct(value);
    setAmount(value.toString());
  };

  // Handle preset button clicks
  const handlePresetClick = (preset: number) => {
    setAmount(preset.toString());
    setSliderPct(preset);
  };

  // Handle sell action
  const handleSell = async () => {
    if (!user?.bearerToken) {
      toast.error("Please log in to trade");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      toast.error("Enter a valid percentage");
      return;
    }

    if (Number(amount) > 100) {
      toast.error("Percentage cannot exceed 100%");
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      // Note: Trading parameters (slippage, bribe, MEV protection) are displayed for user awareness
      // The backend may use default values or handle these parameters internally
      const result = await tradeSellPercentage({
        tokenAddress: position.tokenAddress,
        percentageToSell: Number(amount),
        poolAddress: effectivePoolAddress,
        baseMint: position.tokenAddress,
        quoteMint: SOL_MINT_ADDRESS,
        poolType,
        originalPairAddress: position.pairAddress,
      }, user.bearerToken);

      if (result?.hash || (result as any)?.txid) {
        const txHash = result.hash || (result as any).txid;
        setMessage({
          type: "success",
          text: `✅ Sold ${amount}% successfully! Tx: ${String(txHash).slice(0, 8)}...`,
        });
        toast.success(`Sold ${amount}% of ${tokenMetadata?.symbol || 'tokens'} successfully!`);
        
        // Call success callback to refresh positions
        if (onSellSuccess) {
          onSellSuccess();
        }
        
        // Close popup after successful trade
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setMessage({ type: "error", text: "❌ Trade failed. Please try again." });
        toast.error("Trade failed. Please try again.");
      }
    } catch (error: any) {
      console.error("Sell error:", error);
      setMessage({ type: "error", text: "❌ Trade failed. Please try again." });
      toast.error("Trade failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div 
        className="relative w-full max-w-md mx-4 bg-[#1E1F26] rounded-lg border border-[#2A2B33] shadow-2xl"
        style={{ background: AX.surface }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2A2B33]">
          <h3 className="text-lg font-semibold text-white">
            Sell {tokenMetadata?.symbol || 'Token'}
          </h3>
          <button
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-white transition-colors"
          >
            <FaTimes size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Token Info - Minimal */}
          <div className="flex items-center gap-2 text-sm text-[#9CA3AF]">
            {tokenMetadata?.imageUrl && (
              <img 
                src={tokenMetadata.imageUrl} 
                alt={tokenMetadata.symbol}
                className="w-5 h-5 rounded-full"
              />
            )}
            <span>{tokenMetadata?.symbol || 'Token'}</span>
            <span>•</span>
            <span>{formatSmartNumber(position.remaining)} remaining</span>
          </div>

          {/* Amount Input */}
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "" || (/^\d*([.]\d{0,9})?$/.test(value) && Number(value) <= 100)) {
                  setAmount(value);
                }
              }}
              placeholder="0"
              className="w-full h-10 px-3 pr-12 bg-[#17191E] border border-[#2A2B33] rounded-lg text-white placeholder-[#9CA3AF] focus:outline-none focus:border-[#70E0B0] text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
              <span className="text-xs font-semibold text-[#E6E7EA]">%</span>
              <div className="bg-[#2A2B33] px-1.5 py-0.5 rounded text-xs text-white">
                {sliderPct}%
              </div>
            </div>
          </div>

          {/* Slider */}
          <div className="relative">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={sliderPct}
              onChange={(e) => handleSliderChange(Number(e.target.value))}
              className="w-full h-1.5 bg-[#2A2B33] rounded-lg appearance-none cursor-pointer slider"
              style={{
                background: `linear-gradient(to right, ${AX.sell} 0%, ${AX.sell} ${sliderPct}%, #2A2B33 ${sliderPct}%, #2A2B33 100%)`
              }}
            />
          </div>

          {/* Preset Buttons - Compact */}
          <div className="grid grid-cols-4 gap-1.5">
            {sellPresets.map((preset) => (
              <button
                key={preset}
                onClick={() => handlePresetClick(preset)}
                className={`h-7 rounded text-xs font-medium transition-colors ${
                  sliderPct === preset
                    ? 'bg-[#FF4D7F] text-white'
                    : 'bg-[#17191E] text-[#9CA3AF] hover:text-white border border-[#2A2B33]'
                }`}
              >
                {preset}%
              </button>
            ))}
          </div>

          {/* Trading Settings */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#9CA3AF]">
            <InterstateTooltip label="Max Slippage">
              <span className="flex items-center gap-1">
                <FaRunning className="opacity-80" /> {settings.maxSlippage * 100}%
              </span>
            </InterstateTooltip>
            <InterstateTooltip
              label={`Priority Fee: ${settings.priority}. ${settings.priority < 0.01 ? "We recommend a priority fee of atleast 0.01" : ""}`}
            >
              <span className="flex items-center gap-1">
                <FaGasPump className="opacity-90" /> {settings.priority}
                {settings.priority < 0.01 ? <span className="text-[#FF4D7F]">⚠</span> : null}
              </span>
            </InterstateTooltip>
            <InterstateTooltip label={`Bribe: ${settings.bribe} SOL`}>
              <span className="flex items-center gap-1">
                <FaCoins className="opacity-90" /> {settings.bribe} <span className="text-[#FF4D7F]">⚠</span>
              </span>
            </InterstateTooltip>
            <InterstateTooltip label="MEV Protection">
              <span
                className={`flex items-center gap-1 ${
                  settings.mevMode === "off" ? "text-[#9CA3AF]" : settings.mevMode === "reduced" ? "text-[#9CA3AF]" : "text-[#70E0B0]"
                }`}
              >
                <FaBan className="opacity-90" />
                {settings.mevMode === "off" ? "Off" : settings.mevMode === "reduced" ? "Reduced" : "Secure"}
              </span>
            </InterstateTooltip>
          </div>

          {/* Message */}
          {message && (
            <div className={`p-2 rounded text-xs ${
              message.type === "success" 
                ? "bg-green-900/20 text-green-400 border border-green-800" 
                : "bg-red-900/20 text-red-400 border border-red-800"
            }`}>
              {message.text}
            </div>
          )}

          {/* Sell Button */}
          <button
            onClick={handleSell}
            disabled={isLoading || !amount || Number(amount) <= 0}
            className={`w-full h-10 rounded-lg font-medium text-white transition-colors text-sm ${
              isLoading || !amount || Number(amount) <= 0
                ? 'bg-[#2A2B33] text-[#9CA3AF] cursor-not-allowed'
                : 'bg-[#FF4D7F] hover:bg-[#E63E6B]'
            }`}
          >
            {isLoading ? 'Selling...' : `Sell ${amount ? amount + '%' : ''}`}
          </button>
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #FF4D7F;
          cursor: pointer;
          border: 1px solid #1E1F26;
        }
        
        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #FF4D7F;
          cursor: pointer;
          border: 1px solid #1E1F26;
        }
      `}</style>
    </div>
  );
};

export default SellPopup;
