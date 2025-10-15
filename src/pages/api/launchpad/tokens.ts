import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set appropriate cache headers for better performance
  const isFresh = req.query.fresh === '1';
  
  if (isFresh) {
    // Disable caching for fresh requests
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else {
    // Allow short-term caching for regular requests
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.setHeader('ETag', `"launchpad-tokens-${Date.now()}"`);
  }
  
  try { 
    if (!isFresh) {
      res.removeHeader('ETag'); 
    }
  } catch {}
  
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
      
      // Map the response to ensure image field is properly set
      if (data && typeof data === 'object') {
        if (Array.isArray(data)) {
          // If it's an array of tokens
          data.forEach((token: any) => {
            if (token && typeof token === 'object') {
              token.image = token.uri || token.image || null;
            }
          });
        } else if (data.new && Array.isArray(data.new)) {
          // If it's the launchpad data structure
          data.new.forEach((token: any) => {
            if (token && typeof token === 'object') {
              token.image = token.uri || token.image || null;
            }
          });
        }
        if (data.completing && Array.isArray(data.completing)) {
          data.completing.forEach((token: any) => {
            if (token && typeof token === 'object') {
              token.image = token.uri || token.image || null;
            }
          });
        }
        if (data.completed && Array.isArray(data.completed)) {
          data.completed.forEach((token: any) => {
            if (token && typeof token === 'object') {
              token.image = token.uri || token.image || null;
            }
          });
        }
      }
      
      res.json(data);
    } catch {
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/plain');
      res.send(text);
    }
  };

  try {
    const goURL = `${goBase}/v1/launchpad/tokens/all?${params.toString()}`;
    const upstream = await fetchWithTimeout(goURL, 5000);
    return await tryParseAndSend(upstream);
  } catch (err: any) {
    return res.status(502).json({ error: 'Bad gateway to Go token service' });
  }
}

