import React, { useEffect, useState } from 'react';
import type { Wallet } from '~/utils/functions';
import { formatSmartNumber } from '~/utils/functions';
import InterstatePopout from './InterstatePopout';
import { FaRegCopy, FaCheck, FaStar, FaSearch, FaRegChartBar, FaBell, FaExternalLinkAlt, FaArrowUp, FaArrowDown, FaRegCalendar } from 'react-icons/fa';
import { FiExternalLink } from 'react-icons/fi';
import PriceChartWidget from './PriceChartWidget';
import type { Token } from '~/utils/db';
import { AiOutlineCalendar } from 'react-icons/ai';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { batchFetchTokenMetadata } from '~/utils/tokenMetadata';
import { getWalletSolBalance, getWalletTransactions, getWalletHistory } from '~/utils/walletTracking';

interface WalletScanPanelProps {
  wallet: Wallet;
  onClose: () => void;
}

const TABS = ["Active Positions", "History", "Top 100", "Activity"];

// Helper to format timestamp as relative time (like "5m", "3h", "2d")
function formatTimeAgo(timestamp: string | number | Date): string {
  let date: Date;
  
  // Parse the timestamp
  if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else if (typeof timestamp === 'number') {
    // Handle both seconds and milliseconds
    date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    return 'Unknown';
  }
  
  // Validate date
  if (isNaN(date.getTime())) {
    return 'Unknown';
  }
  
  const now = Date.now();
  const diff = now - date.getTime();
  
  if (diff < 0) return 'Just now';
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const months = Math.floor(diff / 2592000000);
  const years = Math.floor(diff / 31536000000);
  
  if (years > 0) return `${years}y`;
  if (months > 0) return `${months}mo`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return 'Just now';
}

const WalletScanPanel: React.FC<WalletScanPanelProps> = ({ wallet, onClose }) => {
  // Live data state
  const [balance, setBalance] = useState<number | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("Activity");
  
  // History data
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [tokenMetadata, setTokenMetadata] = useState<Map<string, { symbol: string | null; name: string | null }>>(new Map());
  const [token, setToken] = useState<Token | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [tokenBalanceLoading, setTokenBalanceLoading] = useState(true);
  const [tokenBalanceError, setTokenBalanceError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [notify, setNotify] = useState(false);
  const [selectedRange, setSelectedRange] = useState('Max');
  const timeRanges = ['1d', '7d', '30d', 'Max'];
  const [toast, setToast] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'SOL'>('USD');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (!wallet?.address) return;
    setLoading(true);
    setError(null);
    
    // Fetch SOL balance via secure backend endpoint
    getWalletSolBalance(wallet.address)
      .then(balance => setBalance(balance))
      .catch(() => setBalance(null));
    
    // Fetch recent transactions via backend (using Helius)
    getWalletTransactions(wallet.address, 10)
      .then(transactions => setActivity(transactions))
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
    if (!wallet.address || !token || !token.pair_address) return;
    setTokenBalanceLoading(true);
    setTokenBalanceError(null);
    
    // Get token accounts by owner via secure backend endpoint
    const backendUrl = process.env.NEXT_PUBLIC_WALLET_TRACKER_URL || '';
    
    fetch(`${backendUrl}/api/token-accounts/${encodeURIComponent(wallet.address)}?mint=${encodeURIComponent(token.pair_address)}`)
      .then(res => res.json())
      .then(data => {
        if (!data.ok || !data.accounts || data.accounts.length === 0) {
          setTokenBalance(0);
          return;
        }
        // Use the first account (most users have one)
        const amount = data.accounts[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
        setTokenBalance(typeof amount === 'number' ? amount : 0);
      })
      .catch(() => setTokenBalanceError('Failed to fetch token balance'))
      .finally(() => setTokenBalanceLoading(false));
  }, [wallet.address, token && token.pair_address]);

  // Fetch history when History tab is selected
  useEffect(() => {
    if (tab !== 'History' || !wallet?.address) return;
    
    setHistoryLoading(true);
    setHistoryError(null);
    
    const backendUrl = process.env.NEXT_PUBLIC_WALLET_TRACKER_URL || '';

    fetch(`${backendUrl}/api/history?wallet=${wallet.address}&limit=100`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch history");
        return res.json();
      })
      .then((data) => {
        console.log("[History] Received data:", data);
        setHistory(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error("[History] Error:", err);
        setHistoryError(
          typeof err?.message === "string"
            ? err.message
            : "Failed to load trading history",
        );
        setHistory([]);
      })
      .finally(() => {
        setHistoryLoading(false);
      });
  }, [tab, wallet?.address]);

  // Fetch token metadata for all mints in history
  useEffect(() => {
    if (history.length === 0) return;
    
    // Extract unique mints that don't have symbol/name
    const mintsToFetch = history
      .filter(trade => trade.mint && (!trade.symbol || !trade.name))
      .map(trade => trade.mint)
      .filter((mint, idx, arr) => arr.indexOf(mint) === idx); // unique
    
    if (mintsToFetch.length === 0) return;
    
    console.log('[History] Fetching metadata for', mintsToFetch.length, 'tokens');
    
    batchFetchTokenMetadata(mintsToFetch)
      .then(metadata => {
        console.log('[History] Fetched token metadata:', metadata);
        setTokenMetadata(metadata);
      })
      .catch(err => {
        console.error('[History] Error fetching token metadata:', err);
      });
  }, [history]);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(wallet.address).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      });
    }
  };

  // Toast display logic
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return (
    <InterstatePopout open={true} onClose={onClose} align="center" zIndex={9999} className="md:w-[80%] w-[90%] h-[calc(100vh-120px)] p-0 bg-transparent shadow-none">
      <div className="relative w-full h-[calc(100vh-120px)] bg-black border border-neutral-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-6 pb-3 border-b border-neutral-800 relative">
          <div className="flex items-center gap-4">
            <span className="text-lg font-bold text-pink-400">{wallet.name || 'Null'}</span>
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
          </div>
          <div className="flex items-center gap-4 absolute right-16 top-1/2 -translate-y-1/2">
            <FaStar
              className={`text-base cursor-pointer transition-colors ${isFavorite ? 'text-yellow-400' : 'text-neutral-500 hover:text-yellow-400'}`}
              title="Track Wallet"
              onClick={() => { setIsFavorite(fav => !fav); setToast('Wallet updated successfully'); }}
            />
            <FaBell
              className={`text-base cursor-pointer transition-colors ${notify ? 'text-blue-400' : 'text-neutral-500 hover:text-blue-400'}`}
              title="Notify"
              onClick={() => { setNotify(n => !n); setToast('Wallet updated successfully'); }}
            />
            <FaExternalLinkAlt
              className="text-base text-neutral-500 hover:text-blue-400 cursor-pointer"
              title="Open in Solscan"
              onClick={() => { window.open(`https://solscan.io/account/${wallet.address}`, '_blank'); setToast('Wallet updated successfully'); }}
            />
            <FaSearch
              className="text-base text-neutral-500 hover:text-blue-400 cursor-pointer"
              title="Search on Solscan"
              onClick={() => { window.open(`https://solscan.io/account/${wallet.address}`, '_blank'); setToast('Wallet updated successfully'); }}
            />
            <span className="mx-2 text-neutral-700">|</span>
            {timeRanges.map((label) => (
              <button
                key={label}
                className={`px-2 py-1 rounded text-xs font-semibold ${selectedRange === label ? 'text-blue-400' : 'text-neutral-400 hover:text-blue-400'} hover:bg-neutral-800 transition-colors`}
                onClick={() => setSelectedRange(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white text-2xl font-bold px-2 py-1 rounded transition-colors">×</button>
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
            <div className="flex-1 min-w-[180px] flex flex-col justify-between">
              <div className="flex flex-row justify-between items-start w-full">
                <div className="w-full text-xs text-neutral-400 mb-1 mt-1 text-left pl-2">PNL</div>
                <div className="relative mt-1 mr-2">
                  <button
                    className="text-neutral-400 hover:text-blue-400 p-1 rounded transition-colors"
                    title={selectedDate ? `Selected: ${selectedDate.toLocaleDateString()}` : 'Select date'}
                    onClick={() => setShowDatePicker((v) => !v)}
                  >
                    <AiOutlineCalendar className="text-lg" />
                  </button>
                  {showDatePicker && (
                    <div className="absolute right-0 top-8 z-50">
                      <DatePicker
                        selected={selectedDate}
                        onChange={(date: Date | null) => { setSelectedDate(date); setShowDatePicker(false); }}
                        inline
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="select"
                        calendarClassName="bg-neutral-900 text-white border border-neutral-700 rounded shadow-lg dark-datepicker"
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="text-4xl font-mono text-neutral-300 mb-2">$0</div>
                <div className="w-2/3 h-1 bg-neutral-700 rounded-full" />
              </div>
            </div>
            {/* Performance */}
            <div className="flex-1 min-w-[180px]">
              <div className="text-xs text-neutral-400 mb-1 flex items-center gap-2">
                Performance
                <span className="text-[10px] text-neutral-500" title="Performance ranges show the number of positions with PNL in each range. Example: >500% means positions with more than 500% profit.">(?)</span>
              </div>
              <div className="flex flex-row items-center justify-between mb-2">
                <span className="text-xs text-neutral-400">
                  {selectedRange === 'Max' ? 'Total PNL' : `${selectedRange} PNL`}
                </span>
                <span className="text-xs text-neutral-400">
                  {selectedRange === 'Max' ? 'Total TXNS' : `${selectedRange} TXNS`}
                </span>
              </div>
              <div className="flex flex-row items-center justify-between mb-2">
                <span className="text-white font-semibold">$0.00</span>
                <span className="text-white font-semibold">0 / 0</span>
              </div>
              <div className="mt-2">
                <div className="flex flex-col gap-1 mt-2 mb-2">
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="w-3 h-3 rounded-full bg-green-900 inline-block" />
                    <span>&gt;500%</span>
                    <span className="ml-auto">0</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="w-3 h-3 rounded-full bg-green-700 inline-block" />
                    <span>200% ~ 500%</span>
                    <span className="ml-auto">0</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                    <span>0% ~ 200%</span>
                    <span className="ml-auto">0</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="w-3 h-3 rounded-full bg-rose-900 inline-block" />
                    <span>0% ~ -50%</span>
                    <span className="ml-auto">0</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="w-3 h-3 rounded-full bg-rose-700 inline-block" />
                    <span>&lt;-50%</span>
                    <span className="ml-auto">0</span>
                  </div>
                </div>
                <div className="h-2 w-full bg-neutral-800 rounded-full mt-1">
                  <div className="h-2 rounded-full bg-pink-500" style={{ width: '20%' }} />
                </div>
              </div>
            </div>
          </div>
          {/* Tabs */}
          <div className="px-8 border-b border-neutral-800 mt-2 flex items-center justify-between">
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
            {tab !== 'Activity' && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="px-2 py-1 rounded-full bg-neutral-800 text-xs text-white border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  style={{ minWidth: 120 }}
                />
                <button
                  className={`px-3 py-1 text-xs font-semibold border border-neutral-700 ${currency === 'USD' ? 'bg-blue-500 text-white' : 'bg-neutral-800 text-neutral-300'} rounded-full transition-colors`}
                  onClick={() => setCurrency(currency === 'USD' ? 'SOL' : 'USD')}
                  style={{ minWidth: 56 }}
                >
                  {currency === 'USD' ? 'USD' : 'SOL'}
                </button>
              </div>
            )}
          </div>
          {/* Tab Content Area */}
          <div className="flex-1 overflow-auto px-8">
            {tab === 'History' && (
              <div className="w-full h-full">
                {historyLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-neutral-400 animate-pulse">Loading history...</div>
                  </div>
                ) : historyError ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-red-400">{historyError}</div>
                  </div>
                ) : history.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-neutral-500">No trading history found</div>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-black border-b border-neutral-800">
                      <tr className="text-neutral-400 text-xs uppercase">
                        <th className="py-3 px-4 text-left font-semibold">Time</th>
                        <th className="py-3 px-4 text-left font-semibold">Token</th>
                        <th className="py-3 px-4 text-center font-semibold">Side</th>
                        <th className="py-3 px-4 text-right font-semibold">Bought</th>
                        <th className="py-3 px-4 text-right font-semibold">Sold</th>
                        <th className="py-3 px-4 text-right font-semibold">PnL</th>
                        <th className="py-3 px-4 text-center font-semibold">Tx</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {history
                        .filter((trade) => {
                          if (!searchTerm) return true;
                          const term = searchTerm.toLowerCase();
                          const metadata = tokenMetadata.get(trade.mint);
                          return (
                            trade.symbol?.toLowerCase().includes(term) ||
                            trade.name?.toLowerCase().includes(term) ||
                            metadata?.symbol?.toLowerCase().includes(term) ||
                            metadata?.name?.toLowerCase().includes(term) ||
                            trade.mint?.toLowerCase().includes(term) ||
                            trade.txSig?.toLowerCase().includes(term)
                          );
                        })
                        .map((trade, idx) => {
                          // Handle different data formats for amount
                          let amount = 0;
                          if (typeof trade.amount === 'number') {
                            amount = trade.amount;
                          } else if (typeof trade.amount === 'string') {
                            amount = parseFloat(trade.amount);
                          } else if (trade.amount && typeof trade.amount === 'object' && typeof trade.amount.toNumber === 'function') {
                            amount = trade.amount.toNumber();
                          }

                          // Handle different data formats for priceUsd
                          let priceUsd: number | null = null;
                          if (typeof trade.priceUsd === 'number') {
                            priceUsd = trade.priceUsd;
                          } else if (typeof trade.priceUsd === 'string') {
                            const parsed = parseFloat(trade.priceUsd);
                            priceUsd = Number.isFinite(parsed) ? parsed : null;
                          } else if (trade.priceUsd && typeof trade.priceUsd === 'object' && typeof trade.priceUsd.toNumber === 'function') {
                            priceUsd = trade.priceUsd.toNumber();
                          }

                          const value = priceUsd !== null && Number.isFinite(amount)
                            ? amount * priceUsd
                            : null;
                          const pnl = value !== null
                            ? (trade.side === 'sell' ? value : -value)
                            : null;
                          const pnlDisplay = pnl !== null && Number.isFinite(pnl)
                            ? `${pnl >= 0 ? '+' : '-'}$${formatSmartNumber(Math.abs(pnl))}`
                            : '—';
                          const timeAgo = trade.ts ? formatTimeAgo(trade.ts) : 'Unknown';
                          
                          // Use fetched metadata as fallback
                          const metadata = tokenMetadata.get(trade.mint);
                          const displaySymbol = trade.symbol || metadata?.symbol || 'Unknown';
                          const displayName = trade.name || metadata?.name;
                          const boughtDisplay = trade.side === 'buy' && Number.isFinite(amount)
                            ? `${formatSmartNumber(Math.abs(amount))} ${displaySymbol}`
                            : '—';
                          const soldDisplay = trade.side === 'sell' && Number.isFinite(amount)
                            ? `${formatSmartNumber(Math.abs(amount))} ${displaySymbol}`
                            : '—';
                          
                          return (
                            <tr key={trade.id || idx} className="hover:bg-neutral-800 transition-colors">
                              <td className="py-3 px-4 text-neutral-300">
                                <div className="text-sm font-mono">{timeAgo}</div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex flex-col">
                                  <span className="text-white font-semibold" title={displayName || undefined}>
                                    {displaySymbol}
                                  </span>
                                  <span className="text-[10px] text-neutral-500 font-mono">
                                    {trade.mint ? `${trade.mint.slice(0, 4)}...${trade.mint.slice(-4)}` : '—'}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  trade.side === 'buy' 
                                    ? 'bg-emerald-900/30 text-emerald-400' 
                                    : 'bg-rose-900/30 text-rose-400'
                                }`}>
                                  {trade.side?.toUpperCase() || '—'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right text-neutral-300">
                                {boughtDisplay}
                              </td>
                              <td className="py-3 px-4 text-right text-neutral-300">
                                {soldDisplay}
                              </td>
                              <td className="py-3 px-4 text-right text-neutral-300">
                                {pnlDisplay}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <a
                                  href={`https://solscan.io/tx/${trade.txSig}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300 transition-colors"
                                  title="View on Solscan"
                                >
                                  <FiExternalLink className="inline text-sm" />
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {tab === 'Active Positions' && (
              <div className="flex items-center justify-center h-full text-neutral-500">Active Positions - Coming Soon</div>
            )}
            {tab === 'Top 100' && (
              <div className="flex items-center justify-center h-full text-neutral-500">Top 100 - Coming Soon</div>
            )}
            {tab === 'Activity' && (
              <div className="flex items-center justify-center h-full text-neutral-500">Activity - Coming Soon</div>
            )}
          </div>
        </div>
      </div>
      {toast && (
        <div className="fixed left-1/2 top-12 z-50 -translate-x-1/2 px-4 py-2 rounded-md shadow-md text-sm font-semibold bg-neutral-800 text-white animate-fade-in">
          {toast}
        </div>
      )}
      <style jsx global>{`
        .dark-datepicker,
        .dark-datepicker .react-datepicker__header,
        .dark-datepicker .react-datepicker__month,
        .dark-datepicker .react-datepicker__day,
        .dark-datepicker .react-datepicker__day-name,
        .dark-datepicker .react-datepicker__current-month,
        .dark-datepicker .react-datepicker__year-dropdown,
        .dark-datepicker .react-datepicker__month-dropdown {
          background: #18181b !important;
          color: #fff !important;
          border-color: #27272a !important;
        }
        .dark-datepicker .react-datepicker__day--selected,
        .dark-datepicker .react-datepicker__day--keyboard-selected {
          background: #2563eb !important;
          color: #fff !important;
        }
        .dark-datepicker .react-datepicker__day:hover {
          background: #334155 !important;
          color: #fff !important;
        }
        .dark-datepicker .react-datepicker__month-dropdown,
        .dark-datepicker .react-datepicker__year-dropdown {
          background: #18181b !important;
          color: #fff !important;
        }
        .dark-datepicker .react-datepicker__navigation-icon::before {
          border-color: #fff !important;
        }
      `}</style>
    </InterstatePopout>
  );
};

export default WalletScanPanel;