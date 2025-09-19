import type { NextApiRequest, NextApiResponse } from 'next';

interface MarketData {
  mint: string;
  price_usd: number;
  market_cap_usd: number;
  volume_usd?: number;
  updated_at: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Disable caching for real-time data
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const { mints } = req.body;
  if (process.env.NODE_ENV !== 'production') {
    try {
      const arr = Array.isArray(mints) ? mints : [];
      console.log(`[MarketData] Incoming mints: count=${arr.length} sample=${arr.slice(0,5).join(',')}`);
    } catch {}
  }

  if (!Array.isArray(mints) || mints.length === 0) {
    return res.status(400).json({ error: 'Invalid mints array' });
  }

  if (mints.length > 200) {
    return res.status(400).json({ error: 'Too many mint addresses (max 200)' });
  }

  const primaryBase = process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:8080';
  const fallbackBase = process.env.NEXT_PUBLIC_GO_FALLBACK_URL || 'http://localhost:9000';

  const fetchWithTimeout = async (url: string, timeoutMs = 5000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ mints }),
        cache: 'no-store',
        signal: ctrl.signal as any,
      });
      return resp;
    } finally {
      clearTimeout(t);
    }
  };

  const attempt = async (base: string) => {
    const upstream = await fetchWithTimeout(`${base}/v1/market-data/realtime`);
    if (!upstream.ok) {
      const errorText = await upstream.text();
      throw new Error(`Upstream ${base} error ${upstream.status}: ${errorText}`);
    }
    const marketData: Record<string, MarketData> = await upstream.json();
    return Object.values(marketData);
  };

  try {
    try {
      const data = await attempt(primaryBase);
      return res.json(data);
    } catch (e1: any) {
      console.error('Primary GO service failed, trying fallback:', e1?.message || e1);
      const data = await attempt(fallbackBase);
      return res.json(data);
    }
  } catch (err: any) {
    console.error('Market data fetch error:', err);
    return res.status(502).json({
      error: 'Failed to fetch market data from token service',
      details: err?.message || String(err)
    });
  }
}







