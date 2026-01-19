// src/components/predictions/PolygonWalletCard.tsx
// Displays user's Polygon wallet balance for Polymarket trading

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BiWallet, BiCopy, BiCheck, BiChevronDown, BiChevronUp, BiRefresh, BiLinkExternal } from 'react-icons/bi';
import { HiOutlineExclamationCircle, HiOutlineCheckCircle } from 'react-icons/hi';
import { SiPolygon } from 'react-icons/si';
import { useUser } from '../UserContext';
import { getPolymarketBalance, type PolymarketBalance } from '~/utils/api';

// Color palette matching the predictions page
const AX = {
  bg: "#0a0b0d",
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


interface PolygonWalletCardProps {
  /** Compact mode shows just balance, expanded shows full details */
  variant?: 'compact' | 'expanded' | 'inline';
  /** Custom class name */
  className?: string;
  /** Callback when balance changes */
  onBalanceChange?: (balance: PolymarketBalance | null) => void;
  /** Pre-fetched balance to avoid refetching */
  initialBalance?: PolymarketBalance | null;
}

export default function PolygonWalletCard({
  variant = 'compact',
  className = '',
  onBalanceChange,
  initialBalance = null,
}: PolygonWalletCardProps) {
  const { user, primaryWalletAddresses } = useUser();
  const [balance, setBalance] = useState<PolymarketBalance | null>(initialBalance);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(variant === 'expanded');
  const [copied, setCopied] = useState(false);

  // Get the user's EVM address (same on all EVM chains including Polygon)
  const polygonAddress = primaryWalletAddresses?.ethereum || null;

  // Fetch balance
  const fetchBalance = useCallback(async () => {
    if (!user?.bearerToken) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await getPolymarketBalance(user.bearerToken);
      if (response.success && response.data) {
        setBalance(response.data);
        onBalanceChange?.(response.data);
      } else {
        setError('Failed to fetch balance');
      }
    } catch (err) {
      console.error('[PolygonWalletCard] Error fetching balance:', err);
      setError('Failed to fetch balance');
    } finally {
      setIsLoading(false);
    }
  }, [user?.bearerToken, onBalanceChange]);

  // Fetch on mount and when user changes (skip if initialBalance provided)
  useEffect(() => {
    if (user?.bearerToken && !initialBalance) {
      fetchBalance();
    }
  }, [user?.bearerToken, fetchBalance, initialBalance]);

  // Copy address to clipboard
  const copyAddress = useCallback(() => {
    if (polygonAddress) {
      navigator.clipboard.writeText(polygonAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [polygonAddress]);

  // Truncate address for display
  const truncateAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  // Check if user has sufficient balance
  const hasGasBalance = balance ? balance.matic >= 0.01 : false;
  const hasTradingBalance = balance ? balance.usdc >= 1 : false;
  const isReady = hasGasBalance && hasTradingBalance;

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
          {isLoading ? (
            <span style={{ color: AX.muted }}>Loading...</span>
          ) : balance ? (
            <>
              <span className="font-medium">{balance.usdcFormatted}</span>
              {!hasTradingBalance && (
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
          onClick={fetchBalance}
          disabled={isLoading}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="Refresh balance"
        >
          <BiRefresh
            className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
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
      className={`rounded-xl overflow-hidden ${className}`}
      style={{
        backgroundColor: AX.surface,
        border: `1px solid ${AX.border}`,
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

              {/* Balance display */}
              <div className="flex items-center gap-3 mt-1">
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-4 rounded animate-pulse" style={{ backgroundColor: AX.border }} />
                    <div className="w-12 h-4 rounded animate-pulse" style={{ backgroundColor: AX.border }} />
                  </div>
                ) : balance ? (
                  <>
                    <span className="text-lg font-semibold" style={{ color: AX.text }}>
                      {balance.usdcFormatted}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{
                      backgroundColor: hasGasBalance ? `${AX.green}15` : `${AX.yellow}15`,
                      color: hasGasBalance ? AX.green : AX.yellow,
                    }}>
                      {balance.maticFormatted}
                    </span>
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
              onClick={fetchBalance}
              disabled={isLoading}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Refresh balance"
            >
              <BiRefresh
                className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
                style={{ color: AX.muted }}
              />
            </button>

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <BiChevronUp className="w-4 h-4" style={{ color: AX.muted }} />
              ) : (
                <BiChevronDown className="w-4 h-4" style={{ color: AX.muted }} />
              )}
            </button>
          </div>
        </div>

        {/* Status warnings */}
        {balance && (!hasTradingBalance || !hasGasBalance) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {!hasTradingBalance && (
              <div
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg"
                style={{
                  backgroundColor: `${AX.yellow}15`,
                  color: AX.yellow,
                }}
              >
                <HiOutlineExclamationCircle className="w-3.5 h-3.5" />
                Need USDC to trade
              </div>
            )}
            {!hasGasBalance && (
              <div
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg"
                style={{
                  backgroundColor: `${AX.yellow}15`,
                  color: AX.yellow,
                }}
              >
                <HiOutlineExclamationCircle className="w-3.5 h-3.5" />
                Need MATIC for gas
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
                        <span style={{ color: AX.muted }}>•</span>
                        <span style={{ color: hasGasBalance ? AX.green : AX.yellow }}>{balance.maticFormatted}</span>
                      </div>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-2 p-2.5 rounded-lg"
                    style={{
                      backgroundColor: AX.bg,
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
                      <BiLinkExternal className="w-4 h-4" style={{ color: AX.muted }} />
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
                      Send <strong style={{ color: AX.text }}>USDC</strong> to your Polygon address above
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
                      Add a small amount of <strong style={{ color: AX.text }}>MATIC</strong> for gas (~$0.10 is enough)
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
