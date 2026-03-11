import type { NextApiRequest, NextApiResponse } from 'next';
import { extractTokenImage } from '~/utils/images';

const isDev = process.env.NODE_ENV !== 'production';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set appropriate cache headers for better performance
  const isFresh = req.query.fresh === '1';
  
  isDev && console.log('[pulse-trending] Handler called with query:', req.query);
  
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
  if (!params.get('timeframe')) params.set('timeframe', '24h');

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
    const requestedTimeframe = params.get('timeframe');
    
    // STRICTLY validate timeframe - only allow supported values
    const validTimeframes = ['5m', '1h', '6h', '24h'];
    const timeframe = requestedTimeframe && validTimeframes.includes(requestedTimeframe) 
      ? requestedTimeframe 
      : '24h'; // fallback to 24h if invalid/missing
    
    if (requestedTimeframe !== timeframe) {
      console.warn('[pulse-trending] Invalid timeframe requested:', requestedTimeframe, 'using:', timeframe);
    }
    
    const limit = params.get('limit') || '50';
    
    isDev && console.log('[pulse-trending] Request params:', {
      requested_timeframe: requestedTimeframe,
      validated_timeframe: timeframe,
      limit
    });
    
    const trendingParams = new URLSearchParams();
    trendingParams.set('timeframe', timeframe);
    trendingParams.set('limit', limit);
    
    const trendingUrl = `${goBase}/v1/tokens/trending?${trendingParams.toString()}`;
    isDev && console.log('[pulse-trending] Fetching from:', trendingUrl);
    
    const upstream = await fetchWithTimeout(trendingUrl, 3000);
    const text = await upstream.text();
    res.status(upstream.status);
    try {
      const raw = JSON.parse(text);
      if (Array.isArray(raw)) {
        // Map backend format to frontend format
        // Backend: mint, pairAddress, name, symbol, imageUrl, marketCap, liquidity, volume, priceUSD, change, txnCount, buyCount, sellCount, createdAt
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

          // Detect format: Codex format has 'volume', 'change', 'buyCount', 'sellCount'
          // Legacy format has 'volume24h', 'priceChange24h', 'score', 'rank'
          const isCodexFormat = 'volume' in r || 'change' in r || 'buyCount' in r;
          const isLegacyFormat = 'volume24h' in r || 'priceChange24h' in r || 'score' in r;
          
          // Handle Codex format (new format)
          if (isCodexFormat) {
            const volumeForTimeframe = parseFloat(r.volume || '0');
            const priceChange = parseFloat(r.change || '0') * 100; // Convert to percentage
            const totalBuys = parseInt(r.buyCount || '0') || 0;
            const totalSells = parseInt(r.sellCount || '0') || 0;
            
            return {
              mint: r.mint || null,
              pair_address: r.pairAddress || r.pair_address || null,
              name: r.name || '',
              symbol: r.symbol || '',
              launchpad_protocol: r.launchpad_protocol || r.launchpadProtocol || r.launchpadName || null,
              usd_price: parseFloat(r.priceUSD || r.price_usd || '0'),
              fully_diluted_value: parseFloat(r.marketCap || r.market_cap_usd || '0'),
              volume_5m: timeframe === '5m' ? volumeForTimeframe : 0,
              volume_1h: timeframe === '1h' ? volumeForTimeframe : 0,
              volume_6h: timeframe === '6h' ? volumeForTimeframe : 0,
              volume_24h: timeframe === '24h' ? volumeForTimeframe : 0,
              volume_1m: 0,
              volume_30m: 0,
              total_liquidity_usd: parseFloat(r.liquidity || r.total_liquidity_usd || '0'),
              created_at: r.createdAt ? new Date(r.createdAt * 1000).toISOString() : null,
              // Extract image from multiple possible field names
              logo: extractTokenImage(r) || null,
              image: extractTokenImage(r) || null,
              total_buys_5m: timeframe === '5m' ? totalBuys : 0,
              total_buys_1h: timeframe === '1h' ? totalBuys : 0,
              total_buys_6h: timeframe === '6h' ? totalBuys : 0,
              total_buys_24h: timeframe === '24h' ? totalBuys : 0,
              total_sells_5m: timeframe === '5m' ? totalSells : 0,
              total_sells_1h: timeframe === '1h' ? totalSells : 0,
              total_sells_6h: timeframe === '6h' ? totalSells : 0,
              total_sells_24h: timeframe === '24h' ? totalSells : 0,
              links: r.links || null,
            };
          }
          
          // Handle legacy format (fallback when Codex is unavailable)
          if (isLegacyFormat) {
            const volume24h = parseFloat(r.volume24h || '0');
            const priceChange = parseFloat(r.priceChange24h || '0');
            
            return {
              mint: r.mint || null,
              pair_address: null, // Legacy format doesn't have pair_address
              name: r.name || '',
              symbol: r.symbol || '',
              launchpad_protocol: null,
              usd_price: parseFloat(r.priceUsd || r.price_usd || '0'),
              fully_diluted_value: parseFloat(r.marketCapUsd || r.market_cap_usd || '0'),
              volume_5m: 0,
              volume_1h: 0,
              volume_6h: 0,
              volume_24h: volume24h,
              volume_1m: 0,
              volume_30m: 0,
              total_liquidity_usd: 0, // Legacy format doesn't have liquidity
              created_at: null,
              // Extract image from multiple possible field names (even in legacy format)
              logo: extractTokenImage(r) || null,
              image: extractTokenImage(r) || null,
              total_buys_5m: 0,
              total_buys_1h: 0,
              total_buys_6h: 0,
              total_buys_24h: 0,
              total_sells_5m: 0,
              total_sells_1h: 0,
              total_sells_6h: 0,
              total_sells_24h: 0,
              links: null,
            };
          }
          
          // Fallback for unknown format
          return {
            mint: r.mint || null,
            pair_address: r.pairAddress || r.pair_address || null,
            name: r.name || '',
            symbol: r.symbol || '',
            launchpad_protocol: r.launchpad_protocol || r.launchpadProtocol || r.launchpadName || null,
            usd_price: parseFloat(r.priceUSD || r.priceUsd || r.price_usd || '0'),
            fully_diluted_value: parseFloat(r.marketCap || r.marketCapUsd || r.market_cap_usd || '0'),
            volume_5m: 0,
            volume_1h: 0,
            volume_6h: 0,
            volume_24h: parseFloat(r.volume24h || r.volume || '0'),
            volume_1m: 0,
            volume_30m: 0,
            total_liquidity_usd: parseFloat(r.liquidity || r.total_liquidity_usd || '0'),
            created_at: r.createdAt ? new Date(r.createdAt * 1000).toISOString() : null,
            logo: r.imageUrl || r.logo || null,
            image: r.imageUrl || r.image || null,
            total_buys_5m: 0,
            total_buys_1h: 0,
            total_buys_6h: 0,
            total_buys_24h: 0,
            total_sells_5m: 0,
            total_sells_1h: 0,
            total_sells_6h: 0,
            total_sells_24h: 0,
            links: r.links || null,
          };
        });
        
        isDev && console.log('[pulse-trending] Mapped', mapped.length, 'tokens');
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
