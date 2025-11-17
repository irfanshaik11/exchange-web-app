import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FaWallet, FaTimes, FaPlus, FaCopy, FaSignOutAlt, FaCheck } from 'react-icons/fa';
import { useRouter } from 'next/router';

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
  green: "#22c55e",
};

export default function WalletSwitcher({ isOpen, onClose }: WalletSwitcherProps) {
  const router = useRouter();
  const [wallets, setWallets] = useState([
    { 
      id: 1, 
      name: 'Axiom Main', 
      address: '3ZSWx...', 
      isConnected: true,
      balance: 0,
      hasBalance: false 
    }
  ]);
  const [copiedAddress, setCopiedAddress] = useState<number | null>(null);

  const handleCopyAddress = (walletId: number, address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(walletId);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleSelectWallet = (walletId: number) => {
    setWallets(wallets.map(w => ({
      ...w,
      isConnected: w.id === walletId
    })));
  };

  const handleAddWallet = () => {
    // Navigate to the wallet/trackers page
    router.push('/trackers');
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-[9998]"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        className="fixed bottom-12 left-2 z-[9999] w-80"
        style={{
          background: AX.bg,
          border: `1px solid ${AX.border}`,
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: AX.border }}
        >
          <div className="flex items-center gap-2">
            <FaWallet size={16} style={{ color: AX.mint }} />
            <h2 className="text-sm font-semibold" style={{ color: AX.text }}>
              Wallets
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <FaTimes size={14} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 p-3 border-b" style={{ borderColor: AX.border }}>
          <button
            onClick={() => {
              setWallets(wallets.map(w => ({ ...w, isConnected: false })));
            }}
            className="flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all duration-300"
            style={{
              backgroundColor: AX.surface,
              color: AX.text,
              border: `1px solid ${AX.border}`
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
            Unselect All
          </button>
          <button
            className="flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all duration-300"
            style={{
              backgroundColor: AX.surface,
              color: AX.muted,
              border: `1px solid ${AX.border}`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = AX.surface2;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = AX.surface;
            }}
          >
            Select All with Balance
          </button>
        </div>

        {/* Wallets List */}
        <div className="max-h-80 overflow-y-auto">
          {wallets.map((wallet) => (
            <div 
              key={wallet.id}
              className="flex items-center gap-3 p-3 border-b transition-all"
              style={{ 
                borderColor: AX.border,
                backgroundColor: wallet.isConnected ? `${AX.mint}10` : 'transparent'
              }}
            >
              {/* Select Checkbox */}
              <button
                onClick={() => handleSelectWallet(wallet.id)}
                className="flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-all"
                style={{
                  borderColor: wallet.isConnected ? AX.orange : AX.border,
                  backgroundColor: wallet.isConnected ? AX.orange : 'transparent'
                }}
              >
                {wallet.isConnected && (
                  <div className="w-3 h-3 bg-white rounded-sm" />
                )}
              </button>

              {/* Wallet Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium" style={{ color: AX.text }}>
                    {wallet.name}
                  </span>
                  {!wallet.isConnected && (
                    <span 
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ 
                        backgroundColor: `${AX.muted}20`,
                        color: AX.muted 
                      }}
                    >
                      Off
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: AX.muted }}>
                    {wallet.address}
                  </span>
                  <button
                    onClick={() => handleCopyAddress(wallet.id, wallet.address)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {copiedAddress === wallet.id ? (
                      <FaCheck size={10} style={{ color: AX.green }} />
                    ) : (
                      <FaCopy size={10} />
                    )}
                  </button>
                </div>
              </div>

              {/* Balance Indicators */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {/* SOL Balance */}
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 397.7 311.7" fill="currentColor" style={{ color: AX.mint }}>
                      <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z" fill="url(#solGrad)"/>
                    </svg>
                  </div>
                  <span className="text-xs" style={{ color: AX.text }}>
                    {wallet.balance}
                  </span>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => handleSelectWallet(wallet.id)}
                  className="w-8 h-4 rounded-full transition-all duration-300 relative"
                  style={{
                    backgroundColor: wallet.isConnected ? AX.mint : AX.border
                  }}
                >
                  <div
                    className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300"
                    style={{
                      left: wallet.isConnected ? '18px' : '2px'
                    }}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add Wallet Button */}
        <button
          onClick={handleAddWallet}
          className="w-full flex items-center gap-2 p-4 transition-all duration-300"
          style={{
            color: AX.text,
            borderTop: `1px solid ${AX.border}`
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = AX.surface;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <FaPlus size={14} style={{ color: AX.mint }} />
          <span className="text-sm font-medium">Add Wallet</span>
        </button>

        {/* Footer Tabs (Placeholder) */}
        <div 
          className="flex items-center justify-around py-2 border-t"
          style={{ 
            borderColor: AX.border,
            backgroundColor: AX.surface2
          }}
        >
          <button 
            className="flex items-center gap-2 px-3 py-1 text-xs"
            style={{ color: AX.text }}
          >
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded border flex items-center justify-center text-[10px]" style={{ borderColor: AX.border }}>
                1
              </div>
              <svg width="12" height="12" viewBox="0 0 397.7 311.7" fill="currentColor" style={{ color: AX.mint }}>
                <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
              </svg>
              <span>0</span>
            </div>
          </button>
          
          <div className="w-px h-4" style={{ backgroundColor: AX.border }} />
          
          <button className="px-3 py-1 text-xs flex items-center gap-1" style={{ color: AX.muted }}>
            <FaWallet size={12} />
            <span>Wallet</span>
          </button>
          
          <div className="w-px h-4" style={{ backgroundColor: AX.border }} />
          
          <button className="px-3 py-1 text-xs flex items-center gap-1" style={{ color: AX.muted }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            <span>Twitter</span>
          </button>
          
          <div className="w-px h-4" style={{ backgroundColor: AX.border }} />
          
          <button className="px-3 py-1 text-xs flex items-center gap-1" style={{ color: AX.muted }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="2" />
            </svg>
            <span>Disco</span>
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}

