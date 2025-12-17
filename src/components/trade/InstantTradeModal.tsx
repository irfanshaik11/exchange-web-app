"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { FaTimes, FaRunning, FaGasPump, FaEye, FaBan, FaSpinner, FaCheckCircle, FaExternalLinkAlt } from 'react-icons/fa';
import { LuPencil, LuCheck } from 'react-icons/lu';
import { useUser } from '~/components/UserContext';
import { useQuickBuy } from '~/components/QuickBuyContext';
import { executeEnhancedTrade } from '~/utils/enhancedTradeHandler';
import { tradeMonadBuy, tradeMonadSell } from '~/utils/api';
import { getTradeActivityByUser } from '~/utils/functions';
import { formatSmartNumber } from '~/utils/db';
import { extractTokenImage } from '~/utils/images';
import HighSlippageWarningDialog from '../HighSlippageWarningDialog';
import LowLiquidityWarningDialog from '../LowLiquidityWarningDialog';
import type { Token } from '~/utils/db';
import toast from 'react-hot-toast';
import useMonadPositionWebSocket from '~/hooks/useMonadPositionWebSocket';

interface InstantTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: Token | null;
}

const LOW_LIQUIDITY_WARNING_THRESHOLD = 1_000; // USD
const HIGH_SLIPPAGE_WARNING_THRESHOLD = 50; // Percent

const InstantTradeModal: React.FC<InstantTradeModalProps> = ({ isOpen, onClose, token }) => {
  const router = useRouter();
  const { user, solBalance, refreshBalance } = useUser();
  const { presets, activePreset, setActivePreset } = useQuickBuy();
  
  // Check if we're on a Monad trade page
  const isMonad = router.pathname?.includes('/trade/monad/') || false;
  
  // Ref to track pending toast for WebSocket txHash update
  const pendingToastRef = useRef<{ id: string; tokenImage: string | null; tokenName: string; fakeTime: string; startTime: number; timerInterval?: NodeJS.Timeout } | null>(null);
  
  // Callback for instant txHash update via WebSocket (fires before HTTP response)
  const handleWsTxHash = useCallback((data: { txHash: string; tokenAddress: string; tradeType: 'buy' | 'sell'; explorerUrl: string }) => {
    const pending = pendingToastRef.current;
    if (!pending) return;
    
    console.log('[InstantTradeModal] 🚀 INSTANT txHash via WebSocket:', data.txHash);
    
    // Update the link element - wrap Monad logo in anchor to make clickable
    const linkEl = document.getElementById(`link-${pending.id}`);
    if (linkEl) {
      linkEl.innerHTML = `<a href="${data.explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
    }
    
    // Set duration for auto-dismiss after 10s
    setTimeout(() => {
      if (pendingToastRef.current?.id === pending.id) {
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
      } else {
        // For Solana, use existing keys
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
  const liquidityUsd = token?.total_liquidity_usd || (token as any)?.liquidityUsd || (token as any)?.total_liquidityUsd || 0;

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

  // Helper function to format user-friendly error messages (same as MonadTable)
  const formatMonadError = (error: string | undefined | null): string => {
    if (!error) return "Trade failed. Please try again.";
    
    const errorLower = error.toLowerCase();
    
    if (errorLower.includes('err_bonding_curve_library_invalid_inputs') || 
        errorLower.includes('bonding_curve_library_invalid_inputs')) {
      return "This token has no liquidity or has graduated to DEX. Try a different token.";
    }
    
    if (errorLower.includes('insufficient liquidity') || 
        errorLower.includes('expected output is 0') ||
        errorLower.includes('no liquidity')) {
      return "Insufficient liquidity. This token may not be available for trading.";
    }
    
    if (errorLower.includes('token does not exist') || 
        errorLower.includes('token may not exist')) {
      return "Token not found. Please check the token address.";
    }
    
    if (errorLower.includes('token has graduated') || 
        errorLower.includes('graduated to dex')) {
      return "This token has graduated to DEX. Trading on bonding curve is no longer available.";
    }
    
    if (errorLower.includes('insufficient balance') || 
        errorLower.includes('missing')) {
      return "Insufficient balance. Please check your wallet.";
    }
    
    return error;
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

    // Skip liquidity warning for Monad (same as MonadTable)
    if (!isMonad) {
    const liquidityValue = Number(liquidityUsd) || 0;
    const isLowLiquidity = liquidityValue <= 0 || liquidityValue < LOW_LIQUIDITY_WARNING_THRESHOLD;
    
      // Check liquidity warning (only for Solana)
    if (isLowLiquidity) {
      setPendingTradeOptions({ skipLiquidity: false, skipSlippage: false, amount, side: 'buy' });
      setShowLiquidityWarning(true);
      return;
      }
    }

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
        // Use Monad buy API - match MonadTable exactly
        const launchpad = getLaunchpad();
        const tokenAddress = token.mint; // Monad uses mint address (0x format)
        
        // Get slippage from preset or use default (15%) - same as MonadTable
        const slippage = settings?.maxSlippage ? settings.maxSlippage * 100 : 15;
        // Get gas price from preset (optional, undefined if not set) - same as MonadTable
        // Note: MonadTable uses gasPrice directly from settings, not converted from priority
        const gasPrice = settings?.gasPrice !== undefined && settings.gasPrice > 0 ? settings.gasPrice : undefined;
        
        // Get token image and name
        const tokenImage = token ? extractTokenImage(token as any) : null;
        const tokenName = token?.name || token?.symbol || '';
        
        // Generate unique toast ID and fake fast time (0.40-0.60s)
        const uniqueToastId = `monad-quickbuy-${Date.now()}`;
        const fakeTime = (Math.random() * 0.2 + 0.4).toFixed(2);
        const startTime = Date.now();
        
        // Random cap time between 0.40 and 0.60 seconds
        const timerCap = 0.40 + Math.random() * 0.20;
        let timerFinished = false;
        
        // Show initial loading toast with timer - checkmark hidden until timer finishes, link icon grayed out
        toast.custom(
          (t) => (
            <div className="flex items-center gap-2 bg-[#1a1b1e] text-white border border-white/10 rounded-lg px-4 py-3">
              <FaCheckCircle id={`check-${uniqueToastId}`} className="flex-shrink-0" size={16} style={{ color: '#31e3ac', display: 'none' }} />
              {tokenImage && (
                <img src={tokenImage} alt={tokenName} className="w-5 h-5 rounded-full object-cover flex-shrink-0" style={{ border: '1px solid rgba(255, 255, 255, 0.1)' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
              <span className="font-semibold text-sm" style={{ color: '#31e3ac' }}>Trade placed!</span>
              <span id={`timer-${uniqueToastId}`} className="text-[#9CA3AF] text-xs ml-1">(0.00s)</span>
              <span id={`link-${uniqueToastId}`} className="inline-flex items-center ml-1" style={{ display: 'none' }}>
                <img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" className="w-4 h-4 rounded-full" style={{ cursor: 'default' }} />
              </span>
            </div>
          ),
          { id: uniqueToastId, duration: Infinity }
        );
        
        // Start timer animation - update every 50ms, show checkmark when cap is reached
        const timerInterval = setInterval(() => {
          const elapsed = (Date.now() - startTime) / 1000;
          const displayTime = Math.min(elapsed, timerCap).toFixed(2);
          const timerEl = document.getElementById(`timer-${uniqueToastId}`);
          if (timerEl) {
            timerEl.textContent = `(${displayTime}s)`;
          }
          
          // When timer reaches cap, show checkmark and Monad logo
          if (!timerFinished && elapsed >= timerCap) {
            timerFinished = true;
            const checkEl = document.getElementById(`check-${uniqueToastId}`);
            if (checkEl) {
              checkEl.style.display = 'block';
            }
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              linkEl.style.display = 'inline-flex';
            }
          }
        }, 50);
        
        // Store pending toast info for WebSocket instant update (including timer)
        pendingToastRef.current = { id: uniqueToastId, tokenImage, tokenName, fakeTime: timerCap.toFixed(2), startTime, timerInterval };

        let result;
        try {
          console.log("📤 Calling tradeMonadBuy with params:", { tokenAddress, amountMON: requested, launchpad, slippage, gasPrice });
          result = await tradeMonadBuy(
            {
              tokenAddress,
              amountMON: requested,
              launchpad,
              slippage,
              gasPrice,
            },
            user.bearerToken
          );
          console.log("✅ Monad buy API response:", result);
          console.log("✅ Response check - success:", result?.success, "txHash:", result?.txHash);
        } catch (error: any) {
          console.error("❌ Monad buy API error:", error);
          const errorMessage = formatMonadError(error?.message || error?.error || "Trade failed. Please try again.");
          toast.error(errorMessage, { id: uniqueToastId, duration: 6000 });
          setIsLoading(false);
          return;
        }

        if (result && result.success && result.txHash) {
          console.log("✅ Trade successful, updating toast with txHash:", result.txHash);
          
          // Only update toast if WebSocket hasn't already handled it
          if (pendingToastRef.current?.id === uniqueToastId) {
            const explorerUrl = `https://monadvision.com/tx/${result.txHash}`;
            // Update the link element - wrap Monad logo in anchor to make clickable
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
            }
            // Auto-dismiss after 10s
            setTimeout(() => {
              toast.dismiss(uniqueToastId);
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
        } else {
          console.error("❌ Monad buy failed - result:", result);
          const errorMsg = formatMonadError((result as any)?.error || "Trade failed. Please try again.");
          toast.error(errorMsg, { id: uniqueToastId, duration: 6000 });
        }
        
        setIsLoading(false);
        return result;
      } else {
        // Use Solana enhanced trade handler for Solana tokens
    const effectiveSettings = {
      ...settings,
      maxSlippage: getEffectiveSlippage(settings.maxSlippage, true),
    };
    
    const result = await executeEnhancedTrade({
      token,
      amount: requested,
      side: 'buy',
      settings: effectiveSettings,
      user: { bearerToken: user.bearerToken, id: user.id },
      solBalance: Number(solBalance),
      solPriceUsd: 150,
      refreshBalance,
      onSuccess: async (txHash, stats) => {
        console.log("✅ Enhanced Trade successful:", { txHash, stats });
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
      },
      onError: (error) => {
        console.error("❌ Enhanced Trade failed:", error);
      },
      onWarning: (warnings) => {
        console.warn("⚠️ Pre-transaction warnings:", warnings);
      },
    });

    setIsLoading(false);
    return result;
      }
    } catch (error: any) {
      console.error("Trade error:", error);
      setIsLoading(false);
      throw error;
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
        const tokenImage = token ? extractTokenImage(token as any) : null;
        const tokenName = token?.name || token?.symbol || '';
        
        // Generate unique toast ID and fake fast time (0.40-0.60s)
        const uniqueSellToastId = `monad-sell-${Date.now()}`;
        const fakeTime = (Math.random() * 0.2 + 0.4).toFixed(2);
        const sellStartTime = Date.now();
        
        // Random cap time between 0.40 and 0.60 seconds
        const sellTimerCap = 0.40 + Math.random() * 0.20;
        let sellTimerFinished = false;
        
        // Show initial loading toast with timer - checkmark hidden until timer finishes, link icon grayed out
        toast.custom(
          (t) => (
            <div className="flex items-center gap-2 bg-[#1a1b1e] text-white border border-white/10 rounded-lg px-4 py-3">
              <FaCheckCircle id={`check-${uniqueSellToastId}`} className="flex-shrink-0" size={16} style={{ color: '#31e3ac', display: 'none' }} />
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
        
        // Store pending toast info for WebSocket instant update (including timer)
        pendingToastRef.current = { id: uniqueSellToastId, tokenImage, tokenName, fakeTime: sellTimerCap.toFixed(2), startTime: sellStartTime, timerInterval: sellTimerInterval };

        // Add timeout wrapper to prevent hanging
        const sellPromise = tradeMonadSell(
          {
            tokenAddress,
            launchpad,
            percentage: percentage,
            slippage: maxSlippage * 100,
            gasPrice: gasPrice,
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
        } else {
          toast.error(formatMonadError((result as any).error), { id: uniqueSellToastId, duration: 6000 });
          setIsLoading(false);
        }
        
        setIsLoading(false);
        return result;
      } else {
        // Use Solana enhanced trade handler for Solana tokens
    const effectiveSellSettings = {
      ...sellSettings,
      maxSlippage: getEffectiveSlippage(sellSettings.maxSlippage, false),
    };
    
    const result = await executeEnhancedTrade({
      token,
      amount: percentage,
      side: 'sell',
      settings: effectiveSellSettings,
      user: { bearerToken: user.bearerToken, id: user.id },
      solBalance: Number(solBalance),
      solPriceUsd: 150,
      refreshBalance,
      onSuccess: async (txHash, stats) => {
        console.log("✅ Enhanced Trade successful:", { txHash, stats });
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
      },
      onError: (error) => {
        console.error("❌ Enhanced Trade failed:", error);
      },
      onWarning: (warnings) => {
        console.warn("⚠️ Pre-transaction warnings:", warnings);
      },
    });

    setIsLoading(false);
    return result;
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
          const result = await tradeMonadBuy(
            {
              tokenAddress,
              amountMON: amount,
              launchpad,
              slippage: maxSlippage * 100, // Convert to percentage (0.15 -> 15)
              gasPrice: gasPrice,
            },
            user.bearerToken
          );
          
          if (result.success && result.txHash) {
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
          }
        } else {
          const result = await tradeMonadSell(
            {
              tokenAddress,
              launchpad,
              percentage: amount,
              slippage: maxSlippage * 100, // Convert to percentage (0.15 -> 15)
              gasPrice: gasPrice,
            },
            user.bearerToken
          );
          
          if (result.success && result.txHash) {
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
          }
        }
      } else {
        // Use Solana enhanced trade handler for Solana tokens
        const currentSettings = side === 'buy' 
          ? presets[activePreset].quickBuySettings 
          : presets[activePreset].quickSellSettings;
        
    const effectiveCurrentSettings = {
      ...currentSettings,
      maxSlippage: getEffectiveSlippage(currentSettings.maxSlippage, side === 'buy'),
    };
    
        await executeEnhancedTrade({
      token,
      amount: amount,
      side: side,
      settings: effectiveCurrentSettings,
          user: { bearerToken: user.bearerToken, id: user.id },
      solBalance: Number(solBalance),
      solPriceUsd: 150,
      refreshBalance,
      onSuccess: async (txHash, stats) => {
        console.log("✅ Enhanced Trade successful:", { txHash, stats });
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
      },
      onError: (error) => {
        console.error("❌ Enhanced Trade failed:", error);
      },
      onWarning: (warnings) => {
        console.warn("⚠️ Pre-transaction warnings:", warnings);
      },
        });
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
        
        const result = await tradeMonadBuy(
          {
            tokenAddress,
            amountMON: amount,
            launchpad,
            slippage: maxSlippage * 100, // Convert to percentage (0.15 -> 15)
            gasPrice: gasPrice,
          },
          user.bearerToken
        );
        
        if (result.success && result.txHash) {
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
        }
      } else {
        // Use Solana enhanced trade handler for Solana tokens
    const effectiveCurrentSettings = {
      ...currentSettings,
      maxSlippage: getEffectiveSlippage(currentSettings.maxSlippage, true),
    };
    
        await executeEnhancedTrade({
      token,
      amount: amount,
      side: 'buy',
      settings: effectiveCurrentSettings,
          user: { bearerToken: user.bearerToken, id: user.id },
      solBalance: Number(solBalance),
      solPriceUsd: 150,
      refreshBalance,
      onSuccess: async (txHash, stats) => {
        console.log("✅ Enhanced Trade successful:", { txHash, stats });
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
      },
      onError: (error) => {
        console.error("❌ Enhanced Trade failed:", error);
      },
      onWarning: (warnings) => {
        console.warn("⚠️ Pre-transaction warnings:", warnings);
      },
        });
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
  const SOL_LOGO_URL = "https://axiom.trade/images/sol-fill.svg";
  const MONAD_LOGO_URL = "https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1";
  const LOGO_URL = isMonad ? MONAD_LOGO_URL : SOL_LOGO_URL;
  const LOGO_ALT = isMonad ? "Monad" : "Solana";

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
        )}
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
                src={LOGO_URL}
                alt={LOGO_ALT}
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
                  onClick={() => !isLoading && handleQuickBuy(preset)}
                  disabled={isLoading}
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
                    src={LOGO_URL}
                    alt={LOGO_ALT}
                    className={`w-3.5 h-3.5 opacity-90 ${isMonad ? 'rounded-full object-cover' : ''}`}
                  />
                  <span 
                    className="text-[#E6E7EA] tabular-nums"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                  >
                    {formatSmartNumber(solValue)}
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
                  if (!isLoading) {
                    void handleQuickSell(preset);
                  }
                }}
                disabled={isLoading}
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
