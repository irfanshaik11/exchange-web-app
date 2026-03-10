import type { NextApiRequest, NextApiResponse } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Disable server-side caching/etag for this proxy to prevent 304s
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  // Best-effort to avoid etag-induced 304s
  try { res.removeHeader('ETag'); } catch {}
  
  // Preserve query parameters
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else if (value !== undefined) {
      params.append(key, value);
    }
  }

  const goBase = process.env.NEXT_PUBLIC_GO_SERVICE_URL!;

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
    const goURL = `${goBase}/v1/search?${params.toString()}`;
    isDev && console.log('[Proxy:search] Using Go service search endpoint:', goURL);
    const upstream = await fetchWithTimeout(goURL, 5000);
    
    if (upstream.ok) {
      return await tryParseAndSend(upstream);
    } else {
      console.error('[Proxy:search] Go service returned error:', upstream.status);
      return res.status(upstream.status).json({ error: 'Go service error' });
    }
  } catch (err: any) {
    console.error('[Proxy:search] Go service fetch failed:', err?.message || err);
    return res.status(502).json({ error: 'Bad gateway to Go token service' });
  }
}





