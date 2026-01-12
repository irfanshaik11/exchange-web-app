import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * DFlow Orderbook API Proxy
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

  const { ticker } = req.query;

  if (!ticker || typeof ticker !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid ticker parameter' });
  }

  try {
    const response = await fetch(`${DFLOW_METADATA_API}/api/v1/orderbook/${ticker}`, {
      headers: {
        'Accept': 'application/json',
        'x-api-key': DFLOW_API_KEY,
      },
    });

    if (!response.ok) {
      // 404 is expected for finalized markets
      if (response.status === 404) {
        return res.status(404).json({ error: 'Orderbook not found' });
      }
      const errorText = await response.text();
      console.error('[DFlow Proxy] Orderbook error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'DFlow Orderbook API request failed',
        details: errorText,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e: any) {
    console.error('[DFlow Proxy] Orderbook error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      message: e.message,
    });
  }
}
