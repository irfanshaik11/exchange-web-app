import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Disable caching for realtime freshness
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try { res.removeHeader('ETag'); } catch {}

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else if (v !== undefined) params.append(k, String(v));
  }
  // Always request fresh cache-bypass
  params.set('fresh', '1');
  // Only set default limit if no limit is provided
  if (!params.get('limit')) params.set('limit', '30');

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
    const upstream = await fetchWithTimeout(`${goBase}/v1/pulse/final-stretch?${params.toString()}`);
    const text = await upstream.text();
    res.status(upstream.status);
    try {
      const raw = JSON.parse(text);
      if (Array.isArray(raw)) {
        // Filter out tokens without sufficient data for OHLC charts
        const filtered = raw.filter((r: any) => {
          // Must have a valid pair_address for chart data
          if (!r.pair_address) {
            console.log(`[Final Stretch Filter] Excluding ${r.symbol || 'unknown'}: No pair_address`);
            return false;
          }
          
          // Check for actual trading activity (not just price data)
          const hasRecentVolume = (r.volume_24h ?? 0) > 0 || 
                                 (r.total_buy_volume_24h ?? 0) > 0 || 
                                 (r.total_sell_volume_24h ?? 0) > 0;
          
          // Check for trading transactions (buys/sells)
          const hasTrades = (r.total_buys_24h ?? 0) > 0 || 
                           (r.total_sells_24h ?? 0) > 0 ||
                           (r.total_buys_1h ?? 0) > 0 ||
                           (r.total_sells_1h ?? 0) > 0;
          
          // Check for unique traders
          const hasTraders = (r.total_buyers_24h ?? 0) > 0 || 
                            (r.total_sellers_24h ?? 0) > 0 ||
                            (r.unique_wallets_24h ?? 0) > 0;
          
          // Must have BOTH volume AND actual trades/traders to ensure OHLC data exists
          // This prevents tokens that only have static price but no trading history
          const isValid = hasRecentVolume && (hasTrades || hasTraders);
          
          if (!isValid) {
            console.log(`[Final Stretch Filter] Excluding ${r.symbol || 'unknown'}: No trading activity (volume: ${hasRecentVolume}, trades: ${hasTrades}, traders: ${hasTraders})`);
          }
          
          return isValid;
        });
        
        console.log(`[Final Stretch Filter] Filtered ${raw.length} tokens down to ${filtered.length} tokens with OHLC data`);
        
        // Log the first few tokens to verify filtering
        if (filtered.length > 0) {
          console.log(`[Final Stretch Filter] Top 3 tokens that passed filter:`, 
            filtered.slice(0, 3).map(r => ({
              symbol: r.symbol,
              protocol: r.launchpad_protocol,
              pair: r.pair_address?.slice(0, 8) + '...',
              volume_24h: r.volume_24h,
              total_buys_24h: r.total_buys_24h,
              bonding_pct: r.bonding_pct,
              graduation_percent: r.graduation_percent
            }))
          );
        }
        
        // Specifically log Meteora tokens to verify graduation_percent
        const meteoraTokens = filtered.filter(r => 
          r.launchpad_protocol?.toLowerCase().includes('meteora')
        );
        if (meteoraTokens.length > 0) {
          console.log(`[Final Stretch Filter] Found ${meteoraTokens.length} Meteora tokens:`, 
            meteoraTokens.slice(0, 3).map(r => ({
              symbol: r.symbol,
              graduation_percent: r.graduation_percent,
              bonding_pct: r.bonding_pct,
              has_graduation_data: !!r.graduation_percent
            }))
          );
        }
        
        // Normalize into the minimal Token-like shape the UI expects
        const mapped = filtered.map((r: any) => ({
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
          // Optional extra fields used by the UI
          logo: r.logo || r.uri || r.image || null,
          image: r.image || r.uri || r.logo || null,
          // TX data fields from Codex API
          total_buy_volume_5m: r.total_buy_volume_5m ?? 0,
          total_buy_volume_1h: r.total_buy_volume_1h ?? 0,
          total_buy_volume_6h: r.total_buy_volume_6h ?? 0,
          total_buy_volume_24h: r.total_buy_volume_24h ?? 0,
          total_sell_volume_5m: r.total_sell_volume_5m ?? 0,
          total_sell_volume_1h: r.total_sell_volume_1h ?? 0,
          total_sell_volume_6h: r.total_sell_volume_6h ?? 0,
          total_sell_volume_24h: r.total_sell_volume_24h ?? 0,
          total_buyers_5m: r.total_buyers_5m ?? 0,
          total_buyers_1h: r.total_buyers_1h ?? 0,
          total_buyers_6h: r.total_buyers_6h ?? 0,
          total_buyers_24h: r.total_buyers_24h ?? 0,
          total_sellers_5m: r.total_sellers_5m ?? 0,
          total_sellers_1h: r.total_sellers_1h ?? 0,
          total_sellers_6h: r.total_sellers_6h ?? 0,
          total_sellers_24h: r.total_sellers_24h ?? 0,
          total_buys_5m: r.total_buys_5m ?? 0,
          total_buys_1h: r.total_buys_1h ?? 0,
          total_buys_6h: r.total_buys_6h ?? 0,
          total_buys_24h: r.total_buys_24h ?? 0,
          total_sells_5m: r.total_sells_5m ?? 0,
          total_sells_1h: r.total_sells_1h ?? 0,
          total_sells_6h: r.total_sells_6h ?? 0,
          total_sells_24h: r.total_sells_24h ?? 0,
          unique_wallets_5m: r.unique_wallets_5m ?? 0,
          unique_wallets_1h: r.unique_wallets_1h ?? 0,
          unique_wallets_6h: r.unique_wallets_6h ?? 0,
          unique_wallets_24h: r.unique_wallets_24h ?? 0,
          price_percent_change_5m: r.price_percent_change_5m ?? 0,
          price_percent_change_6h: r.price_percent_change_6h ?? 0,
          price_percent_change_24h: r.price_percent_change_24h ?? 0,
          // Social links
          links: r.links || null,
        }));
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
