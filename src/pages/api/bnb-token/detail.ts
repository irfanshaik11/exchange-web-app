import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveBnbMarketCapUsd, resolveBnbPriceUsd } from '~/utils/bnbToken';

const BNB_HTTP_BASE = (
  process.env.NEXT_PUBLIC_BNB_TOKEN_SERVICE_URL || 'https://token-bnb.interstate.so'
).replace(/\/+$/, '');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const mint = typeof req.query.mint === 'string' ? req.query.mint.trim() : '';
  if (!mint) {
    return res.status(400).json({ error: 'mint parameter is required' });
  }

  res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=15, stale-while-revalidate=30');

  try {
    const upstream = await fetch(`${BNB_HTTP_BASE}/v1/token/${encodeURIComponent(mint)}`, {
      headers: { Accept: 'application/json' },
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json(data);
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error('[bnb-token/detail] failed for', mint, error);
    return res.status(500).json({ error: 'Failed to fetch BNB token detail' });
  }
}
