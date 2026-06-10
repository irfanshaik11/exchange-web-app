// src/components/perpetuals/PerpMarketList.tsx
// Sortable market table for Hyperliquid perpetual markets.
// AX color palette, same styling approach as PulseTable.

import React, { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/router";
import type { HyperliquidMarketRow } from "../../utils/hyperliquidTypes";
import CoinIcon from "./CoinIcon";
import { loadFavorites, saveFavorites } from "./favorites";

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
  // Trim trailing zeros ("$88.5220" → "$88.522")
  if (value >= 1) return `$${value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
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
  const [dexFilter, setDexFilter] = useState<string>("all"); // "all" | "main" | dex name
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites());

  const toggleFavorite = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation(); // star click must not navigate
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      saveFavorites(next);
      return next;
    });
  }, []);

  // Builder DEXs discovered from the market rows (HIP-3: commodities/FX/equities/…)
  const dexNames = useMemo(() => {
    const names = new Set<string>();
    markets.forEach((m) => { if (m.dex) names.add(m.dex); });
    return Array.from(names).sort();
  }, [markets]);

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
    let result = [...markets]; // copy — .sort() below must not mutate the hook's array
    if (dexFilter === "main") {
      result = result.filter((m) => !m.dex);
    } else if (dexFilter !== "all") {
      result = result.filter((m) => m.dex === dexFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.displaySymbol || "").toLowerCase().includes(q)
      );
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
    // Pin favorites to the top, keeping the chosen sort within each group
    // (same behavior as the trade-header market switcher).
    return [
      ...result.filter((m) => favorites.has(m.name)),
      ...result.filter((m) => !favorites.has(m.name)),
    ];
  }, [markets, search, sortKey, sortDir, dexFilter, favorites]);

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="px-4 py-3 text-left text-[11px] uppercase tracking-wide font-medium cursor-pointer hover:text-white select-none transition-colors"
      style={{ color: '#a1a1aa' }}
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
          className="w-full max-w-sm px-3 py-2 bg-white/[0.05] border border-white/[0.08] rounded-lg text-[13px] text-white placeholder-[#71717a] focus:outline-none focus:border-[#18c48c]/50 transition-colors"
        />
      </div>

      {/* DEX filter chips (HIP-3 builder DEXs: commodities, FX, equities, …) */}
      {dexNames.length > 0 && (
        <div className="px-4 pb-3 sm:px-6 lg:px-8 flex flex-wrap items-center gap-1.5">
          {[
            { key: "all", label: "All" },
            { key: "main", label: "Crypto" },
            ...dexNames.map((d) => ({ key: d, label: d.toUpperCase() })),
          ].map((chip) => (
            <button
              key={chip.key}
              onClick={() => setDexFilter(chip.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                dexFilter === chip.key
                  ? "bg-[#18c48c]/10 text-[#18c48c] border border-[#18c48c]/30"
                  : "bg-white/[0.03] text-[#a1a1aa] border border-transparent hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr style={{ backgroundColor: 'transparent', borderBottom: '1px solid #1f2127' }}>
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
                <td colSpan={7} className="px-4 py-12 text-center text-[#a1a1aa] text-[13px]">
                  Loading markets...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[#a1a1aa] text-[13px]">
                  No markets found
                </td>
              </tr>
            ) : (
              filtered.map((market) => (
                <tr
                  key={market.name}
                  className="hover:bg-white/[0.04] cursor-pointer transition-colors"
                  style={{ backgroundColor: 'transparent', borderBottom: '1px solid #1f2127' }}
                  onClick={() => router.push(`/perpetuals/${encodeURIComponent(market.name)}`)}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={(e) => toggleFavorite(market.name, e)}
                        className="cursor-pointer transition-opacity hover:opacity-80 flex-shrink-0"
                        aria-label={favorites.has(market.name) ? "Unfavorite" : "Favorite"}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill={favorites.has(market.name) ? "#F5C518" : "none"}
                          stroke={favorites.has(market.name) ? "#F5C518" : "#52525b"}
                          strokeWidth="2"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                      <CoinIcon coin={market.name} size={28} />
                      <div className="flex flex-col">
                        <span className="text-white font-semibold text-[14px]">
                          {market.displaySymbol || market.name}
                        </span>
                        <span className="text-[#71717a] text-[10px]">
                          {market.dex ? `${market.dex.toUpperCase()} · PERP` : "PERP"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-[13px] text-white font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatPrice(market.markPx)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span
                      className={`font-semibold ${
                        market.change24hPct >= 0 ? "text-[#18c48c]" : "text-[#ef4444]"
                      }`}
                    >
                      {market.change24hPct >= 0 ? "+" : ""}
                      {market.change24hPct.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-[13px] text-[#f4f4f5] font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatUsd(market.volume24h)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-[13px] text-[#f4f4f5] font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatUsd(market.openInterest * market.markPx)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span
                      className={`font-medium ${
                        market.funding >= 0 ? "text-[#18c48c]" : "text-[#ef4444]"
                      }`}
                    >
                      {formatFunding(market.funding)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-[13px] text-[#f4f4f5] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
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
