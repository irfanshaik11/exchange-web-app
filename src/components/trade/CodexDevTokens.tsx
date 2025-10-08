import React from 'react';
import { formatSmartNumber } from '~/utils/db';
import useCodexDevTokens from '../../hooks/useCodexDevTokens';
import type { Token } from '~/utils/db';

interface CodexDevTokensProps {
  token: Token;
}

function getAge(timestamp: number) {
  const now = Date.now() / 1000;
  const diffSeconds = now - timestamp;
  const diffMins = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffSeconds / 3600);
  const diffDays = Math.floor(diffSeconds / 86400);
  
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  return `${diffMins}m`;
}

function formatMarketCap(marketCap: string) {
  const cap = parseFloat(marketCap);
  if (cap >= 1000000) {
    return `$${(cap / 1000000).toFixed(1)}M`;
  } else if (cap >= 1000) {
    return `$${(cap / 1000).toFixed(1)}K`;
  }
  return `$${cap.toFixed(0)}`;
}

function formatLiquidity(liquidity: string) {
  // Handle null, undefined, or empty string
  if (!liquidity || liquidity === 'null' || liquidity === 'undefined') {
    return '$0';
  }
  
  const liq = parseFloat(liquidity);
  if (isNaN(liq)) {
    return '$0';
  }
  
  if (liq >= 1000000) {
    return `$${(liq / 1000000).toFixed(1)}M`;
  } else if (liq >= 1000) {
    return `$${(liq / 1000).toFixed(1)}K`;
  }
  return `$${liq.toFixed(0)}`;
}

function formatVolume(volume: string) {
  const vol = parseFloat(volume);
  if (vol >= 1000000) {
    return `$${(vol / 1000000).toFixed(1)}M`;
  } else if (vol >= 1000) {
    return `$${(vol / 1000).toFixed(1)}K`;
  }
  return `$${vol.toFixed(0)}`;
}

const CodexDevTokens: React.FC<CodexDevTokensProps> = ({ token }) => {
  const { tokens, isLoading, error } = useCodexDevTokens(token.mint, {
    limit: 10
  });

  return (
    <div className="w-full h-full flex flex-col">

      
      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg flex-shrink-0">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
        <thead className="sticky top-0 bg-gray-900 z-10">
          <tr className="text-neutral-400 border-b border-neutral-800">
            <th className="px-2 py-2 text-left">Token ↓</th>
            <th className="px-2 py-2 text-left">Migrated</th>
            <th className="px-2 py-2 text-left">Market Cap</th>
            <th className="px-2 py-2 text-left">Liquidity</th>
            <th className="px-2 py-2 text-left">1h Volume</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={5} className="text-center py-6 text-neutral-500">
                Loading dev tokens...
              </td>
            </tr>
          ) : !tokens || tokens.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center py-6 text-neutral-500">
                No dev tokens found.
              </td>
            </tr>
          ) : (
            tokens.map((devToken, idx) => {
              const age = getAge(devToken.token.createdAt);
              const marketCap = formatMarketCap(devToken.marketCap);
              const liquidity = formatLiquidity(devToken.liquidity);
              const volume = formatVolume(devToken.volume24);
              
              // Debug logging
              console.log('Dev Token Data:', {
                name: devToken.token.name,
                symbol: devToken.token.symbol,
                rawLiquidity: devToken.liquidity,
                formattedLiquidity: liquidity,
                rawMarketCap: devToken.marketCap,
                rawVolume: devToken.volume24
              });
              
              return (
                <tr key={devToken.token.address} className="border-b border-neutral-800 hover:bg-neutral-800/60">
                  <td className="px-2 py-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-xs">⚔️</span>
                      </div>
                      <div>
                        <div className="text-white font-semibold">{devToken.token.symbol}</div>
                        <div className="text-neutral-500 text-xs">{age} ago</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center">
                      <span className="text-pink-400">✗</span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="text-white font-semibold">{marketCap}</div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="text-white font-semibold">{liquidity}</div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="text-white font-semibold">{volume}</div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        </table>
      </div>
    </div>
  );
};

export default CodexDevTokens;
