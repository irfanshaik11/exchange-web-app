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
import { FiCopy } from "react-icons/fi";

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

const HeaderColumnSection = ({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) => {
  return (
    <div className="flex min-w-[90px] flex-col items-start gap-1">
      <span className="text-xs leading-none text-neutral-400">{label}</span>
      <span className="mt-0.5 text-sm leading-none text-white">
        {value} 
      </span>
    </div>
  );
};

const TradeHeader: React.FC<TradeHeaderProps> = ({ token, mockData }) => {
  return (
    <div className="mb-2 flex w-full items-center justify-between rounded-lg bg-neutral-900 px-3 py-1.5">
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
              {token.symbol}
            </span>
            <span className="truncate text-sm leading-none text-neutral-400">
              {token.name}
            </span>
            <FiCopy className="ml-1 cursor-pointer text-xs text-neutral-400" />
          </div>
          <div className="mt-1 flex items-center gap-2">
            {/* Age with gold circle and clock */}
            <span className="flex items-center text-xs font-semibold">
              <span className="text-green-300">{mockData.age}</span>
            </span>
            {/* Website, Holders, Search icons */}
            <FaGlobe className="cursor-pointer text-[15px] text-blue-300 hover:text-blue-400" />
            <FaUser className="cursor-pointer text-[15px] text-blue-300 hover:text-blue-400" />
            <FaSearch className="cursor-pointer text-[15px] text-blue-300 hover:text-blue-400" />
          </div>
        </div>
      </div>
      {/* Center: Price, Liquidity, Supply, Global Fees Paid */}
      <div className="flex flex-1 items-center justify-center gap-10">
        <div>
          <span className="text-base leading-tight font-medium text-white">
            $
            {Number(token.fullyDilutedValuation).toLocaleString(undefined, {
              maximumFractionDigits: 8,
            })}
          </span>
        </div>
        {/* Price */}
        <HeaderColumnSection label={'Price'} value={`$${token.priceUsd}`} />
        <HeaderColumnSection label={'Liquidity'} value={`$${Number(token.liquidity).toLocaleString(undefined, {maximumFractionDigits: 2,})}`} />
        {/* Supply */}
        <div className="flex min-w-[70px] flex-col items-start">
          <span className="text-xs leading-none text-neutral-400">Supply</span>
          <span className="text-base leading-tight font-semibold text-white">
            {mockData.supply}
          </span>
        </div>
        {/* Global Fees Paid + Crown */}
        <div className="flex min-w-[120px] flex-col items-start">
          <span className="text-xs leading-none text-neutral-400">
            Global Fees Paid
          </span>
          <span className="flex items-center gap-2 text-base leading-tight font-semibold text-blue-300">
            <span className="font-bold text-blue-300">
              Ξ {mockData.globalFees}
            </span>
            <FaCrown className="ml-1 text-[15px] text-yellow-400" />
            <span className="ml-0.5 text-sm text-white">
              {mockData.crownCount || 1}
            </span>
          </span>
        </div>
      </div>
      {/* Right: Action Icons */}
      <div className="flex items-center gap-4 pr-1 text-lg text-neutral-300">
        <FaFilter className="cursor-pointer text-[17px] hover:text-white" />
        <FaShareAlt className="cursor-pointer text-[17px] hover:text-white" />
        <FaEye className="cursor-pointer text-[17px] hover:text-white" />
        <FaStar className="cursor-pointer text-[17px] hover:text-white" />
        <FaRegSquare className="cursor-pointer text-[17px] hover:text-white" />
      </div>
    </div>
  );
};

export default TradeHeader;
