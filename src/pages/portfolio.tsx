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
            <>
              {/* Top Panels */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {/* Balance */}
                <div className="bg-neutral-900 rounded-lg p-6 flex flex-col min-h-[180px]">
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
                <div className="bg-neutral-900 rounded-lg p-6 flex flex-col min-h-[180px]">
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
                <div className="bg-neutral-900 rounded-lg p-6 flex flex-col min-h-[180px]">
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
              <div className="bg-neutral-900 rounded-lg p-4 mt-2">
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
              <div className="bg-neutral-900 rounded-lg p-4 mt-4">
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
            </>
          )}

          {/* Wallet Section (empty for now) */}
          {activeSection === 'wallet' && (
            <div className="text-neutral-500 py-20 text-center">Wallet section coming soon.</div>
          )}
        </div>
      </div>
    </>
  );
} 