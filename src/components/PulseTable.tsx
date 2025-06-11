import React from 'react';
import type { Token } from '~/utils/db';
import { formatSmartNumber } from '~/utils/db';

interface PulseTableProps {
  title: string;
  tokens: Token[];
}

export default function PulseTable({ title, tokens }: PulseTableProps) {
  return (
    <div className="bg-neutral-900 rounded-xl shadow-lg p-4 flex-1 min-w-[340px] max-w-[420px] flex flex-col">
      <div className="text-lg font-bold mb-2 text-white flex items-center justify-between">
        {title}
        {/* Optionally add filter/sort controls here */}
      </div>
      <div className="overflow-y-auto max-h-[70vh] custom-scrollbar">
        {tokens.length === 0 ? (
          <div className="text-neutral-500 text-center py-8">No tokens found.</div>
        ) : (
          tokens.map((token, idx) => (
            <div key={token.token_address + idx} className="flex items-center gap-3 py-3 border-b border-neutral-800 last:border-b-0 hover:bg-neutral-800/40 transition group">
              {/* Logo */}
              <div className="w-12 h-12 bg-neutral-800 rounded flex items-center justify-center overflow-hidden">
                {token.logo ? (
                  <img src={token.logo} alt={token.symbol} className="w-10 h-10 object-contain" />
                ) : (
                  <span className="text-2xl font-bold text-neutral-400">{token.symbol?.[0] || '?'}</span>
                )}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white truncate max-w-[120px]">{token.symbol}</span>
                  <span className="text-neutral-400 text-xs truncate max-w-[120px]">{token.name}</span>
                  {token.is_verified_contract && <span className="ml-1 text-emerald-400 text-xs" title="Verified">✔</span>}
                </div>
                <div className="flex gap-2 mt-1 text-xs text-neutral-400">
                  <span>MC <span className="text-white">${formatSmartNumber(token.fully_diluted_value)}</span></span>
                  <span>V <span className="text-white">${formatSmartNumber(token[`total_buy_volume_24h`] + token[`total_sell_volume_24h`])}</span></span>
                </div>
              </div>
              {/* Stats */}
              <div className="flex flex-col items-end gap-1 min-w-[70px]">
                <button className="bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-full px-4 py-1 transition">0 SOL</button>
                {/* Add more stats or icons as needed */}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
} 