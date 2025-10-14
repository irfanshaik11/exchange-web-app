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
  // Only set default limit if no limit is provided
  if (!params.get('limit')) params.set('limit', '30');

  const primaryBase = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
  const fallbackBase = process.env.NEXT_PUBLIC_GO_FALLBACK_URL;

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
      
      // Map the response to match the expected field names
      if (data && Array.isArray(data)) {
        data.forEach((token: any) => {
          if (token && typeof token === 'object') {
            // Map field names to match what the frontend expects
            token.usd_price = token.price_usd ?? 0;
            token.fully_diluted_value = token.market_cap_usd ?? 0;
            token.bonding_curve_progress = parseFloat(token.bonding_pct ?? 0); // bonding_pct is already a percentage
            token.graduation_percent = parseFloat(token.graduation_percent ?? 0); // graduation_percent for hover display
            token.bonding_pct = parseFloat(token.bonding_pct ?? 0); // Also include raw bonding_pct for fallback
            token.image = token.uri || token.image || null;
            
            // Ensure TX data fields are available (they should come from backend)
            token.total_buy_volume_5m = token.total_buy_volume_5m ?? 0;
            token.total_buy_volume_1h = token.total_buy_volume_1h ?? 0;
            token.total_buy_volume_6h = token.total_buy_volume_6h ?? 0;
            token.total_buy_volume_24h = token.total_buy_volume_24h ?? 0;
            token.total_sell_volume_5m = token.total_sell_volume_5m ?? 0;
            token.total_sell_volume_1h = token.total_sell_volume_1h ?? 0;
            token.total_sell_volume_6h = token.total_sell_volume_6h ?? 0;
            token.total_sell_volume_24h = token.total_sell_volume_24h ?? 0;
            token.total_buyers_5m = token.total_buyers_5m ?? 0;
            token.total_buyers_1h = token.total_buyers_1h ?? 0;
            token.total_buyers_6h = token.total_buyers_6h ?? 0;
            token.total_buyers_24h = token.total_buyers_24h ?? 0;
            token.total_sellers_5m = token.total_sellers_5m ?? 0;
            token.total_sellers_1h = token.total_sellers_1h ?? 0;
            token.total_sellers_6h = token.total_sellers_6h ?? 0;
            token.total_sellers_24h = token.total_sellers_24h ?? 0;
            token.total_buys_5m = token.total_buys_5m ?? 0;
            token.total_buys_1h = token.total_buys_1h ?? 0;
            token.total_buys_6h = token.total_buys_6h ?? 0;
            token.total_buys_24h = token.total_buys_24h ?? 0;
            token.total_sells_5m = token.total_sells_5m ?? 0;
            token.total_sells_1h = token.total_sells_1h ?? 0;
            token.total_sells_6h = token.total_sells_6h ?? 0;
            token.total_sells_24h = token.total_sells_24h ?? 0;
            token.unique_wallets_5m = token.unique_wallets_5m ?? 0;
            token.unique_wallets_1h = token.unique_wallets_1h ?? 0;
            token.unique_wallets_6h = token.unique_wallets_6h ?? 0;
            token.unique_wallets_24h = token.unique_wallets_24h ?? 0;
            token.price_percent_change_5m = token.price_percent_change_5m ?? 0;
            token.price_percent_change_1h = token.price_percent_change_1h ?? 0;
            token.price_percent_change_6h = token.price_percent_change_6h ?? 0;
            token.price_percent_change_24h = token.price_percent_change_24h ?? 0;
            token.links = token.links || null;
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
    const tryGo = async (base: string) => {
      const url = `${base}/v1/pulse/migrated?${params.toString()}`;
      console.log('[Proxy:pulse-migrated] Using Go service:', url);
      const upstream = await fetchWithTimeout(url, 3000);
      return await tryParseAndSend(upstream);
    };
    try {
      return await tryGo(primaryBase);
    } catch (e1: any) {
      console.error('[Proxy:pulse-migrated] Primary failed, trying fallback:', e1?.message || e1);
      return await tryGo(fallbackBase);
    }
  } catch (err: any) {
    console.error('[Proxy:pulse-migrated] Go service fetch failed:', err?.message || err);
    return res.status(502).json({ error: 'Bad gateway to Go token service' });
  }
}
