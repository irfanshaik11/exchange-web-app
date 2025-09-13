import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import LaunchpadTable from '../components/LaunchpadTable';
import Header from '../components/Header';
import { env } from '../env';

interface LaunchpadToken {
  mint: string;
  name: string;
  symbol: string;
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

export default function LaunchpadPage() {
  const [launchpadData, setLaunchpadData] = useState<LaunchpadData>({
    new: [],
    completing: [],
    completed: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});

  // Fetch launchpad data
  useEffect(() => {
    const fetchLaunchpadData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch all launchpad data using proxy
        const response = await fetch(`/api/launchpad/tokens?limit=50`);
        if (!response.ok) {
          throw new Error('Failed to fetch launchpad data');
        }
        
        const data: LaunchpadData = await response.json();
        setLaunchpadData(data);
        
        // Fetch stats using proxy
        const statsResponse = await fetch(`/api/launchpad/stats`);
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setStats(statsData);
        }
      } catch (err) {
        console.error('Error fetching launchpad data:', err);
        setError('Failed to load launchpad data');
      } finally {
        setLoading(false);
      }
    };

    fetchLaunchpadData();
    
    // Set up polling for real-time updates
    const interval = setInterval(fetchLaunchpadData, 30000); // Poll every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <Head>
        <title>Launchpad | Interstate Memeboard</title>
        <meta name="description" content="Real-time launchpad token tracking across multiple protocols" />
      </Head>
      
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        <Header />
        
        <div className="w-full p-4">
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">Launchpad</h1>
            <p className="text-neutral-400 mb-4">
              Real-time token tracking across multiple launchpad protocols
            </p>
            
            {/* Stats */}
            {Object.keys(stats).length > 0 && (
              <div className="flex gap-4 mb-6">
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-sm text-neutral-400">New Tokens</div>
                  <div className="text-xl font-bold text-blue-400">{stats.new || 0}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-sm text-neutral-400">Completing</div>
                  <div className="text-xl font-bold text-yellow-400">{stats.completing || 0}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-sm text-neutral-400">Completed</div>
                  <div className="text-xl font-bold text-green-400">{stats.completed || 0}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-sm text-neutral-400">Migrated</div>
                  <div className="text-xl font-bold text-purple-400">{stats.migrated || 0}</div>
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex flex-row w-full overflow-x-auto scrollbar-thin scrollbar-track-neutral-900/50 scrollbar-thumb-neutral-700/50">
              <LaunchpadTable 
                title="New Tokens" 
                tokens={[]} 
                loading 
                skeletonRowCount={10} 
                isFirstOrLast="first" 
              />
              <LaunchpadTable 
                title="Completing" 
                tokens={[]} 
                loading 
                skeletonRowCount={10} 
              />
              <LaunchpadTable 
                title="Completed" 
                tokens={[]} 
                loading 
                skeletonRowCount={10} 
                isFirstOrLast="last" 
              />
            </div>
          ) : error ? (
            <div className="text-center text-red-400 py-10">
              <div className="text-xl font-semibold mb-2">Error Loading Data</div>
              <div>{error}</div>
              <button 
                onClick={() => window.location.reload()} 
                className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="flex flex-row w-full overflow-x-auto scrollbar-thin scrollbar-track-neutral-900/50 scrollbar-thumb-neutral-700/50">
              <LaunchpadTable 
                title="New Tokens" 
                tokens={launchpadData.new} 
                isFirstOrLast="first" 
              />
              <LaunchpadTable 
                title="Completing" 
                tokens={launchpadData.completing} 
              />
              <LaunchpadTable 
                title="Completed" 
                tokens={launchpadData.completed} 
                isFirstOrLast="last" 
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
