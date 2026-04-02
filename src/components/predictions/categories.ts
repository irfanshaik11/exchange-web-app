import {
  HiOutlineTrendingUp,
  HiOutlineScale,
  HiOutlineBeaker,
  HiOutlineCloud,
  HiOutlineFilm,
  HiOutlineGlobeAlt,
  HiOutlineChip,
  HiOutlineHome,
} from 'react-icons/hi';
import { BiFootball, BiBitcoin } from 'react-icons/bi';
import { T } from './theme';

export interface NavCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

export const CATEGORIES: NavCategory[] = [
  { id: 'all', label: 'All Markets', icon: HiOutlineHome, color: T.accent },
  { id: 'politics', label: 'Politics', icon: HiOutlineScale, color: '#818CF8' },
  { id: 'sports', label: 'Sports', icon: BiFootball, color: '#4ADE80' },
  { id: 'crypto', label: 'Crypto', icon: BiBitcoin, color: '#FBBF24' },
  { id: 'finance', label: 'Finance', icon: HiOutlineTrendingUp, color: '#60A5FA' },
  { id: 'tech', label: 'AI & Tech', icon: HiOutlineChip, color: '#A78BFA' },
  { id: 'entertainment', label: 'Entertainment', icon: HiOutlineFilm, color: '#F472B6' },
  { id: 'science', label: 'Science', icon: HiOutlineBeaker, color: '#FB923C' },
  { id: 'weather', label: 'Weather', icon: HiOutlineCloud, color: '#38BDF8' },
  { id: 'geopolitics', label: 'Geopolitics', icon: HiOutlineGlobeAlt, color: '#F97316' },
];
