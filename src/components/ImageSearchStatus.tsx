import React, { useState } from 'react';
import { useImageSearch } from '~/hooks/useImageSearch';

export default function ImageSearchStatus() {
  const { stats, startSearch, stopSearch, clearCache, setSearchInterval, setBatchSize } = useImageSearch();
  const [customInterval, setCustomInterval] = useState(30);
  const [customBatchSize, setCustomBatchSize] = useState(10);

  const handleIntervalChange = (interval: number) => {
    setCustomInterval(interval);
    setSearchInterval(interval * 1000); // Convert to milliseconds
  };

  const handleBatchSizeChange = (size: number) => {
    setCustomBatchSize(size);
    setBatchSize(size);
  };

  return (
    <div className="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Image Search Status</h3>
        <div className="flex gap-2">
          <button
            onClick={stats.isRunning ? stopSearch : startSearch}
            className={`px-3 py-1 rounded text-sm font-medium ${
              stats.isRunning
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {stats.isRunning ? 'Stop' : 'Start'} Search
          </button>
          <button
            onClick={clearCache}
            className="px-3 py-1 rounded text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
          >
            Clear Cache
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-white">
            {stats.isRunning ? '🟢' : '🔴'}
          </div>
          <div className="text-sm text-neutral-400">Status</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-white">{stats.tokensProcessed}</div>
          <div className="text-sm text-neutral-400">Processed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-400">{stats.imagesFound}</div>
          <div className="text-sm text-neutral-400">Images Found</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-400">{stats.errors}</div>
          <div className="text-sm text-neutral-400">Errors</div>
        </div>
      </div>

      {stats.lastSearchTime && (
        <div className="text-sm text-neutral-400 mb-4">
          Last search: {stats.lastSearchTime.toLocaleString()}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Search Interval (seconds)
          </label>
          <input
            type="number"
            value={customInterval}
            onChange={(e) => handleIntervalChange(parseInt(e.target.value) || 30)}
            className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white"
            min="10"
            max="300"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Batch Size (tokens per search)
          </label>
          <input
            type="number"
            value={customBatchSize}
            onChange={(e) => handleBatchSizeChange(parseInt(e.target.value) || 10)}
            className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white"
            min="1"
            max="50"
          />
        </div>
      </div>

      <div className="mt-4 p-3 bg-neutral-700 rounded text-sm text-neutral-300">
        <div className="font-medium mb-2">Search Sources:</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>• Pump.fun CDN</div>
          <div>• Moonit CDN</div>
          <div>• Jupiter Static</div>
          {/* <div>• DexScreener</div> */}
          <div>• CoinGecko</div>
          <div>• Solana Token List</div>
          <div>• IPFS Metadata</div>
          <div>• Pump.fun Metadata</div>
        </div>
      </div>
    </div>
  );
}
