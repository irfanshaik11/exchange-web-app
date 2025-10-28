import React, { useState } from 'react';

interface ImportExportWalletModalProps {
  mode: 'import' | 'export';
  isOpen: boolean;
  onClose: () => void;
  onImport?: (wallets: any[]) => void;
  wallets?: any[];
}

export default function ImportExportWalletModal({ mode, isOpen, onClose, onImport, wallets }: ImportExportWalletModalProps) {
  const [importText, setImportText] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importText);
      if (Array.isArray(parsed)) {
        setError('');
        onImport?.(parsed);
        setImportText('');
        onClose();
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-neutral-900 rounded-xl shadow-2xl w-full max-w-sm relative h-auto min-h-[500px] flex flex-col">
        <div className="px-4 pt-3 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{mode === 'import' ? 'Import Solana Wallets' : 'Export Solana Wallets'}</h2>
            <button className="text-neutral-400 hover:text-white text-2xl font-light" onClick={onClose}>&times;</button>
          </div>
        </div>
        <div className="border-b border-neutral-700 mb-6"></div>
        <div className="px-8 pb-8 flex-1 flex flex-col">
          {mode === 'import' ? (
          <>
            <textarea
              className="w-full h-40 p-3 rounded bg-neutral-800 text-neutral-100 border border-neutral-700 mb-3"
              placeholder="Paste your exported wallets here..."
              value={importText}
              onChange={e => setImportText(e.target.value)}
            />
            {error && <div className="text-red-400 text-xs mb-3">{error}</div>}
            <div className="text-xs text-neutral-400 mb-6 space-y-3 flex-1">
              <div className="flex items-center gap-3">
                <img src="https://bookface-images.s3.amazonaws.com/small_logos/3ffbe7a826e30d31bb15e11d521be0059beb3f81.png" alt="Axiom" className="w-6 h-6 rounded" />
                <span>Axiom.trade wallet imports are supported.</span>
              </div>
              <div className="flex items-center gap-3">
                <img src="https://pbs.twimg.com/profile_images/1770473234049159168/zkotbYt__400x400.jpg" alt="BullX" className="w-6 h-6 rounded" />
                <span>BullX wallet imports are supported.</span>
              </div>
              <div className="flex items-center gap-3">
                <img src="https://play-lh.googleusercontent.com/CB_4aQFK-hyqxNnnBexEvJ3vCkiQl-XA0vGkyLZGxZgLeaBQJ39fBm1TDPgwT-BBdwQ=w240-h480-rw" alt="GMGN" className="w-6 h-6 rounded" />
                <span>GMGN wallet imports are supported.</span>
              </div>
              <div className="flex items-center gap-3">
                <img src="https://pbs.twimg.com/profile_images/1794439988215435264/8iyoScjU_400x400.jpg" alt="RayBot" className="w-6 h-6 rounded" />
                <span>RayBot wallet imports are supported.</span>
              </div>
            </div>
            <button className="w-full text-black font-semibold rounded-lg py-2 transition-all duration-300 mt-auto" style={{ backgroundColor: '#70E0B0' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#58B890'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#70E0B0'} onClick={handleImport}>Import</button>
          </>
        ) : (
          <>
            <textarea
              className="w-full h-32 p-2 rounded bg-neutral-800 text-neutral-100 border border-neutral-700 mb-2"
              value={JSON.stringify(wallets, null, 2)}
              readOnly
            />
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2 transition-all duration-300 mb-2" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</button>
          </>
          )}
        </div>
      </div>
    </div>
  );
} 