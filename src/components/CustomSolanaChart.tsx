import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Token } from '~/utils/db';
import { useCodexOHLC } from '~/hooks/useCodexOHLC';

interface CustomSolanaChartProps {
  token: Token;
  pairAddress?: string;
  height?: string;
  width?: string;
}

const CustomSolanaChart: React.FC<CustomSolanaChartProps> = ({ 
  token, 
  pairAddress,
  height = "100%",
  width = "100%"
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Use real-time OHLC data from Codex (disabled until deployed service is ready)
  const { ohlcData, isConnected, error: wsError } = useCodexOHLC({
    tokenId: token.mint, // Use token mint as tokenId
    enabled: false // Disabled until teammate deploys the service
  });

  // Function to resolve token symbol for TradingView
  const resolveTokenSymbol = useCallback((tokenSymbol: string): string => {
    const symbol = tokenSymbol.toUpperCase();
    
    // Major tokens mapping
    const majorTokens: Record<string, string> = {
      'SOL': 'COINBASE:SOLUSD',
      'ETH': 'COINBASE:ETHUSD', 
      'BTC': 'COINBASE:BTCUSD',
      'USDC': 'COINBASE:USDCUSD',
      'USDT': 'COINBASE:USDTUSD',
    };

    // If we have a verified symbol, use it
    if (majorTokens[symbol]) {
      return majorTokens[symbol];
    }

    // For unknown tokens, try USD format first
    return `${symbol}USD`;
  }, []);

  // Function to create TradingView chart using iframe for official interface
  const createChart = useCallback((symbol: string, attemptNumber: number = 1) => {
    if (!containerRef.current) return;

    // Clear existing chart
    containerRef.current.innerHTML = '';
    setIsLoading(true);
    setError(null);

    // Create iframe for TradingView widget with official interface
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.tradingview.com/widgetembed/?symbol=${encodeURIComponent(symbol)}&interval=1&timezone=Etc%2FUTC&theme=dark&style=1&locale=en&toolbar_bg=rgba(0,0,0,0)&enable_publishing=false&withdateranges=true&range_separator=%20to%20&dateranges=%5B%5D&hide_side_toolbar=false&hide_top_toolbar=false&save_image=false&studies=%5B%5D&container_id=tradingview_chart&show_popup_button=true&popup_width=1000&popup_height=650&hide_legend=false&hide_volume=false&scale=log`;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '0';
    iframe.frameBorder = '0';

    iframe.onload = () => {
      console.log(`✅ TradingView chart loaded successfully: ${symbol}`);
      setIsLoading(false);
    };

    iframe.onerror = () => {
      console.log(`❌ Failed to load TradingView chart: ${symbol}`);
      
      // Simple fallback system - try realistic formats
      const tokenSymbol = token.symbol.toUpperCase();
      const fallbackFormats = [
        `${tokenSymbol}USD`,           // FRENKUSD
        `${tokenSymbol}USDT`,          // FRENKUSDT
        `BINANCE:${tokenSymbol}USDT`,  // BINANCE:FRENKUSDT
        `COINBASE:${tokenSymbol}USD`,  // COINBASE:FRENKUSD
        'COINBASE:SOLUSD',            // Fallback to SOL
        'COINBASE:ETHUSD',            // Fallback to ETH
        'COINBASE:BTCUSD'             // Fallback to BTC
      ];

      // Find the next format to try
      const currentIndex = fallbackFormats.indexOf(symbol);
      const nextFormat = fallbackFormats[currentIndex + 1];

      if (nextFormat) {
        console.log(`🔄 Trying fallback: ${nextFormat}`);
        setTimeout(() => createChart(nextFormat, attemptNumber + 1), 1000);
      } else {
        console.log(`❌ All fallbacks exhausted for ${token.symbol}`);
        setError(`Failed to load chart for ${token.symbol}`);
        setIsLoading(false);
      }
    };

    containerRef.current.appendChild(iframe);
  }, [token.symbol]);

  // Initialize chart when token changes with performance optimizations
  useEffect(() => {
    if (!token?.symbol) return;

    // Debounce chart creation to prevent rapid re-renders
    const timeoutId = setTimeout(() => {
      const symbol = resolveTokenSymbol(token.symbol);
      createChart(symbol);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [token?.symbol, resolveTokenSymbol, createChart]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-900 to-black text-gray-400">
        <div className="text-center max-w-md mx-auto p-8 bg-gray-800 rounded-lg border border-gray-700">
          <div className="mb-6 text-2xl font-semibold text-red-400 flex items-center justify-center gap-3">
            <span className="text-3xl">📊</span>
            Chart Error
          </div>
          <div className="text-sm mb-6 text-gray-300 bg-gray-900 p-4 rounded border border-gray-600">
            <div className="mb-2 font-medium text-red-400">Error Details:</div>
            <div className="font-mono text-xs">{error}</div>
          </div>
          <div className="flex gap-3 justify-center">
            <button 
              onClick={() => {
                setError(null);
                createChart(resolveTokenSymbol(token.symbol));
              }}
              className="px-6 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors font-medium"
            >
              Retry Chart
            </button>
            <button 
              onClick={() => {
                setError(null);
                // Try fallback symbols
                const fallbackSymbols = ['COINBASE:SOLUSD', 'COINBASE:ETHUSD', 'COINBASE:BTCUSD'];
                createChart(fallbackSymbols[Math.floor(Math.random() * fallbackSymbols.length)]);
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
            >
              Try Fallback
            </button>
          </div>
          <div className="mt-4 text-xs text-gray-500">
            Token: {token?.symbol} | Pair: {pairAddress ? 'Available' : 'Not Available'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height, width }} className="relative">
      {/* Enhanced Loading State */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-black z-10">
          <div className="text-center">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="text-lg font-medium text-white">Loading Chart</div>
            </div>
            <div className="text-sm text-gray-400 mb-2">Token: {token?.symbol}</div>
            <div className="text-xs text-gray-500">
              {pairAddress ? 'Using pair address data' : 'Using TradingView symbols'}
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-600">
              <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse"></div>
              <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
              <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Real-time OHLC Header - Hidden until deployed service */}
      {false && ohlcData && (
        <div className="absolute top-0 left-0 right-0 h-14 bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 flex items-center px-4 text-white text-sm z-20 shadow-lg">
          <div className="flex items-center justify-between w-full">
            {/* Left: OHLC Data */}
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">O:</span>
                <span className="text-white font-mono text-sm">${ohlcData.o.toFixed(6)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">H:</span>
                <span className="text-emerald-400 font-mono text-sm">${ohlcData.h.toFixed(6)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">L:</span>
                <span className="text-red-400 font-mono text-sm">${ohlcData.l.toFixed(6)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">C:</span>
                <span className={`font-mono text-sm font-semibold ${ohlcData.c >= ohlcData.o ? 'text-emerald-400' : 'text-red-400'}`}>
                  ${ohlcData.c.toFixed(6)}
                </span>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <span className="text-gray-400 text-xs">Vol:</span>
                <span className="text-blue-400 font-mono text-sm">
                  {ohlcData.volume > 1000000 
                    ? `${(ohlcData.volume / 1000000).toFixed(1)}M`
                    : ohlcData.volume > 1000 
                      ? `${(ohlcData.volume / 1000).toFixed(1)}K`
                      : ohlcData.volume.toFixed(0)
                  }
                </span>
              </div>
            </div>

            {/* Right: Status & Price Change */}
            <div className="flex items-center space-x-4">
              {/* Price Change Indicator */}
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">24h:</span>
                <span className={`font-mono text-sm font-semibold ${ohlcData.c >= ohlcData.o ? 'text-emerald-400' : 'text-red-400'}`}>
                  {ohlcData.c >= ohlcData.o ? '+' : ''}{((ohlcData.c - ohlcData.o) / ohlcData.o * 100).toFixed(2)}%
                </span>
              </div>
              
              {/* Connection Status */}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></div>
                <span className="text-gray-400 text-xs">
                  {isConnected ? 'Live Data' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Official TradingView Widget Container */}
      <div 
        ref={containerRef}
        className="w-full h-full tradingview-widget-container"
        style={{ 
          minHeight: '400px',
          backgroundColor: '#131722'
        }}
      />
    </div>
  );
};

export default CustomSolanaChart;
