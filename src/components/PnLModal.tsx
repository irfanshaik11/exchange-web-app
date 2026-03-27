import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { useUser } from '../components/UserContext';
import { useSolPrice } from './SolPriceContext';
import { getTradeActivityByUser, getActivePositionsByUser } from '~/utils/functions';
import { formatSmartNumber, formatSmallPrice } from '~/utils/db';
import type { PositionRow, TradeRow } from '~/utils/functions';
import { SiSolana } from 'react-icons/si';
import { FaTimes, FaChartLine } from 'react-icons/fa';
import RealizedPnlChart, { type PnlChartDataPoint } from "~/components/charts/RealizedPnlChart";

// Official Solana logo component
const SolanaIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 397.7 311.7" fill="currentColor">
    <defs>
      <linearGradient id="solanaGradient" x1="360.8791" y1="351.4553" x2="141.213" y2="-69.2936" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#00FFA3"/>
        <stop offset="1" stopColor="#DC1FFF"/>
      </linearGradient>
      <linearGradient id="solanaGradient2" x1="264.8291" y1="401.6014" x2="45.163" y2="-19.1475" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#00FFA3"/>
        <stop offset="1" stopColor="#DC1FFF"/>
      </linearGradient>
      <linearGradient id="solanaGradient3" x1="312.5484" y1="376.688" x2="92.8822" y2="-44.061" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#00FFA3"/>
        <stop offset="1" stopColor="#DC1FFF"/>
      </linearGradient>
    </defs>
    <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z" fill="url(#solanaGradient)"/>
    <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z" fill="url(#solanaGradient2)"/>
    <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z" fill="url(#solanaGradient3)"/>
  </svg>
);

interface PnLModalProps {
  isOpen: boolean;
  onClose: () => void;
  chain?: string;
}

export default function PnLModal({ isOpen, onClose, chain }: PnLModalProps) {
  const router = useRouter();
  const currentChain = chain || (router.query.chain as string) || 'sol';
  const { user, solBalance, chainBalances, usdcBalance } = useUser();
  const { solPrice } = useSolPrice();
  const chainBalance = currentChain === 'monad' ? (chainBalances?.monad ?? 0) : solBalance;
  
  const chainLogos: Record<string, string> = {
    sol: "https://www.pngall.com/wp-content/uploads/10/Solana-Crypto-Logo-PNG-File.png",
    monad: "https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1",
  };
  const [tradeHistory, setTradeHistory] = useState<TradeRow[]>([]);
  const [unrealizedPnl, setUnrealizedPnl] = useState(0);
  const [unrealizedPnlPercentage, setUnrealizedPnlPercentage] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [isHovered, setIsHovered] = useState(false);
  const [timeframeMetrics, setTimeframeMetrics] = useState({
    unrealizedPnl: 0,
    realizedPnl: 0,
    realizedPnlPercentage: 0,
    winningTrades: 0,
    losingTrades: 0,
  });
  const [pnlChartData, setPnlChartData] = useState<PnlChartDataPoint[]>([]);
  
  // Draggable state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  // Helper to normalize blockchain value (same as portfolio page)
  const normalizeBlockchainValue = useCallback((value?: string | null) => {
    if (!value) return "solana";
    const normalized = value.toLowerCase();
    if (normalized === "sol") return "solana";
    return normalized;
  }, []);

  // Helper to filter trades by current chain (same as portfolio page)
  const isTradeOnCurrentChain = useCallback(
    (trade: TradeRow) => {
      const normalized = normalizeBlockchainValue(trade.blockchain);
      if (currentChain === "monad") {
        return normalized === "monad";
      }
      // Default to Solana for undefined/other values
      return normalized === "solana";
    },
    [currentChain, normalizeBlockchainValue],
  );

  // Fetch positions and calculate metrics (same comprehensive logic as portfolio page)
  useEffect(() => {
    const fetchData = async () => {
      if (user?.id && user?.bearerToken) {
        try {
          // Map chain query param to blockchain: 'sol' -> 'solana', 'monad' -> 'monad'
          const blockchain = currentChain === 'monad' ? 'monad' : currentChain === 'sol' ? 'solana' : undefined;
          
          // Fetch both positions and trade history (same as portfolio page)
          const [fetchedPositions, fetchedTradeHistory] = await Promise.all([
            getActivePositionsByUser(user.id, blockchain),
            getTradeActivityByUser(user.id, blockchain),
          ]);
          
          // Filter trade history by current chain
          const filteredTradeHistory = Array.isArray(fetchedTradeHistory)
            ? fetchedTradeHistory.filter(isTradeOnCurrentChain)
            : [];
          
          setPositions(fetchedPositions);
          setTradeHistory(filteredTradeHistory);

          // COMPREHENSIVE REALIZED PNL CALCULATION (same as portfolio page)
          let totalRealizedPnl = 0;
          const salesDetected: Array<{
            tokenAddress: string;
            soldAmount: number;
            salePrice: number;
            costBasis: number;
            realizedPnl: number;
            source: string;
            timestamp: number;
            tokenSymbol: string;
            tokenName: string;
          }> = [];
          
          // 1. Calculate from TRADE HISTORY (most accurate - actual sell transactions)
          // Normalize token addresses for matching (case-insensitive)
          const normalizeAddress = (addr: string | undefined) => {
            if (!addr) return '';
            return addr.toLowerCase().trim();
          };

          // Filter out split trades (multi-wallet children) to avoid double-counting in PnL
          const nonSplitTrades = filteredTradeHistory.filter(t => !t.isSplitTrade);

          const sellTrades = nonSplitTrades.filter(t => {
            const type = t.type?.toLowerCase();
            return type === "sell" || type === "s";
          });

          const buyTradesByToken = new Map<string, Array<{
            amount: number;
            usdValue: number;
            pricePerToken: number; // Price per token for accurate cost basis
            timestamp: number;
            tradeId: string;
            consumed: number; // Track how much of this buy has been used
          }>>();

          // Group buys by token (normalized address)
          nonSplitTrades.filter(t => {
            const type = t.type?.toLowerCase();
            return type === "buy" || type === "b";
          }).forEach(buy => {
            const tokenAddress = normalizeAddress(buy.tokenAddress);
            if (!tokenAddress) return;
            
            const tokenAmount = typeof buy.tokenAmount === 'string' ? parseFloat(buy.tokenAmount) : (buy.tokenAmount || 0);
            const usdValue = typeof buy.usdValue === 'string' ? parseFloat(buy.usdValue) : (buy.usdValue || 0);
            const timestamp = new Date(buy.tradeTime || buy.createdAt || Date.now()).getTime();
            const tradeId = buy.transactionHash || `${buy.tokenAddress}_${timestamp}`;
            
            if (tokenAmount > 0 && usdValue > 0) {
              if (!buyTradesByToken.has(tokenAddress)) {
                buyTradesByToken.set(tokenAddress, []);
              }
              // Use stored pricePerToken if available, otherwise calculate
              const pricePerToken = buy.pricePerToken || (usdValue / tokenAmount);
              buyTradesByToken.get(tokenAddress)!.push({ 
                amount: tokenAmount, 
                usdValue,
                pricePerToken, // Store price per token for accurate cost basis calculation
                timestamp,
                tradeId,
                consumed: 0,
              });
            }
          });
          
          // Sort all buys by timestamp (oldest first for FIFO)
          buyTradesByToken.forEach((buys, tokenAddress) => {
            buys.sort((a, b) => a.timestamp - b.timestamp);
          });
          
          // Track which trades we've already counted (to avoid double-counting)
          const processedSellTrades = new Set<string>();
          
          // Calculate realized PNL from sell trades
          // PRIORITY: Use stored realizedPnl from database if available (more accurate)
          sellTrades.forEach(sell => {
            const tokenAddress = normalizeAddress(sell.tokenAddress);
            if (!tokenAddress) return;
            
            const tradeId = sell.transactionHash || `${sell.tokenAddress}_${new Date(sell.tradeTime || sell.createdAt || Date.now()).getTime()}`;
            
            // Skip if already processed
            if (processedSellTrades.has(tradeId)) return;
            processedSellTrades.add(tradeId);
            
            const soldAmount = typeof sell.tokenAmount === 'string' ? parseFloat(sell.tokenAmount) : (sell.tokenAmount || 0);
            const saleValueUsd = typeof sell.usdValue === 'string' ? parseFloat(sell.usdValue) : (sell.usdValue || 0);

            // Check stored PnL first — cleanup sells have usdValue=0 but valid stored PnL
            const storedRealizedPnl = typeof sell.realizedPnl === 'string'
              ? parseFloat(sell.realizedPnl)
              : (sell.realizedPnl != null ? Number(sell.realizedPnl) : null);

            if (soldAmount <= 0) return;
            if (saleValueUsd <= 0 && (storedRealizedPnl === null || isNaN(storedRealizedPnl))) return;
            const storedCostBasis = typeof sell.costBasis === 'string'
              ? parseFloat(sell.costBasis)
              : (sell.costBasis || null);
            
            let saleRealizedPnl: number;
            let totalCostBasis: number;
            
            if (storedRealizedPnl !== null && storedRealizedPnl !== undefined && !isNaN(storedRealizedPnl)) {
              // Use stored values from database (calculated at trade time)
              saleRealizedPnl = storedRealizedPnl;
              totalCostBasis = storedCostBasis || (saleValueUsd - saleRealizedPnl);
            } else {
              // Fallback: Calculate using FIFO matching (for older trades without stored PNL)
              const buys = buyTradesByToken.get(tokenAddress) || [];
              if (buys.length === 0) {
                console.warn("⚠️ Sell trade found but no matching buys:", {
                  tokenAddress: sell.tokenAddress,
                  soldAmount,
                  saleValueUsd,
                });
                return;
              }
              
              // Match sold amount with buys (FIFO) - track consumed amounts
              let remainingToSell = soldAmount;
              totalCostBasis = 0;
              
              for (const buy of buys) {
                if (remainingToSell <= 0) break;
                
                const availableFromThisBuy = buy.amount - buy.consumed;
                if (availableFromThisBuy <= 0) continue; // This buy is fully consumed
                
                const buyPricePerToken = buy.pricePerToken || (buy.usdValue / buy.amount);
                const amountFromThisBuy = Math.min(remainingToSell, availableFromThisBuy);
                const costBasisForThisAmount = amountFromThisBuy * buyPricePerToken;
                
                totalCostBasis += costBasisForThisAmount;
                buy.consumed += amountFromThisBuy; // Mark as consumed
                remainingToSell -= amountFromThisBuy;
              }
              
              // If we couldn't match all sold amount, use average buy price as fallback
              if (remainingToSell > 0) {
                const totalBuyAmount = buys.reduce((sum, b) => sum + b.amount, 0);
                const totalBuyValue = buys.reduce((sum, b) => sum + b.usdValue, 0);
                if (totalBuyAmount > 0) {
                  const avgBuyPrice = totalBuyValue / totalBuyAmount;
                  totalCostBasis += remainingToSell * avgBuyPrice;
                }
              }
              
              // Calculate realized PNL for this sale
              saleRealizedPnl = saleValueUsd - totalCostBasis;
            }
            
            totalRealizedPnl += saleRealizedPnl;
            
            salesDetected.push({
              tokenAddress: sell.tokenAddress || tokenAddress,
              soldAmount,
              salePrice: saleValueUsd / soldAmount,
              costBasis: totalCostBasis,
              realizedPnl: saleRealizedPnl,
              source: storedRealizedPnl !== null ? 'trade_history_stored' : 'trade_history',
              timestamp: new Date(sell.createdAt || Date.now()).getTime(),
              tokenSymbol: sell.tokenSymbol || '',
              tokenName: sell.tokenName || '',
            });
          });
          
          // 2. Calculate from backend-reported sales (for positions with sold > 0)
          // Only count if not already counted from trade history
          fetchedPositions.forEach((pos) => {
            if (pos.sold > 0 && pos.bought > 0 && pos.boughtUsdValue > 0) {
              // Check if already counted
              const alreadyCounted = salesDetected.some(s => 
                normalizeAddress(s.tokenAddress) === normalizeAddress(pos.tokenAddress) &&
                (s.source === 'trade_history' || s.source === 'trade_history_stored')
              );
              
              if (alreadyCounted) return;
              
              const avgBuyPrice = pos.boughtUsdValue / pos.bought;
              const costBasisOfSold = pos.sold * avgBuyPrice;
              const saleValueUsd = pos.soldUsdValue || (pos.sold * avgBuyPrice); // Use avg buy price if no sale value
              const saleRealizedPnl = saleValueUsd - costBasisOfSold;
              
              totalRealizedPnl += saleRealizedPnl;
              
              salesDetected.push({
                tokenAddress: pos.tokenAddress,
                soldAmount: pos.sold,
                salePrice: saleValueUsd / pos.sold,
                costBasis: costBasisOfSold,
                realizedPnl: saleRealizedPnl,
                source: 'backend',
                timestamp: Date.now(),
                tokenSymbol: pos.tokenSymbol || '',
                tokenName: pos.tokenName || '',
              });
            }
          });

          // Count winning/losing positions
          let winningTrades = 0;
          let losingTrades = 0;
          fetchedPositions.forEach((pos) => {
            if (pos.pnl > 0) {
              winningTrades++;
            } else if (pos.pnl < 0) {
              losingTrades++;
            }
          });

          const totalUnrealizedPnl = fetchedPositions.reduce((sum, pos) => sum + pos.pnl, 0);

          // Calculate realized PNL percentage using cost basis of SOLD tokens only (same as portfolio page)
          // This is the correct way: realizedPnl / costBasisOfSoldTokens
          const totalCostBasisOfSoldTokens = salesDetected.reduce((acc, sale) => acc + (sale.costBasis || 0), 0);
          const realizedPnlPercentage = totalCostBasisOfSoldTokens > 0 
            ? (totalRealizedPnl / totalCostBasisOfSoldTokens) * 100 
            : 0;

          setTimeframeMetrics({
            unrealizedPnl: totalUnrealizedPnl,
            realizedPnl: totalRealizedPnl,
            realizedPnlPercentage: realizedPnlPercentage,
            winningTrades,
            losingTrades,
          });

          // Calculate total value
          const totalRemainingValue = fetchedPositions.reduce((acc, pos) => acc + pos.remainingUsdValue, 0);
          const totalUsdValue = (chainBalance || 0) * solPrice + (usdcBalance || 0) + totalRemainingValue;
          setTotalValue(totalUsdValue);

          // Generate realized PNL chart data (same style as portfolio page)
          if (salesDetected.length > 0) {
            const sorted = [...salesDetected].sort((a, b) => a.timestamp - b.timestamp);
            let cumulative = 0;
            const chartPoints: PnlChartDataPoint[] = [];
            const firstDate = new Date(sorted[0].timestamp);
            chartPoints.push({
              time: firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              date: 'Start',
              cumulativePnl: 0,
              tradePnl: 0,
              tokenSymbol: '',
              tokenName: '',
              index: 0,
            });
            sorted.forEach((sale, i) => {
              const tradeDate = new Date(sale.timestamp);
              const timeLabel = tradeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const dateLabel =
                timeLabel +
                ', ' +
                tradeDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
              cumulative += sale.realizedPnl;
              chartPoints.push({
                time: timeLabel,
                date: dateLabel,
                cumulativePnl: Math.round(cumulative * 1e6) / 1e6,
                tradePnl: Math.round(sale.realizedPnl * 1e6) / 1e6,
                tokenSymbol: sale.tokenSymbol,
                tokenName: sale.tokenName,
                index: i + 1,
              });
            });
            setPnlChartData(chartPoints);
          } else {
            setPnlChartData([]);
          }

        } catch (error) {
          console.error('Error fetching position data:', error);
        }
      }
    };

    if (isOpen) {
      fetchData();
    }
  }, [user?.id, user?.bearerToken, isOpen, chainBalance, usdcBalance, solPrice, currentChain, isTradeOnCurrentChain]);

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="fixed z-[99999] w-[450px]"
      style={{
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0f0f0f 100%)',
        border: '1px solid #2a2a2a',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
        left: `${position.x}px`,
        top: `${position.y}px`,
        userSelect: isDragging ? 'none' : 'auto',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Close button - only visible on hover */}
      {isHovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors z-10"
          style={{ cursor: 'pointer' }}
        >
          <FaTimes size={12} />
        </button>
      )}

      {/* Top Section with Neon Glow Background - Drag Handle */}
      <div 
        className="relative h-40"
        style={{
          background: `
            linear-gradient(135deg, #000000 0%, #001a00 25%, #000000 50%, #002a00 75%, #000000 100%),
            radial-gradient(circle at 20% 80%, rgba(0, 255, 150, 0.8) 0%, transparent 70%),
            radial-gradient(circle at 80% 20%, rgba(0, 255, 100, 0.6) 0%, transparent 60%),
            radial-gradient(circle at 40% 40%, rgba(0, 200, 80, 0.5) 0%, transparent 50%),
            radial-gradient(circle at 60% 70%, rgba(0, 150, 60, 0.4) 0%, transparent 40%)
          `,
          backgroundSize: '100% 100%, 300px 300px, 250px 250px, 200px 200px, 150px 150px',
          backgroundPosition: 'center, 20% 80%, 80% 20%, 40% 40%, 60% 70%',
          cursor: isDragging ? 'grabbing' : 'grab',
          borderRadius: '12px 12px 0 0',
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Minimal overlay for text readability */}
        <div className="absolute inset-0 bg-black bg-opacity-10"></div>
        
        {/* Balance and PnL Side by Side */}
        <div className="relative p-6 h-full flex items-center justify-between">
          {/* Balance Section */}
          <div className="flex items-center gap-4">
            {currentChain === 'monad' ? (
              <img 
                src={chainLogos.monad} 
                alt="Monad" 
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <SolanaIcon size={28} />
            )}
            <div>
              <div className="text-white font-bold text-3xl">
                {formatSmartNumber(chainBalance || 0)}
              </div>
              <div className="text-gray-300 text-lg">Balance</div>
            </div>
          </div>
          
          {/* PnL Section */}
          <div className="flex items-center gap-4">
            {currentChain === 'monad' ? (
              <img 
                src={chainLogos.monad} 
                alt="Monad" 
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <SolanaIcon size={28} />
            )}
            <div>
              <div className={`font-bold text-3xl ${timeframeMetrics.realizedPnl >= 0 ? 'text-green-400' : 'text-pink-400'}`}>
                {timeframeMetrics.realizedPnl >= 0 ? '+' : '-'}${formatSmallPrice(Math.abs(timeframeMetrics.realizedPnl))}
              </div>
              {/* Realized PNL Percentage - Always show (same as portfolio page) */}
              <div className={`text-sm mt-1 ${timeframeMetrics.realizedPnlPercentage >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {timeframeMetrics.realizedPnlPercentage >= 0 ? "+" : ""}{formatSmallPrice(timeframeMetrics.realizedPnlPercentage)}%
              </div>
              <div className="text-gray-300 text-lg mt-1">PNL</div>
            </div>
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent"></div>

      {/* Chart Section */}
      <div className="p-6">
        {pnlChartData.length > 1 ? (
          <div className="h-40 sm:h-48 w-full">
            <RealizedPnlChart data={pnlChartData} />
          </div>
        ) : (
          <div className="h-40 sm:h-48 w-full flex items-center justify-center">
            <p className="text-[#6B7280] text-xs">No realized trades yet</p>
          </div>
        )}
      </div>
    </div>
  );

  // Render modal at document root level using portal
  return createPortal(modalContent, document.body);
}
