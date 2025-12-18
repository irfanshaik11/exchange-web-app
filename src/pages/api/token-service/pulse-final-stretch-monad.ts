import type { NextApiRequest, NextApiResponse } from 'next';
import { extractTokenImage } from '~/utils/images';

// Fetch with timeout helper
const fetchWithTimeout = async (url: string, timeoutMs = 5000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: ctrl.signal as any,
    });
    return resp;
  } finally {
    clearTimeout(t);
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set appropriate cache headers
  const isFresh = req.query.fresh === '1';

  if (isFresh) {
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  }

  try {
    // Get Monad backend service URL
    const monadServiceUrl = process.env.MONAD_TOKEN_SERVICE_URL || process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL!;

    // Build query parameters
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
      else if (v !== undefined) params.append(k, String(v));
    }
    if (!params.get('limit')) params.set('limit', '50');

    // Fetch from Monad backend service
    const upstream = await fetchWithTimeout(`${monadServiceUrl}/v1/pulse/final-stretch?${params.toString()}`);
    const text = await upstream.text();

    if (!upstream.ok) {
      console.error('[pulse-final-stretch-monad] Upstream error:', upstream.status, text);
      throw new Error(`Upstream error: ${upstream.status}`);
    }

    const response = JSON.parse(text);

    // Extract data array from backend response
    // Backend returns { status, count, data: [...] }, frontend expects just the array
    const data = response.data || response;

    res.setHeader('X-Cache', 'MISS');
    return res.json(data);
  } catch (err: any) {
    console.error('[pulse-final-stretch-monad] Error fetching data:', err);
    res.status(502).json({ error: 'Bad gateway to Monad token service' });
  }
}

