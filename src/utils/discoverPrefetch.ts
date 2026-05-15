/**
 * Background prefetch utilities for Discover page tabs.
 *
 * These functions fetch data from REST APIs and write to the same
 * localStorage / sessionStorage cache keys that discover.tsx reads,
 * so the page renders instantly from cache when the user navigates there.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toNumber = (value: any): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.trim();
    if (!cleaned || cleaned === '0' || cleaned === 'null') return 0;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

// ─── xStocks ─────────────────────────────────────────────────────────────────

const XSTOCKS_CACHE_KEY = 'discover_xstocks_cache';
const XSTOCKS_STALE = 60_000; // 60 seconds

function normalizeXStocksToken(result: any): Record<string, any> {
  const token = result.token || {};
  const pair = result.pair || {};

  const getImage = () =>
    token.info?.imageThumbUrl ||
    token.info?.imageSmallUrl ||
    token.info?.imageLargeUrl ||
    token.imageThumbUrl ||
    token.imageSmallUrl ||
    token.imageLargeUrl ||
    undefined;

  const marketCap = toNumber(result.marketCap || '0');
  const liquidity = toNumber(result.liquidity || '0');
  const volume24h = toNumber(result.volume24 || '0');
  const volume12h = toNumber(result.volume12 || '0');
  const volume4h = toNumber(result.volume4 || '0');
  const volume1h = toNumber(result.volume1 || '0');
  const volume5m = toNumber(result.volume5m || '0');
  const change24h = toNumber(result.change24 || '0');
  const change12h = toNumber(result.change12 || '0');
  const change4h = toNumber(result.change4 || '0');
  const change1h = toNumber(result.change1 || '0');
  const change5m = toNumber(result.change5m || '0');
  const img = getImage();

  return {
    mint: token.address || '',
    name: token.name || '',
    symbol: token.symbol || '',
    decimals: token.decimals || 9,
    networkId: token.networkId || 1399811149,
    market_cap_usd: marketCap,
    fully_diluted_value: marketCap,
    liquidity_usd: liquidity,
    total_liquidity_usd: liquidity,
    price_usd: toNumber(result.priceUSD || '0'),
    volume_24h: volume24h,
    volume_12h: volume12h,
    volume_6h: volume4h > 0 ? volume4h : volume12h / 2,
    volume_4h: volume4h,
    volume_1h: volume1h,
    volume_5m: volume5m,
    price_percent_change_24h: change24h * 100,
    price_percent_change_12h: change12h * 100,
    price_percent_change_6h: change4h * 100,
    price_percent_change_4h: change4h * 100,
    price_percent_change_1h: change1h * 100,
    price_percent_change_5m: change5m * 100,
    pair_address: pair.address || token.address || '',
    created_at: result.createdAt || pair.createdAt || Date.now(),
    protocol: 'Raydium Launchpad',
    launchpad_protocol: 'Raydium Launchpad',
    uri: img,
    logo: img,
    image: img,
    imageUrl: img,
    holders: result.holders || 0,
    total_buys_1h: toNumber(result.buyCount1 || '0'),
    total_buys_6h: toNumber(result.buyCount4 || '0'),
    total_buys_12h: toNumber(result.buyCount12 || '0'),
    total_buys_24h: toNumber(result.buyCount24 || '0'),
    total_buys_5m: toNumber(result.buyCount5m || '0'),
    total_sells_1h: toNumber(result.sellCount1 || '0'),
    total_sells_6h: toNumber(result.sellCount4 || '0'),
    total_sells_12h: toNumber(result.sellCount12 || '0'),
    total_sells_24h: toNumber(result.sellCount24 || '0'),
    total_sells_5m: toNumber(result.sellCount5m || '0'),
    txnCount1h: toNumber(result.txnCount1 || '0'),
    txnCount6h: toNumber(result.txnCount4 || '0'),
    txnCount12h: toNumber(result.txnCount12 || '0'),
    txnCount24h: toNumber(result.txnCount24 || '0'),
    txnCount5m: toNumber(result.txnCount5m || '0'),
    buyCount24: result.buyCount24 || 0,
    sellCount24: result.sellCount24 || 0,
    txnCount24: result.txnCount24 || 0,
  };
}

const WRAPPED_SOL_MINTS = new Set([
  'so11111111111111111111111111111111111111112',
  'so11111111111111111111111111111111111111111',
]);

export async function prefetchXStocks(): Promise<void> {
  // Skip if cache is fresh
  try {
    const raw = localStorage.getItem(XSTOCKS_CACHE_KEY);
    if (raw) {
      const { timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp < XSTOCKS_STALE) return;
    }
  } catch {}

  try {
    const res = await fetch('/api/token-service/xstocks?limit=50', {
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    if (!res.ok) return;

    const payload = await res.json();
    const results =
      payload?.data?.filterTokens?.results ||
      payload?.filterTokens?.results ||
      [];

    const normalized = results
      .filter((r: any) => {
        const t = r.token;
        if (!t || !t.address) return false;
        if (WRAPPED_SOL_MINTS.has((t.address || '').toLowerCase())) return false;
        if (toNumber(r.liquidity || '0') <= 0) return false;
        return true;
      })
      .map(normalizeXStocksToken);

    // Deduplicate by mint
    const seen = new Set<string>();
    const deduped = normalized.filter((t: any) => {
      if (!t.mint || seen.has(t.mint)) return false;
      seen.add(t.mint);
      return true;
    });

    if (deduped.length > 0) {
      localStorage.setItem(
        XSTOCKS_CACHE_KEY,
        JSON.stringify({ data: deduped, timestamp: Date.now() }),
      );
    }
  } catch {}
}

// ─── New Pairs ───────────────────────────────────────────────────────────────

const NEW_PAIRS_STALE = 5 * 60_000; // 5 minutes

function normalizePulseToken(token: any): Record<string, any> {
  const sumVolumes = (buy: any, sell: any): number => toNumber(buy) + toNumber(sell);

  const getFirstString = (...candidates: any[]): string | undefined => {
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim() !== '') return c.trim();
    }
    return undefined;
  };

  const normalized: Record<string, any> = { ...token };

  const marketCap = toNumber(
    token.market_cap_usd ?? token.marketCapUsd ?? token.marketcap ?? token.fully_diluted_value ?? token.fdv,
  );
  const liquidity = toNumber(
    token.liquidity_usd ?? token.total_liquidity_usd ?? token.total_liquidityUsd ?? token.liquidity,
  );

  normalized.market_cap_usd = marketCap;
  normalized.fully_diluted_value = marketCap;
  normalized.liquidity_usd = liquidity;
  normalized.total_liquidity_usd = liquidity;

  // Volume fields
  const vol24h = token.volume_24h_usd ?? token.volume_24h ?? token.volume24h ?? 0;
  const vol12h = token.volume_12h_usd ?? token.volume_12h ?? token.volume12h ?? 0;
  const vol6h = token.volume_6h_usd ?? token.volume_6h ?? token.volume6h ?? 0;
  const vol1h = token.volume_1h_usd ?? token.volume_1h ?? token.volume1h ?? 0;
  const vol5m = token.volume_5m_usd ?? token.volume_5m ?? token.volume5m ?? 0;
  const buyVol24 = toNumber(token.buy_volume_24h ?? token.buyVolume24h ?? 0);
  const sellVol24 = toNumber(token.sell_volume_24h ?? token.sellVolume24h ?? 0);
  const buyVol1 = toNumber(token.buy_volume_1h ?? token.buyVolume1h ?? 0);
  const sellVol1 = toNumber(token.sell_volume_1h ?? token.sellVolume1h ?? 0);

  normalized.volume_24h = toNumber(vol24h) || sumVolumes(buyVol24, sellVol24);
  normalized.volume_12h = toNumber(vol12h);
  normalized.volume_6h = toNumber(vol6h);
  normalized.volume_1h = toNumber(vol1h) || sumVolumes(buyVol1, sellVol1);
  normalized.volume_5m = toNumber(vol5m);

  // Price changes
  normalized.price_percent_change_24h = toNumber(token.price_percent_change_24h ?? token.priceChange24h ?? 0);
  normalized.price_percent_change_12h = toNumber(token.price_percent_change_12h ?? token.priceChange12h ?? 0);
  normalized.price_percent_change_6h = toNumber(token.price_percent_change_6h ?? token.priceChange6h ?? 0);
  normalized.price_percent_change_1h = toNumber(token.price_percent_change_1h ?? token.priceChange1h ?? 0);
  normalized.price_percent_change_5m = toNumber(token.price_percent_change_5m ?? token.priceChange5m ?? 0);

  // Transaction counts
  normalized.total_buys_24h = toNumber(token.total_buys_24h ?? token.buys24h ?? 0);
  normalized.total_sells_24h = toNumber(token.total_sells_24h ?? token.sells24h ?? 0);
  normalized.total_buys_1h = toNumber(token.total_buys_1h ?? token.buys1h ?? 0);
  normalized.total_sells_1h = toNumber(token.total_sells_1h ?? token.sells1h ?? 0);
  normalized.total_buys_5m = toNumber(token.total_buys_5m ?? token.buys5m ?? 0);
  normalized.total_sells_5m = toNumber(token.total_sells_5m ?? token.sells5m ?? 0);

  // Price
  normalized.price_usd = toNumber(token.price_usd ?? token.priceUsd ?? token.price ?? 0);

  // Mint
  normalized.mint = token.mint || token.mint_address || token.address || '';

  // Image
  normalized.uri = getFirstString(token.uri, token.logo, token.image, token.imageUrl, token.image_uri);
  normalized.logo = normalized.uri;
  normalized.image = normalized.uri;

  return normalized;
}

export async function prefetchNewPairs(chain: string): Promise<void> {
  const cacheKey = `discover_new_pairs_cache_${chain}`;

  // Skip if cache is fresh
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const { timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp < NEW_PAIRS_STALE) return;
    }
  } catch {}

  try {
    const url =
      chain === 'monad'
        ? '/api/token-service/pulse-new-monad?limit=50&fresh=1'
        : '/api/token-service/pulse-new?limit=50&fresh=1';

    const res = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', Accept: 'application/json' },
    });
    if (!res.ok) return;

    const payload = await res.json();
    if (payload?.error) return;

    let arr: any[] = [];
    if (Array.isArray(payload)) {
      arr = payload;
    } else if (payload?.data) {
      if (Array.isArray(payload.data)) {
        arr = payload.data;
      } else if (payload.data?.tokens && Array.isArray(payload.data.tokens)) {
        arr = payload.data.tokens;
      }
    }

    if (arr.length === 0) return;

    const normalized = arr
      .filter((t: any) => {
        const mint = (t.mint || t.mint_address || t.address || '').toLowerCase();
        if (!mint || WRAPPED_SOL_MINTS.has(mint)) return false;
        return true;
      })
      .map(normalizePulseToken);

    // Deduplicate
    const seen = new Set<string>();
    const deduped = normalized.filter((t: any) => {
      const mint = (t.mint || '').toLowerCase();
      if (!mint || seen.has(mint)) return false;
      seen.add(mint);
      return true;
    });

    if (deduped.length > 0) {
      localStorage.setItem(cacheKey, JSON.stringify({ data: deduped, timestamp: Date.now() }));
    }
  } catch {}
}

// ─── Pump Live ───────────────────────────────────────────────────────────────

const PUMP_LIVE_CACHE_KEY = 'pump_live_tokens';
const PUMP_LIVE_TTL = 30_000; // 30 seconds

export async function prefetchPumpLive(): Promise<void> {
  // Skip if cache is fresh
  try {
    const raw = sessionStorage.getItem(PUMP_LIVE_CACHE_KEY);
    if (raw) {
      const { timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp < PUMP_LIVE_TTL) return;
    }
  } catch {}

  try {
    const url = `${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/pump/live`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return;

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return;

    const sorted = data
      .sort((a: any, b: any) => (b.created_timestamp || 0) - (a.created_timestamp || 0))
      .slice(0, 50);

    sessionStorage.setItem(
      PUMP_LIVE_CACHE_KEY,
      JSON.stringify({ tokens: sorted, timestamp: Date.now() }),
    );
  } catch {}
}
