import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Polymarket Price API Proxy
 * Proxies requests to Polymarket's CLOB API for price data
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
    const { token_id, token_ids, side = 'buy' } = req.query;

    let url: string;
    if (token_ids) {
      // Batch price query
      url = `${CLOB_API}/prices?token_ids=${encodeURIComponent(token_ids as string)}&side=${side}`;
    } else if (token_id) {
      // Single price query
      url = `${CLOB_API}/price?token_id=${encodeURIComponent(token_id as string)}&side=${side}`;
    } else {
      return res.status(400).json({ error: 'token_id or token_ids required' });
    }

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Polymarket Proxy] Price API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Polymarket CLOB API request failed',
        status: response.status,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e: any) {
    console.error('[Polymarket Proxy] Error:', e);
    return res.status(500).json({ error: 'Internal server error', message: e.message });
  }
}
