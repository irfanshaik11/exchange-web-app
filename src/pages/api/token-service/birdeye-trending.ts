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

  // Set defaults if not provided
  if (!params.get('sort_by')) params.set('sort_by', 'volume24hUSD');
  if (!params.get('sort_type')) params.set('sort_type', 'asc');
  if (!params.get('offset')) params.set('offset', '0');
  if (!params.get('limit')) params.set('limit', '20');
  if (!params.get('ui_amount_mode')) params.set('ui_amount_mode', 'scaled');
  // Default chain to 'sol' if not provided (will be normalized to 'solana' in backend)
  if (!params.get('chain')) params.set('chain', 'sol');

  const goBase = process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:8080';

  const fetchWithTimeout = async (url: string, timeoutMs = 10000) => {
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
    const goURL = `${goBase}/v1/tokens/trending/birdeye?${params.toString()}`;
    console.log('[Proxy:birdeye-trending] Using Go service Birdeye trending endpoint:', goURL);
    const upstream = await fetchWithTimeout(goURL, 10000);
    
    if (upstream.ok) {
      return await tryParseAndSend(upstream);
    } else {
      // Get the error message from the upstream response
      const errorText = await upstream.text();
      console.error('[Proxy:birdeye-trending] Go service returned error:', upstream.status, errorText);
      try {
        const errorData = JSON.parse(errorText);
        return res.status(upstream.status).json(errorData);
      } catch {
        return res.status(upstream.status).json({ error: errorText || 'Go service error' });
      }
    }
  } catch (err: any) {
    console.error('[Proxy:birdeye-trending] Go service fetch failed:', err?.message || err);
    return res.status(502).json({ error: 'Bad gateway to Go token service' });
  }
}

