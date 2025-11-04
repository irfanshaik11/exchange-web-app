import React, { useState } from 'react';
import Head from 'next/head';
import AdvancedOHLCChart from '../components/AdvancedOHLCChart';

// Mock trade data for testing dev markers
const mockTradeData = [
  {
    id: '1',
    maker: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', // Mock creator address
    timestamp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    price: 0.000123,
    price_usd: 0.000123,
    amount: '1000000',
    symbol: 'DDOWN',
    is_buy: true,
    side: 'buy',
    type: 'buy',
  },
  {
    id: '2',
    maker: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', // Same creator (dev)
    timestamp: Math.floor(Date.now() / 1000) - 1800, // 30 minutes ago
    price: 0.000156,
    price_usd: 0.000156,
    amount: '500000',
    symbol: 'DDOWN',
    is_buy: false,
    side: 'sell',
    type: 'sell',
  },
  {
    id: '3',
    maker: 'DifferentWalletAddress123456789', // Different wallet (not dev)
    timestamp: Math.floor(Date.now() / 1000) - 900, // 15 minutes ago
    price: 0.000145,
    price_usd: 0.000145,
    amount: '2000000',
    is_buy: true,
    side: 'buy',
    type: 'buy',
  },
  {
    id: '4',
    maker: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', // Creator again (dev)
    timestamp: Math.floor(Date.now() / 1000) - 300, // 5 minutes ago
    price: 0.000178,
    price_usd: 0.000178,
    amount: '750000',
    symbol: 'DDOWN',
    is_buy: true,
    side: 'buy',
    type: 'buy',
  },
];

const mockCreatorAddress = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

export default function TestMarkersPage() {
  const [showDebugInfo, setShowDebugInfo] = useState(true);

  return (
    <>
      <Head>
        <title>Test Dev Trade Markers</title>
      </Head>
      
      <div className="min-h-screen bg-gray-900 text-white p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-6 text-center">
            Dev Trade Markers Test Page
          </h1>
          
          {/* Debug Info Panel */}
          <div className="mb-6">
            <button
              onClick={() => setShowDebugInfo(!showDebugInfo)}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded mb-4"
            >
              {showDebugInfo ? 'Hide' : 'Show'} Debug Info
            </button>
            
            {showDebugInfo && (
              <div className="bg-gray-800 p-4 rounded-lg mb-4">
                <h3 className="text-lg font-semibold mb-3">Test Data:</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <h4 className="font-medium text-green-400 mb-2">Creator Address:</h4>
                    <code className="bg-gray-700 p-2 rounded block break-all">
                      {mockCreatorAddress}
                    </code>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-blue-400 mb-2">Mock Trade Data:</h4>
                    <div className="space-y-2">
                      {mockTradeData.map((trade, index) => (
                        <div key={trade.id} className="bg-gray-700 p-2 rounded text-xs">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-xs ${trade.is_buy ? 'bg-green-600' : 'bg-red-600'}`}>
                                {trade.is_buy ? 'DB' : 'DS'}
                              </div>
                              <span className={`font-medium ${trade.is_buy ? 'text-green-400' : 'text-red-400'}`}>
                                {trade.is_buy ? 'DEV BUY' : 'DEV SELL'}
                              </span>
                            </div>
                            <span className="text-gray-400">
                              {new Date(trade.timestamp * 1000).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="text-gray-300">
                            Price: ${trade.price_usd?.toFixed(6)} | Amount: {trade.amount}
                          </div>
                          <div className="text-gray-400 text-xs">
                            Maker: {trade.maker === mockCreatorAddress ? '✅ CREATOR' : '❌ Other'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-600 rounded">
                  <h4 className="font-medium text-yellow-400 mb-1">Expected Results:</h4>
                  <ul className="text-sm text-yellow-200 space-y-1">
                    <li>• You should see <strong>3 dev trade markers</strong> (trades #1, #2, #4)</li>
                    <li>• Trade #3 should <strong>NOT</strong> have a marker (different wallet)</li>
                    <li>• <span className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold">DB</span> Green circles with "DB" <strong>on top of candles</strong> for dev buys</li>
                    <li>• <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold">DS</span> Red circles with "DS" <strong>on top of candles</strong> for dev sells</li>
                    <li>• Markers positioned <strong>above their respective candles</strong></li>
                    <li>• Hover tooltips with trade details</li>
                    <li>• Timeline markers showing "DB"/"DS"</li>
                  </ul>
                  
                  <div className="mt-3 p-2 bg-gray-700 rounded">
                    <h5 className="text-xs font-medium text-gray-300 mb-2">Visual Example:</h5>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                          DB
                        </div>
                        <span className="text-green-400">Dev Buy Marker</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                          DS
                        </div>
                        <span className="text-red-400">Dev Sell Marker</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chart Container */}
          <div className="bg-gray-800 p-4 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">AdvancedOHLCChart with Dev Trade Markers</h2>
            
            <div className="h-[600px] w-full border border-gray-600 rounded">
              <AdvancedOHLCChart
                // Use a well-known token for testing (you can change this)
                mint="So11111111111111111111111111111111111111112" // SOL
                interval="1m"
                timeframe="24h"
                height="100%"
                width="100%"
                tradeData={mockTradeData}
                creatorAddress={mockCreatorAddress}
                onDataUpdate={(data) => {
                  console.log('[TestPage] OHLC data updated:', data.length, 'candles');
                }}
              />
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-6 bg-gray-800 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">Testing Instructions:</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Open your browser's <strong>Developer Console</strong> (F12)</li>
              <li>Look for logs starting with <code>[AdvancedOHLCChart]</code></li>
              <li>Check for <code>getMarks CALLED</code> and <code>Returning marks: X marks</code></li>
              <li>Look for circular markers positioned <strong>above candles</strong> with <strong>DB</strong> (green) and <strong>DS</strong> (red) text</li>
              <li>Hover over markers to see detailed tooltips</li>
              <li>Check the timeline at the bottom for "DB"/"DS" indicators</li>
            </ol>
            
            <div className="mt-4 p-3 bg-blue-900/30 border border-blue-600 rounded">
              <h4 className="font-medium text-blue-400 mb-1">Troubleshooting:</h4>
              <ul className="text-sm text-blue-200 space-y-1">
                <li>• If no markers appear, check console for <code>getMarks</code> calls</li>
                <li>• Verify trade data is being passed correctly</li>
                <li>• Make sure creator address matches trade makers</li>
                <li>• Try zooming/panning the chart to trigger mark refresh</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}