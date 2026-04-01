// src/components/predictions/PolygonWalletCard.tsx
// Displays user's Polygon wallet balance for Polymarket trading

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BiWallet, BiCopy, BiCheck, BiChevronDown, BiChevronUp, BiRefresh, BiLinkExternal } from 'react-icons/bi';
import { HiOutlineExclamationCircle, HiOutlineCheckCircle } from 'react-icons/hi';
import { SiPolygon } from 'react-icons/si';
import toast from 'react-hot-toast';
import { useUser } from '../UserContext';
import { getPolymarketBalance, autoConvertUsdcToUsdce, type PolymarketBalance } from '~/utils/api';

// Color palette matching the predictions page
const AX = {
  bg: "#111214",
  surface: "#12141a",
  surface2: "#0e1012",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  accent: "#4ADE80",
  accentGlow: "rgba(74, 222, 128, 0.2)",
  green: "#4ADE80",
  red: "#F87171",
  yellow: "#FBBF24",
  purple: "#8247E5", // Polygon purple
};


interface ConversionStatus {
  converting: boolean;
  converted: boolean;
  txHash?: string;
  error?: string;
}

interface PolygonWalletCardProps {
  /** Compact mode shows just balance, expanded shows full details */
  variant?: 'compact' | 'expanded' | 'inline';
  /** Custom class name */
  className?: string;
  /** Callback when balance changes */
  onBalanceChange?: (balance: PolymarketBalance | null) => void;
  /** Pre-fetched balance to avoid refetching */
  initialBalance?: PolymarketBalance | null;
  /** Enable auto-convert on balance fetch (default: true) */
  autoConvert?: boolean;
}

export default function PolygonWalletCard({
  variant = 'compact',
  className = '',
  onBalanceChange,
  initialBalance = null,
  autoConvert = true,
}: PolygonWalletCardProps) {
  const { user, primaryWalletAddresses } = useUser();
  const [balance, setBalance] = useState<PolymarketBalance | null>(initialBalance);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true); // Always expanded
  const [copied, setCopied] = useState(false);
  const [conversionStatus, setConversionStatus] = useState<ConversionStatus | null>(null);

  // Get the user's EVM address (same on all EVM chains including Polygon)
  const polygonAddress = primaryWalletAddresses?.ethereum || null;

  // Fetch balance with optional auto-convert
  const fetchBalance = useCallback(async (triggerAutoConvert = autoConvert) => {
    if (!user?.bearerToken) return;

    setIsLoading(true);
    setError(null);

    // If we have native USDC and auto-convert is enabled, show converting status
    if (triggerAutoConvert && balance?.usdcNative && balance.usdcNative > 0.1 && (!balance?.hasPolymarketBalance)) {
      setConversionStatus({ converting: true, converted: false });
    }

    try {
      const response = await getPolymarketBalance(user.bearerToken, triggerAutoConvert);
      if (response.success && response.data) {
        setBalance(response.data);
        onBalanceChange?.(response.data);

        // Handle conversion status from response
        if (response.data.autoConverted) {
          setConversionStatus({
            converting: false,
            converted: true,
            txHash: response.data.conversionTxHash,
          });
          // Clear conversion status after 5 seconds
          setTimeout(() => setConversionStatus(null), 5000);
        } else if (response.data.conversionError) {
          setConversionStatus({
            converting: false,
            converted: false,
            error: response.data.conversionError,
          });
        } else {
          setConversionStatus(null);
        }
      } else {
        setError('Failed to fetch balance');
        setConversionStatus(null);
      }
    } catch (err) {
      console.error('[PolygonWalletCard] Error fetching balance:', err);
      setError('Failed to fetch balance');
      setConversionStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.bearerToken, onBalanceChange, autoConvert, balance?.usdcNative, balance?.hasPolymarketBalance]);

  // Manual convert handler
  const handleManualConvert = useCallback(async () => {
    if (!user?.bearerToken || !balance?.usdcNative || balance.usdcNative < 0.01) return;

    setConversionStatus({ converting: true, converted: false });

    try {
      const response = await autoConvertUsdcToUsdce(user.bearerToken);
      if (response.success && response.data.converted) {
        setConversionStatus({
          converting: false,
          converted: true,
          txHash: response.data.txHash,
        });
        // Update balance from response
        if (response.data.balances) {
          setBalance(response.data.balances);
          onBalanceChange?.(response.data.balances);
        }
        // Clear conversion status after 5 seconds
        setTimeout(() => setConversionStatus(null), 5000);
      } else {
        setConversionStatus({
          converting: false,
          converted: false,
          error: 'Conversion failed',
        });
      }
    } catch (err: any) {
      setConversionStatus({
        converting: false,
        converted: false,
        error: err.message || 'Conversion failed',
      });
    }
  }, [user?.bearerToken, balance?.usdcNative, onBalanceChange]);

  // Fetch on mount and when user changes (skip if initialBalance provided)
  useEffect(() => {
    if (user?.bearerToken && !initialBalance) {
      fetchBalance(autoConvert);
    }
  }, [user?.bearerToken, initialBalance, autoConvert]);
  // Note: fetchBalance is intentionally excluded to avoid infinite loops

  // Listen for balance refresh events (e.g., after a trade)
  useEffect(() => {
    const handleBalanceRefresh = () => {
      if (user?.bearerToken) {
        fetchBalance(false); // Don't auto-convert on refresh
      }
    };
    window.addEventListener('polygon-balance-refresh', handleBalanceRefresh);
    return () => window.removeEventListener('polygon-balance-refresh', handleBalanceRefresh);
  }, [user?.bearerToken, fetchBalance]);

  // Copy address to clipboard
  const copyAddress = useCallback(() => {
    if (polygonAddress) {
      navigator.clipboard.writeText(polygonAddress);
      setCopied(true);
      toast.success('Address copied successfully', {
        icon: <BiCheck className="w-5 h-5 text-emerald-400" />,
        style: {
          background: '#1a1b1f',
          color: '#f0f5f5',
          border: '1px solid #8247E5',
        },
      });
      setTimeout(() => setCopied(false), 2000);
    }
  }, [polygonAddress]);

  // Truncate address for display
  const truncateAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  // Check if user has sufficient balance (gas is handled by backend — no MATIC check needed)
  const hasTradingBalance = balance ? balance.usdc >= 1 : false;
  const hasPolymarketBalance = balance?.hasPolymarketBalance ?? (balance ? (balance.usdcBridged ?? 0) >= 0.1 : false);
  const hasNativeUsdcToConvert = balance ? (balance.usdcNative ?? 0) >= 0.1 : false;
  const isReady = hasPolymarketBalance || hasNativeUsdcToConvert;

  // If user is not logged in, show login prompt
  if (!user) {
    return (
      <div
        className={`rounded-xl p-4 ${className}`}
        style={{
          backgroundColor: AX.surface,
          border: `1px solid ${AX.border}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${AX.purple}20` }}
          >
            <BiWallet className="w-5 h-5" style={{ color: AX.purple }} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: AX.text }}>
              Connect Wallet
            </p>
            <p className="text-xs" style={{ color: AX.muted }}>
              Sign in to view your Polygon balance
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Inline variant - minimal display for trading panels
  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <SiPolygon className="w-4 h-4" style={{ color: AX.purple }} />
        <span className="text-sm" style={{ color: AX.text }}>
          {conversionStatus?.converting ? (
            <span style={{ color: AX.yellow }}>Converting USDC...</span>
          ) : isLoading ? (
            <span style={{ color: AX.muted }}>Loading...</span>
          ) : balance ? (
            <>
              <span className="font-medium">{balance.usdcFormatted}</span>
              {conversionStatus?.converted && (
                <span
                  className="ml-2 text-xs px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: `${AX.green}20`, color: AX.green }}
                >
                  ✓ Converted
                </span>
              )}
              {!hasPolymarketBalance && hasNativeUsdcToConvert && !conversionStatus?.converting && (
                <span
                  className="ml-2 text-xs px-1.5 py-0.5 rounded cursor-pointer"
                  style={{ backgroundColor: `${AX.yellow}20`, color: AX.yellow }}
                  onClick={handleManualConvert}
                  title="Click to convert native USDC to USDC.e"
                >
                  Convert
                </span>
              )}
              {!hasTradingBalance && !hasNativeUsdcToConvert && (
                <span
                  className="ml-2 text-xs px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: `${AX.yellow}20`, color: AX.yellow }}
                >
                  Low
                </span>
              )}
            </>
          ) : (
            <span style={{ color: AX.muted }}>--</span>
          )}
        </span>
        <button
          onClick={() => fetchBalance(false)}
          disabled={isLoading || conversionStatus?.converting}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="Refresh balance"
        >
          <BiRefresh
            className={`w-4 h-4 ${isLoading || conversionStatus?.converting ? 'animate-spin' : ''}`}
            style={{ color: AX.muted }}
          />
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl overflow-hidden backdrop-blur-xl ${className}`}
      style={{
        backgroundColor: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* Main Card Content */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          {/* Left side - Icon and balance */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: `${AX.purple}20`,
                border: `1px solid ${AX.purple}30`,
              }}
            >
              <SiPolygon className="w-5 h-5" style={{ color: AX.purple }} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium" style={{ color: AX.text }}>
                  Prediction Markets Wallet
                </p>
                {isReady && (
                  <HiOutlineCheckCircle className="w-4 h-4" style={{ color: AX.green }} />
                )}
              </div>

              {/* Balance display — dual USDC.e / USDC with info tooltips */}
              <div className="flex flex-col gap-1 mt-1">
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-4 rounded animate-pulse" style={{ backgroundColor: AX.border }} />
                    <div className="w-12 h-4 rounded animate-pulse" style={{ backgroundColor: AX.border }} />
                  </div>
                ) : balance ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: AX.text }}>
                        USDC.e
                      </span>
                      <span className="text-sm font-semibold" style={{ color: AX.text }}>
                        ${(balance.usdcBridged ?? 0).toFixed(2)}
                      </span>
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold cursor-help"
                        style={{ backgroundColor: `${AX.muted}30`, color: AX.muted }}
                        title="Used for Polymarket trades"
                      >
                        i
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: AX.text }}>
                        USDC
                      </span>
                      <span className="text-sm font-semibold" style={{ color: AX.text }}>
                        ${(balance.usdcNative ?? 0).toFixed(2)}
                      </span>
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold cursor-help"
                        style={{ backgroundColor: `${AX.muted}30`, color: AX.muted }}
                        title="Used for AI Markets (Talarion) trades"
                      >
                        i
                      </span>
                    </div>
                  </>
                ) : error ? (
                  <span className="text-sm" style={{ color: AX.red }}>{error}</span>
                ) : (
                  <span className="text-sm" style={{ color: AX.muted }}>--</span>
                )}
              </div>
            </div>
          </div>

          {/* Right side - Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchBalance(false)}
              disabled={isLoading || conversionStatus?.converting}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Refresh balance"
            >
              <BiRefresh
                className={`w-4 h-4 ${isLoading || conversionStatus?.converting ? 'animate-spin' : ''}`}
                style={{ color: AX.muted }}
              />
            </button>

            {/* Chevron toggle removed — always expanded */}
          </div>
        </div>

        {/* Conversion status */}
        {conversionStatus && (
          <div className="mt-3">
            {conversionStatus.converting && (
              <div
                className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                style={{
                  backgroundColor: `${AX.yellow}15`,
                  color: AX.yellow,
                }}
              >
                <BiRefresh className="w-4 h-4 animate-spin" />
                Converting USDC to USDC.e for Polymarket...
              </div>
            )}
            {conversionStatus.converted && (
              <div
                className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                style={{
                  backgroundColor: `${AX.green}15`,
                  color: AX.green,
                }}
              >
                <HiOutlineCheckCircle className="w-4 h-4" />
                <span>Successfully converted to USDC.e</span>
                {conversionStatus.txHash && (
                  <a
                    href={`https://polygonscan.com/tx/${conversionStatus.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline opacity-80 hover:opacity-100"
                  >
                    View tx
                  </a>
                )}
              </div>
            )}
            {conversionStatus.error && (
              <div
                className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                style={{
                  backgroundColor: `${AX.red}15`,
                  color: AX.red,
                }}
              >
                <HiOutlineExclamationCircle className="w-4 h-4" />
                <span>Conversion failed: {conversionStatus.error}</span>
              </div>
            )}
          </div>
        )}

        {/* Status warnings — no MATIC warning (gas is handled by backend) */}
        {balance && !hasPolymarketBalance && !conversionStatus?.converting && (
          <div className="mt-3 flex flex-wrap gap-2">
            {hasNativeUsdcToConvert && (
              <button
                onClick={handleManualConvert}
                disabled={conversionStatus?.converting}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors hover:opacity-90"
                style={{
                  backgroundColor: `${AX.accent}20`,
                  color: AX.accent,
                  border: `1px solid ${AX.accent}40`,
                }}
              >
                <BiRefresh className={`w-3.5 h-3.5 ${conversionStatus?.converting ? 'animate-spin' : ''}`} />
                Convert ${balance.usdcNative?.toFixed(2) || '0'} USDC to USDC.e
              </button>
            )}
            {!hasNativeUsdcToConvert && (
              <div
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg"
                style={{
                  backgroundColor: `${AX.yellow}15`,
                  color: AX.yellow,
                }}
              >
                <HiOutlineExclamationCircle className="w-3.5 h-3.5" />
                Need USDC.e to trade on Polymarket
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expanded Section */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 pt-2 border-t"
              style={{ borderColor: AX.border }}
            >
              {/* Wallet Address with Balance */}
              {polygonAddress && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium" style={{ color: AX.muted }}>
                      Your Polygon Address
                    </label>
                    {balance && (
                      <div className="flex items-center gap-2 text-xs">
                        <span style={{ color: AX.text }}>{balance.usdcFormatted}</span>
                      </div>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-2 p-2.5 rounded-lg"
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.3)',
                      border: `1px solid ${AX.border}`,
                    }}
                  >
                    <code className="flex-1 text-sm font-mono" style={{ color: AX.text }}>
                      {truncateAddress(polygonAddress)}
                    </code>
                    <button
                      onClick={copyAddress}
                      className="p-1.5 rounded hover:bg-white/10 transition-colors"
                      title="Copy address"
                    >
                      {copied ? (
                        <BiCheck className="w-4 h-4" style={{ color: AX.green }} />
                      ) : (
                        <BiCopy className="w-4 h-4" style={{ color: AX.muted }} />
                      )}
                    </button>
                    <a
                      href={`https://polygonscan.com/address/${polygonAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-white/10 transition-colors"
                      title="View on PolygonScan"
                    >
                      <img
                        src="https://polygonscan.com/assets/poly/images/svg/logos/chain-dim.svg?v=26.1.4.2"
                        alt="Polygonscan"
                        className="w-4 h-4"
                      />
                    </a>
                  </div>
                </div>
              )}

              {/* Deposit Instructions */}
              <div
                className="p-3 rounded-lg"
                style={{
                  backgroundColor: `${AX.accent}08`,
                  border: `1px solid ${AX.accent}20`,
                }}
              >
                <p className="text-xs font-medium mb-2" style={{ color: AX.accent }}>
                  How to deposit funds
                </p>
                <ol className="text-xs space-y-2" style={{ color: AX.muted }}>
                  <li className="flex items-start gap-2">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                      style={{ backgroundColor: `${AX.accent}20`, color: AX.accent }}
                    >
                      1
                    </span>
                    <span>
                      Send <strong style={{ color: AX.text }}>USDC.e</strong> for Polymarket or <strong style={{ color: AX.text }}>USDC</strong> for AI Markets to your Polygon address above
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                      style={{ backgroundColor: `${AX.accent}20`, color: AX.accent }}
                    >
                      2
                    </span>
                    <span>
                      Use the <strong style={{ color: AX.text }}>Convert</strong> button to move funds between Polymarket and AI Markets balances
                    </span>
                  </li>
                </ol>
              </div>

              {/* Warning */}
              <div
                className="mt-3 flex items-start gap-2 p-2.5 rounded-lg text-xs"
                style={{
                  backgroundColor: `${AX.red}10`,
                  border: `1px solid ${AX.red}20`,
                  color: AX.red,
                }}
              >
                <HiOutlineExclamationCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Only send assets on <strong>Polygon network</strong>. Assets sent on other networks may be lost.
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Compact inline version for use in trading panels
export function PolygonBalanceInline({ className = '' }: { className?: string }) {
  return <PolygonWalletCard variant="inline" className={className} />;
}
