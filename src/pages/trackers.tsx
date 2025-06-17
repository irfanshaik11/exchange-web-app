import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Header from '../components/Header';
import { getActivePositionsByUser, getStoredWallets, storeWallets } from '~/utils/functions';
import type { PositionRow, Wallet } from '~/utils/functions';
import AddWalletModal from '../components/AddWalletModal';
import WalletRow from '../components/WalletRow';

const TABS = ['Wallet Manager', 'Live Trades'];

export default function TrackersPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddWalletModal, setShowAddWalletModal] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);

  useEffect(() => {
    // Load wallets from localStorage on component mount
    setWallets(getStoredWallets());
  }, []);

  useEffect(() => {
    if (activeTab === 1) {
      setLoading(true);
      // Use a hardcoded userId for now
      getActivePositionsByUser('demo-user')
        .then(setPositions)
        .finally(() => setLoading(false));
    }
  }, [activeTab]);

  const handleAddWallet = (address: string, name: string) => {
    const newWallet: Wallet = {
      address,
      name: name || `Wallet ${wallets.length + 1}`,
      createdAt: Date.now(),
    };
    const updatedWallets = [...wallets, newWallet];
    setWallets(updatedWallets);
    storeWallets(updatedWallets);
    setShowAddWalletModal(false);
  };

  const handleRemoveWallet = (addressToRemove: string) => {
    let updatedWallets: Wallet[];
    if (addressToRemove === 'all') {
      updatedWallets = [];
    } else {
      updatedWallets = wallets.filter(wallet => wallet.address !== addressToRemove);
    }
    setWallets(updatedWallets);
    storeWallets(updatedWallets);
  };

  // Helper to format date
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  return (
    <>
      <Head>
        <title>Trackers | Interstate Memeboard</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        <Header />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8">
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
                <button 
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded px-4 py-1.5"
                  onClick={() => setShowAddWalletModal(true)}
                >
                  Add Wallet
                </button>
              </>
            )}
          </div>

          {/* Main Content Area: Two Columns */}
          <div className="flex flex-row gap-4">
            {/* Left Column: Wallet Manager / Live Trades Table */}
            <div className="flex-1 bg-neutral-900 rounded-lg p-4 min-h-[400px] h-full">
              {activeTab === 0 ? (
                <>
                  <div className="flex items-center border-b border-neutral-800 pb-2 mb-2">
                    <div className="flex-1 flex gap-8 text-neutral-400 text-sm">
                      <span className="w-32">Created</span>
                      <span className="flex-1">Name</span>
                      <span className="w-24 text-right">Balance</span>
                    </div>
                    <div className="flex gap-4 items-center">
                      <span className="text-neutral-400 text-sm">Actions</span>
                      <button className="text-neutral-400 hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.04 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg></button>
                      <button className="text-neutral-400 hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.92c-1.01 0-1.85-.75-1.992-1.874L5.323 6.075m1.022-.165L5.754 5.105a1.125 1.125 0 011.992-.858L12 8.752l3.254-4.505a1.125 1.125 0 011.992.858z" /></svg></button>
                      <button className="ml-4 text-red-400 text-sm font-semibold hover:underline" onClick={() => handleRemoveWallet('all')}>Remove All</button>
                    </div>
                  </div>
                  {wallets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64">
                      <span className="text-neutral-400">No wallets added yet.</span>
                    </div>
                  ) : (
                    <table className="w-full text-xs mt-2">
                      <tbody>
                        {wallets.map((wallet) => (
                          <WalletRow key={wallet.address} wallet={wallet} onRemove={handleRemoveWallet} />
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-2">
                    <div className="flex-1 flex gap-8 text-neutral-400 text-sm">
                      <span className="w-48">Name</span>
                      <span className="w-48">Token</span>
                      <span className="w-32">Amount</span>
                      <span className="w-32">MC</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-neutral-400">Paused</span>
                      {/* Play/Pause icon - using a placeholder for now */}
                      <button className="text-neutral-400 hover:text-white">&#9646;&#9646;</button> {/* Paused icon */}
                      <span className="text-neutral-400">P1</span>
                      <span className="text-neutral-400">0.0</span>
                      <button className="text-neutral-400 hover:text-white">Customize Feed</button>
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
                </>
              )}
            </div>

            {/* Right Column: Twitter Alerts */}
            <div className="w-96 bg-neutral-900 rounded-lg p-4 h-full flex flex-col">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-2">
                <h3 className="text-lg font-semibold text-white">Twitter Alerts</h3>
                {/* Customize Feed Button - if needed */}
                {/* <button className="text-neutral-400 text-sm hover:text-white">Customize Feed</button> */}
              </div>
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <span className="text-neutral-400 mb-4">Start tracking accounts to see Twitter alerts!</span>
                <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded px-4 py-2">Add Twitter Handles</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <AddWalletModal
        isOpen={showAddWalletModal}
        onClose={() => setShowAddWalletModal(false)}
        onAddWallet={handleAddWallet}
      />

      {/* Bottom Navigation/Footer */}
      <div className="fixed bottom-0 left-0 w-full bg-neutral-900 border-t border-emerald-950 flex justify-between items-center px-4 py-2 text-xs z-40">
        <div className="flex gap-4">
          <button className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold">
            <span className="text-lg">📊</span> Wallet Tracker
          </button>
          <button className="flex items-center gap-1 text-sky-400 hover:text-sky-300 font-semibold">
            <span className="text-lg">🐦</span> Twitter Tracker
          </button>
          <button className="flex items-center gap-1 text-purple-400 hover:text-purple-300 font-semibold">
            <span className="text-lg">📈</span> PnL Tracker
          </button>
        </div>
        <div className="flex items-center gap-4 text-neutral-400">
          <span className="flex items-center gap-1">
            <span className="text-emerald-400">💰</span> $106.8K
          </span>
          <span className="flex items-center gap-1">
            <span className="text-blue-400">💎</span> $2581
          </span>
          <span className="flex items-center gap-1">
            <span className="text-green-400">💸</span> $152.42
          </span>
          <span className="flex items-center gap-1">
            <span className="text-neutral-400">🔗</span> Connection is stable
          </span>
          <span className="flex items-center gap-1">
            <span className="text-neutral-400">🌐</span> US-W
          </span>
          <span className="text-neutral-400">Docs</span>
        </div>
      </div>
    </>
  );
} 