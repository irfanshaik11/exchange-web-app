import React from 'react';
import useBnbTopTraders from '~/hooks/useBnbTopTraders';

const BNB_GREEN = '#F3BA2F';
const BNB_RED = '#ef4444';

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

export default function BnbTopTradersTable({
  tokenAddress,
  enabled = true,
}: {
  tokenAddress: string;
  enabled?: boolean;
}) {
  const { traders, isLoading, error } = useBnbTopTraders(tokenAddress, { enabled });

  if (error) {
    return (
      <div className="w-full p-4 text-xs" style={{ color: BNB_RED }}>
        {error}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col" style={{ backgroundColor: '#101114' }}>
      <div className="min-h-0 flex-1 overflow-y-auto pb-18">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-black">
            <tr className="border-b border-neutral-800 text-neutral-400">
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Wallet</th>
              <th className="px-2 py-2 text-left">Trades</th>
              <th className="px-2 py-2 text-left">Bought</th>
              <th className="px-2 py-2 text-left">Sold</th>
              <th className="px-2 py-2 text-left">Volume</th>
              <th className="px-2 py-2 text-left">Realized P&L</th>
              <th className="px-2 py-2 text-left">Last</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-neutral-500">
                  Loading top traders...
                </td>
              </tr>
            ) : traders.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-neutral-500">
                  No top traders found.
                </td>
              </tr>
            ) : (
              traders.map((trader, idx) => (
                <tr key={trader.wallet} className="border-b border-neutral-900 hover:bg-neutral-900/60">
                  <td className="px-2 py-2 text-neutral-400">{idx + 1}</td>
                  <td className="px-2 py-2">
                    <a
                      href={`https://bscscan.com/address/${trader.wallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-blue-300 hover:underline"
                    >
                      {shortAddr(trader.wallet)}
                    </a>
                  </td>
                  <td className="px-2 py-2 text-neutral-300">
                    {trader.buyCount + trader.sellCount}
                  </td>
                  <td className="px-2 py-2" style={{ color: BNB_GREEN }}>
                    {formatUsd(trader.boughtUsd)}
                  </td>
                  <td className="px-2 py-2" style={{ color: BNB_RED }}>
                    {formatUsd(trader.soldUsd)}
                  </td>
                  <td className="px-2 py-2 text-white">{formatUsd(trader.totalVolumeUsd)}</td>
                  <td
                    className="px-2 py-2"
                    style={{ color: trader.realizedPnlUsd >= 0 ? BNB_GREEN : BNB_RED }}
                  >
                    {formatUsd(trader.realizedPnlUsd)}
                  </td>
                  <td className="px-2 py-2 text-neutral-400">{getAge(trader.lastTradeAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
