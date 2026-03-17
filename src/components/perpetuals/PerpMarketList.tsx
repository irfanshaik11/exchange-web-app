// src/components/perpetuals/PerpMarketList.tsx
// Sortable market table for Hyperliquid perpetual markets.
// AX color palette, same styling approach as PulseTable.

import React, { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/router";
import type { HyperliquidMarketRow } from "../../utils/hyperliquidTypes";
import CoinIcon from "./CoinIcon";

interface PerpMarketListProps {
  markets: HyperliquidMarketRow[];
  loading: boolean;
}

type SortKey = "name" | "markPx" | "change24hPct" | "volume24h" | "openInterest" | "funding" | "maxLeverage";
type SortDir = "asc" | "desc";

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatPrice(value: number): string {
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toPrecision(4)}`;
}

function formatFunding(rate: number): string {
  return `${(rate * 100).toFixed(4)}%`;
}

export default function PerpMarketList({ markets, loading }: PerpMarketListProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("volume24h");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  const filtered = useMemo(() => {
    let result = markets;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((m) => m.name.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
    return result;
  }, [markets, search, sortKey, sortDir]);

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="px-4 py-3 text-left text-[10px] uppercase tracking-wide font-light cursor-pointer hover:opacity-80 select-none transition-opacity"
      style={{ color: '#787a8d', fontWeight: 300 }}
      onClick={() => handleSort(field)}
    >
      {label}
      {sortKey === field && (
        <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>
      )}
    </th>
  );

  return (
    <div className="w-full">
      {/* Search bar */}
      <div className="px-4 pt-4 pb-3 sm:px-6 lg:px-8">
        <input
          type="text"
          placeholder="Search markets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm px-3 py-2 bg-white/[0.05] border border-white/[0.08] rounded-lg text-[13px] text-white placeholder-[#6B7280] focus:outline-none focus:border-[#70E0B0]/50 transition-colors"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr style={{ backgroundColor: 'transparent', borderBottom: '1px solid #2A2B33' }}>
              <SortHeader label="Market" field="name" />
              <SortHeader label="Price" field="markPx" />
              <SortHeader label="24h Change" field="change24hPct" />
              <SortHeader label="24h Vol" field="volume24h" />
              <SortHeader label="Open Interest" field="openInterest" />
              <SortHeader label="Funding" field="funding" />
              <SortHeader label="Leverage" field="maxLeverage" />
            </tr>
          </thead>
          <tbody>
            {loading && markets.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[#9CA3AF] text-[13px]">
                  Loading markets...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[#9CA3AF] text-[13px]">
                  No markets found
                </td>
              </tr>
            ) : (
              filtered.map((market) => (
                <tr
                  key={market.name}
                  className="hover:bg-white/[0.04] cursor-pointer transition-colors"
                  style={{ backgroundColor: 'transparent', borderBottom: '1px solid #2A2B33' }}
                  onClick={() => router.push(`/perpetuals/${market.name}`)}
                >
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <CoinIcon coin={market.name} size={32} />
                      <div className="flex flex-col">
                        <span className="text-white font-semibold text-[14px]">{market.name}</span>
                        <span className="text-[#6B7280] text-[10px]">PERP</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-[13px] text-white font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatPrice(market.markPx)}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span
                      className={
                        market.change24hPct >= 0 ? "text-[#86d99f]" : "text-[#f26682]"
                      }
                    >
                      {market.change24hPct >= 0 ? "+" : ""}
                      {market.change24hPct.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-[13px] text-[#C9CDD3]" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatUsd(market.volume24h)}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-[13px] text-[#C9CDD3]" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatUsd(market.openInterest * market.markPx)}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span
                      className={
                        market.funding >= 0 ? "text-[#86d99f]" : "text-[#f26682]"
                      }
                    >
                      {formatFunding(market.funding)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-[13px] text-[#C9CDD3] font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {market.maxLeverage}x
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
