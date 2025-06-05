import React, { useEffect, useState } from 'react';
import { FaCheckCircle, FaCopy, FaTimes } from 'react-icons/fa';
import Cookies from 'js-cookie';
import QRCode from 'qrcode';
import { useUser } from './UserContext';

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
}

const DepositModal: React.FC<DepositModalProps> = ({ open, onClose }) => {
  const { user, loading: userLoading, refreshUser } = useUser();
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setShow(true);
    } else {
      const timeout = setTimeout(() => setShow(false), 220);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  useEffect(() => {
    if (user?.publicKey) {
      QRCode.toDataURL(user.publicKey, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      })
        .then((url) => {
          setQrCodeDataUrl(url);
        })
        .catch((err) => {
          setQrCodeDataUrl('');
        });
    } else {
      setQrCodeDataUrl('');
    }
  }, [user?.publicKey]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!open && !show) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-colors duration-500 ${open ? 'bg-black/40' : 'bg-black/0'}`}
      style={{ backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className={`bg-neutral-900 rounded-xl shadow-2xl w-full max-w-md mx-4 relative border border-neutral-700 text-neutral-100 transform transition-all duration-500 p-6
            ${open ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-75 translate-y-2'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors"
        >
          <FaTimes size={20} />
        </button>
        {/* Modal Content */}
        <div className="">
          <h2 className="text-2xl font-bold text-white mb-6">Deposit</h2>
          <div className="space-y-4">
            {userLoading ? (
              <div className="space-y-4">
                <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 text-center">
                  <div className="text-neutral-300 text-sm">
                    Loading user data...
                  </div>
                </div>
              </div>
            ) : !user ? (
              <div className="space-y-4">
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-center">
                  <div className="text-red-400 text-sm">
                    Please login first to view your deposit address
                  </div>
                  <div className="text-xs text-neutral-400 mt-2">
                    Debug: User = {JSON.stringify(user)}, Loading = {userLoading.toString()}
                  </div>
                  <div className="text-xs text-neutral-400 mt-1">
                    Token exists: {!!Cookies.get('token') ? 'Yes' : 'No'}
                  </div>
                  {Cookies.get('token') && (
                    <button
                      onClick={() => {
                        refreshUser();
                      }}
                      className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
                    >
                      Refresh User Data
                    </button>
                  )}
                </div>
              </div>
            ) : user.publicKey ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-3">
                    Your Solana Deposit Address
                  </label>
                  <div className="space-y-3">
                    <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
                      <div className="flex gap-4">
                        <div className="flex-shrink-0">
                          {qrCodeDataUrl ? (
                            <img
                              src={qrCodeDataUrl}
                              alt="Deposit Address QR Code"
                              className="w-32 h-32 rounded border border-neutral-600"
                            />
                          ) : (
                            <div className="w-32 h-32 bg-neutral-700 rounded flex items-center justify-center">
                              <span className="text-neutral-400 text-xs">Generating QR...</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 flex flex-col justify-center">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-neutral-300">Deposit Address:</span>
                          </div>
                          <div className="flex items-start gap-2 relative">
                            <code className="text-sm text-emerald-400 bg-neutral-900 px-2 py-1 rounded flex-1 break-all leading-relaxed">
                              {user.publicKey}
                            </code>
                            <div className="relative flex items-center">
                              <button
                                onClick={() => copyToClipboard(user.publicKey)}
                                className="text-neutral-400 hover:text-white transition-colors p-1 flex-shrink-0 mt-1"
                                title="Copy address"
                              >
                                <FaCopy size={14} />
                              </button>
                              {copied && (
                                <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-neutral-800 text-emerald-400 text-xs px-3 py-1 rounded shadow transition-opacity duration-300 opacity-100 whitespace-nowrap z-20">
                                  Address copied successfully!
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-neutral-500 mt-2">
                            Scan QR code with your wallet or copy the address above
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-emerald-400 text-sm">
                        <FaCheckCircle />
                        <span>Deposit address loaded successfully</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="pt-4">
                  <button
                    onClick={() => copyToClipboard(user.publicKey)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-lg font-semibold transition cursor-pointer"
                  >
                    Copy Deposit Address
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 text-center">
                  <div className="text-yellow-400 text-sm mb-3">
                    No deposit address found for your account
                  </div>
                  <div className="text-neutral-400 text-xs">
                    Please contact support to set up your deposit address
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DepositModal; 