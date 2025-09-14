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
  const [showFallback, setShowFallback] = React.useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowFallback(false);

    const loadWidget = () => {
      try {
        const addressConfig = useTokenAddress
          ? { tokenAddress: token.mint }
          : { pairAddress: normalizedPair };

        // If we don't have a valid address to render, bail out to fallback
        const addrValue = useTokenAddress ? token.mint : normalizedPair;
        if (!addrValue) {
          setShowFallback(true);
          return;
        }
        if (typeof (window as any).createMyWidget === "function") {
          (window as any).createMyWidget(PRICE_CHART_ID, {
            autoSize: true,
            chainId: "solana",
            ...addressConfig,
            showHoldersChart: false,
            defaultInterval: "60",
            timeZone:
              Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Etc/UTC",
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
          });
        } else {
          console.error("createMyWidget function is not defined.");
          setShowFallback(true);
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
    // If the widget fails to render anything, show fallback after a short delay
    const verifyTimer = window.setTimeout(() => {
      if (containerRef.current && containerRef.current.childNodes.length === 0) {
        setShowFallback(true);
      }
    }, 2500);

    return () => {
      window.clearTimeout(verifyTimer);
    };
  }, [normalizedPair, token.mint, useTokenAddress]);

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
        <div className="w-full h-full flex items-center justify-center text-neutral-400 bg-neutral-900/40 rounded">
          Chart temporarily unavailable for this pair
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
