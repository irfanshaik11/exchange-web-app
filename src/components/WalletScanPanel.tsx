import React, { useEffect, useState } from 'react';
import type { Wallet } from '~/utils/functions';

interface WalletScanPanelProps {
  wallet: Wallet;
  onClose: () => void;
}

const WalletScanPanel: React.FC<WalletScanPanelProps> = ({ wallet, onClose }) => {
  // Live data state
  const [balance, setBalance] = useState<number | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wallet?.address) return;
    setLoading(true);
    // Fetch SOL balance
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
      .then(res => res.json())
      .then(data => setBalance(data?.result?.value ? data.result.value / 1e9 : 0));
    // Fetch recent transactions (Solscan public API)
    fetch(`https://public-api.solscan.io/account/transactions?address=${wallet.address}&limit=10`)
      .then(res => res.json())
      .then(data => Array.isArray(data) ? setActivity(data) : setActivity([]))
      .finally(() => setLoading(false));
  }, [wallet.address]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-[1200px] rounded-2xl bg-neutral-900 border border-neutral-700 shadow-2xl p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-pink-400">{wallet.name || 'Null'}</span>
            <span className="text-neutral-400 font-mono text-xs">
              {typeof wallet.address === 'string' && wallet.address.length >= 10
                ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
                : wallet.address || '—'}
            </span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-2xl font-bold px-2 py-1 rounded transition-colors">×</button>
        </div>
        {/* Content */}
        <div className="flex flex-row gap-6 px-6 py-6">
          {/* Left: Balance */}
          <div className="flex-1 min-w-[180px]">
            <div className="mb-6">
              <div className="text-sm text-neutral-400 mb-1">Balance</div>
              <div className="text-2xl font-bold text-white">
                {loading ? <span className="animate-pulse text-neutral-500">Loading...</span> :
                  balance !== null ? `${balance} SOL` : '—'}
              </div>
              <div className="text-xs text-neutral-500 mt-2">Unrealized PNL</div>
              <div className="text-lg text-white font-semibold">$0</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Available Balance</div>
              <div className="text-lg text-white font-semibold">
                {loading ? <span className="animate-pulse text-neutral-500">Loading...</span> :
                  balance !== null ? `${balance} SOL` : '—'}
              </div>
            </div>
          </div>
          {/* Center: PNL (mocked) */}
          <div className="flex-1 min-w-[180px] flex flex-col items-center justify-center">
            <div className="text-sm text-neutral-400 mb-1">PNL</div>
            <div className="w-full h-16 flex items-center justify-center">
              <span className="text-neutral-500 text-4xl font-mono">—</span>
            </div>
          </div>
          {/* Right: Performance */}
          <div className="flex-1 min-w-[180px]">
            <div className="text-sm text-neutral-400 mb-1">Performance</div>
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
        <div className="px-6 border-b border-neutral-800">
          <div className="flex flex-row gap-8 text-sm mt-2">
            <button className="py-2 border-b-2 border-transparent text-neutral-400 hover:text-white">Active Positions</button>
            <button className="py-2 border-b-2 border-transparent text-neutral-400 hover:text-white">History</button>
            <button className="py-2 border-b-2 border-transparent text-neutral-400 hover:text-white">Top 100</button>
            <button className="py-2 border-b-2 border-blue-400 text-blue-400 font-semibold">Activity</button>
          </div>
        </div>
        {/* Activity Table */}
        <div className="px-6 py-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-neutral-400 border-b border-neutral-800">
                <th className="px-2 py-2 text-left">Signature</th>
                <th className="px-2 py-2 text-left">Slot</th>
                <th className="px-2 py-2 text-left">Block Time</th>
                <th className="px-2 py-2 text-left">Result</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-8 text-neutral-500">Loading...</td></tr>
              ) : activity.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-neutral-500">No activity found.</td></tr>
              ) : (
                activity.map((tx, idx) => (
                  <tr key={tx.signature || idx} className="border-b border-neutral-800">
                    <td className="px-2 py-2 text-blue-400 truncate max-w-[120px]">
                      <a href={`https://solscan.io/tx/${tx.signature}`} target="_blank" rel="noopener noreferrer">{tx.signature.slice(0, 8)}...{tx.signature.slice(-6)}</a>
                    </td>
                    <td className="px-2 py-2">{tx.slot}</td>
                    <td className="px-2 py-2">{tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleString() : '-'}</td>
                    <td className="px-2 py-2">{tx.err ? 'Error' : 'Success'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WalletScanPanel; 