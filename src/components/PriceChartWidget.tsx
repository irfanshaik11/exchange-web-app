import React from "react";
import type { Token } from "~/utils/db";
import LightweightChart from "./LightweightChart";
import { useChartData } from "~/hooks/useChartData";


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
  // Use pair address from URL parameter or token
  const pairAddress = urlPairAddress || token.pair_address || '';
  
  // Use lightweight chart data with mock data
  const { data: chartData, isLoading, error, refresh } = useChartData({
    pairAddress: pairAddress || 'So11111111111111111111111111111111111111112', // Default pair for mock data
    interval: '1m',
    limit: 100,
    useWebSocket: false, // Force mock data for now
    generateHistory: true
  });
  
  // Debug logging
  console.log('Chart Debug:', {
    mint: token.mint,
    urlPairAddress,
    tokenPairAddress: token.pair_address,
    finalPairAddress: pairAddress
  });


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
    <div style={{ width: "100%", height: "100%" }} className="relative">
      {/* Lightweight Chart */}
      <LightweightChart
        data={chartData}
        height="100%"
        width="100%"
        isLoading={isLoading}
        error={error}
        onRefresh={refresh}
        className="w-full h-full"
      />
      
      {/* Token stats overlay - only show when chart is loaded and no error */}
      {!isLoading && !error && chartData.length > 0 && (
        <div className="absolute top-2 left-2 bg-gray-800 bg-opacity-90 rounded-lg p-3 text-xs">
          <div className="text-emerald-400 font-medium">Price: ${formatK(token.usd_price || 0)}</div>
          <div className="text-blue-400">Volume 5m: ${formatK(vol5m)}</div>
          <div className="text-gray-400">Buys: {buysCount} | Sells: {sellsCount}</div>
          {pairAddress && (
            <div className="mt-2 text-neutral-500 text-xs break-all max-w-32">
              Pair: {pairAddress.substring(0, 8)}...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PriceChartWidget;