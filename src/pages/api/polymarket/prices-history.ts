import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Polymarket Price History API Proxy
 * Fetches historical price data from Polymarket's CLOB API
 *
 * Parameters:
 * - market: CLOB token ID (required)
 * - interval: Duration string like "1h", "1d", "1w", "1m" (optional)
 * - startTs / endTs: Unix timestamps in seconds (optional, alternative to interval)
 * - fidelity: Resolution in minutes (default: 60)
 */

const CLOB_API = 'https://clob.polymarket.com';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { market, interval, startTs, endTs, fidelity = '60' } = req.query;

    if (!market) {
      return res.status(400).json({ error: 'market (token ID) is required' });
    }

    // Build query params
    const params = new URLSearchParams();
    params.set('market', market as string);
    params.set('fidelity', fidelity as string);

    // Use interval or timestamp range
    if (interval) {
      params.set('interval', interval as string);
    } else if (startTs && endTs) {
      params.set('startTs', startTs as string);
      params.set('endTs', endTs as string);
    } else {
      // Default to 1 week
      params.set('interval', '1w');
    }

    const url = `${CLOB_API}/prices-history?${params}`;
    console.log('[Polymarket] Fetching price history:', url);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Polymarket Proxy] Price history API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Polymarket CLOB API request failed',
        status: response.status,
        details: errorText,
      });
    }

    const data = await response.json();

    // Transform the data for our chart format
    // Input: { history: [{ t: timestamp, p: price }] }
    // Output: { history: [{ timestamp: number, price: number }] }
    const history = (data.history || []).map((point: { t: number; p: number }) => ({
      timestamp: point.t,
      price: point.p, // Price is already in decimal format (0-1)
    }));

    console.log(`[Polymarket] Fetched ${history.length} price points`);

    return res.status(200).json({
      history,
      count: history.length,
      tokenId: market,
    });
  } catch (e: any) {
    console.error('[Polymarket Proxy] Price history error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      message: e.message,
    });
  }
}
