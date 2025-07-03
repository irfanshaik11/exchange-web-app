import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  FaUser,
  FaGlobe,
  FaSearch,
  FaCopy,
  FaQuestionCircle,
} from "react-icons/fa";
import InterstateButton from "./InterstateButton";
import InterstateTooltip from './InterstateTooltip';
import CustomCheckbox from './CustomCheckbox';
import { useRouter } from "next/router";
import type { Token as BaseToken } from "~/utils/db";
import { formatSmartNumber } from '~/utils/db';
import SkeletonRow from './InterstateTable/SkeletonRow';

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

// Helper functions
const getTokenStat = (token: Token, stat: string, timeframe: string): number => {
  const key = `${stat}_${timeframe}`;
  const val = (token as any)[key];
  return typeof val === 'number' ? val : parseFloat(val) || 0;
};

const formatPercentChange = (val: number): string => {
  if (val === 0) return '0.00';
  return (val > 0 ? '+' : '') + formatSmartNumber(val);
};

const getSortableValue = (token: Token, key: string): number => {
  let val = (token as any)[key];
  if (typeof val === 'string') {
    val = val.replace(/[$,\s]/g, '');
  }
  const num = parseFloat(val);
  return isNaN(num) ? -Infinity : num;
};

// Table Header Component
const TableHeader: React.FC<{
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: string) => void;
}> = ({ sortKey, sortDirection, onSort }) => {
  const headers = [
    { key: 'name', label: 'Pair Info' },
    { key: 'fully_diluted_value', label: 'Market Cap' },
    { key: 'total_liquidity_usd', label: 'Liquidity' },
    { key: 'volume', label: 'Volume' },
    { key: 'txns', label: 'TXNS' },
    { key: null, label: 'Audit Log' },
    { key: null, label: 'Action' },
  ];

  return (
    <thead>
      <tr className="bg-neutral-800/80">
        {headers.map((header, idx) => (
          <th
            key={idx}
            className={`px-3 py-4 text-left text-xs font-bold tracking-wide text-neutral-200 uppercase ${
              header.key ? 'cursor-pointer' : ''
            }`}
            onClick={header.key && onSort ? () => onSort(header.key!) : undefined}
          >
            {header.label}{' '}
            {header.key && sortKey === header.key && (sortDirection === 'asc' ? '▲' : '▼')}
          </th>
        ))}
      </tr>
    </thead>
  );
};

// Token Info Component
const TokenInfo: React.FC<{ token: Token; i: number; sortedRows: InterstateTableRow[] }> = ({ token, i, sortedRows }) => {
  const similarTokens = useMemo(() => 
    sortedRows
      .filter(row => row.token.token_address !== token.token_address)
      .sort((a, b) => {
        const diffA = Math.abs(a.token.fully_diluted_value - token.fully_diluted_value);
        const diffB = Math.abs(b.token.fully_diluted_value - token.fully_diluted_value);
        return diffA - diffB;
      })
      .slice(0, 2), [token, sortedRows]);

  const tooltipContent = (
    <div className="p-2">
      <div className="mb-2 flex justify-center">
        <img
          src={token.logo}
          alt={token.name}
          width={200}
          height={200}
          className="border border-neutral-700"
        />
      </div>
      <div className="mb-2 text-center">
        <div className="text-xl font-bold text-white">{token.name}</div>
        <div className="text-base font-medium text-neutral-400 mb-2">({token.symbol})</div>
        <p className="text-lg font-semibold text-white">
          ${formatSmartNumber(token.usd_price)}{' '}
          <span className={`text-base ${token.price_percent_change_1h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatPercentChange(token.price_percent_change_1h)}%
          </span>
        </p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <span className="text-sm font-semibold text-emerald-400">1h</span>
          <FaUser className="text-sm text-sky-400" />
          <FaGlobe className="text-sm text-sky-400" />
          <FaSearch className="text-sm text-sky-400" />
          <FaCopy className="ml-1 cursor-pointer text-sm text-neutral-500" />
        </div>
      </div>
      <div className="border-t border-neutral-700 pt-2 mt-2">
        <p className="mb-1 text-xs font-semibold text-neutral-300">Similar Tokens:</p>
        <ul className="text-xs text-neutral-500 space-y-1">
          {similarTokens.map((similarTokenRow, idx) => (
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
              <span className="text-[10px] text-neutral-500">
                {similarTokenRow.token.created_at 
                  ? `${Math.floor((Date.now() - new Date(similarTokenRow.token.created_at).getTime()) / (1000 * 60 * 60 * 24))}d` 
                  : '-'}
              </span>
              <span className="text-[10px] text-neutral-500">
                TX: {formatSmartNumber(
                  getTokenStat(similarTokenRow.token, 'total_buy_volume', '1h') + 
                  getTokenStat(similarTokenRow.token, 'total_sell_volume', '1h')
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      <InterstateTooltip
        width={300}
        height={undefined}
        xOffset="ml-0"
        label={tooltipContent}
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186c-.197-.74-.777-1.32-1.517-1.517C20.34 4.333 12 4.333 12 4.333s-8.34 0-9.981.336c-.74.197-1.32.777-1.517 1.517C.166 7.827.166 12 .166 12s0 4.173.336 5.814c.197.74.777 1.32 1.517 1.517C3.66 19.667 12 19.667 12 19.667s8.34 0 9.981-.336c.74-.197 1.32-.777 1.517-1.517.336-1.641.336-5.814.336-5.814s0-4.173-.336-5.814zM9.797 15.568V8.432l6.568 3.568-6.568 3.568z" />
              </svg>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// Table Row Component
const TableRow: React.FC<{
  token: Token;
  i: number;
  selectedTimeframe: string;
  onQuickBuy?: (token: Token) => void;
  quickBuyAmount: number | string;
  animationState: Record<string, 'up' | 'down' | null>;
  sortedRows: InterstateTableRow[];
  onClick: () => void;
}> = React.memo(({ token, i, selectedTimeframe, onQuickBuy, quickBuyAmount, animationState, sortedRows, onClick }) => {
  const priceKey = `${token.token_address}-usd_price`;
  const percentFieldKey = `${token.token_address}-price_percent_change_${selectedTimeframe}`;
  
  const handleQuickBuy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onQuickBuy) {
      onQuickBuy(token);
    } else {
      onClick();
    }
  }, [onQuickBuy, token, onClick]);

  return (
    <tr className="cursor-pointer transition hover:bg-neutral-800/60" onClick={onClick}>
      <td className="w-auto px-3 py-2 align-middle">
        <TokenInfo token={token} i={i} sortedRows={sortedRows} />
      </td>
      
      <td className="px-3 py-2 align-middle min-w-[90px] text-right">
        <div className="text-xs text-neutral-100">
          {formatSmartNumber(token.fully_diluted_value)}
        </div>
        <div
          className={`mt-0.5 text-[11px] font-semibold ${
            i === 3 ? "text-red-400" : "text-emerald-400"
          } min-w-[70px] text-right inline-block ${
            animationState[percentFieldKey] === 'up' ? 'price-animate-up' : 
            animationState[percentFieldKey] === 'down' ? 'price-animate-down' : ''
          }`}
        >
          {formatPercentChange(getTokenStat(token, 'price_percent_change', selectedTimeframe))}%
        </div>
      </td>
      
      <td className="px-3 py-2 align-middle min-w-[90px] text-right">
        <div className="text-xs text-neutral-100">
          {formatSmartNumber(token.total_liquidity_usd)}
        </div>
      </td>
      
      <td className="px-3 py-2 align-middle min-w-[90px] text-right">
        <span className={`$${
          animationState[priceKey] === 'up' ? 'price-animate-up' : 
          animationState[priceKey] === 'down' ? 'price-animate-down' : ''
        }`} style={{ display: 'inline-block', minWidth: 70 }}>
          {formatSmartNumber(
            getTokenStat(token, 'total_buy_volume', selectedTimeframe) +
            getTokenStat(token, 'total_sell_volume', selectedTimeframe)
          )}
        </span>
      </td>
      
      <td className="px-3 py-2 align-middle min-w-[70px] text-right">
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
      
      <td className="px-3 py-2 align-middle">
        <div className="flex flex-col gap-0.5">
          {typeof token.dexPaid !== 'undefined' && (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold">
              <CustomCheckbox checked={!!token.dexPaid} onChange={() => {}} disabled className="mr-1" /> 
              Dex Paid
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-sky-300">
            <FaQuestionCircle className="text-xs text-sky-300" /> Off
          </span>
        </div>
      </td>
      
      <td className="px-3 py-2 align-middle">
        <InterstateButton
          variant="primary"
          size="sm"
          className="!px-4 !py-1 text-xs"
          onClick={handleQuickBuy}
        >
          {`Buy ${quickBuyAmount} SOL`}
        </InterstateButton>
      </td>
    </tr>
  );
});

TableRow.displayName = 'TableRow';

// Main Component
export default function InterstateTable({ 
  rows, 
  onQuickBuy, 
  sortKey, 
  sortDirection, 
  setSort, 
  selectedTimeframe, 
  quickBuyAmount = 0.05, 
  skeletonRowCount = 6 
}: InterstateTableProps) {
  const router = useRouter();
  const [animationState, setAnimationState] = useState<Record<string, 'up' | 'down' | null>>({});
  const prevValuesRef = useRef<Record<string, number>>({});

  // Memoize sorted rows
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const aVal = getSortableValue(a.token, sortKey);
      const bVal = getSortableValue(b.token, sortKey);
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [rows, sortKey, sortDirection]);

  // Animation effect
  useEffect(() => {
    const newAnimationState: Record<string, 'up' | 'down' | null> = {};
    const newPrevValues = { ...prevValuesRef.current };
    
    rows.forEach(({ token }) => {
      // Price animation
      const priceKey = `${token.token_address}-usd_price`;
      const price = token.usd_price;
      if (priceKey in prevValuesRef.current) {
        if (price > prevValuesRef.current[priceKey]) {
          newAnimationState[priceKey] = 'up';
        } else if (price < prevValuesRef.current[priceKey]) {
          newAnimationState[priceKey] = 'down';
        }
      }
      newPrevValues[priceKey] = price;

      // Percent change animation
      const percentFieldKey = `${token.token_address}-price_percent_change_${selectedTimeframe}`;
      const percentValue = (token as any)[`price_percent_change_${selectedTimeframe}`] ?? 0;
      if (percentFieldKey in prevValuesRef.current) {
        if (percentValue > prevValuesRef.current[percentFieldKey]) {
          newAnimationState[percentFieldKey] = 'up';
        } else if (percentValue < prevValuesRef.current[percentFieldKey]) {
          newAnimationState[percentFieldKey] = 'down';
        }
      }
      newPrevValues[percentFieldKey] = percentValue;
    });

    setAnimationState(newAnimationState);
    prevValuesRef.current = newPrevValues;

    if (Object.keys(newAnimationState).length > 0) {
      const timeout = setTimeout(() => setAnimationState({}), 300);
      return () => clearTimeout(timeout);
    }
  }, [rows, selectedTimeframe]);

  return (
    <div className="overflow-x-auto border border-neutral-800 bg-neutral-900/80 shadow-lg">
      <style jsx>{`
        .price-animate-up {
          background: rgba(52, 211, 153, 0.5);
          animation: pulse-green 0.5s cubic-bezier(0.4,0,0.2,1);
        }
        .price-animate-down {
          background: rgba(248, 113, 113, 0.5);
          animation: pulse-red 0.5s cubic-bezier(0.4,0,0.2,1);
        }
        @keyframes pulse-green {
          0% { background: rgba(52, 211, 153, 0.5); }
          100% { background: transparent; }
        }
        @keyframes pulse-red {
          0% { background: rgba(248, 113, 113, 0.5); }
          100% { background: transparent; }
        }
      `}</style>
      
      <table className="min-w-full divide-y divide-neutral-800 table-fixed">
        <TableHeader 
          sortKey={sortKey} 
          sortDirection={sortDirection} 
          onSort={setSort} 
        />
        
        <tbody className="divide-y divide-neutral-800">
          {sortedRows.length === 0 ? (
            Array.from({ length: skeletonRowCount }).map((_, idx) => (
              <SkeletonRow key={idx} />
            ))
          ) : (
            sortedRows.map(({ token, i }) => (
              <TableRow
                key={token.token_address}
                token={token}
                i={i}
                selectedTimeframe={selectedTimeframe}
                onQuickBuy={onQuickBuy}
                quickBuyAmount={quickBuyAmount}
                animationState={animationState}
                sortedRows={sortedRows}
                onClick={() => router.push(`/trade/${token.token_address}`)}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}