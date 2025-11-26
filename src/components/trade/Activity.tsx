import React, { useEffect, useState } from 'react';
import { formatSmartNumber, formatMarketCap } from '~/utils/db';
import type { TradeRow } from '~/utils/functions';
import { useRouter } from 'next/router';
import FastImage from '../FastImage';
import { FaExternalLinkAlt } from 'react-icons/fa';
import Image from 'next/image';
import { useSolPrice } from '~/components/SolPriceContext';

interface TokenMetadata {
  imageUrl?: string;
  protocol?: string;
  name?: string;
  symbol?: string;
  createdAt?: number; // Token creation timestamp
  timestamp?: number;
}

interface ActivityProps {
  trades: TradeRow[];
  loading: boolean;
  onTokenNamesChange?: (tokenNames: Record<string, string>) => void; // Optional: callback to pass token names to parent
  tokenMetadataCache?: Record<string, TokenMetadata>; // Optional: shared cache
  onUpdateCache?: (tokenAddress: string, metadata: Omit<TokenMetadata, 'timestamp'>) => void; // Optional: update cache callback
  isCacheValid?: (tokenAddress: string) => boolean; // Optional: check if cache entry is valid
}

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

function formatAge(timestamp: number | string, currentTime: number): string {
  try {
    let date: Date;
    
    if (typeof timestamp === 'string') {
      // Handle different string formats
      if (timestamp.includes('T') || timestamp.includes(' ')) {
        // ISO string format
        date = new Date(timestamp);
      } else if (!isNaN(Number(timestamp))) {
        // Numeric string (could be seconds or milliseconds)
        const num = Number(timestamp);
        // If it's in seconds (less than year 2001), convert to milliseconds
        date = new Date(num < 1000000000 ? num * 1000 : num);
      } else {
        // Try parsing as date
        date = new Date(timestamp);
      }
    } else {
      // Numeric timestamp
      // If it's in seconds (less than year 2001), convert to milliseconds
      date = new Date(timestamp < 1000000000 ? timestamp * 1000 : timestamp);
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid timestamp:', timestamp);
      return 'Unknown';
    }
    
    const diff = currentTime - date.getTime();
    
    // TEMPORARY FIX: Handle timezone mismatch by adjusting for common timezone differences
    // If the difference is negative (future date), try adjusting for timezone
    let adjustedDiff = diff;
    if (diff < 0) {
      // Common timezone adjustments (in milliseconds)
      const timezoneAdjustments = [
        6 * 60 * 60 * 1000,  // +6 hours (common backend timezone)
        5 * 60 * 60 * 1000,  // +5 hours
        7 * 60 * 60 * 1000,  // +7 hours
        8 * 60 * 60 * 1000,  // +8 hours
      ];
      
      for (const adjustment of timezoneAdjustments) {
        const testDiff = diff + adjustment;
        if (testDiff > 0) {
          adjustedDiff = testDiff;
          console.log('Applied timezone adjustment:', {
            timestamp,
            originalDiff: diff,
            adjustment: adjustment / (60 * 60 * 1000) + ' hours',
            adjustedDiff: adjustedDiff
          });
          break;
        }
      }
    }
    
    const minutes = Math.floor(adjustedDiff / 60000);
    const hours = Math.floor(adjustedDiff / 3600000);
    const days = Math.floor(adjustedDiff / 86400000);
    const months = Math.floor(adjustedDiff / 2592000000);
    const years = Math.floor(adjustedDiff / 31536000000);
    
    // If still negative after adjustments, show as "Just now"
    if (adjustedDiff < 0) {
      console.warn('Future timestamp detected (even after timezone adjustment):', {
        timestamp,
        currentTime: new Date(currentTime).toISOString(),
        tradeTime: date.toISOString(),
        originalDiff: diff,
        adjustedDiff: adjustedDiff
      });
      return 'Just now';
    }
    
    if (years > 0) return `${years}y`;
    if (months > 0) return `${months}mo`;
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return 'Just now';
  } catch (error) {
    console.warn('Error formatting age:', error, 'for timestamp:', timestamp);
    return 'Unknown';
  }
}

const Activity: React.FC<ActivityProps> = ({ 
  trades, 
  loading, 
  onTokenNamesChange,
  tokenMetadataCache,
  onUpdateCache,
  isCacheValid
}) => {
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenMetadata>>({});
  const [currentTime, setCurrentTime] = useState(Date.now());
  const router = useRouter();
  const { solPrice } = useSolPrice();
  
  // Update current time every minute to refresh age calculations
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);
  
  // Initialize local metadata from cache if available
  useEffect(() => {
    if (tokenMetadataCache && Object.keys(tokenMetadataCache).length > 0) {
      setTokenMetadata(tokenMetadataCache);
    }
  }, [tokenMetadataCache]);

  useEffect(() => {
    if (!trades || trades.length === 0) return;
    
    // Fetch token data for each unique token in trades in parallel
    const fetchAllMetadata = async () => {
      const uniqueTokens = Array.from(new Set(trades.map(t => t.tokenAddress)));
      
      // Filter out tokens that are already cached and valid
      const tokensToFetch = uniqueTokens.filter(token => 
        !isCacheValid || !isCacheValid(token)
      );
      
      if (tokensToFetch.length === 0) {
        console.log('✅ All tokens loaded from cache (Activity)');
        return;
      }
      
      console.log(`🔄 Fetching ${tokensToFetch.length} tokens for Activity (${uniqueTokens.length - tokensToFetch.length} from cache)`);
      
      // Fetch all tokens in parallel using Promise.all for maximum speed
      await Promise.allSettled(
        tokensToFetch.map(async (tokenAddress) => {
          try {
            // Find the trade to get originalPairAddress (backend stores this for token-service lookups)
            const trade = trades.find(t => t.tokenAddress === tokenAddress);
            const pairAddress = trade?.originalPairAddress || trade?.pairAddress || tokenAddress;
            
            // Reduced timeout to 3s for faster failures
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(`/api/token-service/trade-view?pair_address=${pairAddress}`, {
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
                createdAt: tokenData.created_timestamp || tokenData.createdAt,
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
              name: `Token ${tokenAddress.slice(0, 6)}...`,
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
  }, [trades, onTokenNamesChange]);

  return (
    <div className="w-full">
      {loading ? (
        <div className="py-8 text-center text-[#9CA3AF]">Loading...</div>
      ) : trades.length === 0 ? (
        <div className="py-8 text-center text-[#9CA3AF]">No activity found.</div>
      ) : (
        <div className="relative">
          {/* Header Row - Fixed */}
          <div className="grid gap-4 px-6 py-2 border-b border-[#2A2B33] text-xs text-[#9CA3AF] bg-[#1E1F26]" style={{ gridTemplateColumns: '0.8fr 2fr 1.2fr 1.2fr 0.8fr 1fr' }}>
            <div>Type</div>
            <div>Token</div>
            <div>Amount</div>
            <div>Market Cap</div>
            <div>Age</div>
            <div>Explorer</div>
          </div>
          
          {/* Scrollable Data Rows */}
          <div 
            className="overflow-y-scroll scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800"
            style={{ 
              maxHeight: '500px',
              scrollBehavior: 'smooth',
              WebkitOverflowScrolling: 'touch'
            } as React.CSSProperties}
          >
            <div className="space-y-0 pb-12">
            {
              trades.map((trade, idx) => {
              const handleRowClick = () => {
                // Navigate to token trade page using originalPairAddress (same as Positions)
                const navigateAddress = trade.originalPairAddress || trade.pairAddress || trade.tokenAddress;
                if (navigateAddress) {
                  router.push(`/trade/${navigateAddress}`);
                }
              };
              
              const metadata = tokenMetadata[trade.tokenAddress];
              
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
              
              // Calculate age based on trade time
              // Since tradeTime only contains time (e.g., "15:04:16") without date,
              // we'll use createdAt which has the full timestamp
              // TODO: Backend should store full timestamp in tradeTime field
              const timestamp = trade.createdAt;
              const age = formatAge(timestamp, currentTime);
              
              // Debug logging for age calculation
              console.log('Age calculation debug:', {
                tokenAddress: trade.tokenAddress,
                tradeTime: trade.tradeTime,
                createdAt: trade.createdAt,
                timestamp: timestamp,
                age: age,
                currentTime: new Date().toISOString()
              });
              
              // Debug backend data inconsistency for same token
              console.log('Backend data analysis:', {
                tokenAddress: trade.tokenAddress,
                type: trade.type,
                marketCap: trade.marketCap,
                tokenAmount: trade.tokenAmount,
                usdValue: trade.usdValue,
                solAmount: trade.solAmount,
                transactionHash: trade.transactionHash
              });
              
              // Format market cap
              // Handle inconsistent market cap units from backend
              let marketCapValue = typeof trade.marketCap === 'string' 
                ? parseFloat(trade.marketCap) 
                : trade.marketCap;
              
              // TEMPORARY FIX: For same token, use the highest market cap value
              // This addresses backend inconsistency where same token has different market caps for buy/sell
              const sameTokenTrades = trades.filter(t => t.tokenAddress === trade.tokenAddress);
              const marketCaps = sameTokenTrades
                .map(t => typeof t.marketCap === 'string' ? parseFloat(t.marketCap) : t.marketCap)
                .filter(mc => mc && mc > 0);
              
              if (marketCaps.length > 0) {
                const maxMarketCap = Math.max(...marketCaps);
                if (maxMarketCap > marketCapValue) {
                  console.log('Using max market cap for consistency:', {
                    tokenAddress: trade.tokenAddress,
                    originalMarketCap: marketCapValue,
                    maxMarketCap: maxMarketCap,
                    allMarketCaps: marketCaps
                  });
                  marketCapValue = maxMarketCap;
                }
              }
              
              // If market cap is still suspiciously low (< $1), show "N/A"
              if (marketCapValue && marketCapValue < 1) {
                console.warn('Suspiciously low market cap detected:', {
                  tokenAddress: trade.tokenAddress,
                  type: trade.type,
                  marketCap: trade.marketCap,
                  marketCapValue: marketCapValue,
                  usdValue: trade.usdValue
                });
                
                marketCapValue = null;
              }
              
              const formattedMarketCap = marketCapValue ? `$${formatMarketCap(marketCapValue)}` : 'N/A';
              
              // Format amount (USD value)
              // ⚠️ VALIDATION: Detect if usdValue is suspiciously high (likely marketCap or wrong units)
              let amountValue = typeof trade.usdValue === 'string' 
                ? parseFloat(trade.usdValue) 
                : trade.usdValue;
              
              // For Sell trades, validate usdValue is reasonable
              // If usdValue > $10,000 and tokenAmount exists, check if it's actually marketCap
              if (trade.type === 'Sell' && amountValue && amountValue > 10000) {
                const marketCapNum = typeof trade.marketCap === 'string' 
                  ? parseFloat(trade.marketCap) 
                  : trade.marketCap;
                const solAmountNum = typeof trade.solAmount === 'string'
                  ? parseFloat(trade.solAmount)
                  : trade.solAmount;
                
                // If usdValue matches marketCap, it's definitely wrong - recalculate from solAmount
                if (marketCapNum && Math.abs(amountValue - marketCapNum) < 1000) {
                  console.warn('⚠️ DETECTED: usdValue matches marketCap for Sell trade - fixing:', {
                    tokenAddress: trade.tokenAddress,
                    originalUsdValue: amountValue,
                    marketCap: marketCapNum,
                    solAmount: solAmountNum,
                    calculatedUsdValue: solAmountNum ? solAmountNum * 200 : amountValue // ~$200 SOL price fallback
                  });
                  
                  // Recalculate from solAmount if available (SOL amount * current SOL price)
                  if (solAmountNum && solAmountNum > 0 && solAmountNum < 100) {
                    // If solAmount is reasonable (< 100 SOL), use it to calculate
                    const currentSolPrice = solPrice > 0 ? solPrice : 200; // Fallback to $200 if not available
                    amountValue = solAmountNum * currentSolPrice;
                    console.log('✅ Fixed usdValue using solAmount:', {
                      solAmount: solAmountNum,
                      solPrice: currentSolPrice,
                      calculatedUsdValue: amountValue
                    });
                  } else {
                    // If solAmount is also wrong, try to estimate from buy/sell comparison
                    const buyTrade = trades.find(t => 
                      t.tokenAddress === trade.tokenAddress && 
                      t.type === 'Buy' && 
                      t.transactionHash !== trade.transactionHash
                    );
                    if (buyTrade) {
                      const buyUsdValue = typeof buyTrade.usdValue === 'string' 
                        ? parseFloat(buyTrade.usdValue) 
                        : buyTrade.usdValue;
                      if (buyUsdValue && buyUsdValue < 1000 && buyUsdValue > 0) {
                        // Estimate sell value as percentage of buy value based on token amounts
                        const buyTokenAmount = typeof buyTrade.tokenAmount === 'string'
                          ? parseFloat(buyTrade.tokenAmount)
                          : buyTrade.tokenAmount;
                        const sellTokenAmount = typeof trade.tokenAmount === 'string'
                          ? parseFloat(trade.tokenAmount)
                          : trade.tokenAmount;
                        if (buyTokenAmount && sellTokenAmount && buyTokenAmount > 0) {
                          const sellRatio = sellTokenAmount / buyTokenAmount;
                          amountValue = buyUsdValue * sellRatio;
                          console.log('✅ Fixed usdValue using buy/sell ratio:', amountValue);
                        }
                      }
                    }
                  }
                  
                  // Final sanity check: if still way too high, use a conservative estimate
                  if (amountValue > 10000) {
                    // If we still have a suspiciously high value, scale it down
                    // This suggests the backend has a unit mismatch
                    amountValue = amountValue / 1000000; // Try dividing by 1 million
                    console.warn('⚠️ Still high after fixes, applying scale correction:', amountValue);
                  }
                }
                
                // Additional check: if solAmount exists and is reasonable, validate usdValue against it
                if (solAmountNum && solAmountNum > 0 && solAmountNum < 100) {
                  const currentSolPrice = solPrice > 0 ? solPrice : 200; // Fallback to $200 if not available
                  const expectedUsdValue = solAmountNum * currentSolPrice;
                  if (amountValue > expectedUsdValue * 10) {
                    // If usdValue is more than 10x what it should be, use the calculated value
                    console.warn('⚠️ usdValue is way too high compared to solAmount - fixing:', {
                      originalUsdValue: amountValue,
                      solAmount: solAmountNum,
                      solPrice: currentSolPrice,
                      expectedUsdValue: expectedUsdValue,
                      correctedValue: expectedUsdValue
                    });
                    amountValue = expectedUsdValue;
                  }
                }

                // Broad fallback: if still suspiciously high, try alternative corrections even when
                // it didn't match marketCap exactly
                if (amountValue > 10000) {
                  let corrected = false;
                  const currentSolPrice = solPrice > 0 ? solPrice : 200;

                  if (solAmountNum && solAmountNum > 0 && solAmountNum < 100) {
                    const expectedUsdValue = solAmountNum * currentSolPrice;
                    if (amountValue > expectedUsdValue * 5) {
                      amountValue = expectedUsdValue;
                      corrected = true;
                      console.warn('⚠️ Applying broad solAmount-based correction for high usdValue:', amountValue);
                    }
                  }

                  if (!corrected) {
                    const buyTrade = trades.find(t => 
                      t.tokenAddress === trade.tokenAddress && 
                      t.type === 'Buy' && 
                      t.transactionHash !== trade.transactionHash
                    );
                    if (buyTrade) {
                      const buyUsdValue = typeof buyTrade.usdValue === 'string' 
                        ? parseFloat(buyTrade.usdValue) 
                        : buyTrade.usdValue;
                      const buyTokenAmount = typeof buyTrade.tokenAmount === 'string' 
                        ? parseFloat(buyTrade.tokenAmount) 
                        : buyTrade.tokenAmount;
                      const sellTokenAmount = typeof trade.tokenAmount === 'string' 
                        ? parseFloat(trade.tokenAmount) 
                        : trade.tokenAmount;
                      if (buyUsdValue && buyTokenAmount && sellTokenAmount && buyTokenAmount > 0) {
                        const sellRatio = Math.min(sellTokenAmount / buyTokenAmount, 1);
                        const estimated = buyUsdValue * sellRatio;
                        if (amountValue > estimated * 10) {
                          amountValue = estimated;
                          corrected = true;
                          console.warn('⚠️ Applying broad buy/sell ratio correction for high usdValue:', amountValue);
                        }
                      }
                    }
                  }

                  // Final fallback: scale down by 1e6 if still absurdly high
                  if (!corrected && amountValue > 10000) {
                    amountValue = amountValue / 1000000;
                    console.warn('⚠️ Final fallback scale correction applied for high usdValue:', amountValue);
                  }
                }
              }
              
              const formattedAmount = amountValue && amountValue > 0 ? `$${formatSmartNumber(amountValue)}` : 'N/A';
              
              // Format token amount with unit correction
              let tokenAmountValue = typeof trade.tokenAmount === 'string' 
                ? parseFloat(trade.tokenAmount) 
                : trade.tokenAmount;
              
              // Apply same unit correction as in Positions component
              if (tokenAmountValue && tokenAmountValue > 1000000) {
                tokenAmountValue = tokenAmountValue / 1000000; // Scale down by 1 million
                console.log('Token amount unit correction applied:', {
                  tokenAddress: trade.tokenAddress,
                  type: trade.type,
                  originalAmount: trade.tokenAmount,
                  correctedAmount: tokenAmountValue
                });
              }
              
              const formattedTokenAmount = tokenAmountValue ? formatSmartNumber(tokenAmountValue) : 'N/A';
              
              return (
                <div 
                  key={trade.id || idx} 
                  className="grid gap-4 px-6 py-3 border-b border-[#2A2B33] hover:bg-[#17191E] transition-colors cursor-pointer"
                  style={{ gridTemplateColumns: '0.8fr 2fr 1.2fr 1.2fr 0.8fr 1fr' }}
                  onClick={handleRowClick}
                >
                  <div className="flex items-center">
                    <span 
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        trade.type === 'Buy' 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {trade.type}
                    </span>
                  </div>
                  <div className="flex items-center">
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
                          {trade.tokenName || metadata?.name || 'Loading...'}
                        </div>
                        <div className="text-xs text-neutral-400 font-mono truncate" title={trade.tokenAddress}>
                          {shortAddr(trade.tokenAddress)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <div className="font-medium text-white text-sm">{formattedAmount}</div>
                    <div className="text-xs text-neutral-400">
                      {formattedTokenAmount} tokens
                    </div>
                  </div>
                  <div className="flex items-center text-neutral-300 text-sm">
                    {formattedMarketCap}
                  </div>
                  <div className="flex items-center text-neutral-300 text-sm">
                    {age}
                  </div>
                  <div className="flex items-center">
                    <a
                      href={`https://solscan.io/tx/${trade.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()} // Prevent row click
                      className="flex items-center gap-1 text-[#70E0B0] hover:text-[#58B890] transition-colors text-xs"
                    >
                      <span>View</span>
                      <FaExternalLinkAlt className="text-xs" />
                    </a>
                  </div>
                </div>
              );
            })
          }
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Activity;

