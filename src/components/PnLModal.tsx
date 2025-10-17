import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useUser } from '../components/UserContext';
import { getTradeHistoryByUser } from '~/utils/functions';
import { formatSmartNumber } from '~/utils/db';
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
}

export default function PnLModal({ isOpen, onClose }: PnLModalProps) {
  const { user, solBalance, usdcBalance } = useUser();
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
    winningTrades: 0,
    losingTrades: 0,
  });

  // Fetch SOL price using Pyth Network
  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        // Pyth Network price feed for SOL/USD
        const SOL_USD_FEED = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
        const response = await fetch(
          `https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=${SOL_USD_FEED}`,
          { signal: AbortSignal.timeout(5000) }
        );
        
        if (response.ok) {
          const data = await response.json();
          const priceData = data.parsed?.[0]?.price;
          if (priceData?.price && priceData?.expo) {
            const price = Number(priceData.price) * Math.pow(10, priceData.expo);
            setSolPrice(price);
            return;
          }
        }
      } catch (error) {
        console.error('Error fetching SOL price from Pyth:', error);
      }
      
      // Fallback to static price if Pyth fails
      setSolPrice(150);
    };
    fetchSolPrice();
  }, []);

  // Fetch trade history and calculate metrics
  useEffect(() => {
    const fetchData = async () => {
      if (user?.id) {
        try {
          const history = await getTradeHistoryByUser(user.id);
          setTradeHistory(history);

          // Calculate metrics
          const totalPnl = history.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
          const winningTrades = history.filter(trade => (trade.pnl || 0) > 0).length;
          const losingTrades = history.filter(trade => (trade.pnl || 0) < 0).length;

          setTimeframeMetrics({
            unrealizedPnl: 0, // This would need position data
            realizedPnl: totalPnl,
            winningTrades,
            losingTrades,
          });

          // Calculate total value (simplified)
          const totalUsdValue = (solBalance || 0) * solPrice + (usdcBalance || 0);
          setTotalValue(totalUsdValue);

        } catch (error) {
          console.error('Error fetching trade data:', error);
        }
      }
    };

    if (isOpen) {
      fetchData();
    }
  }, [user?.id, isOpen, solBalance, usdcBalance, solPrice]);

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="fixed top-0 left-0 z-[9999] w-96"
      style={{
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0f0f0f 100%)',
        border: '1px solid #2a2a2a',
        borderRadius: '0 0 12px 0',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Close button - only visible on hover */}
      {isHovered && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors z-10"
        >
          <FaTimes size={12} />
        </button>
      )}

      {/* Top Section with Neon Glow Background */}
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
          backgroundPosition: 'center, 20% 80%, 80% 20%, 40% 40%, 60% 70%'
        }}
      >
        {/* Minimal overlay for text readability */}
        <div className="absolute inset-0 bg-black bg-opacity-10"></div>
        
        {/* Balance and PnL Side by Side */}
        <div className="relative p-6 h-full flex items-center justify-between">
          {/* Balance Section */}
          <div className="flex items-center gap-4">
            <SolanaIcon size={28} />
            <div>
              <div className="text-white font-bold text-3xl">
                {formatSmartNumber(solBalance || 0)}
              </div>
              <div className="text-gray-300 text-lg">Balance</div>
            </div>
          </div>
          
          {/* PnL Section */}
          <div className="flex items-center gap-4">
            <SolanaIcon size={28} />
            <div>
              <div className={`font-bold text-3xl ${timeframeMetrics.realizedPnl >= 0 ? 'text-green-400' : 'text-pink-400'}`}>
                {timeframeMetrics.realizedPnl >= 0 ? '+' : ''}{formatSmartNumber(timeframeMetrics.realizedPnl)}
              </div>
              <div className="text-gray-300 text-lg">PNL</div>
            </div>
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent"></div>

      {/* Chart Section */}
      <div className="p-6">
        <div className="h-24 bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg p-4 relative overflow-hidden">
          {/* Red line chart */}
          <svg className="w-full h-full" viewBox="0 0 300 60">
            <defs>
              <linearGradient id="redLine" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ff4d7f" stopOpacity="0.8"/>
                <stop offset="100%" stopColor="#ff4d7f" stopOpacity="0.3"/>
              </linearGradient>
            </defs>
            {/* Downward trending red line */}
            <path
              d="M 10 15 Q 75 25 150 35 T 290 50"
              stroke="url(#redLine)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            {/* Additional subtle lines for depth */}
            <path
              d="M 10 20 Q 75 30 150 40 T 290 55"
              stroke="#ff4d7f"
              strokeWidth="1"
              fill="none"
              strokeLinecap="round"
              opacity="0.3"
            />
          </svg>
        </div>
      </div>
    </div>
  );

  // Render modal at document root level using portal
  return createPortal(modalContent, document.body);
}
