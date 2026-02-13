/**
 * ArenaPageToggle Component
 *
 * A toggle bar for switching between Arena and Referrals pages.
 * Styled to match the Gold/Quest Leaderboard toggle design.
 */

import Link from 'next/link';
import { GiTrophy } from 'react-icons/gi';
import { FiUsers } from 'react-icons/fi';

interface ArenaPageToggleProps {
  activePage: 'arena' | 'referrals';
}

export default function ArenaPageToggle({ activePage }: ArenaPageToggleProps) {
  return (
    <div className="flex items-center justify-center mb-6">
      <div className="flex items-center rounded-full bg-[#1a1b1f] p-1">
        <Link href="/outpost">
          <button
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all cursor-pointer ${
              activePage === 'arena'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <GiTrophy size={16} />
            Outpost
          </button>
        </Link>
        <Link href="/referrals">
          <button
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all cursor-pointer ${
              activePage === 'referrals'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <FiUsers size={16} />
            Referrals
          </button>
        </Link>
      </div>
    </div>
  );
}
