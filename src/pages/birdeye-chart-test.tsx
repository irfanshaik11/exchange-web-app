import React from 'react';
import Head from 'next/head';
import BirdeyeChart from '../components/BirdeyeChart';

/**
 * Test page for Birdeye Chart component
 * Access at: http://localhost:3000/birdeye-chart-test
 */
const BirdeyeChartTestPage = () => {
  return (
    <>
      <Head>
        <title>Birdeye Chart Test | Exchange</title>
        <meta name="description" content="Test page for Birdeye OHLC chart integration" />
      </Head>
      
      <BirdeyeChart
        pairAddress="Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE"
        timeframe="1m"
        mode="range"
        timeFrom={1726700000}
        timeTo={1726704000}
        />
    </>
  );
};

export default BirdeyeChartTestPage;

