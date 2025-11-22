import type { NextApiRequest, NextApiResponse } from 'next';
import { extractTokenImage } from '~/utils/images';
import { env } from '~/env';

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
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
      else if (v !== undefined) params.append(k, String(v));
    }
    
    // Set default limit if not provided
    if (!params.get('limit')) params.set('limit', '70');

    const monadTokenServiceUrl = env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL;
    
    if (!monadTokenServiceUrl) {
      console.error('[pulse-migrated-monad] NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL is not set');
      return res.status(500).json({ error: 'Monad token service URL is not configured' });
    }
    
    const url = `${monadTokenServiceUrl}/v1/pulse/migrated?${params.toString()}`;
    
    const fetchWithTimeout = async (url: string, timeoutMs = 2500) => {
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

    const response = await fetchWithTimeout(url);
    
    if (!response.ok) {
      console.error(`[pulse-migrated-monad] Upstream error: ${response.status}`);
      return res.status(response.status).json({ error: 'Bad gateway to Monad token service' });
    }

    const data = await response.json();
    
    // Monad token service returns { status: "success", count: number, data: Token[] }
    const tokens = data?.data || data || [];
    
    // Map Monad token service format to expected frontend format
    // Only map fields that the database actually returns
    const mapped = Array.isArray(tokens) ? tokens.map((r: any) => {
      const toNumber = (value: any): number => {
        if (typeof value === 'number') {
          return Number.isFinite(value) ? value : 0;
        }
        if (typeof value === 'string') {
          const cleaned = value.trim();
          if (!cleaned) return 0;
          const parsed = Number(cleaned);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      };

      // Only use fields that exist in the database response
      return {
        mint: r.address || null,
        pair_address: r.address || null,
        name: r.name || '',
        symbol: r.symbol || '',
        usd_price: toNumber(r.price_usd),
        fully_diluted_value: toNumber(r.market_cap_usd),
        volume_24h: toNumber(r.volume_24h_usd),
        volume_5m: toNumber(r.volume_5m_usd) || 0,
        volume_1h: toNumber(r.volume_1h_usd) || 0,
        volume_6h: toNumber(r.volume_6h_usd) || 0,
        created_at: r.created_at || null,
        launch_time: r.created_at || null,
        launchpad_protocol: r.launchpad_protocol || null,
        image_url: r.image_url || null,
        status: r.status || 'MIGRATED',
        decimals: r.decimals || 18,
        total_transactions: toNumber(r.total_transactions) || 0,
        total_buys: toNumber(r.total_buys) || 0,
        total_sells: toNumber(r.total_sells) || 0,
        unique_traders: toNumber(r.unique_traders) || 0,
        is_graduated: r.is_graduated || false,
        updated_at: r.updated_at || null,
      };
    }) : [];

    res.setHeader('X-Cache', 'MISS');
    return res.json(mapped);
  } catch (err: any) {
    console.error('[pulse-migrated-monad] Error fetching data:', err);
    res.status(502).json({ error: 'Bad gateway to Monad token service' });
  }
}

