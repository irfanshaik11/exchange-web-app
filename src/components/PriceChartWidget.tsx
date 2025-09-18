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

  // Validate if pair address looks like a valid Solana address
  const isValidSolanaAddress = (addr: string) => {
    // Solana addresses are base58 encoded and typically 32-44 characters
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(addr);
  };

  const rawPair = token.pair_address || '';
  const normalizedPair = sanitizePairAddress(rawPair);
  
  // DexScreener-focused logic: Only use pair_address if it's a valid DexScreener address
  // We'll validate inside useEffect where state is available
  const isDexScreenerPair = rawPair && 
    !rawPair.endsWith('pump') && 
    rawPair !== token.mint && 
    rawPair !== 'null' &&
    rawPair.length > 0;
  const useTokenAddress = !isDexScreenerPair;

  // Debug logging
  console.log('Chart Debug:', {
    mint: token.mint,
    pair_address: rawPair,
    isDexScreenerPair,
    usingTokenAddress: useTokenAddress
  });
  const [showFallback, setShowFallback] = React.useState(false);
  const [retryAttempt, setRetryAttempt] = React.useState(0);
  
  // Track failed pair addresses to avoid retrying them
  const [failedPairAddresses, setFailedPairAddresses] = React.useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowFallback(false);

    // DexScreener-focused validation function (inside useEffect where state is available)
    const validatePairAddress = (addr: string) => {
      // Check if it's a valid Solana address format
      if (!isValidSolanaAddress(addr)) return false;
      
      // Blacklist of known invalid pair addresses that cause 404 errors
      const invalidPairAddresses = [
        '8b8Pd5cDnHuZBJDY3Y4McAAbhFDoAhHDmUZLLW3JTCPd', // The one causing your error
        '8vXLcGFMBAwANeyi7EZNrJKoMQ9zY8xe7c9hq1oSzJQA', // Another from your error
        '4a5QL5aSHtHK41z54nJ7jmmgyTfCnjCMKN1pZhuZcCsH', // New token causing 404 error
      ];
      
      // Check against static blacklist
      if (invalidPairAddresses.includes(addr)) {
        console.warn('Blacklisted invalid pair address detected:', addr);
        return false;
      }
      
      // Check against dynamic failed addresses
      if (failedPairAddresses.has(addr)) {
        console.warn('Previously failed pair address detected:', addr);
        return false;
      }
      
      // DexScreener addresses should be different from mint addresses
      if (addr === token.mint) {
        console.warn('Pair address same as mint address, not a valid DexScreener pair:', addr);
        return false;
      }
      
      // DexScreener addresses should not end with 'pump'
      if (addr.endsWith('pump')) {
        console.warn('Pair address ends with pump, not a valid DexScreener pair:', addr);
        return false;
      }
      
      // Additional checks for common invalid patterns
      const invalidPatterns = [
        /^0+$/, // All zeros
        /^1+$/, // All ones
        /^[A-Za-z0-9]{32}$/, // Exactly 32 chars (might be mint address)
        /^[A-Za-z0-9]{44}$/, // Exactly 44 chars (might be mint address)
        /^[A-Za-z0-9]{43}$/, // Exactly 43 chars (might be mint address)
      ];
      
      // Check if the address looks like a mint address (too similar to token mint)
      if (token.mint && addr.length === token.mint.length) {
        // If lengths match, it's likely a mint address, not a pair address
        console.warn('Pair address length matches mint address, likely invalid:', addr);
        return false;
      }
      
      // Check for addresses that look like they might be mint addresses
      // Real trading pair addresses are typically different from mint addresses
      if (token.mint && addr.startsWith(token.mint.substring(0, 8))) {
        console.warn('Pair address starts with same prefix as mint address, likely invalid:', addr);
        return false;
      }
      
      return !invalidPatterns.some(pattern => pattern.test(addr));
    };

    // Re-validate the pair address with the full validation logic
    const isValidPair = rawPair && validatePairAddress(rawPair);
    const shouldUseTokenAddress = !isValidPair;

    // Add global error handler to suppress Moralis 404 errors
    const handleGlobalError = (event: ErrorEvent) => {
      if (event.message && (
        (event.message.includes('404 Not Found') && event.message.includes('moralis-internal.io')) ||
        (event.message.includes('Failed to GET') && event.message.includes('moralis-internal.io')) ||
        (event.message.includes('Bad response') && event.message.includes('moralis-internal.io'))
      )) {
        console.warn('Moralis API error suppressed:', event.message);
        
        // Extract pair address from error message and add to failed list
        const pairMatch = event.message.match(/pairs\/([A-Za-z0-9]+)\//);
        if (pairMatch && pairMatch[1]) {
          const failedAddress = pairMatch[1];
          setFailedPairAddresses(prev => new Set([...prev, failedAddress]));
          console.warn('Added failed pair address to blacklist:', failedAddress);
        }
        
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };

    window.addEventListener('error', handleGlobalError);

    // Calculate pair address once for the entire effect
    const pairAddress = token.pair_address && token.pair_address !== 'null' && token.pair_address.length >= 32 
      ? token.pair_address 
      : token.mint;

    const loadWidget = () => {
      try {
        const addressConfig = { 
          pairAddress: pairAddress,
          tokenAddress: token.mint 
        };
        const addrValue = pairAddress;

        console.log('Chart Address Config:', addressConfig, 'Value:', addrValue, 'Using pair address:', !!token.pair_address);

        // If we don't have a valid address, bail out to fallback
        if (!pairAddress || pairAddress.length < 32) {
          console.warn('No valid address found for chart');
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

          // DexScreener-focused: Only use pair address if it's validated as DexScreener
          const finalConfig = {
            ...chartConfig,
            ...(isValidPair 
              ? { pairAddress: normalizedPair }
              : { tokenAddress: token.mint }
            )
          };

          if (isValidPair) {
            console.log('Using DexScreener pair address:', normalizedPair);
          } else {
            console.log('Using token address (no valid DexScreener pair):', token.mint);
          }

          // Add error handling for Moralis API calls
          try {
            (window as any).createMyWidget(PRICE_CHART_ID, finalConfig);
          } catch (error) {
            console.warn('Chart widget creation failed, trying with token address only:', error);
            // Fallback to token address only
            const fallbackConfig = { ...chartConfig, tokenAddress: token.mint };
            (window as any).createMyWidget(PRICE_CHART_ID, fallbackConfig);
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
                ...(token.pair_address && token.pair_address !== 'null' && token.pair_address.length >= 32
                  ? { pairAddress: pairAddress }
                  : { tokenAddress: token.mint }
                )
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
      if (refreshInterval) clearInterval(refreshInterval);
      // Remove global error handler
      window.removeEventListener('error', handleGlobalError);
    };
  }, [normalizedPair, token.mint, token.pair_address, useTokenAddress, retryAttempt, rawPair]);

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
            <div className="mb-2 text-lg font-semibold">Chart Unavailable</div>
            <div className="text-sm">
              Price data for {token.symbol} is not available at the moment.
            </div>
            <div className="mt-2 text-xs">
              <div>Price: ${formatK(token.usd_price || 0)}</div>
              <div>Volume 5m: ${formatK(vol5m)}</div>
              <div>Buys: {buysCount} | Sells: {sellsCount}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceChartWidget;
