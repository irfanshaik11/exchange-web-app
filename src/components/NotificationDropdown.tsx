import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import InterstatePopout from './InterstatePopout';
import InterstateButton from './InterstateButton';
import { useWalletTracker } from './WalletTrackerContext';
import type { TradeEvent } from '~/utils/walletTracking';

interface NotificationDropdownProps {
  open: boolean;
  onClose: () => void;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 0) return "Just now";
  if (diff < 60000) return "Just now";
  
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(diff / 86400000);
  if (days < 7) return `${days}d ago`;
  
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function NotificationDropdown({ open, onClose }: NotificationDropdownProps) {
  const [show, setShow] = useState(false);
  const router = useRouter();
  const { latestTrades, watchedWallets, clearNotifications } = useWalletTracker();

  useEffect(() => {
    if (open) {
      setShow(true);
    } else {
      const timeout = setTimeout(() => setShow(false), 220);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  // Create wallet lookup map with notifications enabled status
  const walletMap = useMemo(() => {
    const map = new Map<string, { name: string | null; emoji: string | null; notificationsEnabled: boolean }>();
    watchedWallets.forEach(wallet => {
      map.set(wallet.address, { 
        name: wallet.walletName, 
        emoji: wallet.emoji,
        notificationsEnabled: wallet.notificationsEnabled 
      });
    });
    return map;
  }, [watchedWallets]);

  // Get recent notifications (from all watched wallets, last 50, sorted by most recent)
  const notifications = useMemo(() => {
    // Normalize wallet addresses for comparison (case-insensitive)
    const normalizeAddress = (addr: string) => addr.toLowerCase().trim();
    
    // Create a set of watched wallet addresses (normalized)
    const watchedAddresses = new Set(
      watchedWallets.map(w => normalizeAddress(w.address))
    );
    
    // Filter to only include trades from wallets that are being watched
    // Show all trades from watched wallets - these are the ones that could trigger notifications
    const filtered = latestTrades
      .filter(trade => {
        const normalizedTradeWallet = normalizeAddress(trade.wallet);
        // Check if this wallet is in our watched wallets list
        return watchedAddresses.has(normalizedTradeWallet);
      })
      .slice()
      .sort((a, b) => b.at - a.at)
      .slice(0, 50);
    
    // Debug logging (remove in production)
    if (process.env.NODE_ENV === 'development' && open) {
      console.log('[NotificationDropdown] Debug:', {
        latestTradesCount: latestTrades.length,
        watchedWalletsCount: watchedWallets.length,
        filteredCount: filtered.length,
        walletMapSize: walletMap.size,
        watchedAddresses: Array.from(watchedAddresses).slice(0, 3),
        sampleTrade: latestTrades[0] ? {
          wallet: latestTrades[0].wallet,
          normalized: normalizeAddress(latestTrades[0].wallet),
          isWatched: watchedAddresses.has(normalizeAddress(latestTrades[0].wallet)),
        } : null,
        sampleWallet: watchedWallets[0] ? {
          address: watchedWallets[0].address,
          normalized: normalizeAddress(watchedWallets[0].address),
          notificationsEnabled: watchedWallets[0].notificationsEnabled,
        } : null,
      });
    }
    
    return filtered;
  }, [latestTrades, walletMap, watchedWallets, open]);

  const handleClearAll = () => {
    clearNotifications();
    // Optionally close the dropdown after clearing
    // onClose();
  };

  if (!open && !show) return null;

  return (
    <InterstatePopout open={open} onClose={onClose} align="top-right" zIndex={99999} className="bg-neutral-900 rounded-xl shadow-2xl w-full max-w-sm mt-16 mr-8 p-0 relative text-neutral-100" overlayClassName="flex items-center justify-center h-screen bg-black/50 !backdrop-blur-none">
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
        <span className="text-lg font-semibold">Notifications</span>
        <div className="flex items-center gap-4">
          {notifications.length > 0 && (
            <InterstateButton 
              variant="secondary" 
              size="sm" 
              onClick={handleClearAll}
              className="text-xs text-neutral-400 hover:text-neutral-200 hover:underline bg-transparent border-none shadow-none px-0 py-0 h-auto"
            >
              Clear All
            </InterstateButton>
          )}
          <InterstateButton variant="icon" size="sm" onClick={onClose} className="text-xl ml-2"><span>×</span></InterstateButton>
        </div>
      </div>
      <div className="max-h-[500px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <span className="text-neutral-500 text-base">No notifications</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {notifications.map((trade, index) => {
              const walletInfo = walletMap.get(trade.wallet);
              const walletName = walletInfo?.name || trade.wallet.slice(0, 8) + '...';
              const isBuy = trade.side === 'buy';
              const sideColor = isBuy ? '#70E0B0' : '#ff6b6b';
              const sideText = isBuy ? 'BOUGHT' : 'SOLD';
              const sideIcon = isBuy ? '↑' : '↓';
              
              // Format SOL amount
              let amountDisplay = '';
              if (trade.sol_spent !== null && trade.sol_spent !== undefined) {
                const solAmount = Math.abs(trade.sol_spent);
                if (solAmount >= 1) {
                  amountDisplay = `${solAmount.toFixed(2)} SOL`;
                } else if (solAmount >= 0.01) {
                  amountDisplay = `${solAmount.toFixed(3)} SOL`;
                } else {
                  amountDisplay = `${solAmount.toFixed(4)} SOL`;
                }
              }
              
              const tokenName = trade.symbol || trade.name || trade.mint.slice(0, 8) + '...';
              const timeAgo = formatTimeAgo(trade.at);

              return (
                <div
                  key={`${trade.tx}-${trade.at}-${index}`}
                  className="px-5 py-3 border-b border-neutral-800 hover:bg-neutral-800/50 transition-colors cursor-pointer"
                  onClick={() => {
                    // Navigate to trade page if pair_address exists
                    if (trade.pair_address) {
                      router.push(`/trade/${trade.pair_address}`);
                    }
                    onClose();
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Side indicator */}
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{
                        backgroundColor: `${sideColor}20`,
                        color: sideColor,
                      }}
                    >
                      {sideIcon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-neutral-400">
                          {walletInfo?.emoji && <span className="mr-1">{walletInfo.emoji}</span>}
                          {walletName}
                        </span>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            color: sideColor,
                            backgroundColor: `${sideColor}20`,
                          }}
                        >
                          {sideText}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-neutral-100 mb-0.5">
                        {tokenName}
                      </div>
                      {amountDisplay && (
                        <div className="text-xs text-neutral-400">
                          {amountDisplay}
                        </div>
                      )}
                      <div className="text-[10px] text-neutral-500 mt-1">
                        {timeAgo}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </InterstatePopout>
  );
} 