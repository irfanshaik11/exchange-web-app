import React from 'react';
import Head from 'next/head';
import OHLCChart from '../components/OHLCChart';

export default function OHLCDemo() {
  const pairAddress = '73mFDNpAxh6ZX9DA1PzpbUHi5i8eGRHsNd8aAEvFST8b';

  return (
    <>
      <Head>
        <title>OHLC Chart Demo</title>
      </Head>
      
      <div className="min-h-screen bg-gray-950">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">OHLC Chart Demo</h1>
            <p className="text-gray-400">
              Real-time OHLC data from WebSocket: {pairAddress}
            </p>
          </div>

          <div className="grid gap-8">
            {/* 5m Chart */}
            <div className="bg-gray-900 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-gray-700">
                <h2 className="text-xl font-semibold text-white">5 Minute Candles</h2>
                <p className="text-gray-400 text-sm">Real-time OHLC data with volume</p>
              </div>
              <OHLCChart 
                pairAddress={pairAddress}
                timeframe="5m"
                height={500}
              />
            </div>

            {/* 1m Chart */}
            <div className="bg-gray-900 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-gray-700">
                <h2 className="text-xl font-semibold text-white">1 Minute Candles</h2>
                <p className="text-gray-400 text-sm">Higher resolution OHLC data</p>
              </div>
              <OHLCChart 
                pairAddress={pairAddress}
                timeframe="1m"
                height={400}
              />
            </div>
          </div>

          {/* Info Panel */}
          <div className="mt-8 bg-gray-900 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Chart Features</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-white mb-2">Real-time Data</h4>
                <ul className="text-gray-400 space-y-1">
                  <li>• Live OHLC updates via WebSocket</li>
                  <li>• Automatic reconnection on disconnect</li>
                  <li>• Connection status indicator</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-white mb-2">Chart Features</h4>
                <ul className="text-gray-400 space-y-1">
                  <li>• Candlestick chart with volume</li>
                  <li>• Responsive design</li>
                  <li>• Price change indicators</li>
                  <li>• Interactive crosshair</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
