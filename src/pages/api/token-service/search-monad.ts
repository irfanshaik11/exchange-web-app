import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Disable server-side caching/etag for this proxy to prevent 304s
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try { res.removeHeader('ETag'); } catch {}
  
  // Get the query parameter
  const query = req.query.q as string;
  const limit = req.query.limit as string || '20';
  
  if (!query || query.length < 2) {
    return res.status(400).json({ 
      error: 'invalid_parameter',
      message: 'Query parameter "q" is required and must be at least 2 characters',
      code: 400
    });
  }

  const monadTokenServiceUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL;
  if (!monadTokenServiceUrl) {
    return res.status(500).json({ 
      error: 'configuration_error',
      message: 'NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL is not configured',
      code: 500
    });
  }

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

  const tryParseAndSend = async (upstream: Response) => {
    const text = await upstream.text();
    res.status(upstream.status);
    try {
      const data = JSON.parse(text);
      res.json(data);
    } catch {
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/plain');
      res.send(text);
    }
  };

  try {
    // Use the Monad token service search endpoint
    const monadURL = `${monadTokenServiceUrl}/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    console.log('[Proxy:search-monad] Using Monad token service search endpoint:', monadURL);
    const upstream = await fetchWithTimeout(monadURL, 5000);
    
    if (upstream.ok) {
      return await tryParseAndSend(upstream);
    } else {
      console.error('[Proxy:search-monad] Monad token service returned error:', upstream.status);
      return res.status(upstream.status).json({ error: 'Monad token service error' });
    }
  } catch (err: any) {
    console.error('[Proxy:search-monad] Monad token service fetch failed:', err?.message || err);
    return res.status(502).json({ error: 'Bad gateway to Monad token service' });
  }
}

