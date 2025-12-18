import React, { useState } from 'react';
import { useMonadWalletTransactions } from '../hooks/useMonadWalletTransactions';
import MonadTransactionRow from './MonadTransactionRow';

interface MonadWalletTransactionsProps {
  walletAddress: string;
  tokenAddress?: string;
  showFilters?: boolean;
}

export default function MonadWalletTransactions({
  walletAddress,
  tokenAddress,
  showFilters = true,
}: MonadWalletTransactionsProps) {
  const [tradeType, setTradeType] = useState<'buy' | 'sell' | undefined>();
  
  const { trades, loading, error, total, loadMore } = useMonadWalletTransactions({
    walletAddress,
    tokenAddress,
    tradeType,
    limit: 50,
    enabled: !!walletAddress,
    pollInterval: 10000, // Poll every 10 seconds for updates
  });

  if (loading && trades.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500 dark:text-gray-400">Loading transactions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 dark:text-red-400 p-4 rounded-lg bg-red-50 dark:bg-red-900/20">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold dark:text-white">
          Transactions {total > 0 && <span className="text-gray-500 dark:text-gray-400 font-normal">({total})</span>}
        </h2>
        
        {showFilters && (
          <div className="flex gap-2">
            <button
              onClick={() => setTradeType(tradeType === 'buy' ? undefined : 'buy')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                tradeType === 'buy' 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Buys
            </button>
            <button
              onClick={() => setTradeType(tradeType === 'sell' ? undefined : 'sell')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                tradeType === 'sell' 
                  ? 'bg-red-500 text-white' 
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Sells
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {trades.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 text-center py-8 rounded-lg bg-gray-50 dark:bg-gray-800">
            No transactions found for this wallet
          </div>
        ) : (
          trades.map((trade) => (
            <MonadTransactionRow key={trade.tx_hash} trade={trade} />
          ))
        )}
      </div>

      {trades.length < total && (
        <button
          onClick={loadMore}
          className="mt-4 w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          Load More ({total - trades.length} remaining)
        </button>
      )}
    </div>
  );
}

