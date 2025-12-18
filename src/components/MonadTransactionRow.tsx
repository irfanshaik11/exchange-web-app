import React from 'react';
import type { MonadWalletTrade } from '../hooks/useMonadWalletTransactions';

interface MonadTransactionRowProps {
  trade: MonadWalletTrade;
}

export default function MonadTransactionRow({ trade }: MonadTransactionRowProps) {
  const isBuy = trade.type === 'buy' || trade.is_buy;
  
  // Format amounts
  const monAmount = typeof trade.mon_amount === 'string' 
    ? parseFloat(trade.mon_amount) 
    : trade.mon_amount;
  const tokenAmount = typeof trade.token_amount === 'string'
    ? parseFloat(trade.token_amount)
    : trade.token_amount;
  const priceMon = typeof trade.price_mon === 'string'
    ? parseFloat(trade.price_mon)
    : trade.price_mon;

  // Format timestamp
  const timestamp = trade.block_timestamp 
    ? new Date(trade.block_timestamp * 1000)
    : trade.created_at 
    ? new Date(trade.created_at)
    : null;

  // Format token address for display
  const tokenAddressShort = trade.token_address
    ? `${trade.token_address.slice(0, 6)}...${trade.token_address.slice(-4)}`
    : 'Unknown';

  // Explorer URL (adjust based on your Monad explorer)
  const explorerUrl = `https://monad.xyz/tx/${trade.tx_hash}`;

  return (
    <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
      <div className="flex items-center gap-3 flex-1">
        <div className={`w-2 h-2 rounded-full ${isBuy ? 'bg-green-500' : 'bg-red-500'}`} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">
            {isBuy ? 'Buy' : 'Sell'} {trade.launchpad_protocol || 'Token'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {tokenAddressShort}
            {timestamp && ` • ${timestamp.toLocaleString()}`}
          </div>
        </div>
      </div>
      
      <div className="text-right mr-4">
        <div className="font-medium text-sm">
          {tokenAmount.toFixed(4)} {trade.launchpad_protocol || 'TOK'}
        </div>
        {monAmount > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {monAmount.toFixed(4)} MON
          </div>
        )}
      </div>
      
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium ml-2"
        onClick={(e) => e.stopPropagation()}
      >
        View
      </a>
    </div>
  );
}

