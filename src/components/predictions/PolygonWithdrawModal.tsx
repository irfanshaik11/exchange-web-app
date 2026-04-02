// src/components/predictions/PolygonWithdrawModal.tsx
// Modal for withdrawing USDC.e, native USDC, or MATIC from Polygon wallet with history tab

import React, { useState, useCallback, useEffect } from 'react';
import { BiX, BiLinkExternal, BiTime, BiCheck, BiError } from 'react-icons/bi';
import { SiPolygon } from 'react-icons/si';
import { HiOutlineExclamationCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useUser } from '../UserContext';
import {
  withdrawPolygonUsdce,
  withdrawPolygonMatic,
  getPolygonWithdrawalHistory,
  type PolymarketBalance,
  type PolygonWithdrawalRecord,
} from '~/utils/api';
import { createPolymarketTradeToast } from '~/utils/tradeToast';

type Tab = 'withdraw' | 'history';
type Asset = 'usdce' | 'usdc' | 'matic';

// Token logos
const USDC_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/c/ca/USD_Coin_logo_%28cropped%29.png';
const MATIC_LOGO = 'https://polygonscan.com/assets/poly/images/svg/logos/token-light.svg?v=26.3.2.0';

interface AssetInfo {
  id: Asset;
  label: string;
  sublabel: string;
  logo: string;
  showBadge?: string;
  getBalance: (b: PolymarketBalance) => number;
  minWithdrawal: number;
  decimals: number;
  formatAmount: (n: number) => string;
}

const ASSETS: AssetInfo[] = [
  {
    id: 'usdce',
    label: 'USDC.e',
    sublabel: 'Polymarket',
    logo: USDC_LOGO,
    showBadge: 'e',
    getBalance: (b) => b.usdcBridged ?? 0,
    minWithdrawal: 0.5,
    decimals: 2,
    formatAmount: (n) => `$${n.toFixed(2)}`,
  },
  {
    id: 'usdc',
    label: 'USDC',
    sublabel: 'AI Markets',
    logo: USDC_LOGO,
    getBalance: (b) => b.usdcNative ?? 0,
    minWithdrawal: 0.5,
    decimals: 2,
    formatAmount: (n) => `$${n.toFixed(2)}`,
  },
  {
    id: 'matic',
    label: 'MATIC',
    sublabel: 'Polygon',
    logo: MATIC_LOGO,
    getBalance: (b) => b.matic ?? 0,
    minWithdrawal: 0.001,
    decimals: 4,
    formatAmount: (n) => `${n.toFixed(4)} MATIC`,
  },
];

const getAsset = (id: Asset): AssetInfo => ASSETS.find(a => a.id === id)!;

// Token logo with optional badge (matching PolygonSwapModal pattern)
function TokenLogo({ asset, size = 20 }: { asset: AssetInfo; size?: number }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <img
        src={asset.logo}
        alt={asset.label}
        className="rounded-full"
        style={{ width: size, height: size }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      {asset.showBadge && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full text-white font-bold"
          style={{
            width: size * 0.43,
            height: size * 0.43,
            fontSize: size * 0.28,
            backgroundColor: '#8247E5',
            border: '1.5px solid #131417',
          }}
        >
          {asset.showBadge}
        </span>
      )}
    </div>
  );
}

interface PolygonWithdrawModalProps {
  open: boolean;
  onClose: () => void;
  balance: PolymarketBalance | null;
  onBalanceUpdate?: (balance: PolymarketBalance) => void;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function PolygonWithdrawModal({
  open,
  onClose,
  balance,
  onBalanceUpdate,
}: PolygonWithdrawModalProps) {
  const { user } = useUser();
  const [tab, setTab] = useState<Tab>('withdraw');
  const [asset, setAsset] = useState<Asset>('usdce');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // History state
  const [history, setHistory] = useState<PolygonWithdrawalRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const currentAsset = getAsset(asset);
  const availableBalance = balance ? currentAsset.getBalance(balance) : 0;
  const assetLabel = currentAsset.label;
  const assetDecimals = currentAsset.decimals;
  const minWithdrawal = currentAsset.minWithdrawal;

  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(destinationAddress);
  const parsedAmount = parseFloat(amount);
  const isValidAmount =
    !isNaN(parsedAmount) && parsedAmount >= minWithdrawal && parsedAmount <= availableBalance;

  const canSubmit = isValidAddress && isValidAmount && !isSubmitting;

  // Reset amount when switching assets
  useEffect(() => {
    setAmount('');
  }, [asset]);

  // Fetch history when switching to history tab
  useEffect(() => {
    if (tab === 'history' && open && user?.bearerToken) {
      setHistoryLoading(true);
      getPolygonWithdrawalHistory(user.bearerToken)
        .then((res) => {
          if (res.success) setHistory(res.data);
        })
        .catch(() => {})
        .finally(() => setHistoryLoading(false));
    }
  }, [tab, open, user?.bearerToken]);

  const handleMaxClick = useCallback(() => {
    if (asset === 'matic') {
      // Reserve a small amount for gas if withdrawing MATIC
      const reserved = 0.01;
      const max = Math.max(0, availableBalance - reserved);
      setAmount(max.toFixed(assetDecimals));
    } else {
      setAmount(availableBalance.toFixed(assetDecimals));
    }
  }, [availableBalance, asset, assetDecimals]);

  const handleSubmit = async () => {
    if (!user?.bearerToken || !canSubmit) return;

    const withdrawAmt = parsedAmount;
    setIsSubmitting(true);

    const tradeToast = createPolymarketTradeToast({
      label: asset === 'matic'
        ? `Withdrawing ${withdrawAmt.toFixed(assetDecimals)} MATIC...`
        : `Withdrawing $${withdrawAmt.toFixed(2)} ${assetLabel}...`,
      tokenName: assetLabel,
    });

    try {
      if (asset === 'usdce' || asset === 'usdc') {
        const result = await withdrawPolygonUsdce(
          { destinationAddress, amount: withdrawAmt, token: asset },
          user.bearerToken,
        );

        if (result.success) {
          if (result.data.balances && onBalanceUpdate) {
            onBalanceUpdate(result.data.balances);
          }
          setDestinationAddress('');
          setAmount('');
          tradeToast.complete(
            `Withdrew $${withdrawAmt.toFixed(2)} ${assetLabel}`,
            result.data.txHash,
          );
          onClose();
        }
      } else {
        const result = await withdrawPolygonMatic(
          { destinationAddress, amount: withdrawAmt },
          user.bearerToken,
        );

        setDestinationAddress('');
        setAmount('');
        tradeToast.complete(
          `Withdrew ${withdrawAmt.toFixed(assetDecimals)} MATIC`,
          result.txHash,
        );
        // Trigger a balance refresh event so the header picks it up
        window.dispatchEvent(new Event('polygon-balance-refresh'));
        onClose();
      }
    } catch (error: any) {
      const msg = error?.message || 'Withdrawal failed';
      tradeToast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999999] flex items-center justify-center p-4"
      onClick={handleClose}
    >
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-[360px] overflow-hidden rounded-2xl shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, #1c1d22 0%, #131417 100%)',
          border: '1px solid rgba(130, 71, 229, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent line */}
        <div
          className="h-[2px] w-full"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, #8247E5 50%, transparent 100%)',
          }}
        />

        <div className="p-5">
          {/* Header */}
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: 'rgba(130, 71, 229, 0.15)' }}
              >
                <SiPolygon className="h-4 w-4" style={{ color: '#8247E5' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {tab === 'withdraw' ? 'Withdraw' : 'History'}
                </h3>
                <p className="text-[11px] text-neutral-500">Polygon Network</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            >
              <BiX className="h-4 w-4 text-neutral-400" />
            </button>
          </div>

          {/* Tabs */}
          <div
            className="mb-5 flex gap-1 rounded-xl p-1"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            {(['withdraw', 'history'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 cursor-pointer rounded-lg py-2 text-xs font-medium capitalize transition-all"
                style={{
                  background: tab === t
                    ? 'linear-gradient(135deg, #8247E5 0%, #6C3BD0 100%)'
                    : 'transparent',
                  color: tab === t ? '#fff' : '#6b7280',
                  boxShadow: tab === t ? '0 2px 8px rgba(130, 71, 229, 0.3)' : 'none',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* -- Withdraw Tab -- */}
          {tab === 'withdraw' && (
            <>
              <div className="space-y-4">
                  {/* Asset Selector — three tokens with proper icons */}
                  <div
                    className="flex gap-1 rounded-xl p-1"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                  >
                    {ASSETS.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setAsset(a.id)}
                        className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all"
                        style={{
                          background: asset === a.id
                            ? 'rgba(130, 71, 229, 0.2)'
                            : 'transparent',
                          color: asset === a.id ? '#a78bfa' : '#6b7280',
                          border: asset === a.id
                            ? '1px solid rgba(130, 71, 229, 0.3)'
                            : '1px solid transparent',
                        }}
                      >
                        <TokenLogo asset={a} size={16} />
                        {a.label}
                      </button>
                    ))}
                  </div>

                  {/* Balance Card */}
                  <div
                    className="rounded-xl p-4"
                    style={{
                      background: 'rgba(130, 71, 229, 0.06)',
                      border: '1px solid rgba(130, 71, 229, 0.12)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                          Available
                        </p>
                        <p className="text-2xl font-bold text-white">
                          {asset !== 'matic' ? '$' : ''}{availableBalance.toFixed(assetDecimals)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1" style={{ background: 'rgba(130, 71, 229, 0.15)' }}>
                        <TokenLogo asset={currentAsset} size={14} />
                        <span className="text-[11px] font-semibold" style={{ color: '#a78bfa' }}>{assetLabel}</span>
                      </div>
                    </div>
                  </div>

                  {/* Destination Address */}
                  <div>
                    <label className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                        Destination
                      </span>
                      {destinationAddress && isValidAddress && (
                        <span className="text-[10px] text-emerald-400">Valid</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={destinationAddress}
                      onChange={(e) => setDestinationAddress(e.target.value.trim())}
                      placeholder="0x..."
                      disabled={isSubmitting}
                      className="w-full rounded-xl px-4 py-3 font-mono text-sm text-white placeholder-neutral-600 outline-none transition-all"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${
                          destinationAddress
                            ? isValidAddress
                              ? 'rgba(74, 222, 128, 0.25)'
                              : 'rgba(248, 113, 113, 0.25)'
                            : 'rgba(255,255,255,0.06)'
                        }`,
                      }}
                      onFocus={(e) => {
                        if (!destinationAddress) e.currentTarget.style.borderColor = 'rgba(130, 71, 229, 0.4)';
                      }}
                      onBlur={(e) => {
                        if (!destinationAddress) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                      }}
                    />
                    {destinationAddress && !isValidAddress && (
                      <p className="mt-1.5 text-[11px] text-red-400">Invalid Ethereum address</p>
                    )}
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      Amount
                    </label>
                    <div className="relative">
                      {asset !== 'matic' && (
                        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                          $
                        </div>
                      )}
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        min={String(minWithdrawal)}
                        step={asset === 'matic' ? '0.001' : '0.01'}
                        disabled={isSubmitting}
                        className="w-full rounded-xl py-3 pr-20 text-sm text-white placeholder-neutral-600 outline-none transition-all"
                        style={{
                          paddingLeft: asset !== 'matic' ? '2rem' : '1rem',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(130, 71, 229, 0.4)'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                      />
                      <button
                        onClick={handleMaxClick}
                        disabled={isSubmitting}
                        className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-lg px-3 py-1 text-[11px] font-bold uppercase tracking-wide transition-all"
                        style={{
                          background: 'rgba(130, 71, 229, 0.2)',
                          color: '#a78bfa',
                          border: '1px solid rgba(130, 71, 229, 0.2)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(130, 71, 229, 0.35)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(130, 71, 229, 0.2)'; }}
                      >
                        Max
                      </button>
                    </div>
                    {amount && !isValidAmount && (
                      <p className="mt-1.5 text-[11px] text-red-400">
                        {parsedAmount < minWithdrawal
                          ? `Minimum withdrawal is ${asset !== 'matic' ? '$' : ''}${minWithdrawal} ${assetLabel}`
                          : parsedAmount > availableBalance
                            ? 'Exceeds available balance'
                            : 'Enter a valid amount'}
                      </p>
                    )}
                  </div>

                  {/* MATIC reserve note */}
                  {asset === 'matic' && (
                    <div
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[11px]"
                      style={{
                        background: 'rgba(130, 71, 229, 0.06)',
                        border: '1px solid rgba(130, 71, 229, 0.12)',
                        color: '#9ca3af',
                      }}
                    >
                      <SiPolygon className="h-3 w-3 shrink-0" style={{ color: '#8247E5' }} />
                      Max reserves 0.01 MATIC for gas fees
                    </div>
                  )}

                  {/* Network safety warning */}
                  <div
                    className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11px]"
                    style={{
                      background: 'rgba(251, 191, 36, 0.06)',
                      border: '1px solid rgba(251, 191, 36, 0.12)',
                      color: '#FBBF24',
                    }}
                  >
                    <HiOutlineExclamationCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      Make sure the destination address supports <strong>Polygon network</strong>. Funds sent to the wrong network cannot be recovered.
                    </span>
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed"
                    style={{
                      background: canSubmit
                        ? 'linear-gradient(135deg, #8247E5 0%, #6C3BD0 100%)'
                        : 'rgba(255,255,255,0.06)',
                      color: canSubmit ? '#fff' : '#4b5563',
                      boxShadow: canSubmit ? '0 4px 16px rgba(130, 71, 229, 0.35)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (canSubmit) e.currentTarget.style.boxShadow = '0 4px 24px rgba(130, 71, 229, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      if (canSubmit) e.currentTarget.style.boxShadow = '0 4px 16px rgba(130, 71, 229, 0.35)';
                    }}
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
                        </svg>
                        Withdrawing...
                      </>
                    ) : (
                      `Withdraw ${assetLabel}`
                    )}
                  </button>

                  <p className="text-center text-[10px] text-neutral-600">
                    Polygon network &middot; Min {asset !== 'matic' ? `$${minWithdrawal}` : `${minWithdrawal} MATIC`}
                  </p>
                </div>
            </>
          )}

          {/* -- History Tab -- */}
          {tab === 'history' && (
            <div>
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <svg className="h-5 w-5 animate-spin text-[#8247E5]" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
                  </svg>
                </div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center">
                  <div
                    className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                  >
                    <BiTime className="h-6 w-6 text-neutral-600" />
                  </div>
                  <p className="text-sm text-neutral-500">No withdrawals yet</p>
                  <p className="mt-1 text-[11px] text-neutral-600">
                    Your transfers will appear here
                  </p>
                </div>
              ) : (
                <div className="max-h-[360px] space-y-2 overflow-y-auto pr-0.5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#2a2a3a transparent' }}>
                  {history.map((tx) => {
                    const txTokenType = tx.tokenType || 'usdce';
                    const txAsset = getAsset(txTokenType);
                    const isMatic = txTokenType === 'matic';

                    return (
                      <div
                        key={tx.id}
                        className="group rounded-xl p-3.5 transition-colors"
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.04)',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TokenLogo asset={txAsset} size={18} />
                            <span className="text-sm font-semibold text-white">
                              {isMatic ? `${tx.amount.toFixed(4)} MATIC` : `$${tx.amount.toFixed(2)}`}
                            </span>
                            <span className="text-[10px] text-neutral-500">{txAsset.label}</span>
                          </div>
                          <span
                            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold"
                            style={
                              tx.status === 'completed'
                                ? { background: 'rgba(74, 222, 128, 0.1)', color: '#4ADE80' }
                                : tx.status === 'pending'
                                  ? { background: 'rgba(251, 191, 36, 0.1)', color: '#FBBF24' }
                                  : { background: 'rgba(248, 113, 113, 0.1)', color: '#F87171' }
                            }
                          >
                            {tx.status === 'completed' && <BiCheck className="h-3 w-3" />}
                            {tx.status === 'pending' && (
                              <svg className="h-2.5 w-2.5 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
                              </svg>
                            )}
                            {tx.status === 'failed' && <BiError className="h-3 w-3" />}
                            <span className="capitalize">{tx.status}</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-neutral-500">
                          <span className="font-mono">{truncateAddress(tx.destinationAddress)}</span>
                          <span>{formatTimeAgo(tx.createdAt)}</span>
                        </div>
                        {tx.txHash && (
                          <a
                            href={`https://polygonscan.com/tx/${tx.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 flex items-center gap-1 text-[10px] text-neutral-600 transition-colors hover:text-[#8247E5]"
                          >
                            <BiLinkExternal className="h-3 w-3" />
                            <span className="font-mono">{tx.txHash.slice(0, 16)}...{tx.txHash.slice(-6)}</span>
                          </a>
                        )}
                        {tx.status === 'failed' && tx.errorMessage && (
                          <p className="mt-1.5 text-[10px] text-red-400/60">{tx.errorMessage}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
