import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Moralis Snipers Proxy
 * This proxies requests to Moralis API to keep the API key secure on the server
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { address, chain = 'solana', blocksAfterCreation = '50' } = req.query;

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid address parameter' });
  }

  try {
    const url = `https://deep-index.moralis.io/api/v2.2/pairs/${encodeURIComponent(address)}/snipers?chain=${encodeURIComponent(chain as string)}&blocksAfterCreation=${encodeURIComponent(blocksAfterCreation as string)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': process.env.MORALIS_API_KEY || '',
      },
    });

    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      console.error('Moralis API error:', response.status, response.statusText, json);
      return res.status(response.status).json({
        error: 'Moralis API request failed',
        details: json,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e: any) {
    console.error('Moralis proxy error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      message: e.message,
    });
  }
}

