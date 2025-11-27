export interface UnifiedTokenMetadata {
  address?: string;
  name?: string;
  symbol?: string;
  protocol?: string;
  launchpad?: string | null;
  imageUrl?: string;
  createdAt?: string | number;
  priceUsd?: number;
  marketCapUsd?: number;
  migrated_pool_address?: string;
}

interface FetchOptions {
  signal?: AbortSignal;
  pairAddress?: string | null;
}

const DEFAULT_MONAD_ENDPOINT = "/api/token-service/monad/token";
const DEFAULT_TRADE_VIEW_ENDPOINT = "/api/token-service/trade-view";

export function isProbablyMonadAddress(address?: string | null): boolean {
  return typeof address === "string" && address.trim().toLowerCase().startsWith("0x");
}

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function fetchChainTokenMetadata(
  tokenAddress: string,
  options: FetchOptions = {},
): Promise<UnifiedTokenMetadata | null> {
  if (!tokenAddress) return null;

  const trimmedAddress = tokenAddress.trim();
  if (!trimmedAddress) return null;

  if (isProbablyMonadAddress(trimmedAddress)) {
    return fetchMonadMetadata(trimmedAddress, options.signal);
  }

  return fetchSolanaMetadata(trimmedAddress, options);
}

async function fetchMonadMetadata(address: string, signal?: AbortSignal): Promise<UnifiedTokenMetadata | null> {
  const url = `${DEFAULT_MONAD_ENDPOINT}?address=${encodeURIComponent(address)}`;
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Monad token service responded with ${response.status}`);
  }

  const payload = await response.json();
  const data = payload?.data;
  if (!data) {
    return null;
  }

  return {
    address: data.address || address,
    name: data.name || undefined,
    symbol: data.symbol || undefined,
    protocol: data.launchpad_protocol || data.launchpad_name || data.protocol || undefined,
    launchpad: data.launchpad_protocol || data.launchpad_name || data.protocol || undefined,
    imageUrl: data.image_url || data.logo || undefined,
    createdAt: data.created_at || data.updated_at,
    priceUsd: toOptionalNumber(data.price_usd),
    marketCapUsd: toOptionalNumber(data.market_cap_usd),
  };
}

async function fetchSolanaMetadata(
  address: string,
  options: FetchOptions,
): Promise<UnifiedTokenMetadata | null> {
  const endpoints: string[] = [
    `${DEFAULT_TRADE_VIEW_ENDPOINT}?mint_address=${encodeURIComponent(address)}`,
  ];

  if (options.pairAddress) {
    endpoints.push(`${DEFAULT_TRADE_VIEW_ENDPOINT}?pair_address=${encodeURIComponent(options.pairAddress)}`);
  }

  let lastError: unknown = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { signal: options.signal });
      if (!response.ok) {
        lastError = new Error(`Token service responded with ${response.status}`);
        continue;
      }

      const payload = await response.json();
      const token =
        payload?.token ||
        payload?.data ||
        payload;

      if (!token) {
        continue;
      }

      return {
        address: token.mint_address || token.mintAddress || token.address || address,
        name: token.name || undefined,
        symbol: token.symbol || undefined,
        protocol:
          token.launchpad_protocol ||
          token.protocol ||
          token.launchpadName ||
          token.amm ||
          undefined,
        launchpad:
          token.launchpad_protocol ||
          token.protocol ||
          token.launchpadName ||
          token.amm ||
          undefined,
        imageUrl: token.uri || token.image || token.logo || undefined,
        createdAt: token.created_timestamp || token.createdAt,
        priceUsd: toOptionalNumber(token.price_usd ?? token.priceUsd),
        marketCapUsd: toOptionalNumber(token.market_cap_usd ?? token.market_cap),
        migrated_pool_address: token.migrated_pool_address || token.pair_address || undefined,
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError instanceof Error ? lastError : new Error("Failed to fetch token metadata");
  }

  return null;
}

export async function batchFetchChainTokenMetadata(
  tokenAddresses: string[],
  options: FetchOptions = {},
): Promise<Map<string, UnifiedTokenMetadata>> {
  const results = new Map<string, UnifiedTokenMetadata>();
  const uniqueAddresses = Array.from(new Set(tokenAddresses.filter(Boolean)));

  await Promise.allSettled(
    uniqueAddresses.map(async (address) => {
      const metadata = await fetchChainTokenMetadata(address, options);
      if (metadata) {
        results.set(address, metadata);
      }
    }),
  );

  return results;
}

