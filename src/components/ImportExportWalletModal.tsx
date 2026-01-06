import React, { useState } from 'react';

interface ImportExportWalletModalProps {
  mode: 'import' | 'export';
  isOpen: boolean;
  onClose: () => void;
  onImport?: (wallets: any[], onProgress?: (current: number, total: number) => void) => Promise<void>;
  wallets?: any[];
}

export default function ImportExportWalletModal({ mode, isOpen, onClose, onImport, wallets }: ImportExportWalletModalProps) {
  const [importText, setImportText] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  if (!isOpen) return null;

  const handleImport = async () => {
    try {
      const parsed = JSON.parse(importText);
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) {
          setError('No wallets to import.');
          return;
        }
        
        setError('');
        setIsImporting(true);
        setImportProgress({ current: 0, total: parsed.length });
        
        try {
          // Wait for onImport to complete, passing progress callback
          await onImport?.(parsed, (current, total) => {
            setImportProgress({ current, total });
          });
          setImportText('');
          setIsImporting(false);
          setImportProgress({ current: 0, total: 0 });
          // Only close after successful import
          onClose();
        } catch (importError: any) {
          setIsImporting(false);
          setImportProgress({ current: 0, total: 0 });
          setError(importError?.message || 'Failed to import wallets. Please try again.');
        }
      } else {
        setError('Invalid format. Must be an array.');
      }
    } catch {
      setError('Invalid JSON.');
    }
  };

  const handleCopy = () => {
    if (wallets) {
      navigator.clipboard.writeText(JSON.stringify(wallets, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // Prevent closing modal while importing
  const handleClose = () => {
    if (!isImporting) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(2px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isImporting) {
          handleClose();
        }
      }}
    >
      <div 
        className="bg-neutral-900 rounded-xl border border-neutral-800/50 shadow-2xl w-full max-w-md relative flex flex-col sm:max-w-lg"
        style={{
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800/40 px-5 py-4 sm:px-6 sm:py-5">
          <h2 className="text-lg font-semibold text-neutral-100 sm:text-xl">
            {mode === 'import' ? 'Import Wallets' : 'Export Wallets'}
          </h2>
          <button 
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-all duration-200 hover:bg-neutral-800/60 hover:text-neutral-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed sm:h-9 sm:w-9" 
            onClick={handleClose}
            disabled={isImporting}
            aria-label="Close modal"
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

        {/* Content */}
        <div className="px-5 py-5 flex-1 flex flex-col sm:px-6 sm:py-6">
          {mode === 'import' ? (
          <>
            <div className="mb-4">
              <label className="mb-2 block text-xs font-medium text-neutral-400 sm:text-sm">
                Paste wallet data (JSON format)
              </label>
              <textarea
                className="w-full h-40 rounded-lg border border-neutral-800/60 bg-neutral-900/40 px-4 py-3 text-xs text-neutral-200 placeholder:text-neutral-500 transition-all duration-300 focus:border-[#7FFFC9]/60 focus:outline-none focus:ring-2 focus:ring-[#7FFFC9]/20 focus:bg-neutral-900/60 resize-none disabled:opacity-50 disabled:cursor-not-allowed sm:text-sm"
                placeholder="Paste your exported wallets here..."
                value={importText}
                onChange={e => setImportText(e.target.value)}
                disabled={isImporting}
              />
            </div>
            
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                <p className="text-xs text-red-400 sm:text-sm">{error}</p>
              </div>
            )}
            
            {isImporting && (
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between text-xs text-neutral-300 sm:text-sm">
                  <span>Importing wallets...</span>
                  <span className="font-medium text-[#7FFFC9]">{importProgress.current} / {importProgress.total}</span>
                </div>
                <div className="w-full overflow-hidden rounded-full bg-neutral-800/60 h-2">
                  <div 
                    className="h-full rounded-full bg-[#7FFFC9] transition-all duration-300"
                    style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            )}
            
            <div className="mb-6 flex-1 space-y-2.5 text-xs text-neutral-400 sm:text-sm">
              <p className="mb-3 text-xs font-medium text-neutral-300 sm:text-sm">Supported formats:</p>
              <div className="flex items-center gap-2.5">
                <img src="https://bookface-images.s3.amazonaws.com/small_logos/3ffbe7a826e30d31bb15e11d521be0059beb3f81.png" alt="Axiom" className="h-5 w-5 rounded sm:h-6 sm:w-6" />
                <span>Axiom.trade</span>
              </div>
              <div className="flex items-center gap-2.5">
                <img src="https://pbs.twimg.com/profile_images/1770473234049159168/zkotbYt__400x400.jpg" alt="BullX" className="h-5 w-5 rounded sm:h-6 sm:w-6" />
                <span>BullX</span>
              </div>
              <div className="flex items-center gap-2.5">
                <img src="https://play-lh.googleusercontent.com/CB_4aQFK-hyqxNnnBexEvJ3vCkiQl-XA0vGkyLZGxZgLeaBQJ39fBm1TDPgwT-BBdwQ=w240-h480-rw" alt="GMGN" className="h-5 w-5 rounded sm:h-6 sm:w-6" />
                <span>GMGN</span>
              </div>
              <div className="flex items-center gap-2.5">
                <img src="https://pbs.twimg.com/profile_images/1794439988215435264/8iyoScjU_400x400.jpg" alt="RayBot" className="h-5 w-5 rounded sm:h-6 sm:w-6" />
                <span>RayBot</span>
              </div>
            </div>
            
            <button 
              className="w-full rounded-lg border-none bg-[#7FFFC9] px-4 py-2.5 text-xs font-semibold text-black shadow-lg transition-all duration-200 hover:bg-[#6EE8B8] hover:shadow-[0_0_16px_rgba(127,255,201,0.4),0_4px_12px_rgba(127,255,201,0.2)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#7FFFC9] flex items-center justify-center gap-2 sm:px-5 sm:py-3 sm:text-sm" 
              onClick={handleImport}
              disabled={isImporting || !importText.trim()}
            >
              {isImporting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Importing...</span>
                </>
              ) : (
                'Import Wallets'
              )}
            </button>
          </>
        ) : (
          <>
            <div className="mb-4">
              <label className="mb-2 block text-xs font-medium text-neutral-400 sm:text-sm">
                Wallet Data (JSON)
              </label>
              <textarea
                className="w-full h-40 rounded-lg border border-neutral-800/60 bg-neutral-900/40 px-4 py-3 text-xs text-neutral-200 placeholder:text-neutral-500 resize-none sm:text-sm"
                value={JSON.stringify(wallets, null, 2)}
                readOnly
              />
            </div>
            <button 
              className="w-full rounded-lg border-none bg-[#7FFFC9] px-4 py-2.5 text-xs font-semibold text-black shadow-lg transition-all duration-200 hover:bg-[#6EE8B8] hover:shadow-[0_0_16px_rgba(127,255,201,0.4),0_4px_12px_rgba(127,255,201,0.2)] active:scale-[0.98] sm:px-5 sm:py-3 sm:text-sm" 
              onClick={handleCopy}
            >
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          </>
          )}
        </div>
      </div>
    </div>
  );
} 