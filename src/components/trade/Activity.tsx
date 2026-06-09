import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { formatSmartNumber, formatMarketCap, formatSmallPrice } from '~/utils/db';
import type { TradeRow } from '~/utils/functions';
import { useRouter } from 'next/router';
import FastImage from '../FastImage';
import { FaExternalLinkAlt } from 'react-icons/fa';
import Image from 'next/image';
import { useSolPrice } from '~/components/SolPriceContext';
import { fetchChainTokenMetadata, fetchPumpfunImage, isPumpfunToken, toNumber, type UnifiedTokenMetadata } from '~/utils/tokenMetadata';
import { resolveTokenImageByMint } from '~/utils/images';
import { getProtocolBranding } from '~/utils/protocolBranding';
import { preloadTradeChart } from '~/utils/preloadTradeChart';

const DEFAULT_MON_PRICE = 0.1;

type TokenMetadata = UnifiedTokenMetadata & {
  timestamp?: number;
};

interface ActivityProps {
  trades: TradeRow[];
  loading: boolean;
  onTokenNamesChange?: Dispatch<SetStateAction<Record<string, string>>>; // Optional: callback to pass token names to parent
  tokenMetadataCache?: Record<string, TokenMetadata>; // Optional: shared cache
  onUpdateCache?: (tokenAddress: string, metadata: Omit<TokenMetadata, 'timestamp'>) => void; // Optional: update cache callback
  isCacheValid?: (tokenAddress: string) => boolean; // Optional: check if cache entry is valid
  maxTokenNameLength?: number; // Optional: truncate displayed token name to N characters
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
  isCacheValid,
  maxTokenNameLength
}) => {
  const truncateName = (name: string) =>
    maxTokenNameLength && name.length > maxTokenNameLength
      ? `${name.slice(0, maxTokenNameLength)}…`
      : name;
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenMetadata>>({});
  const [pumpfunImages, setPumpfunImages] = useState<Record<string, string>>({});
  // Images resolved via the token-service search endpoint (reliable mint→image
  // source). searchAttemptedRef prevents re-querying misses on every render.
  const [searchImages, setSearchImages] = useState<Record<string, string>>({});
  const searchAttemptedRef = useRef<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [monPriceUsd, setMonPriceUsd] = useState(0);
  const router = useRouter();
  const currentChain = (router.query.chain as string) || 'sol';
  const { solPrice } = useSolPrice();
  
  // Update current time every second to keep age labels fresh
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchMonPrice = async () => {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;

      try {
        const response = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd",
          controller ? { signal: controller.signal } : undefined,
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const price = data?.monad?.usd;

        if (isMounted && typeof price === "number" && price > 0) {
          setMonPriceUsd(price);
        }
      } catch (error) {
        if (isMounted) {
          console.warn("Failed to fetch MON price:", error);
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    };

    fetchMonPrice();
    const intervalId = setInterval(fetchMonPrice, 60000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);
  
  // Initialize local metadata from cache if available
  useEffect(() => {
    if (tokenMetadataCache && Object.keys(tokenMetadataCache).length > 0) {
      setTokenMetadata(tokenMetadataCache);
    }
  }, [tokenMetadataCache]);

  const requestMetadataForTrades = useCallback(
    async (tradesSource: TradeRow[]) => {
      if (!tradesSource || tradesSource.length === 0) return;

      const uniqueTokens = Array.from(new Set(tradesSource.map((trade) => trade.tokenAddress))).filter(Boolean);
      const tokensToFetch = uniqueTokens.filter((token) => !isCacheValid || !isCacheValid(token));

      if (tokensToFetch.length === 0) {
        return;
      }

      await Promise.allSettled(
        tokensToFetch.map(async (tokenAddress) => {
          const trade = tradesSource.find((t) => t.tokenAddress === tokenAddress);
          if (!trade) return;

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          try {
            // Normalize Monad addresses to lowercase for consistency
            const isMonadToken = trade.blockchain === 'monad' || tokenAddress.toLowerCase().startsWith('0x');
            const normalizedAddress = isMonadToken 
              ? tokenAddress.toLowerCase() 
              : tokenAddress;
            
            const metadata = await fetchChainTokenMetadata(normalizedAddress, {
              signal: controller.signal,
              pairAddress: trade.originalPairAddress || trade.pairAddress,
            });

            if (!metadata) {
              throw new Error("Metadata unavailable");
            }

            const enriched: TokenMetadata = {
              ...metadata,
              protocol: metadata.protocol || metadata.launchpad || trade.launchpad || "",
              launchpad: metadata.launchpad || metadata.protocol || trade.launchpad || "",
              marketCapUsd: metadata.marketCapUsd, // Preserve market cap from metadata
              priceUsd: metadata.priceUsd, // Preserve price from metadata
              imageUrl: trade.imageUrl || metadata.imageUrl, // Prefer DB-saved direct URL over metadata JSON URI
            };

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
          } catch (error) {
            console.warn(`Failed to fetch metadata for ${tokenAddress}:`, error);
            const fallback: TokenMetadata = {
              imageUrl: trade.imageUrl || "",
              protocol: trade.launchpad || "",
              launchpad: trade.launchpad || "",
              name: trade.tokenName || shortAddr(tokenAddress),
              symbol: "???",
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

  useEffect(() => {
    if (!trades || trades.length === 0) return;
    requestMetadataForTrades(trades);
  }, [trades, requestMetadataForTrades]);

  // Fetch Pump.fun images as fallback for tokens with missing images
  useEffect(() => {
    const fetchMissingPumpfunImages = async () => {
      const tokensNeedingImages = trades
        .map((t) => t.tokenAddress)
        .filter((addr, i, arr) => arr.indexOf(addr) === i) // unique
        .filter((addr) => isPumpfunToken(addr))
        .filter((addr) => {
          const metadata = tokenMetadata[addr];
          const trade = trades.find((t) => t.tokenAddress === addr);
          const hasImage = metadata?.imageUrl || trade?.imageUrl || pumpfunImages[addr];
          return !hasImage;
        });

      if (tokensNeedingImages.length === 0) return;

      const results = await Promise.allSettled(
        tokensNeedingImages.map(async (tokenAddress) => {
          const result = await fetchPumpfunImage(tokenAddress);
          return { tokenAddress, imageUrl: result?.imageUrl };
        })
      );

      const newImages: Record<string, string> = {};
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.imageUrl) {
          newImages[result.value.tokenAddress] = result.value.imageUrl;
        }
      }

      if (Object.keys(newImages).length > 0) {
        setPumpfunImages((prev) => ({ ...prev, ...newImages }));
      }
    };

    if (Object.keys(tokenMetadata).length > 0 || trades.length > 0) {
      fetchMissingPumpfunImages();
    }
  }, [trades, tokenMetadata, pumpfunImages]);

  // Resolve images via the token-service search endpoint for any token still
  // missing one. This is the reliable image source: wallet positions/trades and
  // /v1/token/{mint} carry no image, but /v1/search does (the path the token page
  // uses). Covers non-pump.fun tokens the Pump.fun fallback above can't.
  useEffect(() => {
    const resolveMissingImages = async () => {
      const tokensNeedingImages = trades
        .map((t) => t.tokenAddress)
        .filter((addr, i, arr) => arr.indexOf(addr) === i) // unique
        .filter((addr) => {
          if (!addr || searchAttemptedRef.current.has(addr)) return false;
          // /v1/search is the Solana token service — skip EVM/Monad (0x) mints.
          if (addr.toLowerCase().startsWith('0x')) return false;
          const metadata = tokenMetadata[addr];
          const trade = trades.find((t) => t.tokenAddress === addr);
          const hasImage = metadata?.imageUrl || trade?.imageUrl || pumpfunImages[addr];
          return !hasImage;
        });

      if (tokensNeedingImages.length === 0) return;
      // Mark attempted up front so a failed lookup isn't retried every render.
      tokensNeedingImages.forEach((addr) => searchAttemptedRef.current.add(addr));

      const results = await Promise.allSettled(
        tokensNeedingImages.map(async (tokenAddress) => {
          const imageUrl = await resolveTokenImageByMint(tokenAddress);
          return { tokenAddress, imageUrl };
        })
      );

      const newImages: Record<string, string> = {};
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.imageUrl) {
          newImages[result.value.tokenAddress] = result.value.imageUrl;
        }
      }

      if (Object.keys(newImages).length > 0) {
        setSearchImages((prev) => ({ ...prev, ...newImages }));
      }
    };

    if (trades.length > 0) {
      resolveMissingImages();
    }
  }, [trades, tokenMetadata, pumpfunImages]);

  return (
    <div className="w-full">
      {trades.length > 0 ? (
        <div className="relative">
          {/* Header Row - Fixed */}
          <div className="grid gap-4 px-6 py-3 border-b border-white/[0.06] text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30" style={{ gridTemplateColumns: '0.8fr 2fr 1.2fr 1.2fr 0.8fr 1fr', background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 rgba(255, 255, 255, 0.02)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
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
              [...trades].sort((a, b) => {
                // Sort by createdAt timestamp (newest first)
                const aTime = new Date(a.createdAt).getTime();
                const bTime = new Date(b.createdAt).getTime();
                return bTime - aTime; // Descending order (newest first)
              }).map((trade, idx) => {
              const metadata = tokenMetadata[trade.tokenAddress];

              const handleRowClick = () => {
                const navigateAddress = trade.tokenAddress || trade.originalPairAddress || trade.pairAddress;
                const isMonadTrade =
                  (trade.blockchain || '').toLowerCase() === 'monad' || currentChain === 'monad';

                // Token metadata params (optimistic loading)
                const name = metadata?.name || trade.tokenName;
                const symbol = metadata?.symbol || trade.tokenSymbol;
                const mcap = metadata?.marketCapUsd ?? trade.marketCap;
                const image = metadata?.imageUrl || trade.imageUrl;
                const launchpad = metadata?.launchpad || metadata?.protocol || trade.launchpad;
                const createdAt = metadata?.createdAt;

                if (isMonadTrade && trade.tokenAddress) {
                  const monadParams = new URLSearchParams();
                  if (name) monadParams.set('_name', name);
                  if (symbol) monadParams.set('_symbol', symbol);
                  if (mcap) monadParams.set('_mcap', String(mcap));
                  if (image) monadParams.set('_image', image);
                  monadParams.set('_mint', trade.tokenAddress);
                  if (launchpad) monadParams.set('_launchpad_protocol', launchpad);
                  if (createdAt) monadParams.set('_created_at', String(createdAt));
                  monadParams.set('chain', 'monad');
                  router.push(`/trade/monad/${trade.tokenAddress}?${monadParams.toString()}`);
                  return;
                }

                if (navigateAddress) {
                  router.push(`/trade/${navigateAddress}`);
                }
              };
              const protocolSource = metadata?.protocol || metadata?.launchpad || trade.launchpad || '';
              const branding = getProtocolBranding(protocolSource);
              const protocolColor = branding.color;
              const tokenIcon = branding.iconUrl;
              const isFullCircleImage = branding.isFullCircle;
              
              // Calculate age based on trade time
              // Since tradeTime only contains time (e.g., "15:04:16") without date,
              // we'll use createdAt which has the full timestamp
              // TODO: Backend should store full timestamp in tradeTime field
              const timestamp = trade.createdAt;
              const age = formatAge(timestamp, currentTime);

              // Format market cap — use the historical value saved in DB at time of trade
              const marketCapRaw = toNumber(trade.marketCap);
              const marketCapValue = marketCapRaw > 0 ? marketCapRaw : null;
              
              const formattedMarketCap = marketCapValue && marketCapValue > 0 ? `$${formatMarketCap(marketCapValue)}` : 'N/A';
              
              // Format amount (USD value)
              // ⚠️ VALIDATION: Detect if usdValue is suspiciously high (likely marketCap or wrong units)
              let amountValue = toNumber(trade.usdValue);
              const solAmountNum = toNumber(trade.solAmount);
              
              // Format token amount with unit correction
              let tokenAmountValue = toNumber(trade.tokenAmount);
              
              // Apply same unit correction as in Positions component
              if (tokenAmountValue && tokenAmountValue > 1000000) {
                tokenAmountValue = tokenAmountValue / 1000000; // Scale down by 1 million
              }
              
              // For Sell trades, if tokenAmount is missing or 0, try to calculate it from other data
              if (trade.type === 'Sell' && (!tokenAmountValue || tokenAmountValue <= 0)) {
                // Try to calculate from usdValue and price
                if (amountValue && amountValue > 0 && metadata?.priceUsd && metadata.priceUsd > 0) {
                  tokenAmountValue = amountValue / metadata.priceUsd;
                }
                // If still missing, try to find corresponding buy trade
                if ((!tokenAmountValue || tokenAmountValue <= 0) && amountValue && amountValue > 0) {
                  const buyTrade = trades.find(t => 
                    t.tokenAddress === trade.tokenAddress && 
                    t.type === 'Buy' && 
                    t.transactionHash !== trade.transactionHash
                  );
                  if (buyTrade) {
                    const buyUsdValue = toNumber(buyTrade.usdValue);
                    const buyTokenAmount = toNumber(buyTrade.tokenAmount);
                    // Apply unit correction to buy token amount if needed
                    let correctedBuyTokenAmount = buyTokenAmount;
                    if (correctedBuyTokenAmount && correctedBuyTokenAmount > 1000000) {
                      correctedBuyTokenAmount = correctedBuyTokenAmount / 1000000;
                    }
                    // Estimate sell token amount based on sell/buy USD ratio
                    if (buyUsdValue && buyUsdValue > 0 && correctedBuyTokenAmount && correctedBuyTokenAmount > 0) {
                      const sellRatio = amountValue / buyUsdValue;
                      tokenAmountValue = correctedBuyTokenAmount * sellRatio;
                    }
                  }
                }
              }
              
              // For Sell trades, validate usdValue is reasonable
              // If usdValue > $10,000 and tokenAmount exists, check if it's actually marketCap
              if (trade.type === 'Sell' && amountValue && amountValue > 10000) {
                const marketCapNum = toNumber(trade.marketCap);
                
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
              
              if ((!amountValue || amountValue <= 0) && tokenAmountValue > 0 && metadata?.priceUsd) {
                amountValue = tokenAmountValue * metadata.priceUsd;
              }

              if ((!amountValue || amountValue <= 0) && solAmountNum > 0) {
                if ((trade.blockchain || '').toLowerCase() === 'monad') {
                  const effectiveMonPrice = monPriceUsd > 0 ? monPriceUsd : DEFAULT_MON_PRICE;
                  amountValue = solAmountNum * effectiveMonPrice;
                } else if (solPrice > 0) {
                  amountValue = solAmountNum * solPrice;
                }
              }

              const formattedAmount = amountValue && amountValue > 0 ? `$${formatSmallPrice(amountValue)}` : 'N/A';
              
              const explorerUrl = trade.transactionHash
                ? ((trade.blockchain || '').toLowerCase() === 'monad'
                    ? `https://monadvision.com/tx/${trade.transactionHash}`
                    : `https://solscan.io/tx/${trade.transactionHash}`)
                : undefined;

              const formattedTokenAmount = tokenAmountValue ? formatSmartNumber(tokenAmountValue) : 'N/A';
              
              return (
                <div
                  key={trade.id || idx}
                  className="grid gap-4 px-6 py-3 border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors cursor-pointer"
                  style={{ gridTemplateColumns: '0.8fr 2fr 1.2fr 1.2fr 0.8fr 1fr' }}
                  onMouseEnter={() => {
                    if (!trade.tokenAddress) return;
                    const isMonadTrade = (trade.blockchain || '').toLowerCase() === 'monad' || currentChain === 'monad';
                    // Build tradeUrl matching handleRowClick navigation exactly
                    const navigateAddr = trade.originalPairAddress || trade.pairAddress || trade.tokenAddress;
                    const hoverQP = new URLSearchParams();
                    hoverQP.set('chain', isMonadTrade ? 'monad' : 'sol');
                    const hName = metadata?.name || trade.tokenName;
                    const hSymbol = metadata?.symbol || trade.tokenSymbol;
                    const hMcap = metadata?.marketCapUsd ?? trade.marketCap;
                    const hImage = metadata?.imageUrl || trade.imageUrl;
                    const hLaunchpad = metadata?.launchpad || metadata?.protocol || trade.launchpad;
                    const hCreatedAt = metadata?.createdAt;
                    const hoverTradeUrl = isMonadTrade
                      ? `/trade/monad/${trade.tokenAddress}`
                      : `/trade/${navigateAddr}`;
                    preloadTradeChart(
                      {
                        mint: trade.tokenAddress,
                        pairAddress: trade.originalPairAddress || trade.pairAddress,
                        chain: isMonadTrade ? 'monad' : 'sol',
                        name: metadata?.name || trade.tokenName,
                        symbol: metadata?.symbol || trade.tokenSymbol,
                        marketCapUsd: typeof trade.marketCap === 'number' ? trade.marketCap : Number(trade.marketCap) || 0,
                        image: metadata?.imageUrl || trade.imageUrl,
                        launchpadProtocol: trade.launchpad,
                      },
                      { router, tradeUrl: hoverTradeUrl }
                    );
                  }}
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
                            border: protocolSource ? `1px solid ${protocolColor}` : `1px solid rgba(128, 128, 128, 0.3)`,
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
                                src={metadata?.imageUrl || trade.imageUrl || pumpfunImages[trade.tokenAddress] || searchImages[trade.tokenAddress] || ''}
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
                        {protocolSource && (
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
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="font-medium text-sm text-neutral-100 truncate">
                          {truncateName(metadata?.name || trade.tokenName || shortAddr(trade.tokenAddress))}
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
                    {explorerUrl ? (
                      <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()} // Prevent row click
                        className="flex items-center gap-1 text-[#70E0B0] hover:text-[#58B890] transition-colors text-xs"
                      >
                        <span>View</span>
                        <FaExternalLinkAlt className="text-xs" />
                      </a>
                    ) : (
                      <span className="text-xs text-neutral-500">N/A</span>
                    )}
                  </div>
                </div>
              );
            })
          }
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="space-y-0">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="grid gap-4 px-6 py-3 border-b border-white/[0.06]" style={{ gridTemplateColumns: '0.8fr 2fr 1.2fr 1.2fr 0.8fr 1fr' }}>
              <div className="h-4 w-10 rounded bg-white/[0.06] animate-pulse" />
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-white/[0.06] animate-pulse" />
                <div className="space-y-1.5">
                  <div className="h-3 w-20 rounded bg-white/[0.06] animate-pulse" />
                  <div className="h-2.5 w-16 rounded bg-white/[0.06] animate-pulse" />
                </div>
              </div>
              <div className="h-4 w-16 rounded bg-white/[0.06] animate-pulse self-center" />
              <div className="h-4 w-14 rounded bg-white/[0.06] animate-pulse self-center" />
              <div className="h-4 w-10 rounded bg-white/[0.06] animate-pulse self-center" />
              <div className="h-4 w-10 rounded bg-white/[0.06] animate-pulse self-center" />
            </div>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-[#9CA3AF]">No activity yet.</div>
      )}
    </div>
  );
};

export default Activity;

