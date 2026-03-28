function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  return () => { h = Math.imul(h ^ (h >>> 15), h | 1); h ^= h + Math.imul(h ^ (h >>> 7), 61 | 1); return ((h ^ (h >>> 14)) >>> 0) / 4294967296; };
}

export function generateMockSparkline(ticker: string, currentPrice: number, change: number, points = 28): number[] {
  const rand = seededRandom(ticker);
  const data: number[] = [];
  const startPrice = currentPrice / (1 + change);
  let momentum = 0;
  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    // Momentum-based noise for more natural walk
    momentum = momentum * 0.7 + (rand() - 0.5) * 0.06;
    const noise = momentum;
    const value = startPrice + (currentPrice - startPrice) * progress + noise;
    data.push(Math.max(0, Math.min(1, value)));
  }
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
