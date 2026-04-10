/**
 * ArenaPageToggle Component
 *
 * A toggle bar for switching between Airdrop Genesis, Referrals, and
 * Leaderboard pages. All three share the same top-level navigation context
 * under the Airdrop Genesis umbrella.
 */

import Link from "next/link";
import { GiTrophy } from "react-icons/gi";
import { FiUsers, FiBarChart2 } from "react-icons/fi";

interface ArenaPageToggleProps {
  activePage: "arena" | "referrals" | "leaderboard";
}

export default function ArenaPageToggle({ activePage }: ArenaPageToggleProps) {
  const baseBtn =
    "flex items-center gap-2 px-4 py-2 rounded-full transition-all cursor-pointer";
  const activeBtn =
    "bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-semibold";
  const inactiveBtn = "text-gray-400 hover:text-white";

  return (
    <div className="mb-6 flex items-center justify-center">
      <div className="flex items-center rounded-full bg-[#1a1b1f] p-1">
        <Link href="/airdrop-genesis">
          <button
            className={`${baseBtn} ${activePage === "arena" ? activeBtn : inactiveBtn}`}
          >
            <GiTrophy size={16} />
            Airdrop Genesis
          </button>
        </Link>
        <Link href="/referrals">
          <button
            className={`${baseBtn} ${activePage === "referrals" ? activeBtn : inactiveBtn}`}
          >
            <FiUsers size={16} />
            Referrals
          </button>
        </Link>
        <Link href="/leaderboard">
          <button
            className={`${baseBtn} ${activePage === "leaderboard" ? activeBtn : inactiveBtn}`}
          >
            <FiBarChart2 size={16} />
            Leaderboard
          </button>
        </Link>
      </div>
    </div>
  );
}
