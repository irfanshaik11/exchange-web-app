import React, { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { formatSmartNumber, formatSmallPrice } from '~/utils/db';
import { getActivePositionsByUser } from '~/utils/functions';
import type { PositionRow } from '~/utils/functions';
import { useRouter } from 'next/router';
import FastImage from '../FastImage';
import InterstateTooltip from '~/components/InterstateTooltip';
import { FaArrowUp, FaEye, FaEyeSlash } from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import Image from 'next/image';
import SellPopup from '../SellPopup';
import { fetchChainTokenMetadata, type UnifiedTokenMetadata } from '~/utils/tokenMetadata';
import { getProtocolBranding } from '~/utils/protocolBranding';

type TokenMetadata = UnifiedTokenMetadata & {
  timestamp?: number;
};

interface PositionsProps {
  userId: string;
  bearerToken: string;
  onPositionsChange: (positions: PositionRow[]) => void;
  preloadedPositions?: PositionRow[]; // Optional: use provided positions instead of fetching
  skipFetch?: boolean; // Optional: skip the API fetch if positions are provided
  onTokenNamesChange?: Dispatch<SetStateAction<Record<string, string>>>; // Optional: callback to pass token names to parent
  showHidden?: boolean; // Optional: whether to show hidden tokens
  onHiddenTokensChange?: (hiddenTokens: Set<string>) => void; // Optional: callback to pass hidden tokens to parent
  showInSOL?: boolean; // Optional: whether to show values in SOL instead of USD
  tokenMetadataCache?: Record<string, TokenMetadata>; // Optional: shared cache
  onUpdateCache?: (tokenAddress: string, metadata: Omit<TokenMetadata, 'timestamp'>) => void; // Optional: update cache callback
  isCacheValid?: (tokenAddress: string) => boolean; // Optional: check if cache entry is valid
  fallbackPositions?: Record<string, PositionRow>; // Optional: overrides for incomplete backend data (Monad)
}

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

const toNumericValue = (value: any) => (typeof value === 'number' ? value : Number(value)) || 0;
const isZeroishValue = (value: any) => !Number.isFinite(Number(value)) || Math.abs(Number(value)) < 1e-12;

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
  isCacheValid,
  fallbackPositions
}) => {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenMetadata>>({});
  const [hiddenTokens, setHiddenTokens] = useState<Set<string>>(new Set());
  const [showSellPopup, setShowSellPopup] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<PositionRow | null>(null);
  const [solPrice, setSolPrice] = useState<number>(0);
  const trimTrailingZeros = (value: string) => value.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');

  const renderTokenAmount = (value: number) => {
    if (!isFinite(value)) {
      return <span className="font-mono text-xs text-neutral-300">—</span>;
    }

    if (value === 0) {
      return <span className="font-mono text-xs text-neutral-300">0</span>;
    }

    const abs = Math.abs(value);
    let display: string;
    let isTiny = false;

    if (abs >= 1) {
      display = value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      });
    } else {
      const digits = Math.min(
        12,
        Math.max(4, Math.ceil(Math.abs(Math.log10(abs))) + 2),
      );
      const fixed = value.toFixed(digits);
      display = trimTrailingZeros(fixed);
      isTiny = true;
    }

    return (
      <span
        className={`font-mono ${isTiny ? 'text-[11px] text-neutral-200' : 'text-xs text-neutral-100'}`}
        title={value.toString()}
      >
        {display}
      </span>
    );
  };

  const router = useRouter();
  const currentChain = (router.query.chain as string) || 'sol';
  const blockchain = currentChain === 'monad' ? 'monad' : currentChain === 'sol' ? 'solana' : undefined;

  const mergeWithFallback = useCallback(
    (position: PositionRow): PositionRow => {
      if (!fallbackPositions) return position;

      const normalizedAddress = (position.tokenAddress || '').toLowerCase();
      const fallback = fallbackPositions[normalizedAddress];
      if (!fallback) return position;
      if ((position.blockchain || '').toLowerCase() !== 'monad') return position;

      const pickValue = (primary: number, backup: number) =>
        !isZeroishValue(primary) || isZeroishValue(backup) ? primary : backup;

      return {
        ...position,
        pairAddress: position.pairAddress || fallback.pairAddress,
        bought: pickValue(position.bought, fallback.bought),
        boughtUsdValue: pickValue(position.boughtUsdValue, fallback.boughtUsdValue),
        sold: pickValue(position.sold, fallback.sold),
        soldUsdValue: pickValue(position.soldUsdValue, fallback.soldUsdValue),
        remaining: pickValue(position.remaining, fallback.remaining),
        remainingUsdValue: pickValue(position.remainingUsdValue, fallback.remainingUsdValue),
        pnl: pickValue(position.pnl, fallback.pnl),
        pnlPercentage: pickValue(position.pnlPercentage, fallback.pnlPercentage),
        launchpad: position.launchpad || fallback.launchpad,
      };
    },
    [fallbackPositions],
  );

  // Function to refresh positions after a successful sell
  const refreshPositions = async () => {
    if (userId) {
      try {
        const updatedPositions = await getActivePositionsByUser(userId, blockchain);
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

  const requestMetadataForTokens = useCallback(
    async (positionsSource: PositionRow[]) => {
      if (!positionsSource || positionsSource.length === 0) {
        return;
      }

      const uniqueTokens = Array.from(new Set(positionsSource.map((p) => p.tokenAddress))).filter(Boolean);
      const tokensToFetch = uniqueTokens.filter((token) => !isCacheValid || !isCacheValid(token));

      if (tokensToFetch.length === 0) {
        console.log("✅ All position tokens loaded from cache");
        return;
      }

      console.log(`🔄 Fetching ${tokensToFetch.length} tokens (${uniqueTokens.length - tokensToFetch.length} from cache)`);

      await Promise.allSettled(
        tokensToFetch.map(async (tokenAddress) => {
          const position = positionsSource.find((p) => p.tokenAddress === tokenAddress);
          if (!position) return;

          const controller = new AbortController();
          // Increase timeout for Monad tokens (they may need more time)
          const isMonadToken = position.blockchain === 'monad' || tokenAddress.toLowerCase().startsWith('0x');
          const timeoutMs = isMonadToken ? 10000 : 3000;
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          try {
            // Normalize Monad addresses to lowercase for consistency
            const normalizedAddress = isMonadToken 
              ? tokenAddress.toLowerCase() 
              : tokenAddress;
            
            console.log(`🔍 [Positions] Fetching metadata for ${isMonadToken ? 'Monad' : 'Solana'} token:`, {
              original: tokenAddress,
              normalized: normalizedAddress,
              blockchain: position.blockchain,
            });
            
            const metadata = await fetchChainTokenMetadata(normalizedAddress, {
              signal: controller.signal,
              pairAddress: position.pairAddress,
            });

            if (!metadata) {
              console.log(`ℹ️ [Positions] No metadata returned for ${normalizedAddress} - using fallback`, {
                positionImageUrl: position.imageUrl ? 'present' : 'missing',
              });
              // Don't throw - create fallback metadata instead
              // Use imageUrl from position if available (saved during buy)
              const fallbackMetadata: TokenMetadata = {
                address: normalizedAddress,
                name: `Token ${shortAddr(normalizedAddress)}`, // Better than just address
                symbol: position.blockchain === "monad" ? "MON" : "???",
                protocol: position.launchpad || "",
                launchpad: position.launchpad || "",
                imageUrl: position.imageUrl || undefined, // Use saved imageUrl from position
              };
              
              console.log(`📸 [Positions] Fallback imageUrl for ${normalizedAddress}:`, fallbackMetadata.imageUrl || 'NONE');
              
              setTokenMetadata((prev) => ({
                ...prev,
                [tokenAddress]: fallbackMetadata,
              }));

              if (onTokenNamesChange) {
                onTokenNamesChange((prev) => ({
                  ...prev,
                  [tokenAddress]: fallbackMetadata.name || shortAddr(tokenAddress),
                }));
              }
              return; // Exit early, don't process as success
            }
            
            console.log(`✅ [Positions] Metadata fetched for ${normalizedAddress}:`, {
              name: metadata.name,
              symbol: metadata.symbol,
              imageUrl: metadata.imageUrl ? 'present' : 'missing',
              positionImageUrl: position.imageUrl ? 'present' : 'missing',
            });

            const enriched: TokenMetadata = {
              ...metadata,
              protocol: metadata.protocol || metadata.launchpad || position.launchpad || "",
              launchpad: metadata.launchpad || metadata.protocol || position.launchpad || "",
              migrated_pool_address: metadata.migrated_pool_address,
              // Prefer saved imageUrl from position (saved during buy) over fetched metadata
              imageUrl: position.imageUrl || metadata.imageUrl,
            };
            
            console.log(`📸 [Positions] Final imageUrl for ${normalizedAddress}:`, enriched.imageUrl || 'NONE');

            setTokenMetadata((prev) => ({
              ...prev,
              [tokenAddress]: enriched,
            }));

            if (onUpdateCache) {
              onUpdateCache(tokenAddress, enriched);
            }

            if (onTokenNamesChange) {
              onTokenNamesChange((prev) => ({
                ...prev,
                [tokenAddress]: enriched.name || shortAddr(tokenAddress),
              }));
            }
          } catch (error: any) {
            console.warn(`❌ [Positions] Failed to fetch metadata for ${tokenAddress}:`, error?.message || error);
            console.warn(`   Error details:`, {
              tokenAddress,
              normalized: isMonadToken ? tokenAddress.toLowerCase() : tokenAddress,
              blockchain: position.blockchain,
              error: error?.message,
            });
            
            // Create a better fallback with a more descriptive name
            // Use imageUrl from position if available (saved during buy)
            const fallback: TokenMetadata = {
              imageUrl: position.imageUrl || "", // Use saved imageUrl from position
              protocol: position.launchpad || "",
              launchpad: position.launchpad || "",
              name: `Token ${shortAddr(tokenAddress)}`, // Shows as "Token 0xc4...7777" instead of just address
              symbol: position.blockchain === "monad" ? "MON" : "???",
            };

            setTokenMetadata((prev) => ({
              ...prev,
              [tokenAddress]: fallback,
            }));

            if (onTokenNamesChange) {
              onTokenNamesChange((prev) => ({
                ...prev,
                [tokenAddress]: fallback.name || shortAddr(tokenAddress),
              }));
            }
          } finally {
            clearTimeout(timeoutId);
          }
        }),
      );
    },
    [isCacheValid, onTokenNamesChange, onUpdateCache],
  );

  // If preloaded positions are provided, use them
  useEffect(() => {
    if (preloadedPositions && skipFetch) {
      setPositions(preloadedPositions);
      setLoading(false);
      requestMetadataForTokens(preloadedPositions);
    }
  }, [preloadedPositions, skipFetch, requestMetadataForTokens]);

  useEffect(() => {
    if (skipFetch) return; // Skip fetch if using preloaded positions
    
    if (!userId) {
      console.log('⚠️ Positions: No userId provided');
      return;
    }
    
    let isInitialLoad = true;
    
    const fetchPositions = async () => {
      console.log(`🔍 Fetching positions for userId: ${userId}`);
      if (isInitialLoad) {
        setLoading(true);
      }
      try {
        console.log(`🔍 [Positions] Fetching with blockchain: ${blockchain || 'all'}`);
        const fetchedPositions = await getActivePositionsByUser(userId, blockchain);

        console.log(`✅ [Positions] Received ${fetchedPositions.length} positions`);
        if (fetchedPositions.length === 0) {
          console.log(`   ⚠️  No positions found for blockchain: ${blockchain || 'all'}`);
        }

        setPositions(fetchedPositions);
        onPositionsChange(fetchedPositions);
        requestMetadataForTokens(fetchedPositions);
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
  }, [userId, onPositionsChange, skipFetch, blockchain, requestMetadataForTokens]);

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
              .filter(pos => (pos.remaining > 0) && (showHidden || !hiddenTokens.has(pos.tokenAddress)))
              .map((pos, idx) => {
              const sourcePosition = mergeWithFallback(pos);

              // Helper function to calculate corrected values for this position
              const getCorrectedValues = () => {
                // Apply unit correction for token amounts
                let correctedBought = toNumericValue(sourcePosition.bought);
                let correctedSold = toNumericValue(sourcePosition.sold);

                if (correctedSold > correctedBought * 1000) {
                  correctedSold = correctedSold / 1000000; // Scale down by 1 million
                }

                const correctedRemaining = correctedBought - correctedSold;
                
                // Correct soldUsdValue
                let correctedSoldUsdValue = toNumericValue(sourcePosition.soldUsdValue);
                const boughtUsdValue = toNumericValue(sourcePosition.boughtUsdValue);
                
                // Check if soldUsdValue is suspiciously high compared to boughtUsdValue
                if (correctedSoldUsdValue > 10000 && boughtUsdValue > 0 && boughtUsdValue < 1000) {
                  // Check if sold amount is impossible (> bought)
                  if (correctedSold > correctedBought) {
                    if (correctedBought > 0) {
                      const sellRatio = Math.min(correctedSold / correctedBought, 1);
                      correctedSoldUsdValue = boughtUsdValue * sellRatio;
                      
                      console.warn('⚠️ DETECTED: Invalid soldUsdValue in Positions (sold > bought) - fixing:', {
                        tokenAddress: pos.tokenAddress,
                        originalSoldUsdValue: pos.soldUsdValue,
                        boughtUsdValue: boughtUsdValue,
                        sold: correctedSold,
                        bought: correctedBought,
                        correctedSold: correctedSold,
                        sellRatio: sellRatio,
                        correctedSoldUsdValue: correctedSoldUsdValue
                      });
                    }
                  } else if (correctedSoldUsdValue > boughtUsdValue * 100) {
                    const sellRatio = correctedSold / correctedBought;
                    correctedSoldUsdValue = boughtUsdValue * Math.min(sellRatio, 1);
                    
                    console.warn('⚠️ DETECTED: soldUsdValue is way too high in Positions - fixing:', {
                      tokenAddress: pos.tokenAddress,
                      originalSoldUsdValue: pos.soldUsdValue,
                      boughtUsdValue: boughtUsdValue,
                      sellRatio: sellRatio,
                      correctedSoldUsdValue: correctedSoldUsdValue
                    });
                  }
                }
                
                // Final sanity check: if sold > bought (impossible), cap soldUsdValue at boughtUsdValue
                if (correctedSold > correctedBought && correctedSoldUsdValue > boughtUsdValue) {
                  correctedSoldUsdValue = boughtUsdValue;
                  console.warn('⚠️ Capping soldUsdValue at boughtUsdValue (sold > bought is impossible):', {
                    tokenAddress: pos.tokenAddress,
                    sold: correctedSold,
                    bought: correctedBought,
                    correctedSoldUsdValue: correctedSoldUsdValue
                  });
                }
                
                // Correct remainingUsdValue
                let correctedRemainingUsdValue = toNumericValue(sourcePosition.remainingUsdValue);
                
                // If remaining is negative (impossible - can't sell more than bought), fix remainingUsdValue
                if (correctedRemaining < 0 || correctedSold > correctedBought) {
                  if (correctedBought > 0 && correctedRemaining >= 0) {
                    const avgBuyPrice = boughtUsdValue / correctedBought;
                    correctedRemainingUsdValue = correctedRemaining * avgBuyPrice;
                    
                    console.warn('⚠️ DETECTED: Invalid remainingUsdValue in Positions - fixing:', {
                      tokenAddress: pos.tokenAddress,
                      originalRemainingUsdValue: sourcePosition.remainingUsdValue,
                      remaining: correctedRemaining,
                      correctedRemaining: correctedRemaining,
                      avgBuyPrice: avgBuyPrice,
                      correctedRemainingUsdValue: correctedRemainingUsdValue
                    });
                  } else {
                    correctedRemainingUsdValue = 0;
                  }
                }
                
                // If remainingUsdValue is suspiciously large, recalculate
                if (Math.abs(correctedRemainingUsdValue) > 10000 && boughtUsdValue > 0 && boughtUsdValue < 1000) {
                  const safeRemaining = Math.max(0, correctedRemaining);
                  if (correctedBought > 0) {
                    const avgBuyPrice = boughtUsdValue / correctedBought;
                    correctedRemainingUsdValue = safeRemaining * avgBuyPrice;
                    
                    console.warn('⚠️ DETECTED: remainingUsdValue is suspiciously large - fixing:', {
                      tokenAddress: pos.tokenAddress,
                      originalRemainingUsdValue: pos.remainingUsdValue,
                      correctedRemaining: correctedRemaining,
                      correctedRemainingUsdValue: correctedRemainingUsdValue
                    });
                  }
                }
                
                // Recalculate PnL using corrected values
                const correctedPnl = (correctedSoldUsdValue + correctedRemainingUsdValue) - boughtUsdValue;
                const correctedPnlPercentage = boughtUsdValue > 0 
                  ? (correctedPnl / boughtUsdValue) * 100 
                  : 0;
                
                return {
                  correctedSold,
                  correctedBought,
                  correctedRemaining,
                  correctedSoldUsdValue,
                  correctedRemainingUsdValue,
                  correctedPnl,
                  correctedPnlPercentage
                };
              };
              
              const corrected = getCorrectedValues();
              
              // For positions: backend stores originalPairAddress value in pairAddress field
              const navigateAddress = sourcePosition.pairAddress || pos.tokenAddress;
              const displayAddress = sourcePosition.pairAddress || pos.tokenAddress;
              
              const handleRowClick = () => {
                const isMonadPosition =
                  (sourcePosition.blockchain || '').toLowerCase() === 'monad' ||
                  currentChain === 'monad';

                if (isMonadPosition && sourcePosition.tokenAddress) {
                  router.push(`/trade/monad/${sourcePosition.tokenAddress}`);
                  return;
                }

                if (navigateAddress) {
                  router.push(`/trade/${navigateAddress}`);
                }
              };
              
              const metadata = tokenMetadata[pos.tokenAddress];
              const protocolSource = metadata?.protocol || metadata?.launchpad || sourcePosition.launchpad || '';
              const branding = getProtocolBranding(protocolSource);
              const protocolColor = branding.color;
              const tokenIcon = branding.iconUrl;
              const isFullCircleImage = branding.isFullCircle;
              const isHidden = hiddenTokens.has(pos.tokenAddress);
              
              // Use position.imageUrl as final fallback if metadata doesn't have it
              const finalImageUrl = metadata?.imageUrl || sourcePosition.imageUrl || '';
              
              // Debug logging for missing images
              if (!finalImageUrl && (metadata?.symbol || sourcePosition.tokenAddress)) {
                console.log(`⚠️ [Positions Render] No imageUrl for token:`, {
                  tokenAddress: pos.tokenAddress,
                  symbol: metadata?.symbol,
                  metadataImageUrl: metadata?.imageUrl,
                  positionImageUrl: sourcePosition.imageUrl,
                });
              }
              
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
                              src={finalImageUrl}
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
                        {metadata?.name || shortAddr(displayAddress)}
                      </div>
                      <div className="text-xs text-neutral-400 font-mono truncate" title={displayAddress}>
                        {shortAddr(displayAddress)}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-baseline gap-1">
                    {renderTokenAmount(corrected.correctedBought)}
                    <span className="text-neutral-400">
                      {showInSOL && solPrice > 0
                        ? <>(<SolIcon />{formatSmartNumber(sourcePosition.boughtUsdValue / solPrice)})</>
                        : `($${formatSmallPrice(Math.max(0, sourcePosition.boughtUsdValue || 0))})`
                      }
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-baseline gap-1">
                    {renderTokenAmount(corrected.correctedSold)}
                    <span className="text-neutral-400">
                      {showInSOL && solPrice > 0
                        ? <>(<SolIcon />{formatSmartNumber(corrected.correctedSoldUsdValue / solPrice)})</>
                        : `($${formatSmallPrice(corrected.correctedSoldUsdValue)})`
                      }
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-baseline gap-1">
                    {renderTokenAmount(corrected.correctedRemaining)}
                    <span className="text-neutral-400">
                      {showInSOL && solPrice > 0
                        ? <>(<SolIcon />{formatSmartNumber(corrected.correctedRemainingUsdValue / solPrice)})</>
                        : `($${formatSmallPrice(corrected.correctedRemainingUsdValue)})`
                      }
                    </span>
                  </div>
                </td>
                <td className={`px-2 py-2 font-semibold ${corrected.correctedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}> 
                  {showInSOL && solPrice > 0
                    ? <>{corrected.correctedPnl >= 0 ? '+' : ''}<SolIcon />{formatSmartNumber(Math.abs(corrected.correctedPnl) / solPrice)}</>
                    : `${corrected.correctedPnl >= 0 ? '+' : ''}$${formatSmallPrice(Math.abs(corrected.correctedPnl))}`
                  }
                  <span className="ml-1 text-xs">({formatSmallPrice(corrected.correctedPnlPercentage)}%)</span>
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