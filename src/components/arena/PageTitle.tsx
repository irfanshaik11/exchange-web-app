/**
 * PageTitle Component
 *
 * Shared title component for Arena-style pages (Arena, Leaderboard, Referrals)
 * Features matte gold button with white shine text
 */

import React from 'react';
import { GiTrophy } from 'react-icons/gi';
import { FiChevronDown } from 'react-icons/fi';

interface PageTitleProps {
  title: string;
  subtitle?: string;
}

export const PageTitle = ({ title }: PageTitleProps) => {
  return (
    <div className="flex justify-center mb-8">
      {/* Matte gold button style */}
      <div
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg"
        style={{
          background: 'linear-gradient(180deg, rgba(120, 100, 40, 0.7) 0%, rgba(80, 65, 25, 0.8) 100%)',
          border: '1px solid rgba(180, 150, 60, 0.4)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
        }}
      >
        {/* Trophy icon */}
        <GiTrophy className="w-5 h-5 text-amber-400" />

        {/* Title text with white shine */}
        <span
          className="font-bold text-base tracking-wide"
          style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #e5d9a8 50%, #d4c080 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {title.toUpperCase()}
        </span>

        {/* Dropdown arrow */}
        <FiChevronDown className="w-4 h-4 text-amber-400/70" />
      </div>
    </div>
  );
};

export default PageTitle;
