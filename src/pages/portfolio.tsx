import React, { useState } from 'react';
import Head from 'next/head';
import Header from '../components/Header';
import Positions from '../components/trade/Positions';
import { useUser } from '../components/UserContext';
import InterstateTooltip from '~/components/InterstateTooltip';

const spotTabs = ['Active Positions', 'History', 'Top 100'];
const activityTabs = ['Activity'];

export default function PortfolioPage() {
  const [activeSection, setActiveSection] = useState<'spot' | 'wallet'>('spot');
  const [activeSpotTab, setActiveSpotTab] = useState(0);
  const [activeActivityTab, setActiveActivityTab] = useState(0);
  const { user, loading: userLoading } = useUser();

  return (
    <>
      <Head>
        <title>Portfolio | Interstate Memeboard</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        <Header />
        <div className="px-8 pt-4">
          {/* Section Tabs */}
          <div className="flex gap-8 mb-6 text-2xl font-semibold">
            <button
              className={activeSection === 'spot' ? 'text-white' : 'text-neutral-400 hover:text-white transition'}
              onClick={() => setActiveSection('spot')}
            >
              Spot
            </button>
            <button
              className={activeSection === 'wallet' ? 'text-white' : 'text-neutral-400 hover:text-white transition'}
              onClick={() => setActiveSection('wallet')}
            >
              Wallets
            </button>
            <InterstateTooltip label="Coming soon">
            <button
              className="text-neutral-600 cursor-default"
              disabled
            >
                Perpetuals
              </button>
            </InterstateTooltip>
          </div>

          {/* Spot Section */}
          {activeSection === 'spot' && (
            <div className="border border-emerald-950 p-4">
              {/* Top Panels */}
              <div className="flex flex-row w-full border-b border-emerald-950 mb-0 ">

                {/* Balance */}
                <div className="flex-1 flex flex-col min-h-[180px] border-r border-emerald-950">
                  <div className="text-base font-semibold mb-2">Balance</div>
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="text-xs text-neutral-400">Total Value</div>
                      <div className="text-2xl font-bold">$0</div>
                    </div>
                    <div>
                      <div className="text-xs text-neutral-400">Unrealized PNL</div>
                      <div className="text-lg font-bold">$0</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="text-xs text-neutral-400">Available Balance</div>
                    <div className="text-lg font-bold">$0</div>
                  </div>
                </div>
                {/* Realized PNL */}
                <div className="flex-1 flex flex-col min-h-[180px] border-r border-emerald-950">
                  <div className="text-base font-semibold mb-2">Realized PNL</div>
                  <div className="flex-1 flex items-center justify-center">
                    {/* Placeholder for chart */}
                    <span className="text-neutral-600 text-4xl">─</span>
                  </div>
                  <div className="flex justify-end">
                    <span className="text-neutral-600 text-xs">TradingView</span>
                  </div>
                </div>
                {/* Performance */}
                <div className="flex-1 flex flex-col min-h-[180px]">
                  <div className="text-base font-semibold mb-2">Performance</div>
                  <div className="flex-1 flex flex-col gap-1 text-xs">
                    <div className="flex justify-between"><span>Total PNL</span><span className="text-white">$0.00</span></div>
                    <div className="flex justify-between"><span>Total TXNS</span><span className="text-green-400">0</span><span className="text-red-400">/ 0</span></div>
                    <div className="mt-2">
                      <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span> {'>'}500% <span className="ml-auto">0</span></div>
                      <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span> 200% ~ 500% <span className="ml-auto">0</span></div>
                      <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-neutral-400 inline-block"></span> 0% ~ 200% <span className="ml-auto">0</span></div>
                      <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-pink-900 inline-block"></span> 0% ~ -50% <span className="ml-auto">0</span></div>
                      <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-pink-600 inline-block"></span> {'<'}-50% <span className="ml-auto">0</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tables Section */}
              <div className="mt-2 border-b border-emerald-950">
                <div className="flex gap-8 border-b border-neutral-800 mb-2">
                  {spotTabs.map((tab, i) => (
                    <button
                      key={tab}
                      className={`py-2 px-1 text-base font-semibold transition border-b-2 ${activeSpotTab === i ? 'border-white text-white' : 'border-transparent text-neutral-400 hover:text-white'}`}
                      onClick={() => setActiveSpotTab(i)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                {/* Table Content */}
                <div className="overflow-x-auto">
                  {activeSpotTab === 0 && (
                    userLoading ? (
                      <div className="text-neutral-500 py-8 text-center">Loading...</div>
                    ) : !user?.id ? (
                      <div className="text-neutral-500 py-8 text-center">Please log in to view your positions.</div>
                    ) : (
                      <Positions userId={user.id} />
                    )
                  )}
                  {activeSpotTab === 1 && (
                    <div className="text-neutral-500 py-8 text-center">No history.</div>
                  )}
                  {activeSpotTab === 2 && (
                    <div className="text-neutral-500 py-8 text-center">No data.</div>
                  )}
                </div>
              </div>

              {/* Activity Section */}
              <div className="mt-4 border-b border-emerald-950">
                <div className="flex gap-8 border-b border-neutral-800 mb-2">
                  {activityTabs.map((tab, i) => (
                    <button
                      key={tab}
                      className={`py-2 px-1 text-base font-semibold transition border-b-2 ${activeActivityTab === i ? 'border-white text-white' : 'border-transparent text-neutral-400 hover:text-white'}`}
                      onClick={() => setActiveActivityTab(i)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-neutral-400 border-b border-neutral-800">
                        <th className="py-2 px-2 text-left">Type</th>
                        <th className="py-2 px-2 text-left">Token</th>
                        <th className="py-2 px-2 text-left">Amount</th>
                        <th className="py-2 px-2 text-left">Market Cap</th>
                        <th className="py-2 px-2 text-left">Age</th>
                        <th className="py-2 px-2 text-left">Event</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Placeholder row */}
                      <tr className="text-neutral-500">
                        <td className="py-3 px-2">-</td>
                        <td className="py-3 px-2">-</td>
                        <td className="py-3 px-2">-</td>
                        <td className="py-3 px-2">-</td>
                        <td className="py-3 px-2">-</td>
                        <td className="py-3 px-2">-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Wallet Section */}
          {activeSection === 'wallet' && (
            <div className="w-full border border-emerald-950 p-4">
              {/* Top Bar */}
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Search by name or address"
                  className="bg-neutral-900 border border-neutral-800 rounded px-4 py-2 text-sm text-neutral-200 focus:outline-none w-80"
                  disabled
                />
                <span className="ml-2 flex items-center gap-2">
                  <button className="text-neutral-400 text-xs flex items-center gap-1"><span className="opacity-60"><svg width="16" height="16" fill="none"><path d="M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></span>Show Archived</button>
                  <button className="bg-neutral-800 text-white font-semibold rounded px-4 py-1.5 text-sm ml-2">Import</button>
                  <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded px-4 py-1.5 text-sm ml-2">Create Wallet</button>
                </span>
              </div>
              {/* Wallets Table */}
              <div className="flex flex-row gap-4 w-full">
                {/* Wallets List */}
                <div className="flex-1 p-2 min-h-[400px] border-r border-emerald-950">
                  <div className="flex flex-col">
                    <div className="flex items-center border-b border-neutral-800 pb-2 mb-2">
                      <span className="w-1/3 text-neutral-400 text-sm">Wallet</span>
                      <span className="w-1/4 text-neutral-400 text-sm">Balance</span>
                      <span className="w-1/4 text-neutral-400 text-sm">Holdings</span>
                      <span className="w-1/6 text-neutral-400 text-sm">Actions</span>
                    </div>
                    {/* Only show if user is logged in */}
                    {user ? (
                      <div className="flex items-center border-b border-neutral-800 py-2 group hover:bg-neutral-800/60 transition">
                        <input type="checkbox" className="mr-2 accent-blue-600" />
                        <span className="w-1/3 flex items-center gap-2 font-semibold text-amber-400">
                          Axiom Main
                          <span className="text-xs text-neutral-500 font-mono">{user.publicKey.slice(0, 4)}...{user.publicKey.slice(-4)}</span>
                          <button className="ml-1 text-neutral-400 hover:text-white" title="Copy address"><svg width="14" height="14" fill="none"><path d="M3 3h8v8H3V3z" stroke="currentColor" strokeWidth="1.5"/><path d="M6 6h5v5H6V6z" stroke="currentColor" strokeWidth="1.5"/></svg></button>
                        </span>
                        <span className="w-1/4 flex items-center gap-1"><svg width="18" height="18" className="mr-1" viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="url(#solana-gradient)"/><defs><linearGradient id="solana-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#00FFA3"/><stop offset="100%" stopColor="#DC1FFF"/></linearGradient></defs></svg><span className="font-mono">0</span></span>
                        <span className="w-1/4 flex items-center"><span className="bg-neutral-800 rounded-full px-3 py-1 text-xs text-neutral-400">0</span></span>
                        <span className="w-1/6 flex items-center justify-center">
                          <button className="text-neutral-400 hover:text-white"><svg width="16" height="16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/></svg></button>
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-32 text-neutral-500">Please log in to view your wallets.</div>
                    )}
                  </div>
                </div>
                {/* Source Wallets (right panel) */}
                <div className="flex-1 p-2 min-h-[400px] flex flex-col">
                  <div className="flex items-center border-b border-neutral-800 pb-2 mb-2">
                    <span className="w-1/3 text-neutral-400 text-sm">Source wallets</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <svg width="40" height="40" fill="none" viewBox="0 0 40 40"><path d="M20 10v20M10 20h20" stroke="#444" strokeWidth="2" strokeLinecap="round"/></svg>
                    <span className="text-neutral-500 mt-2">Drag wallets to distribute SOL</span>
                  </div>
                  <div className="flex items-center justify-between mt-4 text-neutral-700 text-xs">
                    <span>Destination</span>
                    <button className="bg-neutral-900 text-neutral-700 rounded px-4 py-1.5 ml-auto" disabled>Start Transfer</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
} 