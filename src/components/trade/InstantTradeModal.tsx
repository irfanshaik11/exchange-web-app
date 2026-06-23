"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { FaTimes, FaRunning, FaGasPump, FaEye, FaBan, FaSpinner, FaCheckCircle, FaExternalLinkAlt } from 'react-icons/fa';
import { LuPencil, LuCheck } from 'react-icons/lu';
import { useUser } from '~/components/UserContext';
import { useQuote } from '~/hooks/useQuote';
import {
  confirmOptimisticMarker,
  insertOptimisticMarker,
  rollbackOptimisticMarker,
} from "~/utils/pendingTradeMarkers";
import { useQuickBuy } from '~/components/QuickBuyContext';
import { executeEnhancedTrade } from '~/utils/enhancedTradeHandler';
import { tradeMonadSell, preCheckMonadBalance, tradeSellPercentage } from '~/utils/api';
import { executeMonadMultiBuy, formatMonadTxSummary } from '~/utils/monadWalletAllocation';
import { broadcastMonadQuickTrade } from '~/utils/monadTradeEvents';
import { validateMonadBalance, computeMonadBalanceForValidation } from '~/utils/tradeBalanceValidation';
import { formatMonadError } from '~/utils/monadError';
import { getTradeActivityByUser } from '~/utils/functions';
import { formatSmartNumber } from '~/utils/db';
import { extractTokenImage, getResolvedTokenImage } from '~/utils/images';
import HighSlippageWarningDialog from '../HighSlippageWarningDialog';
import LowLiquidityWarningDialog from '../LowLiquidityWarningDialog';
import type { Token } from '~/utils/db';
import toast from 'react-hot-toast';
import useMonadPositionWebSocket from '~/hooks/useMonadPositionWebSocket';
import { executeSolanaMultiBuy, buildSolanaWalletAllocations } from '~/utils/solanaWalletAllocation';
import { validateSolanaBuy, validateSolanaSell, showTradeValidationError } from '~/utils/preTradeValidation';
import { checkAtaExists } from '~/utils/ataCheck';
import { QUOTE_MINTS, QUOTE_BUY_PRESETS, type QuoteCurrency } from '~/utils/quoteCurrency';
import { getPoolTypeFromToken } from '~/utils/poolTypeDetection';
import { mapTradeErrorMessage } from '~/utils/tradeErrorMessages';
import { showEnhancedToast } from '~/utils/enhancedToast';
import { listenForTradeEvents, transformToastToError } from '~/utils/createSolanaToastHandler';
import { fetchVerifiedPairAddress } from '~/hooks/useSingleTokenPolling';
import { useTxHashCallback } from '~/contexts/SolanaPositionWebSocketContext';
import { dispatchBalanceRefresh } from '~/utils/balanceEvents';
import { broadcastTradeCompleted, notifyTradePending } from '~/utils/tradeEvents';

interface InstantTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: Token | null;
  liveLiquidityUsd?: number;
}

const LOW_LIQUIDITY_WARNING_THRESHOLD = 1_000; // USD
const HIGH_SLIPPAGE_WARNING_THRESHOLD = 50; // Percent

const InstantTradeModal: React.FC<InstantTradeModalProps> = ({ isOpen, onClose, token, liveLiquidityUsd }) => {
  const router = useRouter();
  const { user, solBalance, refreshBalance, chainBalances, walletList, walletBalances, selectedWalletIds, primaryWalletAddresses, quoteCurrency, usdcSplBalance, walletUsdcBalances, tokenBalances, refreshUsdcBalance } = useUser();
  const { presets, activePreset, setActivePreset } = useQuickBuy();
  
  // Check if we're on a Monad trade page
  const isMonad = router.pathname?.includes('/trade/monad/') || false;
  const walletContext = useMemo(() => ({
    selectedWalletIds: isMonad ? selectedWalletIds?.monad || [] : selectedWalletIds?.sol || [],
    walletList: walletList || [],
    walletBalances: walletBalances || {},
    chain: (isMonad ? 'monad' : 'sol') as 'sol' | 'monad',
  }), [selectedWalletIds?.sol, selectedWalletIds?.monad, walletList, walletBalances, isMonad]);

  // Sourced from the Money Brain (useQuote) — one seed, shared with TradeActionPanel.
  const quote = useQuote();
  const effectiveWalletUsdcBalances = quote.usdcBalances;
  
  // Ref to track pending toast for WebSocket txHash update
  const pendingToastRef = useRef<{ id: string; tokenImage: string | null; tokenName: string; fakeTime: string; startTime: number; timerInterval?: NodeJS.Timeout } | null>(null);
  
  // Callback for instant txHash update via WebSocket (fires before HTTP response)
  const handleWsTxHash = useCallback((data: { txHash: string; tokenAddress: string; tradeType: 'buy' | 'sell'; explorerUrl: string }) => {
    const pending = pendingToastRef.current;
    if (!pending) return;
    
    // Update the link element - wrap Monad logo in anchor to make clickable
    const linkEl = document.getElementById(`link-${pending.id}`);
    if (linkEl) {
      linkEl.innerHTML = `<a href="${data.explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
    }
    
    // Set duration for auto-dismiss after 10s
    setTimeout(() => {
      if (pendingToastRef.current?.id === pending.id) {
        if (pendingToastRef.current.timerInterval) {
          clearInterval(pendingToastRef.current.timerInterval);
        }
        toast.dismiss(pending.id);
        pendingToastRef.current = null;
      }
    }, 10000);
  }, []);
  
  // WebSocket for instant txHash (only for Monad) - connect even without tokenAddress
  const tokenAddress = token?.mint || token?.pair_address || '';
  useMonadPositionWebSocket({
    tokenAddress,
    enabled: isMonad && !!user?.id, // Don't require tokenAddress - we want to receive any txHash
    onTxHash: handleWsTxHash,
  });

  // Pending toast ref for Solana quick buys (for WebSocket instant tx updates)
  const pendingSolanaQuickBuyToastRef = useRef<{
    id: string;
    tokenImage: string | null;
    tokenName: string;
    fakeTime: string;
    tokenAddress: string;
    startTime: number;
    timerHandle?: number;
    totalSelectedWallets: number;
  } | null>(null);

  // Callback for instant Solana txHash update via WebSocket (fires before HTTP response)
  const handleSolanaQuickBuyWsTxHash = useCallback((data: {
    txHash: string;
    tokenAddress: string;
    tradeType: 'buy' | 'sell';
    explorerUrl: string;
  }) => {
    const pending = pendingSolanaQuickBuyToastRef.current;
    if (!pending || pending.tokenAddress.toLowerCase() !== data.tokenAddress.toLowerCase()) return;

    // For single wallet: update the link element with clickable Solana logo
    if (pending.totalSelectedWallets === 1) {
      const linkEl = document.getElementById(`link-${pending.id}`);
      if (linkEl) {
        linkEl.innerHTML = `<a href="${data.explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
      }
    }

    // Auto-dismiss after 10s
    setTimeout(() => {
      if (pendingSolanaQuickBuyToastRef.current?.id === pending.id) {
        toast.dismiss(pending.id);
        pendingSolanaQuickBuyToastRef.current = null;
      }
    }, 10000);
  }, []);

  // Register Solana WS callback for instant txHash notifications
  useTxHashCallback('instant-trade-modal', handleSolanaQuickBuyWsTxHash);

  // Load position from localStorage
  const getInitialPosition = (): { x: number; y: number } => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    try {
      const saved = localStorage.getItem('instant-trade-popup-position');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { x: parsed.x || 0, y: parsed.y || 0 };
      }
    } catch {
      // Ignore parse errors
    }
    return { x: 0, y: 0 };
  };

  const [position, setPosition] = useState(getInitialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [hoverSellPercentage, setHoverSellPercentage] = useState<number | null>(null);
  const [activeSellPercentage, setActiveSellPercentage] = useState<number | null>(null);
  const [editingPresets, setEditingPresets] = useState(false);
  const [presetDrafts, setPresetDrafts] = useState<string[]>([]);
  const [showSlippageWarning, setShowSlippageWarning] = useState(false);
  const [showLiquidityWarning, setShowLiquidityWarning] = useState(false);
  const [pendingTradeOptions, setPendingTradeOptions] = useState<{ skipLiquidity?: boolean; skipSlippage?: boolean; amount: number; side: 'buy' | 'sell' } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const positionRef = useRef(position);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // Buy presets (SOL amounts) - editable
  const [buyPresets, setBuyPresets] = useState<number[]>([0.01, 0.1, 1, 10]);
  // Sell presets (percentages) - editable
  const [sellPresets, setSellPresets] = useState<number[]>([10, 25, 50, 100]);

  // When the quote currency switches to a non-SOL currency (e.g. USDC), reset
  // the buy presets to that currency's sensible defaults. The SOL path is left
  // untouched so its saved/default presets behave exactly as before.
  useEffect(() => {
    if (isMonad) return;
    if (quoteCurrency === 'SOL') return;
    setBuyPresets(QUOTE_BUY_PRESETS[quoteCurrency]);
  }, [quoteCurrency, isMonad]);

  // Load presets from localStorage or use defaults
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isMonad) {
        // For Monad, use monadTradeActionPanelPresets
        const saved = localStorage.getItem('monadTradeActionPanelPresets');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length === 5) {
              // Convert string array to number array (first 4 for buy presets)
              const buyPresetsFromMonad = parsed.slice(0, 4).map((s: string) => parseFloat(s) || 0);
              setBuyPresets(buyPresetsFromMonad);
            }
          } catch (e) {
            // Use defaults
          }
        }
      } else {
        // For Solana, use tradeActionPanelBuyPresets
        const savedBuyPresets = localStorage.getItem('tradeActionPanelBuyPresets') || 
                                localStorage.getItem('instantTradeBuyPresets');
        const savedSellPresets = localStorage.getItem('tradeActionPanelSellPresets') ||
                                localStorage.getItem('instantTradeSellPresets');
        if (savedBuyPresets) {
          try {
            const parsed = JSON.parse(savedBuyPresets);
            if (Array.isArray(parsed) && parsed.length === 4) {
              setBuyPresets(parsed);
            }
          } catch (e) {
            // Use defaults
          }
        }
        if (savedSellPresets) {
          try {
            const parsed = JSON.parse(savedSellPresets);
            if (Array.isArray(parsed) && parsed.length === 4) {
              setSellPresets(parsed);
            }
          } catch (e) {
            // Use defaults
          }
        }
      }

      // Listen for preset updates from other components
      const handlePresetUpdate = (e: CustomEvent) => {
        if (e.detail?.type === 'buy' && Array.isArray(e.detail.presets)) {
          setBuyPresets(e.detail.presets);
          setPresetDrafts(e.detail.presets.map(String));
        } else if (e.detail?.type === 'sell' && Array.isArray(e.detail.presets)) {
          setSellPresets(e.detail.presets);
        }
      };

      // Listen for Monad preset updates
      const handleMonadPresetUpdate = () => {
        if (isMonad) {
          const saved = localStorage.getItem('monadTradeActionPanelPresets');
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length === 5) {
                const buyPresetsFromMonad = parsed.slice(0, 4).map((s: string) => parseFloat(s) || 0);
                setBuyPresets(buyPresetsFromMonad);
                setPresetDrafts(buyPresetsFromMonad.map(String));
              }
            } catch (e) {
              // Ignore
            }
          }
        }
      };

      window.addEventListener('tradePresetsUpdated', handlePresetUpdate as EventListener);
      window.addEventListener('storage', (e) => {
        if (e.key === 'monadTradeActionPanelPresets') {
          handleMonadPresetUpdate();
        }
      });
      
      return () => {
        window.removeEventListener('tradePresetsUpdated', handlePresetUpdate as EventListener);
      };
    }
  }, [isMonad]);

  // Initialize preset drafts
  useEffect(() => {
    setPresetDrafts(buyPresets.map(String));
  }, [buyPresets]);

  // Fetch token balance from trade activity
  useEffect(() => {
    const fetchTokenBalance = async () => {
      if (!user || !token) {
        setTokenBalance(0);
        return;
      }

      try {
        const trades = await getTradeActivityByUser(user.id.toString());
        const tokenTrades = trades.filter(
          (trade: any) => trade.tokenAddress?.toLowerCase() === (token.mint || "").toLowerCase()
        );

        if (tokenTrades.length > 0) {
          let bought = 0;
          let sold = 0;

          tokenTrades.forEach((trade: any) => {
            if (trade.type === "Buy") {
              bought += Number(trade.tokenAmount) || 0;
            } else if (trade.type === "Sell") {
              sold += Number(trade.tokenAmount) || 0;
            }
          });

          const remaining = bought - sold;
          setTokenBalance(Math.max(0, remaining));
        } else {
          setTokenBalance(0);
        }
      } catch (error) {
        console.error('Error fetching token balance:', error);
        setTokenBalance(0);
      }
    };

    if (isOpen && user && token) {
      fetchTokenBalance();
    }
  }, [isOpen, user, token]);

  const commitPresetDrafts = () => {
    const next = presetDrafts.map((s, idx) => {
      if (!s || s.trim() === "" || s.trim() === ".") {
        return 0;
      }
      const n = parseFloat(s);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
    setBuyPresets(next);
    setEditingPresets(false);
    setPresetDrafts(next.map(String));
    
    // Save to localStorage with shared key
    if (typeof window !== 'undefined') {
      if (isMonad) {
        // For Monad, save to monadTradeActionPanelPresets (as strings, keeping existing 5th value if any)
        const existing = localStorage.getItem('monadTradeActionPanelPresets');
        let existingArray: string[] = ['0.01', '0.05', '0.1', '0.5', '1'];
        if (existing) {
          try {
            const parsed = JSON.parse(existing);
            if (Array.isArray(parsed) && parsed.length === 5) {
              existingArray = parsed;
            }
          } catch (e) {
            // Use defaults
          }
        }
        // Update first 4 values with new presets (as strings)
        const updated = [...next.map(String), existingArray[4] || '1'];
        localStorage.setItem('monadTradeActionPanelPresets', JSON.stringify(updated));
        
        // Dispatch custom event to notify MonadTradeActionPanel
        window.dispatchEvent(new CustomEvent('monadPresetsUpdated', {
          detail: { presets: updated }
        }));
      } else if (quoteCurrency === "SOL") {
        // For Solana, use existing keys (USDC presets are defaults, not persisted)
        localStorage.setItem('tradeActionPanelBuyPresets', JSON.stringify(next));
        localStorage.setItem('instantTradeBuyPresets', JSON.stringify(next));
        
        // Dispatch custom event to notify other components
        window.dispatchEvent(new CustomEvent('tradePresetsUpdated', {
          detail: { type: 'buy', presets: next }
        }));
      }
    }
  };

  const allowDecimal = (v: string) => /^\d*([.]\d{0,9})?$/.test(v);

  // Initialize position - use saved position if available, otherwise center
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      // Use a small delay to ensure modal is rendered and we can get its actual dimensions
      const updatePosition = () => {
        const MIN_Y = -40; // Ensure header is always visible
        // Use actual modal dimensions if available, otherwise use fallback
        const modalHeight = modalRef.current?.offsetHeight || 600;
        const modalWidth = modalRef.current?.offsetWidth || 400;
        const MAX_Y = window.innerHeight - modalHeight + 40; // Keep at least 40px of header visible at bottom
        const MIN_X = 0;
        const MAX_X = window.innerWidth - modalWidth;
        
        const saved = localStorage.getItem('instant-trade-popup-position');
        if (!saved) {
          // Only center if no saved position exists
          const centerX = Math.max(MIN_X, Math.min(MAX_X, window.innerWidth / 2 - modalWidth / 2));
          const centerY = Math.max(MIN_Y, Math.min(MAX_Y, window.innerHeight / 2 - modalHeight / 2));
          setPosition({
            x: centerX,
            y: centerY,
          });
        } else {
          // Use saved position, but ensure it respects constraints
          try {
            const parsed = JSON.parse(saved);
            const constrainedY = Math.max(MIN_Y, Math.min(MAX_Y, parsed.y || 0));
            const constrainedX = Math.max(MIN_X, Math.min(MAX_X, parsed.x || 0));
            setPosition({ x: constrainedX, y: constrainedY });
          } catch {
            // If parse fails, center it
            const centerX = Math.max(MIN_X, Math.min(MAX_X, window.innerWidth / 2 - modalWidth / 2));
            const centerY = Math.max(MIN_Y, Math.min(MAX_Y, window.innerHeight / 2 - modalHeight / 2));
            setPosition({
              x: centerX,
              y: centerY,
            });
          }
        }
      };

      // Try immediately, then again after a short delay to ensure modal is rendered
      updatePosition();
      const timeoutId = setTimeout(updatePosition, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  // Save position to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      localStorage.setItem('instant-trade-popup-position', JSON.stringify(position));
    }
  }, [position, isOpen]);

  // Constrain position on window resize
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const handleResize = () => {
      const MIN_Y = -40;
      const modalHeight = modalRef.current?.offsetHeight || 600;
      const modalWidth = modalRef.current?.offsetWidth || 400;
      const MAX_Y = window.innerHeight - modalHeight + 40;
      const MIN_X = 0;
      const MAX_X = window.innerWidth - modalWidth;

      setPosition(prev => ({
        x: Math.max(MIN_X, Math.min(MAX_X, prev.x)),
        y: Math.max(MIN_Y, Math.min(MAX_Y, prev.y)),
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]);

  // Handle drag functionality - use callbacks and refs to avoid dependency issues
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDraggingRef.current || e.pointerId !== activePointerIdRef.current) return;

    e.preventDefault();

    const nextX = e.clientX - dragStartRef.current.x;
    const nextY = e.clientY - dragStartRef.current.y;
    
    // Constrain Y position to ensure the header (drag handle) is always visible
    // Header is approximately 56px tall (py-3 padding + content), so we allow it to go slightly above
    // but ensure at least part of the header is visible (minimum Y of -40px allows header to be partially visible)
    const MIN_Y = -40; // Allow header to be partially visible at top
    
    // Calculate maximum Y to keep modal within viewport
    // Use actual modal dimensions if available, otherwise use fallback
    const modalHeight = modalRef.current?.offsetHeight || 600;
    const MAX_Y = window.innerHeight - modalHeight + 40; // Keep at least 40px of header visible at bottom
    
    const constrainedY = Math.max(MIN_Y, Math.min(MAX_Y, nextY));

    // Also constrain X to keep modal within viewport
    const modalWidth = modalRef.current?.offsetWidth || 400;
    const MIN_X = 0;
    const MAX_X = window.innerWidth - modalWidth;
    const constrainedX = Math.max(MIN_X, Math.min(MAX_X, nextX));

    const nextPosition = {
      x: constrainedX,
      y: constrainedY,
    };

    positionRef.current = nextPosition;

    if (animationFrameRef.current === null) {
      animationFrameRef.current = window.requestAnimationFrame(() => {
        setPosition(positionRef.current);
        animationFrameRef.current = null;
      });
    }
  }, []);

  const handlePointerUp = useCallback((e?: PointerEvent) => {
    if (!isDraggingRef.current) return;
    if (e && activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }

    isDraggingRef.current = false;
    setIsDragging(false);
    activePointerIdRef.current = null;

    if (headerRef.current && e && headerRef.current.hasPointerCapture(e.pointerId)) {
      headerRef.current.releasePointerCapture(e.pointerId);
    }

    // Ensure final position is committed
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setPosition(positionRef.current);
  }, []);

  // Set up global mouse event listeners once (industry-standard behavior)
  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerUp, true);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerUp, true);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [handlePointerMove, handlePointerUp]);

  // Manage body styles while dragging to prevent text selection/cursor glitches
  useEffect(() => {
    if (isDragging) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
    } else {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging]);

  // Handle drag start
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only respond to primary button

    const target = e.target as Node;
    if (headerRef.current?.contains(target)) {
      if ((target as HTMLElement).closest('button, input')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      isDraggingRef.current = true;
      activePointerIdRef.current = e.pointerId;
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX - positionRef.current.x,
        y: e.clientY - positionRef.current.y,
      };

      if (headerRef.current) {
        try {
          headerRef.current.setPointerCapture(e.pointerId);
        } catch {
          // Ignore if pointer capture not supported
        }
      }
    }
  }, []);

  // Get liquidity for warning checks
  const liquidityUsd = liveLiquidityUsd || token?.total_liquidity_usd || (token as any)?.liquidityUsd || (token as any)?.total_liquidityUsd || 0;

  // Get settings based on buy/sell
  const settings = presets[activePreset].quickBuySettings;
  
  // Helper to get effective slippage (15% for Monad if still at default 20%, otherwise use actual value)
  const getEffectiveSlippage = (slippage: number | undefined, isBuy: boolean = true) => {
    if (isMonad) {
      // For Monad, if slippage is 0.2 (default) or undefined, use 0.15 (15%)
      if (slippage === undefined || slippage === 0.2) {
        return 0.15;
      }
      return slippage;
    }
    // For Solana, use the slippage value or default to 0.2
    return slippage || 0.2;
  };

  // Helper function to map launchpad protocol to backend format (same as MonadTradeActionPanel)
  const getLaunchpad = (): 'nadfun' | 'flapsh-simple' | 'flapsh-devs' => {
    const protocol = (token as any)?.launchpad_protocol?.toLowerCase() || '';
    
    if (protocol.includes('nad.fun') || protocol.includes('nadfun')) {
      return 'nadfun';
    } else if (protocol.includes('flap.sh') || protocol.includes('flapsh')) {
      // Check if it's devs portal (usually has 'dev' in the name or specific identifier)
      if (protocol.includes('dev')) {
        return 'flapsh-devs';
      }
      return 'flapsh-simple';
    }
    
    // Default to nadfun if unknown
    return 'nadfun';
  };

  const runMonadBuyWithToast = async ({
    tokenAddress,
    amountMON,
    launchpad,
    slippage,
    gasPrice,
    tokenImage,
    tokenName,
    toastPrefix = 'monad-quickbuy',
  }: {
    tokenAddress: string;
    amountMON: number;
    launchpad: "nadfun" | "flapsh-simple" | "flapsh-devs";
    slippage?: number;
    gasPrice?: number;
    tokenImage: string | null;
    tokenName: string;
    toastPrefix?: string;
  }) => {
    const toastId = `${toastPrefix}-${Date.now()}`;
    const startTime = Date.now();
    const timerCap = 0.30 + Math.random() * 0.20;
    let timerFinished = false;
    let tradeErrored = false;

    toast.custom(
      () => (
        <div className="flex items-center gap-2 bg-[#1a1b1e] text-white border border-white/10 rounded-lg px-4 py-3">
          <FaCheckCircle id={`check-${toastId}`} className="flex-shrink-0" size={16} style={{ color: '#31e3ac', display: timerFinished && !tradeErrored ? 'block' : 'none' }} />
          {tokenImage && (
            <img src={tokenImage} alt={tokenName} className="w-5 h-5 rounded-full object-cover flex-shrink-0" style={{ border: '1px solid rgba(255, 255, 255, 0.1)' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <span className="font-semibold text-sm" style={{ color: '#31e3ac' }}>Trade placed!</span>
          <span id={`timer-${toastId}`} className="text-[#9CA3AF] text-xs ml-1">(0.00s)</span>
          <span id={`link-${toastId}`} className="inline-flex items-center ml-1" style={{ display: 'none' }}>
            <img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" className="w-4 h-4 rounded-full" style={{ cursor: 'default' }} />
          </span>
        </div>
      ),
      { id: toastId, duration: Infinity }
    );

    const timerInterval = setInterval(() => {
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

    const cleanupMonadTradeListener = listenForTradeEvents(tokenAddress, toastId, (v) => { tradeErrored = v; }, 'monad');

    pendingToastRef.current = { id: toastId, tokenImage, tokenName, fakeTime: timerCap.toFixed(2), startTime, timerInterval };

    try {
      notifyTradePending({ tokenAddress, tradeType: 'buy', chain: 'monad' });
      const { results, totalConsidered } = await executeMonadMultiBuy({
        tokenAddress,
        amountMON,
        launchpad,
        slippage,
        gasPrice,
        authToken: user.bearerToken,
        walletList,
        walletBalances,
        selectedWalletIds: selectedWalletIds?.monad || [],
      });

      const txHashes = results
        .map((r) => (r.result as any)?.txHash)
        .filter(Boolean);
      const summary = formatMonadTxSummary(txHashes, totalConsidered);

      if (txHashes.length > 0) {
        const explorerUrl = summary.primaryTx ? `https://monadvision.com/tx/${summary.primaryTx}` : undefined;
        const linkEl = document.getElementById(`link-${toastId}`);
        if (linkEl && explorerUrl) {
          const extraCount = summary.hasMultiple && summary.walletsUsed > 1 ? `<span class="text-[10px] text-[#9CA3AF] ml-1">+${summary.walletsUsed - 1}</span>` : '';
          linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>${extraCount}`;
        }
        setTimeout(() => {
          toast.dismiss(toastId);
          clearInterval(timerInterval);
        }, 10000);
        pendingToastRef.current = null;
        return { success: true, summary, txHashes, totalConsidered };
      }

      tradeErrored = true;
      cleanupMonadTradeListener();
      clearInterval(timerInterval);
      pendingToastRef.current = null;
      toast.error('Trade failed', { id: toastId, duration: 6000 });
      return { success: false };
    } catch (error: any) {
      tradeErrored = true;
      cleanupMonadTradeListener();
      clearInterval(timerInterval);
      pendingToastRef.current = null;
      const errorMessage = formatMonadError(error?.message || error?.error || "Trade failed. Please try again.");
      toast.error(errorMessage, { id: toastId, duration: 6000 });
      return { success: false, error };
    }
  };

  // Solana quick buy with PulseTable-style animated toast
  const runSolanaQuickBuyWithToast = async ({
    amount,
    toastPrefix = 'solana-quickbuy',
  }: {
    amount: number;
    toastPrefix?: string;
  }) => {
    if (!token || !user) return { success: false };

    const tokenImage = token ? getResolvedTokenImage(token as any) : null;
    const tokenName = token?.name || token?.symbol || 'Token';
    const poolType = getPoolTypeFromToken(token);

    // Build wallet allocations to know wallet count
    const { allocations } = buildSolanaWalletAllocations({
      amount,
      walletList,
      walletBalances:
        quoteCurrency === "USDC" ? effectiveWalletUsdcBalances : walletBalances,
      selectedWalletIds: selectedWalletIds?.sol || [],
      priorityFee: settings.priority,
      bribe: settings.bribe,
      quoteCurrency,
    });
    const walletsWithBalance = allocations.length;
    const total = (selectedWalletIds?.sol || []).length || 1;
    const isMultiWallet = walletsWithBalance > 1;

    // Pre-validate before showing toast
    const ataExists = await checkAtaExists(token.mint, user?.publicKey).catch(() => null);
    const validation = validateSolanaBuy(amount, allocations, quoteCurrency === "USDC" ? effectiveWalletUsdcBalances : walletBalances, walletList, selectedWalletIds?.sol || [], settings.priority, settings.bribe, ataExists, quoteCurrency, solBalance);
    if (!validation.valid) {
      toast.error(validation.error || 'Insufficient balance', { duration: 5000 });
      return { success: false };
    }

    // Create PulseTable-style toast
    const uniqueToastId = `${toastPrefix}-${Date.now()}`;
    const startTime = Date.now();
    const timerCap = 0.30 + Math.random() * 0.20;
    let timerFinished = false;
    let tradeErrored = false;

    toast(
      (t) => (
        <div className="flex items-center gap-3">
          {tokenImage && (
            <img
              src={tokenImage}
              alt={tokenName}
              className="h-6 w-6 flex-shrink-0 rounded-full"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm text-neutral-200">
              Buying {tokenName}
            </span>
            <span
              id={`timer-${uniqueToastId}`}
              className="flex-shrink-0 text-xs text-neutral-400"
            >
              (0.00s)
            </span>
            <span
              id={`check-${uniqueToastId}`}
              className="flex-shrink-0 text-green-400"
              style={{ display: timerFinished && !tradeErrored ? 'inline' : 'none' }}
            >
              ✓
            </span>
            <span
              id={`link-${uniqueToastId}`}
              className="flex-shrink-0"
              style={{ display: 'inline-flex' }}
            >
              <img
                src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4"
                alt="Solana"
                className="h-4 w-4 rounded-full opacity-70"
                style={{ cursor: 'default' }}
              />
            </span>
          </div>
        </div>
      ),
      {
        id: uniqueToastId,
        duration: Infinity,
        style: {
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '8px',
          padding: '12px',
        },
      },
    );

    // Timer animation (requestAnimationFrame for smooth updates)
    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const displayTime = Math.min(elapsed, timerCap).toFixed(2);
      const timerEl = document.getElementById(`timer-${uniqueToastId}`);
      if (timerEl) {
        timerEl.textContent = `(${displayTime}s)`;
      }

      if (!timerFinished && elapsed >= timerCap) {
        timerFinished = true;
        if (!tradeErrored) {
          const checkEl = document.getElementById(`check-${uniqueToastId}`);
          if (checkEl) {
            checkEl.style.display = 'block';
          }
          const linkEl = document.getElementById(`link-${uniqueToastId}`);
          if (linkEl) {
            if (isMultiWallet) {
              linkEl.textContent = `${walletsWithBalance}/${total}`;
              linkEl.className = 'text-xs text-blue-400 font-medium flex-shrink-0';
            } else {
              linkEl.innerHTML = `<img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full opacity-70" style="cursor: default;" />`;
              linkEl.className = 'flex-shrink-0';
            }
          }
        }
        timerHandle = null as any;
        return;
      }
      timerHandle = requestAnimationFrame(tick) as any;
    };
    let timerHandle = requestAnimationFrame(tick) as any;

    // Store pending toast info for WebSocket instant update
    pendingSolanaQuickBuyToastRef.current = {
      id: uniqueToastId,
      tokenImage,
      tokenName,
      fakeTime: timerCap.toFixed(2),
      tokenAddress: token.mint || '',
      startTime,
      timerHandle,
      totalSelectedWallets: walletsWithBalance,
    };

    const cleanupSolanaTradeListener = listenForTradeEvents(token.mint || '', uniqueToastId, (v) => { tradeErrored = v; }, 'solana');

    let __markId = "";

    try {
      // Resolve pool: prefer migrated_pool_address (live AMM after migration);
      // fall back to pair_address (bonding curve) only when not migrated. Re-
      // verify with token-service ONLY when we don't already have a migrated
      // pool locally — `/v1/get-pair/{mint}` returns bonding-curve pair_address
      // only, which for migrated tokens is stale/contaminated and would
      // downgrade our local migrated value.
      let poolAddress = (token as any).migrated_pool_address || token.pair_address || '';
      const hasMigratedPoolLocally = !!(token as any).migrated_pool_address;
      if (!hasMigratedPoolLocally && token.mint) {
        const verifiedPairAddress = await fetchVerifiedPairAddress(token.mint);
        if (verifiedPairAddress) {
          poolAddress = verifiedPairAddress;
        }
      }
      const baseMint = token.mint || '';
      const quoteMint = QUOTE_MINTS[quoteCurrency];

      __markId = insertOptimisticMarker({ quoteCurrency,
        mint: baseMint,
        walletAddress: primaryWalletAddresses?.solana ?? walletList?.find((w) => w.isPrimary)?.solanaAddress ?? walletList?.[0]?.solanaAddress,
        side: "buy",
        amountSol: amount,
        priceUsd: token.usd_price,
      }).id;

      notifyTradePending({ tokenAddress: baseMint, tradeType: 'buy', chain: 'sol' });
      const multiResult = await executeSolanaMultiBuy({
        poolAddress,
        baseMint,
        quoteMint,
        amountSOL: amount,
        quoteCurrency,
        walletUsdcBalances,
        poolType,
        originalPairAddress: token.pair_address,
        slippage: getEffectiveSlippage(settings.maxSlippage, true),
        priorityFee: settings.priority,
        bribe: settings.bribe,
        mevMode: settings.mevMode,
        autoFee: settings.autoFee,
        maxFee: settings.maxFee,
        rpc: settings.rpc,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        authToken: user.bearerToken,
        walletList,
        walletBalances,
        selectedWalletIds: selectedWalletIds?.sol || [],
        onTxHash: ({ txHash }) => {
          if (pendingSolanaQuickBuyToastRef.current?.id === uniqueToastId && txHash) {
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              const explorerUrl = `https://solscan.io/tx/${txHash}`;
              linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
              linkEl.className = '';
            }
            // Fire early so Portfolio refetches immediately when Solscan link appears
            broadcastTradeCompleted({ tokenAddress: baseMint, tradeType: 'buy', chain: 'sol', txHash, tokenName: token?.name, tokenSymbol: token?.symbol, imageUrl: tokenImage || undefined, solAmountSpent: amount });
          }
        },
      });

      // Extract first tx hash for post-success link update
      const firstTxHash =
        multiResult?.results?.find(
          (r: any) => (r.result as any)?.hash || (r.result as any)?.txid,
        )?.result?.hash ||
        multiResult?.results?.find(
          (r: any) => (r.result as any)?.hash || (r.result as any)?.txid,
        )?.result?.txid;

      confirmOptimisticMarker(__markId, firstTxHash);

      if (firstTxHash && !isMultiWallet) {
        const linkEl = document.getElementById(`link-${uniqueToastId}`);
        if (linkEl) {
          const explorerUrl = `https://solscan.io/tx/${firstTxHash}`;
          linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
          linkEl.className = '';
        }
        if (timerHandle) {
          cancelAnimationFrame(timerHandle);
        }
        setTimeout(() => toast.dismiss(uniqueToastId), 10000);
      }

      // Dispatch event to refresh chart price lines
      if (typeof window !== 'undefined' && token.mint) {
        window.dispatchEvent(new CustomEvent('solanaQuickTrade', { detail: { tokenAddress: token.mint } }));
      }

      // Refresh header SOL balance
      dispatchBalanceRefresh('sol');
      if (quoteCurrency === "USDC") void refreshUsdcBalance?.();
      broadcastTradeCompleted({ tokenAddress: token.mint, tradeType: 'buy', chain: 'sol', tokenName: token.name, tokenSymbol: token.symbol, imageUrl: tokenImage || undefined, solAmountSpent: amount });

      // Refresh token balance after 2s
      setTimeout(async () => {
        try {
          const trades = await getTradeActivityByUser(user.id.toString());
          const tokenTrades = trades.filter(
            (trade: any) => trade.tokenAddress?.toLowerCase() === (token.mint || '').toLowerCase()
          );
          if (tokenTrades.length > 0) {
            let bought = 0;
            let sold = 0;
            tokenTrades.forEach((trade: any) => {
              if (trade.type === 'Buy') bought += Number(trade.tokenAmount) || 0;
              else if (trade.type === 'Sell') sold += Number(trade.tokenAmount) || 0;
            });
            setTokenBalance(Math.max(0, bought - sold));
          } else {
            setTokenBalance(0);
          }
        } catch (error) {
          console.error('Error refreshing token balance:', error);
        }
      }, 2000);

      return { success: true };
    } catch (error: any) {
      rollbackOptimisticMarker(__markId);
      tradeErrored = true;
      cleanupSolanaTradeListener();
      if (timerHandle) {
        cancelAnimationFrame(timerHandle);
      }
      console.error('❌ Solana Quick Buy failed:', error);
      if (pendingSolanaQuickBuyToastRef.current) {
        transformToastToError(pendingSolanaQuickBuyToastRef.current.id, mapTradeErrorMessage(error), tokenImage, tokenName);
        pendingSolanaQuickBuyToastRef.current = null;
      }
      return { success: false, error };
    }
  };

  // Handle quick buy - using same logic as TradeActionPanel
  const handleQuickBuy = async (amount: number) => {
    if (!user || !token) {
      return;
    }

    // Validation - same as TradeActionPanel
    const requested = Number(amount || 0);
    if (!requested || requested <= 0) {
      return;
    }

    // ============================================
    // PRE-VALIDATION: Check balance BEFORE showing any toast
    // This prevents the misleading "Trade placed!" toast when balance is insufficient
    // ============================================
    if (isMonad) {
      const selectedMonadWalletIds = selectedWalletIds?.monad || [];
      const isMultiMonad = selectedMonadWalletIds.length > 1;

      // Get current Monad balance from chainBalances
      const monadBalance = computeMonadBalanceForValidation({
        selectedWalletIds: selectedMonadWalletIds,
        walletList,
        walletBalances,
        fallbackBalance: chainBalances['monad'] ?? 0,
      });
      const gasPrice = settings?.gasPrice !== undefined && settings.gasPrice > 0 ? settings.gasPrice : undefined;

      // Client-side validation first (fast, no network call)
      if (!isMultiMonad) {
        const clientValidation = validateMonadBalance({
          balance: monadBalance,
          tradeAmount: requested,
          gasPrice: gasPrice,
        });

        if (!clientValidation.isValid) {
          toast.error('Insufficient balance', { duration: 5000 });
          return;
        }
      }
    } else {
      // Solana validation — use multi-wallet-aware validateSolanaBuy so the
      // user's PRIMARY wallet balance is checked (not the first-listed wallet).
      // Previously used validateSolanaBalance({ balance: solBalance, ... }) which
      // read the default-wallet's balance regardless of which wallet the user
      // had selected as primary, producing false "insufficient balance" errors.
      const priorityFee = settings?.priority ?? 0.001;
      const bribe = settings?.bribe ?? 0;
      const { allocations } = buildSolanaWalletAllocations({
        amount: requested,
        walletList,
        walletBalances:
          quoteCurrency === "USDC" ? effectiveWalletUsdcBalances : walletBalances,
        selectedWalletIds: selectedWalletIds?.sol || [],
        priorityFee,
        bribe,
        quoteCurrency,
      });

      const clientValidation = validateSolanaBuy(
        requested,
        allocations,
        quoteCurrency === "USDC" ? effectiveWalletUsdcBalances : walletBalances,
        walletList,
        selectedWalletIds?.sol || [],
        priorityFee,
        bribe,
        null, // ataExists unknown at this pre-validation checkpoint
        quoteCurrency,
        solBalance,
      );

      if (!clientValidation.valid) {
        toast.error(clientValidation.error || 'Insufficient balance', { duration: 5000 });
        return;
      }
    }
    // ============================================
    // END PRE-VALIDATION
    // ============================================

    // Low liquidity warning disabled — let backend handle validation
    // if (!isMonad) {
    //   const liquidityValue = Number(liquidityUsd) || 0;
    //   const isLowLiquidity = liquidityValue <= 0 || liquidityValue < LOW_LIQUIDITY_WARNING_THRESHOLD;
    //   if (isLowLiquidity) {
    //     setPendingTradeOptions({ skipLiquidity: false, skipSlippage: false, amount, side: 'buy' });
    //     setShowLiquidityWarning(true);
    //     return;
    //   }
    // }

    // Check slippage warning (same as TradeActionPanel)
    const slippagePercent = getEffectiveSlippage(settings.maxSlippage, true) * 100;
    if (slippagePercent >= HIGH_SLIPPAGE_WARNING_THRESHOLD) {
      setPendingTradeOptions({ skipLiquidity: true, skipSlippage: false, amount, side: 'buy' });
      setShowSlippageWarning(true);
      return;
    }

    setIsLoading(true);

    try {
      if (isMonad) {
        const launchpad = getLaunchpad();
        const tokenAddress = token.mint; // Monad uses mint address (0x format)
        const slippage = settings?.maxSlippage ? settings.maxSlippage * 100 : 15;
        const gasPrice = settings?.gasPrice !== undefined && settings.gasPrice > 0 ? settings.gasPrice : undefined;
        const tokenImage = token ? getResolvedTokenImage(token as any) : null;
        const tokenName = token?.name || token?.symbol || '';
        const buyResult = await runMonadBuyWithToast({
          tokenAddress,
          amountMON: requested,
          launchpad,
          slippage,
          gasPrice,
          tokenImage,
          tokenName,
          toastPrefix: 'monad-quickbuy',
        });

        if (buyResult?.success) {
          setTimeout(() => {
            refreshBalance({ chain: "monad", force: true }).catch((err) => {
              console.warn('Failed to refresh balance:', err);
            });
          }, 1000);

          setTimeout(async () => {
            try {
              const trades = await getTradeActivityByUser(user.id.toString());
              const tokenTrades = trades.filter(
                (trade: any) => trade.tokenAddress?.toLowerCase() === (token.mint || "").toLowerCase()
              );

              if (tokenTrades.length > 0) {
                let bought = 0;
                let sold = 0;

                tokenTrades.forEach((trade: any) => {
                  if (trade.type === "Buy") {
                    bought += Number(trade.tokenAmount) || 0;
                  } else if (trade.type === "Sell") {
                    sold += Number(trade.tokenAmount) || 0;
                  }
                });

                const remaining = bought - sold;
                setTokenBalance(Math.max(0, remaining));
              } else {
                setTokenBalance(0);
              }
            } catch (error) {
              console.error('Error refreshing token balance:', error);
            }
          }, 2000);

          broadcastMonadQuickTrade(tokenAddress, 'buy');
          broadcastTradeCompleted({ tokenAddress, tradeType: 'buy', chain: 'monad', tokenName: token?.name, tokenSymbol: token?.symbol, imageUrl: tokenImage || undefined, solAmountSpent: requested });
        }

        setIsLoading(false);
        return;
      } else {
        // Use Solana quick buy with PulseTable-style toast
        const buyResult = await runSolanaQuickBuyWithToast({ amount: requested });
        setIsLoading(false);
        return buyResult;
      }
    } catch (error: any) {
      console.error("Trade error:", error);
      setIsLoading(false);
    }
  };

  // Handle quick sell - using same logic as TradeActionPanel
  const handleQuickSell = async (percentage: number) => {
    if (!user || !token) {
      return;
    }

    // Validation - same as TradeActionPanel
    if (!percentage || percentage <= 0) {
      return;
    }
    if (percentage > 100) {
      return;
    }

    const sellSettings = presets[activePreset].quickSellSettings;


    // Check slippage warning (same as TradeActionPanel)
    const slippagePercent = getEffectiveSlippage(sellSettings.maxSlippage, false) * 100;
    if (slippagePercent >= HIGH_SLIPPAGE_WARNING_THRESHOLD) {
      setPendingTradeOptions({ skipLiquidity: true, skipSlippage: false, amount: percentage, side: 'sell' });
      setShowSlippageWarning(true);
      return;
    }

    setIsLoading(true);

    try {
      if (isMonad) {
        // Use Monad sell API - match MonadTradeActionPanel exactly
        const launchpad = getLaunchpad();
        const tokenAddress = token.mint; // Monad uses mint address (0x format)
        const maxSlippage = getEffectiveSlippage(sellSettings.maxSlippage, false);
        const gasPrice = sellSettings.gasPrice !== undefined && sellSettings.gasPrice > 0 ? sellSettings.gasPrice : undefined;
        
        // Get token image and name
        const tokenImage = token ? getResolvedTokenImage(token as any) : null;
        const tokenName = token?.name || token?.symbol || '';
        
        // Generate unique toast ID and fake fast time (0.40-0.60s)
        const uniqueSellToastId = `monad-sell-${Date.now()}`;
        const fakeTime = (Math.random() * 0.2 + 0.3).toFixed(2);
        const sellStartTime = Date.now();
        
        // Random cap time between 0.40 and 0.60 seconds
        const sellTimerCap = 0.30 + Math.random() * 0.20;
        let sellTimerFinished = false;
        let tradeErrored = false;

        // Show initial loading toast with timer - checkmark hidden until timer finishes, link icon grayed out
        toast.custom(
          (t) => (
            <div className="flex items-center gap-2 bg-[#1a1b1e] text-white border border-white/10 rounded-lg px-4 py-3">
              <FaCheckCircle id={`check-${uniqueSellToastId}`} className="flex-shrink-0" size={16} style={{ color: '#31e3ac', display: sellTimerFinished && !tradeErrored ? 'block' : 'none' }} />
              {tokenImage && (
                <img src={tokenImage} alt={tokenName} className="w-5 h-5 rounded-full object-cover flex-shrink-0" style={{ border: '1px solid rgba(255, 255, 255, 0.1)' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
              <span className="font-semibold text-sm" style={{ color: '#31e3ac' }}>Trade placed!</span>
              <span id={`timer-${uniqueSellToastId}`} className="text-[#9CA3AF] text-xs ml-1">(0.00s)</span>
              <span id={`link-${uniqueSellToastId}`} className="inline-flex items-center ml-1" style={{ display: 'none' }}>
                <img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" className="w-4 h-4 rounded-full" style={{ cursor: 'default' }} />
              </span>
            </div>
          ),
          { id: uniqueSellToastId, duration: Infinity }
        );
        
        // Start timer animation - update every 50ms, show checkmark when cap is reached
        const sellTimerInterval = setInterval(() => {
          const elapsed = (Date.now() - sellStartTime) / 1000;
          const displayTime = Math.min(elapsed, sellTimerCap).toFixed(2);
          const timerEl = document.getElementById(`timer-${uniqueSellToastId}`);
          if (timerEl) {
            timerEl.textContent = `(${displayTime}s)`;
          }
          
          // When timer reaches cap, show checkmark and Monad logo
          if (!sellTimerFinished && elapsed >= sellTimerCap) {
            sellTimerFinished = true;
            const checkEl = document.getElementById(`check-${uniqueSellToastId}`);
            if (checkEl) {
              checkEl.style.display = 'block';
            }
            const linkEl = document.getElementById(`link-${uniqueSellToastId}`);
            if (linkEl) {
              linkEl.style.display = 'inline-flex';
            }
          }
        }, 50);

        const cleanupSellTradeListener = listenForTradeEvents(tokenAddress, uniqueSellToastId, (v) => { tradeErrored = v; }, 'monad');

        // Store pending toast info for WebSocket instant update (including timer)
        pendingToastRef.current = { id: uniqueSellToastId, tokenImage, tokenName, fakeTime: sellTimerCap.toFixed(2), startTime: sellStartTime, timerInterval: sellTimerInterval };

        // Add timeout wrapper to prevent hanging
        const selectedMonadWalletIds = selectedWalletIds?.monad || [];
        const isMultiWalletSell = selectedMonadWalletIds.length > 1;
        const selectedWalletId = selectedMonadWalletIds[0];

        const sellPromise = tradeMonadSell(
          {
            tokenAddress,
            launchpad,
            percentage: percentage,
            slippage: maxSlippage * 100,
            gasPrice: gasPrice,
            walletId: !isMultiWalletSell ? selectedWalletId : undefined,
            walletIds: isMultiWalletSell ? selectedMonadWalletIds : undefined,
            useMultipleWallets: isMultiWalletSell,
          },
          user.bearerToken
        );

        // Race the API call against a 30-second timeout (backend has 45s, but we want to fail faster)
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Request timed out. The sell is taking longer than expected. Please check if the transaction went through on the blockchain.'));
          }, 30000); // 30 second timeout
        });

        const result = await Promise.race([sellPromise, timeoutPromise]);

        if (result.success && result.txHash) {
          // Only update toast if WebSocket hasn't already handled it
          if (pendingToastRef.current?.id === uniqueSellToastId) {
            const explorerUrl = `https://monadvision.com/tx/${result.txHash}`;
            // Update the link element - wrap Monad logo in anchor to make clickable
            const linkEl = document.getElementById(`link-${uniqueSellToastId}`);
            if (linkEl) {
              linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
            }
            // Auto-dismiss after 10s
            setTimeout(() => {
              toast.dismiss(uniqueSellToastId);
            }, 10000);
            pendingToastRef.current = null;
          }
          
          // Refresh token balance after trade
          setTimeout(async () => {
            try {
              const trades = await getTradeActivityByUser(user.id.toString());
              const tokenTrades = trades.filter(
                (trade: any) => trade.tokenAddress?.toLowerCase() === (token.mint || "").toLowerCase()
              );

              if (tokenTrades.length > 0) {
                let bought = 0;
                let sold = 0;

                tokenTrades.forEach((trade: any) => {
                  if (trade.type === "Buy") {
                    bought += Number(trade.tokenAmount) || 0;
                  } else if (trade.type === "Sell") {
                    sold += Number(trade.tokenAmount) || 0;
                  }
                });

                const remaining = bought - sold;
                setTokenBalance(Math.max(0, remaining));
              } else {
                setTokenBalance(0);
              }
            } catch (error) {
              console.error('Error refreshing token balance:', error);
            }
          }, 2000);
          broadcastMonadQuickTrade(tokenAddress, 'sell');
          broadcastTradeCompleted({ tokenAddress, tradeType: 'sell', chain: 'monad' });
          setTimeout(() => {
            refreshBalance({ chain: "monad", force: true }).catch((err: any) => {
              console.warn('Failed to refresh balance:', err);
            });
          }, 1000);
        } else {
          tradeErrored = true;
          cleanupSellTradeListener();
          toast.error(formatMonadError((result as any).error), { id: uniqueSellToastId, duration: 6000 });
          setIsLoading(false);
        }

        setIsLoading(false);
        return result;
      } else {
        // Solana sell — direct tradeSellPercentage (matches TradeActionPanel flow)
        const tokenName = token.symbol || token.name || 'Token';
        const tokenImage = getResolvedTokenImage(token);
        const tokenAddress = token.mint || '';

        // Pre-validate
        const sellValidation = validateSolanaSell(percentage);
        if (!sellValidation.valid) {
          showTradeValidationError(sellValidation.error, tokenImage, tokenName);
          setIsLoading(false);
          return { success: false };
        }

        // Animated toast setup (same as TradeActionPanel)
        const uniqueToastId = `solana-sell-modal-${Date.now()}-${Math.random()}`;
        const startTime = Date.now();
        const timerCap = 0.30 + Math.random() * 0.20;
        let timerFinished = false;
        let tradeErrored = false;

        toast(
          (t) => (
            <div className="flex items-center gap-3">
              {tokenImage && (
                <img
                  src={tokenImage}
                  alt={tokenName}
                  className="h-6 w-6 flex-shrink-0 rounded-full"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-sm text-neutral-200">
                  Selling {tokenName}
                </span>
                <span
                  id={`timer-${uniqueToastId}`}
                  className="flex-shrink-0 text-xs text-neutral-400"
                >
                  (0.00s)
                </span>
                <span
                  id={`check-${uniqueToastId}`}
                  className="flex-shrink-0 text-green-400"
                  style={{ display: timerFinished && !tradeErrored ? 'inline' : 'none' }}
                >
                  ✓
                </span>
                <span
                  id={`link-${uniqueToastId}`}
                  className="flex-shrink-0"
                  style={{ display: 'inline-flex' }}
                >
                  <img
                    src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4"
                    alt="Solana"
                    className="h-4 w-4 rounded-full opacity-70"
                    style={{ cursor: 'default' }}
                  />
                </span>
              </div>
            </div>
          ),
          {
            id: uniqueToastId,
            duration: Infinity,
            style: {
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '12px',
            },
          },
        );

        // Timer animation via requestAnimationFrame
        const tick = () => {
          const elapsed = (Date.now() - startTime) / 1000;
          const displayTime = Math.min(elapsed, timerCap).toFixed(2);
          const timerEl = document.getElementById(`timer-${uniqueToastId}`);
          if (timerEl) {
            timerEl.textContent = `(${displayTime}s)`;
          }

          if (!timerFinished && elapsed >= timerCap) {
            timerFinished = true;
            if (!tradeErrored) {
              const checkEl = document.getElementById(`check-${uniqueToastId}`);
              if (checkEl) {
                checkEl.style.display = 'block';
              }
            }
            timerHandle = null as any;
            return;
          }
          timerHandle = requestAnimationFrame(tick) as any;
        };
        let timerHandle = requestAnimationFrame(tick) as any;

        // Store pending toast ref for WebSocket instant txHash update
        pendingSolanaQuickBuyToastRef.current = {
          id: uniqueToastId,
          tokenImage,
          tokenName,
          fakeTime: timerCap.toFixed(2),
          tokenAddress,
          startTime,
          timerHandle,
          totalSelectedWallets: 1,
        };

        // Listen for trade events (for real-time error detection)
        const cleanupSellTradeListener = listenForTradeEvents(tokenAddress, uniqueToastId, (v) => { tradeErrored = v; }, 'solana');

        let __sellMarkId = "";

        try {
          const poolType = getPoolTypeFromToken(token);

          __sellMarkId = insertOptimisticMarker({ quoteCurrency,
            mint: tokenAddress,
            walletAddress: primaryWalletAddresses?.solana ?? walletList?.find((w) => w.isPrimary)?.solanaAddress ?? walletList?.[0]?.solanaAddress,
            side: "sell",
            amountToken: percentage,
            priceUsd: (token as any).usd_price,
          }).id;

          // Estimate SOL credit for the optimistic header update.
          const slipFraction = getEffectiveSlippage(sellSettings.maxSlippage, false);
          const tokenSolPrice =
            typeof token?.sol_price === 'number' && token.sol_price > 0
              ? token.sol_price
              : 0;
          const estSolOut =
            tokenSolPrice > 0 && tokenBalance > 0
              ? tokenBalance * (percentage / 100) * tokenSolPrice * (1 - slipFraction)
              : 0;
          const primarySolAddr = primaryWalletAddresses.solana || '';

          // Resolve trading pool: prefer migrated_pool_address (live AMM after
          // migration), fall back to pair_address (bonding curve). Re-verify
          // with token-service ONLY when we don't already have a migrated pool
          // locally — `/v1/get-pair/{mint}` returns bonding-curve pair_address
          // only, which for migrated tokens is stale/contaminated. Without this
          // guard, migrated tokens get their good local migrated_pool_address
          // overridden by a bad pair_address (root cause of the TRUMP→BARRON
          // dust-sell incident).
          let effectivePoolAddress =
            (token as any).migrated_pool_address || token.pair_address || '';
          const hasMigratedPoolLocally = !!(token as any).migrated_pool_address;
          if (!hasMigratedPoolLocally && token.mint) {
            const verifiedPairAddress = await fetchVerifiedPairAddress(token.mint);
            if (verifiedPairAddress) {
              effectivePoolAddress = verifiedPairAddress;
            }
          }

          const sellResult = await tradeSellPercentage(
            {
              tokenAddress,
              percentageToSell: percentage,
              poolAddress: effectivePoolAddress || undefined,
              baseMint: tokenAddress,
              quoteMint: QUOTE_MINTS[quoteCurrency],
              quoteCurrency,
              poolType,
              // originalPairAddress is for tracking history (always the original
              // pair_address), distinct from the execution poolAddress above.
              originalPairAddress: token.pair_address || undefined,
              slippage: getEffectiveSlippage(sellSettings.maxSlippage, false) * 100,
              priorityFee: sellSettings.priority ?? 0.0001,
              bribe: sellSettings.bribe ?? 0,
            },
            user.bearerToken,
            quoteCurrency === "SOL" && estSolOut > 0 && primarySolAddr
              ? { solOut: estSolOut, walletAddress: primarySolAddr }
              : undefined
          );

          cleanupSellTradeListener();

          if (sellResult?.hash) {
            confirmOptimisticMarker(__sellMarkId, sellResult.hash);
            // Update Solana logo to clickable Solscan link
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              const explorerUrl = `https://solscan.io/tx/${sellResult.hash}`;
              linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
            }

            // Show checkmark
            const checkEl = document.getElementById(`check-${uniqueToastId}`);
            if (checkEl) {
              checkEl.style.display = 'block';
            }

            // Clear pending ref
            pendingSolanaQuickBuyToastRef.current = null;

            // Auto-dismiss after 10s
            setTimeout(() => toast.dismiss(uniqueToastId), 10000);

            // Broadcast trade completed (portfolio auto-refresh)
            broadcastTradeCompleted({
              tokenAddress,
              tradeType: 'sell',
              chain: 'sol',
              txHash: sellResult.hash,
              sellPercentage: percentage,
            });

            // Dispatch event for chart price lines refresh
            if (typeof window !== 'undefined' && token.mint) {
              window.dispatchEvent(new CustomEvent('solanaQuickTrade', { detail: { tokenAddress: token.mint } }));
            }

            // Refresh SOL balance immediately
            dispatchBalanceRefresh('sol');
            if (quoteCurrency === "USDC") void refreshUsdcBalance?.();

            // Refresh position data after 2s
            setTimeout(async () => {
              try {
                const trades = await getTradeActivityByUser(user.id.toString());
                const tokenTrades = trades.filter(
                  (trade: any) => trade.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase()
                );

                if (tokenTrades.length > 0) {
                  let bought = 0;
                  let sold = 0;
                  tokenTrades.forEach((trade: any) => {
                    if (trade.type === 'Buy') {
                      bought += Number(trade.tokenAmount) || 0;
                    } else if (trade.type === 'Sell') {
                      sold += Number(trade.tokenAmount) || 0;
                    }
                  });
                  const remaining = bought - sold;
                  setTokenBalance(Math.max(0, remaining));
                } else {
                  setTokenBalance(0);
                }
              } catch (error) {
                console.error('Error refreshing token balance:', error);
              }
            }, 2000);

            setIsLoading(false);
            return { success: true, txHash: sellResult.hash };
          } else {
            // No hash returned — treat as failure
            rollbackOptimisticMarker(__sellMarkId);
            pendingSolanaQuickBuyToastRef.current = null;
            transformToastToError(uniqueToastId, sellResult?.message || 'Sell failed', tokenImage, tokenName);
            setIsLoading(false);
            return { success: false };
          }
        } catch (error: any) {
          rollbackOptimisticMarker(__sellMarkId);
          tradeErrored = true;
          cleanupSellTradeListener();

          if (timerHandle) {
            cancelAnimationFrame(timerHandle);
          }

          pendingSolanaQuickBuyToastRef.current = null;

          const errorMessage = mapTradeErrorMessage(error);
          transformToastToError(uniqueToastId, errorMessage, tokenImage, tokenName);
          console.error('❌ Sell failed:', error);
          setIsLoading(false);
          return { success: false, error };
        }
      }
    } catch (error: any) {
      console.error("Trade error:", error);
      setIsLoading(false);
      throw error;
    }
  };

  // Warning dialog handlers - same as TradeActionPanel
  const handleSlippageWarningContinue = useCallback(async () => {
    setShowSlippageWarning(false);
    if (!pendingTradeOptions || !token || !user) return;
    
    setIsLoading(true);
    const { amount, side } = pendingTradeOptions;
    const tokenImage = token ? getResolvedTokenImage(token as any) : null;
    const tokenName = token?.name || token?.symbol || '';
    
    try {
      if (isMonad) {
        // Use Monad buy/sell API for Monad tokens
        const launchpad = getLaunchpad();
        const tokenAddress = token.mint; // Monad uses mint address (0x format)
    const currentSettings = side === 'buy' 
      ? presets[activePreset].quickBuySettings 
      : presets[activePreset].quickSellSettings;
        const maxSlippage = getEffectiveSlippage(currentSettings.maxSlippage, side === 'buy');
        const gasPrice = currentSettings.priority ? currentSettings.priority * 1e9 : undefined; // Convert SOL to gwei
        
        if (side === 'buy') {
          const buyResult = await runMonadBuyWithToast({
            tokenAddress,
            amountMON: amount,
            launchpad,
            slippage: maxSlippage * 100, // Convert to percentage (0.15 -> 15)
            gasPrice,
            tokenImage,
            tokenName,
            toastPrefix: 'monad-slippage',
          });
          if (buyResult?.success) {
            // Refresh token balance after trade
            setTimeout(async () => {
              try {
                const trades = await getTradeActivityByUser(user.id.toString());
                const tokenTrades = trades.filter(
                  (trade: any) => trade.tokenAddress?.toLowerCase() === (token.mint || "").toLowerCase()
                );

                if (tokenTrades.length > 0) {
                  let bought = 0;
                  let sold = 0;

                  tokenTrades.forEach((trade: any) => {
                    if (trade.type === "Buy") {
                      bought += Number(trade.tokenAmount) || 0;
                    } else if (trade.type === "Sell") {
                      sold += Number(trade.tokenAmount) || 0;
                    }
                  });

                  const remaining = bought - sold;
                  setTokenBalance(Math.max(0, remaining));
                } else {
                  setTokenBalance(0);
                }
              } catch (error) {
                console.error('Error refreshing token balance:', error);
              }
            }, 2000);
            broadcastMonadQuickTrade(tokenAddress, 'buy');
            setTimeout(() => {
              refreshBalance({ chain: "monad", force: true }).catch((err: any) => {
                console.warn('Failed to refresh balance:', err);
              });
            }, 1000);
          }
        } else {
          const selectedMonadWalletIds = selectedWalletIds?.monad || [];
          const isMultiWalletSell = selectedMonadWalletIds.length > 1;
          const selectedWalletId = selectedMonadWalletIds[0];

          const result = await tradeMonadSell(
            {
              tokenAddress,
              launchpad,
              percentage: amount,
              slippage: maxSlippage * 100, // Convert to percentage (0.15 -> 15)
              gasPrice: gasPrice,
              walletId: !isMultiWalletSell ? selectedWalletId : undefined,
              walletIds: isMultiWalletSell ? selectedMonadWalletIds : undefined,
              useMultipleWallets: isMultiWalletSell,
            },
            user.bearerToken
          );
          
          const sellSuccess =
            result?.success === true ||
            (Array.isArray((result as any)?.txHashes) && (result as any).txHashes.length > 0) ||
            !!(result as any)?.txHash;

          if (sellSuccess) {
            // Refresh token balance after trade
            setTimeout(async () => {
              try {
                const trades = await getTradeActivityByUser(user.id.toString());
                const tokenTrades = trades.filter(
                  (trade: any) => trade.tokenAddress?.toLowerCase() === (token.mint || "").toLowerCase()
                );

                if (tokenTrades.length > 0) {
                  let bought = 0;
                  let sold = 0;

                  tokenTrades.forEach((trade: any) => {
                    if (trade.type === "Buy") {
                      bought += Number(trade.tokenAmount) || 0;
                    } else if (trade.type === "Sell") {
                      sold += Number(trade.tokenAmount) || 0;
                    }
                  });

                  const remaining = bought - sold;
                  setTokenBalance(Math.max(0, remaining));
                } else {
                  setTokenBalance(0);
                }
              } catch (error) {
                console.error('Error refreshing token balance:', error);
              }
            }, 2000);
            broadcastMonadQuickTrade(tokenAddress, 'sell');
            // Refresh header balance after successful sell
            setTimeout(() => {
              refreshBalance({ chain: "monad", force: true }).catch((err: any) => {
                console.warn('Failed to refresh balance:', err);
              });
            }, 1000);
          } else {
            toast.error('Sell failed. Please try again.', {
              duration: 5000,
              style: {
                background: "#1E1F26",
                color: "#E6E7EA",
                border: "1px solid #ff6b6b",
              },
            });
          }
        }
      } else {
        if (side === 'buy') {
          // Use Solana quick buy with PulseTable-style toast
          await runSolanaQuickBuyWithToast({ amount, toastPrefix: 'solana-slippage' });
        } else {
          // Keep executeEnhancedTrade for sell
          const currentSettings = presets[activePreset].quickSellSettings;
          const effectiveCurrentSettings = {
            ...currentSettings,
            maxSlippage: getEffectiveSlippage(currentSettings.maxSlippage, false),
          };
          await executeEnhancedTrade({
            token,
            amount: amount,
            side: 'sell',
            settings: effectiveCurrentSettings,
            user: { bearerToken: user.bearerToken, id: user.id },
            solBalance: Number(solBalance),
            solPriceUsd: 150,
            quoteCurrency,
            walletContext,
            refreshBalance,
            onSuccess: async (txHash, stats) => {
              setTimeout(async () => {
                try {
                  const trades = await getTradeActivityByUser(user.id.toString());
                  const tokenTrades = trades.filter(
                    (trade: any) => trade.tokenAddress?.toLowerCase() === (token.mint || "").toLowerCase()
                  );
                  if (tokenTrades.length > 0) {
                    let bought = 0;
                    let sold = 0;
                    tokenTrades.forEach((trade: any) => {
                      if (trade.type === "Buy") bought += Number(trade.tokenAmount) || 0;
                      else if (trade.type === "Sell") sold += Number(trade.tokenAmount) || 0;
                    });
                    setTokenBalance(Math.max(0, bought - sold));
                  } else {
                    setTokenBalance(0);
                  }
                  if (typeof window !== "undefined" && token.mint) {
                    window.dispatchEvent(new CustomEvent("solanaQuickTrade", { detail: { tokenAddress: token.mint } }));
                  }
                } catch (error) {
                  console.error('Error refreshing token balance:', error);
                }
              }, 2000);
            },
            onError: (error) => {
              console.error("❌ Enhanced Trade failed:", error);
            },
            onWarning: (warnings) => {
              console.warn("⚠️ Pre-transaction warnings:", warnings);
            },
          });
        }
      }
    } catch (error) {
      console.error("Trade error:", error);
    } finally {
      setIsLoading(false);
      setPendingTradeOptions(null);
    }
  }, [pendingTradeOptions, token, user, solBalance, presets, activePreset, isMonad]);

  const handleSlippageWarningCancel = useCallback(() => {
    setShowSlippageWarning(false);
    setPendingTradeOptions(null);
    setIsLoading(false);
  }, []);

  const handleLiquidityWarningContinue = useCallback(async () => {
    setShowLiquidityWarning(false);
    if (!pendingTradeOptions || !token || !user) return;
    
    setIsLoading(true);
    const { amount } = pendingTradeOptions;
    const tokenImage = token ? getResolvedTokenImage(token as any) : null;
    const tokenName = token?.name || token?.symbol || '';
    
    const currentSettings = presets[activePreset].quickBuySettings;
    
    // Check slippage warning (same as TradeActionPanel)
    const slippagePercent = getEffectiveSlippage(currentSettings.maxSlippage, true) * 100;
    if (slippagePercent >= HIGH_SLIPPAGE_WARNING_THRESHOLD) {
      setPendingTradeOptions({ ...pendingTradeOptions, skipLiquidity: true, skipSlippage: false });
      setShowSlippageWarning(true);
      setIsLoading(false);
      return;
    }
    
    try {
      if (isMonad) {
        // Use Monad buy API for Monad tokens
        const launchpad = getLaunchpad();
        const tokenAddress = token.mint; // Monad uses mint address (0x format)
        const maxSlippage = getEffectiveSlippage(currentSettings.maxSlippage, true);
        const gasPrice = currentSettings.priority ? currentSettings.priority * 1e9 : undefined; // Convert SOL to gwei
        
        const buyResult = await runMonadBuyWithToast({
          tokenAddress,
          amountMON: amount,
          launchpad,
          slippage: maxSlippage * 100, // Convert to percentage (0.15 -> 15)
          gasPrice,
          tokenImage,
          tokenName,
          toastPrefix: 'monad-liquidity',
        });

        if (buyResult?.success) {
          // Refresh token balance after trade
          setTimeout(async () => {
            try {
              const trades = await getTradeActivityByUser(user.id.toString());
              const tokenTrades = trades.filter(
                (trade: any) => trade.tokenAddress?.toLowerCase() === (token.mint || "").toLowerCase()
              );

              if (tokenTrades.length > 0) {
                let bought = 0;
                let sold = 0;

                tokenTrades.forEach((trade: any) => {
                  if (trade.type === "Buy") {
                    bought += Number(trade.tokenAmount) || 0;
                  } else if (trade.type === "Sell") {
                    sold += Number(trade.tokenAmount) || 0;
                  }
                });

                const remaining = bought - sold;
                setTokenBalance(Math.max(0, remaining));
              } else {
                setTokenBalance(0);
              }
            } catch (error) {
              console.error('Error refreshing token balance:', error);
            }
          }, 2000);
          broadcastMonadQuickTrade(tokenAddress, 'buy');
          setTimeout(() => {
            refreshBalance({ chain: "monad", force: true }).catch((err: any) => {
              console.warn('Failed to refresh balance:', err);
            });
          }, 1000);
        }
      } else {
        // Use Solana quick buy with PulseTable-style toast
        await runSolanaQuickBuyWithToast({ amount, toastPrefix: 'solana-liquidity' });
      }
    } catch (error) {
      console.error("Trade error:", error);
    } finally {
      setIsLoading(false);
      setPendingTradeOptions(null);
    }
  }, [pendingTradeOptions, token, user, solBalance, presets, activePreset]);

  const handleLiquidityWarningCancel = useCallback(() => {
    setShowLiquidityWarning(false);
    setPendingTradeOptions(null);
    setIsLoading(false);
  }, []);

  if (!isOpen) return null;

  const displaySellPercentage = hoverSellPercentage ?? activeSellPercentage ?? 0;
  const tokensToSell =
    tokenBalance > 0 && displaySellPercentage > 0
      ? (tokenBalance * displaySellPercentage) / 100
      : 0;

  const tokenPriceUsd = token?.usd_price || 0;
  const solPrice = typeof token?.sol_price === 'number' ? token.sol_price : 0;
  const tokenValueUsd = tokensToSell * tokenPriceUsd;
  const solValue = tokensToSell * solPrice;
  const SOL_LOGO_URL = "/solana.png";
  // Matches the USDC logo URL used in ConvertPanel.
  const USDC_LOGO_URL = "https://assets.coingecko.com/coins/images/6319/small/usdc.png";
  const MONAD_LOGO_URL = "https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1";
  const LOGO_URL = isMonad ? MONAD_LOGO_URL : SOL_LOGO_URL;
  const LOGO_ALT = isMonad ? "Monad" : "Solana";

  // Buy-amount currency display. On Solana the spend currency follows the
  // active quoteCurrency (USDC vs SOL); Monad always spends MON. The SOL path
  // resolves to the same logo/label as before, so it is unchanged.
  const isUsdcQuote = !isMonad && quoteCurrency === "USDC";
  const buyCurrencyLogoUrl = isUsdcQuote ? USDC_LOGO_URL : LOGO_URL;
  const buyCurrencyLabel = isMonad ? "MON" : quoteCurrency;
  // Sell proceeds currency: USDC mode shows the USDC logo + USD-denominated value
  // (USDC ≈ $1); otherwise the SOL/MON logo + native value. Unchanged for SOL/Monad.
  const sellProceedsLogoUrl = isUsdcQuote ? USDC_LOGO_URL : LOGO_URL;
  const sellProceedsLogoAlt = isUsdcQuote ? "USDC" : LOGO_ALT;
  const sellProceedsValue = isUsdcQuote ? tokenValueUsd : solValue;

  // Wallet balance shown for the spend currency. For USDC prefer the primary
  // wallet's per-wallet USDC balance (keyed by solana address), falling back to
  // the SPL trade-funding balance; for SOL show the header SOL balance
  // (existing behavior, unchanged).
  const primarySolanaAddress =
    primaryWalletAddresses?.solana ||
    walletList?.find((w) => w.isPrimary)?.solanaAddress ||
    walletList?.[0]?.solanaAddress ||
    "";
  const primaryWalletUsdc = primarySolanaAddress
    ? walletUsdcBalances[primarySolanaAddress]
    : undefined;
  const buyWalletBalance = isUsdcQuote
    ? typeof primaryWalletUsdc === "number"
      ? primaryWalletUsdc
      : usdcSplBalance
    : Number(solBalance) || 0;

  // Render warning dialogs using React Portal at body level to ensure they're above everything
  const warningDialogsPortal = typeof document !== 'undefined' && document.body ? (
    <>
      {showSlippageWarning &&
        createPortal(
          <HighSlippageWarningDialog
            isOpen={showSlippageWarning}
            slippagePercent={
              pendingTradeOptions?.side === 'sell'
                ? getEffectiveSlippage(presets[activePreset].quickSellSettings.maxSlippage, false) * 100
                : getEffectiveSlippage(presets[activePreset].quickBuySettings.maxSlippage, true) * 100
            }
            onContinue={handleSlippageWarningContinue}
            onCancel={handleSlippageWarningCancel}
          />,
          document.body
        )}
      {/* Low liquidity warning dialog disabled
      {showLiquidityWarning &&
        createPortal(
          <LowLiquidityWarningDialog
            isOpen={showLiquidityWarning}
            liquidityUsd={Number(liquidityUsd) || 0}
            thresholdUsd={LOW_LIQUIDITY_WARNING_THRESHOLD}
            onContinue={handleLiquidityWarningContinue}
            onCancel={handleLiquidityWarningCancel}
          />,
          document.body
        )} */}
    </>
  ) : null;

  return (
    <>
      <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Modal - no backdrop blocking */}
      <div
        ref={modalRef}
        className="fixed border border-[#2A2B33] rounded-lg shadow-2xl pointer-events-auto z-10 transition-opacity duration-150"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          minWidth: '400px',
          maxWidth: '500px',
          backgroundColor: isDragging ? 'rgba(16, 17, 20, 0.85)' : '#101114',
          cursor: isDragging ? 'grabbing' : 'default',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
        }}
      >
        {/* Header - Draggable */}
        <div
          ref={headerRef}
          className="flex items-center justify-between px-4 py-3 border-b border-[#2A2B33] select-none"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onPointerDown={handlePointerDown}
        >
          <div className="flex items-center gap-2">
            {/* Grid icon */}
            <div className="w-4 h-4 grid grid-cols-3 gap-0.5">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="w-0.5 h-0.5 bg-[#9CA3AF] rounded" />
              ))}
            </div>

            {/* Preset buttons */}
            {!isMonad && (
              <div className="flex items-center gap-1 ml-2">
                {['P1', 'P2', 'P3'].map((preset, idx) => (
                  <button
                    key={preset}
                    className={`px-2 py-0.5 text-xs font-semibold rounded ${
                      activePreset === idx ? 'text-white bg-[#2A2B33]' : 'text-[#9CA3AF] hover:text-white'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActivePreset(idx);
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}

            {/* Edit button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (editingPresets) {
                  commitPresetDrafts();
                } else {
                  setEditingPresets(true);
                  setPresetDrafts(buyPresets.map(String));
                }
              }}
              className="ml-2 p-1 text-[#9CA3AF] hover:text-white"
            >
              {editingPresets ? <LuCheck className="w-3 h-3" /> : <LuPencil className="w-3 h-3" />}
            </button>
          </div>

          {/* Right side header buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1 text-[#9CA3AF] hover:text-white"
            >
              <FaTimes className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Buy Section */}
        <div className="px-4 py-4 border-b border-[#2A2B33]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Buy</span>
              <img
                src={buyCurrencyLogoUrl}
                alt={buyCurrencyLabel}
                className={`w-4 h-4 opacity-90 ${isMonad ? 'rounded-full object-cover' : ''}`}
              />
              {token && (
                <span 
                  className="text-xs text-[#9CA3AF] tabular-nums"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                >
                  {token.usd_price ? `$${token.usd_price.toFixed(6)}` : 'N/A'}
                </span>
              )}
            </div>
            {isUsdcQuote && (
              <div className="flex items-center gap-1 text-xs text-[#9CA3AF]">
                <img
                  src={buyCurrencyLogoUrl}
                  alt={buyCurrencyLabel}
                  className="w-3.5 h-3.5 opacity-90"
                />
                <span 
                  className="text-[#E6E7EA] tabular-nums"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                >
                  {formatSmartNumber(buyWalletBalance)} {buyCurrencyLabel}
                </span>
              </div>
            )}
          </div>

          {/* Buy preset buttons */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {buyPresets.map((preset, idx) => {
              if (editingPresets) {
                return (
                  <input
                    key={idx}
                    type="text"
                    inputMode="decimal"
                    className="h-9 bg-[#101114] border border-[#70E0B0] text-[#70E0B0] text-sm font-semibold rounded-lg px-2 text-center focus:outline-none focus:ring-1 focus:ring-[#70E0B0] tabular-nums"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                    value={presetDrafts[idx] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.replace(/,/g, ".");
                      if (allowDecimal(v)) {
                        setPresetDrafts((d) => d.map((x, i) => (i === idx ? v : x)));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitPresetDrafts();
                      }
                    }}
                  />
                );
              }
              return (
                <button
                  key={idx}
                  onClick={() => handleQuickBuy(preset)}
                  className="px-3 py-2 bg-[#101114] border border-[#70E0B0] text-[#70E0B0] hover:bg-[#1E1F26] text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed tabular-nums"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                >
                  {preset}
                </button>
              );
            })}
          </div>

          {/* Buy section info */}
          <div className="flex items-center gap-4 text-xs text-[#9CA3AF]">
            <div className="flex items-center gap-1">
              <FaRunning className="w-3 h-3" />
              <span 
                className="tabular-nums"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
              >
                {(getEffectiveSlippage(presets[activePreset].quickBuySettings.maxSlippage, true) * 100).toFixed(0)}%
              </span>
            </div>
            {!isMonad && (
              <>
                <div className="flex items-center gap-1">
                  <FaGasPump className="w-3 h-3" />
                  <span>0.001</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 flex items-center justify-center">⚠</span>
                </div>
                <div className="flex items-center gap-1">
                  <FaEye className="w-3 h-3" />
                  <span>0.01</span>
                </div>
                <div className="flex items-center gap-1">
                  <FaBan className="w-3 h-3" />
                  <span>Off</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sell Section */}
        <div className="px-4 py-4 border-b border-[#2A2B33]">
          <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">Sell %</span>
            {token && (
              <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
                <span className="font-semibold text-white">{token.symbol || token.name}</span>
                <span 
                  className="text-[#E6E7EA] tabular-nums"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                >
                  {formatSmartNumber(tokensToSell)} {token.symbol || ''}
                </span>
                <span className="flex items-center gap-1">
                  <img
                    src={sellProceedsLogoUrl}
                    alt={sellProceedsLogoAlt}
                    className={`w-3.5 h-3.5 opacity-90 ${isMonad ? 'rounded-full object-cover' : ''}`}
                  />
                  <span 
                    className="text-[#E6E7EA] tabular-nums"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                  >
                    {formatSmartNumber(sellProceedsValue)}
                  </span>
                </span>
              </div>
            )}
            </div>
          </div>

          {/* Sell preset buttons */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {sellPresets.map((preset) => (
              <button
                key={preset}
                onMouseEnter={() => setHoverSellPercentage(preset)}
                onMouseLeave={() => setHoverSellPercentage(null)}
                onClick={() => {
                  setActiveSellPercentage(preset);
                  setHoverSellPercentage(null);
                  void handleQuickSell(preset);
                }}
                className="px-3 py-2 bg-[#101114] border border-[#FF4D7F] text-[#FF4D7F] hover:bg-[#1E1F26] text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed tabular-nums"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
              >
                {preset}%
              </button>
            ))}
          </div>

          {/* Show token amount to sell */}
          {displaySellPercentage > 0 && tokenBalance > 0 && tokensToSell > 0 && (
            <div className="mb-2 text-xs text-[#9CA3AF]">
              Selling: <span 
                className="tabular-nums"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
              >
                {formatSmartNumber(tokensToSell)} {token?.symbol || ''}
              </span>
              {tokenValueUsd > 0 && (
                <span 
                  className="tabular-nums"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                >
                  {` (~$${tokenValueUsd.toFixed(2)})`}
                </span>
              )}
            </div>
          )}

          {/* Sell section info */}
          <div className="flex items-center gap-4 text-xs text-[#9CA3AF]">
            <div className="flex items-center gap-1">
              <FaRunning className="w-3 h-3" />
              <span 
                className="tabular-nums"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
              >
                {(getEffectiveSlippage(presets[activePreset].quickSellSettings.maxSlippage, false) * 100).toFixed(0)}%
              </span>
            </div>
            {!isMonad && (
              <>
                <div className="flex items-center gap-1">
                  <FaGasPump className="w-3 h-3" />
                  <span>0.001</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 flex items-center justify-center">⚠</span>
                </div>
                <div className="flex items-center gap-1">
                  <FaEye className="w-3 h-3" />
                  <span>0.01</span>
                </div>
                <div className="flex items-center gap-1">
                  <FaBan className="w-3 h-3" />
                  <span>Off</span>
                </div>
              </>
            )}
            {/* <button className="ml-auto px-3 py-1 bg-[#FF4D7F] hover:bg-[#E63950] text-white text-xs font-semibold rounded transition-colors">
              Sell Init.
            </button> */}
          </div>
        </div>
      </div>
      </div>
      {warningDialogsPortal}
    </>
  );
};

export default InstantTradeModal;
