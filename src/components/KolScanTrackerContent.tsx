/**
 * KOLScan tracker panel — compact KOL leaderboard for the Trackers page's
 * social sidebar. Same data as the standalone /vision page (the
 * `useKolLeaderboard` hook → wallet-tracker backend's /api/kol-leaderboard),
 * laid out narrow to fit alongside the X and Telegram trackers.
 */

import React, { useState } from "react";
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
    <div className="flex animate-pulse items-center gap-3 border-b border-white/[0.04] px-1 py-2.5">
      <div className="h-4 w-5 rounded bg-white/[0.06]" />
      <div className="h-4 flex-1 rounded bg-white/[0.06]" />
      <div className="h-4 w-16 rounded bg-white/[0.06]" />
    </div>
  );
}

function rankColor(rank: number): string {
  if (rank === 1) return "text-amber-400";
  if (rank === 2) return "text-neutral-300";
  if (rank === 3) return "text-amber-700";
  return "text-[#71717a]";
}

function TraderRow({ entry }: { entry: KolTraderEntry }) {
  const profitColor = entry.profit >= 0 ? "text-emerald-400" : "text-rose-400";

  return (
    <div className="flex items-center gap-3 border-b border-white/[0.04] px-1 py-2.5 transition-colors hover:bg-white/[0.02]">
      <span
        className={`w-5 shrink-0 text-center text-sm font-bold ${rankColor(
          entry.rank,
        )}`}
      >
        {entry.rank}
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-[#f4f4f5]">
          {entry.name}
        </span>
        <a
          href={`https://solscan.io/account/${entry.walletAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-[#71717a] hover:text-[#a1a1aa]"
        >
          {truncateAddress(entry.walletAddress)}
          <FiExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span className={`font-mono text-sm font-semibold ${profitColor}`}>
          {formatProfit(entry.profit)}
        </span>
        <span className="text-[10px] text-[#71717a]">
          {entry.winRate.toFixed(0)}% · {entry.wins}W/{entry.losses}L
        </span>
      </div>

      <div className="flex w-8 shrink-0 items-center justify-end gap-1.5">
        {entry.twitter && (
          <a
            href={entry.twitter}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#52525b] hover:text-white"
          >
            <FaXTwitter className="h-3 w-3" />
          </a>
        )}
        {entry.telegram && (
          <a
            href={entry.telegram}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#52525b] hover:text-sky-400"
          >
            <FaTelegram className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function KolScanTrackerContent() {
  const [timeframe, setTimeframe] = useState<KolTimeframe>("DAILY");
  const { data, isLoading, isError, refetch } = useKolLeaderboard(timeframe, {
    limit: 1000,
  });

  const entries = data?.data.entries ?? [];

  return (
    <>
      {/* Timeframe pills */}
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] pt-2.5 pb-2.5 sm:pt-3 sm:pb-3">
        {TIMEFRAMES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTimeframe(key)}
            className={`cursor-pointer rounded-md px-2.5 py-1.5 text-[10px] whitespace-nowrap transition-all duration-200 sm:px-3 sm:py-2 sm:text-xs ${
              timeframe === key
                ? "bg-[#18c48c]/10 font-semibold text-[#18c48c]"
                : "font-medium text-[#71717a] hover:bg-white/[0.04] hover:text-[#a1a1aa]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Leaderboard list */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {isError ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-[#a1a1aa]">
              Failed to load KOLScan leaderboard
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
            >
              Retry
            </button>
          </div>
        ) : isLoading && entries.length === 0 ? (
          Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} />)
        ) : entries.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[#71717a]">
            No data available yet
          </div>
        ) : (
          entries.map((entry) => (
            <TraderRow key={entry.walletAddress} entry={entry} />
          ))
        )}
      </div>
    </>
  );
}
