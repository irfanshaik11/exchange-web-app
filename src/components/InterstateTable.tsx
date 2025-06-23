import React, { useEffect, useState } from "react";
import {
  FaUser,
  FaGlobe,
  FaSearch,
  FaCopy,
  FaCheckCircle,
  FaQuestionCircle,
} from "react-icons/fa";
import InterstateButton from "./InterstateButton";
import InterstatePopout from "./InterstatePopout";
import { useRouter } from "next/router";
import type { Token as BaseToken } from "~/utils/db";
import Link from "next/link";
import { formatSmartNumber } from '~/utils/db';

import InterstateTooltip from './InterstateTooltip';
import CustomCheckbox from './CustomCheckbox';
// Extend Token type locally to include optional dexPaid
type Token = BaseToken & { dexPaid?: boolean };

export interface InterstateTableRow {
  token: Token;
  i: number;
}

interface InterstateTableProps {
  rows: InterstateTableRow[];
  onQuickBuy?: (token: Token) => void;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  setSort?: (key: string) => void;
  selectedTimeframe: '5m' | '1h' | '6h' | '24h';
  quickBuyAmount?: number | string;
  skeletonRowCount?: number;
}

// Helper to map timeframe to token property suffix
function getTokenStat(token: Token, stat: string, timeframe: '5m' | '1h' | '6h' | '24h'): number {
  const key = `${stat}_${timeframe}`;
  // @ts-ignore
  const val = token[key];
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

function formatPercentChange(val: number): string {
  if (val === 0) return '0.00';
  const sign = val > 0 ? '+' : '';
  return sign + formatSmartNumber(val);
}

export default function InterstateTable({ rows, onQuickBuy, sortKey, sortDirection, setSort, selectedTimeframe, quickBuyAmount = 0.05, skeletonRowCount = 6 }: InterstateTableProps) {
  const router = useRouter();
  const [hoveredToken, setHoveredToken] = useState<Token | null>(null);
  // Helper to get sortable value from token
  function getSortableValue(token: Token, key: string) {
    let val = token[key];
    if (typeof val === 'string') {
      // Remove commas, $ signs, and whitespace
      val = val.replace(/[$,\s]/g, '');
    }
    const num = parseFloat(val);
    if (isNaN(num)) return -Infinity;
    return num;
  }
  // Sort rows if sortKey is provided
  let sortedRows = rows;
  console.log(sortedRows)
  if (sortKey) {
    sortedRows = [...rows].sort((a, b) => {
      const aVal = getSortableValue(a.token, sortKey);
      const bVal = getSortableValue(b.token, sortKey);
      if (sortDirection === 'asc') {
        return aVal - bVal;
      } else {
        return bVal - aVal;
      }
    });
  }
  // Helper to handle header click
  const handleSort = (key: string) => {
    if (!setSort) return;
    setSort(key);
  };

  return (
    <div className="overflow-x-auto border border-neutral-800 bg-neutral-900/80 shadow-lg">
      <table className="min-w-full divide-y divide-neutral-800">
        <thead>
          <tr className="bg-neutral-800/80">
            <th className="px-3 py-4 text-left text-xs font-bold tracking-wide text-neutral-200 uppercase cursor-pointer" onClick={() => handleSort('name')}>
              Pair Info {sortKey === 'name' && (sortDirection === 'asc' ? '▲' : '▼')}
            </th>
            <th className="px-3 py-4 text-left text-xs font-bold tracking-wide text-neutral-200 uppercase cursor-pointer" onClick={() => handleSort('fully_diluted_value')}>
              Market Cap {sortKey === 'fully_diluted_value' && (sortDirection === 'asc' ? '▲' : '▼')}
            </th>
            <th className="px-3 py-4 text-left text-xs font-bold tracking-wide text-neutral-200 uppercase cursor-pointer" onClick={() => handleSort('total_liquidity_usd')}>
              Liquidity {sortKey === 'total_liquidity_usd' && (sortDirection === 'asc' ? '▲' : '▼')}
            </th>
            <th className="px-3 py-4 text-left text-xs font-bold tracking-wide text-neutral-200 uppercase cursor-pointer" onClick={() => handleSort('volume')}>
              Volume {sortKey === 'volume' && (sortDirection === 'asc' ? '▲' : '▼')}
            </th>
            <th className="flex items-center gap-1 px-3 py-4 text-left text-xs font-bold tracking-wide text-neutral-200 uppercase cursor-pointer" onClick={() => handleSort('txns')}>
              TXNS {sortKey === 'txns' && (sortDirection === 'asc' ? '▲' : '▼')}
            </th>
            <th className="px-3 py-4 text-left text-xs font-bold tracking-wide text-neutral-200 uppercase">
              Audit Log
            </th>
            <th className="px-3 py-4 text-left text-xs font-bold tracking-wide text-neutral-200 uppercase">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {sortedRows.length === 0 ? (
            // Skeleton loader rows
            Array.from({ length: skeletonRowCount }).map((_, idx) => (
              <tr key={idx}>
                {/* Pair Info skeleton */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-12 w-12 rounded bg-neutral-800 animate-pulse" />
                    <div className="flex flex-col gap-2">
                      <div className="h-4 w-24 rounded bg-neutral-800 animate-pulse" />
                      <div className="h-3 w-16 rounded bg-neutral-800 animate-pulse" />
                    </div>
                  </div>
                </td>
                {/* Market Cap skeleton */}
                <td className="px-3 py-2">
                  <div className="h-4 w-20 rounded bg-neutral-800 animate-pulse mb-2" />
                  <div className="h-3 w-12 rounded bg-neutral-800 animate-pulse" />
                </td>
                {/* Liquidity skeleton */}
                <td className="px-3 py-2">
                  <div className="h-4 w-20 rounded bg-neutral-800 animate-pulse" />
                </td>
                {/* Volume skeleton */}
                <td className="px-3 py-2">
                  <div className="h-4 w-20 rounded bg-neutral-800 animate-pulse" />
                </td>
                {/* TXNS skeleton */}
                <td className="px-3 py-2">
                  <div className="h-4 w-12 rounded bg-neutral-800 animate-pulse mb-2" />
                  <div className="h-3 w-16 rounded bg-neutral-800 animate-pulse" />
                </td>
                {/* Audit Log skeleton */}
                <td className="px-3 py-2">
                  <div className="h-3 w-12 rounded bg-neutral-800 animate-pulse mb-2" />
                  <div className="h-3 w-16 rounded bg-neutral-800 animate-pulse" />
                </td>
                {/* Action skeleton */}
                <td className="px-3 py-2">
                  <div className="h-10 w-28 rounded-full bg-neutral-800 animate-pulse" />
                </td>
              </tr>
            ))
          ) : (
            sortedRows.map(({ token, i }) => (
              <tr
                className="cursor-pointer transition hover:bg-neutral-800/60"
                key={token.token_address}
                onClick={() => router.push(`/trade/${token.token_address}`)}
              >
                  {/* Pair Info */}
                  <td className="w-auto px-3 py-2 align-middle">
                    <div className="flex items-center gap-2">
                      <InterstateTooltip
                        width={300}
                        height={undefined}
                        xOffset="ml-0"
                        label={
                          <div className="p-2">
                            {/* Enlarged Picture (top, centered) */}
                            <div className="mb-2 flex justify-center">
                              <img
                                src={token.logo}
                                alt={token.name}
                                width={200}
                                height={200}
                                className="border border-neutral-700"
                              />
                            </div>

                            {/* Token Details below image - Re-arranged to match image */}
                            <div className="mb-2 text-center">
                              <div className="text-xl font-bold text-white">
                                {token.name}
                              </div>
                              <div className="text-base font-medium text-neutral-400 mb-2">
                                ({token.symbol})
                              </div>
                              <p className="text-lg font-semibold text-white">
                                ${formatSmartNumber(token.usd_price)} <span className={`text-base ${token.price_percent_change_1h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatPercentChange(token.price_percent_change_1h)}%</span>
                              </p>
                              <div className="mt-2 flex items-center justify-center gap-2">
                                <span className="text-sm font-semibold text-emerald-400">
                                  1h
                                </span>
                                <FaUser className="text-sm text-sky-400" />
                                <FaGlobe className="text-sm text-sky-400" />
                                <FaSearch className="text-sm text-sky-400" />
                                <FaCopy className="ml-1 cursor-pointer text-sm text-neutral-500" />
                              </div>
                            </div>

                            {/* Similar Tokens */}
                            <div className="border-t border-neutral-700 pt-2 mt-2">
                              <p className="mb-1 text-xs font-semibold text-neutral-300">
                                Similar Tokens:
                              </p>
                              <ul className="text-xs text-neutral-500 space-y-1">
                                {sortedRows
                                  .filter(row => row.token.token_address !== token.token_address) // Exclude the current token
                                  .sort((a, b) => {
                                    const diffA = Math.abs(a.token.fully_diluted_value - token.fully_diluted_value);
                                    const diffB = Math.abs(b.token.fully_diluted_value - token.fully_diluted_value);
                                    return diffA - diffB;
                                  }) // Sort by market cap similarity
                                  .slice(0, 2) // Take up to 2 similar tokens
                                  .map((similarTokenRow, idx) => (
                                    <li key={idx} className="flex items-center gap-2">
                                      <img
                                        src={similarTokenRow.token.logo}
                                        alt={similarTokenRow.token.name}
                                        width={32}
                                        height={32}
                                        className="border border-neutral-700"
                                      />
                                      <span className="text-neutral-300 truncate max-w-[80px]">
                                        {similarTokenRow.token.name}
                                      </span>
                                      {/* Using a placeholder for age and getting actual TX data */}
                                      <span className="text-[10px] text-neutral-500">{similarTokenRow.token.created_at ? `${Math.floor((new Date().getTime() - new Date(similarTokenRow.token.created_at).getTime()) / (1000 * 60 * 60 * 24))}d` : '-'}</span>
                                      <span className="text-[10px] text-neutral-500">
                                        TX: {formatSmartNumber(getTokenStat(similarTokenRow.token, 'total_buy_volume', '1h') + getTokenStat(similarTokenRow.token, 'total_sell_volume', '1h'))}
                                      </span>
                                    </li>
                                  ))}
                              </ul>
                            </div>
                          </div>
                        }
                      >
                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded border border-yellow-400 bg-neutral-800">
                          <img
                            src={token.logo}
                            alt={token.name}
                            width={48}
                            height={48}
                            className="h-12 w-12 object-cover"
                        />
                        </div>
                        </InterstateTooltip>
                        <div className="flex min-w-0 flex-col">
                          <div className="flex items-center gap-1">
                            <span className="truncate text-sm leading-tight font-bold text-white">
                              {token.name}
                            </span>
                            <span className="truncate text-xs font-medium text-neutral-400">
                              {token.symbol}
                            </span>
                            <FaCopy className="ml-1 cursor-pointer text-xs text-neutral-500" />
                          </div>
                          <div className="mt-0.5 flex items-center gap-1">
                            <span className="text-[11px] font-semibold text-emerald-400">
                              {[56, 26, 31, 14][i % 4]}m
                            </span>
                            <FaUser className="text-xs text-sky-400" />
                            <FaGlobe className="text-xs text-sky-400" />
                            <FaSearch className="text-xs text-sky-400" />
                            {i === 1 && (
                              <span className="text-red-600">
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                >
                                  <path d="M23.498 6.186c-.197-.74-.777-1.32-1.517-1.517C20.34 4.333 12 4.333 12 4.333s-8.34 0-9.981.336c-.74.197-1.32.777-1.517 1.517C.166 7.827.166 12 .166 12s0 4.173.336 5.814c.197.74.777 1.32 1.517 1.517C3.66 19.667 12 19.667 12 19.667s8.34 0 9.981-.336c.74-.197 1.32-.777 1.517-1.517.336-1.641.336-5.814.336-5.814s0-4.173-.336-5.814zM9.797 15.568V8.432l6.568 3.568-6.568 3.568z" />
                                </svg>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Market Cap */}
                    <td className="px-3 py-2 align-middle">
                      <div className="text-xs text-neutral-100">
                        {formatSmartNumber(token.fully_diluted_value)}
                      </div>
                      <div
                        className={`mt-0.5 text-[11px] font-semibold ${i === 3 ? "text-red-400" : "text-emerald-400"}`}
                      >
                        {formatPercentChange(getTokenStat(token, 'price_percent_change', selectedTimeframe))}%
                      </div>
                    </td>
                    {/* Liquidity */}
                    <td className="px-3 py-2 align-middle">
                      <div className="text-xs text-neutral-100">
                        {formatSmartNumber(token.total_liquidity_usd)}
                      </div>
                    </td>
                    {/* Volume */}
                    <td className="px-3 py-2 align-middle">
                      <div className="text-xs text-neutral-100">
                        {formatSmartNumber(
                          getTokenStat(token, 'total_buy_volume', selectedTimeframe) +
                          getTokenStat(token, 'total_sell_volume', selectedTimeframe)
                        )}
                      </div>
                    </td>
                    {/* TXNS */}
                    <td className="px-3 py-2 align-middle">
                      <div className="text-xs text-neutral-100">
                        {formatSmartNumber(
                          getTokenStat(token, 'total_buys', selectedTimeframe) +
                          getTokenStat(token, 'total_sells', selectedTimeframe)
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] font-semibold">
                        <span className="text-emerald-400">
                          {formatSmartNumber(getTokenStat(token, 'total_buys', selectedTimeframe))}
                        </span>
                        <span className="text-neutral-400"> / </span>
                        <span className="text-red-400">
                          {formatSmartNumber(getTokenStat(token, 'total_sells', selectedTimeframe))}
                        </span>
                      </div>
                    </td>
                    {/* Audit Log */}
                    <td className="px-3 py-2 align-middle">
                      <div className="flex flex-col gap-0.5">
                        {/* Dex Paid indicator */}
                        {typeof token.dexPaid !== 'undefined' && (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold">
                            <CustomCheckbox checked={!!token.dexPaid} onChange={() => {}} disabled className="mr-1" /> Dex Paid
                          </span>
                        )}
                        {/* Other audit info or placeholder */}
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-sky-300">
                          <FaQuestionCircle className="text-xs text-sky-300" /> Off
                        </span>
                      </div>
                    </td>
                    {/* Action */}
                    <td className="px-3 py-2 align-middle">
                      <InterstateButton
                        variant="primary"
                        size="sm"
                        className="!px-4 !py-1 text-xs"
                        onClick={e => {
                          e.stopPropagation();
                          if (onQuickBuy) {
                            onQuickBuy(token);
                          } else {
                            router.push(`/trade/${token.token_address}`);
                          }
                        }}
                      >
                        {`Buy ${quickBuyAmount} SOL`}
                      </InterstateButton>
                    </td>
                </tr>
              ))
          )}
        </tbody>
      </table>
    </div>
  );
}
