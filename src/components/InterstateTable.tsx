import React from "react";
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
import type { DexToken } from "~/utils/moralis";
import Link from "next/link";

export interface InterstateTableRow {
  token: DexToken;
  i: number;
}

interface InterstateTableProps {
  rows: InterstateTableRow[];
}

export default function InterstateTable({ rows }: InterstateTableProps) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto border border-neutral-800 bg-neutral-900/80 shadow-lg">
      <table className="min-w-full divide-y divide-neutral-800">
        <thead>
          <tr className="bg-neutral-800/80">
            <th className="px-3 py-4 text-left text-xs font-bold tracking-wide text-neutral-200 uppercase">
              Pair Info
            </th>
            <th className="px-3 py-4 text-left text-xs font-bold tracking-wide text-neutral-200 uppercase">
              Market Cap
            </th>
            <th className="px-3 py-4 text-left text-xs font-bold tracking-wide text-neutral-200 uppercase">
              Liquidity
            </th>
            <th className="px-3 py-4 text-left text-xs font-bold tracking-wide text-neutral-200 uppercase">
              Volume
            </th>
            <th className="flex items-center gap-1 px-3 py-4 text-left text-xs font-bold tracking-wide text-neutral-200 uppercase">
              TXNS <span className="text-[10px]">↓</span>
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
          {rows.map(({ token, i }) => (
            <tr
              className="cursor-pointer transition hover:bg-neutral-800/60"
              key={token.tokenAddress}
              onClick={() => router.push(`/trade/${token.tokenAddress}`)}
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
                          Father Of Fartcoin
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
                    {formatUSD([397000, 189000, 36000, 4010][i % 4])}
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
                    {formatUSD([72700, 47500, 43900, 6890][i % 4])}
                  </div>
                </td>
                {/* Volume */}
                <td className="px-3 py-2 align-middle">
                  <div className="text-xs text-neutral-100">
                    {formatUSD([168000, 117000, 136000, 147000][i % 4])}
                  </div>
                </td>
                {/* TXNS */}
                <td className="px-3 py-2 align-middle">
                  <div className="text-xs text-neutral-100">
                    {[1550, 1500, 1390, 1380][i % 4] / 1000}K
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold">
                    <span className="text-emerald-400">
                      {[804, 736, 829, 507][i % 4]}
                    </span>
                    <span className="text-neutral-400"> / </span>
                    <span className="text-red-400">
                      {[751, 764, 563, 875][i % 4]}
                    </span>
                  </div>
                </td>
                {/* Audit Log */}
                <td className="px-3 py-2 align-middle">
                  <div className="flex flex-col gap-0.5">
                    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-red-400">
                      <FaUser className="text-xs text-red-400" />{" "}
                      {["18.27%", "21.67%", "17.77%", "6.9%"][i % 4]}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                      <FaCheckCircle className="text-xs text-emerald-400" />{" "}
                      {["100%", "100%", "???", "100%"][i % 4]}
                    </span>
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
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/trade/${token.tokenAddress}`);
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

// Helper for USD formatting
function formatUSD(value: number | string | undefined) {
  if (value === undefined || value === null || isNaN(Number(value))) return "-";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
