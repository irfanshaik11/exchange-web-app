import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { FaTimes } from 'react-icons/fa';
import { BiRefresh } from 'react-icons/bi';
import type { PulseFilters } from '~/contexts/PulseFiltersContext';

// ── Color constants (matching PulseTable AX) ──
const AX = {
  surface: '#16171C',
  border: '#24252C',
  text: '#f0f5f5',
  muted: '#9CA3AF',
  aiBlue: '#526fff',
  glowBlue: 'rgba(82, 111, 255, 0.3)',
};

// ── Protocol data ──
const protocols = [
  { name: 'All',  icon: <span className="text-sm">🌐</span>, color: '#9333ea' },
  { name: 'Pump', icon: <Image src="/pump.svg" alt="Pump" width={16} height={16} className="rounded-full" />, color: '#31e3ac' },
  { name: 'Bonk', icon: <div className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-xs font-bold" style={{ color: '#f0f5f5' }}>B</div>, color: '#ff6b35' },
  { name: 'Bags', icon: <Image src="https://bags.fm/assets/images/bags-icon.png" alt="Bags" width={16} height={16} className="rounded-full" />, color: '#31e3ac' },
  { name: 'Moonit', icon: <Image src="/moonit.svg" alt="Moonit" width={16} height={16} className="rounded-full" />, color: '#fbbf24' },
  { name: 'Boop', icon: <Image src="https://s2.coinmarketcap.com/static/img/coins/64x64/36393.png" alt="Boop" width={16} height={16} className="rounded-full" />, color: '#3b82f6' },
  { name: 'LaunchLab', icon: <Image src="https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png" alt="LaunchLab" width={16} height={16} className="rounded-full" style={{ filter: 'hue-rotate(180deg) saturate(2) brightness(1.1)' }} />, color: '#3b82f6' },
  { name: 'Raydium', icon: <div className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-500 text-xs font-bold" style={{ color: '#f0f5f5' }}>R</div>, color: '#6b7280' },
  { name: 'Meteora AMM', icon: <Image src="/meteora.svg" alt="Meteora" width={16} height={16} className="rounded-full" />, color: '#92400e' },
  { name: 'Meteora AMM V2', icon: <Image src="/meteora.svg" alt="Meteora V2" width={16} height={16} className="rounded-full" />, color: '#a16207' },
];

// ── Quote token data ──
const quoteTokens = [
  { name: 'SOL',  icon: <div className="flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: '#31e3ac', color: '#f0f5f5' }}>S</div>, color: '#31e3ac' },
  { name: 'USDC', icon: <div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-xs font-bold" style={{ color: '#f0f5f5' }}>U</div>, color: '#06b6d4' },
  { name: 'USD1', icon: <span className="flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500 text-xs font-bold text-black">1</span>, color: '#fbbf24' },
];

// ── Shared input style (matching PulseTable) ──
const inputStyle: React.CSSProperties = {
  backgroundColor: AX.surface,
  borderColor: AX.border,
  color: AX.text,
  WebkitAppearance: 'none',
  MozAppearance: 'textfield' as any,
  outline: 'none',
  boxShadow: 'none',
};
const onInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.target.style.outline = 'none';
  e.target.style.boxShadow = 'none';
  e.target.style.borderColor = AX.border;
};

interface DiscoverFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingFilters: PulseFilters;
  hasPendingChanges: boolean;
  onPendingFilterChange: (updater: (prev: PulseFilters) => PulseFilters) => void;
  onApply: () => void;
  onReset: () => void;
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
    <div>
      <label className="mb-2 block text-sm font-medium" style={{ color: AX.text }}>
        {label}
      </label>
      <div className="flex gap-1">
        <input
          type="number"
          placeholder="Min"
          value={pendingFilters[minKey] as string}
          onChange={(e) => onChange((prev) => ({ ...prev, [minKey]: e.target.value }))}
          className="flex-1 rounded border px-3 py-2 text-sm"
          style={inputStyle}
          onFocus={onInputFocus}
        />
        <input
          type="number"
          placeholder="Max"
          value={pendingFilters[maxKey] as string}
          onChange={(e) => onChange((prev) => ({ ...prev, [maxKey]: e.target.value }))}
          className="flex-1 rounded border px-3 py-2 text-sm"
          style={inputStyle}
          onFocus={onInputFocus}
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
}: DiscoverFilterModalProps) {
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>('Audit');

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', zIndex: 10000000 }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="filter-modal fixed top-1/2 left-1/2 max-h-[90vh] w-[95vw] max-w-[600px] -translate-x-1/2 -translate-y-1/2 transform overflow-hidden rounded-lg border shadow-xl flex flex-col"
        style={{
          backgroundColor: AX.surface,
          borderColor: AX.border,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          zIndex: 10000001,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4" style={{ borderColor: AX.border }}>
          <h3 className="text-lg" style={{ color: AX.text, fontWeight: '300', letterSpacing: '0.5px' }}>
            Filters
          </h3>
          <button onClick={onClose} className="cursor-pointer rounded p-1 transition-colors hover:bg-gray-700">
            <FaTimes size={16} className="font-normal" />
          </button>
        </div>

        {/* Reset bar */}
        <div className="flex items-center justify-end border-b p-1" style={{ borderColor: AX.border }}>
          <button className="mr-2 cursor-pointer rounded p-1 transition-colors hover:bg-gray-700" onClick={onReset}>
            <BiRefresh className="h-4 w-4" style={{ color: AX.text }} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="max-h-[500px] overflow-y-auto p-4" style={{ backgroundColor: AX.surface }}>
          {/* ── Protocols ── */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium" style={{ color: AX.text }}>Protocols</h4>
              <button
                className="cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-all duration-300 ease-out"
                style={{ backgroundColor: AX.aiBlue, color: '#000000', borderRadius: '20px' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#2563eb'; e.currentTarget.style.boxShadow = `0 0 8px ${AX.glowBlue}`; e.currentTarget.style.transform = 'scale(1.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = AX.aiBlue; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
                onClick={() => onPendingFilterChange((prev) => ({ ...prev, protocols: ['All'] }))}
              >
                Select All
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {protocols.map((protocol) => {
                const selected = pendingFilters.protocols.includes(protocol.name);
                return (
                  <button
                    key={protocol.name}
                    className="flex cursor-pointer items-center gap-1 px-2 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-300 ease-out"
                    style={{
                      backgroundColor: selected ? protocol.color : 'transparent',
                      borderColor: selected ? protocol.color : 'transparent',
                      border: selected ? '2px solid' : 'none',
                      color: selected ? '#000000' : AX.text,
                      borderRadius: '20px',
                      boxShadow: selected ? `0 0 12px ${protocol.color}40, 0 0 24px ${protocol.color}20` : 'none',
                      transform: selected ? 'scale(1.02)' : 'scale(1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        e.currentTarget.style.backgroundColor = protocol.color + '10';
                        e.currentTarget.style.borderColor = protocol.color;
                        e.currentTarget.style.border = '1px solid';
                        e.currentTarget.style.color = protocol.color;
                        e.currentTarget.style.boxShadow = `0 0 8px ${protocol.color}30`;
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.borderColor = 'transparent';
                        e.currentTarget.style.border = 'none';
                        e.currentTarget.style.color = AX.text;
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.transform = 'scale(1)';
                      }
                    }}
                    onClick={() => {
                      onPendingFilterChange((prev) => {
                        if (protocol.name === 'All') return { ...prev, protocols: ['All'] };
                        if (prev.protocols.includes(protocol.name)) {
                          const remaining = prev.protocols.filter((p) => p !== protocol.name && p !== 'All');
                          return { ...prev, protocols: remaining.length === 0 ? ['All'] : remaining };
                        }
                        const withoutAll = prev.protocols.filter((p) => p !== 'All');
                        return { ...prev, protocols: [...withoutAll, protocol.name] };
                      });
                    }}
                  >
                    <span className="text-sm" style={{ color: 'inherit' }}>{protocol.icon}</span>
                    <span className="truncate font-semibold" style={{ color: 'inherit' }}>{protocol.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Quote Tokens ── */}
          <div className="mb-4">
            <h4 className="mb-2 text-sm font-medium" style={{ color: AX.text }}>Quote Tokens</h4>
            <div className="flex gap-3">
              {quoteTokens.map((token) => {
                const selected = pendingFilters.quoteTokens.includes(token.name);
                return (
                  <button
                    key={token.name}
                    className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-300 ease-out"
                    style={{
                      backgroundColor: selected ? token.color : 'transparent',
                      borderColor: selected ? token.color : 'transparent',
                      border: selected ? '2px solid' : 'none',
                      color: selected ? '#000000' : AX.text,
                      borderRadius: '20px',
                      boxShadow: selected ? `0 0 12px ${token.color}40, 0 0 24px ${token.color}20` : 'none',
                      transform: selected ? 'scale(1.02)' : 'scale(1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        e.currentTarget.style.backgroundColor = token.color + '10';
                        e.currentTarget.style.borderColor = token.color;
                        e.currentTarget.style.border = '1px solid';
                        e.currentTarget.style.color = token.color;
                        e.currentTarget.style.boxShadow = `0 0 8px ${token.color}30`;
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.borderColor = 'transparent';
                        e.currentTarget.style.border = 'none';
                        e.currentTarget.style.color = AX.text;
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.transform = 'scale(1)';
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
                    <span className="text-base" style={{ color: 'inherit' }}>{token.icon}</span>
                    <span className="font-bold">{token.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Keywords ── */}
          <div className="mb-6">
            <h4 className="mb-2 text-sm font-medium" style={{ color: AX.text }}>Search Keywords</h4>
            <input
              type="text"
              placeholder="keyword1, keyword2..."
              value={pendingFilters.searchKeywords}
              onChange={(e) => onPendingFilterChange((prev) => ({ ...prev, searchKeywords: e.target.value }))}
              className="w-full rounded border px-3 py-2 text-sm"
              style={inputStyle}
              onFocus={onInputFocus}
            />
            <h4 className="mt-3 mb-2 text-sm font-medium" style={{ color: AX.text }}>Exclude Keywords</h4>
            <input
              type="text"
              placeholder="keyword1, keyword2..."
              value={pendingFilters.excludeKeywords}
              onChange={(e) => onPendingFilterChange((prev) => ({ ...prev, excludeKeywords: e.target.value }))}
              className="w-full rounded border px-3 py-2 text-sm"
              style={inputStyle}
              onFocus={onInputFocus}
            />
          </div>

          {/* ── Category Tabs ── */}
          <div className="mb-4 flex border-b" style={{ borderColor: AX.border }}>
            {['Audit', '$ Metrics'].map((tab) => (
              <button
                key={tab}
                className={`cursor-pointer px-3 py-2 text-sm font-medium transition-colors ${activeCategoryTab === tab ? 'border-b-2' : ''}`}
                style={{
                  color: activeCategoryTab === tab ? AX.aiBlue : AX.muted,
                  borderBottomColor: activeCategoryTab === tab ? AX.aiBlue : 'transparent',
                }}
                onClick={() => setActiveCategoryTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* ── Category Content ── */}
          {activeCategoryTab === 'Audit' && (
            <div className="space-y-3">
              <MinMaxRow label="Holders" minKey="holdersMin" maxKey="holdersMax" pendingFilters={pendingFilters} onChange={onPendingFilterChange} />
              <MinMaxRow label="Dev Migrations" minKey="devMigrationsMin" maxKey="devMigrationsMax" pendingFilters={pendingFilters} onChange={onPendingFilterChange} />
              <MinMaxRow label="Dev Pairs Created" minKey="devPairsCreatedMin" maxKey="devPairsCreatedMax" pendingFilters={pendingFilters} onChange={onPendingFilterChange} />
              <MinMaxRow label="KOL Count" minKey="kolCountMin" maxKey="kolCountMax" pendingFilters={pendingFilters} onChange={onPendingFilterChange} />

              {/* Age — special: has unit selector */}
              <div>
                <label className="mb-2 block text-sm font-medium" style={{ color: AX.text }}>Age</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    placeholder="Min"
                    value={pendingFilters.minAge}
                    onChange={(e) => onPendingFilterChange((prev) => ({ ...prev, minAge: e.target.value }))}
                    className="flex-1 rounded border px-3 py-2 text-sm"
                    style={inputStyle}
                    onFocus={onInputFocus}
                  />
                  <select
                    value={pendingFilters.ageUnit}
                    onChange={(e) => onPendingFilterChange((prev) => ({ ...prev, ageUnit: e.target.value }))}
                    className="rounded border px-2 py-2 text-sm"
                    style={inputStyle}
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
                    onChange={(e) => onPendingFilterChange((prev) => ({ ...prev, maxAge: e.target.value }))}
                    className="flex-1 rounded border px-3 py-2 text-sm"
                    style={inputStyle}
                    onFocus={onInputFocus}
                  />
                </div>
              </div>
            </div>
          )}

          {activeCategoryTab === '$ Metrics' && (
            <div className="space-y-3">
              <MinMaxRow label="Liquidity ($)" minKey="minLiquidity" maxKey="maxLiquidity" pendingFilters={pendingFilters} onChange={onPendingFilterChange} />
              <MinMaxRow label="Market Cap ($)" minKey="minMarketCap" maxKey="maxMarketCap" pendingFilters={pendingFilters} onChange={onPendingFilterChange} />
              <MinMaxRow label="Volume ($)" minKey="minVolume" maxKey="maxVolume" pendingFilters={pendingFilters} onChange={onPendingFilterChange} />
              <MinMaxRow label="B. curve %" minKey="bCurvePercentMin" maxKey="bCurvePercentMax" pendingFilters={pendingFilters} onChange={onPendingFilterChange} />
              <MinMaxRow label="Txns" minKey="txnsMin" maxKey="txnsMax" pendingFilters={pendingFilters} onChange={onPendingFilterChange} />
              <MinMaxRow label="Buys" minKey="numBuysMin" maxKey="numBuysMax" pendingFilters={pendingFilters} onChange={onPendingFilterChange} />
              <MinMaxRow label="Sells" minKey="numSellsMin" maxKey="numSellsMax" pendingFilters={pendingFilters} onChange={onPendingFilterChange} />
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end border-t p-4" style={{ borderColor: AX.border }}>
          <button
            onClick={onReset}
            className="mr-2 cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300 ease-out"
            style={{ backgroundColor: AX.surface, color: AX.muted, border: `1px solid ${AX.border}` }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = AX.border; e.currentTarget.style.color = AX.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = AX.surface; e.currentTarget.style.color = AX.muted; }}
          >
            Reset
          </button>
          <button
            className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300 ease-out"
            style={{
              backgroundColor: hasPendingChanges ? AX.aiBlue : AX.surface,
              color: hasPendingChanges ? '#000000' : AX.muted,
              opacity: hasPendingChanges ? 1 : 0.5,
            }}
            disabled={!hasPendingChanges}
            onMouseEnter={(e) => { if (hasPendingChanges) { e.currentTarget.style.backgroundColor = '#2563eb'; e.currentTarget.style.boxShadow = `0 0 8px ${AX.glowBlue}`; } }}
            onMouseLeave={(e) => { if (hasPendingChanges) { e.currentTarget.style.backgroundColor = AX.aiBlue; e.currentTarget.style.boxShadow = 'none'; } }}
            onClick={onApply}
          >
            Apply All
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
