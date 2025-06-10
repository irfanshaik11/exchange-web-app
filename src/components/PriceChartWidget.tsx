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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const loadWidget = () => {
      if (typeof (window as any).createMyWidget === "function") {
        (window as any).createMyWidget(PRICE_CHART_ID, {
          autoSize: true,
          chainId: "solana",
          tokenAddress: token.token_address,
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
      };
      document.body.appendChild(script);
    } else {
      loadWidget();
    }
  }, [token.token_address]);

  // Calculate stats from token fields
  const buyVol = parseFloat(token.buy_volume_5m) || 0;
  const sellVol = parseFloat(token.sell_volume_5m) || 0;
  const vol5m = buyVol + sellVol;
  const buysCount = token.buy_transaction_count_5m || 0;
  const buysValue = buyVol;
  const sellsCount = token.sell_transaction_count_5m || 0;
  const sellsValue = sellVol;
  const netVol = buyVol - sellVol;
  const totalValue = buyVol + sellVol;
  const buyPct = totalValue ? (buyVol / totalValue) * 100 : 50;
  const sellPct = totalValue ? (sellVol / totalValue) * 100 : 50;

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {/* Stats Bar */}
      <div className="mb-2 flex flex-row items-end gap-8 rounded-lg bg-neutral-900 px-4 py-2 text-xs">
        <div className="flex flex-col items-start">
          <span className="text-neutral-400">5m Vol</span>
          <span className="text-white font-bold">{formatK(vol5m)}</span>
        </div>
        <div className="flex flex-col items-start">
          <span className="text-green-400">Buys</span>
          <span className="font-bold text-green-300">{buysCount} / {formatK(buysValue)}</span>
        </div>
        <div className="flex flex-col items-start">
          <span className="text-red-400">Sells</span>
          <span className="font-bold text-red-300">{sellsCount} / {formatK(sellsValue)}</span>
        </div>
        <div className="flex flex-col items-start">
          <span className="text-neutral-400">Net Vol.</span>
          <span className={`font-bold ${netVol < 0 ? "text-red-400" : "text-green-400"}`}>{netVol < 0 ? "-" : ""}{formatK(Math.abs(netVol))}</span>
        </div>
      </div>
      {/* Progress Bar */}
      <div className="mb-2 flex h-1 w-full overflow-hidden rounded bg-neutral-800">
        <div
          className="bg-green-400"
          style={{ width: `${buyPct}%`, transition: "width 0.3s" }}
        />
        <div
          className="bg-red-400"
          style={{ width: `${sellPct}%`, transition: "width 0.3s" }}
        />
      </div>
      {/* Chart */}
      <div
        id={PRICE_CHART_ID}
        ref={containerRef}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};

export default PriceChartWidget;
