import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { FaTimes } from "react-icons/fa";
import { BiRefresh } from "react-icons/bi";
import type { PulseFilters } from "~/contexts/PulseFiltersContext";

// ── Color constants (Axiom-style dark theme) ──
const AX = {
  surface: "#0c0e12",
  surfaceAlt: "#080a0d",
  border: "#1a1c22",
  borderHover: "#2a2d36",
  text: "#f4f4f5",
  textMuted: "#71717a",
  textDim: "#52525b",
  accent: "#18c48c",
  accentGlow: "rgba(24, 196, 140, 0.25)",
  accentDim: "rgba(24, 196, 140, 0.1)",
  purple: "#7c3aed",
  purpleGlow: "rgba(124, 58, 237, 0.25)",
};

// ── Protocol data ──
const protocols = [
  { name: "All", icon: <span className="text-sm">🌐</span>, color: "#9333ea" },
  {
    name: "Pump",
    icon: (
      <Image
        src="/pump.svg"
        alt="Pump"
        width={16}
        height={16}
        className="rounded-full"
      />
    ),
    color: "#31e3ac",
  },
  {
    name: "Pump AMM",
    icon: (
      <Image
        src="/pump.svg"
        alt="Pump AMM"
        width={16}
        height={16}
        className="rounded-full"
        style={{ filter: "hue-rotate(30deg) brightness(1.2)" }}
      />
    ),
    color: "#22c993",
  },
  {
    name: "Bonk",
    icon: (
      <div
        className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-xs font-bold"
        style={{ color: "#f0f5f5" }}
      >
        B
      </div>
    ),
    color: "#ff6b35",
  },
  {
    name: "Bags",
    icon: (
      <Image
        src="https://bags.fm/assets/images/bags-icon.png"
        alt="Bags"
        width={16}
        height={16}
        className="rounded-full"
      />
    ),
    color: "#31e3ac",
  },
  {
    name: "Moonit",
    icon: (
      <Image
        src="/moonit.svg"
        alt="Moonit"
        width={16}
        height={16}
        className="rounded-full"
      />
    ),
    color: "#fbbf24",
  },
  {
    name: "Boop",
    icon: (
      <Image
        src="https://s2.coinmarketcap.com/static/img/coins/64x64/36393.png"
        alt="Boop"
        width={16}
        height={16}
        className="rounded-full"
      />
    ),
    color: "#3b82f6",
  },
  {
    name: "LaunchLab",
    icon: (
      <Image
        src="https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png"
        alt="LaunchLab"
        width={16}
        height={16}
        className="rounded-full"
        style={{ filter: "hue-rotate(180deg) saturate(2) brightness(1.1)" }}
      />
    ),
    color: "#3b82f6",
  },
  {
    name: "Raydium",
    icon: (
      <div
        className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-500 text-xs font-bold"
        style={{ color: "#f0f5f5" }}
      >
        R
      </div>
    ),
    color: "#6b7280",
  },
  {
    name: "Meteora AMM",
    icon: (
      <Image
        src="/meteora.svg"
        alt="Meteora"
        width={16}
        height={16}
        className="rounded-full"
      />
    ),
    color: "#92400e",
  },
  {
    name: "Meteora AMM V2",
    icon: (
      <Image
        src="/meteora.svg"
        alt="Meteora V2"
        width={16}
        height={16}
        className="rounded-full"
      />
    ),
    color: "#a16207",
  },
];

// ── Quote token data ──
const quoteTokens = [
  {
    name: "SOL",
    icon: (
      <div
        className="flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold"
        style={{ backgroundColor: "#31e3ac", color: "#f0f5f5" }}
      >
        S
      </div>
    ),
    color: "#31e3ac",
  },
  {
    name: "USDC",
    icon: (
      <div
        className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-xs font-bold"
        style={{ color: "#f0f5f5" }}
      >
        U
      </div>
    ),
    color: "#06b6d4",
  },
  {
    name: "USD1",
    icon: (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500 text-xs font-bold text-black">
        1
      </span>
    ),
    color: "#fbbf24",
  },
];

// ── Shared input style (Axiom-style) ──
const inputStyle: React.CSSProperties = {
  backgroundColor: AX.surfaceAlt,
  borderColor: AX.border,
  color: AX.text,
  WebkitAppearance: "none",
  MozAppearance: "textfield" as any,
  outline: "none",
  boxShadow: "none",
  borderRadius: "8px",
};
const onInputFocus = (
  e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>,
) => {
  e.target.style.outline = "none";
  e.target.style.boxShadow = `0 0 0 2px ${AX.accentDim}`;
  e.target.style.borderColor = AX.accent;
};

interface DiscoverFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingFilters: PulseFilters;
  hasPendingChanges: boolean;
  onPendingFilterChange: (
    updater: (prev: PulseFilters) => PulseFilters,
  ) => void;
  onApply: () => void;
  onReset: () => void;
  // DexScreener trending lists tokens that have already broken out (high
  // DEX volume) — by then the 24h Mayhem hot window has expired, so 0% of
  // DexScreener mints carry is_mayhem_mode=true (verified against the live
  // feed × tokens table). Pass `showMayhemChip={false}` on that tab so
  // users don't see a filter that always returns an empty list.
  showMayhemChip?: boolean;
}

/** Reusable Min/Max number input row */
function MinMaxRow({
  label,
  minKey,
  maxKey,
  pendingFilters,
  onChange,
}: {
  label: string;
  minKey: keyof PulseFilters;
  maxKey: keyof PulseFilters;
  pendingFilters: PulseFilters;
  onChange: (updater: (prev: PulseFilters) => PulseFilters) => void;
}) {
  return (
    <div className="space-y-2">
      <label
        className="block text-xs font-semibold tracking-wider uppercase"
        style={{ color: AX.textMuted }}
      >
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Min"
          value={pendingFilters[minKey] as string}
          onChange={(e) =>
            onChange((prev) => ({ ...prev, [minKey]: e.target.value }))
          }
          className="flex-1 rounded-lg border px-3 py-2.5 text-sm transition-all duration-200"
          style={inputStyle}
          onFocus={onInputFocus}
          onBlur={(e) => {
            e.target.style.boxShadow = "none";
            e.target.style.borderColor = AX.border;
          }}
        />
        <input
          type="number"
          placeholder="Max"
          value={pendingFilters[maxKey] as string}
          onChange={(e) =>
            onChange((prev) => ({ ...prev, [maxKey]: e.target.value }))
          }
          className="flex-1 rounded-lg border px-3 py-2.5 text-sm transition-all duration-200"
          style={inputStyle}
          onFocus={onInputFocus}
          onBlur={(e) => {
            e.target.style.boxShadow = "none";
            e.target.style.borderColor = AX.border;
          }}
        />
      </div>
    </div>
  );
}

export default function DiscoverFilterModal({
  isOpen,
  onClose,
  pendingFilters,
  hasPendingChanges,
  onPendingFilterChange,
  onApply,
  onReset,
  showMayhemChip = true,
}: DiscoverFilterModalProps) {
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>("Audit");
  // Snapshot of the user's protocol selection at the moment they enable
  // Mayhem mode. Lets us restore their selection when they toggle Mayhem
  // back off, rather than silently clobbering it to ['All'].
  const preMayhemProtocolsRef = useRef<string[] | null>(null);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 backdrop-blur-sm"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.6)", zIndex: 10000000 }}
        onClick={onClose}
      />

      {/* Modal - Axiom style */}
      <div
        className="filter-modal fixed top-1/2 left-1/2 flex max-h-[90vh] w-[95vw] max-w-[600px] -translate-x-1/2 -translate-y-1/2 transform flex-col overflow-hidden rounded-xl border shadow-2xl"
        style={{
          backgroundColor: AX.surface,
          borderColor: AX.border,
          boxShadow: `0 25px 80px rgba(0, 0, 0, 0.6), 0 0 1px ${AX.accent}20`,
          zIndex: 10000001,
        }}
      >
        {/* Header - Axiom style */}
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: AX.border, backgroundColor: AX.surfaceAlt }}
        >
          <h3
            className="text-base font-semibold"
            style={{ color: AX.text, letterSpacing: "0.02em" }}
          >
            Filters
          </h3>
          <div className="flex items-center gap-2">
            <button
              className="cursor-pointer rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.05]"
              onClick={onReset}
              title="Reset filters"
            >
              <BiRefresh className="h-4 w-4" style={{ color: AX.textMuted }} />
            </button>
            <button
              onClick={onClose}
              className="cursor-pointer rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.05]"
            >
              <FaTimes size={14} style={{ color: AX.textMuted }} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div
          className="max-h-[500px] overflow-y-auto p-5"
          style={{ backgroundColor: AX.surface }}
        >
          {/* ── Protocols - Axiom style ── */}
          <div className="mb-5">
            <div className="mb-3 flex items-center justify-between">
              <h4
                className="text-xs font-semibold tracking-wider uppercase"
                style={{ color: AX.textMuted }}
              >
                Protocols
              </h4>
              <button
                className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200"
                style={{
                  backgroundColor: AX.accentDim,
                  color: AX.accent,
                  border: `1px solid ${AX.accent}40`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = AX.accent;
                  e.currentTarget.style.color = "#030304";
                  e.currentTarget.style.boxShadow = `0 0 12px ${AX.accentGlow}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = AX.accentDim;
                  e.currentTarget.style.color = AX.accent;
                  e.currentTarget.style.boxShadow = "none";
                }}
                onClick={() =>
                  onPendingFilterChange((prev) => ({
                    ...prev,
                    protocols: ["All"],
                    // Select All ↔ Mayhem are mutually exclusive: turning All
                    // back on must clear Mayhem, otherwise the result set
                    // stays narrowed to mayhem-flagged tokens only.
                    onlyMayhemMode: false,
                  }))
                }
              >
                Select All
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {protocols.map((protocol) => {
                const selected = pendingFilters.protocols.includes(
                  protocol.name,
                );
                return (
                  <button
                    key={protocol.name}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all duration-200"
                    style={{
                      backgroundColor: selected
                        ? `${protocol.color}15`
                        : "transparent",
                      border: `1.5px solid ${selected ? protocol.color : AX.border}`,
                      color: selected ? protocol.color : AX.textMuted,
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        e.currentTarget.style.borderColor = `${protocol.color}60`;
                        e.currentTarget.style.color = protocol.color;
                        e.currentTarget.style.backgroundColor = `${protocol.color}08`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        e.currentTarget.style.borderColor = AX.border;
                        e.currentTarget.style.color = AX.textMuted;
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                    onClick={() => {
                      onPendingFilterChange((prev) => {
                        // Picking any protocol (including All) exits Mayhem
                        // mode — protocols and Mayhem are mutually exclusive.
                        if (protocol.name === "All")
                          return {
                            ...prev,
                            protocols: ["All"],
                            onlyMayhemMode: false,
                          };
                        if (prev.protocols.includes(protocol.name)) {
                          const remaining = prev.protocols.filter(
                            (p) => p !== protocol.name && p !== "All",
                          );
                          return {
                            ...prev,
                            protocols:
                              remaining.length === 0 ? ["All"] : remaining,
                            onlyMayhemMode: false,
                          };
                        }
                        const withoutAll = prev.protocols.filter(
                          (p) => p !== "All",
                        );
                        return {
                          ...prev,
                          protocols: [...withoutAll, protocol.name],
                          onlyMayhemMode: false,
                        };
                      });
                    }}
                  >
                    <span className="text-sm">{protocol.icon}</span>
                    <span className="truncate">{protocol.name}</span>
                  </button>
                );
              })}
              {/* Mayhem Mode chip — clean on/off toggle keyed strictly off
                  `onlyMayhemMode`. Brand red #c83c51 + Mayhem.webp icon match
                  the row treatment in PulseTable so users recognise the same
                  identity. Filter takes effect on Apply All; backend only
                  flags tokens inside the 24h Mayhem hot window.
                  Suppressed entirely on tabs whose data feed never carries
                  the flag (e.g. DexScreener trending) so the user doesn't
                  see a filter that always empties the list. */}
              {showMayhemChip &&
                (() => {
                  const MAYHEM = "#c83c51";
                  const isMayhemActive = pendingFilters.onlyMayhemMode;
                  return (
                    <button
                      key="__mayhem_mode_chip"
                      className="flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all duration-200"
                      style={{
                        backgroundColor: isMayhemActive
                          ? `${MAYHEM}15`
                          : "transparent",
                        border: `1.5px solid ${isMayhemActive ? MAYHEM : AX.border}`,
                        color: isMayhemActive ? MAYHEM : AX.textMuted,
                      }}
                      onMouseEnter={(e) => {
                        if (!isMayhemActive) {
                          e.currentTarget.style.borderColor = `${MAYHEM}60`;
                          e.currentTarget.style.color = MAYHEM;
                          e.currentTarget.style.backgroundColor = `${MAYHEM}08`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isMayhemActive) {
                          e.currentTarget.style.borderColor = AX.border;
                          e.currentTarget.style.color = AX.textMuted;
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                      onClick={() => {
                        onPendingFilterChange((prev) => {
                          const turningOn = !prev.onlyMayhemMode;
                          if (turningOn) {
                            // Snapshot the current protocol selection so a
                            // toggle-off restores it. Without this, a user
                            // who had `Pump` selected and merely sampled
                            // Mayhem would silently lose their Pump filter.
                            preMayhemProtocolsRef.current = prev.protocols;
                            return {
                              ...prev,
                              onlyMayhemMode: true,
                              // Set ["All"] (not []) so every code path that
                              // reads `protocols` sees the conventional
                              // "match-all" sentinel instead of the implicit
                              // length===0 short-circuit.
                              protocols: ["All"],
                            };
                          }
                          const restored = preMayhemProtocolsRef.current ?? [
                            "All",
                          ];
                          preMayhemProtocolsRef.current = null;
                          return {
                            ...prev,
                            onlyMayhemMode: false,
                            protocols: restored,
                          };
                        });
                      }}
                    >
                      <Image
                        src="/Mayhem.webp"
                        alt="Mayhem"
                        width={16}
                        height={16}
                        className="pointer-events-none rounded-full object-cover"
                      />
                      <span className="truncate">Mayhem</span>
                    </button>
                  );
                })()}
            </div>
          </div>

          {/* ── Quote Tokens - Axiom style ── */}
          <div className="mb-5">
            <h4
              className="mb-3 text-xs font-semibold tracking-wider uppercase"
              style={{ color: AX.textMuted }}
            >
              Quote Tokens
            </h4>
            <div className="flex gap-2">
              {quoteTokens.map((token) => {
                const selected = pendingFilters.quoteTokens.includes(
                  token.name,
                );
                return (
                  <button
                    key={token.name}
                    className="flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition-all duration-200"
                    style={{
                      backgroundColor: selected
                        ? `${token.color}15`
                        : "transparent",
                      border: `1.5px solid ${selected ? token.color : AX.border}`,
                      color: selected ? token.color : AX.textMuted,
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        e.currentTarget.style.borderColor = `${token.color}60`;
                        e.currentTarget.style.color = token.color;
                        e.currentTarget.style.backgroundColor = `${token.color}08`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        e.currentTarget.style.borderColor = AX.border;
                        e.currentTarget.style.color = AX.textMuted;
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                    onClick={() => {
                      onPendingFilterChange((prev) => ({
                        ...prev,
                        quoteTokens: prev.quoteTokens.includes(token.name)
                          ? prev.quoteTokens.filter((t) => t !== token.name)
                          : [...prev.quoteTokens, token.name],
                      }));
                    }}
                  >
                    <span className="text-sm">{token.icon}</span>
                    <span>{token.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Keywords - Axiom style ── */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4
                className="text-xs font-semibold tracking-wider uppercase"
                style={{ color: AX.textMuted }}
              >
                Search Keywords
              </h4>
              <input
                type="text"
                placeholder="keyword1, keyword2..."
                value={pendingFilters.searchKeywords}
                onChange={(e) =>
                  onPendingFilterChange((prev) => ({
                    ...prev,
                    searchKeywords: e.target.value,
                  }))
                }
                className="w-full rounded-lg border px-3.5 py-2.5 text-sm transition-all duration-200"
                style={inputStyle}
                onFocus={onInputFocus}
                onBlur={(e) => {
                  e.target.style.boxShadow = "none";
                  e.target.style.borderColor = AX.border;
                }}
              />
            </div>
            <div className="space-y-2">
              <h4
                className="text-xs font-semibold tracking-wider uppercase"
                style={{ color: AX.textMuted }}
              >
                Exclude Keywords
              </h4>
              <input
                type="text"
                placeholder="keyword1, keyword2..."
                value={pendingFilters.excludeKeywords}
                onChange={(e) =>
                  onPendingFilterChange((prev) => ({
                    ...prev,
                    excludeKeywords: e.target.value,
                  }))
                }
                className="w-full rounded-lg border px-3.5 py-2.5 text-sm transition-all duration-200"
                style={inputStyle}
                onFocus={onInputFocus}
                onBlur={(e) => {
                  e.target.style.boxShadow = "none";
                  e.target.style.borderColor = AX.border;
                }}
              />
            </div>
          </div>

          {/* ── Category Tabs - Axiom style ── */}
          <div
            className="mb-5 flex gap-1 rounded-lg p-1"
            style={{
              backgroundColor: AX.surfaceAlt,
              border: `1px solid ${AX.border}`,
            }}
          >
            {["Audit", "$ Metrics"].map((tab) => (
              <button
                key={tab}
                className={`flex-1 cursor-pointer rounded-md px-4 py-2 text-xs font-semibold transition-all duration-200 ${activeCategoryTab === tab ? "" : ""}`}
                style={{
                  color: activeCategoryTab === tab ? AX.text : AX.textDim,
                  backgroundColor:
                    activeCategoryTab === tab
                      ? `${AX.accent}15`
                      : "transparent",
                  border:
                    activeCategoryTab === tab
                      ? `1px solid ${AX.accent}40`
                      : "1px solid transparent",
                }}
                onMouseEnter={(e) => {
                  if (activeCategoryTab !== tab) {
                    e.currentTarget.style.color = AX.textMuted;
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeCategoryTab !== tab) {
                    e.currentTarget.style.color = AX.textDim;
                  }
                }}
                onClick={() => setActiveCategoryTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* ── Category Content - Axiom style ── */}
          {activeCategoryTab === "Audit" && (
            <div className="space-y-4">
              <MinMaxRow
                label="Holders"
                minKey="holdersMin"
                maxKey="holdersMax"
                pendingFilters={pendingFilters}
                onChange={onPendingFilterChange}
              />
              <MinMaxRow
                label="Dev Migrations"
                minKey="devMigrationsMin"
                maxKey="devMigrationsMax"
                pendingFilters={pendingFilters}
                onChange={onPendingFilterChange}
              />
              <MinMaxRow
                label="Dev Pairs Created"
                minKey="devPairsCreatedMin"
                maxKey="devPairsCreatedMax"
                pendingFilters={pendingFilters}
                onChange={onPendingFilterChange}
              />
              <MinMaxRow
                label="KOL Count"
                minKey="kolCountMin"
                maxKey="kolCountMax"
                pendingFilters={pendingFilters}
                onChange={onPendingFilterChange}
              />

              {/* Age — special: has unit selector */}
              <div className="space-y-2">
                <label
                  className="block text-xs font-semibold tracking-wider uppercase"
                  style={{ color: AX.textMuted }}
                >
                  Age
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={pendingFilters.minAge}
                    onChange={(e) =>
                      onPendingFilterChange((prev) => ({
                        ...prev,
                        minAge: e.target.value,
                      }))
                    }
                    className="flex-1 rounded-lg border px-3 py-2.5 text-sm transition-all duration-200"
                    style={inputStyle}
                    onFocus={onInputFocus}
                    onBlur={(e) => {
                      e.target.style.boxShadow = "none";
                      e.target.style.borderColor = AX.border;
                    }}
                  />
                  <select
                    value={pendingFilters.ageUnit}
                    onChange={(e) =>
                      onPendingFilterChange((prev) => ({
                        ...prev,
                        ageUnit: e.target.value,
                      }))
                    }
                    className="rounded-lg border px-3 py-2.5 text-sm transition-all duration-200"
                    style={{ ...inputStyle, minWidth: "70px" }}
                    onFocus={onInputFocus as any}
                  >
                    <option value="m">min</option>
                    <option value="h">hr</option>
                    <option value="d">day</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Max"
                    value={pendingFilters.maxAge}
                    onChange={(e) =>
                      onPendingFilterChange((prev) => ({
                        ...prev,
                        maxAge: e.target.value,
                      }))
                    }
                    className="flex-1 rounded-lg border px-3 py-2.5 text-sm transition-all duration-200"
                    style={inputStyle}
                    onFocus={onInputFocus}
                    onBlur={(e) => {
                      e.target.style.boxShadow = "none";
                      e.target.style.borderColor = AX.border;
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {activeCategoryTab === "$ Metrics" && (
            <div className="space-y-4">
              <MinMaxRow
                label="Liquidity ($)"
                minKey="minLiquidity"
                maxKey="maxLiquidity"
                pendingFilters={pendingFilters}
                onChange={onPendingFilterChange}
              />
              <MinMaxRow
                label="Market Cap ($)"
                minKey="minMarketCap"
                maxKey="maxMarketCap"
                pendingFilters={pendingFilters}
                onChange={onPendingFilterChange}
              />
              <MinMaxRow
                label="Volume ($)"
                minKey="minVolume"
                maxKey="maxVolume"
                pendingFilters={pendingFilters}
                onChange={onPendingFilterChange}
              />
              <MinMaxRow
                label="B. curve %"
                minKey="bCurvePercentMin"
                maxKey="bCurvePercentMax"
                pendingFilters={pendingFilters}
                onChange={onPendingFilterChange}
              />
              <MinMaxRow
                label="Txns"
                minKey="txnsMin"
                maxKey="txnsMax"
                pendingFilters={pendingFilters}
                onChange={onPendingFilterChange}
              />
              <MinMaxRow
                label="Buys"
                minKey="numBuysMin"
                maxKey="numBuysMax"
                pendingFilters={pendingFilters}
                onChange={onPendingFilterChange}
              />
              <MinMaxRow
                label="Sells"
                minKey="numSellsMin"
                maxKey="numSellsMax"
                pendingFilters={pendingFilters}
                onChange={onPendingFilterChange}
              />
            </div>
          )}
        </div>

        {/* ── Footer - Axiom style ── */}
        <div
          className="flex items-center justify-between border-t px-5 py-4"
          style={{ borderColor: AX.border, backgroundColor: AX.surfaceAlt }}
        >
          <div className="flex gap-2">
            <button
              className="cursor-pointer rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-200"
              style={{
                backgroundColor: AX.surfaceAlt,
                color: AX.textMuted,
                border: `1px solid ${AX.border}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = AX.borderHover;
                e.currentTarget.style.color = AX.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = AX.border;
                e.currentTarget.style.color = AX.textMuted;
              }}
            >
              Import
            </button>
            <button
              className="cursor-pointer rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-200"
              style={{
                backgroundColor: AX.surfaceAlt,
                color: AX.textMuted,
                border: `1px solid ${AX.border}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = AX.borderHover;
                e.currentTarget.style.color = AX.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = AX.border;
                e.currentTarget.style.color = AX.textMuted;
              }}
            >
              Export
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onReset}
              className="cursor-pointer rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-200"
              style={{
                backgroundColor: AX.surfaceAlt,
                color: AX.textMuted,
                border: `1px solid ${AX.border}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = AX.borderHover;
                e.currentTarget.style.color = AX.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = AX.border;
                e.currentTarget.style.color = AX.textMuted;
              }}
            >
              Reset
            </button>
            <button
              className="cursor-pointer rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-200"
              style={{
                backgroundColor: hasPendingChanges ? AX.accent : AX.surfaceAlt,
                color: hasPendingChanges ? "#030304" : AX.textDim,
                border: hasPendingChanges
                  ? `1px solid ${AX.accent}`
                  : `1px solid ${AX.border}`,
                boxShadow: hasPendingChanges
                  ? `0 0 16px ${AX.accentGlow}`
                  : "none",
                opacity: hasPendingChanges ? 1 : 0.6,
              }}
              disabled={!hasPendingChanges}
              onMouseEnter={(e) => {
                if (hasPendingChanges) {
                  e.currentTarget.style.filter = "brightness(1.1)";
                }
              }}
              onMouseLeave={(e) => {
                if (hasPendingChanges) {
                  e.currentTarget.style.filter = "brightness(1)";
                }
              }}
              onClick={onApply}
            >
              Apply All
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
