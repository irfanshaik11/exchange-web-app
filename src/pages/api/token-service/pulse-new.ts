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
          // Helper function to convert string/number to number
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

          // Get base values - convert to numbers
          const totalBuys24h = toNumber(r.total_buys_24h);
          const totalSells24h = toNumber(r.total_sells_24h);
          const totalBuyVolume24h = toNumber(r.total_buy_volume_24h);
          const totalSellVolume24h = toNumber(r.total_sell_volume_24h);
          const totalBuyers24h = toNumber(r.total_buyers_24h);
          const totalSellers24h = toNumber(r.total_sellers_24h);
          const uniqueWallets24h = toNumber(r.unique_wallets_24h);

          // Calculate volume for different timeframes from buy/sell volumes
          // Prefer buy/sell volume sum as it's more accurate, fallback to direct volume field
          const sum24h = totalBuyVolume24h + totalSellVolume24h;
          const volume24h = sum24h > 0 ? sum24h : toNumber(r.volume_24h);
          
          // For other timeframes, sum buy/sell volumes (API provides these fields)
          // This ensures we always have volume data even if the direct volume field is 0
          const sum1h = toNumber(r.total_buy_volume_1h) + toNumber(r.total_sell_volume_1h);
          const volume1h = sum1h > 0 ? sum1h : toNumber(r.volume_1h);
          
          const sum6h = toNumber(r.total_buy_volume_6h) + toNumber(r.total_sell_volume_6h);
          const volume6h = sum6h > 0 ? sum6h : toNumber(r.volume_6h);
          
          const sum5m = toNumber(r.total_buy_volume_5m) + toNumber(r.total_sell_volume_5m);
          const volume5m = sum5m > 0 ? sum5m : toNumber(r.volume_5m);

          return {
            mint: r.mint_address || r.mint || r.Mint || null,
            mint_address: r.mint_address || r.mint || r.Mint || null, // Also include mint_address for compatibility
            pair_address: r.pair_address || null,
            name: r.name || r.token_name || '',
            symbol: r.symbol || r.token_symbol || '',
            usd_price: toNumber(r.price_usd),
            fully_diluted_value: toNumber(r.market_cap_usd),
            volume_24h: volume24h,
            volume_1h: volume1h,
            volume_6h: volume6h,
            volume_5m: volume5m,
            total_liquidity_usd: toNumber(r.liquidity_usd),
            price_percent_change_1h: toNumber(r.price_change_1h),
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
            total_buy_volume_5m: toNumber(r.total_buy_volume_5m) || estimateFrom24h(totalBuyVolume24h, '5m'),
            total_buy_volume_1h: toNumber(r.total_buy_volume_1h) || estimateFrom24h(totalBuyVolume24h, '1h'),
            total_buy_volume_6h: toNumber(r.total_buy_volume_6h) || estimateFrom24h(totalBuyVolume24h, '6h'),
            total_buy_volume_24h: totalBuyVolume24h,
            total_sell_volume_5m: toNumber(r.total_sell_volume_5m) || estimateFrom24h(totalSellVolume24h, '5m'),
            total_sell_volume_1h: toNumber(r.total_sell_volume_1h) || estimateFrom24h(totalSellVolume24h, '1h'),
            total_sell_volume_6h: toNumber(r.total_sell_volume_6h) || estimateFrom24h(totalSellVolume24h, '6h'),
            total_sell_volume_24h: totalSellVolume24h,
            total_buyers_5m: toNumber(r.total_buyers_5m) || Math.max(1, Math.floor(totalBuyers24h / 288)),
            total_buyers_1h: toNumber(r.total_buyers_1h) || Math.max(1, Math.floor(totalBuyers24h / 24)),
            total_buyers_6h: toNumber(r.total_buyers_6h) || Math.max(1, Math.floor(totalBuyers24h / 4)),
            total_buyers_24h: totalBuyers24h,
            total_sellers_5m: toNumber(r.total_sellers_5m) || Math.max(1, Math.floor(totalSellers24h / 288)),
            total_sellers_1h: toNumber(r.total_sellers_1h) || Math.max(1, Math.floor(totalSellers24h / 24)),
            total_sellers_6h: toNumber(r.total_sellers_6h) || Math.max(1, Math.floor(totalSellers24h / 4)),
            total_sellers_24h: totalSellers24h,
            total_buys_5m: toNumber(r.total_buys_5m) || Math.max(1, Math.floor(totalBuys24h / 288)),
            total_buys_1h: toNumber(r.total_buys_1h) || Math.max(1, Math.floor(totalBuys24h / 24)),
            total_buys_6h: toNumber(r.total_buys_6h) || Math.max(1, Math.floor(totalBuys24h / 4)),
            total_buys_24h: totalBuys24h,
            total_sells_5m: toNumber(r.total_sells_5m) || Math.max(1, Math.floor(totalSells24h / 288)),
            total_sells_1h: toNumber(r.total_sells_1h) || Math.max(1, Math.floor(totalSells24h / 24)),
            total_sells_6h: toNumber(r.total_sells_6h) || Math.max(1, Math.floor(totalSells24h / 4)),
            total_sells_24h: totalSells24h,
            unique_wallets_5m: toNumber(r.unique_wallets_5m) || Math.max(1, Math.floor(uniqueWallets24h / 288)),
            unique_wallets_1h: toNumber(r.unique_wallets_1h) || Math.max(1, Math.floor(uniqueWallets24h / 24)),
            unique_wallets_6h: toNumber(r.unique_wallets_6h) || Math.max(1, Math.floor(uniqueWallets24h / 4)),
            unique_wallets_24h: uniqueWallets24h,
            price_percent_change_5m: toNumber(r.price_percent_change_5m),
            price_percent_change_6h: toNumber(r.price_percent_change_6h),
            price_percent_change_24h: toNumber(r.price_percent_change_24h),
            // Holder and KOL counts
            holder_count: r.holder_count ?? 0,
            kol_count: r.kol_count ?? 0,
            // Dev/sniper/insider percentages
            dev_held_percentage: toNumber(r.dev_held_percentage),
            sniper_held_percentage: toNumber(r.sniper_held_percentage),
            insider_held_percentage: toNumber(r.insider_held_percentage),
            // Top 10 holders percentage
            top10_holders_pct: toNumber(r.top10_holders_pct),
            // Dev history
            dev_tokens_created: r.dev_tokens_created ?? 0,
            dev_tokens_migrated: r.dev_tokens_migrated ?? 0,
            // Social links
            links: r.links || null,
            // Dev wallet for blacklist feature
            dev_wallet: r.dev_wallet || r.creator_wallet || null,
            creator_wallet: r.creator_wallet || r.dev_wallet || null,
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
