import React, { useState, useEffect } from "react";
import type { Wallet } from "~/utils/functions";
import type { WatchWallet, WalletEvent } from "~/utils/walletTracking";
import { toggleWalletNotifications } from "~/utils/walletTracking";
import { SolanaIcon } from "./Footer";
import { useUser } from "./UserContext";
import { FiBell, FiBarChart2, FiTrash2 } from "react-icons/fi";
import { TbChartBubble } from "react-icons/tb";
import { IoLogoRss } from "react-icons/io5";
import { showEnhancedToast, updateEnhancedToast } from "~/utils/enhancedToast";

// Chain-aware icon component
const ChainIcon = ({
  chain,
  size = 16,
}: {
  chain?: "monad" | "sol";
  size?: number;
}) => {
  if (chain != "sol") {
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

function Tooltip({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <span className="relative inline-flex">
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
      {show && (
        <span className="pointer-events-none fixed z-[99999] translate-x-[-50%] translate-y-[-100%] rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] font-normal whitespace-nowrap text-white shadow-xl">
          {label}
          {/* Small arrow pointing down */}
          <span className="absolute top-full left-1/2 -mt-px -translate-x-1/2 border-4 border-transparent border-t-neutral-700"></span>
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
    if (typeof window !== "undefined") {
      const storageKey = `wallet_notifications_${wallet.address}`;
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) {
        try {
          const parsed = JSON.parse(saved);
          console.log(
            `✅ Found localStorage value for ${wallet.address}: ${parsed}`,
          );
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

  const [notificationsEnabled, setNotificationsEnabled] = React.useState(
    getInitialNotificationState,
  );
  const [isTogglingNotification, setIsTogglingNotification] =
    React.useState(false);

  // ALWAYS check localStorage FIRST - it takes absolute precedence
  // This effect runs on mount and whenever wallet address changes
  useEffect(() => {
    // Check localStorage first - this is the source of truth
    const stored = getNotificationStateFromStorage();
    if (stored !== null) {
      // localStorage exists - use it ALWAYS (don't trust backend)
      hasLoadedFromStorageRef.current = true;
      console.log(
        `📖 [USE EFFECT] Loaded from localStorage: ${wallet.address} = ${stored}`,
      );
      setNotificationsEnabled(stored);
      return; // Exit early - don't check backend
    }

    // Only use backend value if:
    // 1. No localStorage value exists AND
    // 2. We haven't loaded from storage before AND
    // 3. Backend has a value
    if (
      !hasLoadedFromStorageRef.current &&
      watchedWallet?.notificationsEnabled !== undefined
    ) {
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
      console.log(
        `🛡️ [BACKEND UPDATE] localStorage overrides backend change: ${wallet.address} = ${stored}`,
      );
      setNotificationsEnabled(stored);
      return; // Exit - don't use backend value
    }

    // If no localStorage and we haven't loaded from storage, use backend value
    if (
      !hasLoadedFromStorageRef.current &&
      watchedWallet?.notificationsEnabled !== undefined
    ) {
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
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(wallet.address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch (error) {
      console.error("Failed to copy wallet address:", error);
    }
  };

  const handleToggleNotifications = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isTogglingNotification) return; // Prevent double-clicks

    setIsTogglingNotification(true);
    const newState = !notificationsEnabled;
    const actionText = newState ? "enabling" : "disabling";
    const successText = newState ? "enabled" : "disabled";
    const walletName = wallet.name || wallet.address.slice(0, 8) + "...";

    // Show loading toast
    const toastId = showEnhancedToast(
      "loading",
      `${actionText.charAt(0).toUpperCase() + actionText.slice(1)} notifications for ${walletName}...`,
      {
        title: "Updating Notifications",
        duration: Infinity,
      },
    );

    try {
      // Optimistically update UI
      setNotificationsEnabled(newState);

      // CRITICAL: Save to localStorage IMMEDIATELY and SYNC (before API call)
      // This is the source of truth and MUST persist
      const storageKey = `wallet_notifications_${wallet.address}`;
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, JSON.stringify(newState));
        // Force sync to disk (some browsers cache localStorage)
        if (
          "sync" in localStorage &&
          typeof (localStorage as any).sync === "function"
        ) {
          (localStorage as any).sync();
        }
        hasLoadedFromStorageRef.current = true; // Mark that we've saved to storage
        console.log(
          `💾 [TOGGLE] Saved to localStorage: ${wallet.address} = ${newState}`,
        );

        // Verify it was saved correctly
        const verify = localStorage.getItem(storageKey);
        if (verify !== JSON.stringify(newState)) {
          console.error(
            `❌ [TOGGLE] localStorage save verification FAILED for ${wallet.address}`,
          );
        } else {
          console.log(
            `✅ [TOGGLE] localStorage save verified for ${wallet.address}`,
          );
        }
      }

      // Call backend API with ownerId and chain from watchedWallet (non-blocking - localStorage is source of truth)
      try {
        await toggleWalletNotifications(
          wallet.address,
          newState,
          watchedWallet?.ownerId || undefined,
          watchedWallet?.chain || "sol",
          user?.bearerToken,
        );
        console.log(
          `✅ [TOGGLE] Backend updated successfully for ${wallet.address}`,
        );

        // Update toast to success
        updateEnhancedToast(
          toastId,
          "success",
          `Notifications ${successText} for ${walletName}`,
          {
            title: "Notifications Updated",
            duration: 2000,
          },
        );
      } catch (apiError) {
        console.error(
          `⚠️ [TOGGLE] Backend update failed (but localStorage saved): ${wallet.address}`,
          apiError,
        );
        // Don't revert - localStorage is saved, that's what matters
        // Update toast to warning (not error, since localStorage saved)
        updateEnhancedToast(
          toastId,
          "warning",
          `Notifications ${successText} locally, but sync failed. Will retry on next update.`,
          {
            title: "Partially Updated",
            duration: 3000,
          },
        );
      }

      // Notify parent component if callback provided
      onNotificationToggle?.(wallet.address, newState);
    } catch (error) {
      // Revert on error
      setNotificationsEnabled(!notificationsEnabled);
      // Remove from localStorage if there was a critical error
      if (typeof window !== "undefined") {
        const storageKey = `wallet_notifications_${wallet.address}`;
        localStorage.removeItem(storageKey);
        hasLoadedFromStorageRef.current = false;
        console.log(
          `❌ [TOGGLE] Removed localStorage entry due to error for: ${wallet.address}`,
        );
      }
      console.error("Failed to toggle notifications:", error);

      // Update toast to error
      updateEnhancedToast(
        toastId,
        "error",
        "Failed to update notifications. Please try again.",
        {
          title: "Update Failed",
          duration: 3000,
        },
      );
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
      return `${mins} ${mins === 1 ? "min" : "mins"}`;
    }
    if (diff < day) {
      const hours = Math.floor(diff / hour);
      return `${hours} ${hours === 1 ? "hour" : "hours"}`;
    }
    // For anything >= 1 day, show days
    const days = Math.floor(diff / day);
    return `${Math.max(1, days)} ${days === 1 ? "day" : "days"}`;
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
      className="group border-b border-white/[0.03] transition-colors duration-150 hover:border-white/[0.06] hover:bg-white/[0.03] active:bg-white/[0.05]"
      onClick={handleRowClick}
    >
      <td className="px-1 py-2.5 sm:px-2 sm:py-3">
        <div className="flex w-full items-center gap-2 sm:gap-4">
          <button
            type="button"
            className="flex w-16 justify-center text-[9px] text-neutral-400 transition-colors hover:text-white sm:w-28 sm:text-xs"
            onClick={(e) => {
              e.stopPropagation();
              if (wallet.address) {
                window.open(
                  `https://solscan.io/account/${wallet.address}`,
                  "_blank",
                );
              }
            }}
            title="View wallet on Solscan"
          >
            {formatCreated(wallet.createdAt)}
          </button>
          <div className="flex min-w-0 flex-1 items-start gap-1.5 sm:gap-2">
            <span className="text-base sm:text-lg">{wallet.emoji || "💼"}</span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[10px] font-medium text-neutral-100 sm:text-xs">
                {wallet.name || "N/A"}
              </span>
              <Tooltip label={copied ? "Copied!" : "Click to copy"}>
                <button
                  className="mt-0.5 w-fit cursor-pointer font-mono text-[9px] text-neutral-400 underline-offset-2 transition-colors hover:text-neutral-200 focus-visible:outline-none sm:text-[10px]"
                  onClick={handleCopyAddress}
                  title="Copy wallet address"
                >
                  {wallet.address
                    ? `${wallet.address.slice(0, 4)}...${wallet.address.slice(-4)}`
                    : ""}
                </button>
              </Tooltip>
            </div>
          </div>
          <span className="w-20 text-[9px] text-neutral-300 sm:w-36 sm:text-xs">
            {balance !== undefined ? (
              <span
                className={`flex items-center gap-0.5 font-mono font-semibold sm:gap-1 ${watchedWallet?.chain === "monad" ? "text-[#7FFFC9]" : "text-green-400"}`}
              >
                <ChainIcon chain={watchedWallet?.chain} size={10} />
                <span className="text-[9px] sm:text-xs">
                  {balance.toFixed(4)}
                </span>
              </span>
            ) : watchedWallet ? (
              <span className="text-[9px] text-yellow-400 sm:text-xs">
                Loading...
              </span>
            ) : (
              <span className="text-[9px] text-neutral-500 sm:text-xs">-</span>
            )}
          </span>
          <span className="hidden w-28 text-[9px] text-neutral-300 sm:inline sm:text-xs">
            {formatLastActive(lastActive)}
          </span>
          <div className="flex flex-1 items-center justify-end gap-0.5 sm:gap-1.5">
            {/* Bell - Notification Toggle */}
            <Tooltip
              label={
                notificationsEnabled ? "Notifications ON" : "Notifications OFF"
              }
            >
              <button
                className={`rounded-md p-1 transition-all duration-200 sm:p-2 ${isTogglingNotification ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-white/[0.05]"}`}
                onClick={handleToggleNotifications}
                disabled={isTogglingNotification}
              >
                <FiBell
                  className={`text-sm sm:text-base ${notificationsEnabled ? "text-pink-500" : "text-neutral-500"}`}
                />
              </button>
            </Tooltip>

            {/* Chart Bubble Icon - Toggle Button */}
            <Tooltip
              label={analyticsEnabled ? "Analytics ON" : "Analytics OFF"}
            >
              <button
                className="cursor-pointer rounded-md p-1 transition-all duration-200 hover:bg-white/[0.05] sm:p-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setAnalyticsEnabled(!analyticsEnabled);
                }}
              >
                <TbChartBubble
                  className={`text-sm sm:text-base ${analyticsEnabled ? "text-pink-500" : "text-neutral-500"}`}
                />
              </button>
            </Tooltip>

            {/* RSS Icon - Toggle Button */}
            <Tooltip label={feedEnabled ? "Feed ON" : "Feed OFF"}>
              <button
                className="cursor-pointer rounded-md p-1 transition-all duration-200 hover:bg-white/[0.05] sm:p-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setFeedEnabled(!feedEnabled);
                }}
              >
                <IoLogoRss
                  className={`text-sm sm:text-base ${feedEnabled ? "text-pink-500" : "text-neutral-500"}`}
                />
              </button>
            </Tooltip>

            {/* Chart - Scan Address */}
            <Tooltip label="Scan Wallet">
              <button
                className="cursor-pointer rounded-md p-1 transition-all duration-200 hover:bg-white/[0.05] sm:p-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick && onClick(wallet);
                }}
              >
                <FiBarChart2 className="text-sm text-neutral-500 transition-colors hover:text-pink-500 sm:text-base" />
              </button>
            </Tooltip>

            {/* Delete */}
            {showDeleteConfirm ? (
              <div className="flex gap-0.5 sm:gap-1">
                <button
                  className="cursor-pointer rounded-md bg-pink-500 px-1.5 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-pink-600 sm:px-2 sm:py-1 sm:text-xs"
                  onClick={handleConfirmDelete}
                >
                  ✓
                </button>
                <button
                  className="cursor-pointer rounded-md bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-neutral-700 sm:px-2 sm:py-1 sm:text-xs"
                  onClick={handleCancelDelete}
                >
                  ✕
                </button>
              </div>
            ) : (
              <Tooltip label="Delete Wallet">
                <button
                  className="cursor-pointer rounded-md p-1 transition-all duration-200 hover:bg-white/[0.05] sm:p-2"
                  onClick={handleDeleteClick}
                >
                  <FiTrash2 className="text-sm text-neutral-500 transition-colors hover:text-pink-500 sm:text-base" />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
