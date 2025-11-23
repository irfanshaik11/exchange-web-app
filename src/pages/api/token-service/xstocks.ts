import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  // Disable server-side caching/etag for this proxy to prevent 304s
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Access-Control-Allow-Origin', '*');
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
  // Only set default limit if no limit is provided
  if (!params.get('limit')) params.set('limit', '50');

  const goBase = process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:8080';

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
    const url = `${goBase}/v1/xstocks?${params.toString()}`;
    console.log('[Proxy:xstocks] Using Go token service:', url);
    console.log('[Proxy:xstocks] Environment check - NEXT_PUBLIC_GO_SERVICE_URL:', process.env.NEXT_PUBLIC_GO_SERVICE_URL);
    
    const upstream = await fetchWithTimeout(url, 5000);
    
    if (!upstream.ok) {
      const errorText = await upstream.text();
      console.error('[Proxy:xstocks] Upstream error:', upstream.status, errorText);
      return res.status(upstream.status).json({ 
        error: 'Upstream error', 
        status: upstream.status,
        message: errorText 
      });
    }
    
    return await tryParseAndSend(upstream);
  } catch (err: any) {
    console.error('[Proxy:xstocks] Token service fetch failed:', err?.message || err);
    return res.status(502).json({ 
      error: 'Service unavailable', 
      message: err?.message || 'Failed to fetch xStocks data',
      details: err?.toString() 
    });
  }
}

