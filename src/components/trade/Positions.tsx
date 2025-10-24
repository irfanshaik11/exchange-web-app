import React, { useEffect, useState } from 'react';
import { formatSmartNumber } from '~/utils/db';
import { getActivePositionsByUser } from '~/utils/functions';
import type { PositionRow } from '~/utils/functions';
import { useRouter } from 'next/router';
import FastImage from '../FastImage';
import InterstateTooltip from '~/components/InterstateTooltip';
import { FaArrowUp, FaEye, FaEyeSlash } from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import Image from 'next/image';
import SellPopup from '../SellPopup';

interface TokenMetadata {
  imageUrl?: string;
  protocol?: string;
  name?: string;
  symbol?: string;
  timestamp?: number;
  migrated_pool_address?: string; // For graduated tokens (Meteora DBC -> permanent pool)
}

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
  tokenMetadataCache?: Record<string, TokenMetadata>; // Optional: shared cache
  onUpdateCache?: (tokenAddress: string, metadata: Omit<TokenMetadata, 'timestamp'>) => void; // Optional: update cache callback
  isCacheValid?: (tokenAddress: string) => boolean; // Optional: check if cache entry is valid
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

const Positions: React.FC<PositionsProps> = ({ 
  userId, 
  bearerToken, 
  onPositionsChange, 
  preloadedPositions, 
  skipFetch, 
  onTokenNamesChange, 
  showHidden = false, 
  onHiddenTokensChange, 
  showInSOL = false,
  tokenMetadataCache,
  onUpdateCache,
  isCacheValid
}) => {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenMetadata>>({});
  const [hiddenTokens, setHiddenTokens] = useState<Set<string>>(new Set());
  const [showSellPopup, setShowSellPopup] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<PositionRow | null>(null);
  const [solPrice, setSolPrice] = useState<number>(0);
  const router = useRouter();

  // Function to refresh positions after a successful sell
  const refreshPositions = async () => {
    if (userId) {
      try {
        const updatedPositions = await getActivePositionsByUser(userId);
        setPositions(updatedPositions);
        onPositionsChange(updatedPositions);
      } catch (error) {
        console.error('Failed to refresh positions:', error);
      }
    }
  };
  
  // Initialize local metadata from cache if available
  useEffect(() => {
    if (tokenMetadataCache && Object.keys(tokenMetadataCache).length > 0) {
      setTokenMetadata(tokenMetadataCache);
    }
  }, [tokenMetadataCache]);
  
  // Fetch SOL price using Pyth Network with improved error handling
  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        // Pyth Network price feed for SOL/USD
        const SOL_USD_FEED = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
        const response = await fetch(
          `https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=${SOL_USD_FEED}`,
          { 
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(10000) // 10 second timeout
          }
        );
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const priceData = data.parsed?.[0]?.price;
        if (priceData?.price && priceData?.expo) {
          const price = Number(priceData.price) * Math.pow(10, priceData.expo);
          setSolPrice(price);
          return;
        } else {
          throw new Error('Invalid response format from Pyth');
        }
      } catch (error) {
        console.error('Error fetching SOL price from Pyth:', error);
        
        // Fallback to CoinGecko if Pyth fails
        try {
          const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(10000), // 10 second timeout
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const data = await response.json();
          if (data?.solana?.usd) {
            setSolPrice(data.solana.usd);
            return;
          } else {
            throw new Error('Invalid response format from CoinGecko');
          }
        } catch (fallbackError) {
          console.error('Error fetching SOL price from CoinGecko fallback:', fallbackError);
          // Use a reasonable fallback price
          setSolPrice(150);
        }
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
      
      // Fetch token metadata for preloaded positions in parallel
      const fetchAllMetadata = async () => {
        // Deduplicate tokens before fetching to avoid race conditions
        const uniqueTokens = Array.from(new Set(preloadedPositions.map(p => p.tokenAddress)));
        
        // Filter out tokens that are already cached and valid
        const tokensToFetch = uniqueTokens.filter(token => 
          !isCacheValid || !isCacheValid(token)
        );
        
        if (tokensToFetch.length === 0) {
          console.log('✅ All tokens loaded from cache');
          return;
        }
        
        console.log(`🔄 Fetching ${tokensToFetch.length} tokens (${uniqueTokens.length - tokensToFetch.length} from cache)`);
        
        // Fetch all tokens in parallel for maximum speed
        await Promise.allSettled(
          tokensToFetch.map(async (tokenAddress) => {
            // Find the position to get the pair address
            const pos = preloadedPositions.find(p => p.tokenAddress === tokenAddress);
            if (!pos) return;

            try {
              // Reduced timeout to 3s for faster failures
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 3000);

              // IMPORTANT: Query by mint address (token address) instead of pair address
              // This ensures we get the correct migrated_pool_address for graduated tokens
              const response = await fetch(`/api/token-service/trade-view?mint_address=${tokenAddress}`, {
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }
              
              const data = await response.json();
              const tokenData = data?.token;
              
              if (tokenData) {
                const migratedPool = tokenData.migrated_pool_address || '';

                // Debug logging for migrated pool address
                if (migratedPool && migratedPool !== '') {
                  console.log(`🔄 [Positions] Token ${tokenData.symbol} has migrated pool: ${migratedPool}`);
                } else {
                  console.log(`📍 [Positions] Token ${tokenData.symbol} - no migrated pool (using pair_address)`);
                }

                const metadata = {
                  imageUrl: tokenData.uri || tokenData.image || tokenData.logo || '',
                  protocol: tokenData.launchpad_protocol || tokenData.protocol || '',
                  name: tokenData.name || '',
                  symbol: tokenData.symbol || '',
                  migrated_pool_address: migratedPool, // For graduated tokens
                };
                
                // Update local state
                setTokenMetadata(prev => ({
                  ...prev,
                  [tokenAddress]: metadata
                }));
                
                // Update shared cache
                if (onUpdateCache) {
                  onUpdateCache(tokenAddress, metadata);
                }
                
                // Pass token names to parent if callback is provided
                if (onTokenNamesChange) {
                  const tokenNames: Record<string, string> = { [tokenAddress]: metadata.name || '' };
                  onTokenNamesChange(tokenNames);
                }
              }
            } catch (error) {
              // Set fallback metadata immediately so token doesn't stay at "Loading..."
              const fallback = {
                imageUrl: '',
                protocol: '',
                name: shortAddr(tokenAddress),
                symbol: '???',
              };
              setTokenMetadata(prev => ({
                ...prev,
                [tokenAddress]: fallback
              }));
              // Don't cache failed fetches
            }
          })
        );
      };
      
      // Don't await - let it load in background
      fetchAllMetadata();
    }
  }, [preloadedPositions, skipFetch, onTokenNamesChange]);

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
        const fetchAllMetadata = async () => {
          // Deduplicate tokens before fetching to avoid race conditions
          const uniqueTokens = Array.from(new Set(positions.map(p => p.tokenAddress)));
          
          // Filter out tokens that are already cached and valid
          const tokensToFetch = uniqueTokens.filter(token => 
            !isCacheValid || !isCacheValid(token)
          );
          
          if (tokensToFetch.length === 0) {
            console.log('✅ All tokens loaded from cache');
            return;
          }
          
          console.log(`🔄 Fetching ${tokensToFetch.length} tokens (${uniqueTokens.length - tokensToFetch.length} from cache)`);
          
          // Fetch all tokens in parallel using Promise.all for maximum speed
          await Promise.allSettled(
            tokensToFetch.map(async (tokenAddress) => {
              // Find the position to get the pair address
              const pos = positions.find(p => p.tokenAddress === tokenAddress);
              if (!pos) return;

              try {
                // Reduced timeout to 3s for faster failures
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);

                // IMPORTANT: Query by mint address (token address) instead of pair address
                // This ensures we get the correct migrated_pool_address for graduated tokens
                const response = await fetch(`/api/token-service/trade-view?mint_address=${tokenAddress}`, {
                  signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}`);
                }
                
                const data = await response.json();
                const tokenData = data?.token;
                
                if (tokenData) {
                  const metadata = {
                    imageUrl: tokenData.uri || tokenData.image || tokenData.logo || '',
                    protocol: tokenData.launchpad_protocol || tokenData.protocol || '',
                    name: tokenData.name || '',
                    symbol: tokenData.symbol || '',
                  };
                  
                  // Update local state
                  setTokenMetadata(prev => ({
                    ...prev,
                    [tokenAddress]: metadata
                  }));
                  
                  // Update shared cache
                  if (onUpdateCache) {
                    onUpdateCache(tokenAddress, metadata);
                  }
                  
                  // Pass token names to parent if callback is provided
                  if (onTokenNamesChange) {
                    const tokenNames: Record<string, string> = { [tokenAddress]: metadata.name || '' };
                    onTokenNamesChange(tokenNames);
                  }
                }
              } catch (error) {
                // Set fallback metadata immediately so token doesn't stay at "Loading..."
                const fallback = {
                  imageUrl: '',
                  protocol: '',
                  name: shortAddr(tokenAddress),
                  symbol: '???',
                };
                setTokenMetadata(prev => ({
                  ...prev,
                  [tokenAddress]: fallback
                }));
                // Don't cache failed fetches
              }
            })
          );
        };
        
        // Don't await - let it load in background
        fetchAllMetadata();
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
    <div className="w-full overflow-y-scroll scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800" style={{ maxHeight: '500px' }}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-[#1E1F26] z-20">
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
            [...positions]
              .reverse() // Reverse so newest/most recent positions appear at the top
              .filter(pos => showHidden || !hiddenTokens.has(pos.tokenAddress))
              .map((pos, idx) => {
              // For positions: backend stores originalPairAddress value in pairAddress field
              const navigateAddress = pos.pairAddress || pos.tokenAddress;
              const displayAddress = pos.pairAddress || pos.tokenAddress;
              
              const handleRowClick = () => {
                // Navigate immediately with pair_address or mint - trade page will handle resolution
                if (navigateAddress) {
                  router.push(`/trade/${navigateAddress}`);
                }
              };
              
              const metadata = tokenMetadata[pos.tokenAddress];
              
              // Protocol color mapping - matches PulseTable
              const getProtocolColor = (protocol?: string) => {
                const p = protocol?.toLowerCase() || '';
                if (p.includes('pump')) return '#22c55e'; // Green for Pump.fun
                if (p.includes('raydium')) return '#5c51f7'; // Purple for Raydium
                if (p.includes('meteora')) return '#ff4662'; // Pink-red for Meteora
                if (p.includes('moonit') || p.includes('moonshot') || p.includes('moonshoot')) return '#eab308'; // Yellow for Moonit/Moonshot
                if (p.includes('boop')) return '#134577'; // Dark blue for Boop
                if (p.includes('bonk')) return '#ff6b35'; // Orange for Bonk
                if (p.includes('bags')) return '#22c55e'; // Green for Bags
                if (p.includes('launch')) return '#3b82f6'; // Blue for LaunchLab (portfolio doesn't have column type, use default blue)
                return '#22c55e'; // Default to green
              };

              const protocolColor = getProtocolColor(metadata?.protocol);
              
              // Protocol icon mapping - returns image URL
              const getProtocolIcon = (protocol?: string): string => {
                const p = protocol?.toLowerCase() || '';
                
                if (p.includes('pump')) {
                  return 'https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png';
                }
                
                if (p.includes('meteora')) {
                  return 'https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013';
                }
                
                if (p.includes('raydium')) {
                  return 'https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png';
                }
                
                if (p.includes('boop')) {
                  return 'https://api.phantom.app/image-proxy/?image=https%3A%2F%2Fdhc7eusqrdwa0.cloudfront.net%2Fassets%2FBOOP_logo_icon_dark_bg.png&anim=true';
                }
                
                if (p.includes('moonit') || p.includes('moonshot') || p.includes('moonshoot')) {
                  return 'https://avatars.githubusercontent.com/u/174132191?s=280&v=4';
                }
                
                if (p.includes('bonk')) {
                  return 'https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png';
                }
                
                if (p.includes('bags')) {
                  return 'https://play-lh.googleusercontent.com/7AxVcu1pumxavcGTb16WBJQU88CDZd0v8q0WzFwfin7zbBvItYMuNQ0Xkqq4srTw4A=w240-h480-rw';
                }
                
                if (p.includes('launch')) {
                  // LaunchLab uses Raydium icon
                  return 'https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png';
                }
                
                // Default to pump.fun icon for unknown protocols
                return 'https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png';
              };

              const tokenIcon = getProtocolIcon(metadata?.protocol);
              const p = metadata?.protocol?.toLowerCase() || '';
              const isMeteora = p.includes('meteora');
              const isBonk = p.includes('bonk');
              const isBags = p.includes('bags');
              const isMoonit = p.includes('moonit') || p.includes('moonshot') || p.includes('moonshoot');
              const isFullCircleImage = isMeteora || isBonk || isBags || isMoonit;
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
                          width: 20, 
                          height: 20,
                          border: `2px solid ${protocolColor}`,
                          boxShadow: `0 0 4px ${protocolColor}60`
                        }}
                      >
                        <Image
                          src={tokenIcon}
                          alt={`${metadata?.protocol || 'Protocol'} logo`}
                          width={16}
                          height={16}
                          className={`${isFullCircleImage ? 'w-full h-full object-cover' : 'w-3/4 h-3/4 object-contain'} rounded-full`}
                        />
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
                  {(() => {
                    // Apply same unit correction as in PNL calculation
                    let correctedSold = pos.sold;
                    if (pos.sold > pos.bought * 1000) {
                      correctedSold = pos.sold / 1000000; // Scale down by 1 million
                    }
                    return formatSmartNumber(correctedSold);
                  })()}
                  <span className="ml-1 text-neutral-400">
                    {showInSOL && solPrice > 0
                      ? <>(<SolIcon />{formatSmartNumber(pos.soldUsdValue / solPrice)})</>
                      : `($${formatSmartNumber(pos.soldUsdValue)})`
                    }
                  </span>
                </td>
                <td className="px-2 py-2">
                  {(() => {
                    // Apply same unit correction for remaining amount
                    let correctedRemaining = pos.remaining;
                    if (pos.sold > pos.bought * 1000) {
                      // If sold amount had unit mismatch, remaining likely does too
                      correctedRemaining = pos.remaining / 1000000; // Scale down by 1 million
                    }
                    return formatSmartNumber(correctedRemaining);
                  })()}
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
                    
                    {/* Sell Button - Navigate to trade page with sell mode */}
                    {/* {pos.actions === 'sell' && (
                      <InterstateTooltip label="Sell">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPosition(pos);
                            setShowSellPopup(true);
                          }} 
                          className="p-1.5 rounded hover:bg-red-600/20 transition-colors text-neutral-400 hover:text-red-500"
                        >
                          <FaArrowUp className="text-sm" />
                        </button>
                      </InterstateTooltip>
                    )} */}
                  </div>
                </td>
              </tr>
              );
            })
          )}
          {/* Spacer row for bottom padding to ensure last item is scrollable */}
          {!loading && positions.length > 0 && (
            <tr style={{ height: '48px' }}>
              <td colSpan={6}></td>
            </tr>
          )}
        </tbody>
      </table>
      
      {/* Sell Popup */}
      {showSellPopup && selectedPosition && (
        <SellPopup
          isOpen={showSellPopup}
          onClose={() => {
            setShowSellPopup(false);
            setSelectedPosition(null);
          }}
          position={selectedPosition}
          tokenMetadata={tokenMetadata[selectedPosition.tokenAddress]}
          onSellSuccess={refreshPositions}
        />
      )}
    </div>
  );
};

export default Positions; 