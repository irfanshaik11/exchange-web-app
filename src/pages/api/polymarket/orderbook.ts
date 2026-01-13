import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Polymarket Orderbook API Proxy
 * Proxies requests to Polymarket's CLOB API for orderbook data
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
    const { token_id, token_ids } = req.query;

    // Support both single token and batch queries
    let url: string;
    if (token_ids) {
      // Batch query for multiple tokens
      url = `${CLOB_API}/books?token_ids=${encodeURIComponent(token_ids as string)}`;
    } else if (token_id) {
      // Single token query
      url = `${CLOB_API}/book?token_id=${encodeURIComponent(token_id as string)}`;
    } else {
      return res.status(400).json({ error: 'token_id or token_ids required' });
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Polymarket Proxy] Orderbook API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Polymarket CLOB API request failed',
        status: response.status,
        details: errorText,
      });
    }

    const data = await response.json();

    return res.status(200).json(data);
  } catch (e: any) {
    console.error('[Polymarket Proxy] Error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      message: e.message,
    });
  }
}
