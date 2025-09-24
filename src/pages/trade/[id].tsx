import { useRouter } from "next/router";
import { useEffect, useState, useCallback, useRef } from "react";
import Head from "next/head";
import { Toaster } from "react-hot-toast";
import { useWallet } from "../../components/useWallet";
import { useUser } from "../../components/UserContext";
import Header from "../../components/Header";
import TradeHeader from "../../components/trade/TradeHeader";
import PriceChartWidget from "../../components/PriceChartWidget";
import TradeActionPanel from "../../components/trade/TradeActionPanel";
import TradeTabs from "../../components/trade/TradeTabs";
import CodexTrades from "../../components/trade/CodexTrades";
import CodexTopTraders from "../../components/trade/CodexTopTraders";
import CodexDevTokens from "../../components/trade/CodexDevTokens";
import CodexHolders from "../../components/trade/CodexHolders";
import useSingleTokenPolling from "../../hooks/useSingleTokenPolling";

// Icon buttons for the tiny toolbar
import { FiStar, FiShare2, FiMaximize2, FiSettings } from "react-icons/fi";
import { HiBolt } from "react-icons/hi2";

// ---------- small local helpers (styling + safe numbers) ----------
const fmtCompact = (n: any) => {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(v);
};
const fmtUsd = (n: any) => {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "$—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
};

// minimal, reusable UI atoms to keep this file self-contained
function KPIChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-neutral-900/60 px-3 py-1 text-xs text-neutral-200 backdrop-blur">
      <span className="text-neutral-400">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function IconButton({
  title,
  children,
  onClick,
}: {
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-neutral-900/70 text-neutral-300 shadow-sm transition
                 hover:bg-neutral-800 hover:text-white hover:ring-1 hover:ring-white/15"
    >
      {children}
    </button>
  );
}

function PillChip({
  active = false,
  children,
}: {
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${
        active
          ? "border border-emerald-700/40 bg-emerald-900/25 text-emerald-200 ring-1 ring-emerald-700/30"
          : "border border-white/10 bg-white/5 text-neutral-300"
      }`}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------

export default function TradePage() {
  const router = useRouter();
  const { id } = router.query;

  const [showSkeleton, setShowSkeleton] = useState(true);
  const { isConnected } = useWallet();
  const { user } = useUser();
  const [selectedTab, setSelectedTab] = useState("Trades");
  const [search, setSearch] = useState("");

  const {
    token,
    isPolling,
    error: pollingError,
    loading: pollingLoading,
    isHydrating,
  } = useSingleTokenPolling(typeof id === "string" ? id : undefined);

  // ------------------- drag-to-resize state --------------------
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startTopPxRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const MIN_TOP = 220;
  const MIN_BOTTOM = 180;
  const [topPanePx, setTopPanePx] = useState<number>(() => {
    if (typeof window === "undefined") return 420;
    const v = Number(localStorage.getItem("tradeSplitTopPx"));
    return Number.isFinite(v) && v > 0 ? v : 420;
  });

  useEffect(() => {
    localStorage.setItem("tradeSplitTopPx", String(topPanePx));
  }, [topPanePx]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const maxTop = Math.max(MIN_TOP, rect.height - MIN_BOTTOM);
      setTopPanePx((v) => Math.min(Math.max(v, MIN_TOP), maxTop));
    });
    ro.observe(el);
    resizeObsRef.current = ro;
    return () => ro.disconnect();
  }, []);

  const clampTop = useCallback((desired: number) => {
    const el = containerRef.current;
    if (!el) return desired;
    const rect = el.getBoundingClientRect();
    const maxTop = Math.max(MIN_TOP, rect.height - MIN_BOTTOM);
    return Math.min(Math.max(desired, MIN_TOP), maxTop);
  }, []);

  const applyByDelta = useCallback(
    (pageY: number) => {
      const delta = pageY - startYRef.current;
      const next = clampTop(startTopPxRef.current + delta);
      setTopPanePx(next);
    },
    [clampTop]
  );

  const onPointerMove = useCallback(
    (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      ev.preventDefault();
      const pageY = ev.clientY + window.scrollY;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => applyByDelta(pageY));
    },
    [applyByDelta]
  );

  const stopDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.cursor = "";
    (document.body.style as any).userSelect = "";
    document.documentElement.style.cursor = "";
    window.removeEventListener("pointermove", onPointerMove, { capture: true } as any);
    window.removeEventListener("pointerup", stopDrag as any, { capture: true } as any);
  }, [onPointerMove]);

  const startDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const pageY = e.clientY + window.scrollY;
      draggingRef.current = true;
      startYRef.current = pageY;
      startTopPxRef.current = topPanePx;

      e.currentTarget.setPointerCapture?.(e.pointerId);

      document.body.style.cursor = "row-resize";
      document.documentElement.style.cursor = "row-resize";
      (document.body.style as any).userSelect = "none";

      window.addEventListener("pointermove", onPointerMove, { capture: true });
      window.addEventListener("pointerup", stopDrag as any, { capture: true });
    },
    [onPointerMove, stopDrag, topPanePx]
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopDrag();
    };
  }, [stopDrag]);

  // skeleton timing
  useEffect(() => {
    setShowSkeleton(true);
    const t = setTimeout(() => setShowSkeleton(false), 1200);
    return () => clearTimeout(t);
  }, [id]);

  if (showSkeleton) {
    return (
      <div className="min-h-screen w-full flex flex-col bg-neutral-950 text-neutral-100">
        <Header search={search} setSearch={setSearch} />
        <div className="flex flex-1" />
      </div>
    );
  }

  if (pollingLoading) {
    return <div className="mt-20 text-center text-2xl text-neutral-400">Loading...</div>;
  }

  if (!token) {
    return (
      <div className="mt-20 text-center text-2xl text-red-400">
        Token not found
      </div>
    );
  }

  // Pull common values for KPI chips (safe fallbacks)
  const price = (token as any).usd_price ?? (token as any).price_usd ?? (token as any).price;
  const liquidity = (token as any).total_liquidity_usd ?? (token as any).liquidity_usd;
  const supply = (token as any).total_supply ?? (token as any).supply;
  const feesPaid = (token as any).global_fees_paid ?? (token as any).globalFeesPaid;
  const curvePct =
    (token as any).bonding_pct ??
    (token as any).bonding_curve_progress ??
    (token as any).bcurve ??
    null;

  return (
    <>
      <Head>
        <title>{token?.name} | Trade</title>
      </Head>
      <Toaster position="top-right" />

      {draggingRef.current && <div className="fixed inset-0 z-[60] cursor-row-resize" />}

      <div className="min-h-screen w-full flex flex-col bg-neutral-950 text-neutral-100">
        <Header search={search} setSearch={setSearch} />

        {isPolling && (
          <div className="text-center text-blue-500 p-2 bg-blue-900/50">
            Live data updating every 3 seconds...
          </div>
        )}
        {isHydrating && (
          <div className="text-center text-yellow-500 p-2 bg-yellow-900/50">
            Finding trading pair for this token...
          </div>
        )}

        <div className="flex flex-1 flex-row w-full">
          {/* LEFT: chart + table */}
          <div
            ref={containerRef}
            className="flex-1 min-w-0 flex flex-col pb-4 border-r border-emerald-950"
          >
            {/* TOP pane */}
            <div className="flex-shrink-0 flex flex-col" style={{ height: topPanePx }}>
              <TradeHeader token={token} />

              {/* --- KPI strip + icon cluster (NEW) --- */}
              <div className="flex items-center justify-between gap-3 px-3 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <KPIChip label="Price" value={fmtUsd(price)} />
                  <KPIChip label="Liquidity" value={fmtUsd(liquidity)} />
                  <KPIChip label="Supply" value={fmtCompact(supply)} />
                  <KPIChip label="Global Fees Paid" value={fmtCompact(feesPaid)} />
                  <KPIChip
                    label="B.Curve"
                    value={
                      Number.isFinite(Number(curvePct))
                        ? `${Math.round(Number(curvePct))}%`
                        : "—"
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <IconButton title="Share">
                    <FiShare2 size={16} />
                  </IconButton>
                  <IconButton title="Favorite">
                    <FiStar size={16} />
                  </IconButton>
                  <IconButton title="Fullscreen chart">
                    <FiMaximize2 size={16} />
                  </IconButton>
                  <IconButton title="Chart settings">
                    <FiSettings size={16} />
                  </IconButton>
                </div>
              </div>

              <div className="flex-1 min-h-[200px]">
                <PriceChartWidget
                  token={token}
                  pairAddress={typeof id === "string" ? id : undefined}
                />
              </div>
            </div>

            {/* HANDLE */}
            <div
              ref={handleRef}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize chart and trades panels"
              tabIndex={0}
              onPointerDown={startDrag}
              onDoubleClick={() => {
                const el = containerRef.current;
                if (!el) return;
                const h = el.getBoundingClientRect().height;
                setTopPanePx(clampTop(Math.round(h * 0.6)));
              }}
              onKeyDown={(e) => {
                const STEP = 24;
                if (e.key === "ArrowUp") setTopPanePx((v) => clampTop(v - STEP));
                if (e.key === "ArrowDown") setTopPanePx((v) => clampTop(v + STEP));
              }}
              className="relative z-10 h-4 cursor-row-resize group select-none touch-none"
              style={{ touchAction: "none" }}
            >
              {/* line */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] bg-emerald-800 group-hover:bg-emerald-400 transition-colors z-0" />
              {/* dots with mask */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <div className="flex gap-1 rounded-full bg-neutral-950 px-1 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-700 group-hover:bg-emerald-300" />
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-700 group-hover:bg-emerald-300" />
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-700 group-hover:bg-emerald-300" />
                </div>
              </div>
            </div>

            {/* BOTTOM pane */}
            <div className="flex-1 min-h-[120px] flex flex-col">
              {/* chip toolbar */}
              {/* <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <PillChip active>
                    <HiBolt className="text-emerald-300" />
                    <span>Instant Trade</span>
                  </PillChip>
                  <PillChip>
                    <span>Trades Panel</span>
                  </PillChip>
                  <PillChip>
                    <span>DEV</span>
                  </PillChip>
                </div>
              </div> */}

              <hr className="border-emerald-950" />
              <TradeTabs selectedTab={selectedTab} setSelectedTab={setSelectedTab} />
              <div className="flex-1 min-h-0">
                {selectedTab === "Trades" && <CodexTrades token={token} />}
                {selectedTab === "Top Traders" && <CodexTopTraders token={token} />}
                {selectedTab === "Holders" && <CodexHolders token={token} />}
                {selectedTab === "Dev Tokens" && <CodexDevTokens token={token} />}
              </div>
            </div>
          </div>

          {/* RIGHT: action panel (unchanged, but your panel already looks great) */}
          <div className="flex-shrink-0 min-w-[260px] basis-[280px] md:basis-[310px] lg:basis-[310px]">
            <TradeActionPanel token={token} />
          </div>
        </div>
      </div>
    </>
  );
}

function clampTopFactory(el: HTMLElement | null, MIN_TOP: number, MIN_BOTTOM: number) {
  if (!el) return (n: number) => n;
  const rect = el.getBoundingClientRect();
  const maxTop = Math.max(MIN_TOP, rect.height - MIN_BOTTOM);
  return (n: number) => Math.min(Math.max(n, MIN_TOP), maxTop);
}
