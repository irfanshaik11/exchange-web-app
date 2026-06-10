// src/components/perpetuals/PerpTradePanel.tsx
// Trade panel for perpetual futures — Long/Short, Market/Limit, leverage,
// collateral input, percentage slider, TP/SL, account info.
// Design: matches reference screenshots with card-style inputs and clean layout.

import React, { useState, useCallback, useMemo, useEffect } from "react";
import CoinIcon from "./CoinIcon";
import {
  placeOrder,
  placeTwapOrder,
  fetchBuilderFeeStatus,
  approveBuilderFee,
  type BuilderFeeStatus,
} from "../../utils/hyperliquidApi";
import type { HyperliquidMarketRow } from "../../utils/hyperliquidTypes";

/* ---- AX palette ---- */
import { AX } from "./perpTheme";

const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

interface PerpTradePanelProps {
  market: HyperliquidMarketRow | undefined;
  markPrice: number;
  accountValue: number;
  token: string | undefined;
  onOrderPlaced?: () => void;
  onAddFunds?: () => void;
  initialPrice?: string;
}

type Side = "LONG" | "SHORT";
type OrderType = "market" | "limit" | "twap";

const PCT_PRESETS = [0, 25, 50, 75, 100];

function formatPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  return v.toPrecision(4);
}

export default function PerpTradePanel({
  market,
  markPrice,
  accountValue,
  token,
  onOrderPlaced,
  onAddFunds,
  initialPrice,
}: PerpTradePanelProps) {
  const [side, setSide] = useState<Side>("LONG");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [collateral, setCollateral] = useState("");
  const [price, setPrice] = useState(initialPrice || "");
  const [leverage, setLeverage] = useState(20);
  const [pctIndex, setPctIndex] = useState(0);
  const [showTpSl, setShowTpSl] = useState(false);
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [postOnly, setPostOnly] = useState(false);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [twapMinutes, setTwapMinutes] = useState("30");
  const [twapRandomize, setTwapRandomize] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLeveragePopup, setShowLeveragePopup] = useState(false);
  const [builderStatus, setBuilderStatus] = useState<BuilderFeeStatus | null>(null);

  React.useEffect(() => {
    if (initialPrice) setPrice(initialPrice);
  }, [initialPrice]);

  // Builder-fee status (monetization). Drives the fee line + one-time approval.
  useEffect(() => {
    if (!token) {
      setBuilderStatus(null);
      return;
    }
    let cancelled = false;
    fetchBuilderFeeStatus(token)
      .then((s) => { if (!cancelled) setBuilderStatus(s); })
      .catch(() => { if (!cancelled) setBuilderStatus(null); });
    return () => { cancelled = true; };
  }, [token]);

  const collateralNum = parseFloat(collateral) || 0;
  const priceNum = parseFloat(price) || markPrice;
  const positionSize = priceNum > 0 ? (collateralNum * leverage) / priceNum : 0;

  const estLiqPrice = useMemo(() => {
    if (positionSize === 0 || leverage <= 1) return null;
    const mmr = 0.005;
    return side === "LONG"
      ? priceNum * (1 - 1 / leverage + mmr)
      : priceNum * (1 + 1 / leverage - mmr);
  }, [side, priceNum, leverage, positionSize]);

  const handlePctClick = useCallback(
    (pct: number, idx: number) => {
      setPctIndex(idx);
      if (accountValue > 0) {
        setCollateral(((accountValue * pct) / 100).toFixed(2));
      }
    },
    [accountValue]
  );

  const handleSubmit = useCallback(async () => {
    if (!market || !token || collateralNum <= 0) return;
    setSubmitting(true);
    setError(null);
    try {
      // One-time builder-fee approval (server-side Turnkey signature). Best-effort:
      // a failure here must never block the trade — the order just goes fee-less.
      if (builderStatus?.enabled && !builderStatus.approved) {
        try {
          const r = await approveBuilderFee(token);
          if (r.success) setBuilderStatus((s) => (s ? { ...s, approved: true } : s));
        } catch {
          /* ignore — proceed with the order unmonetized */
        }
      }

      if (orderType === "twap") {
        const minutes = Math.max(5, Math.min(1440, parseInt(twapMinutes) || 30));
        const result = await placeTwapOrder(token, {
          coin: market.name,
          side,
          size: parseFloat(positionSize.toFixed(market.szDecimals)),
          durationMinutes: minutes,
          reduceOnly,
          randomize: twapRandomize,
          leverage,
        });
        if (!result.success) throw new Error(result.error || "TWAP order failed");
      } else {
        const tp = showTpSl ? parseFloat(tpPrice) : NaN;
        const sl = showTpSl ? parseFloat(slPrice) : NaN;

        // A wrong-side trigger fires the instant it lands on Hyperliquid,
        // closing the position the user just opened. Validate sides here.
        if (tp > 0) {
          if (side === "LONG" && tp <= priceNum) {
            setError("Take profit must be ABOVE the entry price for a long");
            setSubmitting(false);
            return;
          }
          if (side === "SHORT" && tp >= priceNum) {
            setError("Take profit must be BELOW the entry price for a short");
            setSubmitting(false);
            return;
          }
        }
        if (sl > 0) {
          if (side === "LONG" && sl >= priceNum) {
            setError("Stop loss must be BELOW the entry price for a long");
            setSubmitting(false);
            return;
          }
          if (side === "SHORT" && sl <= priceNum) {
            setError("Stop loss must be ABOVE the entry price for a short");
            setSubmitting(false);
            return;
          }
        }

        await placeOrder(token, {
          coin: market.name,
          side,
          size: parseFloat(positionSize.toFixed(market.szDecimals)),
          price: orderType !== "market" ? priceNum : undefined,
          orderType,
          leverage,
          reduceOnly,
          postOnly: orderType === "limit" ? postOnly : false,
          takeProfitPrice: tp > 0 ? tp : undefined,
          stopLossPrice: sl > 0 ? sl : undefined,
        });
      }
      setCollateral("");
      setPrice("");
      setTpPrice("");
      setSlPrice("");
      setPctIndex(0);
      onOrderPlaced?.();
    } catch (err: any) {
      setError(err.message || "Order failed");
    } finally {
      setSubmitting(false);
    }
  }, [market, token, side, orderType, collateralNum, positionSize, priceNum, leverage, onOrderPlaced, builderStatus, showTpSl, tpPrice, slPrice, reduceOnly, postOnly, twapMinutes, twapRandomize]);

  const accentColor = side === "LONG" ? AX.mint : AX.sell;
  const accentHover = side === "LONG" ? AX.mintHover : AX.sellHover;
  // Canonical Interstate CTA treatment (matches TradeActionPanel buy/sell):
  // filled accent, near-black text on BOTH sides, soft glow, brighten on hover.
  const accentGlow = side === "LONG" ? AX.mintGlow : AX.sellGlow;

  if (!market) {
    return (
      <div className="p-5" style={{ backgroundColor: AX.bg }}>
        <div className="animate-pulse space-y-4">
          <div className="h-10 rounded-xl" style={{ backgroundColor: AX.surface }} />
          <div className="h-10 rounded-xl" style={{ backgroundColor: AX.surface }} />
          <div className="h-10 rounded-xl" style={{ backgroundColor: AX.surface }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: AX.bg }}>
      <style>{`
        .pct-slider-long::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 14px; height: 14px; border-radius: 50%;
          background: ${AX.mint}; cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .pct-slider-long::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 50%; border: 0;
          background: ${AX.mint}; cursor: pointer;
        }
        .pct-slider-short::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 14px; height: 14px; border-radius: 50%;
          background: ${AX.sell}; cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .pct-slider-short::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 50%; border: 0;
          background: ${AX.sell}; cursor: pointer;
        }
      `}</style>
      <div className="px-3 py-3 space-y-3 flex-1">
        {/* ── Long / Short Toggle ── */}
        <div
          className="flex rounded-lg overflow-hidden p-0.5"
          style={{ backgroundColor: AX.surface }}
        >
          <button
            className={`flex-1 py-2 text-[12px] font-bold rounded-md transition-all duration-150 ${
              side === "LONG" ? "text-black" : "text-[#a1a1aa] hover:text-[#f4f4f5]"
            }`}
            style={side === "LONG" ? { backgroundColor: AX.mint } : undefined}
            onClick={() => setSide("LONG")}
          >
            Long
          </button>
          <button
            className={`flex-1 py-2 text-[12px] font-bold rounded-md transition-all duration-150 ${
              side === "SHORT" ? "text-white" : "text-[#a1a1aa] hover:text-[#f4f4f5]"
            }`}
            style={side === "SHORT" ? { backgroundColor: AX.sell } : undefined}
            onClick={() => setSide("SHORT")}
          >
            Short
          </button>
        </div>

        {/* ── Order Type + Leverage Row ── */}
        <div
          className="flex items-center justify-between pb-2"
          style={{ borderBottom: `1px solid ${AX.border}` }}
        >
          <div className="flex items-center">
            {(["market", "limit", "twap"] as OrderType[]).map((type) => (
              <button
                key={type}
                className={`px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${
                  orderType === type ? "text-white" : "text-[#71717a] hover:text-[#a1a1aa]"
                }`}
                style={orderType === type ? { borderBottom: `2px solid ${AX.text}` } : { borderBottom: "2px solid transparent" }}
                onClick={() => setOrderType(type)}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="relative">
            <button
              className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
              style={{ backgroundColor: AX.surface, color: AX.text, border: `1px solid ${AX.border}` }}
              onClick={() => setShowLeveragePopup(!showLeveragePopup)}
            >
              Leverage: {leverage}x
            </button>
            {showLeveragePopup && (
              <div
                className="absolute right-0 top-full mt-1 z-50 rounded-lg p-2.5 shadow-xl"
                style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}`, width: 180 }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px]" style={{ color: AX.muted }}>Leverage</span>
                  <span className="text-[11px] font-bold" style={{ color: AX.text }}>{leverage}x</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={market.maxLeverage}
                  value={leverage}
                  onChange={(e) => setLeverage(parseInt(e.target.value))}
                  className="w-full h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0"
                  style={{
                    background: `linear-gradient(to right, ${accentColor} 0%, ${accentColor} ${((leverage - 1) / (market.maxLeverage - 1)) * 100}%, ${AX.border} ${((leverage - 1) / (market.maxLeverage - 1)) * 100}%, ${AX.border} 100%)`,
                  }}
                />
                <div className="flex justify-between mt-1.5 gap-1">
                  {[1, 5, 10, 20, market.maxLeverage].filter((v, i, a) => a.indexOf(v) === i).map((p) => (
                    <button
                      key={p}
                      onClick={() => { setLeverage(p); setShowLeveragePopup(false); }}
                      className="flex-1 text-[9px] py-0.5 rounded transition-colors"
                      style={{
                        backgroundColor: leverage === p ? accentColor : AX.border,
                        color: leverage === p ? "#000" : AX.muted,
                        fontWeight: leverage === p ? 600 : 400,
                      }}
                    >
                      {p}x
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Buy Amount Card ── */}
        <div
          className="rounded-lg px-3 py-2.5"
          style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}
        >
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px]" style={{ color: AX.muted }}>Buy Amount</span>
            <span className="text-[10px]" style={{ color: AX.muted }}>{market.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={collateral}
              onChange={(e) => setCollateral(e.target.value)}
              placeholder="0.0 USDC"
              className="flex-1 bg-transparent text-[16px] font-medium text-white focus:outline-none min-w-0"
              style={TABULAR}
            />
            <div className="flex items-center gap-1 flex-shrink-0">
              <CoinIcon coin={market.name} size={18} />
              <span className="text-[12px] font-medium" style={{ color: AX.text, ...TABULAR }}>
                {positionSize > 0 ? positionSize.toFixed(market.szDecimals > 2 ? 2 : market.szDecimals) : "0"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Percentage Slider ── */}
        <div className="px-0.5">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={pctIndex * 25}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              const nearest = Math.round(val / 25);
              setPctIndex(nearest);
              if (accountValue > 0) {
                setCollateral(((accountValue * nearest * 25) / 100).toFixed(2));
              }
            }}
            className={`w-full h-[4px] rounded-full appearance-none cursor-pointer ${
              side === "LONG" ? "pct-slider-long" : "pct-slider-short"
            }`}
            style={{
              background: `linear-gradient(to right, ${accentColor} 0%, ${accentColor} ${pctIndex * 25}%, ${AX.border} ${pctIndex * 25}%, ${AX.border} 100%)`,
            }}
          />
          <div className="flex justify-between mt-1 px-0">
            {PCT_PRESETS.map((pct, idx) => {
              const isAtOrBefore = idx <= pctIndex;
              return (
                <button
                  key={pct}
                  onClick={() => handlePctClick(pct, idx)}
                  className="flex flex-col items-center gap-0.5"
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full transition-colors"
                    style={{
                      backgroundColor: isAtOrBefore ? accentColor : AX.borderLight,
                    }}
                  />
                  <span
                    className="text-[9px] tabular-nums"
                    style={{ color: isAtOrBefore ? AX.text : AX.mutedDim }}
                  >
                    {pct}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Limit Price (when limit order selected) ── */}
        {orderType === "limit" && (
          <div
            className="rounded-lg px-3 py-2.5"
            style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px]" style={{ color: AX.muted }}>Limit Price</span>
              <span className="text-[10px] tabular-nums" style={{ color: AX.muted }}>
                Current: <span style={{ color: AX.text }}>${formatPrice(markPrice)}</span>
              </span>
            </div>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={`$${formatPrice(markPrice)}`}
              className="w-full bg-transparent text-[16px] font-medium text-white focus:outline-none"
              style={TABULAR}
            />
          </div>
        )}

        {/* ── TWAP parameters (when TWAP selected) ── */}
        {orderType === "twap" && (
          <div
            className="rounded-lg px-3 py-2.5 space-y-2"
            style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px]" style={{ color: AX.muted }}>Duration (minutes, 5–1440)</span>
              <input
                type="number"
                min={5}
                max={1440}
                value={twapMinutes}
                onChange={(e) => setTwapMinutes(e.target.value)}
                className="w-20 bg-transparent text-right text-[14px] font-medium text-white focus:outline-none"
                style={TABULAR}
              />
            </div>
            <label
              className="flex items-center gap-1.5 cursor-pointer"
              onClick={() => setTwapRandomize((v) => !v)}
            >
              <div
                className="w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors"
                style={{ borderColor: twapRandomize ? accentColor : AX.border, backgroundColor: twapRandomize ? accentColor : "transparent" }}
              >
                {twapRandomize && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </div>
              <span className="text-[11px]" style={{ color: AX.text }}>Randomize slice timing</span>
            </label>
            <div className="text-[10px]" style={{ color: AX.mutedDim }}>
              Order is sliced over the duration to average entry price. Each slice signs separately.
            </div>
          </div>
        )}

        {/* ── TP/SL + Est. Liq Price Row ── */}
        <div className="flex items-center justify-between">
          {orderType === "twap" ? (
            <span />
          ) : (
          <label className="flex items-center gap-1.5 cursor-pointer" onClick={() => setShowTpSl(!showTpSl)}>
            <div
              className="w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors"
              style={{
                borderColor: showTpSl ? accentColor : AX.border,
                backgroundColor: showTpSl ? accentColor : "transparent",
              }}
            >
              {showTpSl && (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
            <span className="text-[11px]" style={{ color: AX.text }}>TP/SL</span>
          </label>
          )}
          <span className="text-[11px]" style={{ color: AX.muted, ...TABULAR }}>
            Est. Liq. Price: {estLiqPrice ? `$${formatPrice(estLiqPrice)}` : "--"}
          </span>
        </div>

        {/* ── TP/SL inputs (shown when TP/SL enabled) ── */}
        {showTpSl && orderType !== "twap" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg px-2.5 py-1.5" style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}>
              <div className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: AX.mutedDim }}>Take Profit</div>
              <input
                inputMode="decimal"
                value={tpPrice}
                onChange={(e) => setTpPrice(e.target.value)}
                placeholder="Price"
                className="w-full bg-transparent outline-none text-[13px]"
                style={{ color: AX.mint, ...TABULAR }}
              />
            </div>
            <div className="rounded-lg px-2.5 py-1.5" style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}>
              <div className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: AX.mutedDim }}>Stop Loss</div>
              <input
                inputMode="decimal"
                value={slPrice}
                onChange={(e) => setSlPrice(e.target.value)}
                placeholder="Price"
                className="w-full bg-transparent outline-none text-[13px]"
                style={{ color: AX.sell, ...TABULAR }}
              />
            </div>
          </div>
        )}

        {/* ── Reduce-only / Post-only toggles ── */}
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer" onClick={() => setReduceOnly((v) => !v)}>
            <div
              className="w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors"
              style={{ borderColor: reduceOnly ? accentColor : AX.border, backgroundColor: reduceOnly ? accentColor : "transparent" }}
            >
              {reduceOnly && (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              )}
            </div>
            <span className="text-[11px]" style={{ color: AX.text }}>Reduce Only</span>
          </label>
          {orderType === "limit" && (
            <label className="flex items-center gap-1.5 cursor-pointer" onClick={() => setPostOnly((v) => !v)}>
              <div
                className="w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors"
                style={{ borderColor: postOnly ? accentColor : AX.border, backgroundColor: postOnly ? accentColor : "transparent" }}
              >
                {postOnly && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </div>
              <span className="text-[11px]" style={{ color: AX.text }}>Post Only</span>
            </label>
          )}
        </div>

        {/* ── Interstate (builder) fee disclosure ── */}
        {builderStatus?.enabled && builderStatus.feePercent > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: AX.mutedDim }}>
              Interstate fee
            </span>
            <span className="text-[11px]" style={{ color: AX.muted, ...TABULAR }}>
              {builderStatus.feePercent}%
              {collateralNum > 0 &&
                ` (~$${formatPrice((collateralNum * leverage * builderStatus.feePercent) / 100)})`}
            </span>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div
            className="text-[11px] px-2.5 py-1.5 rounded-md"
            style={{ color: AX.sell, backgroundColor: "rgba(239, 68, 68, 0.08)", border: `1px solid rgba(239, 68, 68, 0.15)` }}
          >
            {error}
          </div>
        )}

        {/* ── Submit Button ── */}
        {(!token || collateralNum <= 0) && onAddFunds ? (
          <button
            onClick={onAddFunds}
            className="w-full py-2.5 rounded-lg font-bold text-[13px] transition-all duration-150"
            style={{ backgroundColor: accentColor, color: AX.onAccent, boxShadow: accentGlow }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = accentHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = accentColor; }}
          >
            Add More Funds
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting || !token || collateralNum <= 0}
            className="w-full py-2.5 rounded-lg font-bold text-[13px] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: accentColor, color: AX.onAccent, boxShadow: accentGlow }}
            onMouseEnter={(e) => {
              if (!(e.currentTarget as HTMLButtonElement).disabled) {
                e.currentTarget.style.backgroundColor = accentHover;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = accentColor;
            }}
          >
            {submitting
              ? "Placing Order..."
              : `${side === "LONG" ? "Long" : "Short"} ${market.name}`}
          </button>
        )}

        {/* ── Account Info ── */}
        <div
          className="space-y-2 pt-2.5"
          style={{ borderTop: `1px solid ${AX.border}` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: AX.muted }}>Available Margin</span>
            <span
              className="text-[11px] px-1.5 py-0.5 rounded"
              style={{
                color: AX.mint,
                backgroundColor: "rgba(24, 196, 140, 0.08)",
                border: `1px solid rgba(24, 196, 140, 0.15)`,
                ...TABULAR,
              }}
            >
              {accountValue.toFixed(2)} USDC
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: AX.muted }}>Perps Account Value</span>
            <span className="text-[11px]" style={{ color: AX.text, ...TABULAR }}>
              {accountValue.toFixed(2)} USDC
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: AX.muted }}>Current Position</span>
            <span className="text-[11px]" style={{ color: AX.muted, ...TABULAR }}>--</span>
          </div>
          {onAddFunds && (
            <button
              onClick={onAddFunds}
              className="text-[11px] font-medium transition-colors hover:opacity-80 mt-1"
              style={{ color: AX.mint }}
            >
              Fund Account →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
