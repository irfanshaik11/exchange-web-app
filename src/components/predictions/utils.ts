function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  return () => { h = Math.imul(h ^ (h >>> 15), h | 1); h ^= h + Math.imul(h ^ (h >>> 7), 61 | 1); return ((h ^ (h >>> 14)) >>> 0) / 4294967296; };
}

export function generateMockSparkline(ticker: string, currentPrice: number, change: number, points = 28): number[] {
  const rand = seededRandom(ticker);
  const data: number[] = [];
  const startPrice = Math.max(0.02, Math.min(0.98, currentPrice / (1 + (change || 0.01))));
  let price = startPrice;
  let momentum = 0;

  // Higher volatility for visible chart movement
  const baseVol = 0.04 + Math.abs(currentPrice - 0.5) * 0.06;

  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    // Mean-revert toward the target (currentPrice) with random walk
    const target = startPrice + (currentPrice - startPrice) * progress;
    const meanRevert = (target - price) * 0.15;
    // Random shock — bigger than before for realistic movement
    const shock = (rand() - 0.5) * baseVol;
    // Momentum carries forward (trending behavior)
    momentum = momentum * 0.6 + shock + meanRevert;
    // Occasional larger moves (news events)
    if (rand() < 0.08) momentum += (rand() - 0.5) * baseVol * 3;

    price += momentum;
    price = Math.max(0.01, Math.min(0.99, price));
    data.push(price);
  }
  // Ensure last point matches current price
  data[data.length - 1] = currentPrice;
  return data;
}

export const formatVolume = (volume: number): string => {
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(0)}K`;
  return `$${volume.toFixed(0)}`;
};

export const formatTimeRemaining = (closesAt: string): { text: string; isUrgent: boolean; isWarning?: boolean } => {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return { text: 'Ended', isUrgent: false };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const isUrgent = diff <= 86400000;
  const isWarning = diff <= 7 * 86400000 && !isUrgent;
  let text = '';
  if (days > 0) text = `${days}d`;
  else if (hours > 0) text = `${hours}h`;
  else text = '<1h';
  return { text, isUrgent, isWarning };
};
