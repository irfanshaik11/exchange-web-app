import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import PulseTable from '../components/PulseTable';
import BnbTable from '../components/BnbTable';
import PulseControlBar from '../components/PulseControlBar';
import type { Token } from '~/utils/db';
import Header from '../components/Header';
import Footer from '../components/Footer';
import usePaginatedTokensWebSocket from '../hooks/usePaginatedTokensWebSocket';
import { useRealtimeWebSocket } from '../hooks/useRealtimeWebSocket';
import { usePulseWebSocket } from '../hooks/usePulseWebSocket';
// import { PriorityImageSearcher } from '../utils/imageSearch'; // DISABLED - no external image searches
import { useImagePreloader } from '../hooks/useImagePreloader';
import { useQueryNewPairs, useQueryLaunchpadData, useQueryFinalStretch, useQueryMigrated } from '../hooks/useQueryTokens';
import { env } from '~/env';
import { rollingTradeCache } from '../utils/rollingTradeCache';
import { SiBinance, SiSolana } from 'react-icons/si';
import { FaDiscord } from 'react-icons/fa';

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
  const router = useRouter();
  const chain = router.query.chain as string | undefined;
  const isBnbRoute = chain === 'bnb';
  const isMonadRoute = chain === 'monad';
  const isBaseRoute = chain === 'base';
  const isEthereumRoute = chain === 'eth';
  const isSolanaRoute = chain === 'sol' || !chain; // Default to Solana if no chain specified
  const chainButtonBase =
    'relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#20232b] bg-[#171920] text-neutral-300 shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070b]';
  const solanaButtonClasses = `${chainButtonBase} ${
    isSolanaRoute
      ? 'bg-[#222733] text-white shadow-lg shadow-emerald-500/20'
      : 'bg-[#141821] text-neutral-500 opacity-75 hover:opacity-100 hover:text-neutral-100'
  }`;
  const bnbButtonClasses = `${chainButtonBase} ${
    isBnbRoute
      ? 'bg-[#222733] text-white shadow-lg shadow-blue-500/20'
      : 'bg-[#141821] text-neutral-500 opacity-75 hover:opacity-100 hover:text-neutral-100'
  }`;
  const monadButtonClasses = `${chainButtonBase} ${
    isMonadRoute
      ? 'bg-[#222733] text-white shadow-lg shadow-purple-500/20'
      : 'bg-[#141821] text-neutral-500 opacity-75 hover:opacity-100 hover:text-neutral-100'
  }`;
  const baseButtonClasses = `${chainButtonBase} ${
    isBaseRoute
      ? 'bg-[#222733] text-white shadow-lg shadow-blue-400/20'
      : 'bg-[#141821] text-neutral-500 opacity-75 hover:opacity-100 hover:text-neutral-100'
  }`;
  const ethButtonClasses = `${chainButtonBase} ${
    isEthereumRoute
      ? 'bg-[#222733] text-white shadow-lg shadow-emerald-400/20'
      : 'bg-[#141821] text-neutral-500 opacity-75 hover:opacity-100 hover:text-neutral-100'
  }`;

  // Redirect to /pulse?chain=sol if no chain parameter is present
  useEffect(() => {
    if (router.isReady && !chain) {
      router.replace('/pulse?chain=sol', undefined, { shallow: true });
    }
  }, [router.isReady, chain, router]);

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
  
  // React Query hooks - instant cache
  const { 
    data: tokens = [], 
    isLoading: tokensLoading, 
    error: tokensError, 
    isStale: tokensStale,
    refetch: refreshTokens,
    dataUpdatedAt,
    isFetching
  } = useQueryNewPairs();
  
  const { 
    data: launchpadData = { new: [], completing: [], completed: [] }, 
    isLoading: launchpadLoading, 
    error: launchpadError, 
    isStale: launchpadStale,
    refetch: refreshLaunchpadData 
  } = useQueryLaunchpadData();
  
  const { 
    data: finalStretchTokensQuery = [], 
  } = useQueryFinalStretch();
  
  const { 
    data: migratedTokensQuery = [], 
  } = useQueryMigrated();

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

  // State for HTTP polling data - no localStorage caching for fresh data always
  const [httpNew, setHttpNew] = useState<any[]>([]);
  const [httpNewTick, setHttpNewTick] = useState(0);
  const [httpMigrated, setHttpMigrated] = useState<any[]>([]);
  const [httpMigratedTick, setHttpMigratedTick] = useState(0);
  const isZeroLiquidityToken = useCallback((token: any) => {
    if (!token) return false;

    const rawValue = token.liquidity_usd ?? token.total_liquidity_usd;
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return false;
    }

    const liquidity = Number(rawValue);
    if (Number.isNaN(liquidity)) {
      return false;
    }

    return liquidity === 0;
  }, []);

  const [httpFinalStretch, setHttpFinalStretch] = useState<any[]>([]);

  const [httpFinalStretchTick, setHttpFinalStretchTick] = useState(0);

  // Function to fetch token image from backend
  const fetchTokenImage = useCallback(async (mint: string, name: string, symbol: string) => {
    try {
      console.log(`[Pulse] 🖼️ Fetching image for ${name} (${symbol})`);
      
      // Try to get image from backend API
      const response = await fetch(`/api/token-service/getTokenImage?mint=${mint}&name=${encodeURIComponent(name)}&symbol=${encodeURIComponent(symbol)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.image) {
          console.log(`[Pulse] 🖼️ Found image for ${name}:`, data.image);
          // Update the token in httpNew with the new image
          setHttpNew(prev => prev.map(token => 
            token.mint === mint 
              ? { ...token, logo: data.image, image: data.image, uri: data.uri }
              : token
          ));
        }
      }
    } catch (error) {
      console.log(`[Pulse] 🖼️ Failed to fetch image for ${name}:`, error);
    }
  }, []);

  // DISABLED: WebSocket hook for real-time token updates (token service doesn't have WebSocket endpoint)
  // const { data: newPairsTokens, loading: wsLoading } = usePaginatedTokensWebSocket({ filter: 'new', limit: 30 });
  // Use HTTP API instead
  const newPairsTokens: any[] = [];
  const wsLoading = false;

  // REMOVED: Centralized WebSocket logic
  // Each PulseTable now manages its own WebSocket connection with server-side protocol filtering
  // This eliminates client-side filtering and reduces bandwidth usage
  const wsNewTokens: any[] = [];
  const wsFinalStretchTokens: any[] = [];
  const wsMigratedTokens: any[] = [];
  const wsPulseConnected = false;
  const wsPulseError = null;

  // OLD CODE (removed - each PulseTable has its own WebSocket connection now)
  /*
  const {
    newTokens: wsNewTokens,
    finalStretchTokens: wsFinalStretchTokens,
    migratedTokens: wsMigratedTokens,
    connected: wsPulseConnected,
    error: wsPulseError
  } = usePulseWebSocket({
    enabled: true, // Enable WebSocket for real-time token updates
    onNewToken: (token: any) => {
      console.log(`[Pulse] 🔔 WebSocket NEW token received:`, {
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        status: token.status,
        fullToken: token
      });

      // CRITICAL: Ensure pair_address is set (use mint as fallback)
      const normalizedToken = {
        ...token,
        pair_address: token.pair_address || token.mint,
        // Add current timestamp to ensure new tokens appear at top
        created_at: new Date().toISOString(),
        timestamp: Date.now(),
        // Add image fields for proper display
        logo: token.logo || token.image || null,
        uri: token.uri || null,
        image: token.image || token.logo || null
      };

      setHttpNew(prev => {
        console.log(`[Pulse] Current httpNew count: ${prev.length}`);
        const existingMints = new Set(prev.map(t => t.mint));
        if (!existingMints.has(normalizedToken.mint)) {
          console.log(`[Pulse] ⚡ INSTANT new token ADDED to httpNew:`, normalizedToken.mint, normalizedToken.name);
          const merged = [normalizedToken, ...prev];
          console.log(`[Pulse] Updated httpNew count: ${merged.length}`);
          
          // Fetch image for token if not present
          if (!normalizedToken.logo && !normalizedToken.image && !normalizedToken.uri) {
            console.log(`[Pulse] 🖼️ Fetching image for token:`, normalizedToken.name);
            fetchTokenImage(normalizedToken.mint, normalizedToken.name, normalizedToken.symbol);
          } else {
            console.log(`[Pulse] 🖼️ Token already has image:`, normalizedToken.name, normalizedToken.logo || normalizedToken.image);
            // Preload the existing image
            if (normalizedToken.logo || normalizedToken.image) {
              const imageUrl = normalizedToken.logo || normalizedToken.image;
              if (imageUrl && typeof imageUrl === 'string') {
                console.log(`[Pulse] 🖼️ Preloading existing image:`, imageUrl);
                // Preload the image for better performance
                const img = new Image();
                img.src = imageUrl;
              }
            }
          }

          return merged;
        } else {
          console.log(`[Pulse] ⚠️ Token already exists in httpNew, skipping:`, normalizedToken.mint);
        }
        return prev;
      });
      setHttpNewTick((t) => {
        console.log(`[Pulse] Incrementing httpNewTick: ${t} → ${t + 1}`);
        return t + 1;
      });
    },
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
          return merged;
        }
        return prev;
      });
      setHttpFinalStretchTick((t) => t + 1);
    }, []),
    onMigratedToken: (token: any) => {
      console.log(`[Pulse] 🔄 Migrated token transition: adding to top of Migrated section`);
      console.log(`[Pulse] 🔄 Received migrated token:`, token);
      console.log(`[Pulse] 🔄 Token status:`, token.status);
      console.log(`[Pulse] 🔄 Token bonding_pct:`, token.bonding_pct);
      console.log(`[Pulse] 🔄 CALLBACK CALLED - onMigratedToken is working!`);
      console.log(`[Pulse] 🔄 BEFORE onMigratedToken - current httpMigrated count: ${httpMigrated.length}`);

      if (isZeroLiquidityToken(token)) {
        console.log(`[Pulse] ⛔ Skipping migrated token from websocket due to zero liquidity:`, token?.name, token?.mint);
        return;
      }

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

      // CRITICAL: Normalize token - ensure pair_address is set and add current timestamp
      const normalizedToken = {
        ...token,
        pair_address: token.pair_address || token.migrated_pool_address,
        // Add current timestamp to ensure migrated tokens appear at top
        created_at: new Date().toISOString(),
        timestamp: Date.now(),
        // Add image fields for proper display
        logo: token.logo || token.image || null,
        uri: token.uri || null,
        image: token.image || token.logo || null
      };

      // Add to MIGRATED column at the TOP
      setHttpMigrated(prev => {
        console.log(`[Pulse] ⚡ INSTANT migrated token ADDED to httpMigrated:`, normalizedToken.mint, normalizedToken.name);
        console.log(`[Pulse] ⚡ Current httpMigrated count: ${prev.length}`);
        console.log(`[Pulse] ⚡ Current httpMigrated tokens:`, prev.map(t => ({ mint: t.mint, name: t.name, status: t.status })));
        const existingMints = new Set(prev.map(t => t.mint));
        if (!existingMints.has(normalizedToken.mint)) {
          const merged = [normalizedToken, ...prev];
          console.log(`[Pulse] Updated httpMigrated count: ${merged.length}`);
          console.log(`[Pulse] ⚡ Added token to httpMigrated:`, normalizedToken.name, normalizedToken.symbol);
          console.log(`[Pulse] ⚡ New httpMigrated tokens:`, merged.map(t => ({ mint: t.mint, name: t.name, status: t.status })));
          
          // Fetch image for token if not present
          if (!normalizedToken.logo && !normalizedToken.image && !normalizedToken.uri) {
            console.log(`[Pulse] 🖼️ Fetching image for migrated token:`, normalizedToken.name);
            fetchTokenImage(normalizedToken.mint, normalizedToken.name, normalizedToken.symbol);
          } else {
            console.log(`[Pulse] 🖼️ Migrated token already has image:`, normalizedToken.name, normalizedToken.logo || normalizedToken.image);
            // Preload the existing image
            if (normalizedToken.logo || normalizedToken.image) {
              const imageUrl = normalizedToken.logo || normalizedToken.image;
              if (imageUrl && typeof imageUrl === 'string') {
                console.log(`[Pulse] 🖼️ Preloading existing image:`, imageUrl);
                // Preload the image for better performance
                const img = new Image();
                img.src = imageUrl;
              }
            }
          }
          
          try {
            localStorage.setItem('cached_pulse_migrated', JSON.stringify({
              data: merged,
              timestamp: Date.now()
            }));
          } catch (e) {
            console.error("[Pulse] Failed to save to local storage", e);
          }
          return merged;
        } else {
          console.log(`[Pulse] ⚠️ Token already exists in httpMigrated, skipping:`, normalizedToken.mint);
        }
        return prev;
      });
      setHttpMigratedTick((t) => {
        console.log(`[Pulse] Incrementing httpMigratedTick: ${t} → ${t + 1}`);
        return t + 1;
      });
    },
  });
  */

  // REMOVED: Slow useEffect-based merge - now using instant callbacks above

  // REMOVED: Slow useEffect-based merge - now using instant callbacks above

  // REMOVED: Slow useEffect-based merge - now using instant callbacks above
  // REMOVED: Duplicate HTTP poll for MIGRATED tokens
  // REMOVED: Redundant state copying - build functions use React Query data directly

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
    return !tokens.length && !launchpadData?.new?.length && !httpNew.length;
  }, [tokens.length, launchpadData?.new?.length, httpNew.length]);
  
  const newPairsLoading = isLoading;
  
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
    // Prefer real-time WS data first, then fall back to combined data (includes launchpad)
    const source = wsNewEnriched.length
      ? wsNewEnriched
      : combinedNewPairs;
    
    const uniq = new Map<string, any>();
    for (const t of source as any[]) {
      const key = (t?.pair_address || t?.mint) as string | undefined;
      if (!key || uniq.has(key)) continue;
      uniq.set(key, t);
    }
    const vals = Array.from(uniq.values()).filter((token) => !isZeroLiquidityToken(token));
    if (vals.length === 0) return combinedNewPairs.filter((token) => !isZeroLiquidityToken(token));
    
    // Cache timestamps to avoid repeated Date parsing
    const tsCache = new Map<any, number>();
    const getOrCacheTs = (t: any) => {
      if (!tsCache.has(t)) tsCache.set(t, getTs(t));
      return tsCache.get(t)!;
    };
    
    const withTs: any[] = [];
    const withoutTs: any[] = [];
    for (const t of vals) {
      (getOrCacheTs(t) > 0 ? withTs : withoutTs).push(t);
    }
    
    withTs.sort((a, b) => getOrCacheTs(b) - getOrCacheTs(a));
    if (withoutTs.length > 0) {
    withoutTs.sort((a, b) => {
        const diff = (Number((b as any).fully_diluted_value) || 0) - (Number((a as any).fully_diluted_value) || 0);
        if (diff !== 0) return diff;
        const aName = (a as any).symbol || (a as any).name || '';
        const bName = (b as any).symbol || (b as any).name || '';
        return aName < bName ? -1 : aName > bName ? 1 : 0;
      });
    }
    
    return withTs.length > 0 ? withTs.concat(withoutTs) : withoutTs;
  };

  const buildMigrated = (): any[] => {
    const source = migratedTokensQuery;
    if (!Array.isArray(source) || source.length === 0) return [];

    const filteredSource = source.filter((token: any) => !isZeroLiquidityToken(token));
    if (filteredSource.length === 0) return [];
    
    const tsCache = new Map<any, number>();
    const getOrCacheTs = (t: any) => {
      if (!tsCache.has(t)) tsCache.set(t, getTs(t));
      return tsCache.get(t)!;
    };

    const withTs: any[] = [];
    const withoutTs: any[] = [];
    for (const t of filteredSource) {
      (getOrCacheTs(t) > 0 ? withTs : withoutTs).push(t);
    }
    
    withTs.sort((a, b) => getOrCacheTs(b) - getOrCacheTs(a));
    if (withoutTs.length > 0) {
    withoutTs.sort((a, b) => {
        const diff = (Number((b as any).fully_diluted_value) || 0) - (Number((a as any).fully_diluted_value) || 0);
        if (diff !== 0) return diff;
        const aName = (a as any).symbol || (a as any).name || '';
        const bName = (b as any).symbol || (b as any).name || '';
        return aName < bName ? -1 : aName > bName ? 1 : 0;
      });
    }
    
    return withTs.length > 0 ? withTs.concat(withoutTs) : withoutTs;
  };

  const buildFinalStretch = (): any[] => {
    const source = finalStretchTokensQuery;
    if (!Array.isArray(source) || source.length === 0) return [];
    
    const filteredSource = source.filter((token: any) => !isZeroLiquidityToken(token));
    if (filteredSource.length === 0) return [];
    
    const tsCache = new Map<any, number>();
    const getOrCacheTs = (t: any) => {
      if (!tsCache.has(t)) tsCache.set(t, getTs(t));
      return tsCache.get(t)!;
    };
    
    const withTs: any[] = [];
    const withoutTs: any[] = [];
    for (const t of filteredSource) {
      (getOrCacheTs(t) > 0 ? withTs : withoutTs).push(t);
    }
    
    withTs.sort((a, b) => getOrCacheTs(b) - getOrCacheTs(a));
    if (withoutTs.length > 0) {
    withoutTs.sort((a, b) => {
        const diff = (Number((b as any).fully_diluted_value) || 0) - (Number((a as any).fully_diluted_value) || 0);
        if (diff !== 0) return diff;
        const aName = (a as any).symbol || (a as any).name || '';
        const bName = (b as any).symbol || (b as any).name || '';
        return aName < bName ? -1 : aName > bName ? 1 : 0;
      });
    }
    
    return withTs.length > 0 ? withTs.concat(withoutTs) : withoutTs;
  };

  // Use the processed data from build functions - define early to avoid hoisting issues
  const newPairsToShow = useMemo(() => buildNewPairs(), [combinedNewPairs, wsNewEnriched]);
  const migratedToShow = useMemo(() => buildMigrated(), [migratedTokensQuery]);
  const finalStretchToShow = useMemo(() => buildFinalStretch(), [finalStretchTokensQuery]);

  // REMOVED: Unnecessary array spreads that just create more work

  // Track httpNew changes for debugging
  useEffect(() => {
    // Optional: Add minimal logging if needed for debugging
  }, [httpNew]);

  // Track websocket connection status
  useEffect(() => {
    // Optional: Add minimal logging if needed for debugging
  }, [wsPulseConnected, wsPulseError]);

  // Track tick values for debugging
  useEffect(() => {
    // Optional: Add minimal logging if needed for debugging
  }, [httpNewTick, httpMigratedTick, httpFinalStretchTick]);
  
  // DISABLED: Image search - images should only come from JSON response
  // const priorityImageSearcher = useRef(new PriorityImageSearcher());
  const { preloadImages } = useImagePreloader();
  
  useEffect(() => {
    if (newPairsToShow && newPairsToShow.length > 0) {
      const imageSources = newPairsToShow
        .slice(0, 20)
        .map((token: any) => token.uri || token.image || token.logo)
        .filter(Boolean);

      if (imageSources.length > 0) {
        preloadImages(imageSources, { priority: true, timeout: 2000 });
      }
    }
  }, [newPairsToShow, preloadImages]);

  // Sync rolling trade cache with visible pulse tokens
  useEffect(() => {
    const syncCache = async () => {
      try {
        if (!newPairsToShow.length && !finalStretchToShow.length && !migratedToShow.length) return;

        await rollingTradeCache.syncWithPulseTokens(
          newPairsToShow.slice(0, 30),
          finalStretchToShow.slice(0, 30),
          migratedToShow.slice(0, 30)
        );
      } catch (error) {
        console.error('[Pulse] Failed to sync rolling cache:', error);
      }
    };

    syncCache();
  }, [newPairsToShow, finalStretchToShow, migratedToShow]);

  // Log cache stats periodically for debugging
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = rollingTradeCache.getStats();
      console.log(`[RollingCache Stats] ${stats.size}/${stats.maxSize} tokens (${stats.utilization.toFixed(1)}% full)`);
    }, 60000); // Every 60 seconds

    return () => clearInterval(interval);
  }, []);

  // REMOVED: Redundant HTTP fetch - React Query already handles migrated tokens

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
  // COMMENTED OUT: Relying on WebSocket for real-time market data instead
  // useEffect(() => {
  //   if (realtimeAddrs.length === 0) return;

  //   const pollMarketData = async () => {
  //     try {
  //       // Use deployed service directly when backend is deployed
  //       const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL.endsWith('/') 
  //         ? env.NEXT_PUBLIC_GO_SERVICE_URL.slice(0, -1) 
  //         : env.NEXT_PUBLIC_GO_SERVICE_URL;
  //       const apiUrl = env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED
  //         ? `${baseUrl}/v1/market-data`
  //         : '/api/token-service/realtime-market-data';

  //       const response = await fetch(apiUrl, {
  //         method: 'POST',
  //         headers: { 'Content-Type': 'application/json' },
  //         body: JSON.stringify({ mints: realtimeAddrs.slice(0, 200) })
  //       });

  //       if (response.ok) {
  //         const data = await response.json();
  //         // This will trigger the enrichWithMarketData to update
  //         // The data will be picked up by the existing marketData state
  //       }
  //     } catch (error) {
  //       console.log('Polling market data failed:', error);
  //     }
  //   };

  //   // Poll every 3 seconds for additional updates (faster frequency for real-time)
  //   const interval = setInterval(pollMarketData, 3000);
  //   return () => clearInterval(interval);
  // }, [realtimeAddrs]);

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

  // SIMPLIFIED: Just pass the data directly
  const enrichedNewPairsToShow = newPairsToShow;
  const enrichedFinalStretch = finalStretchToShow;
  const enrichedMigrated = migratedToShow;

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
        <title>Trenches | Interstate Memeboard</title>
        <meta name="description" content="Token tracking dashboard" />
      </Head>
      <div className="min-h-screen text-neutral-100" style={{ backgroundColor: '#06070b' }}>
        <Header />
        <div className="w-full px-5 pt-2 pb-6">
          <div className="mb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">Trenches</h1>
                <div className="flex items-center gap-3">
                  <Link
                    href="/pulse?chain=sol"
                    aria-label="View Solana tokens"
                    className={solanaButtonClasses}
                  >
                    <img
                      src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
                      alt="Solana"
                      className="h-6 w-6 rounded-full object-contain"
                      style={{ 
                        mixBlendMode: 'screen',
                        filter: 'contrast(1.2)'
                      }}
                    />
                  </Link>
                  <Link
                    href="/pulse?chain=bnb"
                    aria-label="View BNB tokens (beta)"
                    className={bnbButtonClasses}
                  >
                    <SiBinance className="h-4 w-4 text-[#F3BA2F]" />
                    <span className="absolute -bottom-1 -right-3 rounded-full border border-blue-500 px-1.5 py-px text-[6px] font-semibold uppercase tracking-[0.18em] text-blue-500 shadow-lg shadow-blue-500/30" style={{ backgroundColor: '#06070b' }}>
                      Beta
                    </span>
                  </Link>
                  <Link
                    href="/pulse?chain=monad"
                    aria-label="View MegaETH tokens (coming soon)"
                    className={monadButtonClasses}
                  >
                    <img
                      src="https://avatars.githubusercontent.com/u/138558126?s=280&v=4"
                      alt="MegaETH"
                      className="h-7 w-7 rounded-full object-cover bg-black/60 p-0.5"
                    />
                    <span className="absolute -bottom-1 -right-4 rounded-full border border-purple-400 px-1.5 py-px text-[6px] font-semibold uppercase tracking-[0.18em] text-purple-300 shadow-lg shadow-purple-500/30" style={{ backgroundColor: '#06070b' }}>
                      Soon
                    </span>
                  </Link>
                  <Link
                    href="/pulse?chain=base"
                    aria-label="View Base tokens (coming soon)"
                    className={baseButtonClasses}
                  >
                    <img
                      src="https://avatars.githubusercontent.com/u/108554348?s=280&v=4"
                      alt="Base"
                      className="h-7 w-7 rounded-full object-cover bg-black/60 p-0.5"
                    />
                    <span className="absolute -bottom-1 -right-4 rounded-full border border-sky-400 px-1.5 py-px text-[6px] font-semibold uppercase tracking-[0.18em] text-sky-300 shadow-lg shadow-sky-500/30" style={{ backgroundColor: '#06070b' }}>
                      Soon
                    </span>
                  </Link>
                  <Link
                    href="/pulse?chain=eth"
                    aria-label="View Ethereum tokens (coming soon)"
                    className={ethButtonClasses}
                  >
                    <img
                      src="https://s2.coinmarketcap.com/static/img/coins/200x200/1027.png"
                      alt="Ethereum"
                      className="h-7 w-7 rounded-full object-cover bg-black/60 p-0.5"
                    />
                    <span className="absolute -bottom-1 -right-4 rounded-full border border-emerald-400 px-1.5 py-px text-[6px] font-semibold uppercase tracking-[0.18em] text-emerald-300 shadow-lg shadow-emerald-500/30" style={{ backgroundColor: '#06070b' }}>
                      Soon
                    </span>
                  </Link>
                </div>
              </div>
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

          {isBnbRoute ? (
            <div className="w-full">
              {/* Mobile: Single table based on active tab */}
              <div className="lg:hidden">
                <div className="transition-all duration-300 ease-in-out">
                  {activeTab === 'new' && (
                    <BnbTable 
                      title="New Pairs" 
                      tokens={enrichedNewPairsToShow as any} 
                      loading={newPairsLoading} 
                      isFirstOrLast="only" 
                      showBubbleMetrics={false} 
                    />
                  )}
                  {activeTab === 'final-stretch' && (
                    <BnbTable 
                      title="Final Stretch" 
                      tokens={enrichedFinalStretch as any} 
                      isFirstOrLast="only" 
                      showBubbleMetrics={false} 
                    />
                  )}
                  {activeTab === 'migrated' && (
                    <BnbTable 
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
                <BnbTable 
                  title="New Pairs" 
                  tokens={enrichedNewPairsToShow as any} 
                  loading={newPairsLoading} 
                  isFirstOrLast="first" 
                  showBubbleMetrics={false} 
                />
                <BnbTable title="Final Stretch" tokens={enrichedFinalStretch as any} showBubbleMetrics={false} />
                <BnbTable title="Migrated" tokens={enrichedMigrated as any} isFirstOrLast="last" showBubbleMetrics={false} />
              </div>
            </div>
          ) : isMonadRoute || isBaseRoute || isEthereumRoute ? (
            <div className="mt-12 flex flex-col items-center justify-center gap-6 rounded-2xl border border-neutral-800/80 bg-[#0a0b10] px-6 py-16 text-center shadow-inner shadow-black/40">
              <img
                src={
                  isMonadRoute
                    ? "https://avatars.githubusercontent.com/u/138558126?s=280&v=4"
                    : isBaseRoute
                      ? "https://avatars.githubusercontent.com/u/108554348?s=280&v=4"
                      : "https://s2.coinmarketcap.com/static/img/coins/200x200/1027.png"
                }
                alt={
                  isMonadRoute
                    ? "MegaETH"
                    : isBaseRoute
                      ? "Base"
                      : "Ethereum"
                }
                className="h-24 w-24 rounded-full object-cover bg-black/60 p-1"
              />
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-neutral-100">
                  {isMonadRoute
                    ? 'MegaETH support is on the way'
                    : isBaseRoute
                      ? 'Base support is on the way'
                      : 'Ethereum support is on the way'}
                </h2>
                <p className="max-w-md text-sm text-neutral-400">
                  {isMonadRoute
                    ? 'We\'re building out dedicated flows for MegaETH tokens. Check back soon for real-time liquidity and launch data.'
                    : isBaseRoute
                      ? 'We\'re building out dedicated flows for Base tokens. Check back soon for real-time liquidity and launch data.'
                      : 'We\'re building out dedicated flows for Ethereum tokens. Check back soon for real-time liquidity and launch data.'}
                </p>
              </div>
              <button
                onClick={() => router.push('/pulse?chain=sol')}
                className="inline-flex items-center gap-2 rounded-full border border-neutral-700/70 bg-neutral-800/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-200 transition-colors hover:border-emerald-500/60 hover:bg-neutral-800"
              >
                Back to Solana
              </button>
              <a
                href="https://discord.gg/sACYQmCsTJ"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-neutral-700/70 bg-neutral-800/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-200 transition-colors hover:border-purple-500/60 hover:bg-neutral-800"
              >
                <FaDiscord className="h-4 w-4 text-[#5865F2]" />
                Join Discord
              </a>
            </div>
          ) : isLoading ? (
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
              <div>{launchpadError?.message || 'Unknown error'}</div>
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
                <PulseTable 
                  title="New Pairs" 
                  tokens={enrichedNewPairsToShow as any} 
                  loading={newPairsLoading} 
                  isFirstOrLast="first" 
                  showBubbleMetrics={false} 
                />
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
