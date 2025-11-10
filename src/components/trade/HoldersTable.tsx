import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiSettings, FiExternalLink, FiX } from 'react-icons/fi';
import { FaFilter, FaArrowUp, FaArrowDown } from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import { MdOutlineBubbleChart } from 'react-icons/md';
import useCodexHolders from '../../hooks/useCodexHolders';
import { getWalletSolBalance } from '../../utils/walletTracking';
import type { Token } from '~/utils/db';

interface HoldersTableProps {
  token: Token | null;
  onBubblemapToggle?: (show: boolean) => void;
  isBubblemapVisible?: boolean;
  containerWidth?: number;
}

interface HolderWithBalance {
  address: string;
  lastTransactionAt: number;
  solBalance: number | null;
  isLoadingBalance: boolean;
  amountBoughtUsd30d: string;
  amountSoldUsd30d: string;
  tokenAmountBought30d: string;
  tokenAmountSold30d: string;
  tokenAcquisitionCostUsd: string;
  tokenBalance: string;
  buys30d: number;
  sells30d: number;
}

function getTimeAgo(timestamp: number): string {
  if (!timestamp) return 'N/A';
  const now = Date.now() / 1000; // seconds
  const diffSeconds = now - timestamp;
  const diffMins = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffSeconds / 3600);
  const diffDays = Math.floor(diffSeconds / 86400);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return `${Math.floor(diffSeconds)}s`;
}

function shortAddr(addr: string): string {
  if (!addr) return '';
  return addr.slice(0, 8) + '...' + addr.slice(-4);
}

function formatUsd(value: string | number | null | undefined): string {
  if (!value) return '$0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(num) || num === 0) return '$0';
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
}

function formatNumber(value: string | number | null | undefined): string {
  if (!value) return '0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(num) || num === 0) return '0';
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toFixed(2);
}

function formatPercentage(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value) || value === 0) return '0%';
  if (value < 0.01) return value.toFixed(3) + '%';
  if (value < 1) return value.toFixed(2) + '%';
  return value.toFixed(2) + '%';
}

function calculateRemaining(
  tokenBalance: string,
  currentPrice?: number,
  marketCapUsd?: number,
  decimals?: number
): { value: number; percentage: number } {
  if (!currentPrice || currentPrice <= 0 || !marketCapUsd || marketCapUsd <= 0) {
    return { value: 0, percentage: 0 };
  }
  
  const balance = parseFloat(tokenBalance) || 0;
  if (balance === 0) return { value: 0, percentage: 0 };
  
  // Adjust balance for decimals if needed
  let adjustedBalance = balance;
  if (decimals && balance > 0 && balance > 1e15) {
    adjustedBalance = balance / Math.pow(10, decimals);
  }
  
  // Calculate current USD value of remaining tokens
  const currentValue = adjustedBalance * currentPrice;
  
  // Calculate percentage of market cap
  const percentage = (currentValue / marketCapUsd) * 100;
  
  return { value: currentValue, percentage };
}

function getFundingSource(address: string, index: number): { source: string; timeAgo: string; solAmount: number } {
  // Generate placeholder funding data
  const sources = [
    { source: shortAddr(address), timeAgo: '21h', solAmount: 0.023 },
    { source: shortAddr(address), timeAgo: '3mo', solAmount: 0.022 },
    { source: 'Kucoin', timeAgo: '3y', solAmount: 1 },
    { source: shortAddr(address), timeAgo: '3d', solAmount: 10.22 },
  ];
  
  return sources[index % sources.length];
}

function calculateUnrealizedPnL(
  tokenBalance: string,
  tokenAcquisitionCostUsd: string,
  currentPrice?: number,
  decimals?: number
): number {
  if (!currentPrice || currentPrice <= 0) return 0;
  const balance = parseFloat(tokenBalance) || 0;
  const cost = parseFloat(tokenAcquisitionCostUsd) || 0;
  if (balance === 0 || cost === 0) return 0;
  
  // Adjust balance for decimals if needed (assuming tokenBalance might be in raw units)
  // If decimals are provided and balance seems too large, adjust it
  let adjustedBalance = balance;
  if (decimals && balance > 0 && balance > 1e15) {
    adjustedBalance = balance / Math.pow(10, decimals);
  }
  
  // Unrealized PnL = (current token value) - (acquisition cost)
  // current token value = balance * currentPrice
  const currentValue = adjustedBalance * currentPrice;
  return currentValue - cost;
}

const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  mint: "#70E0B0",
  mintHover: "#58B890",
  sell: "#FF4D7F",
};

const HoldersTable: React.FC<HoldersTableProps> = ({ 
  token, 
  onBubblemapToggle,
  isBubblemapVisible = false,
  containerWidth = 1000,
}) => {
  const { holders, isLoading, error } = useCodexHolders(token?.mint);
  const [holdersWithBalances, setHoldersWithBalances] = useState<HolderWithBalance[]>([]);
  const tableRef = useRef<HTMLDivElement>(null);

  // Fetch SOL balances for holders
  useEffect(() => {
    if (!holders || holders.length === 0) {
      setHoldersWithBalances([]);
      return;
    }

    // Initialize with holders data
    const initial: HolderWithBalance[] = holders.map(h => ({
      address: h.address,
      lastTransactionAt: h.lastTransactionAt,
      solBalance: null,
      isLoadingBalance: true,
      amountBoughtUsd30d: h.amountBoughtUsd30d,
      amountSoldUsd30d: h.amountSoldUsd30d,
      tokenAmountBought30d: h.tokenAmountBought30d,
      tokenAmountSold30d: h.tokenAmountSold30d,
      tokenAcquisitionCostUsd: h.tokenAcquisitionCostUsd,
      tokenBalance: h.tokenBalance,
      buys30d: h.buys30d,
      sells30d: h.sells30d,
    }));
    setHoldersWithBalances(initial);

    // Fetch balances in batches to avoid overwhelming the API
    const fetchBalances = async () => {
      const batchSize = 5;
      for (let i = 0; i < holders.length; i += batchSize) {
        const batch = holders.slice(i, i + batchSize);
        const balancePromises = batch.map(async (holder) => {
          try {
            const balance = await getWalletSolBalance(holder.address);
            return { address: holder.address, balance };
          } catch (error) {
            console.error(`Failed to fetch balance for ${holder.address}:`, error);
            return { address: holder.address, balance: null };
          }
        });

        const results = await Promise.all(balancePromises);
        
        setHoldersWithBalances(prev => 
          prev.map(h => {
            const result = results.find(r => r.address === h.address);
            if (result) {
              return {
                ...h,
                solBalance: result.balance,
                isLoadingBalance: false,
              };
            }
            return h;
          })
        );

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < holders.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    };

    fetchBalances();
  }, [holders]);

  const handleBubblemapClick = useCallback(() => {
    if (onBubblemapToggle) {
      onBubblemapToggle(!isBubblemapVisible);
    }
  }, [onBubblemapToggle, isBubblemapVisible]);

  const handleHideBubblemap = useCallback(() => {
    if (onBubblemapToggle) {
      onBubblemapToggle(false);
    }
  }, [onBubblemapToggle]);


  return (
    <div 
      ref={tableRef}
      className="flex-1 min-h-0 flex flex-col overflow-hidden" 
      style={{ backgroundColor: AX.bg }}
    >
      <div className="flex-shrink-0 px-4 py-3 border-b" style={{ borderColor: AX.border }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiSettings size={16} style={{ color: AX.muted }} />
            <h3 className="text-sm font-medium" style={{ color: AX.text }}>Holders</h3>
          </div>
          <div className="flex items-center gap-2">
            {isBubblemapVisible ? (
              <button
                onClick={handleHideBubblemap}
                className="p-1.5 rounded hover:bg-opacity-20 transition-colors"
                style={{ color: AX.muted }}
                title="Hide bubblemap"
              >
                <FiX size={18} />
              </button>
            ) : (
              <button
                onClick={handleBubblemapClick}
                className="p-1.5 rounded hover:bg-opacity-20 transition-colors"
                style={{ color: AX.muted }}
                title="Show bubblemap"
              >
                <MdOutlineBubbleChart size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead className="sticky top-0 z-10" style={{ backgroundColor: AX.surface }}>
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: AX.muted }}>
                <div className="flex items-center gap-1">
                  <FiSettings size={12} style={{ color: AX.muted }} />
                  <span>Wallet</span>
                </div>
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: AX.muted }}>
                SOL Balance (Last Active)
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: AX.muted }}>
                Bought (Avg Buy)
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: AX.muted }}>
                Sold (Avg Sell)
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: AX.muted }}>
                <div className="flex items-center gap-1">
                  <span>U. PnL</span>
                  <div className="flex flex-col">
                    <FaArrowUp size={8} />
                    <FaArrowDown size={8} />
                  </div>
                </div>
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: AX.muted }}>
                Remaining
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: AX.muted }}>
                Funding
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center">
                  <div className="animate-pulse">
                    <div className="text-neutral-400 text-sm">Loading holders...</div>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center">
                  <div className="text-red-400 text-sm">{error}</div>
                </td>
              </tr>
            ) : !holders || holders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center">
                  <div className="text-neutral-400 text-sm">No holders data available</div>
                </td>
              </tr>
            ) : (
              holdersWithBalances.map((holder, index) => {
                const boughtUsd = parseFloat(holder.amountBoughtUsd30d) || 0;
                const soldUsd = parseFloat(holder.amountSoldUsd30d) || 0;
                const avgBuyPrice = holder.buys30d > 0 ? boughtUsd / holder.buys30d : 0;
                const avgSellPrice = holder.sells30d > 0 ? soldUsd / holder.sells30d : 0;
                const unrealizedPnL = calculateUnrealizedPnL(
                  holder.tokenBalance,
                  holder.tokenAcquisitionCostUsd,
                  token?.usd_price,
                  token?.decimals
                );
                const remaining = calculateRemaining(
                  holder.tokenBalance,
                  token?.usd_price,
                  token?.market_cap_usd,
                  token?.decimals
                );
                const funding = getFundingSource(holder.address, index);

                return (
                  <tr
                    key={holder.address}
                    className="border-b hover:bg-opacity-50 transition-colors"
                    style={{ 
                      borderColor: AX.border,
                      backgroundColor: index % 2 === 0 ? 'transparent' : `${AX.surface2}40`,
                    }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FaFilter size={12} style={{ color: AX.muted }} className="cursor-pointer hover:opacity-70" />
                        <a
                          href={`https://solscan.io/account/${holder.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:opacity-70 transition-opacity"
                          style={{ color: AX.text }}
                        >
                          <span className="text-sm font-mono">{shortAddr(holder.address)}</span>
                          <FiExternalLink size={12} style={{ color: AX.muted }} />
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <SiSolana size={14} style={{ color: '#9945FF' }} />
                        <span className="text-sm" style={{ color: AX.text }}>
                          {holder.isLoadingBalance ? (
                            <span style={{ color: AX.muted }}>Loading...</span>
                          ) : holder.solBalance !== null ? (
                            holder.solBalance.toFixed(3)
                          ) : (
                            <span style={{ color: AX.muted }}>N/A</span>
                          )}
                        </span>
                        <span className="text-xs" style={{ color: AX.muted }}>
                          ({getTimeAgo(holder.lastTransactionAt)})
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm" style={{ color: boughtUsd > 0 ? AX.mint : AX.text }}>
                          {formatUsd(boughtUsd)}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs" style={{ color: AX.muted }}>
                            {formatNumber(holder.tokenAmountBought30d)} / {holder.buys30d}
                          </span>
                          {avgBuyPrice > 0 && (
                            <span className="text-xs" style={{ color: AX.muted }}>
                              ({formatUsd(avgBuyPrice)})
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm" style={{ color: soldUsd > 0 ? AX.sell : AX.text }}>
                          {formatUsd(soldUsd)}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs" style={{ color: AX.muted }}>
                            {formatNumber(holder.tokenAmountSold30d)} / {holder.sells30d}
                          </span>
                          {avgSellPrice > 0 && (
                            <span className="text-xs" style={{ color: AX.muted }}>
                              ({formatUsd(avgSellPrice)})
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span 
                        className="text-sm font-medium"
                        style={{ color: unrealizedPnL >= 0 ? AX.mint : AX.sell }}
                      >
                        {unrealizedPnL >= 0 ? '+' : ''}{formatUsd(unrealizedPnL)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm" style={{ color: AX.mint }}>
                            {formatUsd(remaining.value)}
                          </span>
                          <span 
                            className="text-xs px-2 py-0.5 rounded"
                            style={{ 
                              backgroundColor: `${AX.surface2}80`,
                              color: AX.muted 
                            }}
                          >
                            {formatPercentage(remaining.percentage)}
                          </span>
                        </div>
                        <div 
                          className="h-1 rounded-full overflow-hidden"
                          style={{ backgroundColor: `${AX.border}40` }}
                        >
                          <div 
                            className="h-full rounded-full transition-all"
                            style={{ 
                              width: `${Math.min(remaining.percentage, 100)}%`,
                              backgroundColor: '#3B82F6' // Blue color for progress bar
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <FaArrowUp size={12} style={{ color: AX.muted }} />
                          <span className="text-sm font-mono" style={{ color: AX.text }}>
                            {funding.source}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs" style={{ color: AX.muted }}>
                          <span>{funding.timeAgo}</span>
                          <span>•</span>
                          <SiSolana size={12} style={{ color: '#9945FF' }} />
                          <span>{funding.solAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HoldersTable;

