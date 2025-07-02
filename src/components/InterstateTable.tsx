import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import type { Token as BaseToken } from "~/utils/db";
import { formatSmartNumber } from '~/utils/functions';
import TableHeader from './InterstateTable/TableHeader';
import TableRow from './InterstateTable/TableRow';
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
  const [animationState, setAnimationState] = useState<Record<string, string>>({});

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
          sortKey={sortKey || ''} 
          sortDirection={sortDirection || 'asc'} 
          onSort={setSort || (() => {})} 
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
                onClick={() => router.push(`/trade/${token.token_address}`)}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}