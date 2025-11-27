import type { NextApiRequest, NextApiResponse } from 'next';

// Map chart intervals to Monad service intervals
// TimescaleDB supports: 1s, 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
const INTERVAL_MAP: Record<string, string> = {
  '1s': '1s',   // Direct 1-second candles from TimescaleDB
  '5s': '1s',   // Use 1s for sub-minute resolution
  '15s': '1s',
  '30s': '1s',
  '1m': '1m',   // Direct 1-minute candles
  '5m': '5m',   // Direct 5-minute candles
  '15m': '15m', // Direct 15-minute candles
  '30m': '30m', // Direct 30-minute candles
  '1h': '1h',   // Direct 1-hour candles
  '4h': '4h',   // Direct 4-hour candles
  '1d': '1d',   // Direct 1-day candles
  '7d': '1w',   // Map to weekly candles
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token_address, interval, timeframe, limit } = req.query;

  if (!token_address || typeof token_address !== 'string') {
    return res.status(400).json({ error: 'token_address parameter is required' });
  }

  try {
    const monadServiceUrl = process.env.MONAD_TOKEN_SERVICE_URL!;

    // Map the interval to Monad's supported intervals (5m, 1h, 6h, 24h)
    const mappedInterval = INTERVAL_MAP[interval as string] || '5m';

    const params = new URLSearchParams({
      token_address: token_address,
      interval: mappedInterval,
    });

    if (timeframe) params.append('timeframe', timeframe as string);
    if (limit) params.append('limit', limit as string);

    const response = await fetch(`${monadServiceUrl}/v1/ohlc?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Monad service responded with ${response.status}`);
    }

    const monadData = await response.json();

    // Transform Monad format to chart format
    // Monad returns: { time, open, high, low, close, volume_usd }
    // Chart expects: { unix_time, o, h, l, c, v_usd }
    const transformedData = (monadData.data || []).map((candle: any) => ({
      unix_time: candle.time,
      o: candle.open,
      h: candle.high,
      l: candle.low,
      c: candle.close,
      v_usd: candle.volume_usd || 0,
    }));

    // Return in format expected by AdvancedOHLCChart: { success, data: { items } }
    res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=10');
    res.status(200).json({
      success: true,
      data: {
        items: transformedData
      }
    });
  } catch (error) {
    console.error('Monad OHLC API error:', error);
    res.status(500).json({
      error: 'Failed to fetch OHLC data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
