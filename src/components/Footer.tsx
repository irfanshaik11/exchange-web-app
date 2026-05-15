import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  FaWallet,
  FaCompass,
  FaChartLine,
  FaChartBar,
  FaFileAlt,
  FaChevronDown,
  FaCog,
  FaBars,
  FaTelegram,
  FaTimes,
} from "react-icons/fa";
import { GoServer } from "react-icons/go";
import { VscWindow } from "react-icons/vsc";
import { IoIosNotificationsOutline } from "react-icons/io";
import QuickBuySettingsModal from "./QuickBuySettingsModal";
import PnLModal from "./PnLModal";
import WalletSwitcher from "./WalletSwitcher";
import MonadWalletSwitcher from "./MonadWalletSwitcher";
import TwitterTrackerPopup from "./TwitterTrackerPopup";
import TelegramTrackerPopup from "./TelegramTrackerPopup";
import DiscoverPopup from "./DiscoverPopup";
import PulsePopup from "./PulsePopup";
import NotificationSettingsModal from "./NotificationSettingsModal";
import { useQuickBuy } from "./QuickBuyContext";
import { useSolPrice } from "./SolPriceContext";
import { useUser } from "./UserContext";
import { useServerLatency } from "~/hooks/useServerLatency";


// Custom X (Twitter) icon component
const XIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

// Utility Icon Button with Tooltip Component
const UtilityIconButton: React.FC<{
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    strokeWidth?: number;
  }>;
  tooltip?: string;
  onClick?: () => void;
  isActive?: boolean;
  iconSize?: number;
  strokeWidth?: number;
}> = ({
  icon: IconComponent,
  tooltip,
  onClick,
  isActive = false,
  iconSize = 11,
  strokeWidth,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState({
    bottom: 0,
    left: 0,
  });

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
        className="rounded p-1 transition-all duration-300 ease-out"
        style={{
          color: isActive ? AX.text : AX.muted,
          backgroundColor: isActive ? `${AX.mint}10` : "transparent",
          cursor: "pointer",
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
            e.currentTarget.style.backgroundColor = "transparent";
          }
          setShowTooltip(false);
        }}
      >
        <IconComponent
          size={iconSize}
          className={iconSize > 11 ? "sm:h-4 sm:w-4" : "sm:h-3 sm:w-3"}
          {...(strokeWidth !== undefined ? { strokeWidth } : {})}
        />
      </button>
      {tooltip &&
        showTooltip &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed rounded px-2 py-1 text-xs font-medium whitespace-nowrap"
            style={{
              backgroundColor: "#111214",
              color: AX.text,
              border: "1px solid rgba(255, 255, 255, 0.08)",
              zIndex: 99999,
              bottom: `${tooltipPosition.bottom}px`,
              left: `${tooltipPosition.left}px`,
              transform: "translateX(-50%)",
            }}
          >
            {tooltip}
            {/* Tooltip arrow pointing down */}
            <div
              className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-4 border-r-4 border-l-4 border-transparent"
              style={{ borderTopColor: "#111214" }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
};

// Official Solana logo component
export const SolanaIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 397.7 311.7" fill="currentColor">
    <defs>
      <linearGradient
        id="solanaGradient"
        x1="360.8791"
        y1="351.4553"
        x2="141.213"
        y2="-69.2936"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#00FFA3" />
        <stop offset="1" stopColor="#DC1FFF" />
      </linearGradient>
      <linearGradient
        id="solanaGradient2"
        x1="264.8291"
        y1="401.6014"
        x2="45.163"
        y2="-19.1475"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#00FFA3" />
        <stop offset="1" stopColor="#DC1FFF" />
      </linearGradient>
      <linearGradient
        id="solanaGradient3"
        x1="312.5484"
        y1="376.688"
        x2="92.8822"
        y2="-44.061"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#00FFA3" />
        <stop offset="1" stopColor="#DC1FFF" />
      </linearGradient>
    </defs>
    <path
      d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"
      fill="url(#solanaGradient)"
    />
    <path
      d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"
      fill="url(#solanaGradient2)"
    />
    <path
      d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"
      fill="url(#solanaGradient3)"
    />
  </svg>
);

/* ---- style palette ---- */
const AX = {
  // Deep void backgrounds
  bg: "#030304",
  bgDeep: "#050608",
  surface: "#08090c",
  surface2: "#0c0e12",
  surfaceHover: "#10131a",
  card: "#141720",
  
  // Borders
  border: "rgba(255,255,255,0.06)",
  borderHover: "rgba(255,255,255,0.10)",
  borderStrong: "rgba(255,255,255,0.14)",
  
  // Text hierarchy
  text: "#f4f4f5",
  textSecondary: "#a1a1aa",
  textMuted: "#71717a",
  textDim: "#52525b",
  muted: "#71717a",
  
  // Accent colors - Emerald/Mint
  mint: "#18c48c",
  mintBright: "#22d99a",
  mintHover: "#14a877",
  mintGlow: "rgba(24, 196, 140, 0.15)",
  
  // Status colors
  green: "#22c55e",
  red: "#ef4444",
  sell: "#ef4444",
  purple: "#8b5cf6",
  teal: "#14b8a6",
};

function detectNearestRegion(): { name: string; abbr: string } {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; // e.g. "Asia/Tokyo"
    const region = tz.split("/")[0]; // "Asia", "America", "Europe", etc.
    const city = tz.split("/")[1] || "";

    // Map to nearest deployed server region
    // Deployed: Singapore (asia-southeast1), Tokyo (asia-northeast1), US East (us-east4), US West (us-west1)

    if (region === "Asia" || region === "Indian") {
      // Japan/Korea → Tokyo; everything else in Asia → Singapore
      if (["Tokyo", "Seoul", "Yakutsk", "Vladivostok", "Magadan", "Kamchatka"].includes(city)) {
        return { name: "Tokyo", abbr: "JP" };
      }
      return { name: "Singapore", abbr: "SG" };
    }

    if (region === "Australia" || region === "Pacific") {
      return { name: "Tokyo", abbr: "JP" }; // Closest to Oceania
    }

    if (region === "America") {
      // US West Coast + Mountain + Central America → US West
      const westCities = ["Los_Angeles", "Vancouver", "Denver", "Phoenix", "Anchorage", "Tijuana", "Edmonton", "Boise"];
      if (westCities.includes(city)) {
        return { name: "US West", abbr: "USW" };
      }
      return { name: "US East", abbr: "USE" }; // Everything else in Americas → US East
    }

    if (region === "Europe" || region === "Africa") {
      return { name: "US East", abbr: "USE" }; // Closest deployed region to Europe/Africa
    }

    return { name: "US East", abbr: "USE" }; // Default fallback
  } catch {
    return { name: "US East", abbr: "USE" };
  }
}

export default function Footer() {
  const router = useRouter();
  const currentChain = (router.query.chain as string) || "sol";

  // Load popup states from localStorage on mount
  const getInitialPopupState = (
    key: string,
    defaultValue: boolean = false,
  ): boolean => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const saved = localStorage.getItem(`footer-popup-${key}`);
      return saved === "true";
    } catch {
      return defaultValue;
    }
  };

  const [showWalletDropdown, setShowWalletDropdown] = useState(() =>
    getInitialPopupState("wallet"),
  );
  const [showTwitterDropdown, setShowTwitterDropdown] = useState(() =>
    getInitialPopupState("twitter"),
  );
  const [showDiscoverDropdown, setShowDiscoverDropdown] = useState(() =>
    getInitialPopupState("discover"),
  );
  const [showPulseDropdown, setShowPulseDropdown] = useState(() =>
    getInitialPopupState("pulse"),
  );
  const [showTelegramDropdown, setShowTelegramDropdown] = useState(() =>
    getInitialPopupState("telegram"),
  );
  const [showGlobalDropdown, setShowGlobalDropdown] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showPnLModal, setShowPnLModal] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] =
    useState(false);
  const { latencyMs, isConnected, latencyColor } = useServerLatency();
  const [modalPosition, setModalPosition] = useState({ bottom: 0, right: 0 });
  const [selectedRegion] = useState(() => detectNearestRegion());
  const globalButtonRef = React.useRef<HTMLButtonElement>(null);

  // Load header bar visibility state from localStorage
  const getInitialHeaderBarVisible = (): boolean => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("header-bar-visible");
      return saved !== "false"; // Default to visible
    } catch {
      return true;
    }
  };

  const [headerBarVisible, setHeaderBarVisible] = useState(
    getInitialHeaderBarVisible,
  );

  // Save header bar visibility to localStorage and update body class
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("header-bar-visible", String(headerBarVisible));
      if (headerBarVisible) {
        document.body.classList.remove("hide-header-bar");
      } else {
        document.body.classList.add("hide-header-bar");
      }
    }
  }, [headerBarVisible]);
  const { activePreset } = useQuickBuy();
  const { solPrice, monPrice, ethPrice, btcPrice } = useSolPrice(); // Use shared price from context
  const chainPrice = currentChain === "monad" ? monPrice : solPrice;
  const { solBalance, chainBalances } = useUser();
  // Use chainBalances as the primary source for consistency with Header
  // Fallback to solBalance for Solana if chainBalances doesn't have it yet
  const chainBalance = chainBalances[currentChain] ?? (currentChain === "sol" ? solBalance : 0);

  const chainLogos: Record<string, string> = {
    sol: "/solana.png",
    monad:
      "https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1",
  };

  const chainSymbols: Record<string, string> = {
    sol: "SOL",
    monad: "MON",
  };

  // Save popup states to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("footer-popup-wallet", String(showWalletDropdown));
    }
  }, [showWalletDropdown]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("footer-popup-twitter", String(showTwitterDropdown));
    }
  }, [showTwitterDropdown]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "footer-popup-discover",
        String(showDiscoverDropdown),
      );
    }
  }, [showDiscoverDropdown]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("footer-popup-pulse", String(showPulseDropdown));
    }
  }, [showPulseDropdown]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("footer-popup-telegram", String(showTelegramDropdown));
    }
  }, [showTelegramDropdown]);

  // Latency is now measured by useServerLatency hook (HTTP-based, no auth required)

  // Update modal position when dropdown opens
  useEffect(() => {
    if (showGlobalDropdown && globalButtonRef.current) {
      const rect = globalButtonRef.current.getBoundingClientRect();
      setModalPosition({
        bottom: window.innerHeight - rect.top + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [showGlobalDropdown]);

  // Close global dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showGlobalDropdown) {
        const target = event.target as HTMLElement;
        if (
          !target.closest(".global-dropdown-container") &&
          !target.closest(".regions-modal")
        ) {
          setShowGlobalDropdown(false);
        }
      }
    };

    if (showGlobalDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showGlobalDropdown]);

  const navLinks = [
    { name: "Wallet", href: "/trackers", icon: FaWallet },
    // { name: "Twitter", href: "/twitter", icon: XIcon, hasNotification: true },
    { name: "Discover", href: "/", icon: FaCompass, hasNotification: true },
    { name: "Pulse", href: "/pulse", icon: FaChartLine, hasNotification: true },
    { name: "Telegram", href: "/trackers", icon: FaTelegram },
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
      tooltip: headerBarVisible
        ? "Hide Watchlist Ticker"
        : "Show Watchlist Ticker",
      onClick: () => setHeaderBarVisible(!headerBarVisible),
      isActive: headerBarVisible,
      iconSize: 16,
      strokeWidth: 0.7,
    },
    {
      icon: IoIosNotificationsOutline,
      tooltip: "Notifications",
      iconSize: 16,
      strokeWidth: 0.7,
      onClick: () => setShowNotificationSettings(true),
    },
  ];

  const socialLinks = [
    {
      icon: XIcon,
      href: "https://x.com/interstatefdn",
      tooltip: "Twitter",
      text: undefined,
    },
    {
      icon: FaTelegram,
      href: "https://t.me/+DDXGrsJoe3szYTAx",
      tooltip: "Telegram",
      text: undefined,
    },
    // { icon: FaFileAlt, href: "/docs", tooltip: "Docs", text: "Docs" },
  ];

  return (
    <footer
      className="fixed z-[100] bottom-0 left-1 right-1 sm:left-1.5 sm:right-1.5 rounded-lg border"
      style={{
        backgroundColor: AX.bg,
        borderColor: AX.border,
        boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.4)",
      }}
    >
      <div className="flex h-6 items-center justify-between overflow-x-auto px-2 sm:px-2">
        {/* Left Section - Preset Button and Wallet Display */}
        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
          {/* Preset Button - Show for all chains now (Monad shows only gas and slippage) */}
          <button
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all duration-200 ease-out sm:gap-2 sm:text-xs"
            style={{
              backgroundColor: AX.mintGlow,
              color: AX.mint,
              cursor: "pointer",
            }}
            onClick={() => setShowPresetModal(true)}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(24, 196, 140, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = AX.mintGlow;
            }}
          >
            <FaBars size={11} className="sm:h-3 sm:w-3" />
            <FaCog size={11} className="sm:h-3 sm:w-3" />
            <span className="hidden leading-none sm:inline">
              PRESET {activePreset + 1}
            </span>
            <span className="leading-none sm:hidden">P{activePreset + 1}</span>
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
              className="flex items-center gap-1 rounded px-2 py-0.5 transition-all duration-200 ease-out sm:gap-2"
              style={{
                backgroundColor: showWalletDropdown
                  ? `${AX.mint}15`
                  : "transparent",
                color: showWalletDropdown ? AX.mint : AX.text,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                if (!showWalletDropdown) {
                  e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)";
                }
              }}
              onMouseLeave={(e) => {
                if (!showWalletDropdown) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              <FaWallet size={11} className="sm:h-3 sm:w-3" />
              {currentChain === "monad" ? (
                <img
                  src={chainLogos.monad}
                  alt="MON"
                  className="h-4 min-h-4 w-4 min-w-4 rounded object-contain"
                />
              ) : (
                <SolanaIcon size={12} />
              )}
              <span className="text-[11px] leading-none font-medium sm:text-xs">
                {Number.isFinite(chainBalance)
                  ? chainBalance.toFixed(4)
                  : "0.0000"}
              </span>
            </button>
          </div>
        </div>

        {/* Center Section - Navigation Links */}
        <div className="flex flex-shrink-0 items-center gap-1">
          {navLinks.map((link, index) => {
            const IconComponent = link.icon;
            const isActive =
              link.name === "Wallet"
                ? showWalletDropdown
                : link.name === "Twitter"
                  ? showTwitterDropdown
                  : link.name === "Discover"
                    ? showDiscoverDropdown
                    : link.name === "Pulse"
                      ? showPulseDropdown
                      : link.name === "Telegram"
                        ? showTelegramDropdown
                        : router.pathname === link.href;

            return (
              <React.Fragment key={link.name}>
                {index > 0 && (
                  <div
                    className="mx-1 h-2.5 w-px sm:h-3"
                    style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }}
                  />
                )}
                {link.name === "Wallet" ? (
                  <button
                    onClick={() => setShowWalletDropdown(!showWalletDropdown)}
                    className="group relative flex items-center gap-1 rounded px-2 py-0.5 transition-all duration-300 ease-out sm:gap-2"
                    style={{
                      color: isActive ? AX.mint : AX.muted,
                      backgroundColor: isActive
                        ? `${AX.mint}20`
                        : "transparent",
                      cursor: "pointer",
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
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <IconComponent size={11} className="sm:h-3 sm:w-3" />
                    <span className="hidden text-[11px] leading-none sm:inline sm:text-xs">
                      {link.name}
                    </span>
                  </button>
                ) : link.name === "Twitter" ? (
                  <button
                    onClick={() => setShowTwitterDropdown(!showTwitterDropdown)}
                    className="group relative flex items-center gap-1 rounded px-2 py-0.5 transition-all duration-300 ease-out sm:gap-2"
                    style={{
                      color: isActive ? AX.mint : AX.muted,
                      backgroundColor: isActive
                        ? `${AX.mint}20`
                        : "transparent",
                      cursor: "pointer",
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
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <IconComponent size={11} className="sm:h-3 sm:w-3" />
                    <span className="hidden text-[11px] leading-none sm:inline sm:text-xs">
                      {link.name}
                    </span>
                  </button>
                ) : link.name === "Discover" ? (
                  <button
                    onClick={() =>
                      setShowDiscoverDropdown(!showDiscoverDropdown)
                    }
                    className="group relative flex items-center gap-1 rounded px-2 py-0.5 transition-all duration-300 ease-out sm:gap-2"
                    style={{
                      color: isActive ? AX.mint : AX.muted,
                      backgroundColor: isActive
                        ? `${AX.mint}20`
                        : "transparent",
                      cursor: "pointer",
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
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <IconComponent size={11} className="sm:h-3 sm:w-3" />
                    <span className="hidden text-[11px] leading-none sm:inline sm:text-xs">
                      {link.name}
                    </span>
                  </button>
                ) : link.name === "Pulse" ? (
                  <button
                    onClick={() => setShowPulseDropdown(!showPulseDropdown)}
                    className="group relative flex items-center gap-1 rounded px-2 py-0.5 transition-all duration-300 ease-out sm:gap-2"
                    style={{
                      color: isActive ? AX.mint : AX.muted,
                      backgroundColor: isActive
                        ? `${AX.mint}20`
                        : "transparent",
                      cursor: "pointer",
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
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <IconComponent size={11} className="sm:h-3 sm:w-3" />
                    <span className="hidden text-[11px] leading-none sm:inline sm:text-xs">
                      {link.name}
                    </span>
                  </button>
                ) : link.name === "Telegram" ? (
                  <button
                    onClick={() => setShowTelegramDropdown(!showTelegramDropdown)}
                    className="group relative flex items-center gap-1 rounded px-2 py-0.5 transition-all duration-300 ease-out sm:gap-2"
                    style={{
                      color: isActive ? AX.mint : AX.muted,
                      backgroundColor: isActive
                        ? `${AX.mint}20`
                        : "transparent",
                      cursor: "pointer",
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
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <IconComponent size={11} className="sm:h-3 sm:w-3" />
                    <span className="hidden text-[11px] leading-none sm:inline sm:text-xs">
                      {link.name}
                    </span>
                  </button>
                ) : (
                  <Link
                    href={link.href}
                    className="group relative flex items-center gap-1 rounded px-2 py-0.5 transition-all duration-300 ease-out sm:gap-2"
                    style={{
                      color: isActive ? AX.mint : AX.muted,
                      backgroundColor: isActive
                        ? `${AX.mint}20`
                        : "transparent",
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
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <IconComponent size={11} className="sm:h-3 sm:w-3" />
                    <span className="hidden text-[11px] leading-none sm:inline sm:text-xs">
                      {link.name}
                    </span>
                    {/* Notification bubble removed */}
                  </Link>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Right Section - Status, Price, Global, Utilities, Social */}
        <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
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
            className="group flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 transition-all duration-300 ease-out sm:gap-2"
            style={{
              color: showPnLModal ? AX.mint : AX.muted,
              backgroundColor: showPnLModal ? `${AX.mint}20` : "transparent",
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
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            <FaChartBar size={11} className="sm:h-3 sm:w-3" />
            <span className="hidden text-[11px] leading-none sm:inline sm:text-xs">
              PnL
            </span>
          </button>

          <div
            className="h-2.5 w-px sm:h-3"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }}
          />

          {/* Chain Price (Solana or Monad) */}
          <div className="flex items-center gap-1 px-2 py-0.5">
            {currentChain === "monad" ? (
              <img
                src={chainLogos.monad}
                alt="MON"
                className="h-4 min-h-4 w-4 min-w-4 rounded object-contain"
              />
            ) : (
              <SolanaIcon size={12} />
            )}
            <span
              className="text-[11px] font-medium sm:text-xs"
              style={{ color: AX.green }}
            >
              {chainPrice > 0
                ? `$${chainPrice.toFixed(currentChain === "monad" ? 4 : 2)}`
                : "..."}
            </span>
          </div>

          {/* ETH Price */}
          <div className="hidden items-center gap-1 px-2 py-0.5 sm:flex">
            <img
              src="https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png"
              alt="ETH"
              className="h-4 min-h-4 w-4 min-w-4 rounded-full object-contain"
            />
            <span
              className="text-[11px] font-medium sm:text-xs"
              style={{ color: AX.green }}
            >
              {ethPrice > 0 ? `$${ethPrice.toFixed(2)}` : "..."}
            </span>
          </div>

          {/* BTC Price */}
          <div className="hidden items-center gap-1 px-2 py-0.5 sm:flex">
            <img
              src="https://s2.coinmarketcap.com/static/img/coins/64x64/1.png"
              alt="BTC"
              className="h-4 min-h-4 w-4 min-w-4 rounded-full object-contain"
            />
            <span
              className="text-[11px] font-medium sm:text-xs"
              style={{ color: AX.green }}
            >
              {btcPrice > 0 ? `$${btcPrice.toFixed(0)}` : "..."}
            </span>
          </div>

          <div
            className="hidden h-2.5 w-px sm:block sm:h-3"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }}
          />

          {/* Connection Status Indicator */}
          <div className="hidden items-center gap-1.5 px-2 py-0.5 sm:flex">
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: isConnected ? "#31e3ac" : "#ef4444" }}
            />
            <span
              className="text-[11px] leading-none font-medium sm:text-xs"
              style={{ color: isConnected ? "#31e3ac" : "#ef4444" }}
            >
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>

          <div
            className="hidden h-2.5 w-px sm:block sm:h-3"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }}
          />

          {/* Global Dropdown */}
          <div className="global-dropdown-container relative hidden sm:block">
            <button
              ref={globalButtonRef}
              onClick={() => setShowGlobalDropdown(!showGlobalDropdown)}
              className="flex items-center gap-1 rounded px-2 py-0.5 transition-all duration-300 ease-out"
              style={{ color: AX.text }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span className="text-[11px] leading-none font-medium sm:text-xs">
                {selectedRegion.abbr}
              </span>
              <FaChevronDown size={11} className="sm:h-3 sm:w-3" />
            </button>

            {/* Regions Modal */}
            {showGlobalDropdown &&
              typeof window !== "undefined" &&
              createPortal(
                <div
                  className="regions-modal pointer-events-auto fixed w-[256px]"
                  style={{
                    bottom: `${modalPosition.bottom}px`,
                    right: `${modalPosition.right}px`,
                    zIndex: 99999,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="rounded-lg border shadow-xl"
                    style={{
                      backgroundColor: AX.surface2,
                      borderColor: AX.border,
                    }}
                  >
                    <div className="p-4">
                      {/* Header */}
                      <div className="mb-4 flex items-center justify-between">
                        <h3
                          className="text-sm font-semibold"
                          style={{ color: AX.text }}
                        >
                          Regions
                        </h3>
                        <button
                          onClick={() => setShowGlobalDropdown(false)}
                          className="rounded p-1 transition-colors"
                          style={{ color: AX.muted }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = AX.text;
                            e.currentTarget.style.backgroundColor = AX.surface;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = AX.muted;
                            e.currentTarget.style.backgroundColor =
                              "transparent";
                          }}
                        >
                          <FaTimes size={12} />
                        </button>
                      </div>

                      {/* Europe Region */}
                      <div
                        className="rounded border p-3"
                        style={{
                          borderColor: AX.border,
                          backgroundColor: AX.surface,
                        }}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <GoServer size={16} style={{ color: AX.mint }} />
                            <span
                              className="text-sm font-medium"
                              style={{ color: AX.text }}
                            >
                              {selectedRegion.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {isConnected ? (
                              <>
                                <div
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: AX.green }}
                                />
                                <span
                                  className="text-xs"
                                  style={{ color: AX.green }}
                                >
                                  Connected
                                </span>
                              </>
                            ) : (
                              <>
                                <div
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: AX.red }}
                                />
                                <span
                                  className="text-xs"
                                  style={{ color: AX.red }}
                                >
                                  Disconnected
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-xs" style={{ color: latencyMs !== null ? latencyColor : AX.muted }}>
                          Latency: {latencyMs !== null ? `${latencyMs}ms` : '--ms'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>,
                document.body,
              )}
          </div>

          <div
            className="hidden h-2.5 w-px sm:block sm:h-3"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }}
          />

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

          <div
            className="hidden h-2.5 w-px sm:block sm:h-3"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }}
          />

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
                  className="group flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 transition-all duration-300 ease-out"
                  style={{ color: AX.muted }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = AX.mint;
                    e.currentTarget.style.backgroundColor = `${AX.mint}10`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = AX.muted;
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                  title={social.tooltip}
                >
                  <IconComponent size={11} className="sm:h-3 sm:w-3" />
                  {social.text && (
                    <span className="hidden text-[11px] leading-none sm:inline sm:text-xs">
                      {social.text}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Preset Settings Modal - Commented out for Monad chain */}
      <QuickBuySettingsModal
        open={showPresetModal}
        onClose={() => setShowPresetModal(false)}
      />

      {/* PnL Modal */}
      <PnLModal isOpen={showPnLModal} onClose={() => setShowPnLModal(false)} chain={currentChain} />

      {/* Monad Wallet Switcher */}
      {currentChain === "monad" && (
        <MonadWalletSwitcher
          isOpen={showWalletDropdown}
          onClose={() => setShowWalletDropdown(false)}
        />
      )}

      {/* Solana Wallet Switcher */}
      {currentChain !== "monad" && (
        <WalletSwitcher
          isOpen={showWalletDropdown}
          onClose={() => setShowWalletDropdown(false)}
        />
      )}

      {/* Twitter Tracker Popup */}
      {/* <TwitterTrackerPopup
        isOpen={showTwitterDropdown}
        onClose={() => setShowTwitterDropdown(false)}
      /> */}

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

      {/* Telegram Tracker Popup */}
      <TelegramTrackerPopup
        isOpen={showTelegramDropdown}
        onClose={() => setShowTelegramDropdown(false)}
      />

      {/* Notification Settings Modal */}
      <NotificationSettingsModal
        isOpen={showNotificationSettings}
        onClose={() => setShowNotificationSettings(false)}
      />
    </footer>
  );
}
