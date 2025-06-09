import React from "react";
import type { DexToken } from "~/utils/moralis";
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
} from "react-icons/fa";

interface TradeHeaderProps {
  token: DexToken;
  mockData: {
    supply: string;
    globalFees: string;
    age: string;
    holders?: string;
    website?: string;
    crownCount?: number;
  };
}

const TradeHeader: React.FC<TradeHeaderProps> = ({ token, mockData }) => {
  return (
    <div className="flex w-full items-center justify-between rounded-lg px-2 py-2">
      {/* Left: Logo and Info */}
      <div className="flex min-w-0 items-center gap-3">
        {/* Logo */}
        <img
          src={token.logo}
          alt={token.name}
          width={40}
          height={40}
          className="min-h-[40px] min-w-[40px]"
        />
        {/* Symbol, Name, Age */}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-bold text-white">
              {token.symbol}
            </span>
            <span className="truncate text-sm text-neutral-400">
              {token.name}
            </span>
            {/* Age with gold circle and clock */}
          </div>
          {/* Icons row: website, holders, search */}
          <div className="mt-1 flex items-center gap-3 text-sm text-blue-300">
            <span className="ml-2 flex items-center text-xs">
              <span className="text-green-300">{mockData.age}</span>
            </span>
            <FaGlobe className="cursor-pointer hover:text-blue-400" />
            <FaUser className="cursor-pointer hover:text-blue-400" />
            <FaSearch className="cursor-pointer hover:text-blue-400" />
          </div>
        </div>
      </div>
      {/* Center: Price, Liquidity, Supply, Global Fees Paid */}
      <div className="flex flex-1 items-center justify-center gap-8">
        {/* Price (large) */}
        <div className="flex flex-col items-start">
          <span className="text-xs text-neutral-400">Price</span>
          <span className="text-2xl font-bold text-white">
            $
            {Number(token.priceUsd).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
            K
          </span>
        </div>
        {/* Liquidity */}
        <div className="flex flex-col items-start">
          <span className="text-xs text-neutral-400">Liquidity</span>
          <span className="text-base font-semibold text-white">
            $
            {Number(token.liquidity).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
            K
          </span>
        </div>
        {/* Supply */}
        <div className="flex flex-col items-start">
          <span className="text-xs text-neutral-400">Supply</span>
          <span className="text-base font-semibold text-white">
            {mockData.supply}
          </span>
        </div>
        {/* Global Fees Paid + Crown */}
        <div className="flex flex-col items-start">
          <span className="text-xs text-neutral-400">Global Fees Paid</span>
          <span className="flex items-center gap-1 text-base font-semibold text-blue-300">
            <span className="text-blue-300">Ξ {mockData.globalFees}</span>
            <FaCrown className="ml-2 text-yellow-400" />
            <span className="ml-1 text-white">{mockData.crownCount || 1}</span>
          </span>
        </div>
      </div>
      {/* Right: Action Icons */}
      <div className="flex items-center gap-4 text-lg text-neutral-300">
        <FaFilter className="cursor-pointer hover:text-white" />
        <FaShareAlt className="cursor-pointer hover:text-white" />
        <FaEye className="cursor-pointer hover:text-white" />
        <FaStar className="cursor-pointer hover:text-white" />
        <FaRegSquare className="cursor-pointer hover:text-white" />
      </div>
    </div>
  );
};

export default TradeHeader;
