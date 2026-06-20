const pick = (...vals: unknown[]): unknown =>
  vals.find((v) => v !== undefined && v !== null && v !== '');

const BNB_UPSTREAM_BASE = (
  process.env.NEXT_PUBLIC_BNB_TOKEN_SERVICE_URL || 'https://token-bnb.interstate.so'
).replace(/\/+$/, '');

/** Server-side / API routes — direct upstream URL. */
export const BNB_HTTP_BASE = BNB_UPSTREAM_BASE;

/** Fallback BNB/USD price used before CoinGecko resolves. */
export const BNB_USD_FALLBACK = 600;

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
  interval = '1s',
  snapshotInterval?: string,
): string {
  const params = new URLSearchParams({ interval });
  if (snapshotInterval && !['1s', '5s', '15s', '30s'].includes(snapshotInterval)) {
    params.set('snapshot_interval', snapshotInterval);
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

export function buildBnbHoldersUrl(mint: string, limit = 100): string {
  return `${getBnbHttpBase()}/v1/token/${encodeURIComponent(mint)}/holders?limit=${limit}`;
}

const _tradeCache = new Map<string, { data: any[]; ts: number }>();
const _tradeInFlight = new Map<string, Promise<any[]>>();
const TRADE_CACHE_TTL_MS = 12_000;

export async function fetchBnbTrades(mint: string, limit = 500): Promise<any[]> {
  const key = `${mint}:${limit}`;
  const cached = _tradeCache.get(key);
  if (cached && Date.now() - cached.ts < TRADE_CACHE_TTL_MS) return cached.data;
  const inflight = _tradeInFlight.get(key);
  if (inflight) return inflight;
  const promise = (async (): Promise<any[]> => {
    try {
      const response = await fetch(buildBnbTradesUrl(mint, limit), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return [];
      const body = await response.json();
      const data: any[] = Array.isArray(body?.trades) ? body.trades : [];
      _tradeCache.set(key, { data, ts: Date.now() });
      return data;
    } catch {
      return [];
    } finally {
      _tradeInFlight.delete(key);
    }
  })();
  _tradeInFlight.set(key, promise);
  return promise;
}

const _devTokensInFlight = new Map<string, Promise<any[]>>();

/** Other tokens launched by the same creator (pulse scan). */
export async function fetchBnbDevTokensByCreator(
  creatorWallet: string,
  options?: {
    includeMint?: string;
    includeToken?: Record<string, unknown> | null;
    scanLimit?: number;
  },
): Promise<any[]> {
  const creator = creatorWallet.trim().toLowerCase();
  if (!isValidBnbWallet(creator)) return [];
  const scanLimit = options?.scanLimit ?? 200;
  const flightKey = `${creator}:${scanLimit}`;
  const inflight = _devTokensInFlight.get(flightKey);
  if (inflight) return inflight;
  const promise = _fetchBnbDevTokensByCreatorInner(creator, scanLimit, options)
    .finally(() => _devTokensInFlight.delete(flightKey));
  _devTokensInFlight.set(flightKey, promise);
  return promise;
}

async function _fetchBnbDevTokensByCreatorInner(
  creator: string,
  scanLimit: number,
  options?: {
    includeMint?: string;
    includeToken?: Record<string, unknown> | null;
  },
): Promise<any[]> {
  const channels: BnbPulseChannel[] = ['new', 'final-stretch', 'migrated'];
  const seen = new Set<string>();
  const results: any[] = [];

  const includeMint = options?.includeMint?.trim().toLowerCase();
  const includeToken = options?.includeToken;
  if (
    includeMint &&
    includeToken &&
    resolveBnbCreatorWallet(includeToken) === creator &&
    !seen.has(includeMint)
  ) {
    seen.add(includeMint);
    results.push({ ...includeToken, mint: includeMint });
  }

  await Promise.all(
    channels.map(async (channel) => {
      const tokens = await fetchBnbPulseTokens(channel, scanLimit);
      for (const token of tokens) {
        const wallet = String(token?.creator_wallet || '').toLowerCase();
        const mint = String(token?.mint || '').toLowerCase();
        if (
          !isValidBnbWallet(wallet) ||
          wallet !== creator ||
          !isValidBnbWallet(mint) ||
          seen.has(mint)
        ) {
          continue;
        }
        seen.add(mint);
        results.push(token);
      }
    }),
  );

  return results.sort((a, b) => {
    const ta = new Date(a?.created_at || 0).getTime();
    const tb = new Date(b?.created_at || 0).getTime();
    return tb - ta;
  });
}

export function resolveBnbDevMigrationStats(tokens: any[]): {
  created: number;
  migrated: number;
} {
  const list = Array.isArray(tokens) ? tokens : [];
  const migrated = list.filter((token) => {
    const status = String(token?.status || '').toUpperCase();
    return status === 'MIGRATED' || status.includes('MIGRAT');
  }).length;
  return { created: list.length, migrated };
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

const BNB_MINT_PATH_RE = /\/(?:bnb-trade|trade\/bnb)\/(0x[a-fA-F0-9]{40})/i;

export function extractBnbMintFromPath(asPath: string): string | undefined {
  const match = asPath.match(BNB_MINT_PATH_RE);
  return match?.[1]?.toLowerCase();
}

/** Resolve BNB mint from query params or URL path (works before router.isReady). */
export function resolveBnbTradeMint(
  query: Record<string, string | string[] | undefined>,
  asPath = '',
): string {
  const pick = (value: unknown): string =>
    typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : '';
  const fromQuery = pick(query._mint) || pick(query.contractAddress);
  if (/^0x[a-f0-9]{40}$/.test(fromQuery)) return fromQuery;
  const fromPath = extractBnbMintFromPath(asPath);
  return fromPath && /^0x[a-f0-9]{40}$/.test(fromPath) ? fromPath : '';
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
    resolveBnbLiquidityUsd(fetched) ??
    resolveBnbLiquidityUsd(optimistic) ??
    resolveBnbLiquidityUsd(merged);
  if (liquidity != null && liquidity > 0) {
    merged.liquidity_usd = liquidity;
    merged.total_liquidity_usd = liquidity;
  }

  const top10 =
    resolveBnbTop10HoldersPct(fetched) ??
    resolveBnbTop10HoldersPct(optimistic) ??
    resolveBnbTop10HoldersPct(merged);
  if (top10 != null) {
    merged.top10_holders_pct = top10;
    merged.top10_holding_pct = top10;
  }

  const devH =
    resolveBnbDevHoldingPct(fetched) ??
    resolveBnbDevHoldingPct(optimistic) ??
    resolveBnbDevHoldingPct(merged);
  if (devH != null) {
    merged.dev_holding_pct = devH;
    merged.dev_holding = devH;
  }

  const sniper =
    resolveBnbSniperPct(fetched) ??
    resolveBnbSniperPct(optimistic) ??
    resolveBnbSniperPct(merged);
  if (sniper != null) {
    merged.sniper_pct = sniper;
    merged.snipers_hold_pct = sniper;
  }

  const pair = resolveBnbPairAddress(fetched) ?? resolveBnbPairAddress(optimistic);
  if (pair) merged.pair_address = pair;

  const creator = resolveBnbCreatorWallet(fetched) ?? resolveBnbCreatorWallet(optimistic);
  if (creator) {
    merged.creator_wallet = creator;
    merged.dev_wallet = creator;
  }

  const supply =
    resolveBnbCirculatingSupply(fetched) ??
    resolveBnbCirculatingSupply(optimistic);
  if (supply != null) merged.circulating_supply = supply;

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

export const resolveBnbLiquidityUsd = (token: any): number | undefined => {
  const value = toFiniteNumber(
    pick(
      token?.liquidity_usd,
      token?.liquidityUsd,
      token?.LiquidityUSD,
      token?.liquidityUSD,
      token?.total_liquidity_usd,
      token?.totalLiquidityUsd,
      token?.total_liquidity,
      token?.liquidity,
    ),
  );
  return value != null && value > 0 ? value : undefined;
};

export const resolveBnbTop10HoldersPct = (token: any): number | undefined => {
  const value = toFiniteNumber(
    pick(
      token?.top10_holders_pct,
      token?.top10_holding_pct,
      token?.top_10_holder_percent,
      token?.top10_holding_percentage,
    ),
  );
  return value != null && value >= 0 ? value : undefined;
};

export const resolveBnbDevHoldingPct = (token: any): number | undefined => {
  const value = toFiniteNumber(
    pick(
      token?.dev_holding_pct,
      token?.dev_holding,
      token?.creator_holding_pct,
      token?.dev_percent,
      token?.dev_held_percentage,
      token?.dev_holding_percentage,
    ),
  );
  return value != null && value >= 0 ? value : undefined;
};

export const resolveBnbSniperPct = (token: any): number | undefined => {
  const value = toFiniteNumber(
    pick(
      token?.sniper_pct,
      token?.snipers_hold_pct,
      token?.sniper_percent,
      token?.sniper_held_percentage,
      token?.sniper_holding_percentage,
    ),
  );
  return value != null && value >= 0 ? value : undefined;
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const isValidBnbWallet = (address: unknown): address is string => {
  if (typeof address !== 'string') return false;
  const normalized = address.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) && normalized !== ZERO_ADDRESS;
};

export const resolveBnbCreatorWallet = (token: any): string | undefined => {
  const raw = pick(token?.creator_wallet, token?.creator, token?.dev_wallet, token?.deployer);
  return isValidBnbWallet(raw) ? raw.trim().toLowerCase() : undefined;
};

export const resolveBnbBondingPct = (token: any): number | undefined => {
  const raw = pick(token?.bonding_curve_progress, token?.bonding_pct, token?.bondingCurveProgress);
  if (raw == null || raw === '' || raw === -1) return undefined;
  const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  const pct = n <= 1.01 ? n * 100 : n;
  return pct > 0 ? pct : undefined;
};

export interface BnbTokenDetailPatch {
  mint: string;
  name?: string;
  symbol?: string;
  status?: string;
  uri?: string;
  priceUsd?: number;
  marketCapUsd?: number;
  liquidityUsd?: number;
  volume24hUsd?: number;
  volume5mUsd?: number;
  txCount24h?: number;
  txCount5m?: number;
  holderCount?: number;
  top10HoldersPct?: number;
  devHoldingPct?: number;
  sniperPct?: number;
  pairAddress?: string;
  creatorWallet?: string;
  circulatingSupply?: number;
  bondingCurveProgress?: number;
  launchpadProtocol?: string;
}

/** Map token-bnb detail / WS payload into frontend field names. */
export function buildBnbDetailPatch(raw: any, mint?: string): BnbTokenDetailPatch {
  const token = { ...(raw || {}), ...(mint ? { mint } : {}) };
  const id = String(token.mint ?? token.mint_address ?? mint ?? '').toLowerCase();
  const liquidity = resolveBnbLiquidityUsd(token);
  const supply = resolveBnbCirculatingSupply(token);

  return {
    mint: id,
    name: typeof token.name === 'string' && token.name.trim() ? token.name.trim() : undefined,
    symbol: typeof token.symbol === 'string' && token.symbol.trim() ? token.symbol.trim() : undefined,
    status: typeof token.status === 'string' ? token.status : undefined,
    uri: typeof token.uri === 'string' ? token.uri : undefined,
    priceUsd: resolveBnbPriceUsd(token),
    marketCapUsd: resolveBnbMarketCapUsd(token),
    liquidityUsd: liquidity,
    volume24hUsd: resolveBnbVolumeUsd(token, '24h'),
    volume5mUsd: resolveBnbVolumeUsd(token, '5m'),
    txCount24h: toFiniteNumber(token?.tx_count_24h),
    txCount5m: toFiniteNumber(token?.tx_count_5m),
    holderCount: resolveBnbHolderCount(token),
    top10HoldersPct: resolveBnbTop10HoldersPct(token),
    devHoldingPct: resolveBnbDevHoldingPct(token),
    sniperPct: resolveBnbSniperPct(token),
    pairAddress: resolveBnbPairAddress(token),
    creatorWallet: resolveBnbCreatorWallet(token),
    circulatingSupply: supply,
    bondingCurveProgress: resolveBnbBondingPct(token),
    launchpadProtocol: pick(token?.launchpad_protocol, token?.protocol) as string | undefined,
  };
}

/** Convert detail patch into token object keys used across Pulse + trade UI. */
export function applyBnbDetailPatch(patch: BnbTokenDetailPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {
    mint: patch.mint,
    mint_address: patch.mint,
    _chain: 'bnb',
  };

  if (patch.name) out.name = patch.name;
  if (patch.symbol) out.symbol = patch.symbol;
  if (patch.status) out.status = patch.status;
  if (patch.uri) out.uri = patch.uri;
  if (patch.launchpadProtocol) {
    out.launchpad_protocol = patch.launchpadProtocol;
    out.protocol = patch.launchpadProtocol;
  }
  if (patch.priceUsd != null) {
    out.price_usd = patch.priceUsd;
    out.usd_price = patch.priceUsd;
  }
  if (patch.marketCapUsd != null) {
    out.market_cap_usd = patch.marketCapUsd;
    out.fully_diluted_value = patch.marketCapUsd;
    out.total_fully_diluted_valuation = patch.marketCapUsd;
  }
  if (patch.liquidityUsd != null) {
    out.liquidity_usd = patch.liquidityUsd;
    out.total_liquidity_usd = patch.liquidityUsd;
  }
  if (patch.volume24hUsd != null) out.volume_24h = patch.volume24hUsd;
  if (patch.volume5mUsd != null) {
    out.volume = {
      volume_5m_usd: patch.volume5mUsd,
      volume_24h_usd: patch.volume24hUsd ?? patch.volume5mUsd,
    };
  } else if (patch.volume24hUsd != null) {
    out.volume = { volume_24h_usd: patch.volume24hUsd };
  }
  if (patch.txCount24h != null) out.tx_count_24h = patch.txCount24h;
  if (patch.txCount5m != null) out.tx_count_5m = patch.txCount5m;
  if (patch.holderCount != null) {
    out.holder_count = patch.holderCount;
    out.total_holders = patch.holderCount;
  }
  if (patch.top10HoldersPct != null) {
    out.top10_holders_pct = patch.top10HoldersPct;
    out.top10_holding_pct = patch.top10HoldersPct;
    out.top_10_holder_percent = patch.top10HoldersPct;
  }
  if (patch.devHoldingPct != null) {
    out.dev_holding_pct = patch.devHoldingPct;
    out.dev_holding = patch.devHoldingPct;
    out.dev_percent = patch.devHoldingPct;
    out.dev_held_percentage = patch.devHoldingPct;
  }
  if (patch.sniperPct != null) {
    out.sniper_pct = patch.sniperPct;
    out.snipers_hold_pct = patch.sniperPct;
    out.sniper_percent = patch.sniperPct;
    out.sniper_held_percentage = patch.sniperPct;
  }
  if (patch.pairAddress) out.pair_address = patch.pairAddress;
  if (patch.creatorWallet) {
    out.creator_wallet = patch.creatorWallet;
    out.dev_wallet = patch.creatorWallet;
  }
  if (patch.circulatingSupply != null) out.circulating_supply = patch.circulatingSupply;
  if (patch.bondingCurveProgress != null) out.bonding_curve_progress = patch.bondingCurveProgress;

  return out;
}

/** True when token is missing a usable market cap (pulse WS or detail fetch can fill it). */
export const needsBnbMarketDataEnrichment = (token: any): boolean => {
  if (!token?.mint) return false;
  const mc = resolveBnbMarketCapUsd(token);
  return mc == null || mc <= 0;
};

/** True when token is missing detail fields that /v1/token/{mint} can provide. */
export const needsBnbDetailEnrichment = (token: any): boolean => {
  if (!token?.mint) return false;
  return (
    needsBnbMarketDataEnrichment(token) ||
    resolveBnbLiquidityUsd(token) == null ||
    !resolveBnbPairAddress(token) ||
    !resolveBnbCreatorWallet(token) ||
    resolveBnbCirculatingSupply(token) == null
  );
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

/** Total holder count from token-bnb fields (list/detail/WS). */
export const resolveBnbHolderCount = (token: any): number | undefined => {
  const direct = toFiniteNumber(
    pick(
      token?.holder_count,
      token?.holderCount,
      token?.total_holders,
      token?.totalHolders,
      token?.holders,
      token?.holder_total,
    ),
  );
  if (direct != null && direct > 0) return direct;

  const nested = token?.holders;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const fromNested = toFiniteNumber(
      pick(nested.total_holders, nested.holder_count, nested.count, nested.total),
    );
    if (fromNested != null && fromNested > 0) return fromNested;
  }

  if (Array.isArray(nested) && nested.length > 0) {
    return nested.length;
  }

  return undefined;
};

async function fetchBnbHolderCountFromScan(mint: string): Promise<number | undefined> {
  const apiKey =
    process.env.BSCSCAN_API_KEY ||
    process.env.ETHERSCAN_API_KEY ||
    process.env.NEXT_PUBLIC_BSCSCAN_API_KEY ||
    '';
  if (!apiKey) return undefined;

  const params = new URLSearchParams({
    chainid: '56',
    module: 'token',
    action: 'tokenholdercount',
    contractaddress: mint,
    apikey: apiKey,
  });
  try {
    const response = await fetch(`https://api.etherscan.io/v2/api?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return undefined;
    const body = await response.json().catch(() => ({}));
    if (body?.status !== '1') return undefined;
    const count = Number(body?.result);
    return Number.isFinite(count) && count > 0 ? count : undefined;
  } catch {
    return undefined;
  }
}

/** Server-side holder count: token-bnb holders/detail, then BscScan fallback. */
export async function fetchBnbHolderCountUpstream(mint: string): Promise<number | undefined> {
  try {
    const holdersResponse = await fetch(
      `${BNB_HTTP_BASE}/v1/token/${encodeURIComponent(mint)}/holders?limit=1`,
      { headers: { Accept: 'application/json' } },
    );
    if (holdersResponse.ok) {
      const body = await holdersResponse.json().catch(() => ({}));
      const fromList = resolveBnbHolderCount(body);
      if (fromList != null && fromList > 0) return fromList;
    }

    const detail = await fetchBnbTokenDetail(mint);
    const fromDetail = resolveBnbHolderCount(detail);
    if (fromDetail != null && fromDetail > 0) return fromDetail;

    return await fetchBnbHolderCountFromScan(mint);
  } catch {
    return undefined;
  }
}

/** Browser: /api/bnb-token/holders proxy. */
export async function fetchBnbHolderCount(mint: string): Promise<number | undefined> {
  try {
    const response = await fetch(`/api/bnb-token/holders?mint=${encodeURIComponent(mint)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return undefined;
    const body = await response.json().catch(() => ({}));
    return resolveBnbHolderCount(body);
  } catch {
    return undefined;
  }
}

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

export interface BnbTokenMetrics extends BnbTokenDetailPatch {}

/**
 * Fetch MC, volume, liquidity, holder stats, and other detail fields from token-bnb.
 */
export async function fetchBnbTokenMetrics(mint: string): Promise<BnbTokenMetrics | null> {
  const detail = await fetchBnbTokenWithMetrics(mint);
  if (!detail) return null;

  const patch = buildBnbDetailPatch(detail, mint);

  if (!patch.volume24hUsd) {
    patch.volume24hUsd = await fetchBnbVolumeFromOhlcv(mint, '24h');
  }
  if (!patch.volume5mUsd) {
    patch.volume5mUsd = await fetchBnbVolumeFromOhlcv(mint, '5m');
  }

  const volObj = detail?.volume;
  if (patch.txCount24h == null && volObj && typeof volObj === 'object') {
    patch.txCount24h = toFiniteNumber(volObj.count_24h);
  }
  if (patch.txCount5m == null && volObj && typeof volObj === 'object') {
    patch.txCount5m = toFiniteNumber(volObj.count_5m);
  }

  if (patch.holderCount == null) {
    patch.holderCount = await fetchBnbHolderCountUpstream(mint);
  }

  return patch;
}

