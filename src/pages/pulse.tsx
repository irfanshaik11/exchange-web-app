import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import Head from 'next/head';
import PulseTable from '../components/PulseTable';
import type { Token } from '~/utils/db';
import Header from '../components/Header';
import usePaginatedTokensWebSocket from '../hooks/usePaginatedTokensWebSocket';
import { useRealtimeWebSocket } from '../hooks/useRealtimeWebSocket';
import { PriorityImageSearcher } from '../utils/imageSearch';
import { useImagePreloader } from '../hooks/useImagePreloader';
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
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [httpNew, setHttpNew] = useState<any[]>([]);
  const [httpNewTick, setHttpNewTick] = useState(0);
  const [httpFinalStretch, setHttpFinalStretch] = useState<any[]>([]);
  const [httpFinalStretchTick, setHttpFinalStretchTick] = useState(0);
  const [httpMigrated, setHttpMigrated] = useState<any[]>([]);
  const [httpMigratedTick, setHttpMigratedTick] = useState(0);

  // Launchpad data state
  const [launchpadData, setLaunchpadData] = useState<LaunchpadData>({
    new: [],
    completing: [],
    completed: []
  });
  const [launchpadLoading, setLaunchpadLoading] = useState(true);
  const [launchpadError, setLaunchpadError] = useState<string | null>(null);

  // Use WebSocket for New Pairs
  const { data: newPairsTokens, loading: wsLoading } = usePaginatedTokensWebSocket({ filter: 'new', limit: 20 });

  // Fetch regular tokens (optional - graceful fallback)
  useEffect(() => {
    setLoading(true);
    setError(null);
    // Use deployed service directly when backend is deployed
    const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL.endsWith('/') 
      ? env.NEXT_PUBLIC_GO_SERVICE_URL.slice(0, -1) 
      : env.NEXT_PUBLIC_GO_SERVICE_URL;
    const url = env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED
      ? `${baseUrl}/v1/tokens?filter=trending&order=desc&limit=200`
      : `/api/token-service/getAllTokens?filter=trending&order=desc&limit=200`;

    fetch(url)
      .then(res => res.ok ? res.json() : { result: [] })
      .then((data: { result: Token[] } | Token[]) => {
        const arr = Array.isArray(data) ? (data as Token[]) : (data.result || []);
        setTokens(arr);
      })
      .catch(() => setTokens([]))
      .finally(() => setLoading(false));
  }, []);

  // Fetch launchpad data
  useEffect(() => {
    const fetchLaunchpadData = async () => {
      setLaunchpadLoading(true);
      setLaunchpadError(null);
      try {
        // Use deployed service directly when backend is deployed
        const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL.endsWith('/') 
          ? env.NEXT_PUBLIC_GO_SERVICE_URL.slice(0, -1) 
          : env.NEXT_PUBLIC_GO_SERVICE_URL;
        const apiUrl = env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED
          ? `${baseUrl}/v1/launchpad/tokens?limit=30`
          : `/api/launchpad/tokens?limit=30`;

        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error('Failed to fetch launchpad data');
        const data: LaunchpadData = await response.json();
        setLaunchpadData(data);
      } catch (err) {
        setLaunchpadError('Failed to load launchpad data');
      } finally {
        setLaunchpadLoading(false);
      }
    };
    fetchLaunchpadData();
    const interval = setInterval(fetchLaunchpadData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fast polling fallback for New Pairs (cache-bypass)
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        // Use deployed service directly when backend is deployed
        const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL.endsWith('/') 
          ? env.NEXT_PUBLIC_GO_SERVICE_URL.slice(0, -1) 
          : env.NEXT_PUBLIC_GO_SERVICE_URL;
        const apiUrl = env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED
          ? `${baseUrl}/v1/pulse/new?limit=30&t=${Date.now()}`
          : `/api/token-service/pulse-new?limit=30&t=${Date.now()}`;

        const res = await fetch(apiUrl);
        if (!alive) return;
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            // Only replace when we have non-empty fresh data to avoid flicker
            if (data.length > 0) {
              setHttpNew(data as any[]);
              setHttpNewTick((t) => t + 1);
            }
          }
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Fast polling fallback for Final Stretch tokens (cache-bypass)
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        // Use deployed service directly when backend is deployed
        const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL.endsWith('/') 
          ? env.NEXT_PUBLIC_GO_SERVICE_URL.slice(0, -1) 
          : env.NEXT_PUBLIC_GO_SERVICE_URL;
        const apiUrl = env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED
          ? `${baseUrl}/v1/pulse/final-stretch?limit=30&t=${Date.now()}`
          : `/api/token-service/pulse-final-stretch?limit=30&t=${Date.now()}`;

        const res = await fetch(apiUrl);
        if (!alive) return;
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            // Only replace when we have non-empty fresh data to avoid flicker
            if (data.length > 0) {
              setHttpFinalStretch(data as any[]);
              setHttpFinalStretchTick((t) => t + 1);
            }
          }
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Fast polling fallback for Migrated tokens (cache-bypass)
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        // Use deployed service directly when backend is deployed
        const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL.endsWith('/') 
          ? env.NEXT_PUBLIC_GO_SERVICE_URL.slice(0, -1) 
          : env.NEXT_PUBLIC_GO_SERVICE_URL;
        const apiUrl = env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED
          ? `${baseUrl}/v1/pulse/migrated?limit=30&t=${Date.now()}`
          : `/api/token-service/pulse-migrated?limit=30&t=${Date.now()}`;

        const res = await fetch(apiUrl);
        if (!alive) return;
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            // Only replace when we have non-empty fresh data to avoid flicker
            if (data.length > 0) {
              setHttpMigrated(data as any[]);
              setHttpMigratedTick((t) => t + 1);
            }
          }
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

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
  const combinedFinalStretch = useMemo(() => [...httpFinalStretch, ...launchpadFinalStretch], [httpFinalStretch, launchpadFinalStretch]);
  const combinedMigrated = useMemo(() => [...httpMigrated, ...launchpadMigrated], [httpMigrated, launchpadMigrated]);

  const isLoading = (loading && wsLoading) || launchpadLoading;
  const hasError = launchpadError && !(launchpadData?.new?.length || 0) && !(launchpadData?.completing?.length || 0) && !(launchpadData?.completed?.length || 0);

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
    let v: any = (
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
    // Prefer HTTP pulse-new (authoritative by launch_time); fallback to WS; finally fallback to combined
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
    withTs.sort((a, b) => getTs(b) - getTs(a));
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

  const newPairsData = useMemo(() => buildNewPairs(), [httpNewTick, wsNewEnriched, combinedNewPairs]);
  
  // Priority image search for new pairs tokens
  const priorityImageSearcher = useRef(new PriorityImageSearcher());
  const { preloadImages } = useImagePreloader();
  
  useEffect(() => {
    if (newPairsData && newPairsData.length > 0) {
      // Filter tokens that need images (no image or logo)
      const tokensNeedingImages = newPairsData
        .filter((token: any) => {
          const hasImage = token.uri || token.image || token.logo;
          return !hasImage && token.mint && token.symbol;
        })
        .map((token: any) => ({
          mint: token.mint,
          name: token.name || '',
          symbol: token.symbol || '',
          currentLogo: token.uri || token.logo || null,
          uri: token.uri || null,
        }))
        .slice(0, 10); // Limit to first 10 tokens for priority processing

      if (tokensNeedingImages.length > 0) {
        console.log(`🚀 Starting priority image search for ${tokensNeedingImages.length} new pairs tokens`);
        priorityImageSearcher.current.searchNewPairsImages(tokensNeedingImages);
      }

      // Preload images for new pairs tokens (priority loading)
      const imageSources = newPairsData
        .slice(0, 20) // Preload first 20 tokens
        .map((token: any) => token.uri || token.image || token.logo)
        .filter(Boolean);

      if (imageSources.length > 0) {
        console.log(`🖼️ Preloading ${imageSources.length} new pairs images`);
        preloadImages(imageSources, { priority: true, timeout: 2000 });
      }
    }
  }, [newPairsData, preloadImages]);

  // Keep last non-empty list to prevent flicker when WS/HTTP blips (guard against needless updates)
  const [lastNonEmptyNewPairs, setLastNonEmptyNewPairs] = useState<any[]>([]);
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
  const newPairsToShow = lastNonEmptyNewPairs.length > 0 ? lastNonEmptyNewPairs : newPairsData;
  // Debug: log top entries order and timestamps (after data is computed)
  if (typeof window !== 'undefined') {
    try {
      const sample = (newPairsData || []).slice(0, 10).map((t: any) => ({
        addr: t.pair_address || t.mint,
        ts: getTs(t),
        created_at: t.created_at || t.createdAt || t.launch_time || t.launchTime,
        firstSeen: t.firstSeen,
        updated_at: t.updated_at || t.updatedAt,
      }));
      // console.log('[Pulse] NewPairs top10', sample);
    } catch {}
  }
  const newPairsFallback = newPairsData;
  // Show loading until at least one source has tried and no data yet
  const newPairsLoading = (httpNewTick === 0 && wsLoading && newPairsData.length === 0);

  // Build a unified list of addresses to fetch realtime market data for (cap 200)
  const realtimeAddrs = useMemo(() => {
    const src: any[] = [
      ...(newPairsToShow as any[] || []),
      ...(combinedFinalStretch as any[] || []),
      ...(combinedMigrated as any[] || []),
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
  }, [newPairsToShow, combinedFinalStretch, combinedMigrated]);

  const { marketData, connected: wsConnected, error: wsError } = useRealtimeWebSocket(realtimeAddrs, {
    url: 'wss://demo-token-golang.interstate.so/v1/ws/market-data',
    reconnectInterval: 2000,
    maxReconnectAttempts: 10
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

    // Poll every 2 seconds for additional updates
    const interval = setInterval(pollMarketData, 2000);
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
  
  // Apply same limiting logic as new pairs to final stretch and migrated
  const finalStretchToShow = useMemo(() => {
    const source = httpFinalStretch.length ? httpFinalStretch : combinedFinalStretch;
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
    withTs.sort((a, b) => getTs(b) - getTs(a));
    withoutTs.sort((a, b) => {
      const fdvA = Number((a as any).fully_diluted_value) || 0;
      const fdvB = Number((b as any).fully_diluted_value) || 0;
      if (fdvB !== fdvA) return fdvB - fdvA;
      return String((a as any).symbol || (a as any).name || '').localeCompare(String((b as any).symbol || (b as any).name || ''));
    });
    const result = withTs.concat(withoutTs);
    // Limit to 30 tokens like new pairs
    return result.slice(0, 30);
  }, [httpFinalStretch, combinedFinalStretch, getTs]);

  const migratedToShow = useMemo(() => {
    const source = httpMigrated.length ? httpMigrated : combinedMigrated;
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
    withTs.sort((a, b) => getTs(b) - getTs(a));
    withoutTs.sort((a, b) => {
      const fdvA = Number((a as any).fully_diluted_value) || 0;
      const fdvB = Number((b as any).fully_diluted_value) || 0;
      if (fdvB !== fdvA) return fdvB - fdvA;
      return String((a as any).symbol || (a as any).name || '').localeCompare(String((b as any).symbol || (b as any).name || ''));
    });
    const result = withTs.concat(withoutTs);
    // Limit to 30 tokens like new pairs
    return result.slice(0, 30);
  }, [httpMigrated, combinedMigrated, getTs]);

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
        <meta name="description" content="Real-time token tracking with launchpad integration" />
      </Head>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        <Header />
        <div className="w-full p-4">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">Pulse</h1>
            <p className="text-neutral-400 mb-2">Real-time token tracking with launchpad integration</p>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${tokens.length > 0 ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                <span className="text-neutral-400">Regular Tokens: {tokens.length > 0 ? `${tokens.length} tokens` : 'Unavailable'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${(launchpadData?.new?.length || 0) + (launchpadData?.completing?.length || 0) + (launchpadData?.completed?.length || 0) > 0 ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                <span className="text-neutral-400">Launchpad: {(launchpadData?.new?.length || 0) + (launchpadData?.completing?.length || 0) + (launchpadData?.completed?.length || 0)} tokens</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-neutral-400">
                  Real-time Data: {wsConnected ? 'Connected' : 'Disconnected'}
                  {wsError && ` (${wsError})`}
                </span>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-row w-full overflow-x-auto scrollbar-thin scrollbar-track-neutral-900/50 scrollbar-thumb-neutral-700/50">
              <PulseTable title="New Pairs" tokens={[]} loading skeletonRowCount={10} isFirstOrLast="first" showBubbleMetrics={false} />
              <PulseTable title="Final Stretch" tokens={[]} loading skeletonRowCount={10} showBubbleMetrics={false} />
              <PulseTable title="Migrated" tokens={[]} loading skeletonRowCount={10} isFirstOrLast="last" showBubbleMetrics={false} />
            </div>
          ) : hasError ? (
            <div className="text-center text-red-400 py-10">
              <div className="text-xl font-semibold mb-2">Error Loading Launchpad Data</div>
              <div>{launchpadError}</div>
              <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors">Retry</button>
            </div>
          ) : (
            <div className="flex flex-row w-full overflow-x-auto scrollbar-thin scrollbar-track-neutral-900/50 scrollbar-thumb-neutral-700/50">
              <PulseTable title="New Pairs" tokens={enrichedNewPairsToShow as any} loading={newPairsLoading} isFirstOrLast="first" showBubbleMetrics={false} />
              <PulseTable title="Final Stretch" tokens={enrichedFinalStretch as any} showBubbleMetrics={false} />
              <PulseTable title="Migrated" tokens={enrichedMigrated as any} isFirstOrLast="last" showBubbleMetrics={false} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
