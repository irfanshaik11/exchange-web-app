import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Polymarket Holders API Proxy
 * Fetches top holders for a market from Polymarket's Data API
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
    const { market, limit = '20' } = req.query;

    if (!market) {
      return res.status(400).json({ error: 'market (condition ID) is required' });
    }

    const params = new URLSearchParams();
    params.set('market', market as string);
    params.set('limit', limit as string);

    const url = `${DATA_API}/holders?${params}`;
    console.log('[Polymarket] Fetching holders:', url);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Polymarket Proxy] Holders API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Polymarket API request failed',
        status: response.status,
        details: errorText,
      });
    }

    const data = await response.json();

    // Data comes as array of { token, holders: [] }
    // Flatten and transform for easier use
    const allHolders: any[] = [];

    if (Array.isArray(data)) {
      for (const tokenData of data) {
        const tokenId = tokenData.token;
        const isYesToken = tokenData.holders?.[0]?.outcomeIndex === 0;

        for (const holder of tokenData.holders || []) {
          allHolders.push({
            ...holder,
            tokenId,
            outcome: isYesToken ? 'yes' : 'no',
          });
        }
      }
    }

    // Sort by amount descending
    allHolders.sort((a, b) => b.amount - a.amount);

    return res.status(200).json({
      holders: allHolders,
      count: allHolders.length,
    });
  } catch (e: any) {
    console.error('[Polymarket Proxy] Holders error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      message: e.message,
    });
  }
}
