import React, { useState, useCallback } from "react";
import { useQuickBuy } from "./QuickBuyContext";
import type { QuickBuySettings } from "./QuickBuyContext";
import VerticalInput from "./VerticalInput";
import {
  FaRunning,
  FaGasPump,
  FaCoins,
  FaInfoCircle,
  FaBan,
  FaShieldAlt,
  FaLock,
} from "react-icons/fa";
import InterstateTooltip from "./InterstateTooltip";
import InterstateButton from "./InterstateButton";
import toast from "react-hot-toast";
import CustomCheckbox from './CustomCheckbox';

const presetLabels = ["PRESET 1", "PRESET 2", "PRESET 3"];
const mevModes = [
  { label: "Off", value: "off" },
  { label: "Reduced", value: "reduced" },
  { label: "Secure", value: "on" },
];

interface QuickBuyProps {
  hideActionButton?: boolean;
  sideProp?: "buy" | "sell";
  onContinue?: () => void;
  className?: string;
  showDebugInfo?: boolean; // Show current query parameters for debugging
  onSettingsChange?: (queryParams: URLSearchParams, tradeParams: any, limitOrderParams: any) => void;
}

// Query parameter mapping functions for backend communication
export const mapSettingsToQueryParams = (settings: QuickBuySettings, side: "buy" | "sell") => {
  const params = new URLSearchParams();
  
  // Core trading parameters
  params.set('side', side);
  params.set('maxSlippage', (settings.maxSlippage * 100).toString()); // Convert to percentage
  params.set('priority', settings.priority.toString());
  params.set('bribe', settings.bribe.toString());
  
  // MEV Protection (convert to backend format: 0 = off, 1 = on/reduced)
  const mevProtection = settings.mevMode === 'off' ? '0' : '1';
  params.set('mevProtection', mevProtection);
  params.set('mevMode', settings.mevMode);
  
  // Auto fee settings
  params.set('autoFee', settings.autoFee.toString());
  if (settings.autoFee && settings.maxFee > 0) {
    params.set('maxFee', settings.maxFee.toString());
  }
  
  // RPC endpoint
  if (settings.rpc) {
    params.set('rpc', settings.rpc);
  }
  
  return params;
};

// Convert settings to trade API parameters
export const mapSettingsToTradeParams = (settings: QuickBuySettings, side: "buy" | "sell") => {
  return {
    side,
    maxSlippage: settings.maxSlippage,
    priority: settings.priority,
    bribe: settings.bribe,
    mevProtection: settings.mevMode === 'off' ? 0 : 1 as 0 | 1,
    mevMode: settings.mevMode,
    autoFee: settings.autoFee,
    maxFee: settings.maxFee,
    rpc: settings.rpc,
  };
};

// Convert settings to limit order parameters
export const mapSettingsToLimitOrderParams = (settings: QuickBuySettings, side: "buy" | "sell") => {
  return {
    type: side === "buy" ? "Buy" as const : "Sell" as const,
    direction: "Above" as const, // Default direction for limit orders
    maxSlippage: settings.maxSlippage,
    priority: settings.priority,
    bribe: settings.bribe,
    mevProtection: settings.mevMode === 'off' ? 0 : 1 as 0 | 1,
    mevMode: settings.mevMode,
    autoFee: settings.autoFee,
    maxFee: settings.maxFee,
    rpc: settings.rpc,
  };
};

const QuickBuy: React.FC<QuickBuyProps> = ({ 
  hideActionButton = false, 
  sideProp, 
  onContinue, 
  className, 
  showDebugInfo = false,
  onSettingsChange 
}) => {
  const {
    presets,
    setPresets,
    activePreset,
    setActivePreset,
  } = useQuickBuy();
  const [side, setSide] = useState<"buy" | "sell">(
    sideProp || "buy"
  );
  const [expanded, setExpanded] = useState(false);

  // Helper to update a field in the correct preset and side
  const updateSetting = (key: keyof QuickBuySettings, value: any) => {
    const newPresets = presets.map((p, i) =>
      i === activePreset
        ? {
            ...p,
            quickBuySettings:
              side === "buy"
                ? { ...p.quickBuySettings, [key]: value }
                : p.quickBuySettings,
            quickSellSettings:
              side === "sell"
                ? { ...p.quickSellSettings, [key]: value }
                : p.quickSellSettings,
          }
        : p
    );
    setPresets(newPresets);
  };

  const settings =
    side === "buy"
      ? presets[activePreset].quickBuySettings
      : presets[activePreset].quickSellSettings;

  // Get current settings as query parameters for backend communication
  const getCurrentQueryParams = useCallback(() => {
    return mapSettingsToQueryParams(settings, side);
  }, [settings, side]);

  // Get current settings as trade API parameters
  const getCurrentTradeParams = useCallback(() => {
    return mapSettingsToTradeParams(settings, side);
  }, [settings, side]);

  // Get current settings as limit order parameters
  const getCurrentLimitOrderParams = useCallback(() => {
    return mapSettingsToLimitOrderParams(settings, side);
  }, [settings, side]);

  // Notify parent component when settings change
  React.useEffect(() => {
    if (onSettingsChange) {
      const queryParams = getCurrentQueryParams();
      const tradeParams = getCurrentTradeParams();
      const limitOrderParams = getCurrentLimitOrderParams();
      onSettingsChange(queryParams, tradeParams, limitOrderParams);
    }
  }, [settings, side, onSettingsChange, getCurrentQueryParams, getCurrentTradeParams, getCurrentLimitOrderParams]);

  // Determine the wrapper className
  const defaultClass = "flex flex-col gap-2 rounded-xl border border-neutral-700/90 bg-neutral-900 px-3 py-3 text-neutral-100";
  // If className disables border/bg/rounded, use only className, else merge
  const wrapperClass = className !== undefined ? `flex flex-col gap-2 px-3 py-3 ${className}` : defaultClass;

  return (
    <div className={wrapperClass}>
      {/* Presets */}
      <div className="flex gap-2 rounded-xl border border-[#2A2B33] px-1 py-1 bg-[#17191E]">
        {presetLabels.map((label, i) => (
          <button
            key={label}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${activePreset === i ? "bg-[#4B5563] text-[#70E0B0]" : "bg-transparent text-[#9CA3AF] hover:bg-[#1E1F26] hover:text-[#70E0B0]"}`}
            onClick={() => {
              setActivePreset(i);
              setExpanded(true);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      
      {/* Grey line separator - extends beyond container */}
      <div className="h-px bg-[#2A2B33] w-screen -mx-3"></div>
      
      {/* Only show the rest if expanded */}
      {expanded && (
        <>
        {/* Buy/Sell Tabs */}
        <div className="flex gap-1 rounded-lg px-1   ">
          <button
            className={`flex-1 rounded-md px-2 py-1 text-[10px] uppercase transition-colors ${side === "buy" ? "bg-[#182a27] text-[#31e3ac]" : "bg-transparent text-[#9CA3AF] hover:bg-[#1E1F26] hover:text-[#E6E7EA]"}`}
            onClick={() => setSide("buy")}
          >
            Buy Settings
          </button>
          <button
            className={`flex-1 rounded-md px-2 py-1 text-[10px] uppercase transition-colors ${side === "sell" ? "bg-[#2c1720] text-[#ed3a7a]" : "bg-transparent text-[#9CA3AF] hover:bg-[#1E1F26] hover:text-[#E6E7EA]"}`}
            onClick={() => setSide("sell")}
          >
            Sell Settings
          </button>
        </div>
        
        {/* Bottom grey line separator - extends beyond container */}
        <div className="h-px bg-[#2A2B33] w-screen -mx-3"></div>
        {/* Settings Inputs */}
        <div className="mb-4 grid grid-cols-3 gap-3 px-2">
          <div className="flex flex-col items-center rounded-lg border border-[#2A2B33] overflow-hidden">
            <div className="relative w-full flex items-center justify-center bg-[#17191E]">
              <input
                type="number"
                min={0.1}
                max={100}
                step={0.01}
                className="w-full bg-[#17191E] text-center text-[#E6E7EA] py-2 text-sm outline-none border-b border-[#2A2B33] rounded-t-lg [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                style={{ textAlign: 'center', lineHeight: '1.5' }}
                value={settings.maxSlippage * 100}
                onChange={e => {
                  let val = Number(e.target.value);
                  // Clamp between 0.1 and 100
                  if (val < 0.1 && val !== 0) val = 0.1; // Allow 0 for typing, will be clamped on blur
                  if (val > 100) val = 100;
                  // Round to 2 decimal places
                  val = Math.round(val * 100) / 100;
                  updateSetting('maxSlippage', val / 100);
                }}
                onBlur={e => {
                  // On blur, ensure minimum of 0.1%
                  let val = Number(e.target.value);
                  if (val < 0.1) {
                    val = 0.1;
                    updateSetting('maxSlippage', val / 100);
                  }
                }}
                onWheel={e => (e.target as HTMLInputElement).blur()}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#9CA3AF]">%</span>
            </div>
            <span className="text-[10px] text-[#9CA3AF] flex items-center gap-1 rounded-b-lg bg-[#0f1012] px-2 py-1 w-full justify-center">
              <FaRunning className="text-[8px]" />
              SLIPPAGE
            </span>
          </div>
          <div className="flex flex-col items-center rounded-lg border border-[#2A2B33] overflow-hidden">
            <div className="w-full flex items-center justify-center bg-[#17191E]">
              <input
                type="number"
                min={0.0001}
                max={10.0}
                step={0.0001}
                className="w-full bg-[#17191E] text-center text-[#E6E7EA] py-2 text-sm outline-none border-b border-[#2A2B33] rounded-t-lg [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                style={{ textAlign: 'center', lineHeight: '1.5' }}
                value={settings.priority}
                onChange={e => {
                  let val = Number(e.target.value);
                  // Allow 0 during typing, clamp max
                  if (val > 10.0) val = 10.0;
                  // Round to 6 decimal places
                  val = Math.round(val * 1000000) / 1000000;
                  updateSetting('priority', val);
                }}
                onBlur={e => {
                  let val = Number(e.target.value);
                  if (val < 0.0001) {
                    toast.error('Priority fee cannot be 0 or negative. Minimum is 0.0001 SOL');
                    val = 0.0001;
                    updateSetting('priority', val);
                  }
                }}
                onWheel={e => (e.target as HTMLInputElement).blur()}
              />
            </div>
            <span className="text-[10px] text-[#9CA3AF] flex items-center gap-1 rounded-b-lg bg-[#0f1012] px-2 py-1 w-full justify-center">
              <FaGasPump className="text-[8px]" />
              PRIORITY
            </span>
          </div>
          <div className="flex flex-col items-center rounded-lg border border-[#2A2B33] overflow-hidden">
            <div className="w-full flex items-center justify-center bg-[#17191E]">
              <input
                type="number"
                min={0}
                max={10.0}
                step={0.0001}
                className="w-full bg-[#17191E] text-center text-[#E6E7EA] py-2 text-sm outline-none border-b border-[#2A2B33] rounded-t-lg [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                style={{ textAlign: 'center', lineHeight: '1.5' }}
                value={settings.bribe}
                onChange={e => {
                  let val = Number(e.target.value);
                  // Clamp max (allow 0 for bribe, it's optional)
                  if (val < 0) val = 0;
                  if (val > 10.0) val = 10.0;
                  // Round to 6 decimal places
                  val = Math.round(val * 1000000) / 1000000;
                  updateSetting('bribe', val);
                }}
                onBlur={e => {
                  let val = Number(e.target.value);
                  if (val < 0) {
                    toast.error('Bribe fee cannot be negative. Set to 0 SOL');
                    val = 0;
                    updateSetting('bribe', val);
                  }
                }}
                onWheel={e => (e.target as HTMLInputElement).blur()}
              />
            </div>
            <span className="text-[10px] text-[#9CA3AF] flex items-center gap-1 rounded-b-lg bg-[#0f1012] px-2 py-1 w-full justify-center">
              <FaCoins className="text-[8px]" />
              BRIBE
            </span>
          </div>
        </div>
        {/* Auto Fee and Max Fee */}
        <div className="mb-4 flex items-center justify-between gap-2 px-2">
          <label className="flex cursor-pointer items-center gap-2">
            <InterstateTooltip
              label={
                <div className="p-1 text-center">
                  Automatically adjusts priority
                  <br />
                  and bribe fees based on network
                  <br />
                  conditions. Locked upon order
                  <br />
                  creation for limit orders.
                </div>
              }
              widthClass="w-52"
            >
              <span className="flex items-center gap-2">
                <CustomCheckbox checked={settings.autoFee} onChange={e => updateSetting('autoFee', e.target.checked)} className="mr-2" />
                <span className="text-xs font-bold text-neutral-300">
                  Auto Fee
                </span>
              </span>
            </InterstateTooltip>
          </label>
          <div className="rounded-3xl border border-neutral-700/90 px-2 py-1">
            <span className="text-xs text-neutral-600">MAX FEE</span>
            <input
              type="number"
              className="ml-2 w-28 flex-1 text-xs text-neutral-200 outline-none"
              placeholder="MAX FEE"
              value={settings.maxFee}
              onChange={e => updateSetting('maxFee', Number(e.target.value))}
              disabled={settings.autoFee}
            />
          </div>
        </div>
        {/* MEV Mode */}
        <div className="mb-4 flex items-center gap-2 px-2">
          <InterstateTooltip
            widthClass="w-90"
            label={
              <>
                <b>Off</b>
                <br />
                Send trades as fast as possible to all Solana validators
                <br />
                <br />
                <b>Reduced</b>
                <br />
                Avoid sending transactions to blacklisted validators to reduce
                chances of MEV attacks
                <br />
                <br />
                <b>Secure [BETA]</b>
                <br />
                Only sends transactions to whitelisted validators.
                <br />
                This can be slow.
              </>
            }
          >
            <span className="mr-2 flex cursor-pointer items-center text-xs text-neutral-300">
              MEV Mode <FaInfoCircle className="ml-1" />
            </span>
          </InterstateTooltip>
          <div className="flex gap-1 rounded-lg border border-[#2A2B33] px-1 py-1 bg-[#17191E]">
            {mevModes.map((mode) => (
              <button
                key={mode.value}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${settings.mevMode === mode.value ? "bg-[#1a1f38] text-[#526fff]" : "bg-transparent text-[#9CA3AF] hover:bg-[#1E1F26] hover:text-[#E6E7EA]"}`}
                onClick={() => updateSetting('mevMode', mode.value as any)}
              >
                {mode.value === "off" && <FaBan />}
                {mode.value === "reduced" && <FaShieldAlt />}
                {mode.value === "on" && <FaLock />}
                {mode.label}
              </button>
            ))}
          </div>
        </div>
        {/* RPC Input */}
        <div className="mb-2 flex flex-row items-center rounded-3xl border border-neutral-700/90 pl-2 px-2">
          <span className="text-xs text-neutral-600">RPC</span>
          <input
            type="text"
            className="w-full px-3 py-2 text-xs text-neutral-300 outline-none"
            placeholder="https://"
            value={settings.rpc || ""}
            onChange={e => updateSetting('rpc', e.target.value)}
          />
        </div>
        {!hideActionButton && (
          <div className="pt-2">
            <InterstateButton onClick={onContinue} className="w-full">Continue</InterstateButton>
          </div>
        )}
        </>
      )}
      
      {/* Debug Information - Show current query parameters */}
      {showDebugInfo && (
        <div className="mt-4 p-3 bg-gray-800 rounded-lg border border-gray-600">
          <h4 className="text-sm font-bold text-gray-300 mb-2">Current Settings (Backend Query Parameters):</h4>
          <div className="text-xs text-gray-400 space-y-1">
            <div><strong>Query String:</strong> {getCurrentQueryParams().toString()}</div>
            <div><strong>Trade Params:</strong> {JSON.stringify(getCurrentTradeParams(), null, 2)}</div>
            <div><strong>Limit Order Params:</strong> {JSON.stringify(getCurrentLimitOrderParams(), null, 2)}</div>
          </div>
        </div>
      )}
    </div>
  );
};

// Hook to get current settings as query parameters
export const useQuickBuyQueryParams = () => {
  const { presets, activePreset } = useQuickBuy();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  
  const settings = side === "buy" 
    ? presets[activePreset].quickBuySettings 
    : presets[activePreset].quickSellSettings;

  const getQueryParams = useCallback(() => {
    return mapSettingsToQueryParams(settings, side);
  }, [settings, side]);

  const getTradeParams = useCallback(() => {
    return mapSettingsToTradeParams(settings, side);
  }, [settings, side]);

  const getLimitOrderParams = useCallback(() => {
    return mapSettingsToLimitOrderParams(settings, side);
  }, [settings, side]);

  return {
    settings,
    side,
    setSide,
    getQueryParams,
    getTradeParams,
    getLimitOrderParams,
    queryString: getQueryParams().toString(),
  };
};

export default QuickBuy; 