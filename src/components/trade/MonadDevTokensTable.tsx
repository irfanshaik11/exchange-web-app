import React from 'react';
import { formatSmartNumber } from '~/utils/db';
import useMonadDevTokens from '../../hooks/useMonadDevTokens';

// Monad candle colors (matches chart colors)
const MONAD_GREEN = '#86d99f';
const MONAD_RED = '#f26682';

interface MonadDevTokensTableProps {
  tokenAddress: string | undefined;
  enabled?: boolean;
}

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

const MonadDevTokensTable: React.FC<MonadDevTokensTableProps> = ({ 
  tokenAddress, 
  enabled = true 
}) => {
  const { devTokenData, isLoading, error } = useMonadDevTokens(tokenAddress, {
    enabled,
  });

  if (error) {
    return (
      <div className="w-full p-4">
        <div className="mb-4 p-2 rounded-lg" style={{ backgroundColor: `${MONAD_RED}20`, border: `1px solid ${MONAD_RED}4D` }}>
          <p className="text-xs" style={{ color: MONAD_RED }}>{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full p-4">
        <div className="text-center py-6 text-neutral-500">
          Loading dev token data...
        </div>
      </div>
    );
  }

  if (!devTokenData) {
    return (
      <div className="w-full p-4">
        <div className="text-center py-6 text-neutral-500">
          No dev token data found.
        </div>
      </div>
    );
  }

  const netVolumeUsd = devTokenData.buy_volume_usd - devTokenData.sell_volume_usd;

  return (
    <div className="w-full h-full flex flex-col bg-black">
      <div className="flex-1 min-h-0 bg-black" style={{ overflowX: 'auto' }}>
        <table className="w-full text-xs border-collapse bg-black">
          <thead className="sticky top-0 bg-black z-10">
            <tr className="text-neutral-400 border-b border-neutral-800">
              <th className="px-2 py-2 text-left whitespace-nowrap">Dev Wallet</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">Hold %</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">MON Balance</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">Token Balance</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">Buy Count</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">Buy Volume (USD)</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">Sell Count</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">Sell Volume (USD)</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">Net Volume (USD)</th>
            </tr>
          </thead>
          <tbody className="bg-black">
            <tr className="border-b border-neutral-900 hover:bg-neutral-900/60 bg-black">
              {/* Dev Wallet */}
              <td className="px-2 py-2 text-neutral-300 whitespace-nowrap">
                <a
                  href={`https://monadvision.com/address/${devTokenData.dev_wallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 hover:underline font-mono"
                  onClick={(e) => e.stopPropagation()}
                >
                  {shortAddr(devTokenData.dev_wallet)}
                </a>
              </td>
              
              {/* Hold % */}
              <td className="px-2 py-2 text-neutral-300 whitespace-nowrap">
                {devTokenData.dev_hold_percent.toFixed(2)}%
              </td>
              
              {/* MON Balance */}
              <td className="px-2 py-2 text-neutral-300">
                <div>
                  <div className="font-semibold whitespace-nowrap">{formatSmartNumber(devTokenData.mon_balance)}</div>
                  <div className="text-xs text-neutral-500 whitespace-nowrap">
                    ${formatSmartNumber(devTokenData.mon_balance_usd)}
                  </div>
                </div>
              </td>
              
              {/* Token Balance */}
              <td className="px-2 py-2 text-neutral-300 whitespace-nowrap">
                {formatSmartNumber(devTokenData.token_balance)}
              </td>
              
              {/* Buy Count */}
              <td className="px-2 py-2 text-neutral-300 whitespace-nowrap">
                {devTokenData.buy_count}
              </td>
              
              {/* Buy Volume (USD) */}
              <td className="px-2 py-2 whitespace-nowrap" style={{ color: MONAD_GREEN }}>
                ${formatSmartNumber(devTokenData.buy_volume_usd)}
              </td>
              
              {/* Sell Count */}
              <td className="px-2 py-2 text-neutral-300 whitespace-nowrap">
                {devTokenData.sell_count}
              </td>
              
              {/* Sell Volume (USD) */}
              <td className="px-2 py-2 whitespace-nowrap" style={{ color: MONAD_RED }}>
                ${formatSmartNumber(devTokenData.sell_volume_usd)}
              </td>
              
              {/* Net Volume (USD) */}
              <td className="px-2 py-2 font-semibold whitespace-nowrap" style={{ color: netVolumeUsd >= 0 ? MONAD_GREEN : MONAD_RED }}>
                {netVolumeUsd >= 0 ? '+' : ''}${formatSmartNumber(netVolumeUsd)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MonadDevTokensTable;

