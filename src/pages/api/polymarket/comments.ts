import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Polymarket Comments API Proxy
 * Fetches comments for a market from Polymarket's Gamma API
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
    const { event_id } = req.query;

    if (!event_id) {
      return res.status(400).json({ error: 'event_id is required' });
    }

    // Comments are fetched using query parameters:
    // parent_entity_id = event ID (numeric)
    // parent_entity_type = "Event" (capital E)
    // Note: This API may return limited results for some events
    const params = new URLSearchParams();
    params.set('parent_entity_id', event_id as string);
    params.set('parent_entity_type', 'Event');
    params.set('order', 'id');
    params.set('ascending', 'false');

    const url = `${GAMMA_API}/comments?${params}`;
    console.log('[Polymarket] Fetching comments:', url);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Polymarket Proxy] Comments API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Polymarket API request failed',
        status: response.status,
        details: errorText,
      });
    }

    const data = await response.json();

    // Sort comments by date (newest first)
    const comments = Array.isArray(data) ? data : [];
    comments.sort((a: any, b: any) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    return res.status(200).json({
      comments,
      count: comments.length,
    });
  } catch (e: any) {
    console.error('[Polymarket Proxy] Comments error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      message: e.message,
    });
  }
}
