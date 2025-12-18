import { useState } from 'react';
import TimescaleOHLCChart from '../../components/TimescaleOHLCChart';

export default function TimescaleChartTest() {
  // Token with real candles from our test
  const [tokenAddress, setTokenAddress] = useState('0x0fD51aaeEE7FDa875B1F1091E362100794B28888');
  const [inputValue, setInputValue] = useState(tokenAddress);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTokenAddress(inputValue);
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            TimescaleDB 1-Second Candles
          </h1>
          <p className="text-gray-400">
            Real-time OHLC candles from TimescaleDB with 1s, 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w intervals
          </p>
        </div>

        {/* Token Address Input */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter token address (0x...)"
              className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Load Chart
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Current: {tokenAddress}
          </p>
        </form>

        {/* Chart Component */}
        <div className="bg-gray-800 rounded-xl shadow-2xl p-6">
          <TimescaleOHLCChart
            tokenAddress={tokenAddress}
            height="600px"
            autoRefresh={true}
          />
        </div>

        {/* Features List */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="text-2xl mb-3">⚡</div>
            <h3 className="text-lg font-semibold text-white mb-2">1-Second Resolution</h3>
            <p className="text-gray-400 text-sm">
              See every trade with 1-second granularity - perfect for scalping and day trading
            </p>
          </div>

          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="text-2xl mb-3">📊</div>
            <h3 className="text-lg font-semibold text-white mb-2">9 Timeframes</h3>
            <p className="text-gray-400 text-sm">
              From 1-second to 1-week candles - all automatically aggregated by TimescaleDB
            </p>
          </div>

          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="text-2xl mb-3">🔄</div>
            <h3 className="text-lg font-semibold text-white mb-2">Auto-Refresh</h3>
            <p className="text-gray-400 text-sm">
              Real-time updates from the indexer - watch candles form as trades happen
            </p>
          </div>
        </div>

        {/* Sample Tokens */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Sample Tokens to Try</h3>
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => {
                setInputValue('0x0fD51aaeEE7FDa875B1F1091E362100794B28888');
                setTokenAddress('0x0fD51aaeEE7FDa875B1F1091E362100794B28888');
              }}
              className="text-left px-4 py-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <div className="text-white font-mono text-sm">
                0x0fD51aaeEE7FDa875B1F1091E362100794B28888
              </div>
              <div className="text-gray-400 text-xs mt-1">
                Token with 41 candles (most active)
              </div>
            </button>

            <button
              onClick={() => {
                setInputValue('0xF2F6365E4C3FeB8E1EAE911f0E26C7665fD38888');
                setTokenAddress('0xF2F6365E4C3FeB8E1EAE911f0E26C7665fD38888');
              }}
              className="text-left px-4 py-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <div className="text-white font-mono text-sm">
                0xF2F6365E4C3FeB8E1EAE911f0E26C7665fD38888
              </div>
              <div className="text-gray-400 text-xs mt-1">
                Sample token (may have no candles)
              </div>
            </button>
          </div>
        </div>

        {/* Technical Info */}
        <div className="mt-8 bg-blue-900/20 border border-blue-500/30 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-400 mb-3">How It Works</h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>
              <strong>Data Flow:</strong> Indexer detects trades → Writes to TimescaleDB → Token Service API → Frontend Chart
            </p>
            <p>
              <strong>Storage:</strong> Base 1s candles + Continuous aggregates for 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
            </p>
            <p>
              <strong>Performance:</strong> TimescaleDB automatically compresses old data (95% space savings) and rolls up aggregates
            </p>
            <p>
              <strong>API Endpoint:</strong> <code className="bg-gray-800 px-2 py-1 rounded">/v1/ohlc?token_address=...&interval=1s</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
