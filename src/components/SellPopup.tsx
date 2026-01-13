"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { FaTimes, FaRunning, FaGasPump, FaCoins, FaBan } from "react-icons/fa";
import { formatSmartNumber } from "~/utils/db";
import { tradeSellPercentage, SOL_MINT_ADDRESS, ApiError } from "~/utils/api";
import toast from "react-hot-toast";
import { useUser } from "~/components/UserContext";
import InterstateTooltip from "./InterstateTooltip";
import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";
import type { PositionRow } from "~/utils/functions";
import { useQuickBuy } from "~/components/QuickBuyContext";
import HighSlippageWarningDialog from "./HighSlippageWarningDialog";
import { fetchVerifiedPairAddress } from "~/hooks/useSingleTokenPolling";

interface SellPopupProps {
  isOpen: boolean;
  onClose: () => void;
  position: PositionRow;
  tokenMetadata?: {
    name?: string;
    symbol?: string;
    imageUrl?: string;
    protocol?: string;
    migrated_pool_address?: string; // For graduated tokens (Meteora DBC -> permanent pool)
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

  // Debug logging when popup opens
  useEffect(() => {
    if (isOpen) {
      console.log('🔍 [SellPopup] Opened with data:', {
        tokenAddress: position.tokenAddress,
        pairAddress: position.pairAddress,
        protocol: tokenMetadata?.protocol,
        migrated_pool_address: tokenMetadata?.migrated_pool_address,
        symbol: tokenMetadata?.symbol
      });
    }
  }, [isOpen, position, tokenMetadata]);

  // High slippage warning dialog state
  const [showSlippageWarning, setShowSlippageWarning] = useState(false);
  const [bypassSlippageCheck, setBypassSlippageCheck] = useState(false);
  const sellButtonRef = useRef<HTMLButtonElement>(null);

  // Get sell settings from QuickBuy context
  const settings = presets[activePreset].quickSellSettings;

  // High slippage warning handlers
  const handleSlippageWarningContinue = useCallback(() => {
    setShowSlippageWarning(false);
    setBypassSlippageCheck(true); // Set flag to bypass check and continue with sell
  }, []);

  const handleSlippageWarningCancel = useCallback(() => {
    setShowSlippageWarning(false);
    setBypassSlippageCheck(false);
    setIsLoading(false);
  }, []);

  // When user confirms high slippage, programmatically trigger the sell button click
  useEffect(() => {
    if (bypassSlippageCheck && sellButtonRef.current) {
      sellButtonRef.current.click();
    }
  }, [bypassSlippageCheck]);

  // Calculate effective pool address: use migrated_pool_address if available (for graduated tokens)
  const effectivePoolAddress = useMemo(() => {
    // Priority: migrated_pool_address (for graduated Meteora DBC) > pairAddress (original pool)
    const migratedPool = tokenMetadata?.migrated_pool_address;
    const effectivePool = migratedPool && migratedPool !== '' ? migratedPool : position.pairAddress;

    if (migratedPool && migratedPool !== '') {
      console.log(`🔄 [SellPopup] Using migrated pool address: ${migratedPool}`);
    } else {
      console.log(`📍 [SellPopup] Using original pair address: ${position.pairAddress}`);
    }

    return effectivePool;
  }, [tokenMetadata?.migrated_pool_address, position.pairAddress]);

  // Get pool type: use protocol from tokenMetadata if available
  // For graduated tokens, the protocol might just be "meteora" which doesn't map to a specific pool type
  // In that case, let the backend auto-detect from the migrated pool address by returning empty string
  const poolType = useMemo(() => {
    const protocol = tokenMetadata?.protocol || '';
    const detectedType = getPoolTypeFromToken({
      mint: position.tokenAddress,
      pair_address: effectivePoolAddress, // Use effective pool (migrated if available)
      launchpad_protocol: protocol,
    } as any);

    // If protocol is just "meteora" without a specific type (dbc/v1/v2), return empty to let backend auto-detect
    if (protocol.toLowerCase() === 'meteora' && detectedType === '') {
      console.log(`🏷️  [SellPopup] Protocol is "meteora" without specific type - letting backend auto-detect from pool address`);
      return ''; // Backend will auto-detect from migrated pool address
    }

    console.log(`🏷️  [SellPopup] Pool type detected: "${detectedType}" (protocol: ${protocol || 'none'})`);

    return detectedType;
  }, [position.tokenAddress, effectivePoolAddress, tokenMetadata?.protocol]);

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
      setIsLoading(false); // Critical Fix #12: Reset loading state
      return;
    }

    if (!amount || Number(amount) <= 0) {
      toast.error("Enter a valid percentage");
      setIsLoading(false); // Critical Fix #12: Reset loading state
      return;
    }

    if (Number(amount) > 100) {
      toast.error("Percentage cannot exceed 100%");
      setIsLoading(false); // Critical Fix #12: Reset loading state
      return;
    }

    // Check for high slippage BEFORE executing sell
    if (!bypassSlippageCheck) {
      const slippagePercent = (settings.maxSlippage || 0.2) * 100;
      const HIGH_SLIPPAGE_THRESHOLD = 50;

      if (slippagePercent >= HIGH_SLIPPAGE_THRESHOLD) {
        setIsLoading(true); // Show loading state
        setShowSlippageWarning(true);
        return; // Don't execute yet, wait for user confirmation
      }
    }

    // Reset bypass flag for next trade
    if (bypassSlippageCheck) {
      setBypassSlippageCheck(false);
    }

    setIsLoading(true);
    setMessage(null);

    try {
      // CRITICAL: Verify the pair address from the token service before selling
      let verifiedPoolAddress = effectivePoolAddress;
      if (position.tokenAddress) {
        console.log(`[SellPopup] Verifying pair address for sell: ${position.tokenAddress}`);
        const fetchedAddress = await fetchVerifiedPairAddress(position.tokenAddress);
        if (fetchedAddress) {
          if (fetchedAddress !== effectivePoolAddress) {
            console.log(`[SellPopup] Pair address mismatch! Local: ${effectivePoolAddress}, Verified: ${fetchedAddress}`);
          }
          verifiedPoolAddress = fetchedAddress;
        }
      }

      const sellParams = {
        tokenAddress: position.tokenAddress,
        percentageToSell: Number(amount),
        poolAddress: verifiedPoolAddress,
        baseMint: position.tokenAddress,
        quoteMint: SOL_MINT_ADDRESS,
        poolType,
        originalPairAddress: verifiedPoolAddress, // Use verified address
        // Preset trading parameters
        slippage: (settings.maxSlippage || 0.2) * 100, // Convert decimal to percentage (0.2 -> 20)
        priorityFee: settings.priority || 0.001,
        bribe: settings.bribe ?? 0.05,
      };

      console.log('🚀 [SellPopup] Sending sell request:', sellParams);

      const result = await tradeSellPercentage(sellParams, user.bearerToken);

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
      // Use console.warn for expected validation errors, console.error for unexpected errors
      const logFn = (error as any)?.expected ? console.warn : console.error;
      logFn("Sell error:", error);

      if (error instanceof ApiError) {
        // Handle structured API errors with specific codes
        let errorMessage = "❌ Trade failed. Please try again.";

        if (error.code === 'NO_HOLDINGS') {
          errorMessage = `❌ No ${tokenMetadata?.symbol || 'tokens'} to sell`;
          toast.error(`No ${tokenMetadata?.symbol || 'tokens'} to sell`, { duration: 4000 });
        } else if (error.code === 'POOL_GRADUATED') {
          errorMessage = `⚠️ Pool has graduated to another DEX`;
          toast.error('Pool has migrated. Refresh the page.', { duration: 4000 });
        } else if (error.code === 'POOL_UNAVAILABLE') {
          errorMessage = `⚠️ Pool unavailable`;
          toast.error('Pool has insufficient liquidity', { duration: 4000 });
        } else if (error.code === 'TX_FAILED') {
          errorMessage = `❌ Trade failed. Try adjusting slippage.`;
          toast.error('Trade failed. Try adjusting slippage.', { duration: 4000 });
        } else if (error.code === 'INSUFFICIENT_BALANCE') {
          errorMessage = `⚠️ Insufficient balance`;
          toast.error('Insufficient balance', { duration: 4000 });
        } else if (error.code === 'INVALID_POOL_TYPE') {
          errorMessage = `⚠️ Pool type not supported`;
          toast.error('Pool type not supported', { duration: 4000 });
        } else if (error.code === 'VALIDATION_ERROR') {
          errorMessage = `❌ Invalid parameters`;
          toast.error('Invalid trade parameters', { duration: 4000 });
        } else {
          // Generic error with shortened message
          const msg = error.message.length > 60 ? error.message.substring(0, 57) + '...' : error.message;
          errorMessage = `❌ ${msg}`;
          toast.error(msg, { duration: 4000 });
        }

        setMessage({ type: "error", text: errorMessage });
      } else {
        // Unexpected error - show generic message
        const errorMessage = "❌ Trade failed. Please try again.";
        toast.error("Trade failed. Please try again.", { duration: 4000 });
        setMessage({ type: "error", text: errorMessage });
      }
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
            ref={sellButtonRef}
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

      {/* High Slippage Warning Dialog */}
      <HighSlippageWarningDialog
        isOpen={showSlippageWarning}
        slippagePercent={(settings.maxSlippage || 0.2) * 100}
        onContinue={handleSlippageWarningContinue}
        onCancel={handleSlippageWarningCancel}
      />
    </div>
  );
};

export default SellPopup;
