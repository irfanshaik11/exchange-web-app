/**
 * Leaderboard Page
 *
 * Third tab of the Airdrop Genesis umbrella (alongside Airdrop Genesis
 * and Referrals). Wraps the same space-themed rounded container as the
 * other two pages, and drops in the leaderboard content: category tabs
 * (Points / Realized PnL / Volume), period toggle (Daily / Monthly /
 * Lifetime), top-3 podium, your position, and the full standings list.
 */

import React, { useState, useMemo, useEffect } from "react";
import Head from "next/head";
import Header from "~/components/Header";
import Footer from "~/components/Footer";
import { DockedPanelMarginWrapper } from "~/contexts/DockedPanelContext";
import { useUser } from "~/components/UserContext";
import { useLeaderboardPageData } from "~/hooks/useArena";
import ArenaPageToggle from "~/components/ArenaPageToggle";
import type { LeaderboardEntry } from "~/utils/arenaApi";

import { GiTrophy } from "react-icons/gi";
import { FiSearch, FiAlertCircle } from "react-icons/fi";

import {
  SEASONS,
  getCurrentSeason,
  isSeasonEnded,
  isSeasonLocked,
  type SeasonKey,
} from "~/utils/seasons";
import posthog from "posthog-js";

type LeaderboardType = "points" | "pnl" | "volume";
// Leaderboard period is now always a season. Legacy DAILY/MONTHLY/LIFETIME
// still serve traffic from the backend during the bake period but are no
// longer exposed in the UI — tracking cleanup in exchange-backend#256.
type LeaderboardPeriod = SeasonKey;

// A small hook for debouncing a value by N milliseconds. Used to throttle
// the search-as-you-type input so every keystroke doesn't fire a fresh
// backend request and spawn a new React Query cache entry.
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

// Shared space background — matches airdrop-genesis.tsx + referrals.tsx
const SpaceBackgroundContained = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
    <div
      className="absolute inset-x-0 top-0 h-[80vh] bg-cover bg-top bg-no-repeat"
      style={{ backgroundImage: "url(/ranks/Background.png)" }}
    />
    <div className="absolute inset-0 bg-black/30" />
    <div
      className="absolute inset-0"
      style={{
        background:
          "linear-gradient(to bottom, transparent 0%, transparent 20%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.3) 45%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.85) 75%, black 90%)",
      }}
    />
    <div
      className="absolute inset-x-0 top-1/4 bottom-0"
      style={{
        background:
          "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.2) 25%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.8) 75%, black 100%)",
      }}
    />
    <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />
  </div>
);

// Inline countdown — compact HH:MM:SS for the toolbar
const CountdownInline = ({ targetTime }: { targetTime: Date }) => {
  const [t, setT] = useState({ h: 0, m: 0, s: 0 });
  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, targetTime.getTime() - Date.now());
      setT({
        h: Math.floor(diff / 3_600_000),
        m: Math.floor((diff % 3_600_000) / 60_000),
        s: Math.floor((diff % 60_000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetTime]);
  return (
    <span>
      {String(t.h).padStart(2, "0")}:{String(t.m).padStart(2, "0")}:
      {String(t.s).padStart(2, "0")}
    </span>
  );
};

// FAQ accordion
const FAQItem = ({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.08]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-4 text-left"
      >
        <span className="text-sm font-medium text-white">{question}</span>
        <span className="text-xl text-neutral-500">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="pb-4 text-sm text-neutral-400">{answer}</div>}
    </div>
  );
};

export default function LeaderboardPage() {
  const { user } = useUser();
  const [mounted, setMounted] = useState(false);
  const [type, setType] = useState<LeaderboardType>("points");
  // Default to whichever season is currently active. Hardcoding PRESEASON
  // would become a time-bomb on Apr 30 when Preseason ends; computing at
  // mount keeps the default accurate across the full season schedule.
  // Falls back to PRESEASON only if the clock is somehow outside every
  // season window (shouldn't happen in normal operation).
  const [period, setPeriod] = useState<LeaderboardPeriod>(
    () => getCurrentSeason()?.key ?? "PRESEASON",
  );
  // Uncontrolled input text — debounced below before flowing into the query
  // so every keystroke doesn't fire a fresh backend request.
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  // Leaderboard caps at top 10 per product direction (Irfan + Hujoe,
  // Slack Apr 21). Pagination is retired — "your position" row for
  // users outside top 10 will land with the seasons migration.
  const pageSize = 10;
  const TOP_N = 10;

  useEffect(() => setMounted(true), []);

  const { leaderboard, position, top3 } = useLeaderboardPageData(type, period, {
    limit: pageSize,
    offset: 0,
    search: debouncedSearch || undefined,
  });

  // Countdown targets the END of the current selected season. Frozen
  // (past) seasons return null — no "ends in" label to show.
  const nextResetTime = useMemo(() => {
    const season = SEASONS.find((s) => s.key === period);
    if (!season) return null;
    if (Date.now() >= season.end.getTime()) return null;
    return season.end;
  }, [period]);

  const top3Data: LeaderboardEntry[] = top3.data ?? [];
  const leaderboardEntries: LeaderboardEntry[] =
    leaderboard.data?.entries ?? [];
  const isInitialLoading =
    leaderboard.isLoading && leaderboardEntries.length === 0;
  const isLeaderboardError = leaderboard.isError;
  const isTop3Loading = top3.isLoading && top3Data.length === 0;

  // Display label — "Credits" matches the terminology used everywhere
  // else in the Airdrop Genesis umbrella (even though the backend API
  // path is /api/leaderboard/points and the storage column is goldEarned,
  // the user-facing word across the product is Credits).
  const categoryLabel = {
    points: "Credits",
    pnl: "Realized PnL",
    volume: "Volume",
  }[type];

  const getEntryValue = (entry: LeaderboardEntry | undefined): number => {
    if (!entry) return 0;
    if (type === "points") return Number(entry.points ?? entry.goldEarned ?? 0);
    if (type === "pnl") return Number(entry.pnl ?? 0);
    return Number(entry.volume ?? 0);
  };

  const formatValue = (value: number): string => {
    if (type === "points") return value.toLocaleString();
    if (type === "pnl") {
      const formatted = value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });
      return value >= 0 ? `+${formatted}` : formatted;
    }
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  };

  const getValueColor = (value: number): string => {
    if (type !== "pnl") return "text-white";
    return value >= 0 ? "text-emerald-400" : "text-rose-400";
  };

  // Deterministic avatar tint from name (purely decorative)
  const avatarGradient = (name: string): string => {
    const palette = [
      "from-amber-500/25 to-amber-700/10 text-amber-200",
      "from-emerald-500/25 to-emerald-700/10 text-emerald-200",
      "from-sky-500/25 to-sky-700/10 text-sky-200",
      "from-violet-500/25 to-violet-700/10 text-violet-200",
      "from-rose-500/25 to-rose-700/10 text-rose-200",
      "from-cyan-500/25 to-cyan-700/10 text-cyan-200",
      "from-fuchsia-500/25 to-fuchsia-700/10 text-fuchsia-200",
      "from-lime-500/25 to-lime-700/10 text-lime-200",
    ];
    let h = 0;
    for (let i = 0; i < name.length; i++)
      h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  };

  return (
    <>
      <Head>
        <title>Leaderboard | Interstate Airdrop Genesis</title>
        <meta
          name="description"
          content="Interstate's traders, ranked by Points, Realized PnL, and Volume."
        />
      </Head>

      <div className="min-h-screen bg-black">
        <Header />

        <DockedPanelMarginWrapper>
          <div className="p-1 sm:p-1.5">
            {/* Rounded container with shared space background */}
            <div className="relative min-h-[calc(100vh-80px)] overflow-hidden rounded-2xl border border-white/[0.06]">
              <SpaceBackgroundContained />

              <main className="relative z-10 mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6">
                {/* Top-level tab: Airdrop Genesis / Referrals / Leaderboard */}
                <ArenaPageToggle activePage="leaderboard" />

                {/* Epic title block — mirrors airdrop-genesis + referrals */}
                <div
                  className={`mb-10 text-center transition-all duration-700 ${
                    mounted
                      ? "translate-y-0 opacity-100"
                      : "-translate-y-4 opacity-0"
                  }`}
                >
                  <div className="mb-4 flex items-center justify-center gap-4">
                    <div className="h-px w-16 bg-gradient-to-r from-transparent via-amber-500/50 to-amber-500/20" />
                    <GiTrophy className="h-6 w-6 text-amber-500/70" />
                    <div className="h-px w-16 bg-gradient-to-l from-transparent via-amber-500/50 to-amber-500/20" />
                  </div>

                  <h1 className="text-center text-5xl font-black tracking-tight text-white md:text-6xl">
                    LEADERBOARD
                  </h1>

                  <div className="mt-4 flex items-center justify-center gap-3">
                    <p className="text-sm font-semibold tracking-[0.3em] text-neutral-200 uppercase">
                      Trade • Compete • Conquer
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-500/30" />
                    <div className="h-px w-24 bg-gradient-to-r from-amber-500/30 via-amber-500/10 to-transparent" />
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500/20" />
                    <div className="h-px w-24 bg-gradient-to-l from-amber-500/30 via-amber-500/10 to-transparent" />
                    <div className="h-2 w-2 rounded-full bg-amber-500/30" />
                  </div>
                </div>

                {/* Category + period toolbar */}
                <div
                  className={`mb-8 flex flex-col gap-4 transition-all delay-100 duration-700 ${
                    mounted
                      ? "translate-y-0 opacity-100"
                      : "translate-y-4 opacity-0"
                  }`}
                >
                  {/* Category pills */}
                  <div className="flex items-center justify-center">
                    <div className="inline-flex items-center rounded-full bg-[#1a1b1f] p-1">
                      {(
                        [
                          { key: "points", label: "Credits" },
                          { key: "pnl", label: "Realized PnL" },
                          { key: "volume", label: "Volume" },
                        ] as const
                      ).map(({ key, label }) => {
                        const active = type === key;
                        return (
                          <button
                            key={key}
                            onClick={() => setType(key)}
                            className={`rounded-full px-4 py-2 text-sm transition-all ${
                              active
                                ? "bg-gradient-to-r from-amber-500 to-yellow-500 font-semibold text-black"
                                : "text-gray-400 hover:text-white"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Season selector + countdown. Future seasons lock with
                   * a tooltip explaining when they start. */}
                  <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                    <div className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] p-1">
                      {SEASONS.map((season) => {
                        const active = period === season.key;
                        const locked = isSeasonLocked(season.key);
                        const startLabel = season.start.toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        );
                        // Explicit aria-label so screen readers get a clear
                        // phrase instead of "Season 1 lock emoji".
                        const ariaLabel = locked
                          ? `${season.label}, locked — begins ${startLabel}`
                          : season.label;
                        return (
                          <button
                            key={season.key}
                            onClick={() => { if (!locked) { setPeriod(season.key); posthog.capture("leaderboard_category_changed", { season: season.key }); } }}
                            disabled={locked}
                            aria-label={ariaLabel}
                            title={
                              locked
                                ? `${season.label} begins ${startLabel}`
                                : undefined
                            }
                            className={`rounded-full px-4 py-1.5 text-xs font-medium tracking-wider uppercase transition-colors ${
                              active
                                ? "bg-white/[0.1] text-white"
                                : locked
                                  ? "cursor-not-allowed text-neutral-700"
                                  : "text-neutral-500 hover:text-white"
                            }`}
                          >
                            {season.label}
                            {locked && (
                              <span aria-hidden="true"> 🔒</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {nextResetTime ? (
                      <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                        <span className="tracking-wider uppercase">
                          Ends in
                        </span>
                        <span className="font-mono text-white tabular-nums">
                          <CountdownInline targetTime={nextResetTime} />
                        </span>
                      </div>
                    ) : isSeasonEnded(period) ? (
                      <div className="text-[11px] tracking-wider text-neutral-500 uppercase">
                        Season ended
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Top 3 Podium — three equal cards matching airdrop-genesis surface style */}
                {isTop3Loading ? (
                  <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={`podium-skeleton-${i}`}
                        className="flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-4 backdrop-blur-sm"
                      >
                        <div className="h-12 w-12 flex-shrink-0 animate-pulse rounded-full bg-white/[0.08]" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-12 animate-pulse rounded bg-white/[0.08]" />
                          <div className="h-4 w-28 animate-pulse rounded bg-white/[0.08]" />
                          <div className="h-3 w-20 animate-pulse rounded bg-white/[0.08]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {!isTop3Loading && top3Data.length >= 3 && (
                  <div
                    className={`mb-6 grid grid-cols-1 gap-4 transition-all delay-200 duration-700 md:grid-cols-3 ${
                      mounted
                        ? "translate-y-0 opacity-100"
                        : "translate-y-4 opacity-0"
                    }`}
                  >
                    {[0, 1, 2].map((podiumIdx) => {
                      const entry = top3Data[podiumIdx];
                      if (!entry) return null;
                      // Renamed from `position` to avoid shadowing the outer
                      // `position` from useLeaderboardPageData which is read
                      // in the Your Position bar below.
                      const podiumRank = podiumIdx + 1;
                      const isFirst = podiumRank === 1;
                      const displayName = entry.userName || "User";
                      const initial = (displayName[0] || "?").toUpperCase();
                      const value = getEntryValue(entry);
                      const rankLabel =
                        podiumRank === 1
                          ? "1st"
                          : podiumRank === 2
                            ? "2nd"
                            : "3rd";
                      const rankAccent =
                        podiumRank === 1
                          ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
                          : podiumRank === 2
                            ? "text-neutral-300 bg-white/[0.04] border-white/[0.12]"
                            : "text-amber-700 bg-amber-900/15 border-amber-800/30";

                      return (
                        <div
                          // Key MUST namespace by entityType because a bot
                          // and a real user can share the same numeric id.
                          key={`${entry.entityType}-${entry.userId}`}
                          className={`flex items-center gap-4 rounded-xl border px-5 py-4 backdrop-blur-sm ${
                            isFirst
                              ? "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.08] via-white/[0.04] to-transparent"
                              : "border-white/[0.08] bg-white/[0.06]"
                          }`}
                        >
                          <div
                            className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br text-base font-bold ${avatarGradient(
                              displayName,
                            )}`}
                          >
                            {initial}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold tracking-wider uppercase ${rankAccent}`}
                              >
                                {rankLabel}
                              </span>
                              {isFirst && (
                                <GiTrophy className="h-3.5 w-3.5 text-amber-400" />
                              )}
                            </div>
                            <div className="truncate text-sm font-semibold text-white">
                              @{displayName}
                            </div>
                            <div
                              className={`font-mono text-[13px] tabular-nums ${getValueColor(value)}`}
                            >
                              {formatValue(value)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Full Standings */}
                <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm">
                  {/* Toolbar */}
                  <div className="flex flex-col gap-3 border-b border-white/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-bold text-white">Top 10</h2>
                      <p className="text-[11px] text-neutral-500">
                        Updates every 5 min
                      </p>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <FiSearch className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
                      <input
                        type="text"
                        placeholder="Search trader…"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        aria-label="Search traders by name"
                        className="w-full rounded-full border border-white/[0.08] bg-white/[0.04] py-2 pr-4 pl-9 text-[12px] text-white placeholder-neutral-500 focus:border-white/[0.2] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Column headers */}
                  <div className="grid grid-cols-[48px_1fr_auto] items-center gap-4 border-b border-white/[0.06] px-5 py-2.5 text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">
                    <div>Rank</div>
                    <div>Trader</div>
                    <div className="text-right">{categoryLabel}</div>
                  </div>

                  {/* Rows */}
                  <div>
                    {isLeaderboardError ? (
                      // Error state — surfaces the query failure with a retry
                      // affordance rather than a silent empty list.
                      <div className="px-5 py-12 text-center">
                        <FiAlertCircle className="mx-auto mb-3 h-6 w-6 text-rose-400" />
                        <p className="text-sm text-white">
                          Couldn&apos;t load the leaderboard.
                        </p>
                        <p className="mt-1 text-[12px] text-neutral-500">
                          {(leaderboard.error as Error | null)?.message ??
                            "Please try again."}
                        </p>
                        <button
                          onClick={() => leaderboard.refetch()}
                          className="mt-4 rounded-full border border-white/[0.12] bg-white/[0.06] px-4 py-1.5 text-[12px] font-medium text-white hover:bg-white/[0.1]"
                        >
                          Retry
                        </button>
                      </div>
                    ) : isInitialLoading ? (
                      // Skeleton rows while the first request is in flight.
                      Array.from({ length: 8 }).map((_, idx) => (
                        <div
                          key={`skeleton-${idx}`}
                          className="grid grid-cols-[48px_1fr_auto] items-center gap-4 border-b border-white/[0.04] px-5 py-3"
                        >
                          <div className="h-3 w-6 animate-pulse rounded bg-white/[0.06]" />
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 animate-pulse rounded-full bg-white/[0.06]" />
                            <div className="h-3 w-32 animate-pulse rounded bg-white/[0.06]" />
                          </div>
                          <div className="ml-auto h-3 w-16 animate-pulse rounded bg-white/[0.06]" />
                        </div>
                      ))
                    ) : leaderboardEntries.length > 0 ? (
                      leaderboardEntries.slice(0, TOP_N).map((entry, idx) => {
                        const pos = idx + 1;
                        const displayName = entry.userName || "User";
                        const initial = (displayName[0] || "?").toUpperCase();
                        const value = getEntryValue(entry);
                        const isPodium = pos <= 3;

                        return (
                          <div
                            // Namespace by entityType so a bot and a real
                            // user that share the same numeric id don't
                            // collide in the React reconciler.
                            key={`${entry.entityType}-${entry.userId}`}
                            className="grid grid-cols-[48px_1fr_auto] items-center gap-4 border-b border-white/[0.04] px-5 py-3 transition-colors hover:bg-white/[0.03]"
                          >
                            <div
                              className={`font-mono text-[13px] tabular-nums ${
                                isPodium
                                  ? "font-semibold text-amber-400"
                                  : "text-neutral-500"
                              }`}
                            >
                              #{pos}
                            </div>

                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br text-[11px] font-bold ${avatarGradient(
                                  displayName,
                                )}`}
                              >
                                {initial}
                              </div>
                              <span className="truncate text-[13px] font-medium text-white">
                                @{displayName}
                              </span>
                            </div>

                            <div
                              className={`text-right font-mono text-[13px] font-semibold tabular-nums ${getValueColor(
                                value,
                              )}`}
                            >
                              {formatValue(value)}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-5 py-12 text-center text-sm text-neutral-500">
                        {debouncedSearch
                          ? `No traders match "${debouncedSearch}".`
                          : "No traders found."}
                      </div>
                    )}
                  </div>
                </div>

                {/* Your Position — only shown when the user is OUTSIDE top 10
                    (or unranked). Users who are already in the top 10 see
                    their row inline above and don't need a duplicate below.
                    Tri-state:
                    • loading  → skeleton pulse
                    • ranked (rank > 10) → #rank + name + value
                    • unranked → "Unranked" label + category-specific hint */}
                {user &&
                  (() => {
                    const isPositionLoading =
                      position.isLoading && !position.data;
                    const userRank = position.data?.position ?? null;
                    const hasRank = userRank !== null;
                    // Narrow without a non-null assertion — TS follows the
                    // `userRank !== null` check and narrows to `number`.
                    const isInTopN = userRank !== null && userRank <= TOP_N;

                    if (isInTopN) return null;

                    const unrankedHint = {
                      points: "Start trading to earn your first Credits",
                      pnl: "Close a position to appear on the PnL board",
                      volume: "Start trading to appear on the Volume board",
                    }[type];

                    return (
                      <div className="mt-4 mb-6 flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-5 py-4 backdrop-blur-sm">
                        <div className="flex min-w-0 items-center gap-4">
                          {isPositionLoading ? (
                            <div className="h-9 w-9 animate-pulse rounded-full border border-white/[0.08] bg-white/[0.04]" />
                          ) : hasRank ? (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/15 text-xs font-semibold text-amber-400 tabular-nums">
                              #{userRank}
                            </div>
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.04] text-[13px] font-semibold text-neutral-500">
                              —
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">
                              {hasRank ? "Your Position" : "Unranked"}
                            </div>
                            {isPositionLoading ? (
                              <div className="mt-1 h-4 w-28 animate-pulse rounded bg-white/[0.06]" />
                            ) : hasRank ? (
                              <div className="text-sm font-semibold text-white">
                                @{user.name || "You"}
                              </div>
                            ) : (
                              <>
                                <div className="text-sm font-semibold text-white">
                                  @{user.name || "You"}
                                </div>
                                <div className="mt-0.5 truncate text-[11px] text-neutral-400">
                                  {unrankedHint}
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">
                            {categoryLabel}
                          </div>
                          {isPositionLoading ? (
                            <div className="mt-1 ml-auto h-5 w-20 animate-pulse rounded bg-white/[0.06]" />
                          ) : hasRank ? (
                            <div
                              className={`font-mono text-base font-semibold tabular-nums ${getValueColor(
                                position.data?.value ?? 0,
                              )}`}
                            >
                              {formatValue(position.data?.value ?? 0)}
                            </div>
                          ) : (
                            <div className="font-mono text-base font-semibold text-neutral-500 tabular-nums">
                              —
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                {/* FAQs */}
                <div className="mt-16 mb-6">
                  <div className="mb-3">
                    <h2 className="text-sm font-bold text-white">FAQs</h2>
                    <p className="text-[11px] text-neutral-500">
                      More Questions?{" "}
                      <a
                        href="#"
                        className="text-neutral-300 underline hover:text-white"
                      >
                        Chat with Support
                      </a>{" "}
                      or{" "}
                      <a
                        href="/airdrop-genesis"
                        className="text-neutral-300 underline hover:text-white"
                      >
                        View Airdrop Genesis
                      </a>
                    </p>
                  </div>

                  <div>
                    <FAQItem
                      question="How does the leaderboard work?"
                      answer="The leaderboard ranks traders by three metrics: Points (earned through trading and quests), Realized PnL (profit or loss from closed positions), and Volume (total USD traded). Rankings reset daily at 00:00 UTC for the Daily board and on the 1st of each month for the Monthly board. Lifetime totals never reset."
                    />
                    <FAQItem
                      question="Can I hide my username?"
                      answer="Yes. Enable anonymous mode in your Airdrop Genesis settings and your username will display as ••••••• on the leaderboard while your stats still count."
                    />
                    <FAQItem
                      question="How often does it update?"
                      answer="The leaderboard rebuilds every five minutes. Your latest trades will appear within a few minutes of being recorded."
                    />
                  </div>
                </div>
              </main>

              <div className="relative z-10">
                <Footer />
              </div>
            </div>
          </div>
        </DockedPanelMarginWrapper>
      </div>
    </>
  );
}
