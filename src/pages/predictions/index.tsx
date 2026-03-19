import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineSearch, HiOutlineRefresh, HiOutlineTrendingUp, HiOutlineViewGrid, HiOutlineCollection } from 'react-icons/hi';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import {
  PredictionCard,
  PredictionCardSkeleton,
  CategoryFilter,
  SortFilter,
  FeaturedMarket,
  StatsBar,
  MarketFilters,
  applyMarketFilters,
  DEFAULT_FILTERS,
  FavoritesCarousel,
  CuratedSections,
  UnifiedPortfolio,
  type PredictionMarket,
  type SortOption,
  type MarketFilterState,
} from '../../components/predictions';
import { useUser } from '../../components/UserContext';
import useUnifiedPredictionMarkets from '~/hooks/useUnifiedPredictionMarkets';
import usePredictionFavorites from '~/hooks/usePredictionFavorites';
import DataSourceSwitcher, { type PredictionDataSource } from '~/components/predictions/DataSourceSwitcher';

// Vibrant color palette
const AX = {
  bg: "#111214",
  surface: "#12141a",
  surface2: "#0e1012",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  // Vibrant saturated colors
  accent: "#4ADE80",
  accentGlow: "rgba(74, 222, 128, 0.2)",
  green: "#4ADE80",
  red: "#F87171",
  yellow: "#FBBF24",
  orange: "#FB923C",
  purple: "#818CF8",
  cyan: "#22D3EE",
  pink: "#F472B6",
};

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
  const [marketFilters, setMarketFilters] = useState<MarketFilterState>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<'curated' | 'grid'>('curated');
  const [showPortfolio, setShowPortfolio] = useState(true); // Default open to show winnings
  // TODO: dFlow is disabled for now - only Polymarket is active
  // const [dataSource, setDataSource] = useState<PredictionDataSource>('all');
  const [dataSource, setDataSource] = useState<PredictionDataSource>('polymarket');

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
  } = useUnifiedPredictionMarkets({
    source: dataSource,
    limit: 100,
    refreshInterval: 30000, // Refresh every 30 seconds
  });

  // Favorites management
  const { favorites, isFavorite, toggleFavorite, removeFavorite } = usePredictionFavorites();

  // Use API markets or fallback
  const allMarkets = useMemo(() => {
    if (unifiedMarkets.length > 0) return unifiedMarkets;
    if (isLoading) return FALLBACK_MARKETS;
    return [];
  }, [unifiedMarkets, isLoading]);

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
    <>
      <Head>
        <title>Predictions | Interstate</title>
        <meta name="description" content="Trade on real-world prediction markets. Bet on politics, crypto, sports, and more." />
      </Head>

      <div className="min-h-screen flex flex-col bg-[#050608] text-neutral-100">
        <div className="relative z-[10000]">
          <Header />
        </div>

        <div className="p-1 sm:p-1.5">
          {/* Rounded container with background - matches tracker */}
          <div className="relative min-h-[calc(100vh-80px)] overflow-hidden rounded-2xl border border-white/[0.06]">
            {/* Background image - same as tracker */}
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

        <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          {/* Geo-restriction Banner */}
          <div className="mb-4 rounded-xl overflow-hidden relative" style={{
            background: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.08) 50%, rgba(239,68,68,0.15) 100%)',
            border: '1px solid rgba(239,68,68,0.25)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 16px rgba(239,68,68,0.1)',
          }}>
            {/* Glossy overlay */}
            <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 50%)' }} />
            <div className="py-2 overflow-hidden relative">
              <div className="flex animate-marquee whitespace-nowrap">
                {[...Array(4)].map((_, i) => (
                  <span key={i} className="mx-8 text-[13px] font-medium inline-flex items-center gap-2" style={{ color: '#F87171' }}>
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    Trading on prediction markets is not available in your region due to regulatory restrictions
                    <span className="mx-4 text-red-400/40">•</span>
                    US users are restricted from trading on Polymarket via Interstate
                    <span className="mx-4 text-red-400/40">•</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Page Header */}
          <div className="mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden bg-white/[0.07] border border-white/[0.1] backdrop-blur-xl">
                  <Image
                    src="/interstate/logo.png"
                    alt="Interstate"
                    width={32}
                    height={32}
                    className="object-contain"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl md:text-3xl font-bold" style={{ color: AX.text }}>
                      Predictions
                    </h1>
                    <span
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        backgroundColor: `${AX.accent}15`,
                        color: AX.accent,
                        border: `1px solid ${AX.accent}30`,
                      }}
                    >
                      Beta
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <StatsBar
                      totalMarkets={allMarkets.length}
                      totalVolume={totalVolume}
                      activeTraders={12_450}
                    />
                  </div>
                </div>
              </div>

              {/* Search */}
              <div className="relative w-full lg:w-80 group">
                <input
                  type="text"
                  placeholder="Search markets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-3 pl-11 rounded-2xl text-sm transition-all duration-200 outline-none focus:ring-2 focus:ring-opacity-30 bg-white/[0.05] border border-white/[0.08] backdrop-blur-xl text-white placeholder-neutral-500"
                  style={{
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
                    // @ts-ignore
                    '--tw-ring-color': AX.accent,
                  }}
                />
                <HiOutlineSearch
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors"
                  style={{ color: searchQuery ? AX.accent : AX.muted }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                    style={{ color: AX.muted }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Error display with refresh button */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex items-center justify-center gap-3 p-3 rounded-xl"
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
          </div>

          {/* Unified Portfolio Section - Wallet balance, stats, positions, orders, history */}
          {user?.bearerToken && (
            <div className="mb-6">
              <div
                className="rounded-2xl overflow-hidden bg-white/[0.05] border border-white/[0.08] backdrop-blur-xl"
                style={{
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
                }}
              >
                {/* Portfolio Header - Clickable to expand/collapse */}
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

                {/* Portfolio Content */}
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

          {/* Featured Market - Hidden for now
          {featuredMarket && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mb-8"
            >
              <FeaturedMarket market={featuredMarket} />
            </motion.div>
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

          {/* Curated Sections (when in curated view and no search/filters) */}
          {viewMode === 'curated' && !searchQuery && selectedCategory === 'all' && allMarkets.length > 0 && (
            <div className="mb-8">
              <CuratedSections
                markets={allMarkets}
                onToggleFavorite={toggleFavorite}
                isFavorite={isFavorite}
              />
            </div>
          )}

          {/* Data Source Switcher */}
          {/* TODO: DataSourceSwitcher hidden - dFlow disabled for now
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mb-4 flex justify-center"
          >
            <DataSourceSwitcher
              source={dataSource}
              onSourceChange={setDataSource}
              dflowCount={dflowCount}
              polymarketCount={polymarketCount}
              showCounts={true}
            />
          </motion.div>
          */}

          {/* Filters - Centered with Horizontally Scrollable Categories/Sort */}
          <div className="mb-6">
            <div className="flex justify-center items-center gap-2">
              {/* Scrollable filter bar */}
              <div
                className="inline-flex items-center gap-3 p-1.5 rounded-2xl overflow-x-auto scrollbar-hide max-w-full bg-white/[0.05] border border-white/[0.08] backdrop-blur-xl"
                style={{
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
                }}
              >
                <CategoryFilter
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                  categoryCounts={categoryCounts}
                />
                {/* Divider */}
                <div
                  className="w-px h-8 flex-shrink-0"
                  style={{ backgroundColor: AX.border }}
                />
                <SortFilter
                  selectedSort={selectedSort}
                  onSelectSort={setSelectedSort}
                />
              </div>
              {/* Advanced Filters - Outside scrollable area so popout isn't clipped */}
              <div
                className="flex-shrink-0 p-1.5 rounded-2xl bg-white/[0.05] border border-white/[0.08] backdrop-blur-xl"
              >
                <MarketFilters
                  filters={marketFilters}
                  onFiltersChange={setMarketFilters}
                />
              </div>

              {/* View Toggle */}
              <div
                className="flex-shrink-0 flex items-center gap-1 p-1.5 rounded-2xl bg-white/[0.05] border border-white/[0.08] backdrop-blur-xl"
              >
                <button
                  onClick={() => setViewMode('curated')}
                  className="p-2 rounded-lg transition-all"
                  style={{
                    backgroundColor: viewMode === 'curated' ? `${AX.accent}15` : 'transparent',
                    color: viewMode === 'curated' ? AX.accent : AX.muted,
                  }}
                  title="Curated sections"
                >
                  <HiOutlineCollection className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className="p-2 rounded-lg transition-all"
                  style={{
                    backgroundColor: viewMode === 'grid' ? `${AX.accent}15` : 'transparent',
                    color: viewMode === 'grid' ? AX.accent : AX.muted,
                  }}
                  title="Grid view"
                >
                  <HiOutlineViewGrid className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Markets Grid */}
          <div className="mb-8">
            {/* Section Header for Grid View */}
            {(viewMode === 'grid' || searchQuery || selectedCategory !== 'all') && !isLoading && filteredMarkets.length > 0 && (
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
                    {filteredMarkets.length}
                  </span>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-1">
                {[...Array(8)].map((_, i) => (
                  <PredictionCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredMarkets.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-20 px-6 rounded-2xl bg-white/[0.05] border border-white/[0.08] backdrop-blur-xl"
                style={{
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
                }}
              >
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
                  style={{
                    background: `linear-gradient(135deg, ${AX.accent}15 0%, ${AX.purple}15 100%)`,
                    border: `1px solid ${AX.border}`,
                  }}
                >
                  <HiOutlineSearch className="w-9 h-9" style={{ color: AX.muted }} />
                </div>
                <h3 className="text-xl font-bold mb-2" style={{ color: AX.text }}>
                  No markets found
                </h3>
                <p className="text-sm text-center max-w-md mb-5" style={{ color: AX.muted }}>
                  {searchQuery
                    ? `No markets matching "${searchQuery}". Try a different search term.`
                    : "No markets in this category yet. Check back soon!"}
                </p>
                {searchQuery && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSearchQuery('')}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: `${AX.accent}15`,
                      color: AX.accent,
                      border: `1px solid ${AX.accent}30`,
                    }}
                  >
                    Clear search
                  </motion.button>
                )}
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-1">
                  {filteredMarkets.map((market, index) => (
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
            )}
          </div>

          {/* Footer CTA */}
          <div
            className="relative rounded-2xl p-8 md:p-10 overflow-hidden bg-white/[0.05] border border-white/[0.08] backdrop-blur-xl"
            style={{
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
            }}
          >
            {/* Subtle gradient overlay */}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background: `radial-gradient(circle at 30% 50%, ${AX.accent}10 0%, transparent 50%), radial-gradient(circle at 70% 50%, ${AX.purple}10 0%, transparent 50%)`,
              }}
            />

            <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                  <HiOutlineTrendingUp className="w-5 h-5" style={{ color: AX.accent }} />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: AX.accent }}>
                    Community
                  </span>
                </div>
                <h3 className="text-xl md:text-2xl font-bold mb-2" style={{ color: AX.text }}>
                  Don't see what you're looking for?
                </h3>
                <p className="text-sm max-w-md" style={{ color: AX.muted }}>
                  Join our community to suggest new prediction markets and stay updated on the latest features.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <motion.a
                  href="https://discord.gg/sACYQmCsTJ"
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all shadow-lg"
                  style={{
                    backgroundColor: '#5865F2',
                    color: '#fff',
                    boxShadow: '0 4px 20px rgba(88, 101, 242, 0.3)',
                  }}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  Join Discord
                </motion.a>
                <motion.a
                  href="https://x.com/interstatefi"
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    backgroundColor: AX.surface2,
                    color: AX.text,
                    border: `1px solid ${AX.border}`,
                  }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Follow
                </motion.a>
              </div>
            </div>
          </div>

          {/* Bottom padding */}
          <div className="h-16 md:h-20" />
        </main>

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

        /* Marquee animation */
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </>
  );
}
