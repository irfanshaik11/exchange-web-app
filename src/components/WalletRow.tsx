import React, { useState, useEffect } from 'react';
import type { Wallet } from '~/utils/functions';

interface WalletRowProps {
  wallet: Wallet;
  onRemove: (address: string) => void;
}

export default function WalletRow({ wallet, onRemove }: WalletRowProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Simulate fetching real-time data
    setLoading(true);
    const fetchBalance = setTimeout(() => {
      // In a real application, you would fetch actual wallet balance here
      setBalance(parseFloat((Math.random() * 10000).toFixed(2))); // Dummy balance
      setLoading(false);
    }, 1500); // Simulate network delay

    return () => clearTimeout(fetchBalance);
  }, [wallet.address]); // Re-fetch when wallet address changes

  // Helper to format date or relative time
  const formatCreated = (timestamp: number) => {
    const today = new Date().toLocaleDateString();
    if (!timestamp || isNaN(timestamp)) return today;
    const now = Date.now();
    const diff = now - timestamp;
    const min = 60 * 1000;
    const hour = 60 * min;
    const day = 24 * hour;
    if (diff < day) {
      if (diff < hour) {
        const mins = Math.max(1, Math.floor(diff / min));
        return `${mins} min`;
      } else {
        const hours = Math.floor(diff / hour);
        return `${hours} hour${hours > 1 ? 's' : ''}`;
      }
    } else {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? today : date.toLocaleDateString();
    }
  };

  return (
    <tr key={wallet.address} className="border-b border-neutral-800/50 hover:bg-neutral-800/40 transition-all duration-200">
      <td className="w-24 px-1 py-1 text-neutral-400 text-[11px]">{formatCreated(wallet.createdAt)}</td>
      <td className="flex-1 px-1 py-1 font-mono text-neutral-200 text-[12px] flex items-center gap-1">
        <span className="text-base mr-1">{wallet.emoji || '��'}</span>
        <span className="truncate max-w-[90px]">{wallet.name || 'N/A'}</span>
        <span className="text-neutral-500">|</span>
        <span className="truncate max-w-[90px] text-neutral-500">{wallet.address}</span>
        <button 
          className="text-neutral-500 hover:text-white transition-colors duration-200 flex-shrink-0 p-0.5" 
          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(wallet.address); }}
          title="Copy address"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v2.25A2.25 2.25 0 0113.5 22h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25m11.25-9V7.5a2.25 2.25 0 00-2.25-2.25H9.75A2.25 2.25 0 007.5 7.5v2.25m9.75 9.75H13.5m-3.75 0H7.5M9 6.75V4.5A2.25 2.25 0 0111.25 2h1.5a2.25 2.25 0 012.25 2.25v2.25M10.5 10.5H13.5" /></svg>
        </button>
      </td>
      <td className="px-1 py-1 text-right flex items-center gap-2 justify-end">
        {loading ? (
          <span className="text-neutral-500 text-[11px] animate-pulse">...</span>
        ) : (
          <span className="text-emerald-400 text-[12px] font-medium">${balance?.toFixed(2)}</span>
        )}
        <button className="text-neutral-400 hover:text-white transition-colors duration-200 p-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.04 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
        </button>
        <button 
          className="text-red-400 hover:text-red-300 transition-colors duration-200 p-0.5"
          onClick={() => onRemove(wallet.address)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.92c-1.01 0-1.85-.75-1.992-1.874L5.323 6.075m1.022-.165L5.754 5.105a1.125 1.125 0 011.992-.858L12 8.752l3.254-4.505a1.125 1.125 0 011.992.858z" /></svg>
        </button>
      </td>
    </tr>
  );
} 