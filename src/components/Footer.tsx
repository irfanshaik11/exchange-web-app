import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  FaWallet, 
  FaCompass, 
  FaChartLine, 
  FaChartBar,
  FaBell,
  FaPalette,
  FaDiscord,
  FaFileAlt,
  FaChevronDown,
  FaCog,
  FaBars,
  FaTelegram
} from 'react-icons/fa';
import QuickBuySettingsModal from './QuickBuySettingsModal';
import PnLModal from './PnLModal';
import WalletSwitcher from './WalletSwitcher';
import { useQuickBuy } from './QuickBuyContext';
import { useSolPrice } from './SolPriceContext';
import { useUser } from './UserContext';

// Custom X (Twitter) icon component
const XIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

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
  text: "#E6E7EA",
  muted: "#9CA3AF",
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
  const [showWalletDropdown, setShowWalletDropdown] = useState(false);
  const [showGlobalDropdown, setShowGlobalDropdown] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showPnLModal, setShowPnLModal] = useState(false);
  const { activePreset } = useQuickBuy();
  const { solPrice } = useSolPrice(); // Use shared SOL price from context
  const { solBalance } = useUser();

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
    { icon: FaBars, tooltip: "Layout" },
    { icon: FaBell, tooltip: "Notifications" },
    { icon: FaPalette, tooltip: "Theme" },
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
            className="flex items-center gap-1 sm:gap-2 px-1.5 sm:px-2 py-1 rounded-md text-xs sm:text-xs font-medium transition-all duration-300 ease-out"
            style={{
              backgroundColor: AX.mint,
              color: '#000000',
              border: `1px solid ${AX.mint}`
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
            <FaBars size={9} className="sm:w-3 sm:h-3" />
            <FaCog size={9} className="sm:w-3 sm:h-3" />
            <span className="hidden sm:inline leading-none">PRESET {activePreset + 1}</span>
            <span className="sm:hidden leading-none">P{activePreset + 1}</span>
          </button>

          {/* Wallet Display */}
          <div className="relative">
              <button
                onClick={() => router.push('/trackers')}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-2 py-0.5 rounded-full border transition-all duration-300 ease-out"
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
              </button>
          </div>
        </div>

        {/* Center Section - Navigation Links */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {navLinks.map((link, index) => {
            const IconComponent = link.icon;
            const isActive = link.name === 'Wallet' ? showWalletDropdown : router.pathname === link.href;
            
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
                    className="relative flex items-center gap-1 sm:gap-2 px-1 sm:px-2 py-0.5 rounded transition-all duration-300 ease-out group"
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
                  </button>
                ) : (
                  <Link
                    href={link.href}
                    className="relative flex items-center gap-1 sm:gap-2 px-1 sm:px-2 py-0.5 rounded transition-all duration-300 ease-out group"
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
            className="flex items-center gap-1 sm:gap-2 px-1 sm:px-2 py-0.5 rounded transition-all duration-300 ease-out group"
            style={{
              color: showPnLModal ? AX.mint : AX.muted,
              backgroundColor: showPnLModal ? `${AX.mint}20` : 'transparent'
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
          <div className="flex items-center gap-1 px-1 sm:px-2 py-0.5 rounded-full border" style={{ borderColor: AX.border }}>
            <SolanaIcon size={14} />
            <span className="text-xs sm:text-sm font-medium" style={{ color: AX.green }}>
              {solPrice > 0 ? `$${solPrice.toFixed(2)}` : '...'}
            </span>
          </div>

          <div className="w-px h-3 sm:h-4 hidden sm:block" style={{ backgroundColor: AX.border }} />

          {/* Global Dropdown */}
          <div className="relative hidden sm:block">
            <button
              onClick={() => setShowGlobalDropdown(!showGlobalDropdown)}
              className="flex items-center gap-1 px-2 py-0.5 rounded transition-all duration-300 ease-out"
              style={{ color: AX.text }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: AX.red }} />
              <span className="text-xs font-medium leading-none">GLOBAL</span>
              <FaChevronDown size={8} />
            </button>
          </div>

          <div className="w-px h-3 sm:h-4 hidden sm:block" style={{ backgroundColor: AX.border }} />

          {/* Utility Icons */}
          <div className="flex items-center gap-1">
            {utilityIcons.map((utility, index) => {
              const IconComponent = utility.icon;
              return (
                <button
                  key={index}
                  className="p-1 rounded transition-all duration-300 ease-out group"
                  style={{ color: AX.muted }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = AX.mint;
                    e.currentTarget.style.backgroundColor = `${AX.mint}10`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = AX.muted;
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title={utility.tooltip}
                >
                  <IconComponent size={12} className="sm:w-3 sm:h-3" />
                </button>
              );
            })}
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
                  className="flex items-center gap-1 px-1 sm:px-2 py-0.5 rounded transition-all duration-300 ease-out group"
                  style={{ color: AX.muted }}
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
                  <IconComponent size={15} className="sm:w-4 sm:h-4" />
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
      
      {/* Wallet Switcher Modal */}
      <WalletSwitcher 
        isOpen={showWalletDropdown} 
        onClose={() => setShowWalletDropdown(false)} 
      />
    </footer>
  );
}
