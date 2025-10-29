// src/pages/discover.tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import InterstateTable from '../components/InterstateTable';
import type { Token } from '~/utils/db';
import Header from '../components/Header';
import Footer from '../components/Footer';
import usePaginatedTokensWithFallback from '../hooks/usePaginatedTokensWithFallback';
import { useQuickBuy } from "~/components/QuickBuyContext";
import QuickBuySettingsModal from '../components/QuickBuySettingsModal';
import { useFilter } from '../components/FilterContext';
import FilterPopout from '../components/FilterPopout';
import { tradeBuy, SOL_MINT_ADDRESS } from "../utils/api";
import { getPoolTypeFromToken } from "../utils/poolTypeDetection";
import toast from "react-hot-toast";
import PumpLive, { type PumpItem, demoLeft as demoLeftPump, demoRight as demoRightPump } from '../components/PumpLive';
import { FaFilter, FaRunning, FaGasPump, FaCoins, FaBan } from "react-icons/fa";

export type Timeframe = "5m" | "1h" | "6h" | "24h";

// Extend Token with optional flags
type TokenWithDexPaid = Token & { dexPaid?: boolean };

const AX = {
  bg: '#0f1012',
  surface2: '#17191E',
  border: '#2A2B33',
  text: '#E6E7EA',
  muted: '#9CA3AF',
  green: '#22c55e',
};

export default function DiscoverPage() {
  // T ancestors - only trending is enabled now
  const [activeTab, setActiveTab] = useState<'trending'>('trending');
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("1h");
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFilterPopoutOpen, setIsFilterPopoutOpen] = useState(false);
  const { filter } = useFilter();
  const [localFilters, setLocalFilters] = useState(filter);
  const { presets, activePreset, setActivePreset } = useQuickBuy();

  // Load quickBuyAmount from localStorage with fallback
  const getInitialQuickBuyAmount = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('quickBuyAmount');
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0) {
          return parsed;
        }
      }
    }
    return 0.05;
  };

  const [quickBuyAmount, setQuickBuyAmount] = useState(getInitialQuickBuyAmount().toString());
  const [showPillTooltip, setShowPillTooltip] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const tokenMapRef = useRef<Map<string, TokenWithDexPaid>>(new Map());
  const [filteredTokens, setFilteredTokens] = useState<TokenWithDexPaid[]>([]);
  const [displayed, setDisplayed] = useState<TokenWithDexPaid[]>([]);
  const [sortKey, setSortKey] = useState<"market_cap_total" | "liquidity" | "volume" | "txns" | "name">("volume");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // WebSocket token service – keep as-is for dex/trending
  console.log('🔧 [DISCOVER] About to call usePaginatedTokensWithFallback with:', { 
    filter: 'trending',
    timeframe: selectedTimeframe
  });
  
  const {
    data: allTokens,
    loading: tokensLoading,
    isConnected,
    error: tokenError,
    isReconnecting,
    usingFallback,
  } = usePaginatedTokensWithFallback({
    // Always use trending endpoint
    filter: 'trending',
    timeframe: selectedTimeframe
  });
  
  // Debug log to track timeframe changes
  useEffect(() => {
    console.log('🔍 Discover: selectedTimeframe changed to:', selectedTimeframe);
  }, [selectedTimeframe]);

  // QUICK BUY handler – unchanged
  async function handleQuickBuy(token: Token) {
    try {
      const poolType = getPoolTypeFromToken(token);
      const effectivePoolAddress = token.migrated_pool_address || token.pair_address;
      const settings = presets[activePreset].quickBuySettings;

      const data = await tradeBuy({
        poolAddress: effectivePoolAddress,
        baseMint: token.mint,
        quoteMint: SOL_MINT_ADDRESS,
        amount: Number(quickBuyAmount) || 0,
        mevProtection: settings.mevMode === "off" ? 0 : 1,
        poolType,
        originalPairAddress: token.pair_address,
        slippage: settings.maxSlippage || 0.4,
        priorityFee: settings.priority || 0.0001,
        bribe: settings.bribe || 0,
        mevMode: settings.mevMode,
        autoFee: settings.autoFee || false,
        maxFee: settings.maxFee || 0,
        rpc: settings.rpc,
        tokenName: token.name,
        tokenSymbol: token.symbol,
      }, '');

      const txHash = (data as any)?.hash || (data as any)?.txid;
      const tokenAmount = (data as any)?.amount || (data as any)?.tokenAmount;

      if (data && txHash) {
        toast.success(
          `✅ Quick Buy successful! Bought ${tokenAmount || 'tokens'} ${token.symbol}. Tx: ${String(txHash).slice(0, 8)}...`,
        );
      } else {
        toast.error("❌ Quick Buy failed - no transaction hash returned");
      }
    } catch (e: any) {
      console.error('Quick Buy error:', e);
      toast.error(`❌ Quick Buy failed: ${e.message || "Unknown error"}`);
    }
  }

  const handleTimeframeClick = (tf: string) => {
    console.log('🖱️ Discover: Timeframe clicked:', tf);
    setSelectedTimeframe(tf as Timeframe);
    setSortKey("volume");
    setSortDirection("desc");
  };

  // Helper to compute volume by timeframe for sorting in trending view
  const getVolumeForTimeframe = (t: any, tf: Timeframe) => {
    const v = t?.[`volume_${tf}`];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = parseFloat(v);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  };

  // Apply filters to tokens
  const applyFilters = useCallback((tokens: TokenWithDexPaid[]) => {
    let filtered = [...tokens];
    
    // Search keywords
    if (localFilters.searchKeywords.trim()) {
      const searchTerms = localFilters.searchKeywords.toLowerCase().split(',').map(term => term.trim()).filter(term => term);
      if (searchTerms.length > 0) {
        filtered = filtered.filter(token => {
          const tokenText = `${token.name || ''} ${token.symbol || ''}`.toLowerCase();
          return searchTerms.some(term => tokenText.includes(term));
        });
      }
    }
    
    // Exclude keywords
    if (localFilters.excludeKeywords.trim()) {
      const excludeTerms = localFilters.excludeKeywords.toLowerCase().split(',').map(term => term.trim()).filter(term => term);
      if (excludeTerms.length > 0) {
        filtered = filtered.filter(token => {
          const tokenText = `${token.name || ''} ${token.symbol || ''}`.toLowerCase();
          return !excludeTerms.some(term => tokenText.includes(term));
        });
      }
    }
    
    // Market cap filter
    if (localFilters.marketCapMin || localFilters.marketCapMax) {
      filtered = filtered.filter(token => {
        const marketCap = Number(token.fully_diluted_value) || 0;
        const min = localFilters.marketCapMin ? Number(localFilters.marketCapMin) : 0;
        const max = localFilters.marketCapMax ? Number(localFilters.marketCapMax) : Infinity;
        return marketCap >= min && marketCap <= max;
      });
    }
    
    // Volume filter
    if (localFilters.volumeMin || localFilters.volumeMax) {
      filtered = filtered.filter(token => {
        const volume = getVolumeForTimeframe(token, selectedTimeframe);
        const min = localFilters.volumeMin ? Number(localFilters.volumeMin) : 0;
        const max = localFilters.volumeMax ? Number(localFilters.volumeMax) : Infinity;
        return volume >= min && volume <= max;
      });
    }
    
    // Liquidity filter
    if (localFilters.liquidityMin || localFilters.liquidityMax) {
      filtered = filtered.filter(token => {
        const liquidity = Number(token.total_liquidity_usd) || 0;
        const min = localFilters.liquidityMin ? Number(localFilters.liquidityMin) : 0;
        const max = localFilters.liquidityMax ? Number(localFilters.liquidityMax) : Infinity;
        return liquidity >= min && liquidity <= max;
      });
    }
    
    return filtered;
  }, [localFilters, selectedTimeframe, getVolumeForTimeframe]);

  // Sorting handler
  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  // Update token map when allTokens changes
  useEffect(() => {
    if (allTokens && Array.isArray(allTokens)) {
      const newMap = new Map<string, TokenWithDexPaid>();
      allTokens.forEach((token: any) => {
        const key = token.pair_address || token.mint;
        if (key) {
          newMap.set(key, token as TokenWithDexPaid);
        }
      });
      tokenMapRef.current = newMap;

      const arr = Array.from(tokenMapRef.current.values());
      setFilteredTokens(arr);
    }
  }, [allTokens]);

  // Update displayed tokens
  useEffect(() => {
    if (activeTab === "trending") {
      const arr = Array.from(tokenMapRef.current.values());
      const filtered = applyFilters(arr);
      const sortedTokens = [...filtered];
      sortedTokens.sort((a, b) => {
        let aVal = 0, bVal = 0;
        if (sortKey === 'volume') {
          aVal = getVolumeForTimeframe(a, selectedTimeframe);
          bVal = getVolumeForTimeframe(b, selectedTimeframe);
        } else if (sortKey === 'liquidity') {
          aVal = Number((a as any).total_liquidity_usd) || 0;
          bVal = Number((b as any).total_liquidity_usd) || 0;
        } else if (sortKey === 'market_cap_total') {
          aVal = Number((a as any).fully_diluted_value) || 0;
          bVal = Number((b as any).fully_diluted_value) || 0;
        } else {
          aVal = Number((a as any)[sortKey]) || 0;
          bVal = Number((b as any)[sortKey]) || 0;
        }
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      });
      setDisplayed(sortedTokens);
    } else {
      // dex OR live → same sliced data; Live Pump renders a different UI
      setDisplayed(filteredTokens.slice(0, 10));
    }
  }, [activeTab, filteredTokens, sortKey, sortDirection, selectedTimeframe, applyFilters]);

  // Skeleton management
  useEffect(() => {
    setShowSkeleton(true);
    const timer = setTimeout(() => setShowSkeleton(false), 800);
    return () => clearTimeout(timer);
  }, [activeTab]);

  useEffect(() => {
    if ((allTokens && Array.isArray(allTokens) && allTokens.length > 0) || tokensLoading === false) {
      setShowSkeleton(false);
    }
  }, [allTokens, tokensLoading]);

  /* ------- map tokens -> PumpItem for Live Pump ------- */
  /* Commented out - Live Pump feature disabled
  const toPumpItem = (t: any): PumpItem => {
    const name = t?.name || t?.symbol || '—';
    const sym = t?.symbol ? String(t.symbol).slice(0, 12) : undefined;
    const desc = t?.description || t?.bio || '';
    const age = t?.age_label || '22m'; // fallback display label
    const mcNum = Number(t?.fully_diluted_value || 0);
    const mc =
      mcNum > 0
        ? (mcNum >= 1_000_000
            ? `$${(mcNum / 1_000_000).toFixed(2)}M`
            : mcNum >= 1_000
            ? `$${(mcNum / 1_000).toFixed(2)}K`
            : `$${mcNum.toFixed(0)}`)
        : undefined;

    const coverUrl = t?.image || t?.logo || t?.uri || undefined;
    const avatarUrl = t?.logo || t?.image || undefined;

    return {
      id: t?.pair_address || t?.mint || Math.random().toString(36).slice(2),
      name,
      symbol: sym,
      desc,
      age,
      mc,
      coverUrl,
      avatarUrl,
      verified: Boolean(t?.verified),
      hot: Boolean(t?.hot),
    };
  };

  const liveLeftItems: PumpItem[] =
    displayed.length ? displayed.slice(0, 6).map(toPumpItem) : demoLeftPump;

  const liveRightItems: PumpItem[] =
    displayed.length ? displayed.slice(6, 12).map(toPumpItem) : demoRightPump;
  */

  return (
    <>
      <Head>
        <title>Interstate Memeboard | Discover</title>
        <meta name="description" content="Interstate dashboard" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=2" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png?v=2" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
        {/* Preload the static fallbacks used many times in PumpLive */}
        <link rel="preload" as="image" href="/placeholder/fallback-cover.jpg" />
        <link rel="preload" as="image" href="/placeholder/fallback-avatar.jpg" />
      </Head>

      <div className="min-h-screen text-neutral-100" style={{ backgroundColor: AX.bg }}>
        {/* Header */}
        <Header search={search} setSearch={setSearch} selectedTimeframe={selectedTimeframe} />

        {/* Tab Navigation */}
        <div className="mx-auto my-4 flex flex-row items-center justify-between gap-6 px-20">
          <div className="flex max-w-7xl items-center gap-6">
            {/* <button
              className={`text-lg font-semibold transition-colors ${activeTab === "dex" ? "text-white" : "text-neutral-400"} cursor-pointer`}
              onClick={() => setActiveTab("dex")}
            >
              DEX Screener
            </button> */}
            <button
              className={`text-lg font-semibold transition-colors ${activeTab === "trending" ? "text-white" : "text-neutral-400"} cursor-pointer`}
              onClick={() => setActiveTab("trending")}
            >
              Trending
            </button>
            {/* <button
              className={`text-lg font-semibold transition-colors ${activeTab === "live" ? "text-white" : "text-neutral-400"} cursor-pointer`}
              onClick={() => setActiveTab("live")}
            >
              Live Pump
            </button> */}
          </div>

          {/* Right controls (unchanged) */}
          <div className="flex flex-row items-center gap-4">
            {/* Connection status - commented out per user request */}
            {/* <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : usingFallback ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
              <span className="text-xs text-neutral-400">
                {isConnected ? 'Live' : 'Disconnected'}
              </span>
            </div> */}

            {/* Timeframes */}
            <div className="flex max-w-7xl items-center gap-4 text-sm font-medium">
              {(["5m", "1h", "6h", "24h"] as Timeframe[]).map((tf: Timeframe) => (
                <button
                  key={tf}
                  className={(selectedTimeframe === tf ? "text-emerald-400 " : "text-neutral-400 ") + "cursor-pointer transition-colors"}
                  onClick={() => handleTimeframeClick(tf)}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Filter button */}
            <div className="relative">
              <button
                className="flex items-center justify-center gap-2 px-4 py-1.5 rounded-full transition-all duration-300 ease-out cursor-pointer relative mr-2 bg-neutral-900 border border-neutral-800"
                style={{ color: '#9CA3AF' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#E6E7EA'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF'; }}
                onClick={() => setIsFilterPopoutOpen(true)}
              >
                {/* filter glyph */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="6" x2="20" y2="6"/><circle cx="8" cy="6" r="2"/>
                  <line x1="4" y1="12" x2="20" y2="12"/><circle cx="16" cy="12" r="2"/>
                  <line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="18" r="2"/>
                </svg>
                <span className="font-semibold text-base">Filter</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Quick Buy */}
            <div className="flex items-center flex-row rounded-full border border-neutral-800 px-4 py-1.5 shadow-inner">
              <span className="mr-2 text-sm text-neutral-400">Quick Buy</span>
              <input
                value={quickBuyAmount}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || /^\d*\.?\d*$/.test(value)) {
                    setQuickBuyAmount(value);
                    const numValue = Number(value) || 0;
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('quickBuyAmount', numValue.toString());
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (!/[0-9.]/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                    e.preventDefault();
                  }
                }}
                className="text-sm text-neutral-200 focus:outline-none outline-none w-12"
              />
              <img src="https://axiom.trade/images/sol-fill.svg" alt="Solana" className="mr-4 h-5 w-5" />
              {[0, 1, 2].map((i) => {
                const preset = presets[i];
                const settings = preset?.quickBuySettings;
                return (
                  <div key={i} className="relative flex items-center justify-center mr-2">
                    <button
                      className={`cursor-pointer font-semibold transition-all duration-200 ${activePreset === i ? "text-emerald-300" : "text-neutral-400 hover:text-white"}`}
                      onClick={() => setActivePreset(i)}
                      onMouseEnter={() => setShowPillTooltip(`P${i + 1}`)}
                      onMouseLeave={() => setShowPillTooltip(null)}
                    >
                      {`P${i + 1}`}
                    </button>

                    {/* Single tooltip block (fixed JSX) */}
                    {showPillTooltip === `P${i + 1}` && settings && (
                      <div
                        className="absolute top-full left-0 mt-1 w-36 rounded-lg shadow-xl border z-50"
                        style={{ backgroundColor: 'rgba(15, 16, 18, 0.95)', borderColor: '#2A2B33' }}
                      >
                        <div className="p-2 space-y-1.5 text-xs">
                          <div className="flex items-center gap-1.5">
                            <FaRunning className="opacity-80" style={{ color: '#9CA3AF' }} />
                            <span className="text-gray-300">Slippage: {(settings.maxSlippage * 100).toFixed(0)}%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <FaGasPump className="opacity-90" style={{ color: settings.priority < 0.01 ? '#FF4D7F' : '#9CA3AF' }} />
                            <span className="text-yellow-400">Priority: {settings.priority}</span>
                            {settings.priority < 0.01 && <span className="text-[#FF4D7F]">⚠</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <FaCoins className="opacity-90" style={{ color: '#9CA3AF' }} />
                            <span className="text-yellow-400">Bribe: {settings.bribe}</span>
                            {settings.bribe > 0 && <span className="text-[#FF4D7F]">⚠</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <FaBan className="opacity-90" style={{ color: settings.mevMode === 'off' || settings.mevMode === 'reduced' ? '#9CA3AF' : '#70E0B0' }} />
                            <span className="text-gray-300">
                              MEV: {settings.mevMode === 'off' ? 'Off' : settings.mevMode === 'reduced' ? 'Reduced' : 'Secure'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Filter Popout */}
        <FilterPopout 
          open={isFilterPopoutOpen} 
          onClose={() => setIsFilterPopoutOpen(false)}
          onApplyFilters={(filters) => setLocalFilters(filters)}
          currentFilters={localFilters}
        />

        {/* Main Content */}
        <main className="mx-auto px-20 pb-10">
          {/* {activeTab === 'live' ? (
            <PumpLive
              leftItems={liveLeftItems.length ? liveLeftItems : demoLeftPump}
              rightItems={liveRightItems.length ? liveRightItems : demoRightPump}
              onAction={(id) => {
                const any = Array.from(tokenMapRef.current.values()).find(
                  t => t.pair_address === id || t.mint === id
                );
                if (any) handleQuickBuy(any as Token);
              }}
            />
          ) : */} {(showSkeleton || tokensLoading) ? (
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
              rows={displayed.map((token, i) => ({
                token: token as Token,
                i: i,
              }))}
              onQuickBuy={handleQuickBuy}
              sortKey={sortKey}
              sortDirection={sortDirection}
              setSort={handleSort}
              selectedTimeframe={selectedTimeframe}
              quickBuyAmount={Number(quickBuyAmount) || 0}
            />
          )}
        </main>

        <Footer />
        <QuickBuySettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </>
  );
}
