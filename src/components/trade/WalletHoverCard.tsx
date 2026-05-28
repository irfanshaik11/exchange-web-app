import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { LuChefHat } from 'react-icons/lu';
import { TfiTarget } from 'react-icons/tfi';
import { HiOutlineCubeTransparent } from 'react-icons/hi2';
import { FiExternalLink, FiCopy } from 'react-icons/fi';
import { formatSmartNumber } from '~/utils/db';
import { useSolPrice } from '../SolPriceContext';

export interface WalletHoverCardData {
  walletAddress: string;
  // Buy stats
  totalBoughtSol?: number;
  totalBoughtUsd?: number;
  buyCount?: number;
  avgBuyPrice?: number;
  // Sell stats
  totalSoldSol?: number;
  totalSoldUsd?: number;
  sellCount?: number;
  avgSellPrice?: number;
  // PnL
  realizedPnl?: number;
  realizedPnlUsd?: number;
  // Balance
  remainingTokens?: number;
  remainingPercent?: number;
  solBalance?: number; // In SOL (not lamports)
  // Timestamps
  firstBuyAt?: string;
  lastActivityAt?: string;
  // Type
  holderType?: 'dev' | 'sniper' | 'bundler' | 'holder';
}

interface WalletHoverCardProps {
  data: WalletHoverCardData;
  chain?: 'sol' | 'monad';
  children: React.ReactNode;
  solPrice?: number;
  onWalletClick?: (address: string) => void;
}

// Helper to format duration
function formatDuration(startTime: string): string {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  const diffMs = now - start;

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

// Helper to format date
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  const secs = String(date.getSeconds()).padStart(2, '0');
  return `${month}/${day} ${hours}:${mins}:${secs}`;
}

// Helper to shorten address
function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || '';
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export default function WalletHoverCard({ data, chain = 'sol', children, solPrice, onWalletClick }: WalletHoverCardProps) {
  const { solPrice: contextSolPrice, monPrice } = useSolPrice();
  const effectiveSolPrice = solPrice ?? ((chain === 'monad' ? monPrice : contextSolPrice) || 0);

  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, showBelow: true });
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // Set up portal container on mount
  useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.left;
    const showBelow = spaceBelow >= 320;

    let left = rect.left;
    if (spaceRight < 290) {
      left = Math.max(10, rect.right - 280);
    }

    setPosition({
      top: showBelow ? rect.bottom + 4 : rect.top - 4,
      left,
      showBelow,
    });
  }, []);

  const showPopup = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    if (!isVisible) {
      showTimeoutRef.current = setTimeout(() => {
        calculatePosition();
        setIsVisible(true);
      }, 250);
    }
  }, [isVisible, calculatePosition]);

  const hidePopup = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }

    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 200);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const handleTriggerEnter = useCallback(() => {
    showPopup();
  }, [showPopup]);

  const handleTriggerLeave = useCallback(() => {
    hidePopup();
  }, [hidePopup]);

  const handlePopupEnter = useCallback(() => {
    cancelHide();
  }, [cancelHide]);

  const handlePopupLeave = useCallback(() => {
    hidePopup();
  }, [hidePopup]);

  const handleCopyAddress = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(data.walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    return () => {
      if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  // Calculate values
  const boughtUsd = data.totalBoughtUsd ?? (data.totalBoughtSol ?? 0) * effectiveSolPrice;
  const soldUsd = data.totalSoldUsd ?? (data.totalSoldSol ?? 0) * effectiveSolPrice;
  const pnlUsd = data.realizedPnlUsd ?? (data.realizedPnl ?? 0) * effectiveSolPrice;
  const holdingDuration = data.firstBuyAt ? formatDuration(data.firstBuyAt) : '-';

  const explorerUrl = chain === 'monad'
    ? `https://testnet.monadexplorer.com/address/${data.walletAddress}`
    : `https://solscan.io/account/${data.walletAddress}`;

  const popupContent = (
    <div
      ref={popupRef}
      className="fixed z-[99999] w-[280px]"
      style={{
        top: position.showBelow ? `${position.top}px` : 'auto',
        bottom: position.showBelow ? 'auto' : `${window.innerHeight - position.top}px`,
        left: `${position.left}px`,
      }}
      onMouseEnter={handlePopupEnter}
      onMouseLeave={handlePopupLeave}
    >
      <div
        className="rounded-lg border shadow-xl overflow-hidden"
        style={{
          backgroundColor: '#1a1b1e',
          borderColor: '#2a2b33'
        }}
      >
        {/* Header with wallet address */}
        <div className="px-3 py-2 border-b" style={{ borderColor: '#2a2b33', backgroundColor: '#141517' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`text-[12px] font-mono truncate ${onWalletClick ? 'text-emerald-400 cursor-pointer hover:underline' : 'text-white'}`}
                onClick={onWalletClick ? (e) => { e.stopPropagation(); e.preventDefault(); setIsVisible(false); onWalletClick(data.walletAddress); } : undefined}
              >
                {shortAddr(data.walletAddress)}
              </span>
              {/* Holder type icons */}
              {data.holderType === 'dev' && (
                <LuChefHat size={14} className="text-yellow-400 flex-shrink-0" title="Token Creator" />
              )}
              {data.holderType === 'sniper' && (
                <TfiTarget size={14} className="text-red-400 flex-shrink-0" title="Sniper" />
              )}
              {data.holderType === 'bundler' && (
                <HiOutlineCubeTransparent size={14} className="text-orange-400 flex-shrink-0" title="Bundler" />
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={handleCopyAddress}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title="Copy address"
              >
                <FiCopy size={12} className={copied ? 'text-emerald-400' : 'text-gray-400'} />
              </button>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title="View on explorer"
                onClick={(e) => e.stopPropagation()}
              >
                <FiExternalLink size={12} className="text-gray-400" />
              </a>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="px-3 py-2 space-y-1.5">
          {/* Bought */}
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-400">Bought</span>
            <span className="text-[11px]">
              <span className="text-emerald-400 font-medium">${formatSmartNumber(boughtUsd)}</span>
              <span className="text-gray-500">/{data.buyCount ?? 0}TXs</span>
            </span>
          </div>

          {/* Sold */}
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-400">Sold</span>
            <span className="text-[11px]">
              <span className="text-red-400 font-medium">${formatSmartNumber(soldUsd)}</span>
              <span className="text-gray-500">/{data.sellCount ?? 0}TXs</span>
            </span>
          </div>

          {/* PnL */}
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-400">PnL</span>
            <span className={`text-[11px] font-medium ${pnlUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {pnlUsd >= 0 ? '+' : ''}${formatSmartNumber(pnlUsd)}
            </span>
          </div>

          {/* Balance */}
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-400">Balance</span>
            <span className="text-[11px]">
              <span className="text-white">{formatSmartNumber(data.remainingTokens ?? 0)}</span>
              <span className="text-gray-500">/{(data.remainingPercent ?? 0).toFixed(1)}%</span>
            </span>
          </div>

          {/* SOL Balance if available */}
          {data.solBalance !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-gray-400">SOL Balance</span>
              <span className="text-[11px] text-white">{data.solBalance.toFixed(3)} SOL</span>
            </div>
          )}

          {/* Holding Duration */}
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-400">Holding Duration</span>
            <span className="text-[11px] text-white">{holdingDuration}</span>
          </div>

          {/* Divider */}
          <div className="border-t my-2" style={{ borderColor: '#2a2b33' }} />

          {/* First Activity */}
          {data.firstBuyAt && (
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-gray-400">First Activity</span>
              <span className="text-[11px] text-gray-300">{formatDate(data.firstBuyAt)}</span>
            </div>
          )}

          {/* Last Activity */}
          {data.lastActivityAt && (
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-gray-400">Last Activity</span>
              <span className="text-[11px] text-gray-300">{formatDate(data.lastActivityAt)}</span>
            </div>
          )}

          {/* Avg Buy/Sell Prices */}
          {(data.avgBuyPrice !== undefined || data.avgSellPrice !== undefined) && (
            <>
              <div className="border-t my-2" style={{ borderColor: '#2a2b33' }} />
              {data.avgBuyPrice !== undefined && data.avgBuyPrice > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-400">Avg Buy Price</span>
                  <span className="text-[11px] text-emerald-400">${formatSmartNumber(data.avgBuyPrice * effectiveSolPrice)}</span>
                </div>
              )}
              {data.avgSellPrice !== undefined && data.avgSellPrice > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-400">Avg Sell Price</span>
                  <span className="text-[11px] text-red-400">${formatSmartNumber(data.avgSellPrice * effectiveSolPrice)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Holder type badge at bottom */}
        {data.holderType && data.holderType !== 'holder' && (
          <div className="px-3 py-2 border-t" style={{ borderColor: '#2a2b33', backgroundColor: '#141517' }}>
            <div className="flex items-center gap-1.5">
              {data.holderType === 'dev' && (
                <>
                  <LuChefHat size={12} className="text-yellow-400" />
                  <span className="text-[10px] text-yellow-400">Token Creator</span>
                </>
              )}
              {data.holderType === 'sniper' && (
                <>
                  <TfiTarget size={12} className="text-red-400" />
                  <span className="text-[10px] text-red-400">Early Sniper</span>
                </>
              )}
              {data.holderType === 'bundler' && (
                <>
                  <HiOutlineCubeTransparent size={12} className="text-orange-400" />
                  <span className="text-[10px] text-orange-400">Bundle Trader</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handleTriggerLeave}
        onClick={onWalletClick ? (e) => { e.stopPropagation(); setIsVisible(false); onWalletClick(data.walletAddress); } : undefined}
      >
        {children}
      </div>

      {isVisible && portalContainer && createPortal(popupContent, portalContainer)}
    </>
  );
}
