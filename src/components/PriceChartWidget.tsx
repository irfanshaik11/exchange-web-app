import React, { useEffect, useRef } from 'react';

const PRICE_CHART_ID = 'price-chart-widget-container';

const PriceChartWidget: React.FC<{tokenAddress: string }> = ({ tokenAddress }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadWidget = () => {
      if (typeof (window as any).createMyWidget === 'function') {
        const repper = (window as any).createMyWidget(PRICE_CHART_ID, {
          autoSize: true,
          chainId: 'solana',
          tokenAddress: tokenAddress,
          showHoldersChart: false,
          defaultInterval: '60',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Etc/UTC',
          theme: 'dark',
          locale: 'en',
          gridColor: '#0d2035',
          textColor: '#68738D',
          candleUpColor: '#4CE666',
          candleDownColor: '#E64C4C',
          hideLeftToolbar: false,
          hideTopToolbar: false,
          hideBottomToolbar: true 
        });
      } else {
        console.error('createMyWidget function is not defined.');
      }
    };

    if (!document.getElementById('moralis-chart-widget')) {
      const script = document.createElement('script');
      script.id = 'moralis-chart-widget';
      script.src = 'https://moralis.com/static/embed/chart.js';
      script.type = 'text/javascript';
      script.async = true;
      script.onload = loadWidget;
      script.onerror = () => {
        console.error('Failed to load the chart widget script.');
      };
      document.body.appendChild(script);
    } else {
      loadWidget();
    }
  }, []);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <div
        id={PRICE_CHART_ID}
        ref={containerRef}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};

export default PriceChartWidget; 