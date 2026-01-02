import React, { useCallback, useEffect, useState, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { formatSmartNumber, formatSmallPrice } from '~/utils/db';
import { getActivePositionsByUser } from '~/utils/functions';
import type { PositionRow } from '~/utils/functions';
import { useRouter } from 'next/router';
import FastImage from '../FastImage';
import InterstateTooltip from '~/components/InterstateTooltip';
import { FaArrowUp, FaCheckCircle, FaEye, FaEyeSlash } from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import Image from 'next/image';
import SellPopup from '../SellPopup';
import { fetchChainTokenMetadata, type UnifiedTokenMetadata } from '~/utils/tokenMetadata';
import { getProtocolBranding } from '~/utils/protocolBranding';
import { usePositionPrices } from '~/hooks/usePositionPrices';
import PositionDetailModal from './PositionDetailModal';
import toast from 'react-hot-toast';
import { useQuickBuy, type QuickBuySettings } from '~/components/QuickBuyContext';
import { SOL_MINT_ADDRESS, tradeMonadSell, tradeSellPercentage } from '~/utils/api';
import { getPoolTypeFromToken } from '~/utils/poolTypeDetection';
import { normalizeMonadAddress } from '~/utils/normalizeMonadAddress';
import { broadcastMonadQuickTrade } from '~/utils/monadTradeEvents';

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
  const router = useRouter();
  const currentChain = (router.query.chain as string) || 'sol';
  const blockchain = useMemo(() => {
    if (currentChain === 'monad') return 'monad';
    if (currentChain === 'sol' || currentChain === 'solana') return 'solana';
    return undefined;
  }, [currentChain]);
  const { presets, activePreset } = useQuickBuy();

  // Cache key for positions (user-specific and chain-specific)
  const positionsCacheKey = useMemo(() => {
    const chainSuffix = blockchain || 'all';
    return `positions_cache_${userId}_${chainSuffix}`;
  }, [userId, blockchain]);

  // Cache TTL: 30 seconds (short to prevent stale data, but long enough for instant display)
  const POSITIONS_CACHE_TTL_MS = 30 * 1000;

  // Initialize positions from localStorage cache for instant display
  const [positions, setPositions] = useState<PositionRow[]>(() => {
    if (skipFetch || !userId || typeof window === 'undefined') return [];
    try {
      // Compute cache key inline for initializer (before useMemo runs)
      const chain = router.query.chain as string || 'sol';
      const chainSuffix = (chain === 'monad' ? 'monad' : chain === 'sol' || chain === 'solana' ? 'solana' : undefined) || 'all';
      const cacheKey = `positions_cache_${userId}_${chainSuffix}`;
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (
          parsed &&
          Array.isArray(parsed.data) &&
          typeof parsed.timestamp === 'number' &&
          Date.now() - parsed.timestamp <= POSITIONS_CACHE_TTL_MS
        ) {
          console.log(`[Positions] ✅ Restored ${parsed.data.length} positions from cache for instant display`);
          return parsed.data as PositionRow[];
        }
      }
    } catch (error) {
      console.warn(`[Positions] Failed to restore cache:`, error);
    }
    return [];
  });
  
  const [loading, setLoading] = useState(true); // Start with loading, will be set based on cache in useEffect
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenMetadata>>({});
  const [hiddenTokens, setHiddenTokens] = useState<Set<string>>(new Set());
  const [showSellPopup, setShowSellPopup] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<PositionRow | null>(null);
  const [solPrice, setSolPrice] = useState<number>(0);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailModalPosition, setDetailModalPosition] = useState<PositionRow | null>(null);
  const [quickSellInputs, setQuickSellInputs] = useState<Record<string, string>>({});
  const [sellingTokens, setSellingTokens] = useState<Set<string>>(new Set());
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
  const isMonadPosition = useCallback(
    (position: PositionRow) => {
      const chain = (position.blockchain || blockchain || '').toLowerCase();
      return chain === 'monad' || (position.tokenAddress || '').toLowerCase().startsWith('0x');
    },
    [blockchain],
  );

  const resolveMonadLaunchpad = useCallback(
    (position: PositionRow) => {
      const metadata = tokenMetadata[position.tokenAddress];
      const protocol = (
        metadata?.launchpad ||
        metadata?.protocol ||
        position.launchpad ||
        ''
      ).toLowerCase();

      if (protocol.includes('flap.sh') || protocol.includes('flapsh')) {
        return protocol.includes('dev') ? 'flapsh-devs' : 'flapsh-simple';
      }
      return 'nadfun';
    },
    [tokenMetadata],
  );

  const updateQuickSellInput = useCallback((tokenAddress: string, value: string) => {
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setQuickSellInputs((prev) => ({
        ...prev,
        [tokenAddress]: value,
      }));
    }
  }, []);

  const setSellingForToken = useCallback((tokenAddress: string, isSelling: boolean) => {
    setSellingTokens((prev) => {
      const next = new Set(prev);
      if (isSelling) {
        next.add(tokenAddress);
      } else {
        next.delete(tokenAddress);
      }
      return next;
    });
  }, []);

  const getPositionKey = useCallback(
    (position: PositionRow) => position.tokenAddress || position.pairAddress || 'unknown',
    [],
  );

  const createQuickTradeToast = useCallback((tokenImage?: string | null, tokenName?: string) => {
    const toastId = `quick-trade-${Date.now()}`;
    const startTime = Date.now();
    const timerCap = 0.40 + Math.random() * 0.20;
    let timerFinished = false;
    let timerInterval: NodeJS.Timeout | null = null;

    toast.custom(
      () => (
        <div className="flex items-center gap-2 bg-[#1a1b1e] text-white border border-white/10 rounded-lg px-4 py-3">
          <FaCheckCircle id={`check-${toastId}`} className="flex-shrink-0" size={16} style={{ color: '#31e3ac', display: 'none' }} />
          {tokenImage && (
            <img
              src={tokenImage}
              alt={tokenName || 'Token'}
              className="w-5 h-5 rounded-full object-cover flex-shrink-0"
              style={{ border: '1px solid rgba(255, 255, 255, 0.1)' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <span className="font-semibold text-sm" style={{ color: '#31e3ac' }}>Trade placed!</span>
          <span id={`timer-${toastId}`} className="text-[#9CA3AF] text-xs ml-1">(0.00s)</span>
          <span id={`link-${toastId}`} className="inline-flex items-center ml-1" style={{ display: 'none' }}>
            <img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" className="w-4 h-4 rounded-full" style={{ cursor: 'default' }} />
          </span>
        </div>
      ),
      { id: toastId, duration: Infinity },
    );

    timerInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const displayTime = Math.min(elapsed, timerCap).toFixed(2);
      const timerEl = document.getElementById(`timer-${toastId}`);
      if (timerEl) {
        timerEl.textContent = `(${displayTime}s)`;
      }

      if (!timerFinished && elapsed >= timerCap) {
        timerFinished = true;
        const checkEl = document.getElementById(`check-${toastId}`);
        if (checkEl) {
          checkEl.style.display = 'block';
        }
        const linkEl = document.getElementById(`link-${toastId}`);
        if (linkEl) {
          linkEl.style.display = 'inline-flex';
        }
      }
    }, 50);

    const cleanup = () => {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    };

    const markSuccess = (explorerUrl?: string, iconUrl?: string) => {
      cleanup();
      const checkEl = document.getElementById(`check-${toastId}`);
      if (checkEl) {
        checkEl.style.display = 'block';
      }
      const linkEl = document.getElementById(`link-${toastId}`);
      if (linkEl) {
        if (explorerUrl) {
          const icon = iconUrl || 'https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg';
          linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="${icon}" alt="tx" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
          linkEl.style.display = 'inline-flex';
        } else {
          linkEl.style.display = 'none';
        }
      }
      setTimeout(() => toast.dismiss(toastId), 10000);
    };

    const fail = (message: string) => {
      cleanup();
      toast.error(message, { id: toastId, duration: 6000 });
    };

    return { toastId, markSuccess, fail, cleanup };
  }, []);

  // Function to refresh positions after a successful sell
  const refreshPositions = async () => {
    if (userId) {
      try {
        const updatedPositions = await getActivePositionsByUser(userId, blockchain);
        // Reverse so newest positions appear at the top
        const reversedPositions = [...updatedPositions].reverse();
        setPositions(reversedPositions);
        onPositionsChange(reversedPositions);
        
        // Save to localStorage cache after refresh (e.g., after sell)
        if (!skipFetch && typeof window !== 'undefined') {
          try {
            const payload = {
              data: reversedPositions,
              timestamp: Date.now(),
            };
            window.localStorage.setItem(positionsCacheKey, JSON.stringify(payload));
            console.log(`[Positions] 💾 Cached ${reversedPositions.length} positions after refresh`);
          } catch (error) {
            console.warn(`[Positions] Failed to cache positions after refresh:`, error);
          }
        }
      } catch (error) {
        console.error('Failed to refresh positions:', error);
      }
    }
  };

  const handleQuickSell = useCallback(
    async (event: React.MouseEvent, position: PositionRow) => {
      event.stopPropagation();
      const tokenKey = getPositionKey(position);
      const percentStr = (quickSellInputs[tokenKey] ?? '100').trim();
      const percent = parseFloat(percentStr);

      if (!Number.isFinite(percent) || percent <= 0) {
        toast.error('Enter a valid percentage to sell');
        return;
      }
      if (percent > 100) {
        toast.error('Percentage cannot exceed 100%');
        return;
      }
      if (!bearerToken) {
        toast.error('Please log in to trade');
        return;
      }

      const quickSellSettings: QuickBuySettings = presets?.[activePreset]?.quickSellSettings || {
        maxSlippage: 0.2,
        priority: 0.0001,
        bribe: 0,
        mevMode: 'off',
        autoFee: false,
        maxFee: 0,
      };
      setSellingForToken(tokenKey, true);
      const tokenMeta = tokenMetadata[position.tokenAddress];
      const tokenImage = tokenMeta?.imageUrl || position.imageUrl || null;
      const tokenName = tokenMeta?.name || tokenMeta?.symbol || shortAddr(position.tokenAddress);
      const toastControls = createQuickTradeToast(tokenImage, tokenName);

      try {
        if (isMonadPosition(position)) {
          const tokenAddress =
            normalizeMonadAddress(position.tokenAddress) || position.tokenAddress;
          const slippage =
            quickSellSettings?.maxSlippage !== undefined
              ? quickSellSettings.maxSlippage * 100
              : undefined;
          const gasPrice =
            quickSellSettings?.gasPrice !== undefined && quickSellSettings.gasPrice > 0
              ? quickSellSettings.gasPrice
              : undefined;
          const launchpad = resolveMonadLaunchpad(position);

          const result = await tradeMonadSell(
            {
              tokenAddress,
              launchpad,
              percentage: percent,
              slippage,
              gasPrice,
            },
            bearerToken,
          );

          if (result?.success) {
            const txHash = (result as any)?.txHash;
            const explorerUrl = txHash ? `https://monadvision.com/tx/${txHash}` : undefined;
            toastControls.markSuccess(explorerUrl);
            broadcastMonadQuickTrade(tokenAddress, 'sell');
            refreshPositions();
          } else {
            toastControls.fail('Sell failed. Please try again.');
            return;
          }
        } else {
          const poolType = getPoolTypeFromToken({
            mint: position.tokenAddress,
            pair_address: position.pairAddress,
            launchpad_protocol: tokenMeta?.protocol || position.launchpad || '',
          } as any);

          const sellResult = await tradeSellPercentage(
            {
              tokenAddress: position.tokenAddress,
              percentageToSell: percent,
              poolAddress: position.pairAddress,
              baseMint: position.tokenAddress,
              quoteMint: SOL_MINT_ADDRESS,
              poolType,
              originalPairAddress: position.pairAddress,
              slippage: (quickSellSettings?.maxSlippage || 0.2) * 100,
              priorityFee: quickSellSettings?.priority ?? 0.001,
              bribe: quickSellSettings?.bribe ?? 0.05,
            },
            bearerToken,
          );

          const explorerUrl = sellResult?.hash ? `https://solscan.io/tx/${sellResult.hash}` : undefined;
          const solIcon = 'https://cryptologos.cc/logos/solana-sol-logo.png';
          toastControls.markSuccess(explorerUrl, solIcon);
          refreshPositions();
        }
      } catch (error: any) {
        const message =
          error?.message ||
          error?.error ||
          'Sell failed. Please try again.';
        toastControls.fail(message);
      } finally {
        toastControls.cleanup();
        setSellingForToken(tokenKey, false);
      }
    },
    [
      activePreset,
      bearerToken,
      isMonadPosition,
      createQuickTradeToast,
      presets,
      quickSellInputs,
      refreshPositions,
      resolveMonadLaunchpad,
      setSellingForToken,
      tokenMetadata,
      getPositionKey,
    ],
  );

  const handleTokenNavigation = useCallback(
    (event: React.MouseEvent, position: PositionRow, navigateAddress?: string) => {
      event.stopPropagation();
      if (isMonadPosition(position)) {
        const normalized = normalizeMonadAddress(position.tokenAddress) || position.tokenAddress;
        router.push(`/trade/monad/${normalized}`);
      } else if (navigateAddress) {
        router.push(`/trade/${navigateAddress}`);
      }
    },
    [isMonadPosition, router],
  );

  // Get unique token addresses from positions with remaining > 0
  const activeTokenAddresses = useMemo(() => {
    return Array.from(
      new Set(
        positions
          .filter((pos) => pos.remaining > 0)
          .map((pos) => pos.tokenAddress)
          .filter(Boolean)
      )
    );
  }, [positions]);

  // Fetch live prices for active positions (DISABLED - endpoint not implemented yet)
  const { prices: livePrices } = usePositionPrices(activeTokenAddresses, {
    enabled: false, // Disabled until /api/codex/market-data endpoint is implemented
    refreshInterval: 2000, // Update every 2 seconds for faster updates
    chain: currentChain,
  });

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

  // Load from cache when cache key changes (e.g., user or chain changes)
  useEffect(() => {
    if (skipFetch || !userId || typeof window === 'undefined') return;
    
    try {
      const cached = window.localStorage.getItem(positionsCacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (
          parsed &&
          Array.isArray(parsed.data) &&
          typeof parsed.timestamp === 'number' &&
          Date.now() - parsed.timestamp <= POSITIONS_CACHE_TTL_MS
        ) {
          console.log(`[Positions] ✅ Loaded ${parsed.data.length} positions from cache (cache key changed)`);
          setPositions(parsed.data as PositionRow[]);
          setLoading(false);
        }
      }
    } catch (error) {
      console.warn(`[Positions] Failed to load cache:`, error);
    }
  }, [positionsCacheKey, skipFetch, userId, POSITIONS_CACHE_TTL_MS]);

  // If preloaded positions are provided, use them
  useEffect(() => {
    if (preloadedPositions && skipFetch) {
      // Reverse so newest positions appear at the top
      const reversedPositions = [...preloadedPositions].reverse();
      setPositions(reversedPositions);
      setLoading(false);
      requestMetadataForTokens(reversedPositions);
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
      
      // Check cache to determine if we should show loading
      let hasValidCache = false;
      if (typeof window !== 'undefined') {
        try {
          const cached = window.localStorage.getItem(positionsCacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (
              parsed &&
              Array.isArray(parsed.data) &&
              parsed.data.length > 0 &&
              typeof parsed.timestamp === 'number' &&
              Date.now() - parsed.timestamp <= POSITIONS_CACHE_TTL_MS
            ) {
              hasValidCache = true;
            }
          }
        } catch (error) {
          // Ignore cache errors
        }
      }

      // Only show loading if we don't have valid cache (for instant display)
      if (isInitialLoad && !hasValidCache) {
        setLoading(true);
      } else if (hasValidCache) {
        console.log(`[Positions] 🔄 Refreshing positions in background (cache available for instant display)`);
      }
      try {
        console.log(`🔍 [Positions] Fetching with blockchain: ${blockchain || 'all'}`);
        const fetchedPositions = await getActivePositionsByUser(userId, blockchain);

        console.log(`✅ [Positions] Received ${fetchedPositions.length} positions`);
        if (fetchedPositions.length === 0) {
          console.log(`   ⚠️  No positions found for blockchain: ${blockchain || 'all'}`);
        }

        // Reverse so newest positions appear at the top
        const reversedPositions = [...fetchedPositions].reverse();
        setPositions(reversedPositions);
        onPositionsChange(reversedPositions);
        
        // Save to localStorage cache for instant loading when navigating back
        if (!skipFetch && typeof window !== 'undefined') {
          try {
            const payload = {
              data: reversedPositions,
              timestamp: Date.now(),
            };
            window.localStorage.setItem(positionsCacheKey, JSON.stringify(payload));
            console.log(`[Positions] 💾 Cached ${reversedPositions.length} positions to localStorage`);
          } catch (error) {
            console.warn(`[Positions] Failed to cache positions:`, error);
          }
        }
        
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
  }, [userId, onPositionsChange, skipFetch, blockchain, requestMetadataForTokens, positionsCacheKey, POSITIONS_CACHE_TTL_MS]);

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
            positions
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
              
              // Calculate live PNL using current token price
              const currentPrice = livePrices[pos.tokenAddress] || 0;
              const liveRemainingValue = currentPrice > 0 
                ? corrected.correctedRemaining * currentPrice 
                : corrected.correctedRemainingUsdValue; // Fallback to stored value if no live price
              
              const livePnl = corrected.correctedSoldUsdValue + liveRemainingValue - sourcePosition.boughtUsdValue;
              const livePnlPercentage = sourcePosition.boughtUsdValue > 0 
                ? (livePnl / sourcePosition.boughtUsdValue) * 100 
                : 0;
              
              // Use live PNL if we have a current price, otherwise use corrected PNL
              const displayPnl = currentPrice > 0 ? livePnl : corrected.correctedPnl;
              const displayPnlPercentage = currentPrice > 0 ? livePnlPercentage : corrected.correctedPnlPercentage;
              
              // For positions: backend stores originalPairAddress value in pairAddress field
              const navigateAddress = sourcePosition.pairAddress || pos.tokenAddress;
              const displayAddress = sourcePosition.pairAddress || pos.tokenAddress;
              
              const handleRowClick = () => {
                // Open detail modal with corrected values
                const correctedPosition = {
                  ...sourcePosition,
                  // Override with corrected values
                  bought: corrected.correctedBought,
                  sold: corrected.correctedSold,
                  remaining: corrected.correctedRemaining,
                  soldUsdValue: corrected.correctedSoldUsdValue,
                  remainingUsdValue: liveRemainingValue, // Use live remaining value
                  pnl: displayPnl,
                  pnlPercentage: displayPnlPercentage,
                };
                setDetailModalPosition(correctedPosition);
                setShowDetailModal(true);
              };
              
              const rawMetadata = tokenMetadata[pos.tokenAddress];
              // Merge position's tokenName/tokenSymbol with fetched metadata (position takes priority)
              const metadata = {
                ...rawMetadata,
                name: sourcePosition.tokenName || rawMetadata?.name,
                symbol: sourcePosition.tokenSymbol || rawMetadata?.symbol,
              };
              const protocolSource = metadata?.protocol || metadata?.launchpad || sourcePosition.launchpad || '';
              const branding = getProtocolBranding(protocolSource);
              const protocolColor = branding.color;
              const tokenIcon = branding.iconUrl;
              const isFullCircleImage = branding.isFullCircle;
              const isHidden = hiddenTokens.has(pos.tokenAddress);
              
              // Use position.imageUrl as final fallback if metadata doesn't have it
              const finalImageUrl = metadata?.imageUrl || sourcePosition.imageUrl || '';
              const tokenKey = getPositionKey(sourcePosition);
              const quickSellValue = quickSellInputs[tokenKey] ?? '100';
              const isSelling = sellingTokens.has(tokenKey);
              
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
                      <button
                        type="button"
                        className="font-medium text-sm text-neutral-100 truncate text-left hover:text-[#70E0B0] transition-colors"
                        onClick={(e) => handleTokenNavigation(e, sourcePosition, navigateAddress)}
                      >
                        {metadata?.name || shortAddr(displayAddress)}
                      </button>
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
                <td className={`px-2 py-2 font-semibold ${displayPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}> 
                  {showInSOL && solPrice > 0
                    ? <>{displayPnl >= 0 ? '+' : ''}<SolIcon />{formatSmartNumber(Math.abs(displayPnl) / solPrice)}</>
                    : `${displayPnl >= 0 ? '+' : ''}$${formatSmallPrice(Math.abs(displayPnl))}`
                  }
                  <span className="ml-1 text-xs">({formatSmallPrice(displayPnlPercentage)}%)</span>
                  {currentPrice > 0 && (
                    <span className="ml-1 text-[10px] text-neutral-500" title="Live price update">
                      ●
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
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
                    <div
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-900/60 border border-neutral-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        inputMode="decimal"
                        value={quickSellValue}
                        onChange={(e) => updateQuickSellInput(tokenKey, e.target.value)}
                        placeholder="100"
                        className="w-12 bg-transparent text-xs text-neutral-100 focus:outline-none"
                      />
                      <span className="text-[10px] text-neutral-500">%</span>
                    </div>
                    <button
                      onClick={(e) => handleQuickSell(e, sourcePosition)}
                      disabled={isSelling || !bearerToken}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                        isSelling || !bearerToken
                          ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                          : 'bg-red-600/20 text-red-300 hover:bg-red-600/30'
                      }`}
                    >
                      <FaArrowUp className="text-xs" />
                      {isSelling ? 'Selling...' : 'Quick Sell'}
                    </button>
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
      
      {/* Position Detail Modal */}
      <PositionDetailModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setDetailModalPosition(null);
        }}
        position={detailModalPosition}
        tokenMetadata={detailModalPosition ? tokenMetadata[detailModalPosition.tokenAddress] : undefined}
        currentPrice={detailModalPosition ? livePrices[detailModalPosition.tokenAddress] : undefined}
        chain={currentChain}
      />
    </div>
  );
};

export default Positions; 
