import type { NextApiRequest, NextApiResponse } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

// Map chart intervals to backend supported intervals
// Backend supports: 1s, 1m, 5m, 15m, 30m, 1h, 4h, 1d
const INTERVAL_MAP: Record<string, string> = {
  '1s': '1s',
  '5s': '1s',
  '15s': '1s',
  '30s': '1s',
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '7d': '1d',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mint, tokenAddress, timeframe, interval, limit, from, to } = req.query;

  // Support both 'mint' and 'tokenAddress' parameters
  const address = (tokenAddress || mint) as string;

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'mint or tokenAddress parameter is required' });
  }

  try {
    const goServiceUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;

    if (!goServiceUrl) {
      console.error('[OHLC API] GO_SERVICE_URL is not configured');
      return res.status(503).json({ error: 'Service unavailable' });
    }

    // Map interval to supported format
    const mappedTimeframe = INTERVAL_MAP[(timeframe || interval || '5m') as string] || '5m';

    // Build URL with query parameters
    const params = new URLSearchParams({
      timeframe: mappedTimeframe,
      ...(limit ? { limit: limit as string } : {}),
    });

    if (from) params.append('from', from as string);
    if (to) params.append('to', to as string);

    const fetchUrl = `${goServiceUrl}/v1/ohlcv/${encodeURIComponent(address)}?${params.toString()}`;
    isDev && console.log(`[OHLC API] Fetching: ${fetchUrl}`);

    const response = await fetch(fetchUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[OHLC API] Backend error: ${response.status} - ${errorText}`);
      throw new Error(`Backend responded with ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    isDev && console.log(`[OHLC API] Received ${data.count || 0} candles for ${address}`);

    // Transform to chart-compatible format if needed
    // New endpoint returns: { success, mint, timeframe, candles: [...], count, source }
    // Chart expects: { success, data: { items: [{ unix_time, o, h, l, c, v_usd }] } }
    if (data.candles && Array.isArray(data.candles)) {
      const transformedData = data.candles.map((candle: any) => ({
        unix_time: candle.time || candle.unix_time,
        o: candle.open || candle.o,
        h: candle.high || candle.h,
        l: candle.low || candle.l,
        c: candle.close || candle.c,
        v_usd: candle.volume || candle.volume_usd || candle.v_usd || 0,
      }));

      res.setHeader('Cache-Control', 'public, max-age=1, stale-while-revalidate=5');
      return res.status(200).json({
        success: true,
        data: { items: transformedData }
      });
    }

    // Return as-is if already in expected format
    res.setHeader('Cache-Control', 'public, max-age=1, stale-while-revalidate=5');
    res.status(200).json(data);
  } catch (error) {
    console.error('[OHLC API] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch OHLC data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
