import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Polymarket Single Market API Proxy
 * Fetches a single market by slug from Polymarket's Gamma API
 * Uses the cleaner /events/slug/{slug} endpoint that returns event directly
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
    const { slug } = req.query;

    if (!slug) {
      return res.status(400).json({ error: 'slug is required' });
    }

    // Use the direct slug endpoint - returns event object directly (not array)
    const url = `${GAMMA_API}/events/slug/${encodeURIComponent(slug as string)}`;

    console.log('[Polymarket] Fetching:', url);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('[Polymarket] Market not found for slug:', slug);
        return res.status(404).json({ error: 'Market not found' });
      }
      const errorText = await response.text();
      console.error('[Polymarket Proxy] Market API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Polymarket API request failed',
        status: response.status,
        details: errorText,
      });
    }

    const event = await response.json();

    if (!event || !event.id) {
      console.log('[Polymarket] Invalid event data for slug:', slug);
      return res.status(404).json({ error: 'Market not found' });
    }

    console.log('[Polymarket] Found event:', event.title);

    return res.status(200).json({
      event,
    });
  } catch (e: any) {
    console.error('[Polymarket Proxy] Error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      message: e.message,
    });
  }
}
