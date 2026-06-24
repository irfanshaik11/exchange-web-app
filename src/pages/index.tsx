import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  FaGlobe,
  FaUser,
  FaSearch,
  FaCheckCircle,
  FaQuestionCircle,
  FaPowerOff,
  FaTimes,
  FaCopy,
  FaCog,
  FaFilter,
} from "react-icons/fa";
import Image from "next/image";
import { useUser } from "../components/UserContext";
import Cookies from "js-cookie";
import QRCode from "qrcode";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { DockedPanelMarginWrapper } from "../contexts/DockedPanelContext";
import type { Token } from "~/utils/db";
import InterstateButton from "../components/InterstateButton";
import InterstateTable from "../components/InterstateTable";
import toast from "react-hot-toast";
import { formatSmartNumber } from "~/utils/db";
import { useQuickBuy } from "~/components/QuickBuyContext";
import QuickBuySettingsModal from "../components/QuickBuySettingsModal";
import { FilterProvider, useFilter } from "../components/FilterContext";
import InterstatePopout from "../components/InterstatePopout";
import FilterPopout from "../components/FilterPopout";
import throttle from "lodash.throttle";
import usePaginatedTokensWithFallback from "../hooks/usePaginatedTokensWithFallback";
import { executeEnhancedTrade } from "~/utils/enhancedTradeHandler";
import {
  validateSolanaBuy,
  showTradeValidationError,
} from "~/utils/preTradeValidation";
import { checkAtaExists } from "~/utils/ataCheck";
import { buildSolanaWalletAllocations } from "~/utils/solanaWalletAllocation";
import { quoteAwareBuyGate } from "~/utils/quoteBuyGate";
import { getResolvedTokenImage } from "~/utils/images";
import { env } from "../env";

const navLinks = [
  { name: "Discover", href: "/discover" },
  { name: "Pulse", href: "/" },
  { name: "Trackers", href: "#" },
  { name: "Perpetuals", href: "#" },
  { name: "Yield", href: "#" },
  { name: "Portfolio", href: "#" },
  { name: "Rewards", href: "#" },
];

function shuffleArray<T extends NonNullable<unknown>>(array: T[]): T[] {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    //@ts-ignore
    arr[i] = arr[j];
    //@ts-ignore
    arr[j] = temp;
  }
  return arr;
}

// Add this type extension after importing Token
type TokenWithDexPaid = Token & { dexPaid?: boolean };

export type Timeframe = "1m" | "5m" | "30m" | "1h";

const isDev = process.env.NODE_ENV !== "production";

export default function Home() {
  const router = useRouter();

  const {
    user,
    loading: userLoading,
    refreshUser,
    refreshBalance,
    walletList,
    walletBalances,
    selectedWalletIds,
    quoteCurrency,
    walletUsdcBalances,
    solBalance,
    usdcSplBalance,
    tokenBalances,
  } = useUser();

  // Redirect based on auth state: logged in → /pulse, not logged in → /landing
  useEffect(() => {
    if (!router.isReady || userLoading) return;
    if (router.pathname !== "/" || router.query.search || router.query.chain)
      return;

    if (user) {
      // Logged in: go to trenches/pulse
      const savedChain =
        typeof window !== "undefined"
          ? localStorage.getItem("selected-chain")
          : null;
      const chainToUse =
        savedChain === "sol" || savedChain === "monad" ? savedChain : "sol";
      router.replace(`/pulse?chain=${chainToUse}`, undefined, {
        shallow: false,
      });
    } else {
      // Not logged in: go to landing page
      router.replace("/landing", undefined, { shallow: false });
    }
  }, [
    router.isReady,
    router.pathname,
    router.query.search,
    router.query.chain,
    router,
    user,
    userLoading,
  ]);

  const [search, setSearch] = useState("");
  // Populate search state if we arrived with ?search= in the URL
  useEffect(() => {
    if (router.query.search && typeof router.query.search === "string") {
      setSearch(router.query.search as string);
    }
  }, [router.query.search]);
  const tokenMapRef = useRef<Map<string, TokenWithDexPaid>>(new Map());
  const [filteredTokens, setFilteredTokens] = useState<TokenWithDexPaid[]>([]);
  const [displayed, setDisplayed] = useState<TokenWithDexPaid[]>([]);
  const isDiscover = router.pathname === "/";
  const timeframes = ["1m", "5m", "30m", "1h"] as Timeframe[];
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("1h");

  const [selectedTab, setSelectedTab] = useState<"dex" | "trending">(
    "trending",
  );
  const [sortKey, setSortKey] = useState<
    "market_cap_total" | "liquidity" | "volume" | "txns" | "name"
  >("volume");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [quickBuyAmount, setQuickBuyAmount] = useState(0);
  const {
    quickBuySettings,
    presets,
    setPresets,
    activePreset,
    setActivePreset,
  } = useQuickBuy();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFilterPopoutOpen, setIsFilterPopoutOpen] = useState(false);
  const { filter, setFilter, resetFilter } = useFilter();
  const [showSkeleton, setShowSkeleton] = useState(true);

  // Don't make API calls if we're on a different page
  const shouldMakeCalls = router.pathname === "/";

  // Get current chain from query parameter, default to 'sol'
  const currentChain = (router.query.chain as string) || "sol";

  const {
    data: allTokens,
    loading: tokensLoading,
    isConnected,
    error: tokenError,
    isReconnecting,
    usingFallback,
  } = usePaginatedTokensWithFallback({
    filter: selectedTab === "dex" ? "new" : "trending",
    timeframe: selectedTimeframe,
    chain: currentChain, // Pass chain parameter
    // Disable the hook when not on home page
    limit: shouldMakeCalls ? 20 : 0,
  });

  // Efficiently update tokenMapRef and trigger re-renders only for changed tokens
  useEffect(() => {
    if (Array.isArray(allTokens)) {
      let changed = false;
      const map = tokenMapRef.current;
      for (let i = 0; i < allTokens.length; i++) {
        const token = allTokens[i] as TokenWithDexPaid;
        const prev = map.get(token.pair_address);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(token)) {
          map.set(token.pair_address, token);
          changed = true;
        }
      }
      // Optionally, remove tokens that are no longer present, but only when incoming list is reasonably sized
      const allAddresses = new Set(
        (allTokens as TokenWithDexPaid[]).map((t) => t.pair_address),
      );
      const incomingLen = allTokens.length;
      const minCount = Math.max(
        8,
        Math.floor(Math.min(map.size || 20, 20) * 0.6),
      );
      if (incomingLen >= minCount) {
        for (const addr of Array.from(map.keys())) {
          if (!allAddresses.has(addr)) {
            map.delete(addr);
            changed = true;
          }
        }
      }
      if (changed) {
        // Create a stable array for downstream use
        const arr = Array.from(map.values());
        setFilteredTokens(arr);
      }
    }
  }, [allTokens]);

  // Helper for min/max input change
  const handleMinMaxChange = (
    key: keyof typeof filter,
    value: string | number,
  ) => {
    setFilter({ ...filter, [key]: value });
  };

  // Filter tokens when search changes
  // Fetch from backend /search endpoint when the search term changes
  /*   useEffect(() => {
    const trimmed = search.trim();

    // 1. Empty term ⇒ show everything we already have in memory
    if (!trimmed) {
      const arr = Array.from(tokenMapRef.current.values());
      setFilteredTokens(arr);
      setDisplayed(arr.slice(0, 10));
      return;
    }

    // 2. Decide if we search by name/symbol (<10 chars) or by address
    const isAddress = trimmed.length >= 10;
    const param = isAddress ? "tokenaddress" : "name";

    // In local dev, use Next.js API proxy to avoid CORS; in prod, hit service directly
    const isLocalhost = typeof window !== "undefined" && window.location.hostname === "localhost";
    const baseURL = env.NEXT_PUBLIC_WEBSOCKET_URL;

    if (!baseURL) {
      console.error("Token service URL missing – check env variables.");
      return;
    }

    const url = `${baseURL}/search?${param}=${encodeURIComponent(trimmed)}`;

    const controller = new AbortController();

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const list: TokenWithDexPaid[] = Array.isArray(data?.result)
          ? data.result
          : Array.isArray(data)
          ? data
          : [];
        setFilteredTokens(list);
        setDisplayed(list.slice(0, 10));
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error(err);
        }
      });

    return () => controller.abort();
  }, [search]); */

  const handleTimeframeClick = (tf: string) => {
    setSelectedTimeframe(tf as Timeframe);
    setSortKey("volume");
    setSortDirection("desc");
  };

  // QUICK BUY handler
  async function handleQuickBuy(token: Token) {
    if (!user?.bearerToken || !user?.id) {
      return;
    }

    if (!quickBuyAmount || quickBuyAmount <= 0) {
      toast.error("Set a buy amount first (use the preset buttons)", {
        duration: 3000,
        style: {
          background: "#1E1F26",
          color: "#E6E7EA",
          border: "1px solid #ff6b6b",
        },
      });
      return;
    }

    const settings = presets[activePreset].quickBuySettings;

    // Pre-validate via the shared currency-aware gate (SOL or USDC).
    const ataExists = await checkAtaExists(token.mint, user?.publicKey).catch(
      () => null,
    );
    const gate = quoteAwareBuyGate({
      amount: quickBuyAmount,
      quoteCurrency,
      walletList: walletList || [],
      walletBalances: walletBalances || {},
      walletUsdcBalances,
      usdcSplBalance,
      tokenBalancesUsdcSol: (tokenBalances as any)?.USDC?.solana,
      primaryAddress: (walletList || []).find((w: any) => w.isPrimary)
        ?.solanaAddress,
      selectedWalletIds: selectedWalletIds?.sol || [],
      priorityFee: settings.priority,
      bribe: settings.bribe,
      ataExists,
      solBalance,
    });
    if (!gate.valid) {
      showTradeValidationError(
        gate.error,
        getResolvedTokenImage(token),
        token.symbol || token.name || "Token",
      );
      return;
    }

    // Use enhanced trade handler for consistent behavior with rest of application
    await executeEnhancedTrade({
      token,
      amount: quickBuyAmount,
      side: "buy",
      settings,
      user: { bearerToken: user.bearerToken, id: user.id },
      solBalance: 0, // Will be fetched by executeEnhancedTrade
      solPriceUsd: 150,
      quoteCurrency,
      walletContext: {
        selectedWalletIds: selectedWalletIds?.sol || [],
        walletList: walletList || [],
        walletBalances: walletBalances || {},
        walletUsdcBalances,
        chain: currentChain === "monad" ? "monad" : "sol",
      },
      refreshBalance,
      onSuccess: (txHash, stats) => {
        isDev && console.log("Home Quick Buy successful:", { txHash, stats });
      },
      onError: (error) => {
        console.error("❌ Home Quick Buy failed:", error);
      },
    });
  }

  // Helper to compute volume by timeframe for sorting in trending view
  const getVolumeForTimeframe = useCallback((t: any, tf: Timeframe) => {
    const v = t?.[`volume_${tf}`];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = parseFloat(v);
      return isNaN(n) ? 0 : n;
    }
    // simple fallbacks
    return 0;
  }, []);

  useEffect(() => {
    if (selectedTab === "trending") {
      setSortKey("volume");
      setSortDirection("desc");
    }
  }, [selectedTab]);

  useEffect(() => {
    if (selectedTab === "trending") {
      const arr = Array.from(tokenMapRef.current.values());
      const sortedTokens = [...arr];
      sortedTokens.sort((a, b) => {
        let aVal = 0,
          bVal = 0;
        if (sortKey === "volume") {
          aVal = getVolumeForTimeframe(a, selectedTimeframe);
          bVal = getVolumeForTimeframe(b, selectedTimeframe);
        } else if (sortKey === "liquidity") {
          aVal = Number(a.total_liquidity_usd) || 0;
          bVal = Number(b.total_liquidity_usd) || 0;
        } else if (sortKey === "market_cap_total") {
          aVal = Number(a.fully_diluted_value) || 0;
          bVal = Number(b.fully_diluted_value) || 0;
        } else {
          aVal = Number((a as any)[sortKey]) || 0;
          bVal = Number((b as any)[sortKey]) || 0;
        }
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      });
      setDisplayed(sortedTokens);
    } else {
      setDisplayed(filteredTokens.slice(0, 10));
    }
  }, [
    selectedTab,
    filteredTokens,
    sortKey,
    sortDirection,
    selectedTimeframe,
    getVolumeForTimeframe,
  ]);

  // Sorting handler for table headers
  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  // When activePreset changes, update quickBuySettings to match preset
  useEffect(() => {
    if (presets && presets[activePreset]) {
      // Optionally, update quickBuySettings globally if needed
      // setQuickBuySettings(presets[activePreset].quickBuySettings);
    }
  }, [activePreset, presets]);

  useEffect(() => {
    setShowSkeleton(true);
    const timer = setTimeout(() => setShowSkeleton(false), 800);
    return () => clearTimeout(timer);
  }, [selectedTab]);

  // Hide skeleton when we have data or when loading is complete
  useEffect(() => {
    if (
      (allTokens && Array.isArray(allTokens) && allTokens.length > 0) ||
      tokensLoading === false
    ) {
      setShowSkeleton(false);
    }
  }, [allTokens, tokensLoading]);

  return (
    <>
      <Head>
        <title>Interstate Memeboard | Discover</title>
        <meta name="description" content="Interstate dashboard" />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/interstate/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/interstate/favicon-16x16.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png?v=2"
        />
      </Head>
      <div className="min-h-screen bg-[#030304] text-zinc-100">
        {/* Header */}
        <Header
          search={search}
          setSearch={setSearch}
          selectedTimeframe={selectedTimeframe}
        />
        <DockedPanelMarginWrapper>
          {/* Tab Navigation */}
          <div className="mx-auto my-4 flex flex-row items-center justify-between gap-6 px-20">
            <div className="flex max-w-7xl items-center gap-6">
              <button
                className={`text-lg font-semibold transition-colors ${selectedTab === "dex" ? "text-white" : "text-neutral-400"} cursor-pointer`}
                onClick={() => setSelectedTab("dex")}
              >
                DEX Screener
              </button>
              <button
                className={`text-lg font-semibold transition-colors ${selectedTab === "trending" ? "text-white" : "text-neutral-400"} cursor-pointer`}
                onClick={() => setSelectedTab("trending")}
              >
                Trending
              </button>
            </div>
            {/* Quick Buy pill UI */}
            <div className="flex flex-row items-center gap-4">
              {/* Connection Status */}
              <div className="flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-400" : usingFallback ? "bg-yellow-400" : "bg-red-400"}`}
                ></div>
                <span className="text-xs text-neutral-400">
                  {isConnected
                    ? "Live"
                    : usingFallback
                      ? "Polling"
                      : "Disconnected"}
                </span>
              </div>
              {/* Timeframes Row (for both tabs) */}
              <div className="flex max-w-7xl items-center gap-4 text-sm font-medium">
                {timeframes.map((tf: Timeframe) => (
                  <button
                    key={tf}
                    className={
                      (selectedTimeframe === tf
                        ? "text-emerald-400 "
                        : "text-neutral-400 ") +
                      "cursor-pointer transition-colors"
                    }
                    onClick={() => handleTimeframeClick(tf)}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              {/* Settings*/}
              <button
                className="group cursor-pointer text-neutral-400 transition-colors hover:text-white"
                onClick={() => setSettingsOpen(true)}
              >
                <FaCog className="transition-transform duration-300 group-hover:rotate-90" />
              </button>
              <button
                className="group relative mr-2 flex cursor-pointer flex-row items-center rounded-full border border-neutral-800 bg-neutral-900 px-4 py-1.5 shadow-inner"
                onClick={() => setIsFilterPopoutOpen(true)}
              >
                <FaFilter className="mr-2 text-lg text-white" />
                <span className="text-base font-semibold text-white">
                  Filters
                </span>
                <svg
                  className="ml-2 h-4 w-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
                <span className="absolute top-1 left-3 h-2 w-2 rounded-full bg-blue-400"></span>
              </button>
              <div className="flex flex-row items-center rounded-full border border-neutral-800 px-4 py-1.5 shadow-inner">
                <span className="mr-2 text-sm text-neutral-400">Quick Buy</span>
                <input
                  value={quickBuyAmount}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Only allow numbers and decimal point
                    if (value === "" || /^\d*\.?\d*$/.test(value)) {
                      setQuickBuyAmount(Number(value) || 0);
                    }
                  }}
                  onKeyDown={(e) => {
                    // Prevent non-numeric characters except decimal point
                    if (
                      !/[0-9.]/.test(e.key) &&
                      ![
                        "Backspace",
                        "Delete",
                        "ArrowLeft",
                        "ArrowRight",
                        "Tab",
                      ].includes(e.key)
                    ) {
                      e.preventDefault();
                    }
                  }}
                  className="w-12 text-sm text-neutral-200 outline-none focus:outline-none"
                />
                <img
                  src="https://axiom.trade/images/sol-fill.svg"
                  alt="Solana"
                  className="mr-4 h-5 w-5"
                />
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    className={`mr-2 cursor-pointer font-semibold ${activePreset === i ? "text-emerald-300" : "text-neutral-400"}`}
                    onClick={() => setActivePreset(i)}
                  >
                    {`P${i + 1}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Filter Popout */}
          <FilterPopout
            open={isFilterPopoutOpen}
            onClose={() => setIsFilterPopoutOpen(false)}
          />

          {/* Main Content */}
          <main className="mx-auto px-20 pb-10">
            {showSkeleton || tokensLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 w-full animate-pulse rounded bg-neutral-800"
                  />
                ))}
              </div>
            ) : tokenError ? (
              <div className="py-10 text-center text-red-400">{tokenError}</div>
            ) : displayed.length === 0 ? (
              <div className="py-10 text-center text-neutral-400">
                No tokens found.
              </div>
            ) : (
              <InterstateTable
                rows={displayed.map((token, i) => {
                  return { token, i };
                })}
                onQuickBuy={handleQuickBuy}
                sortKey={sortKey}
                sortDirection={sortDirection}
                setSort={handleSort}
                selectedTimeframe={selectedTimeframe}
                quickBuyAmount={quickBuyAmount}
              />
            )}
          </main>
        </DockedPanelMarginWrapper>
        <Footer />
        <QuickBuySettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      </div>
    </>
  );
}
