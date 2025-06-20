import React, { useEffect, useState } from 'react';
import type { Wallet } from '~/utils/functions';
import InterstatePopout from './InterstatePopout';
import { FaRegCopy, FaCheck, FaStar, FaSearch, FaRegChartBar } from 'react-icons/fa';
import { FiExternalLink } from 'react-icons/fi';
import PriceChartWidget from './PriceChartWidget';
import type { Token } from '~/utils/db';

interface WalletScanPanelProps {
  wallet: Wallet;
  onClose: () => void;
}

const TABS = ["Active Positions", "History", "Top 100", "Activity"];

const WalletScanPanel: React.FC<WalletScanPanelProps> = ({ wallet, onClose }) => {
  // Live data state
  const [balance, setBalance] = useState<number | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("Activity");
  const [token, setToken] = useState<Token | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [tokenBalanceLoading, setTokenBalanceLoading] = useState(true);
  const [tokenBalanceError, setTokenBalanceError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    if (!wallet?.address) return;
    setLoading(true);
    setError(null);
    fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [wallet.address]
      })
    })
      .then(async res => {
        if (!res.ok) throw new Error('Failed to fetch balance');
        const text = await res.text();
        if (!text) throw new Error('Empty response for balance');
        return JSON.parse(text);
      })
      .then(data => setBalance(data?.result?.value ? data.result.value / 1e9 : 0))
      .catch(() => setBalance(null));
    fetch(`https://public-api.solscan.io/account/transactions?address=${wallet.address}&limit=10`)
      .then(async res => {
        if (!res.ok) throw new Error('Failed to fetch activity');
        const text = await res.text();
        if (!text) throw new Error('Empty response for activity');
        return JSON.parse(text);
      })
      .then(data => Array.isArray(data) ? setActivity(data) : setActivity([]))
      .catch(() => setActivity([]))
      .finally(() => setLoading(false));
  }, [wallet.address]);

  useEffect(() => {
    if (!wallet.address) return;
    setTokenLoading(true);
    setTokenError(null);
    fetch(`/api/token/${wallet.address}`)
      .then(res => res.json())
      .then((data) => {
        if (data?.result) setToken(data.result);
        else setTokenError('Token not found');
      })
      .catch(() => setTokenError('Failed to fetch token info'))
      .finally(() => setTokenLoading(false));
  }, [wallet.address]);

  // Fetch SPL token balance
  useEffect(() => {
    if (!wallet.address || !token || !token.token_address) return;
    setTokenBalanceLoading(true);
    setTokenBalanceError(null);
    // 1. Get token accounts by owner
    fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          wallet.address,
          { mint: token.token_address },
          { encoding: 'jsonParsed' }
        ]
      })
    })
      .then(res => res.json())
      .then(data => {
        const accounts = data?.result?.value;
        if (!accounts || accounts.length === 0) {
          setTokenBalance(0);
          return;
        }
        // Use the first account (most users have one)
        const amount = accounts[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
        setTokenBalance(typeof amount === 'number' ? amount : 0);
      })
      .catch(() => setTokenBalanceError('Failed to fetch token balance'))
      .finally(() => setTokenBalanceLoading(false));
  }, [wallet.address, token && token.token_address]);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(wallet.address).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      });
    }
  };

  return (
    <InterstatePopout open={true} onClose={onClose} align="center" className="w-[calc(100vw-360px)] h-[calc(100vh-120px)] p-0 bg-transparent shadow-none" overlayClassName="z-50">
      <div className="relative w-[calc(100vw-360px)] h-[calc(100vh-120px)] bg-neutral-900 border border-neutral-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-6 pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold text-pink-400">{wallet.name || 'Null'}</span>
            <span className="text-neutral-400 font-mono text-sm flex items-center gap-1">
              {typeof wallet.address === 'string' && wallet.address.length >= 10
                ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
                : wallet.address || '—'}
              <button
                className="ml-1 p-1 rounded hover:bg-neutral-800 transition-colors text-neutral-400 text-xs"
                onClick={handleCopy}
                title="Copy address"
                type="button"
              >
                {copied ? <FaCheck className="text-emerald-400 text-base" /> : <FaRegCopy className="text-base" />}
              </button>
              {copied && <span className="ml-1 text-emerald-400 text-xs">Copied!</span>}
              <span className="mx-2 text-neutral-500">|</span>
              {tokenBalanceLoading || tokenLoading ? (
                <span className="animate-pulse text-neutral-500">—</span>
              ) : tokenBalanceError ? (
                <span className="text-red-400">Error</span>
              ) : tokenBalance !== null && token ? (
                <span className="text-neutral-300">{tokenBalance} {token.symbol}</span>
              ) : (
                <span className="text-red-400">No balance</span>
              )}
            </span>
            <div className="flex items-center gap-2 ml-4">
              {['1d', '7d', '30d', 'Max'].map((label) => (
                <button
                  key={label}
                  className="px-2 py-1 rounded text-xs font-semibold text-neutral-400 hover:text-blue-400 hover:bg-neutral-800 transition-colors"
                  onClick={() => { /* TODO: handle time range change */ }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-2xl font-bold px-2 py-1 rounded transition-colors">×</button>
        </div>
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top: Balance, PNL, Performance */}
          <div className="flex flex-row gap-8 px-8 pt-6 pb-2">
            {/* Balance */}
            <div className="flex-1 min-w-[180px]">
              <div className="text-xs text-neutral-400 mb-1">Balance</div>
              <div className="text-3xl font-bold text-white">
                {tokenLoading ? (
                  <span className="animate-pulse text-neutral-500">—</span>
                ) : !token || typeof token.usd_price !== 'number' ? (
                  <span className="text-red-400">No price data</span>
                ) : (
                  `$${token.usd_price.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
                )}
              </div>
              <div className="text-xs text-neutral-500 mt-2">Unrealized PNL</div>
              <div className="text-lg text-white font-semibold">$0</div>
              <div className="text-xs text-neutral-500 mt-2">Available Balance</div>
              <div className="text-lg text-white font-semibold">
                {tokenBalanceLoading || tokenLoading ? (
                  <span className="animate-pulse text-neutral-500">—</span>
                ) : tokenBalanceError ? (
                  <span className="text-red-400">Error</span>
                ) : tokenBalance !== null && token ? (
                  `${tokenBalance} ${token.symbol}`
                ) : (
                  <span className="text-red-400">No balance</span>
                )}
              </div>
            </div>
            {/* PNL with TradingView Chart */}
            <div className="flex-1 min-w-[180px] flex flex-col items-center justify-start">
              <div className="w-full text-xs text-neutral-400 mb-1 mt-1 text-left pl-2">PNL</div>
            </div>
            {/* Performance */}
            <div className="flex-1 min-w-[180px]">
              <div className="text-xs text-neutral-400 mb-1">Performance</div>
              <div className="flex flex-row items-center justify-between mb-2">
                <span className="text-xs text-neutral-400">Total PNL</span>
                <span className="text-xs text-neutral-400">Total TXNS</span>
              </div>
              <div className="flex flex-row items-center justify-between mb-2">
                <span className="text-white font-semibold">$0.00</span>
                <span className="text-white font-semibold">{activity.length} / {activity.length}</span>
              </div>
              <div className="mt-2">
                <div className="flex flex-row items-center gap-2 text-xs text-neutral-400 mb-1">
                  <span className="w-16">&gt;500%</span><span>0</span>
                  <span className="w-16">200%~500%</span><span>0</span>
                  <span className="w-16">0%~200%</span><span>0</span>
                  <span className="w-16">0%~-50%</span><span>0</span>
                  <span className="w-16">&lt;-50%</span><span>0</span>
                </div>
                <div className="h-2 w-full bg-neutral-800 rounded-full mt-1">
                  <div className="h-2 rounded-full bg-pink-500" style={{ width: '20%' }} />
                </div>
              </div>
            </div>
          </div>
          {/* Tabs */}
          <div className="px-8 border-b border-neutral-800 mt-2">
            <div className="flex flex-row gap-10 text-sm mt-2">
              {TABS.map((t) => (
                <button
                  key={t}
                  className={`py-2 border-b-2 transition-colors duration-200 ${tab === t ? 'border-blue-400 text-blue-400 font-semibold' : 'border-transparent text-neutral-400 hover:text-white'}`}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {/* Table */}
          <div className="flex-1 px-8 py-4 overflow-auto">
            {error && (
              <div className="text-center text-red-400 mb-4">{error}</div>
            )}
            <table className="w-full text-xs">
              <thead>
                <tr className="text-neutral-400 border-b border-neutral-800 h-10">
                  <th className="px-2 py-2 text-left font-semibold">Type</th>
                  <th className="px-2 py-2 text-left font-semibold">Token</th>
                  <th className="px-2 py-2 text-left font-semibold">Amount</th>
                  <th className="px-2 py-2 text-left font-semibold">Market Cap <FiExternalLink className="inline ml-1 text-[10px] align-text-top" /></th>
                  <th className="px-2 py-2 text-left font-semibold">Age</th>
                  <th className="px-2 py-2 text-left font-semibold">Explorer</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-8 text-neutral-500">Loading...</td></tr>
                ) : (
                  <tr><td colSpan={6} className="text-center py-8 text-neutral-500">No activity found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </InterstatePopout>
  );
};

export default WalletScanPanel; 