import React from 'react';
import { motion } from 'framer-motion';
import {
  HiOutlineGlobeAlt,
  HiOutlineScale,
  HiOutlineCurrencyDollar,
  HiOutlineTrendingUp,
  HiOutlineFilm,
  HiOutlineBeaker,
  HiOutlineLightningBolt,
  HiOutlineClock,
  HiOutlineChartBar,
  HiOutlineSparkles
} from 'react-icons/hi';
import { BiFootball, BiBitcoin } from 'react-icons/bi';
import type { IconType } from 'react-icons';

const AX = {
  bg: "#0a0b0d",
  surface: "#12141a",
  surface2: "#0e1012",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  // Vibrant accent
  accent: "#4ADE80",
  accentGlow: "rgba(74, 222, 128, 0.3)",
};

export interface Category {
  id: string;
  label: string;
  icon: IconType;
  color: string;
  count?: number;
}

// Vibrant category colors
const categories: Category[] = [
  { id: 'all', label: 'All Markets', icon: HiOutlineGlobeAlt, color: '#4ADE80' },
  { id: 'politics', label: 'Politics', icon: HiOutlineScale, color: '#818CF8' },
  { id: 'crypto', label: 'Crypto', icon: BiBitcoin, color: '#FBBF24' },
  { id: 'sports', label: 'Sports', icon: BiFootball, color: '#4ADE80' },
  { id: 'economics', label: 'Economics', icon: HiOutlineTrendingUp, color: '#22D3EE' },
  { id: 'entertainment', label: 'Entertainment', icon: HiOutlineFilm, color: '#F472B6' },
  { id: 'science', label: 'Science', icon: HiOutlineBeaker, color: '#FB923C' },
];

interface CategoryFilterProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categoryCounts?: Record<string, number>;
}

export default function CategoryFilter({
  selectedCategory,
  onSelectCategory,
  categoryCounts = {},
}: CategoryFilterProps) {
  return (
    <div className="flex gap-1 flex-shrink-0">
        {categories.map((category) => {
          const isActive = selectedCategory === category.id;
          const count = category.id === 'all'
            ? Object.values(categoryCounts).reduce((a, b) => a + b, 0)
            : categoryCounts[category.id] || 0;
          const IconComponent = category.icon;

          return (
            <motion.button
              key={category.id}
              onClick={() => onSelectCategory(category.id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="relative flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium text-sm transition-all duration-200 cursor-pointer"
              style={{
                backgroundColor: isActive ? `${category.color}15` : 'transparent',
                color: isActive ? category.color : AX.muted,
                border: isActive ? `1px solid ${category.color}30` : '1px solid transparent',
              }}
            >
              {/* Active indicator glow */}
              {isActive && (
                <motion.div
                  layoutId="activeCategory"
                  className="absolute inset-0 rounded-lg"
                  style={{
                    background: `radial-gradient(ellipse at center, ${category.color}10 0%, transparent 70%)`,
                  }}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}

              <IconComponent className="relative z-10 w-4 h-4" />
              <span className="relative z-10 whitespace-nowrap hidden sm:inline">{category.label}</span>

              {/* Count badge */}
              {count > 0 && (
                <span
                  className="relative z-10 px-1.5 py-0.5 rounded-full text-[10px] font-semibold hidden md:inline"
                  style={{
                    backgroundColor: isActive ? `${category.color}25` : AX.surface2,
                    color: isActive ? category.color : AX.muted,
                  }}
                >
                  {count}
                </span>
              )}
            </motion.button>
          );
        })}
    </div>
  );
}

// Sort options component
export type SortOption = 'hot' | 'new' | 'ending' | 'volume';

interface SortFilterProps {
  selectedSort: SortOption;
  onSelectSort: (sort: SortOption) => void;
}

const sortOptions: { id: SortOption; label: string; icon: IconType }[] = [
  { id: 'hot', label: 'Hot', icon: HiOutlineLightningBolt },
  { id: 'new', label: 'New', icon: HiOutlineSparkles },
  { id: 'ending', label: 'Ending Soon', icon: HiOutlineClock },
  { id: 'volume', label: 'Volume', icon: HiOutlineChartBar },
];

export function SortFilter({ selectedSort, onSelectSort }: SortFilterProps) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {sortOptions.map((option) => {
        const isActive = selectedSort === option.id;
        const IconComponent = option.icon;

        return (
          <motion.button
            key={option.id}
            onClick={() => onSelectSort(option.id)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="relative px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer"
            style={{
              backgroundColor: isActive ? AX.accent + '20' : 'transparent',
              color: isActive ? AX.accent : AX.muted,
              border: isActive ? `1px solid ${AX.accent}30` : '1px solid transparent',
            }}
          >
            {isActive && (
              <motion.div
                layoutId="activeSort"
                className="absolute inset-0 rounded-lg"
                style={{ backgroundColor: AX.accent + '10' }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <IconComponent className="w-4 h-4" />
              <span className="hidden sm:inline">{option.label}</span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
