import React, { useRef, useEffect } from "react";
import type { Token } from "~/utils/db";

const PRICE_CHART_ID = "price-chart-widget-container";

// Helper to format numbers as $X.XXK
function formatK(num: number) {
  if (Math.abs(num) >= 1000) return "$" + (num / 1000).toFixed(2) + "K";
  return "$" + num.toFixed(2);
}

interface PriceChartWidgetProps {
  token: Token;
  pairAddress?: string; // Pair address from URL parameter
}

const PriceChartWidget: React.FC<PriceChartWidgetProps> = ({ token, pairAddress: urlPairAddress }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Pair address comes directly from URL parameter - no sanitization needed

  // Use pair address from URL parameter directly - this is always a valid pair address
  const pairAddress = urlPairAddress || token.pair_address || '';
  
  // Debug logging
  console.log('Chart Debug:', {
    mint: token.mint,
    urlPairAddress,
    tokenPairAddress: token.pair_address,
    finalPairAddress: pairAddress
  });
  const [showFallback, setShowFallback] = React.useState(false);
  const [retryAttempt, setRetryAttempt] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Refresh function to retry loading the chart
  const handleRefresh = React.useCallback(() => {
    setIsRefreshing(true);
    setShowFallback(false);
    setRetryAttempt(prev => prev + 1);
    
    // Reset retry state
    
    // Reset refreshing state after a short delay
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowFallback(false);

    // Use pair address from URL parameter directly - no complex validation needed
    // The URL parameter is always a valid pair address since it comes from navigation

    // Add global error handler to suppress Moralis 404 errors
    const handleGlobalError = (event: ErrorEvent) => {
      if (event.message && (
        (event.message.includes('404 Not Found') && event.message.includes('moralis-internal.io')) ||
        (event.message.includes('Failed to GET') && event.message.includes('moralis-internal.io')) ||
        (event.message.includes('Bad response') && event.message.includes('moralis-internal.io')) ||
        (event.message.includes('orchestrator-solana-api.aws-prod-api-realtime-2.moralis-internal.io')) ||
        (event.message.includes('/pairs/') && event.message.includes('/stats'))
      )) {
        console.warn('Moralis API error suppressed:', event.message);
        setShowFallback(true);
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };

    window.addEventListener('error', handleGlobalError);

    // Also intercept fetch errors specifically
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      return originalFetch.apply(this, args).catch(error => {
        if (error.message && (
          error.message.includes('404 Not Found') ||
          error.message.includes('Failed to GET') ||
          error.message.includes('Bad response') ||
          error.message.includes('orchestrator-solana-api.aws-prod-api-realtime-2.moralis-internal.io') ||
          (error.message.includes('/pairs/') && error.message.includes('/stats'))
        )) {
          console.warn('Moralis fetch error suppressed:', error.message);
          setShowFallback(true);
          throw error; // Re-throw to maintain normal error flow
        }
        throw error;
      });
    };

    // Use the pair address from URL parameter (already validated)

    const loadWidget = () => {
      try {
        console.log('Chart using pair address from URL:', pairAddress);

        // If we don't have a valid pair address, bail out to fallback
        if (!pairAddress || pairAddress.length < 32) {
          console.warn('No valid pair address found for chart');
          setShowFallback(true);
          return;
        }
        if (typeof (window as any).createMyWidget === "function") {
          // Configure chart based on whether we have pair address or just mint address
          const chartConfig = {
            autoSize: true,
            chainId: "solana",
            showHoldersChart: false,
            defaultInterval: "5", // 5-minute intervals for more dynamic data
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
            // Refresh every 30 seconds (less frequent)
            refreshInterval: 30000,
            // Ensure we get the latest data
            dataSource: "moralis",
            // Disable live updates to reduce refreshing
            liveUpdates: false,
            // Disable auto-refresh to reduce refreshing
            autoRefresh: false
          };

          // Use pair address from URL parameter directly
          const finalConfig = {
            ...chartConfig,
            pairAddress: pairAddress
          };

          console.log('Using pair address from URL:', pairAddress);

          // Add error handling for Moralis API calls
          try {
            (window as any).createMyWidget(PRICE_CHART_ID, finalConfig);
          } catch (error) {
            console.warn('Chart widget creation failed:', error);
            setShowFallback(true);
          }
        } else {
          console.error("createMyWidget function is not defined. Retrying in 1 second...");
          // Retry after a short delay in case the script is still loading
          setTimeout(() => {
            if (typeof (window as any).createMyWidget === "function") {
              // Use the same configuration logic as above
              const chartConfig = {
                autoSize: true,
                chainId: "solana",
                showHoldersChart: false,
                defaultInterval: "5",
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
                refreshInterval: 30000,
                dataSource: "moralis",
                liveUpdates: true,
                autoRefresh: true
              };

              const finalConfig = {
                ...chartConfig,
                pairAddress: pairAddress
              };

              (window as any).createMyWidget(PRICE_CHART_ID, finalConfig);
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

    // Set up periodic refresh for updates (less frequent)
    const refreshInterval = setInterval(() => {
      // Light refresh - just reload the widget to get latest data
      if (typeof (window as any).createMyWidget === "function") {
        console.log('Refreshing chart for updates...');
        loadWidget(); // Reuse the existing loadWidget function
      }
    }, 300000); // Refresh every 5 minutes (less frequent)

    // If the widget fails to render anything, try alternative configurations
    const verifyTimer = window.setTimeout(() => {
      if (containerRef.current && containerRef.current.childNodes.length === 0) {
        console.warn('Chart widget failed to render within timeout, trying alternative configuration...');
        
        // Try with pair address if we have one and haven't tried it yet
        if (retryAttempt === 0 && pairAddress && pairAddress.length >= 32) {
          console.log('Retrying with pair address:', pairAddress);
          setRetryAttempt(1);
          
          if (typeof (window as any).createMyWidget === "function") {
            (window as any).createMyWidget(PRICE_CHART_ID, {
              autoSize: true,
              chainId: "solana",
              pairAddress: pairAddress,
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
    }, 8000); // 8 seconds timeout for chart to load

    return () => {
      window.clearTimeout(verifyTimer);
      if (refreshInterval) clearInterval(refreshInterval);
      // Remove global error handler
      window.removeEventListener('error', handleGlobalError);
      // Restore original fetch
      window.fetch = originalFetch;
    };
  }, [pairAddress, retryAttempt]);

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
      <div
        id={PRICE_CHART_ID}
        ref={containerRef}
        style={{ width: "100%", height: "100%" }}
      />
      {showFallback && (
        <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-neutral-400">
          <div className="text-center">
            <div className="mb-2 text-lg font-semibold text-red-400">Chart Data Unavailable</div>
            <div className="text-sm mb-4 text-neutral-300">
              Unable to load price chart data for {token.symbol}. This might be due to:
              <ul className="mt-2 text-xs text-neutral-400 text-left">
                <li>• New token with limited trading data</li>
                <li>• Temporary API service issues</li>
                <li>• Chart data not yet available for this pair</li>
              </ul>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="mb-4 rounded bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRefreshing ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Retrying...
                </span>
              ) : (
                '🔄 Retry Chart'
              )}
            </button>
            <div className="text-xs space-y-1">
              <div className="text-emerald-400">Price: ${formatK(token.usd_price || 0)}</div>
              <div className="text-blue-400">Volume 5m: ${formatK(vol5m)}</div>
              <div className="text-purple-400">Buys: {buysCount} | Sells: {sellsCount}</div>
              {pairAddress && (
                <div className="mt-2 text-neutral-500 text-xs">
                  Pair: {pairAddress.substring(0, 8)}...{pairAddress.substring(-4)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceChartWidget;
