import React, { useEffect, useState } from 'react';
import { FaStar } from 'react-icons/fa';
import type { DexToken } from "../utils/moralis";

interface WatchlistModalProps {
  open: boolean;
  onClose: () => void;
}

export default function WatchlistModal({ open, onClose }: WatchlistModalProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (open) {
      setShow(true);
    } else {
      const timeout = setTimeout(() => setShow(false), 220);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  if (!open && !show) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-colors duration-500 ${open ? 'bg-black/40' : 'bg-black/0'}`}
      style={{ backdropFilter: 'blur(2px)' }}
    >
      <div
        className={`bg-neutral-900 rounded-xl shadow-2xl w-full max-w-2xl p-6 relative text-neutral-100 transform transition-all duration-500
          ${open ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-75 translate-y-2'}`}
      >
        <button
          className="absolute top-3 right-3 text-neutral-400 hover:text-white text-xl"
          onClick={onClose}
        >
          ×
        </button>
        <div className="text-lg font-bold mb-4">Watchlist</div>
        <div className="w-full overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-800">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Token</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Market Cap</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">1h Volume</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Liquidity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Actions</th>
              </tr>
            </thead>
          </table>
          <div className="flex flex-col items-center justify-center py-16">
            <FaStar className="text-4xl text-neutral-500 mb-4" />
            <div className="text-lg font-semibold mb-2">Your watchlist is empty</div>
            <div className="text-neutral-400 text-sm text-center max-w-xs">
              Add tokens to your watchlist by clicking the star icon on any token page
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 