import React, { useState } from 'react';
import { formatSmartNumber, type Token } from '~/utils/db';

interface TradeActionPanelProps {
  token: Token;
}

const TradeActionPanel: React.FC<TradeActionPanelProps> = ({ token }) => {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [tab, setTab] = useState<'market' | 'limit' | 'adv'>('market');

  // Calculate stats from token fields
  const buyVol = token.total_buy_volume_5m || 0;
  const sellVol = token.total_sell_volume_5m || 0;
  const vol5m = buyVol + sellVol;
  const buysCount = token.total_buys_5m || 0;
  const buysValue = buyVol;
  const sellsCount = token.total_sells_5m || 0;
  const sellsValue = sellVol;
  const netVol = Number(buyVol) - Number(sellVol);
  const totalValue = Number(buyVol) + Number(sellVol);
  const buyPct = Number(totalValue) ? (Number(buyVol) / Number(totalValue)) * 100 : 50;
  const sellPct = Number(totalValue) ? (Number(sellVol) / Number(totalValue)) * 100 : 50;

  return (
    <div className="flex h-full w-[380px] flex-shrink-0 flex-col border-l border-neutral-800 bg-neutral-950">
      {/* Stats Bar - Redesigned */}
      <div className="border-b border-emerald-950 p-4">
        <div className="flex items-end justify-between text-xs ">
          <div className="flex flex-col items-start">
            <span className="text-gray-500 text-xs">5m Vol</span>
            <span className="text-white text-xs">{formatSmartNumber(vol5m)}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-gray-500 text-xs">Buys</span>
            <span className="text-white text-xs">{buysCount} <span className="text-xs text-gray-500">/</span> <span className="text-white text-xs">{formatSmartNumber(buysValue)}</span></span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-gray-500 text-xs">Sells</span>
            <span className="text-white text-xs">{sellsCount} <span className="text-xs text-gray-500">/</span> <span className="text-white text-xs">{formatSmartNumber(sellsValue)}</span></span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-gray-500 text-xs">Net Vol.</span>
            <span className={`text-white text-xs`}>{netVol < 0 ? "-" : ""}${Math.abs(netVol).toLocaleString(undefined, {maximumFractionDigits:2})}</span>
          </div>
        </div>
        {/* Progress Bar */}
        <div className="mt-2 flex h-[3px] w-full overflow-hidden rounded gap-1">
          <div
            className="bg-emerald-400"
            style={{ width: `${buyPct}%`, transition: "width 0.3s" }}
          />
          <div
            className="bg-red-500"
            style={{ width: `${sellPct}%`, transition: "width 0.3s" }}
          />
        </div>
      </div>
      {/* Trade Box */}
      <div className="pb-4 flex flex-col border-b border-emerald-950 shadow-lg">
        {/* Toggle */}
        <div className=" flex border-emerald-950 border-b p-2">
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
        <div className="flex items-center gap-4 border-b border-emerald-950 text-sm font-semibold pt-2 px-4">
          <button className={tab === 'market' ? 'border-b-2 border-emerald-400 text-emerald-400 pb-1' : 'text-neutral-400 pb-1'} onClick={() => setTab('market')}>Market</button>
          <button className={tab === 'limit' ? 'border-b-2 border-emerald-400 text-emerald-400 pb-1' : 'text-neutral-400 pb-1'} onClick={() => setTab('limit')}>Limit</button>
          <button className={tab === 'adv' ? 'border-b-2 border-emerald-400 text-emerald-400 pb-1' : 'text-neutral-400 pb-1'} onClick={() => setTab('adv')}>Adv.</button>
        </div>
        {/* Amount Row */}
        <div className="mb-2 mx-4 my-3 bg-neutral-800 p-2 pb-0 px-0">
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-neutral-400">AMOUNT</span>
            <span className="text-xs font-bold text-white">{amount || '-'}</span>
          </div>
          <div className="mt-2 flex items-center w-full">
            {[0.01, 0.1, 1, 10].map(opt => (
              <button
                key={opt}
                className={`cursor-pointer hover:bg-neutral-800 bg-neutral-950 border border-neutral-800 px-4 py-1 text-xs font-semibold text-white transition-all ${amount === String(opt) ? (mode === 'buy' ? 'bg-emerald-600' : 'bg-red-500') : ''}`}
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
              className=" border bg-neutral-950 border-neutral-800 px-2 py-1 text-xs font-semibold text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="0.0"
              value={['0.01','0.1','1','10'].includes(amount) ? '' : amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>
        </div>
        {/* Advanced Trading Strategy */}
        <div className="flex items-center gap-2 mt-1 mx-4">
          <input type="checkbox" id="adv-strategy" className="accent-emerald-500" />
          <label htmlFor="adv-strategy" className="text-xs text-neutral-400">Advanced Trading Strategy</label>
        </div>
        {/* Action Button */}
        <button
          className={`mt-2 w-full mx-4 py-3 text-xs font-bold transition disabled:opacity-50 ${mode === 'buy' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-red-500 text-white hover:bg-pink-700'}`}
          disabled={!amount}
        >
          {mode === 'buy' ? `Buy ${token.name}` : `Sell ${token.name}`}
        </button>
      </div>
      {/* Token Info Box (mocked) */}
      <div className="border-b border-emerald-950 p-4">
        <div className="mb-2 text-xs text-neutral-400">Token Info</div>
        {/* TODO: Replace the following mocked values with real data from the Token type if available */}
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