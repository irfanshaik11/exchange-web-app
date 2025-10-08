import React from 'react';
import Head from 'next/head';
import CustomSolanaChart from '../components/CustomSolanaChart';

export default function OHLCDemo() {
  const pairAddress = '73mFDNpAxh6ZX9DA1PzpbUHi5i8eGRHsNd8aAEvFST8b';
  
  // Mock token for demo purposes
  const mockToken = {
    id: 1,
    mint: 'mockToken123',
    standard: 'SPL',
    name: 'Demo Token',
    symbol: 'DEMO',
    logo: '',
    decimals: 9,
    metaplex: null,
    fully_diluted_value: 1000000,
    total_supply: 1000000000,
    total_supply_formatted: 1000000000,
    links: null,
    description: 'Demo token for OHLC chart testing',
    is_verified_contract: false,
    possible_spam: false,
    total_buy_volume_5m: 1000,
    total_buy_volume_1h: 5000,
    total_buy_volume_6h: 20000,
    total_buy_volume_24h: 50000,
    total_sell_volume_5m: 800,
    total_sell_volume_1h: 4000,
    total_sell_volume_6h: 15000,
    total_sell_volume_24h: 40000,
    total_buyers_5m: 10,
    total_buyers_1h: 50,
    total_buyers_6h: 200,
    total_buyers_24h: 500,
    total_sellers_5m: 8,
    total_sellers_1h: 40,
    total_sellers_6h: 150,
    total_sellers_24h: 400,
    total_buys_5m: 15,
    total_buys_1h: 75,
    total_buys_6h: 300,
    total_buys_24h: 750,
    total_sells_5m: 12,
    total_sells_1h: 60,
    total_sells_6h: 240,
    total_sells_24h: 600,
    unique_wallets_5m: 8,
    unique_wallets_1h: 40,
    unique_wallets_6h: 160,
    unique_wallets_24h: 400,
    price_percent_change_5m: 2.5,
    price_percent_change_1h: 5.0,
    price_percent_change_6h: -1.2,
    price_percent_change_24h: 8.5,
    sol_price: 0.001,
    usd_price: 0.001,
    market_cap_usd: 1000000,
    total_liquidity_usd: 50000,
    pair_address: pairAddress,
    created_at: new Date().toISOString(),
    uri: null,
    amm_id: 'pump_amm',
  } as any; // Use 'as any' to bypass strict typing for demo

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
              <CustomSolanaChart 
                token={mockToken}
                pairAddress={pairAddress}
                height="500px"
              />
            </div>

            {/* 1m Chart */}
            <div className="bg-gray-900 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-gray-700">
                <h2 className="text-xl font-semibold text-white">1 Minute Candles</h2>
                <p className="text-gray-400 text-sm">Higher resolution OHLC data</p>
              </div>
              <CustomSolanaChart 
                token={mockToken}
                pairAddress={pairAddress}
                height="400px"
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
