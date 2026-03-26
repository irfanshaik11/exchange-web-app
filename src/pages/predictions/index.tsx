import React, { useState, useMemo, useEffect, useRef } from 'react';
import Head from 'next/head';
// import Image from 'next/image';
// import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';

// Lazy-load 3D scene — client only, no SSR for WebGL
// COMMENTED OUT: 3D torus ring temporarily disabled
// const HeroScene = dynamic(() => import('../../components/predictions/HeroScene'), {
//   ssr: false,
//   loading: () => null,
// });
import { HiOutlineSearch, HiOutlineRefresh, HiOutlineViewGrid, HiOutlineCollection, HiOutlineLockClosed } from 'react-icons/hi';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import {
  PredictionCard,
  PredictionCardV2,
  CategoryFilter,
  HeroMarket,
  MarketFilters,
  applyMarketFilters,
  DEFAULT_FILTERS,
  FavoritesCarousel,
  CuratedSections,
  UnifiedPortfolio,
  AuroraBackground,
  SkeletonShimmer,
  TalarionCreate,
  T,
  type PredictionMarket,
  type SortOption,
  type MarketFilterState,
} from '../../components/predictions';
import PinGate from '../../components/predictions/PinGate';
import { useUser } from '../../components/UserContext';
import useUnifiedPredictionMarkets from '~/hooks/useUnifiedPredictionMarkets';
import type { UnifiedPredictionMarket } from '~/hooks/useUnifiedPredictionMarkets';
import usePredictionFavorites from '~/hooks/usePredictionFavorites';
import usePolymarketLivePrices from '~/hooks/usePolymarketLivePrices';
import DataSourceSwitcher, { type PredictionDataSource } from '~/components/predictions/DataSourceSwitcher';
import { HomepageInsightPanel } from '~/components/insights/HomepageInsightPanel';

// Use consolidated theme — single source of truth
const AX = T;

// Fallback markets shown when API fails or during initial load
const FALLBACK_MARKETS: PredictionMarket[] = [
  {
    ticker: "LOADING-1",
    title: "Loading prediction markets...",
    category: "other",
    yesPrice: 0.50,
    noPrice: 0.50,
    yesPriceChange24h: 0,
    noPriceChange24h: 0,
    volume24h: 0,
    totalVolume: 0,
    closesAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: "active",
  },
];

export default function PredictionsPage() {
  const { user, primaryWalletAddresses } = useUser();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSort, setSelectedSort] = useState<SortOption>('hot');
  const [searchQuery, setSearchQuery] = useState('');
  const [serverSearchResults, setServerSearchResults] = useState<UnifiedPredictionMarket[]>([]);
  const [marketFilters, setMarketFilters] = useState<MarketFilterState>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<'curated' | 'grid'>('curated');
  const [showPortfolio, setShowPortfolio] = useState(false); // Default closed
  const [showEndedMarkets, setShowEndedMarkets] = useState(false);
  // TODO: dFlow is disabled for now - only Polymarket is active
  // const [dataSource, setDataSource] = useState<PredictionDataSource>('all');
  const [dataSource, setDataSource] = useState<PredictionDataSource>('polymarket');
  const [showFullCreator, setShowFullCreator] = useState(false);

  // Fetch markets from unified hook (dFlow + Polymarket)
  const {
    markets: unifiedMarkets,
    isLoading,
    error,
    refetch,
    totalVolume: apiTotalVolume,
    totalMarkets,
    dflowCount,
    polymarketCount,
    totalAvailable,
    hasMore,
    loadMore,
    isFetchingMore,
  } = useUnifiedPredictionMarkets({
    source: dataSource,
    limit: 500,
    refreshInterval: 30000, // Refresh every 30 seconds
  });

  // Favorites management
  const { favorites, isFavorite, toggleFavorite, removeFavorite } = usePredictionFavorites();

  // Scroll ref for 3D scene — no re-renders, read directly in animation loop
  const scrollRef = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      scrollRef.current = Math.min(window.scrollY / 700, 1);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Use API markets or fallback
  const allMarkets = useMemo(() => {
    const markets = unifiedMarkets || [];
    if (markets.length > 0) return markets;
    if (isLoading) return FALLBACK_MARKETS;
    return [];
  }, [unifiedMarkets, isLoading]);

  // Extract YES token IDs from active Polymarket markets for live WS subscription
  const activeTokenIds = useMemo(() => {
    return (allMarkets as UnifiedPredictionMarket[])
      .filter(m => m.polymarketData?.yesTokenId)
      .map(m => m.polymarketData!.yesTokenId);
  }, [allMarkets]);

  // Subscribe to live trade prices for all visible markets via CLOB WS
  const livePrices = usePolymarketLivePrices(activeTokenIds, activeTokenIds.length > 0);

  // Map ticker → yesTokenId for live price lookup on cards
  const tokenIdByTicker = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of allMarkets as UnifiedPredictionMarket[]) {
      if (m.polymarketData?.yesTokenId) {
        map.set(m.ticker, m.polymarketData.yesTokenId);
      }
    }
    return map;
  }, [allMarkets]);

  // Calculate category counts from live data
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allMarkets.forEach((market) => {
      counts[market.category] = (counts[market.category] || 0) + 1;
    });
    return counts;
  }, [allMarkets]);

  // Filter and sort markets
  const filteredMarkets = useMemo(() => {
    let markets = [...allMarkets];

    // Filter by category
    if (selectedCategory !== 'all') {
      markets = markets.filter((m) => m.category === selectedCategory);
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      markets = markets.filter((m) =>
        m.title.toLowerCase().includes(query) ||
        m.ticker.toLowerCase().includes(query)
      );
    }

    // Apply advanced filters (status, ending, volume, probability)
    markets = applyMarketFilters(markets, marketFilters);

    // Status priority: active (live) first, then closed, then resolved
    const statusPriority = (status: string) => {
      if (status === 'active') return 0;
      if (status === 'closed') return 1;
      return 2; // resolved
    };

    // Sort by status first, then by selected sort within each status group
    markets.sort((a, b) => {
      // First, sort by status priority
      const statusDiff = statusPriority(a.status) - statusPriority(b.status);
      if (statusDiff !== 0) return statusDiff;

      // Then apply secondary sort based on selected option
      switch (selectedSort) {
        case 'hot':
          return b.volume24h - a.volume24h;
        case 'new':
          return new Date(b.closesAt).getTime() - new Date(a.closesAt).getTime();
        case 'ending':
          return new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime();
        case 'volume':
          return b.totalVolume - a.totalVolume;
        default:
          return 0;
      }
    });

    return markets;
  }, [allMarkets, selectedCategory, selectedSort, searchQuery, marketFilters]);

  // Server-side search alongside client-side for best coverage
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setServerSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      try {
        const backendUrl = typeof window !== 'undefined'
          ? ((window as any).__NEXT_DATA__?.runtimeConfig?.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || '')
          : '';
        if (!backendUrl) return;
        fetch(`${backendUrl}/api/prediction/polymarket/search?q=${encodeURIComponent(searchQuery)}&limit=20`)
          .then(r => r.ok ? r.json() : null)
          .then(json => {
            if (!json?.data || !Array.isArray(json.data)) return;
            const events = json.data;
            const markets: UnifiedPredictionMarket[] = [];
            for (const evt of events) {
              if (!evt?.title) continue;
              const market = (evt.markets || [])[0];
              if (!market) continue;
              let yesPrice = 0.5;
              try {
                const prices = JSON.parse(market.outcomePrices || '[]');
                yesPrice = parseFloat(prices[0]) || 0.5;
              } catch {}
              let clobTokenIds: string[] = [];
              try { clobTokenIds = JSON.parse(market.clobTokenIds || '[]'); } catch {}
              markets.push({
                ticker: evt.slug || market.slug || `poly-${market.id || ''}`,
                title: evt.title,
                category: 'other',
                yesPrice,
                noPrice: 1 - yesPrice,
                yesPriceChange24h: 0,
                noPriceChange24h: 0,
                volume24h: evt.volume24hr || 0,
                totalVolume: parseFloat(evt.volume) || 0,
                closesAt: evt.endDate || market.endDate || new Date(Date.now() + 30 * 86400000).toISOString(),
                status: 'active',
                source: 'polymarket',
                marketType: 'binary',
                polymarketData: market.conditionId ? {
                  eventId: evt.id || '',
                  marketId: market.id || '',
                  conditionId: market.conditionId,
                  yesTokenId: clobTokenIds[0] || '',
                  noTokenId: clobTokenIds[1] || '',
                  tickSize: market.tickSize || '0.01',
                  negRisk: market.negRisk || false,
                } : undefined,
              } as any);
            }
            setServerSearchResults(markets);
          })
          .catch(() => setServerSearchResults([]));
      } catch {
        setServerSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Merge client-side + server-side results (deduplicate by ticker)
  const mergedFilteredMarkets = useMemo(() => {
    const base = filteredMarkets || [];
    const server = serverSearchResults || [];
    if (server.length === 0) return base;
    const seen = new Set(base.map(m => m.ticker));
    const extra = server.filter(m => m?.ticker && !seen.has(m.ticker));
    return [...base, ...extra];
  }, [filteredMarkets, serverSearchResults]);

  // Split into active vs ended markets
  // A market is "ended" if its status is closed/resolved OR its closesAt date has passed
  const activeMarkets = useMemo(() => {
    const now = Date.now();
    return (mergedFilteredMarkets || []).filter((m) =>
      m && m.status === 'active' && new Date(m.closesAt).getTime() > now
    );
  }, [mergedFilteredMarkets]);

  const endedMarkets = useMemo(() => {
    const now = Date.now();
    return (mergedFilteredMarkets || []).filter((m) =>
      m && (m.status !== 'active' || new Date(m.closesAt).getTime() <= now)
    );
  }, [filteredMarkets]);

  // Get featured market (highest volume)
  const featuredMarket = useMemo(() => {
    if (allMarkets.length === 0) return null;
    return [...allMarkets].sort((a, b) => b.totalVolume - a.totalVolume)[0];
  }, [allMarkets]);

  // Calculate total stats
  const totalVolume = useMemo(() => {
    return allMarkets.reduce((sum, m) => sum + m.volume24h, 0);
  }, [allMarkets]);

  return (
    <PinGate>
      <Head>
        <title>Predictions | Interstate</title>
        <meta name="description" content="Trade on real-world prediction markets. Bet on politics, crypto, sports, and more." />
      </Head>

      <div className="min-h-screen flex flex-col bg-[#050608] text-neutral-100">
        <div className="relative z-[10000]">
          <Header />
        </div>

        {/* Category + Sort Nav Bar — single flat row, matches watchlist bar */}
        <div
          className="relative z-[9999] bg-[#0C0C0F] px-2 py-1 sm:px-3 sm:py-0.5"
        >
          <CategoryFilter
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            selectedSort={selectedSort}
            onSelectSort={setSelectedSort}
            rightSlot={
              <div className="flex items-center gap-1.5">
                {/* Inline search — minimal, blends with nav */}
                <div className="relative hidden sm:flex items-center">
                  <HiOutlineSearch
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: searchQuery ? '#18c48c' : '#9ca3af' }}
                  />
                  <input
                    type="text"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-24 focus:w-40 lg:w-28 lg:focus:w-48 bg-transparent px-2 py-1 text-sm font-medium outline-none text-white placeholder-neutral-500 transition-all duration-200"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/10 text-[11px] flex-shrink-0"
                      style={{ color: '#9ca3af' }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <MarketFilters
                  filters={marketFilters}
                  onFiltersChange={setMarketFilters}
                />
              </div>
            }
          />
        </div>

        <div className="p-1 sm:p-1.5">
          {/* Rounded container with background - matches tracker */}
          <div className="relative min-h-[calc(100vh-80px)] overflow-hidden rounded-2xl border border-white/[0.06]">
            {/* Background image + aurora overlay */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              <div
                className="absolute inset-x-0 top-0 h-[80vh] bg-cover bg-top bg-no-repeat"
                style={{
                  backgroundImage: "url(/ranks/Background2.png)",
                  maskImage: "linear-gradient(to bottom, black 50%, transparent 100%)",
                  WebkitMaskImage: "linear-gradient(to bottom, black 50%, transparent 100%)",
                }}
              />
              <div className="absolute inset-0 bg-black/30" />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 0%, transparent 20%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.3) 45%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.85) 75%, black 90%)",
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />
            </div>
            <AuroraBackground />

            {/* 3D ring background — COMMENTED OUT: temporarily disabled */}
            {/* <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
              <HeroScene probability={0.5} scrollRef={scrollRef} />
            </div> */}

        {/* Geo-restriction Banner — single-line static */}
        <div
          className="relative z-10 flex items-center justify-center gap-2 py-1.5"
          style={{
            backgroundColor: 'rgba(248, 113, 113, 0.06)',
            borderBottom: '1px solid rgba(248, 113, 113, 0.12)',
          }}
        >
          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: T.red }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="text-[11px] font-medium" style={{ color: T.red }}>
            Prediction market trading unavailable in restricted regions
          </span>
        </div>

        {/* Full-width section above the two-column layout */}
        <div className="relative z-10 w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-6">
          {/* Error display */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-center justify-center gap-3 p-3 rounded-xl"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              <span className="text-sm" style={{ color: '#EF4444' }}>
                {error}
              </span>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => refetch()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{
                  backgroundColor: AX.accent,
                  color: '#fff',
                }}
              >
                <HiOutlineRefresh className="w-4 h-4" />
                Retry
              </motion.button>
            </motion.div>
          )}

          {/* Page heading */}
          <div className="flex items-center gap-3 mb-4">
            <h1
              className="text-2xl md:text-3xl font-bold tracking-tight"
              style={{ color: T.text, letterSpacing: '-0.03em' }}
            >
              Predictions
            </h1>
            <span
              className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest"
              style={{ backgroundColor: T.greenSoft, color: T.accent }}
            >
              Beta
            </span>
          </div>

          {/* AI Creator + Insights Panel — side by side on xl */}
          <div className="flex gap-6 mb-4 items-start">
            <div className="flex-1 min-w-0">
              <TalarionCreate authToken={user?.bearerToken} />
            </div>
            <div className="hidden xl:block w-[340px] flex-shrink-0">
              <HomepageInsightPanel docked />
            </div>
          </div>
        </div>

        {/* Two-column layout: main content (no sidebar — it's above now) */}
        <div className="relative z-10 flex-1 w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pb-4 md:pb-6">
        <main className="flex-1 min-w-0">

          {/* Featured Market Hero — COMMENTED OUT for now
          {featuredMarket && !searchQuery && (
            <div className="mb-6">
              <HeroMarket
                market={featuredMarket}
                liveYesPrice={
                  (() => {
                    const tokenId = tokenIdByTicker.get(featuredMarket.ticker);
                    return tokenId ? livePrices.get(tokenId)?.price : undefined;
                  })()
                }
              />
            </div>
          )}
          */}

          {/* Favorites Carousel */}
          {favorites.length > 0 && allMarkets.length > 0 && (
            <FavoritesCarousel
              favorites={favorites}
              markets={allMarkets}
              onRemoveFavorite={removeFavorite}
            />
          )}

          {/* Markets Grid */}
          <div className="mb-8">
            {/* Section Header for Grid View */}
            {!isLoading && mergedFilteredMarkets.length > 0 && (
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <HiOutlineViewGrid className="w-5 h-5" style={{ color: AX.accent }} />
                  <h2 className="text-lg font-semibold" style={{ color: AX.text }}>
                    {searchQuery ? `Search Results` : selectedCategory !== 'all' ? `${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} Markets` : 'All Markets'}
                  </h2>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: `${AX.accent}15`, color: AX.accent }}
                  >
                    {selectedCategory === 'all'
                      ? (totalAvailable > 0 ? totalAvailable.toLocaleString() : activeMarkets.length)
                      : activeMarkets.length.toLocaleString()
                    }
                  </span>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-1">
                {[...Array(8)].map((_, i) => (
                  <SkeletonShimmer key={i} />
                ))}
              </div>
            ) : mergedFilteredMarkets.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-24 px-6 rounded-2xl"
                style={{
                  backgroundColor: T.surface,
                  border: `1px solid ${T.border}`,
                }}
              >
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center mb-5"
                  style={{ backgroundColor: T.greenSoft }}
                >
                  <HiOutlineSearch className="w-7 h-7" style={{ color: T.muted }} />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: T.text }}>
                  No markets found
                </h3>
                <p className="text-sm text-center max-w-md mb-5" style={{ color: T.muted }}>
                  {searchQuery
                    ? `No markets matching "${searchQuery}". Try searching for crypto, politics, or sports.`
                    : "No markets in this category yet. Check back soon!"}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: T.greenSoft,
                      color: T.accent,
                    }}
                  >
                    Clear search
                  </button>
                )}
              </motion.div>
            ) : (
              <>
                {/* Active Markets Grid */}
                {activeMarkets.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-1">
                    {activeMarkets.map((market, index) => {
                      const tokenId = tokenIdByTicker.get(market.ticker);
                      const liveEntry = tokenId ? livePrices.get(tokenId) : undefined;
                      return (
                        <PredictionCardV2
                          key={`${market.source || 'dflow'}-${market.ticker}`}
                          market={market}
                          index={index}
                          showSource={dataSource === 'all'}
                          isFavorite={isFavorite(market.ticker, market.source || 'dflow')}
                          onToggleFavorite={toggleFavorite}
                          liveYesPrice={liveEntry?.price}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Load More Markets */}
                {hasMore && !searchQuery && (
                  <div className="flex flex-col items-center gap-2 mt-6">
                    <button
                      onClick={loadMore}
                      disabled={isFetchingMore}
                      className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))',
                        border: '1px solid rgba(99,102,241,0.25)',
                        color: '#a5b4fc',
                      }}
                    >
                      {isFetchingMore ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Loading...
                        </span>
                      ) : (
                        `Load More Markets`
                      )}
                    </button>
                    <span className="text-xs" style={{ color: AX.muted }}>
                      {selectedCategory === 'all'
                        ? `Showing ${(activeMarkets.length + endedMarkets.length).toLocaleString()} of ${totalAvailable.toLocaleString()} markets`
                        : `Showing ${activeMarkets.length.toLocaleString()} ${selectedCategory} markets — load more to discover more`
                      }
                    </span>
                  </div>
                )}

                {/* Ended Markets Collapsible Section */}
                {endedMarkets.length > 0 && (
                  <div className="mt-6">
                    <button
                      onClick={() => setShowEndedMarkets(!showEndedMarkets)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-white/[0.04]"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <HiOutlineLockClosed className="w-4 h-4" style={{ color: AX.muted }} />
                      <span className="text-sm font-medium" style={{ color: AX.muted }}>
                        Ended Events
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ backgroundColor: 'rgba(107,114,128,0.15)', color: AX.muted }}
                      >
                        {endedMarkets.length}
                      </span>
                      <svg
                        className={`w-4 h-4 ml-auto transition-transform duration-200 ${showEndedMarkets ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        style={{ color: AX.muted }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    <AnimatePresence>
                      {showEndedMarkets && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <div
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-1 pt-4"
                            style={{ opacity: 0.55, filter: 'saturate(0.4)' }}
                          >
                            {endedMarkets.map((market, index) => (
                              <PredictionCard
                                key={`${market.source || 'dflow'}-${market.ticker}`}
                                market={market}
                                index={index}
                                showSource={dataSource === 'all'}
                                isFavorite={isFavorite(market.ticker, market.source || 'dflow')}
                                onToggleFavorite={toggleFavorite}
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Curated Sections — below the grid for discovery */}
          {!searchQuery && selectedCategory === 'all' && allMarkets.length > 0 && (
            <div className="mb-8">
              <CuratedSections
                markets={allMarkets}
                onToggleFavorite={toggleFavorite}
                isFavorite={isFavorite}
              />
            </div>
          )}

          {/* Portfolio Section — COMMENTED OUT for now
          {user?.bearerToken && (
            <div className="mb-6">
              <div
                className="rounded-2xl overflow-hidden backdrop-blur-xl"
                style={{
                  backgroundColor: 'rgba(12, 14, 18, 0.75)',
                  border: `1px solid ${T.border}`,
                }}
              >
                <button
                  onClick={() => setShowPortfolio(!showPortfolio)}
                  className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <HiOutlineCollection className="w-5 h-5" style={{ color: AX.accent }} />
                    <span className="text-sm font-medium" style={{ color: AX.text }}>
                      My Portfolio
                    </span>
                  </div>
                  <svg
                    className={`w-5 h-5 transition-transform duration-200 ${showPortfolio ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    style={{ color: AX.muted }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showPortfolio && (
                  <div
                    className="px-4 pb-4 pt-2"
                    style={{ borderTop: `1px solid ${AX.border}` }}
                  >
                    <UnifiedPortfolio
                      authToken={user.bearerToken}
                      walletAddress={primaryWalletAddresses?.ethereum}
                      onClaimSuccess={refetch}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          */}

          {/* Footer CTA */}
          <div
            className="relative rounded-2xl p-8 md:p-10 overflow-hidden"
            style={{
              backgroundColor: T.surface,
              border: `1px solid ${T.border}`,
            }}
          >
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-center md:text-left">
                <h3
                  className="text-lg md:text-xl font-bold mb-1.5"
                  style={{ color: T.text, letterSpacing: '-0.02em' }}
                >
                  Don't see what you're looking for?
                </h3>
                <p className="text-sm max-w-md" style={{ color: T.muted }}>
                  Join our community to suggest new prediction markets.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <a
                  href="https://t.me/interstateso"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:opacity-90"
                  style={{ backgroundColor: '#26A5E4', color: '#fff' }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                  Telegram
                </a>
                <a
                  href="https://x.com/interstatefi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:opacity-90"
                  style={{
                    backgroundColor: T.surface,
                    color: T.text,
                    border: `1px solid ${T.border}`,
                  }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Follow
                </a>
              </div>
            </div>
          </div>

          {/* Bottom padding */}
          <div className="h-16 md:h-20" />
        </main>

        {/* AI Insights sidebar moved to top section alongside TalarionCreate */}
        </div>

        {/* Floating AI panel — hidden on xl+ where docked version is shown */}
        <div className="xl:hidden">
          <HomepageInsightPanel />
        </div>

        <Footer />
          </div>
        </div>
      </div>

      <style jsx global>{`
        /* Hide scrollbar for category filter */
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }

        /* Line clamp utility */
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* AI compact bar shimmer */
        @keyframes shimmer-ai {
          0% { background-position: 200% 0; }
          50% { background-position: 0% 0; }
          100% { background-position: 200% 0; }
        }

        /* Nebula drift — slow floating motion */
        @keyframes nebula-drift {
          0% { transform: translateX(-50%) translateY(0) scale(1); }
          33% { transform: translateX(-48%) translateY(8px) scale(1.03); }
          66% { transform: translateX(-52%) translateY(-5px) scale(0.97); }
          100% { transform: translateX(-50%) translateY(0) scale(1); }
        }
      `}</style>
    </PinGate>
  );
}
