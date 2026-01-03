import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { env } from '../env';
import type { Token } from '~/utils/db';
import { extractTokenImage } from '../utils/images';

export const tokenKeys = {
  trenches: {
    newPairs: () => ['tokens', 'trenches', 'new-pairs'] as const,
    finalStretch: () => ['tokens', 'trenches', 'final-stretch'] as const,
    migrated: () => ['tokens', 'trenches', 'migrated'] as const,
  },
  launchpad: {
    data: () => ['tokens', 'launchpad', 'data'] as const,
  },
};

// Normalize token data from backend API to frontend format
function normalizeToken(r: any): any {
  const toNumber = (value: any): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const imageUrl = extractTokenImage(r);

  return {
    // Map mint_address to mint for frontend compatibility
    mint: r.mint_address || r.mint || r.address || null,
    mint_address: r.mint_address || r.mint || r.address || null,
    pair_address: r.pair_address || null,
    name: r.name || r.token_name || '',
    symbol: r.symbol || r.token_symbol || '',
    // Price and market data
    usd_price: toNumber(r.price_usd),
    price_usd: toNumber(r.price_usd),
    fully_diluted_value: toNumber(r.market_cap_usd),
    market_cap_usd: toNumber(r.market_cap_usd),
    total_liquidity_usd: toNumber(r.liquidity_usd),
    liquidity_usd: toNumber(r.liquidity_usd),
    // Volume data
    volume_24h: toNumber(r.volume_24h) || (toNumber(r.total_buy_volume_24h) + toNumber(r.total_sell_volume_24h)),
    volume_1h: toNumber(r.volume_1h) || (toNumber(r.total_buy_volume_1h) + toNumber(r.total_sell_volume_1h)),
    // Bonding curve
    bonding_curve_progress: parseFloat(r.bonding_pct ?? 0),
    bonding_pct: parseFloat(r.bonding_pct ?? 0),
    graduation_percent: parseFloat(r.graduation_percent ?? 0),
    // Timestamps
    created_at: r.launch_time || r.created_at || null,
    launch_time: r.launch_time || null,
    migrated_time: r.migrated_time || null,
    // Protocol
    launchpad_protocol: r.launchpad_protocol || null,
    // Images - map to all possible field names
    image_url: imageUrl,
    image: imageUrl,
    logo: imageUrl,
    uri: r.uri || null,
    // Trading stats
    total_buy_volume_24h: toNumber(r.total_buy_volume_24h),
    total_sell_volume_24h: toNumber(r.total_sell_volume_24h),
    total_buys_24h: toNumber(r.total_buys_24h),
    total_sells_24h: toNumber(r.total_sells_24h),
    price_percent_change_1h: toNumber(r.price_change_1h),
    price_percent_change_24h: toNumber(r.price_percent_change_24h),
    // Links
    links: r.links || null,
  };
}

async function fetchNewPairs(): Promise<Token[]> {
  // Fetch directly from backend API for initial Solana data
  const baseUrl = env.NEXT_PUBLIC_WEBSOCKET_URL;
  const apiUrl = `${baseUrl}/v1/pulse/new?limit=35`;
  const response = await fetch(apiUrl, {
    cache: 'no-store',
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
    }
  });
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  const data = await response.json();
  const tokens = Array.isArray(data) ? data : (data.data || data.result || []);
  return tokens.map(normalizeToken);
}

async function fetchFinalStretch(): Promise<Token[]> {
  // Fetch directly from backend API for initial Solana data
  const baseUrl = env.NEXT_PUBLIC_WEBSOCKET_URL;
  const apiUrl = `${baseUrl}/v1/pulse/final-stretch?limit=100`;
  const response = await fetch(apiUrl, {
    cache: 'no-store',
    headers: {
      'Accept': 'application/json',
    }
  });
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  const data = await response.json();
  const tokens = Array.isArray(data) ? data : (data.data || data.result || []);
  return tokens.map(normalizeToken);
}

async function fetchMigrated(): Promise<Token[]> {
  // Fetch directly from backend API for initial Solana data
  const baseUrl = env.NEXT_PUBLIC_WEBSOCKET_URL;
  const apiUrl = `${baseUrl}/v1/pulse/migrated?limit=30`;
  const response = await fetch(apiUrl, {
    cache: 'no-store',
    headers: {
      'Accept': 'application/json',
    }
  });
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  const data = await response.json();
  const tokens = Array.isArray(data) ? data : (data.data || data.result || []);
  return tokens.map(normalizeToken);
}

interface LaunchpadData {
  new: any[];
  completing: any[];
  completed: any[];
}

async function fetchLaunchpadData(): Promise<LaunchpadData> {
  const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL.endsWith('/') 
    ? env.NEXT_PUBLIC_GO_SERVICE_URL.slice(0, -1) 
    : env.NEXT_PUBLIC_GO_SERVICE_URL;
  const apiUrl = env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED
    ? `${baseUrl}/v1/launchpad/tokens?limit=30`
    : `/api/launchpad/tokens?limit=30`;
  const response = await fetch(apiUrl);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  return await response.json();
}

export function useQueryNewPairs(enabled: boolean = true): UseQueryResult<Token[], Error> {
  return useQuery({
    queryKey: tokenKeys.trenches.newPairs(),
    queryFn: fetchNewPairs,
    enabled,                        // Conditionally enable/disable the query
    staleTime: Infinity,           // Never mark as stale - WebSocket provides updates
    gcTime: 10 * 60 * 1000,        // Keep in cache for 10 min for instant display
    refetchOnWindowFocus: false,   // Don't refetch on focus (WebSocket handles updates)
    refetchOnReconnect: true,      // Refetch on reconnect to catch missed updates
    refetchOnMount: true,          // ✅ ALWAYS fetch on mount to ensure fresh data
    // ✅ NO POLLING - WebSocket provides instant updates via cache updates
    retry: 1,
  });
}

export function useQueryFinalStretch(enabled: boolean = true): UseQueryResult<Token[], Error> {
  return useQuery({
    queryKey: tokenKeys.trenches.finalStretch(),
    queryFn: fetchFinalStretch,
    enabled,                        // Conditionally enable/disable the query
    staleTime: 30 * 1000,          // Consider fresh for 30 seconds (WebSocket provides real-time updates)
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,   // Don't refetch on focus (WebSocket handles updates)
    refetchOnReconnect: true,
    refetchOnMount: true,
    // ✅ NO POLLING - WebSocket provides instant updates via query invalidation
    retry: 1,
  });
}

export function useQueryMigrated(enabled: boolean = true): UseQueryResult<Token[], Error> {
  return useQuery({
    queryKey: tokenKeys.trenches.migrated(),
    queryFn: fetchMigrated,
    enabled,                        // Conditionally enable/disable the query
    staleTime: 30 * 1000,          // Consider fresh for 30 seconds (WebSocket provides real-time updates)
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,   // Don't refetch on focus (WebSocket handles updates)
    refetchOnReconnect: true,
    refetchOnMount: true,
    // ✅ NO POLLING - WebSocket provides instant updates via query invalidation
    retry: 1,
  });
}

export function useQueryLaunchpadData(enabled: boolean = true): UseQueryResult<LaunchpadData, Error> {
  return useQuery({
    queryKey: tokenKeys.launchpad.data(),
    queryFn: fetchLaunchpadData,
    enabled,                        // Conditionally enable/disable the query
    staleTime: 0,                  // Always stale - always refetch
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: true,
    retry: 1,
  });
}

