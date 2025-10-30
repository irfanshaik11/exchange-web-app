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
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(
    watchedWallet?.notificationsEnabled ?? true
  );
  const [isTogglingNotification, setIsTogglingNotification] = React.useState(false);
  
  // Update local state when watchedWallet changes
  useEffect(() => {
    if (watchedWallet?.notificationsEnabled !== undefined) {
      setNotificationsEnabled(watchedWallet.notificationsEnabled);
    }
  }, [watchedWallet?.notificationsEnabled]);

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
      
      // Call backend API with ownerId from watchedWallet
      await toggleWalletNotifications(
        wallet.address, 
        newState, 
        watchedWallet?.ownerId || undefined
      );
      
      // Notify parent component if callback provided
      onNotificationToggle?.(wallet.address, newState);
    } catch (error) {
      // Revert on error
      setNotificationsEnabled(!notificationsEnabled);
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