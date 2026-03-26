import React, { useRef, useState, useEffect } from 'react';
import { HiOutlineTrendingUp } from 'react-icons/hi';

// Sort options component — still exported for type compatibility
export type SortOption = 'hot' | 'new' | 'ending' | 'volume';

export interface Category {
  id: string;
  label: string;
  color: string;
  count?: number;
}

// ─── Unified nav items ────────────────────────────────────────────

interface NavItem {
  id: string;
  label: string;
  type: 'sort' | 'category';
  sortValue?: SortOption;
}

const NAV_ITEMS: NavItem[] = [
  // Sort presets
  { id: 'sort-hot',    label: 'Trending',    type: 'sort', sortValue: 'hot' },
  { id: 'sort-new',    label: 'New',         type: 'sort', sortValue: 'new' },
  { id: 'sort-ending', label: 'Ending Soon', type: 'sort', sortValue: 'ending' },
  // Category filters
  { id: 'all',         label: 'All',         type: 'category' },
  { id: 'politics',    label: 'Politics',    type: 'category' },
  { id: 'sports',      label: 'Sports',      type: 'category' },
  { id: 'crypto',      label: 'Crypto',      type: 'category' },
  { id: 'esports',     label: 'Esports',     type: 'category' },
  { id: 'finance',     label: 'Finance',     type: 'category' },
  { id: 'geopolitics', label: 'Geopolitics', type: 'category' },
  { id: 'tech',        label: 'Tech',        type: 'category' },
  { id: 'culture',     label: 'Culture',     type: 'category' },
  { id: 'economy',     label: 'Economy',     type: 'category' },
  { id: 'weather',     label: 'Weather',     type: 'category' },
  { id: 'science',     label: 'Science',     type: 'category' },
];

// ─── Component ────────────────────────────────────────────────────

interface MarketNavBarProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  selectedSort: SortOption;
  onSelectSort: (sort: SortOption) => void;
  /** Slot for right-aligned content (e.g. Filters button) */
  rightSlot?: React.ReactNode;
}

export default function CategoryFilter({
  selectedCategory,
  onSelectCategory,
  selectedSort,
  onSelectSort,
  rightSlot,
}: MarketNavBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setShowLeftFade(el.scrollLeft > 8);
      setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  const handleClick = (item: NavItem) => {
    if (item.type === 'sort' && item.sortValue) {
      onSelectSort(item.sortValue);
    } else if (item.type === 'category') {
      onSelectCategory(item.id);
    }
  };

  const isActive = (item: NavItem) => {
    if (item.type === 'sort') return selectedSort === item.sortValue;
    return selectedCategory === item.id;
  };

  const sortItems = NAV_ITEMS.filter(i => i.type === 'sort');
  const categoryItems = NAV_ITEMS.filter(i => i.type === 'category');

  return (
    <div className="flex items-center">
      {/* Scrollable nav items */}
      <div className="relative flex-1 min-w-0">
        {/* Left fade */}
        {showLeftFade && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 z-10"
            style={{ background: 'linear-gradient(to right, #0C0C0F 0%, transparent 100%)' }}
          />
        )}
        {/* Right fade */}
        {showRightFade && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 z-10"
            style={{ background: 'linear-gradient(to left, #0C0C0F 0%, transparent 100%)' }}
          />
        )}

        <div
          ref={scrollRef}
          className="flex items-center overflow-x-auto scrollbar-hide"
        >
          {/* Sort presets */}
          {sortItems.map((item, i) => {
            const active = isActive(item);
            return (
              <button
                key={item.id}
                onClick={() => handleClick(item)}
                className="relative flex-shrink-0 flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap sm:px-3 sm:py-1"
                style={{ color: active ? '#18c48c' : '#9ca3af' }}
              >
                {i === 0 && (
                  <HiOutlineTrendingUp
                    className="w-3.5 h-3.5"
                    style={{ color: active ? '#18c48c' : '#9ca3af' }}
                  />
                )}
                {item.label}
                {active && (
                  <span
                    className="absolute bottom-0 left-2.5 right-2.5 h-[2px] rounded-full sm:left-3 sm:right-3"
                    style={{ backgroundColor: '#18c48c' }}
                  />
                )}
              </button>
            );
          })}

          {/* Spacer gap between sorts and categories */}
          <div className="flex-shrink-0 w-3" />

          {/* Category filters */}
          {categoryItems.map((item) => {
            const active = isActive(item);
            return (
              <button
                key={item.id}
                onClick={() => handleClick(item)}
                className="relative flex-shrink-0 px-2.5 py-2 text-sm font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap sm:px-3 sm:py-1"
                style={{ color: active ? '#18c48c' : '#9ca3af' }}
              >
                {item.label}
                {active && (
                  <span
                    className="absolute bottom-0 left-2.5 right-2.5 h-[2px] rounded-full sm:left-3 sm:right-3"
                    style={{ backgroundColor: '#18c48c' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right slot (Filters button) — always visible, pushed right */}
      {rightSlot && (
        <div className="flex-shrink-0 ml-2">
          {rightSlot}
        </div>
      )}
    </div>
  );
}

// Legacy SortFilter export — kept for backward compatibility but no longer rendered separately
export function SortFilter({ selectedSort, onSelectSort }: { selectedSort: SortOption; onSelectSort: (sort: SortOption) => void }) {
  return null;
}
