import React from 'react';
import { formatSmartNumber } from '~/utils/db';
import useBnbHoldersList from '~/hooks/useBnbHoldersList';

const BNB_GREEN = '#F3BA2F';

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function formatUsd(val: number) {
  if (!Number.isFinite(val) || val <= 0) return '$0';
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

function getAge(iso: string) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '-';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function BnbHoldersTable({
  tokenAddress,
  enabled = true,
  onTotalCountChange,
}: {
  tokenAddress: string;
  enabled?: boolean;
  onTotalCountChange?: (count: number) => void;
}) {
  const { holders, totalHolders, isLoading, error } = useBnbHoldersList(tokenAddress, {
    enabled,
  });

  React.useEffect(() => {
    if (totalHolders != null && totalHolders > 0) {
      onTotalCountChange?.(totalHolders);
    }
  }, [totalHolders, onTotalCountChange]);

  if (error) {
    return <div className="w-full p-4 text-xs text-red-400">{error}</div>;
  }

  return (
    <div className="flex h-full w-full flex-col" style={{ backgroundColor: '#101114' }}>
      <div className="min-h-0 flex-1 overflow-y-auto pb-18">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-black">
            <tr className="border-b border-neutral-800 text-neutral-400">
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Wallet</th>
              <th className="px-2 py-2 text-left">Balance</th>
              <th className="px-2 py-2 text-left">Value</th>
              <th className="px-2 py-2 text-left">Bought</th>
              <th className="px-2 py-2 text-left">Sold</th>
              <th className="px-2 py-2 text-left">Trades</th>
              <th className="px-2 py-2 text-left">Last</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-neutral-500">
                  Loading holders...
                </td>
              </tr>
            ) : holders.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-neutral-500">
                  No holders found.
                </td>
              </tr>
            ) : (
              holders.map((holder) => (
                <tr key={holder.wallet} className="border-b border-neutral-900 hover:bg-neutral-900/60">
                  <td className="px-2 py-2 text-neutral-400">{holder.rank}</td>
                  <td className="px-2 py-2">
                    <a
                      href={`https://bscscan.com/address/${holder.wallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-blue-300 hover:underline"
                    >
                      {shortAddr(holder.wallet)}
                    </a>
                  </td>
                  <td className="px-2 py-2 text-neutral-200">
                    {formatSmartNumber(holder.balance)}
                  </td>
                  <td className="px-2 py-2" style={{ color: BNB_GREEN }}>
                    {formatUsd(holder.balanceUsd)}
                  </td>
                  <td className="px-2 py-2 text-neutral-300">{formatUsd(holder.boughtUsd)}</td>
                  <td className="px-2 py-2 text-neutral-300">{formatUsd(holder.soldUsd)}</td>
                  <td className="px-2 py-2 text-neutral-300">
                    {holder.buyCount + holder.sellCount}
                  </td>
                  <td className="px-2 py-2 text-neutral-400">{getAge(holder.lastTradeAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
