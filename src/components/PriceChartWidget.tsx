import React, { useEffect, useRef } from "react";
import type { Token } from "~/utils/db";

const PRICE_CHART_ID = "price-chart-widget-container";

// Helper to format numbers as $X.XXK
function formatK(num: number) {
  if (Math.abs(num) >= 1000) return "$" + (num / 1000).toFixed(2) + "K";
  return "$" + num.toFixed(2);
}

interface PriceChartWidgetProps {
  token: Token;
}

const PriceChartWidget: React.FC<PriceChartWidgetProps> = ({ token }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Some data sources append protocol suffixes (e.g., "pump") to addresses.
  // The external Moralis widget expects a plain pair address.
  const sanitizePairAddress = (addr?: string | null) => {
    if (!addr) return '';
    // Strip a trailing 'pump' suffix if present
    if (addr.endsWith('pump')) {
      const stripped = addr.slice(0, -4);
      // Only use stripped if it looks like a plausible base58 length (43-44)
      if (stripped.length >= 32 && stripped.length <= 50) return stripped;
    }
    return addr;
  };

  const rawPair = token.pair_address || '';
  const normalizedPair = sanitizePairAddress(rawPair);
  const isMintAsPair = !!token.mint && !!rawPair && rawPair === token.mint;
  const useTokenAddress = rawPair.endsWith('pump') || isMintAsPair;

  // Debug logging
  console.log('Chart Debug:', {
    mint: token.mint,
    pair_address: rawPair,
    usingTokenAddress: true
  });
  const [showFallback, setShowFallback] = React.useState(false);
  const [retryAttempt, setRetryAttempt] = React.useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowFallback(false);

    const loadWidget = () => {
      try {
        // Always use token address for charts
        const addressConfig = { tokenAddress: token.mint };
        const addrValue = token.mint;

        console.log('Chart Address Config:', addressConfig, 'Value:', addrValue);

        // If we don't have a valid mint address, bail out to fallback
        if (!token.mint || token.mint.length < 32) {
          console.warn('No valid mint address found for chart');
          setShowFallback(true);
          return;
        }
        if (typeof (window as any).createMyWidget === "function") {
          (window as any).createMyWidget(PRICE_CHART_ID, {
            autoSize: true,
            chainId: "solana",
            tokenAddress: token.mint,
            showHoldersChart: false,
            defaultInterval: "60",
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Etc/UTC",
            theme: "custom",
            locale: "en",
            backgroundColor: '#0A0A0A',
            gridColor: '#131813',
            textColor: "#68738D",
            candleUpColor: "#4CE666",
            candleDownColor: "#E64C4C",
            hideLeftToolbar: false,
            hideTopToolbar: false,
            hideBottomToolbar: true,
            // Additional parameters for better data loading
            showVolume: true,
            showPrice: true,
            showTimeframe: true,
            // Force refresh data
            refreshInterval: 0,
            // Ensure we get the latest data
            dataSource: "moralis"
          });
        } else {
          console.error("createMyWidget function is not defined. Retrying in 1 second...");
          // Retry after a short delay in case the script is still loading
          setTimeout(() => {
            if (typeof (window as any).createMyWidget === "function") {
              (window as any).createMyWidget(PRICE_CHART_ID, {
                autoSize: true,
                chainId: "solana",
                tokenAddress: token.mint,
                showHoldersChart: false,
                defaultInterval: "60",
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Etc/UTC",
                theme: "custom",
                locale: "en",
                backgroundColor: '#0A0A0A',
                gridColor: '#131813',
                textColor: "#68738D",
                candleUpColor: "#4CE666",
                candleDownColor: "#E64C4C",
                hideLeftToolbar: false,
                hideTopToolbar: false,
                hideBottomToolbar: true,
                // Additional parameters for better data loading
                showVolume: true,
                showPrice: true,
                showTimeframe: true,
                // Force refresh data
                refreshInterval: 0,
                // Ensure we get the latest data
                dataSource: "moralis"
              });
            } else {
              console.error("createMyWidget still not available after retry");
              setShowFallback(true);
            }
          }, 1000);
        }
      } catch (err) {
        console.error('Failed to initialize chart widget:', err);
        setShowFallback(true);
      }
    };

    if (!document.getElementById("moralis-chart-widget")) {
      const script = document.createElement("script");
      script.id = "moralis-chart-widget";
      script.src = "https://moralis.com/static/embed/chart.js";
      script.type = "text/javascript";
      script.async = true;
      script.onload = loadWidget;
      script.onerror = () => {
        console.error("Failed to load the chart widget script.");
        setShowFallback(true);
      };
      document.body.appendChild(script);
    } else {
      loadWidget();
    }
    // If the widget fails to render anything, try alternative configurations
    const verifyTimer = window.setTimeout(() => {
      if (containerRef.current && containerRef.current.childNodes.length === 0) {
        console.warn('Chart widget failed to render within timeout, trying alternative configuration...');
        
        // Try with pair address if we have one and haven't tried it yet
        if (retryAttempt === 0 && rawPair && rawPair.length >= 32) {
          console.log('Retrying with pair address:', rawPair);
          setRetryAttempt(1);
          
          if (typeof (window as any).createMyWidget === "function") {
            (window as any).createMyWidget(PRICE_CHART_ID, {
              autoSize: true,
              chainId: "solana",
              pairAddress: rawPair,
              showHoldersChart: false,
              defaultInterval: "60",
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Etc/UTC",
              theme: "custom",
              locale: "en",
              backgroundColor: '#0A0A0A',
              gridColor: '#131813',
              textColor: "#68738D",
              candleUpColor: "#4CE666",
              candleDownColor: "#E64C4C",
              hideLeftToolbar: false,
              hideTopToolbar: false,
              hideBottomToolbar: true,
              showVolume: true,
              showPrice: true,
              showTimeframe: true,
              refreshInterval: 0,
              dataSource: "moralis"
            });
            
            // Set another timer to check if this attempt worked
            setTimeout(() => {
              if (containerRef.current && containerRef.current.childNodes.length === 0) {
                console.warn('Chart still failed with pair address, showing fallback');
                setShowFallback(true);
              }
            }, 3000);
          }
        } else {
          setShowFallback(true);
        }
      }
    }, 5000); // Increased from 2.5s to 5s

    return () => {
      window.clearTimeout(verifyTimer);
    };
  }, [normalizedPair, token.mint, useTokenAddress, retryAttempt, rawPair]);

  // Calculate stats from token fields
  const buyVol = token.total_buy_volume_5m || 0;
  const sellVol = token.total_sell_volume_5m || 0;
  const vol5m = buyVol + sellVol;
  const buysCount = token.total_buys_5m || 0;
  const buysValue = buyVol;
  const sellsCount = token.total_sells_5m || 0;
  const sellsValue = sellVol;
  const netVol = buyVol - sellVol;
  const totalValue = buyVol + sellVol;
  const buyPct = totalValue ? (buyVol / totalValue) * 100 : 50;
  const sellPct = totalValue ? (sellVol / totalValue) * 100 : 50;

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {showFallback ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400 bg-neutral-900/40 rounded p-4">
          <div className="text-center">
            <div className="text-lg mb-2">Chart temporarily unavailable</div>
            <div className="text-sm text-neutral-500 mb-2">
              Token Address: {token.mint || 'N/A'}
            </div>
            <div className="text-sm text-neutral-500">
              Using token address for chart
            </div>
            <div className="flex gap-2 mt-3">
              <button 
                onClick={() => {
                  setShowFallback(false);
                  setRetryAttempt(0);
                  // Trigger a re-render by updating the effect dependencies
                  window.location.reload();
                }}
                className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-sm"
              >
                Retry
              </button>
              <button 
                onClick={() => {
                  // Open Moralis website with the token address
                  window.open(`https://moralis.io/charts?tokenAddress=${token.mint}`, '_blank');
                }}
                className="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded text-sm"
              >
                View on Moralis
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          id={PRICE_CHART_ID}
          ref={containerRef}
          style={{ width: "100%", height: "100%" }}
        />
      )}
    </div>
  );
};

export default PriceChartWidget;
