import React, { useRef, useState } from "react";
import { useRouter } from "next/router";
import InterstatePopout from "./InterstatePopout";
import { useQuickBuy } from "./QuickBuyContext";
import type { QuickBuySettings, QuickBuyPreset } from "./QuickBuyContext";
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
import CustomCheckbox from './CustomCheckbox';
import { useUser } from "./UserContext";
import toast from "react-hot-toast";
import { updateRpcEndpoint } from "~/utils/api";

interface QuickBuySettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const presetLabels = ["PRESET 1", "PRESET 2", "PRESET 3"];
const mevModes = [
  { label: "Off", value: "off" },
  { label: "Reduced", value: "reduced" },
  { label: "Secure", value: "on" },
];

export default function QuickBuySettingsModal({
  open,
  onClose,
}: QuickBuySettingsModalProps) {
  const router = useRouter();
  const currentChain = (router.query.chain as string) || "sol";
  const isMonad = currentChain === "monad";
  const {
    presets,
    setPresets,
    activePreset,
    setActivePreset,
  } = useQuickBuy();
  const { user } = useUser();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [isSavingRpc, setIsSavingRpc] = useState(false);
  const rpcUpdateTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmittedRpc = useRef<string>("");

  // Helper to update a field in the correct preset and side
  const updateSetting = (key: keyof QuickBuySettings, value: any) => {
    const newPresets = presets.map((p, i) =>
      i === activePreset
        ? {
            ...p,
            quickBuySettings: side === "buy"
              ? { ...p.quickBuySettings, [key]: value }
              : p.quickBuySettings,
            quickSellSettings: side === "sell"
              ? { ...p.quickSellSettings, [key]: value }
              : p.quickSellSettings,
          }
        : p
    );
    setPresets(newPresets);
  };

  const settings = side === "buy"
    ? presets[activePreset].quickBuySettings
    : presets[activePreset].quickSellSettings;

  const scheduleRpcUpdate = React.useCallback((rawValue: string) => {
    if (rpcUpdateTimeout.current) {
      clearTimeout(rpcUpdateTimeout.current);
      rpcUpdateTimeout.current = null;
    }

    const trimmed = rawValue.trim();

    console.log('[QuickBuySettingsModal] RPC input change detected:', {
      rawValue,
      trimmed,
      hasToken: Boolean(user?.bearerToken),
      sameAsLast: trimmed === lastSubmittedRpc.current,
    });

    if (!trimmed || !user?.bearerToken) {
      return;
    }

    if (!/^https?:\/\//i.test(trimmed)) {
      return;
    }

    if (trimmed === lastSubmittedRpc.current) {
      return;
    }

    rpcUpdateTimeout.current = setTimeout(async () => {
      rpcUpdateTimeout.current = null;
      setIsSavingRpc(true);
      console.log('[QuickBuySettingsModal] ▶️ Sending RPC update request...');
      try {
        await updateRpcEndpoint(trimmed, user.bearerToken);
        lastSubmittedRpc.current = trimmed;
        toast.success('RPC endpoint updated', { id: 'rpc-update' });
      } catch (error: any) {
        console.error('Failed to update RPC endpoint', error);
        toast.error(error?.message || 'Failed to update RPC endpoint', { id: 'rpc-update' });
      } finally {
        setIsSavingRpc(false);
      }
    }, 500);
  }, [user?.bearerToken]);

  const handleRpcChange = (value: string) => {
    updateSetting('rpc', value);
    scheduleRpcUpdate(value);
  };

  React.useEffect(() => {
    return () => {
      if (rpcUpdateTimeout.current) {
        clearTimeout(rpcUpdateTimeout.current);
        rpcUpdateTimeout.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (!user?.bearerToken) {
      lastSubmittedRpc.current = "";
    }
  }, [user?.bearerToken]);

  // Save changes to context and presets
  const handleContinue = () => {
    onClose();
  };

  return (
    <InterstatePopout
      open={open}
      onClose={onClose}
      align="center"
      className="relative flex w-full max-w-md mx-auto flex-col gap-3 border border-[#2A2B33] bg-[#1E1F26] text-[#E6E7EA] shadow-2xl rounded-lg"
    >
      <div className="flex items-center justify-between border-b border-[#2A2B33] px-4 py-3 text-lg font-semibold text-[#E6E7EA]">
        Trading Settings
        <button
          onClick={onClose}
          className="text-2xl text-[#9CA3AF] hover:text-[#E6E7EA] transition-colors"
        >
          ×
        </button>
      </div>
      {/* Presets */}
      <div className="mx-3 mb-2 flex gap-2 rounded-lg border border-[#2A2B33] bg-[#17191E] px-1 py-1">
        {presetLabels.map((label, i) => (
          <button
            key={label}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors border border-[#2A2B33] ${
              activePreset === i 
                ? "text-[#85d99f]" 
                : "text-[#9CA3AF] hover:text-[#E6E7EA]"
            }`}
            style={{
              backgroundColor: "#1a1c1f",
            }}
            onClick={() => setActivePreset(i)}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Buy/Sell Tabs */}
      <div className="mx-3 flex gap-2 rounded-lg border border-[#2A2B33] bg-[#17191E] px-1 py-1">
        <button
          className={`flex-1 rounded-md px-3 py-1.5 text-xs uppercase transition-colors font-semibold ${
            side === "buy" 
              ? "bg-[#70E0B0] text-black" 
              : "bg-transparent text-[#9CA3AF] hover:text-[#E6E7EA] hover:bg-[#1E1F26]"
          }`}
          onClick={() => setSide("buy")}
        >
          Buy Settings
        </button>
        <button
          className={`flex-1 rounded-md px-3 py-1.5 text-xs uppercase transition-colors font-semibold ${
            side === "sell" 
              ? "bg-[#FF4D7F] text-white" 
              : "bg-transparent text-[#9CA3AF] hover:text-[#E6E7EA] hover:bg-[#1E1F26]"
          }`}
          onClick={() => setSide("sell")}
        >
          Sell Settings
        </button>
      </div>
      {/* Settings Inputs */}
      {isMonad ? (
        /* Monad: Only show Slippage (as percentage) and Gas Price */
        <div className="mb-4 grid grid-cols-2 gap-3 px-4">
          <VerticalInput
            label="SLIPPAGE %"
            value={settings.maxSlippage !== undefined ? settings.maxSlippage * 100 : undefined}
            setValue={v => {
              // Convert percentage to decimal for storage
              updateSetting('maxSlippage', v !== undefined ? v / 100 : undefined);
            }}
            icon={<FaRunning />}
            className="border-[#2A2B33]"
            inputClassName="bg-[#17191E] text-[#E6E7EA] border-b-[#2A2B33]"
          />
          <VerticalInput
            label="GAS PRICE (gwei)"
            value={settings.gasPrice ?? 0}
            setValue={v => updateSetting('gasPrice', v > 0 ? v : undefined)}
            icon={<FaGasPump />}
            placeholder="Auto"
            className="border-[#2A2B33]"
            inputClassName="bg-[#17191E] text-[#E6E7EA] border-b-[#2A2B33]"
          />
        </div>
      ) : (
        /* Solana: Show all settings */
        <div className="mb-4 grid grid-cols-3 gap-2 px-4">
          <VerticalInput
            label="SLIPPAGE"
            value={settings.maxSlippage}
            setValue={v => updateSetting('maxSlippage', v)}
            icon={<FaRunning />}
          />
          <VerticalInput
            label="PRIORITY"
            value={settings.priority}
            setValue={v => updateSetting('priority', v)}
            icon={<FaGasPump />}
          />
          <VerticalInput
            label="BRIBE"
            value={settings.bribe}
            setValue={v => updateSetting('bribe', v)}
            icon={<FaCoins />}
          />
        </div>
      )}
      {/* Auto Fee, Max Fee, MEV Mode, and RPC - Only show for Solana */}
      {!isMonad && (
        <>
          {/* Auto Fee and Max Fee */}
          <div className="mx-4 mb-4 flex items-center justify-between gap-2">
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
                  <span className="text-xs font-bold text-[#E6E7EA]">
                    Auto Fee
                  </span>
                </span>
              </InterstateTooltip>
            </label>
            <div className="rounded-3xl border border-[#2A2B33] bg-[#17191E] px-2 py-1">
              <span className="text-xs text-[#9CA3AF]">MAX FEE</span>
              <input
                type="number"
                className="ml-2 w-28 flex-1 text-xs text-[#E6E7EA] outline-none bg-transparent [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                style={{ MozAppearance: 'textfield' }}
                placeholder="MAX FEE"
                value={settings.maxFee}
                onChange={e => updateSetting('maxFee', Number(e.target.value))}
                disabled={settings.autoFee}
              />
            </div>
          </div>
          {/* MEV Mode */}
          <div className="mb-4 flex items-center gap-2 mx-4">
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
          <span className="mr-2 flex cursor-pointer items-center text-xs text-[#E6E7EA]">
            MEV Mode <FaInfoCircle className="ml-1" />
          </span>
            </InterstateTooltip>
            {mevModes.map((mode) => (
              <button
                key={mode.value}
                className={`flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold ${
              settings.mevMode === mode.value 
                ? "text-black bg-[#70E0B0]" 
                : "text-[#E6E7EA] bg-[#17191E] hover:bg-[#1E1F26]"
            } border-[#2A2B33]`}
                onClick={() =>
                  updateSetting('mevMode', mode.value as any)
                }
              >
                {mode.value === "off" && <FaBan />}
                {mode.value === "reduced" && <FaShieldAlt />}
                {mode.value === "on" && <FaLock />}
                {mode.label}
              </button>
            ))}
          </div>
          {/* RPC Input */}
          <div className="mx-4 mb-6 flex flex-row items-center rounded-3xl border border-[#2A2B33] bg-[#17191E] pl-2">
            <span className="text-xs text-[#9CA3AF]">RPC</span>
            <input
              type="text"
              className="w-full px-3 py-2 text-xs text-[#E6E7EA] outline-none bg-transparent"
              placeholder="https://"
              value={settings.rpc || ""}
              onChange={e => handleRpcChange(e.target.value)}
            />
          </div>
        </>
      )}
      {isSavingRpc && (
        <div className="px-4 pb-4 text-xs text-[#70E0B0]">
          Updating RPC endpoint...
        </div>
      )}
      <div className="p-4 border-t border-[#2A2B33] w-full">
        <InterstateButton onClick={handleContinue} className="w-full">Continue</InterstateButton>
      </div>
    </InterstatePopout>
  );
}
