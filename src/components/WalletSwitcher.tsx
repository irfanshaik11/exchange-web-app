import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FaWallet, FaTimes, FaPlus, FaCopy, FaCheck, FaStar, FaRegStar } from "react-icons/fa";
import { useRouter } from "next/router";
import { useUser } from "./UserContext";
import toast from "react-hot-toast";
import { SiSolana } from "react-icons/si";

interface WalletSwitcherProps {
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
  orange: "#F97316",
  blue: "#2563EB",
  blueBg: "#2563EB20",
};

export default function WalletSwitcher({ isOpen, onClose }: WalletSwitcherProps) {
  const router = useRouter();
  const {
    walletList,
    walletBalances,
    selectedWalletIds,
    selectAllWalletsForChain,
    selectWalletsWithFunds,
    refreshWalletList,
    setSelectedWalletsForChain,
    user,
  } = useUser();

  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const solWallets = useMemo(
    () => walletList.filter((w) => w.solanaAddress && !w.isArchived),
    [walletList]
  );

  const selectedSet = useMemo(() => new Set(selectedWalletIds.sol || []), [selectedWalletIds.sol]);
  const selectedCount = solWallets.filter((w) => selectedSet.has(w.id)).length;
  const totalCount = solWallets.length;
  const isAllSelected = selectedCount > 0 && selectedCount === totalCount;

  const totalSelectedBalance = solWallets
    .filter((w) => selectedSet.has(w.id))
    .reduce((acc, w) => {
      const addr = (w.solanaAddress || "").trim();
      const bal = addr ? walletBalances[addr] ?? w.balance ?? 0 : 0;
      return acc + (bal || 0);
    }, 0);

  const handleCopyAddress = (address: string) => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 1500);
    toast.success("Address copied");
  };

  const handleAddWallet = () => {
    router.push("/portfolio?chain=sol");
    onClose();
  };

  const handleSelectAllToggle = () => {
    if (isAllSelected) {
      setSelectedWalletsForChain([], "sol");
    } else {
      selectAllWalletsForChain("sol");
    }
  };

  const handleSelectAllWithFunds = () => {
    selectWalletsWithFunds("sol");
  };

  const handleClearSelection = () => {
    setSelectedWalletsForChain([], "sol");
  };

  const handleToggleSelection = (walletId: string) => {
    const next = new Set(selectedSet);
    if (next.has(walletId)) {
      next.delete(walletId);
    } else {
      next.add(walletId);
    }
    setSelectedWalletsForChain(Array.from(next), "sol");
  };

  const handleSetPrimaryWallet = async (walletId: string) => {
    if (!user?.id) {
      toast.error("Log in first");
      return;
    }
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
        const errorText = await res.text().catch(() => "");
        console.error("Failed to set primary wallet:", res.status, errorText);
        toast.error("Failed to set primary wallet");
        return;
      }
      await refreshWalletList(true);
      toast.success("Primary wallet updated");
    } catch (err) {
      console.error("Error setting primary wallet:", err);
      toast.error("Failed to set primary wallet");
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <>
      <div
        className="fixed inset-0 z-[9998]"
        style={{ backgroundColor: "transparent" }}
        onClick={onClose}
      />

      <div
        className="fixed bottom-12 left-2 z-[9999] w-96 max-w-[calc(100vw-1rem)]"
        style={{
          background: AX.bg,
          border: `1px solid ${AX.border}`,
          borderRadius: "12px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)",
          maxHeight: "calc(100vh - 120px)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="absolute w-0 h-0">
          <defs>
            <linearGradient id="solana-gradient-switcher" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9945FF" />
              <stop offset="100%" stopColor="#14F195" />
            </linearGradient>
          </defs>
        </svg>

        <div className="flex items-center justify-between p-4 border-b flex-shrink-0" style={{ borderColor: AX.border }}>
          <div className="flex items-center gap-2">
            <FaWallet size={16} style={{ color: AX.mint }} />
            <div className="flex flex-col">
              <h2 className="text-sm font-semibold" style={{ color: AX.text }}>
                Solana Wallets
              </h2>
              <span className="text-[11px]" style={{ color: AX.muted }}>
                {selectedCount}/{totalCount || 0} selected · {totalSelectedBalance.toFixed(4)} SOL
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
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
        </div>

        <div className="flex-1 overflow-y-auto">
          {solWallets.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-sm" style={{ color: AX.muted }}>
              No Solana wallets yet. Add one to start trading.
            </div>
          ) : (
            solWallets.map((wallet) => {
              const isSelected = selectedSet.has(wallet.id);
              const isPrimary = wallet.isPrimary;
              const address = (wallet.solanaAddress || "").trim();
              const balance = address ? walletBalances[address] ?? wallet.balance ?? 0 : wallet.balance ?? 0;
              const truncated =
                address && address.length > 10 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address || "—";
              return (
                <div
                  key={wallet.id}
                  className="group w-full text-left border-b transition-all"
                  style={{
                    borderColor: AX.border,
                    backgroundColor: "transparent",
                  }}
                >
                  <div className="flex items-center gap-3 p-3">
                    <div
                      className="flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-all cursor-pointer"
                      style={{
                        borderColor: isSelected ? AX.blue : isPrimary ? AX.orange : AX.border,
                        boxShadow: isSelected ? `0 0 0 1px ${AX.blue}` : "none",
                        backgroundColor: isPrimary ? `${AX.orange}33` : isSelected ? AX.blueBg : "transparent",
                      }}
                      onClick={() => handleToggleSelection(wallet.id)}
                      title={isSelected ? "Unselect wallet" : "Select wallet for trading"}
                    >
                      {isPrimary && (
                        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: AX.orange }} />
                      )}
                      {!isPrimary && isSelected && <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: AX.blue }} />}
                    </div>

                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium" style={{ color: isPrimary ? AX.orange : AX.text }}>
                          {wallet.label || "Unnamed Wallet"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono" style={{ color: AX.muted }}>
                          {truncated}
                        </span>
                        {address && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyAddress(address);
                            }}
                            className="text-gray-400 hover:text-white transition-colors"
                            title="Copy address"
                          >
                            {copiedAddress === address ? (
                              <FaCheck size={10} style={{ color: AX.mint }} />
                            ) : (
                              <FaCopy size={10} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <SiSolana
                        className="h-3.5 w-3.5 flex-shrink-0"
                        aria-hidden="true"
                        style={{ color: "unset", fill: "url(#solana-gradient-switcher)", filter: "none" }}
                      />
                      <span className="text-xs font-medium" style={{ color: AX.text }}>
                        {balance.toFixed(4)}
                      </span>
                    </div>
                    <div className={`flex-shrink-0 transition-opacity ${isPrimary ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetPrimaryWallet(wallet.id);
                        }}
                        className="p-1 text-xs"
                        title={isPrimary ? "Primary wallet" : "Set as primary"}
                      >
                        {isPrimary ? (
                          <FaStar size={14} style={{ color: AX.orange }} />
                        ) : (
                          <FaRegStar size={14} style={{ color: AX.muted }} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div
          className="w-full flex items-center gap-2 p-4 transition-all duration-300 border-t"
          style={{ borderColor: AX.border, color: AX.text }}
          onClick={handleAddWallet}
        >
          <FaPlus size={14} style={{ color: AX.mint }} />
          <span className="text-sm font-medium">Manage wallets</span>
        </div>

        <div
          className="flex items-center justify-between px-4 py-3 border-t text-xs"
          style={{ borderColor: AX.border, backgroundColor: AX.surface2, color: AX.muted }}
        >
          <span>Selections persist across sessions</span>
          <button className="text-[11px] px-2 py-1 rounded border" style={{ borderColor: AX.border }} onClick={() => refreshWalletList(true)}>
            Refresh
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}
