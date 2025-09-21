import { useEffect, useRef, useState } from 'react';
import { BackgroundImageSearcher, ImageSearchService } from '~/utils/imageSearch';

interface ImageSearchStats {
  isRunning: boolean;
  lastSearchTime: Date | null;
  tokensProcessed: number;
  imagesFound: number;
  errors: number;
}

export function useImageSearch() {
  const [stats, setStats] = useState<ImageSearchStats>({
    isRunning: false,
    lastSearchTime: null,
    tokensProcessed: 0,
    imagesFound: 0,
    errors: 0,
  });

  const searcherRef = useRef<BackgroundImageSearcher | null>(null);
  const searchServiceRef = useRef<ImageSearchService | null>(null);

  useEffect(() => {
    // Initialize services
    searchServiceRef.current = ImageSearchService.getInstance();
    searcherRef.current = new BackgroundImageSearcher();

    // Start background search
    startSearch();

    // Cleanup on unmount
    return () => {
      if (searcherRef.current) {
        searcherRef.current.stop();
      }
    };
  }, []);

  const startSearch = () => {
    if (searcherRef.current) {
      searcherRef.current.start();
      setStats(prev => ({ ...prev, isRunning: true }));
    }
  };

  const stopSearch = () => {
    if (searcherRef.current) {
      searcherRef.current.stop();
      setStats(prev => ({ ...prev, isRunning: false }));
    }
  };

  const searchForToken = async (mint: string, symbol: string, name: string) => {
    if (!searchServiceRef.current) return;

    try {
      const results = await searchServiceRef.current.searchForTokenImage({
        mint,
        symbol,
        name,
      });

      if (results.length > 0) {
        const bestResult = results.reduce((best, current) => 
          current.confidence > best.confidence ? current : best
        );

        const success = await searchServiceRef.current.updateTokenImage(
          mint,
          bestResult.url,
          bestResult.source
        );

        if (success) {
          setStats(prev => ({
            ...prev,
            imagesFound: prev.imagesFound + 1,
            lastSearchTime: new Date(),
          }));
        }
      }
    } catch (error) {
      console.error('Error searching for token image:', error);
      setStats(prev => ({
        ...prev,
        errors: prev.errors + 1,
      }));
    }
  };

  const clearCache = () => {
    if (searchServiceRef.current) {
      searchServiceRef.current.clearAllCaches();
    }
  };

  const setSearchInterval = (interval: number) => {
    if (searcherRef.current) {
      searcherRef.current.setSearchInterval(interval);
    }
  };

  const setBatchSize = (size: number) => {
    if (searcherRef.current) {
      searcherRef.current.setBatchSize(size);
    }
  };

  return {
    stats,
    startSearch,
    stopSearch,
    searchForToken,
    clearCache,
    setSearchInterval,
    setBatchSize,
  };
}
