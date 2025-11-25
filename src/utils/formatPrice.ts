/**
 * Smart price formatting that shows appropriate decimal places
 * $1000+ → $1,234
 * $1-999 → $12.34
 * $0.01-0.99 → $0.1234
 * $0.0001-0.01 → $0.001234
 * <$0.0001 → $0.00001234
 */
export function formatSmartPrice(price: number | null | undefined): string {
  if (price === null || price === undefined || isNaN(price)) {
    return '$0.00';
  }

  const absPrice = Math.abs(price);

  // Large prices: show as integers with commas
  if (absPrice >= 1000) {
    return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }

  // Medium prices: 2 decimals
  if (absPrice >= 1) {
    return `$${price.toFixed(2)}`;
  }

  // Small prices: show first 4 significant digits
  if (absPrice >= 0.01) {
    return `$${price.toFixed(4)}`;
  }

  // Very small prices: show first 6 significant digits
  if (absPrice >= 0.0001) {
    return `$${price.toFixed(6)}`;
  }

  // Extremely small prices: show first 8 significant digits
  return `$${price.toFixed(8)}`;
}

/**
 * Format market cap with K/M/B suffixes
 */
export function formatMarketCap(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '$0.00';
  }

  const absValue = Math.abs(value);

  if (absValue >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (absValue >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (absValue >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}
