import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * DFlow Markets API Proxy
 * Proxies requests to DFlow's prediction markets API to avoid CORS issues
 */

const DFLOW_METADATA_API = process.env.DFLOW_MARKETS_API || 'https://c.prediction-markets-api.dflow.net';
const DFLOW_API_KEY = process.env.DFLOW_API_KEY || 'hAQznO3n9GgSNKukXXaA';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { limit = '50', page, search, status } = req.query;

    // Build query params
    const marketsParams = new URLSearchParams();
    marketsParams.set('limit', limit as string);
    if (page) marketsParams.set('page', page as string);
    if (status && status !== 'all') marketsParams.set('status', status as string);

    const eventsParams = new URLSearchParams();
    eventsParams.set('limit', limit as string);

    // Determine markets URL (search or list)
    let marketsUrl = `${DFLOW_METADATA_API}/api/v1/markets?${marketsParams}`;
    if (search) {
      marketsUrl = `${DFLOW_METADATA_API}/api/v1/search?q=${encodeURIComponent(search as string)}&limit=${limit}`;
    }

    const eventsUrl = `${DFLOW_METADATA_API}/api/v1/events?${eventsParams}`;

    // Fetch both markets and events in parallel
    const [marketsResponse, eventsResponse] = await Promise.all([
      fetch(marketsUrl, {
        headers: {
          'Accept': 'application/json',
          'x-api-key': DFLOW_API_KEY,
        },
      }),
      fetch(eventsUrl, {
        headers: {
          'Accept': 'application/json',
          'x-api-key': DFLOW_API_KEY,
        },
      }),
    ]);

    if (!marketsResponse.ok) {
      const errorText = await marketsResponse.text();
      console.error('[DFlow Proxy] Markets API error:', marketsResponse.status, errorText);
      return res.status(marketsResponse.status).json({
        error: 'DFlow Markets API request failed',
        status: marketsResponse.status,
        details: errorText,
      });
    }

    const marketsData = await marketsResponse.json();
    let eventsData = { events: [] };

    if (eventsResponse.ok) {
      eventsData = await eventsResponse.json();
    }

    // Return combined data
    return res.status(200).json({
      markets: marketsData.markets || [],
      events: eventsData.events || [],
      cursor: marketsData.cursor,
    });
  } catch (e: any) {
    console.error('[DFlow Proxy] Error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      message: e.message,
    });
  }
}
