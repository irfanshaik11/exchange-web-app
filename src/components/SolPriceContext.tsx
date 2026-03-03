import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';

interface SolPriceContextType {
  solPrice: number;
  monPrice: number;
}

const SolPriceContext = createContext<SolPriceContextType>({ solPrice: 0, monPrice: 0 });

export function SolPriceProvider({ children }: { children: React.ReactNode }) {
  const [solPrice, setSolPrice] = useState<number>(0);
  const [monPrice, setMonPrice] = useState<number>(0);

  // Track last successfully fetched price so we never fall back to a stale hardcoded value
  const lastGoodSolPriceRef = useRef<number>(0);

  useEffect(() => {
    const fetchSolPrice = async () => {
      // Primary: Pyth Network
      try {
        const SOL_USD_FEED = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
        const response = await fetch(
          `https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=${SOL_USD_FEED}`,
          { signal: AbortSignal.timeout(5000) }
        ).catch(() => null);

        if (response?.ok) {
          const data = await response.json().catch(() => null);
          const priceData = data?.parsed?.[0]?.price;
          if (priceData?.price && priceData?.expo) {
            const price = Number(priceData.price) * Math.pow(10, priceData.expo);
            if (price > 0) {
              lastGoodSolPriceRef.current = price;
              setSolPrice(price);
              return;
            }
          }
        }
      } catch {
        // Pyth failed — try CoinGecko below
      }

      // Fallback: CoinGecko
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
          { signal: AbortSignal.timeout(10000) }
        ).catch(() => null);

        if (response?.ok) {
          const data = await response.json().catch(() => null);
          if (data?.solana?.usd && data.solana.usd > 0) {
            lastGoodSolPriceRef.current = data.solana.usd;
            setSolPrice(data.solana.usd);
            return;
          }
        }
      } catch {
        // CoinGecko also failed
      }

      // Both APIs failed — keep the last known good price (or stay at 0 on fresh load)
      if (lastGoodSolPriceRef.current > 0) {
        setSolPrice(lastGoodSolPriceRef.current);
      }
    };

    fetchSolPrice();
    const interval = setInterval(fetchSolPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchMonPrice = async () => {
      try {
        // Use Next.js API route to proxy CoinGecko request (avoids CORS issues)
        const response = await fetch('/api/monad-price', {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          const price = data?.price;
          if (typeof price === 'number' && price > 0) {
            setMonPrice(price);
            return;
          }
        }
      } catch (error) {
        console.error('Error fetching MON price:', error);
      }
      
      // Fallback to static price if fetch fails
      setMonPrice(0.025);
    };
    
    // Set initial fallback price immediately
    setMonPrice(0.025);
    
    fetchMonPrice();
    const interval = setInterval(fetchMonPrice, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <SolPriceContext.Provider value={useMemo(() => ({ solPrice, monPrice }), [solPrice, monPrice])}>
      {children}
    </SolPriceContext.Provider>
  );
}

export function useSolPrice() {
  const context = useContext(SolPriceContext);
  if (!context) {
    throw new Error('useSolPrice must be used within a SolPriceProvider');
  }
  return context;
}

