import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { isValidSolanaAddress } from '~/utils/verifySolanaAddress';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

type AddWalletModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAddWallet: (address: string, name: string, emoji?: string) => void;
};

const AddWalletModal: React.FC<AddWalletModalProps> = ({ isOpen, onClose, onAddWallet }) => {
  const [walletAddress, setWalletAddress] = useState('');
  const [walletName, setWalletName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('👻');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [addressError, setAddressError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate Solana address
    if (!walletAddress.trim()) {
      setAddressError('Wallet address is required');
      return;
    }
    
    if (!isValidSolanaAddress(walletAddress.trim())) {
      setAddressError('Invalid Solana wallet address');
      return;
    }
    
    // Clear error and proceed
    setAddressError('');
    onAddWallet(walletAddress.trim(), walletName, selectedEmoji);
    setWalletAddress('');
    setWalletName('');
    setSelectedEmoji('👻');
    setShowEmojiPicker(false);
    onClose();
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
    if (walletAddress.trim() && !isValidSolanaAddress(walletAddress.trim())) {
      setAddressError('Invalid Solana wallet address');
    }
  };

  const onEmojiClick = (emojiObject: any) => {
    setSelectedEmoji(emojiObject.emoji);
    setShowEmojiPicker(false);
  };

  return (
    <div className="fixed inset-0 bg-black/90 bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-neutral-900 border border-emerald-700 shadow-2xl shadow-emerald-500/20 rounded-lg p-6 w-96">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-white">Add Wallet</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-3xl cursor-pointer">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="walletAddress" className="block text-sm font-medium text-neutral-400 mb-1">Wallet Address</label>
            <input
              type="text"
              id="walletAddress"
              className={`bg-neutral-800 border rounded px-3 py-2 w-full text-neutral-200 focus:outline-none ${
                addressError 
                  ? 'border-red-500 focus:border-red-500' 
                  : 'border-neutral-700 focus:border-emerald-500'
              }`}
              placeholder="Enter wallet address"
              value={walletAddress}
              onChange={handleAddressChange}
              onBlur={handleAddressBlur}
              required
            />
            {addressError && (
              <p className="text-red-500 text-xs mt-1">{addressError}</p>
            )}
          </div>
          <div className="mb-6">
            <label htmlFor="walletName" className="block text-sm font-medium text-neutral-400 mb-1">Wallet Name</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="text-3l bg-neutral-800 border border-neutral-700 rounded px-3 py-2 hover:border-emerald-500 transition-colors"
              >
                {selectedEmoji}
              </button>
              <input
                type="text"
                id="walletName"
                className="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 flex-1 text-neutral-200 focus:outline-none focus:border-emerald-500"
                placeholder="Enter wallet name (optional)"
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
              />
            </div>
            
            {/* Emoji Picker */}
            {showEmojiPicker && (
              <div className="mt-2 flex justify-center">
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
            )}
          </div>
          <button
            type="submit"
            className="w-full font-semibold py-2 rounded transition-all duration-300 text-black border-none bg-[#70E0B0]"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#58B890';
              e.currentTarget.style.boxShadow = '0 0 8px rgba(112, 224, 176, 0.3), 0 0 16px rgba(112, 224, 176, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#70E0B0';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            Add Wallet
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddWalletModal;
