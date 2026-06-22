"use client";

import React from "react";
import { LuPencil, LuCheck } from "react-icons/lu";
import { FaRunning, FaGasPump, FaCoins, FaBan, FaWallet } from "react-icons/fa";
import InterstateTooltip from "../InterstateTooltip";
import toast from "react-hot-toast";
import { BNB_CHAIN_ICON } from "~/utils/bnbProtocols";
import type { BnbTokenDetailPatch } from "~/utils/bnbToken";

type TradeTab = "market" | "limit" | "adv";
type TradeMode = "buy" | "sell";

const AX = {
  surface: "#101114",
  surface2: "#141619",
  border: "#1f2127",
  text: "#f4f4f5",
  muted: "#71717a",
  mint: "#18c48c",
  mintGlow: "rgba(24, 196, 140, 0.25)",
  sell: "#ef4444",
  sellGlow: "rgba(239, 68, 68, 0.25)",
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const allowDecimal = (v: string) => /^\d*([.]\d{0,9})?$/.test(v);

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const formatCompactNumber = (n: number): string => {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  if (abs < 1) return n.toFixed(4).replace(/\.?0+$/, "");
  return Math.round(n).toString();
};

const prettyAmt = (s: string) => {
  if (!s || s === ".") return "";
  const n = Number(s);
  if (!Number.isFinite(n)) return "";
  return Number(n.toFixed(6)).toString();
};

function BnbIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={BNB_CHAIN_ICON}
      alt="BNB"
      width={size}
      height={size}
      className={cx("rounded-full object-cover", className)}
    />
  );
}

export interface BnbTradeFormPanelProps {
  token: BnbTokenDetailPatch & { [key: string]: any };
  mode: TradeMode;
  setMode: (m: TradeMode) => void;
  tab: TradeTab;
  setTab: (t: TradeTab) => void;
  amount: string;
  setAmount: (a: string) => void;
  sliderPct: number | "";
  setSliderPct: (p: number | "") => void;
  targetMC: string;
  setTargetMC: (mc: string) => void;
  editingPresets: boolean;
  setEditingPresets: (b: boolean) => void;
  presetDrafts: string[];
  setPresetDrafts: React.Dispatch<React.SetStateAction<string[]>>;
  migrationMode: boolean;
  setMigrationMode: (b: boolean) => void;
  devSellMode: boolean;
  setDevSellMode: (b: boolean) => void;
  tokenPriceUsd: number;
  bnbUsdPrice: number;
  baseMarketCap: number;
  settings: any;
  amountPresets: number[];
  selectedWalletCount: number;
  bnbBalance: number;
  user: any;
  creatorAddress: string;
  isAdvMode: boolean;
  isSniperMode: boolean;
  isDevSellMode: boolean;
}

const BnbTradeFormPanel: React.FC<BnbTradeFormPanelProps> = ({
  token,
  mode,
  setMode,
  tab,
  setTab,
  amount,
  setAmount,
  sliderPct,
  setSliderPct,
  targetMC,
  setTargetMC,
  editingPresets,
  setEditingPresets,
  presetDrafts,
  setPresetDrafts,
  migrationMode,
  setMigrationMode,
  devSellMode,
  setDevSellMode,
  tokenPriceUsd,
  bnbUsdPrice,
  baseMarketCap,
  settings,
  amountPresets,
  selectedWalletCount,
  bnbBalance,
  user,
  creatorAddress,
  isAdvMode,
  isSniperMode,
  isDevSellMode,
}) => {
  const handleTrade = () => {
    toast("BNB chain trading is coming soon", { icon: "⏳" });
  };

  return (
    <>
      {/* Buy / Sell switcher */}
      <div className="-mt-px border-b border-[#2A2B33] px-3 py-2">
        <div className="relative mx-auto w-full max-w-xl">
          <div
            className="relative h-10 overflow-hidden rounded-xl"
            style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}
          >
            <div
              className="absolute left-1 top-1 h-[calc(100%-8px)] w-[calc(50%-4px)] rounded-lg transition-all duration-200"
              style={{
                transform: mode === "sell" ? "translateX(calc(100% + 4px))" : "translateX(0%)",
                background: mode === "buy" ? AX.mint : AX.sell,
                boxShadow:
                  mode === "buy" ? `0 0 12px ${AX.mintGlow}` : `0 0 12px ${AX.sellGlow}`,
              }}
            />
            <div className="relative z-10 grid h-full grid-cols-2">
              <button
                type="button"
                className={cx(
                  "flex h-full cursor-pointer select-none items-center justify-center text-[13px] font-semibold transition-colors duration-200",
                  mode === "buy" ? "text-[#030304]" : "text-[#71717a] hover:text-white",
                )}
                onClick={() => setMode("buy")}
              >
                Buy
              </button>
              <button
                type="button"
                className={cx(
                  "flex h-full cursor-pointer select-none items-center justify-center text-[13px] font-semibold transition-colors duration-200",
                  mode === "sell" ? "text-[#030304]" : "text-[#71717a] hover:text-white",
                )}
                onClick={() => setMode("sell")}
              >
                Sell
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Market / Limit / Adv tabs + wallet */}
      <div className="relative border-b border-[#2A2B33] px-3 pb-1 pt-2.5">
        <div className="flex items-center justify-start gap-2">
          {(["market", "limit", "adv"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className="rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-all duration-200"
              style={{
                backgroundColor: tab === t ? `${AX.mint}15` : "transparent",
                color: tab === t ? AX.mint : AX.muted,
                border: tab === t ? `1px solid ${AX.mint}40` : "1px solid transparent",
              }}
              onClick={() => setTab(t)}
            >
              {t === "adv" ? "Adv." : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div
          className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium text-[#E6E7EA]"
          style={{ borderColor: AX.border, backgroundColor: AX.surface }}
        >
          <FaWallet size={11} className="text-[#9CA3AF]" />
          <span>{user ? selectedWalletCount : 0}</span>
          <BnbIcon size={11} />
          <span>{bnbBalance > 0 ? bnbBalance.toFixed(4).replace(/\.?0+$/, "") : "0.00"}</span>
        </div>
      </div>

      {/* Adv sub-tabs */}
      {isAdvMode && (
        <div className="border-b border-[#2A2B33] px-3 py-2">
          <div
            className="relative overflow-hidden rounded-lg"
            style={{ backgroundColor: AX.surface2 }}
          >
            <div
              className="absolute top-0 h-full w-1/2 rounded-md transition-transform duration-200"
              style={{
                transform: devSellMode ? "translateX(100%)" : "translateX(0%)",
                background: "#4B5563",
              }}
            />
            <div className="relative flex">
              <button
                type="button"
                className={cx(
                  "flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[12px] font-medium transition-colors duration-200",
                  migrationMode ? "text-[#70E0B0]" : "text-[#9CA3AF]",
                )}
                onClick={() => {
                  setMigrationMode(true);
                  setDevSellMode(false);
                }}
              >
                <span>»</span>
                Migration
              </button>
              <button
                type="button"
                className={cx(
                  "flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[12px] font-medium transition-colors duration-200",
                  devSellMode ? "text-[#70E0B0]" : "text-[#9CA3AF]",
                )}
                onClick={() => {
                  setDevSellMode(true);
                  setMigrationMode(false);
                }}
              >
                <span>↑</span>
                Dev Sell
              </button>
            </div>
          </div>
          {devSellMode && !creatorAddress && (
            <div className="mt-2 text-center text-[11px] text-[#FFB347]">
              Developer wallet not detected for this token yet.
            </div>
          )}
        </div>
      )}

      {/* Amount */}
      <div className="px-3 pt-2">
        <div
          className="relative mx-auto w-full max-w-xl overflow-hidden rounded-xl"
          style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}` }}
        >
          <div className="flex items-center justify-between gap-3 px-3 py-1">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: AX.muted }}
              >
                Amount
              </span>
              <input
                type="text"
                inputMode="decimal"
                className="h-6 w-20 border-none bg-transparent pl-2 text-left text-[13px] font-medium tabular-nums focus:outline-none"
                style={{
                  fontFamily:
                    'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                  color: AX.text,
                }}
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, ".");
                  if (allowDecimal(raw)) setAmount(raw);
                }}
              />
            </div>
            <div className="flex h-5 w-5 items-center justify-center">
              {mode === "sell" ? (
                <span className="text-[14px] font-semibold" style={{ color: AX.text }}>
                  %
                </span>
              ) : (
                <BnbIcon size={16} />
              )}
            </div>
          </div>

          <div className="overflow-hidden" style={{ borderTop: `1px solid ${AX.border}` }}>
            <div className="grid grid-cols-5">
              {amountPresets.map((opt, i) => {
                const currentValue = editingPresets ? presetDrafts[i] || "" : String(opt);
                const active = amount === currentValue;
                const showEstimate = mode === "buy" && tokenPriceUsd > 0;
                const tokenEstimate =
                  showEstimate && !editingPresets
                    ? (opt * bnbUsdPrice) / tokenPriceUsd
                    : null;

                if (editingPresets) {
                  return (
                    <div
                      key={i}
                      className="h-9 min-w-0"
                      style={{ borderRight: i < 4 ? `1px solid ${AX.border}` : "none" }}
                    >
                      <input
                        type="text"
                        inputMode="decimal"
                        className="h-full w-full text-center text-[12px] font-semibold outline-none"
                        style={{ backgroundColor: AX.surface, color: AX.text }}
                        value={presetDrafts[i] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.replace(/,/g, ".");
                          if (allowDecimal(v)) {
                            setPresetDrafts((d) => d.map((x, idx) => (idx === i ? v : x)));
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            setEditingPresets(false);
                          }
                        }}
                      />
                    </div>
                  );
                }

                return (
                  <button
                    key={i}
                    type="button"
                    className="h-9 text-[12px] font-semibold tabular-nums transition-colors duration-150"
                    style={{
                      borderRight: i < 4 ? `1px solid ${AX.border}` : "none",
                      backgroundColor: active ? `${AX.mint}15` : AX.surface,
                      color: active ? AX.mint : AX.text,
                    }}
                    onClick={() => setAmount(String(opt))}
                  >
                    {tokenEstimate !== null ? (
                      <div className="flex flex-col items-center justify-center leading-tight">
                        <span>{opt}</span>
                        <span className="text-[9px] font-normal text-[#9CA3AF]">
                          ~{formatCompactNumber(tokenEstimate)}
                        </span>
                      </div>
                    ) : (
                      <>
                        {opt}
                        {mode === "sell" ? "%" : ""}
                      </>
                    )}
                  </button>
                );
              })}
              {!editingPresets ? (
                <button
                  type="button"
                  onClick={() => setEditingPresets(true)}
                  className="h-9 transition-colors duration-150"
                  style={{ backgroundColor: AX.surface, color: AX.muted }}
                  title="Edit preset values"
                >
                  <LuPencil className="mx-auto h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingPresets(false)}
                  className="h-9 transition-colors duration-150"
                  style={{ backgroundColor: `${AX.mint}15`, color: AX.mint }}
                  title="Done"
                >
                  <LuCheck className="mx-auto h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Limit: MKT CAP + slider */}
      {tab === "limit" && (
        <div className="space-y-3 px-3 pt-2">
          <div className="pb-3 pt-2">
            <div
              className="relative mx-auto mb-3 w-full max-w-xl rounded-xl"
              style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}` }}
            >
              <div className="flex items-center justify-between gap-3 px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: AX.muted }}
                  >
                    MKT CAP
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="h-8 w-20 border-none bg-transparent pl-2 text-left text-[13px] font-medium tabular-nums focus:outline-none"
                    style={{
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                      color: AX.text,
                    }}
                    placeholder="0"
                    value={targetMC}
                    onChange={(e) => {
                      const v = e.target.value.replace(/,/g, ".");
                      if (/^\d*\.?\d*$/.test(v)) setTargetMC(v);
                    }}
                  />
                </div>
                <span className="text-[11px] font-normal" style={{ color: AX.muted }}>
                  $
                </span>
              </div>
            </div>

            <div className="ml-2 flex items-center gap-3">
              <div className="flex-1">
                <div className="relative flex h-4 items-center">
                  <div
                    className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: AX.border }}
                  />
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={1}
                    value={Number(sliderPct) || 0}
                    onChange={(e) => {
                      const p = clamp(Number(e.target.value), -100, 100);
                      setSliderPct(p);
                      if (baseMarketCap > 0) {
                        const next = Math.max(0, Math.round(baseMarketCap * (1 + p / 100)));
                        setTargetMC(String(next));
                      }
                    }}
                    className="slider relative z-10 h-0.5 w-full cursor-pointer appearance-none bg-transparent"
                  />
                </div>
                <div className="mt-2 flex justify-between text-[9px] font-normal text-[#9CA3AF]">
                  <span>-100%</span>
                  <span>-50%</span>
                  <span>0%</span>
                  <span>+50%</span>
                  <span>+100%</span>
                </div>
              </div>
              <div className="w-18">
                <div className="relative">
                  <input
                    type="number"
                    min={-100}
                    max={100}
                    step={1}
                    value={sliderPct}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setSliderPct("");
                        return;
                      }
                      const p = clamp(Number(raw), -100, 100);
                      if (Number.isNaN(p)) return;
                      setSliderPct(p);
                      if (baseMarketCap > 0) {
                        const next = Math.max(0, Math.round(baseMarketCap * (1 + p / 100)));
                        setTargetMC(String(next));
                      }
                    }}
                    className="h-8 w-full rounded border border-[#2A2B33] bg-[#101114] px-2 pr-5 text-[12px] font-semibold text-[#E6E7EA] outline-none focus:border-[#52c5ff] focus:ring-1 focus:ring-[#52c5ff]/20"
                  />
                  <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-normal text-[#9CA3AF]">
                    %
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings row */}
      <div className="mx-3 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#E6E7EA]">
        <InterstateTooltip label="Max Slippage">
          <span className="flex items-center gap-1 text-[#9CA3AF]">
            <FaRunning className="opacity-80" /> {(settings?.maxSlippage ?? 0.2) * 100}%
          </span>
        </InterstateTooltip>
        <InterstateTooltip label="Gas price (gwei)">
          <span className="flex items-center gap-1 text-[#9CA3AF]">
            <FaGasPump className="opacity-90" style={{ color: "#FCD34D" }} />
            {settings?.gasPrice ?? 5}
            <span className="text-[#FF4D7F]">⚠</span>
          </span>
        </InterstateTooltip>
        <InterstateTooltip label="Priority fee">
          <span className="flex items-center gap-1 text-[#9CA3AF]">
            <FaCoins className="opacity-90" /> {settings?.priority ?? 0.005}
            <span className="text-[#FF4D7F]">⚠</span>
          </span>
        </InterstateTooltip>
        <InterstateTooltip label="MEV Protection">
          <span className="flex items-center gap-1 text-[#9CA3AF]">
            <FaBan className="opacity-90" />
            {settings?.mevMode === "off"
              ? "Off"
              : settings?.mevMode === "reduced"
                ? "Reduced"
                : "Secure"}
          </span>
        </InterstateTooltip>
      </div>

      {/* Primary action */}
      <div className="px-3 py-3">
        <button
          type="button"
          className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl text-[14px] font-semibold transition-all duration-200"
          style={{
            backgroundColor: mode === "buy" ? AX.mint : AX.sell,
            color: "#030304",
            boxShadow:
              mode === "buy" ? `0 0 20px ${AX.mintGlow}` : `0 0 20px ${AX.sellGlow}`,
          }}
          disabled={!(Number(amount) > 0)}
          onClick={handleTrade}
        >
          {isSniperMode ? (
            <span>Arm Sniper {token?.symbol}</span>
          ) : isDevSellMode ? (
            <span>{mode === "buy" ? "Arm Buy on Dev Sell" : "Arm Sell on Dev Sell"}</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              {mode === "buy" ? "Buy" : "Sell"} {token?.symbol}
              {prettyAmt(amount) && (
                <>
                  {" "}
                  {prettyAmt(amount)}
                  {mode === "sell" ? (
                    <span>%</span>
                  ) : (
                    <BnbIcon size={16} className="inline-block" />
                  )}
                </>
              )}
            </span>
          )}
        </button>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #526fff;
          cursor: pointer;
          border: none;
        }
        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #526fff;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </>
  );
};

export default BnbTradeFormPanel;
