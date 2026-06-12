import { useEffect, useMemo, useRef, useState } from "react";
import { getWalletDailyPnl, type WalletDailyPnlDay } from "~/utils/api";

/**
 * PnL Calendar — GMGN-style month grid of per-day realized PnL for a wallet.
 *
 * Data comes from the token-service `/v1/wallet/:addr/daily-pnl` endpoint, which
 * computes each UTC day's realized PnL from raw on-chain swaps (chain-grounded
 * avg-cost; USD is time-accurate via per-trade price_usd). Verified within ~7% of
 * GMGN's own monthly figure for whale wallets; per-day buy/sell txns + volume
 * match GMGN to the dollar.
 *
 * Win/loss day counts and positive streaks are derived here: a "win day" is
 * realized > 0; an inactive ($0) day breaks a streak; current streak = the most
 * recent win run, best = the longest run in the month.
 */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const GREEN = "#2bd4a0";
const RED = "#fb4b69";
const AMBER = "#f8be6e"; // top-profit-day highlight (GMGN convention)

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Compact money: +$11.4K / -$1.2M / +$320 */
function fmtMoney(n: number, currency: "USD" | "SOL", signed = true): string {
  const sign = n > 0 ? (signed ? "+" : "") : n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const sym = currency === "USD" ? "$" : "◎";
  let body: string;
  if (abs >= 1_000_000) body = `${(abs / 1_000_000).toFixed(2)}M`;
  else if (abs >= 1_000) body = `${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  else if (abs >= 1) body = abs.toFixed(currency === "SOL" ? 2 : 0);
  else body = abs.toFixed(currency === "SOL" ? 3 : 2);
  return `${sign}${sym}${body}`;
}

type HoverState = {
  day: WalletDailyPnlDay;
  dateLabel: string;
  x: number;
  y: number;
} | null;

export default function PnlCalendar({
  address,
  initial,
}: {
  address: string;
  /** Background-prefetched current month (from WalletScanPanel) so the tab is
   * instant on first open instead of paying the ~1.6s cold cost-basis scan. */
  initial?: { month: string; days: WalletDailyPnlDay[] } | null;
}) {
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  });
  const [days, setDays] = useState<WalletDailyPnlDay[]>(initial?.days ?? []);
  const [loading, setLoading] = useState(!initial);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(
    initial?.month ?? null,
  );
  const [currency, setCurrency] = useState<"USD" | "SOL">("USD");
  const [hover, setHover] = useState<HoverState>(null);

  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const monthStr = `${year}-${pad2(month + 1)}`;

  // Seed from a background prefetch that resolves after this mounts (user opened
  // the tab before the warm-up finished).
  useEffect(() => {
    if (initial && initial.month === monthStr && loadedMonth !== monthStr) {
      setDays(initial.days);
      setLoadedMonth(initial.month);
      setLoading(false);
    }
  }, [initial, monthStr, loadedMonth]);

  useEffect(() => {
    // Already have this month (prefetched or previously loaded) → no refetch.
    if (loadedMonth === monthStr) return;
    const ac = new AbortController();
    setLoading(true);
    getWalletDailyPnl(address, { month: monthStr, signal: ac.signal })
      .then((r) => {
        setDays(r.days || []);
        setLoadedMonth(monthStr);
      })
      .catch(() => {
        /* aborted or transient — keep prior data */
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [address, monthStr, loadedMonth]);

  const byDate = useMemo(() => {
    const m = new Map<string, WalletDailyPnlDay>();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  // USD shows NET (gross − costs) to match GMGN; SOL shows gross realized (cost
  // is only computed in USD). net_pnl_usd is absent on an older backend → gross.
  const valueOf = (d: WalletDailyPnlDay) =>
    currency === "USD"
      ? (d.net_pnl_usd ?? d.realized_pnl_usd)
      : d.realized_pnl_sol;

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;

  const stats = useMemo(() => {
    let total = 0, winDays = 0, winSum = 0, lossDays = 0, lossSum = 0;
    let topVal = 0, run = 0, best = 0, current = 0;
    for (let dnum = 1; dnum <= daysInMonth; dnum++) {
      const d = byDate.get(`${monthStr}-${pad2(dnum)}`);
      const v = d ? valueOf(d) : 0;
      total += v;
      if (v > 0) {
        winDays++; winSum += v; topVal = Math.max(topVal, v);
        run++; current = run; best = Math.max(best, run);
      } else {
        if (v < 0) { lossDays++; lossSum += v; }
        run = 0;
      }
    }
    return { total, winDays, winSum, lossDays, lossSum, topVal, current, best };
  }, [byDate, daysInMonth, monthStr, currency]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthLabel = monthDate.toLocaleString("en-US", {
    month: "short", year: "numeric", timeZone: "UTC",
  });
  const shiftMonth = (delta: number) =>
    setMonthDate(new Date(Date.UTC(year, month + delta, 1)));
  const now = new Date();
  const atCurrentMonth =
    year === now.getUTCFullYear() && month === now.getUTCMonth();
  const winPct =
    stats.winDays + stats.lossDays > 0
      ? (stats.winDays / (stats.winDays + stats.lossDays)) * 100
      : stats.winDays > 0 ? 100 : 0;

  // First load (no data for this month yet) → skeleton; month-nav keeps old grid.
  const showSkeleton = loading && loadedMonth !== monthStr;

  const onCellEnter = (e: React.MouseEvent, d: WalletDailyPnlDay) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dt = new Date(`${d.date}T00:00:00Z`);
    setHover({
      day: d,
      dateLabel: dt.toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
      }),
      x: r.left + r.width / 2,
      y: r.top,
    });
  };

  // --- Share card (PNG export, Axiom-style) ---
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState<null | "download" | "copy">(null);
  const shortAddr =
    address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;

  const renderCard = async (): Promise<HTMLCanvasElement | null> => {
    if (!shareCardRef.current) return null;
    // The card uses inline hex/rgb styles only (no Tailwind oklch colors), which
    // html2canvas 1.4.1 can't parse — so capture is reliable.
    const { default: html2canvas } = await import("html2canvas");
    return html2canvas(shareCardRef.current, {
      backgroundColor: "#0a0b0d",
      scale: 2,
      logging: false,
      useCORS: true,
    });
  };
  const downloadCard = async () => {
    setBusy("download");
    try {
      const c = await renderCard();
      if (c) {
        const a = document.createElement("a");
        a.href = c.toDataURL("image/png");
        a.download = `interstate-pnl-${monthStr}.png`;
        a.click();
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };
  const copyCard = async () => {
    setBusy("copy");
    try {
      const c = await renderCard();
      if (c) {
        await new Promise<void>((resolve) =>
          c.toBlob(async (blob) => {
            try {
              if (blob && "clipboard" in navigator && "write" in navigator.clipboard) {
                await navigator.clipboard.write([
                  new ClipboardItem({ "image/png": blob }),
                ]);
              }
            } catch {
              /* clipboard unsupported */
            }
            resolve();
          }, "image/png"),
        );
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#f4f4f5]">PnL Calendar</span>
          <button
            onClick={() => setCurrency((c) => (c === "USD" ? "SOL" : "USD"))}
            className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-[#a1a1aa] transition-colors hover:border-white/20 hover:text-[#f4f4f5]"
          >
            {currency === "USD" ? "$ USD" : "◎ SOL"}
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-[#a1a1aa] transition-colors hover:border-[#2bd4a0]/40 hover:text-[#2bd4a0]"
            title="Share this month's PnL"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            Share
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shiftMonth(-1)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#a1a1aa] transition-colors hover:bg-white/[0.06] hover:text-[#f4f4f5]"
            aria-label="Previous month"
          >‹</button>
          <span className="min-w-[112px] text-center text-xs font-medium text-[#d4d4d8]">
            {monthLabel} UTC
          </span>
          <button
            onClick={() => shiftMonth(1)}
            disabled={atCurrentMonth}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#a1a1aa] transition-colors enabled:hover:bg-white/[0.06] enabled:hover:text-[#f4f4f5] disabled:cursor-not-allowed disabled:opacity-25"
            aria-label="Next month"
          >›</button>
        </div>
      </div>

      {/* Monthly total + win/loss bar */}
      <div className="pb-2">
        <div className="flex items-baseline gap-2">
          <span
            className="text-[26px] font-bold leading-none tabular-nums"
            style={{ color: stats.total >= 0 ? GREEN : RED }}
          >
            {fmtMoney(stats.total, currency)}
          </span>
          {loading && (
            <span className="text-[10px] text-[#52525b]">updating…</span>
          )}
        </div>
        <div className="mt-2 flex h-1 w-full overflow-hidden rounded-full bg-[#fb4b69]/25">
          <div className="h-full rounded-full transition-all" style={{ width: `${winPct}%`, background: GREEN }} />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] font-medium tabular-nums">
          <span style={{ color: GREEN }}>{stats.winDays} / {fmtMoney(stats.winSum, currency)}</span>
          <span style={{ color: RED }}>{stats.lossDays} / {fmtMoney(stats.lossSum, currency)}</span>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 pb-1.5 sm:gap-1.5">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-[9px] font-medium uppercase tracking-wide text-[#52525b] sm:text-[10px]">{w}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-1 sm:gap-1.5" onMouseLeave={() => setHover(null)}>
        {showSkeleton
          ? Array.from({ length: 35 }).map((_, i) => (
              <div key={`sk-${i}`} className="min-h-[40px] animate-pulse rounded-lg bg-white/[0.03] sm:min-h-[58px]" />
            ))
          : (
            <>
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dnum = i + 1;
                const key = `${monthStr}-${pad2(dnum)}`;
                const d = byDate.get(key);
                const v = d ? valueOf(d) : 0;
                const isTop = v > 0 && v === stats.topVal && stats.topVal > 0;
                const color = v > 0 ? (isTop ? AMBER : GREEN) : v < 0 ? RED : "#3f3f46";
                const intensity =
                  v !== 0 && stats.topVal > 0
                    ? Math.min(0.16, 0.05 + (Math.abs(v) / stats.topVal) * 0.11)
                    : 0;
                const bg = isTop
                  ? "rgba(248,190,110,0.12)"
                  : v > 0
                    ? `rgba(43,212,160,${intensity})`
                    : v < 0
                      ? `rgba(251,75,105,${Math.min(0.14, intensity)})`
                      : "rgba(255,255,255,0.012)";
                return (
                  <div
                    key={key}
                    onMouseEnter={d ? (e) => onCellEnter(e, d) : undefined}
                    className="relative flex min-h-[40px] flex-col rounded-md border p-1 transition-colors sm:min-h-[58px] sm:rounded-lg sm:p-1.5"
                    style={{
                      background: bg,
                      borderColor: isTop ? "rgba(248,190,110,0.45)" : "rgba(255,255,255,0.04)",
                    }}
                  >
                    <span className="text-[8px] font-medium text-[#71717a] sm:text-[10px]">{dnum}</span>
                    <span
                      className="flex flex-1 items-center justify-center text-[10px] font-bold leading-none tabular-nums sm:text-[13px]"
                      style={{ color }}
                    >
                      {v === 0 ? "$0" : fmtMoney(v, currency)}
                    </span>
                  </div>
                );
              })}
            </>
          )}
      </div>

      {/* Streak footer + Interstate branding (bottom-right) */}
      <div className="flex items-center justify-between gap-3 pt-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#71717a] sm:text-[11px]">
          <span>Current Streak: <span className="font-semibold text-[#d4d4d8]">{stats.current}d</span></span>
          <span>Best in {monthLabel.split(" ")[0]}: <span className="font-semibold text-[#d4d4d8]">{stats.best}d</span></span>
        </div>
        {/* Matches the nav logo lockup: ring + Orbitron uppercase wordmark */}
        <div className="flex flex-shrink-0 items-center gap-2 opacity-90">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/interstate/logo.png" alt="Interstate" className="h-6 w-6 object-contain sm:h-7 sm:w-7" />
          <span className="!font-orbitron text-sm font-semibold uppercase tracking-wider text-[#e4e4e7]">
            interstate
          </span>
        </div>
      </div>

      {/* Hover tooltip (fixed-position, GMGN-style breakdown) */}
      {hover && (
        <div
          className="pointer-events-none fixed z-50 w-[260px] -translate-x-1/2 -translate-y-full rounded-lg border border-white/10 bg-[#0c0e12]/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-sm"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          <div className="pb-2 text-xs font-semibold text-[#f4f4f5]">{hover.dateLabel}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
            <div>
              <div className="text-[#71717a]">Net PnL</div>
              <div
                className="font-semibold tabular-nums"
                style={{ color: (hover.day.net_pnl_usd ?? hover.day.realized_pnl_usd) >= 0 ? GREEN : RED }}
              >
                {fmtMoney(hover.day.net_pnl_usd ?? hover.day.realized_pnl_usd, "USD")}
              </div>
            </div>
            <div>
              <div className="text-[#71717a]">Gross / Cost</div>
              <div className="font-semibold tabular-nums text-[#d4d4d8]">
                <span style={{ color: hover.day.realized_pnl_usd >= 0 ? GREEN : RED }}>
                  {fmtMoney(hover.day.realized_pnl_usd, "USD")}
                </span>
                <span className="text-[#52525b]"> / </span>
                <span style={{ color: RED }}>−{fmtMoney(hover.day.cost_usd ?? 0, "USD", false)}</span>
              </div>
            </div>
            <div>
              <div className="text-[#71717a]">Today&apos;s Profit</div>
              <div className="font-semibold tabular-nums" style={{ color: GREEN }}>
                {fmtMoney(hover.day.profit_usd, "USD", false)}
              </div>
            </div>
            <div>
              <div className="text-[#71717a]">Today&apos;s Loss</div>
              <div className="font-semibold tabular-nums" style={{ color: RED }}>
                {fmtMoney(hover.day.loss_usd, "USD", false)}
              </div>
            </div>
            <div>
              <div className="text-[#71717a]">Buy/Sell Txns</div>
              <div className="font-semibold tabular-nums text-[#d4d4d8]">
                <span style={{ color: GREEN }}>{hover.day.buy_count}</span>
                {" / "}
                <span style={{ color: RED }}>{hover.day.sell_count}</span>
              </div>
            </div>
            <div>
              <div className="text-[#71717a]">Buy/Sell Volume</div>
              <div className="font-semibold tabular-nums text-[#d4d4d8]">
                <span style={{ color: GREEN }}>{fmtMoney(hover.day.buy_volume_usd, "USD", false)}</span>
                {" / "}
                <span style={{ color: RED }}>{fmtMoney(hover.day.sell_volume_usd, "USD", false)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share modal — branded, exportable card */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="w-full max-w-[460px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* The capture target — inline hex styles only (html2canvas-safe) */}
            <div
              ref={shareCardRef}
              style={{
                position: "relative",
                borderRadius: 16,
                overflow: "hidden",
                background:
                  "linear-gradient(135deg, #0d0f14 0%, #0a0b0d 55%, #0c1410 100%)",
                border: "1px solid rgba(43,212,160,0.18)",
                padding: 24,
                fontFamily:
                  "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/interstate/logo.png" alt="" width={38} height={38} style={{ objectFit: "contain" }} />
                  <span
                    className="!font-orbitron"
                    style={{ color: "#f4f4f5", fontWeight: 600, fontSize: 21, textTransform: "uppercase", letterSpacing: "0.08em" }}
                  >
                    interstate
                  </span>
                </div>
                <span style={{ color: "#71717a", fontSize: 12, fontWeight: 600 }}>PnL Calendar</span>
              </div>

              <div style={{ color: "#a1a1aa", fontSize: 14, fontWeight: 600, marginTop: 22 }}>
                {monthLabel} · {shortAddr}
              </div>
              <div
                style={{
                  color: stats.total >= 0 ? GREEN : RED,
                  fontSize: 46,
                  fontWeight: 800,
                  lineHeight: 1.05,
                  marginTop: 4,
                  letterSpacing: "-0.02em",
                }}
              >
                {fmtMoney(stats.total, currency)}
              </div>

              <div style={{ display: "flex", gap: 28, marginTop: 18 }}>
                <div>
                  <div style={{ color: "#71717a", fontSize: 11 }}>Win Rate</div>
                  <div style={{ color: "#f4f4f5", fontSize: 17, fontWeight: 700 }}>{winPct.toFixed(0)}%</div>
                </div>
                <div>
                  <div style={{ color: "#71717a", fontSize: 11 }}>Win / Loss Days</div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>
                    <span style={{ color: GREEN }}>{stats.winDays}</span>
                    <span style={{ color: "#52525b" }}> / </span>
                    <span style={{ color: RED }}>{stats.lossDays}</span>
                  </div>
                </div>
                <div>
                  <div style={{ color: "#71717a", fontSize: 11 }}>Best Streak</div>
                  <div style={{ color: "#f4f4f5", fontSize: 17, fontWeight: 700 }}>{stats.best}d</div>
                </div>
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "20px 0 14px" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: "#2bd4a0", fontSize: 12, fontWeight: 600 }}>app.interstate.so</span>
                <span style={{ color: "#52525b", fontSize: 11 }}>Trade smarter on Interstate</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => setShareOpen(false)}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-[#a1a1aa] transition-colors hover:text-[#f4f4f5]"
              >
                Close
              </button>
              <button
                onClick={copyCard}
                disabled={busy !== null}
                className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[#d4d4d8] transition-colors hover:text-[#f4f4f5] disabled:opacity-50"
              >
                {busy === "copy" ? "Copying…" : "Copy"}
              </button>
              <button
                onClick={downloadCard}
                disabled={busy !== null}
                className="rounded-md bg-[#2bd4a0] px-3 py-1.5 text-xs font-semibold text-[#06120d] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy === "download" ? "Saving…" : "Download"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
