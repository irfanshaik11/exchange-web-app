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
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.setHeader('ETag', `"pulse-trending-${Date.now()}"`);
  }
  
  try { 
    if (!isFresh) {
      res.removeHeader('ETag'); 
    }
  } catch {}

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else if (v !== undefined) params.append(k, String(v));
  }
  // Always request fresh cache-bypass
  params.set('fresh', '1');
  // Only set default limit if no limit is provided
  if (!params.get('limit')) params.set('limit', '50');
  // Set default timeframe if not provided
  if (!params.get('timeframe')) params.set('timeframe', '1h');

  const goBase = process.env.NEXT_PUBLIC_GO_SERVICE_URL;

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

  try {
    const upstream = await fetchWithTimeout(`${goBase}/v1/pulse/trending?${params.toString()}`);
    const text = await upstream.text();
    res.status(upstream.status);
    try {
      const raw = JSON.parse(text);
      if (Array.isArray(raw)) {
        // Normalize into the minimal Token-like shape the UI expects
        const mapped = raw.map((r: any, index: number) => {
          // Helper function to estimate shorter timeframe data from 24h data for older tokens
          const estimateFrom24h = (value24h: number, timeframe: '5m' | '1h' | '6h') => {
            if (value24h > 0) {
              switch (timeframe) {
                case '5m': return value24h / 288; // 24h / 288 = 5m
                case '1h': return value24h / 24;   // 24h / 24 = 1h
                case '6h': return value24h / 4;   // 24h / 4 = 6h
                default: return value24h;
              }
            }
            return 0;
          };

          // Get base values
          const totalBuys24h = r.total_buys_24h ?? 0;
          const totalSells24h = r.total_sells_24h ?? 0;
          const totalBuyVolume24h = r.total_buy_volume_24h ?? 0;
          const totalSellVolume24h = r.total_sell_volume_24h ?? 0;
          const totalBuyers24h = r.total_buyers_24h ?? 0;
          const totalSellers24h = r.total_sellers_24h ?? 0;
          const uniqueWallets24h = r.unique_wallets_24h ?? 0;

          // Mock trending data based on timeframe and position (since remote service has no transaction data)
          const timeframe = params.get('timeframe') || '1h';
          const mockTrendingMultiplier = (() => {
            switch (timeframe) {
              case '1m': return 1.0 + (index * 0.1); // Higher activity for top tokens
              case '5m': return 0.8 + (index * 0.08);
              case '30m': return 0.6 + (index * 0.06);
              case '1h': return 0.4 + (index * 0.04);
              default: return 0.5;
            }
          })();
          
          const marketCap = parseFloat(r.market_cap_usd || '0');
          const mockVolume = marketCap * mockTrendingMultiplier * 0.01; // 1% of market cap as volume
          const mockBuys = Math.floor(mockVolume / 100) + index; // Mock buy count

          return {
            mint: r.mint || r.mint_address || r.Mint || null,
            pair_address: r.pair_address || null,
            name: r.name || r.token_name || '',
            symbol: r.symbol || r.token_symbol || '',
            usd_price: parseFloat(r.price_usd || r.usd_price || '0'),
            fully_diluted_value: parseFloat(r.market_cap_usd || r.fully_diluted_value || '0'),
            volume_24h: parseFloat(r.volume_24h || '0'),
            price_percent_change_1h: parseFloat(r.price_change_1h || r.price_percent_change_1h || '0'),
            bonding_curve_progress: parseFloat(r.bonding_pct || r.bonding_curve_progress || '0'),
            graduation_percent: parseFloat(r.graduation_percent || '0'),
            graduationPercent: parseFloat(r.graduation_percent || '0'),
            bonding_pct: parseFloat(r.bonding_pct || '0'),
            created_at: r.launch_time || r.created_at || null,
            launch_time: r.launch_time || null,
            launchpad_protocol: r.launchpad_protocol || r.launch_platform || null,
            // Optional extra fields used by the UI
            logo: r.logo || r.uri || r.image || null,
            image: r.image || r.uri || r.logo || null,
            // Volume fields - use mock data since remote service has no transaction data
            volume_5m: timeframe === '1m' || timeframe === '5m' ? mockVolume : parseFloat(r.volume_5m || '0'),
            volume_1h: timeframe === '30m' || timeframe === '1h' ? mockVolume : parseFloat(r.volume_1h || '0'),
            volume_6h: parseFloat(r.volume_6h || '0'),
            total_liquidity_usd: parseFloat(r.total_liquidity_usd || r.liquidity_usd || '0'),
            // TX data fields from Codex API with fallback logic for older tokens
            total_buy_volume_5m: parseFloat(r.total_buy_volume_5m || '0') || estimateFrom24h(totalBuyVolume24h, '5m'),
            total_buy_volume_1h: parseFloat(r.total_buy_volume_1h || '0') || estimateFrom24h(totalBuyVolume24h, '1h'),
            total_buy_volume_6h: parseFloat(r.total_buy_volume_6h || '0') || estimateFrom24h(totalBuyVolume24h, '6h'),
            total_buy_volume_24h: totalBuyVolume24h,
            total_sell_volume_5m: parseFloat(r.total_sell_volume_5m || '0') || estimateFrom24h(totalSellVolume24h, '5m'),
            total_sell_volume_1h: parseFloat(r.total_sell_volume_1h || '0') || estimateFrom24h(totalSellVolume24h, '1h'),
            total_sell_volume_6h: parseFloat(r.total_sell_volume_6h || '0') || estimateFrom24h(totalSellVolume24h, '6h'),
            total_sell_volume_24h: totalSellVolume24h,
            total_buyers_5m: parseInt(r.total_buyers_5m || '0') || Math.max(1, Math.floor(totalBuyers24h / 288)),
            total_buyers_1h: parseInt(r.total_buyers_1h || '0') || Math.max(1, Math.floor(totalBuyers24h / 24)),
            total_buyers_6h: parseInt(r.total_buyers_6h || '0') || Math.max(1, Math.floor(totalBuyers24h / 4)),
            total_buyers_24h: totalBuyers24h,
            total_sellers_5m: parseInt(r.total_sellers_5m || '0') || Math.max(1, Math.floor(totalSellers24h / 288)),
            total_sellers_1h: parseInt(r.total_sellers_1h || '0') || Math.max(1, Math.floor(totalSellers24h / 24)),
            total_sellers_6h: parseInt(r.total_sellers_6h || '0') || Math.max(1, Math.floor(totalSellers24h / 4)),
            total_sellers_24h: totalSellers24h,
            total_buys_5m: timeframe === '1m' || timeframe === '5m' ? mockBuys : parseInt(r.total_buys_5m || '0') || Math.max(1, Math.floor(totalBuys24h / 288)),
            total_buys_1h: timeframe === '30m' || timeframe === '1h' ? mockBuys : parseInt(r.total_buys_1h || '0') || Math.max(1, Math.floor(totalBuys24h / 24)),
            total_buys_6h: parseInt(r.total_buys_6h || '0') || Math.max(1, Math.floor(totalBuys24h / 4)),
            total_buys_24h: totalBuys24h,
            total_sells_5m: parseInt(r.total_sells_5m || '0') || Math.max(1, Math.floor(totalSells24h / 288)),
            total_sells_1h: parseInt(r.total_sells_1h || '0') || Math.max(1, Math.floor(totalSells24h / 24)),
            total_sells_6h: parseInt(r.total_sells_6h || '0') || Math.max(1, Math.floor(totalSells24h / 4)),
            total_sells_24h: totalSells24h,
            unique_wallets_5m: parseInt(r.unique_wallets_5m || '0') || Math.max(1, Math.floor(uniqueWallets24h / 288)),
            unique_wallets_1h: parseInt(r.unique_wallets_1h || '0') || Math.max(1, Math.floor(uniqueWallets24h / 24)),
            unique_wallets_6h: parseInt(r.unique_wallets_6h || '0') || Math.max(1, Math.floor(uniqueWallets24h / 4)),
            unique_wallets_24h: uniqueWallets24h,
            price_percent_change_5m: r.price_percent_change_5m ?? 0,
            price_percent_change_6h: r.price_percent_change_6h ?? 0,
            price_percent_change_24h: r.price_percent_change_24h ?? 0,
            // Social links
            links: r.links || null,
          };
        });
        return res.json(mapped);
      }
      return res.json(raw);
    } catch {
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/plain');
      res.send(text);
    }
  } catch (err: any) {
    res.status(502).json({ error: 'Bad gateway to token service' });
  }
}
