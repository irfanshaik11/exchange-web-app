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
            // Enable real-time updates every 1 second
            refreshInterval: 1000,
            // Ensure we get the latest data
            dataSource: "moralis",
            // Enable live updates
            liveUpdates: true,
            // Enable auto-refresh
            autoRefresh: true
          };

          // Use pair address if available, otherwise use token address
          if (token.pair_address && token.pair_address !== 'null' && token.pair_address.length >= 32) {
            chartConfig.pairAddress = pairAddress;
            console.log('Using pair address for chart:', pairAddress);
          } else {
            chartConfig.tokenAddress = token.mint;
            console.log('Using token address for chart:', token.mint);
          }

          (window as any).createMyWidget(PRICE_CHART_ID, chartConfig);
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

              if (token.pair_address && token.pair_address !== 'null' && token.pair_address.length >= 32) {
                chartConfig.pairAddress = pairAddress;
              } else {
                chartConfig.tokenAddress = token.mint;
              }

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

    // Set up light periodic refresh for real-time updates
    const refreshInterval = setInterval(() => {
      // Light refresh - just reload the widget to get latest data
      if (typeof (window as any).createMyWidget === "function") {
        console.log('Refreshing chart for real-time updates...');
        loadWidget(); // Reuse the existing loadWidget function
      }
    }, 60000); // Refresh every 60 seconds (light refresh)

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
