"use client";

import React, { useState, useEffect, useMemo } from "react";
import { LuPencil, LuCheck } from "react-icons/lu";
import { formatSmartNumber, type Token } from "~/utils/db";
import { useQuickBuy } from "~/components/QuickBuyContext";
import { FaRunning, FaGasPump, FaCoins, FaBan } from "react-icons/fa";
import InterstateTooltip from "../InterstateTooltip";
import QuickBuy from "../QuickBuy";
import { createLimitOrder, tradeBuy, SOL_MINT_ADDRESS } from "~/utils/api";
import toast from "react-hot-toast";
import { useUser } from "~/components/UserContext";
import { SiSolana } from "react-icons/si";

type TimeRange = "1m" | "5m" | "1h" | "6h" | "24h";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ---- Axiom palette ---- */
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

const baseBtn =
  "inline-flex items-center justify-center font-semibold rounded-full transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(112_224_176_/_0.4)]";

const tabBtn =
  "pb-1.5 text-[11px] tracking-wide uppercase font-semibold text-[#9CA3AF] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(112_224_176_/_0.3)]";

/* helpers */
const num = (v: any) => (typeof v === "number" ? v : 0);
const allowDecimal = (v: string) => /^\d*([.]\d{0,9})?$/.test(v);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function getCountsAndVol(t: any, side: "buy" | "sell", window: TimeRange) {
  const s = side;
  const count =
    window === "1m"
      ? num(t[`total_${s}s_1m`]) || num(t[`total_${s}s_60s`])
      : window === "5m"
      ? num(t[`total_${s}s_5m`])
      : window === "1h"
      ? num(t[`total_${s}s_1h`]) || num(t[`total_${s}s_60m`])
      : window === "6h"
      ? num(t[`total_${s}s_6h`]) || num(t[`total_${s}s_360m`])
      : num(t[`total_${s}s_24h`]);

  const vol =
    window === "1m"
      ? num(t[`total_${s}_volume_1m`]) || num(t[`total_${s}_volume_60s`])
      : window === "5m"
      ? num(t[`total_${s}_volume_5m`])
      : window === "1h"
      ? num(t[`total_${s}_volume_1h`]) || num(t[`total_${s}_volume_60m`])
      : window === "6h"
      ? num(t[`total_${s}_volume_6h`]) || num(t[`total_${s}_volume_360m`])
      : num(t[`total_${s}_volume_24h`]);

  return { count, vol };
}

const prettyAmt = (s: string) => {
  if (!s || s === ".") return "";
  const n = Number(s);
  if (!Number.isFinite(n)) return "";
  return Number(n.toFixed(6)).toString();
};

interface TradeActionPanelProps {
  token: Token;
}

const TradeActionPanel: React.FC<TradeActionPanelProps> = ({ token }) => {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [tab, setTab] = useState<"market" | "limit" | "adv">("market");
  const [timeRange, setTimeRange] = useState<TimeRange>("5m");
  const [amount, setAmount] = useState("");
  const [targetMC, setTargetMC] = useState("");              // USD MKT CAP we’re targeting
  const [direction, setDirection] = useState<"Above" | "Below">("Above");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { presets: qbPresets, activePreset } = useQuickBuy();
  const { user, solBalance } = useUser();
  const settings =
    mode === "buy"
      ? qbPresets[activePreset].quickBuySettings
      : qbPresets[activePreset].quickSellSettings;

  // Best-effort current market cap to anchor the slider
  const baseMarketCap: number = useMemo(() => {
    const t: any = token || {};
    return Number(
      t.market_cap_usd ??
        t.marketcap_usd ??
        t.market_cap ??
        t.marketcap ??
        t.fdv_usd ??
        t.fdv ??
        0
    ) || 0;
  }, [token]);

  // Derive % change from base MC -> targetMC (used to display slider value)
  const derivedPct: number = useMemo(() => {
    const t = Number(targetMC);
    if (!baseMarketCap || !Number.isFinite(t) || t <= 0) return 0;
    return clamp(Math.round(((t - baseMarketCap) / baseMarketCap) * 100), -100, 100);
  }, [targetMC, baseMarketCap]);

  // chart stats
  const buyStats = getCountsAndVol(token as any, "buy", timeRange);
  const sellStats = getCountsAndVol(token as any, "sell", timeRange);
  const totalVol = (buyStats.vol ?? 0) + (sellStats.vol ?? 0);
  const buyPct = totalVol ? (buyStats.vol / totalVol) * 100 : 50;
  const sellPct = 100 - buyPct;
  const netVol = (buyStats.vol ?? 0) - (sellStats.vol ?? 0);

  // amount presets
  const [amountPresets, setAmountPresets] = useState<number[]>([0.01, 0.1, 0.5, 1]);
  const [editingPresets, setEditingPresets] = useState(false);
  const [presetDrafts, setPresetDrafts] = useState<string[]>([0.01, 0.1, 0.5, 1].map(String));
  useEffect(() => setPresetDrafts(amountPresets.map(String)), [amountPresets]);

  const commitPresetDrafts = () => {
    const next = presetDrafts.map((s, idx) => {
      const n = parseFloat(s);
      return Number.isFinite(n) && n >= 0 ? n : amountPresets[idx];
    });
    setAmountPresets(next);
    setEditingPresets(false);
  };

  return (
    <div
      className="flex h-full flex-col text-[12px] leading-tight"
      style={{ backgroundColor: '#0f1012', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}
    >
      {/* ===== A. Time buttons ===== */}
      <div className="px-3 pt-2 pb-1.5 border-b border-[#2A2B33]">
        <div className="mx-auto w-full max-w-xl overflow-hidden">
          <div className="flex gap-1 rounded-xl bg-[#1E1F26] border border-[#2A2B33] p-1">
            {(["1m", "5m", "1h", "6h", "24h"] as TimeRange[]).map((rng) => {
              const changeMap: Record<TimeRange, number> = {
                "1m": Number((token as any).price_change_1m ?? (token as any).change_1m ?? 0),
                "5m": Number((token as any).price_change_5m ?? (token as any).change_5m ?? 0),
                "1h": Number((token as any).price_change_1h ?? (token as any).change_1h ?? 0),
                "6h": Number((token as any).price_change_6h ?? (token as any).change_6h ?? 0),
                "24h": Number((token as any).price_change_24h ?? (token as any).change_24h ?? 0),
              };
              const ch = changeMap[rng] ?? 0;
              const isUp = ch >= 0;
              const abs = Math.abs(ch);

              return (
                <button
                  key={rng}
                  onClick={() => setTimeRange(rng)}
                  aria-pressed={timeRange === rng}
                  className={cx(
                    "flex-1 h-9 rounded-lg px-2 text-left flex flex-col items-start justify-center cursor-pointer",
                    timeRange === rng ? "bg-[#17191E] ring-1 ring-white/10" : "hover:bg-[#1E1F26]"
                  )}
                >
                  <span
                    className={cx(
                      "text-[11px] tracking-wide uppercase font-semibold",
                      timeRange === rng ? "text-[#E6E7EA]" : "text-[#9CA3AF]"
                    )}
                  >
                    {rng}
                  </span>
                  <span className={cx("text-[10px] tabular-nums", isUp ? "text-[#70E0B0]" : "text-[#FF4D7F]")}>
                    {isUp ? "+" : "-"}
                    {abs.toFixed(1)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== B. Stats ===== */}
      <div className="px-3 py-1.5 border-b border-[#2A2B33]">
        <div className="grid grid-cols-4 gap-4 tabular-nums">
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">24h Vol</div>
            <div className="text-[#E6E7EA] whitespace-nowrap text-[12px]">${formatSmartNumber(totalVol || 0)}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Buys</div>
            <div className="whitespace-nowrap tabular-nums text-[#70E0B0] flex items-baseline gap-1 text-[12px]">
              <span>{buyStats.count ?? 0}</span>
              <span className="text-[#9CA3AF]">/</span>
              <span className="text-[#70E0B0]">${formatSmartNumber(buyStats.vol || 0)}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Sells</div>
            <div className="whitespace-nowrap tabular-nums text-[#FF4D7F] flex items-baseline gap-1 text-[12px]">
              <span>{sellStats.count ?? 0}</span>
              <span className="text-[#9CA3AF]">/</span>
              <span className="text-[#FF4D7F]">${formatSmartNumber(sellStats.vol || 0)}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Net</div>
            <div className={cx("whitespace-nowrap tabular-nums text-[12px]", netVol >= 0 ? "text-[#70E0B0]" : "text-[#FF4D7F]")}>
              {netVol >= 0 ? "+" : "-"}${formatSmartNumber(Math.abs(netVol))}
            </div>
          </div>
        </div>
        <div className="mt-1 h-0.5 w-full rounded-full bg-[#17191E] relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full" style={{ width: `${buyPct}%`, background: AX.mint }} />
          <div className="absolute right-0 top-0 h-full" style={{ width: `${sellPct}%`, background: AX.sell }} />
        </div>
      </div>

      {/* ===== C. Buy/Sell switcher ===== */}
      <div className="px-3 py-1.5 -mt-px border-b border-[#2A2B33]">
        <div className="mx-auto w-full max-w-xl relative">
          <div className="relative h-9 rounded-lg border border-[#2A2B33] bg-[#1E1F26] overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full w-1/2 rounded-md transition-transform duration-200"
              style={{
                transform: mode === "sell" ? "translateX(100%)" : "translateX(0%)",
                background: mode === "buy" ? AX.mint : AX.sell,
              }}
            />
            <div className="relative z-10 grid grid-cols-2 h-full">
              <button
                className={cx(
                  "cursor-pointer select-none text-[13px] font-semibold",
                  "flex items-center justify-center h-full",
                  mode === "buy" ? "text-black" : "text-[#C7CBD1] hover:text-white"
                )}
                onClick={() => setMode("buy")}
              >
                Buy
              </button>
              <button
                className={cx(
                  "cursor-pointer select-none text-[13px] font-semibold",
                  "flex items-center justify-center h-full",
                  mode === "sell" ? "text-black" : "text-[#C7CBD1] hover:text-white"
                )}
                onClick={() => setMode("sell")}
              >
                Sell
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== D. Tabs ===== */}
      <div className="px-3 pt-1 pb-1.5 border-b border-[#2A2B33]">
        <div className="flex items-center gap-6">
          {(["market", "limit", "adv"] as const).map((t) => (
            <button
              key={t}
              className={cx(tabBtn, "hover:text-[#E6E7EA]", tab === t && "text-[#70E0B0] border-b-2 border-[#70E0B0]")}
              onClick={() => setTab(t)}
            >
              {t === "adv" ? "Adv." : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-[10px] text-[#9CA3AF]">
            <span className="px-1 py-0.5 border border-[#2A2B33] rounded bg-[#17191E]">1</span>
            <span className="px-1 py-0.5 border border-[#2A2B33] rounded bg-[#17191E]">0</span>
          </div>
        </div>
      </div>

      {/* ===== E. Amount ===== */}
      <div className="px-3 pt-2">
        <div className="relative rounded-lg border border-[#2A2B33] bg-[#1E1F26]">
          <div className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide">Amount</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                className="h-8 w-28 bg-transparent border-none text-right
                           text-[14px] font-semibold text-[#E6E7EA] tabular-nums
                           placeholder:text-[#9CA3AF] focus:outline-none"
                placeholder="0.0"
                value={amount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, ".");
                  if (allowDecimal(raw)) setAmount(raw);
                }}
              />
              <span className="text-[11px] font-semibold text-[#9CA3AF]">SOL</span>
            </div>
          </div>

          {/* Presets */}
          <div className="border-t border-[#2A2B33] rounded-b-lg overflow-hidden">
            <div className="grid grid-cols-5">
              {[0.01, 0.1, 0.5, 1].map((opt, i) => {
                const active = amount === String(opt);
                if (editingPresets) {
                  return (
                    <div key={i} className="h-9 border-r border-[#2A2B33] last:border-r-0 min-w-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="h-full w-full bg-[#17191E] text-center text-[12px] font-semibold text-[#E6E7EA]
                                   outline-none focus:bg-[#1E1F26]"
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
                            commitPresetDrafts();
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
                    className={cx(
                      "h-9 border-r border-[#2A2B33] last:border-r-0 text-[12px] font-semibold tabular-nums",
                      active
                        ? mode === "buy"
                          ? "bg-[#70E0B0] text-black"
                          : "bg-[#FF4D7F] text-black"
                        : "bg-[#17191E] hover:bg-[#1E1F26] text-[#E6E7EA]"
                    )}
                    onClick={() => setAmount(String(opt))}
                  >
                    {opt}
                  </button>
                );
              })}
              {!editingPresets ? (
                <button
                  type="button"
                  onClick={() => setEditingPresets(true)}
                  className="h-9 bg-[#17191E] hover:bg-[#1E1F26] text-[#E6E7EA]"
                  title="Edit preset values"
                >
                  <LuPencil className="mx-auto h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={commitPresetDrafts}
                  className="h-9 bg-[#1E1F26] text-[#E6E7EA] hover:bg-[#17191E]"
                  title="Done"
                >
                  <LuCheck className="mx-auto h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== F. LIMIT FIELDS (with SLIDER) ===== */}
      {tab === "limit" && (
        <div className="px-3 pt-2 space-y-2.5">
          {/* Market cap input */}
          <div className="rounded-lg border border-[#2A2B33] bg-[#1E1F26] p-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide">MKT CAP</span>
              <span className="text-[12px] font-semibold text-[#E6E7EA]">$</span>
            </div>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              className="h-8 w-full overflow-hidden rounded border border-[#2A2B33] bg-[#101114] px-2 text-[12px] font-semibold text-[#E6E7EA] placeholder:text-[#9CA3AF] focus:border-[#70E0B0] focus:outline-none focus:ring-1 focus:ring-[color:rgb(112_224_176_/_0.4)]"
              placeholder={baseMarketCap ? String(baseMarketCap) : "0.0"}
              value={targetMC}
              onChange={(e) => {
                const v = e.target.value.replace(/,/g, ".");
                if (/^\d*\.?\d*$/.test(v)) setTargetMC(v);
              }}
            />

            {/* Slider row */}
            <div className="mt-3 flex items-center gap-3">
              {/* slider + ticks */}
              <div className="flex-1">
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={baseMarketCap ? derivedPct : 0}
                  onChange={(e) => {
                    if (!baseMarketCap) return;
                    const p = clamp(Number(e.target.value), -100, 100);
                    const next = Math.max(0, Math.round(baseMarketCap * (1 + p / 100)));
                    setTargetMC(String(next));
                  }}
                  className="w-full accent-[#3B82F6] cursor-pointer"
                />
                {/* tick labels */}
                <div className="mt-1 flex justify-between text-[10px] text-[#9CA3AF]">
                  <span>-100%</span>
                  <span>-50%</span>
                  <span>0%</span>
                  <span>+50%</span>
                  <span>+100%</span>
                </div>
              </div>

              {/* % box */}
              <div className="w-16">
                <div className="relative">
                  <input
                    type="number"
                    min={-100}
                    max={100}
                    step={1}
                    value={baseMarketCap ? derivedPct : 0}
                    onChange={(e) => {
                      const p = clamp(Number(e.target.value || 0), -100, 100);
                      if (baseMarketCap) {
                        const next = Math.max(0, Math.round(baseMarketCap * (1 + p / 100)));
                        setTargetMC(String(next));
                      }
                    }}
                    className="h-8 w-full rounded border border-[#2A2B33] bg-[#101114] px-2 pr-6 text-[12px] font-semibold text-[#E6E7EA] outline-none"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[#9CA3AF]">%</span>
                </div>
              </div>
            </div>

            {/* helper if base MC is unknown */}
            {!baseMarketCap ? (
              <div className="mt-2 text-[10px] text-[#9CA3AF]">
                Current market cap unavailable — enter a target value directly to enable the slider.
              </div>
            ) : null}
          </div>

          {/* Direction toggle */}
          <div className="rounded-lg border border-[#2A2B33] bg-[#1E1F26] p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide">Direction</span>
              <span className="text-[12px] font-semibold text-[#E6E7EA]">{direction}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(["Above", "Below"] as const).map((d) => {
                const active = direction === d;
                return (
                  <button
                    key={d}
                    type="button"
                    className={cx(
                      baseBtn,
                      "h-8 rounded border border-[#2A2B33] bg-[#101114] hover:bg-[#1E1F26] text-[12px] cursor-pointer",
                      active && (mode === "buy" ? "bg-[#70E0B0] text-black border-transparent" : "bg-[#FF4D7F] text-black border-transparent")
                    )}
                    onClick={() => setDirection(d)}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== Settings ===== */}
      <div className="mx-3 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#E6E7EA]">
        <InterstateTooltip label="Max Slippage">
          <span className="flex items-center gap-1 text-[#9CA3AF]">
            <FaRunning className="opacity-80" /> {settings.maxSlippage * 100}%
          </span>
        </InterstateTooltip>
        <InterstateTooltip
          label={`Priority Fee: ${settings.priority}. ${settings.priority < 0.01 ? "We recommend a priority fee of atleast 0.01" : ""}`}
        >
          <span className="flex items-center gap-1 text-[#9CA3AF]">
            <FaGasPump className="opacity-90" /> {settings.priority}
            {settings.priority < 0.01 ? <span className="text-[#FF4D7F]">⚠</span> : null}
          </span>
        </InterstateTooltip>
        <InterstateTooltip label="Bribe">
          <span className="flex items-center gap-1 text-[#9CA3AF]">
            <FaCoins className="opacity-90" /> {settings.bribe} <span className="text-[#FF4D7F]">⚠</span>
          </span>
        </InterstateTooltip>
        <InterstateTooltip label="MEV Protection">
          <span
            className={cx(
              "flex items-center gap-1",
              settings.mevMode === "off" ? "text-[#9CA3AF]" : settings.mevMode === "reduced" ? "text-[#9CA3AF]" : "text-[#70E0B0]"
            )}
          >
            <FaBan className="opacity-90" />
            {settings.mevMode === "off" ? "Off" : settings.mevMode === "reduced" ? "Reduced" : "Secure"}
          </span>
        </InterstateTooltip>
      </div>

      {/* Feedback */}
      {message && (
        <div
          className={cx(
            "mx-3 mt-2 rounded-md p-2 text-center text-[11px] font-bold",
            message.type === "success" ? "bg-[#70E0B0] text-black" : "bg-[#FF4D7F] text-black"
          )}
        >
          {message.text}
        </div>
      )}

      {/* Helper line */}
      <div className="px-3 mt-1.5 text-right text-[11px] text-[#9CA3AF]">
        {amount ? (
          <>
            You’ll {mode === "buy" ? "spend" : "sell"} <span className="text-[#E6E7EA] font-semibold">{amount}</span> SOL
          </>
        ) : (
          "Enter amount"
        )}
      </div>

      {/* Primary action */}
      <div className="px-3 py-2">
        <button
          type="button"
          className={cx(
            baseBtn,
            "w-full h-10 rounded-full text-[14px] cursor-pointer",
            mode === "buy" ? "bg-[#70E0B0] text-black hover:bg-[#58B890]" : "bg-[#FF4D7F] text-black hover:opacity-90"
          )}
          disabled={!amount || isLoading || (tab === "limit" && !targetMC)}
          onClick={async () => {
            if (!user?.bearerToken) {
              setMessage({ type: "error", text: "Authentication required to create orders." });
              return;
            }
            setIsLoading(true);
            setMessage(null);

            if (tab === "limit") {
              if (!amount || !targetMC) {
                setMessage({
                  type: "error",
                  text: "Amount and Target Market Cap are required for limit orders.",
                });
                setIsLoading(false);
                return;
              }
              try {
                await createLimitOrder(
                  {
                    tokenAddress: token.pair_address,
                    amount: Number(amount),
                    type: mode === "buy" ? "Buy" : "Sell",
                    direction,
                    targetMC: Number(targetMC),
                  },
                  user.bearerToken
                );
                setMessage({ type: "success", text: `Limit order for ${token.symbol} created successfully!` });
                setAmount("");
                setTargetMC("");
              } catch (error: any) {
                setMessage({ type: "error", text: `Failed to create limit order: ${error.message}` });
              } finally {
                setIsLoading(false);
              }
              return;
            }

            // Market flow
            if (mode === "buy") {
              const requested = Number(amount || 0);
              const safetyBuffer = 0.003;
              const required = requested + safetyBuffer;
              if (!requested || requested <= 0) {
                setIsLoading(false);
                setMessage({ type: "error", text: "Enter a valid amount." });
                toast.error("Enter a valid amount");
                return;
              }
              if (solBalance < required) {
                setIsLoading(false);
                const need = Math.max(required - solBalance, 0);
                const msg = `Less balance: need ~${required.toFixed(3)} SOL (missing ${need.toFixed(3)} SOL).`;
                setMessage({ type: "error", text: msg });
                toast.error("Less balance. Please fund your wallet.");
                return;
              }
            }

            let poolType: "PumpAmm" | "Raydium CPMM" | "" = "";
            switch ((token as any).amm_id) {
              case "pump_amm":
                poolType = "PumpAmm";
                break;
              case "raydium_cpmm":
                poolType = "Raydium CPMM";
                break;
              default:
                poolType = "PumpAmm";
            }

            try {
              const tradeParams = {
                amount: Number(amount),
                poolAddress: token.pair_address,
                baseMint: token.mint,
                quoteMint: SOL_MINT_ADDRESS,
                mevProtection: (settings.mevMode == "off" ? 0 : 1) as 0 | 1,
                poolType,
              };
              const tr = await tradeBuy(tradeParams, user.bearerToken);
              const txHash = tr?.hash || tr?.txid;
              const tokenAmount = tr?.amount || tr?.tokenAmount;
              if (tr && txHash) {
                setMessage({
                  type: "success",
                  text: `✅ Trade successful! ${mode === "buy" ? "Bought" : "Sold"} ${tokenAmount || "tokens"} ${token.symbol}. Tx: ${String(txHash).slice(0, 8)}...`,
                });
              } else {
                setMessage({ type: "error", text: "❌ Trade failed. Please try again." });
              }
            } catch (error: any) {
              let errorMessage = error.message || "Unknown error";
              if (error.message?.includes("Insufficient SOL balance") || error.message?.includes("INSUFFICIENT_BALANCE")) {
                errorMessage = `💰 Insufficient SOL balance. Add SOL and try again.`;
              } else if (error.message?.includes("insufficient funds")) {
                errorMessage = `💰 Insufficient funds. Please add SOL.`;
              } else if (error.message?.includes("Invalid account discriminator") || error.message?.includes("INVALID_POOL_ADDRESS")) {
                errorMessage = `❌ Invalid pool address.`;
              } else if (error.message?.includes("TokenAccountNotFoundError")) {
                errorMessage = `❌ Token account not found.`;
              }
              setMessage({ type: "error", text: errorMessage });
            } finally {
              setIsLoading(false);
            }
          }}
        >
          {isLoading ? (
            "Processing..."
          ) : (
            <span className="inline-flex items-center gap-1">
              {mode === "buy" ? "Buy" : "Sell"} {token.symbol}
              {prettyAmt(amount) && (
                <>
                  {" "}{prettyAmt(amount)}
                  <SiSolana className="h-4 w-4 -mt-px" aria-hidden="true" />
                </>
              )}
            </span>
          )}
        </button>
      </div>

      {/* footer mini stats */}
      <div className="grid grid-cols-4" style={{ borderTop: `1px solid ${AX.border}` }}>
        <div className="flex flex-col items-center gap-0.5" style={{ borderRight: `1px solid ${AX.border}` }}>
          <span className="text-[10px] text-[#9CA3AF]">Bought</span>
          <span className="text-[#70E0B0] text-[11px]">$0</span>
        </div>
        <div className="flex flex-col items-center gap-0.5" style={{ borderRight: `1px solid ${AX.border}` }}>
          <span className="text-[10px] text-[#9CA3AF]">Sold</span>
          <span className="text-[#FF4D7F] text-[11px]">$0</span>
        </div>
        <div className="flex flex-col items-center gap-0.5" style={{ borderRight: `1px solid ${AX.border}` }}>
          <span className="text-[10px] text-[#9CA3AF]">Holding</span>
          <span className="text-[#E6E7EA] text-[11px]">$0</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-[#9CA3AF]">PnL</span>
          <span className="text-[#70E0B0] text-[11px]">$0(+0%)</span>
        </div>
      </div>

      <div className="w-full overflow-hidden" style={{ borderTop: `1px solid ${AX.border}` }}>
        <QuickBuy hideActionButton className="rounded-none border-none bg-transparent" />
      </div>
    </div>
  );
};

export default TradeActionPanel;
