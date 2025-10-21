import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import Head from 'next/head';
import PulseTable from '../components/PulseTable';
import PulseControlBar from '../components/PulseControlBar';
import type { Token } from '~/utils/db';
import Header from '../components/Header';
import Footer from '../components/Footer';
import usePaginatedTokensWebSocket from '../hooks/usePaginatedTokensWebSocket';
import { useRealtimeWebSocket } from '../hooks/useRealtimeWebSocket';
import { usePulseWebSocket } from '../hooks/usePulseWebSocket';
// import { PriorityImageSearcher } from '../utils/imageSearch'; // DISABLED - no external image searches
import { useImagePreloader } from '../hooks/useImagePreloader';
import { useCachedPulseTokens, useCachedLaunchpadData } from '../hooks/useCachedTokens';
// DISABLED: Using HTTP polling instead for real-time data
// import { useCachedFinalStretchTokens, useCachedMigratedTokens } from '../hooks/useCachedTokensAdditional';
import { env } from '~/env';

interface LaunchpadToken {
  mint: string;
  name: string;
  symbol: string;
  image: string;
  priceUsd: number;
  marketCapUsd: number;
  volume24h: number;
  priceChange24h: number;
  graduationPercent: number;
  protocol: string;
  launchpadName: string;
  state: string;
  createdAt: string;
  migratedAt?: string;
  completedAt?: string;
}

interface LaunchpadData {
  new: LaunchpadToken[];
  completing: LaunchpadToken[];
  completed: LaunchpadToken[];
}

// FEATURE FLAG: To re-enable the 5 bubble metrics, change showBubbleMetrics={false} to showBubbleMetrics={true} in all PulseTable components below
export default function PulsePage() {
  // Tab navigation state
  const [activeTab, setActiveTab] = useState<'new' | 'final-stretch' | 'migrated'>('new');

  // Keyboard navigation for tabs (mobile only)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only enable keyboard navigation on mobile devices (when tabs are visible)
      if (window.innerWidth < 1024 && (event.ctrlKey || event.metaKey)) {
        switch (event.key) {
          case '1':
            event.preventDefault();
            setActiveTab('new');
            break;
          case '2':
            event.preventDefault();
            setActiveTab('final-stretch');
            break;
          case '3':
            event.preventDefault();
            setActiveTab('migrated');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  // Use cached hooks for immediate data display
  const { 
    tokens, 
    loading: tokensLoading, 
    error: tokensError, 
    isStale: tokensStale,
    refreshTokens 
  } = useCachedPulseTokens();
  
  const { 
    launchpadData, 
    loading: launchpadLoading, 
    error: launchpadError, 
    isStale: launchpadStale,
    refreshData: refreshLaunchpadData 
  } = useCachedLaunchpadData();

  // DISABLED: Use HTTP polling instead of cached hooks for real-time data
  // const { 
  //   tokens: cachedFinalStretchTokens, 
  //   loading: finalStretchLoading, 
  //   error: finalStretchError, 
  //   isStale: finalStretchStale 
  // } = useCachedFinalStretchTokens();
  
  // const { 
  //   tokens: cachedMigratedTokens, 
  //   loading: migratedLoading, 
  //   error: migratedError, 
  //   isStale: migratedStale 
  // } = useCachedMigratedTokens();

  const [httpNew, setHttpNew] = useState<any[]>(() => {
    // Initialize with cached data immediately for instant display
    try {
      const cached = localStorage.getItem('cached_pulse_new');
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (parsed.data && parsed.timestamp && (now - parsed.timestamp < 5 * 60 * 1000)) {
          console.log(`[Pulse] Loaded ${parsed.data.length} cached new tokens`);
          return parsed.data;
        }
      }
    } catch {}
    return [];
  });
  const [httpNewTick, setHttpNewTick] = useState(0);
  const [httpMigrated, setHttpMigrated] = useState<any[]>(() => {
    // Initialize with cached data immediately
    try {
      const cached = localStorage.getItem('cached_pulse_migrated');
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (parsed.data && parsed.timestamp && (now - parsed.timestamp < 5 * 60 * 1000)) {
          return parsed.data;
        }
      }
    } catch {}
    return [];
  });
  const [httpMigratedTick, setHttpMigratedTick] = useState(0);
  const [httpFinalStretch, setHttpFinalStretch] = useState<any[]>(() => {
    // Initialize with cached data immediately
    try {
      const cached = localStorage.getItem('cached_pulse_final_stretch');
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (parsed.data && parsed.timestamp && (now - parsed.timestamp < 5 * 60 * 1000)) {
          return parsed.data;
        }
      }
    } catch {}
    return [];
  });
  const [httpFinalStretchTick, setHttpFinalStretchTick] = useState(0);

  // DISABLED: WebSocket hook for real-time token updates (token service doesn't have WebSocket endpoint)
  // const { data: newPairsTokens, loading: wsLoading } = usePaginatedTokensWebSocket({ filter: 'new', limit: 30 });
  // Use HTTP API instead
  const newPairsTokens: any[] = [];
  const wsLoading = false;

  // WebSocket for instant token notifications (all categories)
  const {
    newTokens: wsNewTokens,
    finalStretchTokens: wsFinalStretchTokens,
    migratedTokens: wsMigratedTokens,
    connected: wsPulseConnected,
    error: wsPulseError
  } = usePulseWebSocket({
    enabled: true, // Always enabled for instant updates
    // Instant callbacks for immediate UI updates
    onNewToken: useCallback((token: any) => {
      console.log(`[Pulse] 🔔 WebSocket NEW token received:`, {
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        status: token.status,
        fullToken: token
      });
      setHttpNew(prev => {
        console.log(`[Pulse] Current httpNew count: ${prev.length}`);
        const existingMints = new Set(prev.map(t => t.mint));
        if (!existingMints.has(token.mint)) {
          console.log(`[Pulse] ⚡ INSTANT new token ADDED to httpNew:`, token.mint, token.name);
          const merged = [token, ...prev];
          console.log(`[Pulse] Updated httpNew count: ${merged.length}`);
          try {
            localStorage.setItem('cached_pulse_new', JSON.stringify({
              data: merged,
              timestamp: Date.now()
            }));
          } catch {}
          return merged;
        } else {
          console.log(`[Pulse] ⚠️ Token already exists in httpNew, skipping:`, token.mint);
        }
        return prev;
      });
      setHttpNewTick((t) => {
        console.log(`[Pulse] Incrementing httpNewTick: ${t} → ${t + 1}`);
        return t + 1;
      });
    }, []),
    onFinalStretchToken: useCallback((token: any) => {
      console.log(`[Pulse] 🔄 Final Stretch token migration: removing from New Pairs, adding to Final Stretch`);

      // Remove from NEW column
      setHttpNew(prev => {
        const filtered = prev.filter(t => t.mint !== token.mint);
        if (filtered.length < prev.length) {
          console.log(`[Pulse] Removed ${token.mint} from New Pairs`);
        }
        return filtered;
      });

      // Add to FINAL_STRETCH column
      setHttpFinalStretch(prev => {
        const existingMints = new Set(prev.map(t => t.mint));
        if (!existingMints.has(token.mint)) {
          console.log(`[Pulse] ⚡ INSTANT final stretch token added:`, token.mint);
          const merged = [token, ...prev];
          try {
            localStorage.setItem('cached_pulse_final_stretch', JSON.stringify({
              data: merged,
              timestamp: Date.now()
            }));
          } catch {}
          return merged;
        }
        return prev;
      });
      setHttpFinalStretchTick((t) => t + 1);
    }, []),
    onMigratedToken: useCallback((token: any) => {
      console.log(`[Pulse] 🔄 Migrated token transition: removing from Final Stretch, adding to Migrated`);

      // Remove from FINAL_STRETCH column
      setHttpFinalStretch(prev => {
        const filtered = prev.filter(t => t.mint !== token.mint);
        if (filtered.length < prev.length) {
          console.log(`[Pulse] Removed ${token.mint} from Final Stretch`);
        }
        return filtered;
      });

      // Also remove from NEW column (just in case)
      setHttpNew(prev => {
        const filtered = prev.filter(t => t.mint !== token.mint);
        if (filtered.length < prev.length) {
          console.log(`[Pulse] Removed ${token.mint} from New Pairs`);
        }
        return filtered;
      });

      // Add to MIGRATED column
      setHttpMigrated(prev => {
        const existingMints = new Set(prev.map(t => t.mint));
        if (!existingMints.has(token.mint)) {
          console.log(`[Pulse] ⚡ INSTANT migrated token added:`, token.mint);
          const merged = [token, ...prev];
          try {
            localStorage.setItem('cached_pulse_migrated', JSON.stringify({
              data: merged,
              timestamp: Date.now()
            }));
          } catch {}
          return merged;
        }
        return prev;
      });
      setHttpMigratedTick((t) => t + 1);
    }, []),
  });

  // REMOVED: Slow useEffect-based merge - now using instant callbacks above

  // REMOVED: Slow useEffect-based merge - now using instant callbacks above

  // REMOVED: Slow useEffect-based merge - now using instant callbacks above

  // HTTP polling for discovering NEW tokens (Continuous backup + WebSocket)
  // IMPORTANT: Keep polling active even when WebSocket is connected!
  // Reason: WebSocket sends events, but we still need HTTP polling to refresh the full list
  // This ensures if WebSocket misses an event, polling picks it up within 5-10 seconds
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        // Always use Next.js API proxy to avoid CORS issues
        const apiUrl = `/api/token-service/getAllTokens?filter=new&limit=30&t=${Date.now()}`;

        const res = await fetch(apiUrl);
        if (!alive) return;
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            // Only replace when we have non-empty fresh data to avoid flicker
            if (data.length > 0) {
              setHttpNew(data as any[]);
              setHttpNewTick((t) => t + 1);
              // Cache to localStorage for next page load
              try {
                localStorage.setItem('cached_pulse_new', JSON.stringify({
                  data: data,
                  timestamp: Date.now()
                }));
              } catch {}
            }
          }
        }
      } catch {}
    };

    // Poll immediately
    poll();

    // Continue polling every 5 seconds (increased from 3s to reduce load)
    // This serves as backup in case WebSocket misses events
    const id = setInterval(poll, 5000);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Immediate poll on mount for faster initial load
  useEffect(() => {
    const immediatePoll = async () => {
      try {
        const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL.endsWith('/')
          ? env.NEXT_PUBLIC_GO_SERVICE_URL.slice(0, -1)
          : env.NEXT_PUBLIC_GO_SERVICE_URL;
        const apiUrl = env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED
          ? `${baseUrl}/v1/pulse/new?limit=30&t=${Date.now()}`
          : `/api/token-service/pulse-new?limit=30&t=${Date.now()}`;

        const res = await fetch(apiUrl);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setHttpNew(data as any[]);
            setHttpNewTick((t) => t + 1);
            console.log(`[Pulse] Immediate poll got ${data.length} tokens`);
          }
        }
      } catch (error) {
        console.log('Immediate poll failed:', error);
      }
    };

    immediatePoll();
  }, []);

  // Immediate poll on mount for Migrated tokens (just like New Pairs)
  useEffect(() => {
    const immediatePoll = async () => {
      try {
        // Always use Next.js API proxy to avoid CORS issues
        const apiUrl = `/api/token-service/pulse-migrated?limit=30&t=${Date.now()}`;

        const res = await fetch(apiUrl, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setHttpMigrated(data as any[]);
            setHttpMigratedTick((t) => t + 1);
            console.log(`[Migrated] Immediate poll got ${data.length} tokens`);
            // Cache the data
            try {
              localStorage.setItem('cached_pulse_migrated', JSON.stringify({ data, timestamp: Date.now() }));
            } catch {}
          }
        }
      } catch (error) {
        console.log('[Migrated] Immediate poll failed:', error);
      }
    };
    
    immediatePoll();
  }, []);

  // HTTP polling for Migrated tokens - backup to WebSocket for instant updates
  // Polls every 2 seconds to catch any migration events (both WebSocket + polling = reliable)
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        // Always use Next.js API proxy to avoid CORS issues
        const apiUrl = `/api/token-service/pulse-migrated?limit=30&t=${Date.now()}`;

        const res = await fetch(apiUrl);
        if (!alive) return;
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            // Only replace when we have non-empty fresh data to avoid flicker
            if (data.length > 0) {
              setHttpMigrated(data as any[]);
              setHttpMigratedTick((t) => t + 1);
              // Cache to localStorage for next page load
              try {
                localStorage.setItem('cached_pulse_migrated', JSON.stringify({
                  data: data,
                  timestamp: Date.now()
                }));
              } catch {}
            }
          }
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 2000); // Poll every 2 seconds for instant migration detection
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Immediate poll on mount for Final Stretch tokens (just like New Pairs)
  useEffect(() => {
    const immediatePoll = async () => {
      try {
        // Always use Next.js API proxy to avoid CORS issues
        const apiUrl = `/api/token-service/pulse-final-stretch?limit=30&t=${Date.now()}`;

        const res = await fetch(apiUrl, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setHttpFinalStretch(data as any[]);
            setHttpFinalStretchTick((t) => t + 1);
            console.log(`[Final Stretch] Immediate poll got ${data.length} tokens`);
            // Cache the data
            try {
              localStorage.setItem('cached_pulse_final_stretch', JSON.stringify({ data, timestamp: Date.now() }));
            } catch {}
          }
        }
      } catch (error) {
        console.log('[Final Stretch] Immediate poll failed:', error);
      }
    };
    
    immediatePoll();
  }, []);

  // DISABLED: HTTP polling for Final Stretch - WebSocket handles all migration events
  // WebSocket broadcasts 'final_stretch_token' events when tokens cross 60% threshold
  // This eliminates 2-second polling overhead while maintaining instant updates
  // useEffect(() => {
  //   let alive = true;
  //   const poll = async () => {
  //     try {
  //       // Always use Next.js API proxy to avoid CORS issues
  //       const apiUrl = `/api/token-service/pulse-final-stretch?limit=30&t=${Date.now()}`;
  //
  //       const res = await fetch(apiUrl);
  //       if (!alive) return;
  //       if (res.ok) {
  //         const data = await res.json();
  //         if (Array.isArray(data)) {
  //           // Only replace when we have non-empty fresh data to avoid flicker
  //           if (data.length > 0) {
  //             setHttpFinalStretch(data as any[]);
  //             setHttpFinalStretchTick((t) => t + 1);
  //             // Cache to localStorage for next page load
  //             try {
  //               localStorage.setItem('cached_pulse_final_stretch', JSON.stringify({
  //                 data: data,
  //                 timestamp: Date.now()
  //               }));
  //             } catch {}
  //           }
  //         }
  //       }
  //     } catch {}
  //   };
  //   poll();
  //   const id = setInterval(poll, 2000); // Poll every 2 seconds for INSTANT migration detection from New Pairs to Final Stretch
  //   return () => { alive = false; clearInterval(id); };
  // }, []);

  // Convert launchpad tokens to Token format for PulseTable
  const convertLaunchpadToToken = useCallback((launchpadToken: LaunchpadToken): Token => ({
    id: 0,
    mint: launchpadToken.mint,
    standard: 'SPL',
    name: launchpadToken.name || 'Unknown',
    symbol: launchpadToken.symbol || 'UNK',
    logo: launchpadToken.image || '',
    decimals: 6,
    metaplex: null,
    fully_diluted_value: launchpadToken.marketCapUsd,
    total_supply: 0,
    total_supply_formatted: 0,
    links: null,
    description: '',
    is_verified_contract: false,
    possible_spam: false,
    total_buy_volume_5m: 0,
    total_buy_volume_1h: 0,
    total_buy_volume_6h: 0,
    total_buy_volume_24h: launchpadToken.volume24h,
    total_sell_volume_5m: 0,
    total_sell_volume_1h: 0,
    total_sell_volume_6h: 0,
    total_sell_volume_24h: 0,
    total_buyers_5m: 0,
    total_buyers_1h: 0,
    total_buyers_6h: 0,
    total_buyers_24h: 0,
    total_sellers_5m: 0,
    total_sellers_1h: 0,
    total_sellers_6h: 0,
    total_sellers_24h: 0,
    total_buys_5m: 0,
    total_buys_1h: 0,
    total_buys_6h: 0,
    total_buys_24h: 0,
    total_sells_5m: 0,
    total_sells_1h: 0,
    total_sells_6h: 0,
    total_sells_24h: 0,
    unique_wallets_5m: 0,
    unique_wallets_1h: 0,
    unique_wallets_6h: 0,
    unique_wallets_24h: 0,
    price_percent_change_5m: 0,
    price_percent_change_1h: 0,
    price_percent_change_6h: 0,
    price_percent_change_24h: launchpadToken.priceChange24h,
    sol_price: 0,
    usd_price: launchpadToken.priceUsd,
    total_liquidity_usd: launchpadToken.marketCapUsd,
    total_fully_diluted_valuation: launchpadToken.marketCapUsd,
    total_snipers: 0,
    pair_address: launchpadToken.mint,
    total_holders: 0,
    created_at: launchpadToken.createdAt,
    updated_at: launchpadToken.createdAt,
    bonding_curve_progress: launchpadToken.graduationPercent, // Already in percentage format
    uri: null,
    // extra field used by PulseTable TokenImage for DB logos
    image: launchpadToken.image,
  } as any), []);

  // Segregate regular tokens (stable refs)
  const newPairs = useMemo(() => tokens.filter(t => {
    const v = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : (t.bonding_curve_progress as number);
    const prog = isFinite(v as number) ? Number(v) : 0;
    return prog < 0.6;
  }), [tokens]);
  const finalStretch = useMemo(() => tokens.filter(t => {
    const v = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : (t.bonding_curve_progress as number);
    const prog = isFinite(v as number) ? Number(v) : 0;
    return prog >= 0.6 && prog < 0.85;
  }), [tokens]);
  const migrated = useMemo(() => tokens.filter(t => {
    const v = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : (t.bonding_curve_progress as number);
    const prog = isFinite(v as number) ? Number(v) : 0;
    return prog >= 0.85;
  }), [tokens]);

  // Convert and combine launchpad tokens (stable refs)
  const launchpadNewPairs = useMemo(() => 
    launchpadData?.new?.map(convertLaunchpadToToken) || [], 
    [launchpadData?.new, convertLaunchpadToToken]
  );
  const launchpadFinalStretch = useMemo(() => 
    launchpadData?.completing?.map(convertLaunchpadToToken) || [], 
    [launchpadData?.completing, convertLaunchpadToToken]
  );
  const launchpadMigrated = useMemo(() => 
    launchpadData?.completed?.map(convertLaunchpadToToken) || [], 
    [launchpadData?.completed, convertLaunchpadToToken]
  );
  


  // Combine regular tokens with launchpad tokens and HTTP tokens (stable refs)
  const combinedNewPairs = useMemo(() => [...newPairs, ...launchpadNewPairs], [newPairs, launchpadNewPairs]);
  // Use HTTP polling data for Final Stretch and Migrated columns
  const combinedFinalStretch = useMemo(() => [...finalStretch], [finalStretch]);
  const combinedMigrated = useMemo(() => [...migrated], [migrated]);

  // Memoize the loading state to prevent unnecessary re-renders
  const isLoading = useMemo(() => {
    return (tokensLoading && !tokens.length) || 
           (launchpadLoading && !launchpadData?.new?.length && !launchpadData?.completing?.length && !launchpadData?.completed?.length) ||
           (httpNewTick === 0 && httpNew.length === 0);
  }, [tokensLoading, tokens.length, launchpadLoading, launchpadData?.new?.length, launchpadData?.completing?.length, launchpadData?.completed?.length, httpNewTick, httpNew.length]);
  
  const hasError = useMemo(() => {
    return launchpadError && !(launchpadData?.new?.length || 0) && !(launchpadData?.completing?.length || 0) && !(launchpadData?.completed?.length || 0);
  }, [launchpadError, launchpadData?.new?.length, launchpadData?.completing?.length, launchpadData?.completed?.length]);

  // Enrich WS new pairs with created_at/image from known sources when available
  const wsNewRaw: any[] = Array.isArray(newPairsTokens) ? (newPairsTokens as any[]) : [];
  const wsNewEnriched = useMemo(() => {
    const byAddr = new Map<string, any>();
    const pushMap = (arr: any[]) => arr.forEach(t => { const a = (t as any)?.pair_address || (t as any)?.mint; if (a && !byAddr.has(a)) byAddr.set(a, t); });
    pushMap(tokens as any[]);
    pushMap(launchpadNewPairs as any[]);
    pushMap(launchpadFinalStretch as any[]);
    pushMap(launchpadMigrated as any[]);
    return wsNewRaw.map((t) => {
      const a = (t as any)?.pair_address || (t as any)?.mint;
      const src = a ? byAddr.get(a) : undefined;
      return {
        ...t,
        // Prefer existing created fields on WS object, else borrow from source maps
        created_at: (t as any).created_at || (t as any).createdAt || src?.created_at || src?.createdAt || (t as any).timestamp || undefined,
        launch_time: (t as any).launch_time || (t as any).launchTime || src?.launch_time || src?.launchTime || undefined,
        image: (t as any).image || (t as any).logo || src?.image || src?.logo || undefined,
        logo: (t as any).logo || src?.logo || undefined,
      };
    });
  }, [wsNewRaw, tokens, launchpadNewPairs, launchpadFinalStretch, launchpadMigrated]);

  // Build New Pairs dataset with recency sort and de-dup
  const getTs = (t: any): number => {
    // For migrated tokens, prioritize migrated_time over launch_time
    let v: any = (
      t?.migrated_time ?? t?.migratedTime ??
      t?.launch_time ?? t?.launchTime ??
      t?.created_at ?? t?.createdAt ??
      t?.firstSeen ?? t?.first_seen ??
      t?.pair_created_at ?? t?.pairCreatedAt ??
      t?.timestamp ?? t?.ts ?? null
    );
    // Handle nested objects like { Time: "..." } or { seconds: 1234567890 }
    if (v && typeof v === 'object') {
      if ('Time' in v && typeof v.Time === 'string') v = v.Time;
      else if ('time' in v && typeof (v as any).time === 'string') v = (v as any).time;
      else if ('seconds' in v && typeof (v as any).seconds === 'number') {
        const sec = Number((v as any).seconds);
        return sec > 1e12 ? sec : sec > 1e9 ? sec * 1000 : 0;
      } else if ('millis' in v && typeof (v as any).millis === 'number') {
        const ms = Number((v as any).millis);
        return ms > 0 ? ms : 0;
      }
    }
    if (!v) return 0;
    if (typeof v === 'number') return v > 1e12 ? v : v > 1e9 ? v * 1000 : 0;
    if (typeof v === 'string') {
      const n = Number(v);
      if (!Number.isNaN(n) && n > 0) return n > 1e12 ? n : n > 1e9 ? n * 1000 : 0;
      const d = Date.parse(v);
      return Number.isNaN(d) ? 0 : d;
    }
    if (v instanceof Date) return v.getTime();
    return 0;
  };

  const buildNewPairs = (): any[] => {
    // Use httpNew directly - show all tokens immediately
    const source = httpNew.length ? httpNew : (wsNewEnriched.length ? wsNewEnriched : combinedNewPairs);
    if (typeof window !== 'undefined') {
      try {
        const srcName = httpNew.length ? 'http' : (wsNewEnriched.length ? 'ws' : 'combined');
        console.log(`[Pulse] new-pairs source=${srcName} sizes http=${httpNew.length} ws=${wsNewEnriched.length} combined=${combinedNewPairs.length}`);
        if (httpNew.length > 0) {
          console.log(`[Pulse] httpNew sample:`, httpNew.slice(0, 3).map(t => ({
            name: t.name,
            symbol: t.symbol,
            bonding_curve_progress: t.bonding_curve_progress,
            bonding_pct: t.bonding_pct
          })));
        }
      } catch {}
    }
    const uniq = new Map<string, any>();
    for (const t of source as any[]) {
      const key = (t?.pair_address || t?.mint) as string | undefined;
      if (!key) continue;
      if (!uniq.has(key)) uniq.set(key, t);
    }
    const vals = Array.from(uniq.values());
    const withTs: any[] = [];
    const withoutTs: any[] = [];
    for (const t of vals) {
      const ts = getTs(t);
      if (ts > 0) withTs.push(t); else withoutTs.push(t);
    }
    // Sort by timestamp in descending order (newest first)
    // Higher timestamp = more recent = should appear first
    withTs.sort((a, b) => {
      const tsA = getTs(a);
      const tsB = getTs(b);
      const diff = tsB - tsA; // Newest first (descending order)
      
      // Debug logging for sorting when timestamps are close
      if (typeof window !== 'undefined' && Math.abs(diff) < 60000) { // Log when within 1 minute
        console.log(`[Pulse] Sorting comparison:`, {
          tokenA: { name: a.name, symbol: a.symbol, ts: tsA, created_at: a.created_at || a.launch_time },
          tokenB: { name: b.name, symbol: b.symbol, ts: tsB, created_at: b.created_at || b.launch_time },
          diff: diff,
          result: diff > 0 ? 'B first (newer)' : 'A first (newer)'
        });
      }
      
      return diff;
    });
    // For those without a timestamp, try a secondary order by FDV desc then name
    withoutTs.sort((a, b) => {
      const fdvA = Number((a as any).fully_diluted_value) || 0;
      const fdvB = Number((b as any).fully_diluted_value) || 0;
      if (fdvB !== fdvA) return fdvB - fdvA;
      return String((a as any).symbol || (a as any).name || '').localeCompare(String((b as any).symbol || (b as any).name || ''));
    });
    // Always show timestamped first, then non-timestamped afterwards
    const result = withTs.concat(withoutTs);
    // Final guard: never return empty if we have combinedNewPairs available
    return result.length > 0 ? result : combinedNewPairs;
  };

  const buildMigrated = (): any[] => {
    // Use ONLY HTTP pulse-migrated (authoritative by migrated_time) - no fallback to prevent stale data
    const source = httpMigrated;
    if (typeof window !== 'undefined') {
      try {
        console.log(`[Pulse] migrated source=http sizes http=${httpMigrated.length}`);
        if (httpMigrated.length > 0) {
          console.log(`[Pulse] httpMigrated sample:`, httpMigrated.slice(0, 3).map(t => ({ 
            symbol: t.symbol, 
            migrated_time: t.migrated_time,
            launch_time: t.launch_time,
            migrated_pool_address: t.migrated_pool_address
          })));
        }
      } catch {}
    }
    
    // No deduplication needed - backend returns clean data
    if (!Array.isArray(source) || source.length === 0) {
      return [];
    }

    // Use all tokens - migrated_pool_address is optional and may not always be set at migration time
    const filteredSource = source;

    if (typeof window !== 'undefined') {
      try {
        console.log(`[Pulse] Migrated tokens: ${filteredSource.length} tokens ready for display`);
      } catch {}
    }

    const withTs: any[] = [];
    const withoutTs: any[] = [];
    for (const t of filteredSource) {
      const ts = getTs(t);
      if (ts > 0) withTs.push(t); else withoutTs.push(t);
    }
    // Sort by timestamp in descending order (newest first - by migrated_time)
    withTs.sort((a, b) => {
      const tsA = getTs(a);
      const tsB = getTs(b);
      const diff = tsB - tsA; // Newest first (descending order)
      
      // Debug logging
      if (typeof window !== 'undefined' && Math.abs(diff) < 300000) { // Log when within 5 minutes
        console.log(`[Pulse Migrated] Sorting comparison:`, {
          tokenA: { symbol: a.symbol, ts: tsA, migrated_time: a.migrated_time },
          tokenB: { symbol: b.symbol, ts: tsB, migrated_time: b.migrated_time },
          diff: diff,
          result: diff > 0 ? 'B first (newer)' : 'A first (newer)'
        });
      }
      
      return diff;
    });
    withoutTs.sort((a, b) => {
      const fdvA = Number((a as any).fully_diluted_value) || 0;
      const fdvB = Number((b as any).fully_diluted_value) || 0;
      if (fdvB !== fdvA) return fdvB - fdvA;
      return String((a as any).symbol || (a as any).name || '').localeCompare(String((b as any).symbol || (b as any).name || ''));
    });
    const result = withTs.concat(withoutTs);
    return result;
  };

  const buildFinalStretch = (): any[] => {
    // Use ONLY HTTP pulse-final-stretch - no fallback to prevent stale data
    const source = httpFinalStretch;
    if (typeof window !== 'undefined') {
      try {
        console.log(`[Pulse] final-stretch source=http sizes http=${httpFinalStretch.length}`);
      } catch {}
    }
    
    // No deduplication needed - backend returns clean data
    if (!Array.isArray(source) || source.length === 0) {
      return [];
    }
    
    const withTs: any[] = [];
    const withoutTs: any[] = [];
    for (const t of source) {
      const ts = getTs(t);
      if (ts > 0) withTs.push(t); else withoutTs.push(t);
    }
    // Sort by timestamp in descending order (newest first)
    withTs.sort((a, b) => getTs(b) - getTs(a));
    withoutTs.sort((a, b) => {
      const fdvA = Number((a as any).fully_diluted_value) || 0;
      const fdvB = Number((b as any).fully_diluted_value) || 0;
      if (fdvB !== fdvA) return fdvB - fdvA;
      return String((a as any).symbol || (a as any).name || '').localeCompare(String((b as any).symbol || (b as any).name || ''));
    });
    const result = withTs.concat(withoutTs);
    return result;
  };

  const newPairsData = useMemo(() => buildNewPairs(), [httpNewTick, httpNew, wsNewEnriched, combinedNewPairs]);
  const migratedData = useMemo(() => buildMigrated(), [httpMigratedTick, httpMigrated]);
  const finalStretchData = useMemo(() => buildFinalStretch(), [httpFinalStretchTick, httpFinalStretch]);
  
  // DISABLED: Image search - images should only come from JSON response
  // const priorityImageSearcher = useRef(new PriorityImageSearcher());
  const { preloadImages } = useImagePreloader();
  
  useEffect(() => {
    if (newPairsData && newPairsData.length > 0) {
      console.log(`✅ Using only backend-provided images for ${newPairsData.length} tokens - no external searches`);

      // Preload images for new pairs tokens (priority loading)
      const imageSources = newPairsData
        .slice(0, 20) // Preload first 20 tokens
        .map((token: any) => token.uri || token.image || token.logo)
        .filter(Boolean);

      if (imageSources.length > 0) {
        console.log(`🖼️ Preloading ${imageSources.length} new pairs images from backend`);
        preloadImages(imageSources, { priority: true, timeout: 2000 });
      }
    }
  }, [newPairsData, preloadImages]);

  // Keep last non-empty lists to prevent flicker when WS/HTTP blips (guard against needless updates)
  const [lastNonEmptyNewPairs, setLastNonEmptyNewPairs] = useState<any[]>([]);
  const [lastNonEmptyMigrated, setLastNonEmptyMigrated] = useState<any[]>([]);
  const [lastNonEmptyFinalStretch, setLastNonEmptyFinalStretch] = useState<any[]>([]);
  const hasSeededRef = useRef(false);
  useEffect(() => {
    const sameList = (a: any[], b: any[]) => {
      if (a === b) return true;
      if (!a || !b) return false;
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        const ka = (a[i]?.pair_address || a[i]?.mint) as string | undefined;
        const kb = (b[i]?.pair_address || b[i]?.mint) as string | undefined;
        if (ka !== kb) return false;
      }
      return true;
    };

    if (newPairsData && newPairsData.length > 0) {
      setLastNonEmptyNewPairs((prev) => (sameList(prev, newPairsData) ? prev : newPairsData));
    } else if (!hasSeededRef.current && combinedNewPairs.length > 0) {
      // Seed with combined list once if nothing else is available
      setLastNonEmptyNewPairs((prev) => (sameList(prev, combinedNewPairs) ? prev : combinedNewPairs));
      hasSeededRef.current = true;
    }
  }, [newPairsData, combinedNewPairs]);

  useEffect(() => {
    const sameList = (a: any[], b: any[]) => {
      if (a === b) return true;
      if (!a || !b) return false;
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        const ka = (a[i]?.pair_address || a[i]?.mint) as string | undefined;
        const kb = (b[i]?.pair_address || b[i]?.mint) as string | undefined;
        if (ka !== kb) return false;
      }
      return true;
    };

    if (migratedData && migratedData.length > 0) {
      setLastNonEmptyMigrated((prev) => (sameList(prev, migratedData) ? prev : migratedData));
    }
  }, [migratedData]);

  useEffect(() => {
    const sameList = (a: any[], b: any[]) => {
      if (a === b) return true;
      if (!a || !b) return false;
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        const ka = (a[i]?.pair_address || a[i]?.mint) as string | undefined;
        const kb = (b[i]?.pair_address || b[i]?.mint) as string | undefined;
        if (ka !== kb) return false;
      }
      return true;
    };

    if (finalStretchData && finalStretchData.length > 0) {
      setLastNonEmptyFinalStretch((prev) => (sameList(prev, finalStretchData) ? prev : finalStretchData));
    }
  }, [finalStretchData]);

  const newPairsToShow = lastNonEmptyNewPairs.length > 0 ? lastNonEmptyNewPairs : newPairsData;
  const migratedToShow = lastNonEmptyMigrated.length > 0 ? lastNonEmptyMigrated : migratedData;
  const finalStretchToShow = lastNonEmptyFinalStretch.length > 0 ? lastNonEmptyFinalStretch : finalStretchData;
  // Debug: log top entries order and timestamps (after data is computed)
  if (typeof window !== 'undefined') {
    try {
      const sample = (newPairsData || []).slice(0, 10).map((t: any) => ({
        addr: t.pair_address || t.mint,
        ts: getTs(t),
        created_at: t.created_at || t.createdAt || t.launch_time || t.launchTime,
        firstSeen: t.firstSeen,
        updated_at: t.updated_at || t.updatedAt,
        name: t.name,
        symbol: t.symbol,
      }));
      console.log('[Pulse] NewPairs top10 with timestamps:', sample);
    } catch {}
  }
  const newPairsFallback = newPairsData;
  // Show loading until at least one source has tried and no data yet
  const newPairsLoading = (httpNewTick === 0 && wsLoading && newPairsData.length === 0);

  // Build a unified list of addresses to fetch realtime market data for (cap 200)
  const realtimeAddrs = useMemo(() => {
    const src: any[] = [
      ...(newPairsToShow as any[] || []),
      ...(finalStretchToShow as any[] || []),
      ...(migratedToShow as any[] || []),
    ];
    const uniq = new Set<string>();
    for (const t of src) {
      const mint = (t as any)?.mint;
      const pair = (t as any)?.pair_address;
      if (mint && typeof mint === 'string') uniq.add(mint);
      if (pair && typeof pair === 'string') uniq.add(pair);
      if (uniq.size >= 200) break;
    }
    return Array.from(uniq);
  }, [newPairsToShow, finalStretchToShow, migratedToShow]);

  const { marketData, connected: wsConnected, error: wsError } = useRealtimeWebSocket(realtimeAddrs, {
    url: `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws')}/v1/ws/market-data`,
    reconnectInterval: 1000, // Faster reconnection for better real-time updates
    maxReconnectAttempts: 20 // More attempts for better reliability
  });

  // Additional polling for more frequent updates
  useEffect(() => {
    if (realtimeAddrs.length === 0) return;

    const pollMarketData = async () => {
      try {
        // Use deployed service directly when backend is deployed
        const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL.endsWith('/') 
          ? env.NEXT_PUBLIC_GO_SERVICE_URL.slice(0, -1) 
          : env.NEXT_PUBLIC_GO_SERVICE_URL;
        const apiUrl = env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED
          ? `${baseUrl}/v1/market-data`
          : '/api/token-service/realtime-market-data';

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mints: realtimeAddrs.slice(0, 200) })
        });

        if (response.ok) {
          const data = await response.json();
          // This will trigger the enrichWithMarketData to update
          // The data will be picked up by the existing marketData state
        }
      } catch (error) {
        console.log('Polling market data failed:', error);
      }
    };

    // Poll every 3 seconds for additional updates (faster frequency for real-time)
    const interval = setInterval(pollMarketData, 3000);
    return () => clearInterval(interval);
  }, [realtimeAddrs]);

  const enrichWithMarketData = useCallback((arr: any[]): any[] => {
    if (!arr || arr.length === 0) return arr;
    
    return arr.map((t: any) => {
      const mintKey = t?.mint as string | undefined;
      const pairKey = t?.pair_address as string | undefined;
      const md = (mintKey && marketData[mintKey]) || (pairKey && marketData[pairKey]);
      
      if (!md) return t;
      
      // Only create new object if market data has actually changed
      const hasChanges = 
        t.price_usd !== md.price_usd ||
        t.usd_price !== md.price_usd ||
        t.market_cap_usd !== md.market_cap_usd ||
        t.fully_diluted_value !== md.market_cap_usd ||
        t.volume_24h !== (md as any).volume_usd;
        
      if (!hasChanges) return t;
      
      const patched: any = { ...t };
      // Always prefer realtime market data regardless of DB values
      patched.price_usd = md.price_usd;
      patched.usd_price = md.price_usd;
      patched.market_cap_usd = md.market_cap_usd;
      patched.fully_diluted_value = md.market_cap_usd;
      patched.total_fully_diluted_valuation = md.market_cap_usd;
      if ((md as any).volume_usd !== undefined) {
        patched.volume_24h = (md as any).volume_usd;
      }
      return patched;
    });
  }, [marketData]);

  const enrichedNewPairsToShow = useMemo(() => enrichWithMarketData(newPairsToShow as any), [enrichWithMarketData, newPairsToShow]);
  const enrichedFinalStretch = useMemo(() => enrichWithMarketData(finalStretchToShow as any), [enrichWithMarketData, finalStretchToShow]);
  const enrichedMigrated = useMemo(() => enrichWithMarketData(migratedToShow as any), [enrichWithMarketData, migratedToShow]);

  if (typeof window !== 'undefined') {
    try {
      // Lightweight dev diagnostics
      if ((window as any).__DEBUG_PULSE__){
        console.log(`[Pulse] poll addrs=${realtimeAddrs.length} marketKeys=${Object.keys(marketData||{}).length}`);
      }
    } catch {}
  }

  return (
    <>
      <Head>
        <title>Pulse | Interstate Memeboard</title>
        <meta name="description" content="Token tracking dashboard" />
      </Head>
      <div className="min-h-screen text-neutral-100" style={{ backgroundColor: '#0f1012' }}>
        <Header />
        <div className="w-full px-5 pt-2 pb-6">
          <div className="mb-2">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">Pulse</h1>
              {/* <PulseControlBar className="mb-0.5" /> */}
            </div>
            
            {/* Tab Navigation - Mobile Only */}
            <div className="mt-4 mb-6 lg:hidden">
              <div className="flex space-x-1 bg-neutral-800/30 backdrop-blur-sm p-1.5 rounded-xl border border-neutral-700/50 shadow-lg">
                <button
                  onClick={() => setActiveTab('new')}
                  className={`flex-1 px-3 py-2.5 text-xs lg:text-sm font-semibold rounded-lg transition-all duration-300 ease-out cursor-pointer ${
                    activeTab === 'new'
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/25 transform scale-[1.02]'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-700/40 hover:transform hover:scale-[1.01]'
                  }`}
                  title="New Pairs (Mobile: Ctrl+1)"
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-current opacity-60"></span>
                    <span>New Pairs</span>
                    <span className="ml-1 text-xs opacity-75">({enrichedNewPairsToShow.length})</span>
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('final-stretch')}
                  className={`flex-1 px-3 py-2.5 text-xs lg:text-sm font-semibold rounded-lg transition-all duration-300 ease-out cursor-pointer ${
                    activeTab === 'final-stretch'
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/25 transform scale-[1.02]'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-700/40 hover:transform hover:scale-[1.01]'
                  }`}
                  title="Final Stretch (Mobile: Ctrl+2)"
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-current opacity-60"></span>
                    <span>Final Stretch</span>
                    <span className="ml-1 text-xs opacity-75">({enrichedFinalStretch.length})</span>
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('migrated')}
                  className={`flex-1 px-3 py-2.5 text-xs lg:text-sm font-semibold rounded-lg transition-all duration-300 ease-out cursor-pointer ${
                    activeTab === 'migrated'
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/25 transform scale-[1.02]'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-700/40 hover:transform hover:scale-[1.01]'
                  }`}
                  title="Migrated (Mobile: Ctrl+3)"
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-current opacity-60"></span>
                    <span>Migrated</span>
                    <span className="ml-1 text-xs opacity-75">({enrichedMigrated.length})</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="w-full">
              {/* Mobile: Single table based on active tab */}
              <div className="lg:hidden">
                <PulseTable 
                  title={activeTab === 'new' ? "New Pairs" : activeTab === 'final-stretch' ? "Final Stretch" : "Migrated"} 
                  tokens={[]} 
                  loading 
                  skeletonRowCount={10} 
                  isFirstOrLast="only" 
                  showBubbleMetrics={false} 
                />
              </div>
              {/* Desktop: All tables horizontally */}
              <div className="hidden lg:flex flex-row w-full overflow-x-auto scrollbar-thin scrollbar-track-neutral-900/50 scrollbar-thumb-neutral-700/50">
                <PulseTable title="New Pairs" tokens={[]} loading skeletonRowCount={10} isFirstOrLast="first" showBubbleMetrics={false} />
                <PulseTable title="Final Stretch" tokens={[]} loading skeletonRowCount={10} showBubbleMetrics={false} />
                <PulseTable title="Migrated" tokens={[]} loading skeletonRowCount={10} isFirstOrLast="last" showBubbleMetrics={false} />
              </div>
            </div>
          ) : hasError ? (
            <div className="text-center text-red-400 py-10">
              <div className="text-xl font-semibold mb-2">Error Loading Launchpad Data</div>
              <div>{launchpadError}</div>
              <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors">Retry</button>
            </div>
          ) : (
            <div className="w-full">
              {/* Mobile: Single table based on active tab */}
              <div className="lg:hidden">
                <div className="transition-all duration-300 ease-in-out">
                  {activeTab === 'new' && (
                    <PulseTable 
                      title="New Pairs" 
                      tokens={enrichedNewPairsToShow as any} 
                      loading={newPairsLoading} 
                      isFirstOrLast="only" 
                      showBubbleMetrics={false} 
                    />
                  )}
                  {activeTab === 'final-stretch' && (
                    <PulseTable 
                      title="Final Stretch" 
                      tokens={enrichedFinalStretch as any} 
                      isFirstOrLast="only" 
                      showBubbleMetrics={false} 
                    />
                  )}
                  {activeTab === 'migrated' && (
                    <PulseTable 
                      title="Migrated" 
                      tokens={enrichedMigrated as any} 
                      isFirstOrLast="only" 
                      showBubbleMetrics={false} 
                    />
                  )}
                </div>
              </div>
              {/* Desktop: All tables horizontally */}
              <div className="hidden lg:flex flex-row w-full overflow-x-auto scrollbar-thin scrollbar-track-neutral-900/50 scrollbar-thumb-neutral-700/50">
                <PulseTable title="New Pairs" tokens={enrichedNewPairsToShow as any} loading={newPairsLoading} isFirstOrLast="first" showBubbleMetrics={false} />
                <PulseTable title="Final Stretch" tokens={enrichedFinalStretch as any} showBubbleMetrics={false} />
                <PulseTable title="Migrated" tokens={enrichedMigrated as any} isFirstOrLast="last" showBubbleMetrics={false} />
              </div>
            </div>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}


