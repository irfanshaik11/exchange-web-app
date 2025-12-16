import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FaWallet, FaTimes, FaCopy, FaCheck } from 'react-icons/fa';
import { useUser } from './UserContext';
import { useSolPrice } from './SolPriceContext';
import toast from 'react-hot-toast';

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
  return {
    id: wallet.id || wallet.walletId || `wallet-${index}`,
    label: wallet.label || wallet.name || `Wallet ${index + 1}`,
    address: wallet.address || '',
    ethereumAddress: wallet.ethereumAddress || wallet.address || '',
    solanaAddress: wallet.solanaAddress || '',
    balance: wallet.balance || 0,
    isPrimary: Boolean(wallet?.isPrimary),
  };
};

export default function MonadWalletSwitcher({ isOpen, onClose }: MonadWalletSwitcherProps) {
  const { user, refreshBalance, refreshAllBalances, walletBalances: contextWalletBalances, walletList: contextWalletList, walletListLoading, refreshWalletList } = useUser();
  const { monPrice } = useSolPrice();
  const [wallets, setWallets] = useState<UserWallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const isUpdatingPrimaryRef = useRef(false);

  // Sync wallets from centralized context - filter for Monad wallets only
  useEffect(() => {
    if (contextWalletList.length > 0) {
      const normalizedWallets = contextWalletList.map((w: any, index: number) => normalizeWalletFromApi(w, index));
      // Filter for Monad wallets (wallets with ethereumAddress)
      const monadWallets = normalizedWallets.filter((w: UserWallet) => w.ethereumAddress);

      // Normalize addresses and get balances from context
      const walletsWithBalances = monadWallets.map(wallet => {
        const checksummedAddress = wallet.ethereumAddress.startsWith('0x')
          ? wallet.ethereumAddress
          : `0x${wallet.ethereumAddress}`;

        return {
          ...wallet,
          ethereumAddress: checksummedAddress,
          balance: contextWalletBalances[checksummedAddress] ?? wallet.balance ?? 0,
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
        .filter(w => w.ethereumAddress)
        .map(w => ({ address: w.ethereumAddress, chain: 'monad' }));

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
              Monad Wallets
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <FaTimes size={14} />
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
                No Monad wallets found.
              </span>
              <span className="text-xs mt-2 text-center" style={{ color: AX.muted }}>
                Go to Portfolio page to add wallets.
              </span>
            </div>
          ) : (
            wallets.map((wallet) => (
              <div 
                key={wallet.id}
                className="flex items-center gap-3 p-3 border-b transition-all"
                style={{ 
                  borderColor: AX.border,
                  backgroundColor: wallet.isPrimary ? `${AX.mint}10` : 'transparent'
                }}
              >
                {/* Primary Wallet Indicator */}
                <button
                  onClick={() => handleSetPrimaryWallet(wallet.id)}
                  className="flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all"
                  style={{
                    borderColor: wallet.isPrimary ? AX.orange : AX.border,
                    backgroundColor: wallet.isPrimary ? AX.orange : 'transparent'
                  }}
                  title={wallet.isPrimary ? "Primary wallet" : "Set as primary wallet"}
                >
                  {wallet.isPrimary && (
                    <div className="w-2.5 h-2.5 bg-white rounded-sm" />
                  )}
                </button>

                {/* Wallet Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium" style={{ color: AX.text }}>
                      {wallet.label}
                    </span>
                    {wallet.isPrimary && (
                      <span 
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ 
                          backgroundColor: `${AX.orange}20`,
                          color: AX.orange 
                        }}
                      >
                        Primary
                      </span>
                    )}
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
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}

