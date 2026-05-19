/**
 * Vision Page
 *
 * Surfaces the same KOL leaderboard data as /kol-leaderboard, branded as
 * "Vision" — the top traders worth keeping an eye on. Backed by the same
 * `useKolLeaderboard` hook, which reads from the wallet-tracker backend's
 * `KolLeaderboardRow` table (repopulated every 30 min by the kolscan poller).
 */

import React, { useState } from "react";
import Head from "next/head";
import Header from "~/components/Header";
import Footer from "~/components/Footer";
import { DockedPanelMarginWrapper } from "~/contexts/DockedPanelContext";
import { useKolLeaderboard } from "~/hooks/useKolLeaderboard";
import type { KolTimeframe, KolTraderEntry } from "~/utils/kolApi";
import { FiExternalLink } from "react-icons/fi";
import { FaXTwitter, FaTelegram } from "react-icons/fa6";

const TIMEFRAMES: { key: KolTimeframe; label: string }[] = [
  { key: "DAILY", label: "Daily" },
  { key: "WEEKLY", label: "Weekly" },
  { key: "MONTHLY", label: "Monthly" },
];

function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function formatProfit(value: number): string {
  const abs = Math.abs(value);
  const formatted =
    abs >= 1000
      ? abs.toLocaleString("en-US", { maximumFractionDigits: 1 })
      : abs.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse border-b border-white/[0.04]">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-16 rounded bg-white/[0.06]" />
        </td>
      ))}
    </tr>
  );
}

export default function VisionPage() {
  const [timeframe, setTimeframe] = useState<KolTimeframe>("DAILY");
  const { data, isLoading, isError, refetch } = useKolLeaderboard(timeframe, {
    limit: 1000,
  });

  const entries = data?.entries ?? [];
  const topThree = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <>
      <Head>
        <title>Vision | Interstate</title>
        <meta
          name="description"
          content="Vision — top KOL memecoin traders worth watching, ranked by profit."
        />
      </Head>

      <div className="min-h-screen bg-black">
        <Header />

        <DockedPanelMarginWrapper>
          <div className="p-1 sm:p-1.5">
            <div className="relative min-h-[calc(100vh-80px)] overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0b]">
              <main className="relative z-10 mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6">
                {/* Title */}
                {/* <div className="mb-8 text-center">
                  <h1 className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-300 bg-clip-text text-4xl font-black tracking-tight text-transparent md:text-5xl">
                    VISION
                  </h1>
                  <p className="mt-2 text-sm text-neutral-400">
                    Top KOL traders worth watching — sorted by profit
                  </p>
                </div> */}

                {/* Timeframe pills */}
                <div className="mb-6 flex items-center justify-center">
                  <div className="inline-flex items-center rounded-full bg-[#1a1b1f] p-1">
                    {TIMEFRAMES.map(({ key, label }) => {
                      const active = timeframe === key;
                      return (
                        <button
                          key={key}
                          onClick={() => setTimeframe(key)}
                          className={`rounded-full px-5 py-1.5 text-sm font-medium transition-all ${
                            active
                              ? "bg-white/10 text-white shadow-sm"
                              : "text-neutral-400 hover:text-neutral-200"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Error state */}
                {isError && (
                  <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <p className="text-sm text-neutral-400">
                      Failed to load Vision leaderboard
                    </p>
                    <button
                      onClick={() => refetch()}
                      className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Podium — top 3 highlighted */}
                {!isError && topThree.length > 0 && (
                  <div className="mb-6 grid gap-3 sm:grid-cols-3">
                    {topThree.map((entry) => (
                      <PodiumCard key={entry.walletAddress} entry={entry} />
                    ))}
                  </div>
                )}

                {/* Table */}
                {!isError && (
                  <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-[#111113]">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.08] text-xs text-neutral-500 uppercase">
                          <th className="px-4 py-3 font-medium">Rank</th>
                          <th className="px-4 py-3 font-medium">Trader</th>
                          <th className="px-4 py-3 text-right font-medium">
                            PnL (SOL)
                          </th>
                          <th className="px-4 py-3 text-right font-medium">
                            Win Rate
                          </th>
                          <th className="px-4 py-3 text-right font-medium">
                            Wins
                          </th>
                          <th className="px-4 py-3 text-right font-medium">
                            Losses
                          </th>
                          <th className="px-4 py-3 text-center font-medium">
                            Socials
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {isLoading && entries.length === 0
                          ? Array.from({ length: 10 }).map((_, i) => (
                              <SkeletonRow key={i} />
                            ))
                          : rest.map((entry) => (
                              <TraderRow key={entry.walletAddress} entry={entry} />
                            ))}
                        {!isLoading && entries.length === 0 && (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-4 py-12 text-center text-neutral-500"
                            >
                              No data available — the poller may not have run yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Source attribution */}
                <p className="mt-4 text-center text-xs text-neutral-600">
                  Data sourced from kolscan.io — updated every 30 minutes
                </p>
              </main>
            </div>
          </div>
        </DockedPanelMarginWrapper>

        <Footer />
      </div>
    </>
  );
}

function PodiumCard({ entry }: { entry: KolTraderEntry }) {
  const profitColor =
    entry.profit >= 0 ? "text-emerald-400" : "text-rose-400";
  const rankAccent =
    entry.rank === 1
      ? "border-amber-400/50 bg-gradient-to-br from-amber-500/[0.08] to-transparent"
      : entry.rank === 2
        ? "border-neutral-400/40 bg-gradient-to-br from-neutral-400/[0.06] to-transparent"
        : "border-amber-700/40 bg-gradient-to-br from-amber-800/[0.06] to-transparent";

  return (
    <div
      className={`rounded-xl border ${rankAccent} p-4 transition-colors hover:bg-white/[0.02]`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-2xl font-black ${
            entry.rank === 1
              ? "text-amber-400"
              : entry.rank === 2
                ? "text-neutral-300"
                : "text-amber-700"
          }`}
        >
          #{entry.rank}
        </span>
        <div className="flex gap-2">
          {entry.twitter && (
            <a
              href={entry.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-500 hover:text-white"
            >
              <FaXTwitter className="h-4 w-4" />
            </a>
          )}
          {entry.telegram && (
            <a
              href={entry.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-500 hover:text-sky-400"
            >
              <FaTelegram className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
      <div className="mt-2 truncate font-semibold text-white">{entry.name}</div>
      <a
        href={`https://solscan.io/account/${entry.walletAddress}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300"
      >
        {truncateAddress(entry.walletAddress)}
        <FiExternalLink className="h-3 w-3" />
      </a>
      <div className={`mt-3 font-mono text-lg font-bold ${profitColor}`}>
        {formatProfit(entry.profit)} SOL
      </div>
      <div className="mt-1 text-xs text-neutral-500">
        {entry.winRate.toFixed(1)}% win rate · {entry.wins}W / {entry.losses}L
      </div>
    </div>
  );
}

function TraderRow({ entry }: { entry: KolTraderEntry }) {
  const profitColor =
    entry.profit >= 0 ? "text-emerald-400" : "text-rose-400";

  return (
    <tr className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]">
      <td className="px-4 py-3 font-medium text-neutral-300">{entry.rank}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-medium text-white">{entry.name}</span>
          <a
            href={`https://solscan.io/account/${entry.walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300"
          >
            {truncateAddress(entry.walletAddress)}
            <FiExternalLink className="h-3 w-3" />
          </a>
        </div>
      </td>
      <td
        className={`px-4 py-3 text-right font-mono font-medium ${profitColor}`}
      >
        {formatProfit(entry.profit)} SOL
      </td>
      <td className="px-4 py-3 text-right text-neutral-300">
        {entry.winRate.toFixed(1)}%
      </td>
      <td className="px-4 py-3 text-right text-emerald-400/80">{entry.wins}</td>
      <td className="px-4 py-3 text-right text-rose-400/80">{entry.losses}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-2">
          {entry.twitter && (
            <a
              href={entry.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-500 hover:text-white"
            >
              <FaXTwitter className="h-3.5 w-3.5" />
            </a>
          )}
          {entry.telegram && (
            <a
              href={entry.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-500 hover:text-sky-400"
            >
              <FaTelegram className="h-3.5 w-3.5" />
            </a>
          )}
          {!entry.twitter && !entry.telegram && (
            <span className="text-neutral-700">—</span>
          )}
        </div>
      </td>
    </tr>
  );
}
