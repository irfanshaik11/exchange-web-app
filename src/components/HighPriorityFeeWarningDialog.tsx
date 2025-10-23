"use client";

import React from "react";
import { FaTimes, FaExclamationTriangle } from "react-icons/fa";

interface HighPriorityFeeWarningDialogProps {
  isOpen: boolean;
  priorityFeeSol: number; // e.g., 1.5
  onContinue: () => void;
  onCancel: () => void;
}

const HighPriorityFeeWarningDialog: React.FC<HighPriorityFeeWarningDialogProps> = ({
  isOpen,
  priorityFeeSol,
  onContinue,
  onCancel,
}) => {
  if (!isOpen) return null;

  // Estimate USD value (approx $200/SOL, adjust if needed)
  const estimatedUsd = (priorityFeeSol * 200).toFixed(0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-[#1E1F26] rounded-lg border border-[#FF4D7F] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2A2B33]">
          <div className="flex items-center gap-2">
            <FaExclamationTriangle className="text-[#FF4D7F]" size={20} />
            <h3 className="text-lg font-semibold text-white">High Priority Fee Warning</h3>
          </div>
          <button
            onClick={onCancel}
            className="text-[#9CA3AF] hover:text-white transition-colors"
          >
            <FaTimes size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="text-center">
            <div className="text-5xl font-bold text-[#FF4D7F] mb-2">
              {priorityFeeSol.toFixed(4)} SOL
            </div>
            <p className="text-sm text-[#9CA3AF]">Priority Fee (~${estimatedUsd} USD)</p>
          </div>

          <div className="bg-[#17191E] border border-[#2A2B33] rounded-lg p-4 space-y-3">
            <p className="text-sm text-[#E6E7EA]">
              You set priority fee to <span className="font-bold text-[#FF4D7F]">{priorityFeeSol.toFixed(4)} SOL</span>. This is unusually high:
            </p>
            <ul className="space-y-2 text-sm text-[#9CA3AF]">
              <li className="flex items-start gap-2">
                <span className="text-[#FF4D7F] mt-0.5">•</span>
                <span>Normal priority fees are <span className="text-white font-semibold">0.001-0.01 SOL</span></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#FF4D7F] mt-0.5">•</span>
                <span>You're paying <span className="text-white font-semibold">~${estimatedUsd} USD</span> just for transaction priority</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#FF4D7F] mt-0.5">•</span>
                <span>This fee is <span className="text-white font-semibold">non-refundable</span> even if trade fails</span>
              </li>
            </ul>
          </div>

          <div className="bg-[#2c1720] border border-[#FF4D7F]/30 rounded-lg p-3">
            <p className="text-xs text-[#FF4D7F] text-center">
              ⚠️ Double-check: Did you mean to enter this amount?
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-4 border-t border-[#2A2B33]">
          <button
            onClick={onCancel}
            className="flex-1 h-10 rounded-lg font-medium text-white bg-[#2A2B33] hover:bg-[#3A3B43] transition-colors text-sm"
          >
            Go Back
          </button>
          <button
            onClick={onContinue}
            className="flex-1 h-10 rounded-lg font-medium text-white bg-[#FF4D7F] hover:bg-[#E63E6B] transition-colors text-sm"
          >
            Continue Anyway
          </button>
        </div>
      </div>
    </div>
  );
};

export default HighPriorityFeeWarningDialog;
