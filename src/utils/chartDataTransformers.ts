import type { OHLCData } from '../components/LightweightChart';
import type { TokenStats, TimeframeStats } from '../hooks/useTokenStatsWebSocket';

/**
 * Transform WebSocket token stats into OHLC data format
 */
export const transformTokenStatsToOHLC = (
  stats: TokenStats,
  timeframe: keyof TokenStats['timeframes'] = '5m'
): OHLCData[] => {
  const timeframeStats = stats.timeframes[timeframe];
  
  if (!timeframeStats) {
    return [];
  }

  // Create OHLC data from the timeframe stats
  const ohlcData: OHLCData = {
    time: Math.floor(Date.now() / 1000) as any, // Current timestamp
    open: timeframeStats.open,
    high: timeframeStats.high,
    low: timeframeStats.low,
    close: timeframeStats.close,
  };

  return [ohlcData];
};

/**
 * Generate historical OHLC data from current stats (for development/testing)
 * This creates a series of OHLC candles leading up to the current stats
 */
export const generateHistoricalOHLCFromStats = (
  stats: TokenStats,
  timeframe: keyof TokenStats['timeframes'] = '5m',
  periods: number = 100
): OHLCData[] => {
  const currentStats = stats.timeframes[timeframe];
  
  if (!currentStats) {
    return [];
  }

  const data: OHLCData[] = [];
  const now = Math.floor(Date.now() / 1000);
  
  // Calculate interval in seconds based on timeframe
  const intervalSeconds = getTimeframeIntervalSeconds(timeframe);
  
  // Start from the current stats and work backwards
  let currentPrice = currentStats.close;
  let currentHigh = currentStats.high;
  let currentLow = currentStats.low;
  
  for (let i = periods - 1; i >= 0; i--) {
    const time = (now - i * intervalSeconds) as any;
    
    // Generate realistic price movement
    const volatility = 0.02; // 2% volatility
    const change = (Math.random() - 0.5) * volatility;
    const open = currentPrice;
    const close = currentPrice * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    
    data.push({
      time,
      open: Number(open.toFixed(6)),
      high: Number(high.toFixed(6)),
      low: Number(low.toFixed(6)),
      close: Number(close.toFixed(6)),
    });
    
    currentPrice = close;
  }
  
  // Replace the last (most recent) candle with actual stats
  if (data.length > 0) {
    data[data.length - 1] = {
      time: now as any,
      open: currentStats.open,
      high: currentStats.high,
      low: currentStats.low,
      close: currentStats.close,
    };
  }
  
  return data;
};

/**
 * Get interval in seconds for a given timeframe
 */
export const getTimeframeIntervalSeconds = (timeframe: string): number => {
  switch (timeframe) {
    case '1m':
      return 60;
    case '5m':
      return 300; // 5 minutes
    case '15m':
      return 900; // 15 minutes
    case '1h':
      return 3600; // 1 hour
    case '4h':
      return 14400; // 4 hours
    case '12h':
      return 43200; // 12 hours
    case '24h':
      return 86400; // 24 hours
    default:
      return 300; // Default to 5 minutes
  }
};

/**
 * Format volume for display
 */
export const formatVolume = (volume: number): string => {
  if (volume >= 1000000000) {
    return `${(volume / 1000000000).toFixed(2)}B`;
  } else if (volume >= 1000000) {
    return `${(volume / 1000000).toFixed(2)}M`;
  } else if (volume >= 1000) {
    return `${(volume / 1000).toFixed(2)}K`;
  } else {
    return volume.toFixed(2);
  }
};

/**
 * Format price change percentage with color indication
 */
export const formatPriceChange = (change: number): { value: string; isPositive: boolean } => {
  const isPositive = change >= 0;
  const sign = isPositive ? '+' : '';
  return {
    value: `${sign}${change.toFixed(2)}%`,
    isPositive
  };
};

/**
 * Get color class for price change
 */
export const getPriceChangeColor = (isPositive: boolean): string => {
  return isPositive ? 'text-emerald-400' : 'text-red-400';
};

/**
 * Calculate additional metrics from token stats
 */
export const calculateAdditionalMetrics = (stats: TokenStats, timeframe: keyof TokenStats['timeframes']) => {
  const timeframeStats = stats.timeframes[timeframe];
  
  if (!timeframeStats) {
    return null;
  }

  const buySellRatio = timeframeStats.sell_count > 0 
    ? timeframeStats.buy_count / timeframeStats.sell_count 
    : timeframeStats.buy_count;

  const volumeRatio = timeframeStats.sell_volume > 0 
    ? timeframeStats.buy_volume / timeframeStats.sell_volume 
    : timeframeStats.buy_volume;

  return {
    buySellRatio: Number(buySellRatio.toFixed(2)),
    volumeRatio: Number(volumeRatio.toFixed(2)),
    avgTradeSize: timeframeStats.total_volume / (timeframeStats.buy_count + timeframeStats.sell_count),
    dominance: (timeframeStats.buy_volume / timeframeStats.total_volume) * 100
  };
};
