import React from 'react';
import Link from 'next/link';
import useBnbDevTokens from '~/hooks/useBnbDevTokens';

const BNB_GREEN = '#F3BA2F';

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function formatUsd(val: number) {
  if (!Number.isFinite(val) || val <= 0) return '$0';
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${Math.round(val)}`;
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

export default function BnbDevTokensTable({
  tokenAddress,
  enabled = true,
  onTotalCountChange,
}: {
  tokenAddress: string;
  enabled?: boolean;
  onTotalCountChange?: (count: number) => void;
}) {
  const { tokens, creatorWallet, isLoading, error } = useBnbDevTokens(tokenAddress, { enabled });

  React.useEffect(() => {
    onTotalCountChange?.(tokens.length);
  }, [tokens.length, onTotalCountChange]);

  if (error) {
    return <div className="w-full p-4 text-xs text-red-400">{error}</div>;
  }

  return (
    <div className="flex h-full w-full flex-col" style={{ backgroundColor: '#101114' }}>
      {creatorWallet && (
        <div className="border-b border-neutral-800 px-3 py-2 text-[11px] text-neutral-400">
          Dev wallet:{' '}
          <a
            href={`https://bscscan.com/address/${creatorWallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-300 hover:underline"
          >
            {shortAddr(creatorWallet)}
          </a>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pb-18">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-black">
            <tr className="border-b border-neutral-800 text-neutral-400">
              <th className="px-2 py-2 text-left">Token</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-left">MC</th>
              <th className="px-2 py-2 text-left">Liquidity</th>
              <th className="px-2 py-2 text-left">Volume</th>
              <th className="px-2 py-2 text-left">Age</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-neutral-500">
                  Loading dev tokens...
                </td>
              </tr>
            ) : tokens.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-neutral-500">
                  No other tokens from this dev found in pulse.
                </td>
              </tr>
            ) : (
              tokens.map((token) => (
                <tr key={token.mint} className="border-b border-neutral-900 hover:bg-neutral-900/60">
                  <td className="px-2 py-2">
                    <Link
                      href={`/bnb-trade/${token.mint}`}
                      className="text-white hover:underline"
                    >
                      <div className="font-medium">{token.symbol || shortAddr(token.mint)}</div>
                      <div className="text-[10px] text-neutral-500">{token.name || token.mint}</div>
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-neutral-300">{token.status || '-'}</td>
                  <td className="px-2 py-2" style={{ color: BNB_GREEN }}>
                    {formatUsd(token.marketCapUsd)}
                  </td>
                  <td className="px-2 py-2 text-neutral-300">{formatUsd(token.liquidityUsd)}</td>
                  <td className="px-2 py-2 text-neutral-300">{formatUsd(token.volume24hUsd)}</td>
                  <td className="px-2 py-2 text-neutral-400">{getAge(token.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
