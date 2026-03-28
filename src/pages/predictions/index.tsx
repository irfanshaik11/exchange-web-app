import React, { useState, useMemo, useEffect } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineSearch,
  HiOutlineRefresh,
  HiOutlineLockClosed,
  HiOutlineFilter,
  HiOutlineViewGrid,
} from 'react-icons/hi';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import {
  PredictionCard,
  MarketFilters,
  applyMarketFilters,
  DEFAULT_FILTERS,
  SkeletonShimmer,
  TalarionCreate,
  PredictionsSidebar,
  MarketRow,
  FeaturedHero,
  MarketCard,
  T,
  type PredictionMarket,
  type SortOption,
  type MarketFilterState,
  categoryConfig,
} from '../../components/predictions';
import PinGate from '../../components/predictions/PinGate';
import { useUser } from '../../components/UserContext';
import useUnifiedPredictionMarkets from '~/hooks/useUnifiedPredictionMarkets';
import type { UnifiedPredictionMarket } from '~/hooks/useUnifiedPredictionMarkets';
import usePredictionFavorites from '~/hooks/usePredictionFavorites';
import type { PredictionDataSource } from '~/components/predictions/DataSourceSwitcher';
import { HomepageInsightPanel } from '~/components/insights/HomepageInsightPanel';

// Sort tab config
const SORT_TABS: { id: SortOption; label: string }[] = [
  { id: 'hot', label: 'Trending' },
  { id: 'new', label: 'New' },
  { id: 'ending', label: 'Ending Soon' },
  { id: 'volume', label: 'Top Volume' },
];

export default function PredictionsPage() {
  const { user, primaryWalletAddresses } = useUser();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSort, setSelectedSort] = useState<SortOption>('hot');
  const [searchQuery, setSearchQuery] = useState('');
  const [serverSearchResults, setServerSearchResults] = useState<UnifiedPredictionMarket[]>([]);
  const [marketFilters, setMarketFilters] = useState<MarketFilterState>(DEFAULT_FILTERS);
  const [showEndedMarkets, setShowEndedMarkets] = useState(false);
  const [dataSource] = useState<PredictionDataSource>('polymarket');
  const [visibleCardCount, setVisibleCardCount] = useState(24);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch markets
  const {
    markets: unifiedMarkets,
    isLoading,
    error,
    refetch,
    totalAvailable,
    hasMore,
    loadMore,
    isFetchingMore,
  } = useUnifiedPredictionMarkets({
    source: dataSource,
    limit: 500,
    refreshInterval: 30000,
  });

  const { favorites, isFavorite, toggleFavorite, removeFavorite } = usePredictionFavorites();

  useEffect(() => { setVisibleCardCount(24); }, [selectedCategory, selectedSort, searchQuery]);

  // Markets processing (same logic as before)
  const allMarkets = useMemo(() => {
    const markets = unifiedMarkets || [];
    if (markets.length > 0) return markets;
    if (isLoading) return [];
    return [];
  }, [unifiedMarkets, isLoading]);

  const filteredMarkets = useMemo(() => {
    let markets = [...allMarkets];
    if (selectedCategory !== 'all') {
      markets = markets.filter((m) => m.category === selectedCategory);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      markets = markets.filter((m) =>
        m.title.toLowerCase().includes(query) ||
        m.ticker.toLowerCase().includes(query)
      );
    }
    markets = applyMarketFilters(markets, marketFilters);
    const statusPriority = (status: string) => {
      if (status === 'active') return 0;
      if (status === 'closed') return 1;
      return 2;
    };
    markets.sort((a, b) => {
      const statusDiff = statusPriority(a.status) - statusPriority(b.status);
      if (statusDiff !== 0) return statusDiff;
      switch (selectedSort) {
        case 'hot': return b.volume24h - a.volume24h;
        case 'new': return new Date(b.closesAt).getTime() - new Date(a.closesAt).getTime();
        case 'ending': return new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime();
        case 'volume': return b.totalVolume - a.totalVolume;
        default: return 0;
      }
    });
    return markets;
  }, [allMarkets, selectedCategory, selectedSort, searchQuery, marketFilters]);

  // Server-side search
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

  const mergedFilteredMarkets = useMemo(() => {
    const base = filteredMarkets || [];
    const server = serverSearchResults || [];
    if (server.length === 0) return base;
    const seen = new Set(base.map(m => m.ticker));
    const extra = server.filter(m => m?.ticker && !seen.has(m.ticker));
    return [...base, ...extra];
  }, [filteredMarkets, serverSearchResults]);

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
  }, [mergedFilteredMarkets]);

  return (
    <PinGate>
      <Head>
        <title>Predictions | Interstate</title>
        <meta name="description" content="Trade on real-world prediction markets." />
      </Head>

      <div className="min-h-screen flex flex-col" style={{ backgroundColor: T.bg, color: T.text }}>
        {/* Header */}
        <div className="relative z-[10000]">
          <Header />
        </div>

        {/* Sidebar */}
        <PredictionsSidebar
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />

        {/* Main Content — offset by sidebar width */}
        <div
          className="flex-1 flex md:ml-[56px]"
          style={{ paddingTop: 0 }}
        >
          {/* Left: All market content */}
          <div className="flex-1 min-w-0 flex flex-col">
          {/* Header Strip */}
          <div
            className="flex items-center justify-between px-6 h-12"
            style={{
              backgroundColor: T.bg,
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            <div className="flex items-center gap-4">
              <h1
                className="text-[18px] font-semibold"
                style={{ color: T.text, letterSpacing: '-0.3px' }}
              >
                Markets
              </h1>
              {!isLoading && (
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: T.greenSoft, color: T.accent }}
                >
                  {totalAvailable > 0 ? totalAvailable.toLocaleString() : activeMarkets.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${T.border}`,
                }}
              >
                <HiOutlineSearch className="w-3.5 h-3.5" style={{ color: searchQuery ? T.accent : T.muted }} />
                <input
                  type="text"
                  placeholder="Search markets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-[12px] outline-none placeholder-neutral-500 w-32 focus:w-48"
                  style={{ color: T.text }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-[11px]"
                    style={{ color: T.muted }}
                  >
                    ×
                  </button>
                )}
              </div>
              {/* Filter button */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="p-1.5 rounded-lg"
                style={{
                  backgroundColor: showFilters ? 'rgba(255,255,255,0.06)' : 'transparent',
                  color: T.muted,
                }}
              >
                <HiOutlineFilter className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Advanced filters dropdown */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-b"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.015)',
                  borderColor: T.border,
                }}
              >
                <div className="px-6 py-3">
                  <MarketFilters
                    filters={marketFilters}
                    onFiltersChange={setMarketFilters}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sort Tabs */}
          <div
            className="flex items-center gap-0 px-6"
            style={{ borderBottom: `1px solid ${T.border}` }}
          >
            {SORT_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedSort(tab.id)}
                className="relative px-4 py-3 text-[12px] font-medium"
                style={{
                  color: selectedSort === tab.id ? T.text : T.muted,
                }}
              >
                {tab.label}
                {selectedSort === tab.id && (
                  <motion.div
                    layoutId="sort-tab-underline"
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ backgroundColor: T.accent }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Content Area — subtle gradient from category color to black */}
          <div className="flex-1 px-6 py-4 relative">
            {/* Page-level gradient tint from featured market category */}
            {!isLoading && activeMarkets.length > 0 && (() => {
              const heroCategory = categoryConfig[(activeMarkets[0] as any)?.category] || { color: T.accent };
              return (
                <div
                  className="absolute top-0 left-0 right-0 h-[600px] pointer-events-none z-0"
                  style={{
                    background: `linear-gradient(180deg, ${heroCategory.color}06 0%, transparent 100%)`,
                  }}
                />
              );
            })()}

            {/* Error */}
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
                <span className="text-sm" style={{ color: '#EF4444' }}>{error}</span>
                <button
                  onClick={() => refetch()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: T.accent, color: '#fff' }}
                >
                  <HiOutlineRefresh className="w-4 h-4" />
                  Retry
                </button>
              </motion.div>
            )}

            {/* Restricted regions disclaimer */}
            <div
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl mb-4"
              style={{
                background: 'linear-gradient(135deg, rgba(248,113,113,0.06) 0%, rgba(248,113,113,0.03) 100%)',
                border: '1px solid rgba(248,113,113,0.12)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="text-[13px] font-medium" style={{ color: '#F87171' }}>
                Prediction market trading unavailable in restricted regions
              </span>
            </div>

            {/* AI Creator — full width, first thing user sees */}
            <div id="ai-predictions-section" className="mb-6">
              <TalarionCreate authToken={user?.bearerToken} />
            </div>

            {/* Featured Hero + AI Insights side by side on xl+ */}
            <div className="flex gap-4 mb-6 items-stretch">
              {/* Featured Hero — takes remaining space */}
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="text-[10px] font-bold tracking-[0.14em] uppercase"
                    style={{ color: T.muted }}
                  >
                    Featured Market
                  </span>
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${T.border}, transparent)` }} />
                </div>
                {!isLoading && activeMarkets.length > 0 && (
                  <div className="flex-1">
                    <FeaturedHero markets={activeMarkets} />
                  </div>
                )}
              </div>

              {/* AI Insights — right column on xl+, height matches hero */}
              <div className="hidden xl:flex xl:flex-col w-[360px] flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="text-[10px] font-bold tracking-[0.14em] uppercase"
                    style={{ color: T.muted }}
                  >
                    AI Market Pulse
                  </span>
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${T.border}, transparent)` }} />
                </div>
                <div className="flex-1 overflow-hidden rounded-xl" style={{ border: `1px solid ${T.border}` }}>
                  <div className="h-full overflow-y-auto scrollbar-hide">
                    <HomepageInsightPanel docked />
                  </div>
                </div>
              </div>
            </div>

            {/* AI Insights — full width on smaller screens */}
            <div className="xl:hidden mb-6">
              <HomepageInsightPanel docked />
            </div>

            {/* Loading State */}
            {isLoading ? (
              <div className="flex flex-col gap-2">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="h-14 rounded-[10px] animate-pulse"
                    style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                  />
                ))}
              </div>
            ) : mergedFilteredMarkets.length === 0 ? (
              /* Empty State */
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-24 px-6 rounded-xl"
                style={{
                  backgroundColor: T.surface,
                  border: `1px solid ${T.border}`,
                }}
              >
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: T.greenSoft }}
                >
                  <HiOutlineSearch className="w-6 h-6" style={{ color: T.muted }} />
                </div>
                <h3 className="text-base font-semibold mb-1.5" style={{ color: T.text }}>
                  No markets found
                </h3>
                <p className="text-[13px] text-center max-w-md mb-4" style={{ color: T.muted }}>
                  {searchQuery
                    ? `No markets matching "${searchQuery}".`
                    : "No markets in this category yet."}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="px-4 py-2 rounded-lg text-[13px] font-medium"
                    style={{ backgroundColor: T.greenSoft, color: T.accent }}
                  >
                    Clear search
                  </button>
                )}
              </motion.div>
            ) : (
              <>
                {/* Active Markets — Card Grid (skip first, shown in hero) */}
                {activeMarkets.length > 1 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {activeMarkets.slice(1, visibleCardCount + 1).map((market, index) => (
                      <MarketCard
                        key={`${market.source || 'dflow'}-${market.ticker}`}
                        market={market}
                        index={index}
                        isFavorite={isFavorite(market.ticker, market.source || 'dflow')}
                        onToggleFavorite={toggleFavorite}
                        tokenId={(market as UnifiedPredictionMarket).polymarketData?.yesTokenId}
                        showSource={dataSource === 'all'}
                      />
                    ))}
                  </div>
                )}

                {/* Load More */}
                {hasMore && !searchQuery && (
                  <div className="flex flex-col items-center gap-2 mt-6">
                    <button
                      onClick={() => { setVisibleCardCount(prev => prev + 24); loadMore(); }}
                      disabled={isFetchingMore}
                      className="px-5 py-2 rounded-lg text-[12px] font-medium disabled:opacity-50"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${T.border}`,
                        color: T.textSecondary,
                      }}
                    >
                      {isFetchingMore ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Loading...
                        </span>
                      ) : 'Load More Markets'}
                    </button>
                    <span className="text-[11px]" style={{ color: T.muted }}>
                      Showing {activeMarkets.length.toLocaleString()} of {totalAvailable.toLocaleString()} markets
                    </span>
                  </div>
                )}

                {/* Ended Markets */}
                {endedMarkets.length > 0 && (
                  <div className="mt-6">
                    <button
                      onClick={() => setShowEndedMarkets(!showEndedMarkets)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-[10px]"
                      style={{
                        backgroundColor: T.surface,
                        border: `1px solid ${T.border}`,
                      }}
                    >
                      <HiOutlineLockClosed className="w-4 h-4" style={{ color: T.muted }} />
                      <span className="text-[12px] font-medium" style={{ color: T.muted }}>
                        Ended Events
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{ backgroundColor: 'rgba(107,114,128,0.12)', color: T.muted }}
                      >
                        {endedMarkets.length}
                      </span>
                      <svg
                        className={`w-3.5 h-3.5 ml-auto transition-transform duration-200 ${showEndedMarkets ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        style={{ color: T.muted }}
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
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-col gap-2 pt-3" style={{ opacity: 0.55, filter: 'saturate(0.4)' }}>
                            {endedMarkets.map((market, index) => (
                              <MarketRow
                                key={`${market.source || 'dflow'}-${market.ticker}`}
                                market={market}
                                index={index + 100}
                                isFavorite={isFavorite(market.ticker, market.source || 'dflow')}
                                onToggleFavorite={toggleFavorite}
                                tokenId={(market as UnifiedPredictionMarket).polymarketData?.yesTokenId}
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

            {/* Footer CTA */}
            <div
              className="mt-10 py-8 text-center"
              style={{ borderTop: `1px solid ${T.border}` }}
            >
              <p className="text-[14px] mb-5" style={{ color: T.muted }}>
                Don't see what you're looking for? Join our community.
              </p>
              <div className="flex items-center justify-center gap-3">
                <a
                  href="https://t.me/interstateso"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-85"
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-85"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    color: T.text,
                    border: `1px solid ${T.border}`,
                  }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  X / Twitter
                </a>
              </div>
            </div>

            <div className="h-8" />
          </div>

          <Footer />
          </div>

        </div>
      </div>

      <style jsx global>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </PinGate>
  );
}
