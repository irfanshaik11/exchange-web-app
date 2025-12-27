import React, { useState } from 'react';
import { FaEye, FaEyeSlash, FaTimes, FaPlus } from 'react-icons/fa';
import { AlertTriangle } from 'lucide-react';

interface ImportWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (privateKeys: string[]) => Promise<void>;
  chain?: 'sol' | 'monad';
}

export default function ImportWalletModal({ isOpen, onClose, onImport, chain = 'sol' }: ImportWalletModalProps) {
  const [privateKeys, setPrivateKeys] = useState<string[]>(['']);
  const [visibleKeys, setVisibleKeys] = useState<Record<number, boolean>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const toggleVisibility = (index: number) => {
    setVisibleKeys(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const addPrivateKeyField = () => {
    setPrivateKeys(prev => [...prev, '']);
  };

  const removePrivateKeyField = (index: number) => {
    if (privateKeys.length === 1) return; // Keep at least one field
    setPrivateKeys(prev => prev.filter((_, i) => i !== index));
    setVisibleKeys(prev => {
      const newVisible: Record<number, boolean> = {};
      // Reindex visible keys: shift down indices after the removed one
      Object.keys(prev).forEach(key => {
        const oldIndex = parseInt(key, 10);
        if (oldIndex < index) {
          // Keep indices before the removed one as-is
          newVisible[oldIndex] = prev[oldIndex];
        } else if (oldIndex > index) {
          // Shift down indices after the removed one
          newVisible[oldIndex - 1] = prev[oldIndex];
        }
        // Skip the removed index
      });
      return newVisible;
    });
  };

  const updatePrivateKey = (index: number, value: string) => {
    setPrivateKeys(prev => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
    setError(''); // Clear error when user types
  };

  const validPrivateKeys = privateKeys.filter(key => key.trim().length > 0);

  const handleImport = async () => {
    if (validPrivateKeys.length === 0) {
      setError('Please enter at least one private key');
      return;
    }

    setIsImporting(true);
    setError('');

    try {
      await onImport(validPrivateKeys);
      // Reset form on success
      setPrivateKeys(['']);
      setVisibleKeys({});
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to import wallets');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    if (!isImporting) {
      setPrivateKeys(['']);
      setVisibleKeys({});
      setError('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={handleClose}>
      <div 
        className="bg-[#101114] rounded-lg shadow-2xl w-full max-w-md relative border border-[#2A2B33]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2A2B33]">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#f0f5f5]">Import Wallet</h2>
            <button 
              className="text-[#9CA3AF] hover:text-[#f0f5f5] text-xl font-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
              onClick={handleClose}
              disabled={isImporting}
            >
              <FaTimes />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* Private Key Input Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-[#9CA3AF]">
                Enter Private Key ({validPrivateKeys.length})
              </label>
              <button
                onClick={addPrivateKeyField}
                className="text-[#70E0B0] hover:text-[#58B890] transition-colors p-1"
                disabled={isImporting}
                title="Add another private key"
              >
                <FaPlus size={16} />
              </button>
            </div>

            <div className="space-y-3">
              {privateKeys.map((key, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      type={visibleKeys[index] ? 'text' : 'password'}
                      placeholder="Enter private key"
                      className="w-full px-3 py-2 rounded-lg bg-[#17191E] border border-[#2A2B33] text-[#f0f5f5] placeholder-[#6B7280] focus:outline-none focus:border-[#70E0B0] transition-colors pr-20"
                      value={key}
                      onChange={(e) => updatePrivateKey(index, e.target.value)}
                      disabled={isImporting}
                      name={`import-key-${index}`}
                      autoComplete="new-password"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleVisibility(index)}
                        className="text-[#9CA3AF] hover:text-[#f0f5f5] transition-colors"
                        disabled={isImporting}
                        title={visibleKeys[index] ? 'Hide' : 'Show'}
                      >
                        {visibleKeys[index] ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
                      </button>
                      {privateKeys.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePrivateKeyField(index)}
                          className="text-[#9CA3AF] hover:text-[#FF4D7F] transition-colors"
                          disabled={isImporting}
                          title="Remove"
                        >
                          <FaTimes size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-[#FF4D7F]/10 border border-[#FF4D7F]/20 text-sm text-[#FF4D7F]">
              {error}
            </div>
          )}

          {/* Import Button */}
          <button
            onClick={handleImport}
            disabled={isImporting || validPrivateKeys.length === 0}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-[#70E0B0] to-[#58B890] text-[#1A1A1A] font-semibold transition-all duration-300 hover:from-[#58B890] hover:to-[#70E0B0] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-[#70E0B0] disabled:hover:to-[#58B890] flex items-center justify-center gap-2"
          >
            {isImporting ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Importing...</span>
              </>
            ) : (
              `Import ${validPrivateKeys.length} Wallet${validPrivateKeys.length !== 1 ? 's' : ''}`
            )}
          </button>

          {/* Security Warning */}
          <div className="mt-4 p-3 rounded-lg bg-[#FF4D7F]/10 border border-[#FF4D7F]/20 flex items-start gap-2">
            <AlertTriangle className="text-[#FF4D7F] flex-shrink-0 mt-0.5" size={16} />
            <p className="text-xs text-[#FF4D7F]">
              <strong>WARNING:</strong> Never share your private keys with anyone. Keep them secure and private.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
