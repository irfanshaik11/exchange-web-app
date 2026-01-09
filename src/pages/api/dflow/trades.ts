import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * DFlow Trades API Proxy
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
    const { ticker, limit = '20' } = req.query;

    const queryParams = new URLSearchParams();
    if (ticker) queryParams.set('ticker', ticker as string);
    if (limit) queryParams.set('limit', limit as string);

    const response = await fetch(`${DFLOW_METADATA_API}/api/v1/trades?${queryParams}`, {
      headers: {
        'Accept': 'application/json',
        'x-api-key': DFLOW_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DFlow Proxy] Trades error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'DFlow Trades API request failed',
        details: errorText,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e: any) {
    console.error('[DFlow Proxy] Trades error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      message: e.message,
    });
  }
}
