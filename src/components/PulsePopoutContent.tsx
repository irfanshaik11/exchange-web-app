"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import PulseTable from "./PulseTable";
import MonadTable from "./MonadTable";
import type { Token } from "~/utils/db";
import { useUser } from "./UserContext";
import Cookies from "js-cookie";
import { useRealtimeWebSocket } from "../hooks/useRealtimeWebSocket";
import { usePulseWebSocketPersistent } from "../hooks/usePulseWebSocketPersistent";
import { useImagePreloader } from "../hooks/useImagePreloader";
import {
  useQueryNewPairs,
  useQueryLaunchpadData,
  useQueryFinalStretch,
  useQueryMigrated,
  tokenKeys,
} from "../hooks/useQueryTokens";
import { useQueryClient } from "@tanstack/react-query";
import { env } from "~/env";
import { extractTokenImage } from "../utils/images";

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

interface PulsePopoutContentProps {
  forceMobileView?: boolean;
}

export default function PulsePopoutContent({ forceMobileView = false }: PulsePopoutContentProps = {}) {
  const { user } = useUser();
  const router = useRouter();
  const manualChainSwitchRef = useRef(false);
  
  // CRITICAL: Default to solana chain for popout
  const [currentChain, setCurrentChain] = useState<string>(() => {
    if (typeof window !== 'undefined' && router.isReady) {
      return (router.query.chain as string) || 'sol';
    }
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('chain') || 'sol';
    }
    return 'sol';
  });
  
  // Sync chain state with router query (only if not manually switched)
  useEffect(() => {
    if (!router.isReady || manualChainSwitchRef.current) {
      manualChainSwitchRef.current = false;
      return;
    }
    const chainFromQuery = (router.query.chain as string) || 'sol';
    if (chainFromQuery !== currentChain) {
      setCurrentChain(chainFromQuery);
    }
  }, [router.query.chain, router.isReady]);
  
  // Also watch router.asPath as a fallback (only if not manually switched)
  useEffect(() => {
    if (!router.isReady || manualChainSwitchRef.current) {
      manualChainSwitchRef.current = false;
      return;
    }
    const urlParams = new URLSearchParams(router.asPath.split('?')[1] || '');
    const chainFromUrl = urlParams.get('chain') || 'sol';
    if (chainFromUrl !== currentChain) {
      setCurrentChain(chainFromUrl);
    }
  }, [router.asPath, router.isReady]);

  const chain = currentChain;
  const isMonadRoute = chain === 'monad';
  const isSolanaRoute = chain === 'sol';
  
  const chainButtonBase =
    "relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#20232b] bg-[#171920] text-neutral-300 shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070b]";
  const solanaButtonClasses = `${chainButtonBase} ${
    isSolanaRoute
      ? "bg-[#222733] text-white shadow-lg shadow-emerald-500/20"
      : "bg-[#141821] text-neutral-500 opacity-75 hover:opacity-100 hover:text-neutral-100"
  }`;
  const monadButtonClasses = `${chainButtonBase} ${
    isMonadRoute
      ? "bg-[#222733] text-white shadow-lg shadow-purple-500/20"
      : "bg-[#141821] text-neutral-500 opacity-75 hover:opacity-100 hover:text-neutral-100"
  }`;

  // React Query client for manual cache updates from WebSocket
  const queryClient = useQueryClient();

  // React Query hooks - only enable Solana data fetching when NOT on Monad route
  const shouldFetchSolanaData = router.isReady && !isMonadRoute;

  const { 
    data: tokens = [], 
    isLoading: tokensLoading, 
    error: tokensError, 
    isStale: tokensStale,
    refetch: refreshTokens,
    dataUpdatedAt,
    isFetching,
  } = useQueryNewPairs(shouldFetchSolanaData);
  
  const { 
    data: launchpadData = { new: [], completing: [], completed: [] }, 
    isLoading: launchpadLoading, 
    error: launchpadError, 
    isStale: launchpadStale,
    refetch: refreshLaunchpadData,
  } = useQueryLaunchpadData(shouldFetchSolanaData);

  const { data: finalStretchTokensQuery = [] } = useQueryFinalStretch(shouldFetchSolanaData);
  const { data: migratedTokensQuery = [] } = useQueryMigrated(shouldFetchSolanaData);

  // ✅ REAL-TIME WEBSOCKET: Direct cache updates (NO REFETCH)
  // COMMENTED OUT: PulseTable is disabled, so WebSocket is disabled too
  // const { connected: pulseWsConnected, error: pulseWsError } = usePulseWebSocket({
  //   enabled: shouldFetchSolanaData,
  //   onNewToken: useCallback((token) => {
  //     queryClient.setQueryData(tokenKeys.trenches.newPairs(), (oldData: any[] | undefined) => {
  //       if (!oldData) return [token];
  //       const filtered = oldData.filter((t: any) => t.mint !== token.mint);
  //       return [token, ...filtered].slice(0, 200);
  //     });
  //   }, [queryClient]),
  //   onFinalStretchToken: useCallback((token) => {
  //     queryClient.setQueryData(tokenKeys.trenches.finalStretch(), (oldData: any[] | undefined) => {
  //       if (!oldData) return [token];
  //       const filtered = oldData.filter((t: any) => t.mint !== token.mint);
  //       return [token, ...filtered].slice(0, 50);
  //     });
  //   }, [queryClient]),
  //   onMigratedToken: useCallback((token) => {
  //     queryClient.setQueryData(tokenKeys.trenches.migrated(), (oldData: any[] | undefined) => {
  //       if (!oldData) return [token];
  //       const filtered = oldData.filter((t: any) => t.mint !== token.mint);
  //       return [token, ...filtered].slice(0, 50);
  //     });
  //   }, [queryClient]),
  // });

  // ✅ REAL-TIME WEBSOCKET: Direct cache updates (NO REFETCH)
  // Using persistent WebSocket that survives tab switches and page refreshes
  const { connected: pulseWsConnected, error: pulseWsError } = usePulseWebSocketPersistent({
    enabled: shouldFetchSolanaData,
    onNewToken: useCallback((token) => {
      queryClient.setQueryData(tokenKeys.trenches.newPairs(), (oldData: any[] | undefined) => {
        if (!oldData) return [token];
        const filtered = oldData.filter((t: any) => t.mint !== token.mint);
        return [token, ...filtered].slice(0, 200);
      });
    }, [queryClient]),
    onFinalStretchToken: useCallback((token) => {
      queryClient.setQueryData(tokenKeys.trenches.finalStretch(), (oldData: any[] | undefined) => {
        if (!oldData) return [token];
        const filtered = oldData.filter((t: any) => t.mint !== token.mint);
        return [token, ...filtered].slice(0, 50);
      });
    }, [queryClient]),
    onMigratedToken: useCallback((token) => {
      queryClient.setQueryData(tokenKeys.trenches.migrated(), (oldData: any[] | undefined) => {
        if (!oldData) return [token];
        const filtered = oldData.filter((t: any) => t.mint !== token.mint);
        return [token, ...filtered].slice(0, 50);
      });
    }, [queryClient]),
  });
  useEffect(() => {
    if (pulseWsError) {
      console.error("[Pulse Popout] WebSocket error", pulseWsError);
    }
  }, [pulseWsConnected, pulseWsError]);

  // State for HTTP polling data
  const [httpNew, setHttpNew] = useState<any[]>([]);
  const [httpNewTick, setHttpNewTick] = useState(0);
  const [httpMigrated, setHttpMigrated] = useState<any[]>([]);
  const [httpMigratedTick, setHttpMigratedTick] = useState(0);
  const [httpFinalStretch, setHttpFinalStretch] = useState<any[]>([]);
  const [httpFinalStretchTick, setHttpFinalStretchTick] = useState(0);

  // Monad-specific state for all three tabs (with localStorage caching)
  const [monadNew, setMonadNew] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('cached_monad_new_tokens');
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return parsed.data || [];
        }
      }
    } catch (error) {
      console.warn('Failed to load cached Monad new tokens on init:', error);
    }
    return [];
  });
  const [monadNewTick, setMonadNewTick] = useState(0);
  const [monadFinalStretch, setMonadFinalStretch] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('cached_monad_final_stretch_tokens');
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return parsed.data || [];
        }
      }
    } catch (error) {
      console.warn('Failed to load cached Monad final stretch tokens on init:', error);
    }
    return [];
  });
  const [monadFinalStretchTick, setMonadFinalStretchTick] = useState(0);
  const [monadMigrated, setMonadMigrated] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('cached_monad_migrated_tokens');
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return parsed.data || [];
        }
      }
    } catch (error) {
      console.warn('Failed to load cached Monad migrated tokens on init:', error);
    }
    return [];
  });
  const [monadMigratedTick, setMonadMigratedTick] = useState(0);

  // Zero liquidity filter disabled - let all tokens through
  const isZeroLiquidityToken = useCallback((_token: any) => {
    return false;
  }, []);

  // Immediate poll on mount for Final Stretch tokens
  useEffect(() => {
    const immediatePoll = async () => {
      try {
        let apiUrl: string;
        if (isMonadRoute) {
          const monadServiceUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL!;
          apiUrl = `${monadServiceUrl}/v1/pulse/final-stretch?limit=35`;
        } else {
          // COMMENTED OUT: PulseTable is disabled, so Solana API calls are disabled
          // apiUrl = `/api/token-service/pulse-final-stretch?limit=50&t=${Date.now()}`;
          return; // Skip Solana route
        }

        const res = await fetch(apiUrl, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
            "Accept": "application/json"
          },
        });
        if (res.ok) {
          const result = await res.json();
          const data = result.data || (Array.isArray(result) ? result : []);
          if (Array.isArray(data) && data.length > 0) {
            const filteredData = (data as any[]).filter((token) => {
              if (isZeroLiquidityToken(token)) {
                return false;
              }
              return true;
            });

            if (filteredData.length === 0) {
              if (isMonadRoute) {
                setMonadFinalStretch([]);
                setMonadFinalStretchTick((t) => t + 1);
              } else {
                setHttpFinalStretch([]);
                setHttpFinalStretchTick((t) => t + 1);
              }
              return;
            }

            if (isMonadRoute) {
              // Transform Monad tokens: map 'address' to 'mint'
              const transformed = filteredData.map((t: any) => ({
                ...t,
                mint: t.address || t.mint,
              }));
              setMonadFinalStretch(transformed);
              setMonadFinalStretchTick((t) => t + 1);
            } else {
              setHttpFinalStretch(filteredData as any[]);
              setHttpFinalStretchTick((t) => t + 1);
            }
          }
        }
      } catch (error) {
        console.log("[Final Stretch] Immediate poll failed:", error);
      }
    };

    immediatePoll();
  }, [isMonadRoute, isZeroLiquidityToken]);

  // Fetch Monad data when chain is monad (with localStorage caching)
  useEffect(() => {
    if (!isMonadRoute) {
      return;
    }

    const loadFromCache = () => {
      let hasValidCache = false;
      
      try {
        const newCached = localStorage.getItem('cached_monad_new_tokens');
        const finalStretchCached = localStorage.getItem('cached_monad_final_stretch_tokens');
        const migratedCached = localStorage.getItem('cached_monad_migrated_tokens');
        
        const now = Date.now();
        
        if (newCached) {
          const parsed = JSON.parse(newCached);
          if (now < parsed.expiresAt && parsed.data && parsed.data.length > 0) {
            setMonadNew(parsed.data);
            setMonadNewTick(1); // Mark as fetched
            hasValidCache = true;
          }
        }
        
        if (finalStretchCached) {
          const parsed = JSON.parse(finalStretchCached);
          if (now < parsed.expiresAt && parsed.data && parsed.data.length > 0) {
            setMonadFinalStretch(parsed.data);
            setMonadFinalStretchTick(1); // Mark as fetched
            hasValidCache = true;
          }
        }
        
        if (migratedCached) {
          const parsed = JSON.parse(migratedCached);
          if (now < parsed.expiresAt && parsed.data && parsed.data.length > 0) {
            setMonadMigrated(parsed.data);
            setMonadMigratedTick(1); // Mark as fetched
            hasValidCache = true;
          }
        }
      } catch (error) {
        console.warn('[Monad] Failed to load from cache:', error);
      }
      
      return hasValidCache;
    };

    loadFromCache();

    const fetchMonadData = async () => {
      try {
        const monadServiceUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL!;
        const now = Date.now();
        const cacheTTL = 5 * 60 * 1000; // 5 minutes

        // Fetch new pairs
        const newRes = await fetch(`${monadServiceUrl}/v1/pulse/new?limit=35`, {
          cache: 'no-store',
          headers: { 'Accept': 'application/json' }
        });
        if (newRes.ok) {
          const result = await newRes.json();
          const newData = result.data || (Array.isArray(result) ? result : []);
          const transformed = Array.isArray(newData) ? newData.map((t: any) => ({
            ...t,
            mint: t.address || t.mint,
          })) : [];
          const filteredNew = transformed.filter((t: any) => !isZeroLiquidityToken(t));
          setMonadNew(filteredNew);
          setMonadNewTick(prev => prev + 1);
          
          try {
            localStorage.setItem('cached_monad_new_tokens', JSON.stringify({
              data: filteredNew,
              timestamp: now,
              expiresAt: now + cacheTTL,
            }));
          } catch (error) {
            console.warn('[Monad] Failed to cache new tokens:', error);
          }
        }

        // Fetch final stretch tokens
        const finalStretchRes = await fetch(`${monadServiceUrl}/v1/pulse/final-stretch?limit=35`, {
          cache: 'no-store',
          headers: { 'Accept': 'application/json' }
        });
        if (finalStretchRes.ok) {
          const result = await finalStretchRes.json();
          const finalStretchData = result.data || (Array.isArray(result) ? result : []);
          const transformed = Array.isArray(finalStretchData) ? finalStretchData.map((t: any) => ({
            ...t,
            mint: t.address || t.mint,
          })) : [];
          const filteredFinalStretch = transformed.filter((t: any) => !isZeroLiquidityToken(t));
          setMonadFinalStretch(filteredFinalStretch);
          setMonadFinalStretchTick(prev => prev + 1);
          
          try {
            localStorage.setItem('cached_monad_final_stretch_tokens', JSON.stringify({
              data: filteredFinalStretch,
              timestamp: now,
              expiresAt: now + cacheTTL,
            }));
          } catch (error) {
            console.warn('[Monad] Failed to cache final stretch tokens:', error);
          }
        }

        // Fetch migrated tokens
        const migratedRes = await fetch(`${monadServiceUrl}/v1/pulse/migrated?limit=35`, {
          cache: 'no-store',
          headers: { 'Accept': 'application/json' }
        });
        if (migratedRes.ok) {
          const result = await migratedRes.json();
          const migratedData = result.data || (Array.isArray(result) ? result : []);
          const transformed = Array.isArray(migratedData) ? migratedData.map((t: any) => ({
            ...t,
            mint: t.address || t.mint,
          })) : [];
          const filteredMigrated = transformed.filter((t: any) => !isZeroLiquidityToken(t));
          setMonadMigrated(filteredMigrated);
          setMonadMigratedTick(prev => prev + 1);
          
          try {
            localStorage.setItem('cached_monad_migrated_tokens', JSON.stringify({
              data: filteredMigrated,
              timestamp: now,
              expiresAt: now + cacheTTL,
            }));
          } catch (error) {
            console.warn('[Monad] Failed to cache migrated tokens:', error);
          }
        }
      } catch (error) {
        console.error('[Monad] ❌ Failed to fetch Monad data:', error);
        // Even on error, mark as fetched so we don't show loading forever
        setMonadNewTick(prev => prev > 0 ? prev : 1);
        setMonadFinalStretchTick(prev => prev > 0 ? prev : 1);
        setMonadMigratedTick(prev => prev > 0 ? prev : 1);
      }
    };

    // Always fetch, even if cache was valid (for background refresh)
    fetchMonadData();
  }, [isMonadRoute, isZeroLiquidityToken]);

  // Convert launchpad tokens to Token format for PulseTable
  const convertLaunchpadToToken = useCallback(
    (launchpadToken: LaunchpadToken): Token =>
      ({
        id: 0,
        mint: launchpadToken.mint,
        standard: "SPL",
        name: launchpadToken.name || "Unknown",
        symbol: launchpadToken.symbol || "UNK",
        logo: launchpadToken.image || "",
        decimals: 6,
        metaplex: null,
        fully_diluted_value: launchpadToken.marketCapUsd,
        total_supply: 0,
        total_supply_formatted: 0,
        links: null,
        description: "",
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
        bonding_curve_progress: launchpadToken.graduationPercent,
        uri: launchpadToken.image || null,
        image: launchpadToken.image || null,
      }) as any,
    [],
  );

  // Segregate regular tokens - bonding_curve_progress is in percentage format (0-100)
  const newPairs = useMemo(() => tokens.filter(t => {
    const v = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : (t.bonding_curve_progress as number);
    const prog = isFinite(v as number) ? Number(v) : 0;
    return prog < 60; // Percentage format
  }), [tokens]);
  const finalStretch = useMemo(() => tokens.filter(t => {
    const v = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : (t.bonding_curve_progress as number);
    const prog = isFinite(v as number) ? Number(v) : 0;
    return prog >= 60 && prog < 85; // Percentage format
  }), [tokens]);
  const migrated = useMemo(() => tokens.filter(t => {
    const v = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : (t.bonding_curve_progress as number);
    const prog = isFinite(v as number) ? Number(v) : 0;
    return prog >= 85; // Percentage format
  }), [tokens]);

  // Convert and combine launchpad tokens
  const launchpadNewPairs = useMemo(
    () => launchpadData?.new?.map(convertLaunchpadToToken) || [],
    [launchpadData?.new, convertLaunchpadToToken],
  );
  const launchpadFinalStretch = useMemo(
    () => launchpadData?.completing?.map(convertLaunchpadToToken) || [],
    [launchpadData?.completing, convertLaunchpadToToken],
  );
  const launchpadMigrated = useMemo(
    () => launchpadData?.completed?.map(convertLaunchpadToToken) || [],
    [launchpadData?.completed, convertLaunchpadToToken],
  );

  // Combine regular tokens with launchpad tokens
  const combinedNewPairs = useMemo(
    () => [...newPairs, ...launchpadNewPairs],
    [newPairs, launchpadNewPairs],
  );
  const combinedFinalStretch = useMemo(() => [...finalStretch], [finalStretch]);
  const combinedMigrated = useMemo(() => [...migrated], [migrated]);

  // Memoize the loading state
  const isLoading = useMemo(() => {
    if (isMonadRoute) {
      // For Monad, only show loading if we haven't fetched yet (tick is 0)
      // Once we've fetched (tick > 0), even if data is empty, don't show loading
      return monadNewTick === 0;
    }
    return !tokens.length && !launchpadData?.new?.length && !httpNew.length;
  }, [isMonadRoute, tokens.length, launchpadData?.new?.length, httpNew.length, monadNewTick]);
  
  const newPairsLoading = isLoading;

  const hasError = useMemo(() => {
    return (
      launchpadError &&
      !(launchpadData?.new?.length || 0) &&
      !(launchpadData?.completing?.length || 0) &&
      !(launchpadData?.completed?.length || 0)
    );
  }, [
    launchpadError,
    launchpadData?.new?.length,
    launchpadData?.completing?.length,
    launchpadData?.completed?.length,
  ]);

  // Enrich WS new pairs with created_at/image from known sources
  const wsNewRaw: any[] = [];
  const wsNewEnriched = useMemo(() => {
    const byAddr = new Map<string, any>();
    const pushMap = (arr: any[]) =>
      arr.forEach((t) => {
        const a = (t as any)?.pair_address || (t as any)?.mint;
        if (a && !byAddr.has(a)) byAddr.set(a, t);
      });
    pushMap(tokens as any[]);
    pushMap(launchpadNewPairs as any[]);
    pushMap(launchpadFinalStretch as any[]);
    pushMap(launchpadMigrated as any[]);
    return wsNewRaw.map((t) => {
      const a = (t as any)?.pair_address || (t as any)?.mint;
      const src = a ? byAddr.get(a) : undefined;
      const extractedImage =
        extractTokenImage(t as any) || extractTokenImage(src);
      return {
        ...t,
        created_at:
          (t as any).created_at ||
          (t as any).createdAt ||
          src?.created_at ||
          src?.createdAt ||
          (t as any).timestamp ||
          undefined,
        launch_time:
          (t as any).launch_time ||
          (t as any).launchTime ||
          src?.launch_time ||
          src?.launchTime ||
          undefined,
        image: extractedImage || (t as any).image || src?.image || undefined,
        logo: extractedImage || (t as any).logo || src?.logo || undefined,
        uri: extractedImage || (t as any).uri || src?.uri || undefined,
      };
    });
  }, [
    wsNewRaw,
    tokens,
    launchpadNewPairs,
    launchpadFinalStretch,
    launchpadMigrated,
  ]);

  // Helpers to compute timestamps
  const getTs = (t: any): number => {
    let v: any =
      t?.migrated_time ??
      t?.migratedTime ??
      t?.launch_time ??
      t?.launchTime ??
      t?.created_at ??
      t?.createdAt ??
      t?.firstSeen ??
      t?.first_seen ??
      t?.pair_created_at ??
      t?.pairCreatedAt ??
      t?.timestamp ??
      t?.ts ??
      null;
    if (v && typeof v === "object") {
      if ("Time" in v && typeof v.Time === "string") v = v.Time;
      else if ("time" in v && typeof (v as any).time === "string")
        v = (v as any).time;
      else if ("seconds" in v && typeof (v as any).seconds === "number") {
        const sec = Number((v as any).seconds);
        return sec > 1e12 ? sec : sec > 1e9 ? sec * 1000 : 0;
      } else if ("millis" in v && typeof (v as any).millis === "number") {
        const ms = Number((v as any).millis);
        return ms > 0 ? ms : 0;
      }
    }
    if (!v) return 0;
    if (typeof v === "number") return v > 1e12 ? v : v > 1e9 ? v * 1000 : 0;
    if (typeof v === "string") {
      const n = Number(v);
      if (!Number.isNaN(n) && n > 0)
        return n > 1e12 ? n : n > 1e9 ? n * 1000 : 0;
      const d = Date.parse(v);
      return Number.isNaN(d) ? 0 : d;
    }
    if (v instanceof Date) return v.getTime();
    return 0;
  };

  const buildNewPairs = (): any[] => {
    if (isMonadRoute) {
      return monadNew;
    }

    const source = wsNewEnriched.length ? wsNewEnriched : combinedNewPairs;
    
    const uniq = new Map<string, any>();
    for (const t of source as any[]) {
      const key = (t?.pair_address || t?.mint || t?.mint_address) as string | undefined;
      if (!key || uniq.has(key)) continue;
      uniq.set(key, t);
    }
    const vals = Array.from(uniq.values()).filter(
      (token) => !isZeroLiquidityToken(token),
    );
    if (vals.length === 0)
      return combinedNewPairs.filter((token) => !isZeroLiquidityToken(token)).slice(0, 35);

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
        const diff =
          (Number((b as any).fully_diluted_value) || 0) -
          (Number((a as any).fully_diluted_value) || 0);
        if (diff !== 0) return diff;
        const aName = (a as any).symbol || (a as any).name || "";
        const bName = (b as any).symbol || (b as any).name || "";
        return aName < bName ? -1 : aName > bName ? 1 : 0;
      });
    }

    const result = withTs.length > 0 ? withTs.concat(withoutTs) : withoutTs;
    return result.slice(0, 35);
  };

  const buildMigrated = (): any[] => {
    if (isMonadRoute) {
      return monadMigrated;
    }

    const source = migratedTokensQuery;
    if (!Array.isArray(source) || source.length === 0) return [];

    const filteredSource = source.filter(
      (token: any) => !isZeroLiquidityToken(token),
    );
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
        const diff =
          (Number((b as any).fully_diluted_value) || 0) -
          (Number((a as any).fully_diluted_value) || 0);
        if (diff !== 0) return diff;
        const aName = (a as any).symbol || (a as any).name || "";
        const bName = (b as any).symbol || (b as any).name || "";
        return aName < bName ? -1 : aName > bName ? 1 : 0;
      });
    }

    return withTs.length > 0 ? withTs.concat(withoutTs) : withoutTs;
  };

  const buildFinalStretch = (): any[] => {
    if (isMonadRoute) {
      return monadFinalStretch;
    }

    const source = finalStretchTokensQuery;
    if (!Array.isArray(source) || source.length === 0) return [];

    const filteredSource = source.filter(
      (token: any) => !isZeroLiquidityToken(token),
    );
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
        const diff =
          (Number((b as any).fully_diluted_value) || 0) -
          (Number((a as any).fully_diluted_value) || 0);
        if (diff !== 0) return diff;
        const aName = (a as any).symbol || (a as any).name || "";
        const bName = (b as any).symbol || (b as any).name || "";
        return aName < bName ? -1 : aName > bName ? 1 : 0;
      });
    }

    return withTs.length > 0 ? withTs.concat(withoutTs) : withoutTs;
  };

  // Use the processed data from build functions
  const newPairsToShow = useMemo(() => buildNewPairs(), 
    [isMonadRoute, monadNew, monadNewTick, combinedNewPairs, wsNewEnriched, isZeroLiquidityToken]
  );
  const migratedToShow = useMemo(() => buildMigrated(), 
    [isMonadRoute, monadMigrated, monadMigratedTick, migratedTokensQuery, isZeroLiquidityToken]
  );
  const finalStretchToShow = useMemo(() => buildFinalStretch(), 
    [isMonadRoute, monadFinalStretch, monadFinalStretchTick, finalStretchTokensQuery, isZeroLiquidityToken]
  );

  // Build a unified list of addresses to fetch realtime market data for
  const realtimeAddrs = useMemo(() => {
    const src: any[] = [
      ...((newPairsToShow as any[]) || []),
      ...((finalStretchToShow as any[]) || []),
      ...((migratedToShow as any[]) || []),
    ];
    const uniq = new Set<string>();
    for (const t of src) {
      const mint = (t as any)?.mint;
      const pair = (t as any)?.pair_address;
      if (mint && typeof mint === "string") uniq.add(mint);
      if (pair && typeof pair === "string") uniq.add(pair);
      if (uniq.size >= 200) break;
    }
    return Array.from(uniq);
  }, [newPairsToShow, finalStretchToShow, migratedToShow]);

  const {
    marketData,
    connected: wsConnected,
    error: wsError,
  } = useRealtimeWebSocket(realtimeAddrs, {
    url: `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, "ws")}/v1/ws/market-data`,
    reconnectInterval: 1000,
    maxReconnectAttempts: 20,
  });

  const enrichWithMarketData = useCallback(
    (arr: any[]): any[] => {
      if (!arr || arr.length === 0) return arr;

      return arr.map((t: any) => {
        const mintKey = t?.mint as string | undefined;
        const pairKey = t?.pair_address as string | undefined;
        const md =
          (mintKey && marketData[mintKey]) || (pairKey && marketData[pairKey]);

        if (!md) return t;

        const hasChanges =
          t.price_usd !== md.price_usd ||
          t.usd_price !== md.price_usd ||
          t.market_cap_usd !== md.market_cap_usd ||
          t.fully_diluted_value !== md.market_cap_usd ||
          t.volume_24h !== (md as any).volume_usd;

        if (!hasChanges) return t;

        const patched: any = { ...t };
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
    },
    [marketData],
  );

  // For Monad route, ONLY use Monad data - never Solana data
  const enrichedNewPairsToShow = isMonadRoute ? monadNew : newPairsToShow;
  const enrichedFinalStretch = isMonadRoute ? monadFinalStretch : finalStretchToShow;
  const enrichedMigrated = isMonadRoute ? monadMigrated : migratedToShow;

  const { preloadImages } = useImagePreloader();

  useEffect(() => {
    if (newPairsToShow && newPairsToShow.length > 0) {
      const imageSources = newPairsToShow
        .slice(0, 20)
        .map((token: any) => extractTokenImage(token))
        .filter(Boolean);

      if (imageSources.length > 0) {
        preloadImages(imageSources, { priority: true, timeout: 2000 });
      }
    }
  }, [newPairsToShow, preloadImages]);

  // Fetch initial migrated tokens on page load (only for Solana route)
  useEffect(() => {
    if (isMonadRoute) {
      return;
    }

    // COMMENTED OUT: PulseTable is disabled, so Solana API calls are disabled
    return;

    // const fetchInitialMigratedTokens = async () => {
    //   try {
    //     const endpoint = `/api/token-service/pulse-migrated?limit=70`;
    //     const response = await fetch(endpoint, {
    //       cache: 'no-store',
    //       headers: {
    //         'Cache-Control': 'no-cache',
    //         'Pragma': 'no-cache'
    //       }
    //     });
    //     if (response.ok) {
    //       const data = await response.json();
    //       if (data.length > 0) {
    //         const filteredData = data.filter((token: any) => {
    //           if (!token) return false;
    //           if (isZeroLiquidityToken(token)) {
    //             return false;
    //           }
    //           return true;
    //         });

    //         if (filteredData.length === 0) {
    //           setHttpMigrated([]);
    //           setHttpMigratedTick((prev) => prev + 1);
    //           return;
    //         }

    //         const tokensWithTimestamp = filteredData.map((token: any) => ({
    //           ...token,
    //           created_at: token.migrated_time || new Date().toISOString(),
    //           timestamp: Date.now(),
    //         }));
    //         setHttpMigrated(tokensWithTimestamp);
    //         setHttpMigratedTick((prev) => prev + 1);
    //       }
    //     }
    //   } catch (error) {
    //     console.error(`[Pulse] ❌ Failed to fetch initial migrated tokens:`, error);
    //   }
    // };

    // fetchInitialMigratedTokens();
  }, [isMonadRoute, isZeroLiquidityToken]);

  // Handle chain switching
  const handleChainSwitch = useCallback((newChain: string) => {
    manualChainSwitchRef.current = true;
    setCurrentChain(newChain);
    // Update URL and router query for popout context
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('chain', newChain);
      window.history.replaceState({}, '', url.toString());
      // Also update router query using shallow routing
      router.push(
        {
          pathname: router.pathname,
          query: { ...router.query, chain: newChain },
        },
        undefined,
        { shallow: true }
      );
    }
  }, [router]);

  return (
    <div className="flex h-full flex-col text-neutral-100 overflow-hidden" style={{ backgroundColor: '#06070b' }}>
      <div className="w-full px-6 pt-4 flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="mb-1">
          <div className="mb-1 flex flex-col gap-3 px-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">Trenches</h1>
              {/* Chain switching buttons commented out */}
              {/* <div className="flex items-center gap-3">
                <button
                  onClick={() => handleChainSwitch('monad')}
                  aria-label="View Monad tokens"
                  className={monadButtonClasses}
                >
                  <img
                    src="https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1"
                    alt="Monad"
                    className="h-7 w-7 rounded-full object-cover"
                  />
                </button>
                <button
                  onClick={() => handleChainSwitch('sol')}
                  aria-label="View Solana tokens"
                  className={solanaButtonClasses}
                >
                  <img
                    src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
                    alt="Solana"
                    className="h-6 w-6 rounded-full object-contain mix-blend-screen contrast-[1.2]"
                  />
                </button>
              </div> */}
            </div>
          </div>
        </div>

        {isMonadRoute ? (
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 w-full flex-1 flex-row overflow-hidden">
              <MonadTable
                title="New Pairs"
                tokens={enrichedNewPairsToShow}
                loading={monadNewTick === 0}
                isFirstOrLast="first"
                showBubbleMetrics={false}
              />
              <MonadTable
                title="Final Stretch"
                tokens={enrichedFinalStretch}
                loading={monadFinalStretchTick === 0}
                showBubbleMetrics={false}
              />
              <MonadTable
                title="Migrated"
                tokens={enrichedMigrated}
                loading={monadMigratedTick === 0}
                isFirstOrLast="last"
                showBubbleMetrics={false}
              />
            </div>
          </div>
        ) : isLoading ? (
              <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
                <div className="flex min-h-0 w-full flex-1 flex-row overflow-hidden">
                  <PulseTable
                    title="New Pairs"
                    tokens={[]}
                    loading
                    skeletonRowCount={10}
                    isFirstOrLast="first"
                    showBubbleMetrics={false}
                  />
                  <PulseTable
                    title="Final Stretch"
                    tokens={[]}
                    loading
                    skeletonRowCount={10}
                    showBubbleMetrics={false}
                  />
                  <PulseTable
                    title="Migrated"
                    tokens={[]}
                    loading
                    skeletonRowCount={10}
                    isFirstOrLast="last"
                    showBubbleMetrics={false}
                  />
                </div>
              </div>
        ) : hasError ? (
          <div className="py-10 text-center text-red-400">
            <div className="mb-2 text-xl font-semibold">
              Error Loading Launchpad Data
            </div>
            <div>{launchpadError?.message || "Unknown error"}</div>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700"
            >
              Retry
            </button>
          </div>
        ) : (
            <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
              <div className="flex min-h-0 w-full flex-1 flex-row overflow-hidden">
                <PulseTable
                  title="New Pairs"
                  tokens={enrichedNewPairsToShow as any}
                  loading={newPairsLoading}
                  isFirstOrLast="first"
                  showBubbleMetrics={false}
                />
                <PulseTable
                  title="Final Stretch"
                  tokens={enrichedFinalStretch as any}
                  showBubbleMetrics={false}
                />
                <PulseTable
                  title="Migrated"
                  tokens={enrichedMigrated as any}
                  isFirstOrLast="last"
                  showBubbleMetrics={false}
                />
              </div>
            </div>
      )}
      </div>
    </div>
  );
}
