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

// ============================================================================
// LocalStorage Cache Helpers - For instant data display on page return
// ============================================================================
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes - matches gcTime

interface CachedData<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * Save data to localStorage for instant display on page return
 */
function saveToLocalStorage<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    const cacheEntry: CachedData<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    localStorage.setItem(key, JSON.stringify(cacheEntry));
  } catch (error) {
    // localStorage might be full or disabled - silently fail
    console.warn(`[useQueryTokens] Failed to save cache for ${key}:`, error);
  }
}

/**
 * Load data from localStorage synchronously for instant display
 * Returns undefined if cache is missing or expired
 */
function loadFromLocalStorage<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return undefined;

    const parsed: CachedData<T> = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is still valid
    if (now < parsed.expiresAt && parsed.data) {
      return parsed.data;
    }

    // Cache expired - clean it up
    localStorage.removeItem(key);
    return undefined;
  } catch (error) {
    // Corrupted cache - clean it up
    try {
      localStorage.removeItem(key);
    } catch {}
    return undefined;
  }
}

// Cache keys for Solana pulse data
const CACHE_KEYS = {
  newPairs: 'pulse_solana_new_pairs_v1',
  finalStretch: 'pulse_solana_final_stretch_v1',
  migrated: 'pulse_solana_migrated_v1',
  launchpad: 'pulse_solana_launchpad_v1',
} as const;

// ============================================================================
// Fetch Functions - Now with localStorage persistence
// ============================================================================

async function fetchNewPairs(): Promise<Token[]> {
  // Use Next.js API proxy to ensure proper field mapping (mint_address, etc.)
  const apiUrl = `/api/token-service/pulse-new?limit=50&fresh=1&t=${Date.now()}`;
  const response = await fetch(apiUrl, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  });
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  const data = await response.json();
  const tokens = Array.isArray(data) ? data : (data.result || []);

  // Save to localStorage for instant display on page return
  saveToLocalStorage(CACHE_KEYS.newPairs, tokens);

  return tokens;
}

async function fetchFinalStretch(): Promise<Token[]> {
  const apiUrl = `/api/token-service/pulse-final-stretch?limit=50&t=${Date.now()}`;
  const response = await fetch(apiUrl);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  const data = await response.json();
  const tokens = Array.isArray(data) ? data : [];

  // Save to localStorage for instant display on page return
  saveToLocalStorage(CACHE_KEYS.finalStretch, tokens);

  return tokens;
}

async function fetchMigrated(): Promise<Token[]> {
  const apiUrl = `/api/token-service/pulse-migrated?limit=50&t=${Date.now()}`;
  const response = await fetch(apiUrl);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  const data = await response.json();
  const tokens = Array.isArray(data) ? data : [];

  // Save to localStorage for instant display on page return
  saveToLocalStorage(CACHE_KEYS.migrated, tokens);

  return tokens;
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
  const data = await response.json();

  // Save to localStorage for instant display on page return
  saveToLocalStorage(CACHE_KEYS.launchpad, data);

  return data;
}

// ============================================================================
// React Query Hooks - With placeholderData for instant display
// ============================================================================

export function useQueryNewPairs(enabled: boolean = true): UseQueryResult<Token[], Error> {
  return useQuery({
    queryKey: tokenKeys.trenches.newPairs(),
    queryFn: fetchNewPairs,
    enabled,                        // Conditionally enable/disable the query
    staleTime: 30 * 1000,          // Consider fresh for 30s, then refetch (matches Final Stretch / Migrated)
    gcTime: 10 * 60 * 1000,        // Keep in cache for 10 min for instant display
    refetchOnWindowFocus: false,   // Don't refetch on focus (WebSocket handles updates)
    refetchOnReconnect: true,      // Refetch on reconnect to catch missed updates
    refetchOnMount: true,          // ✅ ALWAYS fetch on mount to ensure fresh data
    // ✅ Instant display: Show cached data immediately while fresh data loads
    placeholderData: () => loadFromLocalStorage<Token[]>(CACHE_KEYS.newPairs),
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
    // ✅ Instant display: Show cached data immediately while fresh data loads
    placeholderData: () => loadFromLocalStorage<Token[]>(CACHE_KEYS.finalStretch),
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
    // ✅ Instant display: Show cached data immediately while fresh data loads
    placeholderData: () => loadFromLocalStorage<Token[]>(CACHE_KEYS.migrated),
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
    // ✅ Instant display: Show cached data immediately while fresh data loads
    placeholderData: () => loadFromLocalStorage<LaunchpadData>(CACHE_KEYS.launchpad),
    retry: 1,
  });
}
