import React, { useState, useMemo, useEffect } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineSearch,
  HiOutlineRefresh,
  HiOutlineLockClosed,
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
  PredictionsTopNav,
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
import useNavLayout from '~/hooks/useNavLayout';
import { checkPolymarketGeoblock, type PolymarketGeoblock } from '../../utils/api';

// Sort tab config
const SORT_TABS: { id: SortOption; label: string }[] = [
  { id: 'hot', label: 'Trending' },
  { id: 'new', label: 'New' },
  { id: 'ending', label: 'Ending Soon' },
  { id: 'volume', label: 'Top Volume' },
];

export default function PredictionsPage() {
  const { user, primaryWalletAddresses } = useUser();
  const { layout, toggle: toggleLayout, mounted: layoutMounted } = useNavLayout();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSort, setSelectedSort] = useState<SortOption>('hot');
  const [searchQuery, setSearchQuery] = useState('');
  const [serverSearchResults, setServerSearchResults] = useState<UnifiedPredictionMarket[]>([]);
  const [marketFilters, setMarketFilters] = useState<MarketFilterState>(DEFAULT_FILTERS);
  const [showEndedMarkets, setShowEndedMarkets] = useState(false);
  const [dataSource] = useState<PredictionDataSource>('polymarket');
  const [visibleCardCount, setVisibleCardCount] = useState(24);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [geoblockStatus, setGeoblockStatus] = useState<PolymarketGeoblock | null>(null);

  // IP-based geoblock check (UI banner only; backend enforces on trade)
  // NOTE: backend endpoint can return blocked=false in dev (proxy/localhost IP),
  // so we do a pure client-side geo check via a free public API. Revert to the
  // backend-based version below if we ever want a single source of truth.
  // useEffect(() => {
  //   checkPolymarketGeoblock()
  //     .then((res) => { if (res.success) setGeoblockStatus(res.data); })
  //     .catch((err) => console.warn('[Predictions] Geoblock check failed:', err?.message));
  // }, []);
  useEffect(() => {
    // Try two free CORS-friendly providers in sequence so the label is resilient
    // to one going down. Always set state on success (no blocklist gate) — the
    // banner is always visible; this just personalizes the country name.
    const codeToName = (code: string) => {
      try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch { return code; }
    };
    const apply = (ip: string, code: string) => {
      if (!code) return;
      setGeoblockStatus({ allowed: false, blocked: true, ip, country: codeToName(code.toUpperCase()), region: '' });
    };
    fetch('https://api.country.is/')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`country.is ${r.status}`)))
      .then((d: { ip?: string; country?: string }) => apply(d.ip || '', (d.country || '').toUpperCase()))
      .catch(() =>
        fetch('https://ipapi.co/json/')
          .then((r) => r.ok ? r.json() : Promise.reject(new Error(`ipapi ${r.status}`)))
          .then((d: { ip?: string; country_code?: string }) => apply(d.ip || '', (d.country_code || '').toUpperCase()))
          .catch((err) => console.warn('[Predictions] Geo check failed:', err?.message)),
      );
  }, []);

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
        <title>Prediction Markets | Interstate</title>
        <meta name="description" content="Trade on real-world prediction markets." />
      </Head>

      <div className="min-h-screen flex flex-col" style={{ backgroundColor: T.bg, color: T.text }}>
        {/* Header */}
        <div className="relative z-[10000]">
          <Header />
        </div>

        {/* Rounded content wrapper — slight inset from viewport edges */}
        <div className="flex-1 flex flex-col rounded-t-2xl border border-white/[0.06] overflow-hidden mx-2 mt-3">

        {/* Restricted regions — discreet pill notice inside the card (IP-aware label) */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="inline-flex items-center justify-center gap-1.5 px-8 py-1 rounded-full border border-red-500/25 bg-red-500/[0.08]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="text-[10.5px] font-medium text-red-400/90">
              {geoblockStatus?.blocked && geoblockStatus.country
                ? `Trading unavailable in ${geoblockStatus.country}`
                : 'Trading unavailable in restricted regions'}
            </span>
          </div>
        </div>

        {/* Navigation — sidebar or top bar based on user preference */}
        {!layoutMounted ? (
          // Render top nav placeholder during hydration to avoid layout flash
          <PredictionsTopNav
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            layout="top"
            onToggleLayout={toggleLayout}
          />
        ) : layout === 'left' ? (
          <PredictionsSidebar
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            onToggleLayout={toggleLayout}
          />
        ) : (
          <PredictionsTopNav
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            layout={layout}
            onToggleLayout={toggleLayout}
          />
        )}

        {/* Main Content — offset by sidebar width when using left layout */}
        <div
          className={`flex-1 flex flex-col ${layout === 'left' ? 'md:ml-[56px]' : ''}`}
          style={{ paddingTop: 0 }}
        >
          {/* Sort bar row 1: tabs + count */}
          <div
            className="flex items-center px-6 overflow-x-auto scrollbar-hide"
            style={{ borderBottom: `1px solid ${T.border}` }}
          >
            {SORT_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setSelectedSort(tab.id); setAiDrawerOpen(false); }}
                className="relative flex-shrink-0 px-4 py-3 text-[13px] font-medium"
                style={{
                  color: selectedSort === tab.id && !aiDrawerOpen ? T.text : T.muted,
                }}
              >
                {tab.label}
                {selectedSort === tab.id && !aiDrawerOpen && (
                  <motion.div
                    layoutId="sort-tab-underline"
                    className="absolute bottom-0 left-2 right-2 h-[2px]"
                    style={{
                      backgroundColor: T.accent,
                      borderRadius: 1,
                      boxShadow: '0 1px 8px rgba(59, 130, 246, 0.3)',
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}

            {/* Separator */}
            <div className="w-px h-5 mx-1 flex-shrink-0" style={{ backgroundColor: T.border }} />

            {/* AI Insights — iridescent border pill */}
            <div className="relative flex-shrink-0 my-1.5 ml-2 rounded-full" style={{ padding: 1.5 }}>
              <div className="absolute inset-0 rounded-full" style={{ background: aiDrawerOpen ? 'linear-gradient(270deg, #8B5CF6, #6366F1, #3B82F6, #10B981, #3B82F6, #8B5CF6)' : 'linear-gradient(270deg, rgba(139,92,246,0.5), rgba(59,130,246,0.4), rgba(16,185,129,0.5), rgba(59,130,246,0.4), rgba(139,92,246,0.5))', backgroundSize: '300% 100%', animation: 'shimmer-ai 4s ease-in-out infinite' }} />
              <button
                onClick={() => setAiDrawerOpen(!aiDrawerOpen)}
                className="relative flex items-center justify-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-semibold"
                style={{ background: aiDrawerOpen ? 'rgba(10,10,14,0.85)' : 'rgba(16,17,20,0.92)', transition: 'all 200ms ease' }}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                  <defs>
                    <linearGradient id="ai-home-sparkle" x1="1" y1="1" x2="15" y2="15">
                      <stop stopColor="#8B5CF6"/><stop offset="0.5" stopColor="#3B82F6"/><stop offset="1" stopColor="#10B981"/>
                    </linearGradient>
                  </defs>
                  <path d="M8 0.5L9.2 5.8L14 7L9.2 8.2L8 13.5L6.8 8.2L2 7L6.8 5.8L8 0.5Z" fill={aiDrawerOpen ? 'url(#ai-home-sparkle)' : 'rgba(160,170,190,0.6)'}/>
                  <path d="M13 1L13.5 3L15.5 3.5L13.5 4L13 6L12.5 4L10.5 3.5L12.5 3L13 1Z" fill={aiDrawerOpen ? 'url(#ai-home-sparkle)' : 'rgba(160,170,190,0.4)'} opacity="0.7"/>
                </svg>
                {aiDrawerOpen ? (
                  <span style={{ background: 'linear-gradient(90deg, #8B5CF6, #6366F1, #3B82F6, #10B981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AI Insights</span>
                ) : (
                  <span style={{ color: 'rgba(160,170,190,0.8)' }}>AI Insights</span>
                )}
              </button>
            </div>
            {!isLoading && (
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-full ml-1 flex-shrink-0"
                style={{ color: T.muted, backgroundColor: 'rgba(255,255,255,0.04)' }}
              >
                {activeMarkets.length.toLocaleString()}
              </span>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Right: search + actions */}
            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
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
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-[12px] outline-none placeholder-neutral-500 w-20 focus:w-36 transition-all duration-200"
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

              <MarketFilters
                filters={marketFilters}
                onFiltersChange={setMarketFilters}
              />

              {/* AI Insights toggle is now in the sort tabs row */}
            </div>
          </div>

          {/* Predictions AI — full width */}
          <div className="px-6 py-3" id="ai-predictions-section">
            <TalarionCreate authToken={user?.bearerToken} />
          </div>

          {/* Content Area */}
          <div className="flex-1 px-6 py-4 relative">
            {/* Ambient top gradient — barely visible blue wash for depth */}
            <div
              className="absolute top-0 left-0 right-0 pointer-events-none z-0"
              style={{
                height: '40vh',
                background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(59, 130, 246, 0.04) 0%, transparent 100%)',
              }}
            />
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

            {/* Main content area */}
            <div>

            {/* AI Insights — full-width view when tab is active */}
            {aiDrawerOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="mb-5 rounded-xl overflow-hidden"
                style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}` }}
              >
                <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${T.border}` }}>
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ai-v-sparkle" x1="3" y1="2" x2="22" y2="21"><stop stopColor="#8B5CF6"/><stop offset="0.5" stopColor="#3B82F6"/><stop offset="1" stopColor="#10B981"/></linearGradient></defs><path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="url(#ai-v-sparkle)"/></svg>
                    <span className="text-[14px] font-semibold" style={{ color: T.text }}>AI Market Pulse</span>
                  </div>
                  <button onClick={() => setAiDrawerOpen(false)} className="text-[12px] font-medium px-3 py-1 rounded-lg" style={{ color: T.textSecondary, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}` }}>
                    Back to Markets
                  </button>
                </div>
                <div className="p-5">
                  <HomepageInsightPanel docked chromeless />
                </div>
              </motion.div>
            )}

            {/* Loading State */}
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className="rounded-xl animate-pulse flex flex-col p-4 gap-3"
                    style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, height: 220 }}
                  >
                    <div className="flex justify-between">
                      <div className="h-5 w-16 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
                      <div className="h-4 w-14 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }} />
                    </div>
                    <div className="h-4 w-full rounded" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
                    <div className="h-4 w-3/4 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }} />
                    <div className="flex-1" />
                    <div className="flex justify-between items-end">
                      <div className="h-7 w-16 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
                      <div className="h-5 w-16 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }} />
                    </div>
                    <div className="h-px w-full" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
                    <div className="flex justify-between">
                      <div className="h-3 w-12 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }} />
                      <div className="h-3 w-16 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }} />
                    </div>
                  </div>
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
                  style={{ backgroundColor: T.bgCard }}
                >
                  <HiOutlineSearch className="w-6 h-6" style={{ color: T.muted }} />
                </div>
                <h3 className="text-[16px] font-semibold mb-1.5" style={{ color: T.text }}>
                  No markets found
                </h3>
                <p className="text-[13px] text-center max-w-md mb-4" style={{ color: T.textSecondary }}>
                  {searchQuery
                    ? `No markets matching "${searchQuery}". Try a different search term.`
                    : "No markets in this category yet. Check back soon or browse Trending markets."}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="px-4 py-2 rounded-lg text-[13px] font-medium"
                    style={{ backgroundColor: T.accentSoft, color: T.accent }}
                  >
                    Clear search
                  </button>
                )}
              </motion.div>
            ) : (
              <>
                {/* Section header */}
                {activeMarkets.length > 0 && (
                  <div className="flex items-center justify-between mb-4">
                    <h2 style={{ fontSize: 16, fontWeight: 600, color: T.text }}>
                      {selectedSort === 'hot' ? 'Trending' : selectedSort === 'new' ? 'Newest' : selectedSort === 'ending' ? 'Ending Soon' : 'Top Volume'} Markets
                    </h2>
                    <span style={{ fontSize: 13, color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
                      {activeMarkets.length.toLocaleString()} markets
                    </span>
                  </div>
                )}

                {/* Market Grid */}
                {activeMarkets.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {activeMarkets.slice(0, visibleCardCount).map((market, index) => (
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
                        backgroundColor: T.bgCard,
                        border: `1px solid ${T.border}`,
                        color: T.text,
                        transition: 'all 150ms ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = T.borderHover;
                        e.currentTarget.style.backgroundColor = T.bgCardHover;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = T.border;
                        e.currentTarget.style.backgroundColor = T.bgCard;
                      }}
                    >
                      {isFetchingMore ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Loading more...
                        </span>
                      ) : 'Show More Markets'}
                    </button>
                    <span className="text-[12px]" style={{ color: T.muted }}>
                      Showing {Math.min(visibleCardCount, activeMarkets.length).toLocaleString()} of {totalAvailable.toLocaleString()} markets
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

            </div>

            {/* Footer CTA */}
            <div
              className="mt-12 py-10 text-center rounded-2xl"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%)',
                borderTop: `1px solid ${T.border}`,
              }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 600, color: T.text, marginBottom: 8 }}>
                Join the Community
              </h3>
              <p className="text-[14px] mb-6" style={{ color: T.textSecondary }}>
                Get market insights, discuss predictions, and stay ahead.
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
                  X
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
        @keyframes shimmer-ai {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .shimmer-ai-anim { animation: none !important; }
        }
      `}</style>
    </PinGate>
  );
}
