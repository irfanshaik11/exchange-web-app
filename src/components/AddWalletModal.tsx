import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { isValidSolanaAddress } from '~/utils/verifySolanaAddress';
import { isValidMonadAddress } from '~/utils/verifyMonadAddress';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

type Chain = 'sol' | 'monad';

type AddWalletModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAddWallet: (address: string, name: string, emoji?: string, chain?: Chain) => Promise<void> | void;
  chain: Chain; // Chain is passed from parent (from Header via router query)
};

const AddWalletModal: React.FC<AddWalletModalProps> = ({ isOpen, onClose, onAddWallet, chain }) => {
  const [walletAddress, setWalletAddress] = useState('');
  const [walletName, setWalletName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('👻');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [loading, setLoading] = useState(false);
  const selectedChain = chain; // Use chain from props

  const handleClose = () => {
    setWalletAddress('');
    setWalletName('');
    setSelectedEmoji('👻');
    setShowEmojiPicker(false);
    setAddressError('');
    setLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate address based on selected chain
    if (!walletAddress.trim()) {
      setAddressError('Wallet address is required');
      return;
    }
    
    const trimmedAddress = walletAddress.trim();
    let isValid = false;
    
    if (selectedChain === 'sol') {
      isValid = isValidSolanaAddress(trimmedAddress);
      if (!isValid) {
        setAddressError('Invalid Solana wallet address');
        return;
      }
    } else if (selectedChain === 'monad') {
      isValid = isValidMonadAddress(trimmedAddress);
      if (!isValid) {
        setAddressError('Invalid Monad wallet address (must be 0x followed by 40 hex characters)');
        return;
      }
    }
    
    // Clear error and proceed
    setAddressError('');
    setLoading(true);

    try {
      await onAddWallet(trimmedAddress, walletName, selectedEmoji, selectedChain);
      setWalletAddress('');
      setWalletName('');
      setSelectedEmoji('👻');
      setShowEmojiPicker(false);
      setLoading(false);
      onClose();
    } catch (err: any) {
      setAddressError(err.message || 'Failed to add wallet');
      setLoading(false);
    }
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setWalletAddress(value);
    // Clear error when user starts typing
    if (addressError) {
      setAddressError('');
    }
  };

  const handleAddressBlur = () => {
    // Validate on blur if there's a value
    if (walletAddress.trim()) {
      const trimmedAddress = walletAddress.trim();
      if (selectedChain === 'sol' && !isValidSolanaAddress(trimmedAddress)) {
        setAddressError('Invalid Solana wallet address');
      } else if (selectedChain === 'monad' && !isValidMonadAddress(trimmedAddress)) {
        setAddressError('Invalid Monad wallet address (must be 0x followed by 40 hex characters)');
      }
    }
  };

  const onEmojiClick = (emojiObject: any) => {
    setSelectedEmoji(emojiObject.emoji);
    setShowEmojiPicker(false);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(2px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          handleClose();
        }
      }}
    >
       <div 
        className="relative w-full max-w-md rounded-xl border border-neutral-800/50 bg-neutral-900 shadow-2xl transition-all duration-300 sm:max-w-lg"
        style={{
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        }}
      >
             {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800/40 px-5 py-4 sm:px-6 sm:py-5">
          <h2 className="text-lg font-semibold text-neutral-100 sm:text-xl">
            Add Wallet
          </h2>
          <button 
            onClick={handleClose} 
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-all duration-200 hover:bg-neutral-800/60 hover:text-neutral-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed sm:h-9 sm:w-9"
            aria-label="Close modal"
            disabled={loading}
          >
               <svg 
              className="h-5 w-5 sm:h-6 sm:w-6" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M6 18L18 6M6 6l12 12" 
              />
            </svg>
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="px-5 py-5 sm:px-6 sm:py-6">
          {/* Wallet Address Input */}
          <div className="mb-5">
            <label 
              htmlFor="walletAddress" 
              className="mb-2 block text-xs font-medium text-neutral-400 sm:text-sm"
            >
              {selectedChain === 'sol' ? 'Solana' : 'Monad'} Wallet Address
            </label>
            <input
              type="text"
              id="walletAddress"
               className={`w-full rounded-lg border bg-neutral-900/40 px-4 py-2.5 text-xs text-neutral-200 placeholder:text-neutral-500 transition-all duration-300 focus:border-[#7FFFC9]/60 focus:outline-none focus:ring-2 focus:ring-[#7FFFC9]/20 focus:bg-neutral-900/60 disabled:opacity-50 disabled:cursor-not-allowed sm:px-5 sm:py-3 sm:text-sm ${
                addressError 
                    ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/20' 
                  : 'border-neutral-800/60'
              }`}
              placeholder={selectedChain === 'sol' ? 'Enter Solana wallet address' : 'Enter Monad wallet address (0x...)'}
              value={walletAddress}
              onChange={handleAddressChange}
              onBlur={handleAddressBlur}
              disabled={loading}
              required
            />
            {addressError && (
              <p className="mt-1.5 text-xs text-red-400 sm:text-sm">
                {addressError}
              </p>
            )}
          </div>

          {/* Wallet Name Input with Emoji */}
          <div className="mb-6">
              <label 
              htmlFor="walletName" 
              className="mb-2 block text-xs font-medium text-neutral-400 sm:text-sm"
            >
              Wallet Name <span className="text-neutral-500">(optional)</span>
            </label>
            <div className="flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border border-neutral-800/60 bg-neutral-900/40 text-2xl transition-all duration-300 hover:border-[#7FFFC9]/60 hover:bg-neutral-900/60 disabled:opacity-50 disabled:cursor-not-allowed sm:h-11 sm:w-14"
                aria-label="Select emoji"
                disabled={loading}
              >
                {selectedEmoji}
              </button>
              <input
                type="text"
                id="walletName"
                className="flex-1 rounded-lg border border-neutral-800/60 bg-neutral-900/40 px-4 py-2.5 text-xs text-neutral-200 placeholder:text-neutral-500 transition-all duration-300 focus:border-[#7FFFC9]/60 focus:outline-none focus:ring-2 focus:ring-[#7FFFC9]/20 focus:bg-neutral-900/60 disabled:opacity-50 disabled:cursor-not-allowed sm:px-5 sm:py-3 sm:text-sm"
                placeholder="Enter wallet name"
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
                disabled={loading}
              />
            </div>
            
            {/* Emoji Picker */}
            {showEmojiPicker && (
              <div className="mt-3 flex justify-center rounded-lg border border-neutral-800/50 bg-neutral-900/60 p-2 backdrop-blur-sm sm:mt-4">
                <div className="w-full">
                  <EmojiPicker
                    onEmojiClick={onEmojiClick}
                    width="100%"
                    height={350}
                    searchDisabled={false}
                    skinTonesDisabled
                    previewConfig={{
                      showPreview: false
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg border-none bg-[#7FFFC9] px-4 py-2.5 text-xs font-semibold text-black shadow-lg transition-all duration-200 hover:bg-[#6EE8B8] hover:shadow-[0_0_16px_rgba(127,255,201,0.4),0_4px_12px_rgba(127,255,201,0.2)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#7FFFC9] sm:px-5 sm:py-3 sm:text-sm"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg 
                  className="h-4 w-4 animate-spin" 
                  xmlns="http://www.w3.org/2000/svg" 
                  fill="none" 
                  viewBox="0 0 24 24"
                >
                  <circle 
                    className="opacity-25" 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="4"
                  ></circle>
                  <path 
                    className="opacity-75" 
                    fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>Adding...</span>
              </span>
            ) : (
              'Add Wallet'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddWalletModal;
