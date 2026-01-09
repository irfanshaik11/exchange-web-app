import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineLightningBolt, HiOutlineSearch, HiOutlineRefresh } from 'react-icons/hi';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import {
  PredictionCard,
  PredictionCardSkeleton,
  CategoryFilter,
  SortFilter,
  FeaturedMarket,
  StatsBar,
  type PredictionMarket,
  type SortOption,
} from '../../components/predictions';
import useDFlowMarkets from '~/hooks/useDFlowMarkets';

// Vibrant color palette
const AX = {
  bg: "#0a0b0d",
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
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSort, setSelectedSort] = useState<SortOption>('hot');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch markets from DFlow API
  const {
    markets: dflowMarkets,
    isLoading,
    error,
    refetch,
    totalVolume: apiTotalVolume,
    totalMarkets,
  } = useDFlowMarkets({
    enabled: true,
    limit: 100,
    refreshInterval: 30000, // Refresh every 30 seconds
  });

  // Use API markets or fallback
  const allMarkets = useMemo(() => {
    if (dflowMarkets.length > 0) return dflowMarkets;
    if (isLoading) return FALLBACK_MARKETS;
    return [];
  }, [dflowMarkets, isLoading]);

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

    // Sort
    switch (selectedSort) {
      case 'hot':
        markets.sort((a, b) => b.volume24h - a.volume24h);
        break;
      case 'new':
        markets.sort((a, b) => new Date(b.closesAt).getTime() - new Date(a.closesAt).getTime());
        break;
      case 'ending':
        markets.sort((a, b) => new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime());
        break;
      case 'volume':
        markets.sort((a, b) => b.totalVolume - a.totalVolume);
        break;
    }

    return markets;
  }, [allMarkets, selectedCategory, selectedSort, searchQuery]);

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

      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: AX.bg }}
      >
        <Header />

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-6">
              <div className="flex items-center gap-4">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", bounce: 0.4, delay: 0.1 }}
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${AX.accent}30, ${AX.accent}10)`,
                    border: `1px solid ${AX.accent}40`,
                  }}
                >
                  <HiOutlineLightningBolt className="w-6 h-6" style={{ color: AX.accent }} />
                </motion.div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl md:text-3xl font-bold" style={{ color: AX.text }}>
                      Predictions
                    </h1>
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", bounce: 0.5, delay: 0.3 }}
                      className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{
                        backgroundColor: `${AX.yellow}18`,
                        color: AX.yellow,
                        border: `1px solid ${AX.yellow}40`,
                      }}
                    >
                      Beta
                    </motion.span>
                  </div>
                  <p className="text-sm mt-0.5" style={{ color: AX.muted }}>
                    Trade on real-world events
                  </p>
                </div>
              </div>

              {/* Search */}
              <div className="relative w-full lg:w-80">
                <input
                  type="text"
                  placeholder="Search markets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-3 pl-11 rounded-xl text-sm transition-all duration-200 outline-none focus:ring-2 focus:ring-opacity-50"
                  style={{
                    backgroundColor: AX.surface,
                    border: `1px solid ${AX.border}`,
                    color: AX.text,
                  }}
                />
                <HiOutlineSearch
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: AX.muted }}
                />
              </div>
            </div>

            {/* Stats Bar */}
            <StatsBar
              totalMarkets={allMarkets.length}
              totalVolume={totalVolume}
              activeTraders={12_450}
            />

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
          </motion.div>

          {/* Featured Market */}
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

          {/* Filters - Centered and Horizontally Scrollable */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-6"
          >
            <div className="flex justify-center">
              <div
                className="inline-flex items-center gap-3 p-1.5 rounded-xl overflow-x-auto scrollbar-hide max-w-full"
                style={{
                  backgroundColor: AX.surface,
                  border: `1px solid ${AX.border}`,
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
            </div>
          </motion.div>

          {/* Markets Grid */}
          <div className="mb-8">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <PredictionCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredMarkets.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16 px-4 rounded-2xl"
                style={{
                  backgroundColor: AX.surface,
                  border: `1px solid ${AX.border}`,
                }}
              >
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${AX.muted}15` }}
                >
                  <HiOutlineSearch className="w-8 h-8" style={{ color: AX.muted }} />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: AX.text }}>
                  No markets found
                </h3>
                <p className="text-sm text-center max-w-md" style={{ color: AX.muted }}>
                  {searchQuery
                    ? `No markets matching "${searchQuery}". Try a different search term.`
                    : "No markets in this category yet. Check back soon!"}
                </p>
              </motion.div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${selectedCategory}-${selectedSort}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                >
                  {filteredMarkets.map((market, index) => (
                    <PredictionCard key={market.ticker} market={market} index={index} />
                  ))}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* Footer CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="rounded-2xl p-6 md:p-8 text-center"
            style={{
              background: `linear-gradient(135deg, ${AX.surface} 0%, ${AX.surface2} 100%)`,
              border: `1px solid ${AX.border}`,
            }}
          >
            <h3 className="text-lg md:text-xl font-bold mb-2" style={{ color: AX.text }}>
              Don't see what you're looking for?
            </h3>
            <p className="text-sm mb-4 max-w-lg mx-auto" style={{ color: AX.muted }}>
              We're constantly adding new markets. Join our community to suggest new predictions.
            </p>
            <motion.a
              href="https://discord.gg/sACYQmCsTJ"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all"
              style={{
                backgroundColor: '#5865F2',
                color: '#fff',
              }}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Join Discord
            </motion.a>
          </motion.div>

          {/* Bottom padding */}
          <div className="h-16 md:h-20" />
        </main>

        <Footer />
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
      `}</style>
    </>
  );
}
