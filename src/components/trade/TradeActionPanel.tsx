import React, { useState } from 'react';
import type { Token } from '~/utils/db';

interface TradeActionPanelProps {
  token: Token;
}

const TradeActionPanel: React.FC<TradeActionPanelProps> = ({ token }) => {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [tab, setTab] = useState<'market' | 'limit' | 'adv'>('market');
  return (
    <div className="flex h-full w-[380px] flex-shrink-0 flex-col border-l border-neutral-800 bg-neutral-950 p-4">
      {/* Stats Box */}
      <div className="mb-4 rounded-lg bg-neutral-900 p-4 text-xs">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] text-neutral-400">5m Vol</span>
          <span className="text-[11px] text-neutral-400">Buys</span>
          <span className="text-[11px] text-neutral-400">Sells</span>
          <span className="text-[11px] text-neutral-400">Net Vol.</span>
        </div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-semibold text-white">$0</span>
          <span className="text-emerald-400">0 / $0</span>
          <span className="text-red-400">0 / $0</span>
          <span className="text-emerald-400">-$0</span>
        </div>
      </div>
      {/* Trade Box */}
      <div className="mb-4 flex flex-col gap-2 rounded-lg bg-neutral-900 p-6 shadow-lg">
        {/* Toggle */}
        <div className="mb-4 flex w-full overflow-hidden rounded-[4px] border border-neutral-800">
          <button
            className={`w-full px-6 py-2 text-sm font-bold transition-all ${mode === 'buy' ? 'bg-emerald-500 text-white' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}
            onClick={() => setMode('buy')}
            type="button"
          >
            Buy
          </button>
          <button
            className={`w-full px-6 py-2 text-sm font-bold transition-all ${mode === 'sell' ? 'bg-red-500 text-white' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}
            onClick={() => setMode('sell')}
            type="button"
          >
            Sell
          </button>
        </div>
        {/* Tabs: Market, Limit, Adv. */}
        <div className="flex items-center gap-4 mb-3 text-sm font-semibold">
          <button className={tab === 'market' ? 'border-b-2 border-emerald-400 text-emerald-400 pb-1' : 'text-neutral-400 pb-1'} onClick={() => setTab('market')}>Market</button>
          <button className={tab === 'limit' ? 'border-b-2 border-emerald-400 text-emerald-400 pb-1' : 'text-neutral-400 pb-1'} onClick={() => setTab('limit')}>Limit</button>
          <button className={tab === 'adv' ? 'border-b-2 border-emerald-400 text-emerald-400 pb-1' : 'text-neutral-400 pb-1'} onClick={() => setTab('adv')}>Adv.</button>
        </div>
        {/* Amount Row */}
        <div className="mb-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs font-semibold text-neutral-400">AMOUNT</span>
            <span className="text-xs font-bold text-white">{amount || '-'}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {[0.01, 0.1, 1, 10].map(opt => (
              <button
                key={opt}
                className={`rounded border border-neutral-700 px-4 py-1 text-xs font-semibold text-white transition-all ${amount === String(opt) ? (mode === 'buy' ? 'bg-emerald-600' : 'bg-red-500') : ''}`}
                onClick={() => setAmount(String(opt))}
                type="button"
              >
                {opt}
              </button>
            ))}
            <input
              type="number"
              min="0"
              step="any"
              className="ml-2 w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs font-semibold text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="0.0"
              value={['0.01','0.1','1','10'].includes(amount) ? '' : amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>
        </div>
        {/* Advanced Trading Strategy */}
        <div className="flex items-center gap-2 mt-2">
          <input type="checkbox" id="adv-strategy" className="accent-emerald-500" />
          <label htmlFor="adv-strategy" className="text-xs text-neutral-400">Advanced Trading Strategy</label>
        </div>
        {/* Action Button */}
        <button
          className={`mt-2 w-full rounded py-3 text-xs font-bold transition disabled:opacity-50 ${mode === 'buy' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
          disabled={!amount}
        >
          {mode === 'buy' ? `Buy ${token.symbol}` : `Sell ${token.symbol}`}
        </button>
      </div>
      {/* Token Info Box (mocked) */}
      <div className="rounded-lg bg-neutral-900 p-4">
        <div className="mb-2 text-xs text-neutral-400">Token Info</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
            <span className="font-bold text-emerald-400">9.39%</span>
            <span className="text-neutral-400">Top 10 H.</span>
          </div>
          <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
            <span className="font-bold text-neutral-400">0%</span>
            <span className="text-neutral-400">Dev H.</span>
          </div>
          <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
            <span className="font-bold text-red-400">20.37%</span>
            <span className="text-neutral-400">Snipers H.</span>
          </div>
          <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
            <span className="font-bold text-red-400">20.02%</span>
            <span className="text-neutral-400">Insiders</span>
          </div>
          <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
            <span className="font-bold text-red-400">29.55%</span>
            <span className="text-neutral-400">Bundlers</span>
          </div>
          <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
            <span className="font-bold text-red-400">LP Burned</span>
            <span className="text-neutral-400">LP Burned</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradeActionPanel; 