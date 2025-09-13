import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import PulseTable from '../components/PulseTable';
import type { Token } from '~/utils/db';
import Header from '../components/Header';
import usePaginatedTokensWebSocket from '../hooks/usePaginatedTokensWebSocket';
import { env } from '../env';

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
  
  // Launchpad data state
  const [launchpadData, setLaunchpadData] = useState<LaunchpadData>({
    new: [],
    completing: [],
    completed: []
  });
  const [launchpadLoading, setLaunchpadLoading] = useState(true);
  const [launchpadError, setLaunchpadError] = useState<string | null>(null);

  // Use WebSocket for New Pairs
  const { data: newPairsTokens, loading: wsLoading, error: wsError } = usePaginatedTokensWebSocket({ filter: 'new', limit: 20 });

  // Fetch regular tokens (optional - graceful fallback)
  useEffect(() => {
    setLoading(true);
    setError(null);
    // Use same-origin proxy to avoid mixed-content/TLS issues
    const url = `/api/token-service/getAllTokens?filter=trending&order=desc&limit=200`;
    fetch(url)
      .then(res => {
        if (!res.ok) {
          console.warn('Regular token service unavailable, using launchpad data only');
          return { result: [] }; // Graceful fallback
        }
        return res.json();
      })
      .then((data: { result: Token[] } | Token[]) => {
        const arr = Array.isArray(data) ? (data as Token[]) : (data.result || []);
        setTokens(arr);
      })
      .catch(() => {
        console.warn('Regular token service unavailable, using launchpad data only');
        setTokens([]); // Graceful fallback
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch launchpad data
  useEffect(() => {
    const fetchLaunchpadData = async () => {
      setLaunchpadLoading(true);
      setLaunchpadError(null);
      
      try {
        const response = await fetch(`/api/launchpad/tokens?limit=50`);
        if (!response.ok) {
          throw new Error('Failed to fetch launchpad data');
        }
        
        const data: LaunchpadData = await response.json();
        setLaunchpadData(data);
      } catch (err) {
        console.error('Error fetching launchpad data:', err);
        setLaunchpadError('Failed to load launchpad data');
      } finally {
        setLaunchpadLoading(false);
      }
    };

    fetchLaunchpadData();
    
    // Set up polling for real-time updates
    const interval = setInterval(fetchLaunchpadData, 30000); // Poll every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Convert launchpad tokens to Token format for PulseTable
  const convertLaunchpadToToken = (launchpadToken: LaunchpadToken): Token => ({
    id: 0, // Default ID for launchpad tokens
    mint: launchpadToken.mint,
    standard: 'SPL',
    name: launchpadToken.name || 'Unknown',
    symbol: launchpadToken.symbol || 'UNK',
    logo: launchpadToken.image || '', // Map image to logo field
    decimals: 6, // Default for launchpad tokens
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
    price_percent_change_1h: launchpadToken.priceChange24h,
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
    bonding_curve_progress: (launchpadToken.graduationPercent / 100).toString(), // Convert to decimal
    global_fees_paid: 0,
    uri: null,
  });

  // Segregate regular tokens
  const newPairs = tokens.filter(t => {
    const prog = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : t.bonding_curve_progress;
    return prog < 0.6;
  });
  const finalStretch = tokens.filter(t => {
    const prog = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : t.bonding_curve_progress;
    return prog >= 0.6 && prog < 0.85;
  });
  const migrated = tokens.filter(t => {
    const prog = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : t.bonding_curve_progress;
    return prog >= 0.85;
  });

  // Convert and combine launchpad tokens
  const launchpadNewPairs = launchpadData.new.map(convertLaunchpadToToken);
  const launchpadFinalStretch = launchpadData.completing.map(convertLaunchpadToToken);
  const launchpadMigrated = launchpadData.completed.map(convertLaunchpadToToken);

  // Combine regular tokens with launchpad tokens
  const combinedNewPairs = [...newPairs, ...launchpadNewPairs];
  const combinedFinalStretch = [...finalStretch, ...launchpadFinalStretch];
  const combinedMigrated = [...migrated, ...launchpadMigrated];

  // Debug logging
  console.log('Total regular tokens:', tokens.length);
  console.log('Total launchpad tokens:', launchpadData.new.length + launchpadData.completing.length + launchpadData.completed.length);
  console.log('Combined New Pairs:', combinedNewPairs.length);
  console.log('Combined Final Stretch:', combinedFinalStretch.length);
  console.log('Combined Migrated:', combinedMigrated.length);

  const isLoading = (loading && wsLoading) || launchpadLoading;
  // Only show error if there's an actual error AND no data at all
  const hasError = launchpadError && !launchpadData.new.length && !launchpadData.completing.length && !launchpadData.completed.length;
  
  // Debug logging
  console.log('Pulse page state:', {
    loading,
    wsLoading,
    launchpadLoading,
    isLoading,
    launchpadError,
    launchpadDataLength: launchpadData.new.length + launchpadData.completing.length + launchpadData.completed.length,
    hasError
  });

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
            <p className="text-neutral-400 mb-2">
              Real-time token tracking with launchpad integration
            </p>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${tokens.length > 0 ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                <span className="text-neutral-400">
                  Regular Tokens: {tokens.length > 0 ? `${tokens.length} tokens` : 'Unavailable'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${launchpadData.new.length + launchpadData.completing.length + launchpadData.completed.length > 0 ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                <span className="text-neutral-400">
                  Launchpad: {launchpadData.new.length + launchpadData.completing.length + launchpadData.completed.length} tokens
                </span>
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
              <button 
                onClick={() => window.location.reload()} 
                className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="flex flex-row w-full overflow-x-auto scrollbar-thin scrollbar-track-neutral-900/50 scrollbar-thumb-neutral-700/50">
              <PulseTable 
                title="New Pairs" 
                tokens={(newPairsTokens && (newPairsTokens as any[]).length ? (newPairsTokens as any) : combinedNewPairs)} 
                isFirstOrLast="first" 
              />
              <PulseTable 
                title="Final Stretch" 
                tokens={combinedFinalStretch} 
              />
              <PulseTable 
                title="Migrated" 
                tokens={combinedMigrated} 
                isFirstOrLast="last" 
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
} 
