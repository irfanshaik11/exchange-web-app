"use client";

import React, { useState, useEffect } from "react";
import { FaTimes, FaCopy, FaHistory, FaArrowLeft, FaExternalLinkAlt, FaCheckCircle, FaClock, FaTimesCircle } from "react-icons/fa";
import InterstateButton from "./InterstateButton";
import InterstateTooltip from "./InterstateTooltip";
import { useUser } from "./UserContext";
import { withdrawSOL, getWithdrawalHistory, getWithdrawalFee } from "~/utils/api";
import toast from "react-hot-toast";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface WithdrawalTransaction {
  id: number;
  amount: number | string; // PostgreSQL DECIMAL returns as string
  destinationAddress?: string;
  txSignature?: string;
  status: 'pending' | 'completed' | 'failed';
  fee: number | string; // PostgreSQL DECIMAL returns as string
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

const WithdrawModal: React.FC<WithdrawModalProps> = ({ isOpen, onClose }) => {
  const { user, solBalance, refreshBalance } = useUser();
  const [view, setView] = useState<'form' | 'history'>('form');
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [history, setHistory] = useState<WithdrawalTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [withdrawalFee, setWithdrawalFee] = useState<number>(0.0005); // Dynamic fee, fallback to 0.0005
  const [rentExemptMinimum, setRentExemptMinimum] = useState<number>(0.00089); // Rent-exempt minimum
  const [minimumReserve, setMinimumReserve] = useState<number>(0.00139); // Fee + rent
  const [feeLoading, setFeeLoading] = useState(false);
  
  const MIN_WITHDRAWAL = 0.001;
  const MAX_WITHDRAWAL = 100;

  // Fetch dynamic withdrawal fee when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchWithdrawalFee();
    }
  }, [isOpen]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setWithdrawAmount("");
      setDestinationAddress("");
      setMessage(null);
      setTxSignature(null);
      setView('form');
    }
  }, [isOpen]);

  // Fetch history when switching to history view
  useEffect(() => {
    if (view === 'history' && user?.bearerToken) {
      fetchHistory();
    }
  }, [view, user?.bearerToken]);

  const fetchWithdrawalFee = async () => {
    setFeeLoading(true);
    try {
      const result = await getWithdrawalFee();
      setWithdrawalFee(result.fee);
      setRentExemptMinimum(result.rentExemptMinimum || 0.00089);
      setMinimumReserve(result.minimumReserve || (result.fee + (result.rentExemptMinimum || 0.00089)));
    } catch (error) {
      console.error("Failed to fetch withdrawal fee:", error);
      // Keep the fallback values
    } finally {
      setFeeLoading(false);
    }
  };

  const fetchHistory = async () => {
    if (!user?.bearerToken) return;
    
    setHistoryLoading(true);
    try {
      const result = await getWithdrawalHistory(user.bearerToken);
      setHistory(result.transactions);
    } catch (error: any) {
      console.error("Failed to fetch history:", error);
      toast.error("Failed to load withdrawal history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleMaxClick = () => {
    // Calculate max withdrawal using actual minimum reserve (fee + rent)
    const maxAmount = Math.max(0, solBalance - minimumReserve);
    setWithdrawAmount(maxAmount.toFixed(4));
  };

  const handleWithdraw = async () => {
    if (!user?.bearerToken) {
      setMessage({ type: "error", text: "User not logged in." });
      return;
    }

    const amount = Number(withdrawAmount);
    if (!amount || amount <= 0) {
      setMessage({ type: "error", text: "Enter a valid withdrawal amount." });
      return;
    }

    if (amount < MIN_WITHDRAWAL) {
      setMessage({ type: "error", text: `Minimum withdrawal is ${MIN_WITHDRAWAL} SOL.` });
      return;
    }

    if (amount > MAX_WITHDRAWAL) {
      setMessage({ type: "error", text: `Maximum withdrawal is ${MAX_WITHDRAWAL} SOL per transaction.` });
      return;
    }

    const totalRequired = amount + withdrawalFee;
    if (totalRequired > solBalance) {
      setMessage({ type: "error", text: `Insufficient balance. You need ${totalRequired.toFixed(4)} SOL (including ${withdrawalFee.toFixed(4)} SOL fee).` });
      return;
    }

    if (!destinationAddress.trim()) {
      setMessage({ type: "error", text: "Enter a destination address." });
      return;
    }

    // Basic Solana address validation (32-44 characters, base58)
    if (destinationAddress.length < 32 || destinationAddress.length > 44) {
      setMessage({ type: "error", text: "Invalid Solana address format." });
      return;
    }

    // Validate base58 characters
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    if (!base58Regex.test(destinationAddress)) {
      setMessage({ type: "error", text: "Invalid Solana address format." });
      return;
    }

    setIsLoading(true);
    setMessage(null);
    setTxSignature(null); // Reset previous signature

    try {
      // Call the actual withdrawal API
      const result = await withdrawSOL({
        amount: amount,
        destinationAddress: destinationAddress.trim(),
        chain: 'SOL',
      }, user.bearerToken);
      
      // Clear loading state immediately on success
      setIsLoading(false);
      
      // Store transaction signature immediately (transaction is sent, confirmation happens in background)
      if (result.txSignature) {
        setTxSignature(result.txSignature);
      }
      setMessage({
        type: "success",
        text: "Withdrawal complete!",
      });
      toast.success("Withdrawal complete!");
      
      // Refresh balance after successful withdrawal
      refreshBalance({ force: true });
      
      // Don't close modal - show success message and history button
      
    } catch (error: any) {
      console.warn("Withdrawal failed:", error);
      setIsLoading(false);
      const errorMessage = error.message || "❌ Withdrawal failed. Please try again.";
      setMessage({ type: "error", text: errorMessage });
      toast.error(errorMessage);
    }
  };

  const totalWithdrawalAmount = Number(withdrawAmount || 0) + withdrawalFee;
  const isFormValid = 
    withdrawAmount && 
    Number(withdrawAmount) >= MIN_WITHDRAWAL && 
    Number(withdrawAmount) <= MAX_WITHDRAWAL &&
    totalWithdrawalAmount <= solBalance && 
    destinationAddress.trim().length >= 32;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <FaCheckCircle className="text-green-500" />;
      case 'pending':
        return <FaClock className="text-yellow-500" />;
      case 'failed':
        return <FaTimesCircle className="text-red-500" />;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-lg border border-[#2A2B33] bg-[#1E1F26] shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2A2B33] p-4">
          <div className="flex items-center gap-2">
            {view === 'history' && (
              <button
                onClick={() => setView('form')}
                className="text-[#9CA3AF] hover:text-white transition-colors"
              >
                <FaArrowLeft size={16} />
              </button>
            )}
            <h3 className="text-lg font-semibold text-white">
              {view === 'form' ? 'Withdraw' : 'Withdrawal History'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {view === 'form' && (
              <InterstateTooltip label="View History">
                <button
                  onClick={() => setView('history')}
                  className="text-[#9CA3AF] hover:text-white transition-colors p-1"
                >
                  <FaHistory size={16} />
                </button>
              </InterstateTooltip>
            )}
            <button
              onClick={onClose}
              className="text-[#9CA3AF] hover:text-white transition-colors"
            >
              <FaTimes size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {view === 'form' ? (
            <div className="space-y-4">
              {/* Source Currency and Balance */}
              <div className="flex w-full flex-row items-center gap-2">
                <div className="flex h-10 w-full flex-row items-center gap-2 rounded border border-neutral-600 p-2 text-sm">
                  <img src="https://www.pngall.com/wp-content/uploads/10/Solana-Crypto-Logo-PNG-File.png" className="h-6 w-6" />
                  Solana
                </div>
                <div className="flex h-10 w-full flex-row items-center justify-between gap-2 rounded border border-neutral-600 p-2 text-sm">
                  <span className="text-neutral-500">Balance: </span>
                  <span className="text-white font-medium whitespace-nowrap">{solBalance.toFixed(4)} SOL</span>
                </div>
              </div>

              {/* Withdraw Amount */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white">Withdraw Amount</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "" || (/^\d*([.]\d{0,9})?$/.test(value) && Number(value) <= solBalance)) {
                        setWithdrawAmount(value);
                      }
                    }}
                    placeholder="0.0"
                    className="flex-1 h-10 px-3 bg-[#17191E] border border-[#2A2B33] rounded-lg text-white placeholder-[#9CA3AF] focus:outline-none focus:border-[#70E0B0] text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <InterstateButton
                    variant="secondary"
                    size="sm"
                    onClick={handleMaxClick}
                    className="px-3 py-2 text-xs"
                  >
                    Max
                  </InterstateButton>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
                    <span>Amount to withdraw</span>
                    <span className="text-white">{Number(withdrawAmount || 0).toFixed(4)} SOL</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
                    <span>Network fee</span>
                    <span className="text-white">
                      {feeLoading ? "..." : withdrawalFee.toFixed(4)} SOL
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-medium text-white border-t border-[#2A2B33] pt-1">
                    <span>Total deducted</span>
                    <span>{totalWithdrawalAmount.toFixed(4)} SOL</span>
                  </div>
                </div>
              </div>

              {/* Direction Arrow */}
              <div className="flex justify-center">
                <div className="w-8 h-8 rounded-full bg-[#2A2B33] flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#9CA3AF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
              </div>

              {/* Destination */}
              <div className="space-y-2">
                <div className="flex h-10 w-full flex-row items-center gap-2 rounded border border-neutral-600 p-2 text-sm">
                  <img src="https://www.pngall.com/wp-content/uploads/10/Solana-Crypto-Logo-PNG-File.png" className="h-6 w-6" />
                  <span className="text-white">Solana</span>
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white">Destination Address</label>
                  <input
                    type="text"
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    placeholder="Enter Solana wallet address..."
                    className="w-full h-10 px-3 bg-[#17191E] border border-[#2A2B33] rounded-lg text-white placeholder-[#9CA3AF] focus:outline-none focus:border-[#70E0B0] text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white">Amount to Receive</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={withdrawAmount}
                      readOnly
                      className="flex-1 h-10 px-3 bg-[#17191E] border border-[#2A2B33] rounded-lg text-white text-sm"
                    />
                    <div className="flex items-center gap-1 px-3 py-2 bg-[#2A2B33] rounded-lg">
                      <img src="https://www.pngall.com/wp-content/uploads/10/Solana-Crypto-Logo-PNG-File.png" className="h-4 w-4" />
                      <span className="text-sm text-white">SOL</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Message */}
              {message && (
                <div className={`p-3 rounded text-sm ${
                  message.type === "success" 
                    ? "bg-green-900/20 text-green-400 border border-green-800" 
                    : "bg-red-900/20 text-red-400 border border-red-800"
                }`}>
                  <div>{message.text}</div>
                  {txSignature && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <a 
                        href={`https://solscan.io/tx/${txSignature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-green-300 hover:text-green-200 underline flex items-center gap-1"
                      >
                        View on Solscan <FaExternalLinkAlt size={10} />
                      </a>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(txSignature);
                          toast.success("Transaction signature copied!");
                        }}
                        className="text-xs text-green-300 hover:text-green-200 flex items-center gap-1"
                      >
                        <FaCopy size={10} /> Copy TX
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Withdraw Button */}
              <InterstateButton
                onClick={handleWithdraw}
                disabled={isLoading || !isFormValid}
                className={`w-full h-12 text-sm font-medium ${
                  isLoading || !isFormValid
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
              >
                {isLoading ? 'Processing...' : !destinationAddress.trim() ? 'Missing Destination Address' : 'Withdraw'}
              </InterstateButton>
            </div>
          ) : (
            // History View
            <div className="space-y-3">
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#70E0B0]"></div>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-8 text-[#9CA3AF]">
                  <FaHistory size={48} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No withdrawal history yet</p>
                  <p className="text-xs mt-2">Your completed withdrawals will appear here</p>
                </div>
              ) : (
                history.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3 rounded-lg border border-[#2A2B33] bg-[#17191E] hover:border-[#70E0B0]/30 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(tx.status)}
                        <div>
                          <div className="text-sm font-medium text-white">
                            {Number(tx.amount).toFixed(4)} SOL
                          </div>
                          <div className="text-xs text-[#9CA3AF]">
                            {formatDate(tx.createdAt)}
                          </div>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        tx.status === 'completed' ? 'bg-green-900/30 text-green-400' :
                        tx.status === 'pending' ? 'bg-yellow-900/30 text-yellow-400' :
                        'bg-red-900/30 text-red-400'
                      }`}>
                        {tx.status}
                      </span>
                    </div>
                    
                    {tx.destinationAddress && (
                      <div className="text-xs text-[#9CA3AF] mb-2">
                        To: {tx.destinationAddress.slice(0, 8)}...{tx.destinationAddress.slice(-8)}
                      </div>
                    )}
                    
                    {tx.txSignature && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#2A2B33]">
                        <a
                          href={`https://solscan.io/tx/${tx.txSignature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#70E0B0] hover:text-[#70E0B0]/80 flex items-center gap-1"
                        >
                          View on Solscan <FaExternalLinkAlt size={10} />
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(tx.txSignature!);
                            toast.success("Transaction signature copied!");
                          }}
                          className="text-xs text-[#70E0B0] hover:text-[#70E0B0]/80 flex items-center gap-1"
                        >
                          <FaCopy size={10} /> Copy
                        </button>
                      </div>
                    )}
                    
                    {tx.errorMessage && (
                      <div className="text-xs text-red-400 mt-2">
                        Error: {tx.errorMessage}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WithdrawModal;
