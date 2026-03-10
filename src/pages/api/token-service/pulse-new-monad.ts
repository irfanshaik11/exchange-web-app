import type { NextApiRequest, NextApiResponse } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

// Fetch with timeout helper
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
    // Build query parameters
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
      else if (v !== undefined) params.append(k, String(v));
    }
    if (!params.get('limit')) params.set('limit', '200');

    // Option 1: Try Monad token service if configured
    const monadServiceUrl = process.env.MONAD_TOKEN_SERVICE_URL || process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL;
    
    // Option 2: Use exchange-token-service backend's Birdeye endpoint for Monad
    const goServiceUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
    
    let fetchUrl: string | null = null;
    let source = '';

    // Prefer Monad token service if configured, otherwise use exchange-token-service Birdeye endpoint
    if (monadServiceUrl) {
      fetchUrl = `${monadServiceUrl}/v1/pulse/new?${params.toString()}`;
      source = 'monad-service';
      isDev && console.log('[pulse-new-monad] Attempting Monad token service:', fetchUrl);
    } else if (goServiceUrl) {
      // Use exchange-token-service backend's Birdeye endpoint for Monad
      fetchUrl = `${goServiceUrl}/v1/pulse/new/monad?${params.toString()}`;
      source = 'exchange-service-birdeye';
      isDev && console.log('[pulse-new-monad] Using exchange-token-service Birdeye endpoint:', fetchUrl);
    } else {
      throw new Error('Neither MONAD_TOKEN_SERVICE_URL nor NEXT_PUBLIC_GO_SERVICE_URL is configured');
    }

    // Fetch data
    const upstream = await fetchWithTimeout(fetchUrl, 10000);
    const text = await upstream.text();

    if (!upstream.ok) {
      console.error(`[pulse-new-monad] ${source} error:`, upstream.status, text.substring(0, 200));
      
      // If Monad service failed and we have exchange-service as fallback, try it
      if (source === 'monad-service' && goServiceUrl) {
        isDev && console.log('[pulse-new-monad] Monad service failed, trying exchange-service Birdeye endpoint as fallback');
        const fallbackUrl = `${goServiceUrl}/v1/pulse/new/monad?${params.toString()}`;
        const fallbackResp = await fetchWithTimeout(fallbackUrl, 10000);
        const fallbackText = await fallbackResp.text();
        
        if (!fallbackResp.ok) {
          throw new Error(`Both Monad service (${upstream.status}) and exchange-service (${fallbackResp.status}) failed`);
        }
        
        const fallbackData = JSON.parse(fallbackText);
        // Handle Birdeye format response
        const data = fallbackData?.data?.tokens || fallbackData?.data || fallbackData;
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Source', 'exchange-service-birdeye-fallback');
        return res.json(data);
      }
      
      throw new Error(`Upstream error from ${source}: ${upstream.status} - ${text.substring(0, 100)}`);
    }

    const response = JSON.parse(text);
    
    // Handle different response formats:
    // 1. Direct array
    // 2. { status, count, data: [...] }
    // 3. Birdeye format: { data: { tokens: [...] } }
    let data;
    if (Array.isArray(response)) {
      data = response;
    } else if (response?.data) {
      if (Array.isArray(response.data)) {
        data = response.data;
      } else if (response.data?.tokens && Array.isArray(response.data.tokens)) {
        data = response.data.tokens;
      } else {
        data = response;
      }
    } else {
      data = response;
    }

    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Source', source);
    return res.json(data);
  } catch (err: any) {
    console.error('[pulse-new-monad] Error fetching data:', err.message || err);
    const errorMessage = err.message || 'Bad gateway to Monad token service';
    res.status(502).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}

