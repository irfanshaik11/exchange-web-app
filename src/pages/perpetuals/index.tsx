// src/pages/perpetuals/index.tsx
// Hyperliquid perpetual futures market list page
// Design: flat void-black terminal surface (#030304 page, #0c0d10 table) —
// matches the perp trade page, no background image / glass.

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

      {/* Solid void background — no image, no grey glass. Dense data reads
          best on the app's true black (#030304, the global --bg-void). */}
      <div className="min-h-screen text-white" style={{ backgroundColor: "#030304" }}>
        <Header />

        {/* Full-bleed: dense market data should use the whole viewport */}
        <div className="px-2 sm:px-3 md:px-4 pt-5 sm:pt-6 pb-8">
          {/* Page header */}
          <div className="mb-5">
            <h1 className="text-xl font-medium text-white">Perpetual Futures</h1>
            <p className="text-[#71717a] text-sm mt-1">
              Trade {markets.length}+ markets with up to 50x leverage
            </p>
          </div>

          {/* Market table — flat dark surface, matches the trade terminal */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              backgroundColor: "#0c0d10",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <PerpMarketList markets={markets} loading={marketsLoading} />
          </div>
        </div>
      </div>
    </>
  );
}
