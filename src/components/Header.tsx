import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { FaSearch, FaStar, FaBell, FaWallet } from "react-icons/fa";
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
  mint: "#70E0B0",
  mintHover: "#58B890",
  sell: "#FF4D7F",
};

    const navLinks = [
      { name: "Trenches", href: "/pulse" },
      { name: "Portfolio", href: "/portfolio" },
      { name: "Trending", href: "/construction" },
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

  return (
    <>
      <header className="sticky top-0 z-20 w-full border-b backdrop-blur" style={{ backgroundColor: '#0f1012', borderColor: AX.border }}>
        <div className="w-full bg-green-400 text-center text-black p-0.5 text-sm">
          [ This terminal is still under development and not ready for production,&nbsp;
          <b>use at your own risk!</b> ]
        </div>
        <div className="flex max-w-full items-center justify-between border-b px-4 py-2.5" style={{ backgroundColor: '#000000', borderColor: AX.border }}>
          <div className="flex min-w-0 items-center gap-3">
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
            <nav className="ml-6 flex items-center gap-5">
              {navLinks.map((link) => {
                const isActive = router.pathname === link.href || 
                  (link.name === "Trenches" && router.pathname.startsWith("/trade/"));
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    className={`px-1.5 py-0.5 text-sm font-medium transition-all duration-300 ease-out rounded ${
                      isActive ? "border-current" : ""
                    }`}
                    style={{
                      color: isActive ? AX.mint : AX.text,
                      borderColor: isActive ? AX.mint : "transparent"
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
                    e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.08)';
                    e.currentTarget.style.borderColor = '#22c55e';
                    e.currentTarget.style.boxShadow = '0 0 8px rgba(34, 197, 94, 0.3), 0 0 16px rgba(34, 197, 94, 0.15)';
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
            {/* SOL Balance Pill */}
            {user && (
              <div 
                className="flex items-center gap-1.5 h-8 rounded-full border px-3 transition-all duration-300 ease-out cursor-default"
                style={{ 
                  backgroundColor: AX.surface, 
                  borderColor: AX.border,
                  color: AX.text 
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(112, 224, 176, 0.08)';
                  e.currentTarget.style.borderColor = AX.mint;
                  e.currentTarget.style.boxShadow = '0 0 8px rgba(112, 224, 176, 0.2)';
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
            <button
              onClick={handleDepositClick}
              className="ml-2 px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-300 ease-out"
              style={{
                backgroundColor: AX.mint,
                color: '#000000',
                border: 'none'
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
              Deposit
            </button>
            <button
              onClick={handleWithdrawClick}
              className="ml-2 px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-300 ease-out"
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
            <button
              onClick={() => setNotificationOpen(true)}
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300 ease-out"
              style={{ 
                backgroundColor: AX.surface, 
                borderColor: AX.border,
                color: AX.muted 
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.08)';
                e.currentTarget.style.borderColor = '#22c55e';
                e.currentTarget.style.color = '#22c55e';
                e.currentTarget.style.boxShadow = '0 0 8px rgba(34, 197, 94, 0.3), 0 0 16px rgba(34, 197, 94, 0.15)';
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
            {user && !userLoading ? (
              <div className="group relative flex cursor-pointer items-center gap-2">
                {/* Circular profile picture (placeholder) */}
                <div className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white select-none" style={{ backgroundColor: AX.mint }}>
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
                <span className="max-w-[90px] truncate text-sm" style={{ color: AX.text }}>
                  {user.name}
                </span>
                {/* Dropdown for logout */}
                <div className="absolute top-8 right-0 z-50 min-w-[100px] rounded border px-3 py-1.5 opacity-0 shadow-lg transition-opacity group-hover:opacity-100" style={{ backgroundColor: AX.surface, borderColor: AX.border }}>
                  <InterstateButton
                    variant="danger"
                    size="sm"
                    className="h-auto w-full border-none bg-transparent px-0 py-0 text-left text-xs font-semibold shadow-none hover:underline"
                    onClick={() => {
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
        <div className="flex items-center gap-2 px-3 py-0.5">
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
