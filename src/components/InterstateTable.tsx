import React, { useEffect } from "react";
import {
  FaUser,
  FaGlobe,
  FaSearch,
  FaCopy,
  FaCheckCircle,
  FaQuestionCircle,
} from "react-icons/fa";
import InterstateButton from "./InterstateButton";
import { useRouter } from "next/router";
import type { Token } from "~/utils/db";
import Link from "next/link";
import { formatSmartNumber } from '~/utils/db';

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
}

export default function InterstateTable({ rows, onQuickBuy, sortKey, sortDirection, setSort }: InterstateTableProps) {
  const router = useRouter();
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

  useEffect(() => {
    console.log(sortedRows);
  }, [sortedRows]);
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
          {sortedRows.map(({ token, i }) => (
            <tr
              className="cursor-pointer transition hover:bg-neutral-800/60"
              key={token.token_address}
              onClick={() => router.push(`/trade/${token.token_address}`)}
            >
                {/* Pair Info */}
                <td className="w-auto px-3 py-2 align-middle">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded border border-yellow-400 bg-neutral-800">
                      <img
                        src={token.logo}
                        alt={token.name}
                        width={32}
                        height={32}
                        className="h-8 w-8 object-cover"
                      />
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <div className="flex items-center gap-1">
                        <span className="truncate text-xs leading-tight font-bold text-white">
                          {token.name}
                        </span>
                        <span className="truncate text-[11px] font-medium text-neutral-400">
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
                    {["+18.43%", "+103.5%", "+35.71%", "-96.2%"][i % 4]}
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
                    {formatSmartNumber((token.total_buy_volume_24h || 0) + (token.total_sell_volume_24h || 0))}
                  </div>
                </td>
                {/* TXNS */}
                <td className="px-3 py-2 align-middle">
                  <div className="text-xs text-neutral-100">
                    {formatSmartNumber((token.total_buys_24h) + (token.total_sells_24h))}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold">
                    <span className="text-emerald-400">
                      {formatSmartNumber(token.total_buys_24h)}
                    </span>
                    <span className="text-neutral-400"> / </span>
                    <span className="text-red-400">
                      {formatSmartNumber(token.total_sells_24h)}
                    </span>
                    </div>
                </td>
                {/* Audit Log */}
                <td className="px-3 py-2 align-middle">
                  <div className="flex flex-col gap-0.5">
                    {/* No top_holders_percentage or paid_audit in new Token type, so these are commented out or replaced with placeholders */}
                    {/* <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-red-400">
                      <FaUser className="text-xs text-red-400" />{" "}
                      {token.top_holders_percentage}%
                    </span> */}
                    {/* <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                      <FaCheckCircle className="text-xs text-emerald-400" />{" "}
                      {token.paid_audit ? "Yes" : "No"}
                    </span> */}
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
                    Buy 0.05 SOL
                  </InterstateButton>
                </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
