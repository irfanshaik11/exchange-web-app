"use client";

import React, { useEffect, useState } from "react";
import { FaCopy, FaTimes, FaQuestionCircle, FaHistory, FaExternalLinkAlt, FaCheckCircle, FaClock, FaExclamationCircle } from "react-icons/fa";
import Cookies from "js-cookie";
import QRCode from "qrcode";
import { useUser } from "./UserContext";
import toast from "react-hot-toast";
import { withdrawSOL, getWithdrawalHistory, getWithdrawalFee } from "~/utils/api";
import { env } from "~/env";

// No additional window interfaces needed

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: TabType;
  selectedChain?: string;
}

type TabType = 'convert' | 'deposit' | 'buy' | 'withdraw';

interface WithdrawalTransaction {
  id: number;
  amount: number | string;
  destinationAddress?: string;
  txSignature?: string;
  status: 'pending' | 'completed' | 'failed';
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
    iconUrl: "https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1",
  },
  eth: {
    tokenSymbol: "ETH",
    networkName: "Ethereum",
    iconUrl:
      "https://s2.coinmarketcap.com/static/img/coins/200x200/1027.png",
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
    iconUrl:
      "https://avatars.githubusercontent.com/u/108554348?s=280&v=4",
  },
};

const DepositModal: React.FC<DepositModalProps> = ({
  open,
  onClose,
  initialTab = 'deposit',
  selectedChain = 'sol',
}) => {
  const { user, loading: userLoading, refreshUser, refreshBalance, solBalance, chainBalances } = useUser();
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [primaryWalletAddresses, setPrimaryWalletAddresses] = useState<{
    solana: string | null;
    ethereum: string | null;
  }>({ solana: null, ethereum: null });
  const [primaryWalletLabel, setPrimaryWalletLabel] = useState<string | null>(null);
  const [primaryWalletLoading, setPrimaryWalletLoading] = useState(false);
  const [walletsRefreshKey, setWalletsRefreshKey] = useState(0);
  
  // Withdraw tab states
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [isWithdrawLoading, setIsWithdrawLoading] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [withdrawalFee, setWithdrawalFee] = useState<number>(0.0005);
  const [withdrawView, setWithdrawView] = useState<'form' | 'history'>('form');
  const [history, setHistory] = useState<WithdrawalTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  const MIN_WITHDRAWAL = 0.001;
  const MAX_WITHDRAWAL = 100;
  const minimumReserve = 0.00139;

  const chainConfig = CHAIN_CONFIG[selectedChain] ?? CHAIN_CONFIG.sol;
  const tokenSymbol = chainConfig.tokenSymbol;
  const networkName = chainConfig.networkName;
  const isSolChain = selectedChain === 'sol';
  const chainBalance =
    selectedChain === 'sol'
      ? chainBalances[selectedChain] ?? solBalance
      : chainBalances[selectedChain] ?? 0;
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
    selectedChain === 'sol'
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

  const copyToClipboard = (text: string) => {
    if (!text) {
      toast.error("No address available to copy", {
        duration: 2000,
        style: {
          background: '#1E1F26',
          color: '#E6E7EA',
          border: '1px solid #ff6b6b',
        }
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
              background: '#1E1F26',
              color: '#E6E7EA',
              border: '1px solid #18c48c',
            }
          });
          setTimeout(() => setCopied(false), 2000);
        })
        .catch((err) => {
          console.error("Clipboard write failed:", err);
          toast.error("Failed to copy address", {
            duration: 2000,
            style: {
              background: '#1E1F26',
              color: '#E6E7EA',
              border: '1px solid #ff6b6b',
            }
          });
        });
    } else {
      console.warn("Clipboard API not available.");
    }
  };

  // Fetch withdrawal fee when withdraw tab is active
  useEffect(() => {
    if (activeTab === 'withdraw' && open) {
      fetchWithdrawalFee();
    }
  }, [activeTab, open, selectedChain]);

  // Reset withdraw form when modal closes or tab changes
  useEffect(() => {
    if (!open || activeTab !== 'withdraw') {
      setWithdrawAmount("");
      setDestinationAddress("");
      setWithdrawMessage(null);
      setTxSignature(null);
      setWithdrawView('form');
    }
  }, [open, activeTab]);

  // Fetch history when switching to history view
  useEffect(() => {
    if (withdrawView === 'history' && user?.bearerToken && activeTab === 'withdraw') {
      fetchHistory();
    }
  }, [withdrawView, user?.bearerToken, activeTab]);

  const fetchWithdrawalFee = async () => {
    try {
      const feeData = await getWithdrawalFee(selectedChain);
      const fee =
        typeof feeData === "number"
          ? feeData
          : (feeData as any)?.fee ?? withdrawalFee;
      setWithdrawalFee(fee);
    } catch (error) {
      console.error("Failed to fetch withdrawal fee:", error);
      // quietly keep prior fallback without surfacing an error toast
    }
  };

  // Trigger wallet refresh whenever other parts of the app dispatch the event
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleWalletsUpdated = () => {
      setWalletsRefreshKey((key) => key + 1);
    };
    window.addEventListener("wallets-updated", handleWalletsUpdated);
    return () => {
      window.removeEventListener("wallets-updated", handleWalletsUpdated);
    };
  }, []);

  // Fetch the user's primary wallet so deposits go to the right address
  useEffect(() => {
    if (!user?.id || !user?.bearerToken) {
      setPrimaryWalletAddresses({ solana: null, ethereum: null });
      setPrimaryWalletLabel(null);
      return;
    }

    let aborted = false;
    const fetchPrimaryWallet = async () => {
      setPrimaryWalletLoading(true);
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/wallet`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${user.bearerToken}`,
            },
          }
        );

        if (!res.ok) {
          throw new Error(`Failed to load wallets: ${res.status}`);
        }

        const data = await res.json();
        const wallets: Array<{
          address?: string;
          solanaAddress?: string;
          ethereumAddress?: string;
          label?: string | null;
          isPrimary?: boolean;
        }> =
          Array.isArray(data?.wallets) ? data.wallets : [];
        const primary = wallets.find((w) => w.isPrimary) ?? wallets[0];

        if (!aborted) {
          const solanaAddr =
            typeof primary?.solanaAddress === "string" && primary.solanaAddress.length > 0
              ? primary.solanaAddress
              : typeof primary?.address === "string"
              ? primary.address
              : null;
          const ethAddr =
            typeof primary?.ethereumAddress === "string" && primary.ethereumAddress.length > 0
              ? primary.ethereumAddress
              : null;
          setPrimaryWalletAddresses({
            solana: solanaAddr,
            ethereum: ethAddr,
          });
          setPrimaryWalletLabel(primary?.label ?? null);
        }
      } catch (error) {
        console.error("Failed to fetch primary wallet:", error);
        if (!aborted) {
          setPrimaryWalletAddresses((prev) => ({
            solana: prev.solana ?? user?.publicKey ?? null,
            ethereum: prev.ethereum,
          }));
        }
      } finally {
        if (!aborted) {
          setPrimaryWalletLoading(false);
        }
      }
    };

    fetchPrimaryWallet();
    return () => {
      aborted = true;
    };
  }, [user?.id, user?.bearerToken, user?.publicKey, walletsRefreshKey]);

  const fetchHistory = async () => {
    if (!user?.bearerToken) return;
    
    setHistoryLoading(true);
    try {
      const data = await getWithdrawalHistory(user.bearerToken);
      const transactions = (data as any).transactions || data || [];
      setHistory(Array.isArray(transactions) ? transactions : []);
    } catch (error) {
      console.error('Failed to fetch withdrawal history:', error);
      toast.error("Failed to load withdrawal history", {
        duration: 2000,
        style: {
          background: '#1E1F26',
          color: '#E6E7EA',
          border: '1px solid #ff6b6b',
        }
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleMaxClick = () => {
    const maxAmount = Math.max(0, chainBalance - minimumReserve);
    setWithdrawAmount(maxAmount.toFixed(4));
  };

  const handleWithdraw = async () => {
    if (!user?.bearerToken) {
      setWithdrawMessage({ type: "error", text: "User not logged in." });
      return;
    }

    const amount = Number(withdrawAmount);
    if (!amount || amount <= 0) {
      setWithdrawMessage({ type: "error", text: "Enter a valid withdrawal amount." });
      return;
    }

    if (amount < MIN_WITHDRAWAL) {
      setWithdrawMessage({ type: "error", text: `Minimum withdrawal is ${MIN_WITHDRAWAL} ${tokenSymbol}.` });
      return;
    }

    if (amount > MAX_WITHDRAWAL) {
      setWithdrawMessage({ type: "error", text: `Maximum withdrawal is ${MAX_WITHDRAWAL} ${tokenSymbol} per transaction.` });
      return;
    }

    const totalRequired = amount + withdrawalFee;
    if (totalRequired > chainBalance) {
      setWithdrawMessage({
        type: "error",
        text: `Insufficient balance. You need ${totalRequired.toFixed(4)} ${tokenSymbol} (including ${withdrawalFee.toFixed(4)} ${tokenSymbol} fee).`,
      });
      return;
    }

    if (!destinationAddress.trim()) {
      setWithdrawMessage({ type: "error", text: "Enter a destination address." });
      return;
    }

    if (isSolChain) {
      if (destinationAddress.length < 32 || destinationAddress.length > 44) {
        setWithdrawMessage({ type: "error", text: "Invalid Solana address format." });
        return;
      }
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
      if (!base58Regex.test(destinationAddress)) {
        setWithdrawMessage({ type: "error", text: "Invalid Solana address format." });
        return;
      }
    } else {
      const evmRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!evmRegex.test(destinationAddress)) {
        setWithdrawMessage({ type: "error", text: "Invalid EVM address format (expected 0x...)."});
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
      
      const isSuccess = result?.txSignature || result?.message?.toLowerCase().includes("withdraw");
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
      const errorMessage = error?.message || "An error occurred during withdrawal.";
      setWithdrawMessage({ type: "error", text: errorMessage });
      
      toast.error(errorMessage, {
        duration: 3000,
        style: {
          background: '#1E1F26',
          color: '#E6E7EA',
          border: '1px solid #ff6b6b',
        }
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
          background: '#1E1F26',
          color: '#E6E7EA',
          border: '1px solid #ff6b6b',
        }
      });
      return;
    }

    try {
      // Construct Onramper widget URL
      const onramperUrl = "https://buy.onramper.com/?apiKey=pk_prod_01KB0GV0SYGKAC64C5QRJPD5DZ&wallets=sol:Hq6QEefod4MwtyZk13im7AVa4YrCkNLNzr6GpKBG9RUd&defaultCrypto=sol&defaultAmount=100&themeName=dark&containerColor=1a1b20&primaryColor=18c48c&secondaryColor=2A2D35&cardColor=0a0b0f&primaryTextColor=ffffff&secondaryTextColor=E6E7EA"
      
      // Open in new window
      const width = 500;
      const height = 700;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;
      
      window.open(
        onramperUrl.toString(),
        'Onramper',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );
    } catch (error) {
      console.error("Error showing Onramper:", error);
      toast.error("Failed to load Onramper widget", {
        duration: 2000,
        style: {
          background: '#1E1F26',
          color: '#E6E7EA',
          border: '1px solid #ff6b6b',
        }
      });
    }
  };

  if (!open && !show) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[9998] bg-black/60 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-[9999] w-full max-w-[480px] transform transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ backgroundColor: "#1a1b20" }}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#2A2B33" }}>
            <h2 className="text-2xl font-bold text-white">
              {activeTab === 'convert' ? 'Convert' : activeTab === 'deposit' ? 'Deposit' : activeTab === 'buy' ? 'Buy' : 'Withdraw'}
            </h2>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white transition-colors"
            >
              <FaTimes size={24} />
            </button>
          </div>

          {/* Tabs */}
          <div className="px-6 pt-6 pb-3">
            <div 
              className="flex gap-2 p-1 rounded-2xl" 
              style={{ backgroundColor: "#0a0b0f" }}
            >
              <button
                onClick={() => setActiveTab('convert')}
                className={`flex-1 py-3 px-4 rounded-xl text-base font-medium transition-all duration-200 ${
                  activeTab === 'convert' 
                    ? 'text-white' 
                    : 'text-neutral-400 hover:text-neutral-300'
                }`}
                style={{
                  backgroundColor: activeTab === 'convert' ? '#2A2D35' : 'transparent'
                }}
              >
                Convert
              </button>
              <button
                onClick={() => setActiveTab('deposit')}
                className={`flex-1 py-3 px-4 rounded-xl text-base font-medium transition-all duration-200 ${
                  activeTab === 'deposit' 
                    ? 'text-white' 
                    : 'text-neutral-400 hover:text-neutral-300'
                }`}
                style={{
                  backgroundColor: activeTab === 'deposit' ? '#2A2D35' : 'transparent'
                }}
              >
                Deposit
              </button>
              <button
                onClick={() => setActiveTab('buy')}
                className={`flex-1 py-3 px-4 rounded-xl text-base font-medium transition-all duration-200 ${
                  activeTab === 'buy' 
                    ? 'text-white' 
                    : 'text-neutral-400 hover:text-neutral-300'
                }`}
                style={{
                  backgroundColor: activeTab === 'buy' ? '#2A2D35' : 'transparent'
                }}
              >
                Buy
              </button>
              <button
                onClick={() => setActiveTab('withdraw')}
                className={`flex-1 py-3 px-4 rounded-xl text-base font-medium transition-all duration-200 ${
                  activeTab === 'withdraw' 
                    ? 'text-white' 
                    : 'text-neutral-400 hover:text-neutral-300'
                }`}
                style={{
                  backgroundColor: activeTab === 'withdraw' ? '#2A2D35' : 'transparent'
                }}
              >
                Withdraw
              </button>
            </div>
          </div>

          {/* Subtitle */}
          <div className="px-6 pb-3 text-neutral-400 text-sm">
            {activeTab === 'convert' && 'Swap between cryptocurrencies'}
            {activeTab === 'deposit' &&
              `Deposit ${tokenSymbol} to your Narrative wallet`}
            {activeTab === 'buy' && `Buy ${tokenSymbol} with fiat currency`}
            {activeTab === 'withdraw' && `Withdraw ${tokenSymbol} to an external wallet`}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {/* Convert Tab */}
            {activeTab === 'convert' && (
              <div className="space-y-4">
                {/* Onramper Swap Widget */}
                <div className="rounded-3xl overflow-hidden border" style={{ borderColor: "#2A2B33" }}>
                  <iframe
                    src={`https://buy.onramper.com/?apiKey=pk_prod_01KB0GV0SYGKAC64C5QRJPD5DZ&wallets=sol:Hq6QEefod4MwtyZk13im7AVa4YrCkNLNzr6GpKBG9RUd&defaultCrypto=sol&defaultAmount=100&themeName=dark&containerColor=1a1b20&primaryColor=18c48c&secondaryColor=2A2D35&cardColor=0a0b0f&primaryTextColor=ffffff&secondaryTextColor=E6E7EA`}
                    title="Onramper Swap"
                    className="w-full"
                    style={{
                      height: '600px',
                      border: 'none',
                      backgroundColor: '#0a0b0f'
                    }}
                    allow="payment"
                  />
                </div>
                
                {/* Info Box */}
                <div className="flex gap-3 p-4 rounded-3xl" style={{ backgroundColor: "rgba(59, 130, 246, 0.1)", borderColor: "#3b82f6", border: "1px solid" }}>
                  <div className="flex-shrink-0 mt-0.5">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#3b82f6" }}>
                      <circle cx="12" cy="12" r="10" fill="currentColor" />
                      <path d="M12 8v4m0 4h.01" stroke="#1a1b20" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="text-sm leading-relaxed" style={{ color: "#60a5fa" }}>
                    <span className="font-semibold">Note: </span>
                    Swap between cryptocurrencies using Onramper. The output will be delivered directly to your wallet.
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
            {activeTab === 'deposit' && (
              <>
                {userLoading || primaryWalletLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-neutral-400">Loading wallet data...</div>
                  </div>
                ) : !user ? (
                  <div className="rounded-3xl border border-orange-500/30 bg-orange-900/20 p-6 text-center">
                    <div className="text-sm text-orange-400">Please login first to view your deposit address</div>
                    {Cookies.get("token") && (
                      <button
                        onClick={refreshUser}
                        className="mt-4 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-3xl transition-colors"
                      >
                        Refresh User Data
                      </button>
                    )}
                  </div>
                ) : depositAddress ? (
              <div className="space-y-6">
                {/* Wallet Info Box */}
                <div className="rounded-3xl border p-4" style={{ backgroundColor: "#0a0b0f", borderColor: "#2A2B33" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-neutral-400 mb-1">{primaryWalletLabel || "Narrative Wallet"}</div>
                      <div className="text-sm text-neutral-300 font-mono">
                        {depositAddress.slice(0, 4)}...{depositAddress.slice(-4)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 text-2xl font-bold text-white">
                        {chainConfig.iconUrl ? (
                          <img
                            src={chainConfig.iconUrl}
                            alt={chainConfig.tokenSymbol}
                            className="w-5 h-5 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-neutral-600 flex items-center justify-center text-[10px]">
                            {chainConfig.tokenSymbol.slice(0, 2)}
                          </div>
                        )}
                        {chainBalance.toFixed(4)}
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        {chainConfig.tokenSymbol} Balance
                      </div>
                    </div>
                  </div>
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center py-6">
                  {qrCodeDataUrl ? (
                    <div className="p-4 bg-white rounded-3xl">
                      <img 
                        src={qrCodeDataUrl} 
                        alt="Deposit Address QR Code" 
                        className="w-64 h-64 rounded-2xl"
                      />
                    </div>
                  ) : (
                    <div className="flex h-64 w-64 items-center justify-center rounded-3xl bg-neutral-800">
                      <span className="text-neutral-400">Generating QR...</span>
                    </div>
                  )}
                </div>

                {/* Address Display */}
                <div className="space-y-2">
                  <div 
                    className="w-full p-4 rounded-3xl text-center break-all font-mono text-sm"
                    style={{ backgroundColor: "#0a0b0f", color: "#E6E7EA" }}
                  >
                    {depositAddress}
                  </div>

                  {/* Caution Message */}
                  <div className="flex gap-3 p-4 rounded-3xl" style={{ backgroundColor: "rgba(217, 119, 6, 0.1)", borderColor: "#d97706", border: "1px solid" }}>
                    <div className="flex-shrink-0 mt-0.5">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#d97706" }}>
                        <circle cx="12" cy="12" r="10" fill="currentColor" />
                        <path d="M12 8v4m0 4h.01" stroke="#1a1b20" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="text-sm leading-relaxed" style={{ color: "#fbbf24" }}>
                      <span className="font-semibold">Caution: </span>
                      This address only supports {chainConfig.tokenSymbol} deposits via the {chainConfig.networkName} network. Please do not use other networks to avoid any loss of funds.
                  </div>
                  </div>

                  {/* Copy Button */}
                  <button
                    onClick={() => copyToClipboard(depositAddress)}
                    className="w-full py-4 rounded-3xl font-semibold text-base transition-all duration-200 hover:opacity-90"
                    style={{ backgroundColor: "#E8E9EB", color: "#000000" }}
                  >
                    Copy Address
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-yellow-500/30 bg-yellow-900/20 p-6 text-center">
                <div className="mb-3 text-sm text-yellow-400">No deposit address found for your account</div>
                <div className="text-xs text-neutral-400">Please contact support to set up your deposit address</div>
              </div>
            )}
              </>
            )}

            {/* Buy Tab */}
            {activeTab === 'buy' && (
              <div className="space-y-6">
                <div className="rounded-3xl border p-6" style={{ backgroundColor: "#0a0b0f", borderColor: "#2A2B33" }}>
                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-semibold text-white">Buy {tokenSymbol} with Card</h3>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(24, 196, 140, 0.15)" }}>
                        <img 
                          src="/onramper.svg" 
                          alt="Onramper" 
                          className="h-3 opacity-90"
                          style={{ filter: 'brightness(0) invert(1)' }}
                        />
                      </div>
                    </div>
                    <p className="text-sm text-neutral-400">
                      Purchase {tokenSymbol} using your credit or debit card through Onramper
                    </p>
                  </div>

                  {depositAddress ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl p-4" style={{ backgroundColor: "#1a1b20", borderColor: "#2A2B33", border: "1px solid" }}>
                        <div className="text-xs text-neutral-400 mb-1">Delivery Address</div>
                        <div className="text-sm text-neutral-300 font-mono break-all">
                          {depositAddress}
                        </div>
                      </div>

                      <button
                        onClick={showOnramper}
                        className="w-full py-4 rounded-3xl font-semibold text-base transition-all duration-200 hover:opacity-90 flex items-center justify-center gap-2"
                        style={{ backgroundColor: "#18c48c", color: "#000000" }}
                      >
                        <img 
                          src="/onramper.svg" 
                          alt="Onramper" 
                          className="h-4"
                        />
                        <span>Buy {tokenSymbol}</span>
                      </button>

                      <div className="flex gap-3 p-4 rounded-3xl" style={{ backgroundColor: "rgba(59, 130, 246, 0.1)", borderColor: "#3b82f6", border: "1px solid" }}>
                        <div className="flex-shrink-0 mt-0.5">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#3b82f6" }}>
                            <circle cx="12" cy="12" r="10" fill="currentColor" />
                            <path d="M12 8v4m0 4h.01" stroke="#1a1b20" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </div>
                        <div className="text-sm leading-relaxed" style={{ color: "#60a5fa" }}>
                          <span className="font-semibold">Note: </span>
                          You will be redirected to Onramper to complete your purchase. {tokenSymbol} will be sent directly to your Narrative wallet address.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-yellow-500/30 bg-yellow-900/20 p-6 text-center">
                      <div className="text-sm text-yellow-400">Please login first to buy {tokenSymbol}</div>
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
                    className="inline-flex items-center gap-1 text-neutral-400 hover:text-neutral-300 transition-colors"
                    title="Need help? Contact Onramper support"
                  >
                    <FaQuestionCircle size={14} />
                  </a>
                </div>
              </div>
            )}

            {/* Withdraw Tab */}
            {activeTab === 'withdraw' && (
              <div className="space-y-6">
                {withdrawView === 'form' ? (
                  <>
                    {/* Wallet Info Box */}
                    <div className="rounded-3xl border p-4" style={{ backgroundColor: "#0a0b0f", borderColor: "#2A2B33" }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-neutral-400 mb-1">Available Balance</div>
                          <div className="text-2xl font-bold text-white flex items-center gap-2">
                            {chainConfig.iconUrl ? (
                              <img
                                src={chainConfig.iconUrl}
                                alt={tokenSymbol}
                                className="w-5 h-5 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-neutral-600 flex items-center justify-center text-[10px]">
                                {tokenSymbol.slice(0, 2)}
                              </div>
                            )}
                            {chainBalance.toFixed(4)} {tokenSymbol}
                          </div>
                        </div>
                        <button
                          onClick={() => setWithdrawView('history')}
                          className="px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2"
                          style={{
                            backgroundColor: "#0f1012",
                            color: "#ffffff",
                            border: "1px solid #2A2B33",
                          }}
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
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
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
                            className="w-full px-4 py-3 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#18c48c]"
                            style={{
                              backgroundColor: "#0a0b0f",
                              border: "1px solid #2A2B33",
                            }}
                          />
                          <button
                            onClick={handleMaxClick}
                            className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 text-xs font-semibold rounded-lg transition-all"
                            style={{
                              backgroundColor: "#18c48c",
                              color: "#000000",
                            }}
                          >
                            MAX
                          </button>
                        </div>
                        <div className="mt-1 text-xs text-neutral-400">
                          Fee: {withdrawalFee.toFixed(4)} {tokenSymbol} • Min: {MIN_WITHDRAWAL} {tokenSymbol} • Max: {MAX_WITHDRAWAL} {tokenSymbol}
                        </div>
                      </div>

                      {/* Destination Address */}
                      <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                          Destination Address
                        </label>
                        <input
                          type="text"
                          value={destinationAddress}
                          onChange={(e) => setDestinationAddress(e.target.value)}
                          placeholder={`Enter ${networkName} wallet address`}
                          className="w-full px-4 py-3 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 font-mono text-sm"
                          style={{
                            backgroundColor: "#0a0b0f",
                            border: "1px solid #2A2B33",
                          }}
                        />
                      </div>

                      {/* Summary */}
                      {withdrawAmount && numericWithdrawAmount > 0 && (
                        <div className="rounded-2xl p-4" style={{ backgroundColor: "#0a0b0f", border: "1px solid #2A2B33" }}>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-neutral-400">Amount</span>
                              <span className="text-white">{numericWithdrawAmount.toFixed(4)} {tokenSymbol}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-neutral-400">Network Fee</span>
                              <span className="text-white">{withdrawalFee.toFixed(4)} {tokenSymbol}</span>
                            </div>
                            <div className="border-t pt-2" style={{ borderColor: "#2A2B33" }}>
                              <div className="flex justify-between font-semibold">
                                <span className="text-neutral-300">Total Deducted</span>
                                <span className="text-white">{totalWithdrawalAmount.toFixed(4)} {tokenSymbol}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Messages */}
                      {withdrawMessage && (
                        <div 
                          className="rounded-3xl p-4"
                          style={{
                            backgroundColor: withdrawMessage.type === 'success' ? 'rgba(24, 196, 140, 0.1)' : 'rgba(251, 146, 60, 0.1)',
                            border: `1px solid ${withdrawMessage.type === 'success' ? '#18c48c' : '#fb923c'}`
                          }}
                        >
                          <div className="flex gap-3">
                            <div className="flex-shrink-0">
                              {withdrawMessage.type === 'success' ? (
                                <FaCheckCircle className="text-[#18c48c]" size={20} />
                              ) : (
                                <FaExclamationCircle className="text-orange-400" size={20} />
                              )}
                            </div>
                            <div className="text-sm" style={{ color: withdrawMessage.type === 'success' ? '#18c48c' : '#fb923c' }}>
                              {withdrawMessage.text}
                            </div>
                          </div>
                          {txSignature && (
                            <a
                              href={`https://solscan.io/tx/${txSignature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
                              style={{ color: '#18c48c' }}
                            >
                              View on Solscan <FaExternalLinkAlt size={10} />
                            </a>
                          )}
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
                        className="w-full py-4 rounded-3xl font-semibold text-base transition-all duration-200 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ backgroundColor: "#E8E9EB", color: "#000000" }}
                      >
                        {isWithdrawLoading ? 'Processing...' : `Withdraw ${tokenSymbol}`}
                      </button>

                      {/* Warning */}
                      <div className="flex gap-3 p-4 rounded-3xl" style={{ backgroundColor: "rgba(217, 119, 6, 0.1)", borderColor: "#d97706", border: "1px solid" }}>
                        <div className="flex-shrink-0 mt-0.5">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#d97706" }}>
                            <circle cx="12" cy="12" r="10" fill="currentColor" />
                            <path d="M12 8v4m0 4h.01" stroke="#1a1b20" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </div>
                        <div className="text-sm leading-relaxed" style={{ color: "#fbbf24" }}>
                          <span className="font-semibold">Important: </span>
                          Double-check the destination address. Transactions cannot be reversed.
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* History View */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-white">Withdrawal History</h3>
                        <button
                          onClick={() => setWithdrawView('form')}
                          className="px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2"
                          style={{
                            backgroundColor: "#0f1012",
                            color: "#ffffff",
                            border: "1px solid #2A2B33",
                          }}
                        >
                          ← Back
                        </button>
                      </div>

                      {historyLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="text-neutral-400">Loading history...</div>
                        </div>
                      ) : history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <FaHistory className="text-neutral-600 mb-4" size={48} />
                          <p className="text-neutral-400">No withdrawal history yet</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {history.map((tx) => (
                            <div
                              key={tx.id}
                              className="rounded-2xl p-4" 
                              style={{ backgroundColor: "#0a0b0f", border: "1px solid #2A2B33" }}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {tx.status === 'completed' && <FaCheckCircle className="text-[#18c48c]" size={16} />}
                                  {tx.status === 'pending' && <FaClock className="text-yellow-400" size={16} />}
                                  {tx.status === 'failed' && <FaExclamationCircle className="text-orange-400" size={16} />}
                                  <span className="text-white font-semibold">
                                    {typeof tx.amount === 'string' ? parseFloat(tx.amount).toFixed(4) : tx.amount.toFixed(4)} {tokenSymbol}
                                  </span>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                  tx.status === 'completed' ? 'bg-[#18c48c]/20 text-[#18c48c]' :
                                  tx.status === 'pending' ? 'bg-yellow-400/20 text-yellow-400' :
                                  'bg-orange-400/20 text-orange-400'
                                }`}>
                                  {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                                </span>
                              </div>
                              {tx.destinationAddress && (
                                <div className="text-xs text-neutral-400 font-mono mb-1">
                                  To: {tx.destinationAddress.slice(0, 6)}...{tx.destinationAddress.slice(-4)}
                                </div>
                              )}
                              <div className="text-xs text-neutral-500">
                                {new Date(tx.createdAt).toLocaleString()}
                              </div>
                              {tx.txSignature && (
                                <a
                                  href={`https://solscan.io/tx/${tx.txSignature}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-2 flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
                                  style={{ color: '#18c48c' }}
                                >
                                  View Transaction <FaExternalLinkAlt size={10} />
                                </a>
                              )}
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
