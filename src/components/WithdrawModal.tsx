"use client";

import React, { useState, useEffect } from "react";
import { FaTimes, FaCopy } from "react-icons/fa";
import InterstateButton from "./InterstateButton";
import InterstateTooltip from "./InterstateTooltip";
import { useUser } from "./UserContext";
import { withdrawSOL } from "~/utils/api";
import toast from "react-hot-toast";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WithdrawModal: React.FC<WithdrawModalProps> = ({ isOpen, onClose }) => {
  const { user, solBalance, refreshBalance } = useUser();
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  
  const WITHDRAWAL_FEE = 0.001; // 0.001 SOL network fee
  const MIN_WITHDRAWAL = 0.001;
  const MAX_WITHDRAWAL = 100;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setWithdrawAmount("");
      setDestinationAddress("");
      setMessage(null);
      setTxSignature(null);
    }
  }, [isOpen]);

  const handleMaxClick = () => {
    // Calculate max withdrawal (balance - fee)
    const maxAmount = Math.max(0, solBalance - WITHDRAWAL_FEE);
    setWithdrawAmount(maxAmount.toFixed(4));
  };

  const handleCopyAddress = () => {
    if (user?.publicKey) {
      navigator.clipboard.writeText(user.publicKey);
      toast.success("Address copied to clipboard!");
    }
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

    const totalRequired = amount + WITHDRAWAL_FEE;
    if (totalRequired > solBalance) {
      setMessage({ type: "error", text: `Insufficient balance. You need ${totalRequired.toFixed(4)} SOL (including ${WITHDRAWAL_FEE} SOL fee).` });
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

    try {
      // Call the actual withdrawal API
      const result = await withdrawSOL({
        amount: amount,
        destinationAddress: destinationAddress.trim(),
      }, user.bearerToken);
      
      // Store transaction signature for user to track
      if (result.txSignature) {
        setTxSignature(result.txSignature);
      }
      
      setMessage({
        type: "success",
        text: `✅ Withdrawal successful! ${amount.toFixed(4)} SOL sent to ${destinationAddress.slice(0, 8)}...${destinationAddress.slice(-8)}`,
      });
      
      toast.success(`Withdrawal successful! ${amount.toFixed(4)} SOL sent`);
      
      // Refresh balance after successful withdrawal
      refreshBalance();
      
      // Close modal after 3 seconds to give user time to see/copy tx signature
      setTimeout(() => {
        onClose();
      }, 3000);
      
    } catch (error: any) {
      console.error("Withdrawal failed:", error);
      const errorMessage = error.message || "❌ Withdrawal failed. Please try again.";
      setMessage({ type: "error", text: errorMessage });
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const totalWithdrawalAmount = Number(withdrawAmount || 0) + WITHDRAWAL_FEE;
  const isFormValid = 
    withdrawAmount && 
    Number(withdrawAmount) >= MIN_WITHDRAWAL && 
    Number(withdrawAmount) <= MAX_WITHDRAWAL &&
    totalWithdrawalAmount <= solBalance && 
    destinationAddress.trim().length >= 32;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-lg border border-[#2A2B33] bg-[#1E1F26] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2A2B33] p-4">
          <h3 className="text-lg font-semibold text-white">Withdraw</h3>
          <button
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-white transition-colors"
          >
            <FaTimes size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
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
                <span className="text-white">{WITHDRAWAL_FEE.toFixed(4)} SOL</span>
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
              <label className="block text-sm font-medium text-white">Address: Address of destination wallet</label>
              <input
                type="text"
                value={destinationAddress}
                onChange={(e) => setDestinationAddress(e.target.value)}
                placeholder="Enter Solana wallet address..."
                className="w-full h-10 px-3 bg-[#17191E] border border-[#2A2B33] rounded-lg text-white placeholder-[#9CA3AF] focus:outline-none focus:border-[#70E0B0] text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-white">To</label>
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
                <div className="mt-2 flex items-center gap-2">
                  <a 
                    href={`https://solscan.io/tx/${txSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-300 hover:text-green-200 underline"
                  >
                    View on Solscan
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
      </div>
    </div>
  );
};

export default WithdrawModal;
