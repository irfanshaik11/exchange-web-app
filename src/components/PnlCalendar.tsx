import { useEffect, useMemo, useState } from "react";
import { getWalletDailyPnl, type WalletDailyPnlDay } from "~/utils/api";

/**
 * PnL Calendar — GMGN-style month grid of per-day realized PnL for a wallet.
 *
 * Data comes from the token-service `/v1/wallet/:addr/daily-pnl` endpoint, which
 * computes each UTC day's realized PnL from raw on-chain swaps (chain-grounded
 * avg-cost; USD is time-accurate via per-trade price_usd). Verified within ~7% of
 * GMGN's own monthly figure for whale wallets — the residual is fee/FIFO method.
 *
 * Win/loss day counts and positive streaks are derived here from the daily values:
 * a "win day" is realized > 0; an inactive ($0) day breaks a streak; the current
 * streak is the length of the most recent win run, the best is the longest run.
 */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const GREEN = "#18c48c";
const RED = "#ef4444";
const AMBER = "#f8be6e"; // top-profit-day highlight (matches GMGN)

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Compact money: +$11.4K / -$1.2M / +$320 */
function fmtMoney(n: number, currency: "USD" | "SOL"): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const sym = currency === "USD" ? "$" : "◎";
  let body: string;
  if (abs >= 1_000_000) body = `${(abs / 1_000_000).toFixed(2)}M`;
  else if (abs >= 1_000) body = `${(abs / 1_000).toFixed(abs >= 10_000 ? 1 : 2)}K`;
  else if (abs >= 1) body = abs.toFixed(currency === "SOL" ? 2 : 0);
  else body = abs.toFixed(currency === "SOL" ? 3 : 2);
  return `${sign}${sym}${body}`;
}

export default function PnlCalendar({ address }: { address: string }) {
  // Month being viewed, anchored to UTC (the data is bucketed by UTC day).
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  });
  const [days, setDays] = useState<WalletDailyPnlDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<"USD" | "SOL">("USD");

  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth(); // 0-based
  const monthStr = `${year}-${pad2(month + 1)}`;

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    getWalletDailyPnl(address, { month: monthStr, signal: ac.signal })
      .then((r) => setDays(r.days || []))
      .catch(() => {
        /* aborted or transient — keep prior data */
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [address, monthStr]);

  const byDate = useMemo(() => {
    const m = new Map<string, WalletDailyPnlDay>();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  const valueOf = (d: WalletDailyPnlDay) =>
    currency === "USD" ? d.realized_pnl_usd : d.realized_pnl_sol;

  // Grid geometry. Monday-first week (Mon=0 … Sun=6).
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;

  const stats = useMemo(() => {
    let total = 0;
    let winDays = 0;
    let winSum = 0;
    let lossDays = 0;
    let lossSum = 0;
    let topVal = 0;
    let run = 0;
    let best = 0;
    let current = 0;
    for (let dnum = 1; dnum <= daysInMonth; dnum++) {
      const key = `${monthStr}-${pad2(dnum)}`;
      const d = byDate.get(key);
      const v = d ? valueOf(d) : 0;
      total += v;
      if (v > 0) {
        winDays++;
        winSum += v;
        topVal = Math.max(topVal, v);
        run++;
        current = run;
        best = Math.max(best, run);
      } else {
        if (v < 0) {
          lossDays++;
          lossSum += v;
        }
        run = 0;
      }
    }
    return { total, winDays, winSum, lossDays, lossSum, topVal, current, best };
  }, [byDate, daysInMonth, monthStr, currency]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthLabel = monthDate.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const shiftMonth = (delta: number) =>
    setMonthDate(new Date(Date.UTC(year, month + delta, 1)));

  // Don't allow navigating into future months.
  const now = new Date();
  const atCurrentMonth =
    year === now.getUTCFullYear() && month === now.getUTCMonth();

  const winPct =
    stats.winDays + stats.lossDays > 0
      ? (stats.winDays / (stats.winDays + stats.lossDays)) * 100
      : 0;

  // Cell background: scale opacity by magnitude relative to the top day; the top
  // profit day gets an amber tint (GMGN convention).
  const cellStyle = (v: number): React.CSSProperties => {
    if (v === 0) return { background: "rgba(255,255,255,0.015)" };
    const isTop = v > 0 && v === stats.topVal && stats.topVal > 0;
    const color = v > 0 ? (isTop ? AMBER : GREEN) : RED;
    const intensity =
      stats.topVal > 0 ? Math.min(0.22, 0.06 + (Math.abs(v) / stats.topVal) * 0.16) : 0.1;
    return {
      background: isTop
        ? "rgba(248,190,110,0.14)"
        : v > 0
          ? `rgba(24,196,140,${intensity})`
          : `rgba(239,68,68,${Math.min(0.2, intensity)})`,
      borderColor: isTop ? "rgba(248,190,110,0.4)" : "transparent",
      color,
    };
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header: title, currency toggle, month nav, totals */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#f4f4f5]">PnL Calendar</span>
          <button
            onClick={() => setCurrency((c) => (c === "USD" ? "SOL" : "USD"))}
            className="rounded-md border border-white/[0.08] bg-[#0c0e12] px-2 py-0.5 text-[10px] font-medium text-[#a1a1aa] transition-colors hover:text-[#f4f4f5]"
            title="Toggle USD / SOL"
          >
            {currency === "USD" ? "$ USD" : "◎ SOL"}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => shiftMonth(-1)}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.06] text-[#a1a1aa] transition-colors hover:text-[#f4f4f5]"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="min-w-[110px] text-center font-mono text-xs text-[#d4d4d8]">
            {monthLabel} UTC
          </span>
          <button
            onClick={() => shiftMonth(1)}
            disabled={atCurrentMonth}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.06] text-[#a1a1aa] transition-colors enabled:hover:text-[#f4f4f5] disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      {/* Monthly total + win/loss summary */}
      <div className="pb-2">
        <div
          className="text-2xl font-semibold tabular-nums"
          style={{ color: stats.total >= 0 ? GREEN : RED }}
        >
          {fmtMoney(stats.total, currency)}
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#ef4444]/30">
          <div
            className="h-full rounded-full"
            style={{ width: `${winPct}%`, background: GREEN }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums">
          <span style={{ color: GREEN }}>
            {stats.winDays} / {fmtMoney(stats.winSum, currency)}
          </span>
          <span style={{ color: RED }}>
            {stats.lossDays} / {fmtMoney(stats.lossSum, currency)}
          </span>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1.5 pb-1.5">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-[#52525b]">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid flex-1 grid-cols-7 gap-1.5">
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dnum = i + 1;
          const key = `${monthStr}-${pad2(dnum)}`;
          const d = byDate.get(key);
          const v = d ? valueOf(d) : 0;
          const st = cellStyle(v);
          return (
            <div
              key={key}
              className="relative flex min-h-[52px] flex-col justify-between rounded-lg border p-1.5 transition-colors"
              style={st}
              title={
                d
                  ? `${key} — ${fmtMoney(v, currency)} · ${d.sell_count} sells / ${d.buy_count} buys`
                  : `${key} — no activity`
              }
            >
              <span className="text-[10px] font-medium text-[#71717a]">{dnum}</span>
              <span
                className="text-center text-[11px] font-semibold leading-tight tabular-nums"
                style={{ color: v === 0 ? "#3f3f46" : (st.color as string) }}
              >
                {v === 0 ? "$0" : fmtMoney(v, currency)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Streak footer */}
      <div className="flex items-center gap-4 pt-2.5 text-[11px] text-[#71717a]">
        <span>
          Current Positive Streak:{" "}
          <span className="font-semibold text-[#d4d4d8]">{stats.current}d</span>
        </span>
        <span>
          Best Positive Streak in {monthLabel.split(" ")[0]}:{" "}
          <span className="font-semibold text-[#d4d4d8]">{stats.best}d</span>
        </span>
        {loading && <span className="text-[#52525b]">loading…</span>}
      </div>
    </div>
  );
}
