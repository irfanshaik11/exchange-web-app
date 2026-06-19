"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LuPencil, LuCheck, LuChefHat, LuArrowLeftRight } from "react-icons/lu";
import { BsPersonGear } from "react-icons/bs";
import { FaRunning, FaGasPump, FaCoins, FaBan, FaCopy, FaExternalLinkAlt, FaWallet } from "react-icons/fa";
import { type Token } from "~/utils/db";
import { useQuickBuy } from "~/components/QuickBuyContext";
import QuickBuy from "~/components/QuickBuy";
import InterstateTooltip from "../InterstateTooltip";
import toast from "react-hot-toast";
import {
  type BnbOhlcItem,
  type BnbOhlcvTimeRange,
  computeBnbOhlcvWindowStats,
  resolveBnbMarketCapUsd,
  resolveBnbPriceFromOhlcCandles,
  resolveBnbPriceUsd,
  resolveBnbCirculatingSupply,
  fetchBnbUsdPrice,
} from "~/utils/bnbToken";
import { BNB_CHAIN_ICON } from "~/utils/bnbProtocols";

type TimeRange = BnbOhlcvTimeRange;
type TradeTab = "market" | "limit" | "adv";
type TradeMode = "buy" | "sell";

const AX = {
  bg: "#0c0d10",
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

const BNB_ICON = BNB_CHAIN_ICON;

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

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

const truncateAddress = (address: string, start = 4, end = 4) => {
  if (!address) return "";
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
};

const pickNum = (...vals: unknown[]): number => {
  for (const v of vals) {
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
};

function getBnbCountsAndVol(t: any, side: "buy" | "sell", window: TimeRange) {
  const volObj = t?.volume;
  const s = side;
  const countKey = `total_${s}s_${window}`;
  const volKey = `total_${s}_volume_${window}`;

  let count = num(t[countKey]);
  let volUsd = num(t[volKey]);

  if (volObj && typeof volObj === "object" && !Array.isArray(volObj)) {
    const nestedVol = pickNum(
      volObj[`${s}_${window}`],
      volObj[`${s}_volume_${window}`],
      volObj[`${s}_${window}_usd`],
    );
    if (nestedVol > 0) volUsd = nestedVol;
    const nestedCount = pickNum(volObj[`${s}_count_${window}`], volObj[`count_${window}`]);
    if (nestedCount > 0 && window === "5m") count = nestedCount;
  }

  if (window === "24h" && volUsd === 0) {
    volUsd = pickNum(
      t[`total_${s}_volume_24h`],
      s === "buy" ? t.total_buy_volume_24h : t.total_sell_volume_24h,
    );
  }

  return { count, vol: volUsd };
}

function BnbIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={BNB_ICON}
      alt="BNB"
      width={size}
      height={size}
      className={cx("rounded-full object-cover", className)}
    />
  );
}

const AddressDisplay: React.FC<{
  label: string;
  address: string;
  icon: React.ReactNode;
  explorerUrl: string;
  tooltip: string;
}> = ({ label, address, icon, explorerUrl, tooltip }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Copied to clipboard!");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (!address) return null;

  return (
    <div className="flex items-center justify-between border-b border-[#2A2B33] px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="text-[#9CA3AF]">{icon}</div>
        <InterstateTooltip label={tooltip}>
          <span className="cursor-help text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            {label}:
          </span>
        </InterstateTooltip>
        <span className="font-mono text-[11px] text-[#E6E7EA]">{truncateAddress(address)}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded p-1 transition-colors hover:bg-[#2A2B33]"
          title="Copy address"
        >
          <FaCopy className={cx("h-3 w-3", copied ? "text-[#70E0B0]" : "text-[#9CA3AF]")} />
        </button>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded p-1 transition-colors hover:bg-[#2A2B33]"
          title="View on BscScan"
        >
          <FaExternalLinkAlt className="h-3 w-3 text-[#9CA3AF]" />
        </a>
      </div>
    </div>
  );
};

const TokenInfoSection: React.FC<{ token: any }> = ({ token }) => {
  const [isOpen, setIsOpen] = useState(true);

  const parsePct = (val: unknown): number => {
    if (val == null) return 0;
    const n = typeof val === "string" ? parseFloat(val) : Number(val);
    return Number.isFinite(n) ? n : 0;
  };

  const top10 = parsePct(
    token?.top10_holders_pct ??
      token?.top10_holding_pct ??
      token?.top_10_holder_percent ??
      token?.top10_holding_percentage,
  );
  const devH = parsePct(
    token?.dev_holding_pct ?? token?.dev_holding ?? token?.creator_holding_pct ?? token?.dev_holding_percentage,
  );
  const snipers = parsePct(
    token?.sniper_pct ?? token?.snipers_hold_pct ?? token?.sniper_percent ?? token?.sniper_holding_percentage,
  );

  return (
    <div style={{ backgroundColor: AX.bg, borderTop: `1px solid ${AX.border}` }}>
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="-mx-2 -my-1 flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-[#1f2127]"
          style={{ color: AX.muted }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide">Token Info</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={cx("transition-transform", isOpen && "rotate-180")}
          >
            <path d="M6 9L1 4L11 4L6 9Z" fill="currentColor" />
          </svg>
        </button>
      </div>
      {isOpen && (
        <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
          <div
            className="flex h-[68px] flex-col items-center justify-center gap-1 rounded-md border p-2"
            style={{ backgroundColor: "rgba(30, 31, 38, 0.3)", borderColor: AX.border }}
          >
            <div className="flex items-center gap-1.5">
              <BsPersonGear size={16} style={{ color: AX.mint }} />
              <div className="text-[12px] font-bold" style={{ color: AX.mint }}>
                {top10 > 0 ? `${top10.toFixed(2)}%` : "0%"}
              </div>
            </div>
            <div className="text-center text-[10px] uppercase leading-tight tracking-wide" style={{ color: AX.muted }}>
              Top 10 H.
            </div>
          </div>
          <div
            className="flex h-[68px] flex-col items-center justify-center gap-1 rounded-md border p-2"
            style={{ backgroundColor: "rgba(30, 31, 38, 0.3)", borderColor: AX.border }}
          >
            <div className="flex items-center gap-1.5">
              <LuChefHat size={16} style={{ color: "#566cdc" }} />
              <div className="text-[12px] font-bold" style={{ color: "#566cdc" }}>
                {devH > 0 ? `${devH.toFixed(1)}%` : "0%"}
              </div>
            </div>
            <div className="text-center text-[10px] uppercase leading-tight tracking-wide" style={{ color: AX.muted }}>
              Dev H.
            </div>
          </div>
          <div
            className="flex h-[68px] flex-col items-center justify-center gap-1 rounded-md border p-2"
            style={{ backgroundColor: "rgba(30, 31, 38, 0.3)", borderColor: AX.border }}
          >
            <div className="flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#f26681" }}>
                <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <line x1="12" y1="4" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5" />
                <line x1="12" y1="16" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5" />
                <line x1="4" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" />
                <line x1="16" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
              <div className="text-[12px] font-bold" style={{ color: "#f26681" }}>
                {snipers > 0 ? `${snipers.toFixed(1)}%` : "0%"}
              </div>
            </div>
            <div className="text-center text-[10px] uppercase leading-tight tracking-wide" style={{ color: AX.muted }}>
              Snipers H.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface BnbTradeActionPanelProps {
  token: Token | any;
  liveMarketCapUsd?: number | null;
  livePriceUsd?: number | null;
  ohlcCandles?: BnbOhlcItem[] | null;
}

const BnbTradeActionPanel: React.FC<BnbTradeActionPanelProps> = ({
  token,
  liveMarketCapUsd,
  livePriceUsd,
  ohlcCandles,
}) => {
  const { presets, activePreset } = useQuickBuy();

  const [timeRange, setTimeRange] = useState<TimeRange>("5m");
  const [tab, setTab] = useState<TradeTab>("market");
  const [mode, setMode] = useState<TradeMode>("buy");
  const [amount, setAmount] = useState("");
  const [editingPresets, setEditingPresets] = useState(false);
  const [presetDrafts, setPresetDrafts] = useState<string[]>([]);
  const [targetMC, setTargetMC] = useState("");
  const [sliderPct, setSliderPct] = useState<number | "">(0);
  const [migrationMode, setMigrationMode] = useState(true);
  const [devSellMode, setDevSellMode] = useState(false);
  const [pnlMode, setPnlMode] = useState<"unrealized" | "realized">("unrealized");
  const [bnbUsdPrice, setBnbUsdPrice] = useState(600);

  useEffect(() => {
    let cancelled = false;
    void fetchBnbUsdPrice().then((price) => {
      if (!cancelled && price && price > 0) setBnbUsdPrice(price);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const settings = useMemo(() => {
    const preset = presets[activePreset];
    return mode === "buy" ? preset?.quickBuySettings : preset?.quickSellSettings;
  }, [activePreset, mode, presets]);

  const amountPresets = useMemo(() => {
    if (mode === "sell") return [25, 50, 75, 100];
    return [0.01, 0.1, 0.5, 1];
  }, [mode]);

  useEffect(() => {
    setPresetDrafts(amountPresets.map(String));
  }, [amountPresets]);

  const commitPresetDrafts = useCallback(() => {
    setEditingPresets(false);
  }, []);

  const creatorAddress = useMemo(
    () =>
      String(
        token?.creator_wallet ??
          token?.creator ??
          token?.dev_wallet ??
          token?.deployer ??
          "",
      ).trim(),
    [token],
  );

  const ohlcPriceUsd = useMemo(
    () => resolveBnbPriceFromOhlcCandles(ohlcCandles ?? []),
    [ohlcCandles],
  );

  const tokenPriceUsd = useMemo(() => {
    const price = livePriceUsd ?? ohlcPriceUsd ?? resolveBnbPriceUsd(token);
    return price != null && price > 0 ? price : 0;
  }, [livePriceUsd, ohlcPriceUsd, token]);

  const supply = useMemo(() => resolveBnbCirculatingSupply(token), [token]);

  const ohlcMarketCapUsd = useMemo(() => {
    if (tokenPriceUsd <= 0 || supply == null) return undefined;
    return tokenPriceUsd * supply;
  }, [supply, tokenPriceUsd]);

  const baseMarketCap = useMemo(
    () => liveMarketCapUsd ?? ohlcMarketCapUsd ?? resolveBnbMarketCapUsd(token) ?? 0,
    [liveMarketCapUsd, ohlcMarketCapUsd, token],
  );

  useEffect(() => {
    if (tab === "limit" && baseMarketCap > 0 && !targetMC) {
      setTargetMC(String(Math.round(baseMarketCap)));
      setSliderPct(0);
    }
  }, [tab, baseMarketCap, targetMC]);

  const realTimeStats = useMemo(() => {
    const candles = ohlcCandles ?? [];
    if (candles.length > 0) {
      const fromOhlc = computeBnbOhlcvWindowStats(candles, timeRange);
      if (fromOhlc.volume > 0 || fromOhlc.buys > 0 || fromOhlc.sells > 0) {
        return fromOhlc;
      }
    }

    const buyStats = getBnbCountsAndVol(token, "buy", timeRange);
    const sellStats = getBnbCountsAndVol(token, "sell", timeRange);
    let buys = buyStats.count;
    let sells = sellStats.count;
    const buyVolume = buyStats.vol;
    const sellVolume = sellStats.vol;
    const totalVol = buyVolume + sellVolume;

    if (buys === 0 && sells === 0 && totalVol > 0) {
      const txCount = pickNum(token?.tx_count_5m, token?.volume?.count_5m, token?.tx_count_24h);
      if (txCount > 0) {
        buys = Math.round(txCount * (buyVolume / totalVol));
        sells = Math.max(0, txCount - buys);
      }
    }

    const volume = totalVol > 0 ? totalVol : pickNum(token?.volume_24h, token?.volume?.volume_24h_usd);
    const buyPct = volume > 0 ? (buyVolume / volume) * 100 : 50;
    const sellPct = 100 - buyPct;
    const netVolume = buyVolume - sellVolume;

    return {
      buys,
      sells,
      volume,
      buyVolume,
      sellVolume,
      netVolume,
      buyPercentage: buyPct,
      sellPercentage: sellPct,
    };
  }, [ohlcCandles, timeRange, token]);

  const {
    buys,
    sells,
    volume,
    buyVolume,
    sellVolume,
    netVolume,
    buyPercentage,
    sellPercentage,
  } = realTimeStats;

  const handleTrade = () => {
    toast("BNB chain trading is coming soon", { icon: "⏳" });
  };

  const isAdvMode = tab === "adv";
  const isSniperMode = isAdvMode && migrationMode;
  const isDevSellMode = isAdvMode && devSellMode;

  return (
    <div
      className="flex flex-col text-[12px] leading-tight"
      style={{
        backgroundColor: "#101114",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif',
        paddingBottom: "100px",
      }}
    >
      {/* Volume stats with hover time-range selector */}
      <div className="group relative">
        <div className="pointer-events-auto absolute inset-0 z-20 hidden bg-white/[0.06] backdrop-blur-md group-hover:flex">
          {(["5m", "1h", "6h", "24h"] as TimeRange[]).map((rng) => (
            <button
              key={rng}
              type="button"
              onClick={() => setTimeRange(rng)}
              aria-pressed={timeRange === rng}
              className={cx(
                "flex flex-1 cursor-pointer flex-col items-center justify-center px-2 py-1.5 transition-colors",
                timeRange === rng ? "bg-white/15" : "hover:bg-white/5",
                rng !== "24h" ? "border-r border-white/10" : "",
              )}
            >
              <span
                className={cx(
                  "text-[11px] font-semibold uppercase tracking-wide",
                  timeRange === rng ? "text-[#E6E7EA]" : "text-[#9CA3AF]",
                )}
              >
                {rng}
              </span>
            </button>
          ))}
        </div>

        <div className="border-b border-[#2A2B33] px-3 py-1.5">
          <div
            className="grid grid-cols-4 gap-3 tabular-nums"
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
            }}
          >
            <div>
              <div className="whitespace-nowrap text-[10px] uppercase tracking-wide text-[#9CA3AF]">
                {timeRange} Vol
              </div>
              <div className="whitespace-nowrap text-[11px] text-[#E6E7EA]">
                ${formatCompactNumber(Math.round(volume || 0))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">Buys</div>
              <div className="flex items-baseline gap-0.5 whitespace-nowrap text-[11px] text-[#70E0B0]">
                <span>{formatCompactNumber(Math.round(buys ?? 0))}</span>
                <span className="text-[#9CA3AF]">/</span>
                <span className="text-[#70E0B0]">${formatCompactNumber(Math.round(buyVolume || 0))}</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">Sells</div>
              <div className="flex items-baseline gap-0.5 whitespace-nowrap text-[11px] text-[#FF4D7F]">
                <span>{formatCompactNumber(Math.round(sells ?? 0))}</span>
                <span className="text-[#9CA3AF]">/</span>
                <span className="text-[#FF4D7F]">${formatCompactNumber(Math.round(sellVolume || 0))}</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">Net</div>
              <div
                className={cx(
                  "whitespace-nowrap text-[11px] tabular-nums",
                  netVolume >= 0 ? "text-[#70E0B0]" : "text-[#FF4D7F]",
                )}
              >
                {netVolume >= 0 ? "+" : "-"}${formatCompactNumber(Math.round(Math.abs(netVolume)))}
              </div>
            </div>
          </div>
          <div className="relative mt-1.5 h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: AX.border }}>
            <div
              className="absolute left-0 top-0 h-full rounded-l-full"
              style={{ width: `${buyPercentage}%`, background: AX.mint }}
            />
            <div
              className="absolute right-0 top-0 h-full rounded-r-full"
              style={{ width: `${sellPercentage}%`, background: AX.sell }}
            />
          </div>
        </div>
      </div>

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
                boxShadow: mode === "buy" ? `0 0 12px ${AX.mintGlow}` : `0 0 12px ${AX.sellGlow}`,
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
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium text-[#E6E7EA]" style={{ borderColor: AX.border, backgroundColor: AX.surface }}>
          <FaWallet size={11} className="text-[#9CA3AF]" />
          <span>0</span>
          <BnbIcon size={11} />
          <span>0.00</span>
        </div>
      </div>

      {/* Adv sub-tabs */}
      {isAdvMode && (
        <div className="border-b border-[#2A2B33] px-3 py-2">
          <div className="relative overflow-hidden rounded-lg" style={{ backgroundColor: AX.surface2 }}>
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
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: AX.muted }}>
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
                  onClick={commitPresetDrafts}
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
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: AX.muted }}>
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
            {settings?.mevMode === "off" ? "Off" : settings?.mevMode === "reduced" ? "Reduced" : "Secure"}
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
            boxShadow: mode === "buy" ? `0 0 20px ${AX.mintGlow}` : `0 0 20px ${AX.sellGlow}`,
          }}
          disabled={!amount}
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
                  {mode === "sell" ? <span>%</span> : <BnbIcon size={16} className="inline-block" />}
                </>
              )}
            </span>
          )}
        </button>
      </div>

      {/* Position stats */}
      <div className="grid grid-cols-4 gap-1 p-3">
        {(["Bought", "Sold", "Holding", "UPnL"] as const).map((label, idx) => {
          const isPnl = label === "UPnL";
          const color =
            idx === 1 ? AX.sell : idx === 2 ? "#3b82f6" : AX.mint;
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
                  onClick={() => setPnlMode((m) => (m === "unrealized" ? "realized" : "unrealized"))}
                  className="flex flex-col items-center gap-1"
                >
                  <span className="flex items-center gap-1 text-[9px] uppercase tracking-wide" style={{ color: AX.muted }}>
                    {pnlMode === "unrealized" ? "UPnL" : "PnL"}
                    <LuArrowLeftRight size={9} />
                  </span>
                  <div className="flex items-center gap-1">
                    <BnbIcon size={10} />
                    <span className="text-[9px] font-semibold" style={{ color: AX.mint }}>
                      +$0 (+0.0%)
                    </span>
                  </div>
                </button>
              ) : (
                <>
                  <span className="text-[9px] uppercase tracking-wide" style={{ color: AX.muted }}>
                    {label}
                  </span>
                  <div className="flex items-center gap-1">
                    <BnbIcon size={10} />
                    <span className="text-[10px] font-semibold" style={{ color }}>
                      $0
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Presets P1/P2/P3 */}
      <div className="w-full overflow-hidden" style={{ borderTop: `1px solid ${AX.border}` }}>
        <QuickBuy hideActionButton className="rounded-none border-none bg-transparent" />
      </div>

      {/* CA / DA */}
      <div className="border-t border-[#2A2B33]">
        <AddressDisplay
          label="CA"
          address={token?.mint || ""}
          icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
            </svg>
          }
          explorerUrl={`https://bscscan.com/token/${token?.mint || ""}`}
          tooltip="Contract Address on BNB Chain"
        />
        {creatorAddress && (
          <AddressDisplay
            label="DA"
            address={creatorAddress}
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            }
            explorerUrl={`https://bscscan.com/address/${creatorAddress}`}
            tooltip="Developer / creator wallet on BNB Chain"
          />
        )}
      </div>

      <TokenInfoSection token={token} />

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
    </div>
  );
};

export default BnbTradeActionPanel;
