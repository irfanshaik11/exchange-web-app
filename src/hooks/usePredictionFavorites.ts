import { useState, useEffect, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'prediction_favorites';

export interface PredictionFavorite {
  ticker: string;
  title: string;
  source: 'dflow' | 'polymarket' | 'talarion';
  addedAt: number;
  /** Talarion-specific: market resolution rules */
  rules?: string;
  /** Talarion-specific: resolution time ISO string */
  resolutionTime?: string;
  /** Talarion-specific: last known YES price (0-1) */
  price?: number;
}

export default function usePredictionFavorites() {
  const [favorites, setFavorites] = useState<PredictionFavorite[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setFavorites(Array.isArray(parsed) ? parsed : []);
      }
    } catch (error) {
      console.error('Failed to load prediction favorites:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever favorites change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
      } catch (error) {
        console.error('Failed to save prediction favorites:', error);
      }
    }
  }, [favorites, isLoaded]);

  const addFavorite = useCallback((market: { ticker: string; title: string; source?: 'dflow' | 'polymarket' | 'talarion'; rules?: string; resolutionTime?: string; price?: number }) => {
    setFavorites((prev) => {
      // Check if already exists
      if (prev.some((f) => f.ticker === market.ticker && f.source === (market.source || 'dflow'))) {
        return prev;
      }
      return [
        ...prev,
        {
          ticker: market.ticker,
          title: market.title,
          source: market.source || 'dflow',
          addedAt: Date.now(),
          ...(market.rules && { rules: market.rules }),
          ...(market.resolutionTime && { resolutionTime: market.resolutionTime }),
          ...(market.price != null && { price: market.price }),
        },
      ];
    });
  }, []);

  const removeFavorite = useCallback((ticker: string, source: 'dflow' | 'polymarket' | 'talarion' = 'dflow') => {
    setFavorites((prev) => prev.filter((f) => !(f.ticker === ticker && f.source === source)));
  }, []);

  const toggleFavorite = useCallback((market: { ticker: string; title: string; source?: 'dflow' | 'polymarket' | 'talarion'; rules?: string; resolutionTime?: string; price?: number }) => {
    const source = market.source || 'dflow';
    const exists = favorites.some((f) => f.ticker === market.ticker && f.source === source);
    if (exists) {
      removeFavorite(market.ticker, source);
    } else {
      addFavorite(market);
    }
  }, [favorites, addFavorite, removeFavorite]);

  // O(1) lookup set — avoids O(N) Array.some per card in the grid
  const favoriteSet = useMemo(
    () => new Set(favorites.map(f => `${f.ticker}-${f.source}`)),
    [favorites],
  );

  const isFavorite = useCallback((ticker: string, source: 'dflow' | 'polymarket' | 'talarion' = 'dflow') => {
    return favoriteSet.has(`${ticker}-${source}`);
  }, [favoriteSet]);

  const clearAll = useCallback(() => {
    setFavorites([]);
  }, []);

  return {
    favorites,
    isLoaded,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    clearAll,
    count: favorites.length,
  };
}
