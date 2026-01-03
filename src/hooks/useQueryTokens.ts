import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { env } from '../env';
import type { Token } from '~/utils/db';

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

async function fetchNewPairs(): Promise<Token[]> {
  // Use Next.js API proxy to ensure proper field mapping (mint_address, etc.)
  const apiUrl = `/api/token-service/pulse-new?limit=35&fresh=1&t=${Date.now()}`;
  const response = await fetch(apiUrl, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  });
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : (data.result || []);
}

async function fetchFinalStretch(): Promise<Token[]> {
  const apiUrl = `/api/token-service/pulse-final-stretch?limit=100&t=${Date.now()}`;
  const response = await fetch(apiUrl);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

async function fetchMigrated(): Promise<Token[]> {
  const apiUrl = `/api/token-service/pulse-migrated?limit=30&t=${Date.now()}`;
  const response = await fetch(apiUrl);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
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
