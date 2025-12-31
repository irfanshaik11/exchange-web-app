import type { NextApiRequest, NextApiResponse } from 'next';

// Use NEXT_PUBLIC_TOKEN_SERVICE_URL first (for production), then fallback to NEXT_PUBLIC_GO_SERVICE_URL
const GO_SERVICE_URL = (process.env.NEXT_PUBLIC_TOKEN_SERVICE_URL || process.env.NEXT_PUBLIC_GO_SERVICE_URL || '').replace(/\/$/, '');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { pair_address } = req.query;

  if (!pair_address) {
    return res.status(400).json({ error: 'pair_address parameter is required' });
  }

  if (typeof pair_address !== 'string') {
    return res.status(400).json({ error: 'Invalid parameter type' });
  }

  try {
    if (!GO_SERVICE_URL) {
      console.error('GO_SERVICE_URL is not configured');
      return res.status(500).json({ error: 'Token service URL not configured' });
    }

    const endpoint = `/v1/trade/view?pair_address=${pair_address}`;
    const response = await fetch(`${GO_SERVICE_URL}${endpoint}`);

    if (response.ok) {
      const data = await response.json();
      return res.status(200).json(data);
    } else {
      // Return empty data structure instead of error to prevent UI crashes
      return res.status(200).json({
        token: null,
        recentTrades: [],
        message: 'Token data not available from backend'
      });
    }

  } catch (error) {
    console.error('Error calling backend API:', error);
    // Return empty data structure instead of error to prevent UI crashes
    return res.status(200).json({
      token: null,
      recentTrades: [],
      message: 'Failed to fetch token data'
    });
  }
}

