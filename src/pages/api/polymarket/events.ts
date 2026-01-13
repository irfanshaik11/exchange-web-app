import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Polymarket Events API Proxy
 * Proxies requests to Polymarket's Gamma API to avoid CORS issues
 */

const GAMMA_API = 'https://gamma-api.polymarket.com';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      limit = '50',
      active = 'true',
      closed = 'false',
      order = 'volume24hr',
      ascending = 'false',
      tag_id,
      series_id,
    } = req.query;

    // Build query params
    const params = new URLSearchParams();
    params.set('limit', limit as string);
    params.set('active', active as string);
    params.set('closed', closed as string);
    params.set('order', order as string);
    params.set('ascending', ascending as string);

    if (tag_id) params.set('tag_id', tag_id as string);
    if (series_id) params.set('series_id', series_id as string);

    const url = `${GAMMA_API}/events?${params}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Polymarket Proxy] Events API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Polymarket Events API request failed',
        status: response.status,
        details: errorText,
      });
    }

    const data = await response.json();

    // Transform the data to extract relevant fields
    const events = Array.isArray(data) ? data : [];

    return res.status(200).json({
      events,
      count: events.length,
    });
  } catch (e: any) {
    console.error('[Polymarket Proxy] Error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      message: e.message,
    });
  }
}
