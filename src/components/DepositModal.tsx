"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  FaCopy,
  FaTimes,
  FaQuestionCircle,
  FaHistory,
  FaExternalLinkAlt,
  FaCheckCircle,
  FaClock,
  FaExclamationCircle,
  FaSync,
} from "react-icons/fa";
import Cookies from "js-cookie";
import QRCode from "qrcode";
import { useUser } from "./UserContext";
import toast from "react-hot-toast";
import { useBalancePolling } from "~/hooks/useBalancePolling";
import {
  withdrawSOL,
  getWithdrawalHistory,
  getWithdrawalFee,
} from "~/utils/api";
import { env } from "~/env";

// No additional window interfaces needed

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: TabType;
  selectedChain?: string;
}

type TabType = "convert" | "deposit" | "buy" | "withdraw";

interface WithdrawalTransaction {
  id: number;
  amount: number | string;
  destinationAddress?: string;
  txSignature?: string;
  status: "pending" | "completed" | "failed";
  fee: number | string;
  createdAt: string;
  completedAt?: string;
}

const CHAIN_CONFIG: Record<
  string,
  { tokenSymbol: string; networkName: string; iconUrl?: string }
> = {
  sol: {
    tokenSymbol: "SOL",
    networkName: "Solana",
    iconUrl:
      "https://www.pngall.com/wp-content/uploads/10/Solana-Crypto-Logo-PNG-File.png",
  },
  monad: {
    tokenSymbol: "MON",
    networkName: "Monad",
    iconUrl:
      "https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1",
  },
  eth: {
    tokenSymbol: "ETH",
    networkName: "Ethereum",
    iconUrl: "https://s2.coinmarketcap.com/static/img/coins/200x200/1027.png",
  },
  bnb: {
    tokenSymbol: "BNB",
    networkName: "BNB Chain",
    iconUrl:
      "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
  },
  base: {
    tokenSymbol: "BASE",
    networkName: "Base",
    iconUrl: "https://avatars.githubusercontent.com/u/108554348?s=280&v=4",
  },
};

// Helper function to detect chain from transaction signature
// Monad/EVM transactions start with "0x", Solana uses base58
const getTransactionChain = (txSignature?: string | null): "monad" | "sol" => {
  if (!txSignature) return "sol"; // Default to Solana
  return txSignature.startsWith("0x") ? "monad" : "sol";
};

// Helper function to get explorer URL and name based on chain
const getExplorerInfo = (chain: "monad" | "sol", txSignature: string) => {
  if (chain === "monad") {
    return {
      url: `https://monadvision.com/tx/${txSignature}`,
      name: "Monad Vision",
    };
  }
  return {
    url: `https://solscan.io/tx/${txSignature}`,
    name: "Solscan",
  };
};

const DepositModal: React.FC<DepositModalProps> = ({
  open,
  onClose,
  initialTab = "deposit",
  selectedChain = "sol",
}) => {
  const {
    user,
    loading: userLoading,
    refreshUser,
    refreshBalance,
    solBalance,
    chainBalances,
    walletList,
    walletListLoading,
    primaryWalletAddresses: contextPrimaryWalletAddresses,
  } = useUser();
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Derive primary wallet from centralized wallet list
  const primaryWallet = walletList.find((w) => w.isPrimary) ?? walletList[0];
  const primaryWalletAddresses = {
    solana: contextPrimaryWalletAddresses.solana ?? primaryWallet?.solanaAddress ?? primaryWallet?.address ?? null,
    ethereum: contextPrimaryWalletAddresses.ethereum ?? primaryWallet?.ethereumAddress ?? null,
  };
  const primaryWalletLabel = primaryWallet?.label ?? null;
  const primaryWalletLoading = walletListLoading;

  // Withdraw tab states
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [isWithdrawLoading, setIsWithdrawLoading] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [withdrawalFee, setWithdrawalFee] = useState<number>(0.0005);
  const [minimumReserve, setMinimumReserve] = useState<number>(0.00139); // Dynamic minimum reserve from API
  const [withdrawView, setWithdrawView] = useState<"form" | "history">("form");
  const [history, setHistory] = useState<WithdrawalTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const MIN_WITHDRAWAL = 0.001;
  const MAX_WITHDRAWAL = 100;

  // State for balance polling (hook and effect defined after depositAddress)
  const [isPollingBalance, setIsPollingBalance] = useState(false);

  const chainConfig = CHAIN_CONFIG[selectedChain] ?? CHAIN_CONFIG.sol;
  const tokenSymbol = chainConfig.tokenSymbol;
  const networkName = chainConfig.networkName;
  const isSolChain = selectedChain === "sol";
  const chainBalance =
    selectedChain === "sol"
      ? (chainBalances[selectedChain] ?? solBalance)
      : (chainBalances[selectedChain] ?? 0);
  const numericWithdrawAmount = Number(withdrawAmount || 0);
  const totalWithdrawalAmount = numericWithdrawAmount + withdrawalFee;

  // Update active tab when initialTab changes
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (open) {
      setShow(true);
      document.body.style.overflow = "hidden";
    } else {
      const timeout = setTimeout(() => setShow(false), 300);
      document.body.style.overflow = "";
      return () => clearTimeout(timeout);
    }
  }, [open]);

  const depositAddress =
    selectedChain === "sol"
      ? primaryWalletAddresses.solana || user?.publicKey || ""
      : primaryWalletAddresses.ethereum ||
        primaryWalletAddresses.solana ||
        user?.publicKey ||
        "";

  useEffect(() => {
    if (!open) return;
    if (!depositAddress) return;
    refreshBalance({ chain: selectedChain, address: depositAddress });
  }, [open, depositAddress, selectedChain, refreshBalance]);

  useEffect(() => {
    if (depositAddress) {
      QRCode.toDataURL(depositAddress, {
        width: 280,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })
        .then((url) => {
          setQrCodeDataUrl(url);
        })
        .catch((err) => {
          setQrCodeDataUrl("");
        });
    } else {
      setQrCodeDataUrl("");
    }
  }, [depositAddress]);

  // Balance polling for deposit detection (must be after depositAddress is defined)
  const { startPolling, stopPolling } = useBalancePolling({
    chain: selectedChain === "monad" ? "monad" : "sol",
    intervalMs: 3000, // Poll every 3 seconds
    maxDurationMs: 120000, // Poll for up to 2 minutes
    onBalanceChange: (oldBalance, newBalance) => {
      const change = newBalance - oldBalance;
      if (change > 0) {
        toast.success(`Deposit received: +${change.toFixed(4)} ${chainConfig.tokenSymbol}`, {
          duration: 5000,
          style: {
            background: "#1E1F26",
            color: "#E6E7EA",
            border: "1px solid #18c48c",
          },
        });
      }
      setIsPollingBalance(false);
    },
  });

  // Start polling when deposit tab is active
  useEffect(() => {
    if (open && activeTab === "deposit" && depositAddress) {
      setIsPollingBalance(true);
      startPolling();
    } else {
      stopPolling();
      setIsPollingBalance(false);
    }

    return () => {
      stopPolling();
    };
  }, [open, activeTab, depositAddress, startPolling, stopPolling]);

  // Manual balance refresh handler
  const handleManualRefresh = async () => {
    try {
      await refreshBalance({ chain: selectedChain, force: true });
      toast.success("Balance refreshed", {
        duration: 2000,
        style: {
          background: "#1E1F26",
          color: "#E6E7EA",
          border: "1px solid #18c48c",
        },
      });
    } catch (error) {
      console.error("Failed to refresh balance:", error);
    }
  };

  const copyToClipboard = (text: string) => {
    if (!text) {
      toast.error("No address available to copy", {
        duration: 2000,
        style: {
          background: "#1E1F26",
          color: "#E6E7EA",
          border: "1px solid #ff6b6b",
        },
      });
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          toast.success("Address copied to clipboard!", {
            duration: 2000,
            style: {
              background: "#1E1F26",
              color: "#E6E7EA",
              border: "1px solid #18c48c",
            },
          });
          setTimeout(() => setCopied(false), 2000);
        })
        .catch((err) => {
          console.error("Clipboard write failed:", err);
          toast.error("Failed to copy address", {
            duration: 2000,
            style: {
              background: "#1E1F26",
              color: "#E6E7EA",
              border: "1px solid #ff6b6b",
            },
          });
        });
    } else {
      console.warn("Clipboard API not available.");
    }
  };

  // Fetch withdrawal fee when withdraw tab is active
  useEffect(() => {
    if (activeTab === "withdraw" && open) {
      fetchWithdrawalFee();
    }
  }, [activeTab, open, selectedChain]);

  // Reset withdraw form when modal closes or tab changes
  useEffect(() => {
    if (!open || activeTab !== "withdraw") {
      setWithdrawAmount("");
      setDestinationAddress("");
      setWithdrawMessage(null);
      setTxSignature(null);
      setWithdrawView("form");
    }
  }, [open, activeTab]);

  // Fetch history when switching to history view
  useEffect(() => {
    if (
      withdrawView === "history" &&
      user?.bearerToken &&
      activeTab === "withdraw"
    ) {
      fetchHistory();
    }
  }, [withdrawView, user?.bearerToken, activeTab]);

  const fetchWithdrawalFee = async () => {
    try {
      const feeData = await getWithdrawalFee(selectedChain);
      const fee =
        typeof feeData === "number"
          ? feeData
          : ((feeData as any)?.fee ?? withdrawalFee);
      setWithdrawalFee(fee);
      
      // Extract minimumReserve from API response
      if (typeof feeData === "object" && feeData !== null) {
        const apiMinimumReserve = (feeData as any)?.minimumReserve;
        if (typeof apiMinimumReserve === "number" && apiMinimumReserve > 0) {
          setMinimumReserve(apiMinimumReserve);
        }
      }
    } catch (error) {
      console.error("Failed to fetch withdrawal fee:", error);
      // quietly keep prior fallback without surfacing an error toast
    }
  };

  // REMOVED: Redundant wallet fetching - now using centralized walletList from UserContext
  // The wallet list is managed by UserContext with debouncing to prevent thousands of calls

  const fetchHistory = async () => {
    if (!user?.bearerToken) return;

    setHistoryLoading(true);
    try {
      const data = await getWithdrawalHistory(user.bearerToken);
      const transactions = (data as any).transactions || data || [];
      setHistory(Array.isArray(transactions) ? transactions : []);
    } catch (error) {
      console.error("Failed to fetch withdrawal history:", error);
      toast.error("Failed to load withdrawal history", {
        duration: 2000,
        style: {
          background: "#1E1F26",
          color: "#E6E7EA",
          border: "1px solid #ff6b6b",
        },
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleMaxClick = () => {
    // Calculate max with a small buffer to account for floating point precision
    // This ensures the validation will pass
    const precisionBuffer = 0.00001;
    const maxAmount = Math.max(0, chainBalance - minimumReserve - precisionBuffer);
    // Round down to 4 decimal places to avoid issues
    const roundedMax = Math.floor(maxAmount * 10000) / 10000;
    setWithdrawAmount(roundedMax.toFixed(4));
  };

  const handleWithdraw = async () => {
    if (!user?.bearerToken) {
      setWithdrawMessage({ type: "error", text: "User not logged in." });
      return;
    }

    const amount = Number(withdrawAmount);
    if (!amount || amount <= 0) {
      setWithdrawMessage({
        type: "error",
        text: "Enter a valid withdrawal amount.",
      });
      return;
    }

    if (amount < MIN_WITHDRAWAL) {
      setWithdrawMessage({
        type: "error",
        text: `Minimum withdrawal is ${MIN_WITHDRAWAL} ${tokenSymbol}.`,
      });
      return;
    }

    if (amount > MAX_WITHDRAWAL) {
      setWithdrawMessage({
        type: "error",
        text: `Maximum withdrawal is ${MAX_WITHDRAWAL} ${tokenSymbol} per transaction.`,
      });
      return;
    }

    // Use minimumReserve for validation - it already includes fee + safety margins
    const totalRequired = amount + minimumReserve;
    if (totalRequired > chainBalance) {
      setWithdrawMessage({
        type: "error",
        text: `Insufficient balance. You need ${totalRequired.toFixed(4)} ${tokenSymbol} (including ${minimumReserve.toFixed(4)} ${tokenSymbol} for fees and reserves).`,
      });
      return;
    }

    if (!destinationAddress.trim()) {
      setWithdrawMessage({
        type: "error",
        text: "Enter a destination address.",
      });
      return;
    }

    if (isSolChain) {
      if (destinationAddress.length < 32 || destinationAddress.length > 44) {
        setWithdrawMessage({
          type: "error",
          text: "Invalid Solana address format.",
        });
        return;
      }
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
      if (!base58Regex.test(destinationAddress)) {
        setWithdrawMessage({
          type: "error",
          text: "Invalid Solana address format.",
        });
        return;
      }
    } else {
      const evmRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!evmRegex.test(destinationAddress)) {
        setWithdrawMessage({
          type: "error",
          text: "Invalid EVM address format (expected 0x...).",
        });
        return;
      }
    }

    const sourceAddress =
      selectedChain === "sol"
        ? primaryWalletAddresses.solana
        : primaryWalletAddresses.ethereum;
    const chainCode = selectedChain === "monad" ? "MON" : "SOL";
    if (!sourceAddress) {
      setWithdrawMessage({
        type: "error",
        text: `Primary ${tokenSymbol} wallet not found. Please set a primary wallet.`,
      });
      return;
    }

    setIsWithdrawLoading(true);
    setWithdrawMessage(null);
    setTxSignature(null);

    try {
      const result = await withdrawSOL(
        {
          amount,
          destinationAddress,
          sourceAddress,
          chain: chainCode,
        },
        user.bearerToken,
      );

      const isSuccess =
        result?.txSignature ||
        result?.message?.toLowerCase().includes("withdraw");
      if (isSuccess) {
        if (result?.txSignature) {
          setTxSignature(result.txSignature);
        }
        setWithdrawAmount("");
        setDestinationAddress("");
        setWithdrawMessage({
          type: "success",
          text: "Withdrawal complete!",
        });
        toast.success("Withdrawal complete!", {
          duration: 3000,
          style: {
            background: "#1E1F26",
            color: "#E6E7EA",
            border: "1px solid #18c48c",
          },
        });
        setTimeout(() => {
          refreshBalance({ chain: selectedChain, address: sourceAddress });
        }, 2000);
      } else {
        setWithdrawMessage({
          type: "error",
          text: result?.message || "Withdrawal failed. Please try again.",
        });
        toast.error(result?.message || "Withdrawal failed", {
          duration: 3000,
          style: {
            background: "#1E1F26",
            color: "#E6E7EA",
            border: "1px solid #ff6b6b",
          },
        });
      }
    } catch (error: any) {
      console.warn("Withdrawal error:", error);
      const errorMessage =
        error?.message || "An error occurred during withdrawal.";
      setWithdrawMessage({ type: "error", text: errorMessage });

      toast.error(errorMessage, {
        duration: 3000,
        style: {
          background: "#1E1F26",
          color: "#E6E7EA",
          border: "1px solid #ff6b6b",
        },
      });
    } finally {
      setIsWithdrawLoading(false);
    }
  };

  // Function to show Onramper widget
  const showOnramper = () => {
    if (!depositAddress) {
      toast.error(`Add a primary wallet before buying ${tokenSymbol}.`, {
        duration: 2000,
        style: {
          background: "#1E1F26",
          color: "#E6E7EA",
          border: "1px solid #ff6b6b",
        },
      });
      return;
    }

    try {
      // Construct Onramper widget URL
      const onramperUrl =
        "https://buy.onramper.com/?apiKey=pk_prod_01KB0GV0SYGKAC64C5QRJPD5DZ&wallets=sol:Hq6QEefod4MwtyZk13im7AVa4YrCkNLNzr6GpKBG9RUd&defaultCrypto=sol&defaultAmount=100&themeName=dark&containerColor=1a1b20&primaryColor=18c48c&secondaryColor=2A2D35&cardColor=0a0b0f&primaryTextColor=ffffff&secondaryTextColor=E6E7EA";

      // Open in new window
      const width = 500;
      const height = 700;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;

      window.open(
        onramperUrl.toString(),
        "Onramper",
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
      );
    } catch (error) {
      console.error("Error showing Onramper:", error);
      toast.error("Failed to load Onramper widget", {
        duration: 2000,
        style: {
          background: "#1E1F26",
          color: "#E6E7EA",
          border: "1px solid #ff6b6b",
        },
      });
    }
  };

  if (!open && !show) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[99998] bg-black/60 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-[99999] w-full max-w-[480px] transform bg-[#1a1b20] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#2A2B33] px-6 py-4">
            <h2 className="text-2xl font-bold text-white">
              {activeTab === "convert"
                ? "Convert"
                : activeTab === "deposit"
                  ? "Deposit"
                  : activeTab === "buy"
                    ? "Buy"
                    : "Withdraw"}
            </h2>
            <button
              onClick={onClose}
              className="text-neutral-400 transition-colors hover:text-white"
            >
              <FaTimes size={24} />
            </button>
          </div>

          {/* Tabs */}
          <div className="px-6 pt-6 pb-3">
            <div className="flex gap-2 rounded-2xl bg-[#0a0b0f] p-1">
              <button
                onClick={() => setActiveTab("convert")}
                className={`flex-1 rounded-xl px-4 py-3 text-base font-medium transition-all duration-200 ${
                  activeTab === "convert"
                    ? "bg-[#2A2D35] text-white"
                    : "bg-transparent text-neutral-400 hover:text-neutral-300"
                }`}
              >
                Convert
              </button>
              <button
                onClick={() => setActiveTab("deposit")}
                className={`flex-1 rounded-xl px-4 py-3 text-base font-medium transition-all duration-200 ${
                  activeTab === "deposit"
                    ? "bg-[#2A2D35] text-white"
                    : "bg-transparent text-neutral-400 hover:text-neutral-300"
                }`}
              >
                Deposit
              </button>
              <button
                onClick={() => setActiveTab("buy")}
                className={`flex-1 rounded-xl px-4 py-3 text-base font-medium transition-all duration-200 ${
                  activeTab === "buy"
                    ? "bg-[#2A2D35] text-white"
                    : "bg-transparent text-neutral-400 hover:text-neutral-300"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setActiveTab("withdraw")}
                className={`flex-1 rounded-xl px-4 py-3 text-base font-medium transition-all duration-200 ${
                  activeTab === "withdraw"
                    ? "bg-[#2A2D35] text-white"
                    : "bg-transparent text-neutral-400 hover:text-neutral-300"
                }`}
              >
                Withdraw
              </button>
            </div>
          </div>

          {/* Subtitle */}
          <div className="px-6 pb-3 text-sm text-neutral-400">
            {activeTab === "convert" && "Swap between cryptocurrencies"}
            {activeTab === "deposit" &&
              `Deposit ${tokenSymbol} to your Interstate wallet`}
            {activeTab === "buy" && `Buy ${tokenSymbol} with fiat currency`}
            {activeTab === "withdraw" &&
              `Withdraw ${tokenSymbol} to an external wallet`}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {/* Convert Tab */}
            {activeTab === "convert" && (
              <div className="space-y-4">
                {/* Onramper Swap Widget */}
                <div className="overflow-hidden rounded-3xl border border-[#2A2B33]">
                  <iframe
                    src={`https://buy.onramper.com/?apiKey=pk_prod_01KB0GV0SYGKAC64C5QRJPD5DZ&wallets=sol:Hq6QEefod4MwtyZk13im7AVa4YrCkNLNzr6GpKBG9RUd&defaultCrypto=sol&defaultAmount=100&themeName=dark&containerColor=1a1b20&primaryColor=18c48c&secondaryColor=2A2D35&cardColor=0a0b0f&primaryTextColor=ffffff&secondaryTextColor=E6E7EA`}
                    title="Onramper Swap"
                    className="h-[600px] w-full border-none bg-[#0a0b0f]"
                    allow="payment"
                  />
                </div>

                {/* Info Box */}
                <div className="bg-[rgba(59,130,246,0.1)] flex gap-3 rounded-3xl border border-[#3b82f6] p-4">
                  <div className="mt-0.5 flex-shrink-0">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="text-[#3b82f6]"
                    >
                      <circle cx="12" cy="12" r="10" fill="currentColor" />
                      <path
                        d="M12 8v4m0 4h.01"
                        stroke="#1a1b20"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <div className="text-sm leading-relaxed text-[#60a5fa]">
                    <span className="font-semibold">Note: </span>
                    Swap between cryptocurrencies using Onramper. The output
                    will be delivered directly to your wallet.
                  </div>
                </div>

                {/* Powered by Onramper */}
                <div className="flex items-center justify-center gap-2 text-xs text-neutral-500">
                  <span className="flex items-center gap-1.5">
                    Powered by
                    <img
                      src="/onramper.svg"
                      alt="Onramper"
                      className="h-2.5 opacity-60"
                    />
                  </span>
                </div>
              </div>
            )}

            {/* Deposit Tab */}
            {activeTab === "deposit" && (
              <>
                {userLoading || primaryWalletLoading ? (
                  <div className="flex h-64 items-center justify-center">
                    <div className="text-neutral-400">
                      Loading wallet data...
                    </div>
                  </div>
                ) : !user ? (
                  <div className="rounded-3xl border border-orange-500/30 bg-orange-900/20 p-6 text-center">
                    <div className="text-sm text-orange-400">
                      Please login first to view your deposit address
                    </div>
                    {Cookies.get("token") && (
                      <button
                        onClick={refreshUser}
                        className="mt-4 rounded-3xl bg-orange-600 px-4 py-2 text-white transition-colors hover:bg-orange-700"
                      >
                        Refresh User Data
                      </button>
                    )}
                  </div>
                ) : depositAddress ? (
                  <div className="space-y-6">
                    {/* Wallet Info Box */}
                    <div className="rounded-3xl border border-[#2A2B33] bg-[#0a0b0f] p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="mb-1 text-xs text-neutral-400">
                            {primaryWalletLabel || "Interstate Wallet"}
                          </div>
                          <div className="font-mono text-sm text-neutral-300">
                            {depositAddress.slice(0, 4)}...
                            {depositAddress.slice(-4)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-2 text-2xl font-bold text-white">
                            {chainConfig.iconUrl ? (
                              <img
                                src={chainConfig.iconUrl}
                                alt={chainConfig.tokenSymbol}
                                className="h-5 w-5 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-600 text-[10px]">
                                {chainConfig.tokenSymbol.slice(0, 2)}
                              </div>
                            )}
                            {chainBalance.toFixed(4)}
                            <button
                              onClick={handleManualRefresh}
                              className="ml-1 p-1 rounded-full hover:bg-white/10 transition-colors"
                              title="Refresh balance"
                            >
                              <FaSync
                                size={12}
                                className={`text-neutral-400 hover:text-white ${isPollingBalance ? 'animate-spin' : ''}`}
                              />
                            </button>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
                            {chainConfig.tokenSymbol} Balance
                            {isPollingBalance && (
                              <span className="text-[#18c48c] text-[10px]">
                                • Monitoring for deposits
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* QR Code */}
                    <div className="flex flex-col items-center py-6">
                      {qrCodeDataUrl ? (
                        <div className="rounded-3xl bg-white p-4">
                          <img
                            src={qrCodeDataUrl}
                            alt="Deposit Address QR Code"
                            className="h-64 w-64 rounded-2xl"
                          />
                        </div>
                      ) : (
                        <div className="flex h-64 w-64 items-center justify-center rounded-3xl bg-neutral-800">
                          <span className="text-neutral-400">
                            Generating QR...
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Address Display */}
                    <div className="space-y-2">
                      <div className="w-full rounded-3xl bg-[#0a0b0f] p-4 text-center font-mono text-sm break-all text-[#E6E7EA]">
                        {depositAddress}
                      </div>

                      {/* Caution Message */}
                      <div className="bg-[rgba(217,119,6,0.1)] flex gap-3 rounded-3xl border border-[#d97706] p-4">
                        <div className="mt-0.5 flex-shrink-0">
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="text-[#d97706]"
                          >
                            <circle
                              cx="12"
                              cy="12"
                              r="10"
                              fill="currentColor"
                            />
                            <path
                              d="M12 8v4m0 4h.01"
                              stroke="#1a1b20"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                        <div className="text-sm leading-relaxed text-[#fbbf24]">
                          <span className="font-semibold">Caution: </span>
                          This address only supports {
                            chainConfig.tokenSymbol
                          }{" "}
                          deposits via the {chainConfig.networkName} network.
                          Please do not use other networks to avoid any loss of
                          funds.
                        </div>
                      </div>

                      {/* Copy Button */}
                      <button
                        onClick={() => copyToClipboard(depositAddress)}
                        className="w-full rounded-3xl bg-[#E8E9EB] py-4 text-base font-semibold text-black transition-all duration-200 hover:opacity-90"
                      >
                        Copy Address
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-yellow-500/30 bg-yellow-900/20 p-6 text-center">
                    <div className="mb-3 text-sm text-yellow-400">
                      No deposit address found for your account
                    </div>
                    <div className="text-xs text-neutral-400">
                      Please contact support to set up your deposit address
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Buy Tab */}
            {activeTab === "buy" && (
              <div className="space-y-6">
                <div className="rounded-3xl border border-[#2A2B33] bg-[#0a0b0f] p-6">
                  <div className="mb-6">
                    <div className="mb-3 flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-white">
                        Buy {tokenSymbol} with Card
                      </h3>
                      <div className="bg-[rgba(24,196,140,0.15)] flex items-center gap-1.5 rounded-full px-2.5 py-1">
                        <img
                          src="/onramper.svg"
                          alt="Onramper"
                          className="h-3 opacity-90 brightness-0 invert"
                        />
                      </div>
                    </div>
                    <p className="text-sm text-neutral-400">
                      Purchase {tokenSymbol} using your credit or debit card
                      through Onramper
                    </p>
                  </div>

                  {depositAddress ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border-1 border-[#2A2B33] bg-[#1a1b20] p-4">
                        <div className="mb-1 text-xs text-neutral-400">
                          Delivery Address
                        </div>
                        <div className="font-mono text-sm break-all text-neutral-300">
                          {depositAddress}
                        </div>
                      </div>

                      <button
                        onClick={showOnramper}
                        className="flex w-full items-center justify-center gap-2 rounded-3xl bg-[#18c48c] py-4 text-base font-semibold text-black transition-all duration-200 hover:opacity-90"
                      >
                        <img
                          src="/onramper.svg"
                          alt="Onramper"
                          className="h-4"
                        />
                        <span>Buy {tokenSymbol}</span>
                      </button>

                      <div className="bg-[rgba(59,130,246,0.1)] flex gap-3 rounded-3xl border border-[#3b82f6] p-4">
                        <div className="mt-0.5 flex-shrink-0">
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="text-[#3b82f6]"
                          >
                            <circle
                              cx="12"
                              cy="12"
                              r="10"
                              fill="currentColor"
                            />
                            <path
                              d="M12 8v4m0 4h.01"
                              stroke="#1a1b20"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                        <div className="text-sm leading-relaxed text-[#60a5fa]">
                          <span className="font-semibold">Note: </span>
                          You will be redirected to Onramper to complete your
                          purchase. {tokenSymbol} will be sent directly to your
                          Interstate wallet address.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-yellow-500/30 bg-yellow-900/20 p-6 text-center">
                      <div className="text-sm text-yellow-400">
                        Please login first to buy {tokenSymbol}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-neutral-500">
                  <span className="flex items-center gap-1.5">
                    Powered by
                    <img
                      src="/onramper.svg"
                      alt="Onramper"
                      className="h-2.5 opacity-60"
                    />
                    • Secure payment processing
                  </span>
                  <a
                    href="https://onramper.com/help/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-neutral-400 transition-colors hover:text-neutral-300"
                    title="Need help? Contact Onramper support"
                  >
                    <FaQuestionCircle size={14} />
                  </a>
                </div>
              </div>
            )}

            {/* Withdraw Tab */}
            {activeTab === "withdraw" && (
              <div className="space-y-6">
                {withdrawView === "form" ? (
                  <>
                    {/* Wallet Info Box */}
                    <div className="rounded-3xl border border-[#2A2B33] bg-[#0a0b0f] p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="mb-1 text-xs text-neutral-400">
                            Available Balance
                          </div>
                          <div className="flex items-center gap-2 text-2xl font-bold text-white">
                            {chainConfig.iconUrl ? (
                              <img
                                src={chainConfig.iconUrl}
                                alt={tokenSymbol}
                                className="h-5 w-5 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-600 text-[10px]">
                                {tokenSymbol.slice(0, 2)}
                              </div>
                            )}
                            {chainBalance.toFixed(4)} {tokenSymbol}
                          </div>
                        </div>
                        <button
                          onClick={() => setWithdrawView("history")}
                          className="flex items-center gap-2 rounded-lg border border-[#2A2B33] bg-[#0f1012] px-3 py-2 text-sm font-medium text-white transition-all duration-200"
                        >
                          <FaHistory size={14} />
                          History
                        </button>
                      </div>
                    </div>

                    {/* Withdraw Form */}
                    <div className="space-y-4">
                      {/* Amount Input */}
                      <div>
                        <label className="mb-2 block text-sm font-medium text-neutral-300">
                          Amount ({tokenSymbol})
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                            placeholder="0.0000"
                            step="0.0001"
                            min="0"
                            className="w-full rounded-xl border border-[#2A2B33] bg-[#0a0b0f] px-4 py-3 text-white placeholder-neutral-500 focus:ring-2 focus:ring-[#18c48c] focus:outline-none"
                          />
                          <button
                            onClick={handleMaxClick}
                            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg bg-[#18c48c] px-3 py-1 text-xs font-semibold text-black transition-all"
                          >
                            MAX
                          </button>
                        </div>
                        <div className="mt-1 text-xs text-neutral-400">
                          Gas Fee: {withdrawalFee.toFixed(4)} {tokenSymbol} • Min:{" "}
                          {MIN_WITHDRAWAL} {tokenSymbol} • Max: {MAX_WITHDRAWAL}{" "}
                          {tokenSymbol}
                        </div>
                      </div>

                      {/* Destination Address */}
                      <div>
                        <label className="mb-2 block text-sm font-medium text-neutral-300">
                          Destination Address
                        </label>
                        <input
                          type="text"
                          value={destinationAddress}
                          onChange={(e) =>
                            setDestinationAddress(e.target.value)
                          }
                          placeholder={`Enter ${networkName} wallet address`}
                          className="w-full rounded-xl border border-[#2A2B33] bg-[#0a0b0f] px-4 py-3 font-mono text-sm text-white placeholder-neutral-500 focus:ring-2 focus:outline-none"
                        />
                      </div>

                      {/* Summary */}
                      {withdrawAmount && numericWithdrawAmount > 0 && (
                        <div className="rounded-2xl border border-[#2A2B33] bg-[#0a0b0f] p-4">
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-neutral-400">Amount</span>
                              <span className="text-white">
                                {numericWithdrawAmount.toFixed(4)} {tokenSymbol}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-neutral-400">
                                Network Fee
                              </span>
                              <span className="text-white">
                                {withdrawalFee.toFixed(4)} {tokenSymbol}
                              </span>
                            </div>
                            <div className="border-t border-[#2A2B33] pt-2">
                              <div className="flex justify-between font-semibold">
                                <span className="text-neutral-300">
                                  Total Deducted
                                </span>
                                <span className="text-white">
                                  {totalWithdrawalAmount.toFixed(4)}{" "}
                                  {tokenSymbol}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Messages */}
                      {withdrawMessage && (
                        <div
                          className={`rounded-3xl border p-4 ${withdrawMessage.type === "success" ? "bg-[rgba(24,196,140,0.1)] border-[#18c48c]" : "bg-[rgba(251,146,60,0.1)] border-[#fb923c]"}`}
                        >
                          <div className="flex gap-3">
                            <div className="flex-shrink-0">
                              {withdrawMessage.type === "success" ? (
                                <FaCheckCircle
                                  className="text-[#18c48c]"
                                  size={20}
                                />
                              ) : (
                                <FaExclamationCircle
                                  className="text-orange-400"
                                  size={20}
                                />
                              )}
                            </div>
                            <div
                              className={`text-sm ${withdrawMessage.type === "success" ? "text-[#18c48c]" : "text-[#fb923c]"}`}
                            >
                              {withdrawMessage.text}
                            </div>
                          </div>
                          {txSignature && (() => {
                            const txChain = getTransactionChain(txSignature);
                            const explorer = getExplorerInfo(txChain, txSignature);
                            return (
                              <a
                                href={explorer.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 flex items-center gap-1 text-xs text-[#18c48c] transition-opacity hover:opacity-80"
                              >
                                View on {explorer.name}{" "}
                                <FaExternalLinkAlt size={10} />
                              </a>
                            );
                          })()}
                        </div>
                      )}

                      {/* Withdraw Button */}
                      <button
                        onClick={handleWithdraw}
                        disabled={
                          isWithdrawLoading ||
                          !withdrawAmount ||
                          !destinationAddress ||
                          numericWithdrawAmount <= 0 ||
                          numericWithdrawAmount < MIN_WITHDRAWAL ||
                          numericWithdrawAmount > MAX_WITHDRAWAL ||
                          totalWithdrawalAmount > chainBalance
                        }
                        className="w-full rounded-3xl bg-[#E8E9EB] py-4 text-base font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isWithdrawLoading
                          ? "Processing..."
                          : `Withdraw ${tokenSymbol}`}
                      </button>

                      {/* Warning */}
                      <div className="bg-[rgba(217,119,6,0.1)] flex gap-3 rounded-3xl border border-[#d97706] p-4">
                        <div className="mt-0.5 flex-shrink-0">
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="text-[#d97706]"
                          >
                            <circle
                              cx="12"
                              cy="12"
                              r="10"
                              fill="currentColor"
                            />
                            <path
                              d="M12 8v4m0 4h.01"
                              stroke="#1a1b20"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                        <div className="text-sm leading-relaxed text-[#fbbf24]">
                          <span className="font-semibold">Important: </span>
                          Double-check the destination address. Transactions
                          cannot be reversed.
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* History View */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-white">
                          Withdrawal History
                        </h3>
                        <button
                          onClick={() => setWithdrawView("form")}
                          className="flex items-center gap-2 rounded-lg border border-[#2A2B33] bg-[#0f1012] px-3 py-2 text-sm font-medium text-white transition-all duration-200"
                        >
                          ← Back
                        </button>
                      </div>

                      {historyLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="text-neutral-400">
                            Loading history...
                          </div>
                        </div>
                      ) : history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <FaHistory
                            className="mb-4 text-neutral-600"
                            size={48}
                          />
                          <p className="text-neutral-400">
                            No withdrawal history yet
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {history.map((tx) => (
                            <div
                              key={tx.id}
                              className="rounded-2xl border-[#2A2B33] bg-[#0a0b0f] p-4"
                            >
                              <div className="mb-2 flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  {tx.status === "completed" && (
                                    <FaCheckCircle
                                      className="text-[#18c48c]"
                                      size={16}
                                    />
                                  )}
                                  {tx.status === "pending" && (
                                    <FaClock
                                      className="text-yellow-400"
                                      size={16}
                                    />
                                  )}
                                  {tx.status === "failed" && (
                                    <FaExclamationCircle
                                      className="text-orange-400"
                                      size={16}
                                    />
                                  )}
                                  <span className="font-semibold text-white">
                                    {typeof tx.amount === "string"
                                      ? parseFloat(tx.amount).toFixed(4)
                                      : tx.amount.toFixed(4)}{" "}
                                    {tokenSymbol}
                                  </span>
                                </div>
                                <span
                                  className={`rounded-full px-2 py-1 text-xs ${
                                    tx.status === "completed"
                                      ? "bg-[#18c48c]/20 text-[#18c48c]"
                                      : tx.status === "pending"
                                        ? "bg-yellow-400/20 text-yellow-400"
                                        : "bg-orange-400/20 text-orange-400"
                                  }`}
                                >
                                  {tx.status.charAt(0).toUpperCase() +
                                    tx.status.slice(1)}
                                </span>
                              </div>
                              {tx.destinationAddress && (
                                <div className="mb-1 font-mono text-xs text-neutral-400">
                                  To: {tx.destinationAddress.slice(0, 6)}...
                                  {tx.destinationAddress.slice(-4)}
                                </div>
                              )}
                              <div className="text-xs text-neutral-500">
                                {new Date(tx.createdAt).toLocaleString()}
                              </div>
                              {tx.txSignature && (() => {
                                const txChain = getTransactionChain(tx.txSignature);
                                const explorer = getExplorerInfo(txChain, tx.txSignature);
                                return (
                                  <a
                                    href={explorer.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 flex items-center gap-1 text-xs text-[#18c48c] transition-opacity hover:opacity-80"
                                  >
                                    View on {explorer.name}{" "}
                                    <FaExternalLinkAlt size={10} />
                                  </a>
                                );
                              })()}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default DepositModal;
