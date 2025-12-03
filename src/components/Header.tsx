import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  FaSearch,
  FaStar,
  FaWallet,
  FaChevronLeft,
  FaChevronRight,
  FaBell,
  FaChevronDown,
} from "react-icons/fa";
import { IoShieldCheckmarkOutline } from "react-icons/io5";
import { useUser } from "./UserContext";
import { useSolPrice } from "./SolPriceContext";
import Cookies from "js-cookie";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";
import InterstateButton from "./InterstateButton";
import { FiBarChart, FiChevronDown, FiStar } from "react-icons/fi";
import SearchModal from "./SearchModal";
import BlockchainSwitcher from "./BlockchainSwitcher";
import UpdatesModal from "./UpdatesModal";
import type { Timeframe } from "../pages/index";
import { CiBellOn, CiStar } from "react-icons/ci";

/* ---- style palette ---- */
const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#c7c9d1",
  muted: "#c7c9d1",
  mint: "#18c48c",
  mintHover: "#12a877",
  sell: "#FF4D7F",
};

// Platform updates data
const PLATFORM_UPDATES = [
  {
    id: "update-1",
    title: "Enhanced Real-Time Data",
    description:
      "Experience lightning-fast updates with our improved WebSocket infrastructure for live token tracking.",
    badge: "New Feature",
    badgeColor:
      "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    image: "/interstate-logo.png",
  },
  {
    id: "update-2",
    title: "Multi-Chain Support",
    description:
      "Track tokens across Solana, BNB Chain, and more. Switch between chains seamlessly with our updated interface.",
    badge: "Coming Soon",
    badgeColor: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  },
  {
    id: "update-3",
    title: "Advanced Filtering",
    description:
      "Find the perfect opportunities with our new advanced filtering options. Sort by liquidity, volume, and more.",
    badge: "Improved",
    badgeColor: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
    actionText: "Learn more about filtering",
    actionLink: "https://discord.gg/sACYQmCsTJ",
  },
];

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
  const [headerBarVisible, setHeaderBarVisible] = useState(true);

  // Check for header bar visibility on mount and when body class changes
  useEffect(() => {
    const checkVisibility = () => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("header-bar-visible");
        const visible = saved !== "false";
        setHeaderBarVisible(visible);
      }
    };

    checkVisibility();

    // Listen for storage changes (in case changed in another tab/window)
    window.addEventListener("storage", checkVisibility);

    // Also check body class
    const observer = new MutationObserver(checkVisibility);
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    return () => {
      window.removeEventListener("storage", checkVisibility);
      observer.disconnect();
    };
  }, []);
  const router = useRouter();
  const isDiscover = router.pathname === "/";
  const {
    user,
    loading: userLoading,
    solBalance,
    refreshBalance,
    primaryWalletAddresses,
    chainBalances,
    logout,
  } = useUser();
  const currentChain = (router.query.chain as string) || "monad";
  const { solPrice, monPrice } = useSolPrice();
  const chainPrice = currentChain === 'monad' ? monPrice : solPrice;
  const [profileOpen, setProfileOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositInitialTab, setDepositInitialTab] = useState<
    "convert" | "deposit" | "buy" | "withdraw"
  >("deposit");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const navScrollRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // State for clipboard token detection
  const [clipboardToken, setClipboardToken] = useState<{
    address: string;
    imageUrl: string;
    name: string;
    isPumpToken: boolean;
  } | null>(null);
  const lastCheckedClipboard = useRef<string>("");

  const chainSymbols: Record<string, string> = {
    sol: "SOL",
    monad: "MON",
    eth: "ETH",
    bnb: "BNB",
    base: "BASE",
  };
  
  const chainLogos: Record<string, string> = {
    sol: "https://www.pngall.com/wp-content/uploads/10/Solana-Crypto-Logo-PNG-File.png",
    monad: "https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1",
    eth: "https://www.pngall.com/wp-content/uploads/10/Solana-Crypto-Logo-PNG-File.png", // Fallback to Solana for now
    bnb: "https://www.pngall.com/wp-content/uploads/10/Solana-Crypto-Logo-PNG-File.png", // Fallback to Solana for now
    base: "https://www.pngall.com/wp-content/uploads/10/Solana-Crypto-Logo-PNG-File.png", // Fallback to Solana for now
  };
  
  const [chainBalance, setChainBalance] = useState<number>(
    chainBalances[currentChain] ?? (currentChain === "sol" ? solBalance : 0),
  );

  const chainAwareHref = useCallback(
    (href: string) => ({
      pathname: href,
      query: { ...router.query, chain: currentChain },
    }),
    [router.query, currentChain],
  );
  const formatBalance = (value: number, digits = 3) => {
    if (value === 0) return "0";
    const fixed = value.toFixed(digits);
    return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  };
  const formatMultiDigitBalance = (value: number) =>
    Math.abs(value) >= 100
      ? value.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      : formatBalance(value);
  const formatCurrency = (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  useEffect(() => {
    const address =
      currentChain === "sol"
        ? primaryWalletAddresses.solana || user?.publicKey || null
        : primaryWalletAddresses.ethereum || null;

    if (!address) {
      if (currentChain === "sol" && user?.publicKey) {
        refreshBalance({ chain: "sol", address: user.publicKey }).then((res) => {
          if (res?.balance !== undefined) {
            setChainBalance(res.balance);
          }
        });
      } else {
        setChainBalance(0);
      }
      return;
    }

    let cancelled = false;
    refreshBalance({ chain: currentChain, address }).then((res) => {
      if (!cancelled && res?.balance !== undefined) {
        setChainBalance(res.balance);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    currentChain,
    primaryWalletAddresses.solana,
    primaryWalletAddresses.ethereum,
    user?.publicKey,
    refreshBalance,
  ]);

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
        const response = await fetch(
          `/api/token-service/trade-view?mint_address=${trimmed}`,
        );
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

        const imageUrl =
          token.imageUrl || token.image || token.thumbnail || token.uri || null;
        if (!imageUrl) {
          setClipboardToken(null);
          lastCheckedClipboard.current = "";
          return;
        }

        const launchpadProtocol = (
          token.launchpad_protocol ||
          token.launchpadProtocol ||
          token.protocol ||
          ""
        ).toLowerCase();
        const isPumpToken =
          launchpadProtocol.includes("pump.fun") ||
          launchpadProtocol.includes("pumpfun") ||
          launchpadProtocol === "pump";

        const tokenName =
          (typeof token.name === "string" && token.name.trim()) ||
          (typeof token.metadata?.name === "string" &&
            token.metadata.name.trim()) ||
          (typeof token.symbol === "string" && token.symbol.trim()) ||
          (typeof token.metadata?.symbol === "string" &&
            token.metadata.symbol.trim()) ||
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
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText)
      return;
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
    if (typeof window === "undefined" || typeof document === "undefined")
      return;

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
          background: "#1E1F26",
          color: "#E6E7EA",
          border: "1px solid #70E0B0",
        },
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
              background: "#1E1F26",
              color: "#E6E7EA",
              border: "1px solid #70E0B0",
            },
          });
        } else {
          toast.error("Invalid token address in clipboard", {
            duration: 3000,
            style: {
              background: "#1E1F26",
              color: "#E6E7EA",
              border: "1px solid #ff6b6b",
            },
          });
        }
      } catch (error) {
        console.error("Clipboard read error:", error);
        toast.error("Failed to read clipboard. Please grant permission.", {
          duration: 3000,
          style: {
            background: "#1E1F26",
            color: "#E6E7EA",
            border: "1px solid #ff6b6b",
          },
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
  const handleDepositClick = (
    tab: "convert" | "deposit" | "buy" | "withdraw" = "deposit",
  ) => {
    const token = Cookies.get("token");
    if (token && !user && !userLoading) {
      // Optionally, refresh user here if needed
    }
    setDepositInitialTab(tab);
    setDepositOpen(true);
  };

  // Handles opening the convert tab
  const handleConvertClick = () => {
    handleDepositClick("convert");
  };

  // Handles opening the buy tab
  const handleBuyClick = () => {
    handleDepositClick("buy");
  };

  // Handles opening the withdraw modal (now opens deposit modal with withdraw tab)
  const handleWithdrawClick = () => {
    const token = Cookies.get("token");
    if (token && !user && !userLoading) {
      // Optionally, refresh user here if needed
    }
    handleDepositClick("withdraw");
  };

  // Check if navigation arrows should be shown
  const checkScrollArrows = useCallback(() => {
    const nav = navScrollRef.current;
    if (!nav) return;

    const hasOverflow = nav.scrollWidth > nav.clientWidth;
    const isAtStart = nav.scrollLeft <= 0;
    const isAtEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 1;

    setShowLeftArrow(hasOverflow && !isAtStart);
    setShowRightArrow(hasOverflow && !isAtEnd);
  }, []);

  // Scroll navigation left
  const scrollLeft = () => {
    if (navScrollRef.current) {
      navScrollRef.current.scrollBy({ left: -200, behavior: "smooth" });
    }
  };

  // Scroll navigation right
  const scrollRight = () => {
    if (navScrollRef.current) {
      navScrollRef.current.scrollBy({ left: 200, behavior: "smooth" });
    }
  };

  // Update arrow visibility on scroll or resize
  useEffect(() => {
    checkScrollArrows();

    const nav = navScrollRef.current;
    if (nav) {
      nav.addEventListener("scroll", checkScrollArrows);
    }

    window.addEventListener("resize", checkScrollArrows);

    return () => {
      if (nav) {
        nav.removeEventListener("scroll", checkScrollArrows);
      }
      window.removeEventListener("resize", checkScrollArrows);
    };
  }, [checkScrollArrows]);

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

  // Close notifications panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    };

    if (notificationsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [notificationsOpen]);

  // Show Feature Updates modal only on first login
  useEffect(() => {
    if (typeof window === "undefined" || !user || userLoading) {
      return;
    }

    const storageKey = `feature-updates-first-login-${user.id}`;
    const hasSeenModal = localStorage.getItem(storageKey);

    if (!hasSeenModal) {
      // Delay to ensure page has loaded
      setTimeout(() => {
        setIsFirstLogin(true);
        setShowUpdatesModal(true);
      }, 1500);

      // Mark as seen
      localStorage.setItem(storageKey, "true");
    }
  }, [user, userLoading]);

  return (
    <>
      <header
        className={`${isSticky ? "sticky top-0 z-20" : "relative z-10"} w-full border-b backdrop-blur`}
        style={{ backgroundColor: "#0f1012", borderColor: AX.border }}
      >
        <div
          className="flex max-w-full items-center justify-between border-b px-2 pt-4 pb-2.5 md:px-4"
          style={{ backgroundColor: "#06070b", borderColor: AX.border }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden md:gap-3">
            <Link
              href={chainAwareHref("/pulse")}
              className="flex flex-shrink-0 items-center text-xl tracking-tight select-none"
              style={{ color: AX.text }}
              title="Go to Trenches"
            >
              <img
                src="/interstate-logo.png"
                alt="Interstate logo"
                className="h-auto w-20 scale-75 sm:w-24 md:w-30 md:scale-90"
              />
            </Link>

            {/* Navigation container with arrows */}
            <div className="relative flex flex-1 items-center gap-1 overflow-hidden">
              {/* Left arrow */}
              {showLeftArrow && (
                <button
                  onClick={scrollLeft}
                  className="z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center transition-all duration-300 ease-out"
                  style={{
                    color: AX.text,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = AX.mint;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = AX.text;
                  }}
                  aria-label="Scroll left"
                >
                  <FaChevronLeft size={14} />
                </button>
              )}

              {/* Navigation tabs - always visible with horizontal scroll */}
              <nav
                ref={navScrollRef}
                className="scrollbar-hide flex flex-1 items-center gap-1 overflow-x-auto sm:gap-2 xl:gap-3"
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
                      href={chainAwareHref(link.href)}
                      className={`flex-shrink-0 rounded px-2 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-300 ease-out sm:px-3 xl:px-4`}
                      style={{
                        color: isActive ? AX.mint : AX.text,
                        backgroundColor: isActive
                          ? "rgba(24, 196, 140, 0.1)"
                          : "transparent",
                        borderColor: "transparent",
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

              {/* Right arrow */}
              {showRightArrow && (
                <button
                  onClick={scrollRight}
                  className="z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center transition-all duration-300 ease-out"
                  style={{
                    color: AX.text,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = AX.mint;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = AX.text;
                  }}
                  aria-label="Scroll right"
                >
                  <FaChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-shrink-0 items-center gap-1.5 sm:gap-2 md:gap-3 lg:gap-4">
            {showSearch && (
              <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2">
                {/* Smaller search button (desktop) */}
                <button
                  onClick={() => setSearchModalOpen(true)}
                  className="hidden h-10 items-center gap-1.5 rounded-3xl border px-4 transition-all duration-300 ease-out xl:flex"
                  style={{
                    borderColor: AX.border,
                    color: AX.muted,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = AX.border;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = AX.border;
                  }}
                >
                  <FaSearch size={12} />
                  <span className="text-xs whitespace-nowrap text-neutral-400">
                    Search for any token or w..
                  </span>
                  <span className="ml-auto rounded border border-neutral-700/70 bg-neutral-800/80 px-1 py-0.5 text-[10px] leading-none text-neutral-200">
                    /
                  </span>
                </button>

                {/* Medium search button (for tablets) - shows icon + text without Tab keycap */}
                <button
                  onClick={() => setSearchModalOpen(true)}
                  className="hidden h-8 min-w-[180px] items-center gap-1.5 rounded-md border px-2.5 transition-all duration-300 ease-out lg:flex xl:hidden"
                  style={{
                    backgroundColor: AX.surface,
                    borderColor: AX.border,
                    color: AX.muted,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(24, 196, 140, 0.08)";
                    e.currentTarget.style.borderColor = "#18c48c";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = AX.surface;
                    e.currentTarget.style.borderColor = AX.border;
                  }}
                >
                  <FaSearch size={12} />
                  <span className="text-[11px] whitespace-nowrap text-neutral-400">
                    Search
                  </span>
                </button>

                {/* Compact icon-only trigger on small screens */}
                <button
                  onClick={() => setSearchModalOpen(true)}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border transition-all duration-300 ease-out lg:hidden"
                  style={{
                    backgroundColor: AX.surface,
                    borderColor: AX.border,
                    color: AX.muted,
                  }}
                >
                  <FaSearch size={14} />
                </button>

                {/* Clipboard token button - large desktop */}
                {clipboardToken && clipboardToken.imageUrl && (
                  <button
                    onClick={handlePasteCA}
                    className="relative hidden h-8 items-center gap-2 rounded-md border pr-2.5 pl-2 transition-all duration-300 ease-out xl:flex"
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
                    <div className="flex min-w-0 items-center gap-2">
                      <img
                        src={clipboardToken.imageUrl}
                        alt="Token"
                        className="h-7 w-7 flex-shrink-0 rounded-md object-cover"
                        onError={() => setClipboardToken(null)}
                      />
                      <span className="max-w-[90px] truncate text-sm font-medium text-[#f0f5f5]">
                        {clipboardToken.name}
                      </span>
                    </div>
                    <div className="group/shield relative ml-1">
                      <IoShieldCheckmarkOutline
                        size={14}
                        style={{
                          color: clipboardToken.isPumpToken
                            ? "#31e3ac"
                            : "#eab308",
                        }}
                      />
                      {/* Tooltip */}
                      <div
                        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 transform rounded px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/shield:opacity-100"
                        style={{
                          backgroundColor: AX.surface,
                          color: AX.text,
                          border: `1px solid ${AX.border}`,
                          boxShadow:
                            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                        }}
                      >
                        audit
                        {/* Tooltip arrow */}
                        <div
                          className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-4 border-r-4 border-l-4 border-transparent"
                          style={{ borderTopColor: AX.surface }}
                        ></div>
                      </div>
                    </div>
                  </button>
                )}

                {/* Clipboard token button - medium/tablet - compact version */}
                {clipboardToken && clipboardToken.imageUrl && (
                  <button
                    onClick={handlePasteCA}
                    className="relative hidden h-8 items-center gap-1.5 rounded-md border pr-2 pl-1.5 transition-all duration-300 ease-out lg:flex xl:hidden"
                    style={{
                      backgroundColor: AX.surface,
                      borderColor: AX.border,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "rgba(24, 196, 140, 0.08)";
                      e.currentTarget.style.borderColor = "#18c48c";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = AX.surface;
                      e.currentTarget.style.borderColor = AX.border;
                    }}
                  >
                    <img
                      src={clipboardToken.imageUrl}
                      alt="Token"
                      className="h-6 w-6 flex-shrink-0 rounded-md object-cover"
                      onError={() => setClipboardToken(null)}
                    />
                    <span className="max-w-[60px] truncate text-[11px] font-medium text-white">
                      {clipboardToken.name}
                    </span>
                    <IoShieldCheckmarkOutline
                      size={12}
                      style={{
                        color: clipboardToken.isPumpToken
                          ? "#31e3ac"
                          : "#eab308",
                      }}
                    />
                  </button>
                )}

                {/* Clipboard token button - mobile */}
                {clipboardToken && clipboardToken.imageUrl && (
                  <button
                    onClick={handlePasteCA}
                    className="relative flex h-8 flex-shrink-0 items-center gap-1.5 rounded-md border pr-2 pl-1.5 transition-all duration-300 ease-out lg:hidden"
                    style={{
                      backgroundColor: AX.surface,
                      borderColor: AX.border,
                    }}
                  >
                    <img
                      src={clipboardToken.imageUrl}
                      alt="Token"
                      className="h-6 w-6 flex-shrink-0 rounded-md object-cover"
                      onError={() => setClipboardToken(null)}
                    />
                    <span className="max-w-[50px] truncate text-[11px] font-medium text-white">
                      {clipboardToken.name}
                    </span>
                    <IoShieldCheckmarkOutline
                      size={11}
                      style={{
                        color: clipboardToken.isPumpToken
                          ? "#31e3ac"
                          : "#eab308",
                      }}
                    />
                  </button>
                )}

                {/* Blockchain Switcher - Right of search bar */}
                <BlockchainSwitcher />
              </div>
            )}

            <button
              onClick={() => setWatchlistOpen(true)}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-all duration-300 ease-out"
              style={{
                color: AX.muted,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = AX.mint;
                e.currentTarget.style.boxShadow = "none";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = AX.muted;
                e.currentTarget.style.boxShadow = "none";
              }}
              title="Watchlist"
            >
              <CiStar size={24} />
            </button>

            {/* Notifications Button */}
            <div ref={notificationsRef} className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-all duration-300 ease-out"
                style={{
                  color: AX.muted,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = AX.mint;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                }}
                title="Notifications"
              >
                <CiBellOn size={24} />
              </button>

              {/* Notifications Panel */}
              {notificationsOpen && (
                <div
                  className="fixed top-16 right-4 z-50 rounded-xl border shadow-2xl"
                  style={{
                    backgroundColor: "#1a1b20",
                    borderColor: "#2A2B33",
                    width: "280px",
                    minWidth: "280px",
                    maxWidth: "280px",
                    maxHeight: "70vh",
                  }}
                >
                  {/* Header */}
                  <div
                    className="flex items-center justify-between border-b p-4"
                    style={{ borderColor: "#2A2B33" }}
                  >
                    <h3 className="text-sm font-semibold text-[#f0f5f5]">
                      Notifications
                    </h3>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          // Clear all notifications logic here
                          toast.success("All notifications cleared");
                        }}
                        className="text-sm text-neutral-400 transition-colors hover:text-[#f0f5f5]"
                      >
                        Clear All
                      </button>
                      <button
                        onClick={() => setNotificationsOpen(false)}
                        className="text-neutral-400 transition-colors hover:text-white"
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div
                    className="flex flex-col items-center justify-center p-8"
                    style={{ minHeight: "300px" }}
                  >
                    <div className="mb-4 opacity-50">
                      <svg
                        width="80"
                        height="80"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                    </div>
                    <p className="text-base text-neutral-400">No Data</p>
                  </div>
                </div>
              )}
            </div>

            {/* User profile/login - visible on all screens */}
            {user && !userLoading ? (
              <div ref={profileMenuRef} className="relative">
                {/* Combined Balance + Username Button */}
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="group/account flex h-10 cursor-pointer flex-row items-center justify-center rounded-3xl border transition-all duration-300 ease-out lg:gap-2 px-1"
                  style={{
                    borderColor: AX.border,
                    color: AX.text,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = AX.mint;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = AX.border;
                  }}
                  title="Click to view account & wallet"
                >
                  <div
                    className="hidden h-8 w-8 items-center justify-center rounded-[125px] bg-emerald-400 text-black text-xs font-bold select-none sm:flex"
                  >
                    {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                  </div>
                    <div className="flex flex-col text-left items-left gap-0">
                    <div className="text-sm text-white">
                      {formatBalance(chainBalance)} {chainSymbols[currentChain] ?? "SOL"}
                    </div> 
                    <div className="text-xs text-neutral-500">
                      {user.name ? user.name : user.publicKey.slice(0,4).concat(user.name.slice(-4))}
                    </div>
                  </div>
                  <FiChevronDown className="text-neutral-500 hover:text-neutral-200" size={16} />
                </button>
                {/* Combined Dropdown */}
                {profileMenuOpen && (
                  <div
                    className="absolute top-10 right-0 z-50 rounded-xl border shadow-2xl"
                    style={{
                      backgroundColor: "#0a0b10",
                      borderColor: "#20232b",
                      width: "280px",
                      minWidth: "280px",
                      maxWidth: "280px",
                    }}
                  >
                    <div className="p-4">
                      {/* User Info Header */}
                      <div
                        className="mb-3 flex items-center gap-2 border-b pb-3"
                        style={{ borderColor: "#20232b" }}
                      >
                        <div
                          className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold text-[#f0f5f5] select-none"
                          style={{ backgroundColor: AX.mint }}
                        >
                          {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-[#f0f5f5]">
                            {user.name}
                          </div>
                          <div className="text-xs text-neutral-400">
                            Account
                          </div>
                        </div>
                      </div>

                      {/* Total Value */}
                      <div className="mb-3">
                      <div className="mb-1 text-xs text-neutral-400">
                          Total Value
                        </div>
                        <div className="text-2xl font-bold text-white">
                          ${formatCurrency(chainBalance * chainPrice)}
                        </div>
                      </div>

                      {/* Balance Display */}
                      <div
                        className="mb-4 flex items-center justify-between rounded-lg p-2"
                        style={{ backgroundColor: "#17191e" }}
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={chainLogos[currentChain] ?? chainLogos.sol}
                            alt={chainSymbols[currentChain] ?? "SOL"}
                            className={currentChain === 'monad' ? "w-8 h-10 rounded-md object-contain" : "h-4 w-4 rounded-md object-contain"}
                            style={currentChain === 'monad' ? { minWidth: '32px', minHeight: '40px' } : { minWidth: '16px', minHeight: '16px' }}
                          />
                          <span className="text-sm text-[#f0f5f5]">
                            ≈ {formatBalance(chainBalance)} {chainSymbols[currentChain] ?? "SOL"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg
                            className="h-4 w-4 text-neutral-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                            />
                          </svg>
                          <img
                            src={chainLogos[currentChain] ?? chainLogos.sol}
                            alt={chainSymbols[currentChain] ?? "SOL"}
                            className={currentChain === 'monad' ? "w-8 h-10 rounded-md object-contain" : "h-4 w-4 rounded-md object-contain"}
                            style={currentChain === 'monad' ? { minWidth: '32px', minHeight: '40px' } : { minWidth: '16px', minHeight: '16px' }}
                          />
                          <span className="text-sm text-[#f0f5f5]">
                            {formatMultiDigitBalance(chainBalance)}
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="space-y-2">
                        {/* Deposit/Withdraw Buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setProfileMenuOpen(false);
                              handleDepositClick();
                            }}
                            className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200"
                            style={{
                              backgroundColor: AX.mint,
                              color: "#000000",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor =
                                AX.mintHover;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = AX.mint;
                            }}
                          >
                            Deposit
                          </button>
                          <button
                            onClick={() => {
                              setProfileMenuOpen(false);
                              handleWithdrawClick();
                            }}
                            className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200"
                            style={{
                              backgroundColor: "#0f1012",
                              color: "#ffffff",
                              border: "1px solid #2A2B33",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#1A1B1F";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "#0f1012";
                            }}
                          >
                            Withdraw
                          </button>
                        </div>

                        {/* Convert/Buy Buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setProfileMenuOpen(false);
                              handleConvertClick();
                            }}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200"
                            style={{
                              backgroundColor: "#0f1012",
                              color: "#ffffff",
                              border: "1px solid #2A2B33",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#1A1B1F";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "#0f1012";
                            }}
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                              />
                            </svg>
                            Convert
                          </button>
                          <button
                            onClick={() => {
                              setProfileMenuOpen(false);
                              handleBuyClick();
                            }}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200"
                            style={{
                              backgroundColor: "#0f1012",
                              color: "#ffffff",
                              border: "1px solid #2A2B33",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#1A1B1F";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "#0f1012";
                            }}
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                              />
                            </svg>
                            Buy
                          </button>
                        </div>

                        {/* Referral Button */}
                        <button
                          onClick={() => {
                            setProfileMenuOpen(false);
                            router.push("/rewards");
                          }}
                          className="mt-2 flex w-full items-center gap-2 rounded-lg border-t px-3 py-2 pt-3 text-sm font-medium transition-all duration-200"
                          style={{
                            backgroundColor: "transparent",
                            color: AX.text,
                            borderColor: "#20232b",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "rgba(24, 196, 140, 0.1)";
                            e.currentTarget.style.color = AX.mint;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "transparent";
                            e.currentTarget.style.color = AX.text;
                          }}
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                          </svg>
                          Referral
                        </button>

                        {/* Feature Updates Button */}
                        <button
                          onClick={() => {
                            setProfileMenuOpen(false);
                            setIsFirstLogin(false);
                            setShowUpdatesModal(true);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200"
                          style={{
                            backgroundColor: "transparent",
                            color: AX.text,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "rgba(24, 196, 140, 0.1)";
                            e.currentTarget.style.color = AX.mint;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "transparent";
                            e.currentTarget.style.color = AX.text;
                          }}
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                          Feature Updates
                        </button>

                        {/* Logout Button */}
                        <button
                          onClick={() => {
                            setProfileMenuOpen(false);
                            logout();
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200"
                          style={{
                            backgroundColor: "transparent",
                            color: "#ef4444",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "rgba(239, 68, 68, 0.1)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "transparent";
                          }}
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                            />
                          </svg>
                          Logout
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              !userLoading && (
                <button
                  className="ml-0.5 flex-shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium transition-all duration-300 ease-out sm:ml-1 md:ml-1.5 md:px-3 lg:ml-2"
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
        {headerBarVisible && (
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
                    "rgba(49, 227, 172, 0.08)";
                  e.currentTarget.style.color = "#31e3ac";
                  e.currentTarget.style.boxShadow =
                    "0 0 6px rgba(49, 227, 172, 0.25), 0 0 12px rgba(49, 227, 172, 0.12)";
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
                className="pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 transform rounded px-2 py-1 text-sm font-medium whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100"
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
                  className="absolute top-1/2 right-full h-0 w-0 -translate-y-1/2 transform border-t-4 border-r-4 border-b-4 border-transparent"
                  style={{ borderRightColor: AX.surface }}
                ></div>
              </div>
            </div>

            {/* Watchlist Icon */}
            <div className="group relative">
              <button
                className="relative cursor-pointer rounded p-0.5 transition-all duration-300 ease-out"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(24, 196, 140, 0.08)";
                  e.currentTarget.style.color = AX.mint;
                  e.currentTarget.style.boxShadow =
                    "0 0 6px rgba(24, 196, 140, 0.25), 0 0 12px rgba(24, 196, 140, 0.12)";
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
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
              {/* Custom tooltip for Watchlist */}
              <div
                className="pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 transform rounded px-2 py-1 text-sm font-medium whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                style={{
                  backgroundColor: AX.surface,
                  color: AX.text,
                  border: `1px solid ${AX.border}`,
                  boxShadow:
                    "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                }}
              >
                Watchlist
                {/* Tooltip arrow pointing left */}
                <div
                  className="absolute top-1/2 right-full h-0 w-0 -translate-y-1/2 transform border-t-4 border-r-4 border-b-4 border-transparent"
                  style={{ borderRightColor: AX.surface }}
                ></div>
              </div>
            </div>

            <div className="h-4 border-r" style={{ borderColor: AX.border }}>
              {" "}
            </div>
          </div>
        )}
      </header>
      <DepositModal
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        initialTab={depositInitialTab}
        selectedChain={currentChain}
      />
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
          if (setSearch) {
            setSearch(trimmed);
            if (router.pathname.startsWith("/trade/")) {
              router.push({ pathname: "/", query: trimmed ? { search: trimmed } : {} });
              return;
            }

            const nextQuery = { ...router.query };
            if (trimmed) {
              nextQuery.search = trimmed;
            } else {
              delete nextQuery.search;
            }
            router.replace(
              { pathname: router.pathname, query: nextQuery },
              undefined,
              { shallow: true },
            );
            return;
          }

          if (
            router.pathname !== "/" &&
            !router.pathname.startsWith("/trade/")
          ) {
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
            if (setSearch) {
              setSearch(trimmed);
              if (!router.pathname.startsWith("/trade/")) {
                const { search: _qSearch, ...restQuery } = router.query;
                router.replace(
                  { pathname: router.pathname, query: restQuery },
                  undefined,
                  { shallow: true },
                );
              }
            } else if (
              router.pathname === "/" &&
              Object.keys(router.query).includes("search")
            ) {
              router.replace({ pathname: "/" }, undefined, { shallow: true });
            }
            return;
          }

          // Live updates for longer queries - only redirect to home if not on a trade page
          if (setSearch) {
            setSearch(trimmed);
            if (router.pathname.startsWith("/trade/")) {
              router.push(
                { pathname: "/", query: { search: trimmed } },
                undefined,
                { shallow: true },
              );
            } else {
              const nextQuery = { ...router.query, search: trimmed };
              router.replace(
                { pathname: router.pathname, query: nextQuery },
                undefined,
                { shallow: true },
              );
            }
            return;
          }

          if (
            router.pathname !== "/" &&
            !router.pathname.startsWith("/trade/")
          ) {
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
        }}
      />
      {/* Updates Modal */}
      {showUpdatesModal && (
        <UpdatesModal
          onClose={() => {
            setShowUpdatesModal(false);
            setIsFirstLogin(false);
          }}
          updates={PLATFORM_UPDATES}
          storageKey={isFirstLogin ? "" : "header-updates-viewed"}
        />
      )}
    </>
  );
}
