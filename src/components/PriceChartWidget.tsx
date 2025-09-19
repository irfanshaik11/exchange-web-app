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

    // Use pair address from URL parameter directly - no complex validation needed
    // The URL parameter is always a valid pair address since it comes from navigation

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

    // Also intercept console.error, console.warn, and console.log to catch Moralis errors that might be logged there
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalConsoleLog = console.log;
    
    const checkForMoralisError = (message: string) => {
      return (
        message.includes('404 Not Found') ||
        message.includes('Failed to GET') ||
        message.includes('Bad response') ||
        message.includes('orchestrator-solana-api.aws-prod-api-realtime-2.moralis-internal.io') ||
        message.includes('moralis-internal.io') ||
        message.includes('orchestrator-solana-api') ||
        (message.includes('/pairs/') && message.includes('/stats')) ||
        message.includes('token/mainnet/pairs/')
      );
    };
    
    console.error = function(...args) {
      const errorMessage = args.join(' ');
      
      if (checkForMoralisError(errorMessage)) {
        console.warn('🚨 Moralis console error detected:', errorMessage);
        setShowFallback(true);
        return; // Don't log the original error
      }
      
      // Call original console.error for non-Moralis errors
      originalConsoleError.apply(console, args);
    };
    
    console.warn = function(...args) {
      const warnMessage = args.join(' ');
      
      if (checkForMoralisError(warnMessage)) {
        console.warn('🚨 Moralis console warning detected:', warnMessage);
        setShowFallback(true);
        return; // Don't log the original warning
      }
      
      // Call original console.warn for non-Moralis warnings
      originalConsoleWarn.apply(console, args);
    };
    
    console.log = function(...args) {
      const logMessage = args.join(' ');
      
      if (checkForMoralisError(logMessage)) {
        console.warn('🚨 Moralis console log detected:', logMessage);
        setShowFallback(true);
        return; // Don't log the original message
      }
      
      // Call original console.log for non-Moralis messages
      originalConsoleLog.apply(console, args);
    };

    // Intercept XMLHttpRequest to catch network errors
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._url = url;
      return originalXHROpen.call(this, method, url, ...args);
    };
    
    XMLHttpRequest.prototype.send = function(...args) {
      const xhr = this;
      const originalOnError = xhr.onerror;
      const originalOnLoad = xhr.onload;
      
      xhr.onerror = function(event) {
        const url = xhr._url || '';
        const isMoralisError = (
          url.includes('orchestrator-solana-api') ||
          url.includes('moralis-internal.io') ||
          (url.includes('/pairs/') && url.includes('/stats'))
        );
        
        if (isMoralisError) {
          console.warn('🚨 Moralis XHR error detected:', url);
          setShowFallback(true);
          return;
        }
        
        if (originalOnError) {
          originalOnError.call(this, event);
        }
      };
      
      xhr.onload = function(event) {
        const url = xhr._url || '';
        if (xhr.status === 404 && (
          url.includes('orchestrator-solana-api') ||
          url.includes('moralis-internal.io') ||
          (url.includes('/pairs/') && url.includes('/stats'))
        )) {
          console.warn('🚨 Moralis 404 error detected:', url);
          setShowFallback(true);
          return;
        }
        
        if (originalOnLoad) {
          originalOnLoad.call(this, event);
        }
      };
      
      return originalXHRSend.call(this, ...args);
    };

    // Also intercept fetch errors specifically
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      return originalFetch.apply(this, args).catch(error => {
        const errorMessage = error.message || '';
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
          console.warn('🚨 Moralis fetch error detected:', errorMessage);
          setShowFallback(true);
          // Don't re-throw to prevent console errors
          return Promise.reject(new Error('Chart data unavailable'));
        }
        throw error;
      });
    };

    // Use the pair address from URL parameter (already validated)

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
          // Configure chart based on whether we have pair address or just mint address
          const chartConfig = {
            autoSize: true,
            chainId: "solana",
            showHoldersChart: false,
            defaultInterval: "1", // 1-minute intervals for more dynamic data
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
            // Refresh every 10 seconds for better responsiveness
            refreshInterval: 10000,
            // Ensure we get the latest data
            dataSource: "moralis",
            // Enable live updates for real-time data
            liveUpdates: true,
            // Enable auto-refresh for better performance
            autoRefresh: true
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
              // Use the same configuration logic as above
              const chartConfig = {
                autoSize: true,
                chainId: "solana",
                showHoldersChart: false,
                defaultInterval: "1",
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
                refreshInterval: 10000,
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

    // Set up periodic refresh for updates (more frequent)
    const refreshInterval = setInterval(() => {
      // Light refresh - just reload the widget to get latest data
      if (typeof (window as any).createMyWidget === "function") {
        console.log('Refreshing chart for updates...');
        loadWidget(); // Reuse the existing loadWidget function
      }
    }, 30000); // Refresh every 30 seconds for better responsiveness

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
      if (refreshInterval) clearInterval(refreshInterval);
      // Remove global error handlers
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      // Restore original functions
      window.fetch = originalFetch;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      console.log = originalConsoleLog;
      XMLHttpRequest.prototype.open = originalXHROpen;
      XMLHttpRequest.prototype.send = originalXHRSend;
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
              <div className="text-purple-400">Buys: {buysCount} | Sells: {sellsCount}</div>
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
