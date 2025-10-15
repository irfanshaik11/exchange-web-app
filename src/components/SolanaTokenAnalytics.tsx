// COMMENTED OUT - Solana Token Analytics Component
/*
import React from 'react';
import { useTokenAnalytics } from '../hooks/useTokenAnalytics';

interface SolanaTokenAnalyticsProps {
  mintAddress?: string;
  metricType: 'sniper' | 'insider' | 'dev' | 'whale' | 'bundle' | 'kol';
  showDetails?: boolean;
}

const SolanaTokenAnalytics: React.FC<SolanaTokenAnalyticsProps> = ({ 
  mintAddress, 
  metricType,
  showDetails = false 
}) => {
  // If no mint address provided, show dash
  if (!mintAddress) {
    console.log('⚠️ No mint address provided for', metricType, 'metric');
    return <span className="text-xs text-gray-500">-</span>;
  }

  const { data, loading, error } = useTokenAnalytics({
    mintAddress,
    enabled: !!mintAddress,
  });

  const formatPercentage = (num: number): string => {
    return `${num.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
      </div>
    );
  }

  if (error) {
    console.log('SolanaTokenAnalytics error for', mintAddress, ':', error);
    return <span className="text-xs text-gray-500">0%</span>;
  }

  if (!data) {
    return <span className="text-xs text-gray-500">0%</span>;
  }
  
  // Debug log
  console.log('SolanaTokenAnalytics data for', mintAddress?.slice(0, 8), ':', data);

  // Get the appropriate metric value
  let value: number = 0;
  let label: string = '';

  switch (metricType) {
    case 'sniper':
      value = data.sniper_holding_percentage || 0;
      label = 'Sniper';
      break;
    case 'insider':
      value = data.insider_holding_percentage || 0;
      label = 'Insider';
      break;
    case 'dev':
      value = data.dev_holding_percentage || 0;
      label = 'Dev';
      break;
    case 'whale':
      value = data.whale_holding_percentage || 0;
      label = 'Whale';
      break;
    case 'bundle':
      value = data.bundle_holding_percentage || 0;
      label = 'Bundle';
      break;
    case 'kol':
      value = data.kols_percentage || 0;
      label = 'KOL';
      break;
  }
  
  console.log(`${label} for ${mintAddress?.slice(0, 8)}: ${value}`);

  // For whale metric, always show the value (even 0% is important)
  // For other metrics, show dash if value is very small
  const shouldShowZero = metricType === 'whale';
  
  if (value < 0.1 && !shouldShowZero) {
    return <span className="text-xs text-gray-500">0%</span>;
  }

  if (showDetails) {
    return (
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-1">
          <span className={value > 10 ? 'text-red-400' : 'text-green-400'}>
            {formatPercentage(value)}
          </span>
          <span>{label}</span>
        </div>
        {metricType === 'whale' && (
          <div className="text-xs text-gray-400">
            Top 10 holders
          </div>
        )}
      </div>
    );
  }

  // Simple display for table rows
  // Color code based on risk level
  const getColor = () => {
    if (metricType === 'whale') {
      if (value > 50) return 'text-red-400';
      if (value > 30) return 'text-yellow-400';
      return 'text-green-400';
    }
    
    // For sniper, insider, dev, bundle, kol
    if (value > 15) return 'text-red-400';
    if (value > 5) return 'text-yellow-400';
    return 'text-green-400';
  };

  return (
    <span className={`text-xs font-semibold ${getColor()}`}>
      {formatPercentage(value)}
    </span>
  );
};

export default SolanaTokenAnalytics;
*/

