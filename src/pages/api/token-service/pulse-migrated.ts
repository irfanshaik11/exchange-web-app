import type { NextApiRequest, NextApiResponse } from 'next';

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

  const goBase = process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:9000';

  const fetchWithTimeout = async (url: string, timeoutMs = 2000) => {
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
      
      // Map the response to ensure image field is properly set
      if (data && Array.isArray(data)) {
        data.forEach((token: any) => {
          if (token && typeof token === 'object') {
            token.image = token.uri || token.image || null;
          }
        });
      }
      
      res.json(data);
    } catch {
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/plain');
      res.send(text);
    }
  };

  try {
    const goURL = `${goBase}/v1/pulse/migrated?${params.toString()}`;
    console.log('[Proxy:pulse-migrated] Using Go service:', goURL);
    const upstream = await fetchWithTimeout(goURL, 3000);
    return await tryParseAndSend(upstream);
  } catch (err: any) {
    console.error('[Proxy:pulse-migrated] Go service fetch failed:', err?.message || err);
    return res.status(502).json({ error: 'Bad gateway to Go token service' });
  }
}
