import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { useUser } from '../components/UserContext';
import { getTradeActivityByUser, getActivePositionsByUser } from '~/utils/functions';
import { formatSmartNumber, formatSmallPrice } from '~/utils/db';
import type { PositionRow, TradeRow } from '~/utils/functions';
import { SiSolana } from 'react-icons/si';
import { FaTimes, FaChartLine } from 'react-icons/fa';

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
  const [solPrice, setSolPrice] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [timeframeMetrics, setTimeframeMetrics] = useState({
    unrealizedPnl: 0,
    realizedPnl: 0,
    realizedPnlPercentage: 0,
    winningTrades: 0,
    losingTrades: 0,
  });
  const [chartData, setChartData] = useState<{ x: number; y: number }[]>([]);
  
  // Draggable state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Fetch SOL price using Pyth Network
  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        // Pyth Network price feed for SOL/USD
        const SOL_USD_FEED = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
        const response = await fetch(
          `https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=${SOL_USD_FEED}`,
          { signal: AbortSignal.timeout(5000) }
        ).catch(() => null);

        if (response?.ok) {
          const data = await response.json().catch(() => null);
          const priceData = data?.parsed?.[0]?.price;
          if (priceData?.price && priceData?.expo) {
            const price = Number(priceData.price) * Math.pow(10, priceData.expo);
            setSolPrice(price);
            return;
          }
        }
      } catch {
        // Silently ignore network errors - fallback below
      }

      // Fallback to static price if Pyth fails
      setSolPrice(150);
    };
    fetchSolPrice().catch(() => setSolPrice(150));
  }, []);

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
          }> = [];
          
          // 1. Calculate from TRADE HISTORY (most accurate - actual sell transactions)
          // Normalize token addresses for matching (case-insensitive)
          const normalizeAddress = (addr: string | undefined) => {
            if (!addr) return '';
            return addr.toLowerCase().trim();
          };
          
          const sellTrades = filteredTradeHistory.filter(t => {
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
          filteredTradeHistory.filter(t => {
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
            
            if (soldAmount <= 0 || saleValueUsd <= 0) return;
            
            // Check if we have stored realizedPnl from database (preferred - more accurate)
            const storedRealizedPnl = typeof sell.realizedPnl === 'string' 
              ? parseFloat(sell.realizedPnl) 
              : (sell.realizedPnl || null);
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

          // Generate chart data from realized PNL
          setChartData([{ x: 0, y: 0 }, { x: 1, y: totalRealizedPnl }]);

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
      className="fixed z-[9999] w-96"
      style={{
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0f0f0f 100%)',
        border: '1px solid #2a2a2a',
        borderRadius: '12px',
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
        <div className="h-24 bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg p-4 relative overflow-hidden">
          {/* Real PnL chart with same logic as portfolio */}
          <svg className="w-full h-full" viewBox="0 0 300 80" preserveAspectRatio="none">
            {/* Horizontal reference line (neutral/zero) */}
            <line 
              x1="0" 
              y1="40" 
              x2="300" 
              y2="40" 
              stroke="#2A2B33" 
              strokeWidth="1"
            />
            
            {/* Dashed reference lines for visual context */}
            <line 
              x1="0" 
              y1="20" 
              x2="300" 
              y2="20" 
              stroke="#4A4B53" 
              strokeWidth="1"
              strokeDasharray="4,3"
              opacity="0.7"
            />
            <line 
              x1="0" 
              y1="60" 
              x2="300" 
              y2="60" 
              stroke="#4A4B53" 
              strokeWidth="1"
              strokeDasharray="4,3"
              opacity="0.7"
            />
            
            {/* Dynamic PNL line */}
            <path
              d={(() => {
                const pnl = timeframeMetrics.realizedPnl;
                
                // More aggressive scaling for small values to make slope visible
                let normalizedPnl;
                if (Math.abs(pnl) < 0.01) {
                  // For very small values, use much more aggressive scaling
                  normalizedPnl = Math.max(-1, Math.min(1, pnl * 5000)); // Scale up by 5000x
                } else if (Math.abs(pnl) < 1) {
                  // For small-medium values, moderate scaling
                  normalizedPnl = Math.max(-1, Math.min(1, pnl * 100)); // Scale up by 100x
                } else {
                  // For larger values, use the original logic
                  const absMaxPnl = Math.max(Math.abs(pnl), 100);
                  normalizedPnl = Math.max(-1, Math.min(1, pnl / absMaxPnl));
                }
                
                const endY = 40 - (normalizedPnl * 30);
                
                // Create a more dramatic line that trends up/down based on PNL
                return `M 0 40 L 60 ${40 - (normalizedPnl * 12)} L 120 ${40 - (normalizedPnl * 18)} L 180 ${40 - (normalizedPnl * 24)} L 240 ${40 - (normalizedPnl * 27)} L 300 ${endY}`;
              })()}
              stroke={timeframeMetrics.realizedPnl >= 0 ? '#70E0B0' : '#FF4D7F'}
              strokeWidth="2.5"
              fill="none"
              style={{ transition: 'all 0.3s ease' }}
            />
            
            {/* Start and end points for clarity */}
            <circle cx="0" cy="40" r="2" fill={timeframeMetrics.realizedPnl >= 0 ? '#70E0B0' : '#FF4D7F'} />
            <circle cx="300" cy={40 - (Math.max(-1, Math.min(1, timeframeMetrics.realizedPnl * (Math.abs(timeframeMetrics.realizedPnl) < 0.01 ? 5000 : Math.abs(timeframeMetrics.realizedPnl) < 1 ? 100 : 1)))) * 30} r="2" fill={timeframeMetrics.realizedPnl >= 0 ? '#70E0B0' : '#FF4D7F'} />
          </svg>
        </div>
      </div>
    </div>
  );

  // Render modal at document root level using portal
  return createPortal(modalContent, document.body);
}
