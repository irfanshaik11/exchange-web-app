import React from 'react';
import { useMoralisSniperHoldings } from '../hooks/useMoralisSniperHoldings';

const isDev = process.env.NODE_ENV !== 'production';

interface SniperHoldingsDisplayProps {
  pairAddress?: string;
  chainId?: string;
  blocksAfterCreation?: number;
  showDetails?: boolean;
}

const SniperHoldingsDisplay: React.FC<SniperHoldingsDisplayProps> = ({ 
  pairAddress, 
  chainId = 'eth',
  blocksAfterCreation = 1000,
  showDetails = false 
}) => {
  const { data, loading, error } = useMoralisSniperHoldings({
    pairAddress,
    chainId,
    blocksAfterCreation,
    enabled: !!pairAddress
  });

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toFixed(0);
  };

  const formatPercentage = (num: number): string => {
    return `${num.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
        <span>Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-1 text-xs text-red-400">
        <span>Error</span>
      </div>
    );
  }

  // Debug logging
  if (isDev && data) {
    console.log('SniperHoldingsDisplay data:', {
      pairAddress,
      totalSnipers: data.totalSnipers,
      totalSnipedUsd: data.totalSnipedUsd,
      hasValidData: data.totalSnipedUsd > 0
    });
  }

  if (!data || data.totalSnipers === 0 || data.totalSnipedUsd === 0) {
    return <span className="text-xs">-</span>;
  }

  if (showDetails) {
    return (
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-green-400">{data.totalSnipers}</span>
          <span>snipers</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-blue-400">${formatNumber(data.totalSnipedUsd)}</span>
          <span>sniped</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`${data.averageProfitPercentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatPercentage(data.averageProfitPercentage)}
          </span>
          <span>avg profit</span>
        </div>
      </div>
    );
  }

  // Simple display for table rows
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-green-400 font-semibold">{data.totalSnipers}</span>
      <span className="text-blue-400">${formatNumber(data.totalSnipedUsd)}</span>
    </div>
  );
};

export default SniperHoldingsDisplay;
