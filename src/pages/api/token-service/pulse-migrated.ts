import type { NextApiRequest, NextApiResponse } from 'next';
import { extractTokenImage } from '~/utils/images';

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
  // Only set default limit if no limit is provided
  if (!params.get('limit')) params.set('limit', '70');

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
            // Add backward compatibility: mint field (frontend expects this)
            token.mint = token.mint_address || token.mint;

            // Map field names to match what the frontend expects
            token.usd_price = token.price_usd ?? 0;
            token.fully_diluted_value = token.market_cap_usd ?? 0;
            token.bonding_curve_progress = parseFloat(token.bonding_pct ?? 0); // bonding_pct is already a percentage
            token.graduation_percent = parseFloat(token.graduation_percent ?? 0); // graduation_percent for hover display (snake_case)
            token.graduationPercent = parseFloat(token.graduation_percent ?? 0); // graduation_percent for hover display (camelCase for compatibility)
            token.bonding_pct = parseFloat(token.bonding_pct ?? 0); // Also include raw bonding_pct for fallback
            // Extract image from multiple possible field names
            token.image = extractTokenImage(token) || null;
            token.logo = extractTokenImage(token) || null;
            token.migrated_time = token.migrated_time || null; // Pass through migration timestamp
            token.created_at = token.launch_time || token.created_at || null; // Ensure created_at is set
            token.launchpad_protocol = token.launchpad_protocol || null; // Pass through protocol for filtering and colors
            
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
            const totalBuys24h = token.total_buys_24h ?? 0;
            const totalSells24h = token.total_sells_24h ?? 0;
            const totalBuyVolume24h = token.total_buy_volume_24h ?? 0;
            const totalSellVolume24h = token.total_sell_volume_24h ?? 0;
            const totalBuyers24h = token.total_buyers_24h ?? 0;
            const totalSellers24h = token.total_sellers_24h ?? 0;
            const uniqueWallets24h = token.unique_wallets_24h ?? 0;

            // Ensure TX data fields are available with fallback logic for older tokens
            token.total_buy_volume_5m = (token.total_buy_volume_5m ?? 0) || estimateFrom24h(totalBuyVolume24h, '5m');
            token.total_buy_volume_1h = (token.total_buy_volume_1h ?? 0) || estimateFrom24h(totalBuyVolume24h, '1h');
            token.total_buy_volume_6h = (token.total_buy_volume_6h ?? 0) || estimateFrom24h(totalBuyVolume24h, '6h');
            token.total_buy_volume_24h = totalBuyVolume24h;
            token.total_sell_volume_5m = (token.total_sell_volume_5m ?? 0) || estimateFrom24h(totalSellVolume24h, '5m');
            token.total_sell_volume_1h = (token.total_sell_volume_1h ?? 0) || estimateFrom24h(totalSellVolume24h, '1h');
            token.total_sell_volume_6h = (token.total_sell_volume_6h ?? 0) || estimateFrom24h(totalSellVolume24h, '6h');
            token.total_sell_volume_24h = totalSellVolume24h;
            token.total_buyers_5m = (token.total_buyers_5m ?? 0) || Math.max(1, Math.floor(totalBuyers24h / 288));
            token.total_buyers_1h = (token.total_buyers_1h ?? 0) || Math.max(1, Math.floor(totalBuyers24h / 24));
            token.total_buyers_6h = (token.total_buyers_6h ?? 0) || Math.max(1, Math.floor(totalBuyers24h / 4));
            token.total_buyers_24h = totalBuyers24h;
            token.total_sellers_5m = (token.total_sellers_5m ?? 0) || Math.max(1, Math.floor(totalSellers24h / 288));
            token.total_sellers_1h = (token.total_sellers_1h ?? 0) || Math.max(1, Math.floor(totalSellers24h / 24));
            token.total_sellers_6h = (token.total_sellers_6h ?? 0) || Math.max(1, Math.floor(totalSellers24h / 4));
            token.total_sellers_24h = totalSellers24h;
            token.total_buys_5m = (token.total_buys_5m ?? 0) || Math.max(1, Math.floor(totalBuys24h / 288));
            token.total_buys_1h = (token.total_buys_1h ?? 0) || Math.max(1, Math.floor(totalBuys24h / 24));
            token.total_buys_6h = (token.total_buys_6h ?? 0) || Math.max(1, Math.floor(totalBuys24h / 4));
            token.total_buys_24h = totalBuys24h;
            token.total_sells_5m = (token.total_sells_5m ?? 0) || Math.max(1, Math.floor(totalSells24h / 288));
            token.total_sells_1h = (token.total_sells_1h ?? 0) || Math.max(1, Math.floor(totalSells24h / 24));
            token.total_sells_6h = (token.total_sells_6h ?? 0) || Math.max(1, Math.floor(totalSells24h / 4));
            token.total_sells_24h = totalSells24h;
            token.unique_wallets_5m = (token.unique_wallets_5m ?? 0) || Math.max(1, Math.floor(uniqueWallets24h / 288));
            token.unique_wallets_1h = (token.unique_wallets_1h ?? 0) || Math.max(1, Math.floor(uniqueWallets24h / 24));
            token.unique_wallets_6h = (token.unique_wallets_6h ?? 0) || Math.max(1, Math.floor(uniqueWallets24h / 4));
            token.unique_wallets_24h = uniqueWallets24h;
            token.price_percent_change_5m = token.price_percent_change_5m ?? 0;
            token.price_percent_change_1h = token.price_percent_change_1h ?? 0;
            token.price_percent_change_6h = token.price_percent_change_6h ?? 0;
            token.price_percent_change_24h = token.price_percent_change_24h ?? 0;
            // Holder and KOL counts
            token.holder_count = token.holder_count ?? 0;
            token.kol_count = token.kol_count ?? 0;
            // Dev/sniper/insider percentages
            token.dev_held_percentage = parseFloat(token.dev_held_percentage ?? 0);
            token.sniper_held_percentage = parseFloat(token.sniper_held_percentage ?? 0);
            token.insider_held_percentage = parseFloat(token.insider_held_percentage ?? 0);
            // Top 10 holders percentage
            token.top10_holders_pct = parseFloat(token.top10_holders_pct ?? 0);
            // Dev history
            token.dev_tokens_created = token.dev_tokens_created ?? 0;
            token.dev_tokens_migrated = token.dev_tokens_migrated ?? 0;
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
      isDev && console.log('[Proxy:pulse-migrated] Using Go service:', url);
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
