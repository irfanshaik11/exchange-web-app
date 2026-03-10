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

  const goBase = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
  const nodeBase = process.env.NEXT_PUBLIC_BACKEND_URL;

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
      res.json(data);
    } catch {
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/plain');
      res.send(text);
    }
  };

  // Use pulse endpoints from deployed service
  try {
    const filter = req.query.filter as string || 'marketcap';
    const order = req.query.order as string || 'desc';
    const limit = parseInt(req.query.limit as string || '20');
    const offset = parseInt(req.query.offset as string || '0');
    
    // Map frontend filters to pulse endpoints
    let pulseEndpoint = '/v1/pulse/new'; // default
    if (filter === 'migrated') {
      pulseEndpoint = '/v1/pulse/migrated';
    } else if (filter === 'final-stretch') {
      pulseEndpoint = '/v1/pulse/final-stretch';
    } else if (filter === 'new') {
      pulseEndpoint = '/v1/pulse/new';
    } else if (filter === 'trending') {
      // For trending, combine all pulse endpoints
      pulseEndpoint = '/v1/pulse/new';
    }
    
    const goURL = `${goBase}${pulseEndpoint}?limit=${limit}`;
    isDev && console.log('[Proxy:getAllTokens] Using Go service pulse endpoint:', goURL);
    const upstream = await fetchWithTimeout(goURL, 3000);
    
    if (upstream.ok) {
      const data = await upstream.json();
      // Apply offset and ordering if needed
      let result = Array.isArray(data) ? data : [];
      
      // Apply offset
      if (offset > 0) {
        result = result.slice(offset);
      }
      
      // Apply ordering (the pulse endpoints already return ordered data)
      if (order === 'asc') {
        result = result.reverse();
      }
      
      return res.json(result);
    } else {
      console.error('[Proxy:getAllTokens] Go service returned error:', upstream.status);
      return res.status(upstream.status).json({ error: 'Go service error' });
    }
  } catch (err: any) {
    console.error('[Proxy:getAllTokens] Go service fetch failed:', err?.message || err);
    return res.status(502).json({ error: 'Bad gateway to Go token service' });
  }
}
