import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { formatSmartNumber, formatSmallPrice } from '~/utils/db';
import { fetchActivePositions } from '~/utils/functions';
import type { PositionRow } from '~/utils/functions';
import { useRouter } from 'next/router';
import FastImage from '../FastImage';
import InterstateTooltip from '~/components/InterstateTooltip';
import { FaArrowUp, FaCheckCircle, FaEye, FaEyeSlash } from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import Image from 'next/image';
import SellPopup from '../SellPopup';
import { fetchChainTokenMetadata, fetchPumpfunImage, isPumpfunToken, type UnifiedTokenMetadata } from '~/utils/tokenMetadata';
import { getProtocolBranding } from '~/utils/protocolBranding';

import PositionDetailModal from './PositionDetailModal';
import toast from 'react-hot-toast';
import { validateSolanaSell, showTradeValidationError } from '~/utils/preTradeValidation';
import { useQuickBuy, type QuickBuySettings } from '~/components/QuickBuyContext';
import { SOL_MINT_ADDRESS, tradeMonadSell, tradeSellPercentage, resolvePool } from '~/utils/api';
import { getPoolTypeFromToken } from '~/utils/poolTypeDetection';
import { normalizeMonadAddress } from '~/utils/normalizeMonadAddress';
import { broadcastMonadQuickTrade } from '~/utils/monadTradeEvents';
import { listenForTradeEvents, transformToastToError } from '~/utils/createSolanaToastHandler';
import { broadcastTradeCompleted, TRADE_COMPLETED_EVENT, type TradeCompletedDetail } from '~/utils/tradeEvents';
import { formatMonadError } from '~/utils/monadError';
import { useUser } from '../UserContext';
import { useSolPrice } from '../SolPriceContext';
import { dispatchBalanceRefresh } from '~/utils/balanceEvents';
import { preloadTradeChart } from '~/utils/preloadTradeChart';
import { useSolanaPositionWebSocketContext } from '~/contexts/SolanaPositionWebSocketContext';

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
  const { selectedWalletIds, user } = useUser();
  const { requestSnapshot } = useSolanaPositionWebSocketContext();
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

  // Initialize positions from localStorage cache for instant display
  // No TTL gating — background fetch always runs on mount and replaces cached data within seconds
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
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
          console.log(`[Positions] ✅ Restored ${parsed.data.length} positions from cache for instant display`);
          return parsed.data as PositionRow[];
        }
      }
    } catch (error) {
      console.warn(`[Positions] Failed to restore cache:`, error);
    }
    return [];
  });
  
  // Initialize loading state based on whether we have cached positions
  // If we have cached positions from the initializer, don't show loading
  const [loading, setLoading] = useState(() => {
    if (skipFetch || !userId || typeof window === 'undefined') return false;
    try {
      const chain = router.query.chain as string || 'sol';
      const chainSuffix = (chain === 'monad' ? 'monad' : chain === 'sol' || chain === 'solana' ? 'solana' : undefined) || 'all';
      const cacheKey = `positions_cache_${userId}_${chainSuffix}`;
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.data?.length > 0) {
          return false; // Have valid cache, don't show loading
        }
      }
    } catch { /* ignore */ }
    return true; // No cache, show loading
  });
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenMetadata>>({});
  const [pumpfunImages, setPumpfunImages] = useState<Record<string, string>>({}); // Fallback images from Pump.fun API

  // Helper to get cached positions (used for ref initialization)
  const getCachedPositions = (): PositionRow[] => {
    if (skipFetch || !userId || typeof window === 'undefined') return [];
    try {
      const chain = router.query.chain as string || 'sol';
      const chainSuffix = (chain === 'monad' ? 'monad' : chain === 'sol' || chain === 'solana' ? 'solana' : undefined) || 'all';
      const cacheKey = `positions_cache_${userId}_${chainSuffix}`;
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.data?.length > 0) {
          return parsed.data as PositionRow[];
        }
      }
    } catch { /* ignore */ }
    return [];
  };

  // Ref to track current positions (avoids stale closure in async functions)
  // Initialize immediately with cached data so it's available before first useEffect runs
  const positionsRef = useRef<PositionRow[]>(getCachedPositions());
  // Ref to track if we've ever loaded positions successfully
  const hasEverLoadedRef = useRef<boolean>(positionsRef.current.length > 0);
  // Ref to track if initial load has completed (persists across effect re-runs)
  const isInitialLoadRef = useRef(true);
  // Ref to track empty-state retry attempts (prevents infinite loops)
  const emptyRetryCountRef = useRef(0);
  const MAX_EMPTY_RETRIES = 3;
  // Ref to store fetchPositions function for retry logic
  const fetchPositionsRef = useRef<(() => Promise<void>) | null>(null);
  // Ref to track if a fetch is currently in progress
  const isFetchingRef = useRef(false);
  // Ref to track last trade timestamp (for empty-array guard)
  const lastTradeTimestampRef = useRef<number>(0);
  // Ref for debouncing position fetches
  const debouncedFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs for post-buy retry backoff timers
  const buyRetryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Keep refs in sync with state
  useEffect(() => {
    positionsRef.current = positions;
    if (positions.length > 0) {
      hasEverLoadedRef.current = true;
      emptyRetryCountRef.current = 0; // Reset retry counter on successful load
    }
  }, [positions]);

  // Safety net: If positions would go empty but cache has data, restore synchronously (no flash)
  // Then retry fetch in background to get fresh data
  useEffect(() => {
    if (
      positions.length === 0 &&
      hasEverLoadedRef.current &&
      !loading &&
      !isFetchingRef.current &&
      emptyRetryCountRef.current < MAX_EMPTY_RETRIES
    ) {
      emptyRetryCountRef.current += 1;

      // Restore cache synchronously — prevents any "No positions" flash
      const cached = getCachedPositions();
      if (cached.length > 0) {
        console.log(`[Positions] Safety net: restoring ${cached.length} cached positions (attempt ${emptyRetryCountRef.current}/${MAX_EMPTY_RETRIES})`);
        setPositions(cached);
      }

      // Re-fetch in background
      if (fetchPositionsRef.current) {
        fetchPositionsRef.current();
      }
    }
  }, [positions, loading]);
  const [hiddenTokens, setHiddenTokens] = useState<Set<string>>(new Set());
  const [showSellPopup, setShowSellPopup] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<PositionRow | null>(null);
  const { solPrice } = useSolPrice();
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

  // Chain-specific logos for toast
  const SOLANA_LOGO = 'https://avatars.githubusercontent.com/u/92743431?s=200&v=4';
  const MONAD_LOGO = 'https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg';

  const createQuickTradeToast = useCallback((tokenImage?: string | null, tokenName?: string, chain: 'solana' | 'monad' = 'solana', tokenAddress?: string) => {
    const toastId = `quick-trade-${Date.now()}`;
    const startTime = Date.now();
    const timerCap = 0.40 + Math.random() * 0.20;
    let timerFinished = false;
    let tradeErrored = false;
    let timerInterval: NodeJS.Timeout | null = null;
    const defaultLogo = chain === 'monad' ? MONAD_LOGO : SOLANA_LOGO;

    toast.custom(
      () => (
        <div className="flex items-center gap-2 bg-[#1a1b1e] text-white border border-white/10 rounded-lg px-4 py-3">
          <FaCheckCircle id={`check-${toastId}`} className="flex-shrink-0" size={16} style={{ color: '#31e3ac', display: timerFinished && !tradeErrored ? 'block' : 'none' }} />
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
            <img src={defaultLogo} alt={chain === 'monad' ? 'Monad' : 'Solana'} className="w-4 h-4 rounded-full" style={{ cursor: 'default' }} />
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
        if (!tradeErrored) {
          const checkEl = document.getElementById(`check-${toastId}`);
          if (checkEl) {
            checkEl.style.display = 'block';
          }
          const linkEl = document.getElementById(`link-${toastId}`);
          if (linkEl) {
            linkEl.style.display = 'inline-flex';
          }
        }
      }
    }, 50);

    const cleanupTradeListener = tokenAddress
      ? listenForTradeEvents(tokenAddress, toastId, (v) => { tradeErrored = v; }, chain)
      : () => {};

    const cleanup = () => {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      cleanupTradeListener();
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
          const icon = iconUrl || defaultLogo;
          linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="${icon}" alt="tx" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
          linkEl.style.display = 'inline-flex';
        } else {
          linkEl.style.display = 'none';
        }
      }
      setTimeout(() => toast.dismiss(toastId), 10000);
    };

    const fail = (message: string) => {
      tradeErrored = true;
      cleanup();
      transformToastToError(toastId, message, tokenImage, tokenName);
    };

    return { toastId, markSuccess, fail, cleanup };
  }, []);

  // Function to refresh positions after a successful sell
  const refreshPositions = async () => {
    if (userId) {
      try {
        const result = await fetchActivePositions(userId, blockchain);

        if (!result.ok) {
          console.warn(`[Positions] Refresh failed, keeping existing positions`);
          return;
        }

        const reversedPositions = [...result.data].reverse();
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
        console.error('[Positions] ❌ Failed to refresh positions, keeping existing positions:', error);
        // Don't clear positions on error - keep showing existing ones
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
      const isMonad = isMonadPosition(position);

      // Pre-validate sell before showing toast
      const sellValidation = validateSolanaSell(percent);
      if (!sellValidation.valid) {
        showTradeValidationError(sellValidation.error, tokenImage, tokenName);
        setSellingForToken(tokenKey, false);
        return;
      }

      const toastControls = createQuickTradeToast(tokenImage, tokenName, isMonad ? 'monad' : 'solana', position.tokenAddress);

      try {
        if (isMonad) {
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

          const selectedMonadWalletIds = selectedWalletIds?.monad || [];
          const isMultiWalletSell = selectedMonadWalletIds.length > 1;
          const selectedWalletId = selectedMonadWalletIds[0];

          const result = await tradeMonadSell(
            {
              tokenAddress,
              launchpad,
              percentage: percent,
              slippage,
              gasPrice,
              walletId: !isMultiWalletSell ? selectedWalletId : undefined,
              walletIds: isMultiWalletSell ? selectedMonadWalletIds : undefined,
              useMultipleWallets: isMultiWalletSell,
            },
            bearerToken,
          );

          if (result?.success) {
            const txHash = (result as any)?.txHash;
            const explorerUrl = txHash ? `https://monadvision.com/tx/${txHash}` : undefined;
            toastControls.markSuccess(explorerUrl);
            broadcastMonadQuickTrade(tokenAddress, 'sell');
            broadcastTradeCompleted({ tokenAddress, tradeType: 'sell', chain: 'monad', txHash: txHash || undefined });
            dispatchBalanceRefresh('monad');
            refreshPositions();
          } else {
            const errorMessage = formatMonadError((result as any)?.error);
            toastControls.fail(errorMessage);
            return;
          }
        } else {
          // Jupiter Ultra routes by token address — pool resolution is NOT needed for primary sell path.
          // Use position's existing data directly. Backend SDK fallback has its own lazy pool discovery.
          let verifiedPoolAddress = position.pairAddress || '';
          let poolSource = 'position';

          // Derive poolType from position metadata (no async call needed)
          const effectiveProtocol = tokenMeta?.protocol || position.launchpad || '';
          const poolType = getPoolTypeFromToken({
            mint: position.tokenAddress,
            pair_address: verifiedPoolAddress,
            launchpad_protocol: effectiveProtocol,
          } as any);

          // Fire-and-forget: warm the Redis pool cache for future lookups (non-blocking)
          if (position.tokenAddress) {
            resolvePool(position.tokenAddress, false, position.launchpad || undefined)
              .catch(() => {});
          }

          console.log(`[Positions] 🎯 Sell: pool=${verifiedPoolAddress} type="${poolType}" (source: ${poolSource}, no pre-resolve wait)`);

          const sellResult = await tradeSellPercentage(
            {
              tokenAddress: position.tokenAddress,
              percentageToSell: percent,
              poolAddress: verifiedPoolAddress,
              baseMint: position.tokenAddress,
              quoteMint: SOL_MINT_ADDRESS,
              poolType,
              originalPairAddress: verifiedPoolAddress,
              slippage: (quickSellSettings?.maxSlippage || 0.2) * 100,
              priorityFee: quickSellSettings?.priority ?? 0.001,
              bribe: quickSellSettings?.bribe ?? 0.05,
            },
            bearerToken,
          );

          const explorerUrl = sellResult?.hash ? `https://solscan.io/tx/${sellResult.hash}` : undefined;
          toastControls.markSuccess(explorerUrl);

          // Optimistically update the position in the UI immediately
          // This provides instant feedback while we wait for the backend to commit
          setPositions((prevPositions) => {
            const soldPercent = percent / 100;
            return prevPositions
              .map((p) => {
                if (getPositionKey(p) === tokenKey) {
                  const newRemaining = p.remaining * (1 - soldPercent);
                  // If sold ~100%, mark for removal
                  if (soldPercent >= 0.99 || newRemaining < 0.0001) {
                    return { ...p, remaining: 0, _shouldRemove: true } as any;
                  }
                  return { ...p, remaining: newRemaining };
                }
                return p;
              })
              .filter((p) => !(p as any)._shouldRemove);
          });

          // Dispatch event to notify other components (TradeActionPanel, charts, etc.)
          if (typeof window !== 'undefined' && position.tokenAddress) {
            window.dispatchEvent(new CustomEvent('solanaQuickTrade', {
              detail: { tokenAddress: position.tokenAddress }
            }));
          }

          // Broadcast trade completion for portfolio auto-refresh
          broadcastTradeCompleted({
            tokenAddress: position.tokenAddress,
            tradeType: 'sell',
            chain: 'sol',
            txHash: sellResult?.hash || undefined,
            sellPercentage: percent,
          });
          dispatchBalanceRefresh('sol');
          // Note: broadcastTradeCompleted above triggers TRADE_COMPLETED_EVENT listener
          // which handles debounced refetch — no need for redundant refreshPositions() here
        }
      } catch (error: any) {
        // Check for POOL_GRADUATED error (bonding curve completed, liquidity migrated)
        const errorCode = error?.code || error?.response?.data?.code;
        const errorMessage = error?.message || error?.error || error?.response?.data?.error;

        let message: string;
        if (errorCode === 'POOL_GRADUATED') {
          message = 'Pool graduated - liquidity migrated. Refresh and try again.';
        } else if (errorMessage?.includes('graduated') || errorMessage?.includes('Virtual pool is completed')) {
          message = 'Pool graduated - liquidity migrated. Refresh and try again.';
        } else if (errorCode === 'NO_HOLDINGS' || errorMessage?.includes('Insufficient token')) {
          // Token already sold or transferred - remove from UI and refresh
          message = 'Token already sold or transferred.';
          setPositions((prev) => prev.filter((p) => getPositionKey(p) !== tokenKey));
          // Immediately refresh to get accurate data
          refreshPositions();
        } else if (errorCode === 'NO_LIQUIDITY' || errorMessage?.includes('no liquidity across all')) {
          // Dead token — no liquidity anywhere. Backend already cleaned up DB position.
          message = 'No liquidity available. Position removed.';
          setPositions((prev) => prev.filter((p) => getPositionKey(p) !== tokenKey));
          refreshPositions();
        } else if (isMonad) {
          message = formatMonadError(errorMessage);
        } else {
          message = errorMessage || 'Sell failed. Please try again.';
        }
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
    (
      event: React.MouseEvent,
      position: PositionRow,
      navigateAddress?: string,
      metadata?: { name?: string; symbol?: string; imageUrl?: string }
    ) => {
      event.stopPropagation();

      const params = new URLSearchParams({
        mode: 'sell',
        tab: 'market',
        timeRange: '5m',
        sliderPct: '0',
      });

      if (metadata?.name) params.set('_name', metadata.name);
      if (metadata?.symbol) params.set('_symbol', metadata.symbol);
      if (metadata?.imageUrl) params.set('_image', metadata.imageUrl);
      if (position.tokenAddress) params.set('_mint', position.tokenAddress);
      // Use position's own currentPrice (already in the position data)
      if (position.currentPrice) params.set('_price', String(position.currentPrice));
      const meta = position.tokenAddress ? tokenMetadata[position.tokenAddress] : undefined;
      if (meta?.marketCapUsd) params.set('_mcap', String(meta.marketCapUsd));

      const queryString = params.toString();

      if (isMonadPosition(position)) {
        const normalized = normalizeMonadAddress(position.tokenAddress) || position.tokenAddress;
        router.push(`/trade/monad/${normalized}?${queryString}`);
      } else if (navigateAddress) {
        router.push(`/trade/${navigateAddress}?${queryString}`);
      }
    },
    [isMonadPosition, router, tokenMetadata],
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

  // Build live prices from backend position data (currentPrice comes from Go token-service)
  const livePrices = useMemo(() => {
    const priceMap: Record<string, number> = {};
    positions.forEach((pos) => {
      if (pos.currentPrice && pos.currentPrice > 0) {
        priceMap[pos.tokenAddress] = pos.currentPrice;
      }
    });
    return priceMap;
  }, [positions]);

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
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
          console.log(`[Positions] ✅ Loaded ${parsed.data.length} positions from cache (cache key changed)`);
          setPositions(parsed.data as PositionRow[]);
          setLoading(false);
        }
      }
    } catch (error) {
      console.warn(`[Positions] Failed to load cache:`, error);
    }
  }, [positionsCacheKey, skipFetch, userId]);

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

    const fetchPositions = async () => {
      // Prevent concurrent fetches
      if (isFetchingRef.current) {
        console.log(`[Positions] ⏳ Fetch already in progress, skipping`);
        return;
      }
      isFetchingRef.current = true;
      console.log(`🔍 Fetching positions for userId: ${userId}`);

      // Check cache to determine if we should show loading
      let hasValidCache = false;
      if (typeof window !== 'undefined') {
        try {
          const cached = window.localStorage.getItem(positionsCacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
              hasValidCache = true;
            }
          }
        } catch (error) {
          // Ignore cache errors
        }
      }

      // Never show loading when we already have positions to display
      if (isInitialLoadRef.current && !hasValidCache && positionsRef.current.length === 0) {
        setLoading(true);
      }

      console.log(`🔍 [Positions] Fetching with blockchain: ${blockchain || 'all'}`);
      const result = await fetchActivePositions(userId, blockchain);

      if (!result.ok) {
        // API error (timeout, network, 500) — preserve existing positions, don't clear
        console.warn(`[Positions] Fetch failed (${(result as { error: string }).error}) — preserving ${positionsRef.current.length} existing positions`);
        isFetchingRef.current = false;
        if (isInitialLoadRef.current) {
          setLoading(false);
          isInitialLoadRef.current = false;
        }
        return;
      }

      const fetchedPositions = result.data;
      console.log(`✅ [Positions] Received ${fetchedPositions.length} positions`);

      // Reverse so newest positions appear at the top
      const reversedPositions = [...fetchedPositions].reverse();

      let positionsToUse = reversedPositions;
      let shouldUpdate = true;

      if (reversedPositions.length === 0) {
        const currentPositions = positionsRef.current;
        const hasEverLoaded = hasEverLoadedRef.current;
        const hadRecentTrade = lastTradeTimestampRef.current > 0 &&
          (Date.now() - lastTradeTimestampRef.current) < 15000;

        if (currentPositions.length === 0 || hadRecentTrade) {
          shouldUpdate = true;
        } else if (currentPositions.length > 0 && hasEverLoaded) {
          console.log(`[Positions] ⚠️ API returned empty during background poll — preserving existing`);
          shouldUpdate = false;
        }
      }

      if (shouldUpdate) {
        setPositions(positionsToUse);
        onPositionsChange(positionsToUse);

        if (!skipFetch && typeof window !== 'undefined') {
          try {
            if (positionsToUse.length > 0) {
              const payload = {
                data: positionsToUse,
                timestamp: Date.now(),
              };
              window.localStorage.setItem(positionsCacheKey, JSON.stringify(payload));
            } else {
              window.localStorage.removeItem(positionsCacheKey);
            }
          } catch (error) {
            console.warn(`[Positions] Failed to update positions cache:`, error);
          }
        }

        requestMetadataForTokens(fetchedPositions);
      }

      isFetchingRef.current = false;
      if (isInitialLoadRef.current) {
        setLoading(false);
        isInitialLoadRef.current = false;
      }
    };

    // Store function reference for retry logic
    fetchPositionsRef.current = fetchPositions;

    // Debounced fetch to coalesce rapid-fire fetch requests (e.g. sell triggers 3 events)
    const debouncedFetchPositions = (delayMs: number = 500) => {
      if (debouncedFetchTimerRef.current) clearTimeout(debouncedFetchTimerRef.current);
      debouncedFetchTimerRef.current = setTimeout(() => {
        debouncedFetchTimerRef.current = null;
        fetchPositions();
      }, delayMs);
    };

    fetchPositions();

    // Request WS snapshot for instant data if we're in initial loading state (no localStorage cache)
    if (isInitialLoadRef.current && positionsRef.current.length === 0) {
      requestSnapshot();
    }

    // Auto-refresh every 5 seconds to get latest positions
    const intervalId = setInterval(() => {
      fetchPositions();
    }, 5000);

    // Listen for trade events from other components (TradeActionPanel, InstantTradeModal)
    const handleQuickTradeEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ tokenAddress: string }>;
      console.log(`[Positions] 📡 Received solanaQuickTrade event for ${customEvent.detail?.tokenAddress}`);
      debouncedFetchPositions(500);
    };

    window.addEventListener('solanaQuickTrade', handleQuickTradeEvent);

    // Also listen for unified trade-completed events (portfolio auto-refresh)
    const handleTradeCompleted = (event: Event) => {
      const detail = (event as CustomEvent<TradeCompletedDetail>).detail;
      lastTradeTimestampRef.current = Date.now();
      if (detail?.tradeType === 'sell' && detail.sellPercentage && detail.tokenAddress) {
        setPositions((prev) =>
          prev
            .map((p) => {
              if (p.tokenAddress === detail.tokenAddress) {
                const soldFrac = detail.sellPercentage! / 100;
                const newRemaining = p.remaining * (1 - soldFrac);
                if (soldFrac >= 0.99 || newRemaining < 0.0001) {
                  return { ...p, remaining: 0, _shouldRemove: true } as any;
                }
                return { ...p, remaining: newRemaining };
              }
              return p;
            })
            .filter((p) => !(p as any)._shouldRemove)
        );
        debouncedFetchPositions(500);
      } else if (detail?.tradeType === 'buy' && detail.tokenAddress) {
        // Instant buy insertion: show as a real position row immediately
        const addr = detail.tokenAddress.toLowerCase();
        const existing = positionsRef.current.find(
          (p) => p.tokenAddress.toLowerCase() === addr
        );
        if (!existing) {
          const instantRow: PositionRow & { _needsRefresh?: boolean; _pendingBuyAmount?: boolean } = {
            tokenAddress: detail.tokenAddress,
            tokenName: detail.tokenName || null,
            tokenSymbol: detail.tokenSymbol || null,
            imageUrl: detail.imageUrl || null,
            blockchain: detail.chain === 'monad' ? 'monad' : 'solana',
            bought: 0, // Token amount unknown until backend confirms
            boughtUsdValue: detail.solAmountSpent || 0,
            sold: 0,
            soldUsdValue: 0,
            remaining: 1, // Non-zero so it passes the > 0 filter
            remainingUsdValue: detail.solAmountSpent || 0,
            pnl: 0,
            pnlPercentage: 0,
            actions: '',
            _needsRefresh: true,
            _pendingBuyAmount: true,
          };
          setPositions((prev) => {
            if (prev.some((p) => p.tokenAddress.toLowerCase() === addr)) return prev;
            const next = [instantRow as PositionRow, ...prev];
            try {
              window.localStorage.setItem(positionsCacheKey, JSON.stringify({
                data: next,
                timestamp: Date.now(),
              }));
            } catch {}
            return next;
          });
        } else if ((existing as any)._needsRefresh && (detail.tokenName || detail.imageUrl)) {
          // Update metadata on existing pending row (e.g. second broadcast with richer info)
          setPositions((prev) => prev.map((p) => {
            if (p.tokenAddress.toLowerCase() === addr && (p as any)._needsRefresh) {
              return {
                ...p,
                tokenName: detail.tokenName || p.tokenName,
                tokenSymbol: detail.tokenSymbol || p.tokenSymbol,
                imageUrl: detail.imageUrl || p.imageUrl,
                boughtUsdValue: detail.solAmountSpent || p.boughtUsdValue,
                remainingUsdValue: detail.solAmountSpent || p.remainingUsdValue,
              };
            }
            return p;
          }));
        }

        // Progressive retry backoff: fetch at 500ms, 1.5s, 3s, 5s
        // Stop early if WS already delivered real position data
        buyRetryTimersRef.current.forEach(clearTimeout);
        buyRetryTimersRef.current = [];
        const retryDelays = [500, 1500, 3000, 5000];
        for (const delay of retryDelays) {
          const timer = setTimeout(() => {
            const stillPending = positionsRef.current.some(
              (p) => p.tokenAddress.toLowerCase() === addr && (p as any)._needsRefresh
            );
            if (stillPending) {
              fetchPositions();
            }
          }, delay);
          buyRetryTimersRef.current.push(timer);
        }
      } else {
        debouncedFetchPositions(500);
      }
    };
    window.addEventListener(TRADE_COMPLETED_EVENT, handleTradeCompleted);

    // Listen for WS-driven position change signals (cache already invalidated on backend)
    const handlePositionsChanged = () => {
      lastTradeTimestampRef.current = Date.now();
      debouncedFetchPositions(200); // Short delay — cache is already invalidated
    };
    window.addEventListener('solanaPositionsChanged', handlePositionsChanged);

    // Listen for WS-pushed full position data (no REST fetch needed)
    const handlePositionUpdate = (event: Event) => {
      const { position, tokenAddress } = (event as CustomEvent).detail || {};
      if (!tokenAddress) return;
      // Only process updates for the currently displayed chain
      if (position?.blockchain && position.blockchain !== blockchain) return;

      setPositions((prev) => {
        const addr = tokenAddress.toLowerCase();
        let next: PositionRow[];

        if (!position || position.remaining <= 0.001) {
          // Position closed — remove it
          next = prev.filter((p) => p.tokenAddress.toLowerCase() !== addr);
        } else {
          const idx = prev.findIndex((p) => p.tokenAddress.toLowerCase() === addr);
          if (idx >= 0) {
            // Full replace — removes _needsRefresh/_pendingBuyAmount when real data arrives
            next = [...prev];
            next[idx] = { ...position };
          } else {
            // New position (buy) — prepend to top
            next = [position as PositionRow, ...prev];
          }
        }

        // Update localStorage cache
        try {
          window.localStorage.setItem(positionsCacheKey, JSON.stringify({
            data: next,
            timestamp: Date.now(),
          }));
        } catch {}

        return next;
      });
    };
    window.addEventListener('solanaPositionUpdate', handlePositionUpdate);

    // Listen for WS snapshot — instant positions on connection (before REST responds)
    const handlePositionsSnapshot = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.positions || !Array.isArray(detail.positions) || detail.positions.length === 0) return;

      // Only apply if this matches the currently viewed blockchain
      const snapshotBC = detail.blockchain === 'all' ? undefined : detail.blockchain;
      if (snapshotBC !== blockchain) return;

      // Only apply during initial load (before first REST response)
      if (!isInitialLoadRef.current) return;

      console.log(`[Positions] WS snapshot: ${detail.positions.length} positions`);
      const reversedPositions = [...detail.positions].reverse();
      setPositions(reversedPositions);
      onPositionsChange(reversedPositions);
      setLoading(false);

      // Update localStorage cache
      try {
        window.localStorage.setItem(positionsCacheKey, JSON.stringify({
          data: reversedPositions,
          timestamp: Date.now(),
        }));
      } catch {}

      requestMetadataForTokens(detail.positions);
    };
    window.addEventListener('solanaPositionsSnapshot', handlePositionsSnapshot);

    return () => {
      clearInterval(intervalId);
      if (debouncedFetchTimerRef.current) clearTimeout(debouncedFetchTimerRef.current);
      buyRetryTimersRef.current.forEach(clearTimeout);
      buyRetryTimersRef.current = [];
      window.removeEventListener('solanaQuickTrade', handleQuickTradeEvent);
      window.removeEventListener(TRADE_COMPLETED_EVENT, handleTradeCompleted);
      window.removeEventListener('solanaPositionsChanged', handlePositionsChanged);
      window.removeEventListener('solanaPositionUpdate', handlePositionUpdate);
      window.removeEventListener('solanaPositionsSnapshot', handlePositionsSnapshot);
    };
  }, [userId, onPositionsChange, skipFetch, blockchain, requestMetadataForTokens, positionsCacheKey, requestSnapshot]);

  // Fetch Pump.fun images for positions with missing images
  useEffect(() => {
    const fetchMissingPumpfunImages = async () => {
      // Find Pump.fun tokens that have no image in metadata or position
      const tokensNeedingImages = positions
        .filter((pos) => pos.remaining > 0)
        .filter((pos) => isPumpfunToken(pos.tokenAddress))
        .filter((pos) => {
          const metadata = tokenMetadata[pos.tokenAddress];
          const hasImage = metadata?.imageUrl || pos.imageUrl || pumpfunImages[pos.tokenAddress];
          return !hasImage;
        })
        .map((pos) => pos.tokenAddress);

      if (tokensNeedingImages.length === 0) return;

      // Fetch images in parallel
      const results = await Promise.allSettled(
        tokensNeedingImages.map(async (tokenAddress) => {
          const result = await fetchPumpfunImage(tokenAddress);
          return { tokenAddress, imageUrl: result?.imageUrl };
        })
      );

      // Update state with fetched images
      const newImages: Record<string, string> = {};
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.imageUrl) {
          newImages[result.value.tokenAddress] = result.value.imageUrl;
        }
      });

      if (Object.keys(newImages).length > 0) {
        setPumpfunImages((prev) => ({ ...prev, ...newImages }));
      }
    };

    // Only run after initial metadata fetch completes
    if (Object.keys(tokenMetadata).length > 0 || positions.length > 0) {
      fetchMissingPumpfunImages();
    }
  }, [positions, tokenMetadata, pumpfunImages]);

  return (
    <div className="w-full overflow-y-scroll scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800" style={{ maxHeight: '500px' }}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-20" style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
          <tr className="border-b border-white/[0.06]" style={{ background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 rgba(255, 255, 255, 0.02)' }}>
            <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30" style={{ width: '20%' }}>Token</th>
            <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30" style={{ width: '18%' }}>Bought</th>
            <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30" style={{ width: '12%' }}>Sold</th>
            <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30" style={{ width: '18%' }}>Remaining</th>
            <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30" style={{ width: '15%' }}>PnL</th>
            <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30" style={{ width: '17%' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {positions.length > 0 ? (
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
              
              // Use position.imageUrl as fallback, then Pump.fun API fallback for pump tokens
              const finalImageUrl = metadata?.imageUrl || sourcePosition.imageUrl || pumpfunImages[pos.tokenAddress] || '';
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
              
              const isPendingBuy = !!(pos as any)._pendingBuyAmount;

              return (
              <tr
                key={pos.tokenAddress || idx}
                className={`border-b border-white/[0.06] hover:bg-white/[0.04] cursor-pointer transition-colors ${
                  isHidden ? 'opacity-40 bg-neutral-900/30' : ''
                }`}
                onMouseEnter={() => {
                  if (!pos.tokenAddress) return;
                  // Build tradeUrl matching handleTokenNavigation exactly
                  const isMonadPos = isMonadPosition(sourcePosition);
                  const hoverParams = new URLSearchParams({
                    mode: 'sell',
                    tab: 'market',
                    timeRange: '5m',
                    sliderPct: '0',
                  });
                  if (metadata?.name) hoverParams.set('_name', metadata.name);
                  if (metadata?.symbol) hoverParams.set('_symbol', metadata.symbol);
                  if (finalImageUrl) hoverParams.set('_image', finalImageUrl);
                  if (pos.tokenAddress) hoverParams.set('_mint', pos.tokenAddress);
                  if (sourcePosition.currentPrice) hoverParams.set('_price', String(sourcePosition.currentPrice));
                  const posMeta = pos.tokenAddress ? tokenMetadata[pos.tokenAddress] : undefined;
                  if (posMeta?.marketCapUsd) hoverParams.set('_mcap', String(posMeta.marketCapUsd));
                  const hoverTradeUrl = isMonadPos
                    ? `/trade/monad/${pos.tokenAddress}?${hoverParams.toString()}`
                    : `/trade/${navigateAddress}?${hoverParams.toString()}`;
                  preloadTradeChart(
                    {
                      mint: pos.tokenAddress,
                      pairAddress: sourcePosition.pairAddress,
                      chain: currentChain === 'monad' ? 'monad' : 'sol',
                      name: metadata?.name,
                      symbol: metadata?.symbol,
                      image: finalImageUrl,
                      launchpadProtocol: protocolSource,
                    },
                    { router, tradeUrl: hoverTradeUrl }
                  );
                }}
                onClick={handleRowClick}
              >
                <td className="px-3 py-2.5">
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
                        onClick={(e) => handleTokenNavigation(e, sourcePosition, navigateAddress, { ...metadata, imageUrl: finalImageUrl })}
                      >
                        {metadata?.name || shortAddr(displayAddress)}
                      </button>
                      <div className="text-xs text-neutral-400 font-mono truncate" title={displayAddress}>
                        {shortAddr(displayAddress)}
                      </div>
                    </div>
                  </div>
                </td>
                <>
                  <td className="px-3 py-2.5">
                    <div className="flex items-baseline gap-1">
                      {isPendingBuy ? (
                        <span className="font-mono text-xs text-neutral-300">—</span>
                      ) : (
                        renderTokenAmount(corrected.correctedBought)
                      )}
                      <span className="text-neutral-400">
                        {showInSOL && solPrice > 0
                          ? <>(<SolIcon />{formatSmartNumber(sourcePosition.boughtUsdValue / solPrice)})</>
                          : `($${formatSmallPrice(Math.max(0, sourcePosition.boughtUsdValue || 0))})`
                        }
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
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
                  <td className="px-3 py-2.5">
                    <div className="flex items-baseline gap-1">
                      {isPendingBuy ? (
                        <span className="font-mono text-xs text-neutral-300">—</span>
                      ) : (
                        renderTokenAmount(corrected.correctedRemaining)
                      )}
                      <span className="text-neutral-400">
                        {showInSOL && solPrice > 0
                          ? <>(<SolIcon />{formatSmartNumber(corrected.correctedRemainingUsdValue / solPrice)})</>
                          : `($${formatSmallPrice(corrected.correctedRemainingUsdValue)})`
                        }
                      </span>
                    </div>
                  </td>
                  <td className={`px-3 py-2.5 font-semibold ${isPendingBuy ? 'text-neutral-400' : displayPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isPendingBuy ? (
                      <span className="text-xs">—</span>
                    ) : showInSOL && solPrice > 0 ? (
                      <>{displayPnl >= 0 ? '+' : ''}<SolIcon />{formatSmartNumber(Math.abs(displayPnl) / solPrice)}</>
                    ) : (
                      `${displayPnl >= 0 ? '+' : ''}$${formatSmallPrice(Math.abs(displayPnl))}`
                    )}
                    {!isPendingBuy && <span className="ml-1 text-xs">({formatSmallPrice(displayPnlPercentage)}%)</span>}
                  </td>
                </>
                <td className="px-3 py-2.5">
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
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08]"
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
                      disabled={!bearerToken}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                        !bearerToken
                          ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                          : 'bg-red-600/20 text-red-300 hover:bg-red-600/30'
                      }`}
                    >
                      <FaArrowUp className="text-xs" />
                      {'Quick Sell'}
                    </button>
                  </div>
                </td>
              </tr>
              );
            })
          ) : loading ? (
            // Skeleton placeholder rows while first load is in progress
            Array.from({ length: 3 }).map((_, i) => (
              <tr key={`skel-${i}`} className="border-b border-white/[0.06] animate-pulse">
                <td className="px-3 py-2.5"><div className="h-4 w-24 bg-white/[0.06] rounded" /></td>
                <td className="px-3 py-2.5"><div className="h-4 w-16 bg-white/[0.06] rounded" /></td>
                <td className="px-3 py-2.5"><div className="h-4 w-12 bg-white/[0.06] rounded" /></td>
                <td className="px-3 py-2.5"><div className="h-4 w-16 bg-white/[0.06] rounded" /></td>
                <td className="px-3 py-2.5"><div className="h-4 w-14 bg-white/[0.06] rounded" /></td>
                <td className="px-3 py-2.5"><div className="h-4 w-12 bg-white/[0.06] rounded" /></td>
              </tr>
            ))
          ) : sellingTokens.size > 0 ? (
            <tr><td colSpan={6} className="text-center py-6 text-neutral-500">Updating positions...</td></tr>
          ) : (
            <tr><td colSpan={6} className="text-center py-6 text-neutral-500">No positions yet.</td></tr>
          )}
          {positions.length > 0 && (
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
