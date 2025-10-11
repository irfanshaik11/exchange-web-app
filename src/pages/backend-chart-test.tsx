import React from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';

// Dynamically import to avoid SSR issues with lightweight-charts
const BackendOHLCChart = dynamic(() => import('../components/BackendOHLCChart'), { ssr: false });

/**
 * Test page for Backend OHLC Chart component
 * Access at: http://localhost:3000/backend-chart-test
 */
const BackendChartTestPage = () => {
  // Example pair address
  const examplePairAddress = '38eiZHnCygqmP21ZKgnvf4mPy2WhsstCZppuCL2oPNp4';

  return (
    <>
      <Head>
        <title>Backend OHLC Chart Test | Exchange</title>
        <meta name="description" content="Test page for Backend OHLC chart integration" />
      </Head>

      <div className="min-h-screen bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2">Backend OHLC Chart Test</h1>
          <p className="text-gray-400 mb-8">Testing OHLC data from backend endpoint: GET /v1/trade/ohlc-data</p>
          
          {/* Chart Container */}
          <div className="bg-gray-800 rounded-lg p-4 shadow-xl">
            <BackendOHLCChart
              pairAddress={examplePairAddress}
              interval="15m"      // Candle size: 15 minute candles
              timeframe="24h"     // Time range: last 24 hours
              height="600px"
              width="100%"
              baseRefreshMs={30000} // Refresh every 30 seconds
              onDataUpdate={(data) => {
                console.log('Chart data updated:', data.length, 'candles');
              }}
            />
          </div>

          {/* Instructions */}
          <div className="mt-8 bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Usage Example</h2>
            <pre className="bg-gray-900 p-4 rounded text-sm text-gray-300 overflow-x-auto">
{`import BackendOHLCChart from '@/components/BackendOHLCChart';

// Usage with pair address (recommended)
<BackendOHLCChart
  pairAddress="38eiZHnCygqmP21ZKgnvf4mPy2WhsstCZppuCL2oPNp4"
  interval="15m"      // Candle size
  timeframe="24h"     // Time range
  height="600px"
  width="100%"
/>

// Different timeframe examples
<BackendOHLCChart
  pairAddress="YourPairAddress"
  interval="5m"       // 5-minute candles
  timeframe="1h"      // Last 1 hour
  height="500px"
  width="100%"
/>

<BackendOHLCChart
  pairAddress="YourPairAddress"
  interval="1h"       // 1-hour candles
  timeframe="7d"      // Last 7 days
  height="500px"
  width="100%"
/>

// Available intervals: '1m', '5m', '15m', '1h', '4h', '1d'
// Available timeframes: '1h', '4h', '24h', '7d', '30d'
`}
            </pre>
          </div>

          {/* Hook Usage */}
          <div className="mt-4 bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Using the Hook Directly</h2>
            <pre className="bg-gray-900 p-4 rounded text-sm text-gray-300 overflow-x-auto">
{`import { useBackendOHLC } from '@/hooks/useBackendOHLC';

const { data, isLoading, error, refetch } = useBackendOHLC({
  pairAddress: '38eiZHnCygqmP21ZKgnvf4mPy2WhsstCZppuCL2oPNp4',
  interval: '15m',      // Candle size (required)
  timeframe: '24h',     // Time range (required)
  refreshInterval: 30000,
  onSuccess: (data) => {
    console.log('Fetched', data.length, 'candles');
  }
});
`}
            </pre>
          </div>

          {/* API Response Format */}
          <div className="mt-4 bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Expected Backend Response Format</h2>
            <pre className="bg-gray-900 p-4 rounded text-sm text-gray-300 overflow-x-auto">
{`{
  "success": true,
  "data": {
    "items": [
      {
        "unix_time": 1728604800,  // Unix timestamp in seconds
        "o": 0.00001,              // Open price
        "h": 0.00002,              // High price  
        "l": 0.000009,             // Low price
        "c": 0.000015,             // Close price
        "v_usd": 1000.50           // Volume in USD
      }
    ]
  }
}
`}
            </pre>
          </div>

          {/* Environment Variables */}
          <div className="mt-4 bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Environment Variables</h2>
            <div className="bg-gray-900 p-4 rounded text-sm text-gray-300">
              <p className="mb-2">Add these to your <code className="text-blue-400">.env.local</code>:</p>
              <pre className="text-green-400">
{`NEXT_PUBLIC_BACKEND_URL=http://157.180.71.112:8080
NEXT_PUBLIC_BACKEND_API_KEY=your-api-key-here`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default BackendChartTestPage;

