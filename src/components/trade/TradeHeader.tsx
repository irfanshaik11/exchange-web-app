import React from "react";
import type { Token } from "~/utils/db";
import {
  FaGlobe,
  FaUser,
  FaSearch,
  FaCrown,
  FaClock,
  FaFilter,
  FaShareAlt,
  FaEye,
  FaStar,
  FaRegSquare,
  FaRegStar,
  FaExpand,
} from "react-icons/fa";
import { FiCopy, FiShare } from "react-icons/fi";
import { IoShareSocialOutline } from "react-icons/io5";
import { formatSmartNumber } from '~/utils/db';

// Helper function to format age
function getTokenAge(createdAt: string) {
  const createdDate = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - createdDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) {
    return `${diffDays}d`;
  } else if (diffHours > 0) {
    return `${diffHours}h`;
  } else {
    return `${diffMins}m`;
  }
}

interface TradeHeaderProps {
  token: Token;
}

const HeaderColumnSection = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-xs leading-none text-neutral-400">{label}</span>
      <span className="mt-0.5 text-sm leading-none text-white">{value}</span>
    </div>
  );
};

// Tooltip component
const Tooltip: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => {
  const [show, setShow] = React.useState(false);
  return (
    <span
      className="relative flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
    >
      {children}
      {show && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded bg-neutral-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow-lg">
          {label}
        </span>
      )}
    </span>
  );
};

const TradeHeader: React.FC<TradeHeaderProps> = ({ token }) => {
  return (
    <div className="mb-2 flex w-full items-center gap-6 rounded-lg px-3 py-1.5">
      {/* Left: Logo, Symbol, Name, Clipboard, Age */}
      <div className="flex min-w-0 items-center gap-3">
        {/* Logo */}
        <img
          src={token.logo}
          alt={token.name}
          width={36}
          height={36}
          className="min-h-[36px] min-w-[36px] rounded border border-neutral-800"
        />
        {/* Symbol, Name, Clipboard, Age */}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-base leading-none font-bold text-white">
              {token.name}
            </span>
            <span className="truncate text-sm leading-none text-neutral-400">
              {token.label}
            </span>
            <FiCopy className="ml-1 cursor-pointer text-xs text-neutral-400" />
          </div>
          <div className="mt-1 flex items-center gap-2">
            {/* Age with gold circle and clock */}
            <span className="flex items-center text-xs font-semibold">
              <span className="text-green-300">
                {getTokenAge(token.created_at)}
              </span>
            </span>
            {/* Website, Holders, Search icons */}
            <FaGlobe className="cursor-pointer text-[15px] text-blue-300 hover:text-blue-400" />
            <FaUser className="cursor-pointer text-[15px] text-blue-300 hover:text-blue-400" />
            <FaSearch className="cursor-pointer text-[15px] text-blue-300 hover:text-blue-400" />
          </div>
        </div>
      </div>
      {/* Center: Price, Liquidity, Supply, Global Fees Paid */}
      <div className="flex items-center justify-center gap-4">
        <div className="text-base leading-tight font-medium text-white">
          ${formatSmartNumber(token.market_cap_total).toLocaleString()}
        </div>
        {/* Price */}
        <HeaderColumnSection
          label={"Price"}
          value={`$${formatSmartNumber(token.price_native)}`}
        />
        <HeaderColumnSection
          label={"Liquidity"}
          value={`$${formatSmartNumber(token.liquidity)}`}
        />
        <HeaderColumnSection
          label={"Supply"}
          value={formatSmartNumber(token.supply)}
        />
        <HeaderColumnSection
          label={"Global Fees Paid"}
          value={
            <span className="flex items-center gap-2 text-blue-300">
              <span className="font-bold">Ξ {token.global_fees_paid}</span>
            </span>
          }
        />
      </div>
      {/* Right: Action Icons */}
      <div className="mr-0 ml-auto flex items-center gap-4 pr-1 text-lg text-neutral-300">
        <Tooltip label="Share token pair">
          <IoShareSocialOutline className="cursor-pointer text-[17px] duration-50 ease-in hover:text-emerald-400" />
        </Tooltip>
        <Tooltip label="Add token to Watchlist">
          <FaRegStar className="cursor-pointer text-[17px] duration-50 ease-in hover:text-emerald-400" />
        </Tooltip>
        <Tooltip label="Expand Chart">
          <FaExpand className="cursor-pointer text-[17px] duration-50 ease-in hover:text-emerald-400" />
        </Tooltip>
      </div>
    </div>
  );
};

export default TradeHeader;
