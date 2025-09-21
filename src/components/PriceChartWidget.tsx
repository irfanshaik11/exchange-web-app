import React, { useRef, useEffect, useState } from "react";
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
  const [showFallback, setShowFallback] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Use pair address from URL parameter or token
  const pairAddress = urlPairAddress || token.pair_address || '';
  
  // Debug logging
  console.log('Chart Debug:', {
    mint: token.mint,
    urlPairAddress,
    tokenPairAddress: token.pair_address,
    finalPairAddress: pairAddress
  });

  // Refresh function to retry loading the chart
  const handleRefresh = React.useCallback(() => {
    console.log('🔄 Retrying chart load...');
    setIsRefreshing(true);
    setShowFallback(false);
    setRetryAttempt(prev => prev + 1);
    
    // Clear the container and reload
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
    
    // Reset refreshing state after a short delay
    setTimeout(() => {
      setIsRefreshing(false);
    }, 2000);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowFallback(false);

    // Define loadWidget function
    const loadWidget = () => {
      try {
        console.log('📈 Chart using pair address from URL:', pairAddress);

        // If we don't have a valid pair address, bail out to fallback
        if (!pairAddress || pairAddress.length < 32) {
          console.warn('No valid pair address found for chart');
          setShowFallback(true);
          return;
        }
        
        if (typeof (window as any).createMyWidget === "function") {
          // Configure chart with clean, working configuration
          const chartConfig = {
            autoSize: true,
            chainId: "solana",
            pairAddress: pairAddress,
            showHoldersChart: false,
            defaultInterval: "1", // 1-minute intervals
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Etc/UTC",
            theme: "moralis", // Use default Moralis theme for better compatibility
            locale: "en",
            showCurrencyToggle: true,
            hideLeftToolbar: false,
            hideTopToolbar: false,
            hideBottomToolbar: false
          };

          console.log('📊 Chart Configuration:', chartConfig);
          console.log('Using pair address from URL:', pairAddress);

          // Add error handling for Moralis API calls
          try {
            console.log('🚀 Creating Moralis chart widget...');
            (window as any).createMyWidget(PRICE_CHART_ID, chartConfig);
            console.log('✅ Moralis chart widget created successfully');
            
            // Set up a mutation observer to detect when chart actually renders
            const observer = new MutationObserver((mutations) => {
              mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                  console.log('✅ Chart widget rendered successfully');
                  observer.disconnect(); // Stop observing once we detect content
                }
              });
            });
            
            if (containerRef.current) {
              observer.observe(containerRef.current, { childList: true, subtree: true });
            }
            
            // Clean up observer after 10 seconds
            setTimeout(() => observer.disconnect(), 10000);
            
          } catch (error) {
            console.warn('Chart widget creation failed:', error);
            setShowFallback(true);
          }
        } else {
          console.error("createMyWidget function is not defined. Retrying in 1 second...");
          // Retry after a short delay in case the script is still loading
          setTimeout(() => {
            if (typeof (window as any).createMyWidget === "function") {
              // Use the same clean configuration logic
              const chartConfig = {
                autoSize: true,
                chainId: "solana",
                pairAddress: pairAddress,
                showHoldersChart: false,
                defaultInterval: "1",
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Etc/UTC",
                theme: "moralis",
                locale: "en",
                showCurrencyToggle: true,
                hideLeftToolbar: false,
                hideTopToolbar: false,
                hideBottomToolbar: false
              };

              (window as any).createMyWidget(PRICE_CHART_ID, chartConfig);
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

    // Add global error handler to catch Moralis 404 errors
    const handleGlobalError = (event: ErrorEvent) => {
      const errorMessage = event.message || '';
      const isMoralisError = (
        errorMessage.includes('404 Not Found') ||
        errorMessage.includes('Failed to GET') ||
        errorMessage.includes('Bad response') ||
        errorMessage.includes('orchestrator-solana-api.aws-prod-api-realtime-2.moralis-internal.io') ||
        errorMessage.includes('moralis-internal.io') ||
        errorMessage.includes('orchestrator-solana-api') ||
        (errorMessage.includes('/pairs/') && errorMessage.includes('/stats')) ||
        errorMessage.includes('token/mainnet/pairs/')
      );
      
      if (isMoralisError) {
        console.warn('🚨 Moralis API error detected:', errorMessage);
        setShowFallback(true);
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };

    window.addEventListener('error', handleGlobalError);
    
    // Also catch unhandled promise rejections (which might be how Moralis errors are thrown)
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const errorMessage = event.reason?.message || event.reason || '';
      const isMoralisError = (
        errorMessage.includes('404 Not Found') ||
        errorMessage.includes('Failed to GET') ||
        errorMessage.includes('Bad response') ||
        errorMessage.includes('orchestrator-solana-api.aws-prod-api-realtime-2.moralis-internal.io') ||
        errorMessage.includes('moralis-internal.io') ||
        errorMessage.includes('orchestrator-solana-api') ||
        (errorMessage.includes('/pairs/') && errorMessage.includes('/stats')) ||
        errorMessage.includes('token/mainnet/pairs/')
      );
      
      if (isMoralisError) {
        console.warn('🚨 Moralis promise rejection detected:', errorMessage);
        setShowFallback(true);
        event.preventDefault();
        return false;
      }
    };
    
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Load Moralis script if not already loaded
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

    // Chart updates are handled by Moralis automatically

    // If the widget fails to render anything, show retry button
    const verifyTimer = window.setTimeout(() => {
      if (containerRef.current && containerRef.current.childNodes.length === 0) {
        console.warn('⏰ Chart widget failed to render within timeout, showing retry option...');
        setShowFallback(true);
      }
    }, 5000); // 5 seconds timeout for chart to load

    // For very new tokens, show fallback immediately if no chart data is available
    const quickFallbackTimer = window.setTimeout(() => {
      if (containerRef.current && containerRef.current.childNodes.length === 0) {
        console.warn('🚨 Quick fallback for new token - no chart data available');
        setShowFallback(true);
      }
    }, 2000); // 2 seconds quick fallback for new tokens

    return () => {
      window.clearTimeout(verifyTimer);
      window.clearTimeout(quickFallbackTimer);
      // Remove global error handlers
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [pairAddress, retryAttempt]);

  // Calculate stats from token fields
  const buyVol = token.total_buy_volume_5m || 0;
  const sellVol = token.total_sell_volume_5m || 0;
  const vol5m = buyVol + sellVol;
  const buysCount = token.total_buys_5m || 0;
  const sellsCount = token.total_sells_5m || 0;
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
          <div className="text-center max-w-md mx-auto p-6">
            <div className="mb-4 text-xl font-semibold text-red-400 flex items-center justify-center gap-2">
              <span>📊</span>
              Chart Data Unavailable
            </div>
            <div className="text-sm mb-6 text-neutral-300">
              Unable to load price chart data for <span className="font-medium text-white">{token.symbol}</span>. 
              This commonly happens with new tokens that don't have enough trading data yet.
            </div>
            
            <div className="mb-6">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="rounded-lg bg-emerald-600 px-8 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg"
              >
                {isRefreshing ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Retrying...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span>🔄</span>
                    Retry Chart
                  </span>
                )}
              </button>
            </div>
            
            <div className="text-xs space-y-2 bg-neutral-800 rounded-lg p-4">
              <div className="text-emerald-400 font-medium">Price: ${formatK(token.usd_price || 0)}</div>
              <div className="text-blue-400">Volume 5m: ${formatK(vol5m)}</div>
              <div className="text-gray-400">Buys: {buysCount} | Sells: {sellsCount}</div>
              {pairAddress && (
                <div className="mt-3 text-neutral-500 text-xs break-all">
                  Pair: {pairAddress}
                </div>
              )}
            </div>
            
            <div className="mt-4 text-xs text-neutral-500">
              💡 Try refreshing the page if the retry button doesn't work
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceChartWidget;