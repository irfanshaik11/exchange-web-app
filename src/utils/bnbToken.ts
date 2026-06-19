const pick = (...vals: unknown[]): unknown =>
  vals.find((v) => v !== undefined && v !== null && v !== '');

const BNB_UPSTREAM_BASE = (
  process.env.NEXT_PUBLIC_BNB_TOKEN_SERVICE_URL || 'https://token-bnb.interstate.so'
).replace(/\/+$/, '');

/** Server-side / API routes — direct upstream URL. */
export const BNB_HTTP_BASE = BNB_UPSTREAM_BASE;

/** Browser uses same-origin rewrite; server uses upstream directly. */
export function getBnbHttpBase(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/bnb-token-service`;
  }
  return BNB_UPSTREAM_BASE;
}

/** BNB OHLC WebSocket base (direct upstream — no HTTP rewrite for WS). */
export function getBnbWsBase(): string {
  return BNB_UPSTREAM_BASE.replace(/^http/, 'ws');
}

export function buildBnbOhlcWsUrl(
  mint: string,
  timeframe = '1s',
  snapshotTimeframe?: string,
): string {
  const params = new URLSearchParams({ timeframe });
  if (snapshotTimeframe && !['1s', '5s', '15s', '30s'].includes(snapshotTimeframe)) {
    params.set('snapshot_timeframe', snapshotTimeframe);
  }
  return `${getBnbWsBase()}/v1/ws/ohlcv/${encodeURIComponent(mint)}?${params.toString()}`;
}

const BNB_INTERVAL_MAP: Record<string, string> = {
  '1s': '1s',
  '5s': '1s',
  '15s': '1s',
  '30s': '1s',
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '1h',
  '1d': '1h',
  '7d': '1h',
};

export interface BnbOhlcItem {
  unix_time: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v_usd: number;
}

export type BnbOhlcvTimeRange = '5m' | '1h' | '6h' | '24h';

export interface BnbOhlcvWindowStats {
  volume: number;
  buyVolume: number;
  sellVolume: number;
  buys: number;
  sells: number;
  netVolume: number;
  buyPercentage: number;
  sellPercentage: number;
}

const BNB_OHLCV_WINDOW_SEC: Record<BnbOhlcvTimeRange, number> = {
  '5m': 300,
  '1h': 3600,
  '6h': 21600,
  '24h': 86400,
};

/** Latest close from OHLCV candles (USD). */
export function resolveBnbPriceFromOhlcCandles(candles: BnbOhlcItem[]): number | undefined {
  if (!Array.isArray(candles) || candles.length === 0) return undefined;
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const close = toFiniteNumber(candles[i]?.c);
    if (close != null && close > 0) return close;
  }
  return undefined;
}

/** Volume / buy-sell stats for a time window from OHLCV bars. */
export function computeBnbOhlcvWindowStats(
  candles: BnbOhlcItem[],
  window: BnbOhlcvTimeRange,
  nowSec = Math.floor(Date.now() / 1000),
): BnbOhlcvWindowStats {
  const cutoff = nowSec - BNB_OHLCV_WINDOW_SEC[window];
  let buyVolume = 0;
  let sellVolume = 0;
  let buys = 0;
  let sells = 0;

  for (const candle of candles) {
    if (!candle || candle.unix_time < cutoff) continue;
    const vol = Number(candle.v_usd) || 0;
    if (vol <= 0) continue;

    const open = Number(candle.o) || 0;
    const close = Number(candle.c) || 0;
    if (close >= open) {
      buyVolume += vol;
      buys += 1;
    } else {
      sellVolume += vol;
      sells += 1;
    }
  }

  const volume = buyVolume + sellVolume;
  const netVolume = buyVolume - sellVolume;
  const buyPercentage = volume > 0 ? (buyVolume / volume) * 100 : 50;
  const sellPercentage = 100 - buyPercentage;

  return {
    volume,
    buyVolume,
    sellVolume,
    buys,
    sells,
    netVolume,
    buyPercentage,
    sellPercentage,
  };
}

export async function fetchBnbOhlcvCandles(
  mint: string,
  interval = '1s',
  timeframe = '30d',
): Promise<BnbOhlcItem[]> {
  try {
    const response = await fetch(buildBnbOhlcUrl(mint, interval, timeframe), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const body = await response.json();
    const bnbUsd = await fetchBnbUsdPrice();
    return transformBnbOhlcCandles(body?.candles || [], bnbUsd);
  } catch {
    return [];
  }
}

let cachedBnbUsd: { price: number; fetchedAt: number } | null = null;

export function buildBnbTokenUrl(mint: string): string {
  return `${getBnbHttpBase()}/v1/token/${encodeURIComponent(mint)}`;
}

export function buildBnbTradesUrl(mint: string, limit = 100): string {
  return `${getBnbHttpBase()}/v1/token/${encodeURIComponent(mint)}/trades?limit=${limit}`;
}

export function buildBnbOhlcUrl(
  mint: string,
  interval = '1m',
  timeframe = '24h',
): string {
  const mapped = BNB_INTERVAL_MAP[interval] || interval;
  const params = new URLSearchParams({ interval: mapped, timeframe });
  return `${getBnbHttpBase()}/v1/token/${encodeURIComponent(mint)}/ohlcv?${params.toString()}`;
}

export async function fetchBnbUsdPrice(): Promise<number | null> {
  if (cachedBnbUsd && Date.now() - cachedBnbUsd.fetchedAt < 60_000) {
    return cachedBnbUsd.price;
  }
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd',
    );
    if (!response.ok) return cachedBnbUsd?.price ?? null;
    const data = await response.json();
    const price = data?.binancecoin?.usd;
    if (typeof price === 'number' && price > 0) {
      cachedBnbUsd = { price, fetchedAt: Date.now() };
      return price;
    }
  } catch {
    // fall through
  }
  return cachedBnbUsd?.price ?? null;
}

/** Two flat candles so TradingView renders before upstream OHLC exists. */
export function buildBnbSeedCandles(priceUsd: number): BnbOhlcItem[] {
  if (!(priceUsd > 0)) return [];
  const now = Math.floor(Date.now() / 1000);
  const bar = (unix_time: number): BnbOhlcItem => ({
    unix_time,
    o: priceUsd,
    h: priceUsd,
    l: priceUsd,
    c: priceUsd,
    v_usd: 0,
  });
  return [bar(now - 60), bar(now)];
}

/** Keep pulse URL / optimistic values when detail fetch omits price or MC. */
export function mergeBnbTradeToken(
  optimistic: Record<string, unknown> | null | undefined,
  fetched: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!optimistic && !fetched) return null;
  const merged: Record<string, unknown> = { ...(optimistic || {}), ...(fetched || {}) };

  const price =
    resolveBnbPriceUsd(fetched) ??
    resolveBnbPriceUsd(optimistic) ??
    resolveBnbPriceUsd(merged);
  if (price != null) {
    merged.price_usd = price;
    merged.usd_price = price;
  }

  const marketCap =
    resolveBnbMarketCapUsd(fetched) ??
    resolveBnbMarketCapUsd(optimistic) ??
    resolveBnbMarketCapUsd(merged);
  if (marketCap != null) {
    merged.market_cap_usd = marketCap;
    merged.fully_diluted_value = marketCap;
    merged.total_fully_diluted_valuation = marketCap;
  }

  const liquidity =
    toFiniteNumber(pick(fetched?.liquidity_usd, fetched?.total_liquidity_usd)) ??
    toFiniteNumber(pick(optimistic?.liquidity_usd, optimistic?.total_liquidity_usd));
  if (liquidity != null && liquidity > 0) {
    merged.liquidity_usd = liquidity;
    merged.total_liquidity_usd = liquidity;
  }

  return merged;
}

/** BNB quote amounts from OHLCV are usually 18-decimal wei; convert to USD volume. */
function resolveBnbOhlcVolumeUsd(candle: any, bnbUsd: number | null): number {
  const direct = toFiniteNumber(pick(candle?.volume_usd, candle?.v_usd, candle?.volume));
  if (direct != null && direct > 0) return direct;

  const quoteRaw = toFiniteNumber(candle?.volume_quote);
  if (quoteRaw == null || quoteRaw <= 0) return 0;

  const quoteBnb = quoteRaw > 1e12 ? quoteRaw / 1e18 : quoteRaw;
  const usdFactor = bnbUsd && bnbUsd > 0 ? bnbUsd : 1;
  return quoteBnb * usdFactor;
}

export function transformBnbOhlcCandles(
  rawCandles: any[],
  bnbUsd: number | null,
): BnbOhlcItem[] {
  const usdFactor = bnbUsd && bnbUsd > 0 ? bnbUsd : 1;
  const source = Array.isArray(rawCandles) ? rawCandles : [];
  return source.map((candle) => {
    const openBnb = Number(candle.open ?? candle.o ?? 0);
    const highBnb = Number(candle.high ?? candle.h ?? 0);
    const lowBnb = Number(candle.low ?? candle.l ?? 0);
    const closeBnb = Number(candle.close ?? candle.c ?? 0);
    return {
      unix_time: candle.time || candle.unix_time,
      o: openBnb * usdFactor,
      h: highBnb * usdFactor,
      l: lowBnb * usdFactor,
      c: closeBnb * usdFactor,
      v_usd: resolveBnbOhlcVolumeUsd(candle, bnbUsd),
    };
  });
}

export async function fetchBnbTokenDetail(mint: string): Promise<any | null> {
  try {
    const response = await fetch(buildBnbTokenUrl(mint), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchLatestOhlcCloseBnb(mint: string): Promise<number | null> {
  try {
    const response = await fetch(buildBnbOhlcUrl(mint, '1m', '24h'), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const candles = Array.isArray(data?.candles) ? data.candles : [];
    if (!candles.length) return null;
    const close = toFiniteNumber(candles[candles.length - 1]?.close);
    return close != null && close > 0 ? close : null;
  } catch {
    return null;
  }
}

/** Fetch token detail from token-bnb and fill missing price/MC via OHLC fallback. */
export async function fetchBnbTokenWithMetrics(mint: string): Promise<any | null> {
  const detail = await fetchBnbTokenDetail(mint);
  if (!detail) return null;

  const merged: Record<string, unknown> = { ...detail, mint };
  let priceUsd = resolveBnbPriceUsd(merged);
  let marketCapUsd = resolveBnbMarketCapUsd(merged);

  if (!priceUsd) {
    const closeBnb = await fetchLatestOhlcCloseBnb(mint);
    const bnbUsd = closeBnb != null ? await fetchBnbUsdPrice() : null;
    if (closeBnb != null && bnbUsd != null && bnbUsd > 0) {
      priceUsd = closeBnb * bnbUsd;
      merged.price_usd = priceUsd;
      merged.usd_price = priceUsd;
    }
  }

  if (!marketCapUsd && priceUsd) {
    const supply = resolveBnbCirculatingSupply(merged);
    if (supply != null) {
      marketCapUsd = priceUsd * supply;
      merged.market_cap_usd = marketCapUsd;
      merged.fully_diluted_value = marketCapUsd;
      merged.total_fully_diluted_valuation = marketCapUsd;
    }
  }

  if (!priceUsd && marketCapUsd) {
    const supply = resolveBnbCirculatingSupply(merged);
    if (supply != null && supply > 0) {
      priceUsd = marketCapUsd / supply;
      merged.price_usd = priceUsd;
      merged.usd_price = priceUsd;
    }
  }

  return merged;
}

export const toFiniteNumber = (value: unknown): number | undefined => {
  if (value == null || value === '') return undefined;
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/** Real DEX pair only — never fall back to mint (that breaks DexScreener). */
export const resolveBnbPairAddress = (token: any): string | undefined => {
  const raw = pick(token?.pair_address, token?.pool_address, token?.pairAddress);
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const pair = raw.trim().toLowerCase();
  const mint = String(token?.mint ?? token?.mint_address ?? '').toLowerCase();
  if (mint && pair === mint) return undefined;
  return pair;
};

/** BNB launchpad tokens store supply in 18-decimal wei (1B tokens = 1e27). */
export const resolveBnbCirculatingSupply = (token: any): number | undefined => {
  const raw = pick(
    token?.circulating_supply,
    token?.circulatingSupply,
    token?.total_supply,
    token?.totalSupply,
  );
  const rawNum = toFiniteNumber(raw);
  if (rawNum == null || rawNum <= 0) return undefined;
  return rawNum > 1e15 ? rawNum / 1e18 : rawNum;
};

export const resolveBnbPriceUsd = (token: any): number | undefined => {
  const price = toFiniteNumber(
    pick(token?.price_usd, token?.priceUsd, token?.usd_price, token?.price?.usd),
  );
  return price != null && price > 0 ? price : undefined;
};

export const resolveBnbMarketCapUsd = (token: any): number | undefined => {
  const direct = toFiniteNumber(
    pick(
      token?.market_cap_usd,
      token?.marketCapUsd,
      token?.marketCapUSD,
      token?.market_cap,
      token?.marketCap,
      token?.fully_diluted_value,
      token?.total_fully_diluted_valuation,
      token?.fdv,
      token?.mcap,
    ),
  );
  if (direct != null && direct > 0) return direct;

  const priceUsd = resolveBnbPriceUsd(token);
  const supply = resolveBnbCirculatingSupply(token);
  if (priceUsd != null && supply != null) {
    const computed = priceUsd * supply;
    if (computed > 0) return computed;
  }

  return undefined;
};

/** True when token is missing a usable market cap (pulse WS or detail fetch can fill it). */
export const needsBnbMarketDataEnrichment = (token: any): boolean => {
  if (!token?.mint) return false;
  const mc = resolveBnbMarketCapUsd(token);
  return mc == null || mc <= 0;
};

export type BnbPulseChannel = 'new' | 'final-stretch' | 'migrated';

/** Pulse list — each token includes `market_cap_usd` directly from token-bnb. */
export async function fetchBnbPulseTokens(
  channel: BnbPulseChannel,
  limit = 50,
): Promise<any[]> {
  try {
    const response = await fetch(
      `${getBnbHttpBase()}/v1/pulse/${channel}?limit=${limit}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!response.ok) return [];
    const body = await response.json();
    return Array.isArray(body?.tokens) ? body.tokens : [];
  } catch {
    return [];
  }
}

/** Fetch MC for a single mint (pulse field or price × supply from /v1/token/{mint}). */
export async function fetchBnbMarketCapUsd(mint: string): Promise<number | undefined> {
  const token = await fetchBnbTokenWithMetrics(mint);
  return token ? resolveBnbMarketCapUsd(token) : undefined;
}

/** Volume USD from pulse WS `volume` object or flat token fields (5m → 24h priority). */
export const resolveBnbVolumeUsd = (
  token: any,
  window: BnbOhlcvTimeRange = '24h',
): number | undefined => {
  const vol = token?.volume;
  if (vol && typeof vol === 'object' && !Array.isArray(vol)) {
    const windowKey = `volume_${window}_usd` as const;
    const fromWindow = toFiniteNumber(vol[windowKey]);
    if (fromWindow != null && fromWindow > 0) return fromWindow;

    for (const fallback of ['volume_24h_usd', 'volume_6h_usd', 'volume_1h_usd', 'volume_5m_usd'] as const) {
      const n = toFiniteNumber(vol[fallback]);
      if (n != null && n > 0) return n;
    }
  }

  const flat = toFiniteNumber(
    pick(
      token?.volume_24h,
      token?.volume_24h_usd,
      token?.volume24h,
      token?.volumeUsd24h,
      typeof vol === 'number' ? vol : undefined,
    ),
  );
  return flat != null && flat > 0 ? flat : undefined;
};

/** Sum OHLCV candle volume for a time window (REST fallback when WS volume is absent). */
export async function fetchBnbVolumeFromOhlcv(
  mint: string,
  window: BnbOhlcvTimeRange = '24h',
): Promise<number | undefined> {
  const timeframe = window === '5m' ? '1h' : window;
  const candles = await fetchBnbOhlcvCandles(mint, '1m', timeframe);
  if (!candles.length) return undefined;
  const stats = computeBnbOhlcvWindowStats(candles, window);
  return stats.volume > 0 ? stats.volume : undefined;
}

export interface BnbTokenMetrics {
  mint: string;
  priceUsd?: number;
  marketCapUsd?: number;
  volume24hUsd?: number;
  volume5mUsd?: number;
  txCount24h?: number;
  txCount5m?: number;
}

/**
 * Fetch MC + volume for one token from token-bnb.interstate.so.
 * MC: GET /v1/token/{mint} (or price × supply). Volume: WS-style nested `volume` if present, else OHLCV sum.
 */
export async function fetchBnbTokenMetrics(mint: string): Promise<BnbTokenMetrics | null> {
  const detail = await fetchBnbTokenWithMetrics(mint);
  if (!detail) return null;

  const priceUsd = resolveBnbPriceUsd(detail);
  const marketCapUsd = resolveBnbMarketCapUsd(detail);
  let volume24hUsd = resolveBnbVolumeUsd(detail, '24h');
  let volume5mUsd = resolveBnbVolumeUsd(detail, '5m');

  if (!volume24hUsd) {
    volume24hUsd = await fetchBnbVolumeFromOhlcv(mint, '24h');
  }
  if (!volume5mUsd) {
    volume5mUsd = await fetchBnbVolumeFromOhlcv(mint, '5m');
  }

  const volObj = detail?.volume;
  const txCount24h =
    volObj && typeof volObj === 'object'
      ? toFiniteNumber(volObj.count_24h)
      : toFiniteNumber(detail?.tx_count_24h);
  const txCount5m =
    volObj && typeof volObj === 'object'
      ? toFiniteNumber(volObj.count_5m)
      : toFiniteNumber(detail?.tx_count_5m);

  return {
    mint,
    priceUsd,
    marketCapUsd,
    volume24hUsd,
    volume5mUsd,
    txCount24h,
    txCount5m,
  };
}

