import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineFilter,
  HiOutlineX,
  HiOutlineCheck,
  HiOutlineClock,
  HiOutlineChartBar,
  HiOutlineStatusOnline,
  HiOutlineTrendingUp,
} from 'react-icons/hi';

const AX = {
  bg: "#0a0b0d",
  surface: "#12141a",
  surface2: "#1a1d24",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  accent: "#4ADE80",
  accentGlow: "rgba(74, 222, 128, 0.3)",
  yellow: "#FBBF24",
  red: "#F87171",
  purple: "#818CF8",
  cyan: "#22D3EE",
};

// Filter types
export interface MarketFilterState {
  status: 'all' | 'active' | 'closed' | 'resolved';
  ending: 'all' | 'today' | 'week' | 'month' | 'later';
  volume: 'all' | 'high' | 'medium' | 'low';
  probability: 'all' | 'high' | 'medium' | 'low';
  hideResolved: boolean;
}

export const DEFAULT_FILTERS: MarketFilterState = {
  status: 'all',
  ending: 'all',
  volume: 'all',
  probability: 'all',
  hideResolved: true, // Hide resolved markets by default
};

interface FilterOption {
  value: string;
  label: string;
  description?: string;
}

const STATUS_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'All', description: 'Show all markets' },
  { value: 'active', label: 'Open', description: 'Currently trading' },
  { value: 'closed', label: 'Closed', description: 'Trading ended' },
  { value: 'resolved', label: 'Resolved', description: 'Outcome determined' },
];

const ENDING_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'Any Time', description: 'No time filter' },
  { value: 'today', label: 'Today', description: 'Ends within 24h' },
  { value: 'week', label: 'This Week', description: 'Ends within 7 days' },
  { value: 'month', label: 'This Month', description: 'Ends within 30 days' },
  { value: 'later', label: 'Later', description: 'Ends after 30 days' },
];

const VOLUME_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'Any Volume', description: 'No volume filter' },
  { value: 'high', label: 'High', description: '> $100K 24h volume' },
  { value: 'medium', label: 'Medium', description: '$10K - $100K' },
  { value: 'low', label: 'Low', description: '< $10K' },
];

const PROBABILITY_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'Any', description: 'No probability filter' },
  { value: 'high', label: 'High', description: 'Yes > 70%' },
  { value: 'medium', label: 'Medium', description: '30% - 70%' },
  { value: 'low', label: 'Low', description: 'Yes < 30%' },
];

interface FilterSectionProps {
  title: string;
  icon: React.ReactNode;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  color: string;
}

function FilterSection({ title, icon, options, value, onChange, color }: FilterSectionProps) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: AX.muted }}>
          {title}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              onClick={() => onChange(option.value)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
              style={{
                backgroundColor: isSelected ? `${color}20` : AX.surface2,
                color: isSelected ? color : AX.muted,
                border: `1px solid ${isSelected ? `${color}40` : AX.border}`,
              }}
              title={option.description}
            >
              {isSelected && <HiOutlineCheck className="inline w-3 h-3 mr-1" />}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface MarketFiltersProps {
  filters: MarketFilterState;
  onFiltersChange: (filters: MarketFilterState) => void;
}

export default function MarketFilters({ filters, onFiltersChange }: MarketFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoutRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Count active filters (excluding hideResolved since it's a toggle, not a dropdown)
  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => key !== 'hideResolved' && value !== 'all'
  ).length + (filters.hideResolved ? 1 : 0);

  // Close popout when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoutRef.current &&
        !popoutRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleReset = () => {
    onFiltersChange(DEFAULT_FILTERS);
  };

  const updateFilter = <K extends keyof MarketFilterState>(
    key: K,
    value: MarketFilterState[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="relative">
      {/* Filter Button */}
      <motion.button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        style={{
          backgroundColor: isOpen || activeFilterCount > 0 ? `${AX.accent}15` : 'transparent',
          color: isOpen || activeFilterCount > 0 ? AX.accent : AX.muted,
          border: `1px solid ${isOpen || activeFilterCount > 0 ? `${AX.accent}30` : 'transparent'}`,
        }}
      >
        <HiOutlineFilter className="w-4 h-4" />
        <span className="hidden sm:inline">Filters</span>
        {activeFilterCount > 0 && (
          <span
            className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold"
            style={{ backgroundColor: AX.accent, color: AX.bg }}
          >
            {activeFilterCount}
          </span>
        )}
      </motion.button>

      {/* Popout */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={popoutRef}
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl shadow-2xl overflow-hidden"
            style={{
              backgroundColor: AX.surface,
              border: `1px solid ${AX.border}`,
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: `1px solid ${AX.border}` }}
            >
              <div className="flex items-center gap-2">
                <HiOutlineFilter className="w-4 h-4" style={{ color: AX.accent }} />
                <span className="text-sm font-semibold" style={{ color: AX.text }}>
                  Filter Markets
                </span>
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button
                    onClick={handleReset}
                    className="text-xs font-medium px-2 py-1 rounded hover:bg-white/5 transition-colors"
                    style={{ color: AX.muted }}
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded hover:bg-white/5 transition-colors"
                  style={{ color: AX.muted }}
                >
                  <HiOutlineX className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter Sections */}
            <div className="p-4">
              {/* Hide Resolved Toggle */}
              <div
                className="flex items-center justify-between mb-4 pb-4"
                style={{ borderBottom: `1px solid ${AX.border}` }}
              >
                <div className="flex items-center gap-2">
                  <HiOutlineStatusOnline className="w-4 h-4" style={{ color: AX.red }} />
                  <span className="text-sm font-medium" style={{ color: AX.text }}>
                    Hide Resolved
                  </span>
                </div>
                <button
                  onClick={() => updateFilter('hideResolved', !filters.hideResolved)}
                  className="relative w-11 h-6 rounded-full transition-all duration-200"
                  style={{
                    backgroundColor: filters.hideResolved ? AX.accent : AX.surface2,
                    border: `1px solid ${filters.hideResolved ? AX.accent : AX.border}`,
                  }}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full transition-all duration-200 shadow-sm"
                    style={{
                      backgroundColor: filters.hideResolved ? AX.bg : AX.muted,
                      left: filters.hideResolved ? '20px' : '2px',
                    }}
                  />
                </button>
              </div>

              <FilterSection
                title="Status"
                icon={<HiOutlineStatusOnline className="w-4 h-4" />}
                options={STATUS_OPTIONS}
                value={filters.status}
                onChange={(v) => updateFilter('status', v as MarketFilterState['status'])}
                color={AX.accent}
              />

              <FilterSection
                title="Ending"
                icon={<HiOutlineClock className="w-4 h-4" />}
                options={ENDING_OPTIONS}
                value={filters.ending}
                onChange={(v) => updateFilter('ending', v as MarketFilterState['ending'])}
                color={AX.yellow}
              />

              <FilterSection
                title="24h Volume"
                icon={<HiOutlineChartBar className="w-4 h-4" />}
                options={VOLUME_OPTIONS}
                value={filters.volume}
                onChange={(v) => updateFilter('volume', v as MarketFilterState['volume'])}
                color={AX.cyan}
              />

              <FilterSection
                title="Probability"
                icon={<HiOutlineTrendingUp className="w-4 h-4" />}
                options={PROBABILITY_OPTIONS}
                value={filters.probability}
                onChange={(v) => updateFilter('probability', v as MarketFilterState['probability'])}
                color={AX.purple}
              />
            </div>

            {/* Footer with active filters summary */}
            {activeFilterCount > 0 && (
              <div
                className="px-4 py-3 text-xs"
                style={{
                  backgroundColor: `${AX.accent}08`,
                  borderTop: `1px solid ${AX.border}`,
                  color: AX.muted,
                }}
              >
                <span style={{ color: AX.accent }}>{activeFilterCount}</span> filter{activeFilterCount !== 1 ? 's' : ''} applied
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper function to apply filters to markets
export function applyMarketFilters<T extends {
  status: string;
  closesAt: string;
  volume24h: number;
  yesPrice: number;
}>(
  markets: T[],
  filters: MarketFilterState
): T[] {
  return markets.filter((market) => {
    // Hide resolved toggle (takes priority)
    if (filters.hideResolved && market.status === 'resolved') {
      return false;
    }

    // Status filter
    if (filters.status !== 'all') {
      if (filters.status === 'active' && market.status !== 'active') return false;
      if (filters.status === 'closed' && market.status !== 'closed') return false;
      if (filters.status === 'resolved' && market.status !== 'resolved') return false;
    }

    // Ending filter
    if (filters.ending !== 'all') {
      const closesAt = new Date(market.closesAt).getTime();
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      switch (filters.ending) {
        case 'today':
          if (closesAt > now + dayMs) return false;
          break;
        case 'week':
          if (closesAt > now + 7 * dayMs) return false;
          break;
        case 'month':
          if (closesAt > now + 30 * dayMs) return false;
          break;
        case 'later':
          if (closesAt <= now + 30 * dayMs) return false;
          break;
      }
    }

    // Volume filter (based on 24h volume)
    if (filters.volume !== 'all') {
      const volume = market.volume24h;
      switch (filters.volume) {
        case 'high':
          if (volume < 100000) return false;
          break;
        case 'medium':
          if (volume < 10000 || volume >= 100000) return false;
          break;
        case 'low':
          if (volume >= 10000) return false;
          break;
      }
    }

    // Probability filter (based on YES price)
    if (filters.probability !== 'all') {
      const prob = market.yesPrice;
      switch (filters.probability) {
        case 'high':
          if (prob < 0.7) return false;
          break;
        case 'medium':
          if (prob < 0.3 || prob >= 0.7) return false;
          break;
        case 'low':
          if (prob >= 0.3) return false;
          break;
      }
    }

    return true;
  });
}
