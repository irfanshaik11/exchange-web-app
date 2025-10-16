import React, { useEffect, useState } from 'react';
import { tradeSellPercentage } from '~/utils/api';
import { formatSmartNumber } from '~/utils/db';
import { getActivePositionsByUser } from '~/utils/functions';
import type { PositionRow } from '~/utils/functions';
import { useRouter } from 'next/router';
import FastImage from '../FastImage';
import InterstateTooltip from '~/components/InterstateTooltip';
import { FaArrowUp, FaEye, FaEyeSlash } from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';

interface PositionsProps {
  userId: string;
  bearerToken: string;
  onPositionsChange: (positions: PositionRow[]) => void;
  preloadedPositions?: PositionRow[]; // Optional: use provided positions instead of fetching
  skipFetch?: boolean; // Optional: skip the API fetch if positions are provided
  onTokenNamesChange?: (tokenNames: Record<string, string>) => void; // Optional: callback to pass token names to parent
  showHidden?: boolean; // Optional: whether to show hidden tokens
  onHiddenTokensChange?: (hiddenTokens: Set<string>) => void; // Optional: callback to pass hidden tokens to parent
  showInSOL?: boolean; // Optional: whether to show values in SOL instead of USD
}

interface TokenMetadata {
  imageUrl?: string;
  protocol?: string;
  name?: string;
  symbol?: string;
}

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

// SOL icon component
const SolIcon = () => (
  <>
    <SiSolana 
      className="h-3 w-3 inline-block -mt-0.5" 
      aria-hidden="true"
      style={{ 
        color: 'unset',
        fill: 'url(#solana-gradient-positions)',
        filter: 'none'
      }}
    />
    <svg className="absolute w-0 h-0 pointer-events-none">
      <defs>
        <linearGradient id="solana-gradient-positions" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#9945FF" />
          <stop offset="100%" stopColor="#14F195" />
        </linearGradient>
      </defs>
    </svg>
  </>
);

const Positions: React.FC<PositionsProps> = ({ userId, bearerToken, onPositionsChange, preloadedPositions, skipFetch, onTokenNamesChange, showHidden = false, onHiddenTokensChange, showInSOL = false }) => {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenMetadata>>({});
  const [hiddenTokens, setHiddenTokens] = useState<Set<string>>(new Set());
  const [solPrice, setSolPrice] = useState<number>(0);
  const router = useRouter();
  
  // Fetch SOL price
  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        const data = await response.json();
        setSolPrice(data.solana.usd);
      } catch (error) {
        console.error('Error fetching SOL price:', error);
        setSolPrice(150); // Fallback price
      }
    };
    fetchSolPrice();
    // Refresh price every 60 seconds
    const interval = setInterval(fetchSolPrice, 60000);
    return () => clearInterval(interval);
  }, []);
  
  // Load hidden tokens from localStorage on mount
  useEffect(() => {
    const savedHidden = localStorage.getItem('hiddenTokens');
    if (savedHidden) {
      try {
        const hiddenArray: string[] = JSON.parse(savedHidden);
        const hiddenSet: Set<string> = new Set(hiddenArray);
        setHiddenTokens(hiddenSet);
        if (onHiddenTokensChange) {
          onHiddenTokensChange(hiddenSet);
        }
      } catch (e) {
        console.error('Error loading hidden tokens:', e);
      }
    }
  }, [onHiddenTokensChange]);
  
  const toggleHideToken = (tokenAddress: string) => {
    setHiddenTokens(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tokenAddress)) {
        newSet.delete(tokenAddress);
      } else {
        newSet.add(tokenAddress);
      }
      // Save to localStorage
      localStorage.setItem('hiddenTokens', JSON.stringify(Array.from(newSet)));
      if (onHiddenTokensChange) {
        onHiddenTokensChange(newSet);
      }
      return newSet;
    });
  };

  // If preloaded positions are provided, use them
  useEffect(() => {
    if (preloadedPositions && skipFetch) {
      setPositions(preloadedPositions);
      setLoading(false);
      
      // Fetch token metadata for preloaded positions
      preloadedPositions.forEach(async (pos) => {
        try {
          const pairAddress = pos.pairAddress || pos.tokenAddress;
          console.log(`Fetching token data for pair: ${pairAddress}`);
          
          const response = await fetch(`/api/token-service/trade-view?pair_address=${pairAddress}`);
          
          if (!response.ok) {
            console.error(`Failed to fetch token data for ${pairAddress}:`, response.status);
            return;
          }
          
          const data = await response.json();
          const tokenData = data?.token;
          
          if (tokenData) {
            setTokenMetadata(prev => {
              const updated = {
                ...prev,
                [pos.tokenAddress]: {
                  imageUrl: tokenData.uri || tokenData.image || tokenData.logo || '',
                  protocol: tokenData.launchpad_protocol || tokenData.protocol || '',
                  name: tokenData.name || '',
                  symbol: tokenData.symbol || '',
                }
              };
              
              // Pass token names to parent if callback is provided
              if (onTokenNamesChange) {
                const tokenNames: Record<string, string> = {};
                Object.keys(updated).forEach(key => {
                  if (updated[key]?.name) {
                    tokenNames[key] = updated[key].name!;
                  }
                });
                onTokenNamesChange(tokenNames);
              }
              
              return updated;
            });
          }
        } catch (error) {
          console.error(`Error fetching token data for ${pos.pairAddress || pos.tokenAddress}:`, error);
        }
      });
    }
  }, [preloadedPositions, skipFetch]);

  useEffect(() => {
    if (skipFetch) return; // Skip fetch if using preloaded positions
    
    if (!userId) {
      console.log('⚠️ Positions: No userId provided');
      return;
    }
    
    let isInitialLoad = true;
    
    const fetchPositions = async () => {
      console.log(`🔍 Fetching positions for userId: ${userId}`);
      // Only show loading state on initial load, not on refreshes
      if (isInitialLoad) {
        setLoading(true);
      }
      try {
        const positions = await getActivePositionsByUser(userId);
        console.log(`✅ Positions received:`, positions);
        console.log(`   Count: ${positions.length}`);
        if (positions.length > 0) {
          console.log(`   First position:`, positions[0]);
        }
        setPositions(positions);
        onPositionsChange(positions);

        // Fetch token data from token-service using pairAddress (originalPairAddress)
        positions.forEach(async (pos) => {
          try {
            // Use pairAddress (which is originalPairAddress from backend) to get token data
            const pairAddress = pos.pairAddress || pos.tokenAddress;
            console.log(`Fetching token data for pair: ${pairAddress}`);
            
            const response = await fetch(`/api/token-service/trade-view?pair_address=${pairAddress}`);
            
            if (!response.ok) {
              console.error(`Failed to fetch token data for ${pairAddress}:`, response.status);
              return;
            }
            
            const data = await response.json();
            const tokenData = data?.token;
            
            if (tokenData) {
              setTokenMetadata(prev => {
                const updated = {
                  ...prev,
                  [pos.tokenAddress]: {
                    imageUrl: tokenData.uri || tokenData.image || tokenData.logo || '',
                    protocol: tokenData.launchpad_protocol || tokenData.protocol || '',
                    name: tokenData.name || '',
                    symbol: tokenData.symbol || '',
                  }
                };
                
                // Pass token names to parent if callback is provided
                if (onTokenNamesChange) {
                  const tokenNames: Record<string, string> = {};
                  Object.keys(updated).forEach(key => {
                    if (updated[key]?.name) {
                      tokenNames[key] = updated[key].name!;
                    }
                  });
                  onTokenNamesChange(tokenNames);
                }
                
                return updated;
              });
            }
          } catch (error) {
            console.error(`Error fetching token data for ${pos.pairAddress || pos.tokenAddress}:`, error);
          }
        });
      } catch (error) {
        console.error('❌ Error fetching positions:', error);
      } finally {
        if (isInitialLoad) {
          setLoading(false);
          isInitialLoad = false;
        }
      }
    };
    
    fetchPositions();
    
    // Auto-refresh every 5 seconds to get latest positions
    const intervalId = setInterval(() => {
      fetchPositions();
    }, 5000);
    
    return () => clearInterval(intervalId);
  }, [userId, onPositionsChange, skipFetch, onTokenNamesChange]);

  return (
    <div className="w-full h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-[#1E1F26] z-10">
          <tr className="text-neutral-400 border-b border-neutral-800">
            <th className="px-2 py-2 text-left">Token</th>
            <th className="px-2 py-2 text-left">Bought</th>
            <th className="px-2 py-2 text-left">Sold</th>
            <th className="px-2 py-2 text-left">Remaining</th>
            <th className="px-2 py-2 text-left">PnL</th>
            <th className="px-2 py-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="text-center py-6 text-neutral-500">Loading...</td></tr>
          ) : positions.length === 0 ? (
            <tr><td colSpan={6} className="text-center py-6 text-neutral-500">No positions found.</td></tr>
          ) : (
            positions
              .filter(pos => showHidden || !hiddenTokens.has(pos.tokenAddress))
              .map((pos, idx) => {
              // Use pairAddress if available, otherwise fall back to tokenAddress
              const navigateAddress = pos.pairAddress || pos.tokenAddress;
              // Display pairAddress if available, otherwise show tokenAddress
              const displayAddress = pos.pairAddress || pos.tokenAddress;
              
              const handleRowClick = () => {
                // Navigate immediately with pair_address or mint - trade page will handle resolution
                if (navigateAddress) {
                  router.push(`/trade/${navigateAddress}`);
                }
              };
              
              const metadata = tokenMetadata[pos.tokenAddress];
              
              // Protocol color mapping
              const getProtocolColor = (protocol?: string) => {
                const p = protocol?.toLowerCase() || '';
                if (p.includes('pump')) return '#8B5CF6'; // Purple for Pump.fun
                if (p.includes('raydium')) return '#00D4AA'; // Teal for Raydium
                if (p.includes('meteora')) return '#FF6B6B'; // Red for Meteora
                if (p.includes('launch')) return '#FFA500'; // Orange for LaunchLab
                return '#6B7280'; // Gray default
              };

              const protocolColor = getProtocolColor(metadata?.protocol);
              
              // Protocol icon mapping
              const getProtocolIcon = (protocol?: string) => {
                const p = protocol?.toLowerCase() || '';
                if (p.includes('pump')) return '💊';
                if (p.includes('raydium')) return '🌊';
                if (p.includes('meteora')) return '☄️';
                if (p.includes('launch')) return '🚀';
                return '🔷';
              };

              const tokenIcon = getProtocolIcon(metadata?.protocol);
              const isHidden = hiddenTokens.has(pos.tokenAddress);
              
              return (
              <tr 
                key={pos.tokenAddress || idx} 
                className={`border-b border-neutral-800 hover:bg-neutral-800/60 cursor-pointer transition-colors ${
                  isHidden ? 'opacity-40 bg-neutral-900/30' : ''
                }`}
                onClick={handleRowClick}
              >
                <td className="px-2 py-2">
                  <div className="flex items-center gap-3">
                    <div 
                      className="relative h-12 w-12 flex items-center justify-center flex-shrink-0"
                    >
                      <div 
                        className="relative rounded-lg transition-all duration-300 ease-out"
                        style={{
                          border: `1px solid ${protocolColor}`,
                          padding: '2px'
                        }}
                      >
                        <div 
                          className="relative rounded-lg"
                          style={{
                            border: `1px solid rgba(192, 192, 192, 0.5)`,
                            padding: '2px'
                          }}
                        >
                          <div className="relative rounded-lg overflow-hidden w-10 h-10">
                            <FastImage
                              src={metadata?.imageUrl || ''}
                              alt={metadata?.name || metadata?.symbol || "Token"}
                              symbol={metadata?.symbol}
                              name={metadata?.name}
                              width={40}
                              height={40}
                              className="w-full h-full object-cover"
                              showBubble={false}
                            />
                          </div>
                        </div>
                      </div>
                      <div 
                        className="absolute bottom-0 right-0 bg-white rounded-full flex items-center justify-center transform translate-x-1/4 translate-y-1/4 z-10"
                        style={{ 
                          width: 16, 
                          height: 16,
                          border: `2px solid ${protocolColor}`,
                          boxShadow: `0 0 4px ${protocolColor}60`
                        }}
                      >
                        <span className="text-xs">{tokenIcon}</span>
                      </div>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="font-medium text-sm text-neutral-100 truncate">
                        {metadata?.name || 'Loading...'}
                      </div>
                      <div className="text-xs text-neutral-400 font-mono truncate" title={displayAddress}>
                        {shortAddr(displayAddress)}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2">
                  {formatSmartNumber(pos.bought)}
                  <span className="ml-1 text-neutral-400">
                    {showInSOL && solPrice > 0
                      ? <>(<SolIcon />{formatSmartNumber(pos.boughtUsdValue / solPrice)})</>
                      : `($${formatSmartNumber(pos.boughtUsdValue)})`
                    }
                  </span>
                </td>
                <td className="px-2 py-2">
                  {formatSmartNumber(pos.sold)}
                  <span className="ml-1 text-neutral-400">
                    {showInSOL && solPrice > 0
                      ? <>(<SolIcon />{formatSmartNumber(pos.soldUsdValue / solPrice)})</>
                      : `($${formatSmartNumber(pos.soldUsdValue)})`
                    }
                  </span>
                </td>
                <td className="px-2 py-2">
                  {formatSmartNumber(pos.remaining)}
                  <span className="ml-1 text-neutral-400">
                    {showInSOL && solPrice > 0
                      ? <>(<SolIcon />{formatSmartNumber(pos.remainingUsdValue / solPrice)})</>
                      : `($${formatSmartNumber(pos.remainingUsdValue)})`
                    }
                  </span>
                </td>
                <td className={`px-2 py-2 font-semibold ${pos.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}> 
                  {showInSOL && solPrice > 0
                    ? <>{pos.pnl >= 0 ? '+' : ''}<SolIcon />{formatSmartNumber(Math.abs(pos.pnl) / solPrice)}</>
                    : `${pos.pnl >= 0 ? '+' : ''}$${formatSmartNumber(Math.abs(pos.pnl))}`
                  }
                  <span className="ml-1 text-xs">({(pos.pnlPercentage).toFixed(2)}%)</span>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    {/* Hide/Show Eye Icon */}
                    <InterstateTooltip label={isHidden ? "Show token" : "Hide token"}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleHideToken(pos.tokenAddress);
                        }}
                        className="p-1.5 rounded hover:bg-neutral-700/50 transition-colors text-neutral-400 hover:text-white"
                      >
                        {isHidden ? (
                          <FaEyeSlash className="text-sm" />
                        ) : (
                          <FaEye className="text-sm" />
                        )}
                      </button>
                    </InterstateTooltip>
                    
                    {/* Sell Arrow Icon */}
                    {pos.actions === 'sell' && (
                      <InterstateTooltip label="Sell">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            tradeSellPercentage({
                              tokenAddress: pos.tokenAddress,
                              percentageToSell: 100,
                            }, bearerToken)
                          }} 
                          className="p-1.5 rounded hover:bg-red-600/20 transition-colors text-neutral-400 hover:text-red-500"
                        >
                          <FaArrowUp className="text-sm" />
                        </button>
                      </InterstateTooltip>
                    )}
                  </div>
                </td>
              </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Positions; 