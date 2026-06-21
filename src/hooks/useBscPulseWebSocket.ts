import { useSyncExternalStore } from 'react';
import { normalizeImageUrl, resolveMetadataImage } from '~/utils/images';
import {
  computeHashImageUrl,
  isSpeculativeInterstateCdn,
} from '~/utils/imageHash';
import {
  needsBnbMarketDataEnrichment,
  needsBnbDetailEnrichment,
  resolveBnbMarketCapUsd,
  resolveBnbPairAddress,
  resolveBnbPriceUsd,
  resolveBnbVolumeUsd,
  resolveBnbHolderCount,
  resolveBnbLiquidityUsd,
  resolveBnbTop10HoldersPct,
  resolveBnbDevHoldingPct,
  resolveBnbSniperPct,
  resolveBnbCreatorWallet,
  resolveBnbBondingPct,
  resolveBnbCirculatingSupply,
  toFiniteNumber,
  fetchBnbTokenMetrics,
  fetchBnbHolderCount,
  buildBnbDetailPatch,
  applyBnbDetailPatch,
  fetchBnbPulseTokens,
} from '~/utils/bnbToken';

const BNB_HTTP_BASE =
  (process.env.NEXT_PUBLIC_BNB_TOKEN_SERVICE_URL || 'https://token-bnb.interstate.so').replace(/\/+$/, '');
// Derive WS URL from the same env var so both can be overridden together.
const BNB_WS_BASE = BNB_HTTP_BASE.replace(/^http/, 'ws');
const MAX_TOKENS = 50;
const PING_INTERVAL_MS = 15_000;
const RECONNECT_DELAY_MS = 3_000;
const IS_DEV = process.env.NODE_ENV !== 'production';

// ─── Field normalizer ────────────────────────────────────────────────────────
export function normalizeBscToken(t: any): any {
  const pick = (...vals: any[]) => vals.find((v) => v !== undefined && v !== null && v !== '');
  const toNum = toFiniteNumber;

  const bondingRaw = t.bonding_curve_progress ?? t.bondingCurveProgress;
  let bondingPct: number | null = resolveBnbBondingPct(t) ?? null;
  if (bondingPct == null && bondingRaw != null && bondingRaw !== -1) {
    const n = typeof bondingRaw === 'string' ? parseFloat(bondingRaw) : Number(bondingRaw);
    if (Number.isFinite(n) && n >= 0) bondingPct = n <= 1.01 ? n * 100 : n;
  }
  const mintRaw = t.mint ?? t.mint_address ?? t.token_address ?? t.address ?? '';
  const mint = mintRaw ? String(mintRaw).toLowerCase() : '';
  const priceUsd = resolveBnbPriceUsd(t);
  const marketCap = resolveBnbMarketCapUsd(t);
  const pairAddress = resolveBnbPairAddress(t);

  const imageUrlRaw = pick(
    t.logo,
    t.image_url,
    t.imageUrl,
    t.image,
    t.logo_url,
    t.icon_url,
    t.icon,
  );
  const normalizedImageUrl = imageUrlRaw
    ? normalizeImageUrl(String(imageUrlRaw)) ?? String(imageUrlRaw)
    : null;
  const usableImageUrl =
    normalizedImageUrl && !isSpeculativeInterstateCdn(normalizedImageUrl)
      ? normalizedImageUrl
      : null;
  const proxiedImageUrl = usableImageUrl
    ? computeHashImageUrl(usableImageUrl, 64) ?? usableImageUrl
    : null;
  const metadataUriRaw = pick(t.metadataUri, t.metadata_uri, t.token_uri, t.uri);
  const metadataUri = metadataUriRaw ? normalizeBnbMetadataUri(String(metadataUriRaw)) : null;

  const vol = t.volume;
  const volumeFromNested =
    vol && typeof vol === 'object' && !Array.isArray(vol)
      ? {
          volume_24h: toNum(vol.volume_24h_usd),
          total_buys_24h: toNum(vol.buy_24h),
          total_sells_24h: toNum(vol.sell_24h),
          total_buys_5m: toNum(vol.buy_5m),
          total_sells_5m: toNum(vol.sell_5m),
          total_buy_volume_5m: toNum(vol.buy_volume_5m ?? vol.buy_5m_usd),
          total_sell_volume_5m: toNum(vol.sell_volume_5m ?? vol.sell_5m_usd),
          total_buy_volume_24h: toNum(vol.buy_volume_24h ?? vol.buy_24h),
          total_sell_volume_24h: toNum(vol.sell_volume_24h ?? vol.sell_24h),
          tx_count_24h: toNum(vol.count_24h),
          tx_count_5m: toNum(vol.count_5m),
        }
      : null;

  const { name: rawName, symbol: rawSymbol, ...rest } = t;
  const normalized: any = {
    ...rest,
    mint,
    mint_address: mint,
    ...(pairAddress ? { pair_address: pairAddress } : {}),
    market_cap_usd: marketCap,
    fully_diluted_value: marketCap,
    total_fully_diluted_valuation: marketCap,
    price_usd: priceUsd,
    usd_price: priceUsd,
    liquidity_usd: resolveBnbLiquidityUsd(t),
    total_liquidity_usd: resolveBnbLiquidityUsd(t),
    volume_24h:
      volumeFromNested?.volume_24h ??
      pick(t.volume24h, t.volume_24h, t.volume_24h_usd, t.volumeUsd24h, typeof vol === 'number' ? vol : undefined),
    total_buy_volume_24h:
      volumeFromNested?.total_buy_volume_24h ??
      pick(t.total_buy_volume_24h, t.buy_volume_24h_usd, t.buy_volume_24h),
    total_sell_volume_24h:
      volumeFromNested?.total_sell_volume_24h ??
      pick(t.total_sell_volume_24h, t.sell_volume_24h_usd, t.sell_volume_24h),
    total_buys_24h:
      volumeFromNested?.total_buys_24h ?? pick(t.total_buys_24h, t.buys_24h, t.buys24h),
    total_sells_24h:
      volumeFromNested?.total_sells_24h ?? pick(t.total_sells_24h, t.sells_24h, t.sells24h),
    total_buys_5m: volumeFromNested?.total_buys_5m ?? pick(t.total_buys_5m),
    total_sells_5m: volumeFromNested?.total_sells_5m ?? pick(t.total_sells_5m),
    total_buy_volume_5m:
      volumeFromNested?.total_buy_volume_5m ??
      pick(t.total_buy_volume_5m, t.buy_volume_5m_usd, t.buy_volume_5m),
    total_sell_volume_5m:
      volumeFromNested?.total_sell_volume_5m ??
      pick(t.total_sell_volume_5m, t.sell_volume_5m_usd, t.sell_volume_5m),
    tx_count_24h: volumeFromNested?.tx_count_24h ?? toNum(t.tx_count_24h ?? t.count_24h),
    tx_count_5m: volumeFromNested?.tx_count_5m ?? toNum(t.tx_count_5m ?? t.count_5m),
    holder_count: resolveBnbHolderCount(t),
    total_holders: resolveBnbHolderCount(t),
    bonding_curve_progress: bondingPct,
    top10_holding_pct: resolveBnbTop10HoldersPct(t),
    top10_holders_pct: resolveBnbTop10HoldersPct(t),
    dev_holding_pct: resolveBnbDevHoldingPct(t),
    dev_holding: resolveBnbDevHoldingPct(t),
    dev_percent: resolveBnbDevHoldingPct(t),
    sniper_pct: resolveBnbSniperPct(t),
    snipers_hold_pct: resolveBnbSniperPct(t),
    sniper_percent: resolveBnbSniperPct(t),
    creator_wallet: resolveBnbCreatorWallet(t),
    dev_wallet: resolveBnbCreatorWallet(t),
    created_at: t.created_at ?? t.createdAt ?? t.launch_time ?? t.launchTime,
    launch_time: t.launch_time ?? t.launchTime,
    protocol: t.protocol ?? t.launchpad_protocol,
    launchpad_protocol: t.launchpad_protocol ?? t.protocol,
    _chain: 'bnb',
  };

  if (hasMeaningfulText(rawName)) normalized.name = String(rawName).trim();
  else delete normalized.name;
  if (hasMeaningfulText(rawSymbol)) normalized.symbol = String(rawSymbol).trim();
  else delete normalized.symbol;
  if (proxiedImageUrl) {
    normalized.image_url = proxiedImageUrl;
    normalized.image = proxiedImageUrl;
    normalized.logo = proxiedImageUrl;
  }
  if (metadataUri) {
    normalized.uri = metadataUri;
  }

  return normalized;
}

function normalizeBnbMetadataUri(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('ipfs://')
  ) {
    return normalizeImageUrl(trimmed) ?? trimmed;
  }
  if (trimmed.startsWith('Qm') || trimmed.startsWith('baf')) {
    return `https://flap.mypinata.cloud/ipfs/${trimmed}`;
  }
  return trimmed;
}

function hasMeaningfulText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function mergePriceOnly(existing: any, update: any): any {
  const merged = { ...existing, ...update };
  for (const key of ['name', 'symbol', 'image_url', 'image', 'logo', 'uri'] as const) {
    const next = update[key];
    const nextMissing =
      next === undefined ||
      next === null ||
      (typeof next === 'string' && next.trim() === '');
    if (nextMissing && existing[key] !== undefined && existing[key] !== null) {
      merged[key] = existing[key];
    }
  }
  const keepPositive = (field: string) => {
    const next = Number(update[field] ?? 0);
    const prev = Number(existing[field] ?? 0);
    if ((!Number.isFinite(next) || next <= 0) && Number.isFinite(prev) && prev > 0) {
      merged[field] = existing[field];
    }
  };
  keepPositive('market_cap_usd');
  keepPositive('fully_diluted_value');
  keepPositive('total_fully_diluted_valuation');
  keepPositive('liquidity_usd');
  keepPositive('total_liquidity_usd');
  keepPositive('volume_24h');
  keepPositive('holder_count');
  keepPositive('total_holders');
  keepPositive('tx_count_24h');
  keepPositive('tx_count_5m');
  keepPositive('total_buys_5m');
  keepPositive('total_sells_5m');
  keepPositive('total_buy_volume_5m');
  keepPositive('total_sell_volume_5m');
  keepPositive('total_buy_volume_24h');
  keepPositive('total_sell_volume_24h');
  const keepMeaningfulPct = (field: string) => {
    const next = Number(update[field] ?? -1);
    const prev = Number(existing[field] ?? -1);
    if ((!Number.isFinite(next) || next < 0) && Number.isFinite(prev) && prev >= 0) {
      merged[field] = existing[field];
    }
  };
  keepMeaningfulPct('top10_holders_pct');
  keepMeaningfulPct('dev_holding_pct');
  keepMeaningfulPct('sniper_pct');
  if (!update.pair_address && existing.pair_address) {
    merged.pair_address = existing.pair_address;
  }
  return merged;
}

function mintKey(mint: string | undefined | null): string {
  return mint ? String(mint).toLowerCase() : '';
}

function findTokenByMint(mint: string): any | null {
  const id = mintKey(mint);
  if (!id) return null;
  return (
    _store.newTokens.find((t) => mintKey(t.mint) === id) ||
    _store.finalStretchTokens.find((t) => mintKey(t.mint) === id) ||
    _store.migratedTokens.find((t) => mintKey(t.mint) === id) ||
    null
  );
}

function getTokenChannel(mint: string): Channel | null {
  const id = mintKey(mint);
  if (!id) return null;
  if (_store.newTokens.some((t) => mintKey(t.mint) === id)) return 'new';
  if (_store.finalStretchTokens.some((t) => mintKey(t.mint) === id)) return 'final_stretch';
  if (_store.migratedTokens.some((t) => mintKey(t.mint) === id)) return 'migrated';
  return null;
}


async function fetchTokenDetailEnrichment(
  mint: string,
  hint?: any,
): Promise<Partial<any> | null> {
  try {
    const response = await fetch(`/api/bnb-token/detail?mint=${encodeURIComponent(mint)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      IS_DEV &&
        console.log(`[BscPulse:detail] miss mint=${mint.slice(0, 10)} status=${response.status}`);
      return null;
    }
    const data = await response.json();
    const normalized = normalizeBscToken({
      ...data,
      ...hint,
      mint,
      name: hasMeaningfulText(data?.name) ? data.name : hint?.name,
      symbol: hasMeaningfulText(data?.symbol) ? data.symbol : hint?.symbol,
      uri: data?.uri ?? hint?.uri,
      logo: data?.logo ?? hint?.logo,
    });
    const patch = {
      ...applyBnbDetailPatch(buildBnbDetailPatch({ ...data, ...hint, mint }, mint)),
      ...(normalized.image_url ? { image_url: normalized.image_url, image: normalized.image, logo: normalized.logo } : {}),
      ...(normalized.uri ? { uri: normalized.uri } : {}),
      ...(normalized.name ? { name: normalized.name } : {}),
      ...(normalized.symbol ? { symbol: normalized.symbol } : {}),
    };
    for (const key of Object.keys(patch)) {
      if (patch[key] === undefined || patch[key] === null || patch[key] === '') {
        delete patch[key];
      }
    }
    return Object.keys(patch).length > 0 ? patch : null;
  } catch (err) {
    IS_DEV && console.warn('[BscPulse:detail] error', mint.slice(0, 10), err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ─── Singleton store ─────────────────────────────────────────────────────────
type Channel = 'new' | 'final_stretch' | 'migrated';

interface BscStore {
  newTokens: any[];
  finalStretchTokens: any[];
  migratedTokens: any[];
  connected: boolean;
}

const EMPTY_STORE: BscStore = { newTokens: [], finalStretchTokens: [], migratedTokens: [], connected: false };

let _store: BscStore = { ...EMPTY_STORE };
const _enrichmentCache = new Map<string, Partial<any>>();
const _enrichmentInFlight = new Set<string>();
const _detailFetchedMints = new Set<string>();
const _metricsFetchedMints = new Set<string>();
const _metricsInFlight = new Set<string>();
const _holdersFetchedMints = new Set<string>();
const _holdersInFlight = new Set<string>();
const _listeners = new Set<() => void>();
const _wsRefs: Partial<Record<Channel, WebSocket>> = {};
const _pingTimers: Partial<Record<Channel, ReturnType<typeof setInterval>>> = {};
const _reconnectTimers: Partial<Record<Channel, ReturnType<typeof setTimeout>>> = {};

let _notifyPending = false;
function notify() {
  if (_notifyPending) return;
  _notifyPending = true;
  Promise.resolve().then(() => {
    _notifyPending = false;
    const snapshot = Array.from(_listeners);
    snapshot.forEach((l) => l());
  });
}

function applyCachedEnrichment(token: any): any {
  const mint = mintKey(token?.mint || token?.mint_address);
  if (!mint) return token;
  const cached = _enrichmentCache.get(mint);
  return cached ? { ...token, ...cached } : token;
}

function setChannel(channel: Channel, tokens: any[]) {
  const hydrated = tokens.map(applyCachedEnrichment);
  if (channel === 'new') {
    _store = { ..._store, newTokens: hydrated };
  } else if (channel === 'final_stretch') {
    _store = { ..._store, finalStretchTokens: hydrated };
  } else {
    _store = { ..._store, migratedTokens: hydrated };
  }
  hydrated.forEach((token) => queueEnrichmentIfNeeded(token));
  notify();
}

function upsertToken(
  channel: Channel,
  token: any,
  options: { prepend?: boolean; enrich?: boolean } = {},
) {
  const { prepend = true, enrich = false } = options;
  const id = mintKey(token.mint);
  const existing = id ? findTokenByMint(id) : null;
  const merged = existing ? mergePriceOnly(existing, token) : token;
  const hydratedToken = applyCachedEnrichment(merged);
  const addOrUpdate = (arr: any[]) => {
    const without = id ? arr.filter((t) => mintKey(t.mint) !== id) : arr;
    if (!prepend && existing) {
      return without.map((t) => (mintKey(t.mint) === id ? hydratedToken : t));
    }
    return [hydratedToken, ...without].slice(0, MAX_TOKENS);
  };
  const removeById = (arr: any[]) => {
    if (!id) return arr;
    return arr.filter((t) => mintKey(t.mint) !== id);
  };

  if (channel === 'new') {
    _store = {
      ..._store,
      newTokens: addOrUpdate(_store.newTokens),
      finalStretchTokens: removeById(_store.finalStretchTokens),
      migratedTokens: removeById(_store.migratedTokens),
    };
  } else if (channel === 'final_stretch') {
    _store = {
      ..._store,
      newTokens: removeById(_store.newTokens),
      finalStretchTokens: addOrUpdate(_store.finalStretchTokens),
      migratedTokens: removeById(_store.migratedTokens),
    };
  } else {
    _store = {
      ..._store,
      newTokens: removeById(_store.newTokens),
      finalStretchTokens: removeById(_store.finalStretchTokens),
      migratedTokens: addOrUpdate(_store.migratedTokens),
    };
  }
  if (enrich) {
    queueEnrichmentIfNeeded(hydratedToken);
  }
  notify();
}

function applyPriceUpdate(raw: any) {
  const update = normalizeBscToken(raw);
  const id = mintKey(update.mint);
  if (!id) return;
  const patch = (arr: any[]) =>
    arr.map((t) => (mintKey(t.mint) === id ? mergePriceOnly(t, update) : t));
  _store = {
    ..._store,
    newTokens: patch(_store.newTokens),
    finalStretchTokens: patch(_store.finalStretchTokens),
    migratedTokens: patch(_store.migratedTokens),
  };
  notify();
}

function updateTokenEverywhere(mint: string, patch: Partial<any>) {
  const id = mintKey(mint);
  if (!id) return;
  const numericFields = ['market_cap_usd', 'fully_diluted_value', 'total_fully_diluted_valuation', 'liquidity_usd', 'price_usd'];
  const merge = (arr: any[]) =>
    arr.map((t) => {
      if (mintKey(t.mint) !== id) return t;
      const merged = { ...t, ...patch };
      for (const field of numericFields) {
        const prev = Number(t[field] ?? 0);
        const next = Number(patch[field] ?? 0);
        if (prev > 0 && (next <= 0 || !Number.isFinite(next))) {
          merged[field] = t[field];
        }
      }
      return merged;
    });
  _store = {
    ..._store,
    newTokens: merge(_store.newTokens),
    finalStretchTokens: merge(_store.finalStretchTokens),
    migratedTokens: merge(_store.migratedTokens),
  };
  notify();
}

function needsNameEnrichment(token: any): boolean {
  return !hasMeaningfulText(token?.name) || !hasMeaningfulText(token?.symbol);
}

function needsImageEnrichment(token: any): boolean {
  return !(token?.image_url || token?.image || token?.logo);
}

function buildProtocolEnrichmentPatch(data: any): Partial<any> | null {
  const patch: Record<string, any> = {};
  if (hasMeaningfulText(data?.name)) patch.name = String(data.name).trim();
  if (hasMeaningfulText(data?.symbol)) patch.symbol = String(data.symbol).trim();
  if (data?.image_url) {
    patch.image_url = data.image_url;
    patch.image = data.image_url;
    patch.logo = data.image_url;
  }
  if (data?.uri) patch.uri = data.uri;
  return Object.keys(patch).length > 0 ? patch : null;
}

async function resolveUriMetadata(uri: string): Promise<Partial<any> | null> {
  const metadataUrl = normalizeBnbMetadataUri(uri);
  if (!metadataUrl) return null;
  try {
    const response = await fetch(`/api/metadata?url=${encodeURIComponent(metadataUrl)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const json = await response.json();
    const patch: Record<string, any> = { uri: metadataUrl };
    if (hasMeaningfulText(json?.name)) patch.name = String(json.name).trim();
    const symbol = json?.symbol ?? json?.ticker;
    if (hasMeaningfulText(symbol)) patch.symbol = String(symbol).trim();
    const image = await resolveMetadataImage(metadataUrl, true);
    if (image) {
      const proxied = computeHashImageUrl(image, 64) ?? image;
      patch.image_url = proxied;
      patch.image = proxied;
      patch.logo = proxied;
    }
    return Object.keys(patch).length > 1 ? patch : null;
  } catch {
    const image = await resolveMetadataImage(metadataUrl, true);
    if (!image) return null;
    const proxied = computeHashImageUrl(image, 64) ?? image;
    return { uri: metadataUrl, image_url: proxied, image: proxied, logo: proxied };
  }
}

async function fetchProtocolEnrichment(
  mint: string,
  protocol?: string | null,
): Promise<Partial<any> | null> {
  try {
    const params = new URLSearchParams({ mint });
    if (protocol) params.set('protocol', protocol);
    const response = await fetch(`/api/bnb-token/image?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return buildProtocolEnrichmentPatch(data);
  } catch {
    return null;
  }
}

function refreshTokenMetadata(mint: string, hint?: any) {
  if (typeof window === 'undefined' || !mint) return;
  const id = mintKey(mint);
  if (!id) return;
  if (_detailFetchedMints.has(id)) return;
  if (_enrichmentInFlight.has(id)) return;
  _detailFetchedMints.add(id);
  _enrichmentInFlight.add(id);

  const applyPatch = (patch: Partial<any> | null) => {
    if (!patch) return;
    const prev = _enrichmentCache.get(id) ?? {};
    const merged = { ...prev, ...patch };
    _enrichmentCache.set(id, merged);
    updateTokenEverywhere(id, merged);
    return { ...hint, ...merged };
  };

  if (hint?.uri && (needsImageEnrichment(hint) || needsNameEnrichment(hint))) {
    void resolveUriMetadata(hint.uri).then((patch) => {
      if (patch) applyPatch(patch);
    });
  }

  // /v1/token/{mint} is the trade-page endpoint — not for the pulse board.
  // Name/image enrichment flows through resolveUriMetadata and fetchProtocolEnrichment only.
  void Promise.resolve(null)
    .then(async (patch) => {
      if (patch) applyPatch(patch);
      const merged = { ...hint, ...(_enrichmentCache.get(id) ?? {}), ...(patch ?? {}) };
      const tokenLike = merged ?? hint ?? {};
      const protocol = tokenLike.launchpad_protocol || tokenLike.protocol || hint?.launchpad_protocol;
      const uri = tokenLike.uri ?? hint?.uri;

      if (uri && (needsImageEnrichment(tokenLike) || needsNameEnrichment(tokenLike))) {
        const uriPatch = await resolveUriMetadata(uri);
        if (uriPatch) applyPatch(uriPatch);
      }

      const latest = { ...tokenLike, ...(_enrichmentCache.get(id) ?? {}) };
      if (needsImageEnrichment(latest) || needsNameEnrichment(latest)) {
        const protocolPatch = await fetchProtocolEnrichment(id, protocol);
        if (protocolPatch) applyPatch(protocolPatch);
      }
    })
    .finally(() => {
      _enrichmentInFlight.delete(id);
    });
}

function queueMarketDataEnrichment(token: any, force = false) {
  if (typeof window === 'undefined') return;
  const mint = mintKey(token?.mint);
  if (!mint) return;

  const existingVol = resolveBnbVolumeUsd(token);
  const needsMc = needsBnbMarketDataEnrichment(token);
  const needsVol = existingVol == null || existingVol <= 0;
  const needsDetail = needsBnbDetailEnrichment(token);

  if (!needsMc && !needsVol && !needsDetail && !force) {
    _metricsFetchedMints.add(mint);
    return;
  }

  if (_metricsFetchedMints.has(mint) && !force) return;
  if (_metricsInFlight.has(mint)) return;

  _metricsFetchedMints.add(mint);
  _metricsInFlight.add(mint);

  void fetchBnbTokenMetrics(mint)
    .then((metrics) => {
      if (!metrics) return;
      const patch = applyBnbDetailPatch(metrics);
      for (const key of Object.keys(patch)) {
        if (patch[key] === undefined || patch[key] === null || patch[key] === '') {
          delete patch[key];
        }
      }
      if (Object.keys(patch).length === 0) return;
      const prev = _enrichmentCache.get(mint) ?? {};
      const merged = { ...prev, ...patch };
      _enrichmentCache.set(mint, merged);
      updateTokenEverywhere(mint, merged);
    })
    .finally(() => {
      _metricsInFlight.delete(mint);
    });
}

function queueHolderEnrichment(token: any, force = false) {
  if (typeof window === 'undefined') return;
  const mint = mintKey(token?.mint);
  if (!mint) return;

  const existing = resolveBnbHolderCount(token);
  if (existing != null && existing > 0 && !force) {
    _holdersFetchedMints.add(mint);
    return;
  }

  if (_holdersFetchedMints.has(mint) && !force) return;
  if (_holdersInFlight.has(mint)) return;

  _holdersFetchedMints.add(mint);
  _holdersInFlight.add(mint);

  void fetchBnbHolderCount(mint)
    .then((holderCount) => {
      if (holderCount == null || holderCount <= 0) return;
      const patch = {
        holder_count: holderCount,
        total_holders: holderCount,
      };
      const prev = _enrichmentCache.get(mint) ?? {};
      const merged = { ...prev, ...patch };
      _enrichmentCache.set(mint, merged);
      updateTokenEverywhere(mint, merged);
    })
    .finally(() => {
      _holdersInFlight.delete(mint);
    });
}

function queueEnrichmentIfNeeded(token: any, force = false) {
  if (typeof window === 'undefined') return;
  const mint = mintKey(token?.mint);
  if (!mint) return;

  queueMarketDataEnrichment(token, force);
  queueHolderEnrichment(token, force);

  if (_detailFetchedMints.has(mint) && !force) return;
  const needsMetadata =
    needsNameEnrichment(token) || needsImageEnrichment(token);
  if (!needsMetadata) {
    _detailFetchedMints.add(mint);
    return;
  }
  refreshTokenMetadata(mint, token);
}

function closeChannel(channel: Channel) {
  clearInterval(_pingTimers[channel] as any);
  clearTimeout(_reconnectTimers[channel] as any);
  delete _pingTimers[channel];
  delete _reconnectTimers[channel];
  const ws = _wsRefs[channel];
  if (ws) {
    ws.onclose = null;
    ws.close();
    delete _wsRefs[channel];
  }
}

function openChannel(channel: Channel) {
  const existing = _wsRefs[channel];
  if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;

  let ws: WebSocket;
  try {
    ws = new WebSocket(`${BNB_WS_BASE}/v1/stream?channel=${channel}`);
  } catch (e) {
    console.error(`[BscPulse] failed to create WS for ${channel}:`, e);
    return;
  }
  _wsRefs[channel] = ws;

  ws.onopen = () => {
    console.log(`[BscPulse] ✅ ${channel} open`);
    _store = { ..._store, connected: true };
    notify();
    _pingTimers[channel] = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, PING_INTERVAL_MS);
  };

  ws.onmessage = (e) => {
    let msg: any;
    try { msg = JSON.parse(e.data as string); } catch { return; }
    const { type, channel: msgChannel, data } = msg;

    if (type === 'snapshot') {
      const raw = Array.isArray(data) ? data : [];
      const tokens = raw.map(normalizeBscToken);
      const withImages = tokens.filter((t) => t.image_url || t.image || t.logo).length;
      const withUri = tokens.filter((t) => t.uri).length;
      IS_DEV &&
        console.log(
          `[BscPulse] snapshot ${channel}: ${tokens.length} tokens, logo/image: ${withImages}/${tokens.length}, uri: ${withUri}/${tokens.length}`,
        );
      if (IS_DEV && tokens[0]) {
        console.log('[BscPulse] sample keys:', Object.keys(raw[0] || {}).join(', '));
      }
      setChannel(channel, tokens.slice(0, MAX_TOKENS));
    } else if (type === 'new_token' || type === 'migrated_token') {
      upsertToken((msgChannel ?? channel) as Channel, normalizeBscToken(data), {
        prepend: true,
        enrich: true,
      });
    } else if (type === 'price_update') {
      applyPriceUpdate(data);
    }
  };

  ws.onerror = (err) => { console.error(`[BscPulse] ❌ ${channel} error:`, err); };

  ws.onclose = () => {
    clearInterval(_pingTimers[channel] as any);
    delete _pingTimers[channel];
    delete _wsRefs[channel];
    const anyOpen = Object.values(_wsRefs).some((w) => w?.readyState === WebSocket.OPEN);
    if (!anyOpen) { _store = { ..._store, connected: false }; notify(); }
    _reconnectTimers[channel] = setTimeout(() => openChannel(channel), RECONNECT_DELAY_MS);
  };
}

function isBscPulseActive(): boolean {
  return (['new', 'final_stretch', 'migrated'] as Channel[]).some((channel) => {
    const ws = _wsRefs[channel];
    return ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING;
  });
}

export function startBscPulse() {
  if (typeof window === 'undefined') return;
  // Avoid tearing down live sockets on React strict-mode remount or route re-entry.
  if (isBscPulseActive()) return;

  (['new', 'final_stretch', 'migrated'] as Channel[]).forEach(closeChannel);
  _store = { ...EMPTY_STORE };
  _detailFetchedMints.clear();
  _metricsFetchedMints.clear();
  notify();
  openChannel('new');
  openChannel('final_stretch');
  openChannel('migrated');
}

const _serverSnapshot: BscStore = { ...EMPTY_STORE };

function subscribe(listener: () => void) {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

function getSnapshot() { return _store; }
function getServerSnapshot() { return _serverSnapshot; }

export function useBscPulseData(): BscStore {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
