import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  FaWallet, 
  FaCompass, 
  FaChartLine, 
  FaChartBar,
  FaDiscord,
  FaFileAlt,
  FaChevronDown,
  FaCog,
  FaBars,
  FaTelegram,
  FaTimes
} from 'react-icons/fa';
import { GoServer } from 'react-icons/go';
import { VscWindow } from 'react-icons/vsc';
import { IoIosNotificationsOutline } from 'react-icons/io';
import { IoColorPaletteOutline } from 'react-icons/io5';
import QuickBuySettingsModal from './QuickBuySettingsModal';
import PnLModal from './PnLModal';
import WalletSwitcher from './WalletSwitcher';
import WalletTrackerPopup from './WalletTrackerPopup';
import TwitterTrackerPopup from './TwitterTrackerPopup';
import DiscoverPopup from './DiscoverPopup';
import PulsePopup from './PulsePopup';
import NotificationSettingsModal from './NotificationSettingsModal';
import ThemeCustomizationModal from './ThemeCustomizationModal';
import { useQuickBuy } from './QuickBuyContext';
import { useSolPrice } from './SolPriceContext';
import { useUser } from './UserContext';
import { env } from '../env';

// Custom X (Twitter) icon component
const XIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

// Utility Icon Button with Tooltip Component
const UtilityIconButton: React.FC<{
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  tooltip?: string;
  onClick?: () => void;
  isActive?: boolean;
  iconSize?: number;
  strokeWidth?: number;
}> = ({ icon: IconComponent, tooltip, onClick, isActive = false, iconSize = 11, strokeWidth }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ bottom: 0, left: 0 });

  const updateTooltipPosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setTooltipPosition({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left + rect.width / 2,
      });
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        className="p-1 rounded transition-all duration-300 ease-out"
        style={{ 
          color: isActive ? AX.text : AX.muted,
          backgroundColor: isActive ? `${AX.mint}10` : 'transparent',
          cursor: 'pointer'
        }}
        onClick={onClick}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.color = AX.mint;
            e.currentTarget.style.backgroundColor = `${AX.mint}10`;
          }
          if (tooltip) {
            updateTooltipPosition();
            setShowTooltip(true);
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.color = AX.muted;
            e.currentTarget.style.backgroundColor = 'transparent';
          }
          setShowTooltip(false);
        }}
      >
        <IconComponent 
          size={iconSize} 
          className={iconSize > 11 ? "sm:w-4 sm:h-4" : "sm:w-3 sm:h-3"}
          {...(strokeWidth !== undefined ? { strokeWidth } : {})}
        />
      </button>
      {tooltip && showTooltip && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed px-2 py-1 rounded text-xs font-medium pointer-events-none whitespace-nowrap"
          style={{
            backgroundColor: AX.surface,
            color: AX.text,
            border: `1px solid ${AX.border}`,
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
            zIndex: 99999,
            bottom: `${tooltipPosition.bottom}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translateX(-50%)',
          }}
        >
          {tooltip}
          {/* Tooltip arrow pointing down */}
          <div
            className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent"
            style={{ borderTopColor: AX.surface }}
          />
        </div>,
        document.body
      )}
    </div>
  );
};

// Official Solana logo component
export const SolanaIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 397.7 311.7" fill="currentColor">
    <defs>
      <linearGradient id="solanaGradient" x1="360.8791" y1="351.4553" x2="141.213" y2="-69.2936" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#00FFA3"/>
        <stop offset="1" stopColor="#DC1FFF"/>
      </linearGradient>
      <linearGradient id="solanaGradient2" x1="264.8291" y1="401.6014" x2="45.163" y2="-19.1475" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#00FFA3"/>
        <stop offset="1" stopColor="#DC1FFF"/>
      </linearGradient>
      <linearGradient id="solanaGradient3" x1="312.5484" y1="376.688" x2="92.8822" y2="-44.061" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#00FFA3"/>
        <stop offset="1" stopColor="#DC1FFF"/>
      </linearGradient>
    </defs>
    <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z" fill="url(#solanaGradient)"/>
    <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z" fill="url(#solanaGradient2)"/>
    <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z" fill="url(#solanaGradient3)"/>
  </svg>
);

/* ---- style palette ---- */
const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#c7c9d1",
  muted: "#c7c9d1",
  mint: "#70E0B0",
  mintHover: "#58B890",
  sell: "#FF4D7F",
  green: "#31e3ac",
  red: "#ef4444",
  purple: "#8b5cf6",
  teal: "#14b8a6",
};

export default function Footer() {
  const router = useRouter();
  
  // Load popup states from localStorage on mount
  const getInitialPopupState = (key: string, defaultValue: boolean = false): boolean => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const saved = localStorage.getItem(`footer-popup-${key}`);
      return saved === 'true';
    } catch {
      return defaultValue;
    }
  };

  const [showWalletDropdown, setShowWalletDropdown] = useState(() => getInitialPopupState('wallet'));
  const [showTwitterDropdown, setShowTwitterDropdown] = useState(() => getInitialPopupState('twitter'));
  const [showDiscoverDropdown, setShowDiscoverDropdown] = useState(() => getInitialPopupState('discover'));
  const [showPulseDropdown, setShowPulseDropdown] = useState(() => getInitialPopupState('pulse'));
  const [showGlobalDropdown, setShowGlobalDropdown] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showPnLModal, setShowPnLModal] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showThemeCustomization, setShowThemeCustomization] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [modalPosition, setModalPosition] = useState({ bottom: 0, right: 0 });
  const [selectedRegion, setSelectedRegion] = useState('Europe');
  const globalButtonRef = React.useRef<HTMLButtonElement>(null);
  
  // Load header bar visibility state from localStorage
  const getInitialHeaderBarVisible = (): boolean => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem('header-bar-visible');
      return saved !== 'false'; // Default to visible
    } catch {
      return true;
    }
  };
  
  const [headerBarVisible, setHeaderBarVisible] = useState(getInitialHeaderBarVisible);
  
  // Save header bar visibility to localStorage and update body class
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('header-bar-visible', String(headerBarVisible));
      if (headerBarVisible) {
        document.body.classList.remove('hide-header-bar');
      } else {
        document.body.classList.add('hide-header-bar');
      }
    }
  }, [headerBarVisible]);
  const { activePreset } = useQuickBuy();
  const { solPrice } = useSolPrice(); // Use shared SOL price from context
  const { solBalance } = useUser();

  // Save popup states to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('footer-popup-wallet', String(showWalletDropdown));
    }
  }, [showWalletDropdown]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('footer-popup-twitter', String(showTwitterDropdown));
    }
  }, [showTwitterDropdown]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('footer-popup-discover', String(showDiscoverDropdown));
    }
  }, [showDiscoverDropdown]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('footer-popup-pulse', String(showPulseDropdown));
    }
  }, [showPulseDropdown]);

  // Check backend health and measure latency
  useEffect(() => {
    const checkHealth = async () => {
      // Use the Go service health endpoint which is more reliable
      const healthUrl = `${env.NEXT_PUBLIC_GO_SERVICE_URL}/healthz`;
      
      try {
        const startTime = performance.now();
        const response = await fetch(healthUrl, {
          method: 'GET',
          headers: {
            'accept': 'application/json',
          },
          signal: AbortSignal.timeout(5000)
        });
        const endTime = performance.now();
        const ping = Math.round(endTime - startTime);
        
        if (response.ok) {
          // Try to parse JSON to confirm it's a valid health response
          try {
            const data = await response.json();
            setIsConnected(true);
            setLatency(ping);
          } catch {
            // If JSON parse fails but status is OK, still consider connected
            setIsConnected(true);
            setLatency(ping);
          }
        } else {
          setIsConnected(false);
          setLatency(null);
        }
      } catch (error) {
        // Network error, timeout, or CORS issue - server is likely down
        setIsConnected(false);
        setLatency(null);
      }
    };

    // Check immediately
    checkHealth();
    
    // Then check every 10 seconds
    const interval = setInterval(checkHealth, 10000);
    
    return () => clearInterval(interval);
  }, []);

  // Update modal position when dropdown opens
  useEffect(() => {
    if (showGlobalDropdown && globalButtonRef.current) {
      const rect = globalButtonRef.current.getBoundingClientRect();
      setModalPosition({
        bottom: window.innerHeight - rect.top + 8,
        right: window.innerWidth - rect.right
      });
    }
  }, [showGlobalDropdown]);

  // Close global dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showGlobalDropdown) {
        const target = event.target as HTMLElement;
        if (!target.closest('.global-dropdown-container') && !target.closest('.regions-modal')) {
          setShowGlobalDropdown(false);
        }
      }
    };

    if (showGlobalDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showGlobalDropdown]);

  const navLinks = [
    { name: "Wallet", href: "/trackers", icon: FaWallet },
    { name: "Twitter", href: "/twitter", icon: XIcon, hasNotification: true },
    { name: "Discover", href: "/", icon: FaCompass, hasNotification: true },
    { name: "Pulse", href: "/pulse", icon: FaChartLine, hasNotification: true },
    // { name: "PnL", href: "/pnl", icon: FaChartBar }, // Disabled: 404 route not available
  ];

  const statusIcons = [
    { icon: "❤️", color: "red" },
    { icon: "💊", color: "green" },
    { icon: "🦊", color: "orange" },
  ];

  const utilityIcons = [
    { 
      icon: VscWindow, 
      tooltip: headerBarVisible ? "Hide Watchlist Ticker" : "Show Watchlist Ticker", 
      onClick: () => setHeaderBarVisible(!headerBarVisible),
      isActive: headerBarVisible,
      iconSize: 16,
      strokeWidth: 0.7
    },
    { 
      icon: IoIosNotificationsOutline, 
      tooltip: "Notifications", 
      iconSize: 16, 
      strokeWidth: 0.7,
      onClick: () => setShowNotificationSettings(true)
    },
    { 
      icon: IoColorPaletteOutline, 
      tooltip: "Customize Theme", 
      iconSize: 16,
      strokeWidth: 0.7,
      onClick: () => setShowThemeCustomization(true)
    },
  ];

  const socialLinks = [
    { icon: FaDiscord, href: "https://discord.gg/sACYQmCsTJ", tooltip: "Discord", text: undefined },
    { icon: XIcon, href: "https://x.com/narrative_hq", tooltip: "Twitter", text: undefined },
    { icon: FaTelegram, href: "https://t.me/+DDXGrsJoe3szYTAx", tooltip: "Telegram", text: undefined },
    // { icon: FaFileAlt, href: "/docs", tooltip: "Docs", text: "Docs" },
  ];

  return (
    <footer 
      className="fixed bottom-0 left-0 right-0 z-30 border-t backdrop-blur"
      style={{ 
        backgroundColor: AX.bg, 
        borderColor: AX.border 
      }}
    >
      <div className="flex items-center justify-between px-2 sm:px-2 py-1 h-9 overflow-x-auto">
        {/* Left Section - Preset Button */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <button
            className="flex items-center gap-1 sm:gap-2 px-2 py-1 rounded-md text-[11px] sm:text-xs font-medium transition-all duration-300 ease-out"
            style={{
              backgroundColor: AX.mint,
              color: '#000000',
              border: `1px solid ${AX.mint}`,
              cursor: 'pointer'
            }}
            onClick={() => setShowPresetModal(true)}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = AX.mintHover;
              e.currentTarget.style.boxShadow = '0 0 8px rgba(112, 224, 176, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = AX.mint;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <FaBars size={11} className="sm:w-3 sm:h-3" />
            <FaCog size={11} className="sm:w-3 sm:h-3" />
            <span className="hidden sm:inline leading-none">PRESET {activePreset + 1}</span>
            <span className="sm:hidden leading-none">P{activePreset + 1}</span>
          </button>

          {/* Wallet Display */}
          <div className="relative">
              {/* Commented out: Original wallet button that navigates to trackers page */}
              {/* <button
                onClick={() => router.push('/trackers')}
                className="flex items-center gap-1 sm:gap-2 px-2 py-1 rounded-full border transition-all duration-300 ease-out"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: AX.border,
                  color: AX.text
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = AX.surface;
                  e.currentTarget.style.borderColor = AX.mint;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderColor = AX.border;
                }}
              >
                <FaWallet size={9} className="sm:w-3 sm:h-3" />
                <SolanaIcon size={12} />
                <span className="text-[11px] sm:text-xs font-medium leading-none">{Number.isFinite(solBalance) ? solBalance.toFixed(4) : '0.0000'}</span>
              </button> */}
              
              {/* New: Wallet button that opens popup */}
              <button
                onClick={() => setShowWalletDropdown(!showWalletDropdown)}
                className="flex items-center gap-1 sm:gap-2 px-2 py-1 rounded-full border transition-all duration-300 ease-out"
                style={{
                  backgroundColor: showWalletDropdown ? `${AX.mint}20` : 'transparent',
                  borderColor: showWalletDropdown ? AX.mint : AX.border,
                  color: showWalletDropdown ? AX.mint : AX.text,
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  if (!showWalletDropdown) {
                    e.currentTarget.style.backgroundColor = AX.surface;
                    e.currentTarget.style.borderColor = AX.mint;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!showWalletDropdown) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = AX.border;
                  }
                }}
              >
                <FaWallet size={11} className="sm:w-3 sm:h-3" />
                <SolanaIcon size={12} />
                <span className="text-[11px] sm:text-xs font-medium leading-none">{Number.isFinite(solBalance) ? solBalance.toFixed(4) : '0.0000'}</span>
              </button>
          </div>
        </div>

        {/* Center Section - Navigation Links */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {navLinks.map((link, index) => {
            const IconComponent = link.icon;
            const isActive = link.name === 'Wallet' ? showWalletDropdown : link.name === 'Twitter' ? showTwitterDropdown : link.name === 'Discover' ? showDiscoverDropdown : link.name === 'Pulse' ? showPulseDropdown : router.pathname === link.href;
            
            return (
              <React.Fragment key={link.name}>
                {index > 0 && (
                  <div 
                    className="w-px h-3 sm:h-4 mx-1" 
                    style={{ backgroundColor: AX.border }}
                  />
                )}
                {link.name === 'Wallet' ? (
                  <button
                    onClick={() => setShowWalletDropdown(!showWalletDropdown)}
                    className="relative flex items-center gap-1 sm:gap-2 px-2 py-1 rounded transition-all duration-300 ease-out group"
                    style={{
                      color: isActive ? AX.mint : AX.muted,
                      backgroundColor: isActive ? `${AX.mint}20` : 'transparent',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = AX.mint;
                        e.currentTarget.style.backgroundColor = `${AX.mint}10`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = AX.muted;
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <IconComponent size={11} className="sm:w-3 sm:h-3" />
                    <span className="text-[11px] sm:text-xs hidden sm:inline leading-none">{link.name}</span>
                  </button>
                ) : link.name === 'Twitter' ? (
                  <button
                    onClick={() => setShowTwitterDropdown(!showTwitterDropdown)}
                    className="relative flex items-center gap-1 sm:gap-2 px-2 py-1 rounded transition-all duration-300 ease-out group"
                    style={{
                      color: isActive ? AX.mint : AX.muted,
                      backgroundColor: isActive ? `${AX.mint}20` : 'transparent',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = AX.mint;
                        e.currentTarget.style.backgroundColor = `${AX.mint}10`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = AX.muted;
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <IconComponent size={11} className="sm:w-3 sm:h-3" />
                    <span className="text-[11px] sm:text-xs hidden sm:inline leading-none">{link.name}</span>
                  </button>
                ) : link.name === 'Discover' ? (
                  <button
                    onClick={() => setShowDiscoverDropdown(!showDiscoverDropdown)}
                    className="relative flex items-center gap-1 sm:gap-2 px-2 py-1 rounded transition-all duration-300 ease-out group"
                    style={{
                      color: isActive ? AX.mint : AX.muted,
                      backgroundColor: isActive ? `${AX.mint}20` : 'transparent',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = AX.mint;
                        e.currentTarget.style.backgroundColor = `${AX.mint}10`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = AX.muted;
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <IconComponent size={11} className="sm:w-3 sm:h-3" />
                    <span className="text-[11px] sm:text-xs hidden sm:inline leading-none">{link.name}</span>
                  </button>
                ) : link.name === 'Pulse' ? (
                  <button
                    onClick={() => setShowPulseDropdown(!showPulseDropdown)}
                    className="relative flex items-center gap-1 sm:gap-2 px-2 py-1 rounded transition-all duration-300 ease-out group"
                    style={{
                      color: isActive ? AX.mint : AX.muted,
                      backgroundColor: isActive ? `${AX.mint}20` : 'transparent',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = AX.mint;
                        e.currentTarget.style.backgroundColor = `${AX.mint}10`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = AX.muted;
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <IconComponent size={11} className="sm:w-3 sm:h-3" />
                    <span className="text-[11px] sm:text-xs hidden sm:inline leading-none">{link.name}</span>
                  </button>
                ) : (
                  <Link
                    href={link.href}
                    className="relative flex items-center gap-1 sm:gap-2 px-2 py-1 rounded transition-all duration-300 ease-out group"
                    style={{
                      color: isActive ? AX.mint : AX.muted,
                      backgroundColor: isActive ? `${AX.mint}20` : 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = AX.mint;
                        e.currentTarget.style.backgroundColor = `${AX.mint}10`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = AX.muted;
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <IconComponent size={11} className="sm:w-3 sm:h-3" />
                    <span className="text-[11px] sm:text-xs hidden sm:inline leading-none">{link.name}</span>
                    {/* Notification bubble removed */}
                  </Link>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Right Section - Status, Price, Global, Utilities, Social */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {/* Status Icons */}
          {/* <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full border" style={{ borderColor: AX.border }}>
            {statusIcons.map((status, index) => (
              <div key={index} className="text-xs">
                {status.icon}
              </div>
            ))}
          </div> */}

          {/* PnL Link */}
          <button
            onClick={() => setShowPnLModal(!showPnLModal)}
            className="flex items-center gap-1 sm:gap-2 px-2 py-1 rounded transition-all duration-300 ease-out group"
            style={{
              color: showPnLModal ? AX.mint : AX.muted,
              backgroundColor: showPnLModal ? `${AX.mint}20` : 'transparent',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              if (!showPnLModal) {
                e.currentTarget.style.color = AX.mint;
                e.currentTarget.style.backgroundColor = `${AX.mint}10`;
              }
            }}
            onMouseLeave={(e) => {
              if (!showPnLModal) {
                e.currentTarget.style.color = AX.muted;
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <FaChartBar size={11} className="sm:w-3 sm:h-3" />
            <span className="text-[11px] sm:text-xs hidden sm:inline leading-none">PnL</span>
          </button>

          <div className="w-px h-3 sm:h-4" style={{ backgroundColor: AX.border }} />

          {/* Solana Price */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-full border" style={{ borderColor: AX.border }}>
            <SolanaIcon size={12} />
            <span className="text-[11px] sm:text-xs font-medium" style={{ color: AX.green }}>
              {solPrice > 0 ? `$${solPrice.toFixed(2)}` : '...'}
            </span>
          </div>

          <div className="w-px h-3 sm:h-4 hidden sm:block" style={{ backgroundColor: AX.border }} />

          {/* Connection Status Indicator */}
          <div className="hidden sm:flex items-center gap-2 px-2 py-1 border" style={{ 
            backgroundColor: '#0e2823', 
            borderColor: '#0e2823',
            borderRadius: '0px'
          }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#13af7f' }} />
            <span className="text-xs font-medium leading-none" style={{ color: '#13af7f' }}>
              {isConnected ? 'CONNECTION STABLE' : 'CONNECTION UNSTABLE'}
            </span>
          </div>

          <div className="w-px h-3 sm:h-4 hidden sm:block" style={{ backgroundColor: AX.border }} />

          {/* Global Dropdown */}
          <div className="relative hidden sm:block global-dropdown-container">
            <button
              ref={globalButtonRef}
              onClick={() => setShowGlobalDropdown(!showGlobalDropdown)}
              className="flex items-center gap-1 px-2 py-1 rounded transition-all duration-300 ease-out"
              style={{ color: AX.text }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <span className="text-[11px] sm:text-xs font-medium leading-none">{selectedRegion.substring(0, 2).toUpperCase()}</span>
              <FaChevronDown size={11} className="sm:w-3 sm:h-3" />
            </button>

            {/* Regions Modal */}
            {showGlobalDropdown && typeof window !== 'undefined' && createPortal(
              <div 
                className="fixed regions-modal"
                style={{
                  bottom: `${modalPosition.bottom}px`,
                  right: `${modalPosition.right}px`,
                  width: '256px',
                  zIndex: 9999,
                  pointerEvents: 'auto'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="rounded-lg border shadow-xl"
                  style={{ 
                    backgroundColor: AX.surface2, 
                    borderColor: AX.border 
                  }}
                >
                  <div className="p-4">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold" style={{ color: AX.text }}>
                        Regions
                      </h3>
                      <button
                        onClick={() => setShowGlobalDropdown(false)}
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
                        <FaTimes size={12} />
                      </button>
                    </div>

                    {/* Europe Region */}
                    <div className="p-3 rounded border" style={{ borderColor: AX.border, backgroundColor: AX.surface }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <GoServer size={16} style={{ color: AX.mint }} />
                          <span className="text-sm font-medium" style={{ color: AX.text }}>
                            Europe
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isConnected ? (
                            <>
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: AX.green }} />
                              <span className="text-xs" style={{ color: AX.green }}>Connected</span>
                            </>
                          ) : (
                            <>
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: AX.red }} />
                              <span className="text-xs" style={{ color: AX.red }}>Disconnected</span>
                            </>
                          )}
                        </div>
                      </div>
                      {latency !== null ? (
                        <div className="text-xs" style={{ color: AX.muted }}>
                          Latency: {latency}ms
                        </div>
                      ) : (
                        <div className="text-xs" style={{ color: AX.muted }}>
                          Latency: --ms
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>

          <div className="w-px h-3 sm:h-4 hidden sm:block" style={{ backgroundColor: AX.border }} />

          {/* Utility Icons */}
          <div className="flex items-center gap-1">
            {utilityIcons.map((utility, index) => (
              <UtilityIconButton
                key={index}
                icon={utility.icon}
                tooltip={utility.tooltip}
                onClick={utility.onClick}
                isActive={utility.isActive}
                iconSize={(utility as any).iconSize}
                strokeWidth={(utility as any).strokeWidth}
              />
            ))}
          </div>

          <div className="w-px h-3 sm:h-4 hidden sm:block" style={{ backgroundColor: AX.border }} />

          {/* Social Links */}
          <div className="flex items-center gap-1 sm:gap-2">
            {socialLinks.map((social, index) => {
              const IconComponent = social.icon;
              return (
                <Link
                  key={index}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 py-1 rounded transition-all duration-300 ease-out group"
                  style={{ color: AX.muted, cursor: 'pointer' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = AX.mint;
                    e.currentTarget.style.backgroundColor = `${AX.mint}10`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = AX.muted;
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title={social.tooltip}
                >
                  <IconComponent size={11} className="sm:w-3 sm:h-3" />
                  {social.text && <span className="text-[11px] sm:text-xs hidden sm:inline leading-none">{social.text}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Preset Settings Modal */}
      <QuickBuySettingsModal 
        open={showPresetModal} 
        onClose={() => setShowPresetModal(false)} 
      />
      
      {/* PnL Modal */}
      <PnLModal 
        isOpen={showPnLModal} 
        onClose={() => setShowPnLModal(false)} 
      />
      
      {/* Wallet Switcher Modal - Commented out */}
      {/* <WalletSwitcher 
        isOpen={showWalletDropdown} 
        onClose={() => setShowWalletDropdown(false)} 
      /> */}
      
      {/* Wallet Tracker Popup */}
      <WalletTrackerPopup
        isOpen={showWalletDropdown}
        onClose={() => setShowWalletDropdown(false)}
      />
      
      {/* Twitter Tracker Popup */}
      <TwitterTrackerPopup
        isOpen={showTwitterDropdown}
        onClose={() => setShowTwitterDropdown(false)}
      />
      
      {/* Discover Popup */}
      <DiscoverPopup
        isOpen={showDiscoverDropdown}
        onClose={() => setShowDiscoverDropdown(false)}
      />
      
      {/* Pulse Popup */}
      <PulsePopup
        isOpen={showPulseDropdown}
        onClose={() => setShowPulseDropdown(false)}
      />

      {/* Notification Settings Modal */}
      <NotificationSettingsModal
        isOpen={showNotificationSettings}
        onClose={() => setShowNotificationSettings(false)}
      />

      {/* Theme Customization Modal */}
      <ThemeCustomizationModal
        isOpen={showThemeCustomization}
        onClose={() => setShowThemeCustomization(false)}
      />
    </footer>
  );
}
