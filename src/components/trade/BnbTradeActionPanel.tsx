"use client";

import React, { useEffect, useMemo, useState } from "react";
import { LuChefHat } from "react-icons/lu";
import { BsPersonGear } from "react-icons/bs";
import { FaCopy, FaExternalLinkAlt } from "react-icons/fa";
import { useQuickBuy } from "~/components/QuickBuyContext";
import QuickBuy from "~/components/QuickBuy";
import InterstateTooltip from "../InterstateTooltip";
import toast from "react-hot-toast";
import {
  BNB_USD_FALLBACK,
  type BnbOhlcItem,
  type BnbOhlcvTimeRange,
  type BnbOhlcvWindowStats,
  type BnbTokenDetailPatch,
  computeBnbOhlcvWindowStats,
  resolveBnbMarketCapUsd,
  resolveBnbPriceFromOhlcCandles,
  resolveBnbPriceUsd,
  resolveBnbCirculatingSupply,
  resolveBnbTop10HoldersPct,
  resolveBnbDevHoldingPct,
  resolveBnbSniperPct,
  fetchBnbUsdPrice,
} from "~/utils/bnbToken";
import useBnbTradePanelData from "~/hooks/useBnbTradePanelData";
import { useUser } from "~/components/UserContext";
import BnbTradeFormPanel from "./BnbTradeFormPanel";
import BnbPositionStats from "./BnbPositionStats";

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

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const formatCompactNumber = (n: number): string => {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  if (abs < 1) return n.toFixed(4).replace(/\.?0+$/, "");
  return Math.round(n).toString();
};

const formatPanelUsd = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const abs = Math.abs(n);
  if (abs < 0.01) return "<0.01";
  if (abs < 1) return n.toFixed(2);
  return formatCompactNumber(Math.round(n));
};

const formatHolderPct = (val: number): string => {
  if (!Number.isFinite(val) || val <= 0) return "0%";
  if (val < 0.01) return "<0.01%";
  return val >= 10 ? `${val.toFixed(1)}%` : `${val.toFixed(2)}%`;
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
      volObj[`${s}_volume_${window}`],
      volObj[`${s}_${window}_usd`],
      volObj[`${s}_volume_${window}_usd`],
      volObj[window === "5m" ? `${s}_5m` : `${s}_${window}`],
    );
    if (nestedVol > 0) volUsd = nestedVol;
    const nestedCount = pickNum(
      volObj[`${s}_count_${window}`],
      volObj[`${s}s_${window}`],
      volObj[`count_${s}_${window}`],
    );
    if (nestedCount > 0) count = nestedCount;
  }

  if (volUsd === 0) {
    volUsd = pickNum(t[`total_${s}_volume_${window}`]);
  }
  if (count === 0) {
    count = pickNum(t[`total_${s}s_${window}`]);
  }

  if (window === "24h" && volUsd === 0) {
    volUsd = pickNum(
      t[`total_${s}_volume_24h`],
      s === "buy" ? t.total_buy_volume_24h : t.total_sell_volume_24h,
    );
  }

  return { count, vol: volUsd };
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
    resolveBnbTop10HoldersPct(token) ??
      token?.top10_holders_pct ??
      token?.top10_holding_pct ??
      token?.top_10_holder_percent ??
      token?.top10_holding_percentage,
  );
  const devH = parsePct(
    resolveBnbDevHoldingPct(token) ??
      token?.dev_holding_pct ??
      token?.dev_holding ??
      token?.creator_holding_pct ??
      token?.dev_holding_percentage,
  );
  const snipers = parsePct(
    resolveBnbSniperPct(token) ??
      token?.sniper_pct ??
      token?.snipers_hold_pct ??
      token?.sniper_percent ??
      token?.sniper_holding_percentage,
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
                {formatHolderPct(top10)}
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
                {formatHolderPct(devH)}
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
                {formatHolderPct(snipers)}
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
  token: BnbTokenDetailPatch & { [key: string]: any };
  liveMarketCapUsd?: number | null;
  livePriceUsd?: number | null;
  ohlcCandles?: BnbOhlcItem[] | null;
  tradeVolumeStats?: Partial<Record<BnbOhlcvTimeRange, BnbOhlcvWindowStats>>;
}

const BnbTradeActionPanel: React.FC<BnbTradeActionPanelProps> = ({
  token,
  liveMarketCapUsd,
  livePriceUsd,
  ohlcCandles,
  tradeVolumeStats,
}) => {
  const { presets, activePreset } = useQuickBuy();
  const { user } = useUser();

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
  const [bnbUsdPrice, setBnbUsdPrice] = useState(BNB_USD_FALLBACK);

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

  const {
    selectedWalletCount,
    bnbBalance,
    position,
  } = useBnbTradePanelData(token?.mint, tokenPriceUsd, {
    enabled: Boolean(token?.mint),
  });

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
    const fromTrades = tradeVolumeStats?.[timeRange];
    if (fromTrades && (fromTrades.volume > 0 || fromTrades.buys > 0 || fromTrades.sells > 0)) {
      return fromTrades;
    }

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
  }, [ohlcCandles, timeRange, token, tradeVolumeStats]);

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

  const positionDisplay = useMemo(() => {
    const pnlUsd =
      pnlMode === "unrealized" ? position.unrealizedPnlUsd : position.realizedPnlUsd;
    const pnlPct =
      pnlMode === "unrealized" ? position.unrealizedPnlPct : 0;
    return {
      bought: formatPanelUsd(position.boughtUsd),
      sold: formatPanelUsd(position.soldUsd),
      holding: formatPanelUsd(position.holdingUsd),
      pnlUsd,
      pnlPct,
    };
  }, [pnlMode, position]);

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
                ${formatPanelUsd(volume || 0)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">Buys</div>
              <div className="flex items-baseline gap-0.5 whitespace-nowrap text-[11px] text-[#70E0B0]">
                <span>{formatCompactNumber(Math.round(buys ?? 0))}</span>
                <span className="text-[#9CA3AF]">/</span>
                <span className="text-[#70E0B0]">${formatPanelUsd(buyVolume || 0)}</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">Sells</div>
              <div className="flex items-baseline gap-0.5 whitespace-nowrap text-[11px] text-[#FF4D7F]">
                <span>{formatCompactNumber(Math.round(sells ?? 0))}</span>
                <span className="text-[#9CA3AF]">/</span>
                <span className="text-[#FF4D7F]">${formatPanelUsd(sellVolume || 0)}</span>
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
                {netVolume >= 0 ? "+" : "-"}${formatPanelUsd(Math.abs(netVolume))}
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

      <BnbTradeFormPanel
        token={token}
        mode={mode}
        setMode={setMode}
        tab={tab}
        setTab={setTab}
        amount={amount}
        setAmount={setAmount}
        sliderPct={sliderPct}
        setSliderPct={setSliderPct}
        targetMC={targetMC}
        setTargetMC={setTargetMC}
        editingPresets={editingPresets}
        setEditingPresets={setEditingPresets}
        presetDrafts={presetDrafts}
        setPresetDrafts={setPresetDrafts}
        migrationMode={migrationMode}
        setMigrationMode={setMigrationMode}
        devSellMode={devSellMode}
        setDevSellMode={setDevSellMode}
        tokenPriceUsd={tokenPriceUsd}
        bnbUsdPrice={bnbUsdPrice}
        baseMarketCap={baseMarketCap}
        settings={settings}
        amountPresets={amountPresets}
        selectedWalletCount={selectedWalletCount}
        bnbBalance={bnbBalance}
        user={user}
        creatorAddress={creatorAddress}
        isAdvMode={isAdvMode}
        isSniperMode={isSniperMode}
        isDevSellMode={isDevSellMode}
      />

      <BnbPositionStats
        positionDisplay={positionDisplay}
        pnlMode={pnlMode}
        onPnlModeToggle={() => setPnlMode((m) => (m === "unrealized" ? "realized" : "unrealized"))}
      />

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
    </div>
  );
};

export default BnbTradeActionPanel;
