import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Birdeye OHLCV Proxy - Token endpoint
 * This proxies requests to Birdeye's token OHLCV endpoint
 * Benefits: Hides API key, avoids CORS, allows server-side caching
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { address, type = '15m', limit = '1000' } = req.query;

  if (!address || typeof address !== 'string') {
    res.status(400).json({ success: false, message: 'Missing or invalid "address"' });
    return;
  }

  const url = `https://public-api.birdeye.so/defi/v3/ohlcv?address=${encodeURIComponent(
    address
  )}&type=${encodeURIComponent(type as string)}&limit=${encodeURIComponent(limit as string)}`;

  try {
    const r = await fetch(url, {
      headers: {
        accept: 'application/json',
        'x-chain': 'solana',
        'x-api-key': process.env.BIRDEYE_API_KEY ?? '',
      },
    });

    const json = await r.json().catch(() => ({}));

    if (!r.ok) {
      console.error('Birdeye API error:', r.status, r.statusText, json);
      res.status(r.status).json({
        success: false,
        status: r.status,
        message: json?.message || r.statusText,
      });
      return;
    }

    res.status(200).json(json);
  } catch (e: any) {
    console.error('Birdeye proxy error:', e);
    res.status(500).json({ success: false, message: e?.message || 'Proxy error' });
  }
}

