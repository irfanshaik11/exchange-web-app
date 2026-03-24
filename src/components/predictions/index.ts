export { default as PredictionCard, PredictionCardSkeleton, categoryConfig } from './PredictionCard';
export type { PredictionMarket } from './PredictionCard';
export { default as CategoryFilter, SortFilter } from './CategoryFilter';
export type { Category, SortOption } from './CategoryFilter';
export { default as FeaturedMarket } from './FeaturedMarket';
export { default as StatsBar } from './StatsBar';
export { default as PredictionChart } from './PredictionChart';
export { default as PredictionPositions } from './PredictionPositions';
export { default as DataSourceSwitcher, SourceBadge } from './DataSourceSwitcher';
export type { PredictionDataSource } from './DataSourceSwitcher';
export { default as MarketFilters, applyMarketFilters, DEFAULT_FILTERS } from './MarketFilters';
export type { MarketFilterState } from './MarketFilters';
export { default as FavoritesCarousel } from './FavoritesCarousel';
export { default as MiniSparkline } from './MiniSparkline';
export { default as CuratedSections } from './CuratedSections';
export { default as PolygonWalletCard, PolygonBalanceInline } from './PolygonWalletCard';
export { default as UnifiedPortfolio } from './UnifiedPortfolio';
export { PredictionTheme, PortfolioTheme, T } from './theme';

// V2 components
export { default as PredictionCardV2 } from './PredictionCardV2';
export { default as HeroMarket } from './HeroMarket';
// HeroScene is lazy-loaded inside HeroMarket — no direct export needed
export { default as AuroraBackground } from './AuroraBackground';
export { default as SkeletonShimmer } from './SkeletonShimmer';
export { default as AnimatedValue } from './AnimatedValue';

// Deprecated - use UnifiedPortfolio instead
export { default as PolymarketPortfolio } from './PolymarketPortfolio';

// Talarion AI market creation
export { default as TalarionCreate } from './TalarionCreate';
export { default as TalarionMarketCard } from './TalarionMarketCard';
