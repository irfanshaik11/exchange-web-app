import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState, useRef } from "react";
import { FaSearch, FaBell, FaWallet, FaBars, FaTimes } from "react-icons/fa";
import { useUser } from "./UserContext";
import Cookies from "js-cookie";
import dynamic from "next/dynamic";
import InterstateButton from "./InterstateButton";
import { FiBarChart, FiStar } from "react-icons/fi";
import SearchModal from "./SearchModal";
import type { Timeframe } from "../pages/index";

/* ---- style palette ---- */
const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  mint: "#18c48c",
  mintHover: "#12a877",
  sell: "#FF4D7F",
};

    const navLinks = [
      { name: "Trenches", href: "/pulse" },
      { name: "Portfolio", href: "/portfolio" },
      { name: "Trending", href: "/discover" },
      { name: "Trackers", href: "/trackers" },
      { name: "Perpetuals", href: "/construction" },
      { name: "Yield", href: "/construction" },
      { name: "Rewards", href: "/construction" },
    ];

interface HeaderProps {
  search?: string;
  setSearch?: (val: string) => void;
  showSearch?: boolean;
  selectedTimeframe?: Timeframe;
}

const DepositModal = dynamic(() => import("./DepositModal"), {
  ssr: false, // NO SSR PLEASE
});

const WithdrawModal = dynamic(() => import("./WithdrawModal"), {
  ssr: false,
});

const WatchlistModal = dynamic(() => import("./WatchlistModal"), {
  ssr: false,
});

const NotificationDropdown = dynamic(() => import("./NotificationDropdown"), {
  ssr: false,
});

export default function Header({
  search = "",
  setSearch,
  showSearch = true,
  selectedTimeframe = "1h",
}: HeaderProps) {
  const router = useRouter();
  const isDiscover = router.pathname === "/";
  const { user, loading: userLoading, solBalance } = useUser();
  const [profileOpen, setProfileOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Toggle Search modal with Tab and '/' (outside of inputs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!showSearch) return;
      const isPlain = !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;

      // Close on Tab when open
      if (e.key === "Tab" && isPlain) {
        // If modal is open, close it immediately on Tab
        if (searchModalOpen) {
          e.preventDefault();
          setSearchModalOpen(false);
          return;
        }
        // Else, only open when focus isn't in an editable element
        const t = (document.activeElement as HTMLElement) || null;
        const isEditable = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t as any).isContentEditable);
        if (isEditable) return; // allow normal tabbing in forms
        e.preventDefault();
        setSearchModalOpen(true);
      }

      // Toggle on '/' (slash). Some keyboards send '?' with Shift+'/'; we support both.
      if ((e.key === '/' || e.key === '?') && isPlain) {
        const t = (document.activeElement as HTMLElement) || null;
        const isEditable = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t as any).isContentEditable);
        if (isEditable) return; // do not steal from inputs
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSearch, searchModalOpen]);

  // Handles opening the deposit modal
  const handleDepositClick = () => {
    const token = Cookies.get("token");
    if (token && !user && !userLoading) {
      // Optionally, refresh user here if needed
    }
    setDepositOpen(true);
  };

  // Handles opening the withdraw modal
  const handleWithdrawClick = () => {
    const token = Cookies.get("token");
    if (token && !user && !userLoading) {
      // Optionally, refresh user here if needed
    }
    setWithdrawOpen(true);
  };

  // Close mobile menu when clicking outside or on backdrop
  useEffect(() => {
    if (!mobileMenuOpen) {
      document.body.style.overflow = '';
      return;
    }

    // Prevent body scroll when menu is open
    document.body.style.overflow = 'hidden';

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;
      
      // Don't close if clicking on the hamburger button itself
      if (target.closest('[data-mobile-menu-toggle]')) {
        return;
      }
      
      // Don't close if clicking inside the menu
      if (mobileMenuRef.current && mobileMenuRef.current.contains(target)) {
        return;
      }
      
      // Close if clicking outside (backdrop or elsewhere)
      setMobileMenuOpen(false);
    };

    // Add a small delay to avoid immediate closing when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [router.pathname]);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileMenuOpen]);

  return (
    <>
      <header className="sticky top-0 z-20 w-full border-b backdrop-blur" style={{ backgroundColor: '#0f1012', borderColor: AX.border }}>
        <div
          className="w-full text-center p-0.5 text-sm"
          role="alert"
          style={{ backgroundColor: '#ddc13d', color: '#0b0c0e', borderBottom: '1px solid #c7ae32' }}
        >
          [ This terminal is still under development and not ready for production,&nbsp;
          <b>use at your own risk!</b> ]
        </div>
        <div className="flex max-w-full items-center justify-between border-b px-4 py-2.5" style={{ backgroundColor: '#06070b', borderColor: AX.border }}>
          <div className="flex min-w-0 items-center gap-3">
            {/* Mobile hamburger menu button */}
            <button
              data-mobile-menu-toggle
              onClick={(e) => {
                e.stopPropagation();
                setMobileMenuOpen(!mobileMenuOpen);
              }}
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300 ease-out z-50 relative"
              style={{ backgroundColor: AX.surface, borderColor: AX.border, color: AX.text }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(24, 196, 140, 0.08)';
                e.currentTarget.style.borderColor = AX.mint;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
                e.currentTarget.style.borderColor = AX.border;
              }}
            >
              {mobileMenuOpen ? <FaTimes size={14} /> : <FaBars size={14} />}
            </button>
            
            <Link
              href="/pulse"
              className="flex items-center text-xl tracking-tight select-none"
              style={{ color: AX.text }}
              title="Go to Trenches"
            >
              <img
                src="/interstate-logo.png"
                alt="Interstate logo"
                className="h-auto w-30 scale-90"
              />
            </Link>
            {/* Desktop navigation - hidden on mobile */}
            <nav className="hidden md:flex ml-6 items-center gap-5" style={{ position: 'relative', zIndex: 1000 }}>
              {navLinks.map((link) => {
                const isActive = router.pathname === link.href || 
                  (link.name === "Trenches" && router.pathname.startsWith("/trade/"));
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={(e) => {
                      // Use router.push for client-side navigation with fallback
                      router.push(link.href).catch((err: any) => {
                        // Fallback to full page navigation if router.push fails
                        console.error('Router.push failed, using fallback:', err);
                        window.location.href = link.href;
                      });
                    }}
                    className={`px-1.5 py-0.5 text-sm font-medium transition-all duration-300 ease-out rounded ${
                      isActive ? "border-current" : ""
                    }`}
                    style={{
                      color: isActive ? AX.mint : AX.text,
                      borderColor: isActive ? AX.mint : "transparent",
                      position: 'relative',
                      zIndex: 1001,
                      pointerEvents: 'auto',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = AX.mint;
                        e.currentTarget.style.backgroundColor = 'rgba(112, 224, 176, 0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = AX.text;
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    {link.name}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {showSearch && (
              <div className="flex items-center gap-2">
                {/* Pill-style search trigger with keycap hint (desktop) */}
                <button
                  onClick={() => setSearchModalOpen(true)}
                  className="hidden md:flex items-center gap-2 h-8 rounded-full border px-3 pr-2 transition-all duration-300 ease-out"
                  style={{ backgroundColor: AX.surface, borderColor: AX.border, color: AX.muted }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(24, 196, 140, 0.08)';
                    e.currentTarget.style.borderColor = '#18c48c';
                    e.currentTarget.style.boxShadow = '0 0 8px rgba(24, 196, 140, 0.3), 0 0 16px rgba(24, 196, 140, 0.15)';
                    e.currentTarget.style.transform = 'scale(1.01)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = AX.surface;
                    e.currentTarget.style.borderColor = AX.border;
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <FaSearch size={14} />
                  <span className="text-xs text-neutral-400 whitespace-nowrap">Search tokens…</span>
                  <span className="ml-auto rounded-md border border-neutral-700/70 bg-neutral-800/80 px-1.5 py-0.5 text-[10px] leading-none text-neutral-200">Tab</span>
                </button>

                {/* Compact icon-only trigger on small screens */}
                <button
                  onClick={() => setSearchModalOpen(true)}
                  className="md:hidden flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300 ease-out"
                  style={{ backgroundColor: AX.surface, borderColor: AX.border, color: AX.muted }}
                >
                  <FaSearch size={14} />
                </button>
              </div>
            )}
            {/* SOL Balance Pill - hidden on mobile (will be in mobile menu) */}
            {user && (
              <div 
                className="hidden md:flex items-center gap-1.5 h-8 rounded-full border px-3 transition-all duration-300 ease-out cursor-default"
                style={{ 
                  backgroundColor: AX.surface, 
                  borderColor: AX.border,
                  color: AX.text 
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(24, 196, 140, 0.08)';
                  e.currentTarget.style.borderColor = AX.mint;
                  e.currentTarget.style.boxShadow = '0 0 8px rgba(24, 196, 140, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = AX.surface;
                  e.currentTarget.style.borderColor = AX.border;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <FaWallet size={12} style={{ color: AX.muted }} />
                <span className="text-xs font-medium">{solBalance.toFixed(4)}</span>
                <img 
                  src="https://www.pngall.com/wp-content/uploads/10/Solana-Crypto-Logo-PNG-File.png" 
                  alt="SOL" 
                  className="w-3 h-3 rounded-full"
                />
              </div>
            )}
            {/* Deposit/Withdraw buttons - hidden on mobile (will be in mobile menu) */}
            <button
              onClick={handleDepositClick}
              className="hidden md:block ml-2 px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-300 ease-out"
              style={{
                backgroundColor: AX.mint,
                color: '#000000',
                border: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = AX.mintHover;
                e.currentTarget.style.boxShadow = '0 0 8px rgba(24, 196, 140, 0.3), 0 0 16px rgba(24, 196, 140, 0.15)';
                e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = AX.mint;
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Deposit
            </button>
            <button
              onClick={handleWithdrawClick}
              className="hidden md:block ml-2 px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-300 ease-out"
              style={{
                backgroundColor: AX.sell,
                color: '#000000',
                border: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#E63E6B';
                e.currentTarget.style.boxShadow = '0 0 8px rgba(255, 77, 127, 0.3), 0 0 16px rgba(255, 77, 127, 0.15)';
                e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = AX.sell;
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Withdraw
            </button>
            {/* <button
              onClick={() => setWatchlistOpen(true)}
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300 ease-out"
              style={{ 
                backgroundColor: AX.surface, 
                borderColor: AX.border,
                color: AX.muted 
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.08)';
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.color = '#3b82f6';
                e.currentTarget.style.boxShadow = '0 0 8px rgba(59, 130, 246, 0.3), 0 0 16px rgba(59, 130, 246, 0.15)';
                e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
                e.currentTarget.style.borderColor = AX.border;
                e.currentTarget.style.color = AX.muted;
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <FaStar size={14} />
            </button> */}
            {/* Notification button - visible on all screens */}
            <button
              onClick={() => setNotificationOpen(true)}
              className="flex ml-2 h-8 w-8 items-center justify-center rounded-full border transition-all duration-300 ease-out"
              style={{ 
                backgroundColor: AX.surface, 
                borderColor: AX.border,
                color: AX.muted 
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(24, 196, 140, 0.08)';
                e.currentTarget.style.borderColor = '#18c48c';
                e.currentTarget.style.color = '#18c48c';
                e.currentTarget.style.boxShadow = '0 0 8px rgba(24, 196, 140, 0.3), 0 0 16px rgba(24, 196, 140, 0.15)';
                e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
                e.currentTarget.style.borderColor = AX.border;
                e.currentTarget.style.color = AX.muted;
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <FaBell size={14} />
            </button>
            {/* User profile/login - visible on all screens */}
            {user && !userLoading ? (
              <div ref={profileMenuRef} className="flex group relative cursor-pointer items-center gap-2">
                {/* Circular profile picture (placeholder) */}
                <div 
                  className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white select-none" 
                  style={{ backgroundColor: AX.mint }}
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                >
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
                <span className="hidden md:block max-w-[90px] truncate text-sm" style={{ color: AX.text }}>
                  {user.name}
                </span>
                {/* Dropdown for logout */}
                <div 
                  className={`absolute top-8 right-0 z-50 min-w-[100px] rounded border px-3 py-1.5 shadow-lg transition-opacity ${
                    profileMenuOpen ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'
                  }`}
                  style={{ backgroundColor: AX.surface, borderColor: AX.border }}
                >
                  <InterstateButton
                    variant="danger"
                    size="sm"
                    className="h-auto w-full border-none bg-transparent px-0 py-0 text-left text-xs font-semibold shadow-none hover:underline"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      if (typeof window !== "undefined") {
                        document.cookie = "token=; Max-Age=0; path=/;";
                      }
                      if (
                        typeof window !== "undefined" &&
                        window.localStorage
                      ) {
                        window.localStorage.removeItem("token");
                      }
                      if (typeof window !== "undefined") {
                        window.location.reload();
                      }
                    }}
                  >
                    Logout
                  </InterstateButton>
                </div>
              </div>
            ) : (
              !userLoading && (
                <button
                  className="ml-2 px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-300 ease-out"
                  style={{
                    backgroundColor: AX.mint,
                    color: '#000000',
                    border: 'none'
                  }}
                  onClick={() => {
                    const event = new CustomEvent("open-login-modal");
                    window.dispatchEvent(event);
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#58B890';
                    e.currentTarget.style.boxShadow = '0 0 8px rgba(112, 224, 176, 0.3), 0 0 16px rgba(112, 224, 176, 0.15)';
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = AX.mint;
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  Login
                </button>
              )
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-0.5" style={{ backgroundColor: '#06070b' }}>
          {/* <div className="group relative">
            <button
              onClick={() => setWatchlistOpen(true)}
              className="cursor-pointer rounded p-0.5 transition-all duration-300 ease-out"
              style={{ color: AX.muted }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.08)';
                e.currentTarget.style.color = '#3b82f6';
                e.currentTarget.style.boxShadow = '0 0 6px rgba(59, 130, 246, 0.25), 0 0 12px rgba(59, 130, 246, 0.12)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = AX.muted;
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <FiStar size={14} />
            </button>
            <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 px-2 py-1 rounded text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50"
                 style={{ 
                   backgroundColor: AX.surface, 
                   color: AX.text, 
                   border: `1px solid ${AX.border}`,
                   boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                 }}>
              Watchlist
              <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent"
                   style={{ borderRightColor: AX.surface }}></div>
            </div>
          </div> */}
          
          <div className="group relative">
            <button 
              className="cursor-pointer rounded p-0.5 transition-all duration-300 ease-out"
              style={{ color: AX.muted }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.08)';
                e.currentTarget.style.color = '#22c55e';
                e.currentTarget.style.boxShadow = '0 0 6px rgba(34, 197, 94, 0.25), 0 0 12px rgba(34, 197, 94, 0.12)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = AX.muted;
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18"/>
                <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
              </svg>
            </button>
            {/* Custom tooltip for Active Positions */}
            <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 px-2 py-1 rounded text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50"
                 style={{ 
                   backgroundColor: AX.surface, 
                   color: AX.text, 
                   border: `1px solid ${AX.border}`,
                   boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                 }}>
              Active Positions
              {/* Tooltip arrow pointing left */}
              <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent"
                   style={{ borderRightColor: AX.surface }}></div>
            </div>
          </div>
          
          <div className="h-4 border-r" style={{ borderColor: AX.border }}> </div>
        </div>
        
        {/* Mobile Menu - slides from left to right */}
        <div
          ref={mobileMenuRef}
          className={`md:hidden fixed top-0 left-0 bottom-0 z-50 transition-all duration-300 ease-out overflow-y-auto ${
            mobileMenuOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-full pointer-events-none'
          }`}
          style={{
            backgroundColor: AX.bg,
            borderRight: `1px solid ${AX.border}`,
            width: '80%',
            maxWidth: '320px',
            height: '100vh',
          }}
        >
          {/* Close button at top */}
          <div className="flex justify-end items-center px-4 py-3 border-b" style={{ borderColor: AX.border }}>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300 ease-out"
              style={{ backgroundColor: AX.surface, borderColor: AX.border, color: AX.text }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(24, 196, 140, 0.08)';
                e.currentTarget.style.borderColor = AX.mint;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
                e.currentTarget.style.borderColor = AX.border;
              }}
            >
              <FaTimes size={14} />
            </button>
          </div>
          
          <div className="px-4 pb-4">
            {/* Navigation Links */}
            <nav className="flex flex-col gap-1 mb-4">
              {navLinks.map((link) => {
                const isActive = router.pathname === link.href || 
                  (link.name === "Trenches" && router.pathname.startsWith("/trade/"));
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-base font-medium transition-all duration-200 rounded-lg"
                    style={{
                      color: isActive ? AX.mint : AX.text,
                      backgroundColor: isActive ? 'rgba(24, 196, 140, 0.1)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'rgba(112, 224, 176, 0.08)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    {link.name}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t pt-4 mb-4" style={{ borderColor: AX.border }}>
              {/* SOL Balance */}
              {user && (
                <div 
                  className="flex items-center gap-2 px-4 py-3 rounded-lg mb-2"
                  style={{ 
                    backgroundColor: AX.surface, 
                    color: AX.text 
                  }}
                >
                  <FaWallet size={14} style={{ color: AX.muted }} />
                  <span className="text-sm font-medium">{solBalance.toFixed(4)} SOL</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 px-4">
                <button
                  onClick={() => {
                    handleDepositClick();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200"
                  style={{
                    backgroundColor: AX.mint,
                    color: '#000000',
                  }}
                >
                  Deposit
                </button>
                <button
                  onClick={() => {
                    handleWithdrawClick();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200"
                  style={{
                    backgroundColor: AX.sell,
                    color: '#000000',
                  }}
                >
                  Withdraw
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Backdrop overlay when mobile menu is open */}
        <div
          className={`md:hidden fixed inset-0 z-40 transition-opacity duration-300 ${
            mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          }}
          onClick={() => setMobileMenuOpen(false)}
        />
      </header>
      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />
      <WithdrawModal isOpen={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
      <WatchlistModal open={watchlistOpen} onClose={() => setWatchlistOpen(false)} />
      <NotificationDropdown open={notificationOpen} onClose={() => setNotificationOpen(false)} />
      {/* Search Modal */}
      <SearchModal
        open={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        selectedTimeframe={selectedTimeframe}
        onSubmit={(q) => {
          const trimmed = q.trim();
          // If it's likely a token address navigate directly to trade page
          if (trimmed.length >= 10) {
            router.push(`/trade/${trimmed}`);
            setSearch?.("");
            return;
          }

          // Otherwise treat as name search and stay on Discover
          if (setSearch) setSearch(trimmed);
          if (router.pathname !== "/" && !router.pathname.startsWith("/trade/")) {
            router.push({ pathname: "/", query: { search: trimmed } });
          } else if (router.pathname === "/") {
            router.replace({ pathname: "/", query: { search: trimmed } }, undefined, { shallow: true });
          }
        }}
        onQueryChange={(q) => {
          const trimmed = q.trim();

          // Skip routing updates for short queries (<3 chars)
          if (trimmed.length < 3) {
            if (router.pathname === "/" && Object.keys(router.query).includes("search")) {
              router.replace({ pathname: "/" }, undefined, { shallow: true });
            }
            if (setSearch) setSearch(trimmed);
            return;
          }

          // Live updates for longer queries - only redirect to home if not on a trade page
          if (router.pathname !== "/" && !router.pathname.startsWith("/trade/")) {
            router.push({ pathname: "/", query: { search: trimmed } }, undefined, { shallow: true });
          } else if (router.pathname === "/") {
            router.replace({ pathname: "/", query: { search: trimmed } }, undefined, { shallow: true });
          }
          if (setSearch) setSearch(trimmed);
        }}
      />
    </>
  );
}
