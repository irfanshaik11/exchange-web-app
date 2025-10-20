"use client";

import React from 'react';
import { useTokenAnalytics } from '~/hooks/useTokenAnalytics';
import { FiRefreshCw, FiAlertTriangle, FiUsers, FiTrendingUp } from 'react-icons/fi';
import InterstateTooltip from './InterstateTooltip';

interface TokenAnalyticsPanelProps {
  mintAddress?: string;
  tokenInfo?: {
    symbol?: string;
    name?: string;
    pool?: string;
    dex?: string;
  };
}

const TokenAnalyticsPanel: React.FC<TokenAnalyticsPanelProps> = ({ 
  mintAddress, 
  tokenInfo 
}) => {
  const { data, loading, error, refetch } = useTokenAnalytics({
    mintAddress,
    enabled: !!mintAddress,
    autoRegister: true,
    tokenInfo,
  });

  if (!mintAddress) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No token selected</p>
      </div>
    );
  }

  const formatNumber = (num: number | undefined): string => {
    if (num === undefined) return '-';
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(0);
  };

  const formatPercentage = (num: number | undefined): string => {
    if (num === undefined) return '-';
    return `${num.toFixed(1)}%`;
  };

  const getRiskColor = (value: number | undefined, metricType: string): string => {
    if (value === undefined) return 'text-gray-500';
    
    if (metricType === 'whale') {
      if (value > 50) return 'text-red-400';
      if (value > 30) return 'text-yellow-400';
      return 'text-green-400';
    }
    
    if (metricType === 'small') {
      if (value > 50) return 'text-green-400';
      if (value > 20) return 'text-yellow-400';
      return 'text-red-400';
    }
    
    // For risk metrics (sniper, insider, dev, bundle)
    if (value > 15) return 'text-red-400';
    if (value > 5) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getRiskBadge = (value: number | undefined, metricType: string): string => {
    if (value === undefined) return 'Unknown';
    
    if (metricType === 'small') {
      if (value > 50) return 'Low Risk';
      if (value > 20) return 'Medium';
      return 'High Risk';
    }
    
    if (metricType === 'whale') {
      if (value > 50) return 'High Risk';
      if (value > 30) return 'Medium';
      return 'Low Risk';
    }
    
    // For other risk metrics
    if (value > 15) return 'High Risk';
    if (value > 5) return 'Medium';
    return 'Low Risk';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#E6E7EA]">Token Analytics</h3>
        <button
          onClick={() => refetch(true)}
          disabled={loading}
          className="p-2 rounded-lg bg-[#1E1F26] hover:bg-[#2A2B33] transition-colors disabled:opacity-50"
          title="Refresh analytics data from blockchain"
        >
          <FiRefreshCw className={`text-[#70E0B0] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Loading State */}
      {loading && !data && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#70E0B0]"></div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Analytics Content */}
      {data && (
        <div className="space-y-4">
          {/* Holder Stats */}
          <div className="bg-[#1E1F26] rounded-lg p-4 border border-[#2A2B33]">
            <div className="flex items-center gap-2 mb-3">
              <FiUsers className="text-[#70E0B0]" />
              <h4 className="text-sm font-semibold text-[#E6E7EA]">Holder Statistics</h4>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 mb-1">Total Holders</p>
                <p className="text-lg font-bold text-[#E6E7EA]">
                  {formatNumber(data.total_holders_count)}
                </p>
              </div>
              {data.holder_distribution && (
                <>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Whales</p>
                    <p className="text-lg font-bold text-[#E6E7EA]">
                      {data.holder_distribution.whales || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Sharks</p>
                    <p className="text-lg font-bold text-[#E6E7EA]">
                      {data.holder_distribution.sharks || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Shrimps</p>
                    <p className="text-lg font-bold text-[#E6E7EA]">
                      {data.holder_distribution.shrimps || 0}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Risk Metrics */}
          <div className="bg-[#1E1F26] rounded-lg p-4 border border-[#2A2B33]">
            <div className="flex items-center gap-2 mb-3">
              <FiAlertTriangle className="text-[#FF4D7F]" />
              <h4 className="text-sm font-semibold text-[#E6E7EA]">Risk Analysis</h4>
            </div>
            <div className="space-y-3">
              {/* Sniper */}
              <MetricRow
                label="Sniper Holdings"
                value={formatPercentage(data.sniper_holding_percentage)}
                risk={getRiskBadge(data.sniper_holding_percentage, 'sniper')}
                color={getRiskColor(data.sniper_holding_percentage, 'sniper')}
                tooltip="Percentage of tokens held by sniper wallets (early buyers)"
              />
              
              {/* Insider */}
              <MetricRow
                label="Insider Holdings"
                value={formatPercentage(data.insider_holding_percentage)}
                risk={getRiskBadge(data.insider_holding_percentage, 'insider')}
                color={getRiskColor(data.insider_holding_percentage, 'insider')}
                tooltip="Percentage held by mint authority, team, and large early holders"
              />
              
              {/* Dev */}
              <MetricRow
                label="Dev Holdings"
                value={formatPercentage(data.dev_holding_percentage)}
                risk={getRiskBadge(data.dev_holding_percentage, 'dev')}
                color={getRiskColor(data.dev_holding_percentage, 'dev')}
                tooltip="Percentage held by the token creator wallet"
              />
              
              {/* Bundle */}
              <MetricRow
                label="Bundle Holdings"
                value={formatPercentage(data.bundle_holding_percentage)}
                risk={getRiskBadge(data.bundle_holding_percentage, 'bundle')}
                color={getRiskColor(data.bundle_holding_percentage, 'bundle')}
                tooltip="Percentage held by wallets that bought multiple times in the same block"
              />
            </div>
          </div>

          {/* Distribution */}
          <div className="bg-[#1E1F26] rounded-lg p-4 border border-[#2A2B33]">
            <div className="flex items-center gap-2 mb-3">
              <FiTrendingUp className="text-[#70E0B0]" />
              <h4 className="text-sm font-semibold text-[#E6E7EA]">Distribution</h4>
            </div>
            <div className="space-y-3">
              {/* Whale */}
              <MetricRow
                label="Whale Holdings"
                value={formatPercentage(data.whale_holding_percentage)}
                risk={getRiskBadge(data.whale_holding_percentage, 'whale')}
                color={getRiskColor(data.whale_holding_percentage, 'whale')}
                tooltip="Percentage held by top 10 largest holders"
              />
              
              {/* Small Holders */}
              <MetricRow
                label="Small Holders"
                value={formatPercentage(data.small_holding_percentage)}
                risk={getRiskBadge(data.small_holding_percentage, 'small')}
                color={getRiskColor(data.small_holding_percentage, 'small')}
                tooltip="Percentage held by wallets with less than 1% of supply"
              />
            </div>
          </div>
        </div>
      )}

      {/* No Data State */}
      {!loading && !error && !data && (
        <div className="text-center py-8 text-gray-500">
          <p>No analytics data available</p>
          <button
            onClick={() => refetch(true)}
            className="mt-2 text-[#70E0B0] hover:underline text-sm"
          >
            Fetch from blockchain
          </button>
        </div>
      )}
    </div>
  );
};

// Helper component for metric rows
const MetricRow: React.FC<{
  label: string;
  value: string;
  risk: string;
  color: string;
  tooltip: string;
}> = ({ label, value, risk, color, tooltip }) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <InterstateTooltip label={tooltip}>
          <span className="text-sm text-gray-400 cursor-help">{label}</span>
        </InterstateTooltip>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-sm font-bold ${color}`}>{value}</span>
        <span className={`text-xs px-2 py-1 rounded ${
          risk === 'High Risk' ? 'bg-red-500/20 text-red-400' :
          risk === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-green-500/20 text-green-400'
        }`}>
          {risk}
        </span>
      </div>
    </div>
  );
};

export default TokenAnalyticsPanel;

