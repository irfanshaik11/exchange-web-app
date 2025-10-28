import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import Head from 'next/head';
import InterstateTable from '../components/InterstateTable';
import type { Token } from '~/utils/db';
import Header from '../components/Header';
import Footer from '../components/Footer';
import usePaginatedTokensWithFallback from '../hooks/usePaginatedTokensWithFallback';
import { useQuickBuy } from "~/components/QuickBuyContext";
import QuickBuySettingsModal from '../components/QuickBuySettingsModal';
import { FilterProvider, useFilter } from '../components/FilterContext';
import FilterPopout from '../components/FilterPopout';
import { tradeBuy, SOL_MINT_ADDRESS } from "../utils/api";
import { getPoolTypeFromToken } from "../utils/poolTypeDetection";
import { env } from "../env";
import toast from "react-hot-toast";
import { FaCog, FaFilter, FaRunning, FaGasPump, FaCoins, FaBan } from "react-icons/fa";

export type Timeframe = "1m" | "5m" | "30m" | "1h";

// Add this type extension after importing Token
type TokenWithDexPaid = Token & { dexPaid?: boolean };

export default function DiscoverPage() {
  // Tab navigation state
  const [activeTab, setActiveTab] = useState<'dex' | 'trending'>('trending');
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("1h");
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFilterPopoutOpen, setIsFilterPopoutOpen] = useState(false);
  const { filter, setFilter, resetFilter } = useFilter();
  const { quickBuySettings, presets, setPresets, activePreset, setActivePreset } = useQuickBuy();
  
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

  // WebSocket token service
  const {
    data: allTokens,
    loading: tokensLoading,
    isConnected,
    error: tokenError,
    isReconnecting,
    usingFallback,
  } = usePaginatedTokensWithFallback({
    filter: activeTab === 'dex' ? 'new' : 'trending',
    timeframe: selectedTimeframe
  });

  // QUICK BUY handler
  async function handleQuickBuy(token: Token) {
    console.log("🎯 handleQuickBuy called for token:", token.symbol);
    
    try {
      const poolType = getPoolTypeFromToken(token);
      const effectivePoolAddress = token.migrated_pool_address || token.pair_address;
      console.log(`🔍 Quick Buy ${token.symbol} - Protocol: ${token.launchpad_protocol || token.protocol || 'unknown'} → PoolType: ${poolType}`);
      console.log(`🔍 Pool Address: ${effectivePoolAddress} ${token.migrated_pool_address ? '(using migrated_pool_address)' : '(using pair_address)'}`);
      
      const settings = presets[activePreset].quickBuySettings;
      const data = await tradeBuy({
        poolAddress: effectivePoolAddress,
        baseMint: token.mint,
        quoteMint: SOL_MINT_ADDRESS,
        amount: Number(quickBuyAmount) || 0,
        mevProtection: settings.mevMode === "off" ? 0 : 1,
        poolType: poolType,
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
      toast.error(`❌ Quick Buy failed: ${e.message || "Unknown error"}`);
    }
  }

  const handleTimeframeClick = (tf: string) => {
    setSelectedTimeframe(tf as Timeframe);
    setSortKey("volume");
    setSortDirection("desc");
  };

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

  // Sorting handler for table headers
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
      
      // Update filtered tokens
      const arr = Array.from(tokenMapRef.current.values());
      setFilteredTokens(arr);
    }
  }, [allTokens]);

  // Update displayed tokens based on active tab and sorting
  useEffect(() => {
    if (activeTab === "trending") {
      const arr = Array.from(tokenMapRef.current.values());
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
    } else {
      setDisplayed(filteredTokens.slice(0, 10));
    }
  }, [activeTab, filteredTokens, sortKey, sortDirection, selectedTimeframe, getVolumeForTimeframe]);

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

  return (
    <>
      <Head>
        <title>Interstate Memeboard | Discover</title>
        <meta name="description" content="Interstate dashboard" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=2" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png?v=2" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
      </Head>
      <div className="min-h-screen text-neutral-100" style={{ backgroundColor: '#0f1012' }}>
        {/* Header */}
        <Header search={search} setSearch={setSearch} selectedTimeframe={selectedTimeframe} />
        
        {/* Tab Navigation */}
        <div className="mx-auto my-4 flex flex-row items-center justify-between gap-6 px-20">
          <div className="flex max-w-7xl items-center gap-6">
            <button
              className={`text-lg font-semibold transition-colors ${activeTab === "dex" ? "text-white" : "text-neutral-400"} cursor-pointer`}
              onClick={() => setActiveTab("dex")}
            >
              DEX Screener
            </button>
            <button
              className={`text-lg font-semibold transition-colors ${activeTab === "trending" ? "text-white" : "text-neutral-400"} cursor-pointer`}
              onClick={() => setActiveTab("trending")}
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
              {(["1m", "5m", "30m", "1h"] as Timeframe[]).map((tf: Timeframe) => (
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
            <div className="relative">
              <button
                className="flex items-center justify-center gap-2 px-4 py-1.5 rounded-full transition-all duration-300 ease-out cursor-pointer relative mr-2 bg-neutral-900 border border-neutral-800"
                style={{
                  color: '#9CA3AF'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#E6E7EA';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#9CA3AF';
                }}
                onClick={() => setIsFilterPopoutOpen(true)}
              >
                {/* Custom Filter Icon - Three horizontal lines with circles */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="6" x2="20" y2="6"/>
                  <circle cx="8" cy="6" r="2"/>
                  <line x1="4" y1="12" x2="20" y2="12"/>
                  <circle cx="16" cy="12" r="2"/>
                  <line x1="4" y1="18" x2="20" y2="18"/>
                  <circle cx="8" cy="18" r="2"/>
                </svg>
                <span className="font-semibold text-base">Filter</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <div className="flex items-center flex-row rounded-full border border-neutral-800 px-4 py-1.5 shadow-inner">
              <span className="mr-2 text-sm text-neutral-400">
                Quick Buy
              </span>
              <input 
                value={quickBuyAmount} 
                onChange={(e) => {
                  const value = e.target.value;
                  // Only allow numbers and decimal point
                  if (value === '' || /^\d*\.?\d*$/.test(value)) {
                    setQuickBuyAmount(value);
                    // Save to localStorage as a number
                    const numValue = Number(value) || 0;
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('quickBuyAmount', numValue.toString());
                    }
                  }
                }}
                onKeyDown={(e) => {
                  // Prevent non-numeric characters except decimal point
                  if (!/[0-9.]/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                    e.preventDefault();
                  }
                }}
                className="text-sm text-neutral-200 focus:outline-none outline-none w-12" 
              />
              <img
                src="https://axiom.trade/images/sol-fill.svg"
                alt="Solana"
                className="mr-4 h-5 w-5"
              />
              {[0, 1, 2].map((i) => (
                <div key={i} className="relative flex items-center justify-center mr-2">
                  <button
                    className={`cursor-pointer font-semibold transition-all duration-200 ${activePreset === i ? "text-emerald-300" : "text-neutral-400 hover:text-white"}`}
                    onClick={() => setActivePreset(i)}
                    onMouseEnter={() => setShowPillTooltip(`P${i + 1}`)}
                    onMouseLeave={() => setShowPillTooltip(null)}
                  >
                    {`P${i + 1}`}
                  </button>
                  
                  {/* Tooltip for each pill */}
                  {showPillTooltip === `P${i + 1}` && (() => {
                    const preset = presets[i];
                    const settings = preset?.quickBuySettings;
                    
                    if (!settings) return null;
                    
                    return (
                      <div className="absolute top-full left-0 mt-1 w-28 rounded-lg shadow-xl border z-50"
                           style={{ 
                             backgroundColor: 'rgba(15, 16, 18, 0.95)',
                             borderColor: '#2A2B33'
                           }}>
                        <div className="p-2 space-y-1.5">
                          {/* Slippage */}
                          <div className="flex items-center gap-1.5">
                            <FaRunning className="text-xs opacity-80" style={{ color: '#9CA3AF' }} />
                            <span className="text-gray-300 text-xs font-light">{(settings.maxSlippage * 100).toFixed(0)}%</span>
                          </div>
                          
                          {/* Priority Fee */}
                          <div className="flex items-center gap-1.5">
                            <FaGasPump className="text-xs opacity-90" style={{ color: settings.priority < 0.01 ? '#FF4D7F' : '#9CA3AF' }} />
                            <span className="text-yellow-400 text-xs font-light">{settings.priority}</span>
                            {settings.priority < 0.01 && <span className="text-[#FF4D7F] text-xs">⚠</span>}
                          </div>
                          
                          {/* Bribe */}
                          <div className="flex items-center gap-1.5">
                            <FaCoins className="text-xs opacity-90" style={{ color: '#9CA3AF' }} />
                            <span className="text-yellow-400 text-xs font-light">{settings.bribe}</span>
                            {settings.bribe > 0 && <span className="text-[#FF4D7F] text-xs">⚠</span>}
                          </div>
                          
                          {/* MEV Protection */}
                          <div className="flex items-center gap-1.5">
                            <FaBan className="text-xs opacity-90" style={{ color: settings.mevMode === 'off' || settings.mevMode === 'reduced' ? '#9CA3AF' : '#70E0B0' }} />
                            <span className="text-gray-300 text-xs font-light">{settings.mevMode === 'off' ? 'Off' : settings.mevMode === 'reduced' ? 'Reduced' : 'Secure'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
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
              rows={displayed.map((token, i) => ({
                token: token,
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
