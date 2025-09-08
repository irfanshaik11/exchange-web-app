import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const base = (process.env.NEXT_PUBLIC_WEBSOCKET_URL || '')
      .replace(/^wss:/, 'https:')
      .replace(/^ws:/, 'http:');

    if (!base) {
      res.status(500).json({ error: 'Token service URL not configured' });
      return;
    }

    // Preserve query parameters
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        value.forEach(v => params.append(key, v));
      } else if (value !== undefined) {
        params.append(key, value);
      }
    }

    const targetUrl = `${base}/api/getAllTokens?${params.toString()}`;

    const upstream = await fetch(targetUrl, {
      // Forward minimal headers; CORS not needed server-side
      headers: { 'Accept': 'application/json' },
      // Prevent caching at proxy level; upstream may set its own cache headers
      cache: 'no-store',
    });

    const text = await upstream.text();
    res.status(upstream.status);
    // Try to pass JSON when possible; otherwise return raw text
    try {
      const data = JSON.parse(text);
      res.json(data);
    } catch {
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/plain');
      res.send(text);
    }
  } catch (err: any) {
    console.error('[Proxy:getAllTokens] Error:', err?.message || err);
    res.status(502).json({ error: 'Bad gateway to token service' });
  }
}

