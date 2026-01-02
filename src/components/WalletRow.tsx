import React, { useState, useEffect } from 'react';
import type { Wallet } from '~/utils/functions';
import type { WatchWallet, WalletEvent } from '~/utils/walletTracking';
import { toggleWalletNotifications } from '~/utils/walletTracking';
import { SolanaIcon } from './Footer';
import { useUser } from './UserContext';
import { FiBell, FiBarChart2, FiTrash2 } from 'react-icons/fi';
import { TbChartBubble } from 'react-icons/tb';
import { IoLogoRss } from 'react-icons/io5';

// Chain-aware icon component
const ChainIcon = ({ chain, size = 16 }: { chain?: 'monad' | 'sol'; size?: number }) => {
  if (chain != 'sol') {
    return (
      <img
        src="./monad_icon.png"
        alt="Monad"
        className="object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  // Default to Solana icon
  return <SolanaIcon size={size} />;
};

interface WalletRowProps {
  wallet: Wallet;
  watchedWallet?: WatchWallet;
  events?: WalletEvent[];
  balance?: number;
  lastActive?: number | null;
  onRemove: (address: string) => void;
  onClick?: (wallet: Wallet) => void;
  onNotificationToggle?: (address: string, enabled: boolean) => void;
}

function Tooltip({ children, label }: { children: React.ReactNode; label: string }) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = React.useRef<HTMLSpanElement>(null);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
    }
    setShow(true);
  };

  return (
    <span className="relative flex flex-col items-center">
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShow(false)}
        onFocus={handleMouseEnter}
        onBlur={() => setShow(false)}
        tabIndex={0}
        className="focus:outline-none"
      >
        {children}
      </span>
      {show && (
        <span
          className="fixed px-2 py-1 rounded-md bg-neutral-900 text-white text-[11px] font-normal shadow-lg border border-neutral-700 whitespace-nowrap -translate-x-1/2 -translate-y-full"
          style={{ 
            zIndex: 99999,
            left: `${position.x}px`,
            top: `${position.y}px`,
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

export default function WalletRow({
  wallet,
  watchedWallet,
  events = [],
  balance,
  lastActive,
  onRemove,
  onClick,
  onNotificationToggle,
}: WalletRowProps) {
  const { user } = useUser();
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = React.useState(false);
  const [feedEnabled, setFeedEnabled] = React.useState(false);
  
  // Ref to track if we've loaded from localStorage (prevents backend from overriding)
  const hasLoadedFromStorageRef = React.useRef(false);
  
  // Helper to get notification state from localStorage (source of truth)
  const getNotificationStateFromStorage = (): boolean | null => {
    if (typeof window !== 'undefined') {
      const storageKey = `wallet_notifications_${wallet.address}`;
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) {
        try {
          const parsed = JSON.parse(saved);
          console.log(`✅ Found localStorage value for ${wallet.address}: ${parsed}`);
          return parsed;
        } catch {
          // Invalid JSON, ignore
          // console.warn(`⚠️ Invalid localStorage value for ${wallet.address}`);
        }
      } else {
        // console.log(`❌ No localStorage value found for ${wallet.address}`);
      }
    }
    return null;
  };
  
  // Load initial state: ALWAYS prioritize localStorage first, then backend, then default
  const getInitialNotificationState = (): boolean => {
    const stored = getNotificationStateFromStorage();
    if (stored !== null) {
      hasLoadedFromStorageRef.current = true;
      return stored; // localStorage is source of truth
    }
    // Fallback to watchedWallet state from backend, or default to true
    return watchedWallet?.notificationsEnabled ?? true;
  };
  
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(getInitialNotificationState);
  const [isTogglingNotification, setIsTogglingNotification] = React.useState(false);
  
  // ALWAYS check localStorage FIRST - it takes absolute precedence
  // This effect runs on mount and whenever wallet address changes
  useEffect(() => {
    // Check localStorage first - this is the source of truth
    const stored = getNotificationStateFromStorage();
    if (stored !== null) {
      // localStorage exists - use it ALWAYS (don't trust backend)
      hasLoadedFromStorageRef.current = true;
      console.log(`📖 [USE EFFECT] Loaded from localStorage: ${wallet.address} = ${stored}`);
      setNotificationsEnabled(stored);
      return; // Exit early - don't check backend
    }
    
    // Only use backend value if:
    // 1. No localStorage value exists AND
    // 2. We haven't loaded from storage before AND
    // 3. Backend has a value
    if (!hasLoadedFromStorageRef.current && watchedWallet?.notificationsEnabled !== undefined) {
      // console.log(`📖 [USE EFFECT] No localStorage, using backend: ${wallet.address} = ${watchedWallet.notificationsEnabled}`);
      setNotificationsEnabled(watchedWallet.notificationsEnabled);
    }
  }, [wallet.address]); // Only depend on wallet.address to avoid backend overrides
  
  // Separate effect to handle watchedWallet changes, but STILL prioritize localStorage
  // This prevents backend updates from overriding user's localStorage preference
  useEffect(() => {
    // Always check localStorage first, even if watchedWallet changed
    const stored = getNotificationStateFromStorage();
    if (stored !== null) {
      // localStorage takes precedence - always use it, ignore backend changes
      hasLoadedFromStorageRef.current = true;
      console.log(`🛡️ [BACKEND UPDATE] localStorage overrides backend change: ${wallet.address} = ${stored}`);
      setNotificationsEnabled(stored);
      return; // Exit - don't use backend value
    }
    
    // If no localStorage and we haven't loaded from storage, use backend value
    if (!hasLoadedFromStorageRef.current && watchedWallet?.notificationsEnabled !== undefined) {
      // console.log(`📖 [BACKEND UPDATE] Using backend value (no localStorage): ${wallet.address} = ${watchedWallet.notificationsEnabled}`);
      setNotificationsEnabled(watchedWallet.notificationsEnabled);
    }
  }, [watchedWallet?.notificationsEnabled, wallet.address]); // Watch for backend changes

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(wallet.address);
    setShowDeleteConfirm(false);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  const handleCopyAddress = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(wallet.address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch (error) {
      console.error('Failed to copy wallet address:', error);
    }
  };

  const handleToggleNotifications = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isTogglingNotification) return; // Prevent double-clicks
    
    try {
      setIsTogglingNotification(true);
      const newState = !notificationsEnabled;
      
      // Optimistically update UI
      setNotificationsEnabled(newState);
      
      // CRITICAL: Save to localStorage IMMEDIATELY and SYNC (before API call)
      // This is the source of truth and MUST persist
      const storageKey = `wallet_notifications_${wallet.address}`;
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(newState));
        // Force sync to disk (some browsers cache localStorage)
        if ('sync' in localStorage && typeof (localStorage as any).sync === 'function') {
          (localStorage as any).sync();
        }
        hasLoadedFromStorageRef.current = true; // Mark that we've saved to storage
        console.log(`💾 [TOGGLE] Saved to localStorage: ${wallet.address} = ${newState}`);
        
        // Verify it was saved correctly
        const verify = localStorage.getItem(storageKey);
        if (verify !== JSON.stringify(newState)) {
          console.error(`❌ [TOGGLE] localStorage save verification FAILED for ${wallet.address}`);
        } else {
          console.log(`✅ [TOGGLE] localStorage save verified for ${wallet.address}`);
        }
      }
      
      // Call backend API with ownerId and chain from watchedWallet (non-blocking - localStorage is source of truth)
      try {
        await toggleWalletNotifications(
          wallet.address, 
          newState, 
          watchedWallet?.ownerId || undefined,
          watchedWallet?.chain || 'sol',
          user?.bearerToken
        );
        console.log(`✅ [TOGGLE] Backend updated successfully for ${wallet.address}`);
      } catch (apiError) {
        console.error(`⚠️ [TOGGLE] Backend update failed (but localStorage saved): ${wallet.address}`, apiError);
        // Don't revert - localStorage is saved, that's what matters
      }
      
      // Notify parent component if callback provided
      onNotificationToggle?.(wallet.address, newState);
    } catch (error) {
      // Revert on error
      setNotificationsEnabled(!notificationsEnabled);
      // Remove from localStorage if there was a critical error
      if (typeof window !== 'undefined') {
        const storageKey = `wallet_notifications_${wallet.address}`;
        localStorage.removeItem(storageKey);
        hasLoadedFromStorageRef.current = false;
        console.log(`❌ [TOGGLE] Removed localStorage entry due to error for: ${wallet.address}`);
      }
      console.error('Failed to toggle notifications:', error);
    } finally {
      setIsTogglingNotification(false);
    }
  };

  // Helper to format date or relative time
  const formatCreated = (timestamp: number) => {
    const today = new Date().toLocaleDateString();
    if (!timestamp || isNaN(timestamp)) return today;
    const now = Date.now();
    const diff = now - timestamp;
    const min = 60 * 1000;
    const hour = 60 * min;
    const day = 24 * hour;
    if (diff < day) {
      if (diff < hour) {
        const mins = Math.max(1, Math.floor(diff / min));
        return `${mins} min`;
      } else {
        const hours = Math.floor(diff / hour);
        return `${hours}h`;
      }
    } else {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? today : date.toLocaleDateString();
    }
  };

  const formatLastActive = (timestamp: number | null | undefined) => {
    if (timestamp === undefined) {
      return "Loading...";
    }
    if (timestamp === null) {
      return "No activity yet";
    }

    const now = Date.now();
    const diff = now - timestamp;
    if (!Number.isFinite(diff) || diff < 0) {
      return "Just now";
    }

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return "Just now";
    if (diff < hour) {
      const mins = Math.floor(diff / minute);
      return `${mins} ${mins === 1 ? 'min' : 'mins'}`;
    }
    if (diff < day) {
      const hours = Math.floor(diff / hour);
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
    // For anything >= 1 day, show days
    const days = Math.floor(diff / day);
    return `${Math.max(1, days)} ${days === 1 ? 'day' : 'days'}`;
  };

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't trigger row click if clicking on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("a") ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    onClick && onClick(wallet);
  };

  return (
    <tr
      key={wallet.address}
      className="border-b border-neutral-800/50 hover:bg-neutral-800/40 transition-all duration-200 cursor-pointer"
      onClick={handleRowClick}
    >
      <td className="py-3 px-2">
        <div className="flex w-full items-center gap-4">
          <button
            type="button"
            className="w-28 flex justify-center text-xs text-neutral-400 hover:text-white transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              if (wallet.address) {
                window.open(`https://solscan.io/account/${wallet.address}`, "_blank");
              }
            }}
            title="View wallet on Solscan"
          >
            {formatCreated(wallet.createdAt)}
          </button>
          <div className="flex flex-1 min-w-0 items-start gap-2">
            <span className="text-lg">{wallet.emoji || '💼'}</span>
            <div className="flex flex-col min-w-0">
              <span className="truncate text-xs font-medium text-neutral-200">{wallet.name || 'N/A'}</span>
              <Tooltip label={copied ? 'Copied!' : 'Click to copy'}>
                <button
                  className="mt-0.5 w-fit text-[10px] font-mono text-neutral-400 hover:text-neutral-200 transition-colors underline-offset-2 focus-visible:outline-none cursor-pointer"
                  onClick={handleCopyAddress}
                  title="Copy wallet address"
                >
                  {wallet.address ? `${wallet.address.slice(0, 4)}...${wallet.address.slice(-4)}` : ''}
                </button>
              </Tooltip>
            </div>
          </div>
          <span className="w-36 text-xs text-neutral-300">
            {balance !== undefined ? (
              <span className="flex items-center gap-1 text-green-400 font-mono">
                <ChainIcon chain={watchedWallet?.chain} size={12} />
                <span>{balance.toFixed(4)}</span>
              </span>
            ) : watchedWallet ? (
              <span className="text-yellow-400">Loading...</span>
            ) : (
              <span className="text-neutral-500">-</span>
            )}
          </span>
          <span className="w-28 text-xs text-neutral-300">
            {formatLastActive(lastActive)}
          </span>
          <div className="flex-1 flex items-center justify-end gap-1.5">
						{/* Bell - Notification Toggle */}
						<Tooltip label={notificationsEnabled ? "Notifications ON" : "Notifications OFF"}>
							<button 
								className={`p-2 rounded-md transition-all duration-200 ${isTogglingNotification ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:bg-neutral-800/50'}`}
								onClick={handleToggleNotifications}
								disabled={isTogglingNotification}
							>
								<FiBell className={`text-base ${notificationsEnabled ? 'text-pink-500' : 'text-neutral-600'}`} />
							</button>
						</Tooltip>

						{/* Chart Bubble Icon - Toggle Button */}
						<Tooltip label={analyticsEnabled ? "Analytics ON" : "Analytics OFF"}>
							<button 
								className="p-2 rounded-md hover:bg-neutral-800/50 transition-all duration-200 cursor-pointer"
								onClick={(e) => {
									e.stopPropagation();
									setAnalyticsEnabled(!analyticsEnabled);
								}}
							>
								<TbChartBubble className={`text-base ${analyticsEnabled ? 'text-pink-500' : 'text-neutral-600'}`} />
							</button>
						</Tooltip>

						{/* RSS Icon - Toggle Button */}
						<Tooltip label={feedEnabled ? "Feed ON" : "Feed OFF"}>
							<button 
								className="p-2 rounded-md hover:bg-neutral-800/50 transition-all duration-200 cursor-pointer"
								onClick={(e) => {
									e.stopPropagation();
									setFeedEnabled(!feedEnabled);
								}}
							>
								<IoLogoRss className={`text-base ${feedEnabled ? 'text-pink-500' : 'text-neutral-600'}`} />
							</button>
						</Tooltip>

						{/* Chart - Scan Address */}
						<Tooltip label="Scan Wallet">
							<button 
								className="p-2 rounded-md hover:bg-neutral-800/50 transition-all duration-200 cursor-pointer" 
								onClick={(e) => {
									e.stopPropagation();
									onClick && onClick(wallet);
								}}
							>
								<FiBarChart2 className="text-base text-neutral-400 hover:text-pink-500 transition-colors" />
							</button>
						</Tooltip>

						{/* Delete */}
						{showDeleteConfirm ? (
							<div className="flex gap-1">
								<button 
									className="px-2 py-1 rounded-md bg-pink-500 hover:bg-pink-600 transition-colors text-white text-xs font-medium cursor-pointer" 
									onClick={handleConfirmDelete}
								>
									✓
								</button>
								<button 
									className="px-2 py-1 rounded-md bg-neutral-700 hover:bg-neutral-600 transition-colors text-white text-xs font-medium cursor-pointer" 
									onClick={handleCancelDelete}
								>
									✕
								</button>
							</div>
						) : (
							<Tooltip label="Delete Wallet">
								<button 
									className="p-2 rounded-md hover:bg-neutral-800/50 transition-all duration-200 cursor-pointer"
									onClick={handleDeleteClick}
								>
									<FiTrash2 className="text-base text-neutral-400 hover:text-pink-500 transition-colors" />
								</button>
							</Tooltip>
						)}
          </div>
        </div>
      </td>
    </tr>
  );
} 