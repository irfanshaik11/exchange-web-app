// src/components/perpetuals/PerpMarketSwitcher.tsx
// Clickable symbol block for the perp trade header: icon + name + chevron that
// opens a searchable market table (Axiom-style) covering EVERY market — main
// crypto perps and all HIP-3 builder DEXs (oil/gold/stocks/FX/pre-IPO).
// Favorites persist in localStorage and sort first.

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { useHyperliquid } from "../../contexts/HyperliquidContext";
import type { HyperliquidMarketRow } from "../../utils/hyperliquidTypes";
import CoinIcon from "./CoinIcon";

import { AX } from "./perpTheme";
import { loadFavorites, saveFavorites } from "./favorites";

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatPrice(value: number): string {
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (value >= 1) return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return value.toPrecision(4);
}

interface PerpMarketSwitcherProps {
  /** The currently displayed market (full name, e.g. "BTC" or "km:USOIL"). */
  market: HyperliquidMarketRow;
}

export default function PerpMarketSwitcher({ market }: PerpMarketSwitcherProps) {
  const router = useRouter();
  const { markets } = useHyperliquid();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites());
  // The header strip is overflow-x-auto, which clips absolute children — the
  // panel renders position:fixed, anchored to the trigger's rect on open.
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const toggleOpen = useCallback(() => {
    setOpen((v) => {
      if (!v && rootRef.current) {
        const r = rootRef.current.getBoundingClientRect();
        setPanelPos({
          top: r.bottom + 8,
          left: Math.max(8, Math.min(r.left, window.innerWidth - Math.min(window.innerWidth * 0.92, 980) - 8)),
        });
      }
      return !v;
    });
  }, []);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Autofocus search when opening
  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setSearch("");
  }, [open]);

  const toggleFavorite = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation(); // don't navigate when starring
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      saveFavorites(next);
      return next;
    });
  }, []);

  const rows = useMemo(() => {
    let list = markets;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.displaySymbol || "").toLowerCase().includes(q) ||
          (m.dex || "").toLowerCase().includes(q)
      );
    }
    // Favorites first, then 24h volume desc
    return [...list].sort((a, b) => {
      const favA = favorites.has(a.name) ? 1 : 0;
      const favB = favorites.has(b.name) ? 1 : 0;
      if (favA !== favB) return favB - favA;
      return b.volume24h - a.volume24h;
    });
  }, [markets, search, favorites]);

  const selectMarket = useCallback(
    (m: HyperliquidMarketRow) => {
      setOpen(false);
      if (m.name !== market.name) {
        router.push(`/perpetuals/${encodeURIComponent(m.name)}`);
      }
    },
    [router, market.name]
  );

  const displayName = market.displaySymbol || market.name;

  return (
    <div ref={rootRef} className="relative min-w-fit">
      {/* ── Trigger: icon + symbol + chevron ── */}
      <button
        onClick={toggleOpen}
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors cursor-pointer hover:bg-white/[0.05]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <CoinIcon coin={market.name} size={28} />
        <span className="text-[14px] font-bold sm:text-[16px]" style={{ color: AX.text }}>
          {displayName}-PERP
        </span>
        {market.dex && (
          <span
            className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{ color: AX.muted, backgroundColor: AX.surface2 }}
          >
            {market.dex}
          </span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke={AX.muted}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* ── Dropdown panel (fixed: escapes the overflow-x-auto header strip) ── */}
      {open && (
        <div
          className="fixed z-50 rounded-xl shadow-2xl overflow-hidden"
          style={{
            top: panelPos.top,
            left: panelPos.left,
            width: "min(92vw, 980px)",
            backgroundColor: AX.surface,
            border: `1px solid ${AX.border}`,
          }}
        >
          {/* Search */}
          <div className="p-3">
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}` }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={AX.muted} strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search coins…"
                className="w-full bg-transparent outline-none text-[13px]"
                style={{ color: AX.text }}
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
            <table className="min-w-full text-[12px]">
              <thead>
                <tr
                  className="text-[10px] uppercase tracking-wide sticky top-0"
                  style={{ color: AX.mutedDim, backgroundColor: AX.surface }}
                >
                  <th className="text-left px-4 py-2 font-medium">Token</th>
                  <th className="text-right px-4 py-2 font-medium">Last Price</th>
                  <th className="text-right px-4 py-2 font-medium">24h Change</th>
                  <th className="text-right px-4 py-2 font-medium">8h Funding</th>
                  <th className="text-right px-4 py-2 font-medium">24h Volume</th>
                  <th className="text-right px-4 py-2 font-medium">Open Interest</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center" style={{ color: AX.muted }}>
                      No markets match “{search}”
                    </td>
                  </tr>
                ) : (
                  rows.map((m) => {
                    const isFav = favorites.has(m.name);
                    const isCurrent = m.name === market.name;
                    const changeColor = m.change24hPct >= 0 ? AX.green : AX.red;
                    return (
                      <tr
                        key={m.name}
                        onClick={() => selectMarket(m)}
                        className="cursor-pointer transition-colors hover:bg-white/[0.05]"
                        style={{
                          borderTop: `1px solid ${AX.border}`,
                          backgroundColor: isCurrent ? "rgba(255,255,255,0.04)" : "transparent",
                        }}
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => toggleFavorite(m.name, e)}
                              className="cursor-pointer transition-opacity hover:opacity-80"
                              aria-label={isFav ? "Unfavorite" : "Favorite"}
                            >
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill={isFav ? "#F5C518" : "none"}
                                stroke={isFav ? "#F5C518" : AX.mutedDim}
                                strokeWidth="2"
                              >
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                            </button>
                            <CoinIcon coin={m.name} size={22} />
                            <span className="font-semibold" style={{ color: AX.text }}>
                              {m.displaySymbol || m.name}
                            </span>
                            {m.dex && (
                              <span
                                className="text-[9px] uppercase px-1 py-0.5 rounded"
                                style={{ color: AX.mutedDim, backgroundColor: AX.surface2 }}
                              >
                                {m.dex}
                              </span>
                            )}
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{ color: AX.muted, backgroundColor: AX.surface2 }}
                            >
                              {m.maxLeverage}x
                            </span>
                          </div>
                        </td>
                        <td
                          className="px-4 py-2.5 text-right whitespace-nowrap"
                          style={{ color: AX.text, fontVariantNumeric: "tabular-nums" }}
                        >
                          {formatPrice(m.markPx)}
                        </td>
                        <td
                          className="px-4 py-2.5 text-right whitespace-nowrap"
                          style={{ color: changeColor, fontVariantNumeric: "tabular-nums" }}
                        >
                          {m.change24h >= 0 ? "+" : ""}
                          {formatPrice(Math.abs(m.change24h))} / {m.change24hPct >= 0 ? "+" : ""}
                          {m.change24hPct.toFixed(2)}%
                        </td>
                        <td
                          className="px-4 py-2.5 text-right whitespace-nowrap"
                          style={{
                            color: m.funding >= 0 ? AX.green : AX.red,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {(m.funding * 100).toFixed(4)}%
                        </td>
                        <td
                          className="px-4 py-2.5 text-right whitespace-nowrap"
                          style={{ color: AX.text, fontVariantNumeric: "tabular-nums" }}
                        >
                          {formatUsd(m.volume24h)}
                        </td>
                        <td
                          className="px-4 py-2.5 text-right whitespace-nowrap"
                          style={{ color: AX.text, fontVariantNumeric: "tabular-nums" }}
                        >
                          {formatUsd(m.openInterest * m.markPx)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
