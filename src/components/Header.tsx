import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState, useRef, useCallback } from "react";
import { FaSearch, FaStar, FaWallet, FaBars, FaTimes } from "react-icons/fa";
import { IoShieldCheckmarkOutline } from "react-icons/io5";
import { useUser } from "./UserContext";
import Cookies from "js-cookie";
import toast from "react-hot-toast";
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
      // { name: "Perpetuals", href: "/construction" },
      // { name: "Yield", href: "/construction" },
      { name: "Rewards", href: "/rewards" },
    ];

interface HeaderProps {
  search?: string;
  setSearch?: (val: string) => void;
  showSearch?: boolean;
  selectedTimeframe?: Timeframe;
  /** Controls whether the header sticks to the top or scrolls away */
  isSticky?: boolean;
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

export default function Header({
  search = "",
  setSearch,
  showSearch = true,
  selectedTimeframe = "1h",
  isSticky = true,
}: HeaderProps) {
  const router = useRouter();
  const isDiscover = router.pathname === "/";
  const { user, loading: userLoading, solBalance } = useUser();
  const [profileOpen, setProfileOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // State for clipboard token detection
  const [clipboardToken, setClipboardToken] = useState<{
    address: string;
    imageUrl: string;
    name: string;
    isPumpToken: boolean;
  } | null>(null);
  const lastCheckedClipboard = useRef<string>("");

  const processClipboardValue = useCallback(
    async (rawValue: string) => {
      const trimmed = (rawValue || "").trim();
      if (!trimmed) return;

      if (clipboardToken?.address === trimmed) return;
      if (lastCheckedClipboard.current === trimmed) return;

      const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);
      if (!isSolanaAddress) {
        setClipboardToken(null);
        lastCheckedClipboard.current = trimmed;
        return;
      }

      lastCheckedClipboard.current = trimmed;

      try {
        const response = await fetch(`/api/token-service/trade-view?mint_address=${trimmed}`);
        if (!response.ok) {
          setClipboardToken(null);
          lastCheckedClipboard.current = "";
          return;
        }

        const data = await response.json();
        const token = data?.token;

        if (!token) {
          setClipboardToken(null);
          lastCheckedClipboard.current = "";
          return;
        }

        const imageUrl = token.imageUrl || token.image || token.thumbnail || token.uri || null;
        if (!imageUrl) {
          setClipboardToken(null);
          lastCheckedClipboard.current = "";
          return;
        }

        const launchpadProtocol = (token.launchpad_protocol || token.launchpadProtocol || token.protocol || "").toLowerCase();
        const isPumpToken =
          launchpadProtocol.includes("pump.fun") ||
          launchpadProtocol.includes("pumpfun") ||
          launchpadProtocol === "pump";

        const tokenName =
          (typeof token.name === "string" && token.name.trim()) ||
          (typeof token.metadata?.name === "string" && token.metadata.name.trim()) ||
          (typeof token.symbol === "string" && token.symbol.trim()) ||
          (typeof token.metadata?.symbol === "string" && token.metadata.symbol.trim()) ||
          (typeof token.ticker === "string" && token.ticker.trim()) ||
          null;

        setClipboardToken({
          address: trimmed,
          imageUrl,
          name: tokenName || "Unknown Token",
          isPumpToken,
        });
      } catch (error) {
        console.error("Error fetching token data:", error);
        setClipboardToken(null);
        lastCheckedClipboard.current = "";
      }
    },
    [clipboardToken?.address],
  );

  // Check clipboard for valid token address
  const checkClipboard = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) return;
    try {
      const text = await navigator.clipboard.readText();
      await processClipboardValue(text);
    } catch (error) {
      // Clipboard access denied or error - silently fail
    }
  }, [processClipboardValue]);

  const CLIPBOARD_POLL_INTERVAL = 800; // ms

  // Periodically check clipboard
  useEffect(() => {
    const interval = setInterval(() => {
      checkClipboard();
    }, CLIPBOARD_POLL_INTERVAL);

    // Also check on mount
    checkClipboard();

    return () => clearInterval(interval);
  }, [checkClipboard]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleCopy = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain");
      if (text) {
        processClipboardValue(text);
      }
    };

    document.addEventListener("copy", handleCopy);
    return () => document.removeEventListener("copy", handleCopy);
  }, [processClipboardValue]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const handleFocus = () => {
      checkClipboard();
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        checkClipboard();
      }
    };

    const handlePointer = () => {
      checkClipboard();
    };

    const handleKey = () => {
      checkClipboard();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [checkClipboard]);

  // Handler for Paste CA button - navigate to token
  const handlePasteCA = async () => {
    if (clipboardToken) {
      router.push(`/trade/${clipboardToken.address}`);
      toast.success("Navigating to token...", {
        duration: 2000,
        style: {
          background: '#1E1F26',
          color: '#E6E7EA',
          border: '1px solid #70E0B0',
        }
      });
    } else {
      // Fallback: try to read clipboard if no token detected
      try {
        const text = await navigator.clipboard.readText();
        const trimmed = text.trim();
        const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);

        if (isSolanaAddress) {
          router.push(`/trade/${trimmed}`);
          toast.success("Navigating to token...", {
            duration: 2000,
            style: {
              background: '#1E1F26',
              color: '#E6E7EA',
              border: '1px solid #70E0B0',
            }
          });
        } else {
          toast.error("Invalid token address in clipboard", {
            duration: 3000,
            style: {
              background: '#1E1F26',
              color: '#E6E7EA',
              border: '1px solid #ff6b6b',
            }
          });
        }
      } catch (error) {
        console.error('Clipboard read error:', error);
        toast.error("Failed to read clipboard. Please grant permission.", {
          duration: 3000,
          style: {
            background: '#1E1F26',
            color: '#E6E7EA',
            border: '1px solid #ff6b6b',
          }
        });
      }
    }
  };

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
        const isEditable =
          !!t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.tagName === "SELECT" ||
            (t as any).isContentEditable);
        if (isEditable) return; // allow normal tabbing in forms
        e.preventDefault();
        setSearchModalOpen(true);
      }

      // Toggle on '/' (slash). Some keyboards send '?' with Shift+'/'; we support both.
      if ((e.key === "/" || e.key === "?") && isPlain) {
        const t = (document.activeElement as HTMLElement) || null;
        const isEditable =
          !!t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.tagName === "SELECT" ||
            (t as any).isContentEditable);
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
      document.body.style.overflow = "";
      return;
    }

    // Prevent body scroll when menu is open
    document.body.style.overflow = "hidden";

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;

      // Don't close if clicking on the hamburger button itself
      if (target.closest("[data-mobile-menu-toggle]")) {
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
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [router.pathname]);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };

    if (profileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileMenuOpen]);

  return (
    <>
      <header
        className={`${isSticky ? "sticky top-0 z-20" : "relative z-10"} w-full border-b backdrop-blur`}
        style={{ backgroundColor: "#0f1012", borderColor: AX.border }}
      >
        <div
          className="flex max-w-full items-center justify-between border-b px-4 py-2.5"
          style={{ backgroundColor: "#06070b", borderColor: AX.border }}
        >
          <div className="flex min-w-0 items-center gap-3">
            {/* Mobile hamburger menu button */}
            <button
              data-mobile-menu-toggle
              onClick={(e) => {
                e.stopPropagation();
                setMobileMenuOpen(!mobileMenuOpen);
              }}
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300 ease-out z-50 relative"
              style={{
                backgroundColor: AX.surface,
                borderColor: AX.border,
                color: AX.text,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "rgba(24, 196, 140, 0.08)";
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
            <nav
              className="hidden md:flex ml-6 items-center gap-5"
              style={{ position: "relative", zIndex: 1000 }}
            >
              {navLinks.map((link) => {
                const isActive =
                  router.pathname === link.href ||
                  (link.name === "Trenches" &&
                    router.pathname.startsWith("/trade/"));
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={(e) => {
                      // Use router.push for client-side navigation with fallback
                      router.push(link.href).catch((err: any) => {
                        // Fallback to full page navigation if router.push fails
                        console.error(
                          "Router.push failed, using fallback:",
                          err,
                        );
                        window.location.href = link.href;
                      });
                    }}
                    className={`px-1.5 py-0.5 text-sm font-medium transition-all duration-300 ease-out rounded ${
                      isActive ? "border-current" : ""
                    }`}
                    style={{
                      color: isActive ? AX.mint : AX.text,
                      borderColor: isActive ? AX.mint : "transparent",
                      position: "relative",
                      zIndex: 1001,
                      pointerEvents: "auto",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = AX.mint;
                        e.currentTarget.style.backgroundColor =
                          "rgba(112, 224, 176, 0.1)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = AX.text;
                        e.currentTarget.style.backgroundColor = "transparent";
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
                  style={{
                    backgroundColor: AX.surface,
                    borderColor: AX.border,
                    color: AX.muted,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(24, 196, 140, 0.08)";
                    e.currentTarget.style.borderColor = "#18c48c";
                    e.currentTarget.style.boxShadow =
                      "0 0 8px rgba(24, 196, 140, 0.3), 0 0 16px rgba(24, 196, 140, 0.15)";
                    e.currentTarget.style.transform = "scale(1.01)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = AX.surface;
                    e.currentTarget.style.borderColor = AX.border;
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <FaSearch size={14} />
                  <span className="text-xs text-neutral-400 whitespace-nowrap">
                    Search tokens…
                  </span>
                  <span className="ml-auto rounded-md border border-neutral-700/70 bg-neutral-800/80 px-1.5 py-0.5 text-[10px] leading-none text-neutral-200">
                    Tab
                  </span>
                </button>

                {/* Compact icon-only trigger on small screens */}
                <button
                  onClick={() => setSearchModalOpen(true)}
                  className="md:hidden flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300 ease-out"
                  style={{
                    backgroundColor: AX.surface,
                    borderColor: AX.border,
                    color: AX.muted,
                  }}
                >
                  <FaSearch size={14} />
                </button>

                {/* Clipboard token button - desktop */}
                {clipboardToken && clipboardToken.imageUrl && (
                  <button
                    onClick={handlePasteCA}
                    className="hidden md:flex items-center gap-2 h-8 rounded-full border pl-2 pr-2.5 transition-all duration-300 ease-out relative"
                    style={{
                      backgroundColor: AX.surface,
                      borderColor: AX.border,
                      color: AX.muted,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "rgba(24, 196, 140, 0.08)";
                      e.currentTarget.style.borderColor = "#18c48c";
                      e.currentTarget.style.boxShadow =
                        "0 0 8px rgba(24, 196, 140, 0.3), 0 0 16px rgba(24, 196, 140, 0.15)";
                      e.currentTarget.style.transform = "scale(1.01)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = AX.surface;
                      e.currentTarget.style.borderColor = AX.border;
                      e.currentTarget.style.boxShadow = "none";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={clipboardToken.imageUrl}
                        alt="Token"
                        className="h-7 w-7 rounded-md object-cover flex-shrink-0"
                        onError={() => setClipboardToken(null)}
                      />
                      <span className="text-xs font-medium text-white truncate max-w-[90px]">
                        {clipboardToken.name}
                      </span>
                    </div>
                    <div className="relative group/shield ml-1">
                      <IoShieldCheckmarkOutline
                        size={14}
                        style={{
                          color: clipboardToken.isPumpToken ? "#22c55e" : "#eab308",
                        }}
                      />
                      {/* Tooltip */}
                      <div className="absolute left-1/2 bottom-full mb-2 transform -translate-x-1/2 px-2 py-1 rounded text-xs font-medium opacity-0 group-hover/shield:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50"
                        style={{
                          backgroundColor: AX.surface,
                          color: AX.text,
                          border: `1px solid ${AX.border}`,
                          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                        }}
                      >
                        audit
                        {/* Tooltip arrow */}
                        <div
                          className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent"
                          style={{ borderTopColor: AX.surface }}
                        ></div>
                      </div>
                    </div>
                  </button>
                )}

                {/* Clipboard token button - mobile */}
                {clipboardToken && clipboardToken.imageUrl && (
                  <button
                    onClick={handlePasteCA}
                    className="md:hidden flex items-center gap-2 h-8 rounded-full border pl-2 pr-2.5 transition-all duration-300 ease-out relative"
                    style={{
                      backgroundColor: AX.surface,
                      borderColor: AX.border,
                    }}
                  >
                    <img
                      src={clipboardToken.imageUrl}
                      alt="Token"
                      className="h-6 w-6 rounded-md object-cover flex-shrink-0"
                      onError={() => setClipboardToken(null)}
                    />
                    <span className="text-[11px] font-medium text-white truncate max-w-[80px]">
                      {clipboardToken.name}
                    </span>
                    <div className="absolute top-0.5 right-0.5 group/shield bg-black/60 rounded-full p-0.5">
                      <IoShieldCheckmarkOutline
                        size={11}
                        style={{
                          color: clipboardToken.isPumpToken ? "#22c55e" : "#eab308",
                        }}
                      />
                      {/* Tooltip */}
                      <div className="absolute left-1/2 bottom-full mb-1.5 transform -translate-x-1/2 px-2 py-1 rounded text-[10px] font-medium opacity-0 group-hover/shield:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50"
                        style={{
                          backgroundColor: AX.surface,
                          color: AX.text,
                          border: `1px solid ${AX.border}`,
                          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                        }}
                      >
                        audit
                        {/* Tooltip arrow */}
                        <div
                          className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent"
                          style={{ borderTopColor: AX.surface }}
                        ></div>
                      </div>
                    </div>
                  </button>
                )}
              </div>
            )}
            {/* SOL Balance Pill - hidden on mobile (will be in mobile menu) */}
            {user && (
              <div
                className="hidden md:flex items-center gap-1.5 h-8 rounded-full border px-3 transition-all duration-300 ease-out cursor-default"
                style={{
                  backgroundColor: AX.surface,
                  borderColor: AX.border,
                  color: AX.text,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(24, 196, 140, 0.08)";
                  e.currentTarget.style.borderColor = AX.mint;
                  e.currentTarget.style.boxShadow =
                    "0 0 8px rgba(24, 196, 140, 0.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = AX.surface;
                  e.currentTarget.style.borderColor = AX.border;
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <FaWallet size={12} style={{ color: AX.muted }} />
                <span className="text-xs font-medium">
                  {solBalance.toFixed(4)}
                </span>
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
                color: "#000000",
                border: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = AX.mintHover;
                e.currentTarget.style.boxShadow =
                  "0 0 8px rgba(24, 196, 140, 0.3), 0 0 16px rgba(24, 196, 140, 0.15)";
                e.currentTarget.style.transform = "scale(1.02)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = AX.mint;
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              Deposit
            </button>

            {/* UPDATED WITHDRAW BUTTON (desktop) */}
            <button
              onClick={handleWithdrawClick}
              className="hidden md:block ml-2 px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-300 ease-out"
              style={{
                backgroundColor: "#0f1012", // dark pill
                color: "#FFFFFF", // white text
                border: `1px solid ${AX.border}`, // subtle border
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#1A1B1F";
                e.currentTarget.style.borderColor = AX.mint;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#0f1012";
                e.currentTarget.style.borderColor = AX.border;
              }}
            >
              Withdraw
            </button>

            <button
              onClick={() => setWatchlistOpen(true)}
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300 ease-out"
              style={{
                backgroundColor: AX.surface,
                borderColor: AX.border,
                color: AX.muted,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "rgba(24, 196, 140, 0.08)";
                e.currentTarget.style.borderColor = AX.mint;
                e.currentTarget.style.color = AX.mint;
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "scale(1.02)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
                e.currentTarget.style.borderColor = AX.border;
                e.currentTarget.style.color = AX.muted;
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "scale(1)";
              }}
              title="Watchlist"
            >
              <FaStar size={14} />
            </button>
            {/* User profile/login - visible on all screens */}
            {user && !userLoading ? (
              <div
                ref={profileMenuRef}
                className="flex group relative cursor-pointer items-center gap-2"
              >
                {/* Circular profile picture (placeholder) */}
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white select-none"
                  style={{ backgroundColor: AX.mint }}
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                >
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
                <span
                  className="hidden md:block max-w-[90px] truncate text-sm"
                  style={{ color: AX.text }}
                >
                  {user.name}
                </span>
                {/* Dropdown for logout */}
                <div
                  className={`absolute top-8 right-0 z-50 min-w-[100px] rounded border px-3 py-1.5 shadow-lg transition-opacity ${
                    profileMenuOpen
                      ? "opacity-100"
                      : "opacity-0 md:group-hover:opacity-100"
                  }`}
                  style={{
                    backgroundColor: AX.surface,
                    borderColor: AX.border,
                  }}
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
                    color: "#000000",
                    border: "none",
                  }}
                  onClick={() => {
                    const event = new CustomEvent("open-login-modal");
                    window.dispatchEvent(event);
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#58B890";
                    e.currentTarget.style.boxShadow =
                      "0 0 8px rgba(112, 224, 176, 0.3), 0 0 16px rgba(112, 224, 176, 0.15)";
                    e.currentTarget.style.transform = "scale(1.02)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = AX.mint;
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  Login
                </button>
              )
            )}
          </div>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-0.5"
          style={{ backgroundColor: "#06070b" }}
        >
          {/* extra toolbar section */}
          <div className="group relative">
            <button
              className="cursor-pointer rounded p-0.5 transition-all duration-300 ease-out"
              style={{ color: AX.muted }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "rgba(34, 197, 94, 0.08)";
                e.currentTarget.style.color = "#22c55e";
                e.currentTarget.style.boxShadow =
                  "0 0 6px rgba(34, 197, 94, 0.25), 0 0 12px rgba(34, 197, 94, 0.12)";
                e.currentTarget.style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = AX.muted;
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
              </svg>
            </button>
            {/* Custom tooltip for Active Positions */}
            <div
              className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 px-2 py-1 rounded text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50"
              style={{
                backgroundColor: AX.surface,
                color: AX.text,
                border: `1px solid ${AX.border}`,
                boxShadow:
                  "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
              }}
            >
              Active Positions
              {/* Tooltip arrow pointing left */}
              <div
                className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent"
                style={{ borderRightColor: AX.surface }}
              ></div>
            </div>
          </div>

          <div className="h-4 border-r" style={{ borderColor: AX.border }}>
            {" "}
          </div>
        </div>

        {/* Mobile Menu - slides from left to right */}
        <div
          ref={mobileMenuRef}
          className={`md:hidden fixed top-0 left-0 bottom-0 z-50 transition-all duration-300 ease-out overflow-y-auto ${
            mobileMenuOpen
              ? "opacity-100 translate-x-0"
              : "opacity-0 -translate-x-full pointer-events-none"
          }`}
          style={{
            backgroundColor: AX.bg,
            borderRight: `1px solid ${AX.border}`,
            width: "80%",
            maxWidth: "320px",
            height: "100vh",
          }}
        >
          {/* Close button at top */}
          <div
            className="flex justify-end items-center px-4 py-3 border-b"
            style={{ borderColor: AX.border }}
          >
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300 ease-out"
              style={{
                backgroundColor: AX.surface,
                borderColor: AX.border,
                color: AX.text,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "rgba(24, 196, 140, 0.08)";
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
                const isActive =
                  router.pathname === link.href ||
                  (link.name === "Trenches" &&
                    router.pathname.startsWith("/trade/"));
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-base font-medium transition-all duration-200 rounded-lg"
                    style={{
                      color: isActive ? AX.mint : AX.text,
                      backgroundColor: isActive
                        ? "rgba(24, 196, 140, 0.1)"
                        : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor =
                          "rgba(112, 224, 176, 0.08)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    {link.name}
                  </Link>
                );
              })}
            </nav>

            <div
              className="border-t pt-4 mb-4"
              style={{ borderColor: AX.border }}
            >
              {/* SOL Balance */}
              {user && (
                <div
                  className="flex items-center gap-2 px-4 py-3 rounded-lg mb-2"
                  style={{
                    backgroundColor: AX.surface,
                    color: AX.text,
                  }}
                >
                  <FaWallet size={14} style={{ color: AX.muted }} />
                  <span className="text-sm font-medium">
                    {solBalance.toFixed(4)} SOL
                  </span>
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
                    color: "#000000",
                  }}
                >
                  Deposit
                </button>
                {/* UPDATED WITHDRAW BUTTON (mobile) */}
                <button
                  onClick={() => {
                    handleWithdrawClick();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200"
                  style={{
                    backgroundColor: "#0f1012",
                    color: "#FFFFFF",
                    border: `1px solid ${AX.border}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#1A1B1F";
                    e.currentTarget.style.borderColor = AX.mint;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#0f1012";
                    e.currentTarget.style.borderColor = AX.border;
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
            mobileMenuOpen
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none"
          }`}
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
          }}
          onClick={() => setMobileMenuOpen(false)}
        />
      </header>
      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />
      <WithdrawModal
        isOpen={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
      />
      <WatchlistModal
        open={watchlistOpen}
        onClose={() => setWatchlistOpen(false)}
      />
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
            router.replace(
              { pathname: "/", query: { search: trimmed } },
              undefined,
              { shallow: true },
            );
          }
        }}
        onQueryChange={(q) => {
          const trimmed = q.trim();

          // Skip routing updates for short queries (<3 chars)
          if (trimmed.length < 3) {
            if (
              router.pathname === "/" &&
              Object.keys(router.query).includes("search")
            ) {
              router.replace({ pathname: "/" }, undefined, { shallow: true });
            }
            if (setSearch) setSearch(trimmed);
            return;
          }

          // Live updates for longer queries - only redirect to home if not on a trade page
          if (router.pathname !== "/" && !router.pathname.startsWith("/trade/")) {
            router.push(
              { pathname: "/", query: { search: trimmed } },
              undefined,
              { shallow: true },
            );
          } else if (router.pathname === "/") {
            router.replace(
              { pathname: "/", query: { search: trimmed } },
              undefined,
              { shallow: true },
            );
          }
          if (setSearch) setSearch(trimmed);
        }}
      />
    </>
  );
}
