// src/pages/perpetuals/index.tsx
// Hyperliquid perpetual futures market list page
// Design: matches discover.tsx / portfolio.tsx — Background2.png + glass finish

import React, { useEffect } from "react";
import Head from "next/head";
import Header from "../../components/Header";
import PerpMarketList from "../../components/perpetuals/PerpMarketList";
import { useHyperliquid } from "../../contexts/HyperliquidContext";

export default function PerpetualsPage() {
  const { markets, marketsLoading, activateMarkets } = useHyperliquid();

  // Activate market data fetching when this page is visited
  useEffect(() => {
    activateMarkets();
  }, [activateMarkets]);

  return (
    <>
      <Head>
        <title>Perpetuals | Interstate</title>
        <meta name="description" content="Trade perpetual futures with leverage on Interstate" />
      </Head>

      <div className="min-h-screen bg-black text-white">
        <Header />

        <div className="p-1 sm:p-1.5">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] min-h-[calc(100vh-80px)]">
            {/* Background Image with multi-layer fade (matches discover/portfolio) */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              <div
                className="absolute inset-x-0 top-0 h-[80vh] bg-cover bg-top bg-no-repeat"
                style={{ backgroundImage: 'url(/ranks/Background2.png)' }}
              />
              <div className="absolute inset-0 bg-black/30" />
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(to bottom, transparent 0%, transparent 20%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.3) 45%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.85) 75%, black 90%)'
                }}
              />
              <div
                className="absolute inset-x-0 top-1/4 bottom-0"
                style={{
                  background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.2) 25%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.8) 75%, black 100%)'
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />
            </div>

            {/* Content */}
            <div className="relative z-10 px-3 sm:px-4 md:px-6 lg:px-8 pt-4 sm:pt-6 pb-6">
              {/* Page header */}
              <div className="mb-6">
                <h1 className="text-xl font-medium text-white">Perpetual Futures</h1>
                <p className="text-[#6B7280] text-sm mt-1">
                  Trade {markets.length}+ markets with up to 50x leverage
                </p>
              </div>

              {/* Market table — frosted opaque dark surface */}
              <div
                className="rounded-xl overflow-hidden backdrop-blur-2xl"
                style={{
                  backgroundColor: 'rgba(35, 38, 47, 0.75)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <PerpMarketList markets={markets} loading={marketsLoading} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
