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
import type { Token } from "~/utils/db";
import InterstateButton from "../components/InterstateButton";
import InterstateTable from "../components/InterstateTable";
import toast from "react-hot-toast";
import { formatSmartNumber } from "~/utils/db";
import { useQuickBuy } from "~/components/QuickBuyContext";
import QuickBuySettingsModal from '../components/QuickBuySettingsModal';
import { FilterProvider, useFilter } from '../components/FilterContext';
import InterstatePopout from '../components/InterstatePopout';
import FilterPopout from '../components/FilterPopout';
import throttle from 'lodash.throttle';
import usePaginatedTokensWithFallback from '../hooks/usePaginatedTokensWithFallback';
import { tradeBuy, SOL_MINT_ADDRESS, ApiError } from "../utils/api";
import { env } from "../env";
import { getPoolTypeFromToken } from "../utils/poolTypeDetection";

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

export default function Home() {
  const router = useRouter();

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
  const [selectedTimeframe, setSelectedTimeframe] =
    useState<Timeframe>("1h");
  const { user, loading: userLoading, refreshUser } = useUser();
  const [selectedTab, setSelectedTab] = useState<"dex" | "trending">("trending");
  const [sortKey, setSortKey] = useState<"market_cap_total" | "liquidity" | "volume" | "txns" | "name">("volume");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [quickBuyAmount, setQuickBuyAmount] = useState(0.05);
  const { quickBuySettings, presets, setPresets, activePreset, setActivePreset } = useQuickBuy();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFilterPopoutOpen, setIsFilterPopoutOpen] = useState(false);
  const { filter, setFilter, resetFilter } = useFilter();
  const [showSkeleton, setShowSkeleton] = useState(true);

  // WebSocket token service
  console.log('🔧 About to call usePaginatedTokensWithFallback with:', { 
    filter: selectedTab === 'dex' ? 'new' : 'trending', 
    timeframe: selectedTimeframe 
  });
  console.log('🔧 selectedTimeframe value:', selectedTimeframe, 'type:', typeof selectedTimeframe);
  const {
    data: allTokens,
    loading: tokensLoading,
    isConnected,
    error: tokenError,
    isReconnecting,
    usingFallback,
  } = usePaginatedTokensWithFallback({
    filter: selectedTab === 'dex' ? 'new' : 'trending',
    timeframe: selectedTimeframe
  });  // Efficiently update tokenMapRef and trigger re-renders only for changed tokens
  useEffect(() => {
    console.log('🔧 allTokens changed:', { allTokens, isArray: Array.isArray(allTokens), length: Array.isArray(allTokens) ? allTokens.length : 'not array' });
    if (Array.isArray(allTokens)) {
      // Check for duplicates
      const uniqueTokens = new Map();
      allTokens.forEach((token, index) => {
        if (uniqueTokens.has(token.pair_address)) {
          console.log('🔧 DUPLICATE FOUND:', { 
            index, 
            pair_address: token.pair_address, 
            name: token.name,
            firstOccurrence: uniqueTokens.get(token.pair_address)
          });
        } else {
          uniqueTokens.set(token.pair_address, { index, name: token.name });
        }
      });
      console.log('🔧 Unique tokens count:', uniqueTokens.size, 'out of', allTokens.length);
      let changed = false;
      const map = tokenMapRef.current;
      console.log('🔧 Processing tokens:', allTokens.length, 'tokens');
      console.log('🔧 All tokens raw data:', allTokens.map((t, i) => ({ 
        index: i,
        name: t.name, 
        symbol: t.symbol, 
        pair_address: t.pair_address 
      })));
      for (let i = 0; i < allTokens.length; i++) {
        const token = allTokens[i] as TokenWithDexPaid;
        console.log(`🔧 Processing token ${i + 1}/${allTokens.length}:`, { 
          name: token.name, 
          symbol: token.symbol, 
          pair_address: token.pair_address,
          hasName: 'name' in token,
          hasSymbol: 'symbol' in token,
          hasPairAddress: 'pair_address' in token,
          keys: Object.keys(token)
        });
        const prev = map.get(token.pair_address);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(token)) {
          map.set(token.pair_address, token);
          changed = true;
          console.log('🔧 Added/updated token:', token.name);
        } else {
          console.log('🔧 Skipped token (no changes):', token.name);
        }
      }
      // Optionally, remove tokens that are no longer present, but only when incoming list is reasonably sized
      const allAddresses = new Set((allTokens as TokenWithDexPaid[]).map(t => t.pair_address));
      const incomingLen = allTokens.length;
      const minCount = Math.max(8, Math.floor(Math.min(map.size || 20, 20) * 0.6));
      if (incomingLen >= minCount) {
        for (const addr of Array.from(map.keys())) {
          if (!allAddresses.has(addr)) {
            map.delete(addr);
            changed = true;
          }
        }
      } else {
        console.log('🛡️ Skipping deletions to keep table stable (incoming too small):', { incomingLen, minCount, currentSize: map.size });
      }
      if (changed) {
        // Create a stable array for downstream use
        const arr = Array.from(map.values());
        console.log('🔧 Setting filteredTokens:', arr.length, 'tokens');
        console.log('🔧 FilteredTokens data:', arr.map(t => ({ 
          name: t.name, 
          symbol: t.symbol, 
          pair_address: t.pair_address 
        })));
        setFilteredTokens(arr);
      }
    }
  }, [allTokens]);

  // Helper for min/max input change
  const handleMinMaxChange = (key: keyof typeof filter, value: string | number) => {
    setFilter({ ...filter, [key]: value });
  };

  useEffect(() => {
    console.log(sortKey);
  }, [sortKey]);

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
    console.log('🔧 Timeframe clicked:', tf);
    console.log('🔧 Current selectedTimeframe before change:', selectedTimeframe);
    setSelectedTimeframe(tf as Timeframe);
    setSortKey("volume");
    setSortDirection("desc");
    console.log('🔧 selectedTimeframe state updated to:', tf);
    console.log('🔧 State update scheduled, hook should re-run soon');
    // Let the hook handle data fetching and sorting
  };

  // QUICK BUY handler
  async function handleQuickBuy(token: Token) {
    if (!user) {
      return;
    }
    try {
      const poolType = getPoolTypeFromToken(token);
      console.log(`🔍 Trading ${token.symbol} - Protocol: ${token.launchpad_protocol || token.protocol || 'unknown'} → PoolType: ${poolType}`);
      
      const data = await tradeBuy({
        poolAddress: token.pair_address,
        baseMint: token.mint, // Use token.mint as baseMint
        quoteMint: SOL_MINT_ADDRESS, // Always SOL
        amount: quickBuyAmount,
        mevProtection: presets[activePreset].quickBuySettings.mevMode === "off" ? 0 : 1,
        poolType: poolType,
        // Debugging metadata
        tokenName: token.name,
        tokenSymbol: token.symbol,
      }, user.bearerToken);
      
      // Handle different response formats from backend
      const txHash = data?.hash || data?.txid;
      const tokenAmount = data?.amount || data?.tokenAmount;

      if (data && txHash) {
        console.log(`✅ Quick Buy successful! Hash: ${txHash}`);
        toast.success(
          `✅ Quick Buy successful! Bought ${tokenAmount || 'tokens'} ${token.symbol}. Tx: ${txHash.slice(0, 8)}...`,
        );
      } else {
        console.log('❌ Quick Buy failed - no transaction hash returned');
        toast.error("❌ Quick Buy failed - no transaction hash returned");
      }
    } catch (e: any) {
      console.error('Quick Buy error:', e);
      
      // Handle structured API errors
      if (e instanceof ApiError) {
        if (e.code === 'NO_ACTIVE_POOL') {
          toast.error(`⚠️ Pool unavailable for ${token.symbol}. No active trading pools found.`, { duration: 5000 });
          if (e.suggestions && e.suggestions.length > 0) {
            setTimeout(() => {
              toast.error(`💡 ${e.suggestions[0]}`, { duration: 5000 });
            }, 500);
          }
        } else if (e.code === 'POOL_GRADUATED') {
          toast.error(`🎓 Pool graduated for ${token.symbol}. Token may have migrated to a new pool.`, { duration: 5000 });
        } else {
          toast.error(`❌ Quick Buy failed: ${e.message}`, { duration: 5000 });
        }
      } else {
        // Handle generic errors with better messages
        let errorMsg = e.message || "Unknown error";
        if (errorMsg.includes("Pool is completed") || errorMsg.includes("graduated")) {
          errorMsg = `Pool has graduated. Try refreshing to find the new pool.`;
        } else if (errorMsg.includes("TokenAccountNotFoundError") || errorMsg.includes("Pool account does not exist")) {
          errorMsg = `Pool not found. The token may not have an active trading pool.`;
        }
        toast.error(`❌ Quick Buy failed: ${errorMsg}`, { duration: 5000 });
      }
    }
  }

  // Helper to compute volume by timeframe for sorting in trending view
  const getVolumeForTimeframe = useCallback((t: any, tf: Timeframe) => {
    const v = t?.[`volume_${tf}`];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = parseFloat(v);
      return isNaN(n) ? 0 : n;
    }
    // simple fallbacks
    if (tf === '1h') return Number(t?.volume_5m) || 0;
    if (tf === '30m') return Number(t?.volume_5m) || 0;
    if (tf === '5m') return Number(t?.volume_5m) || 0;
    if (tf === '1m') return Number(t?.volume_5m) || 0;
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
      console.log('🔧 Setting displayed tokens for trending tab. TokenMapRef size:', tokenMapRef.current.size, 'arr length:', arr.length);
      console.log('🔧 TokenMapRef contents:', arr.map(t => ({ name: t.name, symbol: t.symbol, pair_address: t.pair_address })));
      const sortedTokens = [...arr];
      sortedTokens.sort((a, b) => {
        let aVal = 0, bVal = 0;
        if (sortKey === 'volume') {
          aVal = getVolumeForTimeframe(a, selectedTimeframe);
          bVal = getVolumeForTimeframe(b, selectedTimeframe);
        } else if (sortKey === 'liquidity') {
          aVal = Number(a.total_liquidity_usd) || 0;
          bVal = Number(b.total_liquidity_usd) || 0;
        } else if (sortKey === 'market_cap_total') {
          aVal = Number(a.fully_diluted_value) || 0;
          bVal = Number(b.fully_diluted_value) || 0;
        } else {
          aVal = Number((a as any)[sortKey]) || 0;
          bVal = Number((b as any)[sortKey]) || 0;
        }
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      });
      setDisplayed(sortedTokens);
      console.log('🔧 Set displayed to:', sortedTokens.length, 'tokens');
      console.log('🔧 Displayed tokens:', sortedTokens.map(t => ({ 
        name: t.name, 
        symbol: t.symbol, 
        pair_address: t.pair_address,
        hasName: 'name' in t,
        hasSymbol: 'symbol' in t,
        hasPairAddress: 'pair_address' in t,
        keys: Object.keys(t)
      })));
      console.log('🔧 Displayed state updated, should trigger re-render');
    } else {
      console.log('🔧 Setting displayed tokens for dex tab. FilteredTokens length:', filteredTokens.length);
      setDisplayed(filteredTokens.slice(0, 10));
    }
  }, [selectedTab, filteredTokens, sortKey, sortDirection, selectedTimeframe, getVolumeForTimeframe]);

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
    console.log('🔧 Skeleton effect triggered:', {
      allTokens: !!allTokens,
      allTokensLength: Array.isArray(allTokens) ? allTokens.length : 'not array',
      tokensLoading,
      shouldHideSkeleton: (allTokens && Array.isArray(allTokens) && allTokens.length > 0) || tokensLoading === false
    });
    if ((allTokens && Array.isArray(allTokens) && allTokens.length > 0) || tokensLoading === false) {
      console.log('🔧 Hiding skeleton');
      setShowSkeleton(false);
    }
  }, [allTokens, tokensLoading]);

  return (
    <>
      <Head>
        <title>Interstate Memeboard | Discover</title>
        <meta name="description" content="Interstate dashboard" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        {/* Header */}
        <Header search={search} setSearch={setSearch} selectedTimeframe={selectedTimeframe} />
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
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : usingFallback ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
              <span className="text-xs text-neutral-400">
                {isConnected ? 'Live' : usingFallback ? 'Polling' : 'Disconnected'}
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
            <button className="group cursor-pointer text-neutral-400 transition-colors hover:text-white" onClick={() => setSettingsOpen(true)}>
              <FaCog className="transition-transform duration-300 group-hover:rotate-90" />
            </button>
            <button
              className="relative flex flex-row items-center rounded-full bg-neutral-900 px-4 py-1.5 shadow-inner border border-neutral-800 group mr-2 cursor-pointer"
              onClick={() => setIsFilterPopoutOpen(true)}
            >
              <FaFilter className="text-lg mr-2 text-white" />
              <span className="font-semibold text-white text-base">Filters</span>
              <svg className="ml-2 w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              <span className="absolute left-3 top-1 w-2 h-2 bg-blue-400 rounded-full"></span>
            </button>
            <div className="flex items-center flex-row rounded-full border border-neutral-800 px-4 py-1.5 shadow-inner">
              <span className="mr-2 text-sm text-neutral-400">
                Quick Buy
              </span>
              <input value={quickBuyAmount} onChange={(e) => setQuickBuyAmount(e.target.value as unknown as number)} className="text-sm text-neutral-200 focus:outline-none outline-none w-12" />
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
          {(() => {
            console.log('🔧 Render conditions:', {
              showSkeleton,
              allTokens: !!allTokens,
              allTokensLength: Array.isArray(allTokens) ? allTokens.length : 'not array',
              tokenError,
              displayedLength: displayed.length,
              tokensLoading,
              displayedTokens: displayed.map(t => ({ 
                name: t.name, 
                symbol: t.symbol, 
                pair_address: t.pair_address 
              }))
            });
            return null;
          })()}
          {(showSkeleton || tokensLoading) ? (
            <div className="space-y-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-12 w-full bg-neutral-800 animate-pulse rounded" />
              ))}
            </div>
          ) : tokenError ? (
            <div className="py-10 text-center text-red-400">
              {tokenError}
            </div>
          ) : displayed.length === 0 ? (
            <div className="py-10 text-center text-neutral-400">
              No tokens found.
            </div>
          ) : (
            <InterstateTable
              rows={displayed.map((token, i) => {
                // Debug: Check what token data looks like before passing to table
                console.log(`🔧 Mapping token ${i + 1}/${displayed.length} for table:`, { 
                  name: token.name, 
                  symbol: token.symbol, 
                  pair_address: token.pair_address 
                });
                if (i === 0) {
                  console.log('🔧 First token being passed to table FULL OBJECT:', JSON.stringify(token, null, 2));
                  console.log('🔧 First token being passed to table:', {
                    name: token.name,
                    symbol: token.symbol,
                    usd_price: token.usd_price,
                    fully_diluted_value: token.fully_diluted_value,
                    total_liquidity_usd: token.total_liquidity_usd,
                    keys: Object.keys(token)
                  });
                }
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
        <Footer />
        <QuickBuySettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </>
  );
}
