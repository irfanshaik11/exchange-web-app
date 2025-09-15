import React, { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import PulseTable from '../components/PulseTable';
import type { Token } from '~/utils/db';
import Header from '../components/Header';
import usePaginatedTokensWebSocket from '../hooks/usePaginatedTokensWebSocket';

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

export default function PulsePage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [httpNew, setHttpNew] = useState<any[]>([]);
  const [httpNewTick, setHttpNewTick] = useState(0);
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
    const url = `/api/token-service/getAllTokens?filter=trending&order=desc&limit=200`;
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
        const response = await fetch(`/api/launchpad/tokens?limit=50`);
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
        const res = await fetch(`/api/token-service/pulse-new?limit=50`);
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

  // Fast polling fallback for Migrated tokens (cache-bypass)
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/token-service/pulse-migrated?limit=50`);
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
  const convertLaunchpadToToken = (launchpadToken: LaunchpadToken): Token => ({
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
    bonding_curve_progress: (launchpadToken.graduationPercent / 100).toString(),
    global_fees_paid: 0,
    uri: null,
    // extra field used by PulseTable TokenImage for DB logos
    image: launchpadToken.image,
  } as any);

  // Segregate regular tokens
  const newPairs = tokens.filter(t => {
    const v = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : (t.bonding_curve_progress as number);
    const prog = isFinite(v as number) ? Number(v) : 0;
    return prog < 0.6;
  });
  const finalStretch = tokens.filter(t => {
    const v = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : (t.bonding_curve_progress as number);
    const prog = isFinite(v as number) ? Number(v) : 0;
    return prog >= 0.6 && prog < 0.85;
  });
  const migrated = tokens.filter(t => {
    const v = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : (t.bonding_curve_progress as number);
    const prog = isFinite(v as number) ? Number(v) : 0;
    return prog >= 0.85;
  });

  // Convert and combine launchpad tokens
  const launchpadNewPairs = launchpadData.new.map(convertLaunchpadToToken);
  const launchpadFinalStretch = launchpadData.completing.map(convertLaunchpadToToken);
  const launchpadMigrated = launchpadData.completed.map(convertLaunchpadToToken);

  // Convert HTTP migrated tokens to Token format
  const httpMigratedTokens = httpMigrated.map((token: any) => ({
    id: 0,
    mint: token.mint,
    standard: 'SPL',
    name: token.name || 'Unknown',
    symbol: token.symbol || 'UNK',
    logo: token.image || token.uri || '',
    decimals: 6,
    metaplex: null,
    fully_diluted_value: token.market_cap_usd || 0,
    total_supply: 0,
    total_supply_formatted: 0,
    links: null,
    description: '',
    is_verified_contract: false,
    possible_spam: false,
    total_buy_volume_5m: 0,
    total_buy_volume_1h: 0,
    total_buy_volume_6h: 0,
    total_buy_volume_24h: token.volume_24h || 0,
    total_sell_volume_5m: 0,
    total_sell_volume_1h: 0,
    total_sell_volume_6h: 0,
    total_sell_volume_24h: 0,
    price_usd: token.price_usd || 0,
    price_change_1h: token.price_change_24h || 0,
    price_change_6h: 0,
    price_change_24h: 0,
    market_cap_usd: token.market_cap_usd || 0,
    bonding_curve_progress: token.bonding_pct || 100,
    created_at: token.launch_time || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Token));

  // Combine regular tokens with launchpad tokens and HTTP migrated tokens
  const combinedNewPairs = [...newPairs, ...launchpadNewPairs];
  const combinedFinalStretch = [...finalStretch, ...launchpadFinalStretch];
  const combinedMigrated = [...httpMigratedTokens, ...launchpadMigrated];

  const isLoading = (loading && wsLoading) || launchpadLoading;
  const hasError = launchpadError && !launchpadData.new.length && !launchpadData.completing.length && !launchpadData.completed.length;

  // Enrich WS new pairs with created_at/image from known sources when available
  const byAddr = new Map<string, any>();
  const pushMap = (arr: any[]) => arr.forEach(t => { const a = (t as any)?.pair_address || (t as any)?.mint; if (a && !byAddr.has(a)) byAddr.set(a, t); });
  pushMap(tokens as any[]);
  pushMap(launchpadNewPairs as any[]);
  pushMap(launchpadFinalStretch as any[]);
  pushMap(launchpadMigrated as any[]);
  const wsNewRaw: any[] = Array.isArray(newPairsTokens) ? (newPairsTokens as any[]) : [];
  const wsNewEnriched = wsNewRaw.map((t) => {
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
        // console.log(`[Pulse] new-pairs source=${srcName} sizes http=${httpNew.length} ws=${wsNewEnriched.length} combined=${combinedNewPairs.length}`);
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

  const newPairsData = buildNewPairs();
  // Keep last non-empty list to prevent flicker when WS/HTTP blips
  const [lastNonEmptyNewPairs, setLastNonEmptyNewPairs] = useState<any[]>([]);
  const hasSeededRef = useRef(false);
  useEffect(() => {
    if (newPairsData && newPairsData.length > 0) {
      setLastNonEmptyNewPairs(newPairsData);
    } else if (!hasSeededRef.current && combinedNewPairs.length > 0) {
      // Seed with combined list once if nothing else is available
      setLastNonEmptyNewPairs(combinedNewPairs);
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
                <div className={`w-2 h-2 rounded-full ${launchpadData.new.length + launchpadData.completing.length + launchpadData.completed.length > 0 ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                <span className="text-neutral-400">Launchpad: {launchpadData.new.length + launchpadData.completing.length + launchpadData.completed.length} tokens</span>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-row w-full overflow-x-auto scrollbar-thin scrollbar-track-neutral-900/50 scrollbar-thumb-neutral-700/50">
              <PulseTable title="New Pairs" tokens={[]} loading skeletonRowCount={10} isFirstOrLast="first" />
              <PulseTable title="Final Stretch" tokens={[]} loading skeletonRowCount={10} />
              <PulseTable title="Migrated" tokens={[]} loading skeletonRowCount={10} isFirstOrLast="last" />
            </div>
          ) : hasError ? (
            <div className="text-center text-red-400 py-10">
              <div className="text-xl font-semibold mb-2">Error Loading Launchpad Data</div>
              <div>{launchpadError}</div>
              <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors">Retry</button>
            </div>
          ) : (
            <div className="flex flex-row w-full overflow-x-auto scrollbar-thin scrollbar-track-neutral-900/50 scrollbar-thumb-neutral-700/50">
              <PulseTable title="New Pairs" tokens={newPairsToShow as any} loading={newPairsLoading} isFirstOrLast="first" />
              <PulseTable title="Final Stretch" tokens={combinedFinalStretch} />
              <PulseTable title="Migrated" tokens={combinedMigrated} isFirstOrLast="last" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
