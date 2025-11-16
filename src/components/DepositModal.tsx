"use client";

import React, { useEffect, useState } from "react";
import { FaCopy, FaTimes, FaQuestionCircle } from "react-icons/fa";
import Cookies from "js-cookie";
import QRCode from "qrcode";
import { useUser } from "./UserContext";
import toast from "react-hot-toast";

// Extend Window interface to include MoonPay and Jupiter
declare global {
  interface Window {
    MoonPayWebSdk?: any;
    Jupiter?: {
      init: (config: {
        displayMode: string;
        integratedTargetId?: string;
        endpoint?: string;
        strictTokenList?: boolean;
        defaultExplorer?: string;
        formProps?: {
          initialInputMint?: string;
          initialOutputMint?: string;
          fixedInputMint?: boolean;
          fixedOutputMint?: boolean;
        };
        enableWalletPassthrough?: boolean;
        onSuccess?: (txid: string) => void;
        onSwapError?: (error: Error) => void;
      }) => void;
      close: () => void;
      resume: () => void;
    };
  }
}

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: TabType;
}

type TabType = 'convert' | 'deposit' | 'buy';

const DepositModal: React.FC<DepositModalProps> = ({ open, onClose, initialTab = 'deposit' }) => {
  const { user, loading: userLoading, refreshUser, refreshBalance, solBalance } = useUser();
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [moonPayLoaded, setMoonPayLoaded] = useState(false);
  const [jupiterLoaded, setJupiterLoaded] = useState(false);

  // Update active tab when initialTab changes
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (open) {
      setShow(true);
      document.body.style.overflow = "hidden";
      // Refresh balance when modal opens
      if (refreshBalance) {
        refreshBalance();
      }
    } else {
      const timeout = setTimeout(() => setShow(false), 300);
      document.body.style.overflow = "";
      return () => clearTimeout(timeout);
    }
  }, [open, refreshBalance]);

  useEffect(() => {
    if (user?.publicKey) {
      QRCode.toDataURL(user.publicKey, {
        width: 280,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })
        .then((url) => {
          setQrCodeDataUrl(url);
        })
        .catch((err) => {
          setQrCodeDataUrl("");
        });
    } else {
      setQrCodeDataUrl("");
    }
  }, [user?.publicKey]);

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          toast.success("Address copied to clipboard!", {
            duration: 2000,
            style: {
              background: '#1E1F26',
              color: '#E6E7EA',
              border: '1px solid #18c48c',
            }
          });
          setTimeout(() => setCopied(false), 2000);
        })
        .catch((err) => {
          console.error("Clipboard write failed:", err);
          toast.error("Failed to copy address", {
            duration: 2000,
            style: {
              background: '#1E1F26',
              color: '#E6E7EA',
              border: '1px solid #ff6b6b',
            }
          });
        });
    } else {
      console.warn("Clipboard API not available.");
    }
  };

  // Load MoonPay SDK
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.MoonPayWebSdk) {
      const script = document.createElement('script');
      script.src = 'https://static.moonpay.com/web-sdk/v1/moonpay-web-sdk.min.js';
      script.async = true;
      script.onload = () => {
        setMoonPayLoaded(true);
      };
      document.body.appendChild(script);

      return () => {
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      };
    } else if (window.MoonPayWebSdk) {
      setMoonPayLoaded(true);
    }
  }, []);

  // Load Jupiter Plugin SDK
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.Jupiter) {
      const script = document.createElement('script');
      script.src = 'https://terminal.jup.ag/main-v3.js';
      script.async = true;
      script.onload = () => {
        setJupiterLoaded(true);
      };
      script.onerror = () => {
        console.error('Failed to load Jupiter Plugin');
      };
      document.head.appendChild(script);

      return () => {
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      };
    } else if (window.Jupiter) {
      setJupiterLoaded(true);
    }
  }, []);

  // Initialize Jupiter Plugin when Convert tab is active
  useEffect(() => {
    if (activeTab === 'convert' && jupiterLoaded && window.Jupiter && open) {
      try {
        window.Jupiter.init({
          displayMode: 'integrated',
          integratedTargetId: 'jupiter-swap-container',
          endpoint: 'https://api.mainnet-beta.solana.com',
          strictTokenList: false,
          defaultExplorer: 'Solscan',
          formProps: {
            // SOL mint address
            initialOutputMint: 'So11111111111111111111111111111111111111112',
            // Fixed to output SOL
            fixedOutputMint: true,
          },
          enableWalletPassthrough: false,
          onSuccess: (txid: string) => {
            toast.success(`Swap successful! Transaction: ${txid.slice(0, 8)}...`, {
              duration: 5000,
              style: {
                background: '#1E1F26',
                color: '#E6E7EA',
                border: '1px solid #18c48c',
              }
            });
            // Refresh balance after successful swap
            if (refreshBalance) {
              setTimeout(() => refreshBalance(), 2000);
            }
          },
          onSwapError: (error: Error) => {
            console.error('Swap error:', error);
            toast.error(`Swap failed: ${error.message}`, {
              duration: 4000,
              style: {
                background: '#1E1F26',
                color: '#E6E7EA',
                border: '1px solid #ff6b6b',
              }
            });
          },
        });
      } catch (error) {
        console.error('Error initializing Jupiter:', error);
      }
    }
  }, [activeTab, jupiterLoaded, open, refreshBalance]);

  // Function to show MoonPay widget
  const showMoonPay = async () => {
    if (!moonPayLoaded || !window.MoonPayWebSdk) {
      toast.error("MoonPay is loading, please try again in a moment", {
        duration: 2000,
        style: {
          background: '#1E1F26',
          color: '#E6E7EA',
          border: '1px solid #ff6b6b',
        }
      });
      return;
    }

    try {
      const moonPaySdk = window.MoonPayWebSdk.init({
        flow: 'buy',
        environment: 'sandbox',
        variant: 'overlay',
        params: {
          apiKey: 'pk_test_YHWJ7oKvmbrFCK6Ddt1KF5KJr7lT1oU2',
          theme: 'dark',
          baseCurrencyCode: 'usd',
          baseCurrencyAmount: '100',
          defaultCurrencyCode: 'sol',
          walletAddress: user?.publicKey || '',
        }
      });

      moonPaySdk.show();
    } catch (error) {
      console.error("Error showing MoonPay:", error);
      toast.error("Failed to load MoonPay widget", {
        duration: 2000,
        style: {
          background: '#1E1F26',
          color: '#E6E7EA',
          border: '1px solid #ff6b6b',
        }
      });
    }
  };

  if (!open && !show) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[9998] bg-black/60 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-[9999] w-full max-w-[480px] transform transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ backgroundColor: "#1a1b20" }}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#2A2B33" }}>
            <h2 className="text-2xl font-bold text-white">
              {activeTab === 'convert' ? 'Convert' : activeTab === 'deposit' ? 'Deposit' : 'Buy'}
            </h2>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white transition-colors"
            >
              <FaTimes size={24} />
            </button>
          </div>

          {/* Tabs */}
          <div className="px-6 pt-6 pb-3">
            <div 
              className="flex gap-2 p-1 rounded-2xl" 
              style={{ backgroundColor: "#0a0b0f" }}
            >
              <button
                onClick={() => setActiveTab('convert')}
                className={`flex-1 py-3 px-4 rounded-xl text-base font-medium transition-all duration-200 ${
                  activeTab === 'convert' 
                    ? 'text-white' 
                    : 'text-neutral-400 hover:text-neutral-300'
                }`}
                style={{
                  backgroundColor: activeTab === 'convert' ? '#2A2D35' : 'transparent'
                }}
              >
                Convert
              </button>
              <button
                onClick={() => setActiveTab('deposit')}
                className={`flex-1 py-3 px-4 rounded-xl text-base font-medium transition-all duration-200 ${
                  activeTab === 'deposit' 
                    ? 'text-white' 
                    : 'text-neutral-400 hover:text-neutral-300'
                }`}
                style={{
                  backgroundColor: activeTab === 'deposit' ? '#2A2D35' : 'transparent'
                }}
              >
                Deposit
              </button>
              <button
                onClick={() => setActiveTab('buy')}
                className={`flex-1 py-3 px-4 rounded-xl text-base font-medium transition-all duration-200 ${
                  activeTab === 'buy' 
                    ? 'text-white' 
                    : 'text-neutral-400 hover:text-neutral-300'
                }`}
                style={{
                  backgroundColor: activeTab === 'buy' ? '#2A2D35' : 'transparent'
                }}
              >
                Buy
              </button>
            </div>
          </div>

          {/* Subtitle */}
          <div className="px-6 pb-3 text-neutral-400 text-sm">
            {activeTab === 'convert' && 'Convert your crypto to SOL'}
            {activeTab === 'deposit' && 'Deposit SOL to your Narrative wallet'}
            {activeTab === 'buy' && 'Buy SOL with fiat currency'}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {/* Convert Tab */}
            {activeTab === 'convert' && (
              <div className="space-y-4">
                {/* Jupiter Swap Container */}
                {jupiterLoaded ? (
                  <div 
                    id="jupiter-swap-container" 
                    className="rounded-3xl overflow-hidden"
                    style={{ 
                      minHeight: '500px',
                      backgroundColor: '#0a0b0f'
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-64">
                    <div className="text-neutral-400 text-center">
                      <div className="mb-4">
                        <div className="mx-auto w-16 h-16 border-4 border-neutral-700 border-t-[#18c48c] rounded-full animate-spin" />
                      </div>
                      <p className="text-lg">Loading Jupiter Swap...</p>
                      <p className="text-sm mt-2">Please wait a moment</p>
                    </div>
                  </div>
                )}
                
                {/* Info Box */}
                {jupiterLoaded && (
                  <div className="flex gap-3 p-4 rounded-3xl" style={{ backgroundColor: "rgba(59, 130, 246, 0.1)", borderColor: "#3b82f6", border: "1px solid" }}>
                    <div className="flex-shrink-0 mt-0.5">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#3b82f6" }}>
                        <circle cx="12" cy="12" r="10" fill="currentColor" />
                        <path d="M12 8v4m0 4h.01" stroke="#1a1b20" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="text-sm leading-relaxed" style={{ color: "#60a5fa" }}>
                      <span className="font-semibold">Note: </span>
                      Convert any Solana token to SOL. The output will be automatically delivered to your Narrative wallet.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Deposit Tab */}
            {activeTab === 'deposit' && (
              <>
                {userLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-neutral-400">Loading wallet data...</div>
                  </div>
                ) : !user ? (
                  <div className="rounded-3xl border border-red-500/30 bg-red-900/20 p-6 text-center">
                    <div className="text-sm text-red-400">Please login first to view your deposit address</div>
                    {Cookies.get("token") && (
                      <button
                        onClick={refreshUser}
                        className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-3xl transition-colors"
                      >
                        Refresh User Data
                      </button>
                    )}
                  </div>
                ) : user.publicKey ? (
              <div className="space-y-6">
                {/* Wallet Info Box */}
                <div className="rounded-3xl border p-4" style={{ backgroundColor: "#0a0b0f", borderColor: "#2A2B33" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-neutral-400 mb-1">Narrative Wallet</div>
                      <div className="text-sm text-neutral-300 font-mono">
                        {user.publicKey.slice(0, 4)}...{user.publicKey.slice(-4)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 text-2xl font-bold text-white">
                        <img
                          src="https://www.pngall.com/wp-content/uploads/10/Solana-Crypto-Logo-PNG-File.png"
                          alt="SOL"
                          className="w-5 h-5 rounded-full"
                        />
                        {solBalance.toFixed(4)}
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        SOL Balance
                      </div>
                    </div>
                  </div>
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center py-6">
                  {qrCodeDataUrl ? (
                    <div className="p-4 bg-white rounded-3xl">
                      <img 
                        src={qrCodeDataUrl} 
                        alt="Deposit Address QR Code" 
                        className="w-64 h-64 rounded-2xl"
                      />
                    </div>
                  ) : (
                    <div className="flex h-64 w-64 items-center justify-center rounded-3xl bg-neutral-800">
                      <span className="text-neutral-400">Generating QR...</span>
                    </div>
                  )}
                </div>

                {/* Address Display */}
                <div className="space-y-2">
                  <div 
                    className="w-full p-4 rounded-3xl text-center break-all font-mono text-sm"
                    style={{ backgroundColor: "#0a0b0f", color: "#E6E7EA" }}
                  >
                    {user.publicKey}
                  </div>

                  {/* Caution Message */}
                  <div className="flex gap-3 p-4 rounded-3xl" style={{ backgroundColor: "rgba(217, 119, 6, 0.1)", borderColor: "#d97706", border: "1px solid" }}>
                    <div className="flex-shrink-0 mt-0.5">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#d97706" }}>
                        <circle cx="12" cy="12" r="10" fill="currentColor" />
                        <path d="M12 8v4m0 4h.01" stroke="#1a1b20" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="text-sm leading-relaxed" style={{ color: "#fbbf24" }}>
                      <span className="font-semibold">Caution: </span>
                      This address only supports SOL deposits via the Solana network. Please do not use other networks to avoid any loss of funds.
                    </div>
                  </div>

                  {/* Copy Button */}
                  <button
                    onClick={() => copyToClipboard(user.publicKey)}
                    className="w-full py-4 rounded-3xl font-semibold text-base transition-all duration-200 hover:opacity-90"
                    style={{ backgroundColor: "#E8E9EB", color: "#000000" }}
                  >
                    Copy Address
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-yellow-500/30 bg-yellow-900/20 p-6 text-center">
                <div className="mb-3 text-sm text-yellow-400">No deposit address found for your account</div>
                <div className="text-xs text-neutral-400">Please contact support to set up your deposit address</div>
              </div>
            )}
              </>
            )}

            {/* Buy Tab */}
            {activeTab === 'buy' && (
              <div className="space-y-6">
                <div className="rounded-3xl border p-6" style={{ backgroundColor: "#0a0b0f", borderColor: "#2A2B33" }}>
                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-semibold text-white">Buy SOL with Card</h3>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ backgroundColor: "#7D00FF" }}>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="white">
                          <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                        </svg>
                        <span className="text-xs font-semibold text-white">MoonPay</span>
                      </div>
                    </div>
                    <p className="text-sm text-neutral-400">
                      Purchase SOL using your credit or debit card through MoonPay
                    </p>
                  </div>

                  {user?.publicKey ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl p-4" style={{ backgroundColor: "#1a1b20", borderColor: "#2A2B33", border: "1px solid" }}>
                        <div className="text-xs text-neutral-400 mb-1">Delivery Address</div>
                        <div className="text-sm text-neutral-300 font-mono break-all">
                          {user.publicKey}
                        </div>
                      </div>

                      <button
                        onClick={showMoonPay}
                        disabled={!moonPayLoaded}
                        className="w-full py-4 rounded-3xl font-semibold text-base transition-all duration-200 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        style={{ backgroundColor: "#7D00FF", color: "#ffffff" }}
                      >
                        {moonPayLoaded ? (
                          <>
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                              <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                            </svg>
                            <span>Buy SOL with MoonPay</span>
                          </>
                        ) : (
                          'Loading MoonPay...'
                        )}
                      </button>

                      <div className="flex gap-3 p-4 rounded-3xl" style={{ backgroundColor: "rgba(59, 130, 246, 0.1)", borderColor: "#3b82f6", border: "1px solid" }}>
                        <div className="flex-shrink-0 mt-0.5">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#3b82f6" }}>
                            <circle cx="12" cy="12" r="10" fill="currentColor" />
                            <path d="M12 8v4m0 4h.01" stroke="#1a1b20" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </div>
                        <div className="text-sm leading-relaxed" style={{ color: "#60a5fa" }}>
                          <span className="font-semibold">Note: </span>
                          You will be redirected to MoonPay to complete your purchase. SOL will be sent directly to your Narrative wallet address.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-yellow-500/30 bg-yellow-900/20 p-6 text-center">
                      <div className="text-sm text-yellow-400">Please login first to buy SOL</div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-neutral-500">
                  <span>Powered by MoonPay • Secure payment processing</span>
                  <a
                    href="https://www.moonpay.com/contact-us"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-neutral-400 hover:text-neutral-300 transition-colors"
                    title="Need help? Contact MoonPay support"
                  >
                    <FaQuestionCircle size={14} />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default DepositModal;
