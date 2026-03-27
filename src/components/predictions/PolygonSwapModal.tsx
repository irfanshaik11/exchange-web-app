// src/components/predictions/PolygonSwapModal.tsx
// Swap modal for Polygon tokens: USDC ↔ USDC.e ↔ MATIC

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineSwitchVertical, HiX } from 'react-icons/hi';
import { polygonSwap, type PolygonSwapToken, type PolymarketBalance } from '~/utils/api';
import { createPolymarketTradeToast } from '~/utils/tradeToast';

// ---------------------------------------------------------------------------
// Token config
// ---------------------------------------------------------------------------

const USDC_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/c/ca/USD_Coin_logo_%28cropped%29.png';
const MATIC_LOGO = 'https://polygonscan.com/assets/poly/images/svg/logos/token-light.svg?v=26.3.2.0';

interface TokenInfo {
  id: PolygonSwapToken;
  label: string;
  sublabel: string;
  logo: string;
  showBadge?: string; // small badge text overlay on logo
  getBalance: (b: PolymarketBalance) => number;
  formatAmount: (n: number) => string;
}

const TOKENS: TokenInfo[] = [
  {
    id: 'usdce',
    label: 'USDC.e',
    sublabel: 'Bridged',
    logo: USDC_LOGO,
    showBadge: 'e',
    getBalance: (b) => b.usdcBridged ?? 0,
    formatAmount: (n) => `$${n.toFixed(2)}`,
  },
  {
    id: 'usdc',
    label: 'USDC',
    sublabel: 'Native',
    logo: USDC_LOGO,
    getBalance: (b) => b.usdcNative ?? 0,
    formatAmount: (n) => `$${n.toFixed(2)}`,
  },
  {
    id: 'matic',
    label: 'MATIC',
    sublabel: 'Polygon',
    logo: MATIC_LOGO,
    getBalance: (b) => b.matic ?? 0,
    formatAmount: (n) => `${n.toFixed(4)} MATIC`,
  },
];

const getToken = (id: PolygonSwapToken): TokenInfo => TOKENS.find(t => t.id === id)!;

// ---------------------------------------------------------------------------
// Token Logo with optional badge
// ---------------------------------------------------------------------------

function TokenLogo({ token, size = 28 }: { token: TokenInfo; size?: number }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <img
        src={token.logo}
        alt={token.label}
        className="rounded-full"
        style={{ width: size, height: size }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      {token.showBadge && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full text-white font-bold"
          style={{
            width: size * 0.43,
            height: size * 0.43,
            fontSize: size * 0.28,
            backgroundColor: '#8247E5',
            border: '1.5px solid #0a0b10',
          }}
        >
          {token.showBadge}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Token Selector Dropdown
// ---------------------------------------------------------------------------

function TokenSelector({
  selected,
  onChange,
  exclude,
  dropUp = false,
}: {
  selected: PolygonSwapToken;
  onChange: (id: PolygonSwapToken) => void;
  exclude: PolygonSwapToken;
  dropUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const token = getToken(selected);
  // Show all tokens except the currently selected one — if user picks the other side's token, they swap
  const options = TOKENS.filter(t => t.id !== selected);

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors hover:bg-white/5"
        style={{ border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <TokenLogo token={token} size={18} />
        <span className="text-[12px] font-semibold text-white">{token.label}</span>
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" className="text-neutral-500">
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[99999]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[100000] rounded-md overflow-hidden"
            style={{
              backgroundColor: '#16171e',
              border: '1px solid rgba(255,255,255,0.1)',
              minWidth: 140,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              ...(dropUp ? { bottom: 'auto' } : {}),
            }}
            ref={(el) => {
              if (!el) return;
              const btn = el.previousElementSibling?.previousElementSibling as HTMLElement;
              if (!btn) return;
              const rect = btn.getBoundingClientRect();
              if (dropUp) {
                el.style.bottom = `${window.innerHeight - rect.top + 4}px`;
                el.style.right = `${window.innerWidth - rect.right}px`;
              } else {
                el.style.top = `${rect.bottom + 4}px`;
                el.style.right = `${window.innerWidth - rect.right}px`;
              }
            }}
          >
            {options.map((t) => (
              <button
                key={t.id}
                onClick={() => { onChange(t.id); setOpen(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-white/5"
              >
                <TokenLogo token={t} size={16} />
                <div>
                  <div className="text-[12px] font-medium text-white">{t.label}</div>
                  <div className="text-[9px] text-neutral-500">{t.sublabel}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------

interface PolygonSwapModalProps {
  open: boolean;
  onClose: () => void;
  balance: PolymarketBalance | null;
  authToken?: string;
  onBalanceUpdate?: (balance: PolymarketBalance) => void;
}

export default function PolygonSwapModal({
  open,
  onClose,
  balance,
  authToken,
  onBalanceUpdate,
}: PolygonSwapModalProps) {
  const [fromToken, setFromToken] = useState<PolygonSwapToken>('usdce');
  const [toToken, setToToken] = useState<PolygonSwapToken>('usdc');
  const [amount, setAmount] = useState('');
  const [isSwapping, setIsSwapping] = useState(false);

  const fromInfo = getToken(fromToken);
  const toInfo = getToken(toToken);
  const fromBalance = balance ? fromInfo.getBalance(balance) : 0;

  const parsedAmount = parseFloat(amount) || 0;
  const isStablePair = fromToken !== 'matic' && toToken !== 'matic';
  const estimatedOutput = isStablePair
    ? (parsedAmount * 0.9999).toFixed(4) // ~1:1 for stablecoins
    : null; // Can't estimate MATIC pairs without price

  const canSwap = useMemo(() => {
    if (!authToken || isSwapping) return false;
    if (parsedAmount <= 0) return false;
    if (parsedAmount > fromBalance) return false;
    if (fromToken === 'matic' && parsedAmount > fromBalance - 0.01) return false; // Gas reserve
    return true;
  }, [authToken, isSwapping, parsedAmount, fromBalance, fromToken]);

  const handleSwapDirection = useCallback(() => {
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount('');
  }, [fromToken, toToken]);

  const handleMax = useCallback(() => {
    let maxAmount = fromBalance;
    if (fromToken === 'matic') {
      maxAmount = Math.max(0, fromBalance - 0.01); // Reserve gas
    }
    setAmount(fromToken === 'matic' ? maxAmount.toFixed(4) : maxAmount.toFixed(2));
  }, [fromBalance, fromToken]);

  const handleSwap = useCallback(async () => {
    if (!canSwap || !authToken) return;
    setIsSwapping(true);

    const swapToast = createPolymarketTradeToast({
      label: `Swapping ${amount} ${fromInfo.label} to ${toInfo.label}...`,
      tokenName: fromInfo.label,
    });

    try {
      const result = await polygonSwap(authToken, fromToken, toToken, parsedAmount);
      if (result.success) {
        onBalanceUpdate?.(result.data.balances);
        swapToast.complete(
          `Swapped ${result.data.amountInFormatted} to ${result.data.amountOutFormatted}`,
          result.data.txHash,
        );
        window.dispatchEvent(new Event('polygon-balance-refresh'));
        setAmount('');
        onClose();
      }
    } catch (err: any) {
      swapToast.error(err.message || 'Swap failed');
    } finally {
      setIsSwapping(false);
    }
  }, [canSwap, authToken, amount, fromInfo, toInfo, fromToken, toToken, parsedAmount, onBalanceUpdate, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ zIndex: 9999999, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-[320px] rounded-xl"
        style={{
          backgroundColor: '#0c0d12',
          border: '1px solid rgba(130, 71, 229, 0.15)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent */}
        <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, #8247E5, transparent)' }} />

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h3 className="text-[13px] font-semibold text-white">Swap</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-white/5">
            <HiX className="w-3.5 h-3.5 text-neutral-500" />
          </button>
        </div>

        <div className="px-4 pb-4 space-y-2">
          {/* FROM */}
          <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">From</span>
              <button onClick={handleMax} className="text-[10px] font-medium hover:text-white" style={{ color: '#A78BFA' }}>
                {fromToken === 'matic' ? fromBalance.toFixed(4) : `$${fromBalance.toFixed(2)}`}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent text-[16px] font-semibold text-white outline-none placeholder-neutral-600 min-w-0"
                style={{ fontVariantNumeric: 'tabular-nums' }}
                min="0"
                step="any"
              />
              <button
                onClick={handleMax}
                className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-colors hover:bg-white/10"
                style={{ color: '#A78BFA', border: '1px solid rgba(167,139,250,0.2)' }}
              >
                Max
              </button>
              <TokenSelector
                selected={fromToken}
                onChange={(id) => { setFromToken(id); if (id === toToken) setToToken(fromToken); }}
                exclude={toToken}
              />
            </div>
          </div>

          {/* Swap Direction */}
          <div className="flex justify-center -my-0.5 relative z-10">
            <button
              onClick={handleSwapDirection}
              className="p-1.5 rounded-lg transition-all hover:bg-white/5 active:scale-90"
              style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#0c0d12' }}
            >
              <HiOutlineSwitchVertical className="w-3.5 h-3.5" style={{ color: '#A78BFA' }} />
            </button>
          </div>

          {/* TO */}
          <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">To (est.)</span>
              <span className="text-[10px] text-neutral-600">
                {toToken === 'matic'
                  ? (balance?.matic ?? 0).toFixed(4)
                  : `$${(balance ? getToken(toToken).getBalance(balance) : 0).toFixed(2)}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 text-[16px] font-semibold text-neutral-500 min-w-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {parsedAmount > 0 ? (estimatedOutput ?? '~') : '0.00'}
              </div>
              <TokenSelector
                selected={toToken}
                onChange={(id) => { setToToken(id); if (id === fromToken) setFromToken(toToken); }}
                exclude={fromToken}
                dropUp
              />
            </div>
          </div>

          {/* Rate info */}
          {isStablePair && parsedAmount > 0 && (
            <div className="text-[10px] text-neutral-600 text-center">
              1 {fromInfo.label} ≈ 1 {toInfo.label}
            </div>
          )}

          {/* Warnings */}
          {parsedAmount > 0 && parsedAmount > fromBalance && (
            <div className="px-2.5 py-1.5 rounded-md text-[10px] text-center" style={{ backgroundColor: 'rgba(248,113,113,0.08)', color: '#F87171' }}>
              Insufficient {fromInfo.label} balance
            </div>
          )}
          {fromToken === 'matic' && parsedAmount > 0 && parsedAmount > fromBalance - 0.01 && parsedAmount <= fromBalance && (
            <div className="px-2.5 py-1.5 rounded-md text-[10px] text-center" style={{ backgroundColor: 'rgba(251,191,36,0.08)', color: '#FBBF24' }}>
              Reserve 0.01 MATIC for gas
            </div>
          )}

          {/* Swap Button */}
          <button
            onClick={handleSwap}
            disabled={!canSwap}
            className="w-full py-2.5 rounded-lg text-[13px] font-semibold transition-all active:scale-[0.98]"
            style={{
              background: canSwap ? 'linear-gradient(135deg, #8247E5, #A78BFA)' : 'rgba(255,255,255,0.04)',
              color: canSwap ? '#fff' : '#4b5563',
              opacity: isSwapping ? 0.6 : 1,
            }}
          >
            {isSwapping ? 'Swapping...' : parsedAmount <= 0 ? 'Enter amount' : !canSwap ? 'Insufficient balance' : 'Swap'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
