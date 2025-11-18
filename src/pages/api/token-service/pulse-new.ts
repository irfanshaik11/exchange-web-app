import type { NextApiRequest, NextApiResponse } from 'next';
import { extractTokenImage } from '~/utils/images';
// import { ImageSearchService } from '~/utils/imageSearch'; // REMOVED - not used

// In-memory cache for new pairs
interface CacheEntry {
  data: any;
  timestamp: number;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 1000; // 30 seconds
const MAX_CACHE_SIZE = 10; // Keep last 10 requests

// Cleanup function - called on each request
function cleanupCache() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      cache.delete(key);
    }
  }
  // Limit cache size
  if (cache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(0, cache.size - MAX_CACHE_SIZE);
    toDelete.forEach(([key]) => cache.delete(key));
  }
}

function getCacheKey(params: URLSearchParams): string {
  // Create cache key from limit and protocols
  const limit = params.get('limit') || '30';
  const protocols = params.get('protocols') || '';
  return `pulse-new:${limit}:${protocols}`;
}

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
    res.setHeader('ETag', `"pulse-new-${Date.now()}"`);
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
  // Only set default limit if no limit is provided
  if (!params.get('limit')) params.set('limit', '30');

  const goBase = process.env.NEXT_PUBLIC_GO_SERVICE_URL;

  // Cleanup expired cache entries
  cleanupCache();

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

  // Helper function to fetch and cache data - defined before use
  const fetchFreshData = async (params: URLSearchParams, cacheKey?: string): Promise<any> => {
    const fetchParams = new URLSearchParams(params);
    fetchParams.set('fresh', '1'); // Always request fresh from upstream
    
    const upstream = await fetchWithTimeout(`${goBase}/v1/pulse/new?${fetchParams.toString()}`);
    const text = await upstream.text();
    
    if (!upstream.ok) {
      throw new Error(`Upstream error: ${upstream.status}`);
    }
    
    try {
      const raw = JSON.parse(text);
      if (Array.isArray(raw)) {
        // Normalize into the minimal Token-like shape the UI expects
        const mapped = raw.map((r: any) => {
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

          return {
            mint: r.mint || r.mint_address || r.Mint || null,
            pair_address: r.pair_address || null,
            name: r.name || r.token_name || '',
            symbol: r.symbol || r.token_symbol || '',
            usd_price: r.price_usd ?? 0,
            fully_diluted_value: r.market_cap_usd ?? 0,
            volume_24h: r.volume_24h ?? 0,
            price_percent_change_1h: r.price_change_1h ?? 0,
            bonding_curve_progress: parseFloat(r.bonding_pct ?? 0), // bonding_pct is already a percentage
            graduation_percent: parseFloat(r.graduation_percent ?? 0), // graduation_percent for hover display (snake_case)
            graduationPercent: parseFloat(r.graduation_percent ?? 0), // graduation_percent for hover display (camelCase for compatibility)
            bonding_pct: parseFloat(r.bonding_pct ?? 0), // Also include raw bonding_pct for fallback
            created_at: r.launch_time || r.created_at || null,
            launch_time: r.launch_time || null,
            launchpad_protocol: r.launchpad_protocol || null, // Pass through protocol for filtering and colors
            // Optional extra fields used by the UI - extract image from multiple possible field names
            logo: extractTokenImage(r) || null,
            image: extractTokenImage(r) || null,
            uri: r.uri || null,
            // TX data fields from Codex API with fallback logic for older tokens
            total_buy_volume_5m: (r.total_buy_volume_5m ?? 0) || estimateFrom24h(totalBuyVolume24h, '5m'),
            total_buy_volume_1h: (r.total_buy_volume_1h ?? 0) || estimateFrom24h(totalBuyVolume24h, '1h'),
            total_buy_volume_6h: (r.total_buy_volume_6h ?? 0) || estimateFrom24h(totalBuyVolume24h, '6h'),
            total_buy_volume_24h: totalBuyVolume24h,
            total_sell_volume_5m: (r.total_sell_volume_5m ?? 0) || estimateFrom24h(totalSellVolume24h, '5m'),
            total_sell_volume_1h: (r.total_sell_volume_1h ?? 0) || estimateFrom24h(totalSellVolume24h, '1h'),
            total_sell_volume_6h: (r.total_sell_volume_6h ?? 0) || estimateFrom24h(totalSellVolume24h, '6h'),
            total_sell_volume_24h: totalSellVolume24h,
            total_buyers_5m: (r.total_buyers_5m ?? 0) || Math.max(1, Math.floor(totalBuyers24h / 288)),
            total_buyers_1h: (r.total_buyers_1h ?? 0) || Math.max(1, Math.floor(totalBuyers24h / 24)),
            total_buyers_6h: (r.total_buyers_6h ?? 0) || Math.max(1, Math.floor(totalBuyers24h / 4)),
            total_buyers_24h: totalBuyers24h,
            total_sellers_5m: (r.total_sellers_5m ?? 0) || Math.max(1, Math.floor(totalSellers24h / 288)),
            total_sellers_1h: (r.total_sellers_1h ?? 0) || Math.max(1, Math.floor(totalSellers24h / 24)),
            total_sellers_6h: (r.total_sellers_6h ?? 0) || Math.max(1, Math.floor(totalSellers24h / 4)),
            total_sellers_24h: totalSellers24h,
            total_buys_5m: (r.total_buys_5m ?? 0) || Math.max(1, Math.floor(totalBuys24h / 288)),
            total_buys_1h: (r.total_buys_1h ?? 0) || Math.max(1, Math.floor(totalBuys24h / 24)),
            total_buys_6h: (r.total_buys_6h ?? 0) || Math.max(1, Math.floor(totalBuys24h / 4)),
            total_buys_24h: totalBuys24h,
            total_sells_5m: (r.total_sells_5m ?? 0) || Math.max(1, Math.floor(totalSells24h / 288)),
            total_sells_1h: (r.total_sells_1h ?? 0) || Math.max(1, Math.floor(totalSells24h / 24)),
            total_sells_6h: (r.total_sells_6h ?? 0) || Math.max(1, Math.floor(totalSells24h / 4)),
            total_sells_24h: totalSells24h,
            unique_wallets_5m: (r.unique_wallets_5m ?? 0) || Math.max(1, Math.floor(uniqueWallets24h / 288)),
            unique_wallets_1h: (r.unique_wallets_1h ?? 0) || Math.max(1, Math.floor(uniqueWallets24h / 24)),
            unique_wallets_6h: (r.unique_wallets_6h ?? 0) || Math.max(1, Math.floor(uniqueWallets24h / 4)),
            unique_wallets_24h: uniqueWallets24h,
            price_percent_change_5m: r.price_percent_change_5m ?? 0,
            price_percent_change_6h: r.price_percent_change_6h ?? 0,
            price_percent_change_24h: r.price_percent_change_24h ?? 0,
            // Social links
            links: r.links || null,
          };
        });
        
        // Cache the result
        if (cacheKey) {
          const now = Date.now();
          cache.set(cacheKey, {
            data: mapped,
            timestamp: now,
            expiresAt: now + CACHE_TTL,
          });
          console.log(`[pulse-new] Cached data for key: ${cacheKey}`);
        }
        
        return mapped;
      }
      
      // Cache non-array responses too
      if (cacheKey) {
        const now = Date.now();
        cache.set(cacheKey, {
          data: raw,
          timestamp: now,
          expiresAt: now + CACHE_TTL,
        });
      }
      
      return raw;
    } catch (parseError: any) {
      throw new Error(`Failed to parse response: ${parseError?.message || String(parseError)}`);
    }
  };

  // Check in-memory cache first (unless fresh=1 is requested)
  if (!isFresh) {
    const cacheKey = getCacheKey(params);
    const cached = cache.get(cacheKey);
    const now = Date.now();
    
    if (cached && now < cached.expiresAt) {
      // Cache hit - return cached data immediately
      console.log(`[pulse-new] Cache hit for key: ${cacheKey}`);
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached.data);
    } else if (cached && now < cached.expiresAt + 60000) {
      // Stale but usable - return it and refresh in background
      console.log(`[pulse-new] Stale cache hit for key: ${cacheKey}, refreshing in background`);
      res.setHeader('X-Cache', 'STALE');
      // Trigger background refresh (don't await)
      fetchFreshData(params, cacheKey).catch(err => {
        console.error('[pulse-new] Background refresh failed:', err);
      });
      return res.json(cached.data);
    }
  }

  // Cache miss or fresh request - fetch new data
  console.log(`[pulse-new] Cache miss, fetching fresh data`);
  res.setHeader('X-Cache', 'MISS');

  try {
    const data = await fetchFreshData(params, getCacheKey(params));
    return res.json(data);
  } catch (err: any) {
    console.error('[pulse-new] Error fetching data:', err);
    res.status(502).json({ error: 'Bad gateway to token service' });
  }
}
