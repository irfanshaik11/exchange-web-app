import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * BirdEye Market Data Proxy
 * This proxies requests to BirdEye's market-data endpoint
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { address } = req.query;

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid address parameter' });
  }

  try {
    const url = `https://public-api.birdeye.so/defi/v3/token/market-data?address=${encodeURIComponent(address)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'x-chain': 'solana',
        'x-api-key': process.env.BIRDEYE_API_KEY ?? '',
      },
    });

    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      console.error('BirdEye API error:', response.status, response.statusText, json);
      return res.status(response.status).json({
        error: 'BirdEye API request failed',
        details: json,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e: any) {
    console.error('BirdEye proxy error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      message: e.message,
    });
  }
}

