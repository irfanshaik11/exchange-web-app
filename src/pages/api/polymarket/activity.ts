import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Polymarket Activity API Proxy
 * Fetches trade activity from Polymarket's Data API /trades endpoint
 *
 * Query params:
 * - market: condition ID to filter by market
 * - limit: number of trades to return (default 50)
 */

const DATA_API = 'https://data-api.polymarket.com';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { market, limit = '50' } = req.query;

    // Build URL with query params - use /trades endpoint
    const params = new URLSearchParams();
    if (market) {
      params.set('market', market as string);
    }
    params.set('limit', limit as string);

    const url = `${DATA_API}/trades?${params}`;
    console.log('[Polymarket] Fetching trades:', url);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Polymarket Proxy] Trades API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Polymarket API request failed',
        status: response.status,
        details: errorText,
      });
    }

    const data = await response.json();

    // Transform trades data to activity format
    const trades = Array.isArray(data) ? data : [];
    const activities = trades.map((trade: any) => ({
      id: trade.transactionHash || `${trade.timestamp}-${trade.proxyWallet}`,
      type: 'trade',
      timestamp: new Date(trade.timestamp * 1000).toISOString(),
      proxyWallet: trade.proxyWallet,
      name: trade.name,
      pseudonym: trade.pseudonym,
      profileImage: trade.profileImage || trade.profileImageOptimized,
      market: trade.conditionId,
      outcome: trade.outcome,
      side: trade.side?.toLowerCase(),
      size: trade.size,
      price: trade.price,
      amount: trade.size * trade.price,
      transactionHash: trade.transactionHash,
      title: trade.title,
      slug: trade.slug,
      eventSlug: trade.eventSlug,
      icon: trade.icon,
    }));

    return res.status(200).json({
      activities,
      count: activities.length,
    });
  } catch (e: any) {
    console.error('[Polymarket Proxy] Activity error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      message: e.message,
    });
  }
}
