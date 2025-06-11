import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Header from '../components/Header';
import { getActivePositionsByUser } from '~/utils/functions';
import type { PositionRow } from '~/utils/functions';

const TABS = ['Wallet Manager', 'Live Trades'];

export default function TrackersPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 1) {
      setLoading(true);
      // Use a hardcoded userId for now
      getActivePositionsByUser('demo-user')
        .then(setPositions)
        .finally(() => setLoading(false));
    }
  }, [activeTab]);

  return (
    <>
      <Head>
        <title>Trackers | Interstate Memeboard</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        <Header />
        <div className="px-8 pt-8">
          {/* Tabs */}
          <div className="flex gap-4 mb-4">
            {TABS.map((tab, i) => (
              <button
                key={tab}
                className={`px-3 py-1.5 text-base font-semibold rounded ${activeTab === i ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}
                onClick={() => setActiveTab(i)}
              >
                {tab}
                {tab === 'Live Trades' && <span className="ml-1 text-pink-400 text-lg align-top">•</span>}
              </button>
            ))}
            <div className="flex-1" />
            {/* Search and actions */}
            <input
              type="text"
              placeholder="Search by name or addr..."
              className="bg-neutral-900 border border-neutral-800 rounded px-4 py-1.5 text-sm text-neutral-200 focus:outline-none w-72 mr-4"
              disabled={activeTab === 1}
            />
            {activeTab === 0 && (
              <>
                <button className="bg-neutral-800 text-white font-semibold rounded px-4 py-1.5 mr-2">Import</button>
                <button className="bg-neutral-800 text-white font-semibold rounded px-4 py-1.5 mr-2">Export</button>
                <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded px-4 py-1.5">Add Wallet</button>
              </>
            )}
          </div>

          {/* Tab Content */}
          {activeTab === 0 ? (
            <div className="bg-neutral-900 rounded-lg p-4 min-h-[400px]">
              <div className="flex items-center border-b border-neutral-800 pb-2 mb-2">
                <div className="flex-1 flex gap-8 text-neutral-400 text-sm">
                  <span className="w-32">Created</span>
                  <span className="w-48">Name</span>
                </div>
                <div className="flex gap-4 items-center">
                  <span className="text-neutral-400 text-sm">Actions</span>
                  <button className="ml-4 text-red-400 text-sm font-semibold hover:underline">Remove All</button>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center h-64">
                <span className="text-neutral-400">No wallets added yet.</span>
              </div>
            </div>
          ) : (
            <div className="bg-neutral-900 rounded-lg p-4 min-h-[400px]">
              <div className="flex items-center border-b border-neutral-800 pb-2 mb-2">
                <div className="flex-1 flex gap-8 text-neutral-400 text-sm">
                  <span className="w-48">Name</span>
                  <span className="w-48">Token</span>
                  <span className="w-32">Amount</span>
                  <span className="w-32">MC</span>
                </div>
              </div>
              {loading ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <span className="text-neutral-400">Loading...</span>
                </div>
              ) : positions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <span className="text-neutral-400">No transactions yet.</span>
                </div>
              ) : (
                <table className="w-full text-xs mt-2">
                  <tbody>
                    {positions.map((pos, idx) => (
                      <tr key={pos.tokenAddress || idx} className="border-b border-neutral-800 hover:bg-neutral-800/60">
                        <td className="w-48 px-2 py-2 font-mono">WalletName</td>
                        <td className="w-48 px-2 py-2 font-mono">{pos.tokenAddress}</td>
                        <td className="w-32 px-2 py-2">{pos.remaining}</td>
                        <td className="w-32 px-2 py-2">${pos.remainingUsdValue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
} 