import React, { createContext, useContext, useState, useEffect } from 'react';

interface SolPriceContextType {
  solPrice: number;
}

const SolPriceContext = createContext<SolPriceContextType>({ solPrice: 0 });

export function SolPriceProvider({ children }: { children: React.ReactNode }) {
  const [solPrice, setSolPrice] = useState<number>(0);

  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        // Pyth Network price feed for SOL/USD
        const SOL_USD_FEED = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
        const response = await fetch(
          `https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=${SOL_USD_FEED}`,
          { signal: AbortSignal.timeout(5000) }
        );
        
        if (response.ok) {
          const data = await response.json();
          const priceData = data.parsed?.[0]?.price;
          if (priceData?.price && priceData?.expo) {
            const price = Number(priceData.price) * Math.pow(10, priceData.expo);
            setSolPrice(price);
            return;
          }
        }
      } catch (error) {
        console.error('Error fetching SOL price from Pyth:', error);
      }
      
      // Fallback to static price if Pyth fails
      setSolPrice(228.58);
    };
    
    fetchSolPrice();
    const interval = setInterval(fetchSolPrice, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <SolPriceContext.Provider value={{ solPrice }}>
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

