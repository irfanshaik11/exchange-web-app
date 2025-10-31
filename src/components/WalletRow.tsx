import React, { useState, useEffect } from 'react';
import type { Wallet } from '~/utils/functions';
import type { WatchWallet, WalletEvent } from '~/utils/walletTracking';
import { toggleWalletNotifications } from '~/utils/walletTracking';
import { FaBell, FaBellSlash, FaChartBar, FaTrash } from 'react-icons/fa';

interface WalletRowProps {
  wallet: Wallet;
  watchedWallet?: WatchWallet;
  events?: WalletEvent[];
  balance?: number;
  onRemove: (address: string) => void;
  onClick?: (wallet: Wallet) => void;
  onNotificationToggle?: (address: string, enabled: boolean) => void;
}

function Tooltip({ children, label }: { children: React.ReactNode; label: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative flex flex-col items-center">
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        tabIndex={0}
        className="focus:outline-none"
      >
        {children}
      </span>
      <span
        className={`absolute -top-7 left-1/2 -translate-x-1/2 z-50 px-2 py-1 rounded-md bg-neutral-900 text-white text-sm font-normal shadow border border-neutral-700 whitespace-nowrap transition-all duration-200 ${show ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'}`}
      >
        {label}
      </span>
    </span>
  );
}

export default function WalletRow({ wallet, watchedWallet, events = [], balance, onRemove, onClick, onNotificationToggle }: WalletRowProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  
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
          console.warn(`⚠️ Invalid localStorage value for ${wallet.address}`);
        }
      } else {
        console.log(`❌ No localStorage value found for ${wallet.address}`);
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
      console.log(`📖 [USE EFFECT] No localStorage, using backend: ${wallet.address} = ${watchedWallet.notificationsEnabled}`);
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
      console.log(`📖 [BACKEND UPDATE] Using backend value (no localStorage): ${wallet.address} = ${watchedWallet.notificationsEnabled}`);
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
      
      // Call backend API with ownerId from watchedWallet (non-blocking - localStorage is source of truth)
      try {
        await toggleWalletNotifications(
          wallet.address, 
          newState, 
          watchedWallet?.ownerId || undefined
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
        return `${hours} hour${hours > 1 ? 's' : ''}`;
      }
    } else {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? today : date.toLocaleDateString();
    }
  };

  return (
    <tr
      key={wallet.address}
      className="border-b border-neutral-800/50 hover:bg-neutral-800/40 transition-all duration-200"
    >
      <td className="py-3 px-2">
        <div className="flex w-full items-center gap-4">
          <span className="w-28 text-xs text-neutral-400">{formatCreated(wallet.createdAt)}</span>
          <div className="flex flex-1 min-w-0 items-center gap-2">
            <span className="text-lg">{wallet.emoji || '💼'}</span>
            <span className="truncate text-xs font-medium text-neutral-200">{wallet.name || 'N/A'}</span>
          </div>
          <span className="w-36 text-xs text-neutral-300">
            {balance !== undefined 
              ? <span className="text-green-400 font-mono">{balance.toFixed(4)} SOL</span>
              : watchedWallet 
                ? <span className="text-yellow-400">Loading...</span>
                : <span className="text-neutral-500">-</span>}
          </span>
          <div className="w-40 flex items-center gap-2">
						<Tooltip label={notificationsEnabled ? "Notifications ON" : "Notifications OFF"}>
							<button 
								className={`p-1.5 rounded-md hover:bg-neutral-800 transition-all duration-200 ${isTogglingNotification ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
								title={notificationsEnabled ? "Click to disable notifications" : "Click to enable notifications"}
								onClick={handleToggleNotifications}
								disabled={isTogglingNotification}
							>
								{notificationsEnabled ? (
									<FaBell className="text-sm text-emerald-400" />
								) : (
									<FaBellSlash className="text-sm text-neutral-500" />
								)}
							</button>
						</Tooltip>
            <Tooltip label="Scan Address">
              <button className="p-1.5 rounded-md hover:bg-neutral-800 transition-colors cursor-pointer" title="Scan" onClick={() => onClick && onClick(wallet)}>
                <FaChartBar className="text-sm text-blue-300" />
              </button>
            </Tooltip>
            {showDeleteConfirm ? (
              <div className="flex gap-1">
                <button 
                  className="px-2 py-1 rounded-md bg-red-500 hover:bg-red-600 transition-colors text-white text-xs font-medium cursor-pointer" 
                  title="Confirm Delete"
                  onClick={handleConfirmDelete}
                >
                  ✓
                </button>
                <button 
                  className="px-2 py-1 rounded-md bg-neutral-700 hover:bg-neutral-600 transition-colors text-white text-xs font-medium cursor-pointer" 
                  title="Cancel"
                  onClick={handleCancelDelete}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button 
                className="p-1.5 rounded-md hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Delete" 
                onClick={handleDeleteClick}
              >
                <FaTrash className="text-sm text-red-400" />
              </button>
            )}
          </div>
          <span className="w-24"></span>
        </div>
      </td>
    </tr>
  );
} 