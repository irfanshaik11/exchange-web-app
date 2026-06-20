import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FaWallet, FaTimes, FaCopy, FaCheck, FaStar, FaRegStar } from 'react-icons/fa';
import { IoIosGitNetwork } from "react-icons/io";
import { PiNetwork } from "react-icons/pi";
import { useUser } from './UserContext';
import { useSolPrice } from './SolPriceContext';
import toast from 'react-hot-toast';
import { normalizeMonadAddress } from '~/utils/normalizeMonadAddress';
import { redistributeWalletFunds } from '~/utils/api';

interface UserWallet {
  id: string;
  label: string;
  address: string;
  ethereumAddress: string;
  solanaAddress: string;
  balance: number;
  isPrimary?: boolean;
}

interface MonadWalletSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
}

const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  mint: "#70E0B0",
  mintHover: "#58B890",
  orange: "#FF6B35",
};

const normalizeWalletFromApi = (wallet: any, index: number): UserWallet => {
  const normalizedEthereum =
    normalizeMonadAddress(wallet?.ethereumAddress) ||
    normalizeMonadAddress(wallet?.address);
  return {
    id: wallet.id || wallet.walletId || `wallet-${index}`,
    label: wallet.label || wallet.name || `Wallet ${index + 1}`,
    address: wallet.address || '',
    ethereumAddress:
      normalizedEthereum ||
      wallet.ethereumAddress ||
      wallet.address ||
      '',
    solanaAddress: wallet.solanaAddress || '',
    balance: wallet.balance || 0,
    isPrimary: Boolean(wallet?.isPrimary),
  };
};

export default function MonadWalletSwitcher({ isOpen, onClose }: MonadWalletSwitcherProps) {
  const { user, refreshBalance, refreshAllBalances, walletBalances: contextWalletBalances, walletList: contextWalletList, walletListLoading, refreshWalletList, selectedWalletIds, setSelectedWalletsForChain, selectAllWalletsForChain, selectWalletsWithFunds } = useUser();
  const { monPrice } = useSolPrice();
  const [wallets, setWallets] = useState<UserWallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const isUpdatingPrimaryRef = useRef(false);
  const [redistributing, setRedistributing] = useState(false);
  const selectedSet = useMemo(() => new Set(selectedWalletIds.monad || []), [selectedWalletIds.monad]);
  const selectedCount = wallets.filter((w) => selectedSet.has(w.id)).length;
  const totalCount = wallets.length;
  const isAllSelected = selectedCount > 0 && selectedCount === totalCount;

  // Sync wallets from centralized context - filter for Monad wallets only
  useEffect(() => {
    if (contextWalletList.length > 0) {
      const normalizedWallets = contextWalletList.map((w: any, index: number) => normalizeWalletFromApi(w, index));
      // Filter for Monad wallets (wallets with ethereumAddress)
      const monadWallets = normalizedWallets.filter((w: UserWallet) => w.ethereumAddress);

      // Normalize addresses and get balances from context
      const walletsWithBalances = monadWallets.map(wallet => {
        const normalizedAddress = normalizeMonadAddress(wallet.ethereumAddress) || wallet.ethereumAddress;
        return {
          ...wallet,
          ethereumAddress: normalizedAddress,
          balance: normalizedAddress
            ? contextWalletBalances[normalizedAddress] ?? wallet.balance ?? 0
            : wallet.balance ?? 0,
        };
      });

      setWallets(walletsWithBalances);
      setLoading(walletListLoading);
    } else if (!walletListLoading && user?.id) {
      setWallets([]);
    }
  }, [contextWalletList, contextWalletBalances, walletListLoading, user?.id]);

  // Refresh balances when modal opens
  useEffect(() => {
    if (isOpen && wallets.length > 0 && !isUpdatingPrimaryRef.current) {
      const addressesForBatch = wallets
        .map(w => normalizeMonadAddress(w.ethereumAddress))
        .filter((addr): addr is string => Boolean(addr))
        .map(address => ({ address, chain: 'monad' }));

      if (addressesForBatch.length > 0) {
        refreshAllBalances(addressesForBatch, true);
      }
    }
  }, [isOpen, wallets.length, refreshAllBalances]);

  // Sync balances from context whenever contextWalletBalances changes
  useEffect(() => {
    if (wallets.length === 0 || Object.keys(contextWalletBalances).length === 0) return;

    setWallets(prev => {
      let hasChanges = false;
      const updated = prev.map(wallet => {
        const contextBalance = contextWalletBalances[wallet.ethereumAddress];
        if (contextBalance !== undefined && contextBalance !== wallet.balance) {
          hasChanges = true;
          return { ...wallet, balance: contextBalance };
        }
        return wallet;
      });
      return hasChanges ? updated : prev;
    });
  }, [contextWalletBalances, wallets.length]);

  const handleSetPrimaryWallet = async (walletId: string) => {
    if (!user?.id) {
      toast.error("Please log in first");
      return;
    }

    isUpdatingPrimaryRef.current = true;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/wallet/${walletId}/primary`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.bearerToken}`,
          },
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to set primary wallet:", res.status, errorText);
        toast.error("Failed to set primary wallet");
        return;
      }

      // Refresh wallet list from centralized context
      // This will update local state automatically via the sync effect
      await refreshWalletList(true);
      
      toast.success("Primary wallet updated");
      
      // Trigger wallet update event
      window.dispatchEvent(new Event("wallets-updated"));
    } catch (err) {
      console.error("Error setting primary wallet:", err);
      toast.error("Failed to set primary wallet");
    } finally {
      // Reset flag after update completes
      isUpdatingPrimaryRef.current = false;
    }
  };

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
    toast.success("Address copied");
  };

  const handleToggleSelection = (walletId: string) => {
    const next = new Set(selectedSet);
    if (next.has(walletId)) {
      next.delete(walletId);
    } else {
      next.add(walletId);
    }
    setSelectedWalletsForChain(Array.from(next), "monad");
  };

  const handleSelectAllToggle = () => {
    if (isAllSelected) {
      setSelectedWalletsForChain([], "monad");
    } else {
      selectAllWalletsForChain("monad");
    }
  };

  const handleSelectAllWithFunds = () => {
    selectWalletsWithFunds("monad");
  };

  const handleRedistribute = async (mode: "split" | "consolidate") => {
    if (!user?.bearerToken) {
      toast.error("Please log in first");
      return;
    }
    const ids = Array.from(selectedSet);
    if (!ids.length) {
      toast.error("Select at least one wallet");
      return;
    }
    setRedistributing(true);
    try {
      const resp = await redistributeWalletFunds(
        { chain: "monad", mode, walletIds: ids },
        user.bearerToken
      );
      toast.success(
        `${mode === "consolidate" ? "Consolidated" : "Split"}: ${resp.summary?.sent ?? 0} sent`
      );
      await refreshWalletList(true);
    } catch (error: any) {
      console.error("Redistribute failed:", error);
      toast.error(error?.message || "Failed to redistribute");
    } finally {
      setRedistributing(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <>
      {/* Modal */}
      <div 
        className="fixed bottom-12 left-2 z-[9999] w-96 max-w-[calc(100vw-1rem)]"
        style={{
          background: AX.bg,
          border: `1px solid ${AX.border}`,
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          maxHeight: 'calc(100vh - 120px)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between p-4 border-b flex-shrink-0"
          style={{ borderColor: AX.border }}
        >
          <div className="flex items-center gap-2">
            <FaWallet size={16} style={{ color: AX.mint }} />
            <h2 className="text-sm font-semibold" style={{ color: AX.text }}>
              EVM Wallets
            </h2>
            <span className="text-[11px]" style={{ color: AX.muted }}>
              {selectedCount}/{totalCount || 0} selected
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <FaTimes size={14} />
          </button>
        </div>

        <div className="flex gap-2 p-3 border-b" style={{ borderColor: AX.border }}>
          <button
            onClick={handleSelectAllToggle}
            className="flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all duration-300"
            style={{
              backgroundColor: AX.surface,
              color: AX.text,
              border: `1px solid ${AX.border}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = AX.surface2;
              e.currentTarget.style.borderColor = AX.mint;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = AX.surface;
              e.currentTarget.style.borderColor = AX.border;
            }}
          >
            {isAllSelected ? "Unselect All" : "Select All"}
          </button>
          <button
            onClick={handleSelectAllWithFunds}
            className="flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all duration-300"
            style={{
              backgroundColor: AX.surface,
              color: AX.muted,
              border: `1px solid ${AX.border}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = AX.surface2;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = AX.surface;
            }}
          >
            Select All with Funds
          </button>
          <button
            onClick={() => handleRedistribute("consolidate")}
            className="flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all duration-300 flex items-center justify-center gap-1 disabled:opacity-60"
            style={{
              backgroundColor: AX.surface,
              color: AX.text,
              border: `1px solid ${AX.border}`,
            }}
            disabled={redistributing}
          >
            <IoIosGitNetwork size={14} />
            {redistributing ? "Working..." : "Consolidate"}
          </button>
          <button
            onClick={() => handleRedistribute("split")}
            className="flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all duration-300 flex items-center justify-center gap-1 disabled:opacity-60"
            style={{
              backgroundColor: AX.surface,
              color: AX.text,
              border: `1px solid ${AX.border}`,
            }}
            disabled={redistributing}
          >
            <PiNetwork size={14} />
            {redistributing ? "Working..." : "Split"}
          </button>
        </div>

        {/* Wallets List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <span className="text-sm" style={{ color: AX.muted }}>Loading wallets...</span>
            </div>
          ) : wallets.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8">
              <span className="text-sm text-center" style={{ color: AX.muted }}>
                No EVM wallets found.
              </span>
              <span className="text-xs mt-2 text-center" style={{ color: AX.muted }}>
                Go to Portfolio page to add wallets.
              </span>
            </div>
          ) : (
            wallets.map((wallet) => {
              const isSelected = selectedSet.has(wallet.id);
              return (
                <div 
                  key={wallet.id}
                  className="group flex items-center gap-3 p-3 border-b transition-all"
                  style={{ 
                    borderColor: AX.border,
                    backgroundColor: isSelected ? `${AX.mint}10` : 'transparent'
                  }}
                >
                  {/* Selection / Primary Indicator */}
                  <div
                    className="flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-all cursor-pointer"
                    style={{
                      borderColor: wallet.isPrimary ? AX.orange : isSelected ? AX.mint : AX.border,
                      boxShadow: isSelected ? `0 0 0 1px ${AX.mint}` : "none",
                      backgroundColor: wallet.isPrimary ? `${AX.orange}33` : isSelected ? `${AX.mint}20` : "transparent",
                    }}
                    onClick={() => handleToggleSelection(wallet.id)}
                    title={isSelected ? "Unselect wallet" : "Select wallet for trading"}
                  >
                    {wallet.isPrimary && <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: AX.orange }} />}
                    {!wallet.isPrimary && isSelected && <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: AX.mint }} />}
                  </div>

                  {/* Wallet Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium" style={{ color: wallet.isPrimary ? AX.orange : AX.text }}>
                        {wallet.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono" style={{ color: AX.muted }}>
                        {wallet.ethereumAddress.length > 12 
                          ? `${wallet.ethereumAddress.slice(0, 6)}...${wallet.ethereumAddress.slice(-4)}`
                          : wallet.ethereumAddress}
                      </span>
                      <button
                        onClick={() => handleCopyAddress(wallet.ethereumAddress)}
                        className="text-gray-400 hover:text-white transition-colors"
                        title="Copy address"
                      >
                        {copiedAddress === wallet.ethereumAddress ? (
                          <FaCheck size={10} style={{ color: AX.mint }} />
                        ) : (
                          <FaCopy size={10} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Balance */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <img
                      src="https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1"
                      alt="MON"
                      className="h-4 w-4 rounded"
                      style={{ objectFit: 'contain' }}
                    />
                    <span className="text-xs font-medium" style={{ color: AX.text }}>
                      {wallet.balance.toFixed(4)}
                    </span>
                  </div>

                  {/* Primary toggle */}
                  <div className={`flex-shrink-0 transition-opacity ${wallet.isPrimary ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetPrimaryWallet(wallet.id);
                      }}
                      className="p-1 text-xs"
                      title={wallet.isPrimary ? "Primary wallet" : "Set as primary"}
                    >
                      {wallet.isPrimary ? (
                        <FaStar size={14} style={{ color: AX.orange }} />
                      ) : (
                        <FaRegStar size={14} style={{ color: AX.muted }} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}
