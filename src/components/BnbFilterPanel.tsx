import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import { BiRefresh } from 'react-icons/bi';
import {
  useBnbFilters,
  defaultBnbFilters,
  hasBnbActiveFilters,
  type BnbFilters,
  type BnbColumnKey,
} from '~/contexts/BnbFiltersContext';
import { BNB_PROTOCOLS } from '~/utils/bnbProtocols';
import { computeHashImageUrl } from '~/utils/imageHash';

// ─── Design tokens (mirrors PulseTable AX palette) ───────────────────────────
const C = {
  bg: '#0e1118',
  surface: '#141821',
  surface2: '#1a1f2e',
  border: '#2a2f3f',
  text: '#e2e8f0',
  muted: '#64748b',
  bnb: '#F3BA2F',
  blue: '#4d9de0',
  green: '#39d353',
  red: '#ef4444',
} as const;

// ─── Launchpads per column (derived from shared BNB_PROTOCOLS) ───────────────
const LAUNCHPADS_NEW = BNB_PROTOCOLS.map(({ label, value, color, icon }) => ({
  label,
  value,
  color,
  icon,
}));

const LAUNCHPADS_FS_MIG = BNB_PROTOCOLS.filter((p) => !p.newPairsOnly).map(
  ({ label, value, color, icon }) => ({ label, value, color, icon }),
);

// All icon URLs use the CoinMarketCap CDN (stable, no hotlink restrictions).
const CMC = (id: number) => {
  const raw = `https://s2.coinmarketcap.com/static/img/coins/64x64/${id}.png`;
  return computeHashImageUrl(raw, 32) ?? raw;
};

const QUOTE_TOKENS = [
  { label: 'BNB',    value: 'bnb',    color: C.bnb,      icon: CMC(1839)  },
  { label: 'USD1',   value: 'usd1',   color: '#f59e0b',  icon: CMC(36148) },
  { label: 'FORM',   value: 'form',   color: '#22c55e',  icon: CMC(35896) },
  { label: 'U',      value: 'u',      color: '#f59e0b',  icon: CMC(39120) },
  { label: 'USDT',   value: 'usdt',   color: '#22c55e',  icon: CMC(825)   },
  { label: 'USDC',   value: 'usdc',   color: '#3b82f6',  icon: CMC(3408)  },
  { label: 'ASTER',  value: 'aster',  color: '#f59e0b',  icon: CMC(36341) },
  { label: 'CAKE',   value: 'cake',   color: '#ec4899',  icon: CMC(7186)  },
  { label: 'lisUSD', value: 'lisusd', color: '#3b82f6',  icon: CMC(21330) },
  { label: '币安人生', value: '币安人生', color: '#f59e0b', icon: CMC(38590) },
  { label: 'KGST',   value: 'kgst',   color: '#ef4444',  icon: CMC(39162) },
  { label: 'OTHERS', value: 'others', color: C.muted,    icon: undefined  },
];

// ─── Small helpers ────────────────────────────────────────────────────────────
type ColTab = BnbColumnKey;
type ContentTab = 'metrics' | 'socials';

type SavedPreset = { id: string; name: string; draft: Record<ColTab, BnbFilters>; savedAt: string };
const SAVED_KEY = 'bnb_saved_filters';
const loadPresets = (): SavedPreset[] => { try { return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]'); } catch { return []; } };
const persistPresets = (p: SavedPreset[]) => localStorage.setItem(SAVED_KEY, JSON.stringify(p));

const COL_TABS: { key: ColTab; label: string }[] = [
  { key: 'new',          label: 'New' },
  { key: 'finalStretch', label: 'Almost bonded' },
  { key: 'migrated',     label: 'Migrated' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Pill({
  label,
  color,
  active,
  onClick,
  icon,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
  icon?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex cursor-pointer items-center gap-2 whitespace-nowrap px-2 py-1 text-xs font-medium transition-all duration-200"
      style={{
        borderRadius: 20,
        border: `1px solid ${active ? color : C.border}`,
        backgroundColor: active ? `${color}18` : 'transparent',
        color: active ? color : C.muted,
        boxShadow: active ? `0 0 5px ${color}22` : 'none',
      }}
    >
      {icon && (
        <img
          src={computeHashImageUrl(icon, 32) ?? icon}
          alt=""
          aria-hidden
          className="h-3.5 w-3.5 flex-shrink-0 rounded-full object-cover"
        />
      )}
      {label}
    </button>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 select-none">
      <span
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded"
        style={{
          border: `1.5px solid ${checked ? C.blue : C.border}`,
          backgroundColor: checked ? C.blue : 'transparent',
        }}
        onClick={() => onChange(!checked)}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L4 7L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="text-sm" style={{ color: C.text }}>
        {label}
      </span>
    </label>
  );
}

function RangeRow({
  label,
  minVal,
  maxVal,
  unit,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  minVal: string;
  maxVal: string;
  unit?: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
}) {
  const inputStyle: React.CSSProperties = {
    backgroundColor: '#1e2233',
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    fontSize: 13,
    padding: '6px 8px',
    width: '100%',
    outline: 'none',
  };
  const unitStyle: React.CSSProperties = {
    color: C.muted,
    fontSize: 12,
    flexShrink: 0,
    marginLeft: 4,
  };

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-36 flex-shrink-0 text-sm" style={{ color: C.text }}>
        {label}
      </span>
      <div className="flex flex-1 items-center gap-1">
        <input
          type="number"
          placeholder="Min"
          value={minVal}
          onChange={(e) => onMinChange(e.target.value)}
          style={inputStyle}
          className="filter-number-input"
        />
        {unit && <span style={unitStyle}>{unit}</span>}
      </div>
      <div className="flex flex-1 items-center gap-1">
        <input
          type="number"
          placeholder="Max"
          value={maxVal}
          onChange={(e) => onMaxChange(e.target.value)}
          style={inputStyle}
          className="filter-number-input"
        />
        {unit && <span style={unitStyle}>{unit}</span>}
      </div>
    </div>
  );
}

function TextInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: C.muted }}>
        {label}
      </span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          backgroundColor: '#1e2233',
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          color: C.text,
          fontSize: 13,
          padding: '8px 12px',
          outline: 'none',
          width: '100%',
        }}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>
      {children}
    </p>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export interface BnbFilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Which column tab opens first */
  initialColumn?: ColTab;
}

export function BnbFilterPanel({ isOpen, onClose, initialColumn = 'new' }: BnbFilterPanelProps) {
  const { filters, setColumnFilters } = useBnbFilters();

  const [colTab, setColTab] = useState<ColTab>(initialColumn);
  const [contentTab, setContentTab] = useState<ContentTab>('metrics');
  const [showSaved, setShowSaved] = useState(false);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(() => loadPresets());
  const [showImportExport, setShowImportExport] = useState(false);
  const [importText, setImportText] = useState('');
  const [copyDone, setCopyDone] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Work on a local draft; only commit on Apply
  const [draft, setDraft] = useState<Record<ColTab, BnbFilters>>(() => ({
    new: { ...filters.new },
    finalStretch: { ...filters.finalStretch },
    migrated: { ...filters.migrated },
  }));

  const cur = draft[colTab];

  const set = useCallback(
    (patch: Partial<BnbFilters>) => {
      setDraft((prev) => ({ ...prev, [colTab]: { ...prev[colTab], ...patch } }));
    },
    [colTab],
  );

  const handleApply = () => {
    setColumnFilters('new', draft.new);
    setColumnFilters('finalStretch', draft.finalStretch);
    setColumnFilters('migrated', draft.migrated);
    onClose();
  };

  const handleReset = () => {
    setDraft((prev) => ({ ...prev, [colTab]: { ...defaultBnbFilters } }));
  };

  const handleSave = () => {
    const preset: SavedPreset = {
      id: String(Date.now()),
      name: `Filter ${new Date().toLocaleString()}`,
      draft: { new: { ...draft.new }, finalStretch: { ...draft.finalStretch }, migrated: { ...draft.migrated } },
      savedAt: new Date().toISOString(),
    };
    const updated = [...savedPresets, preset];
    setSavedPresets(updated);
    persistPresets(updated);
    // Save also applies immediately — same pattern as GMGN/Axiom presets
    setColumnFilters('new', draft.new);
    setColumnFilters('finalStretch', draft.finalStretch);
    setColumnFilters('migrated', draft.migrated);
  };

  const handleDeletePreset = (id: string) => {
    const updated = savedPresets.filter((p) => p.id !== id);
    setSavedPresets(updated);
    persistPresets(updated);
  };

  const handleLoadPreset = (preset: SavedPreset) => {
    setDraft({ new: { ...preset.draft.new }, finalStretch: { ...preset.draft.finalStretch }, migrated: { ...preset.draft.migrated } });
    setShowSaved(false);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleCopyConfig = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
      const colLabel = COL_TABS.find((t) => t.key === colTab)?.label ?? colTab;
      showToast(`Filters for ${colLabel} copied to clipboard`);
    } catch { /* ignore */ }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setImportText(text);
    } catch { /* ignore */ }
  };

  const handleImportText = () => {
    try {
      const parsed = JSON.parse(importText);
      if (parsed.new && parsed.finalStretch && parsed.migrated) {
        setDraft(parsed);
        setShowImportExport(false);
        setImportText('');
      }
    } catch { /* invalid JSON — ignore */ }
  };

  const launchpadList = colTab === 'new' ? LAUNCHPADS_NEW : LAUNCHPADS_FS_MIG;

  // [] = "no restriction" — all chips glow, board shows everything
  // [...values] = explicit selection — only those chips glow
  const lpAllMode = cur.launchpads.length === 0;
  const qtAllMode = cur.quoteTokens.length === 0;

  const toggleLaunchpad = (value: string) => {
    if (lpAllMode) {
      set({ launchpads: launchpadList.map((l) => l.value).filter((v) => v !== value) });
    } else {
      const next = cur.launchpads.includes(value)
        ? cur.launchpads.filter((v) => v !== value)
        : [...cur.launchpads, value];
      // Last chip deselected → back to "no restriction" (show all)
      set({ launchpads: next.length === 0 || launchpadList.every((l) => next.includes(l.value)) ? [] : next });
    }
  };

  const toggleQuoteToken = (value: string) => {
    if (qtAllMode) {
      set({ quoteTokens: QUOTE_TOKENS.map((t) => t.value).filter((v) => v !== value) });
    } else {
      const next = cur.quoteTokens.includes(value)
        ? cur.quoteTokens.filter((v) => v !== value)
        : [...cur.quoteTokens, value];
      set({ quoteTokens: next.length === 0 || QUOTE_TOKENS.every((t) => next.includes(t.value)) ? [] : next });
    }
  };

  const isLpActive = (value: string) => lpAllMode || cur.launchpads.includes(value);
  const isQtActive = (value: string) => qtAllMode || cur.quoteTokens.includes(value);

  const draftHasActive = hasBnbActiveFilters(cur);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000000 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-1/2 left-1/2 flex max-h-[92vh] w-[95vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, zIndex: 10000001 }}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div
          className="flex flex-shrink-0 items-center justify-between px-5 pt-5 pb-3"
          style={{ borderBottom: `1px solid ${C.border}` }}
        >
          <span className="text-lg font-semibold" style={{ color: C.text }}>
            Filter
          </span>
          <button onClick={onClose} className="cursor-pointer rounded p-1 transition-colors hover:bg-white/10">
            <FaTimes size={16} style={{ color: C.muted }} />
          </button>
        </div>

        {/* ── Column tabs ────────────────────────────────────────────────────── */}
        <div
          className="flex flex-shrink-0 items-center gap-1 px-5 pt-2"
          style={{ borderBottom: `1px solid ${C.border}` }}
        >
          <div className="flex flex-1 gap-1">
            {COL_TABS.map(({ key, label }) => {
              const active = colTab === key && !showSaved;
              return (
                <button
                  key={key}
                  onClick={() => { setColTab(key); setShowSaved(false); }}
                  className="cursor-pointer px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    color: active ? C.text : C.muted,
                    borderBottom: active ? `2px solid ${C.bnb}` : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {label}
                </button>
              );
            })}
            <button
              onClick={() => setShowSaved((v) => !v)}
              className="cursor-pointer px-3 py-2 text-sm transition-colors"
              style={{
                color: showSaved ? C.text : C.muted,
                borderBottom: showSaved ? `2px solid ${C.bnb}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              Saved
            </button>
          </div>
          {/* Reset current column */}
          <button
            onClick={handleReset}
            title={draftHasActive ? 'Reset this column' : 'No active filters'}
            className="mb-1 cursor-pointer rounded p-1 transition-colors hover:bg-white/10"
          >
            <BiRefresh size={18} style={{ color: draftHasActive ? C.red : C.muted }} />
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">

          {/* ── Saved presets view ──────────────────────────────────────────── */}
          {showSaved && (
            <div>
              {savedPresets.length === 0 ? (
                <p className="mt-6 text-center text-sm" style={{ color: C.muted }}>No saved filters yet. Set your filters and click Save.</p>
              ) : (
                <div className="flex flex-col gap-2 mt-2">
                  {savedPresets.map((preset) => (
                    <div key={preset.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: C.surface2, border: `1px solid ${C.border}` }}>
                      <div>
                        <p className="text-sm font-medium" style={{ color: C.text }}>{preset.name}</p>
                        <p className="text-xs" style={{ color: C.muted }}>{new Date(preset.savedAt).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleLoadPreset(preset)} className="cursor-pointer rounded px-2 py-1 text-xs font-semibold transition-colors hover:bg-white/10" style={{ color: C.bnb, border: `1px solid ${C.bnb}` }}>Load</button>
                        <button onClick={() => handleDeletePreset(preset.id)} className="cursor-pointer rounded px-2 py-1 text-xs font-semibold transition-colors hover:bg-white/10" style={{ color: C.red, border: `1px solid ${C.red}` }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!showSaved && (<>

          {/* Search inputs */}
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              label="Search Keywords"
              placeholder="keyword1, keyword2…"
              value={cur.searchKeywords}
              onChange={(v) => set({ searchKeywords: v })}
            />
            <TextInput
              label="Exclude Keywords"
              placeholder="keyword1, keyword2…"
              value={cur.excludeKeywords}
              onChange={(v) => set({ excludeKeywords: v })}
            />
            <TextInput
              label="Search X @Handle"
              placeholder="handle1, handle2…"
              value={cur.searchXHandle}
              onChange={(v) => set({ searchXHandle: v })}
            />
            <TextInput
              label="Search Dev Wallet"
              placeholder="wallet1, wallet2…"
              value={cur.searchDevWallet}
              onChange={(v) => set({ searchDevWallet: v })}
            />
          </div>

          {/* Launchpads */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: C.text }}>
                Launchpads
              </span>
              <button
                onClick={() => set({ launchpads: [] })}
                className="cursor-pointer rounded px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-white/10"
                style={{ backgroundColor: C.surface2, color: C.text, border: `1px solid ${C.border}` }}
              >
                Select All
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 justify-items-start">
              {launchpadList.map((lp) => (
                <Pill
                  key={lp.value}
                  label={lp.label}
                  color={lp.color}
                  icon={lp.icon}
                  active={isLpActive(lp.value)}
                  onClick={() => toggleLaunchpad(lp.value)}
                />
              ))}
            </div>
          </div>

          {/* Quote Tokens */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: C.text }}>
                Quote Tokens
              </span>
              <button
                onClick={() => set({ quoteTokens: [] })}
                className="cursor-pointer rounded px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-white/10"
                style={{ backgroundColor: C.surface2, color: C.text, border: `1px solid ${C.border}` }}
              >
                Select All
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 justify-items-start">
              {QUOTE_TOKENS.map((qt) => (
                <Pill
                  key={qt.value}
                  label={qt.label}
                  color={qt.color}
                  icon={qt.icon}
                  active={isQtActive(qt.value)}
                  onClick={() => toggleQuoteToken(qt.value)}
                />
              ))}
            </div>
          </div>

          {/* ── Metrics / Socials toggle ────────────────────────────────────── */}
          <div
            className="mt-5 grid grid-cols-2 overflow-hidden rounded-lg"
            style={{ border: `1px solid ${C.border}` }}
          >
            {(['metrics', 'socials'] as ContentTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setContentTab(tab)}
                className="cursor-pointer py-2.5 text-sm font-semibold capitalize transition-colors"
                style={{
                  backgroundColor: contentTab === tab ? '#1e2233' : 'transparent',
                  color: contentTab === tab ? C.text : C.muted,
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* ── Metrics content ──────────────────────────────────────────────── */}
          {contentTab === 'metrics' && (
            <div className="mt-3">
              {/* Dev behaviour checkboxes */}
              <div className="grid grid-cols-2 gap-2">
                <Checkbox label="Dev Sell All"               checked={cur.devSellAll}               onChange={(v) => set({ devSellAll: v })} />
                <Checkbox label="Dev Still Holding"          checked={cur.devStillHolding}          onChange={(v) => set({ devStillHolding: v })} />
                <Checkbox label="Original Avatar"            checked={cur.originalAvatar}           onChange={(v) => set({ originalAvatar: v })} />
                <Checkbox label="Original Socials"           checked={cur.originalSocials}          onChange={(v) => set({ originalSocials: v })} />
                <Checkbox label="Dev Burnt"                  checked={cur.devBurnt}                 onChange={(v) => set({ devBurnt: v })} />
                <Checkbox label="Exclude Dev Wash Trading"   checked={cur.excludeDevWashTrading}    onChange={(v) => set({ excludeDevWashTrading: v })} />
              </div>
              <div className="mt-2">
                <Checkbox label="Exclude Insiders Wash Trading" checked={cur.excludeInsidersWashTrading} onChange={(v) => set({ excludeInsidersWashTrading: v })} />
              </div>

              <SectionLabel>Token Audit</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                <Checkbox label="Exclude Honeypot"      checked={cur.excludeHoneypot}     onChange={(v) => set({ excludeHoneypot: v })} />
                <Checkbox label="Exclude Unverified"    checked={cur.excludeUnverified}   onChange={(v) => set({ excludeUnverified: v })} />
                <Checkbox label="Exclude Non-Renounced" checked={cur.excludeNonRenounced} onChange={(v) => set({ excludeNonRenounced: v })} />
              </div>

              <SectionLabel>Exclude Vamped</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                <Checkbox label="Exclude Uxento"      checked={cur.excludeUxento}      onChange={(v) => set({ excludeUxento: v })} />
                <Checkbox label="Exclude RapidLaunch" checked={cur.excludeRapidLaunch} onChange={(v) => set({ excludeRapidLaunch: v })} />
              </div>

              {/* Numeric ranges */}
              <SectionLabel>Ranges</SectionLabel>
              <div
                className="rounded-lg p-3"
                style={{ backgroundColor: C.surface2, border: `1px solid ${C.border}` }}
              >
                <RangeRow label="B. Curve"       minVal={cur.bCurveMin}         maxVal={cur.bCurveMax}         unit="%"   onMinChange={(v) => set({ bCurveMin: v })}         onMaxChange={(v) => set({ bCurveMax: v })} />
                <RangeRow label="Age"            minVal={cur.ageMin}            maxVal={cur.ageMax}            unit="min" onMinChange={(v) => set({ ageMin: v })}            onMaxChange={(v) => set({ ageMax: v })} />
                <RangeRow label="Liquidity"      minVal={cur.liquidityMin}      maxVal={cur.liquidityMax}      unit="K"   onMinChange={(v) => set({ liquidityMin: v })}      onMaxChange={(v) => set({ liquidityMax: v })} />
                <RangeRow label="MKT Cap"        minVal={cur.mktCapMin}         maxVal={cur.mktCapMax}         unit="K"   onMinChange={(v) => set({ mktCapMin: v })}         onMaxChange={(v) => set({ mktCapMax: v })} />
                <RangeRow label="Volume"         minVal={cur.volumeMin}         maxVal={cur.volumeMax}         unit="K"   onMinChange={(v) => set({ volumeMin: v })}         onMaxChange={(v) => set({ volumeMax: v })} />
                <RangeRow label="Net Buy"        minVal={cur.netBuyMin}         maxVal={cur.netBuyMax}         unit="K"   onMinChange={(v) => set({ netBuyMin: v })}         onMaxChange={(v) => set({ netBuyMax: v })} />
                <RangeRow label="TXs"            minVal={cur.txsMin}            maxVal={cur.txsMax}                       onMinChange={(v) => set({ txsMin: v })}            onMaxChange={(v) => set({ txsMax: v })} />
                <RangeRow label="Buys"           minVal={cur.buysMin}           maxVal={cur.buysMax}                       onMinChange={(v) => set({ buysMin: v })}           onMaxChange={(v) => set({ buysMax: v })} />
                <RangeRow label="Sells"          minVal={cur.sellsMin}          maxVal={cur.sellsMax}                       onMinChange={(v) => set({ sellsMin: v })}          onMaxChange={(v) => set({ sellsMax: v })} />
                <RangeRow label="Total Fees"     minVal={cur.totalFeesMin}      maxVal={cur.totalFeesMax}      unit="BNB" onMinChange={(v) => set({ totalFeesMin: v })}      onMaxChange={(v) => set({ totalFeesMax: v })} />
                <RangeRow label="Token Tax"      minVal={cur.tokenTaxMin}       maxVal={cur.tokenTaxMax}       unit="%"   onMinChange={(v) => set({ tokenTaxMin: v })}       onMaxChange={(v) => set({ tokenTaxMax: v })} />
                <RangeRow label="Telegram Calls" minVal={cur.telegramCallsMin}  maxVal={cur.telegramCallsMax}             onMinChange={(v) => set({ telegramCallsMin: v })}  onMaxChange={(v) => set({ telegramCallsMax: v })} />
                <RangeRow label="KOLs"           minVal={cur.kolsMin}           maxVal={cur.kolsMax}                       onMinChange={(v) => set({ kolsMin: v })}           onMaxChange={(v) => set({ kolsMax: v })} />
                <RangeRow label="Smart Money"    minVal={cur.smartMoneyMin}     maxVal={cur.smartMoneyMax}                onMinChange={(v) => set({ smartMoneyMin: v })}     onMaxChange={(v) => set({ smartMoneyMax: v })} />
                <RangeRow label="X Followers"    minVal={cur.xFollowersMin}     maxVal={cur.xFollowersMax}                onMinChange={(v) => set({ xFollowersMin: v })}     onMaxChange={(v) => set({ xFollowersMax: v })} />
                <RangeRow label="Dev Migrated"   minVal={cur.devMigratedMin}    maxVal={cur.devMigratedMax}               onMinChange={(v) => set({ devMigratedMin: v })}    onMaxChange={(v) => set({ devMigratedMax: v })} />
                <RangeRow label="Dev Launched"   minVal={cur.devLaunchedMin}    maxVal={cur.devLaunchedMax}               onMinChange={(v) => set({ devLaunchedMin: v })}    onMaxChange={(v) => set({ devLaunchedMax: v })} />
                <RangeRow label="Dev Migrated %" minVal={cur.devMigratedPctMin} maxVal={cur.devMigratedPctMax} unit="%" onMinChange={(v) => set({ devMigratedPctMin: v })} onMaxChange={(v) => set({ devMigratedPctMax: v })} />
                <RangeRow label="Total Holders"  minVal={cur.totalHoldersMin}   maxVal={cur.totalHoldersMax}              onMinChange={(v) => set({ totalHoldersMin: v })}   onMaxChange={(v) => set({ totalHoldersMax: v })} />
                <RangeRow label="Bot Degens"     minVal={cur.botDegensMin}      maxVal={cur.botDegensMax}                 onMinChange={(v) => set({ botDegensMin: v })}      onMaxChange={(v) => set({ botDegensMax: v })} />
                <RangeRow label="Bot Trader Hold" minVal={cur.botTraderHoldMin}  maxVal={cur.botTraderHoldMax} unit="%"  onMinChange={(v) => set({ botTraderHoldMin: v })}  onMaxChange={(v) => set({ botTraderHoldMax: v })} />
                <RangeRow label="Currently Viewing" minVal={cur.currentlyViewingMin} maxVal={cur.currentlyViewingMax}  onMinChange={(v) => set({ currentlyViewingMin: v })} onMaxChange={(v) => set({ currentlyViewingMax: v })} />
                <RangeRow label="Top 10 Holding" minVal={cur.top10HoldingMin}   maxVal={cur.top10HoldingMax}   unit="%"  onMinChange={(v) => set({ top10HoldingMin: v })}   onMaxChange={(v) => set({ top10HoldingMax: v })} />
                <RangeRow label="Dev Holding"    minVal={cur.devHoldingMin}     maxVal={cur.devHoldingMax}     unit="%"  onMinChange={(v) => set({ devHoldingMin: v })}     onMaxChange={(v) => set({ devHoldingMax: v })} />
                <RangeRow label="Insiders"       minVal={cur.insidersMin}       maxVal={cur.insidersMax}       unit="%"  onMinChange={(v) => set({ insidersMin: v })}       onMaxChange={(v) => set({ insidersMax: v })} />
                <RangeRow label="Bundlers"       minVal={cur.bundlersMin}       maxVal={cur.bundlersMax}       unit="%"  onMinChange={(v) => set({ bundlersMin: v })}       onMaxChange={(v) => set({ bundlersMax: v })} />
                <RangeRow label="Phishing"       minVal={cur.phishingMin}       maxVal={cur.phishingMax}       unit="%"  onMinChange={(v) => set({ phishingMin: v })}       onMaxChange={(v) => set({ phishingMax: v })} />
                <RangeRow label="Fresh"          minVal={cur.freshMin}          maxVal={cur.freshMax}          unit="%"  onMinChange={(v) => set({ freshMin: v })}          onMaxChange={(v) => set({ freshMax: v })} />
                <RangeRow label="Snipers Hold"   minVal={cur.snipersHoldMin}    maxVal={cur.snipersHoldMax}    unit="%"  onMinChange={(v) => set({ snipersHoldMin: v })}    onMaxChange={(v) => set({ snipersHoldMax: v })} />
                <RangeRow label="Rug %"          minVal={cur.rugPctMin}         maxVal={cur.rugPctMax}         unit="%"  onMinChange={(v) => set({ rugPctMin: v })}         onMaxChange={(v) => set({ rugPctMax: v })} />
                <RangeRow label="X Rename"       minVal={cur.xRenameMin}        maxVal={cur.xRenameMax}                   onMinChange={(v) => set({ xRenameMin: v })}        onMaxChange={(v) => set({ xRenameMax: v })} />
              </div>
            </div>
          )}

          {/* ── Socials content ───────────────────────────────────────────────── */}
          {contentTab === 'socials' && (
            <div className="mt-3">
              <div className="grid grid-cols-2 gap-2">
                <Checkbox label="With at least 1 social" checked={cur.withAtLeastOneSocial} onChange={(v) => set({ withAtLeastOneSocial: v })} />
                <Checkbox label="Only Tweet"             checked={cur.onlyTweet}            onChange={(v) => set({ onlyTweet: v })} />
                <Checkbox label="Dex AD Paid"            checked={cur.dexAdPaid}            onChange={(v) => set({ dexAdPaid: v })} />
                <Checkbox label="Dex Bar Paid"           checked={cur.dexBarPaid}           onChange={(v) => set({ dexBarPaid: v })} />
                <Checkbox label="Dex Boost"              checked={cur.dexBoost}             onChange={(v) => set({ dexBoost: v })} />
                <Checkbox label="Update Social"          checked={cur.updateSocial}         onChange={(v) => set({ updateSocial: v })} />
                <Checkbox label="CTO"                    checked={cur.cto}                  onChange={(v) => set({ cto: v })} />
                <Checkbox label="X"                      checked={cur.hasX}                 onChange={(v) => set({ hasX: v })} />
                <Checkbox label="Website"                checked={cur.hasWebsite}           onChange={(v) => set({ hasWebsite: v })} />
                <Checkbox label="Telegram"               checked={cur.hasTelegram}          onChange={(v) => set({ hasTelegram: v })} />
                <Checkbox label="Youtube"                checked={cur.hasYoutube}           onChange={(v) => set({ hasYoutube: v })} />
                <Checkbox label="Tiktok"                 checked={cur.hasTiktok}            onChange={(v) => set({ hasTiktok: v })} />
                <Checkbox label="Instagram"              checked={cur.hasInstagram}         onChange={(v) => set({ hasInstagram: v })} />
              </div>
            </div>
          )}
          </>)}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        <div
          className="flex flex-shrink-0 items-center justify-between px-5 py-3"
          style={{ borderTop: `1px solid ${C.border}` }}
        >
          <button
            onClick={() => setShowImportExport(true)}
            className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10"
            style={{ color: C.muted, border: `1px solid ${C.border}` }}
          >
            Import/Export
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10"
              style={{ color: C.muted, border: `1px solid ${C.border}` }}
            >
              Save
            </button>
            <button
              onClick={handleApply}
              className="cursor-pointer rounded-lg px-5 py-2 text-sm font-bold transition-all hover:brightness-110"
              style={{ backgroundColor: C.text, color: '#000' }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* ── Toast notification ──────────────────────────────────────────────── */}
      {toastMsg && (
        <div
          className="fixed left-1/2 top-6 flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-3 shadow-xl"
          style={{ backgroundColor: '#1a2a1a', border: `1px solid #39d35355`, zIndex: 10000010, minWidth: 280 }}
        >
          <span
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: C.green }}
          >
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <path d="M1 5L4.5 8.5L11 1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="flex-1 text-sm font-medium" style={{ color: C.text }}>{toastMsg}</span>
          <button onClick={() => setToastMsg('')} className="cursor-pointer hover:opacity-70">
            <FaTimes size={12} style={{ color: C.muted }} />
          </button>
        </div>
      )}

      {/* ── Import/Export modal ─────────────────────────────────────────────── */}
      {showImportExport && (
        <>
          <div
            className="fixed inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10000002 }}
            onClick={() => setShowImportExport(false)}
          />
          <div
            className="fixed top-1/2 left-1/2 w-[90vw] max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl"
            style={{ backgroundColor: '#18191c', border: `1px solid ${C.border}`, zIndex: 10000003 }}
          >
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <span className="text-lg font-bold" style={{ color: C.text }}>Import/Export</span>
              <button onClick={() => setShowImportExport(false)} className="cursor-pointer rounded p-1 hover:bg-white/10">
                <FaTimes size={16} style={{ color: C.muted }} />
              </button>
            </div>

            {/* Export */}
            <div>
              <p className="mb-3 text-sm font-semibold" style={{ color: C.text }}>Export Filters</p>
              <button
                onClick={handleCopyConfig}
                className="w-full cursor-pointer rounded-xl py-3 text-sm font-bold transition-all hover:brightness-110"
                style={{ backgroundColor: copyDone ? '#4ade80' : '#86efac', color: '#000' }}
              >
                {copyDone ? 'Copied!' : 'Copy your config'}
              </button>
            </div>

            {/* Divider */}
            <div className="my-5" style={{ borderTop: `1px solid ${C.border}` }} />

            {/* Import */}
            <div>
              <p className="mb-3 text-sm font-semibold" style={{ color: C.text }}>Import Filters</p>
              <div className="relative rounded-xl p-3" style={{ backgroundColor: C.bg, border: `1px solid ${C.border}` }}>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste your filter config here"
                  rows={6}
                  className="w-full resize-none bg-transparent text-sm outline-none"
                  style={{ color: C.text }}
                />
                <button
                  onClick={handlePasteFromClipboard}
                  className="absolute right-3 bottom-2 cursor-pointer text-sm font-semibold"
                  style={{ color: C.green }}
                >
                  Paste
                </button>
              </div>
              <button
                onClick={handleImportText}
                className="mt-3 w-full cursor-pointer rounded-xl py-3 text-sm font-bold transition-all hover:brightness-110"
                style={{ backgroundColor: '#2d4a3e', color: importText.trim() ? C.green : C.muted }}
              >
                Import
              </button>
            </div>
          </div>
        </>
      )}

      {/* Suppress number input spinners globally for this panel */}
      <style>{`
        .filter-number-input::-webkit-outer-spin-button,
        .filter-number-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .filter-number-input[type=number] { -moz-appearance: textfield; }
        .filter-number-input:focus { border-color: ${C.bnb} !important; box-shadow: 0 0 0 2px ${C.bnb}33; }
      `}</style>
    </>,
    document.body,
  );
}
