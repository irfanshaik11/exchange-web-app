import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { FaTimes } from "react-icons/fa";
import { BiRefresh } from "react-icons/bi";
import { FiDownload, FiUpload } from "react-icons/fi";
import {
  type PulseFilters,
  defaultPulseFilters,
} from "~/contexts/PulseFiltersContext";
import { copyToClipboard } from "~/utils/clipboard";
import {
  showCenteredErrorToast,
  showCenteredSuccessToast,
} from "~/utils/toast";

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
      <Image
        src="https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png"
        alt="Bonk"
        width={16}
        height={16}
        className="rounded-full"
      />
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
      <Image
        src="https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png"
        alt="Raydium"
        width={16}
        height={16}
        className="rounded-full"
      />
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
      <Image
        src="https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png"
        alt="SOL"
        width={16}
        height={16}
        className="rounded-full"
      />
    ),
    color: "#31e3ac",
  },
  {
    name: "USDC",
    icon: (
      <Image
        src="https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png"
        alt="USDC"
        width={16}
        height={16}
        className="rounded-full"
      />
    ),
    color: "#06b6d4",
  },
  {
    name: "USD1",
    icon: (
      <Image
        src="https://s2.coinmarketcap.com/static/img/coins/64x64/36148.png"
        alt="USD1"
        width={16}
        height={16}
        className="rounded-full"
      />
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

// File name used when exporting filters to disk.
const FILTER_EXPORT_FILENAME = "pulse-filters.json";

/**
 * Coerce an untrusted, parsed JSON value into a valid {@link PulseFilters}.
 *
 * Only keys present in {@link defaultPulseFilters} are copied over, and only
 * when the incoming value's type matches the default's (string arrays must be
 * arrays of strings). Anything missing, extra, or mistyped falls back to the
 * default — so a hand-edited, partial, or stale filter file can never corrupt
 * the live filter state. Throws if the input isn't an object at all.
 */
export function sanitizeImportedFilters(raw: unknown): PulseFilters {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Filter data must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const result: PulseFilters = { ...defaultPulseFilters };

  (Object.keys(defaultPulseFilters) as (keyof PulseFilters)[]).forEach((key) => {
    const incoming = obj[key as string];
    if (incoming === undefined || incoming === null) return;
    const fallback = defaultPulseFilters[key];

    if (Array.isArray(fallback)) {
      if (Array.isArray(incoming) && incoming.every((v) => typeof v === "string")) {
        (result as unknown as Record<string, unknown>)[key as string] = incoming;
      }
    } else if (typeof incoming === typeof fallback) {
      (result as unknown as Record<string, unknown>)[key as string] = incoming;
    }
  });

  return result;
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
  // Dialog container — used to move focus into the modal on open so keyboard
  // users land inside it, matching expected dialog behaviour.
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // ── Import / Export ──────────────────────────────────────────────
  // Filters serialize to plain JSON. Import opens a paste-JSON popup and
  // Export opens a copy-JSON popup; each popup also offers a file channel
  // ("Import as file" / "Export as file") so a filter set can move via the
  // clipboard OR disk.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [importText, setImportText] = useState("");
  // Opening a popup closes the filter modal, which removes the "Apply All"
  // button — so an import must commit itself. This flag tells the effect below
  // to call onApply() once the imported values have flushed into pendingFilters.
  const applyAfterImportRef = useRef(false);

  const serializeFilters = () => JSON.stringify(pendingFilters, null, 2);

  const handleCopyJson = () => {
    void copyToClipboard(
      serializeFilters(),
      "Filters copied as JSON",
      "Failed to copy filters",
    );
  };

  const handleDownloadFile = () => {
    try {
      const blob = new Blob([serializeFilters()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = FILTER_EXPORT_FILENAME;
      a.click();
      URL.revokeObjectURL(url);
      showCenteredSuccessToast("Filters exported to file");
    } catch {
      showCenteredErrorToast("Failed to export filters");
    }
  };

  // Parse + validate raw JSON text, then stage it as pending changes (the user
  // still has to hit Apply All — import never silently mutates the live feed).
  // Returns true on success so callers can close the popup.
  const applyImportedJson = (text: string): boolean => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      showCenteredErrorToast("Invalid JSON — could not import filters");
      return false;
    }
    try {
      const next = sanitizeImportedFilters(parsed);
      onPendingFilterChange(() => next);
      showCenteredSuccessToast("Filters imported — review, then Apply All");
      return true;
    } catch {
      showCenteredErrorToast("Unrecognized filter format");
      return false;
    }
  };

  const handleImportFromText = () => {
    if (!importText.trim()) {
      showCenteredErrorToast("Paste filter JSON first");
      return;
    }
    if (applyImportedJson(importText)) {
      applyAfterImportRef.current = true;
      setImportText("");
      setShowImportModal(false);
    }
  };

  const handleUploadFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear the value so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (applyImportedJson(String(ev.target?.result ?? ""))) {
        applyAfterImportRef.current = true;
        setImportText("");
        setShowImportModal(false);
      }
    };
    reader.onerror = () => showCenteredErrorToast("Failed to read file");
    reader.readAsText(file);
  };

  // Escape-to-close. Bound only while open so we don't leak listeners.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // Move focus into the dialog when it opens so Tab/Escape work immediately
  // and screen readers announce the dialog context. Reset the import/export
  // popups on (re)open so a stale one never lingers — note we deliberately do
  // NOT close them when isOpen goes false, since clicking Import/Export closes
  // the filter modal *in order to* reveal the popup on its own.
  useEffect(() => {
    if (isOpen) {
      setShowImportModal(false);
      setShowExportModal(false);
      dialogRef.current?.focus();
    }
  }, [isOpen]);

  // Commit an imported filter set once it has flushed into pendingFilters.
  // Import closes the filter modal (no Apply All to press), so we apply for
  // the user — mirroring how the Pulse table applies imports immediately.
  useEffect(() => {
    if (applyAfterImportRef.current) {
      applyAfterImportRef.current = false;
      onApply();
    }
  }, [pendingFilters, onApply]);

  // Render nothing only when the filter modal is closed AND no popup is open —
  // the popups must survive the filter modal closing.
  if (typeof document === "undefined") return null;
  if (!isOpen && !showImportModal && !showExportModal) return null;

  return createPortal(
    <>
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 backdrop-blur-sm"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.6)", zIndex: 10000000 }}
            onClick={onClose}
          />

      {/* Modal - Axiom style */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Trending filters"
        tabIndex={-1}
        className="filter-modal fixed top-1/2 left-1/2 flex max-h-[90vh] w-[95vw] max-w-[600px] -translate-x-1/2 -translate-y-1/2 transform flex-col overflow-hidden rounded-xl border shadow-2xl outline-none"
        style={{
          backgroundColor: AX.surface,
          borderColor: AX.border,
          boxShadow: `0 25px 80px rgba(0, 0, 0, 0.6), 0 0 1px ${AX.accent}20`,
          zIndex: 10000001,
        }}
      >
        {/* Header - Axiom style */}
        <div
          className="flex flex-shrink-0 items-center justify-between border-b px-5 py-4"
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

        {/* Scrollable body — flex-1 + min-h-0 makes this the single scroll
            region, so header/footer stay pinned and the modal never exceeds
            max-h-[90vh] (no double scrollbar, footer always visible). */}
        <div
          className="min-h-0 flex-1 overflow-y-auto p-5"
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
            <div className="grid grid-cols-3 gap-1.5 justify-items-start">
              {protocols.map((protocol) => {
                const selected = pendingFilters.protocols.includes(
                  protocol.name,
                );
                return (
                  <button
                    key={protocol.name}
                    className="flex cursor-pointer items-center gap-2 rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap transition-all duration-200"
                    style={{
                      backgroundColor: selected
                        ? `${protocol.color}15`
                        : "transparent",
                      border: `1px solid ${selected ? protocol.color : AX.border}`,
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
                      className="flex cursor-pointer items-center gap-2 rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap transition-all duration-200"
                      style={{
                        backgroundColor: isMayhemActive
                          ? `${MAYHEM}15`
                          : "transparent",
                        border: `1px solid ${isMayhemActive ? MAYHEM : AX.border}`,
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
            <div className="grid grid-cols-3 gap-1.5 justify-items-start">
              {quoteTokens.map((token) => {
                const selected = pendingFilters.quoteTokens.includes(
                  token.name,
                );
                return (
                  <button
                    key={token.name}
                    className="flex cursor-pointer items-center gap-2 rounded-full px-2 py-1 text-xs font-semibold transition-all duration-200"
                    style={{
                      backgroundColor: selected
                        ? `${token.color}15`
                        : "transparent",
                      border: `1px solid ${selected ? token.color : AX.border}`,
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
              {/* ── Audit % gates ──
                  Distribution-health filters keyed off fields the trending WS
                  feed reliably carries (sniper_percent / insider_percent /
                  top10_holders_percent / bundle_percent on
                  NormalizedTrendingToken). These are typically used as a Max
                  cap (e.g. "Top-10 < 50%") to screen out concentrated /
                  manipulated supply, but Min is offered too for symmetry.
                  Dev % is intentionally absent — it is NOT on the trending
                  token shape, so a Dev % filter would silently match nothing. */}
              <MinMaxRow
                label="Top 10 Holders %"
                minKey="top10HoldersPercentMin"
                maxKey="top10HoldersPercentMax"
                pendingFilters={pendingFilters}
                onChange={onPendingFilterChange}
              />
              <MinMaxRow
                label="Snipers %"
                minKey="snipersPercentMin"
                maxKey="snipersPercentMax"
                pendingFilters={pendingFilters}
                onChange={onPendingFilterChange}
              />
              <MinMaxRow
                label="Insiders %"
                minKey="insidersPercentMin"
                maxKey="insidersPercentMax"
                pendingFilters={pendingFilters}
                onChange={onPendingFilterChange}
              />
              <MinMaxRow
                label="Bundlers %"
                minKey="bundlePercentMin"
                maxKey="bundlePercentMax"
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
          className="flex flex-shrink-0 items-center justify-between border-t px-5 py-4"
          style={{ borderColor: AX.border, backgroundColor: AX.surfaceAlt }}
        >
          <div className="flex gap-2">
            {/* Hidden input backing the "Upload .json file" import option. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFileSelected}
            />

            <button
              type="button"
              onClick={() => {
                setImportText("");
                setShowImportModal(true);
                onClose();
              }}
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
              type="button"
              onClick={() => {
                setShowExportModal(true);
                onClose();
              }}
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
        </>
      )}

      {/* Import popup — paste JSON, or import from a file */}
      {showImportModal && (
        <>
          <div
            className="fixed inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 10000010 }}
            onClick={() => setShowImportModal(false)}
          />
          <div
            className="fixed top-1/2 left-1/2 w-[95vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 transform rounded-xl border"
            style={{
              backgroundColor: AX.surface,
              borderColor: AX.border,
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              zIndex: 10000011,
            }}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-4"
              style={{ borderColor: AX.border, backgroundColor: AX.surfaceAlt }}
            >
              <h3
                className="text-base font-semibold"
                style={{ color: AX.text, letterSpacing: "0.02em" }}
              >
                Import Filters
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="cursor-pointer rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.05]"
                aria-label="Close"
              >
                <FaTimes size={14} style={{ color: AX.textMuted }} />
              </button>
            </div>

            <div className="p-5">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Paste your filters JSON content here..."
                spellCheck={false}
                autoFocus
                className="h-52 w-full resize-none rounded-lg border p-3 text-sm outline-none"
                style={{
                  backgroundColor: AX.surfaceAlt,
                  borderColor: AX.border,
                  color: AX.text,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              />
            </div>

            <div
              className="flex items-center gap-2 border-t px-5 py-4"
              style={{ borderColor: AX.border, backgroundColor: AX.surfaceAlt }}
            >
              <button
                type="button"
                onClick={handleUploadFile}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200"
                style={{
                  backgroundColor: AX.surface,
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
                <FiUpload className="h-4 w-4" />
                Import as file
              </button>
              <button
                type="button"
                onClick={handleImportFromText}
                className="flex-1 cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200"
                style={{ backgroundColor: AX.accent, color: "#030304" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = "brightness(1.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = "brightness(1)";
                }}
              >
                Import
              </button>
            </div>
          </div>
        </>
      )}

      {/* Export popup — copy JSON, or export to a file */}
      {showExportModal && (
        <>
          <div
            className="fixed inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 10000010 }}
            onClick={() => setShowExportModal(false)}
          />
          <div
            className="fixed top-1/2 left-1/2 w-[95vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 transform rounded-xl border"
            style={{
              backgroundColor: AX.surface,
              borderColor: AX.border,
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              zIndex: 10000011,
            }}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-4"
              style={{ borderColor: AX.border, backgroundColor: AX.surfaceAlt }}
            >
              <h3
                className="text-base font-semibold"
                style={{ color: AX.text, letterSpacing: "0.02em" }}
              >
                Export Filters
              </h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="cursor-pointer rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.05]"
                aria-label="Close"
              >
                <FaTimes size={14} style={{ color: AX.textMuted }} />
              </button>
            </div>

            <div className="p-5">
              <textarea
                value={serializeFilters()}
                readOnly
                spellCheck={false}
                onFocus={(e) => e.currentTarget.select()}
                className="h-52 w-full resize-none rounded-lg border p-3 text-sm outline-none"
                style={{
                  backgroundColor: AX.surfaceAlt,
                  borderColor: AX.border,
                  color: AX.textMuted,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              />
            </div>

            <div
              className="flex items-center gap-2 border-t px-5 py-4"
              style={{ borderColor: AX.border, backgroundColor: AX.surfaceAlt }}
            >
              <button
                type="button"
                onClick={handleDownloadFile}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200"
                style={{
                  backgroundColor: AX.surface,
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
                <FiDownload className="h-4 w-4" />
                Export as file
              </button>
              <button
                type="button"
                onClick={handleCopyJson}
                className="flex-1 cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200"
                style={{ backgroundColor: AX.accent, color: "#030304" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = "brightness(1.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = "brightness(1)";
                }}
              >
                Copy JSON
              </button>
            </div>
          </div>
        </>
      )}
    </>,
    document.body,
  );
}
