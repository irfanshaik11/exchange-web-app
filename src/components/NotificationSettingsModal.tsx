"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes, FaCheckCircle } from 'react-icons/fa';
import { IoIosNotificationsOutline } from 'react-icons/io';
import { showEnhancedToast } from '~/utils/enhancedToast';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ToastPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({ isOpen, onClose }) => {
  // Load settings from localStorage
  const getInitialDisplayNotifications = (): boolean => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem('notification-display-enabled');
      return saved !== 'false';
    } catch {
      return true;
    }
  };

  const getInitialTransactionSounds = (): boolean => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem('transaction-sounds-enabled');
      return saved !== 'false';
    } catch {
      return true;
    }
  };

  const getInitialToastPosition = (): ToastPosition => {
    if (typeof window === 'undefined') return 'top-center';
    try {
      const saved = localStorage.getItem('toast-position') as ToastPosition;
      
      // Migrate from bottom-center to top-center (or if no value exists)
      if (!saved || saved === 'bottom-center') {
        localStorage.setItem('toast-position', 'top-center');
        return 'top-center';
      }
      
      if (['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'].includes(saved)) {
        return saved;
      }
      
      // Invalid value, migrate to top-center
      localStorage.setItem('toast-position', 'top-center');
      return 'top-center';
    } catch {
      // Ignore
    }
    return 'top-center';
  };

  const [displayNotifications, setDisplayNotifications] = useState(getInitialDisplayNotifications);
  const [toastPosition, setToastPosition] = useState<ToastPosition>(getInitialToastPosition);
  const [transactionSounds, setTransactionSounds] = useState(getInitialTransactionSounds);
  const [animatingPosition, setAnimatingPosition] = useState<ToastPosition | null>(null);

  // Save settings to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('notification-display-enabled', String(displayNotifications));
    }
  }, [displayNotifications]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('toast-position', toastPosition);
      // Update Toaster position by dispatching a custom event
      window.dispatchEvent(new CustomEvent('toast-position-changed', { detail: { position: toastPosition } }));
    }
  }, [toastPosition]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('transaction-sounds-enabled', String(transactionSounds));
    }
  }, [transactionSounds]);

  const handlePositionClick = (position: ToastPosition) => {
    setToastPosition(position);
    setAnimatingPosition(position);
    
    // Show demo toast using enhanced toast
    showEnhancedToast('success', 'notif showing on the selected side right now', {
      position: position,
      duration: 2000,
    });

    // Reset animation after it completes
    setTimeout(() => {
      setAnimatingPosition(null);
    }, 600);
  };

  if (!isOpen || typeof window === 'undefined') return null;

  // CSS animations for toast popup
  const animationStyles = `
    @keyframes toastSlideIntopleft {
      from {
        opacity: 0;
        transform: translateX(-100%) translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateX(0) translateY(0);
      }
    }
    @keyframes toastSlideIntopcenter {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
    @keyframes toastSlideIntopright {
      from {
        opacity: 0;
        transform: translateX(100%) translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateX(0) translateY(0);
      }
    }
    @keyframes toastSlideInbottomleft {
      from {
        opacity: 0;
        transform: translateX(-100%) translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateX(0) translateY(0);
      }
    }
    @keyframes toastSlideInbottomcenter {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
    @keyframes toastSlideInbottomright {
      from {
        opacity: 0;
        transform: translateX(100%) translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateX(0) translateY(0);
      }
    }
  `;

  const positions: { label: string; value: ToastPosition }[] = [
    { label: 'Top Left', value: 'top-left' },
    { label: 'Top Center', value: 'top-center' },
    { label: 'Top Right', value: 'top-right' },
    { label: 'Bottom Left', value: 'bottom-left' },
    { label: 'Bottom Center', value: 'bottom-center' },
    { label: 'Bottom Right', value: 'bottom-right' },
  ];

  const AX = {
    bg: "#101114",
    surface: "#1E1F26",
    surface2: "#17191E",
    border: "#2A2B33",
    text: "#c7c9d1",
    muted: "#c7c9d1",
    mint: "#70E0B0",
  };

  return createPortal(
    <>
      <style>{animationStyles}</style>
      <div
        className="fixed inset-0 z-[99999] flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        onClick={onClose}
      >
        <div
          className="rounded-lg border shadow-2xl"
          style={{
            backgroundColor: AX.surface2,
            borderColor: AX.border,
            width: '420px',
            maxWidth: '90vw',
          }}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: AX.border }}>
          <h3 className="text-lg font-semibold" style={{ color: AX.text }}>
            Notification Settings
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: AX.muted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = AX.text;
              e.currentTarget.style.backgroundColor = AX.surface;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = AX.muted;
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <FaTimes size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-6">
          {/* Display Notifications Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-medium mb-1" style={{ color: AX.text }}>
                Display notifications
              </div>
              <div className="text-xs" style={{ color: AX.muted }}>
                Display wallet tracker toasts, and notification cards
              </div>
            </div>
            <button
              onClick={() => setDisplayNotifications(!displayNotifications)}
              className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
              style={{
                backgroundColor: displayNotifications ? AX.mint : '#4B5563',
              }}
            >
              <div
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200"
                style={{
                  transform: displayNotifications ? 'translateX(20px)' : 'translateX(0)',
                }}
              />
            </button>
          </div>

          {/* Transaction Sounds Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-medium mb-1" style={{ color: AX.text }}>
                Transaction Sounds
              </div>
            </div>
            <button
              onClick={() => setTransactionSounds(!transactionSounds)}
              className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
              style={{
                backgroundColor: transactionSounds ? AX.mint : '#4B5563',
              }}
            >
              <div
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200"
                style={{
                  transform: transactionSounds ? 'translateX(20px)' : 'translateX(0)',
                }}
              />
            </button>
          </div>

          {/* Toast Position */}
          <div>
            <div className="text-sm font-medium mb-3" style={{ color: AX.text }}>
              Toast Position
            </div>
            <div className="grid grid-cols-3 gap-2">
              {positions.map((pos) => {
                const isSelected = toastPosition === pos.value;
                return (
                  <div key={pos.value} className="flex flex-col items-center">
                    <button
                      onClick={() => handlePositionClick(pos.value)}
                      className="relative flex items-center justify-center p-3 rounded border transition-all overflow-hidden w-full"
                      style={{
                        backgroundColor: isSelected ? AX.surface : 'transparent',
                        borderColor: isSelected ? AX.mint : AX.border,
                        borderWidth: isSelected ? '2px' : '1px',
                        minHeight: '60px',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = AX.mint;
                          e.currentTarget.style.backgroundColor = AX.surface;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = AX.border;
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      {isSelected && (
                        <div className="absolute top-2 left-2 w-2 h-2 rounded-full" style={{ backgroundColor: AX.mint }} />
                      )}
                      
                      {/* Animated toast popup - tiny version matching enhanced toast styling */}
                      {animatingPosition === pos.value && (
                        <div
                          className="absolute rounded-lg shadow-lg"
                          style={{
                            background: '#1E1F26',
                            color: '#E6E7EA',
                            border: '1px solid #70E0B0',
                            zIndex: 10,
                            padding: '3px 5px',
                            fontSize: '6px',
                            fontWeight: '500',
                            maxWidth: '50px',
                            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
                            ...(pos.value === 'top-left' && {
                              top: '4px',
                              left: '4px',
                              animation: 'toastSlideIntopleft 0.5s ease-out forwards',
                            }),
                            ...(pos.value === 'top-center' && {
                              top: '4px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              animation: 'toastSlideIntopcenter 0.5s ease-out forwards',
                            }),
                            ...(pos.value === 'top-right' && {
                              top: '4px',
                              right: '4px',
                              animation: 'toastSlideIntopright 0.5s ease-out forwards',
                            }),
                            ...(pos.value === 'bottom-left' && {
                              bottom: '4px',
                              left: '4px',
                              animation: 'toastSlideInbottomleft 0.5s ease-out forwards',
                            }),
                            ...(pos.value === 'bottom-center' && {
                              bottom: '4px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              animation: 'toastSlideInbottomcenter 0.5s ease-out forwards',
                            }),
                            ...(pos.value === 'bottom-right' && {
                              bottom: '4px',
                              right: '4px',
                              animation: 'toastSlideInbottomright 0.5s ease-out forwards',
                            }),
                          }}
                        >
                          <div className="flex items-center gap-0.5">
                            <FaCheckCircle size={5} style={{ color: '#70E0B0', flexShrink: 0 }} />
                            <span className="truncate" style={{ fontSize: '6px', lineHeight: '1.2' }}>notif</span>
                          </div>
                        </div>
                      )}
                    </button>
                    <div className="text-xs font-medium mt-1.5" style={{ color: AX.text }}>
                      {pos.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t" style={{ borderColor: AX.border }}>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-lg font-medium transition-all"
            style={{
              backgroundColor: AX.mint,
              color: '#0e2823',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            Done
          </button>
        </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default NotificationSettingsModal;

